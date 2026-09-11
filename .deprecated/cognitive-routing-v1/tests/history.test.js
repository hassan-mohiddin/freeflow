import assert from "node:assert/strict";
import test from "node:test";
import { projectCognitiveRoutingHistory, readCognitiveRoutingHistory } from "../../dist/cognitive-routing/history.js";

const standard = { provider: "faux", modelId: "standard", thinkingLevel: "high" };
const reasoning = { provider: "faux", modelId: "reasoning", thinkingLevel: "max" };

function intent(overrides = {}) {
  return {
    version: 2,
    phase: "prepared",
    kind: "profile",
    control: "automatic",
    source: "agent",
    mechanism: "agent-tool",
    decisionCorrelationId: "correlation-1",
    fromPair: standard,
    fromProfile: "standard",
    epoch: "epoch-1",
    correlationId: "correlation-1",
    profile: "reasoning",
    target: reasoning,
    returnTarget: { provider: "faux", modelId: "return", thinkingLevel: "medium" },
    reason: "Need deeper analysis.",
    ...overrides,
  };
}

function hostEntry(overrides = {}) {
  return {
    type: "model_state_change",
    id: "state-1",
    parentId: "intent-1",
    timestamp: "2026-08-23T11:00:00.000Z",
    provider: reasoning.provider,
    modelId: reasoning.modelId,
    thinkingLevel: reasoning.thinkingLevel,
    correlationId: "correlation-1",
    origin: { source: "piflow", operation: "model-state-control" },
    ...overrides,
  };
}

function current(profile = "reasoning", control = "automatic") {
  return { profile, control };
}

test("projects a completed switch from the host representative and captured baseline", () => {
  const entries = [
    { id: "root", type: "message", parentId: null, timestamp: "2026-08-23T10:59:00.000Z" },
    {
      id: "intent-1",
      type: "custom",
      parentId: "root",
      timestamp: "2026-08-23T10:59:01.000Z",
      customType: "freeflow-cognitive-routing-intent",
      data: intent(),
    },
    hostEntry(),
  ];

  const result = projectCognitiveRoutingHistory(entries, {
    branchEntries: entries,
    current: current(),
  });

  assert.deepEqual(result.current, current());
  assert.deepEqual(result.summary, {
    scope: "session",
    latestSemanticEventId: "intent:intent-1",
    latestCompletedEventId: "intent:intent-1",
    unresolvedCount: 0,
    anomalyCount: 0,
  });
  assert.deepEqual(result.events, [
    {
      id: "intent:intent-1",
      timestamp: "2026-08-23T11:00:00.000Z",
      jsonlPosition: 2,
      entryId: "state-1",
      parentId: "intent-1",
      branchAnchor: "state-1",
      classification: "semantic-switch",
      decisionSource: "agent",
      mechanism: "agent-tool",
      outcome: "completed",
      changed: true,
      integrity: "valid",
      from: "standard",
      to: "reasoning",
      control: "automatic",
      reason: "Need deeper analysis.",
      epoch: "epoch-1",
      correlationId: "correlation-1",
      decisionCorrelationId: "correlation-1",
      hostOrigin: { source: "piflow", operation: "model-state-control" },
    },
  ]);
});

test("orders completed events by JSONL position and preserves tri-state change semantics", () => {
  const entries = [
    {
      id: "intent-a",
      type: "custom",
      customType: "freeflow-cognitive-routing-intent",
      data: intent({ correlationId: "correlation-a", decisionCorrelationId: "correlation-a" }),
    },
    hostEntry({ id: "state-a", correlationId: "correlation-a", timestamp: "2026-08-23T11:01:00.000Z" }),
    {
      id: "intent-b",
      type: "custom",
      customType: "freeflow-cognitive-routing-intent",
      data: intent({
        correlationId: "correlation-b",
        decisionCorrelationId: "correlation-b",
        fromPair: standard,
        fromProfile: "standard",
        profile: "standard",
        target: standard,
      }),
    },
    hostEntry({
      id: "state-b",
      correlationId: "correlation-b",
      timestamp: "not-a-timestamp",
      provider: standard.provider,
      modelId: standard.modelId,
      thinkingLevel: standard.thinkingLevel,
    }),
    {
      id: "intent-c",
      type: "custom",
      customType: "freeflow-cognitive-routing-intent",
      data: intent({
        version: 1,
        correlationId: "correlation-c",
        decisionCorrelationId: undefined,
        fromPair: undefined,
        fromProfile: undefined,
      }),
    },
    hostEntry({ id: "state-c", correlationId: "correlation-c", timestamp: undefined }),
  ];

  const result = projectCognitiveRoutingHistory(entries, { current: current() });

  assert.deepEqual(
    result.events.map(({ id, jsonlPosition, changed, timestamp }) => ({ id, jsonlPosition, changed, timestamp })),
    [
      { id: "intent:intent-c", jsonlPosition: 5, changed: "unknown", timestamp: undefined },
      { id: "intent:intent-b", jsonlPosition: 3, changed: false, timestamp: undefined },
      { id: "intent:intent-a", jsonlPosition: 1, changed: true, timestamp: "2026-08-23T11:01:00.000Z" },
    ],
  );
  assert.equal(result.summary.latestCompletedEventId, "intent:intent-c");
});

