import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fixture } from "../fixtures/routing-native.js";

// Where a registered task's work happens, the session-start offer for a task's directory, and fan-out into a child
// worktree, on a real Pi session with scripted model responses. Each test has its own Freeflow home.
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
const until = async (check) => {
  for (let i = 0; i < 300 && !(await check()); i++) await new Promise((done) => setTimeout(done, 10));
};

test(
  "a task's resume view says where its work happens, and warns when the session runs elsewhere",
  { timeout: 30000 },
  async () => {
    const dir = await home();
    const elsewhere = await mkdtemp(join(tmpdir(), "freeflow-elsewhere-"));
    await fixture(
      async (n) =>
        [
          [call({ action: "create", title: "Here", goal: "Work here." })],
          // Setup registered "There" first, so the model's "Here" is task-002.
          [call({ action: "attach", record: "p/task-002" })],
          [call({ action: "attach", record: "p/task-001" })],
        ][n - 1] ?? [],
      false,
      async ({ manager, cwd }) => {
        const [, here, there] = results(manager);
        assert.match(text(here), new RegExp(`Environment: ${cwd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
        assert.doesNotMatch(text(here), /outside this task's directory/);
        assert.match(
          text(there),
          /This session runs in .*, outside this task's directory; the task's effects belong in /,
        );
      },
      true,
      {
        ...on(),
        ui: { confirm: async () => true },
        beforePrompt: async ({ session }) => {
          await session.prompt("/freeflow project new P");
          const { Registry } = await import("../../dist/task-memory/registry.js");
          // A task whose work happens in another directory.
          await new Registry(process.cwd(), dir).createTask("p", "There", "Work there.", undefined, elsewhere);
        },
      },
    );
  },
);

test(
  "a session in a task's directory offers to attach it; a decline is not asked again",
  { timeout: 30000 },
  async () => {
    const dir = await home();
    const asked = [];
    let answer = true;
    await fixture(
      async () => [],
      false,
      async ({ manager, session }) => {
        await until(async () => (await registry(dir)).tasks["p/task-001"].owner);
        assert.equal(asked.length, 1);
        assert.match(asked[0], /Attach p\/task-001\?/);
        assert.equal((await registry(dir)).tasks["p/task-001"].owner.session, manager.getSessionId());
        // Detach, then decline the offer: it is recorded and not repeated.
        await session.prompt("/freeflow task detach p/task-001");
        answer = false;
        await session.reload();
        await until(async () =>
          manager.getBranch().some((entry) => entry.type === "custom" && entry.data?.op === "decline"),
        );
        await session.reload();
        await new Promise((done) => setTimeout(done, 100));
        assert.equal(asked.length, 2, "asked once more after the detach, then not after the decline");
      },
      true,
      {
        ...on(),
        ui: { confirm: async (title) => (asked.push(title), answer) },
        beforePrompt: async ({ session }) => {
          await session.prompt("/freeflow project new P");
          const { Registry } = await import("../../dist/task-memory/registry.js");
          const { cwd } = session.sessionManager ? { cwd: session.sessionManager.getCwd() } : {};
          await new Registry(process.cwd(), dir).createTask("p", "T", "Goal.", undefined, cwd);
          // Session start runs again on reload, now with a task for this directory.
          await session.reload();
        },
      },
    );
  },
);

test("fan-out from the parent's owner creates the child's worktree and branch", { timeout: 30000 }, async () => {
  const dir = await home();
  const worktrees = await mkdtemp(join(tmpdir(), "freeflow-worktrees-"));
  await fixture(
    async (n) =>
      [
        [call({ action: "create", title: "Compiler", goal: "Port it." })],
        [call({ action: "attach", record: "p/task-001" })],
        [call({ action: "fanout", title: "Parser", goal: "Port the parser." })],
      ][n - 1] ?? [],
    false,
    async ({ manager }) => {
      const [, , fanout] = results(manager);
      assert.notEqual(fanout.isError, true, text(fanout));
      assert.match(
        text(fanout),
        /Created child p\/task-002 of p\/task-001 with a worktree at .* on branch p\/task-002-parser \(personal Freeflow config copied\)/,
      );
      const child = (await registry(dir)).tasks["p/task-002"];
      assert.equal(child.parent, "p/task-001");
      assert.ok((await stat(child.environment.primary)).isDirectory());
      assert.match(await readFile(join(child.environment.primary, ".freeflow", "local.json"), "utf8"), /taskMemory/);
      assert.match(
        execFileSync("git", ["-C", child.environment.primary, "branch", "--show-current"]).toString(),
        /p\/task-002-parser/,
      );
    },
    true,
    {
      ...on(),
      ui: { confirm: async () => true },
      beforePrompt: async ({ session, cwd }) => {
        execFileSync("git", ["-C", cwd, "init", "-q"]);
        execFileSync("git", ["-C", cwd, "-c", "user.email=t@example.com", "-c", "user.name=T", "add", "-A"]);
        execFileSync("git", [
          "-C",
          cwd,
          "-c",
          "user.email=t@example.com",
          "-c",
          "user.name=T",
          "commit",
          "-q",
          "-m",
          "init",
        ]);
        await writeFile(join(cwd, ".freeflow", "local.json"), JSON.stringify({ taskMemory: { enabled: true } }));
        await session.prompt(`/freeflow project new P --worktrees ${worktrees}`);
      },
    },
  );
});
