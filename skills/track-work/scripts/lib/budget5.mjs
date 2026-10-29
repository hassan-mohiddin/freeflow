// The recovery budget (the Spec's section 6; P32, P62, P66). One budget covers the memory the agent shapes: the record,
// the active decisions shown, the History and project indexes, Read on recovery's sources and In flight's Carry files.
// It scales with the square root of the context window, expanded mode half as large again; Current Context and Future
// Work stay fixed inside it, and the decisions shown and the History index scale with it. The rules, the skills and
// Defined by are read whole and never counted. The budget only warns: recovery still reads everything it lists.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { contextFor, gitRoot, resolvePointer, sourceEntries } from "./recover.mjs";
import { FIXED_BUDGETS, budgets5, parseRecord5 } from "./record5.mjs";
import { freeflowStoreOf, isFreeflowStore, storeOf } from "./store.mjs";

/** The window assumed when the harness gives none (T11), and the anchor of the curve: 10,000 words at 200k tokens. */
export const DEFAULT_WINDOW = 200_000;
export const ANCHOR = { window: 200_000, words: 10_000, decisions: 600, index: 30 };
export const EXPANDED_FACTOR = 1.5;

/** The core skills every recovery reads whole, beside this script's own skill; method, never counted. */
const SKILLS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const CORE_SKILLS = ["track-work", "discuss-work", "execute-work"].map((name) => join(SKILLS, name, "SKILL.md"));

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
    "Current Work (In flight included), Read on recovery's sources and In flight's Carry files share the rest.",
    "Not counted, read whole: the rules, the skills, and Defined by's entries.",
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
 * The files a list of source entries points to, each once, in order, with its text and words; `skip` holds paths
 * already taken by an earlier list. A directory or a pointer that does not resolve has no text.
 */
export function sourceFiles(entries, context, skip = new Set()) {
  const files = [];
  for (const entry of entries)
    for (const pointer of entry.pointers) {
      if (pointer.kind !== "path" || pointer.state !== "resolves") continue;
      const { path } = resolvePointer(pointer.value, context);
      if (skip.has(path)) continue;
      skip.add(path);
      const text = fileText(path);
      files.push({ pointer: pointer.value, path, text, words: text === null ? 0 : words(text) });
    }
  return files;
}

/** In flight's Carry files, read now, each cut to its lines when the line names them. */
export function carriedFiles(carry, context) {
  return carry.map((item) => {
    const { path } = resolvePointer(item.path, context);
    const whole = fileText(path);
    if (whole === null)
      return { ...item, resolved: path, text: null, words: 0, problem: `${item.path} does not exist` };
    const lines = whole.replace(/\n$/, "").split("\n");
    const from = item.from ?? 1;
    const to = Math.min(item.to ?? lines.length, lines.length);
    const text = lines.slice(from - 1, to).join("\n");
    return { ...item, ranged: item.from !== null, resolved: path, from, to, text, words: words(text) };
  });
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

/**
 * What recovery reads for a task, measured: the counted parts against the budget for the window and the task's mode,
 * the uncounted parts with their sizes, and the material itself, which the views print.
 */
export function measureTask(task, { root, path, window = contextWindow() }) {
  const home = freeflowStoreOf(dirname(path));
  const project = storeOf(path);
  const context = contextFor(pointerRoot(root), path);
  const { work } = task.record;
  const recordLines = (items) => items.map((item) => task.record.lines[item.index]);
  const budget = budgetFor({ window: window.tokens, mode: task.record.header.budget });
  const ruleFiles = rules(home, project);
  const decisions = activeDecisions(task.decisionsText, budget.decisions);
  const index = historyIndex(task, budget.index);
  const others = projectIndex(project, path);
  const definedBy = sourceEntries(recordLines(work.definedBy), context);
  const readNow = sourceEntries(recordLines(work.readNow), context);
  const readWhen = sourceEntries(recordLines(work.readWhen), context);
  // A file Defined by names is a definition, read whole and not counted, even when Read on recovery names it too.
  const taken = new Set();
  const definedFiles = sourceFiles(definedBy, context, taken);
  // A core skill is read whole and never counted, wherever the record names it.
  for (const skill of CORE_SKILLS) taken.add(skill);
  const readNowFiles = sourceFiles(readNow, context, taken);
  const carry = carriedFiles(work.carry, context);
  const sum = (items) => items.reduce((total, item) => total + item.words, 0);
  const counted = [
    ...budgets5(task.record).map((each) => ({ name: each.name, words: each.words, budget: each.budget })),
    { name: "active decisions shown", words: decisions.shown.reduce((total, line) => total + words(line), 0) },
    { name: "History index", words: words(index.lines.join("\n")) },
    { name: "project index", words: words((others ?? []).join("\n")) },
    { name: "Read on recovery's sources", words: sum(readNowFiles) },
    { name: "Carry files", words: sum(carry) },
  ];
  const uncounted = [
    { name: "rules", words: ruleFiles.reduce((total, file) => total + words(file.text), 0) },
    { name: "Defined by", words: sum(definedFiles) },
  ];
  const total = sum(counted);
  return {
    budget,
    window,
    counted,
    uncounted,
    total,
    over: total > budget.total,
    material: { home, project, context, ruleFiles, decisions, index, others, definedBy, readNow, readWhen },
    files: { definedBy: definedFiles, readNow: readNowFiles, carry },
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
