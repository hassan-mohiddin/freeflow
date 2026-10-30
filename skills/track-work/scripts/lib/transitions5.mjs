// The Schema 5 commands: slices, agreements and the checkpoint (the Spec's sections 6 to 9). Each validates the task
// folder before and after its change and publishes whole files: history.md first, so a close that stops halfway is
// finished by running it again, then record.md, then decisions.md. A close and a checkpoint then sync the Freeflow
// store when the task lives in one.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { applyLineReplacements, parseFragment } from "./document.mjs";
import { budgetFor, contextWindow, measureTask, measuredLines } from "./budget5.mjs";
import { storeHome, syncStore } from "./freeflow-store.mjs";
import {
  CLOSED_STATES,
  DECISIONS_FILE,
  EMPTY_DECISIONS,
  BUDGET_MODES,
  ENTRY_ORDER,
  HISTORY_FILE,
  IN_FLIGHT_LABELS,
  PROPOSED5_ORDER,
  SLICE5_ORDER,
  cueProblem,
  emptyHistory,
  fieldLines5,
  fieldText,
  isDate,
  loadTask5,
  nextId5,
  parseHistory5,
  parseRecord5,
  renderFields5,
  stateLine5,
  warnings5,
} from "./record5.mjs";
import { closedBlocks } from "./discussion5.mjs";
import {
  addEvents,
  addUsed,
  emptyMeasure,
  parseMeasure,
  priceTable,
  renderMeasure,
  transcriptEvents,
} from "./measure5.mjs";
import { predictSlice } from "./planner5.mjs";
import { REPOSITORIES_FILE, freeflowStoreOf, isFreeflowStore, writeAtomically, writeTaskFile } from "./store.mjs";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function localDate(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function oneLine(text) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function requiredOption(options, name, command) {
  const value = oneLine(options[name]);
  if (!value) fail("missing-option", `${command} requires ${name}`);
  return value;
}

function input(text, names, command) {
  const fragment = parseFragment(text, new Set(names), `${command} input`);
  const lines = (name) => {
    const field = fragment.fields.get(name);
    if (!field) return null;
    const value = field.valueLines.map((line) => line.replace(/\s+$/, ""));
    while (value.length && !value[0].trim()) value.shift();
    while (value.length && !value[value.length - 1].trim()) value.pop();
    return value.length ? value : null;
  };
  return {
    lines,
    text: (name) => (lines(name) ?? []).join("\n").trim(),
    require(name) {
      const value = lines(name);
      if (!value) fail("missing-field", `${command} requires ${name}`);
      return value;
    },
  };
}

function requireCue(cue, command) {
  const problem = cueProblem(cue);
  if (problem) fail("invalid-cue", `${command}: ${problem}`);
  return cue;
}

function assertActive(task, action) {
  if (task.record.header.state !== "active")
    fail("invalid-task-state", `Cannot ${action} while the task is ${task.record.header.state}`);
}

function assertNotInterrupted(task, finishing = null) {
  const other = task.interrupted.filter((id) => id !== finishing);
  if (other.length)
    fail(
      "interrupted-close",
      `${other.join(", ")} is open in record.md and closed in history.md: its close was interrupted after writing History; run its close command again to finish it`,
    );
}

function edit(record, replacements) {
  return applyLineReplacements({ lines: [...record.lines], newline: record.newline }, replacements);
}

function nextActionEdit(record, text) {
  const section = record.work.headings.get("Next action");
  return { start: section.start, end: section.end, lines: ["", `- ${oneLine(text)}`, ""] };
}

function sectionBlock(heading, fields) {
  return [heading, "", ...fields.slice(1), ""];
}

function updateLines(slice) {
  return slice.updates.map((update) => `- ${update.kind}: ${update.text}`);
}

function sliceValues(slice) {
  return Object.fromEntries(SLICE5_ORDER.map((name) => [name, fieldLines5(slice, name)]));
}

function renderSlice(id, title, values, updates = []) {
  const fields = renderFields5(`### Slice ${id} — ${title}`, SLICE5_ORDER, values);
  return [fields[0], "", ...fields.slice(1), ...updates, ""];
}

function entryLines(kind, id, title, values) {
  return sectionBlock(`## ${id} — ${title}`, renderFields5(`## ${id} — ${title}`, ENTRY_ORDER[kind], values));
}

function appendEntry(task, name, lines) {
  const base = task.historyText ?? emptyHistory(name);
  const trimmed = base.replace(/\s+$/, "");
  return `${trimmed}\n\n${lines.join("\n").replace(/\s+$/, "")}\n`;
}

function datesFrom(opened) {
  const today = localDate();
  return opened === today ? today : `${opened} to ${today}`;
}

/** Loads the task, with the IDs whose close stopped after writing History. */
async function load(loaded) {
  const task = await loadTask5(loaded.path, loaded.text, { lenient: true });
  return { ...task, loaded };
}

/** Validates the candidate files together, then writes the changed ones: history.md, record.md, decisions.md. */
async function publish(task, { record = null, history = null, decisions = null }) {
  const recordText = record ?? task.record.text;
  const candidate = parseRecord5(recordText);
  if (history !== null) parseHistory5(history);
  const { root, path } = task.loaded;
  if (history !== null && history !== task.historyText)
    await writeTaskFile(root, path, HISTORY_FILE, task.historyText, history);
  if (record !== null) await writeAtomically(root, path, task.record.text, recordText);
  if (decisions !== null && decisions !== task.decisionsText)
    await writeTaskFile(root, path, DECISIONS_FILE, task.decisionsText, decisions);
  return candidate;
}

/** Commits and pushes the Freeflow store holding the task, when there is one; never fails the command. */
async function syncAfter(task, what) {
  const home = freeflowStoreOf(dirname(task.loaded.path));
  if (!home) return "Not in a Freeflow store: nothing to commit.";
  const taskName = basename(dirname(task.loaded.path));
  try {
    const synced = await syncStore({ home, message: `${taskName}: ${what}` });
    const committed = synced.committed ? `committed ${synced.committed} path(s)` : "nothing to commit";
    if (synced.local) return `Store: ${committed}; a local store, nothing to push.`;
    return synced.pushed
      ? `Store: ${committed}, pushed.`
      : `Store: ${committed}, not pushed (${synced.reason}); the next store sync pushes it.`;
  } catch (error) {
    return `Store not synced: ${error.message} Run store status.`;
  }
}

async function proposeSlice(options, text, loaded) {
  const task = await load(loaded);
  const title = requiredOption(options, "--title", "slice propose");
  if (task.record.future.some((item) => item.title === title))
    fail("duplicate-title", `Future Work already has a Slice titled ${title}`);
  const fields = input(text, PROPOSED5_ORDER, "slice propose");
  fields.require("Result wanted");
  const values = Object.fromEntries(PROPOSED5_ORDER.map((name) => [name, fields.lines(name)]));
  const block = renderFields5(`### Slice — ${title}`, PROPOSED5_ORDER, values);
  const at = task.record.sections["Future Work"].end;
  const before = task.record.lines[at - 1]?.trim() ? [""] : [];
  await publish(task, {
    record: edit(task.record, [{ start: at, end: at, lines: [...before, block[0], "", ...block.slice(1), ""] }]),
  });
  return `Proposed Slice: ${title}\n`;
}

const START_FIELDS = ["Under", "Scope", "Done when", "Stop if", "Started from", "Waits on", "Dependencies"];

/** How far back a first reading looks for the newest request: its log's tail, not the whole log. */
const FIRST_READING_MS = 6 * 60 * 60 * 1000;

/**
 * A Slice's measure with a new reading added (Spec section 12, "Planning from measured cost"; T29, T30): from --used,
 * else the transcript --transcript or the harness layer (FREEFLOW_TRANSCRIPT) names, else none. Never guessed: with
 * no source the measure is returned as it was.
 */
function takeReading(measure, options, env = process.env) {
  if (options["--used"] !== undefined) {
    const used = Number(options["--used"]);
    if (!Number.isInteger(used) || used < 0)
      fail("invalid-option", `--used is a whole number of tokens, not ${options["--used"]}`);
    return addUsed(measure, used);
  }
  const transcript = options["--transcript"] ?? env.FREEFLOW_TRANSCRIPT;
  if (!transcript || !existsSync(transcript)) return measure;
  const since = measure.last?.time ?? Date.now() - FIRST_READING_MS;
  return addEvents(measure, transcriptEvents(transcript, since), priceTable(env));
}

/** The Slice's prediction from measured Slices (P89), or null: one that cannot be made never blocks the start. */
function predicted(recordPath) {
  try {
    const prediction = predictSlice(recordPath);
    return prediction ? [prediction.line] : null;
  } catch {
    return null;
  }
}

async function startSlice(options, text, loaded, direct) {
  const command = direct ? "slice start-direct" : "slice start";
  const task = await load(loaded);
  assertNotInterrupted(task);
  assertActive(task, "start a Slice");
  const { record } = task;
  if (record.work.slice) fail("current-slice-exists", `${record.work.slice.id} is the current Slice; close it first`);
  const title = requiredOption(options, "--title", command);
  const nextAction = requiredOption(options, "--next-action", command);
  const proposal = record.future.find((item) => item.title === title);
  if (direct && proposal) fail("future-title-conflict", `Future Work proposes ${title}; use slice start`);
  if (!direct && !proposal) fail("missing-item", `No proposed Slice titled ${title} in Future Work`);
  const fields = input(text, direct ? ["Result wanted", ...START_FIELDS] : START_FIELDS, command);
  const values = { State: "in_progress", Opened: localDate() };
  for (const name of START_FIELDS) values[name] = fields.lines(name);
  const started = takeReading(emptyMeasure(), options);
  values.Measured = started.last ? [renderMeasure(started)] : null;
  values.Predicted = predicted(loaded.path);
  values["Result wanted"] = direct ? fields.require("Result wanted") : fieldLines5(proposal, "Result wanted");
  values["Done when"] ??= proposal ? fieldLines5(proposal, "Done when") : null;
  values.Dependencies ??= proposal ? fieldLines5(proposal, "Dependencies") : null;
  values.Under ??= record.work.agreement ? [record.work.agreement.id] : null;
  for (const name of ["Under", "Scope", "Done when", "Stop if", "Started from"])
    if (!values[name])
      fail(
        "missing-field",
        `${command} requires ${name}${name === "Under" ? ": the open agreement A-NNN, or the user's words that authorize the Slice" : ""}`,
      );
  const id = nextId5(task, "S");
  const at = record.work.headings.get("Delegations").index;
  const replacements = [
    { start: at, end: at, lines: renderSlice(id, title, values) },
    nextActionEdit(record, nextAction),
  ];
  if (proposal) replacements.push({ start: proposal.index, end: proposal.end, lines: [] });
  await publish(task, { record: edit(record, replacements) });
  return `Started Slice: ${id} — ${title}\n`;
}

async function changeSliceState(options, text, loaded, pausing) {
  const command = pausing ? "slice pause" : "slice resume";
  const task = await load(loaded);
  assertNotInterrupted(task);
  const slice = task.record.work.slice;
  if (!slice) fail("missing-current-slice", "There is no current Slice");
  const state = fieldText(slice, "State");
  if (pausing && state !== "in_progress") fail("invalid-transition", "Only an in-progress Slice can be paused");
  if (!pausing && state !== "paused") fail("invalid-transition", "Only a paused Slice can be resumed");
  if (!pausing) assertActive(task, "resume a Slice");
  const nextAction = requiredOption(options, "--next-action", command);
  const update = pausing
    ? `- Paused: ${oneLine(options["--reason"] || text) || fail("missing-option", "slice pause requires --reason")}; resume when: ${requiredOption(options, "--resume-when", command)}`
    : `- Resumed: ${oneLine(options["--resolution"] || text) || fail("missing-option", "slice resume requires --resolution")}`;
  const values = { ...sliceValues(slice), State: [pausing ? "paused" : "in_progress"] };
  await publish(task, {
    record: edit(task.record, [
      {
        start: slice.index,
        end: slice.end,
        lines: renderSlice(slice.id, slice.title, values, [...updateLines(slice), update]),
      },
      nextActionEdit(task.record, nextAction),
    ]),
  });
  return `${pausing ? "Paused" : "Resumed"} Slice: ${slice.id}\n`;
}

const CLOSE_FIELDS = ["Cue", "Result", "Evidence", "Task effect", "Resume when", "Reason"];

/** What a closing Slice used, for its History entry: its measure with a last reading, or "not measured". */
function closingMeasure(slice, options) {
  const line = fieldText(slice, "Measured");
  if (!line) return "not measured";
  return renderMeasure(takeReading(parseMeasure(line), options));
}

async function closeSlice(options, text, loaded) {
  const task = await load(loaded);
  const slice = task.record.work.slice;
  if (!slice) fail("missing-current-slice", "There is no current Slice");
  assertNotInterrupted(task, slice.id);
  const state = requiredOption(options, "--state", "slice close");
  if (!CLOSED_STATES.slice.has(state)) fail("invalid-state", `A Slice closes as completed, blocked or abandoned`);
  if (state === "blocked" && fieldText(slice, "State") !== "paused")
    fail("invalid-transition", "A Slice closes as blocked only from paused");
  const nextAction = requiredOption(options, "--next-action", "slice close");
  const open = new Set(task.record.work.delegations.map((item) => item.text.split(" ")[0]));
  const waiting = fieldText(slice, "Waits on")
    .split(/\s*,\s*/)
    .filter((id) => open.has(id));
  if (state === "completed" && waiting.length)
    fail("waiting-on-delegation", `${slice.id} waits on ${waiting.join(", ")}, still open; close it first`);
  let history = task.historyText;
  if (!task.interrupted.includes(slice.id)) {
    const fields = input(text, CLOSE_FIELDS, "slice close");
    const values = {
      State: state,
      Dates: datesFrom(fieldText(slice, "Opened")),
      Cue: requireCue(fields.text("Cue") || fail("missing-field", "slice close requires Cue"), "slice close"),
      Under: fieldLines5(slice, "Under"),
      "Result wanted": fieldLines5(slice, "Result wanted"),
      Result: fields.require("Result"),
      Evidence: fields.require("Evidence"),
      "Task effect": fields.require("Task effect"),
      "Resume when": state === "blocked" ? fields.require("Resume when") : fields.lines("Resume when"),
      Reason: state === "abandoned" ? fields.require("Reason") : fields.lines("Reason"),
      Predicted: fieldLines5(slice, "Predicted"),
      Measured: [closingMeasure(slice, options)],
      Updates: updateLines(slice),
    };
    history = appendEntry(task, task.record.header.name, entryLines("slice", slice.id, slice.title, values));
  }
  await publish(task, {
    history,
    record: edit(task.record, [
      { start: slice.index, end: slice.end, lines: [] },
      nextActionEdit(task.record, nextAction),
    ]),
  });
  return `Closed Slice: ${slice.id} — ${state}\n${await syncAfter(task, `close ${slice.id}`)}\n`;
}

const OCCURRED = /^(\d{4}-\d{2}-\d{2})(?: to (\d{4}-\d{2}-\d{2}))?$/;

async function recordSlice(options, text, loaded) {
  const task = await load(loaded);
  assertNotInterrupted(task);
  if (!["active", "paused"].includes(task.record.header.state))
    fail("invalid-task-state", `Cannot record a Slice while the task is ${task.record.header.state}`);
  const title = requiredOption(options, "--title", "slice record");
  const state = requiredOption(options, "--state", "slice record");
  if (!CLOSED_STATES.slice.has(state)) fail("invalid-state", `A Slice is recorded as completed, blocked or abandoned`);
  const fields = input(text, ["Occurred", "Under", "Result wanted", ...CLOSE_FIELDS], "slice record");
  const occurred = OCCURRED.exec(fields.text("Occurred"));
  const today = localDate();
  if (!occurred || !isDate(occurred[1]) || (occurred[2] && (!isDate(occurred[2]) || occurred[2] < occurred[1])))
    fail("invalid-occurred", "slice record requires Occurred: YYYY-MM-DD or YYYY-MM-DD to YYYY-MM-DD");
  if ((occurred[2] ?? occurred[1]) > today) fail("invalid-occurred", `Occurred cannot end after today (${today})`);
  const values = {
    State: state,
    Dates: fields.text("Occurred"),
    Recorded: `retroactively on ${today}`,
    Cue: requireCue(fields.text("Cue") || fail("missing-field", "slice record requires Cue"), "slice record"),
    Under: fields.require("Under"),
    "Result wanted": fields.require("Result wanted"),
    Result: fields.require("Result"),
    Evidence: fields.require("Evidence"),
    "Task effect": fields.require("Task effect"),
    "Resume when": state === "blocked" ? fields.require("Resume when") : fields.lines("Resume when"),
    Reason: state === "abandoned" ? fields.require("Reason") : fields.lines("Reason"),
  };
  const id = nextId5(task, "S");
  await publish(task, { history: appendEntry(task, task.record.header.name, entryLines("slice", id, title, values)) });
  return `Recorded Slice: ${id} — ${title} (${state}, retroactive)\n`;
}

/** The agreement's own lines, each bullet with the lines indented under it; Opened and Update lines apart. */
function agreementParts(record) {
  const { agreement } = record.work;
  const groups = [];
  for (let index = agreement.start; index < agreement.end; index += 1) {
    const line = record.lines[index];
    if (line.startsWith("- ")) groups.push([line]);
    else if (line.startsWith("  ") && groups.length) groups[groups.length - 1].push(line);
  }
  const of = (prefix) => groups.filter((group) => group[0].startsWith(prefix));
  return {
    lines: groups.filter((group) => !/^- (Opened|Update):/.test(group[0])).flat(),
    updates: of("- Update:")
      .map((group) => [`- ${group[0].slice("- Update:".length).trim()}`, ...group.slice(1)])
      .flat(),
  };
}

function agreedLines(text, command) {
  const lines = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""));
  const kept = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    if (/^- (Opened|Update):/.test(line))
      fail("invalid-input", `${command}: the command writes Opened and Update lines itself: ${line}`);
    if (line.startsWith("- ") || (line.startsWith("  ") && kept.length)) kept.push(line);
    else fail("invalid-input", `${command} takes the agreement as bullets, one per line agreed: ${line}`);
  }
  if (!kept.length) fail("missing-input", `${command} requires the agreement's lines through --input`);
  return kept;
}

