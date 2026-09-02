import { ACTIVE_SLICE_STATES, SCHEMA_VERSION, assertValidRecord } from "./model.mjs";

const NULL_TOKEN = "[none]";
const EMPTY_LIST_TOKEN = "[empty]";
const TOP_LEVEL_SECTIONS = ["Current Context", "Current Work", "Proposed Slices", "History", "Notes"];

const FIELD_LABELS = new Map([
  ["Goal", "goal"],
  ["Source references", "sourceRefs"],
  ["Current direction", "direction"],
  ["Current route", "route"],
  ["Current Slice ID", "currentSliceId"],
  ["Proposal order", "proposalOrder"],
  ["Upcoming Checkpoints", "upcomingCheckpointIds"],
  ["Next useful action", "nextAction"],
  ["Origin Proposal", "originProposalId"],
  ["Activation sequence", "activationSequence"],
  ["Authority source", "authoritySource"],
  ["Reason and scope", "reasonAndScope"],
  ["Expected evidence", "expectedEvidence"],
  ["Dependencies", "dependencies"],
  ["Stop condition", "stopCondition"],
  ["Starting state", "startingState"],
  ["Opened at", "openedAt"],
  ["Resolution", "resolution"],
  ["Added scope", "addedScope"],
  ["Added evidence boundary", "addedEvidenceBoundary"],
  ["Stop-condition change", "stopConditionChange"],
  ["Accepted at", "acceptedAt"],
  ["Final state", "finalState"],
  ["Summary", "summary"],
  ["Evidence IDs", "evidenceIds"],
  ["Review summary", "reviewSummary"],
  ["Task effect", "taskEffect"],
  ["Blocker ID", "blockerId"],
  ["Reason", "reason"],
  ["Residual effects", "residualEffects"],
  ["Closed at", "closedAt"],
  ["State", "state"],
  ["Type", "type"],
  ["Intended result", "intendedResult"],
  ["Selected as Slice", "selectedAsSliceId"],
  ["Selected checkpoints", "selectedCheckpoints"],
  ["Withdrawal", "withdrawal"],
  ["Created at", "createdAt"],
  ["Updated at", "updatedAt"],
  ["Decision", "decision"],
  ["Established by", "establishedBy"],
  ["Rationale", "rationale"],
  ["Source refs", "sourceRefs"],
  ["Consequences", "consequences"],
  ["Revisit when", "revisitWhen"],
  ["Supersedes", "supersedesId"],
  ["Superseded by", "supersededById"],
  ["Retirement", "retirement"],
  ["Selected by", "selectedBy"],
  ["Condition", "condition"],
  ["Applies to", "appliesTo"],
  ["Replaces", "replacesId"],
  ["Replaced by", "replacedById"],
  ["Judgment", "judgment"],
  ["Claim", "claim"],
  ["Required boundary", "requiredBoundary"],
  ["Observer", "observer"],
  ["Check result", "checkResult"],
  ["Claim result", "claimResult"],
  ["Proves", "proves"],
  ["Does not prove", "doesNotProve"],
  ["Pointer", "pointer"],
  ["Observed at", "observedAt"],
  ["Retired at", "retiredAt"],
  ["Why unsafe", "whyUnsafe"],
  ["Required resolution", "requiredResolution"],
  ["Resume when", "resumeWhen"],
  ["Resolution source", "resolutionSource"],
  ["Resolved at", "resolvedAt"],
  ["Withdrawn at", "withdrawnAt"],
  ["Text", "text"],
  ["Basis refs", "basisRefs"],
  ["Source", "source"],
  ["Body", "body"],
  ["Owner", "owner"],
  ["Route reason", "reason"],
  ["Entity kind", "entityKind"],
  ["Entity ID", "entityId"],
  ["Field", "field"],
  ["Before", "before"],
  ["After", "after"],
]);

