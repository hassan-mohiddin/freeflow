import assert from "node:assert/strict";
import test from "node:test";
import { CognitiveRoutingController } from "../../dist/cognitive-routing/controller.js";
import {
  createPiSessionControllerHost,
  PI_SESSION_MODEL_STATE_ENTRY,
} from "../../dist/cognitive-routing/pi-session-control.js";

const capabilityState = {
  configured: true,
  configValid: true,
  enabled: true,
  effective: true,
  enabledSource: "repository",
  profiles: {},
  profileSources: { standard: "repository", reasoning: "repository" },
  resolvedProfiles: {
    standard: { provider: "faux", model: "standard", thinkingLevel: "high", effectiveThinkingLevel: "high" },
    reasoning: { provider: "faux", model: "reasoning", thinkingLevel: "max", effectiveThinkingLevel: "max" },
  },
  blockingReason: { code: "disabled", message: "not blocked" },
};

function createHost({ failRollbackModel = false, initialEntries = [] } = {}) {
  let currentModel = { provider: "faux", id: "return", reasoning: true };
  let currentThinkingLevel = "medium";
  const entries = [...initialEntries];
  const calls = [];
  const models = new Map([
    ["faux/return", currentModel],
    ["faux/standard", { provider: "faux", id: "standard", reasoning: true }],
    ["faux/reasoning", { provider: "faux", id: "reasoning", reasoning: true }],
  ]);
  const pi = {
    async setModel(model) {
      calls.push(["setModel", model.id]);
      if (failRollbackModel && model.id === "standard" && currentModel.id === "reasoning") return false;
      currentModel = model;
      return true;
    },
    setThinkingLevel(level) {
      calls.push(["setThinkingLevel", level]);
      currentThinkingLevel = level;
      if (level === "max") throw new Error("simulated reasoning setter failure");
    },
    appendEntry(customType, data) {
      entries.push({ type: "custom", customType, data });
    },
  };
  const ctx = {
    get model() {
      return currentModel;
    },
    get thinkingLevel() {
      return currentThinkingLevel;
    },
    modelRegistry: {
      find(provider, modelId) {
        return models.get(`${provider}/${modelId}`);
      },
    },
    sessionManager: {
      getEntries: () => entries,
      getBranch: () => entries,
      getLeafId: () => entries.at(-1)?.id ?? null,
    },
  };
  return { pi, ctx, entries, calls };
}

function recoveryEntries(
  status,
  { activationControl = "automatic", profileControl = "automatic", includeFromControl = true } = {},
) {
  const activationTarget = { provider: "faux", modelId: "standard", thinkingLevel: "high" };
  const returnTarget = { provider: "faux", modelId: "return", thinkingLevel: "medium" };
  const profileTarget = { provider: "faux", modelId: "reasoning", thinkingLevel: "max" };
  return [
    {
      id: "activation-intent",
      type: "custom",
      customType: "freeflow-cognitive-routing-intent",
      data: {
        version: 2,
        phase: "prepared",
        kind: "activation",
        control: activationControl,
        source: "system",
        epoch: "epoch-1",
        correlationId: "activation-1",
        profile: "standard",
        target: activationTarget,
        returnTarget,
      },
    },
    {
      id: "activation-commit",
      type: "custom",
      customType: PI_SESSION_MODEL_STATE_ENTRY,
      data: {
        version: 1,
        phase: "committed",
        status: "applied",
        correlationId: "activation-1",
        fromPair: returnTarget,
        target: activationTarget,
        origin: { source: "pi", operation: "session-model-state-control" },
      },
    },
    {
      id: "profile-intent",
      type: "custom",
      customType: "freeflow-cognitive-routing-intent",
      data: {
        version: 2,
        phase: "prepared",
        kind: "profile",
        control: profileControl,
        source: "agent",
        mechanism: "agent-tool",
        decisionCorrelationId: "profile-1",
        fromPair: activationTarget,
        fromProfile: "standard",
        ...(includeFromControl ? { fromControl: profileControl } : {}),
        epoch: "epoch-1",
        correlationId: "profile-1",
        profile: "reasoning",
        target: profileTarget,
        returnTarget,
        reason: "Need deeper analysis.",
      },
    },
    {
      id: "profile-marker",
      type: "custom",
      customType: PI_SESSION_MODEL_STATE_ENTRY,
      data: {
        version: 1,
        phase: status === "prepared" ? "prepared" : "aborted",
        status,
        correlationId: "profile-1",
        fromPair: activationTarget,
        target: profileTarget,
        ...(status === "prepared"
          ? {}
          : {
              failure: status === "rolled-back" ? "thinking-level-change-failed" : "rollback-failed",
              ...(status === "rollback-failed" ? { observedPair: profileTarget } : {}),
            }),
        origin: { source: "pi", operation: "session-model-state-control" },
      },
    },
  ];
}

