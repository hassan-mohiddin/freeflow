import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import freeflowExtension from "../../dist/index.js";
import { GateRuntime } from "../../dist/gates/runtime.js";

const packageRoot = resolve(process.cwd());
const WARN = { agreement: "warn", slice: "warn", delivery: "warn", delegation: "warn" };
const BLOCK = { agreement: "block", slice: "block", delivery: "block", delegation: "block" };

/** A Freeflow home holding one session's gate state; FREEFLOW_HOME points at it for the test. */
async function withHome(state, run) {
  const home = await mkdtemp(join(tmpdir(), "freeflow-gates-"));
  const saved = process.env.FREEFLOW_HOME;
  process.env.FREEFLOW_HOME = home;
  try {
    if (state) {
      await mkdir(join(home, "sessions", "s-1"), { recursive: true });
      await writeFile(join(home, "sessions", "s-1", "gates.json"), JSON.stringify(state));
    }
    await run(home);
  } finally {
    if (saved === undefined) delete process.env.FREEFLOW_HOME;
    else process.env.FREEFLOW_HOME = saved;
    await rm(home, { recursive: true, force: true });
  }
}

const state = (extra = {}) => ({
  v: 1,
  task: "demo/task-001",
  taskDir: "/store/projects/demo/tasks/task-001-demo",
  store: "/store",
  agreement: "A-001",
  session: null,
  exactSpec: null,
  slice: null,
  delegations: {},
  updated: "2026-11-03T10:00:00.000Z",
  ...extra,
});

test("the runtime warns once per gate per turn, refuses under block, asks for delivery, and reads no file per call", async () => {
  await withHome(state(), async () => {
    const gates = new GateRuntime(packageRoot);
    gates.begin("s-1");
    // Before the state is read, every call runs.
    await gates.load();
    assert.equal(gates.check({ toolName: "edit", input: { path: "/w/a.ts" } }, "/w", WARN, false).kind, "allow");
    await gates.refresh();
    const first = gates.check({ toolName: "edit", input: { path: "a.ts" }, toolCallId: "c1" }, "/w", WARN, false);
    assert.equal(first.kind, "warn");
    assert.deepEqual(
      first.fired.map((each) => each.gate),
      ["slice"],
    );
    assert.match(first.rows[0], /^Freeflow gate \(warn, slice\): edit on a\.ts with no open Slice in demo\/task-001\./);
    assert.deepEqual(gates.takeRows("c1"), first.rows);
    assert.deepEqual(gates.takeRows("c1"), []);
    // The same gate again this turn: logged, no second row; a new turn warns again.
    const again = gates.check({ toolName: "write", input: { path: "/w/b.ts" }, toolCallId: "c2" }, "/w", WARN, false);
    assert.equal(again.fired.length, 1);
    assert.deepEqual(again.rows, []);
    gates.turnStart();
    assert.equal(gates.check({ toolName: "edit", input: { path: "/w/c.ts" } }, "/w", WARN, false).rows.length, 1);
    // Under block: refused with the text; a delivery step asks where Pi has a screen.
    const refused = gates.check({ toolName: "edit", input: { path: "/w/a.ts" } }, "/w", BLOCK, true);
    assert.equal(refused.kind, "block");
    assert.match(refused.reason, /^Freeflow gate \(block, slice\)/);
    const push = gates.check(
      { toolName: "bash", input: { command: "git status && git push" } },
      "/w",
      {
        ...WARN,
        slice: "off",
        agreement: "off",
        delivery: "block",
      },
      true,
    );
    assert.equal(push.kind, "ask");
    assert.match(push.reason, /git push is a delivery step/);
    const headless = gates.check({ toolName: "bash", input: { command: "git push" } }, "/w", BLOCK, false);
    assert.equal(headless.kind, "block");
    // apply_patch names its files in the patch.
    const patch = gates.check(
      { toolName: "apply_patch", input: { input: "*** Begin Patch\n*** Update File: src/x.ts\n*** End Patch" } },
      "/w",
      BLOCK,
      false,
    );
    assert.match(patch.reason, /apply_patch on src\/x\.ts/);
    // Reads are never gated.
    assert.equal(gates.check({ toolName: "read", input: { path: "/w/a.ts" } }, "/w", BLOCK, false).kind, "allow");
    assert.equal(gates.check({ toolName: "bash", input: { command: "npm test" } }, "/w", BLOCK, false).kind, "allow");
  });
});