const CONTEXT_FIELDS = [
  ["Goal", "goal", "string"],
  ["Source references", "sourceRefs", "array"],
  ["Current direction", "direction", "string"],
];
const CURRENT_FIELDS = [
  ["Current route", "route", "route"],
  ["Current Slice ID", "currentSliceId", "nullable"],
  ["Proposal order", "proposalOrder", "array"],
  ["Upcoming Checkpoints", "upcomingCheckpointIds", "array"],
  ["Next useful action", "nextAction", "string"],
];
const SLICE_FIELDS = [
  ["Origin Proposal", "originProposalId", "nullable"],
  ["State", "state", "string"],
  ["Type", "type", "string"],
  ["Intended result", "intendedResult", "string"],
  ["Dependencies", "dependencies", "array"],
  ["Selected checkpoints", "selectedCheckpoints", "array"],
  ["Created at", "createdAt", "string"],
  ["Updated at", "updatedAt", "string"],
];
const PROPOSAL_FIELDS = [
  ["State", "state", "string"],
  ["Type", "type", "string"],
  ["Intended result", "intendedResult", "string"],
  ["Expected evidence", "expectedEvidence", "string"],
  ["Dependencies", "dependencies", "array"],
  ["Selected checkpoints", "selectedCheckpoints", "array"],
  ["Selected as Slice", "selectedAsSliceId", "nullable"],
  ["Created at", "createdAt", "string"],
  ["Updated at", "updatedAt", "string"],
];
const WITHDRAWAL_FIELDS = [
  ["Authority source", "authoritySource", "string"],
  ["Reason", "reason", "string"],
  ["Withdrawn at", "withdrawnAt", "string"],
];
const RETIREMENT_FIELDS = [
  ["Authority source", "authoritySource", "string"],
  ["Reason", "reason", "string"],
  ["Retired at", "retiredAt", "string"],
];
const DECISION_FIELDS = [
  ["State", "state", "string"],
  ["Decision", "decision", "string"],
  ["Established by", "establishedBy", "string"],
  ["Rationale", "rationale", "string"],
  ["Source refs", "sourceRefs", "array"],
  ["Consequences", "consequences", "string"],
  ["Revisit when", "revisitWhen", "string"],
  ["Supersedes", "supersedesId", "nullable"],
  ["Superseded by", "supersededById", "nullable"],
  ["Created at", "createdAt", "string"],
  ["Updated at", "updatedAt", "string"],
];
const CHECKPOINT_FIELDS = [
  ["State", "state", "string"],
  ["Type", "type", "string"],
  ["Selected by", "selectedBy", "string"],
  ["Condition", "condition", "string"],
  ["Applies to", "appliesTo", "ref"],
  ["Replaces", "replacesId", "nullable"],
  ["Replaced by", "replacedById", "nullable"],
  ["Created at", "createdAt", "string"],
  ["Updated at", "updatedAt", "string"],
];
const EVIDENCE_FIELDS = [
  ["Claim", "claim", "string"],
  ["Required boundary", "requiredBoundary", "string"],
  ["Observer", "observer", "string"],
  ["Check result", "checkResult", "string"],
  ["Claim result", "claimResult", "string"],
  ["Proves", "proves", "string"],
  ["Does not prove", "doesNotProve", "string"],
  ["Pointer", "pointer", "string"],
  ["Supersedes", "supersedesId", "nullable"],
  ["Superseded by", "supersededById", "nullable"],
  ["Applies to", "appliesTo", "refs"],
  ["Observed at", "observedAt", "string"],
];
const BLOCKER_FIELDS = [
  ["State", "state", "string"],
  ["Applies to", "appliesTo", "ref"],
  ["Why unsafe", "whyUnsafe", "string"],
  ["Required resolution", "requiredResolution", "string"],
  ["Resume when", "resumeWhen", "string"],
  ["Resolution source", "resolutionSource", "nullable"],
  ["Created at", "createdAt", "string"],
  ["Resolved at", "resolvedAt", "nullable"],
];
const NOTE_FIELDS = [
  ["Source", "source", "string"],
  ["Body", "body", "string"],
  ["Created at", "createdAt", "string"],
  ["Updated at", "updatedAt", "string"],
];
const EXTENSION_FIELDS = [
  ["Activation sequence", "activationSequence", "string"],
  ["Authority source", "authoritySource", "string"],
  ["Reason", "reason", "string"],
  ["Added scope", "addedScope", "string"],
  ["Added evidence boundary", "addedEvidenceBoundary", "string"],
  ["Stop-condition change", "stopConditionChange", "nullable"],
  ["Starting state", "startingState", "string"],
  ["Accepted at", "acceptedAt", "string"],
];
const ACTIVATION_FIELDS = [
  ["Authority source", "authoritySource", "string"],
  ["Reason and scope", "reasonAndScope", "string"],
  ["Expected evidence", "expectedEvidence", "string"],
  ["Stop condition", "stopCondition", "string"],
  ["Starting state", "startingState", "string"],
  ["Opened at", "openedAt", "string"],
];
const RESOLUTION_FIELDS = [
  ["Final state", "finalState", "string"],
  ["Summary", "summary", "string"],
  ["Evidence IDs", "evidenceIds", "array"],
  ["Review summary", "reviewSummary", "string"],
  ["Task effect", "taskEffect", "string"],
  ["Blocker ID", "blockerId", "nullable"],
  ["Authority source", "authoritySource", "nullable"],
  ["Reason", "reason", "nullable"],
  ["Residual effects", "residualEffects", "nullable"],
  ["Closed at", "closedAt", "string"],
];
const CHECKPOINT_RESOLUTION_FIELDS = [
  ["Judgment", "judgment", "string"],
  ["Decision", "decision", "string"],
  ["Evidence IDs", "evidenceIds", "array"],
  ["Task effect", "taskEffect", "string"],
  ["Reason", "reason", "string"],
  ["Resolved at", "resolvedAt", "string"],
];
const CORRECTION_FIELDS = [
  ["Entity kind", "entityKind", "string"],
  ["Entity ID", "entityId", "string"],
  ["Field", "field", "string"],
  ["Before", "before", "string"],
  ["After", "after", "string"],
  ["Reason", "reason", "string"],
  ["Authority source", "authoritySource", "string"],
  ["Evidence IDs", "evidenceIds", "array"],
  ["Created at", "createdAt", "string"],
];

export class MarkdownCodecError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "MarkdownCodecError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new MarkdownCodecError(code, message, details);
}

function normalizeLineEndings(text) {
  return text.replace(/\r\n?/g, "\n");
}

