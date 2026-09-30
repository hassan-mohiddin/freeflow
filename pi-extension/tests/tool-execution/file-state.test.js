import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileState, touchedPaths } from "../../dist/tool-execution/file-state.js";

const call = (id, name, args) => ({
  type: "message",
  message: { role: "assistant", content: [{ type: "toolCall", id, name, arguments: args }] },
});
const result = (id, isError = false) => ({ type: "message", message: { role: "toolResult", toolCallId: id, isError } });

test("rebuild marks only files a successful call on the branch touched", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-file-state-"));
  try {
    await writeFile(join(cwd, "a.txt"), "A");
    await writeFile(join(cwd, "b.txt"), "B");
    await symlink(join(cwd, "a.txt"), join(cwd, "link.txt"));
    const state = new FileState();
    const branch = [
      call("1", "read", { path: "a.txt" }),
      result("1"),
      call("2", "read", { path: "b.txt" }),
      result("2", true),
    ];
    await state.rebuild(branch, cwd);
    assert.equal(state.wasRead("a.txt", cwd), true);
    assert.equal(state.wasRead("./a.txt", cwd), true);
    assert.equal(state.wasRead("@a.txt", cwd), true);
    assert.equal(state.wasRead("link.txt", cwd), true, "a symlink is the file it points to");
    assert.equal(state.wasRead("b.txt", cwd), false, "a failed read does not count");

    // Navigating to a branch without the read forgets it.
    await state.rebuild(branch.slice(2), cwd);
    assert.equal(state.wasRead("a.txt", cwd), false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("a file is changed when its content differs from the last observation", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-file-state-"));
  try {
    await writeFile(join(cwd, "a.txt"), "A");
    const state = new FileState();
    assert.equal(await state.changedSinceObserved("a.txt", cwd), false, "never observed is not changed");
    await state.observe("a.txt", cwd, "read");
    assert.equal(await state.changedSinceObserved("a.txt", cwd), false);
    await writeFile(join(cwd, "a.txt"), "B");
    assert.equal(await state.changedSinceObserved("a.txt", cwd), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("apply_patch touches every file its patch names", () => {
  const input = [
    "*** Begin Patch",
    "*** Add File: new.ts",
    "+x",
    "*** Update File: src/a.ts",
    "*** Move to: src/b.ts",
    "@@",
    "-a",
    "+b",
    "*** Delete File: old.ts",
    "*** End Patch",
  ].join("\n");
  assert.deepEqual(touchedPaths("apply_patch", { input }), ["new.ts", "src/a.ts", "src/b.ts", "old.ts"]);
});
