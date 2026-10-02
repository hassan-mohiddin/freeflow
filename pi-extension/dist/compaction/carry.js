import { readFile } from "node:fs/promises";
import { resolveToolPath } from "../tool-execution/file-state.js";
/**
 * Carried context: what a Freeflow compaction delivers again after the summary. The latest user messages are always
 * carried, word for word; files the agent selects are read from disk at compaction time, never copied from an older
 * read. Everything is copied into one message, so a reopened session needs no Freeflow lookup to rebuild it.
 */
/** A planning estimate, as Pi's own compaction uses: about four characters per token. */
export const estimateTokens = (text) => Math.ceil(text.length / 4);
export const SUMMARY_LIMIT_TOKENS = 8_000;
/** The latest user messages are carried outside the budget, up to this many and this size. */
export const USER_MESSAGE_LIMIT = { count: 3, tokens: 8_000 };
/** Carry budget: 15% of the context window, never above 40k tokens. */
export function carryBudget(contextWindow) {
  if (!(typeof contextWindow === "number" && contextWindow > 0)) return 40_000;
  return Math.min(Math.floor(contextWindow * 0.15), 40_000);
}
/** Read one selected file as it is now. */
export async function readCarriedFile(item, cwd) {
  let raw;
  try {
    raw = await readFile(resolveToolPath(item.file, cwd), "utf8");
  } catch (error) {
    return { path: item.file, error: error?.code === "ENOENT" ? "file not found" : "file could not be read" };
  }
  if (raw.includes("\u0000")) return { path: item.file, error: "binary file, not carried" };
  if (!item.lines) return { path: item.file, text: raw };
  const [first, last] = item.lines;
  return {
    path: item.file,
    lines: item.lines,
    text: raw
      .split("\n")
      .slice(first - 1, last)
      .join("\n"),
  };
}
/** The reason a carry selection is unusable, or undefined. */
export function carryProblem(item) {
  const value = item;
  if (typeof value !== "object" || value === null || typeof value.file !== "string" || value.file.length === 0)
    return "each carry item needs a file path";
  if (value.lines === undefined) return undefined;
  const lines = value.lines;
  if (
    !Array.isArray(lines) ||
    lines.length !== 2 ||
    !lines.every((n) => Number.isSafeInteger(n) && n >= 1) ||
    lines[0] > lines[1]
  )
    return `${value.file}: lines must be [first, last], 1-based, first <= last`;
  return undefined;
}
const text = (content) =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((part) => (part?.type === "text" ? part.text : "")).join("")
      : "";
/** The latest user messages on the branch, oldest first, within the carried limit. */
export function latestUserMessages(branch) {
  const messages = branch
    .filter((entry) => entry?.type === "message" && entry.message?.role === "user")
    .map((entry) => text(entry.message.content).trim())
    .filter(Boolean)
    .slice(-USER_MESSAGE_LIMIT.count);
  const kept = [];
  let left = USER_MESSAGE_LIMIT.tokens;
  for (const message of messages.reverse()) {
    if (left <= 0) break;
    const fits = estimateTokens(message) <= left;
    kept.unshift(fits ? message : `${message.slice(0, left * 4)}\n[Message truncated at the carried limit.]`);
    left -= estimateTokens(message);
  }
  return kept;
}
function fenced(body) {
  const longest = Math.max(2, ...[...body.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(longest + 1);
  return `${fence}\n${body}\n${fence}`;
}
export function renderCarried(cycle, userMessages, files) {
  const parts = [`# Carried context\n\nFreeflow carried this into cycle ${cycle} at compaction.`];
  if (userMessages.length)
    parts.push(
      "## Latest user messages\n\n" +
        userMessages.map((message, i) => `### Message ${i + 1}\n\n${message}`).join("\n\n"),
    );
  if (files.length)
    parts.push(
      "## Files, read at compaction\n\n" +
        files
          .map((file) => {
            const range = "lines" in file && file.lines ? ` (lines ${file.lines[0]}-${file.lines[1]})` : "";
            return "error" in file
              ? `### ${file.path}\n\nNot carried: ${file.error}.`
              : `### ${file.path}${range}\n\n${fenced(file.text)}`;
          })
          .join("\n\n"),
    );
  return parts.join("\n\n");
}
