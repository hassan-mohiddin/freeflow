import assert from "node:assert/strict";
import test from "node:test";
import {
  CognitiveRoutingController,
  COGNITIVE_ROUTING_CONTROL_ENTRY,
  COGNITIVE_ROUTING_INTENT_ENTRY,
} from "../../dist/cognitive-routing/controller.js";

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

function createHost({
  onAcquire,
  entries = [],
  branchEntries,
  currentModel = { provider: "faux", id: "return" },
} = {}) {
  const calls = [];
  const sessionEntries = [...entries];
  const ctx = {
    model: currentModel,
    thinkingLevel: "medium",
    sessionManager: {
      getEntries: () => sessionEntries,
      getBranch: () => branchEntries ?? sessionEntries,
      getLeafId: () => (branchEntries ?? sessionEntries).at(-1)?.id ?? null,
    },
  };
  const pi = {
    appendEntryDurable(customType, data) {
      calls.push(["prepare", customType, data]);
      if (customType !== COGNITIVE_ROUTING_INTENT_ENTRY && customType !== COGNITIVE_ROUTING_CONTROL_ENTRY) {
        throw new Error(`unexpected entry ${customType}`);
      }
      sessionEntries.push({ type: "custom", customType, data });
    },
    async acquireModelStateControl(options) {
      calls.push(["acquire", options]);
      return onAcquire({ calls, sessionEntries });
    },
  };
  return { calls, ctx, pi, sessionEntries };
}

function appliedLease({ calls, sessionEntries }) {
  return {
    status: "acquired",
    lease: {
      async setState(request) {
        calls.push(["setState", request]);
        sessionEntries.push({
          type: "model_state_change",
          provider: request.provider,
          modelId: request.modelId,
          thinkingLevel: request.thinkingLevel,
          correlationId: request.correlationId,
        });
        return { status: "applied" };
      },
      async release() {
        calls.push(["release"]);
        return { status: "released" };
      },
    },
  };
}

test("prepares activation before acquiring and applying the host pair", async () => {
  const host = createHost({ onAcquire: appliedLease });
  const controller = new CognitiveRoutingController({
    capabilityState,
    pi: host.pi,
    ctx: host.ctx,
    idFactory: (() => {
      const ids = ["epoch-1", "correlation-1"];
      return () => ids.shift();
    })(),
  });

  const result = await controller.activate();

  assert.equal(result.status, "active");
  assert.deepEqual(
    host.calls.map(([kind]) => kind),
    ["prepare", "acquire", "setState"],
  );
  assert.deepEqual(host.calls[0][2].returnTarget, {
    provider: "faux",
    modelId: "return",
    thinkingLevel: "medium",
  });
  assert.deepEqual(host.calls[0][2].target, {
    provider: "faux",
    modelId: "standard",
    thinkingLevel: "high",
  });
  assert.equal(controller.state().activeProfile, "standard");
});

test("applies a durable manual profile hold through the owned transition", async () => {
  const host = createHost({ onAcquire: appliedLease });
  const controller = new CognitiveRoutingController({
    capabilityState,
    pi: host.pi,
    ctx: host.ctx,
    idFactory: (() => {
      const ids = ["epoch-1", "correlation-1", "correlation-2"];
      return () => ids.shift();
    })(),
  });
  await controller.activate();

  const result = await controller.setManualProfile("reasoning");

  assert.equal(result.status, "active");
  assert.equal(controller.state().activeProfile, "reasoning");
  assert.equal(controller.state().controlMode, "manual-reasoning");
  assert.deepEqual(
    host.calls.map(([kind]) => kind),
    ["prepare", "acquire", "setState", "prepare", "setState"],
  );
});

test("reports the latest persisted host pair when cached controller state is stale", async () => {
  const host = createHost({ onAcquire: appliedLease });
  const controller = new CognitiveRoutingController({ capabilityState, pi: host.pi, ctx: host.ctx });
  await controller.activate();
  host.sessionEntries.push({
    type: "model_state_change",
    provider: "faux",
    modelId: "reasoning",
    thinkingLevel: "max",
  });

  assert.equal(controller.state().activeProfile, "reasoning");
});

