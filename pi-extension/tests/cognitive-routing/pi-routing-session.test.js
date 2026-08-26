import assert from "node:assert/strict";
import test from "node:test";
import { COGNITIVE_ROUTING_INACTIVE_ENTRY } from "../../dist/cognitive-routing/controller.js";
import { PiRoutingSession } from "../../dist/cognitive-routing/pi-routing-session.js";
import { PI_SESSION_MODEL_STATE_ENTRY } from "../../dist/cognitive-routing/pi-session-control.js";

const committedEntry = {
  type: "custom",
  customType: PI_SESSION_MODEL_STATE_ENTRY,
  data: {
    version: 1,
    phase: "committed",
    status: "applied",
    correlationId: "correlation-1",
    fromPair: { provider: "faux", modelId: "standard", thinkingLevel: "medium" },
    target: { provider: "faux", modelId: "reasoning", thinkingLevel: "high" },
    origin: { source: "pi", operation: "session-model-state-control" },
  },
};

function createHost({ entries = [], failPersistence = false } = {}) {
  const pi = {
    appendEntry(customType, data) {
      if (failPersistence) throw new Error("simulated inactive persistence failure");
      entries.push({ type: "custom", customType, data });
    },
  };
  const ctx = {
    model: { provider: "faux", id: "standard" },
    thinkingLevel: "medium",
    modelStateProvenance: {},
    sessionManager: { getBranch: () => entries },
  };
  return { pi, ctx, entries };
}

test("refreshes startup ownership evidence for a new explicit launch", () => {
  const historicalInactive = { type: "custom", customType: COGNITIVE_ROUTING_INACTIVE_ENTRY, data: { version: 1 } };
  const host = createHost({ entries: [historicalInactive, committedEntry] });
  const session = new PiRoutingSession({ pi: host.pi, stockPi: true });

  session.resetForSession(host.ctx, { reason: "startup" }, ["pi", "--model", "faux/standard"]);
  session.ensureStartupInactive(host.ctx, true);

  assert.equal(session.snapshot().disposition, "inactive");
  assert.equal(host.entries.filter((entry) => entry.customType === COGNITIVE_ROUTING_INACTIVE_ENTRY).length, 2);
});

test("keeps blocked reactivation pending until an active controller is committed", () => {
  const host = createHost({ failPersistence: true });
  const session = new PiRoutingSession({ pi: host.pi, stockPi: true });

  session.resetForSession(host.ctx, { reason: "startup" }, ["pi"]);
  session.observeArmedNativeChange(host.ctx, "Pi model selection");
  assert.equal(session.snapshot().disposition, "blocked");
  assert.deepEqual(session.runtimeState(), {
    effective: false,
    runtimeStatus: "blocked",
    runtimeReason: "inactive_state_persistence_failed",
  });

  session.beginExplicitReactivation();
  assert.equal(session.snapshot().disposition, "blocked");
  assert.equal(session.isExplicitReactivationPending(), true);
  assert.equal(session.canAutoActivate(), true);

  session.markActive();
  assert.equal(session.snapshot().disposition, "available");
  assert.equal(session.isExplicitReactivationPending(), false);
  assert.equal(session.runtimeState(), undefined);
});

test("does not treat an old marker and later commit as a reload override", () => {
  const host = createHost({
    entries: [{ type: "custom", customType: COGNITIVE_ROUTING_INACTIVE_ENTRY, data: { version: 1 } }, committedEntry],
  });
  const session = new PiRoutingSession({ pi: host.pi, stockPi: true });

  session.resetForSession(host.ctx, { reason: "reload" }, ["pi", "--model", "faux/standard"]);
  session.reconcileNativeEntries(host.ctx);

  assert.deepEqual(session.snapshot(), {
    status: "available",
    disposition: "available",
    startupSelectionSuppressed: false,
  });
});
