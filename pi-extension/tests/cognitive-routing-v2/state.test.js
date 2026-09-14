import assert from "node:assert/strict";
import test from "node:test";
import { initialState, reduce, parseRoutingEvent } from "../../dist/cognitive-routing-v2/state.js";
const pair = { provider: "fixture", modelId: "model", thinking: "off" };
function machine() {
  let s = initialState(),
    n = 0;
  return {
    get state() {
      return s;
    },
    event(data) {
      return {
        version: 2,
        eventId: `event-${++n}`,
        operationId: `op-${n}`,
        stepId: data.type,
        recordedSessionId: "session",
        data,
      };
    },
    apply(data) {
      const e = this.event(data);
      s = reduce(s, e);
      return e;
    },
    set(e) {
      s = reduce(s, e);
    },
  };
}
const control = (profile) => ({ type: "control", control: "automatic", profile, reason: "fixture control" });
const opened = (id, profile, assignmentId) => ({
  type: "execution-opened",
  execution: { id, profile, assignmentId, basisUserEntryId: "user", pair, resultEntryIds: [] },
});
const bound = (id) => ({
  type: "execution-bound",
  executionId: id,
  assistantEntryId: `assistant-${id}`,
  resultEntryIds: [],
  outcome: "completed",
});
function delegated(id = "a1", unitId = "u1", assignmentIds = [id], executionId = "e1", replacement) {
  const hid = `d-${id}`;
  return {
    type: "delegate-accepted",
    unit: { id: unitId, objective: "fixture objective", state: "open", assignmentIds },
    assignment: {
      id,
      unitId,
      contract: "fixture contract",
      basisUserEntryId: "user",
      state: "outstanding",
      delegateHandoffId: hid,
    },
    handoff: {
      id: hid,
      kind: "delegate",
      assignmentId: id,
      text: "fixture contract",
      from: "coordinator",
      to: "executor",
      executionId,
      toolCallId: `call-${executionId}`,
      basisUserEntryId: "user",
      state: "pending",
      reportRevision: 0,
      limitations: [],
    },
    ...(replacement ? { replacement } : {}),
  };
}
function returned(report = "exact report", revision = 1) {
  return {
    type: "return-accepted",
    handoff: {
      id: "return",
      kind: "return",
      assignmentId: "a1",
      text: report,
      from: "executor",
      to: "coordinator",
      executionId: "e2",
      toolCallId: "return-call",
      basisUserEntryId: "user",
      state: "pending",
      reportRevision: revision,
      outcome: "partial",
      limitations: ["uncertainty retained"],
    },
  };
}
function started() {
  const m = machine();
  m.apply(control("coordinator"));
  m.apply(opened("e1", "coordinator"));
  m.apply(delegated());
  m.apply(bound("e1"));
  m.apply({ type: "handoff-state", handoffId: "d-a1", state: "configured", observedPair: pair });
  return m;
}
const recoveryRequest = (assignmentId = "a1") => ({
  type: "recovery-request-accepted",
  recovery: {
    id: "recovery",
    assignmentId,
    assessmentHandoffId: "return",
    baseReportRevision: 1,
    request: "recover evidence",
    requestedPaths: ["recovery.txt"],
    paths: ["/tmp/recovery.txt"],
    state: "requested",
    requestHandoffId: "recovery-request",
    supplementRevision: 0,
  },
  handoff: {
    id: "recovery-request",
    kind: "recovery-request",
    assignmentId,
    text: "recover evidence",
    from: "coordinator",
    to: "executor",
    executionId: "e3",
    toolCallId: "recover-call",
    basisUserEntryId: "user",
    state: "pending",
    reportRevision: 0,
    limitations: [],
  },
});
const recoverySupplement = (revision = 1) => ({
  type: "recovery-supplement-accepted",
  recoveryId: "recovery",
  handoff: {
    id: "recovery-return",
    kind: "recovery-return",
    assignmentId: "a1",
    text: "recovered evidence",
    from: "executor",
    to: "coordinator",
    executionId: "e4",
    toolCallId: "supplement-call",
    basisUserEntryId: "user",
    state: "pending",
    reportRevision: revision,
    outcome: "completed",
    limitations: [],
  },
});
function recoveryReady() {
  const m = started();
  m.apply(opened("e2", "executor", "a1"));
  m.apply(returned());
  m.apply(bound("e2"));
  m.apply({ type: "handoff-state", handoffId: "return", state: "configured", observedPair: pair });
  m.apply(opened("e3", "coordinator", "a1"));
  m.apply(recoveryRequest());
  return m;
}
const reservation = (revision) => ({
  id: "reservation",
  selectionRevision: revision,
  receiver: "coordinator",
  target: pair,
  qualification: "fixture",
  sources: [],
  maximumInputTokens: 10000,
  outputReserve: 1000,
  estimateMethod: "fixture",
});

