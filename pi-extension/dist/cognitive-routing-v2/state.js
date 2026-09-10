import {
  EFFORTS,
  PROFILES,
  ROUTING_ENTRY,
  canonical,
  eventKey,
  eventValue,
  isObject,
  requireCondition as check,
} from "./types.js";
const text = (x, max = 32768) => typeof x === "string" && x.trim().length > 0 && x.length <= max;
const identity = (x) => text(x, 512);
const nullableId = (x) => x === null || identity(x);
const uniqueStrings = (x) => Array.isArray(x) && x.every(identity) && new Set(x).size === x.length;
const pair = (x) => isObject(x) && identity(x.provider) && identity(x.modelId) && EFFORTS.includes(x.thinking);
const problemList = (xs) =>
  Array.isArray(xs) &&
  xs.every((x) => isObject(x) && typeof x.ref === "string" && text(x.code, 256) && text(x.detail, 4096));
const reservation = (r) =>
  isObject(r) &&
  identity(r.id) &&
  Number.isSafeInteger(r.selectionRevision) &&
  r.selectionRevision >= 0 &&
  PROFILES.includes(r.receiver) &&
  pair(r.target) &&
  text(r.qualification) &&
  Array.isArray(r.sources) &&
  r.sources.every((s) => identity(s.ref) && /^[a-f0-9]{64}$/.test(s.bodyHash)) &&
  Number.isFinite(r.maximumInputTokens) &&
  r.maximumInputTokens > 0 &&
  Number.isFinite(r.outputReserve) &&
  r.outputReserve >= 0 &&
  text(r.estimateMethod);
const handoff = (h) =>
  isObject(h) &&
  identity(h.id) &&
  identity(h.assignmentId) &&
  text(h.text) &&
  identity(h.executionId) &&
  identity(h.toolCallId) &&
  nullableId(h.basisUserEntryId) &&
  ["delegate", "return"].includes(h.kind) &&
  PROFILES.includes(h.from) &&
  PROFILES.includes(h.to) &&
  h.from !== h.to &&
  ["pending", "configured", "blocked", "superseded"].includes(h.state) &&
  Number.isSafeInteger(h.reportRevision) &&
  h.reportRevision >= 0 &&
  Array.isArray(h.limitations) &&
  h.limitations.length <= 32 &&
  h.limitations.every((x) => text(x, 2048));
