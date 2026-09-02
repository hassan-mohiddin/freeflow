export const CHECKPOINT_TYPES = new Set(["Independent review", "Local commit", "User decision", "Continuity"]);
export const CHECKPOINT_RESULTS = new Set(["Completed", "Deferred", "Cancelled", "Replaced"]);
export const DECISION_OPERATIONS = new Set(["add", "update", "remove", "retire", "supersede"]);
export const PROPOSAL_OPERATIONS = new Set(["add", "update", "remove"]);
export const NOTE_OPERATIONS = new Set(["add", "update", "remove"]);
export const DECISION_CONTROLLED_FIELDS = new Set(["state", "supersedes", "supersededBy"]);

export const DECISION_ID_PATTERN = /^D-\d{3,}$/;
export const SLICE_ID_PATTERN = /^S-\d{3,}$/;
export const ENTITY_ID_SUFFIX_PATTERN = /^\d{3,}$/;
export const ENTITY_TITLE_PATTERN = /^(?<id>[A-Z]-\d{3,})\s+—\s+(?<title>.+)$/;

export const CONTEXT_PATCH_FIELDS = {
  goal: "string",
  whatDefinesTask: "string",
  settled: "string",
  tentative: "string",
  open: "string",
  currentDirection: "string",
  boundaries: "string",
};

export const WORK_PATCH_FIELDS = {
  route: "string",
  currentSlice: "forbidden",
  blockers: "array",
  upcomingCheckpoints: "array",
  nextAction: "string",
};

export const PRECISE_STRING_FIELDS = new Set([
  "title",
  "type",
  "intendedResult",
  "expectedEvidence",
  "authoritySource",
  "reasonAndScope",
  "stopCondition",
  "startingState",
  "resumeWhen",
  "result",
  "reviewSummary",
  "taskEffect",
  "goal",
  "whatDefinesTask",
  "settled",
  "tentative",
  "open",
  "currentDirection",
  "boundaries",
  "route",
  "nextAction",
  "decision",
  "establishedBy",
  "rationale",
  "consequences",
  "revisitWhen",
  "supersedes",
  "supersededBy",
  "source",
  "body",
  "selectedBy",
  "condition",
  "judgment",
  "evidence",
  "effect",
]);

export const PRECISE_LIST_FIELDS = new Set([
  "acceptedExtensions",
  "dependencies",
  "selectedCheckpoints",
  "blockerHistory",
  "pendingBoundaries",
  "pendingReviews",
  "reopenHistory",
  "evidence",
  "blockers",
  "upcomingCheckpoints",
]);

export const PRECISE_FORBIDDEN_FIELDS = new Set(["id", "state", "supersedes", "supersededBy", "currentSlice"]);

export const UPDATE_INPUT_KEYS = new Set([
  "edits",
  "currentContext",
  "currentWork",
  "currentSlice",
  "goal",
  "whatDefinesTask",
  "settled",
  "tentative",
  "open",
  "currentDirection",
  "boundaries",
  "route",
  "currentRoute",
  "nextAction",
  "nextUsefulAction",
  "blockers",
  "upcomingCheckpoints",
  "decision",
  "decisions",
  "proposal",
  "proposals",
  "note",
  "notes",
  "taskState",
  "taskStateAuthority",
  "authoritySource",
  "userDirection",
  "start",
  "close",
  "block",
  "resume",
  "expectedSha",
  "expectedSha256",
  "dryRun",
]);

export const EDIT_MODE_INPUT_KEYS = new Set([
  "edits",
  "taskState",
  "taskStateAuthority",
  "authoritySource",
  "userDirection",
  "expectedSha",
  "expectedSha256",
  "dryRun",
]);

export const SLICE_LIST_FIELDS = new Set([
  "acceptedExtensions",
  "dependencies",
  "selectedCheckpoints",
  "blockerHistory",
  "pendingBoundaries",
  "pendingReviews",
  "reopenHistory",
  "evidence",
]);