test("event identity and operation idempotency reject changed payloads", () => {
  const m = machine(),
    e = m.apply(control("coordinator"));
  const before = m.state;
  m.set(e);
  assert.equal(m.state, before);
  assert.throws(
    () => m.set({ ...e, data: control("executor") }),
    (e) => e.code === "event_identity_conflict",
  );
  assert.throws(
    () => m.set({ ...e, eventId: "other", data: control("executor") }),
    (e) => e.code === "operation_conflict",
  );
});
test("closed nested schemas reject malformed optional handoff and source fields", () => {
  const m = machine();
  for (const patch of [{ reason: {} }, { outcome: 123 }, { unexpected: "field" }]) {
    const data = delegated();
    Object.assign(data.handoff, patch);
    assert.throws(
      () => parseRoutingEvent(m.event(data)),
      (e) => e.code === "invalid_assignment",
    );
  }
  const data = opened("e", "executor", "a");
  data.execution.pair = { ...data.execution.pair, extra: "invalid" };
  assert.throws(
    () => parseRoutingEvent(m.event(data)),
    (e) => e.code === "invalid_execution",
  );
});
test("prototype names are bounded malformed events, not raw decoder errors", () => {
  for (const type of ["constructor", "__proto__", "toString", "unknown"])
    assert.throws(
      () =>
        parseRoutingEvent({
          version: 2,
          eventId: "e",
          operationId: "o",
          stepId: "s",
          recordedSessionId: "session",
          data: { type },
        }),
      (e) => e.name === "RoutingError" && e.code === "invalid_event_type",
    );
});
test("outstanding assignments cannot be implicitly replaced", () => {
  const m = started();
  assert.throws(
    () => m.apply(delegated("a2", "u1", ["a1", "a2"])),
    (e) => e.code === "wrong_control",
  );
  m.apply(control("coordinator"));
  assert.throws(
    () => m.apply(delegated("a2", "u1", ["a1", "a2"])),
    (e) => e.code === "assignment_outstanding",
  );
  assert.equal(m.state.assignments.size, 1);
});
test("replacement retains old assignment and requires old execution to be resolved", () => {
  const m = started();
  m.apply(opened("e2", "executor", "a1"));
  m.apply(control("coordinator"));
  m.apply(opened("e3", "coordinator", "a1"));
  const replacement = delegated("a2", "u1", ["a1", "a2"], "e3", {
    assignmentId: "a1",
    reason: "current direction changed",
  });
  assert.throws(
    () => m.apply(replacement),
    (e) => e.code === "unresolved_executor_execution",
  );
  m.apply(bound("e2"));
  m.apply(replacement);
  assert.equal(m.state.unitId, "u1");
  assert.equal(m.state.assignments.get("a1").state, "superseded");
  assert.equal(m.state.assignments.get("a1").contract, "fixture contract");
  assert.equal(m.state.assignmentId, "a2");
});
test("saved report revisions and retries preserve exact earlier events", () => {
  const m = started();
  m.apply(opened("e2", "executor", "a1"));
  const first = m.apply(returned());
  m.apply({ type: "handoff-state", handoffId: "return", state: "blocked", reason: "fixture gap" });
  m.apply({
    type: "handoff-retry-requested",
    handoffId: "return",
    attemptId: "retry",
    executionId: "e2",
    toolCallId: "retry-call",
    reportRevision: 1,
    selectionRevision: 0,
  });
  assert.equal(m.state.handoffs.get("return").text, "exact report");
  assert.equal(m.state.handoffs.get("return").reportRevision, 1);
  m.apply(returned("revised exact report", 2));
  assert.equal(m.state.handoffs.get("return").text, "revised exact report");
  assert.equal([...m.state.events.values()].find((e) => e.eventId === first.eventId).data.handoff.text, "exact report");
  assert.equal(m.state.assignments.size, 1);
});
test("recovery transitions preserve the original report and reject foreign identities", () => {
  const ready = () => {
    const m = started();
    m.apply(opened("e2", "executor", "a1"));
    m.apply(returned());
    m.apply(bound("e2"));
    m.apply({ type: "handoff-state", handoffId: "return", state: "configured", observedPair: pair });
    m.apply(opened("e3", "coordinator", "a1"));
    return m;
  };
  const foreign = ready();
  assert.throws(
    () => foreign.apply(recoveryRequest("foreign")),
    (error) => error.code === "recovery_not_available",
  );

  const m = ready();
  const base = structuredClone(m.state.handoffs.get("return"));
  const request = m.apply(recoveryRequest());
  m.set(request);
  assert.equal(m.state.recoveries.size, 1, "exact event replay is idempotent");
  m.apply(bound("e3"));
  m.apply({ type: "handoff-state", handoffId: "recovery-request", state: "configured", observedPair: pair });
  assert.equal(m.state.recoveries.get("recovery").state, "reading");
  m.apply(opened("e4", "executor", "a1"));
  m.apply(recoverySupplement());
  assert.equal(m.state.recoveries.get("recovery").state, "returning");
  assert.deepEqual(m.state.handoffs.get("return"), base, "the base report remains immutable");
  assert.throws(
    () => m.apply(recoverySupplement(3)),
    (error) => error.code === "invalid_report_revision",
  );
});