test("a missing gate state is quiet under warn, said once, and closed under block", async () => {
  await withHome(null, async () => {
    const gates = new GateRuntime(packageRoot);
    gates.begin("s-1");
    // Missing only once session start has settled: session status writes the state where none is.
    await gates.refresh();
    assert.equal(gates.missingOnce(), false);
    await gates.refresh({ settled: true });
    assert.equal(gates.missingOnce(), true);
    assert.equal(gates.missingOnce(), false);
    assert.equal(gates.check({ toolName: "edit", input: { path: "/w/a.ts" } }, "/w", WARN, false).kind, "allow");
    const closed = gates.check({ toolName: "edit", input: { path: "/w/a.ts" } }, "/w", BLOCK, false);
    assert.equal(closed.kind, "block");
    assert.match(closed.reason, /Freeflow cannot read its gate state/);
  });
});

// Through the extension's own handlers: tool_call decides before Freeflow's other checks, tool_result carries the row.

function loadExtension() {
  const handlers = new Map();
  const tools = [];
  const pi = {
    registerTool(tool) {
      tools.push(tool);
    },
    registerCommand() {},
    registerShortcut() {},
    registerMessageRenderer() {},
    on(event, handler) {
      handlers.set(event, handler);
    },
    getAllTools: () => tools.map((tool) => ({ name: tool.name, sourceInfo: { source: "extension" } })),
    getActiveTools: () => tools.map((tool) => tool.name),
    setActiveTools() {},
    sendMessage() {},
    appendEntry() {},
  };
  freeflowExtension(pi);
  return handlers;
}

async function configuredRepo(config) {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-gates-repo-"));
  await mkdir(join(cwd, ".freeflow"));
  await writeFile(join(cwd, ".freeflow", "config.json"), JSON.stringify(config));
  return cwd;
}

function context(cwd, confirm) {
  return {
    cwd,
    hasUI: Boolean(confirm),
    getSystemPrompt: () => "",
    sessionManager: {
      getSessionId: () => "s-1",
      getSessionFile: () => undefined,
      getEntries: () => [],
      getBranch: () => [],
      buildContextEntries: () => [],
    },
    ui: { setStatus() {}, notify() {}, confirm: confirm ?? (async () => false) },
  };
}

/** Calls tool_call until the gate state has been read, as session start reads it without waiting. */
async function untilGated(handlers, event, ctx) {
  for (let tries = 0; tries < 100; tries += 1) {
    const result = await handlers.get("tool_call")(event, ctx);
    if (result !== undefined) return result;
    await new Promise((done) => setTimeout(done, 20));
  }
  return undefined;
}