function activationRecoveryEntries(status) {
  const activationTarget = { provider: "faux", modelId: "standard", thinkingLevel: "high" };
  const returnTarget = { provider: "faux", modelId: "return", thinkingLevel: "medium" };
  return [
    {
      id: "activation-intent",
      type: "custom",
      customType: "freeflow-cognitive-routing-intent",
      data: {
        version: 2,
        phase: "prepared",
        kind: "activation",
        control: "automatic",
        source: "system",
        epoch: "epoch-1",
        correlationId: "activation-1",
        profile: "standard",
        target: activationTarget,
        returnTarget,
      },
    },
    {
      id: "activation-marker",
      type: "custom",
      customType: PI_SESSION_MODEL_STATE_ENTRY,
      data: {
        version: 1,
        phase: status === "prepared" ? "prepared" : "aborted",
        status,
        correlationId: "activation-1",
        fromPair: returnTarget,
        target: activationTarget,
        ...(status === "prepared"
          ? {}
          : {
              failure: "rollback-failed",
              observedPair: activationTarget,
            }),
        origin: { source: "pi", operation: "session-model-state-control" },
      },
    },
  ];
}

test("keeps rollback-failed activation recovery pending without retrying", async () => {
  const host = createHost({ initialEntries: activationRecoveryEntries("rollback-failed") });
  const initialEntryCount = host.entries.length;
  const controller = new CognitiveRoutingController({
    capabilityState,
    pi: createPiSessionControllerHost(host),
    ctx: host.ctx,
  });

  const result = await controller.recover();

  assert.deepEqual(result, { status: "pending", reason: "rollback_failed" });
  assert.deepEqual(host.calls, []);
  assert.equal(host.entries.length, initialEntryCount);
});

test("abandons an interrupted activation after restoring its return pair", async () => {
  const host = createHost({ initialEntries: activationRecoveryEntries("prepared") });
  const controller = new CognitiveRoutingController({
    capabilityState,
    pi: createPiSessionControllerHost(host),
    ctx: host.ctx,
  });

  const result = await controller.recover();

  assert.deepEqual(result, { status: "inactive", reason: "intent_abandoned" });
  assert.deepEqual(host.calls, []);
  assert.equal(host.ctx.model.id, "return");
  assert.equal(host.ctx.thinkingLevel, "medium");
  assert.equal(host.entries.at(-1).data.phase, "abandoned");
});

test("keeps contradictory legacy baseline metadata pending without mutation", async () => {
  const entries = recoveryEntries("prepared", { activationControl: "manual", profileControl: "manual" });
  const profileIntent = entries.find(
    (entry) => entry.customType === "freeflow-cognitive-routing-intent" && entry.data.kind === "profile",
  );
  profileIntent.data.fromPair = { provider: "faux", modelId: "reasoning", thinkingLevel: "max" };
  const host = createHost({ initialEntries: entries });
  const controller = new CognitiveRoutingController({
    capabilityState,
    pi: createPiSessionControllerHost(host),
    ctx: host.ctx,
    idFactory: () => "recovery-1",
  });

  const result = await controller.recover();

  assert.deepEqual(result, { status: "pending", reason: "baseline_control_unknown" });
  assert.deepEqual(host.calls, []);
  assert.equal(host.ctx.model.id, "return");
});

test("preserves legacy manual standard control after interrupted profile recovery", async () => {
  const host = createHost({
    initialEntries: recoveryEntries("prepared", {
      activationControl: "manual",
      profileControl: "manual",
      includeFromControl: false,
    }),
  });
  const controller = new CognitiveRoutingController({
    capabilityState,
    pi: createPiSessionControllerHost(host),
    ctx: host.ctx,
    idFactory: () => "recovery-1",
  });

  const result = await controller.recover();

  assert.deepEqual(result, { status: "active", profile: "standard" });
  assert.equal(controller.state().controlMode, "manual-standard");
});

test("preserves manual standard control after interrupted profile recovery", async () => {
  const host = createHost({
    initialEntries: recoveryEntries("prepared", { activationControl: "manual", profileControl: "manual" }),
  });
  const controller = new CognitiveRoutingController({
    capabilityState,
    pi: createPiSessionControllerHost(host),
    ctx: host.ctx,
    idFactory: () => "recovery-1",
  });

  const result = await controller.recover();

  assert.deepEqual(result, { status: "active", profile: "standard" });
  assert.equal(controller.state().controlMode, "manual-standard");
});