const fields = {
  control: ["control", "profile", "reason"],
  "execution-opened": ["execution"],
  "execution-bound": ["executionId", "assistantEntryId", "resultEntryIds", "outcome"],
  "delegate-accepted": ["unit", "assignment", "handoff", "replacement"],
  "return-accepted": ["handoff"],
  "handoff-retry-requested": [
    "handoffId",
    "attemptId",
    "executionId",
    "toolCallId",
    "reportRevision",
    "selectionRevision",
  ],
  "handoff-prepared": ["handoffId", "reservation"],
  "handoff-state": ["handoffId", "state", "reason", "observedPair"],
  "selection-changed": ["assignmentId", "selection"],
  "assessment-suspended": ["handoffId", "reason", "basisUserEntryId", "problems"],
  "assessment-resumed": ["handoffId", "basisUserEntryId", "reservation"],
  "unit-closed": ["unitId", "outcome", "assessment", "supersededAssignmentId"],
  "sources-exposed": ["executionId", "view", "sources"],
  "request-observed": ["executionId", "profile", "boundary", "manifestHash", "handoffId", "selectionRevision"],
};
export function parseRoutingEvent(raw) {
  check(
    isObject(raw) &&
      raw.version === 2 &&
      identity(raw.eventId) &&
      identity(raw.operationId) &&
      identity(raw.stepId) &&
      identity(raw.recordedSessionId) &&
      isObject(raw.data),
    "invalid_event",
  );
  check(
    Object.keys(raw).every((k) =>
      ["version", "eventId", "operationId", "stepId", "recordedSessionId", "data"].includes(k),
    ),
    "invalid_event_field",
  );
  const d = raw.data;
  check(
    typeof d.type === "string" &&
      Object.hasOwn(fields, d.type) &&
      Object.keys(d).every((k) => k === "type" || fields[d.type].includes(k)),
    "invalid_event_type",
  );
  check(Buffer.byteLength(JSON.stringify(raw)) <= 512 * 1024, "event_too_large");
  if (d.handoffId !== undefined) check(identity(d.handoffId), "invalid_handoff_id");
  switch (d.type) {
    case "control":
      check(
        ["automatic", "manual", "inactive"].includes(d.control) &&
          text(d.reason, 4096) &&
          (d.profile === undefined || PROFILES.includes(d.profile)) &&
          (d.control === "inactive" || PROFILES.includes(d.profile)),
        "invalid_control",
      );
      break;
    case "execution-opened": {
      const e = d.execution;
      check(
        isObject(e) &&
          identity(e.id) &&
          ["solo", ...PROFILES].includes(e.profile) &&
          nullableId(e.basisUserEntryId) &&
          pair(e.pair) &&
          uniqueStrings(e.resultEntryIds) &&
          e.resultEntryIds.length === 0 &&
          (e.assignmentId === undefined || identity(e.assignmentId)),
        "invalid_execution",
      );
      break;
    }
    case "execution-bound":
      check(
        identity(d.executionId) &&
          identity(d.assistantEntryId) &&
          uniqueStrings(d.resultEntryIds) &&
          ["completed", "failed", "aborted"].includes(d.outcome),
        "invalid_binding",
      );
      break;
    case "delegate-accepted": {
      const u = d.unit,
        a = d.assignment,
        r = d.replacement;
      check(
        isObject(u) && identity(u.id) && text(u.objective) && u.state === "open" && uniqueStrings(u.assignmentIds),
        "invalid_unit",
      );
      check(
        isObject(a) &&
          identity(a.id) &&
          identity(a.unitId) &&
          text(a.contract) &&
          nullableId(a.basisUserEntryId) &&
          a.state === "outstanding" &&
          identity(a.delegateHandoffId) &&
          handoff(d.handoff),
        "invalid_assignment",
      );
      check(
        r === undefined ||
          (isObject(r) &&
            identity(r.assignmentId) &&
            text(r.reason, 2048) &&
            (r.supersededHandoffId === undefined || identity(r.supersededHandoffId))),
        "invalid_replacement",
      );
      break;
    }
    case "return-accepted":
      check(
        handoff(d.handoff) &&
          ["completed", "partial", "blocked"].includes(d.handoff.outcome) &&
          d.handoff.reportRevision > 0,
        "invalid_return",
      );
      break;
    case "handoff-retry-requested":
      check(
        identity(d.attemptId) &&
          identity(d.executionId) &&
          identity(d.toolCallId) &&
          Number.isSafeInteger(d.reportRevision) &&
          d.reportRevision > 0 &&
          Number.isSafeInteger(d.selectionRevision) &&
          d.selectionRevision >= 0,
        "invalid_retry",
      );
      break;
    case "handoff-prepared":
      check(reservation(d.reservation), "invalid_reservation");
      break;
    case "handoff-state":
      check(
        ["configured", "blocked", "superseded"].includes(d.state) &&
          (d.reason === undefined || text(d.reason, 4096)) &&
          (d.observedPair === undefined || pair(d.observedPair)),
        "invalid_delivery",
      );
      break;
    case "selection-changed": {
      const s = d.selection;
      check(
        identity(d.assignmentId) &&
          isObject(s) &&
          Number.isSafeInteger(s.revision) &&
          s.revision > 0 &&
          uniqueStrings(s.selected) &&
          problemList(s.unresolved) &&
          Array.isArray(s.withdrawals) &&
          s.withdrawals.every((w) => identity(w.ref) && text(w.reason, 2048)),
        "invalid_selection",
      );
      break;
    }
    case "assessment-suspended":
      check(
        ["user-attention", "delivery-gap"].includes(d.reason) &&
          nullableId(d.basisUserEntryId) &&
          problemList(d.problems),
        "invalid_suspension",
      );
      break;
    case "assessment-resumed":
      check(nullableId(d.basisUserEntryId) && reservation(d.reservation), "invalid_resumption");
      break;
    case "unit-closed":
      check(
        identity(d.unitId) &&
          ["accepted", "cancelled", "deferred"].includes(d.outcome) &&
          text(d.assessment) &&
          (d.supersededAssignmentId === undefined || identity(d.supersededAssignmentId)),
        "invalid_closure",
      );
      break;
    case "request-observed":
      check(
        identity(d.executionId) &&
          ["solo", ...PROFILES].includes(d.profile) &&
          ["assembled", "payload-hook"].includes(d.boundary) &&
          /^[a-f0-9]{64}$/.test(d.manifestHash) &&
          (d.selectionRevision === undefined ||
            (Number.isSafeInteger(d.selectionRevision) && d.selectionRevision >= 0)),
        "invalid_request_observation",
      );
      break;
    case "sources-exposed":
      check(
        identity(d.executionId) &&
          ["solo", ...PROFILES].includes(d.view) &&
          Array.isArray(d.sources) &&
          d.sources.every((s) => identity(s.ref) && /^[a-f0-9]{64}$/.test(s.bodyHash)),
        "invalid_exposure",
      );
      break;
  }
  return structuredClone(raw);
}
export function initialState() {
  return {
    control: "inactive",
    units: new Map(),
    assignments: new Map(),
    handoffs: new Map(),
    executions: new Map(),
    selections: new Map(),
    reservations: new Map(),
    attempts: new Map(),
    exposure: new Map(),
    authors: new Map(),
    events: new Map(),
    eventIds: new Map(),
  };
}
export function reduce(state, event) {
  const e = parseRoutingEvent(event),
    key = eventKey(e),
    value = eventValue(e);
  const previous = state.events.get(key),
    priorId = state.eventIds.get(e.eventId);
  check(!priorId || priorId === value, "event_identity_conflict");
  if (previous) {
    check(eventValue(previous) === value, "operation_conflict");
    return state;
  }
  const s = structuredClone(state),
    d = e.data;
  const assignment = () => (s.assignmentId ? s.assignments.get(s.assignmentId) : undefined);
  const pending = () => (s.pendingId ? s.handoffs.get(s.pendingId) : undefined);
  const isPending = () => pending() && ["pending", "blocked"].includes(pending().state);
  const currentReturn = (id) => {
    const h = s.handoffs.get(id);
    check(h && h.kind === "return" && h.assignmentId === s.assignmentId, "not_current_return");
    return h;
  };
  switch (d.type) {
    case "control":
      s.control = d.control;
      s.profile = d.profile;
      break;
    case "execution-opened":
      check(!s.executions.has(d.execution.id), "duplicate_execution");
      s.executions.set(d.execution.id, d.execution);
      break;
    case "execution-bound": {
      const x = s.executions.get(d.executionId);
      check(x, "execution_missing");
      if (x.assistantEntryId)
        check(
          x.assistantEntryId === d.assistantEntryId &&
            canonical(x.resultEntryIds) === canonical(d.resultEntryIds) &&
            x.outcome === d.outcome,
          "binding_conflict",
        );
      x.assistantEntryId = d.assistantEntryId;
      x.resultEntryIds = d.resultEntryIds;
      x.outcome = d.outcome;
      for (const id of [d.assistantEntryId, ...d.resultEntryIds]) {
        const prev = s.authors.get(id);
        check(!prev || prev.executionId === x.id, "source_authorship_conflict");
        s.authors.set(id, { profile: x.profile, executionId: x.id, assignmentId: x.assignmentId });
      }
      break;
    }
    case "delegate-accepted": {
      check(s.control === "automatic" && s.profile === "coordinator", "wrong_control");
      const a = assignment(),
        h = d.handoff,
        u = s.unitId ? s.units.get(s.unitId) : undefined;
      check(!s.assignments.has(d.assignment.id) && !s.handoffs.has(h.id), "reused_work_identity");
      check(
        h.kind === "delegate" &&
          h.from === "coordinator" &&
          h.to === "executor" &&
          h.state === "pending" &&
          h.text === d.assignment.contract &&
          h.assignmentId === d.assignment.id &&
          d.assignment.delegateHandoffId === h.id &&
          d.assignment.unitId === d.unit.id,
        "delegate_identity_mismatch",
      );
      if (u) check(u.state === "open" && u.id === d.unit.id && u.objective === d.unit.objective, "unit_conflict");
      else check(!s.units.has(d.unit.id), "closed_unit_reused");
      check(
        canonical(d.unit.assignmentIds) === canonical([...(u?.assignmentIds ?? []), d.assignment.id]),
        "assignment_order",
      );
      if (d.replacement) {
        check(a?.state === "outstanding" && a.id === d.replacement.assignmentId && u, "no_replaceable_assignment");
        check(
          ![...s.executions.values()].some(
            (x) => x.assignmentId === a.id && x.profile === "executor" && !x.assistantEntryId,
          ),
          "unresolved_executor_execution",
        );
        check(
          !isPending() || (pending().kind === "delegate" && d.replacement.supersededHandoffId === pending().id),
          "handoff_pending",
        );
        a.state = "superseded";
        s.handoffs.get(a.delegateHandoffId).state = "superseded";
      } else check(a?.state !== "outstanding" && !isPending(), "assignment_outstanding");
      s.units.set(d.unit.id, d.unit);
      s.unitId = d.unit.id;
      s.assignments.set(d.assignment.id, d.assignment);
      s.assignmentId = d.assignment.id;
      s.handoffs.set(h.id, h);
      s.pendingId = h.id;
      s.assessment = undefined;
      break;
    }
    case "return-accepted": {
      check(s.control === "automatic" && s.profile === "executor", "wrong_control");
      const a = assignment(),
        h = d.handoff;
      check(
        a &&
          h.assignmentId === a.id &&
          h.kind === "return" &&
          h.from === "executor" &&
          h.to === "coordinator" &&
          h.state === "pending",
        "return_identity_mismatch",
      );
      const previousReturn = a.returnHandoffId ? s.handoffs.get(a.returnHandoffId) : undefined;
      if (a.state === "outstanding")
        check(!isPending() && !s.handoffs.has(h.id) && h.reportRevision === 1, "handoff_pending");
      else
        check(
          a.state === "returned" &&
            previousReturn &&
            previousReturn.id === h.id &&
            ["pending", "blocked"].includes(previousReturn.state) &&
            h.reportRevision === previousReturn.reportRevision + 1,
          "invalid_report_revision",
        );
      a.state = "returned";
      a.returnHandoffId = h.id;
      s.handoffs.set(h.id, h);
      s.pendingId = h.id;
      s.assessment = {
        handoffId: h.id,
        assignmentId: a.id,
        view: "active",
        basisUserEntryId: h.basisUserEntryId,
        problems: [],
      };
      break;
    }
    case "handoff-retry-requested": {
      const h = currentReturn(d.handoffId);
      check(
        s.control === "automatic" &&
          s.profile === "executor" &&
          ["blocked", "pending"].includes(h.state) &&
          h.reportRevision === d.reportRevision &&
          (s.selections.get(h.assignmentId)?.revision ?? 0) === d.selectionRevision,
        "invalid_return_retry",
      );
      s.attempts.set(h.id, {
        executionId: d.executionId,
        reportRevision: d.reportRevision,
        selectionRevision: d.selectionRevision,
      });
      h.state = "pending";
      break;
    }
    case "handoff-prepared": {
      const h = currentReturn(d.handoffId);
      check(["pending", "blocked"].includes(h.state), "handoff_terminal");
      check(d.reservation.selectionRevision === (s.selections.get(h.assignmentId)?.revision ?? 0), "stale_selection");
      s.reservations.set(h.id, d.reservation);
      if (s.assessment?.handoffId === h.id) s.assessment.reservation = d.reservation;
      break;
    }
    case "handoff-state": {
      const h = s.handoffs.get(d.handoffId);
      check(h && s.pendingId === h.id && ["pending", "blocked"].includes(h.state), "handoff_terminal");
      h.state = d.state;
      h.reason = d.reason;
      if (d.state === "configured") {
        check(d.observedPair, "configuration_unobserved");
        s.profile = h.to;
        s.pendingId = undefined;
      }
      if (d.state === "superseded") s.pendingId = undefined;
      break;
    }
    case "selection-changed": {
      const a = assignment();
      check(
        a?.id === d.assignmentId &&
          s.control === "automatic" &&
          s.profile === "executor" &&
          (a.state === "outstanding" || (a.state === "returned" && isPending())),
        "selection_wrong_phase",
      );
      check(d.selection.revision === (s.selections.get(a.id)?.revision ?? 0) + 1, "selection_revision");
      s.selections.set(a.id, d.selection);
      break;
    }
    case "assessment-suspended": {
      check(s.assessment?.handoffId === d.handoffId, "assessment_missing");
      s.assessment.view = "suspended";
      s.assessment.basisUserEntryId = d.basisUserEntryId;
      s.assessment.problems = d.problems;
      break;
    }
    case "assessment-resumed": {
      check(
        s.control === "automatic" &&
          s.profile === "coordinator" &&
          s.assessment?.handoffId === d.handoffId &&
          s.assessment.view === "suspended",
        "assessment_not_suspended",
      );
      check(
        d.reservation.selectionRevision === (s.selections.get(s.assessment.assignmentId)?.revision ?? 0),
        "stale_selection",
      );
      s.assessment.view = "active";
      s.assessment.basisUserEntryId = d.basisUserEntryId;
      s.assessment.reservation = d.reservation;
      s.assessment.problems = [];
      s.reservations.set(d.handoffId, d.reservation);
      break;
    }
    case "unit-closed": {
      const u = s.units.get(d.unitId),
        a = assignment();
      check(
        s.control === "automatic" && s.profile === "coordinator" && u?.id === s.unitId && u.state === "open",
        "unit_not_open",
      );
      if (d.outcome === "accepted") check(a?.state !== "outstanding" && !isPending(), "unfinished_work");
      if (a?.state === "outstanding") {
        check(d.supersededAssignmentId === a.id && d.outcome !== "accepted", "supersession_required");
        a.state = "superseded";
      }
      if (pending()) pending().state = "superseded";
      u.state = "closed";
      u.disposition = d.outcome;
      u.assessment = d.assessment;
      s.unitId = undefined;
      s.assignmentId = undefined;
      s.pendingId = undefined;
      s.assessment = undefined;
      break;
    }
    case "request-observed": {
      const x = s.executions.get(d.executionId);
      check(x && x.profile === d.profile, "request_execution_missing");
      if (d.handoffId) check(s.handoffs.has(d.handoffId), "request_handoff_missing");
      break;
    }
    case "sources-exposed": {
      const x = s.executions.get(d.executionId);
      check(x && x.profile === d.view, "exposure_execution_missing");
      if (d.view === "executor") for (const source of d.sources) s.exposure.set(source.ref, source.bodyHash);
      break;
    }
  }
  s.events.set(key, e);
  s.eventIds.set(e.eventId, value);
  return s;
}
export function replay(entries) {
  let state = initialState();
  for (const entry of entries)
    if (entry.type === "custom" && entry.customType === ROUTING_ENTRY)
      state = reduce(state, parseRoutingEvent(entry.data));
  return state;
}
