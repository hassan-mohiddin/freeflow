import { createHash } from "node:crypto";

export const SCHEMA_VERSION = 3;

export const TASK_STATES = new Set(["active", "paused", "completed", "abandoned"]);
export const SLICE_STATES = new Set(["in_progress", "blocked", "completed", "parked", "abandoned"]);
export const ACTIVE_SLICE_STATES = new Set(["in_progress", "blocked"]);
export const SLICE_TYPES = new Set(["learning", "delivery", "deepening"]);
export const PROPOSAL_STATES = new Set(["proposed", "selected", "withdrawn"]);
export const DECISION_STATES = new Set(["active", "superseded", "retired"]);
export const CHECKPOINT_STATES = new Set(["upcoming", "completed", "deferred", "cancelled", "replaced"]);
export const CHECKPOINT_TYPES = new Set(["independent_review", "local_commit", "user_decision", "continuity"]);
export const CHECK_RESULT_STATES = new Set(["passed", "failed", "error", "unavailable"]);
export const CLAIM_RESULT_STATES = new Set(["supported", "contradicted", "inconclusive", "unavailable"]);
export const BLOCKER_STATES = new Set(["active", "resolved"]);

export const ENTITY_MAPS = ["proposals", "slices", "decisions", "checkpoints", "evidence", "blockers", "notes"];
const ENTITY_COLLECTIONS = [...ENTITY_MAPS, "corrections"];
export const ENTITY_PREFIXES = {
  task: "T",
  context: "CTX",
  boundary: "BND",
  proposal: "P",
  slice: "S",
  extension: "X",
  decision: "D",
  checkpoint: "C",
  evidence: "E",
  blocker: "B",
  note: "N",
};
export const ENTITY_MAP_BY_KIND = {
  proposal: "proposals",
  slice: "slices",
  decision: "decisions",
  checkpoint: "checkpoints",
  evidence: "evidence",
  blocker: "blockers",
  note: "notes",
};

const ID_PATTERNS = Object.fromEntries(
  Object.entries(ENTITY_PREFIXES).map(([kind, prefix]) => [kind, new RegExp(`^${prefix}-\\d{3,}$`)]),
);
const RECORD_KEYS = new Set(["schemaVersion", "record", "context", "current", "entities"]);
const RECORD_METADATA_KEYS = new Set(["id", "name", "state", "stateSource", "createdAt", "updatedAt"]);
const CONTEXT_KEYS = new Set(["goal", "sourceRefs", "settled", "tentative", "open", "direction", "boundaries"]);
const STATEMENT_KEYS = new Set(["id", "text", "basisRefs"]);
const BOUNDARY_KEYS = new Set(["id", "text"]);
const ROUTE_KEYS = new Set(["owner", "reason"]);
const CURRENT_KEYS = new Set(["route", "currentSliceId", "proposalOrder", "upcomingCheckpointIds", "nextAction"]);
const PROPOSAL_KEYS = new Set([
  "id",
  "state",
  "title",
  "type",
  "intendedResult",
  "expectedEvidence",
  "dependencies",
  "selectedCheckpoints",
  "selectedAsSliceId",
  "withdrawal",
  "createdAt",
  "updatedAt",
]);
const SLICE_KEYS = new Set([
  "id",
  "originProposalId",
  "state",
  "type",
  "title",
  "intendedResult",
  "dependencies",
  "selectedCheckpoints",
  "extensions",
  "activations",
  "createdAt",
  "updatedAt",
]);
const EXTENSION_KEYS = new Set([
  "id",
  "activationSequence",
  "authoritySource",
  "reason",
  "addedScope",
  "addedEvidenceBoundary",
  "stopConditionChange",
  "startingState",
  "acceptedAt",
]);
const ACTIVATION_KEYS = new Set([
  "sequence",
  "authoritySource",
  "reasonAndScope",
  "expectedEvidence",
  "stopCondition",
  "startingState",
  "openedAt",
  "resolution",
]);
const RESOLUTION_KEYS = new Set([
  "finalState",
  "summary",
  "evidenceIds",
  "reviewSummary",
  "taskEffect",
  "blockerId",
  "authoritySource",
  "reason",
  "residualEffects",
  "closedAt",
]);
const RETIREMENT_KEYS = new Set(["authoritySource", "reason", "retiredAt"]);
const DECISION_KEYS = new Set([
  "id",
  "state",
  "title",
  "decision",
  "establishedBy",
  "rationale",
  "sourceRefs",
  "consequences",
  "revisitWhen",
  "supersedesId",
  "supersededById",
  "retirement",
  "createdAt",
  "updatedAt",
]);
const CHECKPOINT_KEYS = new Set([
  "id",
  "state",
  "title",
  "type",
  "selectedBy",
  "condition",
  "appliesTo",
  "resolution",
  "replacesId",
  "replacedById",
  "createdAt",
  "updatedAt",
]);
const CHECKPOINT_RESOLUTION_KEYS = new Set([
  "judgment",
  "decision",
  "evidenceIds",
  "taskEffect",
  "reason",
  "resolvedAt",
]);
const EVIDENCE_KEYS = new Set([
  "id",
  "claim",
  "requiredBoundary",
  "observer",
  "checkResult",
  "claimResult",
  "proves",
  "doesNotProve",
  "pointer",
  "supersedesId",
  "supersededById",
  "appliesTo",
  "observedAt",
]);
const BLOCKER_KEYS = new Set([
  "id",
  "state",
  "appliesTo",
  "whyUnsafe",
  "requiredResolution",
  "resumeWhen",
  "resolutionSource",
  "createdAt",
  "resolvedAt",
]);
const NOTE_KEYS = new Set(["id", "title", "source", "body", "createdAt", "updatedAt"]);
const WITHDRAWAL_KEYS = new Set(["authoritySource", "reason", "withdrawnAt"]);
const CORRECTION_KEYS = new Set([
  "entityKind",
  "entityId",
  "field",
  "before",
  "after",
  "reason",
  "authoritySource",
  "evidenceIds",
  "createdAt",
]);
const CORRECTION_ENTITY_KINDS = new Set(["slice", "checkpoint", "decision"]);
const CORRECTION_FIELDS = {
  slice: new Set(["title", "intendedResult"]),
  checkpoint: new Set(["title", "selectedBy", "condition"]),
  decision: new Set(["title", "decision", "establishedBy", "rationale", "consequences", "revisitWhen"]),
};

