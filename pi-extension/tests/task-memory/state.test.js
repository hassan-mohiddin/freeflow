import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// Never the user's real registry.
process.env.FREEFLOW_HOME = await mkdtemp(join(tmpdir(), "freeflow-home-"));
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
    owner: () => ({ session: "this-session", since: "2026-10-11T00:00:00.000Z" }),
    confirm: async () => false,
    packageRoot: process.cwd(),
  });
  const record = "/repo/.freeflow/tasks/task-001-a/record.md";
  memory.rebuild([entry("attach", record)]);
  assert.deepEqual(memory.holdInherited(), [record]);
  assert.deepEqual(
    appended.map((data) => data.op),
    ["hold"],
  );
  assert.match((await memory.gate("write", { path: record }, "/repo")).reason, /held/);
  assert.match(memory.runtimeLines().join("\n"), /held: not writable until the user confirms/);
  assert.equal((await memory.confirm("", "/repo")).ok, true);
  assert.equal(await memory.gate("write", { path: record }, "/repo"), undefined);
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
    owner: () => ({ session: "this-session", since: "2026-10-11T00:00:00.000Z" }),
    confirm: async () => false,
    packageRoot: process.cwd(),
  });
  const result = await memory.attach("/repo/.freeflow/tasks/task-001-a/record.md", "/repo");
  assert.equal(result.ok, false);
  assert.match(result.text, /automatic Cognitive Routing/);
});

test("with an unreadable registry, writes to records in the store are refused", async () => {
  const { writeFile, mkdir } = await import("node:fs/promises");
  const { TaskMemory } = await import("../../dist/task-memory/runtime.js");
  const home = process.env.FREEFLOW_HOME;
  await mkdir(home, { recursive: true });
  await writeFile(join(home, "registry.json"), "{broken");
  const memory = new TaskMemory({
    effective: () => true,
    routingAutomatic: () => false,
    append: () => {},
    send: () => {},
    owner: () => ({ session: "this-session", since: "2026-10-11T00:00:00.000Z" }),
    confirm: async () => false,
    packageRoot: process.cwd(),
  });
  const stored = join(home, "projects", "p", "tasks", "task-001-t", "record.md");
  const local = "/repo/.freeflow/tasks/task-001-a/record.md";
  memory.rebuild([entry("attach", stored), entry("attach", local)]);
  assert.match(
    (await memory.gate("write", { path: stored }, "/repo")).reason,
    /cannot be written until the registry is repaired/,
  );
  // An unregistered record outside the store keeps step-2 behavior.
  assert.equal(await memory.gate("write", { path: local }, "/repo"), undefined);
});

test("a project store's record is a record to the gate; a lookalike path without a store is not", async () => {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { isRecordPath } = await import("../../dist/task-memory/runtime.js");
  const store = await mkdtemp(join(tmpdir(), "freeflow-store-"));
  const record = join(store, "tasks", "task-001-t", "record.md");
  assert.equal(isRecordPath(record), false, "no store.json yet");
  await mkdir(join(store, "tasks", "task-001-t"), { recursive: true });
  await writeFile(join(store, "store.json"), "{}");
  assert.equal(isRecordPath(record), true);
  assert.equal(isRecordPath(join(store, "tasks", "notes.md")), false);
});

test("record writes are found through shell variables, task IDs and chained commands; unreadable targets are marked", async () => {
  const { recordTargets: targets } = await import("../../dist/task-memory/runtime.js");
  const S = "/pkg/skills/track-work/scripts/working-record.mjs";
  const record = "/repo/.freeflow/tasks/task-002-docs-cleanup/record.md";
  // The pattern seen in Pi evals: script and record paths held in variables assigned in the same command.
  assert.deepEqual(
    targets(
      "bash",
      { command: `S=${S}; R=${record}; node $S decision add --record "$R" --title T --input -` },
      "/repo",
      [],
    ),
    [record],
  );
  assert.deepEqual(
    targets("bash", { command: `S="${S}" && node "\${S}" slice close --record ${record}` }, "/repo", []),
    [record],
  );
  assert.deepEqual(targets("bash", { command: `node $S slice close --record "$OUTSIDE"` }, "/repo", []), []);
  assert.deepEqual(targets("bash", { command: `S=${S}; node $S slice close --record "$OUTSIDE"` }, "/repo", []), [
    "unresolved:$OUTSIDE",
  ]);
  assert.deepEqual(targets("bash", { command: `node ${S} checkpoint close --id C-001` }, "/repo", []), [
    "unresolved:(no --record)",
  ]);
  assert.deepEqual(
    targets("bash", { command: `node ${S} decision add --record proj/task-003 --title T` }, "/repo", []),
    ["id:proj/task-003"],
  );
  // Two writes chained in one command are both found; reads and record creation are not writes.
  assert.deepEqual(
    targets(
      "bash",
      {
        command: `node ${S} slice close --record ${record} && node ${S} task set-state --record /r/.freeflow/tasks/t/record.md`,
      },
      "/repo",
      [],
    ),
    [record, "/r/.freeflow/tasks/t/record.md"],
  );
  assert.deepEqual(targets("bash", { command: `R=${record}; node ${S} view full --record $R` }, "/repo", []), []);
  assert.deepEqual(targets("bash", { command: `node ${S} task create --title T --goal G` }, "/repo", []), []);
  assert.deepEqual(targets("bash", { command: `node ${S} task search --query x --id p/task-001` }, "/repo", []), []);
});

test("the gate refuses a record write whose target cannot be read from the command", async () => {
  const { TaskMemory } = await import("../../dist/task-memory/runtime.js");
  const memory = new TaskMemory({
    effective: () => true,
    routingAutomatic: () => false,
    append: () => {},
    send: () => {},
    owner: () => ({ session: "this-session", since: "2026-10-11T00:00:00.000Z" }),
    confirm: async () => false,
    cwd: () => "/repo",
    packageRoot: process.cwd(),
  });
  const refusal = await memory.gate(
    "bash",
    { command: 'S=/p/working-record.mjs; node $S slice close --record "$R"' },
    "/repo",
  );
  assert.match(refusal.reason, /cannot be read from the command \(\$R\).*literal --record path or task ID/);
  const unattached = await memory.gate(
    "bash",
    {
      command:
        "S=/p/working-record.mjs; R=/repo/.freeflow/tasks/task-002-x/record.md; node $S decision add --record $R",
    },
    "/repo",
  );
  assert.match(unattached.reason, /is not attached to this session/);
});
