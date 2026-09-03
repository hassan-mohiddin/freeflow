export const SCHEMA_VERSION = 4;

export const TOP_LEVEL_SECTIONS = ["Current Context", "Current Work", "Future Work", "History", "Notes"];
export const CONTEXT_HEADINGS = [
  "Goal",
  "What defines this task",
  "Settled",
  "Tentative",
  "Open",
  "Current direction",
  "Boundaries",
];
export const HISTORY_HEADINGS = ["Decisions", "Checkpoints", "Slices"];

export const TASK_STATES = new Set(["active", "paused", "completed", "abandoned"]);
export const SLICE_TYPES = new Set(["learning", "delivery", "deepening"]);
export const CURRENT_SLICE_STATES = new Set(["in_progress", "paused"]);
export const HISTORICAL_SLICE_STATES = new Set(["completed", "blocked", "abandoned"]);
export const CHECKPOINT_TYPES = new Set(["independent_review", "local_commit", "user_decision", "continuity"]);
export const FUTURE_CHECKPOINT_STATES = new Set(["proposed", "pending", "deferred"]);
export const HISTORICAL_CHECKPOINT_STATES = new Set(["completed", "cancelled", "replaced"]);
export const DECISION_STATES = new Set(["active", "superseded", "retired"]);

export const ACTIVE_SLICE_FIELDS = new Set([
  "State",
  "Type",
  "Intended result",
  "Authority source",
  "Scope",
  "Expected evidence",
  "Stop condition",
  "Starting state",
  "Dependencies",
  "Reopened from",
]);
export const PROPOSED_SLICE_FIELDS = new Set(["State", "Type", "Intended result", "Expected evidence", "Dependencies"]);
export const FUTURE_CHECKPOINT_FIELDS = new Set(["State", "Type", "Condition", "Applies to"]);
export const HISTORICAL_CHECKPOINT_FIELDS = new Set([
  "State",
  "Type",
  "Condition",
  "Applies to",
  "Result",
  "Evidence",
  "Task effect",
  "Reason",
  "Replaced by",
]);
export const DECISION_FIELDS = new Set([
  "State",
  "Decision",
  "Established by",
  "Rationale",
  "Source references",
  "Consequences",
  "Revisit when",
  "Superseded by",
  "Retired because",
]);
export const HISTORICAL_SLICE_FIELDS = new Set([
  "State",
  "Type",
  "Intended result",
  "Authority source",
  "Result",
  "Evidence and limits",
  "Task effect",
  "Reopened from",
  "Resume when",
  "Reason",
  "Residual effects",
]);

export const IDS = {
  slice: /^S-(\d{3,})$/,
  checkpoint: /^C-(\d{3,})$/,
  decision: /^D-(\d{3,})$/,
};

export function heading(level, title) {
  return `${"#".repeat(level)} ${title}`;
}

export function canonicalLines(name, state = "active", lastUpdated = new Date().toISOString()) {
  return [
    `# Working Record: ${name}`,
    "",
    "Schema: 4",
    `State: ${state}`,
    `Last updated: ${lastUpdated}`,
    "",
    "## Current Context",
    "",
    "### Goal",
    "",
    "### What defines this task",
    "",
    "### Settled",
    "",
    "### Tentative",
    "",
    "### Open",
    "",
    "### Current direction",
    "",
    "### Boundaries",
    "",
    "## Current Work",
    "",
    "### Current Slice",
    "",
    "None",
    "",
    "### Next useful action",
    "",
    "## Future Work",
    "",
    "## History",
    "",
    "### Decisions",
    "",
    "### Checkpoints",
    "",
    "### Slices",
    "",
    "## Notes",
    "",
  ];
}

export function normalizeNewline(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

export function splitLines(text) {
  const newline = normalizeNewline(text);
  return { lines: text.split(/\r?\n/), newline };
}

export function joinLines(lines, newline) {
  return lines.join(newline);
}

export function parseId(id, kind) {
  const pattern = IDS[kind];
  return typeof id === "string" && pattern ? pattern.exec(id) : null;
}

export function nextId(usedIds, kind) {
  let next = 1;
  for (const id of usedIds) {
    const match = parseId(id, kind);
    if (match) next = Math.max(next, Number(match[1]) + 1);
  }
  return `${kind === "slice" ? "S" : kind === "checkpoint" ? "C" : "D"}-${String(next).padStart(3, "0")}`;
}

export function slugify(value) {
  const slug = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) throw new Error("Task name must contain at least one letter or digit");
  return slug;
}