test("recovers a rolled-back profile intent through the prior committed profile", async () => {
  const host = createHost({ initialEntries: recoveryEntries("rolled-back") });
  const controller = new CognitiveRoutingController({
    capabilityState,
    pi: createPiSessionControllerHost(host),
    ctx: host.ctx,
    idFactory: () => "recovery-1",
  });

  const result = await controller.recover();

  assert.deepEqual(result, { status: "active", profile: "standard" });
  assert.equal(host.ctx.model.id, "standard");
  assert.equal(host.ctx.thinkingLevel, "high");
  assert.equal(
    host.calls.some(([name]) => name === "setModel"),
    true,
  );
  assert.equal(
    host.entries.some(
      (entry) =>
        entry.customType === "freeflow-cognitive-routing-intent" &&
        entry.data.correlationId === "profile-1" &&
        entry.data.phase === "abandoned",
    ),
    true,
  );
});

test("recovers a prepared profile intent after an interrupted transition", async () => {
  const host = createHost({ initialEntries: recoveryEntries("prepared") });
  const controller = new CognitiveRoutingController({
    capabilityState,
    pi: createPiSessionControllerHost(host),
    ctx: host.ctx,
    idFactory: () => "recovery-1",
  });

  const result = await controller.recover();

  assert.deepEqual(result, { status: "active", profile: "standard" });
  assert.equal(host.ctx.model.id, "standard");
  assert.equal(host.ctx.thinkingLevel, "high");
  assert.equal(
    host.entries.some(
      (entry) =>
        entry.customType === PI_SESSION_MODEL_STATE_ENTRY &&
        entry.data.phase === "aborted" &&
        entry.data.failure === "interrupted-transition",
    ),
    true,
  );
  assert.equal(
    host.entries.some(
      (entry) =>
        entry.customType === "freeflow-cognitive-routing-intent" &&
        entry.data.correlationId === "profile-1" &&
        entry.data.phase === "abandoned",
    ),
    true,
  );
});

test("keeps rollback-failed recovery pending without retrying either pair", async () => {
  const host = createHost({ initialEntries: recoveryEntries("rollback-failed") });
  const initialEntryCount = host.entries.length;
  const controller = new CognitiveRoutingController({
    capabilityState,
    pi: createPiSessionControllerHost(host),
    ctx: host.ctx,
  });

  const result = await controller.recover();

  assert.deepEqual(result, { status: "pending", reason: "rollback_failed" });
  assert.deepEqual(host.calls, []);
  assert.equal(host.entries.length, initialEntryCount);
});

test("degrades when rollback cannot restore the captured pair", async () => {
  const host = createHost({ failRollbackModel: true });
  const controller = new CognitiveRoutingController({
    capabilityState,
    pi: createPiSessionControllerHost(host),
    ctx: host.ctx,
    idFactory: (() => {
      const ids = ["epoch-1", "activation-1", "switch-1"];
      return () => ids.shift();
    })(),
  });

  assert.deepEqual(await controller.activate(), { status: "active", profile: "standard" });
  const result = await controller.switchAutomaticProfile("reasoning", "Need deeper analysis.", "agent", "agent-tool");

  assert.deepEqual(result, { status: "inactive", reason: "rollback_failed" });
  assert.equal(controller.state().effective, false);
  assert.equal(controller.state().activeProfile, undefined);
  assert.equal(host.ctx.model.id, "reasoning");
  assert.equal(host.ctx.thinkingLevel, "max");
  assert.equal(
    host.entries.filter((entry) => entry.customType === "freeflow-cognitive-routing-intent").at(-1).data.phase,
    "abandoned",
  );
  assert.equal(
    host.entries.filter((entry) => entry.customType === "freeflow-cognitive-routing-model-state").at(-1).data.status,
    "rollback-failed",
  );
});

test("terminates a rolled-back profile intent without losing the active profile", async () => {
  const host = createHost();
  const controller = new CognitiveRoutingController({
    capabilityState,
    pi: createPiSessionControllerHost(host),
    ctx: host.ctx,
    idFactory: (() => {
      const ids = ["epoch-1", "activation-1", "switch-1"];
      return () => ids.shift();
    })(),
  });

  assert.deepEqual(await controller.activate(), { status: "active", profile: "standard" });
  const result = await controller.switchAutomaticProfile("reasoning", "Need deeper analysis.", "agent", "agent-tool");

  assert.deepEqual(result, { status: "inactive", reason: "transition_rejected" });
  assert.equal(controller.state().activeProfile, "standard");
  assert.equal(controller.state().effective, true);
  assert.equal(
    host.entries.filter((entry) => entry.customType === "freeflow-cognitive-routing-intent").at(-1).data.phase,
    "abandoned",
  );
  assert.equal(
    host.entries.filter((entry) => entry.customType === "freeflow-cognitive-routing-intent").at(-1).data.source,
    "system",
  );
});
