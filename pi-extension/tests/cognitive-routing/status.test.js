import assert from "node:assert/strict";
import test from "node:test";
import { RoutingSession } from "../../dist/cognitive-routing/session.js";
import { initialState } from "../../dist/cognitive-routing/state.js";
import { RoutingStatus } from "../../dist/cognitive-routing/status.js";

test("detailed status names the recovery, the assessment, and the requested recent events", () => {
  const state = { ...initialState(), control: "automatic", profile: "coordinator", recoveryId: "r1" };
  state.recoveries.set("r1", {
    id: "r1",
    state: "reading",
    assignmentId: "a1",
    assessmentHandoffId: "h1",
    paths: ["notes.md"],
    supplementRevision: 0,
  });
  state.assessment = { handoffId: "h1", view: "suspended", problems: [{ code: "source_unavailable", detail: "gone" }] };
  for (const [id, type] of [
    ["e1", "delegate-accepted"],
    ["e2", "return-accepted"],
    ["e3", "recovery-requested"],
  ])
    state.events.set(id, { eventId: id, operationId: `op-${id}`, data: { type } });
  const session = Object.assign(new RoutingSession(), {
    capability: { effective: true, blockingReason: { code: "", message: "" } },
    stateData: () => state,
    delegation: () => "executor",
  });
  const models = { pending: () => undefined, heldMismatch: () => undefined, presetWarnings: () => [] };
  const status = new RoutingStatus(session, models);
  const detail = status.detail(2);
  assert.deepEqual(detail.recovery, {
    id: "r1",
    state: "reading",
    assignmentId: "a1",
    assessmentHandoffId: "h1",
    paths: ["notes.md"],
    results: [],
    supplementRevision: 0,
  });
  assert.deepEqual(detail.assessment, {
    handoffId: "h1",
    view: "suspended",
    problems: [{ code: "source_unavailable", detail: "gone" }],
  });
  assert.deepEqual(
    detail.history.map((e) => e.type),
    ["return-accepted", "recovery-requested"],
    "only the latest requested events",
  );
  assert.equal(status.detail().history, undefined, "no history unless asked");
});
