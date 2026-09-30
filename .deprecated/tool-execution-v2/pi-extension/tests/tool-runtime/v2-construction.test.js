import assert from "node:assert/strict";
import test from "node:test";

import { resolveToolExecutionConfig } from "../../dist/tool-runtime/config.js";
import { ToolRuntime } from "../../dist/tool-runtime/index.js";

function runtime(v2Factories) {
  const state = resolveToolExecutionConfig(
    { toolExecution: { enabled: true, discovery: { enabled: true } } },
    {},
    true,
  );
  return new ToolRuntime(
    () => state,
    {
      scope: () => ({ fence: "current" }),
      responsibility: () => ({ profile: "solo", control: "inactive" }),
      admit: () => ({ kind: "allowed" }),
    },
    { read: async () => ({ id: "result:one", text: "ok", range: { startBytes: 0, endBytes: 2 }, totalBytes: 2 }) },
    undefined,
    v2Factories,
  );
}

test("v2 factories construct one explicit session binding without changing current catalog or calls", async () => {
  const store = { status: () => ({ state: "ready" }) };
  const presenter = {
    model: async () => ({
      text: "ok",
      coverage: { kind: "complete-at-boundary", boundary: "fixture" },
      artifactRefs: [],
    }),
  };
  let storeCalls = 0;
  let occurrenceCalls = 0;
  let presenterCalls = 0;
  const tools = runtime({
    store(identity) {
      storeCalls += 1;
      assert.deepEqual(identity, { sessionId: "session-one", branchAnchor: "root" });
      return store;
    },
    presenter(operation) {
      presenterCalls += 1;
      assert.equal(operation.key.id, "fixture.read");
      return presenter;
    },
    occurrenceId() {
      return `occurrence:${++occurrenceCalls}`;
    },
  });
  const before = JSON.stringify(tools.registry.snapshot());
  assert.throws(() => tools.v2OccurrenceId({ sessionId: "session-one", branchAnchor: "root" }), /v2_unavailable/);
  assert.throws(() => tools.v2Presenter({ sessionId: "session-one", branchAnchor: "root" }, {}), /v2_unavailable/);
  assert.throws(() => tools.bindV2Session({ sessionId: "", branchAnchor: "root" }), /v2_identity/);
  assert.throws(() => tools.bindV2Session({ sessionId: "session-one", branchAnchor: "../other" }), /v2_identity/);
  assert.equal(storeCalls, 0);

  const binding = tools.bindV2Session({ sessionId: "session-one", branchAnchor: "root" });
  assert.equal(binding.store, store);
  assert.equal(Object.isFrozen(binding.identity), true);
  assert.equal(tools.bindV2Session({ sessionId: "session-one", branchAnchor: "root" }), binding);
  assert.equal(storeCalls, 1);
  const identity = { sessionId: "session-one", branchAnchor: "root" };
  assert.equal(tools.v2Presenter(identity, { key: { id: "fixture.read", revision: "1" } }), presenter);
  assert.equal(presenterCalls, 1);
  assert.equal(tools.v2OccurrenceId(identity), "occurrence:1");
  assert.equal(tools.v2OccurrenceId(identity), "occurrence:2");
  assert.equal(JSON.stringify(tools.registry.snapshot()), before);

  const ctx = { cwd: process.cwd(), sessionManager: { getSessionId: () => "session-one" } };
  const described = await tools.invokeTools(
    "fixture",
    { operation: "describe", operations: [{ id: "result.read", revision: "1" }] },
    undefined,
    ctx,
  );
  assert.equal(described.details.status, "described");
  assert.equal(described.details.generation, tools.registry.snapshot().generation);
  assert.equal(JSON.stringify(tools.registry.snapshot()), before);
});

test("v2 binding rejects cross-session and cross-branch reuse without running a new factory", () => {
  let calls = 0;
  const tools = runtime({
    store: () => {
      calls += 1;
      return { status: () => ({ state: "ready" }) };
    },
    presenter: () => ({
      model: async () => ({ text: "", coverage: { kind: "unknown", boundary: "fixture" }, artifactRefs: [] }),
    }),
    occurrenceId: () => "occurrence:one",
  });
  const original = tools.bindV2Session({ sessionId: "session-one", branchAnchor: "root" });
  assert.throws(() => tools.bindV2Session({ sessionId: "session-two", branchAnchor: "root" }), /v2_binding_changed/);
  assert.throws(() => tools.bindV2Session({ sessionId: "session-one", branchAnchor: "other" }), /v2_binding_changed/);
  assert.equal(calls, 1);
  assert.throws(() => tools.v2OccurrenceId({ sessionId: "session-two", branchAnchor: "root" }), /v2_binding_changed/);
  assert.throws(() => tools.v2Presenter({ sessionId: "session-one", branchAnchor: "other" }, {}), /v2_binding_changed/);
  assert.equal(tools.bindV2Session({ sessionId: "session-one", branchAnchor: "root" }), original);
  assert.throws(() => runtime().bindV2Session({ sessionId: "session-one", branchAnchor: "root" }), /v2_unavailable/);
});
