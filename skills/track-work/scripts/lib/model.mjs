import { createHash } from "node:crypto";
import {
  CHECKPOINT_RESULTS,
  CHECKPOINT_TYPES,
  DECISION_ID_PATTERN,
  ENTITY_ID_SUFFIX_PATTERN,
  hasDecisionContent,
  isSingleLineList,
  isSingleLineTitle,
  SLICE_ID_PATTERN,
  SLICE_LIST_FIELDS,
} from "./contract.mjs";

export { CHECKPOINT_RESULTS, CHECKPOINT_TYPES } from "./contract.mjs";

export const SCHEMA_VERSION = 2;
export const TASK_STATES = new Set(["Active", "Paused", "Completed", "Abandoned"]);
export const TASK_TRANSITIONS = new Map([
  ["Active", new Set(["Active", "Paused", "Completed", "Abandoned"])],
  ["Paused", new Set(["Paused", "Active", "Completed", "Abandoned"])],
  ["Completed", new Set(["Completed", "Active"])],
  ["Abandoned", new Set(["Abandoned", "Active"])],
]);
export const SLICE_STATES = new Set(["In progress", "Blocked"]);
export const HISTORICAL_SLICE_STATES = new Set(["Completed", "Blocked", "Abandoned"]);
export const SLICE_TYPES = new Set(["Learning", "Delivery", "Deepening"]);
export const DECISION_STATES = new Set(["Active", "Superseded", "Retired"]);
export const CONFIRMATIONS = new Set(["confirmed", "candidate", "unavailable"]);

export const TOP_LEVEL_SECTIONS = ["Current Context", "Current Work", "Proposed Slices", "History", "Notes"];
export const CONTEXT_FIELDS = [
  ["Goal", "goal"],
  ["What defines this task", "whatDefinesTask"],
  ["Settled", "settled"],
  ["Tentative", "tentative"],
  ["Open", "open"],
  ["Current direction", "currentDirection"],
  ["Boundaries", "boundaries"],
];
export const SLICE_FIELDS = [
  ["ID", "id"],
  ["Title", "title"],
  ["State", "state"],
  ["Type", "type"],
  ["Intended result", "intendedResult"],
  ["Authority source", "authoritySource"],
  ["Reason and scope", "reasonAndScope"],
  ["Expected evidence", "expectedEvidence"],
  ["Stop condition", "stopCondition"],
  ["Starting code or artifact state", "startingState"],
  ["Accepted extensions", "acceptedExtensions"],
  ["Dependencies", "dependencies"],
  ["Selected checkpoints", "selectedCheckpoints"],
  ["Blocker", "blocker"],
  ["Resume when", "resumeWhen"],
  ["Blocker history", "blockerHistory"],
  ["Pending boundaries", "pendingBoundaries"],
  ["Pending reviews", "pendingReviews"],
  ["Result", "result"],
  ["Evidence", "evidence"],
  ["Review summary", "reviewSummary"],
  ["Task effect", "taskEffect"],
];
export const SLICE_OPTIONAL_FIELDS = [["Reopen history", "reopenHistory"]];
export const PROPOSAL_FIELDS = [
  ["Type", "type"],
  ["Intended result", "intendedResult"],
  ["Expected evidence", "expectedEvidence"],
  ["Dependencies", "dependencies"],
  ["Selected checkpoints", "selectedCheckpoints"],
];
export const DECISION_FIELDS = [
  ["State", "state"],
  ["Decision", "decision"],
  ["Who decided or what established it", "establishedBy"],
  ["Rationale and sources", "rationale"],
  ["Consequences", "consequences"],
  ["Revisit when", "revisitWhen"],
  ["Supersedes", "supersedes"],
  ["Superseded by", "supersededBy"],
];
export const CHECKPOINT_FIELDS = [
  ["Type", "type"],
  ["Selected by", "selectedBy"],
  ["Condition", "condition"],
  ["Result", "result"],
  ["Judgment or decision", "judgment"],
  ["Evidence or result pointer", "evidence"],
  ["Effect on the task", "effect"],
];
export const HISTORY_SLICE_FIELDS = [
  ["State", "state"],
  ["Type", "type"],
  ["Intended result", "intendedResult"],
  ["Authority source", "authoritySource"],
  ["Accepted extensions and authority", "acceptedExtensions"],
  ["Dependencies", "dependencies"],
  ["Outcome", "outcome"],
  ["Evidence", "evidence"],
  ["Review summary", "reviewSummary"],
  ["Task effect", "taskEffect"],
  ["Abandonment reason", "abandonmentReason"],
  ["Blocker and required resolution", "blocker"],
];
export const HISTORY_SLICE_OPTIONAL_FIELDS = [["Reopen history", "reopenHistory"]];