test("does not report a stale active profile after an unmatched host pair", async () => {
  const host = createHost({ onAcquire: appliedLease });
  const controller = new CognitiveRoutingController({ capabilityState, pi: host.pi, ctx: host.ctx });
  await controller.activate();
  host.sessionEntries.push({
    type: "model_state_change",
    provider: "faux",
    modelId: "outside-routing",
    thinkingLevel: "medium",
  });

  assert.equal(controller.state().activeProfile, undefined);
  assert.equal(controller.state().effective, false);
});

test("does not persist or reapply an automatic request for the active profile", async () => {
  const host = createHost({ onAcquire: appliedLease });
  const controller = new CognitiveRoutingController({ capabilityState, pi: host.pi, ctx: host.ctx });
  await controller.activate();
  const callsBefore = host.calls.length;

  const result = await controller.switchAutomaticProfile("standard", "Keep the current profile.");

  assert.deepEqual(result, {
    status: "active",
    changed: false,
    from: "standard",
    to: "standard",
    profile: "standard",
  });
  assert.equal(host.calls.length, callsBefore);
});

test("switches profiles through the automatic owner with bounded agent evidence", async () => {
  const host = createHost({ onAcquire: appliedLease });
  const controller = new CognitiveRoutingController({
    capabilityState,
    pi: host.pi,
    ctx: host.ctx,
    idFactory: (() => {
      const ids = ["epoch-1", "correlation-1", "correlation-2"];
      return () => ids.shift();
    })(),
  });
  await controller.activate();

  const result = await controller.switchAutomaticProfile("reasoning", "Need a deeper analysis.");

  assert.deepEqual(result, {
    status: "active",
    changed: true,
    from: "standard",
    to: "reasoning",
    profile: "reasoning",
  });
  assert.equal(controller.state().controlMode, "automatic");
  assert.equal(host.calls.at(-1)[0], "setState");
  assert.equal(host.calls[3][2].source, "agent");
  assert.equal(host.calls[3][2].reason, "Need a deeper analysis.");
});

test("blocks an automatic switch while a manual hold owns the controller", async () => {
  const host = createHost({ onAcquire: appliedLease });
  const controller = new CognitiveRoutingController({ capabilityState, pi: host.pi, ctx: host.ctx });
  await controller.activate();
  await controller.setManualProfile("reasoning");
  const callsBefore = host.calls.length;

  const result = await controller.switchAutomaticProfile("standard", "Return to a lighter pass.");

  assert.deepEqual(result, { status: "blocked", reason: "manual_hold" });
  assert.equal(host.calls.length, callsBefore);
});

test("releases manual control as a durable control-only entry without switching the model", async () => {
  const host = createHost({ onAcquire: appliedLease });
  const controller = new CognitiveRoutingController({
    capabilityState,
    pi: host.pi,
    ctx: host.ctx,
    idFactory: (() => {
      const ids = ["epoch-1", "correlation-1", "correlation-2"];
      return () => ids.shift();
    })(),
  });
  await controller.activate();
  await controller.setManualProfile("reasoning");
  const modelStateEntriesBefore = host.sessionEntries.filter((entry) => entry.type === "model_state_change").length;

  const result = await controller.setAutomaticControl();

  assert.equal(result.status, "automatic");
  assert.equal(controller.state().activeProfile, "reasoning");
  assert.equal(controller.state().controlMode, "automatic");
  assert.equal(
    host.sessionEntries.filter((entry) => entry.type === "model_state_change").length,
    modelStateEntriesBefore,
  );
  assert.equal(host.sessionEntries.at(-1).customType, "freeflow-cognitive-routing-control");
  assert.deepEqual(
    host.calls.map(([kind]) => kind),
    ["prepare", "acquire", "setState", "prepare", "setState", "prepare"],
  );
});

test("does not acquire or switch when durable activation preparation fails", async () => {
  let acquireCalls = 0;
  const host = createHost({
    onAcquire: async () => {
      acquireCalls += 1;
      throw new Error("must not acquire");
    },
  });
  host.pi.appendEntryDurable = () => {
    throw new Error("persist failed");
  };
  const controller = new CognitiveRoutingController({ capabilityState, pi: host.pi, ctx: host.ctx });

  const result = await controller.activate();

  assert.equal(result.status, "inactive");
  assert.equal(result.reason, "prepare_failed");
  assert.equal(acquireCalls, 0);
  assert.equal(controller.state().effective, false);
});

