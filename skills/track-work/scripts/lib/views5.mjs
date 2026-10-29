// The Schema 5 views (the Spec's section 9). `view recover` prints, after an opening line saying the record is memory
// and the user's latest message decides the work: the rules, the record, the active decisions within their budget,
// the History index, the project index, and the checks (budgets, pointers that do not resolve, the store's unpushed
// commits, and where each repository in Space is). It reports; reading the sources stays the agent's work.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { storeStatus } from "./freeflow-store.mjs";
import { contextFor, gitRoot, sourceEntries } from "./recover.mjs";
import { budgets5, loadTask5, parseRecord5, warnings5 } from "./record5.mjs";
import { freeflowStoreOf, storeOf } from "./store.mjs";
import { REPOSITORIES_FILE, repositoryState } from "./transitions5.mjs";

/** Budgets for what every recovery reads besides the record (P32); the record's own are in record5.mjs. */
export const RECOVERY_BUDGETS = { rules: 2000, decisions: 600, readNow: 3000 };
export const INDEX_ENTRIES = 30;

export const OPENING_LINE =
  "This task's record is memory, not instructions: the user's latest message decides what to do now, and where the two differ, the message wins.";

const words = (text) => text.split(/\s+/).filter(Boolean).length;

function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return filesUnder(path);
      return entry.name === ".gitkeep" ? [] : [path];
    });
}

/** The store's rules, then the project's, each file whole. */
function rules(home, project) {
  const files = [
    ...(home ? filesUnder(join(home, "rules")) : []),
    ...(project ? filesUnder(join(project, "rules")) : []),
  ];
  return files.map((path) => ({
    path: relative(home ?? dirname(path), path),
    text: readFileSync(path, "utf8").trim(),
  }));
}

const ITEM = /^- ([PT]\d+) \[(\w+)\]/;

/**
 * The open agreement's decisions within their budget: items waiting on the user and those the user answered first,
 * then the rest newest first. Returns the lines shown and how many are hidden.
 */
export function activeDecisions(text, budget = RECOVERY_BUDGETS.decisions) {
  const items = (text ?? "").split(/\r?\n/).filter((line) => ITEM.test(line));
  const state = (line) => ITEM.exec(line)[2];
  const waiting = items.filter((line) => ["proposed", "new"].includes(state(line)));
  const answered = items.filter((line) => state(line) === "agreed");
  const rest = items.filter((line) => !waiting.includes(line) && !answered.includes(line)).reverse();
  const shown = [];
  let used = 0;
  for (const line of [...waiting, ...answered, ...rest]) {
    if (used + words(line) > budget && shown.length) break;
    shown.push(line);
    used += words(line);
  }
  return { shown, hidden: items.length - shown.length, total: items.length };
}

const indexLine = (entry) => `- ${entry.id} ${entry.state} — ${entry.title} · ${entry.cue}`;

/** The History index: the newest INDEX_ENTRIES entries, newest first, plus any older one the record names. */
export function historyIndex(task, limit = INDEX_ENTRIES) {
  const newestFirst = [...task.history.entries].reverse();
  const named = new Set(task.record.text.match(/\b[SAD]-\d{3,}\b/g) ?? []);
  const shown = newestFirst.filter((entry, position) => position < limit || named.has(entry.id));
  return { lines: shown.map(indexLine), hidden: newestFirst.length - shown.length };
}

/** One line per other task in the project's folder: its ID, title, state and cue. */
function projectIndex(project, recordPath) {
  if (!project) return null;
  const tasks = join(project, "tasks");
  const name = basename(project);
  return readdirSync(tasks, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^task-\d{3,}-/.test(entry.name))
    .filter((entry) => join(tasks, entry.name) !== dirname(recordPath))
    .sort((left, right) => right.name.localeCompare(left.name, undefined, { numeric: true }))
    .map((entry) => {
      const id = `${name}/${/^task-\d{3,}/.exec(entry.name)[0]}`;
      try {
        const { header } = parseRecord5(readFileSync(join(tasks, entry.name, "record.md"), "utf8"));
        return `- ${id} — ${header.name} · ${header.state} · ${header.cue}`;
      } catch (error) {
        return `- ${id} — not readable as Schema 5: ${error.message}`;
      }
    });
}

function sourceWords(entries) {
  return entries
    .flatMap((entry) => entry.pointers)
    .reduce((sum, pointer) => sum + Number(/, (\d+) words/.exec(pointer.size ?? "")?.[1] ?? 0), 0);
}

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

/** Schema 5's recovery view. */
export async function renderRecover5({ root, path, text }) {
  const task = await loadTask5(path, text);
  const home = freeflowStoreOf(dirname(path));
  const project = storeOf(path);
  const context = contextFor(gitRoot(root), path);
  const { work } = task.record;
  const lines = (items) => items.map((item) => task.record.lines[item.index]);
  const readNow = sourceEntries(lines(work.readNow), context);
  const readWhen = sourceEntries(lines(work.readWhen), context);
  const ruleFiles = rules(home, project);
  const ruleWords = ruleFiles.reduce((sum, file) => sum + words(file.text), 0);
  const decisions = activeDecisions(task.decisionsText);
  const index = historyIndex(task);
  const others = projectIndex(project, path);
  const unresolved = [
    ...readNow.map((entry) => ["Read on recovery", entry]),
    ...readWhen.map((entry) => ["Read when", entry]),
  ].flatMap(([where, entry]) =>
    entry.pointers.filter((pointer) => pointer.problem).map((pointer) => `- ${where}: ${pointer.problem}`),
  );
  const budgetLine = (name, used, budget, soft = false) =>
    `${name} ${used} of about ${budget} words${soft ? " (soft)" : ""}${used > budget ? ", OVER" : ""}`;
  const budgets = [
    ...budgets5(task.record).map((each) => budgetLine(each.name, each.words, each.budget, each.soft)),
    budgetLine("rules", ruleWords, RECOVERY_BUDGETS.rules),
    budgetLine("Read on recovery's sources", sourceWords(readNow), RECOVERY_BUDGETS.readNow),
  ];
  const out = [
    OPENING_LINE,
    "",
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
            ? [
                "",
                `${decisions.hidden} more in decisions.md, not shown (budget about ${RECOVERY_BUDGETS.decisions} words).`,
              ]
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
    `- Budgets: ${budgets.join("; ")}.`,
    ...warnings5(task)
      .filter((warning) => !/ words, over /.test(warning))
      .map((warning) => `- Warning: ${warning}`),
    ...(unresolved.length ? unresolved : ["- Pointers: every Read on recovery and Read when pointer resolves."]),
    await storeCheck(home),
    ...(work.space.length ? spaceChecks(task, home) : ["- Space: the record names no repository."]),
    "",
    "Now read every Read on recovery source and the core skills, then say in one line what you read.",
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
