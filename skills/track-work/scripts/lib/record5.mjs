// Schema 5: a task folder's record.md, history.md and decisions.md (the Spec's sections 5 to 8). record.md holds the
// state, rewritten as the work moves; history.md holds one entry per closed Slice, delegation or agreement, appended by
// the command that closes it and never edited; decisions.md holds the open agreement's decision list. Schema 4 stays in
// document.mjs and transitions.mjs until its records are migrated (T9).

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const SCHEMA5 = 5;
export const HISTORY_FILE = "history.md";
export const DECISIONS_FILE = "decisions.md";

export const TASK_STATES5 = new Set(["active", "paused", "completed", "abandoned"]);
export const CONTEXT5_HEADINGS = ["Goal", "Settled", "Open"];
export const WORK5_HEADINGS = [
  "Delegations",
  "Space",
  "In flight",
  "Defined by",
  "Read on recovery",
  "Read when",
  "Next action",
];
export const TOP5_SECTIONS = ["Current Context", "Current Work", "Future Work"];

/**
 * The parts of the record with a fixed budget in words, in every mode and window (P32); the rest of the record shares
 * the recovery budget (budget5.mjs). Tuned by the continuity test.
 */
export const FIXED_BUDGETS = { "Current Context": 600, "Future Work": 300 };
export const CUE_WORDS = 25;
export const BUDGET_MODES = new Set(["normal", "expanded"]);

/** In flight's lines (P59): where the step in progress stands, and what the next step rests on, labelled as on Pi. */
export const IN_FLIGHT_LABELS = ["Now", "Observed", "Hypothesis", "Dropped", "Pending", "Carry"];
const IN_FLIGHT_LINE = new RegExp(`^- (${IN_FLIGHT_LABELS.join("|")}):\\s+\\S`);
/** A Carry line: `- Carry: <path> (lines 40–118) — why`, the lines optional. */
const CARRY_LINE = /^- Carry:\s+(\S+)(?:\s+\(lines?\s+(\d+)(?:\s*[–-]\s*(\d+))?\))?\s+—\s+\S/;

export const SLICE5_ORDER = [
  "State",
  "Opened",
  "Under",
  "Result wanted",
  "Scope",
  "Done when",
  "Stop if",
  "Started from",
  "Waits on",
  "Dependencies",
  "Predicted",
  "Measured",
];
const SLICE5_REQUIRED = ["State", "Opened", "Under", "Result wanted", "Scope", "Done when", "Stop if", "Started from"];
export const SLICE5_STATES = new Set(["in_progress", "paused"]);
export const PROPOSED5_ORDER = ["Result wanted", "Done when", "Dependencies"];

/** A Material update is one line: a kind and a pointer (the Spec's section 6). */
export const UPDATE_KINDS = new Set([
  "Evidence (observed)",
  "Evidence (reported)",
  "Result",
  "Review",
  "Review gate",
  "Contradiction",
  "Blocker",
  "Correction",
  "Paused",
  "Resumed",
  "Extension",
]);

export const ENTRY_KINDS = { S: "slice", A: "agreement", D: "delegation" };
export const CLOSED_STATES = {
  slice: new Set(["completed", "blocked", "abandoned"]),
  agreement: new Set(["completed", "ended", "replaced"]),
  delegation: new Set(["accepted", "sent back", "stopped"]),
};
export const ENTRY_ORDER = {
  slice: [
    "State",
    "Dates",
    "Recorded",
    "Cue",
    "Under",
    "Result wanted",
    "Result",
    "Evidence",
    "Task effect",
    "Resume when",
    "Reason",
    "Predicted",
    "Measured",
    "Updates",
  ],
  agreement: ["State", "Dates", "Cue", "Lines", "Updates", "Decisions", "Result", "Task effect"],
  delegation: [
    "State",
    "Dates",
    "Cue",
    "Under",
    "From",
    "Kind",
    "Agent",
    "Tokens",
    "Minutes",
    "Measured",
    "Result",
    "Task effect",
    "Merge commit",
    "Return",
  ],
};
const ENTRY_REQUIRED = {
  slice: ["State", "Dates", "Cue", "Under", "Result wanted", "Result", "Evidence", "Task effect"],
  agreement: ["State", "Dates", "Cue", "Lines", "Result", "Task effect"],
  delegation: ["State", "Dates", "Cue", "Under", "Kind", "Agent", "Result", "Return"],
};
/** A correction to a closed entry is appended inside it as one more Correction line, never by editing it. */
const CORRECTION = "Correction";

