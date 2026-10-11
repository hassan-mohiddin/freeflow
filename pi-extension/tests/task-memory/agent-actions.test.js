import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fixture } from "../fixtures/routing-native.js";
import { callTitle, renderSnapshotMessage, renderTaskResult } from "../../dist/task-memory/render.js";

// Everything the user can do with /freeflow task and /freeflow project, done by the agent through task_memory:
// actions on the user's authority wait for a dialog, reads do not. Also the project index in a resume view, the
// fan-out command, and how calls, results and delivered views render.
const on = () => ({ cognitiveRouting: { enabled: false }, freeflowConfig: { taskMemory: { enabled: true } } });
const text = (item) =>
  typeof item.content === "string"
    ? item.content
    : (item.content ?? []).map((part) => part.text ?? "").join("") + (item.output ?? "");
const results = (manager) =>
  manager
    .getBranch()
    .filter((entry) => entry.message?.role === "toolResult" && entry.message.toolName === "task_memory")
    .map((entry) => entry.message);
const call = (args) => ({ name: "task_memory", args });
const home = async () => (process.env.FREEFLOW_HOME = await mkdtemp(join(tmpdir(), "freeflow-home-")));
const registry = async (dir) => JSON.parse(await readFile(join(dir, "registry.json"), "utf8"));
const gitInit = (cwd) => {
  const git = (...args) =>
    execFileSync("git", ["-C", cwd, "-c", "user.email=t@example.com", "-c", "user.name=T", ...args]);
  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
};

test("the agent creates a project and a task, each only after the user confirms", { timeout: 30000 }, async () => {
  const dir = await home();
  const asked = [];
  const answers = [false, true, true];
  await fixture(
    async (n) =>
      [
        [call({ action: "project_new", name: "My App" })],
        [call({ action: "project_new", name: "My App" })],
        [call({ action: "create", title: "Retry logic", goal: "Port the retry logic." })],
        [call({ action: "projects" })],
        [call({ action: "list", project: "my-app" })],
      ][n - 1] ?? [],
    false,
    async ({ manager }) => {
      const [declined, created, task, projects, list] = results(manager);
      assert.equal(declined.isError, true);
      assert.match(text(declined), /The user declined\. Do not retry or work around it\./);
      assert.equal(declined.details.headline, "Declined by the user");
      assert.match(text(created), /Project my-app created and linked to /);
      // One dialog covers creating and attaching the task.
      assert.deepEqual(
        asked.map(([title]) => title),
        ["Create project?", "Create project?", "Create task?"],
      );
      assert.match(text(task), /^Created my-app\/task-001 and attached it to this session\.\n\n<task-memory/);
      assert.equal(task.details.headline, "Created and attached my-app/task-001 — Retry logic");
      assert.equal((await registry(dir)).tasks["my-app/task-001"].owner.session, manager.getSessionId());
      assert.match(text(projects), /- My App \(my-app\), linked to this repository: 1 task\(s\)/);
      assert.match(text(list), /Retry logic \[my-app\/task-001\] — .* \(active, focus, owned here\)/);
    },
    true,
    { ...on(), ui: { confirm: async (...args) => (asked.push(args), answers.shift() ?? false) } },
  );
});

test("reads and attention changes need no dialog", { timeout: 30000 }, async () => {
  await home();
  const asked = [];
  await fixture(
    async (n) =>
      [
        [call({ action: "projects" })],
        [call({ action: "list" })],
        [call({ action: "search", query: "x", scope: "project" })],
      ][n - 1] ?? [],
    false,
    async () => assert.deepEqual(asked, []),
    true,
    { ...on(), ui: { confirm: async (...args) => (asked.push(args), true) } },
  );
});

