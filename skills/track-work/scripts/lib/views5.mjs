// The Schema 5 views (the Spec's section 9). `view recover` prints, after an opening line saying the record is memory
// and the user's direction decides the work: the rules, the record, the active decisions within their budget, the
// History index, the project index, and the checks (the budget, pointers that do not resolve, the store's unpushed
// commits, and where each repository in Space is). It reports; reading the sources stays the agent's work.
// `view bundle` prints the same, then everything recovery reads, whole: what Freeflow's compaction installs (P60).

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import {
  ANCHOR,
  CORE_SKILLS,
  activeDecisions,
  contextWindow,
  historyIndex,
  indexLine,
  measureTask,
  measuredLines,
  real,
  rules,
  words,
} from "./budget5.mjs";
import { storeHome, storeStatus } from "./freeflow-store.mjs";
import { delegationChecks, workerSection } from "./delegations5.mjs";
import { OPENING_LINE, SESSION_OPENING, claudeCodeLog, userMessages } from "./discussion5.mjs";
import { readSessions, sessionIdentity } from "./projects5.mjs";
import { loadTask5, warnings5 } from "./record5.mjs";
import { REPOSITORIES_FILE, repositoryState, sessionSummaryPath } from "./transitions5.mjs";

export { CORE_SKILLS, activeDecisions, historyIndex };
export const INDEX_ENTRIES = ANCHOR.index;

const number = (value) => value.toLocaleString("en-US");

export { OPENING_LINE };

function spaceChecks(task, home) {
  let known = {};
  try {
    known = home ? JSON.parse(readFileSync(join(home, REPOSITORIES_FILE), "utf8")) : {};
  } catch {
    known = {};
  }
  const here = repositoryState(process.cwd());
  return task.record.work.space.map((item) => {
    const [name, branch, commit, pushed] = item.text.split(" · ").map((part) => part.trim());
    const path = known[name] ?? (here?.name === name ? here.top : null);
    const live = path && existsSync(path) ? repositoryState(path) : null;
    if (!live) return `- ${name}: not on this machine; the record says ${branch} at ${commit}, ${pushed}`;
    const dirty = live.dirty ? `, ${live.dirty} uncommitted path(s)` : "";
    const same = live.branch === branch && live.commit.startsWith(commit.slice(0, 7)) && live.pushed === pushed;
    return same
      ? `- ${name} at ${live.top}: ${branch} at ${commit}, ${pushed}, as recorded${dirty}`
      : `- ${name} at ${live.top}: now ${live.branch} at ${live.commit}, ${live.pushed}${dirty}; the record says ${branch} at ${commit}, ${pushed}`;
  });
}

function holdCheck(path) {
  const { hold } = readSessions(dirname(path));
  if (!hold) return "- Hold: no session holds this task.";
  const identity = sessionIdentity();
  if (identity && hold.short === identity.short) return `- Hold: this session holds it, since ${hold.from}.`;
  return `- Hold: session ${hold.short} (${hold.harness}, ${hold.where}) holds it, since ${hold.from}; ask the user before taking it over.`;
}

async function storeCheck(home) {
  if (!home) return "- Store: this task is not in a Freeflow store; nothing is committed or pushed.";
  const status = await storeStatus({ home });
  const last = status.lastSync
    ? `last sync ${status.lastSync.at}, ${status.lastSync.result}${status.lastSync.reason ? ` (${status.lastSync.reason})` : ""}`
    : "never synced";
  if (!status.remote) return `- Store: a local store; ${status.uncommitted} path(s) not committed.`;
  const conflict = status.conflict ? `; a conflict waits in ${status.conflict.join(", ")}` : "";
  return `- Store: ${status.unpushed ?? "unknown"} commit(s) not pushed, ${status.uncommitted} path(s) not committed; ${last}${conflict}.`;
}