export const ARRAY_FIELDS = new Set([
  "blockers",
  "upcomingCheckpoints",
  "acceptedExtensions",
  "selectedCheckpoints",
  "blockerHistory",
  "pendingBoundaries",
  "pendingReviews",
  "reopenHistory",
  "evidence",
  "dependencies",
]);

export class WorkingRecordError extends Error {
  constructor(code, message, details = {}, options = {}) {
    super(message);
    this.name = "WorkingRecordError";
    this.code = code;
    this.details = details;
    this.committed = options.committed === true;
    this.candidate = options.candidate;
    this.exitCode = options.exitCode ?? (this.committed ? 2 : 1);
  }
}
export function fail(code, message, details = {}) {
  throw new WorkingRecordError(code, message, details);
}

export function ensureString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export function ensureArray(value) {
  if (value === undefined || value === null || value === "") return [];
  if (Array.isArray(value)) return value.map((item) => (typeof item === "string" ? item : JSON.stringify(item)));
  return [String(value)];
}

export function clone(value) {
  return structuredClone(value);
}

export function changedSemanticPaths(before, after, path = "") {
  if (Object.is(before, after)) return [];
  if (before === null || after === null || typeof before !== "object" || typeof after !== "object")
    return [path || "$"];
  if (Array.isArray(before) || Array.isArray(after)) {
    if (!Array.isArray(before) || !Array.isArray(after)) return [path || "$"];
    const paths = [];
    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length; index += 1) {
      const beforeItem = before[index];
      const afterItem = after[index];
      let identity;
      let identityField;
      if (afterItem?.id !== undefined) {
        identity = afterItem.id;
        identityField = "id";
      } else if (beforeItem?.id !== undefined) {
        identity = beforeItem.id;
        identityField = "id";
      } else if (afterItem?.title !== undefined) {
        identity = afterItem.title;
        identityField = "title";
      } else if (beforeItem?.title !== undefined) {
        identity = beforeItem.title;
        identityField = "title";
      }
      let itemPath = `${path}[${index}]`;
      if (identity !== undefined) itemPath = `${path}[${identityField}=${JSON.stringify(identity)}]`;
      paths.push(...changedSemanticPaths(beforeItem, afterItem, itemPath));
    }
    return paths;
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const paths = [];
  for (const key of keys) {
    const childPath = path ? `${path}.${key}` : key;
    paths.push(...changedSemanticPaths(before[key], after[key], childPath));
  }
  return paths;
}

export function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function isoNow() {
  const injected = process.env.FREEFLOW_TEST_NOW ?? process.env.FREEFLOW_CLOCK;
  if (injected !== undefined) {
    const date = new Date(injected);
    if (Number.isNaN(date.valueOf())) fail("invalid-clock", `Injected clock is not a valid date: ${injected}`);
    return date.toISOString();
  }
  return new Date().toISOString();
}

export function failureInjection(kind) {
  const requested = process.env.FREEFLOW_TEST_FAILURE ?? process.env.FREEFLOW_INJECT_FAILURE;
  return requested === kind || requested === `post-commit-${kind}`;
}

export function normalizeLineEndings(text) {
  return text.replace(/\r\n?/g, "\n");
}
export function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

export function canonicalizeValue(value) {
  if (Array.isArray(value)) return value.map(canonicalizeValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([, child]) =>
          child !== undefined && child !== null && child !== "" && !(Array.isArray(child) && child.length === 0),
      )
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalizeValue(child)]),
  );
}

export function normalizeDecision(input, id) {
  return compactObject({
    id: input.id ?? id,
    title: ensureString(input.title, input.name ?? "Untitled decision"),
    state: input.state ?? "Active",
    decision: ensureString(input.decision),
    establishedBy: ensureString(input.establishedBy ?? input.whoDecided),
    rationale: ensureString(input.rationale ?? input.rationaleAndSources),
    consequences: ensureString(input.consequences),
    revisitWhen: ensureString(input.revisitWhen),
    supersedes: ensureString(input.supersedes),
    supersededBy: ensureString(input.supersededBy),
  });
}

export function normalizeProposal(input) {
  return compactObject({
    title: ensureString(input.title ?? input.name),
    type: input.type,
    intendedResult: ensureString(input.intendedResult ?? input.result),
    expectedEvidence: ensureString(input.expectedEvidence),
    dependencies: ensureArray(input.dependencies),
    selectedCheckpoints: ensureArray(input.selectedCheckpoints),
  });
}

