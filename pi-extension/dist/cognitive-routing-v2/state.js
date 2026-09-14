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
const shape = (x, keys) => isObject(x) && Object.keys(x).every((k) => keys.includes(k));
const uniqueStrings = (x) => Array.isArray(x) && x.every(identity) && new Set(x).size === x.length;
const pair = (x) =>
  shape(x, ["provider", "modelId", "thinking"]) &&
  identity(x.provider) &&
  identity(x.modelId) &&
  EFFORTS.includes(x.thinking);
const profileOverrides = (x) =>
  isObject(x) &&
  Object.keys(x).length > 0 &&
  Object.keys(x).every((key) => PROFILES.includes(key)) &&
  Object.values(x).every((value) => value === null || pair(value));
const problemList = (xs) =>
  Array.isArray(xs) &&
  xs.every(
    (x) =>
      shape(x, ["ref", "code", "detail"]) && typeof x.ref === "string" && text(x.code, 256) && text(x.detail, 4096),
  );
const reservation = (r) =>
  shape(r, [
    "id",
    "selectionRevision",
    "receiver",
    "target",
    "qualification",
    "sources",
    "maximumInputTokens",
    "outputReserve",
    "estimateMethod",
  ]) &&
  identity(r.id) &&
  Number.isSafeInteger(r.selectionRevision) &&
  r.selectionRevision >= 0 &&
  PROFILES.includes(r.receiver) &&
  pair(r.target) &&
  text(r.qualification) &&
  Array.isArray(r.sources) &&
  r.sources.every((s) => shape(s, ["ref", "bodyHash"]) && identity(s.ref) && /^[a-f0-9]{64}$/.test(s.bodyHash)) &&
  new Set(r.sources.map((s) => s.ref)).size === r.sources.length &&
  Number.isFinite(r.maximumInputTokens) &&
  r.maximumInputTokens > 0 &&
  Number.isFinite(r.outputReserve) &&
  r.outputReserve >= 0 &&
  text(r.estimateMethod);
const recovery = (r) =>
  shape(r, [
    "id",
    "assignmentId",
    "assessmentHandoffId",
    "baseReportRevision",
    "request",
    "requestedPaths",
    "paths",
    "state",
    "requestHandoffId",
    "supplementHandoffId",
    "supplementRevision",
    "cancellationReason",
  ]) &&
  identity(r.id) &&
  identity(r.assignmentId) &&
  identity(r.assessmentHandoffId) &&
  Number.isSafeInteger(r.baseReportRevision) &&
  r.baseReportRevision > 0 &&
  text(r.request) &&
  Array.isArray(r.requestedPaths) &&
  r.requestedPaths.length <= 32 &&
  r.requestedPaths.every((path) => text(path, 4096)) &&
  new Set(r.requestedPaths).size === r.requestedPaths.length &&
  Array.isArray(r.paths) &&
  r.paths.length <= 32 &&
  r.paths.every((path) => text(path, 4096)) &&
  new Set(r.paths).size === r.paths.length &&
  ["requested", "reading", "returning", "completed", "cancelled"].includes(r.state) &&
  identity(r.requestHandoffId) &&
  (r.supplementHandoffId === undefined || identity(r.supplementHandoffId)) &&
  Number.isSafeInteger(r.supplementRevision) &&
  r.supplementRevision >= 0 &&
  (r.cancellationReason === undefined || text(r.cancellationReason, 2048));
const handoff = (h) =>
  shape(h, [
    "id",
    "kind",
    "assignmentId",
    "text",
    "from",
    "to",
    "executionId",
    "toolCallId",
    "basisUserEntryId",
    "state",
    "reportRevision",
    "outcome",
    "limitations",
    "reason",
  ]) &&
  identity(h.id) &&
  identity(h.assignmentId) &&
  text(h.text) &&
  identity(h.executionId) &&
  identity(h.toolCallId) &&
  nullableId(h.basisUserEntryId) &&
  ["delegate", "return", "recovery-request", "recovery-return"].includes(h.kind) &&
  PROFILES.includes(h.from) &&
  PROFILES.includes(h.to) &&
  h.from !== h.to &&
  ["pending", "configured", "blocked", "superseded"].includes(h.state) &&
  Number.isSafeInteger(h.reportRevision) &&
  h.reportRevision >= 0 &&
  Array.isArray(h.limitations) &&
  h.limitations.length <= 32 &&
  h.limitations.every((x) => text(x, 2048)) &&
  (h.reason === undefined || text(h.reason, 4096)) &&
  (h.outcome === undefined || ["completed", "partial", "blocked"].includes(h.outcome)) &&
  (["delegate", "recovery-request"].includes(h.kind)
    ? h.outcome === undefined && h.reportRevision === 0
    : ["completed", "partial", "blocked"].includes(h.outcome) && h.reportRevision > 0);