test("releases the lease when the prepared activation transition is rejected", async () => {
  const host = createHost({
    onAcquire: async ({ calls }) => ({
      status: "acquired",
      lease: {
        async setState() {
          calls.push(["setState"]);
          return { status: "rejected" };
        },
        async release() {
          calls.push(["release"]);
          return { status: "released" };
        },
      },
    }),
  });
  const controller = new CognitiveRoutingController({ capabilityState, pi: host.pi, ctx: host.ctx });

  const result = await controller.activate();

  assert.equal(result.status, "inactive");
  assert.equal(result.reason, "transition_rejected");
  assert.deepEqual(
    host.calls.map(([kind]) => kind),
    ["prepare", "acquire", "setState", "release"],
  );
  assert.equal(controller.state().effective, false);
});

test("prepares closing before restoring the return target and releasing ownership", async () => {
  const host = createHost({ onAcquire: appliedLease });
  const controller = new CognitiveRoutingController({
    capabilityState,
    pi: host.pi,
    ctx: host.ctx,
    idFactory: (() => {
      const ids = ["epoch-1", "correlation-1", "correlation-2"];
      return () => ids.shift();
    })(),
  });
  await controller.activate();
  host.ctx.model = { provider: "faux", id: "standard" };
  host.ctx.thinkingLevel = "high";

  const result = await controller.deactivate();

  assert.equal(result.status, "inactive");
  assert.deepEqual(
    host.calls.map(([kind]) => kind),
    ["prepare", "acquire", "setState", "prepare", "setState", "release"],
  );
  assert.deepEqual(host.calls[3][2].target, {
    provider: "faux",
    modelId: "return",
    thinkingLevel: "medium",
  });
  assert.equal(controller.state().effective, false);
});

test("releases ownership on quit without starting a restore transition", async () => {
  const host = createHost({ onAcquire: appliedLease });
  const controller = new CognitiveRoutingController({ capabilityState, pi: host.pi, ctx: host.ctx });
  await controller.activate();

  const result = await controller.shutdown("quit");

  assert.deepEqual(result, { status: "inactive", reason: "released_on_quit" });
  assert.deepEqual(
    host.calls.map(([kind]) => kind),
    ["prepare", "acquire", "setState", "release"],
  );
  assert.equal(host.sessionEntries.filter((entry) => entry.type === "model_state_change").length, 1);
  assert.equal(controller.state().effective, false);
});

test("does not start a new activation while a prior intent is unresolved", async () => {
  let acquireCalls = 0;
  const host = createHost({
    onAcquire: async ({ calls }) => {
      acquireCalls += 1;
      return {
        status: "acquired",
        lease: {
          async setState() {
            calls.push(["setState"]);
            return { status: "rejected" };
          },
          async release() {
            calls.push(["release"]);
          },
        },
      };
    },
  });
  const controller = new CognitiveRoutingController({ capabilityState, pi: host.pi, ctx: host.ctx });

  await controller.activate();
  const result = await controller.activate();

  assert.equal(result.status, "inactive");
  assert.equal(result.reason, "pending_intent");
  assert.equal(acquireCalls, 1);
});

test("serializes deactivation behind an in-flight activation", async () => {
  let releaseTransition;
  let resolveTransition;
  const transitionStarted = new Promise((resolve) => {
    resolveTransition = resolve;
  });
  const host = createHost({
    onAcquire: async ({ calls, sessionEntries }) => ({
      status: "acquired",
      lease: {
        async setState(request) {
          calls.push(["setState", request]);
          if (request.modelId === "standard") {
            resolveTransition();
            await new Promise((resolve) => {
              releaseTransition = resolve;
            });
          }
          sessionEntries.push({
            type: "model_state_change",
            provider: request.provider,
            modelId: request.modelId,
            thinkingLevel: request.thinkingLevel,
            correlationId: request.correlationId,
          });
          return { status: "applied" };
        },
        async release() {
          calls.push(["release"]);
        },
      },
    }),
  });
  const controller = new CognitiveRoutingController({ capabilityState, pi: host.pi, ctx: host.ctx });

  const activation = controller.activate();
  await transitionStarted;
  const deactivation = controller.deactivate();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(
    host.calls.map(([kind]) => kind),
    ["prepare", "acquire", "setState"],
  );
  releaseTransition();

  assert.equal((await activation).status, "active");
  assert.equal((await deactivation).status, "inactive");
  assert.deepEqual(
    host.calls.map(([kind]) => kind),
    ["prepare", "acquire", "setState", "prepare", "setState", "release"],
  );
});