export function normalizeCheckpoint(input) {
  return compactObject({
    title: ensureString(input.title ?? input.name),
    type: ensureString(input.type),
    selectedBy: ensureString(input.selectedBy),
    condition: ensureString(input.condition),
    result: ensureString(input.result),
    judgment: ensureString(input.judgment),
    evidence: ensureString(input.evidence),
    effect: ensureString(input.effect),
  });
}

export function normalizeSlice(input, id) {
  return compactObject({
    id: input.id ?? id,
    title: ensureString(input.title ?? input.name),
    state: input.state ?? "In progress",
    type: input.type,
    intendedResult: ensureString(input.intendedResult ?? input.result),
    authoritySource: ensureString(input.authoritySource ?? input.authority),
    reasonAndScope: ensureString(input.reasonAndScope ?? input.scope),
    expectedEvidence: ensureString(input.expectedEvidence),
    stopCondition: ensureString(input.stopCondition),
    startingState: ensureString(input.startingState ?? input.startingCodeOrArtifactState),
    acceptedExtensions: ensureArray(input.acceptedExtensions),
    dependencies: ensureArray(input.dependencies),
    selectedCheckpoints: ensureArray(input.selectedCheckpoints),
    blocker: input.blocker ?? null,
    resumeWhen: ensureString(input.resumeWhen),
    blockerHistory: ensureArray(input.blockerHistory),
    pendingBoundaries: ensureArray(input.pendingBoundaries),
    pendingReviews: ensureArray(input.pendingReviews),
    reopenHistory: ensureArray(input.reopenHistory),
    result: ensureString(input.currentResult ?? input.resultSummary),
    evidence: ensureArray(input.evidence),
    reviewSummary: ensureString(input.reviewSummary),
    taskEffect: ensureString(input.taskEffect),
  });
}

export function assertCompleteSlice(slice, operation) {
  const required = [
    ["title", "title"],
    ["type", "type"],
    ["intendedResult", "intended result"],
    ["authoritySource", "authority source"],
    ["reasonAndScope", "reason and scope"],
    ["expectedEvidence", "expected evidence"],
    ["stopCondition", "stop condition"],
  ];
  const missing = required.filter(([key]) => !String(slice?.[key] ?? "").trim()).map(([, label]) => label);
  if (missing.length) {
    fail("missing-slice-declarations", `${operation} requires complete Current Slice declarations`, { missing });
  }
}

function assertInputList(value, path) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    fail("invalid-input-type", `Field requires an array of strings: ${path}`, { path, expected: "string[]" });
  if (!isSingleLineList(value))
    fail("invalid-list-member", `List members must be single-line strings: ${path}`, { path });
}

export function createRecord(input, timestamp) {
  if (input.blockers !== undefined) assertInputList(input.blockers, "blockers");
  if (input.upcomingCheckpoints !== undefined) assertInputList(input.upcomingCheckpoints, "upcomingCheckpoints");
  if (input.currentSlice)
    for (const field of SLICE_LIST_FIELDS)
      if (input.currentSlice[field] !== undefined) assertInputList(input.currentSlice[field], `currentSlice.${field}`);
  const taskName = ensureString(input.taskName ?? input.name, "Working Record");
  const record = {
    schemaVersion: SCHEMA_VERSION,
    taskName,
    taskState: input.taskState ?? "Active",
    lastUpdated: timestamp,
    currentContext: {
      goal: ensureString(input.goal),
      whatDefinesTask: ensureString(input.whatDefinesTask ?? input.definesTask),
      settled: ensureString(input.settled ?? input.currentUnderstanding),
      tentative: ensureString(input.tentative),
      open: ensureString(input.open ?? input.openQuestions),
      currentDirection: ensureString(input.currentDirection),
      boundaries: ensureString(input.boundaries),
    },
    currentWork: {
      route: ensureString(input.currentRoute ?? input.route),
      currentSlice: null,
      blockers: ensureArray(input.blockers),
      upcomingCheckpoints: ensureArray(input.upcomingCheckpoints),
      nextAction: ensureString(input.nextAction ?? input.nextUsefulAction),
    },
    proposals: [],
    history: { decisions: [], checkpoints: [], slices: [] },
    notes: [],
  };
  if (input.currentSlice) {
    if (!input.authoritySource)
      fail("missing-authority", "An explicitly initialized Current Slice requires authoritySource");
    if (input.currentSlice.id !== undefined) fail("caller-supplied-id", "The script assigns Current Slice IDs");
    record.currentWork.currentSlice = normalizeSlice(
      { ...input.currentSlice, authoritySource: input.currentSlice.authoritySource ?? input.authoritySource },
      "S-001",
    );
    assertCompleteSlice(record.currentWork.currentSlice, "init");
  }
  return record;
}

