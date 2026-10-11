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

test("under automatic routing a worker may only read task memory; the Coordinator may propose", async () => {
  const { registerTaskMemoryTool } = await import("../../dist/task-memory/tool.js");
  let tool;
  let worker = true;
  const called = [];
  const memory = new Proxy(
    {},
    {
      get:
        (_, name) =>
        async (...args) => (called.push(name), { ok: true, text: `${String(name)} ran` }),
    },
  );
  registerTaskMemoryTool(
    { registerTool: (definition) => (tool = definition) },
    { memory, changed: () => {}, refusal: () => (worker ? "workers only read" : undefined) },
  );
  const run = (params) =>
    tool.execute("id", params, undefined, undefined, { cwd: "/repo", hasUI: true, ui: { confirm: async () => true } });
  for (const params of [
    { action: "attach", record: "x" },
    { action: "focus", record: "x" },
    { action: "detach", record: "x" },
    { action: "fanout", title: "t" },
    { action: "env", record: "x", primary: "/elsewhere" },
  ]) {
    const result = await run(params);
    assert.equal(result.isError, true, params.action);
    assert.equal(result.content[0].text, "workers only read");
  }
  assert.deepEqual(called, [], "nothing ran for a worker");
  for (const params of [{ action: "list" }, { action: "view", record: "x" }, { action: "env", record: "x" }])
    assert.notEqual((await run(params)).isError, true, params.action);
  worker = false;
  assert.notEqual((await run({ action: "focus", record: "x" })).isError, true, "the Coordinator may change focus");
});