export class RecordModelError extends Error {
  constructor(errors) {
    super(`Working Record is invalid: ${errors.map((error) => error.message).join("; ")}`);
    this.name = "RecordModelError";
    this.code = "invalid-record";
    this.errors = errors;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return structuredClone(value);
}

function add(errors, code, message, path) {
  errors.push({ code, message, ...(path ? { path } : {}) });
}

function objectAt(value, path, allowed, required, errors) {
  if (!isObject(value)) {
    add(errors, "invalid-field", `${path} must be an object`, path);
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) add(errors, "unknown-field", `Unknown field: ${path}.${key}`, `${path}.${key}`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key))
      add(errors, "missing-field", `Missing required field: ${path}.${key}`, `${path}.${key}`);
  }
  return true;
}

function stringAt(value, path, errors, { required = false, nonEmpty = false, line = false, nullable = false } = {}) {
  if (value === undefined) {
    if (required) add(errors, "missing-field", `Missing required field: ${path}`, path);
    return false;
  }
  if (value === null && nullable) return true;
  if (typeof value !== "string") {
    add(errors, "invalid-field", `${path} must be a string`, path);
    return false;
  }
  if (nonEmpty && value.trim() === "") add(errors, "empty-field", `${path} must not be empty`, path);
  if (line && /[\r\n]/.test(value)) add(errors, "multiline-field", `${path} must be single-line`, path);
  return true;
}

function arrayAt(value, path, errors, { required = false, item, minItems = 0 } = {}) {
  if (!Array.isArray(value)) {
    if (required || value !== undefined) add(errors, "invalid-field", `${path} must be an array`, path);
    return false;
  }
  if (value.length < minItems) add(errors, "missing-field", `${path} requires at least ${minItems} item(s)`, path);
  if (item) for (const [index, child] of value.entries()) item(child, `${path}[${index}]`, errors);
  return true;
}

function enumAt(value, path, values, errors, code = "invalid-enum") {
  if (!values.has(value)) add(errors, code, `${path} has unsupported value: ${value}`, path);
}

function idAt(value, path, kind, errors, { nullable = false } = {}) {
  if (value === null && nullable) return;
  if (typeof value !== "string" || !ID_PATTERNS[kind]?.test(value))
    add(errors, "invalid-id", `${path} must use the ${kind} ID format`, path);
}

function timestampAt(value, path, errors, { nullable = false } = {}) {
  if (value === null && nullable) return;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))
    add(errors, "invalid-timestamp", `${path} must be an RFC-3339 UTC timestamp`, path);
  else if (Number.isNaN(new Date(value).valueOf()))
    add(errors, "invalid-timestamp", `${path} is not a valid timestamp`, path);
}

function referenceListAt(value, path, errors, { required = false } = {}) {
  arrayAt(value, path, errors, {
    required,
    item: (child, childPath, childErrors) => stringAt(child, childPath, childErrors, { nonEmpty: true, line: true }),
  });
}

function targetReferenceAt(value, path, errors, { required = false, array = false } = {}) {
  if (array) {
    arrayAt(value, path, errors, {
      required,
      minItems: required ? 1 : 0,
      item: (child, childPath, childErrors) => {
        if (!objectAt(child, childPath, new Set(["kind", "id"]), ["kind", "id"], childErrors)) return;
        stringAt(child.kind, `${childPath}.kind`, childErrors, { nonEmpty: true, line: true });
        stringAt(child.id, `${childPath}.id`, childErrors, { nonEmpty: true, line: true });
      },
    });
    return;
  }
  if (value === null && !required) return;
  if (!objectAt(value, path, new Set(["kind", "id"]), ["kind", "id"], errors)) return;
  stringAt(value.kind, `${path}.kind`, errors, { nonEmpty: true, line: true });
  stringAt(value.id, `${path}.id`, errors, { nonEmpty: true, line: true });
}

function checkRecordMetadata(value, errors) {
  if (!objectAt(value, "record", RECORD_METADATA_KEYS, [...RECORD_METADATA_KEYS], errors)) return;
  idAt(value.id, "record.id", "task", errors);
  stringAt(value.name, "record.name", errors, { required: true, nonEmpty: true, line: true });
  enumAt(value.state, "record.state", TASK_STATES, errors, "invalid-task-state");
  stringAt(value.stateSource, "record.stateSource", errors, { required: true, nonEmpty: true, line: true });
  timestampAt(value.createdAt, "record.createdAt", errors);
  timestampAt(value.updatedAt, "record.updatedAt", errors);
}

function checkStatement(value, path, errors) {
  if (!objectAt(value, path, STATEMENT_KEYS, ["id", "text", "basisRefs"], errors)) return;
  idAt(value.id, `${path}.id`, "context", errors);
  stringAt(value.text, `${path}.text`, errors, { required: true, nonEmpty: true });
  referenceListAt(value.basisRefs, `${path}.basisRefs`, errors, { required: true });
}

function checkBoundary(value, path, errors) {
  if (!objectAt(value, path, BOUNDARY_KEYS, ["id", "text"], errors)) return;
  idAt(value.id, `${path}.id`, "boundary", errors);
  stringAt(value.text, `${path}.text`, errors, { required: true, nonEmpty: true });
}

function checkContext(value, errors) {
  if (!objectAt(value, "context", CONTEXT_KEYS, [...CONTEXT_KEYS], errors)) return;
  stringAt(value.goal, "context.goal", errors, { required: true, nonEmpty: true });
  referenceListAt(value.sourceRefs, "context.sourceRefs", errors, { required: true });
  for (const group of ["settled", "tentative", "open"])
    arrayAt(value[group], `context.${group}`, errors, {
      required: true,
      item: (child, path, childErrors) => checkStatement(child, path, childErrors),
    });
  stringAt(value.direction, "context.direction", errors, { required: true, nonEmpty: true });
  arrayAt(value.boundaries, "context.boundaries", errors, {
    required: true,
    item: (child, path, childErrors) => checkBoundary(child, path, childErrors),
  });
}

function checkCurrent(value, errors) {
  if (!objectAt(value, "current", CURRENT_KEYS, [...CURRENT_KEYS], errors)) return;
  if (objectAt(value.route, "current.route", ROUTE_KEYS, [...ROUTE_KEYS], errors)) {
    stringAt(value.route.owner, "current.route.owner", errors, { required: true, nonEmpty: true, line: true });
    stringAt(value.route.reason, "current.route.reason", errors, { required: true, nonEmpty: true });
  }
  idAt(value.currentSliceId, "current.currentSliceId", "slice", errors, { nullable: true });
  arrayAt(value.proposalOrder, "current.proposalOrder", errors, {
    required: true,
    item: (child, path, childErrors) => idAt(child, path, "proposal", childErrors),
  });
  arrayAt(value.upcomingCheckpointIds, "current.upcomingCheckpointIds", errors, {
    required: true,
    item: (child, path, childErrors) => idAt(child, path, "checkpoint", childErrors),
  });
  stringAt(value.nextAction, "current.nextAction", errors, { required: true, nonEmpty: true });
}

