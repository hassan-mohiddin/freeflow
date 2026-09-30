import assert from "node:assert/strict";
import test from "node:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fixture } from "../fixtures/routing-native.js";

const on = { freeflowConfig: { toolExecution: { enabled: true } }, cognitiveRouting: { enabled: false } };

// The text each tool call returned, in call order.
function results(manager) {
  return manager
    .getBranch()
    .filter((entry) => entry.message?.role === "toolResult")
    .map((entry) => ({
      name: entry.message.toolName,
      isError: entry.message.isError === true,
      text: entry.message.content.map((part) => part.text ?? "").join(""),
    }));
}

const CODE = [
  "def greet(name):",
  "    message = 'hello ' + name",
  "    return message",
  "",
  "total = 1",
  "total = 1",
  "",
].join("\n");

test("write refuses to overwrite a file that was never read, and only that", { timeout: 30000 }, async () => {
  await fixture(
    async (n) =>
      [
        [{ name: "write", args: { path: "new.txt", content: "NEW" } }],
        [{ name: "write", args: { path: "evidence.txt", content: "OVERWRITTEN" } }],
        [{ name: "read", args: { path: "./evidence.txt" } }],
        [{ name: "write", args: { path: "evidence.txt", content: "OVERWRITTEN" } }],
      ][n - 1] ?? [],
    false,
    async ({ manager, cwd }) => {
      const [create, refused, , allowed] = results(manager);
      assert.equal(create.isError, false);
      assert.equal(refused.isError, true);
      assert.equal(
        refused.text,
        "evidence.txt exists and has not been read in this session. Read evidence.txt, then retry the write.",
      );
      assert.equal(allowed.isError, false, "a read through another spelling of the path counts");
      assert.equal(await readFile(join(cwd, "evidence.txt"), "utf8"), "OVERWRITTEN");
    },
    true,
    on,
  );
});

test("an edit to a file changed since it was read applies and says so once", { timeout: 30000 }, async () => {
  await fixture(
    async (n, _body, _manager, _requests) => {
      if (n === 1) return [{ name: "read", args: { path: "evidence.txt" } }];
      if (n === 2) {
        await writeFile(fixtureCwd + "/evidence.txt", "EXACT_EVIDENCE_BODY_81\nCHANGED ELSEWHERE\n");
        return [
          {
            name: "edit",
            args: { path: "evidence.txt", edits: [{ oldText: "EXACT_EVIDENCE_BODY_81", newText: "FIRST" }] },
          },
        ];
      }
      if (n === 3)
        return [{ name: "edit", args: { path: "evidence.txt", edits: [{ oldText: "FIRST", newText: "SECOND" }] } }];
      return [];
    },
    false,
    async ({ manager }) => {
      const [, first, second] = results(manager);
      assert.equal(
        first.text,
        [
          "Successfully replaced 1 block(s) in evidence.txt.",
          "evidence.txt changed since you read it; the edit applied to the current text.",
          "No need to re-read evidence.txt to confirm this edit.",
        ].join("\n"),
      );
      assert.equal(
        second.text,
        [
          "Successfully replaced 1 block(s) in evidence.txt.",
          "No need to re-read evidence.txt to confirm this edit.",
        ].join("\n"),
      );
    },
    true,
    { ...on, beforePrompt: ({ cwd }) => (fixtureCwd = cwd) },
  );
});
let fixtureCwd;

test("edit errors become one next action", { timeout: 30000 }, async () => {
  const edit = (edits, path = "code.py") => [{ name: "edit", args: { path, edits } }];
  await fixture(
    async (n) =>
      [
        edit([{ oldText: "    message = 'helo ' + name", newText: "x" }]),
        edit([
          { oldText: "def greet(name):", newText: "def greet(who):" },
          { oldText: "    return mesage", newText: "x" },
        ]),
        edit([{ oldText: "class Unrelated(Base):\n    pass", newText: "x" }]),
        edit([{ oldText: "total = 1", newText: "total = 2" }]),
        edit([
          { oldText: "def greet(name):\n    message", newText: "a" },
          { oldText: "    message = 'hello ' + name", newText: "b" },
        ]),
        edit([{ oldText: "line two", newText: "x" }], "crlf.txt"),
      ][n - 1] ?? [],
    false,
    async ({ manager }) => {
      const [similar, second, unrelated, duplicate, overlap, crlf] = results(manager);
      assert.equal(
        similar.text,
        [
          "code.py: old text not found. Closest match, lines 2–2 (current file contents):",
          "    message = 'hello ' + name",
          "If these are the lines you meant, retry with old text copied exactly from them. If not, read the region you meant, then retry.",
        ].join("\n"),
      );
      assert.match(second.text, /^code\.py edits\[1\]: old text not found\. Closest match, lines 3–3 /);
      assert.equal(
        unrelated.text,
        "code.py: old text not found and no similar lines exist in the current file. Read the region you meant, then retry.",
      );
      assert.equal(
        duplicate.text,
        "code.py: old text matches 2 places (lines 5, 6). To change one place, add surrounding lines until it matches only that place. To change every place, give one edits[] entry per place, each with enough surrounding lines to match only that place.",
      );
      assert.match(overlap.text, /^edits\[0\] and edits\[1\] overlap in code\.py\./, "Pi's own actionable errors stay");
      assert.match(crlf.text, /Closest match, lines 2–2 \(current file contents\):\nline 2\nIf these/);
      assert.equal(
        [similar, second, unrelated, duplicate, overlap, crlf].every((result) => result.isError),
        true,
      );
    },
    true,
    {
      ...on,
      beforePrompt: async ({ cwd }) => {
        await writeFile(join(cwd, "code.py"), CODE);
        await writeFile(join(cwd, "crlf.txt"), "line one\r\nline 2\r\n");
      },
    },
  );
});

test("with Tool Execution off, Pi's edit and write results are untouched", { timeout: 30000 }, async () => {
  await fixture(
    async (n) =>
      [
        [{ name: "edit", args: { path: "evidence.txt", edits: [{ oldText: "MISSING", newText: "x" }] } }],
        [{ name: "write", args: { path: "evidence.txt", content: "OVERWRITTEN" } }],
      ][n - 1] ?? [],
    false,
    async ({ manager }) => {
      const [edit, write] = results(manager);
      assert.match(edit.text, /^Could not find the exact text in evidence\.txt\./);
      assert.equal(write.isError, false);
    },
    true,
    { freeflowConfig: { toolExecution: { enabled: false } }, cognitiveRouting: { enabled: false } },
  );
});