function validateTimestamp(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    !Number.isNaN(new Date(value).valueOf())
  );
}

export function validateModel(data) {
  const errors = [];
  const add = (code, message, path) => errors.push({ code, message, ...(path ? { path } : {}) });
  if (data.schemaVersion !== SCHEMA_VERSION)
    add("unsupported-schema", `Schema must be ${SCHEMA_VERSION}`, "schemaVersion");
  if (!isSingleLineTitle(data.taskName))
    add("invalid-task-name", "Task name must be a non-empty single-line string", "taskName");
  if (!TASK_STATES.has(data.taskState)) add("invalid-task-state", `Invalid task state: ${data.taskState}`, "taskState");
  if (!validateTimestamp(data.lastUpdated))
    add("invalid-timestamp", `Invalid UTC Last updated timestamp: ${data.lastUpdated}`, "lastUpdated");
  if (!data.currentContext || !data.currentWork || !data.history)
    add("missing-current-state", "Current Context, Current Work, and History are required");
  const currentSlice = data.currentWork?.currentSlice;
  if (currentSlice) {
    const required = [
      ["title", "title"],
      ["type", "type"],
      ["intendedResult", "intended result"],
      ["authoritySource", "authority source"],
      ["reasonAndScope", "reason and scope"],
      ["expectedEvidence", "expected evidence"],
      ["stopCondition", "stop condition"],
    ];
    for (const [key, label] of required)
      if (!String(currentSlice[key] ?? "").trim()) add("missing-slice-declaration", `Current Slice requires ${label}`);
    if (!SLICE_ID_PATTERN.test(currentSlice.id ?? ""))
      add("invalid-slice-id", "Current Slice ID must use S-NNN", "currentWork.currentSlice.id");
    if (!SLICE_STATES.has(currentSlice.state))
      add(
        "invalid-slice-state",
        `Invalid current slice state: ${currentSlice.state}`,
        "currentWork.currentSlice.state",
      );
    if (!SLICE_TYPES.has(currentSlice.type))
      add("invalid-slice-type", `Invalid current slice type: ${currentSlice.type}`, "currentWork.currentSlice.type");
    if (currentSlice.state === "Blocked" && !currentSlice.blocker)
      add("missing-blocker", "Blocked Current Slice requires a blocker", "currentWork.currentSlice.blocker");
  }
  if ((data.taskState === "Completed" || data.taskState === "Abandoned") && currentSlice)
    add("terminal-current-slice", "Terminal task states require Current Slice: None", "currentWork.currentSlice");
  const sliceIds = new Set();
  for (const slice of [...(data.history.slices ?? []), ...(currentSlice ? [currentSlice] : [])]) {
    if (!SLICE_ID_PATTERN.test(slice.id ?? "")) add("invalid-slice-id", `Invalid slice ID: ${slice.id}`);
    if (sliceIds.has(slice.id)) add("duplicate-slice-id", `Duplicate slice ID: ${slice.id}`);
    sliceIds.add(slice.id);
    if (!isSingleLineTitle(slice.title)) add("invalid-slice-title", `Slice ${slice.id} requires a single-line title`);
    if (slice !== currentSlice && !HISTORICAL_SLICE_STATES.has(slice.state))
      add("invalid-historical-slice-state", `Invalid historical slice state: ${slice.state}`);
    if (!SLICE_TYPES.has(slice.type)) add("invalid-slice-type", `Invalid slice type: ${slice.type}`);
    if (slice.state === "Blocked" && slice !== currentSlice && !slice.blocker)
      add("missing-blocker", `Historical Blocked slice ${slice.id} requires blocker evidence`);
    if (slice.state === "Abandoned" && !String(slice.abandonmentReason ?? "").trim())
      add("missing-abandonment-reason", `Historical Abandoned slice ${slice.id} requires abandonment reason`);
  }
  const decisionIds = new Set();
  for (const decision of data.history.decisions ?? []) {
    if (!DECISION_ID_PATTERN.test(decision.id ?? "")) add("invalid-decision-id", `Invalid decision ID: ${decision.id}`);
    if (!isSingleLineTitle(decision.title))
      add("invalid-decision-title", `Decision ${decision.id} requires a single-line title`);
    if (!hasDecisionContent(decision))
      add("missing-decision-content", `Decision ${decision.id} requires decision, rationale, or consequences`);
    if (decisionIds.has(decision.id)) add("duplicate-decision-id", `Duplicate decision ID: ${decision.id}`);
    decisionIds.add(decision.id);
    if (!DECISION_STATES.has(decision.state))
      add("invalid-decision-state", `Invalid decision state: ${decision.state}`);
  }
  for (const decision of data.history.decisions ?? []) {
    if (decision.supersedes && !decisionIds.has(decision.supersedes))
      add("supersession-link", `Decision ${decision.id} supersedes unknown decision ${decision.supersedes}`);
    if (decision.supersededBy && !decisionIds.has(decision.supersededBy))
      add("supersession-link", `Decision ${decision.id} is superseded by unknown decision ${decision.supersededBy}`);
  }
  const checkpointTitles = new Set();
  for (const checkpoint of data.history.checkpoints ?? []) {
    if (!isSingleLineTitle(checkpoint.title))
      add("invalid-checkpoint-title", "Checkpoint requires a non-empty single-line title");
    if (checkpointTitles.has(checkpoint.title))
      add("duplicate-checkpoint", `Duplicate checkpoint: ${checkpoint.title}`);
    checkpointTitles.add(checkpoint.title);
    for (const field of ["type", "selectedBy", "condition", "result"])
      if (typeof checkpoint[field] !== "string" || !checkpoint[field].trim())
        add("missing-checkpoint-field", `Checkpoint ${checkpoint.title || "<untitled>"} requires ${field}`);
    if (checkpoint.type && !CHECKPOINT_TYPES.has(checkpoint.type))
      add("invalid-checkpoint-type", `Invalid checkpoint type: ${checkpoint.type}`);
    if (checkpoint.result && !CHECKPOINT_RESULTS.has(checkpoint.result))
      add("invalid-checkpoint-result", `Invalid checkpoint result: ${checkpoint.result}`);
    for (const field of ["judgment", "evidence", "effect"])
      if (checkpoint[field] !== undefined && typeof checkpoint[field] !== "string")
        add("invalid-checkpoint-field", `Checkpoint ${field} must be a string`);
  }
  const noteTitles = new Set();
  for (const note of data.notes ?? []) {
    if (!isSingleLineTitle(note.title)) add("invalid-note-title", "Note requires a non-empty single-line title");
    if (noteTitles.has(note.title)) add("duplicate-note", `Duplicate Note: ${note.title}`);
    noteTitles.add(note.title);
    if (typeof note.source !== "string" || !note.source.trim())
      add("missing-note-source", `Note ${note.title} requires a source`);
    if (typeof note.body !== "string" || !note.body.trim())
      add("missing-note-body", `Note ${note.title} requires a body`);
  }
  const proposalTitles = new Set();
  for (const proposal of data.proposals ?? []) {
    if (!isSingleLineTitle(proposal.title)) add("invalid-proposal-title", "Proposal title is required");
    if (typeof proposal.intendedResult !== "string" || !proposal.intendedResult.trim())
      add("missing-proposal-content", `Proposal ${proposal.title} requires an intended result`);
    if (typeof proposal.expectedEvidence !== "string" || !proposal.expectedEvidence.trim())
      add("missing-proposal-content", `Proposal ${proposal.title} requires expected evidence`);
    if (proposal.id || SLICE_ID_PATTERN.test(proposal.title ?? ""))
      add("numbered-proposal", `Proposal must remain unnumbered: ${proposal.title}`);
    if (!SLICE_TYPES.has(proposal.type)) add("invalid-proposal-type", `Invalid proposal type: ${proposal.type}`);
    if (proposalTitles.has(proposal.title)) add("duplicate-proposal", `Duplicate proposal: ${proposal.title}`);
    proposalTitles.add(proposal.title);
  }
  return errors;
}
function maxId(entities, prefix) {
  const marker = `${prefix}-`;
  return entities.reduce((max, entity) => {
    const suffix = typeof entity.id === "string" && entity.id.startsWith(marker) ? entity.id.slice(marker.length) : "";
    const value = ENTITY_ID_SUFFIX_PATTERN.test(suffix) ? Number(suffix) : 0;
    return Math.max(max, value);
  }, 0);
}

export function nextId(data, prefix) {
  let entities;
  if (prefix === "S") {
    entities = [...data.history.slices];
    if (data.currentWork.currentSlice) entities.push(data.currentWork.currentSlice);
  } else {
    entities = data.history.decisions;
  }
  return `${prefix}-${String(maxId(entities, prefix) + 1).padStart(3, "0")}`;
}