const fields = {
  "execution-interrupted": ["executionId", "reason"],
  "assignment-resumed": ["assignmentId", "basisUserEntryId"],
  control: ["control", "profile", "reason"],
  "profile-overrides": ["overrides", "reason"],
  "execution-opened": ["execution"],
  "execution-bound": ["executionId", "assistantEntryId", "resultEntryIds", "outcome"],
  "delegate-accepted": ["unit", "assignment", "handoff", "replacement"],
  "return-accepted": ["handoff"],
  "recovery-request-accepted": ["recovery", "handoff"],
  "recovery-supplement-accepted": ["recoveryId", "handoff"],
  "recovery-cancelled": ["recoveryId", "reason"],
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
    case "execution-interrupted":
      check(identity(d.executionId) && text(d.reason, 4096), "invalid_interruption");
      break;
    case "assignment-resumed":
      check(identity(d.assignmentId) && nullableId(d.basisUserEntryId), "invalid_resume");
      break;
    case "control":
      check(
        ["automatic", "manual", "inactive"].includes(d.control) &&
          text(d.reason, 4096) &&
          (d.profile === undefined || PROFILES.includes(d.profile)) &&
          (d.control === "inactive" || PROFILES.includes(d.profile)),
        "invalid_control",
      );
      break;
    case "profile-overrides":
      check(profileOverrides(d.overrides) && text(d.reason, 4096), "invalid_profile_overrides");
      break;
    case "execution-opened": {
      const e = d.execution;
      check(
        shape(e, ["id", "profile", "assignmentId", "recoveryId", "basisUserEntryId", "pair", "resultEntryIds"]) &&
          identity(e.id) &&
          ["solo", ...PROFILES].includes(e.profile) &&
          nullableId(e.basisUserEntryId) &&
          pair(e.pair) &&
          uniqueStrings(e.resultEntryIds) &&
          e.resultEntryIds.length === 0 &&
          (e.assignmentId === undefined || identity(e.assignmentId)) &&
          (e.recoveryId === undefined || identity(e.recoveryId)),
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
        shape(u, ["id", "objective", "state", "assignmentIds"]) &&
          identity(u.id) &&
          text(u.objective) &&
          u.state === "open" &&
          uniqueStrings(u.assignmentIds),
        "invalid_unit",
      );
      check(
        shape(a, ["id", "unitId", "contract", "basisUserEntryId", "state", "delegateHandoffId"]) &&
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
          (shape(r, ["assignmentId", "supersededHandoffId", "reason"]) &&
            identity(r.assignmentId) &&
            text(r.reason, 2048) &&
            (r.supersededHandoffId === undefined || identity(r.supersededHandoffId))),
        "invalid_replacement",
      );
      break;
    }
    case "return-accepted":
      check(handoff(d.handoff) && d.handoff.kind === "return", "invalid_return");
      break;
    case "recovery-request-accepted":
      check(
        recovery(d.recovery) &&
          handoff(d.handoff) &&
          d.handoff.kind === "recovery-request" &&
          d.recovery.requestHandoffId === d.handoff.id &&
          d.recovery.assignmentId === d.handoff.assignmentId &&
          d.recovery.request === d.handoff.text,
        "invalid_recovery_request",
      );
      break;
    case "recovery-supplement-accepted":
      check(
        identity(d.recoveryId) && handoff(d.handoff) && d.handoff.kind === "recovery-return",
        "invalid_recovery_supplement",
      );
      break;
    case "recovery-cancelled":
      check(identity(d.recoveryId) && text(d.reason, 2048), "invalid_recovery_cancellation");
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
          shape(s, ["revision", "selected", "unresolved", "withdrawals"]) &&
          Number.isSafeInteger(s.revision) &&
          s.revision > 0 &&
          uniqueStrings(s.selected) &&
          problemList(s.unresolved) &&
          Array.isArray(s.withdrawals) &&
          s.withdrawals.every((w) => shape(w, ["ref", "reason"]) && identity(w.ref) && text(w.reason, 2048)),
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
      check(
        nullableId(d.basisUserEntryId) && (d.reservation === undefined || reservation(d.reservation)),
        "invalid_resumption",
      );
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
          d.sources.every((s) => shape(s, ["ref", "bodyHash"]) && identity(s.ref) && /^[a-f0-9]{64}$/.test(s.bodyHash)),
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
    recoveries: new Map(),
    executions: new Map(),
    selections: new Map(),
    reservations: new Map(),
    attempts: new Map(),
    exposure: new Map(),
    authors: new Map(),
    resumeBasis: new Map(),
    profileOverrides: new Map(),
    events: new Map(),
    eventIds: new Map(),
  };
}
function applyEvent(state, event, owned = false) {
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
  const s = owned
      ? state
      : {
          ...state,
          units: new Map([...state.units].map(([k, v]) => [k, { ...v }])),
          assignments: new Map([...state.assignments].map(([k, v]) => [k, { ...v }])),
          handoffs: new Map([...state.handoffs].map(([k, v]) => [k, { ...v }])),
          recoveries: new Map([...state.recoveries].map(([k, v]) => [k, { ...v, paths: [...v.paths] }])),
          executions: new Map([...state.executions].map(([k, v]) => [k, { ...v }])),
          selections: new Map(state.selections),
          reservations: new Map(state.reservations),
          attempts: new Map(state.attempts),
          exposure: new Map(state.exposure),
          authors: new Map(state.authors),
          resumeBasis: new Map(state.resumeBasis),
          profileOverrides: new Map(state.profileOverrides),
          events: new Map(state.events),
          eventIds: new Map(state.eventIds),
          assessment: state.assessment ? { ...state.assessment } : undefined,
        },
    d = e.data;
  const assignment = () => (s.assignmentId ? s.assignments.get(s.assignmentId) : undefined);
  const pending = () => (s.pendingId ? s.handoffs.get(s.pendingId) : undefined);
  const isPending = () => pending() && ["pending", "blocked"].includes(pending().state);
  const currentReturn = (id) => {
    const h = s.handoffs.get(id);
    check(
      h && ["return", "recovery-return"].includes(h.kind) && h.assignmentId === s.assignmentId,
      "not_current_return",
    );
    return h;
  };
  switch (d.type) {
    case "execution-interrupted": {
      const x = s.executions.get(d.executionId);
      check(x && !x.assistantEntryId, "execution_not_unbound");
      x.interrupted = d.reason;
      break;
    }
    case "assignment-resumed": {
      const a = assignment();
      check(
        s.control === "automatic" && a?.id === d.assignmentId && a.state === "outstanding" && !isPending(),
        "assignment_not_resumable",
      );
      s.resumeBasis.set(a.id, d.basisUserEntryId);
      break;
    }
    case "control":
      s.control = d.control;
      s.profile = d.profile;
      break;
    case "profile-overrides":
      for (const profile of PROFILES) {
        if (!Object.hasOwn(d.overrides, profile)) continue;
        const override = d.overrides[profile];
        if (override === null) s.profileOverrides.delete(profile);
        else s.profileOverrides.set(profile, override);
      }
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
            (x) => x.assignmentId === a.id && x.profile === "executor" && !x.assistantEntryId && !x.interrupted,
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
    case "recovery-request-accepted": {
      const a = assignment(),
        base = s.handoffs.get(d.recovery.assessmentHandoffId),
        h = d.handoff;
      check(
        s.control === "automatic" &&
          s.profile === "coordinator" &&
          a?.state === "returned" &&
          d.recovery.assignmentId === a.id &&
          d.recovery.state === "requested" &&
          d.recovery.supplementRevision === 0 &&
          d.recovery.supplementHandoffId === undefined &&
          d.recovery.cancellationReason === undefined &&
          s.assessment?.handoffId === base?.id &&
          base?.kind === "return" &&
          a.returnHandoffId === base.id &&
          base.state === "configured" &&
          base.reportRevision === d.recovery.baseReportRevision &&
          !s.recoveryId &&
          !isPending() &&
          h.kind === "recovery-request" &&
          h.assignmentId === a.id &&
          h.from === "coordinator" &&
          h.to === "executor" &&
          h.state === "pending" &&
          !s.handoffs.has(h.id) &&
          !s.recoveries.has(d.recovery.id),
        "recovery_not_available",
      );
      s.recoveries.set(d.recovery.id, d.recovery);
      s.recoveryId = d.recovery.id;
      s.handoffs.set(h.id, h);
      s.pendingId = h.id;
      s.assessment.view = "suspended";
      s.assessment.suspensionReason = "recovery";
      s.assessment.basisUserEntryId = h.basisUserEntryId;
      s.assessment.problems = [];
      break;
    }
    case "recovery-supplement-accepted": {
      const a = assignment(),
        r = s.recoveries.get(d.recoveryId),
        h = d.handoff,
        previous = r?.supplementHandoffId ? s.handoffs.get(r.supplementHandoffId) : undefined;
      check(
        s.control === "automatic" &&
          s.profile === "executor" &&
          a?.state === "returned" &&
          r?.id === s.recoveryId &&
          r.assignmentId === a.id &&
          s.assessment?.handoffId === r.assessmentHandoffId &&
          s.handoffs.get(r.assessmentHandoffId)?.reportRevision === r.baseReportRevision &&
          ["reading", "returning"].includes(r.state) &&
          h.kind === "recovery-return" &&
          h.assignmentId === a.id &&
          h.from === "executor" &&
          h.to === "coordinator" &&
          h.state === "pending" &&
          (!previous ? !s.handoffs.has(h.id) : ["pending", "blocked"].includes(previous.state) && previous.id === h.id),
        "recovery_not_returnable",
      );
      const expectedRevision = (previous?.reportRevision ?? 0) + 1;
      check(h.reportRevision === expectedRevision, "invalid_report_revision");
      r.state = "returning";
      r.supplementHandoffId = h.id;
      r.supplementRevision = h.reportRevision;
      s.handoffs.set(h.id, h);
      s.pendingId = h.id;
      break;
    }
    case "recovery-cancelled": {
      const r = s.recoveries.get(d.recoveryId);
      check(
        s.control === "automatic" &&
          s.profile === "coordinator" &&
          r?.id === s.recoveryId &&
          ["requested", "reading", "returning"].includes(r.state),
        "recovery_not_cancellable",
      );
      const p = pending();
      if (p) {
        check([r.requestHandoffId, r.supplementHandoffId].includes(p.id), "handoff_pending");
        p.state = "superseded";
        s.pendingId = undefined;
      }
      r.state = "cancelled";
      r.cancellationReason = d.reason;
      s.recoveryId = undefined;
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
      if (h.kind === "recovery-return") {
        const recovery = [...s.recoveries.values()].find((candidate) => candidate.supplementHandoffId === h.id);
        if (recovery && s.assessment?.handoffId === recovery.assessmentHandoffId)
          s.assessment.reservation = d.reservation;
      }
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
        const r = s.recoveryId ? s.recoveries.get(s.recoveryId) : undefined;
        if (r && h.id === r.requestHandoffId) r.state = "reading";
        if (r && h.id === r.supplementHandoffId) {
          r.state = "completed";
          s.recoveryId = undefined;
        }
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
          (a.state === "outstanding" ||
            (a.state === "returned" &&
              (isPending() || (s.recoveryId !== undefined && s.recoveries.get(s.recoveryId)?.state === "reading")))),
        "selection_wrong_phase",
      );
      check(d.selection.revision === (s.selections.get(a.id)?.revision ?? 0) + 1, "selection_revision");
      s.selections.set(a.id, d.selection);
      break;
    }
    case "assessment-suspended": {
      check(s.assessment?.handoffId === d.handoffId, "assessment_missing");
      s.assessment.view = "suspended";
      s.assessment.suspensionReason = d.reason;
      s.assessment.basisUserEntryId = d.basisUserEntryId;
      s.assessment.problems = d.problems;
      break;
    }
    case "assessment-resumed": {
      check(
        s.control === "automatic" &&
          s.profile === "coordinator" &&
          !s.recoveryId &&
          s.assessment?.handoffId === d.handoffId &&
          s.assessment.view === "suspended",
        s.recoveryId ? "recovery_outstanding" : "assessment_not_suspended",
      );
      if (d.reservation)
        check(
          d.reservation.selectionRevision === (s.selections.get(s.assessment.assignmentId)?.revision ?? 0),
          "stale_selection",
        );
      s.assessment.view = "active";
      s.assessment.suspensionReason = undefined;
      s.assessment.basisUserEntryId = d.basisUserEntryId;
      if (d.reservation) {
        s.assessment.reservation = d.reservation;
        s.reservations.set(d.handoffId, d.reservation);
      }
      s.assessment.problems = [];
      break;
    }
    case "unit-closed": {
      const u = s.units.get(d.unitId),
        a = assignment();
      check(
        s.control === "automatic" && s.profile === "coordinator" && u?.id === s.unitId && u.state === "open",
        "unit_not_open",
      );
      if (d.outcome === "accepted")
        check(a?.state !== "outstanding" && !isPending() && !s.recoveryId, "unfinished_work");
      const recovery = s.recoveryId ? s.recoveries.get(s.recoveryId) : undefined;
      if (recovery) {
        check(
          d.outcome !== "accepted" && ["requested", "reading", "returning"].includes(recovery.state),
          "unfinished_work",
        );
        const transfer = pending();
        if (transfer) {
          check([recovery.requestHandoffId, recovery.supplementHandoffId].includes(transfer.id), "handoff_pending");
          transfer.state = "superseded";
          s.pendingId = undefined;
        }
        recovery.state = "cancelled";
        recovery.cancellationReason = d.assessment;
        s.recoveryId = undefined;
      }
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
export function reduce(state, event) {
  return applyEvent(state, event);
}
export function replay(entries) {
  let state = initialState();
  for (const entry of entries)
    if (entry.type === "custom" && entry.customType === ROUTING_ENTRY)
      state = applyEvent(state, parseRoutingEvent(entry.data), true);
  return state;
}