/** Items 1 to 7 of the bundle: the opening line, the rules, the record, the decisions, the indexes and the checks. */
async function recoveryHead(task, measured, { path, delegation }) {
  const { work } = task.record;
  const { home, ruleFiles, decisions, index, others, definedBy, readNow, readWhen } = measured.material;
  const unresolved = [
    ...definedBy.map((entry) => ["Defined by", entry]),
    ...readNow.map((entry) => ["Read on recovery", entry]),
    ...readWhen.map((entry) => ["Read when", entry]),
  ].flatMap(([where, entry]) =>
    entry.pointers.filter((pointer) => pointer.problem).map((pointer) => `- ${where}: ${pointer.problem}`),
  );
  const carryProblems = measured.files.carry.filter((file) => file.problem).map((file) => `- Carry: ${file.problem}`);
  const budget = measuredLines(measured);
  const worker = delegation ? workerSection(dirname(path), delegation) : [];
  return [
    OPENING_LINE,
    "",
    ...worker,
    "## Rules",
    "",
    ...(ruleFiles.length ? ruleFiles.flatMap((file) => [`### ${file.path}`, "", file.text, ""]) : ["None.", ""]),
    "## Record",
    "",
    task.record.text.trimEnd(),
    "",
    "## Active decisions",
    "",
    ...(decisions.total
      ? [
          ...decisions.shown,
          ...(decisions.hidden
            ? ["", `${decisions.hidden} more in decisions.md, not shown (budget about ${decisions.budget} words).`]
            : []),
        ]
      : ["None: decisions.md lists no items."]),
    "",
    "## History index",
    "",
    ...(index.lines.length
      ? [
          ...index.lines,
          ...(index.hidden ? ["", `${index.hidden} older entries not shown: view index lists them all.`] : []),
          "",
          "Read an entry with `view entry <ID>`.",
        ]
      : ["None."]),
    "",
    "## Project index",
    "",
    ...(others === null ? ["Not in a store project."] : others.length ? others : ["No other tasks."]),
    "",
    "## Checks",
    "",
    `- Budget: ${budget.summary}.`,
    ...(budget.warning ? [`- Warning: ${budget.warning}`] : []),
    ...warnings5(task).map((warning) => `- Warning: ${warning}`),
    ...(unresolved.length || carryProblems.length
      ? [...unresolved, ...carryProblems]
      : ["- Pointers: every Defined by, Read on recovery, Read when and Carry pointer resolves."]),
    ...(delegation ? [] : delegationChecks(dirname(path), task.record)),
    holdCheck(path),
    await storeCheck(home),
    ...(work.space.length ? spaceChecks(task, home) : ["- Space: the record names no repository."]),
    "",
  ];
}

/** Schema 5's recovery view. */
export async function renderRecover5({ root, path, text }, { delegation = null, window = contextWindow() } = {}) {
  const task = await loadTask5(path, text);
  const measured = measureTask(task, { root, path, window });
  const out = [
    ...(await recoveryHead(task, measured, { path, delegation })),
    delegation
      ? "Now read the brief's Read sources, and Execute Work with its delegation reference (Work From A Brief); continue from progress.md's Next, then say in one line what you read."
      : "Now read every Defined by entry, every Read on recovery source and the core skills, then say in one line what you read.",
  ];
  return `${out.join("\n")}\n`;
}

function fileBlock(label, text) {
  return [`<file path="${label}">`, text.replace(/\n$/, ""), "</file>", ""];
}

/** A carried file's lines, numbered by file line, as Pi's carry numbers them. */
function numbered(file) {
  const width = String(file.to).length;
  return file.text
    .split("\n")
    .map((line, offset) => `${String(file.from + offset).padStart(width)}\t${line}`)
    .join("\n");
}

const RECOVERY_LINE =
  "A new cycle starts here. Everything above was read when this bundle was made: read none of it again unless something changed it since. Skills read in the last cycle other than those above were not carried: read each again before you apply it. Check the live state the next step depends on, then continue from In flight and the Next action.";

/**
 * What follows the bundle when a compaction came before the checkpoint (P16): the user's messages since the record's
 * State as of, word for word, and a closing line in place of the recovery line, since the record is older than the
 * harness's summary that comes before it.
 */
function sinceCheckpoint(stateAsOf) {
  let messages = [];
  let transcript = null;
  try {
    messages = userMessages({ since: stateAsOf });
    transcript = process.env.FREEFLOW_TRANSCRIPT || claudeCodeLog();
  } catch {
    // No transcript this harness layer can find: the closing line says so.
  }
  return [
    `## The user's messages since ${stateAsOf}`,
    "",
    ...(messages.length
      ? messages.flatMap((message) => [
          `### ${message.number}. ${message.at ?? "time not recorded"}`,
          "",
          message.text,
          "",
        ])
      : ["None.", ""]),
    `A new cycle starts here, after a compaction that came before the checkpoint. The record above is as of ${stateAsOf}: the summary before this bundle holds the work since, and the user's messages since then are above, word for word; where they or the summary differ from the record, they win. Everything above was read when this bundle was made: read none of it again unless something changed it since. ${transcript ? `To read back what the summary lost, read the transcript: ${transcript}.` : "No transcript was found to read back what the summary lost."} Check the live state the next step depends on, then continue from where the summary leaves off.`,
  ];
}