test("recovers the applied profile while preserving the latest automatic control entry", async () => {
  const entries = [
    {
      type: "custom",
      customType: COGNITIVE_ROUTING_INTENT_ENTRY,
      data: {
        version: 1,
        kind: "activation",
        phase: "prepared",
        control: "automatic",
        source: "system",
        epoch: "epoch-1",
        correlationId: "correlation-1",
        profile: "standard",
        target: { provider: "faux", modelId: "standard", thinkingLevel: "high" },
        returnTarget: { provider: "faux", modelId: "return", thinkingLevel: "medium" },
      },
    },
    {
      type: "model_state_change",
      provider: "faux",
      modelId: "standard",
      thinkingLevel: "high",
      correlationId: "correlation-1",
    },
    {
      type: "custom",
      customType: COGNITIVE_ROUTING_INTENT_ENTRY,
      data: {
        version: 1,
        kind: "profile",
        phase: "prepared",
        control: "manual",
        source: "user",
        epoch: "epoch-1",
        correlationId: "correlation-2",
        profile: "reasoning",
        target: { provider: "faux", modelId: "reasoning", thinkingLevel: "max" },
        returnTarget: { provider: "faux", modelId: "return", thinkingLevel: "medium" },
      },
    },
    {
      type: "model_state_change",
      provider: "faux",
      modelId: "reasoning",
      thinkingLevel: "max",
      correlationId: "correlation-2",
    },
    {
      type: "custom",
      customType: COGNITIVE_ROUTING_CONTROL_ENTRY,
      data: { version: 1, control: "automatic", source: "user", epoch: "epoch-1" },
    },
  ];
  const host = createHost({ entries, onAcquire: appliedLease });
  const controller = new CognitiveRoutingController({
    capabilityState,
    pi: host.pi,
    ctx: host.ctx,
    idFactory: () => "recovery-correlation",
  });

  const result = await controller.recover();

  assert.deepEqual(result, { status: "active", profile: "reasoning" });
  assert.equal(controller.state().controlMode, "automatic");
  assert.deepEqual(
    host.calls.map(([kind]) => kind),
    ["prepare", "acquire", "setState"],
  );
});

test("session-wide unmatched cleanup blocks recovery from a divergent branch", async () => {
  const activationIntent = {
    version: 1,
    kind: "activation",
    phase: "prepared",
    control: "automatic",
    source: "system",
    epoch: "epoch-1",
    correlationId: "activation-correlation",
    profile: "standard",
    target: { provider: "faux", modelId: "standard", thinkingLevel: "high" },
    returnTarget: { provider: "faux", modelId: "return", thinkingLevel: "medium" },
  };
  const activationHostEntry = {
    type: "model_state_change",
    provider: "faux",
    modelId: "standard",
    thinkingLevel: "high",
    correlationId: "activation-correlation",
  };
  const closingIntent = {
    version: 1,
    kind: "closing",
    phase: "prepared",
    control: "automatic",
    source: "system",
    branchId: "other-branch",
    epoch: "epoch-1",
    correlationId: "closing-correlation",
    target: { provider: "faux", modelId: "return", thinkingLevel: "medium" },
    returnTarget: { provider: "faux", modelId: "return", thinkingLevel: "medium" },
  };
  const host = createHost({
    entries: [
      { type: "custom", customType: COGNITIVE_ROUTING_INTENT_ENTRY, data: activationIntent },
      activationHostEntry,
      { type: "custom", customType: COGNITIVE_ROUTING_INTENT_ENTRY, data: closingIntent },
    ],
    branchEntries: [
      { type: "custom", customType: COGNITIVE_ROUTING_INTENT_ENTRY, data: activationIntent },
      activationHostEntry,
    ],
    onAcquire: async () => {
      throw new Error("unmatched cleanup must remain pending");
    },
  });
  const controller = new CognitiveRoutingController({ capabilityState, pi: host.pi, ctx: host.ctx });

  const recovered = await controller.recover();
  const activated = await controller.activate();

  assert.deepEqual(recovered, { status: "pending", reason: "closing_recovery_acquire_failed" });
  assert.deepEqual(activated, { status: "inactive", reason: "pending_intent" });
  assert.equal(controller.state().effective, false);
});

