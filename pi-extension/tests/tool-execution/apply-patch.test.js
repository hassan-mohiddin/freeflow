import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile, mkdir, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parsePatch } from "../../dist/tool-execution/apply-patch/parser.js";
import { seekSequence } from "../../dist/tool-execution/apply-patch/match.js";
import { applyPatch } from "../../dist/tool-execution/apply-patch/plan.js";
import { resultText } from "../../dist/tool-execution/apply-patch/tool.js";

const patch = (...lines) => ["*** Begin Patch", ...lines, "*** End Patch"].join("\n");
const readAll = { wasRead: () => true, changedSinceObserved: async () => false };
const readNothing = { wasRead: () => false, changedSinceObserved: async () => false };

async function inDir(files, fn) {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-apply-patch-"));
  try {
    for (const [name, text] of Object.entries(files)) await writeFile(join(cwd, name), text);
    return await fn(cwd, (name) => readFile(join(cwd, name), "utf8"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

test("the parser accepts Codex's grammar and its lenient forms", () => {
  const body = patch(
    "*** Add File: new.txt",
    "+hello",
    "*** Delete File: old.txt",
    "*** Update File: a.py",
    "*** Move to: b.py",
    "@@ def f():",
    " x = 1",
    "-y = 2",
    "+y = 3",
    "*** End of File",
  );
  const hunks = parsePatch(body);
  assert.deepEqual(
    hunks.map((hunk) => hunk.kind),
    ["add", "delete", "update"],
  );
  assert.equal(hunks[0].contents, "hello\n");
  assert.equal(hunks[2].moveTo, "b.py");
  assert.deepEqual(hunks[2].chunks[0], {
    anchor: "def f():",
    oldLines: ["x = 1", "y = 2"],
    newLines: ["x = 1", "y = 3"],
    context: [[0, 0]],
    endOfFile: true,
  });
  for (const wrapped of [`<<EOF\n${body}\nEOF\n`, `<<'EOF'\n${body}\nEOF`, `<<"EOF"\n${body}\nEOF`])
    assert.equal(parsePatch(wrapped).length, 3);
  // A first hunk may start without @@, and a bare empty line is empty context.
  const chunk = parsePatch(patch("*** Update File: a", " a", "", "-b", "+c")).at(0).chunks[0];
  assert.deepEqual(chunk.oldLines, ["a", "", "b"]);
});

test("the parser rejects what Codex rejects, with Codex's messages", () => {
  const rejects = (text, message) => assert.throws(() => parsePatch(text), { message });
  rejects("bad", /The first line of the patch must be '\*\*\* Begin Patch'/);
  rejects("*** Begin Patch\nbad", /The last line of the patch must be '\*\*\* End Patch'/);
  rejects(patch("bad"), /'bad' is not a valid hunk header/);
  rejects(patch("*** Update File: file.txt"), /Update file hunk for path 'file\.txt' is empty/);
  rejects(patch("*** Update File: file.txt", "@@"), /Update hunk does not contain any lines/);
  rejects(patch("*** Update File: file.txt", "@@", "@@"), /Unexpected line found in update hunk: '@@'/);
  rejects(
    patch("*** Update File: file.txt", "-a", "bad"),
    /Expected update hunk to start with a @@ context marker, got: 'bad'/,
  );
  rejects(`<<"EOF'\n${patch("*** Delete File: a")}\nEOF\n`, /The first line of the patch must be/);
});

test("matching passes: exact, trailing, surrounding whitespace, Unicode punctuation", () => {
  const lines = ["a  ", "  b", "“c”—d"];
  assert.deepEqual(seekSequence(lines, ["a  "], 0, false), { index: 0, pass: 0 });
  assert.deepEqual(seekSequence(lines, ["a"], 0, false), { index: 0, pass: 1 });
  assert.deepEqual(seekSequence(lines, ["b"], 0, false), { index: 1, pass: 2 });
  assert.deepEqual(seekSequence(lines, ['"c"-d'], 0, false), { index: 2, pass: 3 });
  assert.equal(seekSequence(lines, ["zzz"], 0, false), undefined);
});

test("updates keep the file's bytes: line endings, BOM, final newline, context quotes", async () => {
  await inDir(
    {
      "crlf.txt": "﻿one\r\ntwo\r\nthree\r\n",
      "noeol.txt": "a\nb",
      "quotes.py": "msg = “hi”\nvalue = 1\n",
    },
    async (cwd, read) => {
      const result = await applyPatch(
        patch(
          "*** Update File: crlf.txt",
          " one",
          "-two",
          "+TWO",
          "*** Update File: noeol.txt",
          " a",
          "-b",
          "+B",
          "*** Update File: quotes.py",
          ' msg = "hi"',
          "-value = 1",
          "+value = 2",
        ),
        cwd,
        readAll,
      );
      assert.equal(result.status, "applied");
      assert.equal(await read("crlf.txt"), "﻿one\r\nTWO\r\nthree\r\n");
      assert.equal(await read("noeol.txt"), "a\nB");
      assert.equal(await read("quotes.py"), "msg = “hi”\nvalue = 2\n", "context keeps the file's curly quotes");
    },
  );
});

test("anchors, end of file, insertion and several hunks in one file", async () => {
  await inDir(
    { "a.py": ["class A:", "    x = 1", "class B:", "    x = 1", "tail", ""].join("\n") },
    async (cwd, read) => {
      const result = await applyPatch(
        patch(
          "*** Update File: a.py",
          "@@ class B:",
          "-    x = 1",
          "+    x = 2",
          "@@",
          "-tail",
          "+TAIL",
          "*** End of File",
        ),
        cwd,
        readAll,
      );
      assert.equal(result.status, "applied");
      assert.equal(await read("a.py"), ["class A:", "    x = 1", "class B:", "    x = 2", "TAIL", ""].join("\n"));
      const appended = await applyPatch(patch("*** Update File: a.py", "+# end"), cwd, readAll);
      assert.equal(appended.status, "applied");
      assert.match(await read("a.py"), /TAIL\n# end\n$/);
    },
  );
});

test("a planning failure writes nothing, and names the closest lines", async () => {
  await inDir({ "one.txt": "alpha\n", "two.txt": "beta\ngamma\n" }, async (cwd, read) => {
    const result = await applyPatch(
      patch("*** Update File: one.txt", "-alpha", "+ALPHA", "*** Update File: two.txt", "-gamma!", "+x"),
      cwd,
      readAll,
    );
    assert.equal(result.status, "not_applied");
    assert.equal(await read("one.txt"), "alpha\n", "the first file is untouched");
    assert.equal(
      result.error,
      "two.txt hunk 1: context not found. Closest match, lines 2–2 (current file contents):\ngamma\nIf these are the lines you meant, retry with context copied exactly from them. If not, read the region you meant, then retry.",
    );
    assert.match(resultText(result), /^Patch not applied; no files changed\. two\.txt hunk 1/);
  });
});

test("add, delete and move follow the file rules", async () => {
  await inDir({ "exists.txt": "x\n", "target.txt": "t\n", "src.txt": "s\n" }, async (cwd, read) => {
    const unread = await applyPatch(patch("*** Add File: exists.txt", "+new"), cwd, readNothing);
    assert.equal(
      unread.error,
      "exists.txt exists and has not been read in this session. Read exists.txt, then retry the patch.",
    );
    const onto = await applyPatch(
      patch("*** Update File: src.txt", "*** Move to: target.txt", "-s", "+S"),
      cwd,
      readAll,
    );
    assert.equal(onto.error, "target.txt already exists. Delete or rename it first, or move to another path.");
    const missing = await applyPatch(patch("*** Delete File: nope.txt"), cwd, readAll);
    assert.equal(missing.error, "nope.txt: file not found; nothing to delete.");
    const update = await applyPatch(patch("*** Update File: nope.txt", "-a", "+b"), cwd, readAll);
    assert.equal(update.error, "nope.txt: file not found. Use *** Add File: nope.txt to create it.");

    const ok = await applyPatch(
      patch(
        "*** Add File: dir/new.txt",
        "+created",
        "*** Update File: src.txt",
        "*** Move to: moved.txt",
        "-s",
        "+S",
        "*** Delete File: target.txt",
      ),
      cwd,
      readAll,
    );
    assert.equal(ok.status, "applied");
    assert.equal(resultText(ok), "Success. Updated the following files:\nA dir/new.txt\nM moved.txt\nD target.txt");
    assert.equal(await read("dir/new.txt"), "created\n");
    assert.equal(await read("moved.txt"), "S\n");
    await assert.rejects(access(join(cwd, "src.txt")));
    await assert.rejects(access(join(cwd, "target.txt")));
  });
});

test("ambiguous context is applied at the first place and reported", async () => {
  await inDir({ "dup.txt": "x = 1\nx = 1\n" }, async (cwd, read) => {
    const result = await applyPatch(patch("*** Update File: dup.txt", "-x = 1", "+x = 2"), cwd, readAll);
    assert.equal(result.status, "applied");
    assert.equal(await read("dup.txt"), "x = 2\nx = 1\n");
    assert.deepEqual(result.notes, ["dup.txt hunk 1: its lines also match at line 2; it was applied at line 1."]);
  });
});

test("non-UTF-8 files and invalid patches are refused without writing", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-apply-patch-"));
  try {
    await writeFile(join(cwd, "bin.dat"), Buffer.from([0xff, 0xfe, 0x00, 0x41]));
    const binary = await applyPatch(patch("*** Update File: bin.dat", "-A", "+B"), cwd, readAll);
    assert.equal(binary.error, "bin.dat: not UTF-8 text; apply_patch edits text files only.");
    const invalid = await applyPatch("not a patch", cwd, readAll);
    assert.match(
      invalid.error,
      /^Invalid patch: The first line of the patch must be '\*\*\* Begin Patch'\. Fix the patch, then retry\.$/,
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
