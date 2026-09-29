import { EFFORTS, PROFILES, DELEGATION_MODES, isObject, requireCondition as check } from "./types.js";
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
const recovery = (r) => {
  const requestedResults = r?.requestedResults ?? [];
  const results = r?.results ?? [];
  return (
    shape(r, [
      "id",
      "assignmentId",
      "assessmentHandoffId",
      "baseReportRevision",
      "request",
      "requestedPaths",
      "paths",
      "requestedResults",
      "results",
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
    Array.isArray(requestedResults) &&
    requestedResults.length <= 32 &&
    requestedResults.every((id) => text(id, 256)) &&
    new Set(requestedResults).size === requestedResults.length &&
    Array.isArray(results) &&
    results.length <= 32 &&
    results.every(
      (grant) =>
        shape(grant, ["id", "sha256"]) &&
        text(grant.id, 256) &&
        typeof grant.sha256 === "string" &&
        /^[a-f0-9]{64}$/.test(grant.sha256),
    ) &&
    new Set(results.map((grant) => grant.id)).size === results.length &&
    ["requested", "reading", "returning", "completed", "cancelled"].includes(r.state) &&
    identity(r.requestHandoffId) &&
    (r.supplementHandoffId === undefined || identity(r.supplementHandoffId)) &&
    Number.isSafeInteger(r.supplementRevision) &&
    r.supplementRevision >= 0 &&
    (r.cancellationReason === undefined || text(r.cancellationReason, 2048))
  );
};
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
  "delegation-override": ["delegation", "reason"],
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
    case "delegation-override":
      check(
        (d.delegation === null || DELEGATION_MODES.includes(d.delegation)) && text(d.reason, 4096),
        "invalid_delegation_override",
      );
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
