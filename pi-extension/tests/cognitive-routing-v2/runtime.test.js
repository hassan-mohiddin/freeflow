import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { RoutingRuntime } from "../../dist/cognitive-routing-v2/runtime.js";
import { EventStore } from "../../dist/session-sources/events.js";
import { replay } from "../../dist/cognitive-routing-v2/state.js";

const modelIds = ["coordinator", "executor", "coordinator-fast", "executor-cheap"];
const models = Object.fromEntries(
  modelIds.map((id) => [
    id,
    {
      id,
      provider: "fixture",
      api: "fixture",
      input: ["text"],
      reasoning: true,
      contextWindow: 100000,
      maxTokens: 1000,
    },
  ]),
);
const cap = {
  effective: true,
  enabled: true,
  projection: false,
  profiles: Object.fromEntries(
    ["coordinator", "executor"].map((id) => [id, { provider: "fixture", model: id, thinking: "off" }]),
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
      failNextModelId: undefined,
      failNextThinkingLevel: undefined,
      modelRegistry: { find: (_p, id) => models[id], getApiKeyAndHeaders: async () => ({ ok: true }) },
      getSystemPrompt: () => "",
      isIdle: () => true,
      abort() {},
    };
  };
  const pi = {
    appendEntry: (type, data) => active.sessionManager.appendCustomEntry(type, data),
    setModel: async (model) => {
      if (active.failNextModelId === model.id) {
        active.failNextModelId = undefined;
        return false;
      }
      active.model = model;
      return true;
    },
    setThinkingLevel: (level) => {
      if (active.failNextThinkingLevel === level) {
        active.failNextThinkingLevel = undefined;
        throw new Error("fixture thinking application failed");
      }
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

test("session profile overrides apply only to the selected pair and restore configured pairs", async () =>
  environment(async ({ runtime, make, activate }) => {
    const ctx = make("session-profile");
    activate(ctx);
    await runtime.bind(ctx, cap);
    assert.equal(ctx.model.id, "coordinator");

    const coordinatorOverride = await runtime.setSessionProfileOverride("coordinator", {
      provider: "fixture",
      modelId: "coordinator-fast",
      thinking: "high",
    });
    assert.equal(coordinatorOverride.status, "active");
    assert.equal(ctx.model.id, "coordinator-fast");
    assert.equal(ctx.thinkingLevel, "high");
    assert.deepEqual(replay(ctx.sessionManager.getBranch()).profileOverrides.get("coordinator"), {
      provider: "fixture",
      modelId: "coordinator-fast",
      thinking: "high",
    });

    const executorOverride = await runtime.setSessionProfileOverride("executor", {
      provider: "fixture",
      modelId: "executor-cheap",
      thinking: "low",
    });
    assert.equal(executorOverride.status, "stored");
    assert.equal(ctx.model.id, "coordinator-fast");
    assert.equal(ctx.thinkingLevel, "high");

    runtime.unbind();
    ctx.model = models.coordinator;
    ctx.thinkingLevel = "off";
    activate(ctx);
    await runtime.bind(ctx, cap);
    assert.equal(ctx.model.id, "coordinator-fast");
    assert.equal(ctx.thinkingLevel, "high");

    const held = await runtime.setManualProfile("executor");
    assert.equal(held.status, "active");
    assert.equal(ctx.model.id, "executor-cheap");
    assert.equal(ctx.thinkingLevel, "low");

    ctx.model = models.executor;
    ctx.thinkingLevel = "off";
    await runtime.ancestryChanged(ctx, false);
    assert.equal(ctx.model.id, "executor-cheap");
    assert.equal(ctx.thinkingLevel, "low");
    assert.equal(runtime.state().controlMode, "manual-executor");

    const inheritedExecutor = await runtime.setSessionProfileOverride("executor", null);
    assert.equal(inheritedExecutor.status, "active");
    assert.equal(ctx.model.id, "executor");
    assert.equal(ctx.thinkingLevel, "off");
    assert.equal(replay(ctx.sessionManager.getBranch()).profileOverrides.has("coordinator"), true);
    assert.equal(replay(ctx.sessionManager.getBranch()).profileOverrides.has("executor"), false);

    const reset = await runtime.resetSessionProfileOverrides();
    assert.equal(reset.status, "stored");
    assert.equal(ctx.model.id, "executor");
    assert.equal(ctx.thinkingLevel, "off");
    assert.equal(replay(ctx.sessionManager.getBranch()).profileOverrides.size, 0);
    assert.equal(runtime.state().controlMode, "manual-executor");

    runtime.unbind();
    activate(ctx);
    await runtime.bind(ctx, cap);
    assert.equal(ctx.model.id, "executor");
  }));

test("invalid session profile overrides preserve the native pair and routing state", async () =>
  environment(async ({ runtime, make, activate }) => {
    const ctx = make("session-invalid");
    activate(ctx);
    await runtime.bind(ctx, cap);
    const beforeEntries = ctx.sessionManager.getEntries().length;
    const result = await runtime.setSessionProfileOverride("coordinator", {
      provider: "fixture",
      modelId: "missing-model",
      thinking: "high",
    });
    assert.equal(result.status, "blocked");
    assert.equal(ctx.model.id, "coordinator");
    assert.equal(ctx.thinkingLevel, "off");
    assert.equal(ctx.sessionManager.getEntries().length, beforeEntries);
    assert.equal(replay(ctx.sessionManager.getBranch()).profileOverrides.size, 0);
  }));

test("rebind rejects a persisted session override when its model is unavailable", async () =>
  await environment(async ({ runtime, make, activate }) => {
    const ctx = make("session-stale");
    activate(ctx);
    await runtime.bind(ctx, cap);
    assert.equal(
      (
        await runtime.setSessionProfileOverride("coordinator", {
          provider: "fixture",
          modelId: "coordinator-fast",
          thinking: "high",
        })
      ).status,
      "active",
    );
    runtime.unbind();
    const saved = models["coordinator-fast"];
    delete models["coordinator-fast"];
    try {
      ctx.model = models.coordinator;
      ctx.thinkingLevel = "off";
      activate(ctx);
      await runtime.bind(ctx, cap);
      assert.equal(runtime.state().runtimeStatus, "blocked");
      assert.match(runtime.state().runtimeReason, /profile_unavailable|Model unavailable/);
    } finally {
      models["coordinator-fast"] = saved;
    }
    const corrected = await runtime.setSessionProfileOverride("coordinator", null);
    assert.equal(corrected.status, "active");
    assert.equal(runtime.state().runtimeStatus, "active");
    assert.equal(ctx.model.id, "coordinator");
    assert.equal(replay(ctx.sessionManager.getBranch()).profileOverrides.size, 0);
  }));

test("failed active session override restores the prior pair and event state", async () =>
  await environment(async ({ runtime, make, activate }) => {
    const ctx = make("session-rollback");
    activate(ctx);
    await runtime.bind(ctx, cap);
    assert.equal(
      (
        await runtime.setSessionProfileOverride("coordinator", {
          provider: "fixture",
          modelId: "coordinator-fast",
          thinking: "high",
        })
      ).status,
      "active",
    );
    ctx.failNextModelId = "coordinator";
    const result = await runtime.setSessionProfileOverride("coordinator", null);
    assert.equal(result.status, "blocked");
    assert.equal(ctx.model.id, "coordinator-fast");
    assert.equal(ctx.thinkingLevel, "high");
    assert.deepEqual(replay(ctx.sessionManager.getBranch()).profileOverrides.get("coordinator"), {
      provider: "fixture",
      modelId: "coordinator-fast",
      thinking: "high",
    });
  }));

test("active session reset restores the configured pair and control mode", async () =>
  await environment(async ({ runtime, make, activate }) => {
    const ctx = make("session-active-reset");
    activate(ctx);
    await runtime.bind(ctx, cap);
    const override = { provider: "fixture", modelId: "coordinator-fast", thinking: "high" };
    assert.equal((await runtime.setSessionProfileOverride("coordinator", override)).status, "active");
    const result = await runtime.resetSessionProfileOverrides();
    assert.equal(result.status, "active");
    assert.equal(ctx.model.id, "coordinator");
    assert.equal(ctx.thinkingLevel, "off");
    assert.equal(replay(ctx.sessionManager.getBranch()).profileOverrides.size, 0);
    assert.equal(runtime.state().controlMode, "automatic");
  }));

for (const operation of ["clear", "reset"]) {
  test(`partial active ${operation} failure restores the prior native pair and override`, async () =>
    await environment(async ({ runtime, make, activate }) => {
      const ctx = make(`session-partial-${operation}`);
      activate(ctx);
      await runtime.bind(ctx, cap);
      const override = { provider: "fixture", modelId: "coordinator-fast", thinking: "high" };
      assert.equal((await runtime.setSessionProfileOverride("coordinator", override)).status, "active");
      ctx.failNextThinkingLevel = "off";
      const result =
        operation === "clear"
          ? await runtime.setSessionProfileOverride("coordinator", null)
          : await runtime.resetSessionProfileOverrides();
      assert.equal(result.status, "blocked");
      assert.equal(ctx.model.id, "coordinator-fast");
      assert.equal(ctx.thinkingLevel, "high");
      assert.deepEqual(replay(ctx.sessionManager.getBranch()).profileOverrides.get("coordinator"), override);
      assert.equal(runtime.state().runtimeStatus, "blocked");
    }));
}