const COMMON_COMMAND_INPUT_KEYS = ["expectedSha", "expectedSha256", "dryRun"];
export const INIT_INPUT_KEYS = new Set([
  "taskName",
  "name",
  "displayName",
  "shortName",
  "slug",
  "goal",
  "whatDefinesTask",
  "definesTask",
  "settled",
  "currentUnderstanding",
  "tentative",
  "open",
  "openQuestions",
  "currentDirection",
  "boundaries",
  "currentRoute",
  "route",
  "nextAction",
  "nextUsefulAction",
  "blockers",
  "upcomingCheckpoints",
  "taskState",
  "currentSlice",
  "authoritySource",
  "dryRun",
]);

export const VIEW_INPUT_KEYS = new Set(["view", "entity", "section", "limit"]);
export const UNLOCK_INPUT_KEYS = new Set(["scope", "authoritySource", "lockPid", "lockCreatedAt"]);

export const COMMAND_INPUT_KEYS = {
  start: new Set([
    ...COMMON_COMMAND_INPUT_KEYS,
    "proposalTitle",
    "proposal",
    "id",
    "name",
    "title",
    "type",
    "intendedResult",
    "result",
    "authoritySource",
    "authority",
    "userDirection",
    "reasonAndScope",
    "scope",
    "expectedEvidence",
    "stopCondition",
    "startingState",
    "acceptedExtensions",
    "dependencies",
    "selectedCheckpoints",
    "blocker",
    "resumeWhen",
    "blockerHistory",
    "pendingBoundaries",
    "pendingReviews",
    "reopenHistory",
    "currentResult",
    "resultSummary",
    "evidence",
    "reviewSummary",
    "taskEffect",
    "route",
    "currentRoute",
    "nextAction",
    "nextUsefulAction",
  ]),
  block: new Set([
    ...COMMON_COMMAND_INPUT_KEYS,
    "sliceId",
    "id",
    "currentSliceId",
    "blocker",
    "reason",
    "what",
    "why",
    "required",
    "requiredResolution",
    "resumeWhen",
  ]),
  resume: new Set([
    ...COMMON_COMMAND_INPUT_KEYS,
    "sliceId",
    "id",
    "currentSliceId",
    "resolutionSource",
    "resolvedBy",
    "evidence",
  ]),
  reopen: new Set([
    ...COMMON_COMMAND_INPUT_KEYS,
    "sliceId",
    "id",
    "currentSliceId",
    "authoritySource",
    "authority",
    "userDirection",
    "reopenReason",
    "reason",
    "reasonAndScope",
    "scopeChange",
    "scope",
    "expectedEvidence",
    "stopCondition",
    "startingState",
    "selectedCheckpoints",
    "currentResult",
    "evidence",
    "reviewSummary",
    "taskEffect",
    "pendingBoundaries",
    "pendingReviews",
    "currentRoute",
    "route",
    "nextAction",
    "nextUsefulAction",
  ]),
  close: new Set([
    ...COMMON_COMMAND_INPUT_KEYS,
    "sliceId",
    "id",
    "currentSliceId",
    "finalState",
    "state",
    "authoritySource",
    "parkAuthority",
    "abandonmentAuthority",
    "outcome",
    "result",
    "evidence",
    "reviewSummary",
    "taskEffect",
    "residualEffects",
    "abandonmentReason",
    "reason",
    "currentContext",
    "currentRoute",
    "route",
    "nextAction",
    "nextUsefulAction",
    "taskState",
    "taskStateAuthority",
  ]),
};

export function isSingleLineTitle(value) {
  return typeof value === "string" && value === value.trim() && value.length > 0 && !/[\r\n]/.test(value);
}

export function hasDecisionContent(decision) {
  return [decision.decision, decision.rationale, decision.consequences].some(
    (value) => typeof value === "string" && value.trim(),
  );
}

export function isSingleLineList(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && !/[\r\n]/.test(item));
}