test("Pi's tool_call warns through the call's result and allows, or blocks with the reason under block", async () => {
  await withHome(state({ agreement: null, task: null, taskDir: null }), async () => {
    const warnRepo = await configuredRepo({ enabled: true, toolExecution: { enabled: false } });
    const blockRepo = await configuredRepo({ enabled: true, gates: { agreement: "block" } });
    const askRepo = await configuredRepo({ enabled: true, gates: { agreement: "off", delivery: "block" } });
    try {
      // Block first: the refusal shows when the state has been read.
      let handlers = loadExtension();
      let ctx = context(blockRepo);
      await handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
      const edit = { toolName: "edit", toolCallId: "c1", input: { path: join(blockRepo, "src", "a.ts") } };
      const refused = await untilGated(handlers, edit, ctx);
      assert.equal(refused?.block, true);
      assert.match(refused.reason, /^Freeflow gate \(block, agreement\): edit on src\/a\.ts before an agreement/);
      // A delivery step asks the person; their no refuses, their yes lets it run.
      let asked = 0;
      ctx = context(askRepo, async () => ((asked += 1), asked > 1));
      const push = { toolName: "bash", toolCallId: "c2", input: { command: "git push" } };
      handlers = loadExtension();
      await handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
      const no = await untilGated(handlers, push, ctx);
      assert.equal(no?.block, true);
      const yes = await handlers.get("tool_call")(push, ctx);
      assert.equal(yes?.block, undefined);
      assert.equal(asked, 2);

      // Warn: the call runs and its result gains the row, with Tool Execution off too.
      handlers = loadExtension();
      ctx = context(warnRepo);
      await handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
      const call = { toolName: "write", toolCallId: "c3", input: { path: join(warnRepo, "b.ts") } };
      let shaped;
      for (let tries = 0; tries < 100 && !shaped; tries += 1) {
        assert.equal(await handlers.get("tool_call")(call, ctx), undefined);
        shaped = await handlers.get("tool_result")(
          { ...call, content: [{ type: "text", text: "Wrote b.ts" }], isError: false },
          ctx,
        );
        if (!shaped) await new Promise((done) => setTimeout(done, 20));
      }
      const text = shaped.content.map((block) => block.text).join("\n");
      assert.match(text, /Wrote b\.ts/);
      assert.match(text, /Freeflow gate \(warn, agreement\): write on b\.ts before an agreement in this session\./);
      assert.match(text, /This gate only warns for now\./);
    } finally {
      await rm(warnRepo, { recursive: true, force: true });
      await rm(blockRepo, { recursive: true, force: true });
      await rm(askRepo, { recursive: true, force: true });
    }
  });
});

test(
  "in a real Pi session, a change before an agreement runs with the gate's row on its result, once a turn, and is logged",
  { timeout: 60000 },
  async () => {
    const { fixture } = await import("../fixtures/routing-native.js");
    const { existsSync, readFileSync } = await import("node:fs");
    const script = resolve("skills/track-work/scripts/working-record.mjs");
    const home = await mkdtemp(join(tmpdir(), "freeflow-gates-native-"));
    const names = ["FREEFLOW_HOME", "FREEFLOW_SESSION", "FREEFLOW_HARNESS", "FREEFLOW_TRANSCRIPT", "FREEFLOW_RESUME"];
    const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    process.env.FREEFLOW_HOME = home;
    const bash = (command) => ({ name: "bash", args: { command } });
    try {
      await fixture(
        async (n) =>
          // Turn 1 runs Track Work's script: session status writes the gate state, and its result reads it.
          n === 1
            ? [bash(`node ${script} session status`)]
            : n === 2
              ? [bash("echo one > one.txt"), bash("echo two > two.txt")]
              : [],
        false,
        async ({ manager }) => {
          const results = manager
            .getBranch()
            .filter((entry) => entry.message?.role === "toolResult")
            .map((entry) => entry.message.content.map((block) => block.text ?? "").join("\n"));
          assert.equal(results.length, 3);
          assert.doesNotMatch(results[0], /Freeflow gate/);
          assert.match(
            results[1],
            /Freeflow gate \(warn, agreement\): bash on one\.txt before an agreement in this session\./,
          );
          assert.doesNotMatch(results[2], /Freeflow gate/);
          const session = process.env.FREEFLOW_SESSION;
          assert.ok(existsSync(join(home, "sessions", session, "gates.json")));
          // The lines are written when the run settles.
          const log = join(home, "events", `${session}.jsonl`);
          for (let tries = 0; tries < 100 && !existsSync(log); tries += 1)
            await new Promise((done) => setTimeout(done, 50));
          const gateLines = readFileSync(log, "utf8")
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line))
            .filter((line) => line.kind === "gate");
          assert.deepEqual(
            gateLines.map((line) => [line.gate, line.decision, line.tool]),
            [
              ["agreement", "warn", "bash"],
              ["agreement", "warn", "bash"],
            ],
          );
        },
        true,
        {
          freeflowConfig: { toolExecution: { enabled: true }, gates: { slice: "warn", agreement: "warn" } },
        },
      );
    } finally {
      for (const [name, value] of Object.entries(saved))
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      await rm(home, { recursive: true, force: true });
    }
  },
);
