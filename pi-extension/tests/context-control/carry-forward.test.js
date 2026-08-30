import assert from "node:assert/strict";
import test from "node:test";

import { CarryForwardRegistry } from "../../dist/context-control/residency/carry-forward.js";

const sourceOne = { sessionId: "session-1", entryId: "entry-1", toolCallId: "call-1", toolName: "read" };
const sourceTwo = { sessionId: "session-1", entryId: "entry-2", toolCallId: "call-2", toolName: "read" };
const sourceThree = { sessionId: "session-1", entryId: "entry-3", toolCallId: "call-3", toolName: "read" };

function record(id, meaning, sources, scope, owner) {
  return {
    id,
    meaning,
    sources,
    scope,
    owner,
    state: "active",
    checkpointId: `checkpoint-${id}`,
  };
}

test("carry-forward supports source, activity, and artifact scopes with owner precedence", () => {
  const registry = new CarryForwardRegistry((identity) =>
    [sourceOne, sourceTwo, sourceThree].some(
      (source) => source.sessionId === identity.sessionId && source.entryId === identity.entryId,
    ),
  );

  registry.register(record("source-state", "Source state", [sourceOne], "source", "model"));
  registry.register(record("activity-state", "Activity state", [sourceOne, sourceTwo], "activity", "artifact"));
  registry.register(
    record("artifact-state", "Artifact state", [sourceOne, sourceTwo, sourceThree], "artifact", "user"),
  );

  const stronger = registry.register(record("user-source-state", "Source state", [sourceOne], "source", "user"));
  assert.equal(stronger.id, "user-source-state");
  assert.equal(registry.get("source-state").state, "superseded");
  assert.deepEqual(
    registry.active().map((value) => value.id),
    ["activity-state", "artifact-state", "user-source-state"],
  );
  assert.ok(registry.changesView().some((change) => change.reason === "owner-precedence"));
});

test("carry-forward supersession and retirement gate exact evidence", () => {
  const registry = new CarryForwardRegistry(() => true);
  registry.register(record("meaning-v1", "Remember the first state", [sourceOne], "source", "model"));
  const replacement = registry.supersede(
    "meaning-v1",
    record("meaning-v2", "Remember the corrected state", [sourceTwo], "activity", "artifact"),
    "checkpoint-replace",
  );

  assert.equal(replacement.id, "meaning-v2");
  assert.equal(registry.use("meaning-v2", "working_state").status, "available");
  const exact = registry.use("meaning-v2", "quotation");
  assert.equal(exact.status, "exact-evidence-required");
  assert.deepEqual(exact.sources, [sourceTwo]);

  registry.retire("meaning-v2", "checkpoint-retire");
  assert.deepEqual(registry.use("meaning-v2", "working_state"), {
    status: "unavailable",
    recordId: "meaning-v2",
    reason: "inactive",
  });
  assert.equal(registry.active().length, 0);
});
