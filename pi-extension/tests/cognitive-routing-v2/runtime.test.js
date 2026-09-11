import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { RoutingRuntime } from "../../dist/cognitive-routing-v2/runtime.js";
import { EventStore } from "../../dist/session-sources/events.js";
import { replay } from "../../dist/cognitive-routing-v2/state.js";

const models = Object.fromEntries(
  ["coordinator", "executor"].map((id) => [
    id,
    { id, provider: "fixture", api: "fixture", input: ["text"], contextWindow: 100000, maxTokens: 1000 },
  ]),
);
const cap = {
  effective: true,
  enabled: true,
  projection: false,
  profiles: Object.fromEntries(
    Object.keys(models).map((id) => [id, { provider: "fixture", model: id, thinking: "off" }]),
  ),
  blockingReason: { code: "", message: "" },
};
async function environment(run) {
  const root = await mkdtemp(join(tmpdir(), "routing-runtime-"));
  let active;
  const make = (label) => {
    const manager = SessionManager.create(root, join(root, label));
    manager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "seed" }],
      model: "coordinator",
      provider: "fixture",
      api: "fixture",
      stopReason: "stop",
      timestamp: 1,
    });
    return {
      sessionManager: manager,
      model: models.coordinator,
      thinkingLevel: "off",
      modelRegistry: { find: (_p, id) => models[id], getApiKeyAndHeaders: async () => ({ ok: true }) },
      getSystemPrompt: () => "",
      isIdle: () => true,
      abort() {},
    };
  };
  const pi = {
    appendEntry: (type, data) => active.sessionManager.appendCustomEntry(type, data),
    setModel: async (model) => {
      active.model = model;
      return true;
    },
    setThinkingLevel: (level) => {
      active.thinkingLevel = level;
    },
    getAllTools: () => [],
    sendMessage() {},
  };
  const runtime = new RoutingRuntime(pi);
  try {
    await run({
      runtime,
      make,
      activate: (ctx) => {
        active = ctx;
      },
      pi,
    });
  } finally {
    runtime.unbind();
    await rm(root, { recursive: true, force: true });
  }
}

test("delayed old control cannot change or poison a newly bound session", async () =>
  environment(async ({ runtime, make, activate }) => {
    const a = make("a"),
      b = make("b");
    activate(a);
    await runtime.bind(a, cap);
    const original = EventStore.prototype.reconcile;
    let release, entered;
    const gate = new Promise((r) => {
      release = r;
    });
    const entrance = new Promise((r) => {
      entered = r;
    });
    EventStore.prototype.reconcile = async function () {
      await original.call(this);
      if (this.reader === a.sessionManager) {
        entered();
        await gate;
      }
    };
    try {
      const old = runtime.setManualProfile("executor");
      await entrance;
      activate(b);
      await runtime.bind(b, cap);
      const before = b.sessionManager.getEntries().length;
      release();
      assert.equal((await old).status, "blocked");
      assert.equal(b.sessionManager.getEntries().length, before);
      assert.equal(b.model.id, "coordinator");
      assert.equal(runtime.state().runtimeStatus, "active");
      assert.equal(replay(b.sessionManager.getBranch()).control, "automatic");
    } finally {
      release();
      EventStore.prototype.reconcile = original;
    }
  }));

test("settled unbound attempt is retired truthfully and next request has a new identity", async () =>
  environment(async ({ runtime, make, activate }) => {
    const ctx = make("interrupt");
    activate(ctx);
    await runtime.bind(ctx, cap);
    const first = { role: "user", content: "one", timestamp: 2 };
    ctx.sessionManager.appendMessage(first);
    await runtime.context(ctx, [first]);
    const assistant = {
      role: "assistant",
      content: [{ type: "toolCall", id: "call", name: "read", arguments: {} }],
      timestamp: 3,
    };
    runtime.messageEnd(assistant);
    ctx.sessionManager.appendMessage(assistant);
    runtime.preflight({ toolName: "read", toolCallId: "call" }, ctx);
    const old = [...replay(ctx.sessionManager.getBranch()).executions.values()][0];
    await runtime.settled(ctx);
    const retired = replay(ctx.sessionManager.getBranch()).executions.get(old.id);
    assert.match(retired.interrupted, /unresolved/);
    assert.equal(retired.assistantEntryId, undefined);
    const second = { role: "user", content: "two", timestamp: 4 };
    ctx.sessionManager.appendMessage(second);
    await runtime.context(ctx, [first, assistant, second]);
    const next = {
      role: "assistant",
      content: [{ type: "toolCall", id: "next", name: "read", arguments: {} }],
      timestamp: 5,
    };
    runtime.messageEnd(next);
    ctx.sessionManager.appendMessage(next);
    runtime.preflight({ toolName: "read", toolCallId: "next" }, ctx);
    const executions = [...replay(ctx.sessionManager.getBranch()).executions.values()];
    assert.equal(executions.length, 2);
    assert.notEqual(executions[1].id, old.id);
    assert.notEqual(executions[1].basisUserEntryId, old.basisUserEntryId);
  }));
