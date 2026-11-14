import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import freeflowExtension from "../../dist/index.js";
import { GateRuntime } from "../../dist/gates/runtime.js";

const packageRoot = resolve(process.cwd());
// The one gate left is the delegation gate (D-058): the agreement, Slice and delivery gates were removed.
const WARN = { delegation: "warn" };
const BLOCK = { delegation: "block" };

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
  delegations: {},
  updated: "2026-11-03T10:00:00.000Z",
  ...extra,
});

/** Another session's claim on a glob, live for years: the delegation gate warns or refuses a write under it. */
const claim = (glob) => ({
  writes: [glob],
  until: "2099-01-01T00:00:00.000Z",
  task: "other/task-002",
  delegation: "D-009",
  session: "cccccccc-3333",
});

test("the runtime warns once per turn, refuses under block, and reads no file per call (delegation gate, D-058)", async () => {
  await withHome(state({ claims: [claim("/w/**")] }), async () => {
    const gates = new GateRuntime(packageRoot);
    gates.begin("s-1");
    // Before the state is read, every call runs.
    await gates.load();
    assert.equal(gates.check({ toolName: "edit", input: { path: "/w/a.ts" } }, "/w", WARN).kind, "allow");
    await gates.refresh();
    const first = gates.check({ toolName: "edit", input: { path: "a.ts" }, toolCallId: "c1" }, "/w", WARN);
    assert.equal(first.kind, "warn");
    assert.deepEqual(
      first.fired.map((each) => each.gate),
      ["delegation"],
    );
    assert.match(first.rows[0], /^Freeflow gate \(warn, delegation\): a\.ts is claimed by other\/task-002 D-009 /);
    assert.deepEqual(gates.takeRows("c1"), first.rows);
    assert.deepEqual(gates.takeRows("c1"), []);
    // The same gate again this turn: logged, no second row; a new turn warns again.
    const again = gates.check({ toolName: "write", input: { path: "/w/b.ts" }, toolCallId: "c2" }, "/w", WARN);
    assert.equal(again.fired.length, 1);
    assert.deepEqual(again.rows, []);
    gates.turnStart();
    assert.equal(gates.check({ toolName: "edit", input: { path: "/w/c.ts" } }, "/w", WARN).rows.length, 1);
    // Under block: refused with the text.
    const refused = gates.check({ toolName: "edit", input: { path: "/w/a.ts" } }, "/w", BLOCK);
    assert.equal(refused.kind, "block");
    assert.match(refused.reason, /^Freeflow gate \(block, delegation\): a\.ts is claimed by other\/task-002/);
    // A push and a write outside the claim are not the removed gates' business: they run.
    assert.equal(gates.check({ toolName: "bash", input: { command: "git push" } }, "/w", BLOCK).kind, "allow");
    assert.equal(
      gates.check({ toolName: "bash", input: { command: "git status && git push" } }, "/w", WARN).kind,
      "allow",
    );
    // apply_patch names its files in the patch.
    const patch = gates.check(
      { toolName: "apply_patch", input: { input: "*** Begin Patch\n*** Update File: src/x.ts\n*** End Patch" } },
      "/w",
      BLOCK,
    );
    assert.equal(patch.kind, "block");
    assert.match(patch.reason, /src\/x\.ts is claimed/);
    // Reads are never gated.
    assert.equal(gates.check({ toolName: "read", input: { path: "/w/a.ts" } }, "/w", BLOCK).kind, "allow");
    assert.equal(gates.check({ toolName: "bash", input: { command: "npm test" } }, "/w", BLOCK).kind, "allow");
  });
});

test("a missing gate state is quiet, said once, and never refuses a main-loop call (Pi has no workers)", async () => {
  await withHome(null, async () => {
    const gates = new GateRuntime(packageRoot);
    gates.begin("s-1");
    // Missing only once session start has settled: session status writes the state where none is.
    await gates.refresh();
    assert.equal(gates.missingOnce(), false);
    await gates.refresh({ settled: true });
    assert.equal(gates.missingOnce(), true);
    assert.equal(gates.missingOnce(), false);
    assert.equal(gates.check({ toolName: "edit", input: { path: "/w/a.ts" } }, "/w", WARN).kind, "allow");
    assert.equal(gates.check({ toolName: "edit", input: { path: "/w/a.ts" } }, "/w", BLOCK).kind, "allow");
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

function context(cwd) {
  return {
    cwd,
    hasUI: false,
    getSystemPrompt: () => "",
    sessionManager: {
      getSessionId: () => "s-1",
      getSessionFile: () => undefined,
      getEntries: () => [],
      getBranch: () => [],
      buildContextEntries: () => [],
    },
    ui: { setStatus() {}, notify() {}, confirm: async () => false },
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
  const warnRepo = await configuredRepo({ enabled: true, toolExecution: { enabled: false } });
  // The removed gates' keys are ignored by the file, and the delegation gate alone is set to block (D-058).
  const blockRepo = await configuredRepo({
    enabled: true,
    gates: { delegation: "block", agreement: "block", slice: "block", delivery: "block" },
  });
  try {
    await withHome(state({ claims: [claim(`${blockRepo}/**`), claim(`${warnRepo}/**`)] }), async () => {
      // Block first: the refusal shows when the state has been read.
      let handlers = loadExtension();
      let ctx = context(blockRepo);
      await handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
      const edit = { toolName: "edit", toolCallId: "c1", input: { path: join(blockRepo, "src", "a.ts") } };
      const refused = await untilGated(handlers, edit, ctx);
      assert.equal(refused?.block, true);
      assert.match(
        refused.reason,
        /^Freeflow gate \(block, delegation\): src\/a\.ts is claimed by other\/task-002 D-009/,
      );
      // A delivery step is not the removed delivery gate's: it runs without asking anyone.
      const push = { toolName: "bash", toolCallId: "c2", input: { command: "git push" } };
      assert.equal((await handlers.get("tool_call")(push, ctx))?.block, undefined);

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
      assert.match(text, /Freeflow gate \(warn, delegation\): b\.ts is claimed by other\/task-002 D-009/);
      assert.match(text, /This gate only warns for now\./);
    });
  } finally {
    await rm(warnRepo, { recursive: true, force: true });
    await rm(blockRepo, { recursive: true, force: true });
  }
});

test(
  "in a real Pi session, a change with no agreement and no Slice runs with no gate row: the removed gates are silent (D-058)",
  { timeout: 60000 },
  async () => {
    const { fixture } = await import("../fixtures/pi-native.js");
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
          for (const result of results) assert.doesNotMatch(result, /Freeflow gate/);
          const session = process.env.FREEFLOW_SESSION;
          assert.ok(existsSync(join(home, "sessions", session, "gates.json")));
          // The lines are written when the run settles: no gate line at all.
          const log = join(home, "events", `${session}.jsonl`);
          for (let tries = 0; tries < 100 && !existsSync(log); tries += 1)
            await new Promise((done) => setTimeout(done, 50));
          const gateLines = readFileSync(log, "utf8")
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line))
            .filter((line) => line.kind === "gate");
          assert.deepEqual(gateLines, []);
        },
        true,
        {
          freeflowConfig: {
            toolExecution: { enabled: true },
            gates: { delegation: "block", agreement: "block", slice: "block" },
          },
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