test("with an unreadable registry, writes to records in the store are refused", async () => {
  const { writeFile, mkdir } = await import("node:fs/promises");
  const { TaskMemory } = await import("../../dist/task-memory/runtime.js");
  const home = process.env.FREEFLOW_HOME;
  await mkdir(home, { recursive: true });
  await writeFile(join(home, "registry.json"), "{broken");
  const memory = new TaskMemory({
    effective: () => true,
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
  // Help requests write nothing, with or without a --record (seen refused in Pi evals before this rule).
  assert.deepEqual(targets("bash", { command: `node ${S} slice start --help` }, "/repo", []), []);
  assert.deepEqual(
    targets("bash", { command: `R=${record}; node ${S} slice start --help --record $R` }, "/repo", []),
    [],
  );
});

test("the gate refuses a record write whose target cannot be read from the command", async () => {
  const { TaskMemory } = await import("../../dist/task-memory/runtime.js");
  const memory = new TaskMemory({
    effective: () => true,
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

test("taskMemory.autoApprove: validated, layered per group, off by default", async () => {
  const { validateTaskMemoryConfig, resolveTaskMemoryConfig } = await import("../../dist/task-memory/config.js");
  assert.equal(validateTaskMemoryConfig({ autoApprove: { attach: true, projects: false } }), null);
  assert.match(
    validateTaskMemoryConfig({ autoApprove: { delete: true } }),
    /unsupported key: delete; use attach, create, env, fanout, projects/,
  );
  assert.equal(
    validateTaskMemoryConfig({ autoApprove: { attach: "yes" } }),
    "taskMemory.autoApprove.attach must be a boolean",
  );
  assert.equal(validateTaskMemoryConfig({ autoApprove: true }), "taskMemory.autoApprove must be an object");
  const off = resolveTaskMemoryConfig({}, {}, true).autoApprove;
  assert.deepEqual(off, { attach: false, create: false, env: false, fanout: false, projects: false });
  const layered = resolveTaskMemoryConfig(
    { taskMemory: { autoApprove: { attach: true, create: true } } },
    { taskMemory: { autoApprove: { create: false, fanout: true } } },
    true,
  ).autoApprove;
  assert.deepEqual(layered, { attach: true, create: false, env: false, fanout: true, projects: false });
});

test("an auto-approved proposal runs without the dialog and says so; others still ask", async () => {
  const { registerTaskMemoryTool } = await import("../../dist/task-memory/tool.js");
  let tool;
  const allowed = new Set(["attach"]);
  // list returns text; the other actions return a result.
  const memory = new Proxy(
    {},
    { get: (_, name) => async () => (name === "list" ? "list ran" : { ok: true, text: `${String(name)} ran` }) },
  );
  registerTaskMemoryTool(
    { registerTool: (definition) => (tool = definition) },
    { memory, changed: () => {}, autoApproved: (group) => allowed.has(group) },
  );
  const asked = [];
  const ctx = (hasUI) => ({
    cwd: "/repo",
    hasUI,
    ui: { confirm: async (title) => (asked.push(title), true), custom: undefined },
  });
  // Covered by the setting: no UI is needed and nothing is asked.
  const attached = await tool.execute("id", { action: "attach", record: "x" }, undefined, undefined, ctx(false));
  assert.notEqual(attached.isError, true);
  assert.match(
    attached.content[0].text,
    /^Auto-approved by the user's taskMemory\.autoApprove setting \(attach\); no dialog was shown\.\n\nattach ran$/,
  );
  const confirmed = await tool.execute("id", { action: "confirm", record: "x" }, undefined, undefined, ctx(false));
  assert.notEqual(confirmed.isError, true, "confirm is in the attach group");
  assert.deepEqual(asked, []);
  // Not covered: still a proposal, refused without a UI.
  const created = await tool.execute("id", { action: "create", title: "t" }, undefined, undefined, ctx(false));
  assert.equal(created.isError, true);
  assert.match(created.content[0].text, /needs the user's confirmation, and no UI is available/);
  // A read is never labelled as approved.
  const listed = await tool.execute("id", { action: "list" }, undefined, undefined, ctx(false));
  assert.equal(listed.content[0].text, "list ran");
});

test("a record named through the project link is the registered record to lookup and the gate", async () => {
  const { execFileSync } = await import("node:child_process");
  const { basename, dirname } = await import("node:path");
  const { TaskMemory } = await import("../../dist/task-memory/runtime.js");
  const { Registry } = await import("../../../skills/track-work/scripts/lib/registry.mjs");
  const before = process.env.FREEFLOW_HOME;
  process.env.FREEFLOW_HOME = await mkdtemp(join(tmpdir(), "freeflow-home-"));
  try {
    const repo = await mkdtemp(join(tmpdir(), "freeflow-repo-"));
    execFileSync("git", ["-C", repo, "init", "-q"]);
    const lib = new Registry(process.env.FREEFLOW_HOME);
    const slug = await lib.createProject("Linked", repo);
    const task = await lib.createTask(slug, "T", "Goal.");
    const viaLink = join(repo, ".freeflow", "project", "tasks", basename(dirname(task.record)), "record.md");
    const appended = [];
    const memory = new TaskMemory({
      effective: () => true,
      append: (data) => appended.push(data),
      send: () => {},
      owner: () => ({ session: "this-session", since: "2026-10-11T00:00:00.000Z" }),
      confirm: async () => false,
      packageRoot: process.cwd(),
    });
    const attached = await memory.attach(viaLink, repo);
    assert.equal(attached.ok, true, attached.text);
    assert.deepEqual(memory.state().attached, [task.record], "attached as the registry's path, as by task ID");
    assert.equal(await memory.gate("edit", { path: viaLink }, repo), undefined, "a write through the link is allowed");
    const close = `node skills/track-work/scripts/working-record.mjs slice close --record ${viaLink} --input -`;
    assert.equal(await memory.gate("bash", { command: close }, repo), undefined);
    await memory.detach(slug + "/task-001", repo);
    assert.match((await memory.gate("edit", { path: viaLink }, repo)).reason, /is not attached to this session/);
  } finally {
    process.env.FREEFLOW_HOME = before;
  }
});

test("remove always asks, even with every auto-approve switch on; a yes moves the task to the trash and detaches it", async () => {
  const { execFileSync } = await import("node:child_process");
  const { TaskMemory } = await import("../../dist/task-memory/runtime.js");
  const { registerTaskMemoryTool } = await import("../../dist/task-memory/tool.js");
  const { Registry } = await import("../../../skills/track-work/scripts/lib/registry.mjs");
  const before = process.env.FREEFLOW_HOME;
  process.env.FREEFLOW_HOME = await mkdtemp(join(tmpdir(), "freeflow-home-"));
  try {
    const repo = await mkdtemp(join(tmpdir(), "freeflow-repo-"));
    execFileSync("git", ["-C", repo, "init", "-q"]);
    const lib = new Registry(process.env.FREEFLOW_HOME);
    const slug = await lib.createProject("Trial", repo);
    const task = await lib.createTask(slug, "Try it", "Goal.");
    const memory = new TaskMemory({
      effective: () => true,
      append: () => {},
      send: () => {},
      owner: () => ({ session: "this-session", since: "2026-10-12T00:00:00.000Z" }),
      confirm: async () => true,
      packageRoot: process.cwd(),
    });
    assert.equal((await memory.attach(task.id, repo)).ok, true);
    let tool;
    registerTaskMemoryTool(
      { registerTool: (definition) => (tool = definition) },
      { memory, changed() {}, autoApproved: () => true },
    );
    const asked = [];
    let answer = false;
    const ctx = {
      cwd: repo,
      hasUI: true,
      mode: "rpc",
      ui: { confirm: async (title, message) => (asked.push({ title, message }), answer) },
    };
    const declined = await tool.execute("1", { action: "remove", record: task.id }, undefined, undefined, ctx);
    assert.equal(declined.isError, true);
    assert.ok(await lib.task(task.id), "a decline removes nothing");
    assert.equal(asked[0].title, "Remove task?");
    assert.match(
      asked[0].message,
      /^Remove trial\/task-001 "Try it"\? The records move to the trash; only you can empty it, with \/freeflow trash empty\./,
    );
    answer = true;
    const removed = await tool.execute("2", { action: "remove", record: task.id }, undefined, undefined, ctx);
    assert.equal(removed.isError, undefined);
    assert.match(removed.content[0].text, /^Removed trial\/task-001\. The records are in the trash: /);
    assert.equal(await lib.task(task.id), undefined);
    assert.deepEqual(memory.state().attached, [], "the removed record is detached");
    assert.equal(asked.length, 2, "both calls asked, though auto-approve is on");
    // Emptying the trash is not an action the agent has.
    const empty = await tool.execute("3", { action: "trash_empty" }, undefined, undefined, ctx);
    assert.equal(empty.isError, true);
    assert.equal((await lib.trashEntries()).length, 1);
  } finally {
    process.env.FREEFLOW_HOME = before;
  }
});

test("the gate reads a reassigned variable and a ~ path as the shell and Pi's tools would", async () => {
  const { homedir } = await import("node:os");
  const S = "/p/working-record.mjs";
  const victim = "/repo/.freeflow/tasks/task-002-x/record.md";
  const mine = "/repo/.freeflow/tasks/task-001-a/record.md";
  assert.deepEqual(
    recordTargets(
      "bash",
      { command: `R=${victim}; node ${S} decision add --record "$R" --title T; R=${mine}` },
      "/repo",
      [mine],
    ),
    [victim],
  );
  assert.deepEqual(
    recordTargets(
      "bash",
      { command: `R=${victim}; R=${mine}; node ${S} decision add --record "$R" --title T` },
      "/repo",
      [mine],
    ),
    [mine],
  );
  const home = join(homedir(), ".freeflow/tasks/task-003-y/record.md");
  assert.deepEqual(recordTargets("write", { path: "~/.freeflow/tasks/task-003-y/record.md" }, "/repo", []), [home]);
  assert.deepEqual(recordTargets("edit", { path: "@.freeflow/tasks/task-002-x/record.md" }, "/repo", []), [victim]);
});

test("registry changes through Track Work's command are refused; reads, help and confirm of an unknown record are not changes", async () => {
  const { TaskMemory } = await import("../../dist/task-memory/runtime.js");
  const memory = new TaskMemory({
    effective: () => true,
    append: () => {},
    send: () => {},
    owner: () => ({ session: "this-session", since: "2026-10-11T00:00:00.000Z" }),
    confirm: async () => false,
    cwd: () => "/repo",
    packageRoot: process.cwd(),
    registry: {
      here: async () => [
        { id: "p/task-001", task: { record: "/a/record.md", title: "A" } },
        { id: "p/task-002", task: { record: "/b/record.md", title: "B" } },
      ],
    },
  });
  for (const command of [
    "S=/p/working-record.mjs; node $S task remove --id p/task-001",
    "node /p/working-record.mjs project link --name P",
    "node /p/working-record.mjs task env --id p/task-001 --primary /tmp",
    "node /p/working-record.mjs task create --title T --goal G",
  ])
    assert.match(
      (await memory.gate("bash", { command }, "/repo"))?.reason ?? "",
      /go through the task_memory tool/,
      command,
    );
  for (const command of [
    "node /p/working-record.mjs task env --id p/task-001",
    "node /p/working-record.mjs task remove --help",
    "node /p/working-record.mjs project list",
  ])
    assert.equal(await memory.gate("bash", { command }, "/repo"), undefined, command);

  // A suggestion skips a declined task and offers the next one in this directory.
  const branch = [entry("decline", "/a/record.md")];
  assert.equal((await memory.suggestion(branch))?.id, "p/task-002");

  const record = "/repo/.freeflow/tasks/task-001-a/record.md";
  memory.rebuild([entry("attach", record)]);
  memory.holdInherited();
  const refused = await memory.confirm("/repo/.freeflow/tasks/task-009-z/record.md", "/repo");
  assert.equal(refused.ok, false);
  assert.match((await memory.gate("write", { path: record }, "/repo")).reason, /held/, "the held record stays held");
});

test("the split command quotes the child's title, so the shell runs nothing in it", async () => {
  const { execFileSync } = await import("node:child_process");
  const { TaskMemory } = await import("../../dist/task-memory/runtime.js");
  const memory = new TaskMemory({
    effective: () => true,
    append: () => {},
    send: () => {},
    owner: () => ({ session: "s", since: "2026-10-12T00:00:00.000Z" }),
    confirm: async () => false,
    packageRoot: process.cwd(),
  });
  const title = "It's $(echo ran) `echo ran`";
  const text = memory.delegation("p/task-001", "p/task-002", title, "Created.");
  const argument = /--title ('(?:[^']|'\\'')*') --state/.exec(text)?.[1];
  assert.ok(argument, text);
  assert.equal(execFileSync("bash", ["-c", `printf '%s' ${argument}`]).toString(), `Split off: ${title}`);
});
