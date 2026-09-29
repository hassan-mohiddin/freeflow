import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { RoutingRuntime } from "../../dist/cognitive-routing/runtime.js";
import { EventStore } from "../../dist/cognitive-routing/events.js";
import { routingState } from "../fixtures/routing-state.js";
import { takeStage } from "../../dist/host/staging.js";

// Idle switches reach the host model when a prompt starts; this runs that step as index.ts does.
const submit = async (runtime, ctx) => {
  await runtime.beforeRun(ctx);
  runtime.writeStaged(takeStage(ctx.sessionManager).events);
};

const modelIds = ["coordinator", "helper", "executor", "coordinator-fast", "helper-fast", "executor-cheap"];
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
const helperCap = {
  ...cap,
  delegation: "helper",
  profiles: Object.fromEntries(
    ["coordinator", "helper"].map((id) => [id, { provider: "fixture", model: id, thinking: "off" }]),
  ),
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
      assert.equal(routingState(b.sessionManager).control, "automatic");
    } finally {
      release();
      EventStore.prototype.reconcile = original;
    }
  }));

for (const [name, firstCapability, heldWorker, secondCapability] of [
  ["Helper to Executor", helperCap, "helper", cap],
  ["Executor to Helper", cap, "executor", helperCap],
]) {
  test(`binding a fresh ${name} session does not inherit the prior manual hold`, async () =>
    environment(async ({ runtime, make, activate }) => {
      const first = make(`${name}-first`);
      activate(first);
      await runtime.bind(first, firstCapability);
      assert.equal((await runtime.setManualProfile(heldWorker)).status, "active");
      const firstEntryCount = first.sessionManager.getEntries().length;

      const second = make(`${name}-second`);
      activate(second);
      await runtime.bind(second, secondCapability);

      assert.equal(runtime.state().runtimeStatus, "active");
      assert.equal(runtime.state().controlMode, "automatic");
      assert.equal(runtime.state().activeProfile, "coordinator");
      assert.equal(second.model.id, "coordinator");
      assert.equal(first.sessionManager.getEntries().length, firstEntryCount);
      assert.equal(routingState(first.sessionManager).control, "manual");
      assert.equal(routingState(first.sessionManager).profile, heldWorker);
    }));
}

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
    const old = [...routingState(ctx.sessionManager).executions.values()][0];
    await runtime.settled(ctx);
    const retired = routingState(ctx.sessionManager).executions.get(old.id);
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
    const executions = [...routingState(ctx.sessionManager).executions.values()];
    assert.equal(executions.length, 2);
    assert.notEqual(executions[1].id, old.id);
    assert.notEqual(executions[1].basisUserEntryId, old.basisUserEntryId);
  }));

