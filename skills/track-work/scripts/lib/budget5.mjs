// The recovery budget (the Spec's section 6; P32, P62, P66). One budget covers the memory the agent shapes: the record,
// the active decisions shown, the History and project indexes, and the files Recovery's "always" lines name.
// It scales with the square root of the context window, expanded mode half as large again; Current Context and Future
// Work stay fixed inside it, and the decisions shown and the History index scale with it. The rules, the skills and
// files Recovery's "always, not counted" lines name are read and never counted. The budget only warns: recovery still
// reads everything it lists.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { contextFor, gitRoot, recoveryEntries, resolvePointer } from "./recover.mjs";
import { FIXED_BUDGETS, budgets5, parseRecord5 } from "./record5.mjs";
import { REPOSITORIES_FILE, freeflowStoreOf, isFreeflowStore, projectOf } from "./store.mjs";

/** The window assumed when the harness gives none (T11), and the anchor of the curve: 10,000 words at 200k tokens. */
export const DEFAULT_WINDOW = 200_000;
export const ANCHOR = { window: 200_000, words: 10_000, decisions: 600, index: 30 };
export const EXPANDED_FACTOR = 1.5;

/** The core skills every recovery reads whole, beside this script's own skill; method, never counted. */
const SKILLS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const CORE_SKILLS = ["track-work", "discuss-work", "execute-work"].map((name) => join(SKILLS, name, "SKILL.md"));

/** A path with its symlinks resolved, so one file reached two ways compares equal (macOS's /var is /private/var). */
export function real(path) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

export const words = (text) =>
  String(text ?? "")
    .split(/\s+/)
    .filter(Boolean).length;
const number = (value) => value.toLocaleString("en-US");

/** The session's context window in tokens, from FREEFLOW_CONTEXT_WINDOW, which the harness layer sets (T11). */
export function contextWindow(env = process.env) {
  const value = Number(env.FREEFLOW_CONTEXT_WINDOW);
  return Number.isInteger(value) && value > 0
    ? { tokens: value, source: "FREEFLOW_CONTEXT_WINDOW" }
    : { tokens: DEFAULT_WINDOW, source: null };
}

/** The budget for a window and mode: the total in words, and what the scaled parts may hold. */
export function budgetFor({ window = DEFAULT_WINDOW, mode = "normal" } = {}) {
  const scale = Math.sqrt(window / ANCHOR.window) * (mode === "expanded" ? EXPANDED_FACTOR : 1);
  return {
    window,
    mode,
    total: Math.round((ANCHOR.words * scale) / 100) * 100,
    decisions: Math.round(ANCHOR.decisions * scale),
    index: Math.max(1, Math.round(ANCHOR.index * scale)),
  };
}

