// How much of the context window the work has used, for an agent deciding what fits before the next compaction: the
// context's use against the window and the notice point, and, given how much of the work is done, a projection of the
// rest (task-004's Spec, P77, P78, T26). Harness-neutral: the use comes from --used, or from the session's transcript
// where a reader knows its format (Claude Code's log today).

import { closeSync, existsSync, fstatSync, openSync, readSync } from "node:fs";
import { contextWindow } from "./budget5.mjs";
import { claudeCodeLog } from "./discussion5.mjs";

/** Where Freeflow's notice comes, as a share of the window (the mod's own point, before Claude's threshold). */
const NOTICE_AT = 0.75;
/** How much of the end of a log is read to find its latest request; the whole file when that holds none. */
const TAIL_BYTES = 4 * 1024 * 1024;

class EstimateError extends Error {}

function readTail(path, bytes) {
  const descriptor = openSync(path, "r");
  try {
    const size = fstatSync(descriptor).size;
    const start = bytes === null ? 0 : Math.max(0, size - bytes);
    const buffer = Buffer.alloc(size - start);
    readSync(descriptor, buffer, 0, buffer.length, start);
    return buffer.toString("utf8");
  } finally {
    closeSync(descriptor);
  }
}

/**
 * The context of the main conversation's latest request in a Claude Code session log, in tokens (input, cache reads
 * and writes, and the reply), or null when the log holds none. A subagent's requests (isSidechain) are not counted.
 */
export function claudeCodeContext(path) {
  for (const bytes of [TAIL_BYTES, null]) {
    let latest = null;
    for (const line of readTail(path, bytes).split("\n")) {
      if (!line.includes('"usage"')) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const usage = entry?.message?.usage;
      if (entry?.type !== "assistant" || entry.isSidechain || !usage) continue;
      latest =
        (usage.input_tokens ?? 0) +
        (usage.cache_creation_input_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0) +
        (usage.output_tokens ?? 0);
    }
    if (latest !== null) return latest;
  }
  return null;
}

const count = (value) => Math.round(value).toLocaleString("en-US");

function positiveInteger(value, name, { zero = false } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < (zero ? 0 : 1))
    throw new EstimateError(`${name} is a whole number${zero ? "" : " above 0"}, not ${value}`);
  return number;
}

/** The estimate's lines, from the options --used, --window, --done, --left and --transcript. */
export function estimate(options, env = process.env) {
  const window = options["--window"]
    ? { tokens: positiveInteger(options["--window"], "--window"), source: "--window" }
    : contextWindow(env);
  let used = null;
  let source = null;
  if (options["--used"] !== undefined) {
    used = positiveInteger(options["--used"], "--used", { zero: true });
    source = "--used";
  } else {
    const transcript = options["--transcript"] ?? (env.FREEFLOW_TRANSCRIPT || claudeCodeLog(env));
    if (transcript && existsSync(transcript)) {
      used = claudeCodeContext(transcript);
      source = used === null ? null : "the session's transcript";
    }
  }
  if (used === null)
    throw new EstimateError(
      "The context's use is not known here: pass --used <tokens>, as the harness shows it (on Claude Code, /context).",
    );
  const done = options["--done"] === undefined ? null : positiveInteger(options["--done"], "--done");
  const left = options["--left"] === undefined ? null : positiveInteger(options["--left"], "--left", { zero: true });
  if ((done === null) !== (left === null)) throw new EstimateError("--done and --left go together");
  const notice = NOTICE_AT * window.tokens;
  const lines = [
    `Context: about ${count(used)} of ${count(window.tokens)} tokens (${Math.round((100 * used) / window.tokens)}%), from ${source}${window.source ? `; the window from ${window.source}` : "; the window assumed (FREEFLOW_CONTEXT_WINDOW is not set)"}.`,
    used < notice
      ? `Freeflow's notice comes at about ${count(notice)} tokens (75% of the window): about ${count(notice - used)} left before it, for this cycle's work and its checkpoint.`
      : `Past the notice point (about ${count(notice)} tokens): checkpoint at the next safe point.`,
  ];
  if (done !== null) {
    // The context so far stands for the parts done, so a part's share is an upper bound: it includes what any cycle
    // starts with (the prompt, the tools, the bundle).
    const perPart = used / done;
    const needed = perPart * left;
    if (used + needed <= notice)
      lines.push(
        `At most about ${count(perPart)} tokens a part, the ${left} part(s) left need about ${count(needed)}: they fit before the notice.`,
      );
    else {
      const cycles = Math.ceil((used + needed) / notice) - 1;
      lines.push(
        `At most about ${count(perPart)} tokens a part, the ${left} part(s) left need about ${count(needed)}: about ${cycles} more cycle(s). Plan where each cycle ends, at a safe point, and keep a task for the work if it has none.`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

export { EstimateError };