function checkExtension(value, path, errors) {
  if (!objectAt(value, path, EXTENSION_KEYS, [...EXTENSION_KEYS], errors)) return;
  idAt(value.id, `${path}.id`, "extension", errors);
  if (!Number.isInteger(value.activationSequence) || value.activationSequence < 1)
    add(errors, "invalid-field", `${path}.activationSequence must be positive`, `${path}.activationSequence`);
  for (const field of ["authoritySource", "reason", "addedScope", "addedEvidenceBoundary", "startingState"])
    stringAt(value[field], `${path}.${field}`, errors, { required: true, nonEmpty: true });
  stringAt(value.stopConditionChange, `${path}.stopConditionChange`, errors, { required: true, nullable: true });
  timestampAt(value.acceptedAt, `${path}.acceptedAt`, errors);
}

function checkResolution(value, path, errors) {
  if (!objectAt(value, path, RESOLUTION_KEYS, [...RESOLUTION_KEYS], errors)) return;
  enumAt(value.finalState, `${path}.finalState`, new Set(["completed", "parked", "abandoned"]), errors);
  stringAt(value.summary, `${path}.summary`, errors, { required: true, nonEmpty: true });
  referenceListAt(value.evidenceIds, `${path}.evidenceIds`, errors, { required: true });
  stringAt(value.reviewSummary, `${path}.reviewSummary`, errors, { required: true });
  stringAt(value.taskEffect, `${path}.taskEffect`, errors, { required: true });
  idAt(value.blockerId, `${path}.blockerId`, "blocker", errors, { nullable: true });
  for (const field of ["authoritySource", "reason", "residualEffects"])
    stringAt(value[field], `${path}.${field}`, errors, { required: true, nullable: true });
  timestampAt(value.closedAt, `${path}.closedAt`, errors);
  if (value.finalState === "completed") {
    if (!Array.isArray(value.evidenceIds) || value.evidenceIds.length === 0)
      add(errors, "missing-resolution-evidence", `${path}.completed requires evidenceIds`, `${path}.evidenceIds`);
    if (typeof value.taskEffect !== "string" || !value.taskEffect.trim())
      add(errors, "missing-resolution-field", `${path}.completed requires taskEffect`, `${path}.taskEffect`);
  }
  if (value.finalState === "parked" && (typeof value.blockerId !== "string" || !value.blockerId))
    add(errors, "missing-resolution-blocker", `${path}.parked requires blockerId`, `${path}.blockerId`);
  if (value.finalState === "abandoned")
    for (const field of ["authoritySource", "reason", "residualEffects"])
      if (typeof value[field] !== "string" || !value[field].trim())
        add(errors, "missing-resolution-field", `${path}.abandoned requires ${field}`, `${path}.${field}`);
}

function checkActivation(value, path, errors) {
  if (!objectAt(value, path, ACTIVATION_KEYS, [...ACTIVATION_KEYS], errors)) return;
  if (!Number.isInteger(value.sequence) || value.sequence < 1)
    add(errors, "invalid-field", `${path}.sequence must be positive`, `${path}.sequence`);
  for (const field of ["authoritySource", "reasonAndScope", "expectedEvidence", "stopCondition", "startingState"])
    stringAt(value[field], `${path}.${field}`, errors, { required: true, nonEmpty: true });
  timestampAt(value.openedAt, `${path}.openedAt`, errors);
  if (value.resolution !== null && value.resolution !== undefined)
    checkResolution(value.resolution, `${path}.resolution`, errors);
}

function checkSlice(value, path, errors) {
  if (!objectAt(value, path, SLICE_KEYS, [...SLICE_KEYS], errors)) return;
  idAt(value.id, `${path}.id`, "slice", errors);
  idAt(value.originProposalId, `${path}.originProposalId`, "proposal", errors, { nullable: true });
  enumAt(value.state, `${path}.state`, SLICE_STATES, errors, "invalid-slice-state");
  enumAt(value.type, `${path}.type`, SLICE_TYPES, errors, "invalid-slice-type");
  stringAt(value.title, `${path}.title`, errors, { required: true, nonEmpty: true, line: true });
  stringAt(value.intendedResult, `${path}.intendedResult`, errors, { required: true, nonEmpty: true });
  referenceListAt(value.dependencies, `${path}.dependencies`, errors, { required: true });
  referenceListAt(value.selectedCheckpoints, `${path}.selectedCheckpoints`, errors, { required: true });
  arrayAt(value.extensions, `${path}.extensions`, errors, {
    required: true,
    item: (child, childPath, childErrors) => checkExtension(child, childPath, childErrors),
  });
  arrayAt(value.activations, `${path}.activations`, errors, {
    required: true,
    minItems: 1,
    item: (child, childPath, childErrors) => checkActivation(child, childPath, childErrors),
  });
  timestampAt(value.createdAt, `${path}.createdAt`, errors);
  timestampAt(value.updatedAt, `${path}.updatedAt`, errors);
  if (Array.isArray(value.activations)) {
    const sequences = value.activations.map((activation) => activation?.sequence);
    sequences.forEach((sequence, index) => {
      if (sequence !== index + 1)
        add(
          errors,
          "invalid-activation-sequence",
          `${path}.activations must be sequential`,
          `${path}.activations[${index}]`,
        );
    });
    const latest = value.activations.at(-1);
    if (ACTIVE_SLICE_STATES.has(value.state) && latest?.resolution !== null && latest?.resolution !== undefined)
      add(
        errors,
        "unexpected-slice-resolution",
        `${path} active state cannot have a resolution`,
        `${path}.activations`,
      );
    if (!ACTIVE_SLICE_STATES.has(value.state) && (latest?.resolution === null || latest?.resolution === undefined))
      add(errors, "missing-slice-resolution", `${path} historical state requires a resolution`, `${path}.activations`);
    if (latest?.resolution && latest.resolution.finalState !== value.state)
      add(
        errors,
        "slice-resolution-state-mismatch",
        `${path} state does not match its resolution`,
        `${path}.activations`,
      );
    const activationSequences = new Set(sequences);
    for (const [index, extension] of (value.extensions ?? []).entries())
      if (!activationSequences.has(extension?.activationSequence))
        add(
          errors,
          "dangling-reference",
          `${path}.extensions[${index}] references an unknown activation`,
          `${path}.extensions[${index}].activationSequence`,
        );
  }
}

