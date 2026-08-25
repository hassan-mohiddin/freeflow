import assert from "node:assert/strict";
import test from "node:test";
import { projectCognitiveRoutingHistory } from "../../dist/cognitive-routing/history.js";
import { PI_SESSION_MODEL_STATE_ENTRY } from "../../dist/cognitive-routing/pi-session-control.js";

const standard = { provider: "faux", modelId: "standard", thinkingLevel: "high" };
const reasoning = { provider: "faux", modelId: "reasoning", thinkingLevel: "max" };

const intent = {
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
};

test("projects a committed Pi session marker as the completed transition", () => {
  const entries = [
    { id: "root", type: "message", parentId: null, timestamp: "2026-08-25T12:00:00.000Z" },
    {
      id: "intent-1",
      type: "custom",
      parentId: "root",
      timestamp: "2026-08-25T12:00:01.000Z",
      customType: "freeflow-cognitive-routing-intent",
      data: intent,
    },
    {
      id: "commit-1",
      type: "custom",
      parentId: "intent-1",
      timestamp: "2026-08-25T12:00:02.000Z",
      customType: PI_SESSION_MODEL_STATE_ENTRY,
      data: {
        version: 1,
        phase: "committed",
        status: "applied",
        correlationId: "correlation-1",
        fromPair: standard,
        target: reasoning,
        origin: { source: "pi", operation: "session-model-state-control" },
      },
    },
  ];

  const result = projectCognitiveRoutingHistory(entries, {
    branchEntries: entries,
    current: { control: "automatic", profile: "reasoning" },
  });

  assert.deepEqual(result.events, [
    {
      id: "intent:intent-1",
      timestamp: "2026-08-25T12:00:02.000Z",
      jsonlPosition: 2,
      entryId: "commit-1",
      parentId: "intent-1",
      branchAnchor: "commit-1",
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
      hostOrigin: { source: "pi", operation: "session-model-state-control" },
    },
  ]);
  assert.deepEqual(result.summary, {
    latestSemanticEventId: "intent:intent-1",
    latestCompletedEventId: "intent:intent-1",
    unresolvedCount: 0,
    anomalyCount: 0,
  });
});