test("keeps unresolved and anomalous evidence distinct from the anomalies view", () => {
  const entries = [
    {
      id: "intent-unresolved",
      type: "custom",
      customType: "freeflow-cognitive-routing-intent",
      data: intent({ correlationId: "correlation-unresolved", decisionCorrelationId: "correlation-unresolved" }),
    },
    {
      id: "intent-mismatch",
      type: "custom",
      customType: "freeflow-cognitive-routing-intent",
      data: intent({ correlationId: "correlation-mismatch", decisionCorrelationId: "correlation-mismatch" }),
    },
    hostEntry({
      id: "state-mismatch",
      correlationId: "correlation-mismatch",
      provider: standard.provider,
      modelId: standard.modelId,
      thinkingLevel: standard.thinkingLevel,
    }),
  ];

  const result = projectCognitiveRoutingHistory(entries, { current: current() });
  assert.equal(result.summary.unresolvedCount, 2);
  assert.equal(result.summary.anomalyCount, 1);
  assert.deepEqual(
    result.events.map(({ id, outcome, integrity, anomalyReason }) => ({ id, outcome, integrity, anomalyReason })),
    [
      {
        id: "intent:intent-mismatch",
        outcome: "unresolved",
        integrity: "anomaly",
        anomalyReason: "host_target_mismatch",
      },
      { id: "intent:intent-unresolved", outcome: "unresolved", integrity: "unknown", anomalyReason: undefined },
    ],
  );

  const anomalies = projectCognitiveRoutingHistory(entries, { current: current(), anomaliesOnly: true });
  assert.equal(anomalies.summary.unresolvedCount, 2);
  assert.equal(anomalies.summary.anomalyCount, 1);
  assert.deepEqual(
    anomalies.events.map(({ id }) => id),
    ["intent:intent-mismatch"],
  );
});

test("projects control-only entries without fabricating a profile transition", () => {
  const entries = [
    {
      id: "control-1",
      type: "custom",
      customType: "freeflow-cognitive-routing-control",
      data: {
        version: 2,
        control: "automatic",
        source: "user",
        mechanism: "profile-command",
        epoch: "epoch-1",
        reason: "manual hold release",
      },
    },
  ];

  const result = projectCognitiveRoutingHistory(entries, { current: current() });

  assert.deepEqual(result.summary, {
    scope: "session",
    unresolvedCount: 0,
    anomalyCount: 0,
  });
  assert.deepEqual(result.events, [
    {
      id: "control:control-1",
      jsonlPosition: 0,
      entryId: "control-1",
      branchAnchor: "control-1",
      classification: "control-only",
      decisionSource: "user",
      mechanism: "profile-command",
      outcome: "completed",
      changed: false,
      integrity: "valid",
      control: "automatic",
      reason: "manual hold release",
      epoch: "epoch-1",
    },
  ]);
});

test("latest completed transition ignores later control-only entries", () => {
  const entries = [
    {
      id: "intent-completed",
      type: "custom",
      customType: "freeflow-cognitive-routing-intent",
      data: intent(),
    },
    hostEntry({ id: "state-completed" }),
    {
      id: "control-later",
      type: "custom",
      customType: "freeflow-cognitive-routing-control",
      data: {
        version: 2,
        control: "automatic",
        source: "user",
        mechanism: "profile-command",
        epoch: "epoch-1",
      },
    },
  ];

  const result = projectCognitiveRoutingHistory(entries, { current: current() });

  assert.equal(result.summary.latestCompletedEventId, "intent:intent-completed");
});