export class Record5Error extends Error {
  constructor(code, message) {
    super(message);
    this.name = "Record5Error";
    this.code = code;
  }
}

function fail(code, message) {
  throw new Record5Error(code, message);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const FIELD = /^- ([A-Z][A-Za-z ]*?(?: \([a-z]+\))?):(?:[ \t]+(.*))?$/;
export const DELEGATION_LINE = /^- (D-\d{3,}(?:\.\d+)*) — \S/;

export function isDate(value) {
  return DATE.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function wordCount(lines) {
  return lines
    .filter((line) => !/^#{1,6}\s/.test(line))
    .join(" ")
    .split(/\s+/)
    .filter((word) => word && word !== "-").length;
}

/** Whether text is a cue: when the entry matters, not what it holds, starting "read when", within CUE_WORDS. */
export function cueProblem(cue) {
  if (!/^read when\s+\S/i.test(cue ?? "")) return 'a cue starts "read when" and says when the entry matters';
  const words = cue.split(/\s+/).filter(Boolean).length;
  return words > CUE_WORDS ? `a cue is at most ${CUE_WORDS} words; this one has ${words}` : null;
}

export function schemaOf(text) {
  const match = /^Schema:\s*(\d+)/m.exec(String(text).split(/\r?\n/).slice(0, 12).join("\n"));
  return match ? Number(match[1]) : null;
}

function headingAt(line) {
  const match = /^(#{1,6})[ \t]+(.+?)\s*$/.exec(line);
  return match ? { level: match[1].length, title: match[2] } : null;
}

function splitSections(lines, start, end, level, { preamble = false } = {}) {
  const found = [];
  for (let index = start; index < end; index += 1) {
    const heading = headingAt(lines[index]);
    if (heading && heading.level < level) fail("malformed-structure", `Unexpected heading: ${lines[index]}`);
    if (heading?.level === level) found.push({ index, title: heading.title });
    else if (!found.length && !preamble && lines[index].trim())
      fail("unowned-content", `Text outside any ${"#".repeat(level)} heading: ${lines[index]}`);
  }
  return found.map((item, position) => ({
    ...item,
    start: item.index + 1,
    end: found[position + 1]?.index ?? end,
  }));
}

function trimBlank(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start += 1;
  while (end > start && lines[end - 1].trim() === "") end -= 1;
  return lines.slice(start, end);
}

/**
 * The fields of a block, then its one-line updates when updateKinds is given. A field's value may continue on lines
 * indented two spaces; an update is one line. Unknown names, fields after updates, and stray text fail.
 */
export function parseFields5(lines, start, end, { fields, updateKinds = null, repeatable = null, path }) {
  const values = new Map();
  const updates = [];
  const repeats = [];
  let current = null;
  for (let index = start; index < end; index += 1) {
    const line = lines[index];
    if (line.trim() === "") continue;
    if (headingAt(line)) fail("malformed-structure", `Unexpected heading in ${path}: ${line}`);
    const match = FIELD.exec(line);
    if (match) {
      const [, name, inline = ""] = match;
      if (fields.has(name)) {
        if (updates.length) fail("malformed-field", `In ${path}, field ${name} comes after the updates: ${line}`);
        if (values.has(name)) fail("duplicate-field", `Duplicate field ${name} in ${path}`);
        current = { name, start: index, lines: inline ? [inline] : [] };
        values.set(name, current);
        continue;
      }
      if (updateKinds?.has(name)) {
        if (!inline.trim()) fail("empty-field", `Empty update ${name} in ${path}`);
        updates.push({ index, kind: name, text: inline.trim() });
        current = null;
        continue;
      }
      if (repeatable === name) {
        if (!inline.trim()) fail("empty-field", `Empty ${name} in ${path}`);
        repeats.push({ index, text: inline.trim() });
        current = null;
        continue;
      }
      const allowed = [...fields, ...(updateKinds ?? [])].join(", ");
      fail("unknown-field", `Unknown field ${name} in ${path}; allowed: ${allowed}`);
    }
    if (line.startsWith("  ") && current) {
      current.lines.push(line.slice(2));
      continue;
    }
    if (line.startsWith("  ") && updates.length)
      fail("malformed-field", `An update is one line in ${path}; put the detail in the file it points to: ${line}`);
    fail("unowned-content", `Unowned content in ${path}: ${line}`);
  }
  for (const [name, field] of values) {
    field.lines = trimBlank(field.lines);
    if (!field.lines.join("").trim())
      fail("empty-field", `Empty field ${name} in ${path}; omit fields without a value`);
  }
  return { values, updates, repeats };
}

export function fieldText(block, name) {
  return block.values.get(name)?.lines.join("\n").trim() ?? "";
}

export function fieldLines5(block, name) {
  return block.values.get(name)?.lines ?? null;
}

function requireFields(block, names, path) {
  for (const name of names) if (!fieldText(block, name)) fail("missing-field", `Missing field ${name} in ${path}`);
}

function bulletsOnly(lines, start, end, path, check = null) {
  const items = [];
  for (let index = start; index < end; index += 1) {
    const line = lines[index];
    if (line.trim() === "") continue;
    if (line.startsWith("- ")) {
      if (check) check(line, index);
      items.push({ index, text: line.slice(2).trim() });
    } else if (line.startsWith("  ") && items.length) continue;
    else fail("unowned-content", `${path} holds one bullet per item: ${line}`);
  }
  return items;
}

function parseHeader5(lines, end) {
  const name = /^# (.+?)\s*$/.exec(lines[0] ?? "")?.[1];
  if (!name) fail("malformed-header", "The record must begin with '# <task name>'");
  const header = { name };
  for (let index = 1; index < end; index += 1) {
    const line = lines[index];
    if (line.trim() === "") continue;
    const schema = /^Schema:\s*(\d+)\s*·\s*State:\s*(\S+)(?:\s*·\s*Budget:\s*(\S+))?\s*$/.exec(line);
    const cue = /^Cue:\s*(.*?)\s*$/.exec(line);
    const asOf = /^State as of:\s*(\S+)\s*$/.exec(line);
    const key = schema ? "schema" : cue ? "cue" : asOf ? "stateAsOf" : null;
    if (!key) fail("unknown-header-field", `Unknown header content: ${line}`);
    if (key in header) fail("duplicate-field", `Duplicate header line: ${line}`);
    if (schema) {
      header.schema = Number(schema[1]);
      header.state = schema[2];
      header.budget = schema[3] ?? "normal";
      header.stateLine = index;
    } else if (cue) {
      header.cue = cue[1];
      header.cueLine = index;
    } else {
      header.stateAsOf = asOf[1];
      header.stateAsOfLine = index;
    }
  }
  if (header.schema !== SCHEMA5) fail("unsupported-schema", `Expected Schema 5, found ${header.schema ?? "none"}`);
  if (!TASK_STATES5.has(header.state)) fail("invalid-state", `Invalid task State: ${header.state}`);
  if (!BUDGET_MODES.has(header.budget))
    fail("invalid-budget", `Invalid Budget: ${header.budget}; it is normal or expanded`);
  if (!header.cue) fail("missing-field", "The header needs a Cue line: read when <situations this task matters to>");
  if (!header.stateAsOf || !TIMESTAMP.test(header.stateAsOf) || Number.isNaN(Date.parse(header.stateAsOf)))
    fail("invalid-timestamp", `The header needs State as of: <UTC timestamp>; found ${header.stateAsOf ?? "none"}`);
  return header;
}

function parseCurrentWork5(lines, section) {
  const headings = splitSections(lines, section.start, section.end, 3);
  const work = { agreement: null, slice: null, headings: new Map() };
  let position = 0;
  const agreement = /^Agreement (A-\d{3,}) — (.+)$/.exec(headings[0]?.title ?? "");
  if (agreement) {
    const heading = headings[position];
    position += 1;
    const opened = [];
    const updatesAt = [];
    const items = bulletsOnly(lines, heading.start, heading.end, `Agreement ${agreement[1]}`, (line, index) => {
      if (/^- Opened:/.test(line)) opened.push({ index, value: line.slice("- Opened:".length).trim() });
      else if (/^- Update:/.test(line)) updatesAt.push(index);
    });
    if (opened.length !== 1 || !isDate(opened[0].value))
      fail("missing-field", `Agreement ${agreement[1]} needs one Opened: YYYY-MM-DD line`);
    const agreed = items.filter((item) => !/^(Opened|Update):/.test(item.text));
    if (!agreed.length) fail("missing-field", `Agreement ${agreement[1]} needs at least one agreed line`);
    work.agreement = { ...heading, id: agreement[1], title: agreement[2], opened: opened[0].value, updatesAt };
  }
  const slice = /^Slice (S-\d{3,}) — (.+)$/.exec(headings[position]?.title ?? "");
  if (slice) {
    const heading = headings[position];
    position += 1;
    const path = `Slice ${slice[1]}`;
    const block = parseFields5(lines, heading.start, heading.end, {
      fields: new Set(SLICE5_ORDER),
      updateKinds: UPDATE_KINDS,
      path,
    });
    requireFields(block, SLICE5_REQUIRED, path);
    if (!SLICE5_STATES.has(fieldText(block, "State")))
      fail("invalid-state", `Invalid State in ${path}: ${fieldText(block, "State")}`);
    if (!isDate(fieldText(block, "Opened"))) fail("invalid-date", `Opened in ${path} must be YYYY-MM-DD`);
    const waits = fieldText(block, "Waits on");
    if (waits && !waits.split(/\s*,\s*/).every((id) => /^D-\d{3,}$/.test(id)))
      fail("invalid-reference", `Waits on in ${path} names delegations, as D-NNN, comma-separated: ${waits}`);
    work.slice = { ...heading, ...block, id: slice[1], title: slice[2] };
  }
  const rest = headings.slice(position).map((heading) => heading.title);
  if (rest.join("\n") !== WORK5_HEADINGS.join("\n"))
    fail(
      "invalid-current-work",
      `Current Work holds an optional Agreement A-NNN, an optional Slice S-NNN, then ${WORK5_HEADINGS.join(", ")}`,
    );
  for (const heading of headings.slice(position)) work.headings.set(heading.title, heading);
  const delegations = work.headings.get("Delegations");
  work.delegations = bulletsOnly(lines, delegations.start, delegations.end, "Delegations", (line) => {
    if (!DELEGATION_LINE.test(line))
      fail("invalid-delegation", `A Delegations line starts "- D-NNN — <title>": ${line}`);
  });
  const space = work.headings.get("Space");
  work.space = bulletsOnly(lines, space.start, space.end, "Space", (line) => {
    const parts = line.slice(2).split(" · ");
    if (parts.length !== 4 || !["pushed", "not pushed"].includes(parts[3].trim()))
      fail("invalid-space", `A Space line is "- <remote> · <branch> · <commit> · pushed | not pushed": ${line}`);
  });
  const when = work.headings.get("Read when");
  work.readWhen = bulletsOnly(lines, when.start, when.end, "Read when", (line) => {
    if (!/\bread when\b/i.test(line))
      fail("invalid-source", `A Read when line names its trigger, "read when …": ${line}`);
  });
  const flight = work.headings.get("In flight");
  work.inFlight = bulletsOnly(lines, flight.start, flight.end, "In flight", (line) => {
    if (!IN_FLIGHT_LINE.test(line))
      fail("invalid-in-flight", `An In flight line starts with ${IN_FLIGHT_LABELS.join(", ")} and a colon: ${line}`);
    if (line.startsWith("- Carry:") && !CARRY_LINE.test(line))
      fail("invalid-carry", `A Carry line is "- Carry: <path> (lines <a>–<b>) — <why>", the lines optional: ${line}`);
  });
  work.carry = work.inFlight
    .filter((item) => item.text.startsWith("Carry:"))
    .map((item) => {
      const [, path, from, to] = CARRY_LINE.exec(`- ${item.text}`);
      return {
        index: item.index,
        path,
        from: from ? Number(from) : null,
        to: to ? Number(to) : from ? Number(from) : null,
      };
    });
  const defined = work.headings.get("Defined by");
  work.definedBy = bulletsOnly(lines, defined.start, defined.end, "Defined by");
  const now = work.headings.get("Read on recovery");
  work.readNow = bulletsOnly(lines, now.start, now.end, "Read on recovery");
  const next = work.headings.get("Next action");
  if (!lines.slice(next.start, next.end).some((line) => line.replace(/^\s*-\s*/, "").trim()))
    fail("missing-field", "Next action must say what to do next");
  return work;
}

function parseFuture5(lines, section) {
  const items = [];
  for (let index = section.start; index < section.end && !/^#{1,6}[ \t]/.test(lines[index]); index += 1)
    if (lines[index].trim())
      fail(
        "invalid-future-item",
        `Future Work holds proposed Slices, each under its own heading: "### Slice — <title>", then "- Result wanted: …"; not a plain line: ${lines[index]}`,
      );
  for (const heading of splitSections(lines, section.start, section.end, 3)) {
    const match = /^Slice — (.+)$/.exec(heading.title);
    if (!match) fail("invalid-future-item", `Future Work holds proposed Slices only: ### ${heading.title}`);
    const path = `Future Work/${match[1]}`;
    const block = parseFields5(lines, heading.start, heading.end, { fields: new Set(PROPOSED5_ORDER), path });
    requireFields(block, ["Result wanted"], path);
    if (items.some((item) => item.title === match[1]))
      fail("duplicate-title", `Duplicate Future Work title: ${match[1]}`);
    items.push({ ...heading, ...block, title: match[1] });
  }
  return items;
}

/** Parses and validates a Schema 5 record.md. */
export function parseRecord5(text) {
  if (typeof text !== "string" || !text) fail("empty-record", "Record is empty");
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const top = splitSections(lines, 1, lines.length, 2, { preamble: true });
  if (top.map((section) => section.title).join("\n") !== TOP5_SECTIONS.join("\n"))
    fail("invalid-sections", `A Schema 5 record has exactly these sections, in order: ${TOP5_SECTIONS.join(", ")}`);
  const sections = Object.fromEntries(top.map((section) => [section.title, section]));
  const header = parseHeader5(lines, top[0].index);
  const contextHeadings = splitSections(lines, sections["Current Context"].start, sections["Current Context"].end, 3);
  if (contextHeadings.map((heading) => heading.title).join("\n") !== CONTEXT5_HEADINGS.join("\n"))
    fail("invalid-context", `Current Context holds ${CONTEXT5_HEADINGS.join(", ")}, in that order`);
  const context = new Map(contextHeadings.map((heading) => [heading.title, heading]));
  const goal = context.get("Goal");
  if (!lines.slice(goal.start, goal.end).some((line) => line.replace(/^\s*-\s*/, "").trim()))
    fail("missing-field", "Current Context Goal must say what the task is for");
  const work = parseCurrentWork5(lines, sections["Current Work"]);
  const future = parseFuture5(lines, sections["Future Work"]);
  const record = { text, lines, newline, header, sections, context, work, future };
  if (header.state === "paused" && work.slice && fieldText(work.slice, "State") !== "paused")
    fail("invalid-task-state", "A paused task must have a paused Slice");
  if (["completed", "abandoned"].includes(header.state) && work.slice)
    fail("invalid-task-state", `A ${header.state} task cannot have a Slice`);
  return record;
}

/** Parses and validates history.md: `# History: <task name>`, then one `## <ID> — <title>` entry per closed item. */
export function parseHistory5(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  if (!/^# History\b/.test(lines[0] ?? ""))
    fail("malformed-history", "history.md begins with '# History: <task name>'");
  const entries = [];
  const sections = splitSections(lines, 1, lines.length, 2);
  for (let index = 1; index < (sections[0]?.index ?? lines.length); index += 1)
    if (lines[index].trim()) fail("unowned-content", `history.md holds only entries: ${lines[index]}`);
  for (const section of sections) {
    const match = /^([SAD])-(\d{3,}) — (.+)$/.exec(section.title);
    if (!match)
      fail("invalid-history-entry", `A history entry's heading is "## <S|A|D>-NNN — <title>": ${section.title}`);
    const kind = ENTRY_KINDS[match[1]];
    const id = `${match[1]}-${match[2]}`;
    const path = `history.md/${id}`;
    if (entries.some((entry) => entry.id === id)) fail("duplicate-id", `Duplicate history entry ${id}`);
    const block = parseFields5(lines, section.start, section.end, {
      fields: new Set(ENTRY_ORDER[kind]),
      repeatable: CORRECTION,
      path,
    });
    requireFields(block, ENTRY_REQUIRED[kind], path);
    const state = fieldText(block, "State");
    if (!CLOSED_STATES[kind].has(state)) fail("invalid-state", `Invalid State in ${path}: ${state}`);
    if (kind === "slice" && state === "blocked") requireFields(block, ["Resume when"], path);
    if (kind === "slice" && state === "abandoned") requireFields(block, ["Reason"], path);
    entries.push({ ...section, ...block, id, kind, title: match[3], state, cue: fieldText(block, "Cue") });
  }
  return { text: String(text), lines, entries };
}

export const EMPTY_DECISIONS = "# Decisions\n";

export function emptyHistory(name) {
  return `# History: ${name}\n`;
}

/**
 * Reads a Schema 5 task folder: record.md, and history.md and decisions.md beside it (each null when missing). An
 * agreement or Slice both open in record.md and closed in history.md means its close stopped after writing History:
 * that fails, unless lenient, which returns those IDs as `interrupted` so the close can finish.
 */
export async function loadTask5(recordPath, recordText, { lenient = false } = {}) {
  const directory = dirname(recordPath);
  const read = (name) =>
    readFile(join(directory, name), "utf8").catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    });
  const [historyText, decisionsText] = await Promise.all([read(HISTORY_FILE), read(DECISIONS_FILE)]);
  const record = parseRecord5(recordText);
  const history = historyText === null ? { text: null, lines: [], entries: [] } : parseHistory5(historyText);
  const closed = new Set(history.entries.map((entry) => entry.id));
  const interrupted = [record.work.agreement, record.work.slice].filter((open) => open && closed.has(open.id));
  if (interrupted.length && !lenient)
    fail(
      "interrupted-close",
      `${interrupted.map((open) => open.id).join(", ")} is open in record.md and closed in history.md: its close was interrupted after writing History; run its close command again to finish it`,
    );
  return { record, history, historyText, decisionsText, interrupted: interrupted.map((open) => open.id) };
}

/** The next ID of a kind ("S", "A", "D"): one past the highest in record.md and history.md together. */
export function nextId5(task, letter) {
  const pattern = new RegExp(`^${letter}-(\\d{3,})`);
  const used = [
    ...task.history.entries.map((entry) => entry.id),
    task.record.work.agreement?.id,
    task.record.work.slice?.id,
    ...task.record.work.delegations.map((item) => item.text),
  ].filter(Boolean);
  let highest = 0;
  for (const id of used) {
    const match = pattern.exec(id);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `${letter}-${String(highest + 1).padStart(3, "0")}`;
}

/** Each section's size in words, with the fixed budget of Current Context and Future Work; Current Work has none. */
export function budgets5(record) {
  return TOP5_SECTIONS.map((name) => {
    const section = record.sections[name];
    const words = wordCount(record.lines.slice(section.start, section.end));
    const budget = FIXED_BUDGETS[name] ?? null;
    return { name, words, budget, over: budget !== null && words > budget };
  });
}

/** The header's first line, with the task state and the budget mode. */
export function stateLine5(state, budget) {
  return `Schema: 5 · State: ${state} · Budget: ${budget}`;
}

/** Warnings validate and checkpoint print: fixed parts over budget and cues that are too long or not cues. */
export function warnings5(task) {
  const warnings = budgets5(task.record)
    .filter((each) => each.over)
    .map(
      (each) =>
        `${each.name} has ${each.words} words, over its fixed budget of about ${each.budget}: distill it at the next checkpoint`,
    );
  const cue = cueProblem(task.record.header.cue);
  if (cue) warnings.push(`the header's Cue: ${cue}`);
  for (const entry of task.history.entries) {
    const problem = cueProblem(entry.cue);
    if (problem) warnings.push(`${entry.id}'s Cue: ${problem}`);
  }
  return warnings;
}

/** Fields whose value is a list of lines, written under the field even when there is one. */
const LIST_FIELDS = new Set(["Lines", "Updates", "Decisions"]);

/** Renders a block: the heading, then `- Field: value` lines in order, longer values indented under their field. */
export function renderFields5(heading, order, values) {
  const out = [heading];
  for (const name of order) {
    const value = values[name];
    if (value === undefined || value === null) continue;
    const lines = trimBlank(Array.isArray(value) ? value : String(value).split("\n"));
    if (!lines.join("").trim()) continue;
    if (lines.length === 1 && !LIST_FIELDS.has(name)) out.push(`- ${name}: ${lines[0].trim()}`);
    else out.push(`- ${name}:`, ...lines.map((line) => (line.trim() ? `  ${line}` : "")));
  }
  return out;
}

export function skeleton5({ name, cue, stateAsOf, sections = {} }) {
  const part = (title) => {
    const lines = trimBlank(sections[title] ?? []);
    return lines.length ? ["", ...lines, ""] : [""];
  };
  return [
    `# ${name}`,
    "",
    stateLine5("active", "normal"),
    `Cue: ${cue}`,
    `State as of: ${stateAsOf}`,
    "",
    "## Current Context",
    "",
    "### Goal",
    ...part("Goal"),
    "### Settled",
    ...part("Settled"),
    "### Open",
    ...part("Open"),
    "## Current Work",
    "",
    "### Delegations",
    ...part("Delegations"),
    "### Space",
    ...part("Space"),
    "### In flight",
    ...part("In flight"),
    "### Defined by",
    ...part("Defined by"),
    "### Read on recovery",
    ...part("Read on recovery"),
    "### Read when",
    ...part("Read when"),
    "### Next action",
    ...part("Next action"),
    "## Future Work",
    "",
  ].join("\n");
}
