import assert from "node:assert/strict";
import test from "node:test";
import {
  createPiSessionModelStateControl,
  PI_SESSION_MODEL_STATE_ENTRY,
} from "../../dist/cognitive-routing/pi-session-control.js";

const fromPair = {
  provider: "faux",
  modelId: "standard",
  thinkingLevel: "medium",
};
const targetPair = {
  provider: "faux",
  modelId: "reasoning",
  thinkingLevel: "high",
};

function createHost({
  failTargetThinking = false,
  failRollbackModel = false,
  failCommitPersistence = false,
  failAbortedPersistence = false,
} = {}) {
  let currentModel = { provider: fromPair.provider, id: fromPair.modelId };
  let currentThinkingLevel = fromPair.thinkingLevel;
  const entries = [];
  const calls = [];
  const models = new Map([
    ["faux/standard", currentModel],
    ["faux/reasoning", { provider: targetPair.provider, id: targetPair.modelId }],
  ]);

  const pi = {
    async setModel(model) {
      calls.push(["setModel", model.provider, model.id]);
      if (failRollbackModel && model.id === fromPair.modelId) return false;
      currentModel = model;
      return true;
    },
    setThinkingLevel(level) {
      calls.push(["setThinkingLevel", level]);
      currentThinkingLevel = level;
      if (failTargetThinking && level === targetPair.thinkingLevel) {
        throw new Error("simulated target thinking failure");
      }
    },
    appendEntry(customType, data) {
      calls.push(["appendEntry", customType, data]);
      if (failCommitPersistence && data?.phase === "committed") {
        throw new Error("simulated commit persistence failure");
      }
      if (failAbortedPersistence && data?.phase === "aborted") {
        throw new Error("simulated aborted persistence failure");
      }
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
  };

  return { pi, ctx, entries, calls };
}

test("applies and commits a complete Pi session model-state transition", async () => {
  const host = createHost();
  const control = createPiSessionModelStateControl(host);
  const acquisition = await control.acquireModelStateControl({ label: "Cognitive Routing" });

  assert.equal(acquisition.status, "acquired");
  const result = await acquisition.lease.setState({ ...targetPair, correlationId: "correlation-1" });

  assert.deepEqual(result, { status: "applied" });
  assert.deepEqual(
    host.calls.map(([name]) => name),
    ["appendEntry", "setModel", "setThinkingLevel", "appendEntry"],
  );
  assert.deepEqual(host.entries, [
    {
      type: "custom",
      customType: PI_SESSION_MODEL_STATE_ENTRY,
      data: {
        version: 1,
        phase: "prepared",
        status: "prepared",
        correlationId: "correlation-1",
        fromPair,
        target: targetPair,
        origin: { source: "pi", operation: "session-model-state-control" },
      },
    },
    {
      type: "custom",
      customType: PI_SESSION_MODEL_STATE_ENTRY,
      data: {
        version: 1,
        phase: "committed",
        status: "applied",
        correlationId: "correlation-1",
        fromPair,
        target: targetPair,
        origin: { source: "pi", operation: "session-model-state-control" },
      },
    },
  ]);
  assert.deepEqual(
    { provider: host.ctx.model.provider, modelId: host.ctx.model.id, thinkingLevel: host.ctx.thinkingLevel },
    targetPair,
  );

  await acquisition.lease.release();
});

test("rolls back a partially applied target and records an aborted transition", async () => {
  const host = createHost({ failTargetThinking: true });
  const control = createPiSessionModelStateControl(host);
  const acquisition = await control.acquireModelStateControl({ label: "Cognitive Routing" });

  assert.equal(acquisition.status, "acquired");
  const result = await acquisition.lease.setState({ ...targetPair, correlationId: "correlation-rollback" });

  assert.deepEqual(result, { status: "rejected" });
  assert.deepEqual(
    host.calls.map(([name]) => name),
    ["appendEntry", "setModel", "setThinkingLevel", "setModel", "setThinkingLevel", "appendEntry"],
  );
  assert.deepEqual(
    { provider: host.ctx.model.provider, modelId: host.ctx.model.id, thinkingLevel: host.ctx.thinkingLevel },
    fromPair,
  );
  assert.deepEqual(host.entries, [
    {
      type: "custom",
      customType: PI_SESSION_MODEL_STATE_ENTRY,
      data: {
        version: 1,
        phase: "prepared",
        status: "prepared",
        correlationId: "correlation-rollback",
        fromPair,
        target: targetPair,
        origin: { source: "pi", operation: "session-model-state-control" },
      },
    },
    {
      type: "custom",
      customType: PI_SESSION_MODEL_STATE_ENTRY,
      data: {
        version: 1,
        phase: "aborted",
        status: "rolled-back",
        correlationId: "correlation-rollback",
        fromPair,
        target: targetPair,
        failure: "thinking-level-change-failed",
        origin: { source: "pi", operation: "session-model-state-control" },
      },
    },
  ]);

  await acquisition.lease.release();
});

test("fails closed when rollback cannot restore the captured pair", async () => {
  const host = createHost({ failTargetThinking: true, failRollbackModel: true });
  const control = createPiSessionModelStateControl(host);
  const acquisition = await control.acquireModelStateControl({ label: "Cognitive Routing" });

  assert.equal(acquisition.status, "acquired");
  const result = await acquisition.lease.setState({ ...targetPair, correlationId: "correlation-rollback-failed" });

  assert.deepEqual(result, { status: "rejected" });
  assert.deepEqual(
    host.calls.map(([name]) => name),
    ["appendEntry", "setModel", "setThinkingLevel", "setModel", "appendEntry"],
  );
  assert.deepEqual(
    { provider: host.ctx.model.provider, modelId: host.ctx.model.id, thinkingLevel: host.ctx.thinkingLevel },
    targetPair,
  );
  assert.deepEqual(host.entries, [
    {
      type: "custom",
      customType: PI_SESSION_MODEL_STATE_ENTRY,
      data: {
        version: 1,
        phase: "prepared",
        status: "prepared",
        correlationId: "correlation-rollback-failed",
        fromPair,
        target: targetPair,
        origin: { source: "pi", operation: "session-model-state-control" },
      },
    },
    {
      type: "custom",
      customType: PI_SESSION_MODEL_STATE_ENTRY,
      data: {
        version: 1,
        phase: "aborted",
        status: "rollback-failed",
        correlationId: "correlation-rollback-failed",
        fromPair,
        target: targetPair,
        failure: "rollback-failed",
        observedPair: targetPair,
        origin: { source: "pi", operation: "session-model-state-control" },
      },
    },
  ]);

  await acquisition.lease.release();
});

test("returns a rejection when rolled-back marker persistence fails", async () => {
  const host = createHost({ failTargetThinking: true, failAbortedPersistence: true });
  const control = createPiSessionModelStateControl(host);
  const acquisition = await control.acquireModelStateControl({ label: "Cognitive Routing" });

  assert.equal(acquisition.status, "acquired");
  const result = await acquisition.lease.setState({
    ...targetPair,
    correlationId: "correlation-aborted-persist-failed",
  });

  assert.deepEqual(result, { status: "rejected" });
  assert.deepEqual(
    { provider: host.ctx.model.provider, modelId: host.ctx.model.id, thinkingLevel: host.ctx.thinkingLevel },
    fromPair,
  );

  await acquisition.lease.release();
});

test("restores the baseline when committed-marker persistence fails", async () => {
  const host = createHost({ failCommitPersistence: true });
  const control = createPiSessionModelStateControl(host);
  const acquisition = await control.acquireModelStateControl({ label: "Cognitive Routing" });

  assert.equal(acquisition.status, "acquired");
  const result = await acquisition.lease.setState({ ...targetPair, correlationId: "correlation-commit-failed" });

  assert.deepEqual(result, { status: "rejected" });
  assert.deepEqual(
    host.calls.map(([name]) => name),
    ["appendEntry", "setModel", "setThinkingLevel", "appendEntry", "setModel", "setThinkingLevel", "appendEntry"],
  );
  assert.deepEqual(
    { provider: host.ctx.model.provider, modelId: host.ctx.model.id, thinkingLevel: host.ctx.thinkingLevel },
    fromPair,
  );
  assert.equal(host.entries.at(-1).data.failure, "commit-persistence-failed");

  await acquisition.lease.release();
});