test("session profile overrides apply only to the selected pair and restore configured pairs", async () =>
  environment(async ({ runtime, make, activate }) => {
    const ctx = make("session-profile");
    activate(ctx);
    await runtime.bind(ctx, cap);
    await submit(runtime, ctx);
    assert.equal(ctx.model.id, "coordinator");

    const coordinatorOverride = await runtime.setSessionProfileOverride("coordinator", {
      provider: "fixture",
      modelId: "coordinator-fast",
      thinking: "high",
    });
    assert.equal(coordinatorOverride.status, "active");
    await submit(runtime, ctx);
    assert.equal(ctx.model.id, "coordinator-fast");
    assert.equal(ctx.thinkingLevel, "high");
    assert.deepEqual(routingState(ctx.sessionManager).profileOverrides.get("coordinator"), {
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
    await submit(runtime, ctx);
    assert.equal(ctx.model.id, "coordinator-fast");
    assert.equal(ctx.thinkingLevel, "high");

    runtime.unbind();
    ctx.model = models.coordinator;
    ctx.thinkingLevel = "off";
    activate(ctx);
    await runtime.bind(ctx, cap);
    await submit(runtime, ctx);
    assert.equal(ctx.model.id, "coordinator-fast");
    assert.equal(ctx.thinkingLevel, "high");

    const held = await runtime.setManualProfile("executor");
    assert.equal(held.status, "active");
    await submit(runtime, ctx);
    assert.equal(ctx.model.id, "executor-cheap");
    assert.equal(ctx.thinkingLevel, "low");

    ctx.model = models.executor;
    ctx.thinkingLevel = "off";
    await runtime.ancestryChanged(ctx, false);
    await submit(runtime, ctx);
    assert.equal(ctx.model.id, "executor-cheap");
    assert.equal(ctx.thinkingLevel, "low");
    assert.equal(runtime.state().controlMode, "manual-executor");

    const inheritedExecutor = await runtime.setSessionProfileOverride("executor", null);
    assert.equal(inheritedExecutor.status, "active");
    await submit(runtime, ctx);
    assert.equal(ctx.model.id, "executor");
    assert.equal(ctx.thinkingLevel, "off");
    assert.equal(routingState(ctx.sessionManager).profileOverrides.has("coordinator"), true);
    assert.equal(routingState(ctx.sessionManager).profileOverrides.has("executor"), false);

    const reset = await runtime.resetSessionProfileOverrides();
    assert.equal(reset.status, "stored");
    await submit(runtime, ctx);
    assert.equal(ctx.model.id, "executor");
    assert.equal(ctx.thinkingLevel, "off");
    assert.equal(routingState(ctx.sessionManager).profileOverrides.size, 0);
    assert.equal(runtime.state().controlMode, "manual-executor");

    runtime.unbind();
    activate(ctx);
    await runtime.bind(ctx, cap);
    await submit(runtime, ctx);
    assert.equal(ctx.model.id, "executor");
  }));

test("session delegation switches enabled workers, survives rebind, and inherits without changing configured mode", async () =>
  environment(async ({ runtime, make, activate }) => {
    const ctx = make("session-delegation");
    const configured = {
      ...cap,
      delegation: "executor",
      profiles: { ...cap.profiles, helper: { provider: "fixture", model: "helper", thinking: "off" } },
    };
    activate(ctx);
    await runtime.bind(ctx, configured);
    assert.equal(runtime.state().delegation, "executor");
    assert.equal((await runtime.setManualProfile("helper")).status, "blocked");
    assert.equal((await runtime.setSessionDelegationOverride("both")).status, "stored");
    assert.equal(runtime.state().delegation, "both");
    assert.equal(runtime.sessionDelegationOverride(), "both");
    assert.equal((await runtime.setManualProfile("helper")).status, "active");
    await submit(runtime, ctx);
    assert.equal(ctx.model.id, "helper");

    runtime.unbind();
    activate(ctx);
    await runtime.bind(ctx, configured);
    assert.equal(runtime.state().delegation, "both");
    assert.equal(runtime.state().controlMode, "manual-helper");
    assert.equal((await runtime.setAutomaticControl()).status, "automatic");
    assert.equal((await runtime.setSessionDelegationOverride(null)).status, "stored");
    assert.equal(runtime.state().delegation, "executor");
    assert.equal(runtime.sessionDelegationOverride(), undefined);
    assert.equal((await runtime.setManualProfile("helper")).status, "blocked");
    assert.equal(routingState(ctx.sessionManager).delegationOverride, undefined);
  }));

test("a session Helper preset can be staged before enabling Helper without a configured Helper preset", async () =>
  environment(async ({ runtime, make, activate }) => {
    const ctx = make("session-staged-helper");
    activate(ctx);
    await runtime.bind(ctx, cap);
    assert.equal((await runtime.setSessionDelegationOverride("both")).status, "blocked");
    const helper = { provider: "fixture", modelId: "helper-fast", thinking: "low" };
    assert.equal((await runtime.setSessionProfileOverride("helper", helper)).status, "stored");
    assert.equal((await runtime.setSessionDelegationOverride("both")).status, "stored");
    assert.equal((await runtime.setManualProfile("helper")).status, "active");
    await submit(runtime, ctx);
    assert.equal(ctx.model.id, "helper-fast");
    assert.equal(ctx.thinkingLevel, "low");
  }));

test("invalid session mode preserves the existing mode and session event history", async () =>
  environment(async ({ runtime, make, activate }) => {
    const ctx = make("invalid-session-delegation");
    activate(ctx);
    await runtime.bind(ctx, cap);
    const before = ctx.sessionManager.getEntries().length;
    const result = await runtime.setSessionDelegationOverride("both");
    assert.equal(result.status, "blocked");
    assert.match(result.reason, /profile_missing/);
    assert.equal(runtime.state().delegation, "executor");
    assert.equal(ctx.sessionManager.getEntries().length, before);
  }));

test("Helper session presets apply through the same guarded profile path", async () =>
  environment(async ({ runtime, make, activate }) => {
    const ctx = make("session-helper-profile");
    activate(ctx);
    await runtime.bind(ctx, helperCap);
    const helperOverride = { provider: "fixture", modelId: "helper-fast", thinking: "high" };
    assert.equal((await runtime.setSessionProfileOverride("helper", helperOverride)).status, "stored");
    await submit(runtime, ctx);
    assert.equal(ctx.model.id, "coordinator");
    assert.equal((await runtime.setManualProfile("helper")).status, "active");
    await submit(runtime, ctx);
    assert.equal(ctx.model.id, "helper-fast");
    assert.equal(ctx.thinkingLevel, "high");
    assert.deepEqual(routingState(ctx.sessionManager).profileOverrides.get("helper"), helperOverride);
    assert.equal((await runtime.resetSessionProfileOverrides()).status, "active");
    await submit(runtime, ctx);
    assert.equal(ctx.model.id, "helper");
    assert.equal(ctx.thinkingLevel, "off");
    assert.equal(routingState(ctx.sessionManager).profileOverrides.size, 0);
    assert.equal(runtime.state().controlMode, "manual-helper");
  }));

test("manual control rejects a disabled worker without poisoning routing", async () =>
  environment(async ({ runtime, make, activate }) => {
    const ctx = make("disabled-manual-worker");
    activate(ctx);
    await runtime.bind(ctx, helperCap);
    const result = await runtime.setManualProfile("executor");
    assert.equal(result.status, "blocked");
    assert.match(result.reason, /not enabled/);
    assert.equal(runtime.state().runtimeStatus, "active");
    assert.equal(runtime.state().activeProfile, "coordinator");
    assert.equal(ctx.model.id, "coordinator");
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
    assert.equal(routingState(ctx.sessionManager).profileOverrides.size, 0);
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
    assert.equal(routingState(ctx.sessionManager).profileOverrides.size, 0);
  }));

test("a pending override the host cannot apply is dropped at submit, keeping the prior pair and event state", async () =>
  await environment(async ({ runtime, make, activate }) => {
    const ctx = make("session-rollback");
    const notices = [];
    ctx.ui = { notify: (message) => notices.push(message) };
    activate(ctx);
    await runtime.bind(ctx, cap);
    const override = { provider: "fixture", modelId: "coordinator-fast", thinking: "high" };
    assert.equal((await runtime.setSessionProfileOverride("coordinator", override)).status, "active");
    await submit(runtime, ctx);
    ctx.failNextModelId = "coordinator";
    await runtime.setSessionProfileOverride("coordinator", null);
    assert.equal(ctx.model.id, "coordinator-fast", "nothing changes before the prompt");
    await submit(runtime, ctx);
    assert.equal(ctx.model.id, "coordinator-fast");
    assert.equal(ctx.thinkingLevel, "high");
    assert.deepEqual(routingState(ctx.sessionManager).profileOverrides.get("coordinator"), override);
    assert.equal(runtime.state().runtimeStatus, "active", "recorded control still names what the host runs");
    assert.match(notices.at(-1), /Could not switch to coordinator\/off/);
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
    assert.equal(routingState(ctx.sessionManager).profileOverrides.size, 0);
    assert.equal(runtime.state().controlMode, "automatic");
  }));

for (const operation of ["clear", "reset"]) {
  test(`partial ${operation} failure at submit restores the prior native pair and override`, async () =>
    await environment(async ({ runtime, make, activate }) => {
      const ctx = make(`session-partial-${operation}`);
      activate(ctx);
      await runtime.bind(ctx, cap);
      const override = { provider: "fixture", modelId: "coordinator-fast", thinking: "high" };
      assert.equal((await runtime.setSessionProfileOverride("coordinator", override)).status, "active");
      await submit(runtime, ctx);
      ctx.failNextThinkingLevel = "off";
      if (operation === "clear") await runtime.setSessionProfileOverride("coordinator", null);
      else await runtime.resetSessionProfileOverrides();
      await submit(runtime, ctx);
      assert.equal(ctx.model.id, "coordinator-fast");
      assert.equal(ctx.thinkingLevel, "high");
      assert.deepEqual(routingState(ctx.sessionManager).profileOverrides.get("coordinator"), override);
      assert.equal(runtime.state().runtimeStatus, "active");
    }));
}

test("a mid-session configuration change blocks with a recovery hint until reconciled", async () =>
  environment(async ({ runtime, make, activate }) => {
    const ctx = make("configuration-change");
    const notices = [];
    ctx.ui = { notify: (message, level) => notices.push({ message, level }) };
    activate(ctx);
    await runtime.bind(ctx, cap);
    assert.equal(runtime.state().runtimeStatus, "active");
    const changed = {
      ...cap,
      profiles: { ...cap.profiles, executor: { provider: "fixture", model: "executor-cheap", thinking: "off" } },
    };
    await runtime.refresh(ctx, changed);
    assert.equal(runtime.state().runtimeStatus, "blocked");
    assert.match(runtime.state().runtimeReason, /configuration_changed/);
    assert.equal(notices.length, 1, "the user is told once");
    assert.match(notices[0].message, /\/freeflow profile auto/);
    const blocked = await runtime.context(ctx, [{ role: "user", content: "next", timestamp: 2 }]);
    assert.match(JSON.stringify(blocked), /\/freeflow profile auto/);
    assert.equal(notices.length, 1, "an unchanged block is not re-announced");
    assert.equal((await runtime.setAutomaticControl()).status, "automatic");
    assert.equal(runtime.state().runtimeStatus, "active");
  }));