test(
  "fan-out returns a command to paste into a new terminal and one that records the split in the parent",
  { timeout: 30000 },
  async () => {
    const dir = await home();
    const worktrees = await mkdtemp(join(tmpdir(), "freeflow-worktrees-"));
    await fixture(
      async (n, _body, manager) => {
        if (n === 1) return [call({ action: "create", title: "Compiler", goal: "Port it." })];
        if (n === 2) return [call({ action: "fanout", title: "Parser", goal: "Port the parser." })];
        // The agent runs the recording command from the result as given.
        if (n === 3) {
          const command = /\n(node [^\n]+ slice record [\s\S]*?\nEOF)/.exec(text(results(manager)[1]))[1];
          return [{ name: "bash", args: { command } }];
        }
        if (n === 4) return [call({ action: "view", record: "p/task-001" })];
        return [];
      },
      false,
      async ({ manager }) => {
        const bash = manager
          .getBranch()
          .filter((entry) => entry.message?.role === "toolResult" && entry.message.toolName === "bash")
          .map((entry) => entry.message);
        assert.notEqual(bash[0].isError, true, text(bash[0]));
        const parent = (await registry(dir)).tasks["p/task-001"];
        assert.match(
          await readFile(parent.record, "utf8"),
          /#### S-001 — Split off: Parser[\s\S]*Recorded: retroactively/,
        );
        // Read by ID, a project task shows its children like its delivered view.
        const [, , view] = results(manager);
        assert.match(
          text(view),
          /^Children \(each written by its own session[\s\S]*- p\/task-002 — Parser[\s\S]*# Working Record: Compiler/,
        );
        const [, fanout] = results(manager);
        assert.notEqual(fanout.isError, true, text(fanout));
        const child = (await registry(dir)).tasks["p/task-002"];
        const command = `cd '${child.environment.primary}' && FREEFLOW_HOME='${dir}' pi`;
        assert.equal(fanout.details.command, command);
        assert.match(
          text(fanout),
          new RegExp(
            `runs:\\n\\n    ${command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n\\nShow the user that command exactly`,
          ),
        );
      },
      true,
      {
        ...on(),
        ui: { confirm: async () => true },
        beforePrompt: async ({ session, cwd }) => {
          gitInit(cwd);
          await session.prompt(`/freeflow project new P --worktrees ${worktrees}`);
        },
      },
    );
  },
);

test("a registered task's resume view indexes the project's other tasks", { timeout: 30000 }, async () => {
  await home();
  await fixture(
    async (n) => (n === 1 ? [call({ action: "attach", record: "p/task-002" })] : []),
    false,
    async ({ manager }) => {
      const [attached] = results(manager);
      const view = text(attached);
      assert.match(
        view,
        /Project P, other tasks \(most recently changed first;[^\n]*\n- p\/task-003 active — Third\n- p\/task-001 active — First\n/,
      );
      assert.doesNotMatch(view, /- p\/task-002 /, "the task itself is not in its own index");
    },
    true,
    {
      ...on(),
      ui: { confirm: async () => true },
      beforePrompt: async ({ session }) => {
        await session.prompt("/freeflow project new P");
        const { Registry } = await import("../../dist/task-memory/registry.js");
        const registry = new Registry(process.cwd(), process.env.FREEFLOW_HOME);
        await registry.createTask("p", "First", "One.");
        await registry.createTask("p", "Second", "Two.");
        // Third changes last, so it leads the index.
        await new Promise((done) => setTimeout(done, 20));
        const third = await registry.createTask("p", "Third", "Three.");
        await writeFile(third.record, await readFile(third.record, "utf8"));
      },
    },
  );
});

test(
  "/freeflow task new creates and attaches; /freeflow project list lists every project",
  { timeout: 30000 },
  async () => {
    await home();
    await fixture(
      async () => [],
      false,
      async ({ notices }) => {
        assert.ok(notices.some(([message]) => /Task memory: Retry logic \[p\/task-001\] is the focus/.test(message)));
        assert.ok(notices.some(([message]) => /- P \(p\), linked to this repository: 1 task\(s\)/.test(message)));
      },
      true,
      {
        ...on(),
        beforePrompt: async ({ session }) => {
          await session.prompt("/freeflow project new P");
          await session.prompt("/freeflow task new Retry logic");
          await session.prompt("/freeflow project list");
        },
      },
    );
  },
);

test("task_memory is model-only: it asks the user, so scripts cannot call it", async () => {
  const { registerTaskMemoryTool } = await import("../../dist/task-memory/tool.js");
  let registered;
  registerTaskMemoryTool({ registerTool: (tool) => (registered = tool) }, { memory: {}, changed() {} });
  assert.equal(registered.exposure, "model-only");
});

test("calls render as one line; results collapse to their outcome and expand to the full text", () => {
  assert.equal(callTitle({ action: "create", title: "Retry logic" }), 'Create task "Retry logic"');
  assert.equal(callTitle({ action: "search", query: "cache key", scope: "project" }), 'Search project for "cache key"');
  assert.equal(callTitle({ action: "list", project: "my-app" }), "List tasks in my-app");
  const render = (result, expanded, context = {}) =>
    renderTaskResult(result, { expanded }, undefined, context)
      .render(200)
      .map((line) => line.trimEnd())
      .join("\n");
  const fanout = {
    content: [{ type: "text", text: "Created child p/task-002 …\nmore" }],
    details: {
      action: "fanout",
      headline: "Child p/task-002 ready in /w/app-parser",
      command: "cd '/w/app-parser' && pi",
    },
  };
  const collapsed = render(fanout, false);
  assert.match(collapsed, /Child p\/task-002 ready in \/w\/app-parser/);
  assert.match(collapsed, /Run in a new terminal:\n\s+cd '\/w\/app-parser' && pi/, "the command shows even collapsed");
  assert.doesNotMatch(collapsed, /more/);
  assert.match(render(fanout, true), /more/);
  const refused = {
    content: [{ type: "text", text: "p/task-001 is owned by session s1.\nmore" }],
    isError: true,
    details: {},
  };
  assert.match(render(refused, false, { isError: true }), /^\s*p\/task-001 is owned by session s1\./);
  // A decline shows its headline, not the instruction the model reads.
  const declined = {
    content: [{ type: "text", text: "The user declined. Do not retry or work around it." }],
    isError: true,
    details: { headline: "Declined by the user" },
  };
  assert.match(render(declined, false, { isError: true }), /^\s*Declined by the user\s*$/);
  const snapshot = {
    content:
      '<task-memory record="/x/record.md" id="p/task-001">\n[Freeflow task memory] Focused task: Retry logic [p/task-001] (/x/record.md), read now.\n\nState: active\n\n### Next useful action\n\n- Add jitter.\n</task-memory>',
  };
  const line = renderSnapshotMessage(snapshot, { expanded: false }, undefined)
    .render(200)
    .map((line) => line.trimEnd())
    .join("\n");
  assert.match(line, /^\s*Task memory Retry logic \[p\/task-001\] · active · next: Add jitter\.\s*$/);
  assert.match(
    renderSnapshotMessage(snapshot, { expanded: true }, undefined)
      .render(200)
      .map((line) => line.trimEnd())
      .join("\n"),
    /<task-memory/,
  );
});
