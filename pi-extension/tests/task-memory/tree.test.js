import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fixture } from "../fixtures/routing-native.js";

// Projects, registered tasks, children and ownership on a real Pi session with scripted model responses. Each test has
// its own Freeflow home, never the user's.
const on = () => ({ cognitiveRouting: { enabled: false }, freeflowConfig: { taskMemory: { enabled: true } } });
const text = (item) =>
  typeof item.content === "string"
    ? item.content
    : (item.content ?? []).map((part) => part.text ?? "").join("") + (item.output ?? "");
const results = (manager) =>
  manager
    .getBranch()
    .filter((entry) => entry.message?.role === "toolResult" && entry.message.toolName === "freeflow_task")
    .map((entry) => entry.message);
const call = (args) => ({ name: "freeflow_task", args });
const home = async () => (process.env.FREEFLOW_HOME = await mkdtemp(join(tmpdir(), "freeflow-home-")));
const registry = async (dir) => JSON.parse(await readFile(join(dir, "registry.json"), "utf8"));

test(
  "a parent task with a child: the parent's view lists it, and search spans the tree",
  { timeout: 30000 },
  async () => {
    const dir = await home();
    await fixture(
      async (n) =>
        [
          [call({ action: "create", title: "Compiler A", goal: "Port compiler A to Rust." })],
          [call({ action: "attach", record: "rust-rewrite/task-001" })],
          [call({ action: "child", title: "Parser", goal: "Port the parser with NEEDLE_PARSER." })],
          [call({ action: "focus", record: "rust-rewrite/task-001" })],
          [call({ action: "search", query: "needle_parser", scope: "tree" })],
          [call({ action: "view", record: "rust-rewrite/task-002" })],
        ][n - 1] ?? [],
      false,
      async ({ manager }) => {
        const [created, attached, child, focused, search, view] = results(manager);
        assert.match(text(created), /Created rust-rewrite\/task-001/);
        assert.match(text(attached), /Focused task: Compiler A \[rust-rewrite\/task-001\]/);
        assert.match(text(child), /Created child rust-rewrite\/task-002 of rust-rewrite\/task-001/);
        assert.match(
          text(focused),
          /Children \(each written by its own session[\s\S]*- rust-rewrite\/task-002 — Parser: active; Current Slice: None; next: Start the work\./,
        );
        assert.match(text(search), /rust-rewrite\/task-002 \| Goal \| - Port the parser with NEEDLE_PARSER\./);
        assert.match(text(view), /# Working Record: Parser[\s\S]*Child of rust-rewrite\/task-001/);
        const data = await registry(dir);
        assert.equal(data.tasks["rust-rewrite/task-001"].owner.session, manager.getSessionId());
        assert.equal(data.tasks["rust-rewrite/task-002"].parent, "rust-rewrite/task-001");
        assert.equal(data.tasks["rust-rewrite/task-002"].owner, undefined, "the child's own session will own it");
      },
      true,
      {
        ...on(),
        ui: { confirm: async () => true },
        beforePrompt: async ({ session }) => {
          await session.prompt("/freeflow project new Rust Rewrite");
        },
      },
    );
  },
);

test("the child's own session creates and attaches it, and sees its parent", { timeout: 30000 }, async () => {
  const dir = await home();
  await fixture(
    async () => [],
    false,
    async ({ manager, requests }) => {
      const data = await registry(dir);
      assert.equal(data.tasks["p/task-002"].parent, "p/task-001");
      assert.equal(data.tasks["p/task-002"].owner.session, manager.getSessionId());
      const first = requests[0].input.map(text).join("\n");
      assert.match(first, /Focused task: Lexer \[p\/task-002\]/);
      assert.match(first, /Parent: p\/task-001 — Compiler \(.*\)\. Goal: Compile\.\. Its owner session writes it/);
    },
    true,
    {
      ...on(),
      beforePrompt: async ({ session }) => {
        await session.prompt("/freeflow project new P");
        const { Registry } = await import("../../dist/task-memory/registry.js");
        await new Registry(process.cwd(), dir).createTask("p", "Compiler", "Compile.");
        await session.prompt("/freeflow task child p/task-001 Lexer");
      },
    },
  );
});

test(
  "a record another session owns needs a takeover, and losing ownership stops writes",
  { timeout: 30000 },
  async () => {
    const dir = await home();
    let record;
    await fixture(
      async (n) => {
        if (n === 1) return [call({ action: "attach", record: "p/task-001" })];
        if (n === 2) {
          // Another session takes the record over while this one holds it.
          const data = await registry(dir);
          data.tasks["p/task-001"].owner = { session: "other-session", since: "2026-10-11T00:00:00.000Z" };
          await writeFile(join(dir, "registry.json"), JSON.stringify(data));
          return [{ name: "write", args: { path: record, content: "overwritten" } }];
        }
        return [];
      },
      false,
      async ({ manager }) => {
        const messages = manager
          .getBranch()
          .filter((entry) => entry.message?.role === "toolResult")
          .map((entry) => entry.message);
        const [attach, write] = messages;
        assert.notEqual(attach.isError, true, text(attach));
        assert.equal(write.isError, true);
        assert.match(text(write), /p\/task-001 is owned by session other-session, not this one/);
        assert.match(await readFile(record, "utf8"), /# Working Record: T/);
      },
      true,
      {
        ...on(),
        ui: { confirm: async () => true },
        beforePrompt: async ({ session }) => {
          await session.prompt("/freeflow project new P");
          const { Registry } = await import("../../dist/task-memory/registry.js");
          const created = await new Registry(process.cwd(), dir).createTask("p", "T", "Goal.");
          record = created.record;
        },
      },
    );
  },
);

test(
  "attaching a record another session owns is refused when the user declines the takeover",
  { timeout: 30000 },
  async () => {
    const dir = await home();
    const asked = [];
    await fixture(
      async (n) => (n === 1 ? [call({ action: "attach", record: "p/task-001" })] : []),
      false,
      async ({ manager }) => {
        const [attach] = results(manager);
        assert.equal(attach.isError, true);
        assert.match(text(attach), /owned by session other-session; it was not taken over/);
        assert.ok(asked.some(([title]) => /Take over p\/task-001\?/.test(title)));
        assert.equal((await registry(dir)).tasks["p/task-001"].owner.session, "other-session");
      },
      true,
      {
        ...on(),
        // Yes to the attach proposal, no to the takeover.
        ui: { confirm: async (title) => (asked.push([title]), !/Take over/.test(title)) },
        beforePrompt: async ({ session }) => {
          await session.prompt("/freeflow project new P");
          const { Registry } = await import("../../dist/task-memory/registry.js");
          const created = new Registry(process.cwd(), dir);
          const { id } = await created.createTask("p", "T", "Goal.");
          await created.own(id, { session: "other-session", since: "2026-10-11T00:00:00.000Z" }, false);
        },
      },
    );
  },
);