async function openAgreement(options, text, loaded) {
  const task = await load(loaded);
  assertNotInterrupted(task);
  assertActive(task, "open an agreement");
  const { record } = task;
  if (record.work.agreement)
    fail("agreement-open", `${record.work.agreement.id} is open; a task has one open agreement: close it first`);
  const title = requiredOption(options, "--title", "agreement open");
  const lines = agreedLines(text, "agreement open");
  const id = nextId5(task, "A");
  const at = (record.work.slice ?? record.work.headings.get("Delegations")).index;
  const replacements = [
    { start: at, end: at, lines: [`### Agreement ${id} — ${title}`, "", `- Opened: ${localDate()}`, ...lines, ""] },
  ];
  if (options["--next-action"]) replacements.push(nextActionEdit(record, options["--next-action"]));
  await publish(task, { record: edit(record, replacements) });
  return `Opened agreement: ${id} — ${title}\n`;
}

async function updateAgreement(options, text, loaded) {
  const task = await load(loaded);
  assertNotInterrupted(task);
  const { agreement } = task.record.work;
  if (!agreement) fail("missing-agreement", "There is no open agreement");
  const change = oneLine(options["--text"] || text);
  if (!change)
    fail("missing-input", "agreement update requires --text or --input: the change, in the user's words, dated");
  let at = agreement.end;
  while (at > agreement.start && !task.record.lines[at - 1].trim()) at -= 1;
  await publish(task, { record: edit(task.record, [{ start: at, end: at, lines: [`- Update: ${change}`] }]) });
  return `Updated agreement: ${agreement.id}\n`;
}