test("assessment cannot resume while attached recovery remains unsettled", () => {
  const m = recoveryReady();
  const before = m.state;
  assert.throws(
    () =>
      m.apply({
        type: "assessment-resumed",
        handoffId: "return",
        basisUserEntryId: "new-user",
      }),
    (error) => error.code === "recovery_outstanding",
  );
  assert.equal(m.state, before);
  assert.equal(m.state.assessment.view, "suspended");
  assert.equal(m.state.recoveryId, "recovery");
});

for (const outcome of ["cancelled", "deferred"]) {
  test(`${outcome} unit closure atomically disposes attached recovery`, () => {
    const m = recoveryReady();
    m.apply({ type: "unit-closed", unitId: "u1", outcome, assessment: `${outcome} with recovery` });
    assert.equal(m.state.unitId, undefined);
    assert.equal(m.state.assignmentId, undefined);
    assert.equal(m.state.pendingId, undefined);
    assert.equal(m.state.recoveryId, undefined);
    assert.equal(m.state.recoveries.get("recovery").state, "cancelled");
    assert.equal(m.state.recoveries.get("recovery").cancellationReason, `${outcome} with recovery`);
    assert.equal(m.state.handoffs.get("recovery-request").state, "superseded");
    assert.equal(m.state.handoffs.get("return").text, "exact report");
    m.apply(opened(`e-${outcome}`, "coordinator"));
    m.apply(delegated(`a-${outcome}`, `u-${outcome}`, [`a-${outcome}`], `e-${outcome}`));
    assert.equal(m.state.unitId, `u-${outcome}`);
  });
}

test("accepted unit closure rejects attached recovery without changing state", () => {
  const m = recoveryReady();
  const before = m.state;
  assert.throws(
    () => m.apply({ type: "unit-closed", unitId: "u1", outcome: "accepted", assessment: "incorrect" }),
    (error) => error.code === "unfinished_work",
  );
  assert.equal(m.state, before);
  assert.equal(m.state.recoveryId, "recovery");
});

test("assessment resumption rejects stale selection and preserves suspension on failure", () => {
  const m = started();
  m.apply(opened("e2", "executor", "a1"));
  m.apply(returned());
  m.apply({
    type: "selection-changed",
    assignmentId: "a1",
    selection: { revision: 1, selected: [], unresolved: [], withdrawals: [] },
  });
  m.apply({ type: "handoff-state", handoffId: "return", state: "configured", observedPair: pair });
  m.apply({
    type: "assessment-suspended",
    handoffId: "return",
    reason: "user-attention",
    basisUserEntryId: "new-user",
    problems: [],
  });
  assert.throws(
    () =>
      m.apply({
        type: "assessment-resumed",
        handoffId: "return",
        basisUserEntryId: "new-user",
        reservation: reservation(0),
      }),
    (e) => e.code === "stale_selection",
  );
  assert.equal(m.state.assessment.view, "suspended");
  m.apply({
    type: "assessment-resumed",
    handoffId: "return",
    basisUserEntryId: "new-user",
    reservation: reservation(1),
  });
  assert.equal(m.state.assessment.view, "active");
});
test("accepted closure cannot conceal work; later work creates a new unit", () => {
  const m = started();
  m.apply(control("coordinator"));
  assert.throws(
    () => m.apply({ type: "unit-closed", unitId: "u1", outcome: "accepted", assessment: "incorrect" }),
    (e) => e.code === "unfinished_work",
  );
  m.apply({
    type: "unit-closed",
    unitId: "u1",
    outcome: "cancelled",
    assessment: "user stopped work",
    supersededAssignmentId: "a1",
  });
  assert.equal(m.state.units.get("u1").state, "closed");
  m.apply(opened("e3", "coordinator"));
  assert.throws(
    () => m.apply(delegated("a2", "u1", ["a2"], "e3")),
    (e) => e.code === "closed_unit_reused",
  );
  m.apply(delegated("a2", "u2", ["a2"], "e3"));
  assert.equal(m.state.unitId, "u2");
  assert.equal(m.state.units.size, 2);
});
test("profile override events are complete-pair, branch-replayable session state", () => {
  const m = machine();
  const coordinator = { provider: "fixture", modelId: "coordinator-fast", thinking: "high" };
  const executor = { provider: "fixture", modelId: "executor-cheap", thinking: "low" };
  m.apply({
    type: "profile-overrides",
    overrides: { coordinator },
    reason: "fixture session override",
  });
  assert.deepEqual(m.state.profileOverrides.get("coordinator"), coordinator);
  assert.equal(m.state.profileOverrides.has("executor"), false);
  m.apply({
    type: "profile-overrides",
    overrides: { executor },
    reason: "fixture session override",
  });
  assert.deepEqual(m.state.profileOverrides.get("executor"), executor);
  m.apply({
    type: "profile-overrides",
    overrides: { coordinator: null, executor: null },
    reason: "fixture reset",
  });
  assert.equal(m.state.profileOverrides.size, 0);
  assert.throws(
    () =>
      parseRoutingEvent(
        m.event({
          type: "profile-overrides",
          overrides: { coordinator: { provider: "fixture", modelId: "bad", thinking: "unknown" } },
          reason: "invalid",
        }),
      ),
    (e) => e.code === "invalid_profile_overrides",
  );
});
