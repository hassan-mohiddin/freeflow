// The context items a compaction can carry besides files (P2): the tool results in the session's transcript, read
// from Claude Code's log or Pi's session file, numbered as `carry list` shows them, found again by their tool-use ID,
// and the newest ones a bundle adds within the carry budget.

import { closeSync, existsSync, openSync, readFileSync, readSync } from "node:fs";
import { claudeCodeLog } from "./discussion5.mjs";
import { TAIL_STEPS, readTail } from "./measure5.mjs";
import { isPiSession, piToolResults } from "./pi-session.mjs";

export class CarryError extends Error {}

/** The carry budget, as Pi's: 15% of the window, at most 40,000 tokens. */
export const CARRY_BUDGET = { share: 0.15, most: 40_000 };
export const carryBudget = (window) => Math.min(Math.floor(window * CARRY_BUDGET.share), CARRY_BUDGET.most);

/** A planning estimate, as Pi's compaction uses: about four characters a token. */
const tokensOf = (text) => Math.ceil(text.length / 4);

/** What a call was for, in one short line: the tool and its command, file or description. */
function labelOf(name, input = {}) {
  const detail =
    input.description ?? input.file_path ?? input.path ?? input.command ?? input.pattern ?? input.url ?? input.prompt;
  const line = typeof detail === "string" ? detail.replace(/\s+/g, " ").trim() : "";
  return line ? `${name}: ${line.length > 80 ? `${line.slice(0, 79)}…` : line}` : name;
}

function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => (block?.type === "text" ? block.text : block?.type === "image" ? "[an image]" : ""))
    .filter(Boolean)
    .join("\n");
}

/** A transcript's first bytes, enough to tell its format without reading a long log whole. */
function head(path, bytes = 64 * 1024) {
  const descriptor = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    return buffer.toString("utf8", 0, readSync(descriptor, buffer, 0, bytes, 0));
  } finally {
    closeSync(descriptor);
  }
}

/** A Pi session's tool results along its active branch, shaped as the Claude Code reader's. */
function piResults(path, { sinceMs, afterCompaction }) {
  const { results, cycleFrom } = piToolResults(readFileSync(path, "utf8"));
  const kept = afterCompaction && cycleFrom !== null ? results.slice(cycleFrom) : results;
  return kept
    .map((result) => ({
      id: result.id,
      label: labelOf(result.name, result.input),
      text: result.text,
      at: result.at,
      tokens: tokensOf(result.text),
      error: result.error,
    }))
    .filter((result) => sinceMs === null || !result.at || Date.parse(result.at) > sinceMs);
}

/**
 * The main conversation's tool results in a Claude Code log or a Pi session, oldest first, each with its tool-use ID,
 * its call's label, its text, its time and its size in tokens; with `since`, only those after it (an ISO time), and
 * with `afterCompaction`, only those since the transcript's last compaction.
 */
export function toolResults(path, { since = null, afterCompaction = false } = {}) {
  if (!path || !existsSync(path)) return [];
  const sinceMs = since ? Date.parse(since) : null;
  if (isPiSession(head(path))) return piResults(path, { sinceMs, afterCompaction });
  for (const bytes of TAIL_STEPS) {
    const { text, whole } = readTail(path, bytes);
    const calls = new Map();
    const results = [];
    let cycleFrom = null;
    for (const line of text.split("\n")) {
      if (!line.includes('"tool_use') && !line.includes('"compact_boundary"')) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (entry.isSidechain) continue;
      if (entry.type === "system" && entry.subtype === "compact_boundary") {
        cycleFrom = results.length;
        continue;
      }
      for (const block of Array.isArray(entry.message?.content) ? entry.message.content : []) {
        if (block?.type === "tool_use") calls.set(block.id, labelOf(block.name, block.input));
        if (block?.type === "tool_result") {
          const body = textOf(block.content);
          results.push({
            id: block.tool_use_id,
            label: calls.get(block.tool_use_id) ?? "a tool call",
            text: body,
            at: entry.timestamp ?? null,
            tokens: tokensOf(body),
            error: block.is_error === true,
          });
        }
      }
    }
    // A read that starts mid-log is enough once it reaches back to what was asked for: the last compaction, or `since`.
    const first = results[0]?.at ? Date.parse(results[0].at) : null;
    const reached =
      whole ||
      (afterCompaction && cycleFrom !== null) ||
      (!afterCompaction && sinceMs !== null && first !== null && first <= sinceMs);
    if (!reached) continue;
    const kept = afterCompaction && cycleFrom !== null ? results.slice(cycleFrom) : results;
    return kept.filter((result) => sinceMs === null || !result.at || Date.parse(result.at) > sinceMs);
  }
  return [];
}

/** The transcript the session's harness layer names, else this Claude Code session's log. */
export function sessionTranscript(explicit = null, env = process.env) {
  return explicit ?? env.FREEFLOW_TRANSCRIPT ?? claudeCodeLog(env);
}

/** `carry list`: the results of this compaction cycle, numbered, each with its label, size and time. */
export function listResults(path) {
  const results = toolResults(path, { afterCompaction: true });
  if (!results.length) return "No tool results in this compaction cycle's transcript.\n";
  const minute = (at) => (at ? new Date(at).toISOString().slice(11, 16) : "time not recorded");
  return `${results
    .map(
      (result, index) =>
        `${index + 1}. ${minute(result.at)} · ${result.label} · ${result.tokens.toLocaleString("en-US")} tokens${result.error ? " · an error" : ""} · ${result.id}`,
    )
    .join("\n")}\nCarry one with "- Carry: result <n> — <why>" in In flight; the checkpoint pins it to its ID.\n`;
}

/** A result by its tool-use ID, or by its number in this compaction cycle's list; null when it is not there. */
export function findResult(path, key) {
  const results = toolResults(path, { afterCompaction: true });
  if (/^\d+$/.test(String(key))) return results[Number(key) - 1] ?? null;
  return results.find((result) => result.id === key) ?? toolResults(path).find((result) => result.id === key) ?? null;
}
