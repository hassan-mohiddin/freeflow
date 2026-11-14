import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import freeflowExtension from "../../dist/index.js";
import { EventRecorder } from "../../dist/events/recorder.js";
import { beforeAgentStartHandler, contextHandler } from "../fixtures/pi087-context.js";

// Pi's handlers, driven with a fake pi as Pi calls them: each text Freeflow puts in front of the model is handed to the
// recorder as a sent line (SPEC-006, sent). The spy records what the recorder writes after its once check, one line per
// call that is kept.

const sentLines = [];
const emit = EventRecorder.prototype.emit;
EventRecorder.prototype.emit = function (kind, fields = {}) {
  if (kind === "sent") sentLines.push({ what: fields.what, text: fields.text });
  return emit.call(this, kind, fields);
};

/** A Freeflow home holding one session's gate state; FREEFLOW_HOME points at it for the test. */
async function withHome(run) {
  const home = await mkdtemp(join(tmpdir(), "freeflow-wiring-"));
  const saved = process.env.FREEFLOW_HOME;
  process.env.FREEFLOW_HOME = home;
  try {
    await mkdir(join(home, "sessions", "s-1"), { recursive: true });
    await writeFile(
      join(home, "sessions", "s-1", "gates.json"),
      JSON.stringify({
        v: 1,
        task: "demo/task-001",
        taskDir: "/store/projects/demo/tasks/task-001-demo",
        store: "/store",
        agreement: null,
        session: null,
        exactSpec: null,
        slice: null,
        delegations: {},
        updated: "2026-11-03T10:00:00.000Z",
      }),
    );
    await run(home);
  } finally {
    if (saved === undefined) delete process.env.FREEFLOW_HOME;
    else process.env.FREEFLOW_HOME = saved;
    await rm(home, { recursive: true, force: true });
  }
}

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

const pause = (ms) => new Promise((done) => setTimeout(done, ms));

test("Pi's handlers keep the gate's row, the system prompt's section and the Runtime State as sent lines, once where a request repeats them (SPEC-006, sent)", async () => {
  await withHome(async () => {
    const cwd = await mkdtemp(join(tmpdir(), "freeflow-wiring-repo-"));
    try {
      await mkdir(join(cwd, ".freeflow"));
      await writeFile(
        join(cwd, ".freeflow", "config.json"),
        JSON.stringify({ enabled: true, toolExecution: { enabled: false } }),
      );
      sentLines.length = 0;
      const handlers = loadExtension();
      const ctx = context(cwd);
      await handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);

      // The system prompt's section: its first request keeps it, a repeat of the same text keeps nothing more.
      await beforeAgentStartHandler(handlers)({ systemPrompt: "base prompt" }, ctx);
      const afterFirstPrompt = sentLines.filter((line) => line.what === "system-prompt").length;
      assert.ok(afterFirstPrompt >= 1, "the system prompt's section is kept");
      await beforeAgentStartHandler(handlers)({ systemPrompt: "base prompt" }, ctx);
      assert.equal(sentLines.filter((line) => line.what === "system-prompt").length, afterFirstPrompt);

      // The Runtime State: kept with its first request, and not again for the same text.
      await contextHandler(handlers)({ messages: [] }, ctx);
      const afterFirstState = sentLines.filter((line) => line.what === "runtime-state").length;
      assert.equal(afterFirstState, 1);
      await contextHandler(handlers)({ messages: [] }, ctx);
      assert.equal(sentLines.filter((line) => line.what === "runtime-state").length, 1);

      // A gate's warning: the call runs, and its result carries the row, which is kept once in the turn.
      const call = { toolName: "write", toolCallId: "c1", input: { path: join(cwd, "b.ts") } };
      let shaped;
      for (let tries = 0; tries < 100 && !shaped; tries += 1) {
        await handlers.get("tool_call")(call, ctx);
        shaped = await handlers.get("tool_result")(
          { ...call, content: [{ type: "text", text: "Wrote b.ts" }], isError: false },
          ctx,
        );
        if (!shaped) await pause(20);
      }
      assert.ok(shaped, "the gate's row reached the call's result");
      const rows = sentLines.filter((line) => line.what === "gate");
      assert.equal(rows.length, 1);
      assert.match(rows[0].text, /^Freeflow gate \(warn, agreement\): write on b\.ts before an agreement/);
      // The line is the text the result carries, as the agent reads it.
      assert.ok(shaped.content[0].text.endsWith(rows[0].text));
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