function checkProposal(value, path, errors) {
  if (!objectAt(value, path, PROPOSAL_KEYS, [...PROPOSAL_KEYS], errors)) return;
  idAt(value.id, `${path}.id`, "proposal", errors);
  enumAt(value.state, `${path}.state`, PROPOSAL_STATES, errors, "invalid-proposal-state");
  stringAt(value.title, `${path}.title`, errors, { required: true, nonEmpty: true, line: true });
  enumAt(value.type, `${path}.type`, SLICE_TYPES, errors, "invalid-proposal-type");
  stringAt(value.intendedResult, `${path}.intendedResult`, errors, { required: true, nonEmpty: true });
  stringAt(value.expectedEvidence, `${path}.expectedEvidence`, errors, { required: true, nonEmpty: true });
  referenceListAt(value.dependencies, `${path}.dependencies`, errors, { required: true });
  referenceListAt(value.selectedCheckpoints, `${path}.selectedCheckpoints`, errors, { required: true });
  idAt(value.selectedAsSliceId, `${path}.selectedAsSliceId`, "slice", errors, { nullable: true });
  if (value.withdrawal === null) {
    if (value.state === "withdrawn")
      add(errors, "missing-withdrawal", `${path} withdrawn Proposal requires withdrawal details`, `${path}.withdrawal`);
  } else if (objectAt(value.withdrawal, `${path}.withdrawal`, WITHDRAWAL_KEYS, [...WITHDRAWAL_KEYS], errors)) {
    stringAt(value.withdrawal.authoritySource, `${path}.withdrawal.authoritySource`, errors, {
      required: true,
      nonEmpty: true,
    });
    stringAt(value.withdrawal.reason, `${path}.withdrawal.reason`, errors, { required: true, nonEmpty: true });
    timestampAt(value.withdrawal.withdrawnAt, `${path}.withdrawal.withdrawnAt`, errors);
  }
  if (value.state !== "withdrawn" && value.withdrawal !== null)
    add(
      errors,
      "invalid-withdrawal",
      `${path} non-withdrawn Proposal cannot have withdrawal details`,
      `${path}.withdrawal`,
    );
  timestampAt(value.createdAt, `${path}.createdAt`, errors);
  timestampAt(value.updatedAt, `${path}.updatedAt`, errors);
}

function checkDecision(value, path, errors) {
  if (
    !objectAt(
      value,
      path,
      DECISION_KEYS,
      [...DECISION_KEYS].filter((key) => key !== "retirement"),
      errors,
    )
  )
    return;
  idAt(value.id, `${path}.id`, "decision", errors);
  enumAt(value.state, `${path}.state`, DECISION_STATES, errors, "invalid-decision-state");
  stringAt(value.title, `${path}.title`, errors, { required: true, nonEmpty: true, line: true });
  const content = [value.decision, value.rationale, value.consequences].some(
    (item) => typeof item === "string" && item.trim(),
  );
  if (!content) add(errors, "missing-decision-content", `${path} requires decision content`, path);
  for (const field of ["decision", "establishedBy", "rationale", "consequences", "revisitWhen"])
    stringAt(value[field], `${path}.${field}`, errors, { required: true });
  referenceListAt(value.sourceRefs, `${path}.sourceRefs`, errors, { required: true });
  idAt(value.supersedesId, `${path}.supersedesId`, "decision", errors, { nullable: true });
  idAt(value.supersededById, `${path}.supersededById`, "decision", errors, { nullable: true });
  if (value.retirement !== undefined && value.retirement !== null) {
    if (objectAt(value.retirement, `${path}.retirement`, RETIREMENT_KEYS, [...RETIREMENT_KEYS], errors)) {
      stringAt(value.retirement.authoritySource, `${path}.retirement.authoritySource`, errors, {
        required: true,
        nonEmpty: true,
      });
      stringAt(value.retirement.reason, `${path}.retirement.reason`, errors, { required: true, nonEmpty: true });
      timestampAt(value.retirement.retiredAt, `${path}.retirement.retiredAt`, errors);
    }
  }
  if (value.state === "retired" && (!value.retirement || typeof value.retirement !== "object"))
    add(errors, "missing-retirement", `${path} retired Decision requires retirement details`, `${path}.retirement`);
  if (value.state !== "retired" && value.retirement !== undefined && value.retirement !== null)
    add(
      errors,
      "invalid-retirement",
      `${path} non-retired Decision cannot have retirement details`,
      `${path}.retirement`,
    );
  timestampAt(value.createdAt, `${path}.createdAt`, errors);
  timestampAt(value.updatedAt, `${path}.updatedAt`, errors);
}

function checkCheckpointResolution(value, path, errors) {
  if (!objectAt(value, path, CHECKPOINT_RESOLUTION_KEYS, [...CHECKPOINT_RESOLUTION_KEYS], errors)) return;
  for (const field of ["judgment", "decision", "taskEffect", "reason"])
    stringAt(value[field], `${path}.${field}`, errors, { required: true });
  referenceListAt(value.evidenceIds, `${path}.evidenceIds`, errors, { required: true });
  timestampAt(value.resolvedAt, `${path}.resolvedAt`, errors);
}

function checkCheckpoint(value, path, errors) {
  if (!objectAt(value, path, CHECKPOINT_KEYS, [...CHECKPOINT_KEYS], errors)) return;
  idAt(value.id, `${path}.id`, "checkpoint", errors);
  enumAt(value.state, `${path}.state`, CHECKPOINT_STATES, errors, "invalid-checkpoint-state");
  stringAt(value.title, `${path}.title`, errors, { required: true, nonEmpty: true, line: true });
  enumAt(value.type, `${path}.type`, CHECKPOINT_TYPES, errors, "invalid-checkpoint-type");
  stringAt(value.selectedBy, `${path}.selectedBy`, errors, { required: true, nonEmpty: true });
  stringAt(value.condition, `${path}.condition`, errors, { required: true, nonEmpty: true });
  targetReferenceAt(value.appliesTo, `${path}.appliesTo`, errors, { required: true });
  if (value.resolution !== null && value.resolution !== undefined)
    checkCheckpointResolution(value.resolution, `${path}.resolution`, errors);
  idAt(value.replacesId, `${path}.replacesId`, "checkpoint", errors, { nullable: true });
  idAt(value.replacedById, `${path}.replacedById`, "checkpoint", errors, { nullable: true });
  timestampAt(value.createdAt, `${path}.createdAt`, errors);
  timestampAt(value.updatedAt, `${path}.updatedAt`, errors);
  if (value.state === "upcoming" && value.resolution !== null && value.resolution !== undefined)
    add(
      errors,
      "unexpected-checkpoint-resolution",
      `${path} upcoming checkpoint cannot have a resolution`,
      `${path}.resolution`,
    );
  if (value.state !== "upcoming" && (value.resolution === null || value.resolution === undefined))
    add(
      errors,
      "missing-checkpoint-resolution",
      `${path} terminal checkpoint requires a resolution`,
      `${path}.resolution`,
    );
  if (value.state === "replaced" && !value.replacedById)
    add(
      errors,
      "missing-checkpoint-replacement",
      `${path} replaced checkpoint requires replacedById`,
      `${path}.replacedById`,
    );
  if (value.state !== "replaced" && value.replacedById !== null)
    add(
      errors,
      "unexpected-checkpoint-replacement",
      `${path} non-replaced checkpoint cannot have replacedById`,
      `${path}.replacedById`,
    );
}