function heading(line) {
  const match = /^(#{1,6})[ \t]+(.+?)\s*$/.exec(line);
  return match ? { level: match[1].length, title: match[2] } : null;
}

function escapeTextLine(line) {
  if (line.startsWith("\\") || /^#{1,6}[ \t]+/.test(line) || line === NULL_TOKEN || line === EMPTY_LIST_TOKEN)
    return `\\${line}`;
  return line;
}

function unescapeTextLine(line) {
  if (line.startsWith("\\")) return line.slice(1);
  return line;
}

function encodeScalar(value) {
  if (value === null) return NULL_TOKEN;
  return escapeTextLine(String(value));
}

function encodeListItem(value) {
  return escapeTextLine(String(value));
}

function renderScalarField(label, value) {
  if (value === null) return `- ${label}: ${NULL_TOKEN}`;
  const lines = String(value).split("\n");
  const first = encodeScalar(lines[0]);
  const result = [`- ${label}:${first === "" ? " " : ` ${first}`}`];
  result.push(...lines.slice(1).map((line) => `  ${escapeTextLine(line)}`));
  return result.join("\n");
}

function renderListField(label, values) {
  if (!Array.isArray(values) || values.length === 0) return `- ${label}: ${EMPTY_LIST_TOKEN}`;
  return [`- ${label}:`, ...values.map((value) => `  - ${encodeListItem(value)}`)].join("\n");
}

function renderRef(value) {
  if (value === null) return NULL_TOKEN;
  return `${value.kind}:${value.id}`;
}

function renderRefField(label, value) {
  return renderScalarField(label, value === null ? null : renderRef(value));
}

function renderRefListField(label, values) {
  return renderListField(label, (values ?? []).map(renderRef));
}

const REQUIRED_FIELD_KEYS = {
  context: new Set(["goal", "direction"]),
  statement: new Set(["text"]),
  boundary: new Set(["text"]),
  slice: new Set(["state", "type", "intendedResult", "createdAt", "updatedAt"]),
  proposal: new Set(["state", "type", "intendedResult", "expectedEvidence", "createdAt", "updatedAt"]),
  decision: new Set([
    "state",
    "decision",
    "establishedBy",
    "rationale",
    "consequences",
    "revisitWhen",
    "createdAt",
    "updatedAt",
  ]),
  checkpoint: new Set(["state", "type", "selectedBy", "condition", "appliesTo", "createdAt", "updatedAt"]),
  evidence: new Set([
    "claim",
    "requiredBoundary",
    "observer",
    "checkResult",
    "claimResult",
    "proves",
    "doesNotProve",
    "pointer",
    "appliesTo",
    "observedAt",
  ]),
  blocker: new Set(["state", "appliesTo", "whyUnsafe", "requiredResolution", "resumeWhen", "createdAt"]),
  note: new Set(["source", "body", "createdAt", "updatedAt"]),
  extension: new Set([
    "activationSequence",
    "authoritySource",
    "reason",
    "addedScope",
    "addedEvidenceBoundary",
    "startingState",
    "acceptedAt",
  ]),
  activation: new Set([
    "authoritySource",
    "reasonAndScope",
    "expectedEvidence",
    "stopCondition",
    "startingState",
    "openedAt",
  ]),
  resolution: new Set(["finalState", "summary", "evidenceIds", "reviewSummary", "taskEffect", "closedAt"]),
  checkpointResolution: new Set(["judgment", "decision", "evidenceIds", "taskEffect", "reason", "resolvedAt"]),
  correction: new Set([
    "entityKind",
    "entityId",
    "field",
    "before",
    "after",
    "reason",
    "authoritySource",
    "evidenceIds",
    "createdAt",
  ]),
};

function isEmptyField(value) {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

function renderFields(value, definitions, requiredKeys = null) {
  return definitions.flatMap(([label, key, type]) => {
    if (requiredKeys && !requiredKeys.has(key) && isEmptyField(value[key])) return [];
    if (type === "array") return renderListField(label, value[key]);
    if (type === "ref") return renderRefField(label, value[key]);
    if (type === "refs") return renderRefListField(label, value[key]);
    return renderScalarField(label, value[key]);
  });
}

function renderNestedFields(label, value, definitions, requiredKeys = null) {
  const fields = renderFields(value, definitions, requiredKeys).map((line) =>
    line
      .split("\n")
      .map((childLine) => `  ${childLine}`)
      .join("\n"),
  );
  return [`- ${label}:`, ...fields].join("\n");
}

function renderStatement(statement) {
  return [
    `#### ${statement.id}`,
    ...renderFields(
      statement,
      [
        ["Text", "text", "string"],
        ["Basis refs", "basisRefs", "array"],
      ],
      REQUIRED_FIELD_KEYS.statement,
    ),
  ].join("\n");
}

function renderBoundary(boundary) {
  return [
    `#### ${boundary.id}`,
    ...renderFields(boundary, [["Text", "text", "string"]], REQUIRED_FIELD_KEYS.boundary),
  ].join("\n");
}

function renderEntityHeading(id, title, level = 4) {
  return `${"#".repeat(level)} ${id}${title === undefined ? "" : ` — ${title}`}`;
}

function renderResolution(resolution) {
  if (resolution === null || resolution === undefined) return "";
  return renderNestedFields("Resolution", resolution, RESOLUTION_FIELDS, REQUIRED_FIELD_KEYS.resolution);
}

function renderCheckpointResolution(resolution) {
  if (resolution === null || resolution === undefined) return "";
  return renderNestedFields(
    "Resolution",
    resolution,
    CHECKPOINT_RESOLUTION_FIELDS,
    REQUIRED_FIELD_KEYS.checkpointResolution,
  );
}

function renderExtension(extension) {
  return [
    renderEntityHeading(extension.id, undefined, 6),
    ...renderFields(extension, EXTENSION_FIELDS, REQUIRED_FIELD_KEYS.extension),
  ].join("\n");
}

function renderActivation(activation) {
  return [
    renderEntityHeading(`Activation ${activation.sequence}`, undefined, 6),
    ...renderFields(activation, ACTIVATION_FIELDS, REQUIRED_FIELD_KEYS.activation),
    renderResolution(activation.resolution),
  ]
    .filter(Boolean)
    .join("\n");
}

function renderEntityCollection(label, items, renderItem, headingLevel = 3) {
  if (items.length === 0) return "";
  return [`${"#".repeat(headingLevel)} ${label}`, ...items.map(renderItem)].join("\n");
}

function renderSlice(slice, level = 4) {
  return [
    renderEntityHeading(slice.id, slice.title, level),
    ...renderFields(slice, SLICE_FIELDS, REQUIRED_FIELD_KEYS.slice),
    renderEntityCollection("Extensions", slice.extensions, renderExtension, 5),
    renderEntityCollection("Activations", slice.activations, renderActivation, 5),
  ]
    .filter(Boolean)
    .join("\n");
}

function renderContext(context) {
  return [
    "## Current Context",
    ...renderFields(context, CONTEXT_FIELDS, REQUIRED_FIELD_KEYS.context),
    renderEntityCollection("Settled", context.settled, renderStatement),
    renderEntityCollection("Tentative", context.tentative, renderStatement),
    renderEntityCollection("Open", context.open, renderStatement),
    renderEntityCollection("Boundaries", context.boundaries, renderBoundary),
  ]
    .filter(Boolean)
    .join("\n");
}

function renderRoute(route) {
  return renderNestedFields("Current route", route, [
    ["Owner", "owner", "string"],
    ["Route reason", "reason", "string"],
  ]);
}

function renderCurrentWork(current, slices) {
  const currentSlice = current.currentSliceId === null ? null : slices[current.currentSliceId];
  return [
    "## Current Work",
    renderRoute(current.route),
    current.currentSliceId === null ? null : renderScalarField("Current Slice ID", current.currentSliceId),
    current.proposalOrder.length ? renderListField("Proposal order", current.proposalOrder) : null,
    current.upcomingCheckpointIds.length
      ? renderListField("Upcoming Checkpoints", current.upcomingCheckpointIds)
      : null,
    renderScalarField("Next useful action", current.nextAction),
    currentSlice
      ? ["### Current Slice", renderSlice(currentSlice)].join("\n")
      : ["### Current Slice", NULL_TOKEN].join("\n"),
  ]
    .filter(Boolean)
    .join("\n");
}

function renderProposal(proposal) {
  return [
    renderEntityHeading(proposal.id, proposal.title, 3),
    ...renderFields(proposal, PROPOSAL_FIELDS, REQUIRED_FIELD_KEYS.proposal),
    proposal.withdrawal === null || proposal.withdrawal === undefined
      ? null
      : renderNestedFields("Withdrawal", proposal.withdrawal, WITHDRAWAL_FIELDS),
  ]
    .filter(Boolean)
    .join("\n");
}

function renderDecision(decision) {
  const retirement =
    decision.retirement === undefined || decision.retirement === null
      ? null
      : renderNestedFields("Retirement", decision.retirement, RETIREMENT_FIELDS);
  return [
    renderEntityHeading(decision.id, decision.title),
    ...renderFields(decision, DECISION_FIELDS, REQUIRED_FIELD_KEYS.decision),
    retirement,
  ]
    .filter(Boolean)
    .join("\n");
}

function renderCheckpoint(checkpoint) {
  return [
    renderEntityHeading(checkpoint.id, checkpoint.title),
    ...renderFields(checkpoint, CHECKPOINT_FIELDS, REQUIRED_FIELD_KEYS.checkpoint),
    renderCheckpointResolution(checkpoint.resolution),
  ]
    .filter(Boolean)
    .join("\n");
}

function renderEvidence(item) {
  return [
    renderEntityHeading(item.id, undefined),
    ...renderFields(item, EVIDENCE_FIELDS, REQUIRED_FIELD_KEYS.evidence),
  ].join("\n");
}

function renderBlocker(blocker) {
  return [
    renderEntityHeading(blocker.id, undefined),
    ...renderFields(blocker, BLOCKER_FIELDS, REQUIRED_FIELD_KEYS.blocker),
  ].join("\n");
}

function renderCorrection(correction, index) {
  return [`#### Correction ${String(index + 1).padStart(3, "0")}`, ...renderFields(correction, CORRECTION_FIELDS)].join(
    "\n",
  );
}

function renderHistory(history, slices) {
  const historicalSlices = Object.values(slices).filter((slice) => !ACTIVE_SLICE_STATES.has(slice.state));
  return [
    "## History",
    renderEntityCollection("Slices", historicalSlices, (slice) => renderSlice(slice)),
    renderEntityCollection("Decisions", Object.values(history.decisions), renderDecision),
    renderEntityCollection("Checkpoints", Object.values(history.checkpoints), renderCheckpoint),
    renderEntityCollection("Evidence", Object.values(history.evidence), renderEvidence),
    renderEntityCollection("Blockers", Object.values(history.blockers), renderBlocker),
    renderEntityCollection("Corrections", history.corrections, (correction, index) =>
      renderCorrection(correction, index),
    ),
  ]
    .filter(Boolean)
    .join("\n");
}

function renderNote(note) {
  return [
    renderEntityHeading(note.id, note.title, 3),
    ...renderFields(note, NOTE_FIELDS, REQUIRED_FIELD_KEYS.note),
  ].join("\n");
}

export function renderRecord(record) {
  assertValidRecord(record);
  const header = [
    `# Working Record: ${record.record.name}`,
    "",
    `Task ID: ${record.record.id}`,
    `Schema: ${SCHEMA_VERSION}`,
    `State: ${record.record.state}`,
    `State source: ${encodeScalar(record.record.stateSource)}`,
    `Created at: ${record.record.createdAt}`,
    `Last updated: ${record.record.updatedAt}`,
    "",
  ];
  const body = [
    renderContext(record.context),
    renderCurrentWork(record.current, record.entities.slices),
    ["## Proposed Slices", ...Object.values(record.entities.proposals).map(renderProposal)].join("\n"),
    renderHistory(record.entities, record.entities.slices),
    ["## Notes", ...Object.values(record.entities.notes).map(renderNote)].join("\n"),
  ];
  return `${[...header, ...body].join("\n").trimEnd()}\n`;
}

function fieldKey(label, allowed, path) {
  const key = FIELD_LABELS.get(label);
  if (!key || !allowed.has(key)) fail("unknown-field", `Unknown field ${label} in ${path}`);
  return key;
}

function parseBulletFields(lines, allowed, path) {
  const fields = new Map();
  let current = null;
  for (const line of lines) {
    const match = /^- ([^:]+):(?:[ \t]?(.*))?$/.exec(line);
    if (match) {
      const key = fieldKey(match[1], allowed, path);
      if (fields.has(key)) fail("duplicate-field", `Duplicate field ${match[1]} in ${path}`);
      current = { key, lines: match[2] === undefined ? [] : [match[2]] };
      fields.set(key, current);
      continue;
    }
    if (!current) {
      if (line.trim()) fail("unowned-content", `Unowned content in ${path}: ${line}`);
      continue;
    }
    if (line.startsWith("  ")) current.lines.push(line.slice(2));
    else if (line === "") current.lines.push("");
    else fail("unowned-content", `Unindented field content in ${path}: ${line}`);
  }
  return fields;
}

function rawField(fields, key, path) {
  const field = fields.get(key);
  if (!field) fail("missing-field", `Missing field ${key} in ${path}`);
  return field.lines.map(unescapeTextLine);
}

function rawText(lines) {
  return lines.join("\n");
}

function parseScalar(fields, key, path, { nullable = false } = {}) {
  const lines = rawField(fields, key, path);
  const value = rawText(lines);
  if (nullable && value === NULL_TOKEN) return null;
  return value;
}

function parseArray(fields, key, path) {
  const lines = rawField(fields, key, path);
  if (lines.length === 1 && (lines[0] === EMPTY_LIST_TOKEN || lines[0] === NULL_TOKEN)) return [];
  return lines.map((line) => {
    if (!line.startsWith("- ")) fail("invalid-list", `List field ${key} contains non-list content in ${path}`);
    return unescapeTextLine(line.slice(2));
  });
}

function parseRefValue(value, path, { nullable = false } = {}) {
  if (nullable && value === NULL_TOKEN) return null;
  const match = /^([^:]+):(.+)$/.exec(value);
  if (!match) fail("invalid-reference", `Reference must use kind:id in ${path}`);
  return { kind: match[1], id: match[2] };
}

function parseRef(fields, key, path) {
  return parseRefValue(parseScalar(fields, key, path), `${path}.${key}`, { nullable: true });
}

function parseRefs(fields, key, path) {
  return parseArray(fields, key, path).map((value) => parseRefValue(value, `${path}.${key}`));
}

function parseNested(fields, key, allowed, path) {
  return parseBulletFields(rawField(fields, key, path), allowed, `${path}.${key}`);
}

function parseTypedFields(lines, definitions, path, defaults = {}) {
  const allowed = new Set(definitions.map(([, key]) => key));
  const fields = parseBulletFields(lines, allowed, path);
  const result = {};
  for (const [, key, type] of definitions) {
    if (!fields.has(key)) {
      if (Object.hasOwn(defaults, key)) {
        result[key] = structuredClone(defaults[key]);
        continue;
      }
      fail("missing-field", `Missing field ${key} in ${path}`);
    }
    if (type === "array") result[key] = parseArray(fields, key, path);
    else if (type === "ref") result[key] = parseRef(fields, key, path);
    else if (type === "refs") result[key] = parseRefs(fields, key, path);
    else result[key] = parseScalar(fields, key, path, { nullable: type === "nullable" });
  }
  return result;
}

function parseRoute(fields, path) {
  const nested = parseNested(fields, "route", new Set(["owner", "reason"]), path);
  return {
    owner: parseScalar(nested, "owner", `${path}.route`),
    reason: parseScalar(nested, "reason", `${path}.route`),
  };
}

function parseResolution(fields, path) {
  if (!fields.has("resolution")) return null;
  const value = parseScalar(fields, "resolution", path, { nullable: true });
  if (value === null) return null;
  const nested = parseNested(fields, "resolution", new Set(RESOLUTION_FIELDS.map(([, key]) => key)), path);
  return parseTypedFieldsFromMap(nested, RESOLUTION_FIELDS, `${path}.resolution`, {
    blockerId: null,
    authoritySource: null,
    reason: null,
    residualEffects: null,
  });
}

function parseTypedFieldsFromMap(fields, definitions, path, defaults = {}) {
  const result = {};
  for (const [, key, type] of definitions) {
    if (!fields.has(key)) {
      if (Object.hasOwn(defaults, key)) {
        result[key] = structuredClone(defaults[key]);
        continue;
      }
      fail("missing-field", `Missing field ${key} in ${path}`);
    }
    if (type === "array") result[key] = parseArray(fields, key, path);
    else if (type === "ref") result[key] = parseRef(fields, key, path);
    else if (type === "refs") result[key] = parseRefs(fields, key, path);
    else result[key] = parseScalar(fields, key, path, { nullable: type === "nullable" });
  }
  return result;
}

function splitHeadingBlocks(lines, level, path) {
  const preamble = [];
  const blocks = [];
  let current = null;
  for (const line of lines) {
    const found = heading(line);
    if (found && found.level < level) fail("malformed-structure", `Unexpected heading in ${path}: ${line}`);
    if (found && found.level === level) {
      current = { title: found.title, lines: [] };
      blocks.push(current);
      continue;
    }
    if (current) current.lines.push(line);
    else preamble.push(line);
  }
  return { preamble, blocks };
}

function assertKnownHeadingBlocks(blocks, allowed, path) {
  for (const block of blocks)
    if (!allowed.has(block.title)) fail("unknown-field", `Unknown heading ${block.title} in ${path}`);
}

function assertNoUnownedPreamble(preamble, path) {
  if (preamble.some((line) => line.trim())) fail("unowned-content", `Unowned content in ${path}`);
}

function exactBlock(blocks, title, path, { required = true } = {}) {
  const matches = blocks.filter((block) => block.title === title);
  if (matches.length > 1) fail("duplicate-section", `Duplicate ${title} in ${path}`);
  if (required && matches.length === 0) fail("missing-section", `Missing ${title} in ${path}`);
  return matches[0] ?? null;
}

function entityIdentity(title, path, { titleRequired = true } = {}) {
  const match = /^([A-Z]+-\d{3,})(?:\s+—\s+(.+))?$/.exec(title);
  if (!match) fail("invalid-entity-heading", `Invalid entity heading in ${path}: ${title}`);
  if (titleRequired && match[2] === undefined) fail("missing-title", `Entity heading requires a title in ${path}`);
  return { id: match[1], title: match[2] };
}

function parseStatement(block, path) {
  const id = block.title;
  if (!/^CTX-\d{3,}$/.test(id)) fail("invalid-entity-heading", `Invalid context statement ID in ${path}`);
  const parsed = parseTypedFields(
    block.lines,
    [
      ["Text", "text", "string"],
      ["Basis refs", "basisRefs", "array"],
    ],
    path,
    { basisRefs: [] },
  );
  return { id, ...parsed };
}

function parseBoundary(block, path) {
  const id = block.title;
  if (!/^BND-\d{3,}$/.test(id)) fail("invalid-entity-heading", `Invalid boundary ID in ${path}`);
  const parsed = parseTypedFields(block.lines, [["Text", "text", "string"]], path);
  return { id, ...parsed };
}

function parseExtension(block, path) {
  const id = block.title;
  if (!/^X-\d{3,}$/.test(id)) fail("invalid-entity-heading", `Invalid Extension ID in ${path}`);
  const parsed = parseTypedFields(block.lines, EXTENSION_FIELDS, path, { stopConditionChange: null });
  parsed.activationSequence = Number(parsed.activationSequence);
  return { id, ...parsed };
}

function parseActivation(block, path) {
  const match = /^Activation (\d+)$/.exec(block.title);
  if (!match) fail("invalid-entity-heading", `Invalid activation heading in ${path}`);
  const split = splitHeadingBlocks(block.lines, 7, path);
  if (split.blocks.length) fail("unknown-field", `Unexpected nested heading in activation ${path}`);
  const allowed = new Set([...ACTIVATION_FIELDS.map(([, key]) => key), "resolution"]);
  const fields = parseBulletFields(split.preamble, allowed, path);
  const activation = parseTypedFieldsFromMap(fields, ACTIVATION_FIELDS, path);
  activation.sequence = Number(match[1]);
  if (!Number.isInteger(activation.sequence)) fail("invalid-field", `Activation sequence is invalid in ${path}`);
  activation.resolution = parseResolution(fields, path);
  return activation;
}

function parseSlice(block, path) {
  const identity = entityIdentity(block.title, path);
  const split = splitHeadingBlocks(block.lines, 5, path);
  assertKnownHeadingBlocks(split.blocks, new Set(["Extensions", "Activations"]), path);
  const allowed = new Set([...SLICE_FIELDS.map(([, key]) => key), "extensions", "activations"]);
  const fields = parseBulletFields(split.preamble, allowed, path);
  const parsed = parseTypedFieldsFromMap(fields, SLICE_FIELDS, path, {
    originProposalId: null,
    dependencies: [],
    selectedCheckpoints: [],
  });
  const extensionsBlock = exactBlock(split.blocks, "Extensions", path, { required: false });
  const activationsBlock = exactBlock(split.blocks, "Activations", path, { required: false });
  const parseNestedEntities = (group, level, parser, fallback = []) => {
    if (!group || (group.lines.length === 1 && group.lines[0] === EMPTY_LIST_TOKEN)) return fallback;
    const nested = splitHeadingBlocks(group.lines, level, `${path}.${group.title}`);
    assertNoUnownedPreamble(nested.preamble, `${path}.${group.title}`);
    return nested.blocks.map(parser);
  };
  const extensions = parseNestedEntities(extensionsBlock, 6, (child) => parseExtension(child, `${path}.extensions`));
  const activations = parseNestedEntities(activationsBlock, 6, (child) =>
    parseActivation(child, `${path}.activations`),
  );
  return { id: identity.id, title: identity.title, ...parsed, extensions, activations };
}

function parseProposal(block, path) {
  const identity = entityIdentity(block.title, path);
  const fields = parseBulletFields(
    block.lines,
    new Set([...PROPOSAL_FIELDS.map(([, key]) => key), "withdrawal"]),
    path,
  );
  const parsed = parseTypedFieldsFromMap(fields, PROPOSAL_FIELDS, path, {
    dependencies: [],
    selectedCheckpoints: [],
    selectedAsSliceId: null,
  });
  if (fields.has("withdrawal")) {
    const withdrawal = parseScalar(fields, "withdrawal", path, { nullable: true });
    parsed.withdrawal =
      withdrawal === null
        ? null
        : parseTypedFieldsFromMap(
            parseNested(fields, "withdrawal", new Set(WITHDRAWAL_FIELDS.map(([, key]) => key)), path),
            WITHDRAWAL_FIELDS,
            `${path}.withdrawal`,
          );
  } else parsed.withdrawal = null;
  return { id: identity.id, title: identity.title, ...parsed };
}

function parseDecision(block, path) {
  const identity = entityIdentity(block.title, path);
  const fields = parseBulletFields(
    block.lines,
    new Set([...DECISION_FIELDS.map(([, key]) => key), "retirement"]),
    path,
  );
  const parsed = parseTypedFieldsFromMap(fields, DECISION_FIELDS, path, {
    sourceRefs: [],
    supersedesId: null,
    supersededById: null,
  });
  if (fields.has("retirement")) {
    const retirement = parseScalar(fields, "retirement", path, { nullable: true });
    parsed.retirement =
      retirement === null
        ? null
        : parseTypedFieldsFromMap(
            parseNested(fields, "retirement", new Set(RETIREMENT_FIELDS.map(([, key]) => key)), path),
            RETIREMENT_FIELDS,
            `${path}.retirement`,
          );
  } else parsed.retirement = null;
  return { id: identity.id, title: identity.title, ...parsed };
}

function parseCheckpoint(block, path) {
  const identity = entityIdentity(block.title, path);
  const fields = parseBulletFields(
    block.lines,
    new Set([...CHECKPOINT_FIELDS.map(([, key]) => key), "resolution"]),
    path,
  );
  const parsed = parseTypedFieldsFromMap(fields, CHECKPOINT_FIELDS, path, {
    replacesId: null,
    replacedById: null,
  });
  if (fields.has("resolution")) {
    const resolution = parseScalar(fields, "resolution", path, { nullable: true });
    parsed.resolution =
      resolution === null
        ? null
        : parseTypedFieldsFromMap(
            parseNested(fields, "resolution", new Set(CHECKPOINT_RESOLUTION_FIELDS.map(([, key]) => key)), path),
            CHECKPOINT_RESOLUTION_FIELDS,
            `${path}.resolution`,
          );
  } else parsed.resolution = null;
  return { id: identity.id, title: identity.title, ...parsed };
}

function parseEvidence(block, path) {
  const identity = entityIdentity(block.title, path, { titleRequired: false });
  return {
    id: identity.id,
    ...parseTypedFields(block.lines, EVIDENCE_FIELDS, path, {
      supersedesId: null,
      supersededById: null,
    }),
  };
}

function parseBlocker(block, path) {
  const identity = entityIdentity(block.title, path, { titleRequired: false });
  return {
    id: identity.id,
    ...parseTypedFields(block.lines, BLOCKER_FIELDS, path, {
      resolutionSource: null,
      resolvedAt: null,
    }),
  };
}

function parseCorrection(block, path) {
  if (!/^Correction \d{3,}$/.test(block.title)) fail("invalid-entity-heading", `Invalid correction heading in ${path}`);
  return parseTypedFields(block.lines, CORRECTION_FIELDS, path);
}

function parseNote(block, path) {
  const identity = entityIdentity(block.title, path);
  return { id: identity.id, title: identity.title, ...parseTypedFields(block.lines, NOTE_FIELDS, path) };
}

function parseContext(section) {
  const split = splitHeadingBlocks(section.lines, 3, "Current Context");
  assertKnownHeadingBlocks(split.blocks, new Set(["Settled", "Tentative", "Open", "Boundaries"]), "Current Context");
  const context = parseTypedFields(split.preamble, CONTEXT_FIELDS, "Current Context", { sourceRefs: [] });
  const parseStatementGroup = (title) => {
    const block = exactBlock(split.blocks, title, "Current Context", { required: false });
    if (!block || (block.lines.length === 1 && block.lines[0] === EMPTY_LIST_TOKEN)) return [];
    const nested = splitHeadingBlocks(block.lines, 4, `Current Context.${title}`);
    assertNoUnownedPreamble(nested.preamble, `Current Context.${title}`);
    return nested.blocks.map((item) => parseStatement(item, `Current Context.${title}`));
  };
  context.settled = parseStatementGroup("Settled");
  context.tentative = parseStatementGroup("Tentative");
  context.open = parseStatementGroup("Open");
  const boundaries = exactBlock(split.blocks, "Boundaries", "Current Context", { required: false });
  if (!boundaries || (boundaries.lines.length === 1 && boundaries.lines[0] === EMPTY_LIST_TOKEN))
    context.boundaries = [];
  else {
    const nested = splitHeadingBlocks(boundaries.lines, 4, "Current Context.Boundaries");
    assertNoUnownedPreamble(nested.preamble, "Current Context.Boundaries");
    context.boundaries = nested.blocks.map((item) => parseBoundary(item, "Current Context.Boundaries"));
  }
  return context;
}

function parseCurrentWork(section, slices) {
  const split = splitHeadingBlocks(section.lines, 3, "Current Work");
  assertKnownHeadingBlocks(split.blocks, new Set(["Current Slice"]), "Current Work");
  const fields = parseBulletFields(split.preamble, new Set(CURRENT_FIELDS.map(([, key]) => key)), "Current Work");
  const declaredCurrentSliceId = fields.has("currentSliceId")
    ? parseScalar(fields, "currentSliceId", "Current Work", { nullable: true })
    : null;
  const current = {
    route: parseRoute(fields, "Current Work"),
    currentSliceId: declaredCurrentSliceId,
    proposalOrder: fields.has("proposalOrder") ? parseArray(fields, "proposalOrder", "Current Work") : [],
    upcomingCheckpointIds: fields.has("upcomingCheckpointIds")
      ? parseArray(fields, "upcomingCheckpointIds", "Current Work")
      : [],
    nextAction: parseScalar(fields, "nextAction", "Current Work"),
  };
  const sliceBlock = exactBlock(split.blocks, "Current Slice", "Current Work");
  if (sliceBlock.lines.length === 1 && sliceBlock.lines[0] === NULL_TOKEN) {
    if (declaredCurrentSliceId !== null)
      fail("slice-mismatch", "Current Slice ID must be empty when Current Slice is [none]");
    current.currentSliceId = null;
  } else {
    const nested = splitHeadingBlocks(sliceBlock.lines, 4, "Current Work.Current Slice");
    assertNoUnownedPreamble(nested.preamble, "Current Work.Current Slice");
    if (nested.blocks.length !== 1)
      fail("invalid-current-slice", "Current Slice must contain exactly one Slice entity");
    const slice = parseSlice(nested.blocks[0], "Current Work.Current Slice");
    if (declaredCurrentSliceId !== slice.id)
      fail("slice-mismatch", "Current Slice ID must match the nested Current Slice entity");
    slices[slice.id] = slice;
    current.currentSliceId = slice.id;
  }
  return current;
}

function parseHistory(section) {
  const groups = splitHeadingBlocks(section.lines, 3, "History");
  assertKnownHeadingBlocks(
    groups.blocks,
    new Set(["Slices", "Decisions", "Checkpoints", "Evidence", "Blockers", "Corrections"]),
    "History",
  );
  const history = { decisions: {}, checkpoints: {}, evidence: {}, blockers: {}, corrections: [] };
  const parseMap = (title, key, parser) => {
    const group = exactBlock(groups.blocks, title, "History", { required: false });
    if (!group || (group.lines.length === 1 && group.lines[0] === EMPTY_LIST_TOKEN)) return;
    const nested = splitHeadingBlocks(group.lines, 4, `History.${title}`);
    assertNoUnownedPreamble(nested.preamble, `History.${title}`);
    for (const block of nested.blocks) {
      const entity = parser(block, `History.${title}`);
      if (Object.hasOwn(history[key], entity.id))
        fail("duplicate-entity", `Duplicate ${entity.id} in History.${title}`);
      history[key][entity.id] = entity;
    }
  };
  const slices = [];
  const sliceGroup = exactBlock(groups.blocks, "Slices", "History", { required: false });
  if (sliceGroup && !(sliceGroup.lines.length === 1 && sliceGroup.lines[0] === EMPTY_LIST_TOKEN)) {
    const nested = splitHeadingBlocks(sliceGroup.lines, 4, "History.Slices");
    assertNoUnownedPreamble(nested.preamble, "History.Slices");
    for (const block of nested.blocks) slices.push(parseSlice(block, "History.Slices"));
  }
  parseMap("Decisions", "decisions", parseDecision);
  parseMap("Checkpoints", "checkpoints", parseCheckpoint);
  parseMap("Evidence", "evidence", parseEvidence);
  parseMap("Blockers", "blockers", parseBlocker);
  const correctionGroup = exactBlock(groups.blocks, "Corrections", "History", { required: false });
  if (correctionGroup && !(correctionGroup.lines.length === 1 && correctionGroup.lines[0] === EMPTY_LIST_TOKEN)) {
    const nested = splitHeadingBlocks(correctionGroup.lines, 4, "History.Corrections");
    assertNoUnownedPreamble(nested.preamble, "History.Corrections");
    history.corrections = nested.blocks.map((block) => parseCorrection(block, "History.Corrections"));
  }
  return { slices, ...history };
}

export function parseRecord(text) {
  if (typeof text !== "string") fail("invalid-input", "Record source must be text");
  const normalized = normalizeLineEndings(text);
  const lines = normalized.endsWith("\n") ? normalized.slice(0, -1).split("\n") : normalized.split("\n");
  const name = /^# Working Record:\s*(.+)$/.exec(lines[0] ?? "")?.[1];
  const taskId = /^Task ID:\s*(T-\d{3,})$/.exec(lines[2] ?? "");
  const schema = /^Schema:\s*(\d+)$/.exec(lines[3] ?? "");
  const state = /^State:\s*(.*)$/.exec(lines[4] ?? "");
  const stateSource = /^State source:\s*(.*)$/.exec(lines[5] ?? "");
  const createdAt = /^Created at:\s*(.*)$/.exec(lines[6] ?? "");
  const updatedAt = /^Last updated:\s*(.*)$/.exec(lines[7] ?? "");
  if (
    !name ||
    !taskId ||
    !schema ||
    !state ||
    !stateSource ||
    !createdAt ||
    !updatedAt ||
    lines[1] !== "" ||
    lines[8] !== ""
  )
    fail("malformed-header", "Record header is not in the canonical schema-v3 order");
  if (Number(schema[1]) !== SCHEMA_VERSION) fail("unsupported-schema", `Unsupported record schema: ${schema[1]}`);
  const firstSection = lines.findIndex((line, index) => index >= 9 && /^## /.test(line));
  if (firstSection < 0) fail("missing-section", "Record has no top-level sections");
  if (lines.slice(9, firstSection).some((line) => line.trim()))
    fail("unowned-content", "Content appears before the first section");
  const sectionBlocks = splitHeadingBlocks(lines.slice(firstSection), 2, "record");
  if (sectionBlocks.preamble.some((line) => line.trim()))
    fail("unowned-content", "Content appears before the first section");
  if (sectionBlocks.blocks.map((block) => block.title).join("\u0000") !== TOP_LEVEL_SECTIONS.join("\u0000"))
    fail("invalid-section-order", "Record sections must follow the schema-v3 order");
  const sections = Object.fromEntries(sectionBlocks.blocks.map((block) => [block.title, block]));
  const context = parseContext(sections["Current Context"]);
  const slices = {};
  const current = parseCurrentWork(sections["Current Work"], slices);
  const proposalBlocks = splitHeadingBlocks(sections["Proposed Slices"].lines, 3, "Proposed Slices");
  if (proposalBlocks.preamble.some((line) => line.trim()))
    fail("unowned-content", "Unowned content in Proposed Slices");
  const proposals = {};
  for (const block of proposalBlocks.blocks) {
    const proposal = parseProposal(block, "Proposed Slices");
    if (Object.hasOwn(proposals, proposal.id)) fail("duplicate-entity", `Duplicate ${proposal.id} in Proposed Slices`);
    proposals[proposal.id] = proposal;
  }
  const parsedHistory = parseHistory(sections.History);
  for (const slice of parsedHistory.slices) {
    if (Object.hasOwn(slices, slice.id)) fail("duplicate-entity", `Duplicate ${slice.id} in record history`);
    slices[slice.id] = slice;
  }
  const notesBlock = sections.Notes;
  const noteBlocks = splitHeadingBlocks(notesBlock.lines, 3, "Notes");
  if (noteBlocks.preamble.some((line) => line.trim())) fail("unowned-content", "Unowned content in Notes");
  const notes = {};
  for (const block of noteBlocks.blocks) {
    const note = parseNote(block, "Notes");
    if (Object.hasOwn(notes, note.id)) fail("duplicate-entity", `Duplicate ${note.id} in Notes`);
    notes[note.id] = note;
  }
  const record = {
    schemaVersion: SCHEMA_VERSION,
    record: {
      id: taskId[1],
      name,
      state: state[1],
      stateSource: unescapeTextLine(stateSource[1]),
      createdAt: createdAt[1],
      updatedAt: updatedAt[1],
    },
    context,
    current,
    entities: {
      proposals,
      slices,
      decisions: parsedHistory.decisions,
      checkpoints: parsedHistory.checkpoints,
      evidence: parsedHistory.evidence,
      blockers: parsedHistory.blockers,
      notes,
      corrections: parsedHistory.corrections,
    },
  };
  assertValidRecord(record);
  return record;
}

export {
  renderContext,
  renderCurrentWork,
  renderStatement,
  renderBoundary,
  renderProposal,
  renderSlice,
  renderDecision,
  renderCheckpoint,
  renderEvidence,
  renderBlocker,
  renderCorrection,
  renderNote,
};