test("session-wide matched cleanup prevents revival from a divergent branch", async () => {
  const activationIntent = {
    version: 1,
    kind: "activation",
    phase: "prepared",
    control: "automatic",
    source: "system",
    epoch: "epoch-1",
    correlationId: "activation-correlation",
    profile: "standard",
    target: { provider: "faux", modelId: "standard", thinkingLevel: "high" },
    returnTarget: { provider: "faux", modelId: "return", thinkingLevel: "medium" },
  };
  const closingIntent = {
    version: 1,
    kind: "closing",
    phase: "prepared",
    control: "automatic",
    source: "system",
    branchId: "other-branch",
    epoch: "epoch-1",
    correlationId: "closing-correlation",
    target: { provider: "faux", modelId: "return", thinkingLevel: "medium" },
    returnTarget: { provider: "faux", modelId: "return", thinkingLevel: "medium" },
  };
  const activationHostEntry = {
    type: "model_state_change",
    provider: "faux",
    modelId: "standard",
    thinkingLevel: "high",
    correlationId: "activation-correlation",
  };
  const closingHostEntry = {
    type: "model_state_change",
    provider: "faux",
    modelId: "return",
    thinkingLevel: "medium",
    correlationId: "closing-correlation",
  };
  const host = createHost({
    entries: [
      { type: "custom", customType: COGNITIVE_ROUTING_INTENT_ENTRY, data: activationIntent },
      activationHostEntry,
      { type: "custom", customType: COGNITIVE_ROUTING_INTENT_ENTRY, data: closingIntent },
      closingHostEntry,
    ],
    branchEntries: [
      { type: "custom", customType: COGNITIVE_ROUTING_INTENT_ENTRY, data: activationIntent },
      activationHostEntry,
    ],
    onAcquire: appliedLease,
  });
  const controller = new CognitiveRoutingController({ capabilityState, pi: host.pi, ctx: host.ctx });

  const recovered = await controller.recover();

  assert.deepEqual(recovered, { status: "inactive", reason: "closed" });
  assert.deepEqual(host.calls, []);
});

test("reconciles the active branch through the owned lease", async () => {
  const host = createHost({ onAcquire: appliedLease });
  const controller = new CognitiveRoutingController({
    capabilityState,
    pi: host.pi,
    ctx: host.ctx,
    idFactory: (() => {
      const ids = ["epoch-1", "correlation-1", "correlation-2"];
      return () => ids.shift();
    })(),
  });
  await controller.activate();
  const branchEntries = [
    {
      id: "intent-profile",
      type: "custom",
      customType: COGNITIVE_ROUTING_INTENT_ENTRY,
      data: {
        version: 1,
        kind: "profile",
        phase: "prepared",
        control: "manual",
        source: "user",
        branchId: "branch-parent",
        epoch: "epoch-1",
        correlationId: "branch-correlation",
        profile: "reasoning",
        target: { provider: "faux", modelId: "reasoning", thinkingLevel: "max" },
        returnTarget: { provider: "faux", modelId: "return", thinkingLevel: "medium" },
      },
    },
    {
      id: "state-reasoning",
      type: "model_state_change",
      provider: "faux",
      modelId: "reasoning",
      thinkingLevel: "max",
      correlationId: "branch-correlation",
    },
  ];
  host.ctx.sessionManager.getBranch = () => branchEntries;
  host.ctx.sessionManager.getLeafId = () => "state-reasoning";

  const result = await controller.reconcileBranch();

  assert.deepEqual(result, { status: "active", profile: "reasoning" });
  assert.equal(controller.state().controlMode, "manual-reasoning");
  assert.deepEqual(
    host.calls.map(([kind]) => kind),
    ["prepare", "acquire", "setState", "prepare", "setState"],
  );
});

