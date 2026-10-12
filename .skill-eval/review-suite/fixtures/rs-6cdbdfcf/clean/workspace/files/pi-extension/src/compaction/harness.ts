import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { touchedPaths } from "../tool-execution/file-state.js";

/**
 * The part of a compaction summary Freeflow writes itself, from facts it holds rather than the model's memory: the
 * cycle, the Working Record to read first, the routing profile, running background commands, and the files the
 * cycle read and changed.
 */

export interface HarnessFacts {
  cycle: number;
  /** Pi's own summary already lists files; a fallback compaction leaves them out here. */
  includeFiles?: boolean;
  /** Recovery instructions inside the summary, for compactions with no separate recovery message. */
  recovery?: string;
  recordPath?: string;
  routingProfile?: string;
  background: readonly { id: string; label: string; outputPath: string }[];
  /** Session-wide lists in Pi's details format. */
  files: { readFiles: string[]; modifiedFiles: string[] };
}

/** Entries after the latest compaction on the branch: the current cycle. */
export function currentCycle(branch: readonly any[]): any[] {
  let start = 0;
  branch.forEach((entry, i) => {
    if (entry?.type === "compaction") start = i + 1;
  });
  return branch.slice(start);
}

/** The cycle number the next compaction starts. Cycle 1 runs from session start to the first compaction. */
export const nextCycle = (branch: readonly any[]): number =>
  branch.filter((entry) => entry?.type === "compaction").length + 2;

/**
 * Files successful calls in this cycle read or changed, in first-touched order. Calls a codemode script made count
 * too: Pi records them on the script's result as nested calls.
 */
export function cycleFiles(branch: readonly any[]): { read: string[]; changed: string[] } {
  const calls = new Map<string, { name: string; input: any }>();
  const read = new Set<string>(),
    changed = new Set<string>();
  const touch = (name: string, input: any) => {
    for (const path of touchedPaths(name, input)) (name === "read" ? read : changed).add(path);
  };
  for (const entry of currentCycle(branch)) {
    const message = entry?.type === "message" ? entry.message : undefined;
    if (message?.role === "assistant")
      for (const block of message.content ?? [])
        if (block?.type === "toolCall") calls.set(block.id, { name: block.name, input: block.arguments });
    if (message?.role !== "toolResult") continue;
    for (const nested of message.nestedCalls?.calls ?? [])
      if (nested?.status === "ok") touch(nested.name, nested.arguments);
    const call = calls.get(message.toolCallId);
    if (call && message.isError !== true) touch(call.name, call.input);
  }
  return { read: [...read].filter((path) => !changed.has(path)), changed: [...changed] };
}

/** The file lists the latest compaction stored in Pi's details format, whoever wrote it. */
export function previousFileLists(branch: readonly any[]): { readFiles: string[]; modifiedFiles: string[] } {
  const latest = [...branch].reverse().find((entry) => entry?.type === "compaction");
  const strings = (value: unknown) => (Array.isArray(value) ? value.filter((v) => typeof v === "string") : []);
  return { readFiles: strings(latest?.details?.readFiles), modifiedFiles: strings(latest?.details?.modifiedFiles) };
}

/** Session-wide lists in Pi's format: earlier compactions' lists plus this cycle; a modified file is not "read". */
export function sessionFileLists(branch: readonly any[]): { readFiles: string[]; modifiedFiles: string[] } {
  const previous = previousFileLists(branch);
  const cycle = cycleFiles(branch);
  const modified = new Set([...previous.modifiedFiles, ...cycle.changed]);
  const read = new Set([...previous.readFiles, ...cycle.read].filter((path) => !modified.has(path)));
  return { readFiles: [...read].sort(), modifiedFiles: [...modified].sort() };
}

/** Pi's own file-list form, so summaries read alike whichever path wrote them. */
export function formatFileLists(lists: { readFiles: string[]; modifiedFiles: string[] }): string {
  return [
    lists.readFiles.length ? `<read-files>\n${lists.readFiles.join("\n")}\n</read-files>` : "",
    lists.modifiedFiles.length ? `<modified-files>\n${lists.modifiedFiles.join("\n")}\n</modified-files>` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The cycle's start time: the latest compaction entry, else the session's first entry. */
export function cycleStart(branch: readonly any[]): number {
  const marker = [...branch].reverse().find((entry) => entry?.type === "compaction") ?? branch[0];
  const time = Date.parse(marker?.timestamp ?? "");
  return Number.isFinite(time) ? time : 0;
}

/** The Working Record updated most recently since `since`, as a path relative to `cwd`. */
export async function recentWorkingRecord(cwd: string, since: number): Promise<string | undefined> {
  let tasks: string[];
  try {
    tasks = await readdir(join(cwd, ".freeflow", "tasks"));
  } catch {
    return undefined;
  }
  let newest: { path: string; at: number } | undefined;
  for (const task of tasks) {
    const path = join(".freeflow", "tasks", task, "record.md");
    try {
      const at = (await stat(join(cwd, path))).mtimeMs;
      if (at >= since && (!newest || at > newest.at)) newest = { path, at };
    } catch {}
  }
  return newest?.path;
}

export function harnessPart(facts: HarnessFacts): string {
  const lines = [`## Freeflow state at compaction`, "", `This compaction starts cycle ${facts.cycle}.`];
  if (facts.recordPath) lines.push(`Working Record updated this cycle: ${facts.recordPath}. Read it first.`);
  if (facts.routingProfile) lines.push(`Cognitive Routing profile when compacted: ${facts.routingProfile}.`);
  if (facts.background.length)
    lines.push(
      `Background commands still running: ${facts.background.map((job) => `${job.id} (${job.label}), output ${job.outputPath}`).join("; ")}.`,
    );
  const files = facts.includeFiles === false ? "" : formatFileLists(facts.files);
  if (files) lines.push("", "Files read and modified in this session:", "", files);
  if (facts.recovery) lines.push("", facts.recovery);
  return lines.join("\n");
}
