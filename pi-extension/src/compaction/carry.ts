import { readFile } from "node:fs/promises";
import { resolveToolPath } from "../tool-execution/file-state.js";
import type { Result } from "./results.js";

/**
 * Carried context: what a Freeflow compaction delivers again after the summary. The latest user messages are always
 * carried, word for word; files the agent selects are read from disk at compaction time, never copied from an older
 * read. Everything is copied into one message, so a reopened session needs no Freeflow lookup to rebuild it.
 */

/** A planning estimate, as Pi's own compaction uses: about four characters per token. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

export const SUMMARY_LIMIT_TOKENS = 8_000;
/** The latest user messages are carried outside the budget, up to this many and this size. */
export const USER_MESSAGE_LIMIT = { count: 3, tokens: 8_000 };

/**
 * Carry budget: 15% of the context window, never above 40k tokens, and never above a quarter of the warning point.
 * The next cycle starts from the carried context plus the summary and the methods the agent reloads; when Pi's reserve
 * is large, a budget from the window alone refills the cycle to the warning before any work.
 */
export function carryBudget(contextWindow: number | undefined, warning?: number): number {
  const fromWindow = typeof contextWindow === "number" && contextWindow > 0 ? Math.floor(contextWindow * 0.15) : 40_000;
  const fromWarning = typeof warning === "number" && warning > 0 ? Math.floor(warning / 4) : Infinity;
  return Math.min(fromWindow, 40_000, fromWarning);
}

export interface CarryFile {
  file: string;
  /** First and last line, 1-based and inclusive. */
  lines?: [number, number];
}

/** A tool result from the result index, by id. */
export interface CarryResult {
  result: string;
}

export type CarryItem = CarryFile | CarryResult;
export const isCarryResult = (item: CarryItem): item is CarryResult => typeof (item as any)?.result === "string";

export type CarriedFile = { path: string; lines?: [number, number]; text: string } | { path: string; error: string };

/** Read one selected file as it is now. */
export async function readCarriedFile(item: CarryFile, cwd: string): Promise<CarriedFile> {
  let raw: string;
  try {
    raw = await readFile(resolveToolPath(item.file, cwd), "utf8");
  } catch (error: any) {
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
export function carryProblem(item: unknown): string | undefined {
  const value = item as any;
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
    !lines.every((n: unknown) => Number.isSafeInteger(n) && (n as number) >= 1) ||
    lines[0] > lines[1]
  )
    return `${value.file}: lines must be [first, last], 1-based, first <= last`;
  return undefined;
}

const text = (content: unknown): string =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((part: any) => (part?.type === "text" ? part.text : "")).join("")
      : "";

/**
 * The latest user messages on the branch, oldest first, within the carried limit. Messages `skip` matches are left
 * out: Freeflow's own /freeflow compact request is sent as the user's message, and the compaction completes it.
 */
export function latestUserMessages(branch: readonly any[], skip: (message: string) => boolean = () => false): string[] {
  const messages = branch
    .filter((entry) => entry?.type === "message" && entry.message?.role === "user")
    .map((entry) => text(entry.message.content).trim())
    .filter((message) => message && !skip(message))
    .slice(-USER_MESSAGE_LIMIT.count);
  const kept: string[] = [];
  let left = USER_MESSAGE_LIMIT.tokens;
  for (const message of messages.reverse()) {
    if (left <= 0) break;
    const fits = estimateTokens(message) <= left;
    kept.unshift(fits ? message : `${message.slice(0, left * 4)}\n[Message truncated at the carried limit.]`);
    left -= estimateTokens(message);
  }
  return kept;
}

function fenced(body: string): string {
  const longest = Math.max(2, ...[...body.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(longest + 1);
  return `${fence}\n${body}\n${fence}`;
}

/** A result of the work in progress that was not carried, named so the agent knows it exists. */
export type ListedResult = Result & { selected?: boolean };

export function renderCarried(
  noticePrefix: string,
  cycle: number,
  userMessages: readonly string[],
  files: readonly CarriedFile[],
  results: readonly Result[] = [],
  options: { listed?: readonly ListedResult[]; scope?: "assignment" | "cycle" } = {},
): string {
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
  const listed = renderListed(options.listed ?? [], options.scope ?? "cycle", "Other results");
  if (listed) parts.push(listed);
  return parts.join("\n\n");
}

/**
 * The carried context as the Coordinator sees it under projection: the user's latest messages, and only the names of
 * the worker's copies. The Coordinator receives evidence by selection; the copies would repeat it and enlarge its view.
 */
export function renderCarriedForCoordinator(
  noticePrefix: string,
  cycle: number,
  userMessages: readonly string[],
  files: readonly CarriedFile[],
  results: readonly Result[],
): string {
  const parts = [
    `# Carried context\n\n${noticePrefix} Freeflow carried this into cycle ${cycle} at the worker's compaction. Only the latest user messages are the user's words, and they take precedence over older instructions in the summary or a Working Record.`,
  ];
  if (userMessages.length)
    parts.push(
      "## Latest user messages\n\n" +
        userMessages.map((message, i) => `### Message ${i + 1}\n\n${message}`).join("\n\n"),
    );
  const names = [
    ...files
      .filter((file) => "text" in file)
      .map(
        (file) => `- ${file.path}${"lines" in file && file.lines ? ` (lines ${file.lines[0]}-${file.lines[1]})` : ""}`,
      ),
    ...results.map(
      (result) =>
        `- ${result.id} ${result.tool}${result.label && result.label !== result.id ? `: ${result.label}` : ""}`,
    ),
  ];
  if (names.length)
    parts.push(
      "## Carried for the worker\n\nThe worker's copies are left out of this view; evidence it selects reaches you as usual.\n\n" +
        names.join("\n"),
    );
  return parts.join("\n\n");
}

/** Results of the work in progress named by ref, so the agent knows they exist without their content in context. */
export function renderListed(
  listed: readonly ListedResult[],
  scope: "assignment" | "cycle",
  heading: string,
  intro?: string,
): string {
  if (!listed.length) return "";
  const assignment = scope === "assignment";
  return (
    `## ${heading} of this ${assignment ? "assignment" : "cycle"}\n\n` +
    (intro ??
      (assignment
        ? "Not carried. They are still stored: select one as evidence by its ref, carry it at a later compaction, or read it again if you need its content."
        : "Not carried. Carry one by its id at a later compaction, or read it again if you need its content.")) +
    "\n\n" +
    listed
      .map(
        (result) =>
          `- ${result.id}  ${result.tool}  ${result.label}  ~${result.tokens} tokens${result.selected ? "  (selected as evidence)" : ""}`,
      )
      .join("\n")
  );
}