/** The budget as the agent reads it before writing: the total, the fixed parts, the scaled parts, what is not counted. */
export function budgetLines(budget, window) {
  const from = window.source ? `from ${window.source}` : `assumed: FREEFLOW_CONTEXT_WINDOW is not set`;
  return [
    `Recovery budget: about ${number(budget.total)} words (${budget.mode} mode, a ${number(budget.window)}-token window, ${from}).`,
    `Fixed: Current Context about ${FIXED_BUDGETS["Current Context"]} words; Future Work about ${FIXED_BUDGETS["Future Work"]}.`,
    `Scaled: the active decisions shown, about ${number(budget.decisions)} words; the History index, the newest ${budget.index} entries.`,
    "Current Work (In flight included) and the files Recovery's always lines name share the rest; a when line's file counts once its trigger applies and it is read.",
    "Not counted: the rules, the skills, and the files Recovery's always, not counted lines name.",
  ];
}

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
export function rules(home, project) {
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
export function activeDecisions(text, budget = ANCHOR.decisions) {
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
  return { shown, hidden: items.length - shown.length, total: items.length, budget };
}

export const indexLine = (entry) => `- ${entry.id} ${entry.state} — ${entry.title} · ${entry.cue}`;

/** The History index: the newest entries within the budget's count, newest first, plus any older one the record names. */
export function historyIndex(task, limit = ANCHOR.index) {
  const newestFirst = [...task.history.entries].reverse();
  const named = new Set(task.record.text.match(/\b[SAD]-\d{3,}\b/g) ?? []);
  const shown = newestFirst.filter((entry, position) => position < limit || named.has(entry.id));
  return { lines: shown.map(indexLine), hidden: newestFirst.length - shown.length };
}

/** One line per other task in the project's folder: its ID, title, state and cue. */
export function projectIndex(project, recordPath) {
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

function fileText(path) {
  try {
    return statSync(path).isFile() ? readFileSync(path, "utf8") : null;
  } catch {
    return null;
  }
}

/**
 * The files a list of Recovery entries points to, each once, in order, with its text and words, cut to the lines the
 * entry gives it (T2); `skip` holds what an earlier list took: a whole file, or one range of it. A directory or a
 * pointer that does not resolve has no text.
 */
export function sourceFiles(entries, context, skip = new Set()) {
  const files = [];
  for (const entry of entries)
    for (const pointer of entry.pointers) {
      if (pointer.kind !== "path" || pointer.state !== "resolves") continue;
      const { path } = resolvePointer(pointer.value, context);
      const range = entry.ranges?.get(pointer.value) ?? null;
      const whole = real(path);
      const key = range ? `${whole}:${range.from}-${range.to}` : whole;
      if (skip.has(whole) || skip.has(key)) continue;
      skip.add(key);
      const full = fileText(path);
      if (full === null || !range) {
        files.push({ pointer: pointer.value, path, text: full, words: full === null ? 0 : words(full), ranged: false });
        continue;
      }
      const lines = full.replace(/\n$/, "").split("\n");
      const to = Math.min(range.to, lines.length);
      const text = lines.slice(range.from - 1, to).join("\n");
      files.push({ pointer: pointer.value, path, text, words: words(text), ranged: true, from: range.from, to });
    }
  return files;
}

/**
 * Where a record's repository pointers resolve: the work repository the command runs in, unless that is the Freeflow
 * store, whose records point into the repositories they change; otherwise the record's own repository.
 */
export function pointerRoot(root) {
  let here = null;
  try {
    here = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    here = null;
  }
  return here && !isFreeflowStore(here) ? here : gitRoot(root);
}

/** Where each repository the record names in Space is on this machine, from the store's local/ (P96). */
export function spaceRepositories(space, home) {
  if (!home || !space.length) return [];
  let known = {};
  try {
    known = JSON.parse(readFileSync(join(home, REPOSITORIES_FILE), "utf8"));
  } catch {
    known = {};
  }
  return space.map((item) => known[item.text.split(" · ")[0].trim()]).filter((top) => top && existsSync(top));
}

/**
 * What recovery reads for a task, measured: the counted parts against the budget for the window and the task's mode,
 * the uncounted parts with their sizes, and the material itself, which the views print.
 */
export function measureTask(task, { root, path, window = contextWindow() }) {
  const home = freeflowStoreOf(dirname(path));
  const project = projectOf(path);
  const context = contextFor(pointerRoot(root), path, spaceRepositories(task.record.work.space, home));
  const { work } = task.record;
  const budget = budgetFor({ window: window.tokens, mode: task.record.header.budget });
  const ruleFiles = rules(home, project);
  const decisions = activeDecisions(task.decisionsText, budget.decisions);
  const index = historyIndex(task, budget.index);
  const others = projectIndex(project, path);
  const recovery = recoveryEntries(work.recovery, context);
  const always = recovery.filter((entry) => entry.kind === "always");
  const uncounted = recovery.filter((entry) => entry.kind === "uncounted");
  const when = recovery.filter((entry) => entry.kind === "when");
  // A file an "always, not counted" line names is a definition, read and not counted, even when an "always" line names
  // it too.
  const taken = new Set();
  const uncountedFiles = sourceFiles(uncounted, context, taken);
  // A core skill is read whole and never counted, wherever the record names it.
  for (const skill of CORE_SKILLS) taken.add(real(skill));
  const alwaysFiles = sourceFiles(always, context, taken);
  const sum = (items) => items.reduce((total, item) => total + item.words, 0);
  const counted = [
    ...budgets5(task.record).map((each) => ({ name: each.name, words: each.words, budget: each.budget })),
    { name: "active decisions shown", words: decisions.shown.reduce((total, line) => total + words(line), 0) },
    { name: "History index", words: words(index.lines.join("\n")) },
    { name: "project index", words: words((others ?? []).join("\n")) },
    { name: "Recovery's always files", words: sum(alwaysFiles) },
  ];
  const notCounted = [
    { name: "rules", words: ruleFiles.reduce((total, file) => total + words(file.text), 0) },
    { name: "Recovery's uncounted files", words: sum(uncountedFiles) },
  ];
  const total = sum(counted);
  return {
    budget,
    window,
    counted,
    uncounted: notCounted,
    total,
    over: total > budget.total,
    material: { home, project, context, ruleFiles, decisions, index, others, recovery, always, uncounted, when },
    files: { always: alwaysFiles, uncounted: uncountedFiles },
  };
}

/** The measured budget in one line for the checks, and a warning when the counted total is over. */
export function measuredLines(measured) {
  const { budget, total, counted, uncounted } = measured;
  const largest = [...counted]
    .sort((left, right) => right.words - left.words)
    .slice(0, 3)
    .map((part) => `${part.name} ${number(part.words)}`);
  const fixed = counted
    .filter((part) => part.budget)
    .map(
      (part) => `${part.name} ${number(part.words)} of about ${part.budget}${part.words > part.budget ? ", OVER" : ""}`,
    );
  return {
    summary: `counted ${number(total)} of about ${number(budget.total)} words (${budget.mode}, ${number(budget.window)}-token window)${measured.over ? ", OVER" : ""}; largest: ${largest.join(", ")}; fixed: ${fixed.join(", ")}; not counted: ${uncounted.map((part) => `${part.name} ${number(part.words)}`).join(", ")}`,
    warning: measured.over
      ? `the counted memory is ${number(total)} words, over the budget of about ${number(budget.total)}: distill the largest parts at the next checkpoint, or ask the user whether this task should use expanded mode`
      : null,
  };
}

/** `budget`: before writing, the budget; with a record, what each part holds now and what is left. */
export function renderBudget({ window, mode, measured = null }) {
  const budget = measured?.budget ?? budgetFor({ window: window.tokens, mode });
  const out = budgetLines(budget, window);
  if (!measured) return `${out.join("\n")}\n`;
  const left = budget.total - measured.total;
  out.push(
    "",
    "Now, counted:",
    ...measured.counted.map(
      (part) =>
        `- ${part.name}: ${number(part.words)} words${part.budget ? ` (fixed about ${part.budget}${part.words > part.budget ? ", OVER" : ""})` : ""}`,
    ),
    `- Total: ${number(measured.total)} of about ${number(budget.total)} words; ${left >= 0 ? `${number(left)} left` : `${number(-left)} OVER`}.`,
    "Not counted:",
    ...measured.uncounted.map((part) => `- ${part.name}: ${number(part.words)} words`),
  );
  return `${out.join("\n")}\n`;
}
