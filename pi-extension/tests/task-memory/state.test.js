import assert from "node:assert/strict";
import test from "node:test";
import { foldState, isRecordPath, recordTargets, TASK_ENTRY } from "../../dist/task-memory/runtime.js";

const entry = (op, record) => ({ type: "custom", customType: TASK_ENTRY, data: { op, record } });

test("the session's task state is a fold over its branch entries", () => {
  assert.deepEqual(foldState([]), { attached: [], held: [], focus: undefined });
  const branch = [entry("attach", "/a/record.md"), entry("attach", "/b/record.md"), entry("focus", "/a/record.md")];
  assert.deepEqual(foldState(branch), { attached: ["/a/record.md", "/b/record.md"], held: [], focus: "/a/record.md" });
  // Detaching the focus leaves none; focusing an unattached record is ignored.
  assert.deepEqual(foldState([...branch, entry("detach", "/a/record.md"), entry("focus", "/c/record.md")]), {
    attached: ["/b/record.md"],
    held: [],
    focus: undefined,
  });
  // Held after a fork until confirmed; re-attaching also releases it.
  const held = [...branch, entry("hold", "/a/record.md"), entry("hold", "/b/record.md")];
  assert.deepEqual(foldState(held).held, ["/a/record.md", "/b/record.md"]);
  assert.deepEqual(foldState([...held, entry("confirm", "/a/record.md")]).held, ["/b/record.md"]);
  assert.deepEqual(foldState([...held, entry("attach", "/b/record.md")]).held, ["/a/record.md"]);
  // Other entries are not task state.
  assert.deepEqual(
    foldState([{ type: "custom", customType: "other", data: { op: "attach", record: "/x" } }]).attached,
    [],
  );
});

test("record writes are found in edit, write, apply_patch and Track Work commands", () => {
  const cwd = "/repo";
  const record = "/repo/.freeflow/tasks/task-002-other/record.md";
  assert.ok(isRecordPath(record));
  assert.ok(!isRecordPath("/repo/.freeflow/tasks/task-002-other/notes.md"));
  assert.deepEqual(recordTargets("edit", { path: ".freeflow/tasks/task-002-other/record.md" }, cwd, []), [record]);
  assert.deepEqual(recordTargets("write", { path: "src/index.ts" }, cwd, []), []);
  // An attached record outside .freeflow/tasks is still a record.
  assert.deepEqual(recordTargets("write", { path: "/elsewhere/record.md" }, cwd, ["/elsewhere/record.md"]), [
    "/elsewhere/record.md",
  ]);
  const patch = `*** Begin Patch\n*** Update File: src/a.ts\n@@\n-a\n+b\n*** Update File: .freeflow/tasks/task-002-other/record.md\n@@\n-x\n+y\n*** End Patch`;
  assert.deepEqual(recordTargets("apply_patch", { input: patch }, cwd, []), [record]);
  const command = (args) => `node skills/track-work/scripts/working-record.mjs ${args}`;
  assert.deepEqual(
    recordTargets(
      "bash",
      { command: command(`decision add --record ".freeflow/tasks/task-002-other/record.md" --title T --input -`) },
      cwd,
      [],
    ),
    [record],
  );
  assert.deepEqual(
    recordTargets(
      "bash",
      { command: command(`slice close --root /other --record .freeflow/tasks/t/record.md`) },
      cwd,
      [],
    ),
    ["/other/.freeflow/tasks/t/record.md"],
  );
  // Views and validation do not write.
  assert.deepEqual(recordTargets("bash", { command: command(`view full --record ${record}`) }, cwd, []), []);
  assert.deepEqual(recordTargets("bash", { command: command(`validate --record ${record}`) }, cwd, []), []);
  assert.deepEqual(recordTargets("read", { path: record }, cwd, []), []);
});

test("a fork's inherited records are held: readable, not writable, until confirmed", async () => {
  const { TaskMemory } = await import("../../dist/task-memory/runtime.js");
  const appended = [];
  const memory = new TaskMemory({
    effective: () => true,
    routingAutomatic: () => false,
    append: (data) => appended.push(data),
    send: () => {},
    packageRoot: process.cwd(),
  });
  const record = "/repo/.freeflow/tasks/task-001-a/record.md";
  memory.rebuild([entry("attach", record)]);
  assert.deepEqual(memory.holdInherited(), [record]);
  assert.deepEqual(
    appended.map((data) => data.op),
    ["hold"],
  );
  assert.match(memory.gate("write", { path: record }, "/repo").reason, /held/);
  assert.match(memory.runtimeLines().join("\n"), /held: not writable until the user confirms/);
  assert.equal(memory.confirm("", "/repo").ok, true);
  assert.equal(memory.gate("write", { path: record }, "/repo"), undefined);
  // A second hold pass finds nothing new to hold once everything is held.
  memory.holdInherited();
  assert.deepEqual(memory.holdInherited(), []);
});

test("attaching is refused under automatic Cognitive Routing", async () => {
  const { TaskMemory } = await import("../../dist/task-memory/runtime.js");
  const memory = new TaskMemory({
    effective: () => true,
    routingAutomatic: () => true,
    append: () => assert.fail("nothing is written"),
    send: () => {},
    packageRoot: process.cwd(),
  });
  const result = await memory.attach("/repo/.freeflow/tasks/task-001-a/record.md", "/repo");
  assert.equal(result.ok, false);
  assert.match(result.text, /automatic Cognitive Routing/);
});