function checkEvidence(value, path, errors) {
  if (!objectAt(value, path, EVIDENCE_KEYS, [...EVIDENCE_KEYS], errors)) return;
  idAt(value.id, `${path}.id`, "evidence", errors);
  for (const field of ["claim", "requiredBoundary", "observer", "proves", "doesNotProve", "pointer"])
    stringAt(value[field], `${path}.${field}`, errors, { required: true, nonEmpty: true });
  enumAt(value.checkResult, `${path}.checkResult`, CHECK_RESULT_STATES, errors, "invalid-check-result");
  enumAt(value.claimResult, `${path}.claimResult`, CLAIM_RESULT_STATES, errors, "invalid-claim-result");
  idAt(value.supersedesId, `${path}.supersedesId`, "evidence", errors, { nullable: true });
  idAt(value.supersededById, `${path}.supersededById`, "evidence", errors, { nullable: true });
  targetReferenceAt(value.appliesTo, `${path}.appliesTo`, errors, { required: true, array: true });
  timestampAt(value.observedAt, `${path}.observedAt`, errors);
}

function checkBlocker(value, path, errors) {
  if (!objectAt(value, path, BLOCKER_KEYS, [...BLOCKER_KEYS], errors)) return;
  idAt(value.id, `${path}.id`, "blocker", errors);
  enumAt(value.state, `${path}.state`, BLOCKER_STATES, errors, "invalid-blocker-state");
  targetReferenceAt(value.appliesTo, `${path}.appliesTo`, errors, { required: true });
  for (const field of ["whyUnsafe", "requiredResolution", "resumeWhen", "resolutionSource"])
    stringAt(value[field], `${path}.${field}`, errors, { required: true, nullable: true });
  timestampAt(value.createdAt, `${path}.createdAt`, errors);
  timestampAt(value.resolvedAt, `${path}.resolvedAt`, errors, { nullable: true });
  if (value.state === "active" && (value.resolutionSource !== null || value.resolvedAt !== null))
    add(errors, "active-blocker-resolution", `${path} active blocker cannot have a resolution`, path);
  if (
    value.state === "resolved" &&
    (typeof value.resolutionSource !== "string" || !value.resolutionSource.trim() || value.resolvedAt === null)
  )
    add(
      errors,
      "missing-blocker-resolution",
      `${path} resolved blocker requires resolutionSource and resolvedAt`,
      path,
    );
}

function checkNote(value, path, errors) {
  if (!objectAt(value, path, NOTE_KEYS, [...NOTE_KEYS], errors)) return;
  idAt(value.id, `${path}.id`, "note", errors);
  stringAt(value.title, `${path}.title`, errors, { required: true, nonEmpty: true, line: true });
  stringAt(value.source, `${path}.source`, errors, { required: true, nonEmpty: true });
  stringAt(value.body, `${path}.body`, errors, { required: true, nonEmpty: true });
  timestampAt(value.createdAt, `${path}.createdAt`, errors);
  timestampAt(value.updatedAt, `${path}.updatedAt`, errors);
}

function checkCorrection(value, path, errors) {
  if (!objectAt(value, path, CORRECTION_KEYS, [...CORRECTION_KEYS], errors)) return;
  enumAt(value.entityKind, `${path}.entityKind`, CORRECTION_ENTITY_KINDS, errors);
  const targetKind = CORRECTION_ENTITY_KINDS.has(value.entityKind) ? value.entityKind : "slice";
  idAt(value.entityId, `${path}.entityId`, targetKind, errors);
  stringAt(value.field, `${path}.field`, errors, { required: true, nonEmpty: true, line: true });
  stringAt(value.before, `${path}.before`, errors, { required: true, nonEmpty: true });
  stringAt(value.after, `${path}.after`, errors, { required: true, nonEmpty: true });
  stringAt(value.reason, `${path}.reason`, errors, { required: true, nonEmpty: true });
  stringAt(value.authoritySource, `${path}.authoritySource`, errors, { required: true, nonEmpty: true });
  referenceListAt(value.evidenceIds, `${path}.evidenceIds`, errors, { required: true });
  timestampAt(value.createdAt, `${path}.createdAt`, errors);
}

function entityMapAt(data, kind) {
  return data.entities?.[ENTITY_MAP_BY_KIND[kind]] ?? {};
}

function entityExists(data, kind, id) {
  if (kind === "task") return data.record?.id === id;
  const map = entityMapAt(data, kind);
  return isObject(map) && Object.hasOwn(map, id);
}

function checkEntityMap(data, mapName, validator, errors) {
  const map = data.entities?.[mapName];
  if (!isObject(map)) {
    add(errors, "invalid-field", `entities.${mapName} must be an object`, `entities.${mapName}`);
    return;
  }
  for (const [id, entity] of Object.entries(map)) {
    validator(entity, `entities.${mapName}.${id}`, errors);
    if (isObject(entity) && entity.id !== id)
      add(errors, "id-key-mismatch", `${mapName}.${id} does not match its entity ID`, `entities.${mapName}.${id}.id`);
  }
}