test("reports persisted projection diagnostics separately from transition history", () => {
  const entries = [
    {
      id: "intent-active",
      type: "custom",
      customType: "freeflow-cognitive-routing-intent",
      data: intent(),
    },
    {
      id: "diagnostic-active",
      type: "custom",
      customType: "freeflow-cognitive-routing-diagnostic",
      timestamp: "2026-08-23T11:02:00.000Z",
      data: {
        version: 1,
        kind: "projection-failure",
        code: "projection_dependency_invalid:source_not_found:custom",
        stage: "context_assembly",
        message: "No verifiable source was associated with the custom context message.",
        modelState: "unknown",
        role: "custom",
        customType: "subagent-notification",
        position: 4,
      },
    },
  ];

  const result = projectCognitiveRoutingHistory(entries, {
    scope: "active-branch",
    branchEntries: [entries[0], entries[1]],
    current: current(),
  });

  assert.equal(result.status, "available");
  assert.deepEqual(result.summary, {
    scope: "active-branch",
    latestSemanticEventId: "intent:intent-active",
    unresolvedCount: 1,
    anomalyCount: 0,
  });
  assert.deepEqual(result.projection.summary, {
    scope: "active-branch",
    diagnosticCount: 1,
    invalidCount: 0,
    latestDiagnosticId: "projection:diagnostic-active",
  });
  assert.deepEqual(result.projection.diagnostics[0], {
    version: 1,
    kind: "projection-failure",
    code: "projection_dependency_invalid:source_not_found:custom",
    stage: "context_assembly",
    message: "No verifiable source was associated with the custom context message.",
    modelState: "unknown",
    id: "projection:diagnostic-active",
    timestamp: "2026-08-23T11:02:00.000Z",
    jsonlPosition: 1,
    entryId: "diagnostic-active",
    branchAnchor: "diagnostic-active",
    role: "custom",
    customType: "subagent-notification",
    position: 4,
  });
});

test("filters sibling-branch host results before correlating active-branch history", () => {
  const activeIntent = {
    id: "intent-active",
    type: "custom",
    customType: "freeflow-cognitive-routing-intent",
    data: intent({ correlationId: "shared-correlation", decisionCorrelationId: "shared-correlation" }),
  };
  const siblingHost = hostEntry({
    id: "sibling-host",
    parentId: "sibling-parent",
    correlationId: "shared-correlation",
  });
  const entries = [activeIntent, siblingHost];
  const result = projectCognitiveRoutingHistory(entries, {
    scope: "active-branch",
    branchEntries: [activeIntent],
    current: current("standard"),
  });

  assert.deepEqual(
    result.events.map(({ id, outcome, integrity }) => ({ id, outcome, integrity })),
    [{ id: "intent:intent-active", outcome: "unresolved", integrity: "unknown" }],
  );
});

test("classifies uncorrelated host changes using the closing event for their epoch", () => {
  const entries = [
    {
      id: "intent-profile",
      type: "custom",
      customType: "freeflow-cognitive-routing-intent",
      data: intent({ correlationId: "profile-correlation", decisionCorrelationId: "profile-correlation" }),
    },
    hostEntry({ id: "host-profile", correlationId: "profile-correlation" }),
    {
      id: "host-during-routing",
      type: "model_state_change",
      provider: "external",
      modelId: "outside",
      thinkingLevel: "off",
    },
    {
      id: "intent-closing",
      type: "custom",
      customType: "freeflow-cognitive-routing-intent",
      data: intent({
        kind: "closing",
        correlationId: "closing-correlation",
        decisionCorrelationId: undefined,
        profile: undefined,
        fromPair: reasoning,
        fromProfile: "reasoning",
        target: standard,
        epoch: "epoch-1",
      }),
    },
    hostEntry({
      id: "host-closing",
      parentId: "intent-closing",
      correlationId: "closing-correlation",
      provider: standard.provider,
      modelId: standard.modelId,
      thinkingLevel: standard.thinkingLevel,
    }),
    {
      id: "host-after-closing",
      type: "model_state_change",
      provider: "external",
      modelId: "outside-again",
      thinkingLevel: "off",
    },
  ];

  const result = projectCognitiveRoutingHistory(entries, { current: current("standard") });
  const hosts = result.events.filter((event) => event.classification === "external-host-change");
  assert.deepEqual(
    hosts.map(({ entryId, integrity, anomalyReason }) => ({ entryId, integrity, anomalyReason })),
    [
      { entryId: "host-after-closing", integrity: "valid", anomalyReason: undefined },
      { entryId: "host-during-routing", integrity: "anomaly", anomalyReason: "host_change_during_routing" },
    ],
  );
});

test("reports unreadable session history instead of clean zero counts", () => {
  const result = readCognitiveRoutingHistory(
    {
      sessionManager: {
        getEntries() {
          throw new Error("session read failed");
        },
      },
    },
    { current: current() },
  );

  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "session_read_failed");
  assert.equal(result.scope, "session");
  assert.deepEqual(result.events, []);
  assert.equal(result.projection.status, "unavailable");
  assert.equal(result.projection.reason, "session_read_failed");
});