/** The bundle (P60): everything recovery reads, in the Spec's section 9 order, with its sizes. */
export async function renderBundle5({ root, path, text }, { window = contextWindow(), fallback = false } = {}) {
  const task = await loadTask5(path, text);
  const measured = measureTask(task, { root, path, window });
  const { files } = measured;
  const repository = measured.material.context.root;
  const label = (file) => {
    const inside = relative(real(repository), real(file));
    return inside.startsWith("..") ? file : inside;
  };
  // A core skill Defined by already printed is not printed again.
  const printed = new Set(files.definedBy.map((file) => real(file.path)));
  const skills = CORE_SKILLS.filter((skill) => existsSync(skill) && !printed.has(real(skill))).map((skill) => ({
    path: skill,
    text: readFileSync(skill, "utf8"),
  }));
  const skillWords = skills.reduce((sum, skill) => sum + words(skill.text), 0);
  const unread = (list) =>
    list
      .filter((file) => file.text === null)
      .map((file) => `- ${file.pointer}: a folder, or not readable; read what the next step needs from it.`);
  const out = [
    ...(await recoveryHead(task, measured, { path, delegation: null })),
    "## Read on recovery (counted)",
    "",
    ...(files.readNow.length
      ? files.readNow.filter((file) => file.text !== null).flatMap((file) => fileBlock(label(file.path), file.text))
      : ["None.", ""]),
    ...unread(files.readNow),
    "## Carry (counted)",
    "",
    ...(files.carry.length
      ? files.carry
          .filter((file) => file.text !== null)
          .flatMap((file) =>
            fileBlock(`${file.path}${file.ranged ? ` lines ${file.from}–${file.to}` : ""}`, numbered(file)),
          )
      : ["None.", ""]),
    "## Defined by (not counted)",
    "",
    ...(files.definedBy.length
      ? files.definedBy.filter((file) => file.text !== null).flatMap((file) => fileBlock(label(file.path), file.text))
      : ["None.", ""]),
    ...unread(files.definedBy),
    "## Core skills (not counted)",
    "",
    ...skills.flatMap((skill) => fileBlock(label(skill.path), skill.text)),
    "## Sizes",
    "",
    ...measured.counted.map((part) => `- ${part.name}: ${number(part.words)} words, counted`),
    ...measured.uncounted.map((part) => `- ${part.name}: ${number(part.words)} words, not counted`),
    `- core skills: ${number(skillWords)} words, not counted`,
    `- Counted: ${number(measured.total)} of about ${number(measured.budget.total)} words; not counted: ${number(measured.uncounted.reduce((sum, part) => sum + part.words, 0) + skillWords)} words.`,
    "",
    ...(fallback ? sinceCheckpoint(task.record.header.stateAsOf) : [RECOVERY_LINE]),
  ];
  return `${out.join("\n")}\n`;
}

/** The bundle of a session that holds no task: the store's rules, then its session summary. */
export function renderSessionBundle({ home: explicit = null, identity = sessionIdentity() } = {}) {
  if (!identity)
    throw new Error("No session ID: Claude Code sets CLAUDE_CODE_SESSION_ID; other harnesses set FREEFLOW_SESSION.");
  const home = storeHome(explicit);
  const summary = sessionSummaryPath(home, identity);
  if (!existsSync(summary)) throw new Error(`No session summary at ${summary}: checkpoint --session writes it.`);
  const ruleFiles = rules(home, null);
  const out = [
    SESSION_OPENING,
    "",
    "## Rules",
    "",
    ...(ruleFiles.length ? ruleFiles.flatMap((file) => [`### ${file.path}`, "", file.text, ""]) : ["None.", ""]),
    "## Session summary",
    "",
    readFileSync(summary, "utf8").trimEnd(),
    "",
    RECOVERY_LINE.replace("In flight and the Next action", "the summary's In flight and Next action"),
  ];
  return `${out.join("\n")}\n`;
}

/** The named History entries exactly as stored, in the order given. */
export async function renderEntries5({ path, text }, ids) {
  const task = await loadTask5(path, text);
  return `${ids
    .map((id) => {
      const entry = task.history.entries.find((each) => each.id === id);
      if (!entry) throw new Error(`No History entry ${id}`);
      return task.history.lines.slice(entry.index, entry.end).join("\n").trimEnd();
    })
    .join("\n\n")}\n`;
}

/** The whole History index, oldest first. */
export async function renderIndex5({ path, text }) {
  const task = await loadTask5(path, text);
  return task.history.entries.length ? `${task.history.entries.map(indexLine).join("\n")}\n` : "No History entries.\n";
}