test("recovers the active branch instead of importing a divergent branch hold", async () => {
  const activationIntent = {
    version: 1,
    kind: "activation",
    phase: "prepared",
    control: "automatic",
    source: "system",
    epoch: "epoch-1",
    correlationId: "correlation-1",
    profile: "standard",
    target: { provider: "faux", modelId: "standard", thinkingLevel: "high" },
    returnTarget: { provider: "faux", modelId: "return", thinkingLevel: "medium" },
  };
  const profileIntent = {
    version: 1,
    kind: "profile",
    phase: "prepared",
    control: "manual",
    source: "user",
    epoch: "epoch-1",
    correlationId: "correlation-2",
    profile: "reasoning",
    target: { provider: "faux", modelId: "reasoning", thinkingLevel: "max" },
    returnTarget: { provider: "faux", modelId: "return", thinkingLevel: "medium" },
  };
  const activationEntry = {
    id: "intent-activation",
    type: "custom",
    customType: COGNITIVE_ROUTING_INTENT_ENTRY,
    data: activationIntent,
  };
  const activationHostEntry = {
    id: "state-standard",
    type: "model_state_change",
    provider: "faux",
    modelId: "standard",
    thinkingLevel: "high",
    correlationId: "correlation-1",
  };
  const profileEntry = {
    id: "intent-profile",
    type: "custom",
    customType: COGNITIVE_ROUTING_INTENT_ENTRY,
    data: profileIntent,
  };
  const profileHostEntry = {
    id: "state-reasoning",
    type: "model_state_change",
    provider: "faux",
    modelId: "reasoning",
    thinkingLevel: "max",
    correlationId: "correlation-2",
  };
  const host = createHost({
    entries: [activationEntry, activationHostEntry, profileEntry, profileHostEntry],
    branchEntries: [activationEntry, activationHostEntry],
    onAcquire: appliedLease,
  });
  const controller = new CognitiveRoutingController({ capabilityState, pi: host.pi, ctx: host.ctx });

  const result = await controller.recover();

  assert.deepEqual(result, { status: "active", profile: "standard" });
  assert.equal(controller.state().activeProfile, "standard");
  assert.equal(host.calls[0][2].branchId, "state-standard");
});

test("retries an unmatched prepared activation when its target still resolves", async () => {
  const entries = [
    {
      type: "custom",
      customType: COGNITIVE_ROUTING_INTENT_ENTRY,
      data: {
        version: 1,
        kind: "activation",
        phase: "prepared",
        control: "automatic",
        source: "system",
        epoch: "epoch-1",
        correlationId: "correlation-1",
        profile: "standard",
        target: { provider: "faux", modelId: "standard", thinkingLevel: "high" },
        returnTarget: { provider: "faux", modelId: "return", thinkingLevel: "medium" },
      },
    },
  ];
  const host = createHost({ entries, onAcquire: appliedLease });
  const controller = new CognitiveRoutingController({
    capabilityState,
    pi: host.pi,
    ctx: host.ctx,
    idFactory: () => "recovery-correlation",
  });

  const result = await controller.recover();

  assert.deepEqual(result, { status: "active", profile: "standard" });
  assert.deepEqual(
    host.calls.map(([kind]) => kind),
    ["prepare", "acquire", "setState"],
  );
  assert.equal(host.calls[0][2].epoch, "epoch-1");
  assert.deepEqual(host.calls[2][1], {
    provider: "faux",
    modelId: "standard",
    thinkingLevel: "high",
    correlationId: "recovery-correlation",
  });
});

test("abandons an unmatched intent when its prepared target is no longer valid", async () => {
  const entries = [
    {
      type: "custom",
      customType: COGNITIVE_ROUTING_INTENT_ENTRY,
      data: {
        version: 1,
        kind: "activation",
        phase: "prepared",
        control: "automatic",
        source: "system",
        epoch: "epoch-1",
        correlationId: "correlation-1",
        profile: "standard",
        target: { provider: "faux", modelId: "standard", thinkingLevel: "high" },
        returnTarget: { provider: "faux", modelId: "return", thinkingLevel: "medium" },
      },
    },
  ];
  const changedCapabilityState = {
    ...capabilityState,
    resolvedProfiles: {
      ...capabilityState.resolvedProfiles,
      standard: { ...capabilityState.resolvedProfiles.standard, model: "replacement" },
    },
  };
  const host = createHost({ entries, onAcquire: appliedLease });
  const controller = new CognitiveRoutingController({
    capabilityState: changedCapabilityState,
    pi: host.pi,
    ctx: host.ctx,
  });

  const result = await controller.recover();

  assert.deepEqual(result, { status: "inactive", reason: "intent_abandoned" });
  assert.equal(host.calls.filter(([kind]) => kind === "acquire").length, 0);
  assert.equal(host.sessionEntries.at(-1).data.phase, "abandoned");
});