async function closeAgreement(options, text, loaded) {
  const task = await load(loaded);
  const { record } = task;
  const { agreement } = record.work;
  if (!agreement) fail("missing-agreement", "There is no open agreement");
  assertNotInterrupted(task, agreement.id);
  const state = requiredOption(options, "--state", "agreement close");
  if (!CLOSED_STATES.agreement.has(state)) fail("invalid-state", "An agreement closes as completed, ended or replaced");
  if (record.work.slice && fieldText(record.work.slice, "Under") === agreement.id)
    fail("slice-under-agreement", `${record.work.slice.id} works under ${agreement.id}; close it first`);
  const fields = input(text, ["Cue", "Result", "Task effect", "Settled"], "agreement close");
  let history = task.historyText;
  if (!task.interrupted.includes(agreement.id)) {
    const parts = agreementParts(record);
    const decisions = (task.decisionsText ?? "").split(/\r?\n/).filter((line) => line.trim() && !/^#/.test(line));
    const values = {
      State: state,
      Dates: datesFrom(agreement.opened),
      Cue: requireCue(fields.text("Cue") || fail("missing-field", "agreement close requires Cue"), "agreement close"),
      Lines: parts.lines,
      Updates: parts.updates,
      Decisions: decisions,
      Result: fields.require("Result"),
      "Task effect": fields.require("Task effect"),
    };
    history = appendEntry(task, record.header.name, entryLines("agreement", agreement.id, agreement.title, values));
  }
  const replacements = [{ start: agreement.index, end: agreement.end, lines: [] }];
  const settled = fields.lines("Settled");
  if (settled) {
    const section = record.context.get("Settled");
    let at = section.end;
    while (at > section.start && !record.lines[at - 1].trim()) at -= 1;
    const bullets = settled.map((line) => (line.startsWith("- ") || line.startsWith("  ") ? line : `- ${line}`));
    replacements.push({ start: at, end: at, lines: [...(at === section.start ? [""] : []), ...bullets] });
  }
  if (options["--next-action"]) replacements.push(nextActionEdit(record, options["--next-action"]));
  await publish(task, {
    history,
    record: edit(record, replacements),
    decisions: task.decisionsText === null ? null : EMPTY_DECISIONS,
  });
  return `Closed agreement: ${agreement.id} — ${state}\n${await syncAfter(task, `close ${agreement.id}`)}\n`;
}

function git(directory, args) {
  try {
    return execFileSync("git", ["-C", directory, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/** A remote as host/owner/repo (T8): https, ssh and scp-like URLs alike; anything else as given. */
export function remoteName(url) {
  const value = url.trim().replace(/\.git$/, "");
  const scp = /^[^@\s/]+@([^:\s/]+):(.+)$/.exec(value);
  if (scp) return `${scp[1]}/${scp[2]}`;
  const parsed = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/i.exec(value);
  return parsed ? `${parsed[1]}/${parsed[2]}` : value;
}

/**
 * Where the repository holding directory stands: its remote as host/owner/repo (or its path when it has none), branch,
 * commit, whether a remote has the commit, and how many paths are uncommitted; null outside a repository or in the
 * Freeflow store.
 */
export function repositoryState(directory) {
  const top = git(directory, ["rev-parse", "--show-toplevel"]);
  if (!top || isFreeflowStore(top)) return null;
  const remotes = (git(top, ["remote"]) ?? "").split("\n").filter(Boolean);
  const remote = remotes.includes("origin") ? "origin" : remotes[0];
  const url = remote ? git(top, ["remote", "get-url", remote]) : null;
  const commit = git(top, ["rev-parse", "--short=8", "HEAD"]);
  if (!commit) return null;
  const pushed = (git(top, ["branch", "-r", "--contains", "HEAD"]) ?? "").trim() ? "pushed" : "not pushed";
  const name = url ? remoteName(url) : top;
  const branch = git(top, ["branch", "--show-current"]) || "detached";
  const dirty = (git(top, ["status", "--porcelain"]) ?? "").split("\n").filter(Boolean).length;
  return { name, top, branch, commit, pushed, dirty, line: `- ${name} · ${branch} · ${commit} · ${pushed}` };
}

export { REPOSITORIES_FILE };

export async function rememberRepository(home, state) {
  const path = join(home, REPOSITORIES_FILE);
  const known = JSON.parse(await readFile(path, "utf8").catch(() => "{}"));
  if (known[state.name] === state.top) return;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ ...known, [state.name]: state.top }, null, 2)}\n`);
}

/**
 * In flight's new lines from the checkpoint's input: bullets, each with its label (P59); "none" leaves it empty, and a
 * labelled line that says only "none" ("- Carry: none") is no line (T20).
 */
function inFlightLines(text) {
  const lines = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .filter((line) => line.trim())
    .filter((line) => !new RegExp(`^- (${IN_FLIGHT_LABELS.join("|")}):\\s*(none|\\(none\\))\\.?$`, "i").test(line));
  if (lines.length === 1 && /^-?\s*(none|\(none\))\.?$/i.test(lines[0].trim())) return [];
  for (const line of lines)
    if (!line.startsWith("- "))
      fail(
        "invalid-input",
        `checkpoint --input takes In flight's lines, each "- <${IN_FLIGHT_LABELS.join("|")}>: …", or "none": ${line}`,
      );
  return lines;
}

async function checkpoint(options, text, loaded) {
  const task = await load(loaded);
  assertNotInterrupted(task);
  const { record } = task;
  const rewrite = options["--input"] !== undefined;
  const flight = rewrite ? inFlightLines(text) : null;
  const directory = resolve(options["--repo"] ?? process.cwd());
  const space = repositoryState(directory);
  if (options["--repo"] && !space)
    fail(
      "invalid-repository",
      `${options["--repo"]} is not a Git repository with a commit, or it is the Freeflow store`,
    );
  const replacements = [
    {
      start: record.header.stateAsOfLine,
      end: record.header.stateAsOfLine + 1,
      lines: [`State as of: ${new Date().toISOString()}`],
    },
  ];
  if (rewrite) {
    const section = record.work.headings.get("In flight");
    replacements.push({ start: section.start, end: section.end, lines: flight.length ? ["", ...flight, ""] : [""] });
  }
  if (space) {
    const known = record.work.space.find((item) => item.text.split(" · ")[0] === space.name);
    const section = record.work.headings.get("Space");
    let at = section.end;
    while (at > section.start && !record.lines[at - 1].trim()) at -= 1;
    replacements.push(
      known
        ? { start: known.index, end: known.index + 1, lines: [space.line] }
        : { start: at, end: at, lines: [...(at === section.start ? [""] : []), space.line] },
    );
  }
  // The current Slice's measure gains what was used since its last reading, so one that spans compactions or
  // sessions is still counted whole (Spec section 12, "Planning from measured cost").
  const slice = record.work.slice;
  const measuredAt = slice
    ? record.lines.findIndex(
        (line, index) => index >= slice.index && index < slice.end && line.startsWith("- Measured: "),
      )
    : -1;
  if (measuredAt !== -1) {
    const measure = takeReading(parseMeasure(record.lines[measuredAt].slice("- Measured: ".length)), options);
    replacements.push({ start: measuredAt, end: measuredAt + 1, lines: [`- Measured: ${renderMeasure(measure)}`] });
  }
  const candidate = await publish(task, { record: edit(record, replacements) });
  const home = freeflowStoreOf(dirname(loaded.path));
  if (home && space) await rememberRepository(home, space);
  const after = { ...task, record: candidate };
  const measure = measureTask(after, { root: loaded.root, path: loaded.path, window: contextWindow() });
  const measured = measuredLines(measure);
  const lines = [
    `Checkpoint: ${basename(dirname(loaded.path))}, State as of ${candidate.header.stateAsOf}.`,
    `Budget: ${measured.summary}.`,
    rewrite
      ? `In flight: rewritten, ${flight.length} line(s).`
      : "In flight: unchanged; pass --input with its lines to rewrite it whole.",
    space ? `Space: ${space.line.slice(2)}` : "Space: unchanged (no work repository at this folder; pass --repo)",
    ...(measured.warning ? [`Warning: ${measured.warning}`] : []),
    ...measure.files.carry.filter((file) => file.problem).map((file) => `Warning: Carry: ${file.problem}`),
    ...warnings5(after).map((warning) => `Warning: ${warning}`),
    ...closedBlocks(loaded.path, task.history).map(
      (block) =>
        `Discussion block ${block.id} shaped ${block.shapes.join(", ")}, now closed: drop it (discussion drop --block ${block.id}) once nothing open rests on it.`,
    ),
    await syncAfter(task, "checkpoint"),
  ];
  return `${lines.join("\n")}\n`;
}

const NEXT_STATES = {
  active: new Set(["paused", "completed", "abandoned"]),
  paused: new Set(["active", "completed", "abandoned"]),
  completed: new Set(["active"]),
  abandoned: new Set(["active"]),
};

async function setTaskState(options, loaded) {
  const task = await load(loaded);
  assertNotInterrupted(task);
  const { record } = task;
  const state = requiredOption(options, "--state", "task set-state");
  const current = record.header.state;
  if (state === current) return `No change: the task is already ${state}\n`;
  if (!NEXT_STATES[current]?.has(state)) fail("invalid-transition", `The task cannot go from ${current} to ${state}`);
  const nextAction = requiredOption(options, "--next-action", "task set-state");
  const { slice } = record.work;
  if (["completed", "abandoned"].includes(state) && slice)
    fail("invalid-task-state", `A ${state} task has no Slice; close ${slice.id} first`);
  const replacements = [
    {
      start: record.header.stateLine,
      end: record.header.stateLine + 1,
      lines: [stateLine5(state, record.header.budget)],
    },
    nextActionEdit(record, nextAction),
  ];
  if (state === "paused" && slice && fieldText(slice, "State") === "in_progress") {
    const values = { ...sliceValues(slice), State: ["paused"] };
    const update = "- Paused: the task was paused; resume when: the task is active again";
    replacements.push({
      start: slice.index,
      end: slice.end,
      lines: renderSlice(slice.id, slice.title, values, [...updateLines(slice), update]),
    });
  }
  await publish(task, { record: edit(record, replacements) });
  return `Set task state: ${state}\n`;
}

/** `task set-budget`: the task's budget mode, normal or expanded (P62, P67), changed only on the user's word. */
async function setBudget(options, loaded) {
  const task = await load(loaded);
  assertNotInterrupted(task);
  const { record } = task;
  const mode = requiredOption(options, "--mode", "task set-budget");
  if (!BUDGET_MODES.has(mode)) fail("invalid-budget", "--mode is normal or expanded");
  const window = contextWindow();
  const total = budgetFor({ window: window.tokens, mode }).total.toLocaleString("en-US");
  if (mode === record.header.budget) return `No change: the task's budget is already ${mode} (about ${total} words).\n`;
  await publish(task, {
    record: edit(record, [
      {
        start: record.header.stateLine,
        end: record.header.stateLine + 1,
        lines: [stateLine5(record.header.state, mode)],
      },
    ]),
  });
  return `Set budget: ${mode}, about ${total} words at a ${window.tokens.toLocaleString("en-US")}-token window.\n`;
}

/** The session summary's headings (P64), in order: Schema 5's, for a session that holds no task. */
export const SESSION_SUMMARY_HEADINGS = [
  "Goal",
  "Settled",
  "Open",
  "Agreement",
  "In flight",
  "Read when",
  "Next action",
];

/** Where this session's summary goes when it holds no task (T15): <store>/sessions/<session ID>/summary.md. */
export function sessionSummaryPath(home, identity) {
  return join(home, "sessions", identity.id, "summary.md");
}

/** Where this session's request for Freeflow's compaction goes (P102): <store>/sessions/<session ID>/compact.json. */
export function compactionRequestPath(home, identity) {
  return join(home, "sessions", identity.id, "compact.json");
}

/** `checkpoint --compact`: a request the harness layer answers once, at the end of the turn, and marks done. */
export async function writeCompactionRequest(home, identity) {
  const path = compactionRequestPath(home, identity);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ requestedAt: new Date().toISOString(), done: false }, null, 2)}\n`);
}

/**
 * `checkpoint --session`: without a held task, the session's own summary, which Freeflow's compaction installs and
 * then removes. Every heading is present, in order; Goal and Next action say something; In flight's lines are labelled.
 */
export async function checkpointSession({ home: explicit, identity, text }) {
  if (!identity)
    fail(
      "missing-session",
      "No session ID: Claude Code sets CLAUDE_CODE_SESSION_ID; other harnesses set FREEFLOW_SESSION.",
    );
  const lines = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const found = [];
  for (const [index, line] of lines.entries()) {
    const heading = /^## (.+?)\s*$/.exec(line);
    if (heading) found.push({ title: heading[1], index });
    else if (!found.length && line.trim()) fail("invalid-input", `The session summary starts with ## Goal: ${line}`);
  }
  if (found.map((each) => each.title).join("\n") !== SESSION_SUMMARY_HEADINGS.join("\n"))
    fail(
      "invalid-input",
      `The session summary has these headings, in order: ${SESSION_SUMMARY_HEADINGS.map((each) => `## ${each}`).join(", ")}`,
    );
  const body = (title) => {
    const at = found.findIndex((each) => each.title === title);
    return lines.slice(found[at].index + 1, found[at + 1]?.index ?? lines.length).filter((line) => line.trim());
  };
  for (const title of ["Goal", "Next action"])
    if (!body(title).some((line) => line.replace(/^-\s*/, "").trim() && !/^\(none\)$/i.test(line.trim())))
      fail("invalid-input", `The session summary's ${title} must say something`);
  const labelled = new RegExp(`^- (${IN_FLIGHT_LABELS.join("|")}):\\s+\\S`);
  for (const line of body("In flight"))
    if (!/^\(none\)$/i.test(line.trim()) && !labelled.test(line))
      fail("invalid-input", `An In flight line starts with ${IN_FLIGHT_LABELS.join(", ")} and a colon: ${line}`);
  const home = storeHome(explicit);
  const path = sessionSummaryPath(home, identity);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `# Session summary\n\nAs of: ${new Date().toISOString()}\n\n${lines.join("\n").trim()}\n`);
  return `Session summary: ${path}. Freeflow's compaction installs it and removes it; nothing becomes a task.\n`;
}

export async function runTransition5(command, positionals, options, text, loaded) {
  const operation = positionals[0];
  if (command === "slice") {
    if (operation === "propose") return proposeSlice(options, text, loaded);
    if (operation === "start") return startSlice(options, text, loaded, false);
    if (operation === "start-direct") return startSlice(options, text, loaded, true);
    if (operation === "pause") return changeSliceState(options, text, loaded, true);
    if (operation === "resume") return changeSliceState(options, text, loaded, false);
    if (operation === "close") return closeSlice(options, text, loaded);
    if (operation === "record") return recordSlice(options, text, loaded);
  }
  if (command === "agreement") {
    if (operation === "open") return openAgreement(options, text, loaded);
    if (operation === "update") return updateAgreement(options, text, loaded);
    if (operation === "close") return closeAgreement(options, text, loaded);
  }
  if (command === "checkpoint" && operation === undefined) return checkpoint(options, text, loaded);
  if (command === "task" && operation === "set-state") return setTaskState(options, loaded);
  if (command === "task" && operation === "set-budget") return setBudget(options, loaded);
  fail("unknown-command", `Not a Schema 5 command: ${command} ${operation ?? ""}`.trim());
}
