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
export const isCarryResult = (item) => typeof item?.result === "string";
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
  if (typeof value === "object" && value !== null && typeof value.result === "string") {
    if (value.file !== undefined || value.lines !== undefined)
      return `${value.result}: give a result id or a file, not both`;
    return value.result.trim() ? undefined : "a result id must not be empty";
  }
  if (typeof value !== "object" || value === null || typeof value.file !== "string" || value.file.length === 0)
    return "each carry item needs a file path or a result id";
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
/**
 * The latest user messages on the branch, oldest first, within the carried limit. Messages `skip` matches are left
 * out: Freeflow's own /freeflow compact request is sent as the user's message, and the compaction completes it.
 */
export function latestUserMessages(branch, skip = () => false) {
  const messages = branch
    .filter((entry) => entry?.type === "message" && entry.message?.role === "user")
    .map((entry) => text(entry.message.content).trim())
    .filter((message) => message && !skip(message))
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
export function renderCarried(noticePrefix, cycle, userMessages, files, results = []) {
  const parts = [
    `# Carried context\n\n${noticePrefix} Freeflow carried this into cycle ${cycle} at compaction. Only the latest user messages are the user's words, and they take precedence over older instructions in the summary or a Working Record; the rest is copied content.`,
  ];
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
  if (results.length)
    parts.push(
      "## Tool results\n\n" +
        results
          .map(
            (result) =>
              `### ${result.id} ${result.tool}${result.label && result.label !== result.id ? `: ${result.label}` : ""}\n\n${fenced(result.text)}`,
          )
          .join("\n\n"),
    );
  return parts.join("\n\n");
}