function checkReferences(data, errors) {
  for (const [id, proposal] of Object.entries(entityMapAt(data, "proposal"))) {
    for (const [index, dependency] of (proposal?.dependencies ?? []).entries()) {
      const kind = /^([A-Z]+)-\d{3,}$/.exec(dependency)?.[1];
      const kindByPrefix = Object.entries(ENTITY_PREFIXES).find(([, prefix]) => prefix === kind)?.[0];
      if (!kindByPrefix || !ENTITY_MAP_BY_KIND[kindByPrefix] || !entityExists(data, kindByPrefix, dependency))
        add(
          errors,
          "dangling-reference",
          `Proposal ${id} references missing dependency ${dependency}`,
          `entities.proposals.${id}.dependencies[${index}]`,
        );
    }
    for (const [index, checkpointId] of (proposal?.selectedCheckpoints ?? []).entries())
      if (!entityExists(data, "checkpoint", checkpointId))
        add(
          errors,
          "dangling-reference",
          `Proposal ${id} references missing Checkpoint ${checkpointId}`,
          `entities.proposals.${id}.selectedCheckpoints[${index}]`,
        );
    if (proposal?.state === "selected") {
      if (!proposal.selectedAsSliceId)
        add(
          errors,
          "lineage-mismatch",
          `Selected Proposal ${id} requires a Slice`,
          `entities.proposals.${id}.selectedAsSliceId`,
        );
      else if (!entityExists(data, "slice", proposal.selectedAsSliceId))
        add(
          errors,
          "dangling-reference",
          `Proposal ${id} references missing Slice`,
          `entities.proposals.${id}.selectedAsSliceId`,
        );
      else if (entityMapAt(data, "slice")[proposal.selectedAsSliceId]?.originProposalId !== id)
        add(
          errors,
          "lineage-mismatch",
          `Proposal ${id} and its Slice lack reciprocal lineage`,
          `entities.proposals.${id}.selectedAsSliceId`,
        );
    } else if (proposal?.selectedAsSliceId !== null) {
      add(
        errors,
        "lineage-mismatch",
        `Unselected Proposal ${id} cannot reference a Slice`,
        `entities.proposals.${id}.selectedAsSliceId`,
      );
    }
  }

  for (const [id, slice] of Object.entries(entityMapAt(data, "slice"))) {
    for (const [index, dependency] of (slice?.dependencies ?? []).entries()) {
      const kind = /^([A-Z]+)-\d{3,}$/.exec(dependency)?.[1];
      const kindByPrefix = Object.entries(ENTITY_PREFIXES).find(([, prefix]) => prefix === kind)?.[0];
      if (!kindByPrefix || !ENTITY_MAP_BY_KIND[kindByPrefix] || !entityExists(data, kindByPrefix, dependency))
        add(
          errors,
          "dangling-reference",
          `Slice ${id} references missing dependency ${dependency}`,
          `entities.slices.${id}.dependencies[${index}]`,
        );
    }
    for (const [index, checkpointId] of (slice?.selectedCheckpoints ?? []).entries())
      if (!entityExists(data, "checkpoint", checkpointId))
        add(
          errors,
          "dangling-reference",
          `Slice ${id} references missing Checkpoint ${checkpointId}`,
          `entities.slices.${id}.selectedCheckpoints[${index}]`,
        );
    if (slice?.activations)
      for (const [activationIndex, activation] of slice.activations.entries())
        for (const [evidenceIndex, evidenceId] of (activation.resolution?.evidenceIds ?? []).entries())
          if (!entityExists(data, "evidence", evidenceId))
            add(
              errors,
              "dangling-reference",
              `Slice ${id} references missing Evidence ${evidenceId}`,
              `entities.slices.${id}.activations[${activationIndex}].resolution.evidenceIds[${evidenceIndex}]`,
            );
    if (slice?.activations)
      for (const [activationIndex, activation] of slice.activations.entries()) {
        const blockerId = activation.resolution?.blockerId;
        if (blockerId && !entityExists(data, "blocker", blockerId))
          add(
            errors,
            "dangling-reference",
            `Slice ${id} references missing Blocker ${blockerId}`,
            `entities.slices.${id}.activations[${activationIndex}].resolution.blockerId`,
          );
      }
    if (!slice?.originProposalId) continue;
    if (!entityExists(data, "proposal", slice.originProposalId))
      add(
        errors,
        "dangling-reference",
        `Slice ${id} references missing Proposal`,
        `entities.slices.${id}.originProposalId`,
      );
    else if (entityMapAt(data, "proposal")[slice.originProposalId]?.selectedAsSliceId !== id)
      add(
        errors,
        "lineage-mismatch",
        `Slice ${id} and its Proposal lack reciprocal lineage`,
        `entities.slices.${id}.originProposalId`,
      );
  }

  const checkpoints = entityMapAt(data, "checkpoint");
  for (const [id, checkpoint] of Object.entries(checkpoints)) {
    if (checkpoint?.appliesTo && !entityExists(data, checkpoint.appliesTo.kind, checkpoint.appliesTo.id))
      add(
        errors,
        "dangling-reference",
        `Checkpoint ${id} references missing target`,
        `entities.checkpoints.${id}.appliesTo`,
      );
    if (checkpoint?.replacesId) {
      if (!checkpoints[checkpoint.replacesId])
        add(
          errors,
          "dangling-reference",
          `Checkpoint ${id} references missing replaced Checkpoint`,
          `entities.checkpoints.${id}.replacesId`,
        );
      else if (checkpoints[checkpoint.replacesId].replacedById !== id)
        add(
          errors,
          "reciprocal-link",
          `Checkpoint ${id} has a stale replaces link`,
          `entities.checkpoints.${id}.replacesId`,
        );
    }
    if (checkpoint?.replacedById) {
      if (!checkpoints[checkpoint.replacedById])
        add(
          errors,
          "dangling-reference",
          `Checkpoint ${id} references missing replacement`,
          `entities.checkpoints.${id}.replacedById`,
        );
      else if (checkpoints[checkpoint.replacedById].replacesId !== id)
        add(
          errors,
          "reciprocal-link",
          `Checkpoint ${id} has a stale replacement link`,
          `entities.checkpoints.${id}.replacedById`,
        );
    }
  }
  const evidence = entityMapAt(data, "evidence");
  for (const [id, item] of Object.entries(evidence)) {
    for (const [index, target] of (item?.appliesTo ?? []).entries())
      if (!entityExists(data, target.kind, target.id))
        add(
          errors,
          "dangling-reference",
          `Evidence ${id} references missing target`,
          `entities.evidence.${id}.appliesTo[${index}]`,
        );
    if (item?.supersedesId) {
      if (!evidence[item.supersedesId])
        add(
          errors,
          "dangling-reference",
          `Evidence ${id} references missing Evidence`,
          `entities.evidence.${id}.supersedesId`,
        );
      else if (evidence[item.supersedesId].supersededById !== id)
        add(
          errors,
          "reciprocal-link",
          `Evidence ${id} has a stale supersession link`,
          `entities.evidence.${id}.supersedesId`,
        );
    }
    if (item?.supersededById) {
      if (!evidence[item.supersededById])
        add(
          errors,
          "dangling-reference",
          `Evidence ${id} references missing replacement`,
          `entities.evidence.${id}.supersededById`,
        );
      else if (evidence[item.supersededById].supersedesId !== id)
        add(
          errors,
          "reciprocal-link",
          `Evidence ${id} has a stale replacement link`,
          `entities.evidence.${id}.supersededById`,
        );
    }
  }
  for (const [id, blocker] of Object.entries(entityMapAt(data, "blocker"))) {
    if (blocker?.appliesTo && !entityExists(data, blocker.appliesTo.kind, blocker.appliesTo.id))
      add(errors, "dangling-reference", `Blocker ${id} references missing target`, `entities.blockers.${id}.appliesTo`);
  }
  for (const [index, correction] of (data.entities?.corrections ?? []).entries()) {
    const target = entityMapAt(data, correction?.entityKind)?.[correction?.entityId];
    const targetPath = `entities.corrections[${index}]`;
    if (!target) {
      add(
        errors,
        "dangling-reference",
        `Correction references missing ${correction?.entityKind} ${correction?.entityId}`,
        `${targetPath}.entityId`,
      );
      continue;
    }
    if (correction.entityKind === "slice" && ACTIVE_SLICE_STATES.has(target.state))
      add(
        errors,
        "mutable-history",
        `Correction target Slice ${correction.entityId} is still active`,
        `${targetPath}.entityId`,
      );
    if (correction.entityKind === "checkpoint" && target.state === "upcoming")
      add(
        errors,
        "mutable-history",
        `Correction target Checkpoint ${correction.entityId} is still upcoming`,
        `${targetPath}.entityId`,
      );
    if (correction.entityKind === "decision" && target.state === "active")
      add(
        errors,
        "mutable-history",
        `Correction target Decision ${correction.entityId} is still active`,
        `${targetPath}.entityId`,
      );
    if (!CORRECTION_FIELDS[correction.entityKind]?.has(correction.field))
      add(
        errors,
        "invalid-correction-field",
        `Correction field is not correctable: ${correction.field}`,
        `${targetPath}.field`,
      );
    if (target[correction.field] !== correction.after)
      add(
        errors,
        "correction-mismatch",
        `Correction after value does not match ${correction.entityKind} ${correction.entityId}`,
        `${targetPath}.after`,
      );
    if (correction.before === correction.after)
      add(errors, "no-op-correction", "Correction must change the prior value", `${targetPath}.after`);
    for (const [evidenceIndex, evidenceId] of (correction.evidenceIds ?? []).entries())
      if (!entityExists(data, "evidence", evidenceId))
        add(
          errors,
          "dangling-reference",
          `Correction references missing Evidence ${evidenceId}`,
          `${targetPath}.evidenceIds[${evidenceIndex}]`,
        );
  }
}