test("abandons a stale branch intent without recapturing the epoch return target", async () => {
  const entries = [
    {
      type: "custom",
      customType: COGNITIVE_ROUTING_INTENT_ENTRY,
      data: {
        version: 1,
        kind: "activation",
        phase: "prepared",
        control: "automatic",
        source: "system",
        epoch: "epoch-1",
        correlationId: "activation-correlation",
        profile: "standard",
        target: { provider: "faux", modelId: "standard", thinkingLevel: "high" },
        returnTarget: { provider: "faux", modelId: "return", thinkingLevel: "medium" },
      },
    },
    {
      type: "model_state_change",
      provider: "faux",
      modelId: "standard",
      thinkingLevel: "high",
      correlationId: "activation-correlation",
    },
    {
      type: "custom",
      customType: COGNITIVE_ROUTING_INTENT_ENTRY,
      data: {
        version: 1,
        kind: "profile",
        phase: "prepared",
        control: "manual",
        source: "user",
        epoch: "epoch-1",
        correlationId: "stale-profile-correlation",
        profile: "reasoning",
        target: { provider: "faux", modelId: "reasoning", thinkingLevel: "max" },
        returnTarget: { provider: "faux", modelId: "return", thinkingLevel: "medium" },
      },
    },
  ];
  const changedCapabilityState = {
    ...capabilityState,
    resolvedProfiles: {
      ...capabilityState.resolvedProfiles,
      reasoning: { ...capabilityState.resolvedProfiles.reasoning, model: "replacement" },
    },
  };
  const host = createHost({ entries, onAcquire: appliedLease });
  const controller = new CognitiveRoutingController({
    capabilityState: changedCapabilityState,
    pi: host.pi,
    ctx: host.ctx,
    idFactory: (() => {
      const ids = ["reconciled-correlation"];
      return () => ids.shift() ?? "fallback-correlation";
    })(),
  });

  const result = await controller.recover();

  assert.deepEqual(result, { status: "active", profile: "standard" });
  assert.equal(host.calls[0][2].phase, "abandoned");
  assert.equal(host.calls[1][2].returnTarget.modelId, "return");
  assert.equal(controller.state().returnTarget.modelId, "return");
});

test("retries an unmatched closing intent and releases after restoring its exact target", async () => {
  const entries = [
    {
      type: "custom",
      customType: COGNITIVE_ROUTING_INTENT_ENTRY,
      data: {
        version: 1,
        kind: "closing",
        phase: "prepared",
        control: "automatic",
        source: "system",
        epoch: "epoch-1",
        correlationId: "correlation-1",
        target: { provider: "faux", modelId: "return", thinkingLevel: "medium" },
        returnTarget: { provider: "faux", modelId: "return", thinkingLevel: "medium" },
      },
    },
  ];
  const host = createHost({ entries, onAcquire: appliedLease });
  const controller = new CognitiveRoutingController({
    capabilityState,
    pi: host.pi,
    ctx: host.ctx,
    idFactory: () => "closing-recovery-correlation",
  });

  const result = await controller.recover();

  assert.deepEqual(result, { status: "inactive", reason: "restored" });
  assert.deepEqual(
    host.calls.map(([kind]) => kind),
    ["prepare", "acquire", "setState", "release"],
  );
  assert.deepEqual(host.calls[2][1], {
    provider: "faux",
    modelId: "return",
    thinkingLevel: "medium",
    correlationId: "closing-recovery-correlation",
  });
});

test("keeps an unmatched prepared activation pending when recovery retry fails", async () => {
  const entries = [
    {
      type: "custom",
      customType: COGNITIVE_ROUTING_INTENT_ENTRY,
      data: {
        version: 1,
        kind: "activation",
        phase: "prepared",
        epoch: "epoch-1",
        correlationId: "correlation-1",
        target: { provider: "faux", modelId: "standard", thinkingLevel: "high" },
        returnTarget: { provider: "faux", modelId: "return", thinkingLevel: "medium" },
      },
    },
  ];
  let acquireCalls = 0;
  const host = createHost({
    entries,
    onAcquire: async () => {
      acquireCalls += 1;
      throw new Error("recovery must not guess success");
    },
  });
  const controller = new CognitiveRoutingController({ capabilityState, pi: host.pi, ctx: host.ctx });

  const result = await controller.recover();

  assert.equal(result.status, "pending");
  assert.equal(controller.state().effective, false);
  assert.equal(acquireCalls, 1);
});