function checkProposalOrder(data, errors) {
  const order = data.current?.proposalOrder ?? [];
  const proposals = entityMapAt(data, "proposal");
  const seen = new Set();
  for (const [index, id] of order.entries()) {
    if (seen.has(id))
      add(
        errors,
        "duplicate-proposal-order",
        `Proposal ${id} appears more than once`,
        `current.proposalOrder[${index}]`,
      );
    seen.add(id);
    if (!proposals[id])
      add(
        errors,
        "dangling-reference",
        `current.proposalOrder references missing Proposal ${id}`,
        `current.proposalOrder[${index}]`,
      );
    else if (proposals[id].state !== "proposed")
      add(errors, "proposal-order-state", `Proposal ${id} is not proposed`, `current.proposalOrder[${index}]`);
  }
  for (const [id, proposal] of Object.entries(proposals))
    if (proposal?.state === "proposed" && !seen.has(id))
      add(
        errors,
        "proposal-order-mismatch",
        `Proposed Proposal ${id} is missing from current.proposalOrder`,
        "current.proposalOrder",
      );
}

function checkDecisionLinks(data, errors) {
  const decisions = entityMapAt(data, "decision");
  for (const [id, decision] of Object.entries(decisions)) {
    if (decision?.supersedesId) {
      const target = decisions[decision.supersedesId];
      if (!target)
        add(
          errors,
          "dangling-reference",
          `Decision ${id} references missing Decision`,
          `entities.decisions.${id}.supersedesId`,
        );
      else if (target.supersededById !== id)
        add(
          errors,
          "reciprocal-link",
          `Decision ${id} has a stale supersession link`,
          `entities.decisions.${id}.supersedesId`,
        );
    }
    if (decision?.supersededById) {
      const target = decisions[decision.supersededById];
      if (!target)
        add(
          errors,
          "dangling-reference",
          `Decision ${id} references missing replacement`,
          `entities.decisions.${id}.supersededById`,
        );
      else if (target.supersedesId !== id)
        add(
          errors,
          "reciprocal-link",
          `Decision ${id} has a stale replacement link`,
          `entities.decisions.${id}.supersededById`,
        );
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const next = decisions[id]?.supersedesId;
    const cycle = next && decisions[next] ? visit(next) : false;
    visiting.delete(id);
    visited.add(id);
    return cycle;
  };
  for (const id of Object.keys(decisions))
    if (visit(id)) {
      add(errors, "reference-cycle", "Decision supersession links contain a cycle", `entities.decisions.${id}`);
      break;
    }
}

function checkCurrentSlices(data, errors) {
  const slices = entityMapAt(data, "slice");
  const blockers = entityMapAt(data, "blocker");
  const active = Object.values(slices).filter((slice) => ACTIVE_SLICE_STATES.has(slice?.state));
  if (active.length > 1) add(errors, "multiple-active-slices", "At most one Slice may be active", "entities.slices");
  const currentId = data.current?.currentSliceId;
  const upcomingIds = data.current?.upcomingCheckpointIds ?? [];
  for (const [index, checkpointId] of upcomingIds.entries()) {
    const checkpoint = entityMapAt(data, "checkpoint")[checkpointId];
    if (checkpoint) {
      if (checkpoint.state !== "upcoming")
        add(
          errors,
          "checkpoint-state-mismatch",
          `current.upcomingCheckpointIds contains non-upcoming Checkpoint ${checkpointId}`,
          `current.upcomingCheckpointIds[${index}]`,
        );
      if (currentId !== null && checkpoint.appliesTo?.kind === "slice" && checkpoint.appliesTo.id !== currentId)
        add(
          errors,
          "checkpoint-ownership",
          `current.upcomingCheckpointIds contains a Checkpoint for another Slice`,
          `current.upcomingCheckpointIds[${index}]`,
        );
    } else
      add(
        errors,
        "dangling-reference",
        `current.upcomingCheckpointIds references missing Checkpoint ${checkpointId}`,
        `current.upcomingCheckpointIds[${index}]`,
      );
  }
  if (currentId === null) {
    if (active.length)
      add(errors, "missing-current-slice", "An active Slice requires current.currentSliceId", "current.currentSliceId");
  } else {
    const current = slices[currentId];
    if (current) {
      if (!ACTIVE_SLICE_STATES.has(current.state))
        add(errors, "invalid-current-slice", `Current Slice ${currentId} is not active`, "current.currentSliceId");
      if (active.length === 1 && active[0].id !== currentId)
        add(
          errors,
          "current-slice-mismatch",
          "current.currentSliceId does not identify the active Slice",
          "current.currentSliceId",
        );
      if (current.state === "blocked") {
        const hasBlocker = Object.values(blockers).some(
          (blocker) =>
            (blocker?.state === "active" || blocker?.state === "resolved") &&
            blocker.appliesTo?.kind === "slice" &&
            blocker.appliesTo.id === currentId,
        );
        if (!hasBlocker)
          add(
            errors,
            "missing-blocker",
            `Blocked Current Slice ${currentId} requires a Blocker`,
            `entities.slices.${currentId}`,
          );
      }
    } else
      add(
        errors,
        "dangling-reference",
        `current.currentSliceId references missing Slice ${currentId}`,
        "current.currentSliceId",
      );
  }
  if ((data.record?.state === "completed" || data.record?.state === "abandoned") && currentId !== null)
    add(
      errors,
      "terminal-current-slice",
      "Terminal task states require current.currentSliceId to be null",
      "current.currentSliceId",
    );
}

function checkEntityMaps(data, errors) {
  if (!objectAt(data.entities, "entities", new Set(ENTITY_COLLECTIONS), ENTITY_COLLECTIONS, errors)) return;
  checkEntityMap(data, "proposals", checkProposal, errors);
  checkEntityMap(data, "slices", checkSlice, errors);
  checkEntityMap(data, "decisions", checkDecision, errors);
  checkEntityMap(data, "checkpoints", checkCheckpoint, errors);
  checkEntityMap(data, "evidence", checkEvidence, errors);
  checkEntityMap(data, "blockers", checkBlocker, errors);
  checkEntityMap(data, "notes", checkNote, errors);
  arrayAt(data.entities.corrections, "entities.corrections", errors, {
    required: true,
    item: (child, path, childErrors) => checkCorrection(child, path, childErrors),
  });
}

export function validateRecord(data) {
  const errors = [];
  if (!objectAt(data, "$", RECORD_KEYS, [...RECORD_KEYS], errors)) return errors;
  if (data.schemaVersion !== SCHEMA_VERSION)
    add(errors, "unsupported-schema", `schemaVersion must be ${SCHEMA_VERSION}`, "schemaVersion");
  checkRecordMetadata(data.record, errors);
  checkContext(data.context, errors);
  checkCurrent(data.current, errors);
  checkEntityMaps(data, errors);
  if (isObject(data.record) && isObject(data.current) && isObject(data.entities)) {
    checkReferences(data, errors);
    checkProposalOrder(data, errors);
    checkDecisionLinks(data, errors);
    checkCurrentSlices(data, errors);
  }
  return errors;
}

export function assertValidRecord(data) {
  const errors = validateRecord(data);
  if (errors.length) throw new RecordModelError(errors);
  return data;
}

export function isValidRecord(data) {
  return validateRecord(data).length === 0;
}

function isoTimestamp(value) {
  if (typeof value !== "string" || Number.isNaN(new Date(value).valueOf()))
    throw new RecordModelError([{ code: "invalid-timestamp", message: "timestamp must be valid", path: "timestamp" }]);
  return new Date(value).toISOString();
}

function normalizeStatement(value, index) {
  const statement = isObject(value) ? clone(value) : { text: String(value ?? "") };
  if (!statement.id) statement.id = `CTX-${String(index + 1).padStart(3, "0")}`;
  if (!statement.basisRefs) statement.basisRefs = [];
  return statement;
}

function normalizeBoundary(value, index) {
  const boundary = isObject(value) ? clone(value) : { text: String(value ?? "") };
  if (!boundary.id) boundary.id = `BND-${String(index + 1).padStart(3, "0")}`;
  return boundary;
}

export function createRecord(input = {}, { taskId = "T-001", timestamp = new Date().toISOString() } = {}) {
  if (!isObject(input))
    throw new RecordModelError([{ code: "invalid-input", message: "record input must be an object", path: "input" }]);
  const now = isoTimestamp(timestamp);
  const record = {
    schemaVersion: SCHEMA_VERSION,
    record: {
      id: taskId,
      name: input.name ?? input.taskName ?? "Working Record",
      state: input.state ?? "active",
      stateSource: input.stateSource ?? "",
      createdAt: now,
      updatedAt: now,
    },
    context: {
      goal: input.goal ?? "",
      sourceRefs: input.sourceRefs ?? [],
      settled: (input.settled ?? []).map(normalizeStatement),
      tentative: (input.tentative ?? []).map(normalizeStatement),
      open: (input.open ?? []).map(normalizeStatement),
      direction: input.direction ?? "",
      boundaries: (input.boundaries ?? []).map(normalizeBoundary),
    },
    current: {
      route: input.route ?? { owner: "Track Work", reason: "Maintain durable task memory" },
      currentSliceId: null,
      proposalOrder: [],
      upcomingCheckpointIds: [],
      nextAction: input.nextAction ?? "",
    },
    entities: {
      proposals: {},
      slices: {},
      decisions: {},
      checkpoints: {},
      evidence: {},
      blockers: {},
      notes: {},
      corrections: [],
    },
  };
  const errors = validateRecord(record);
  if (errors.length) throw new RecordModelError(errors);
  return record;
}

function collectIds(data, kind) {
  if (kind === "task") return [data.record?.id];
  if (kind === "context")
    return (data.context?.settled ?? [])
      .concat(data.context?.tentative ?? [], data.context?.open ?? [])
      .map((item) => item?.id);
  if (kind === "boundary") return (data.context?.boundaries ?? []).map((item) => item?.id);
  if (kind === "extension")
    return Object.values(data.entities?.slices ?? {}).flatMap((slice) =>
      (slice?.extensions ?? []).map((item) => item?.id),
    );
  const map = ENTITY_MAP_BY_KIND[kind];
  return map ? Object.values(data.entities?.[map] ?? {}).map((item) => item?.id) : [];
}

export function nextId(data, kind) {
  const prefix = ENTITY_PREFIXES[kind];
  if (!prefix)
    throw new RecordModelError([
      { code: "unknown-id-kind", message: `Unsupported entity kind: ${kind}`, path: "kind" },
    ]);
  const maximum = collectIds(data, kind).reduce((max, id) => {
    const match = ID_PATTERNS[kind]?.exec(id ?? "");
    return match ? Math.max(max, Number(match[0].slice(prefix.length + 1))) : max;
  }, 0);
  return `${prefix}-${String(maximum + 1).padStart(3, "0")}`;
}

export function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
