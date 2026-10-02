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
  recordPath?: string;
  routingProfile?: string;
  background: readonly { id: string; label: string; outputPath: string }[];
  files: { read: string[]; changed: string[] };
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

/** Files successful calls in this cycle read or changed, in first-touched order. */
export function cycleFiles(branch: readonly any[]): { read: string[]; changed: string[] } {
  const calls = new Map<string, { name: string; input: any }>();
  const read = new Set<string>(),
    changed = new Set<string>();
  for (const entry of currentCycle(branch)) {
    const message = entry?.type === "message" ? entry.message : undefined;
    if (message?.role === "assistant")
      for (const block of message.content ?? [])
        if (block?.type === "toolCall") calls.set(block.id, { name: block.name, input: block.arguments });
    if (message?.role === "toolResult" && message.isError !== true) {
      const call = calls.get(message.toolCallId);
      if (!call) continue;
      for (const path of touchedPaths(call.name, call.input)) (call.name === "read" ? read : changed).add(path);
    }
  }
  return { read: [...read].filter((path) => !changed.has(path)), changed: [...changed] };
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
  if (facts.files.read.length) lines.push(`Files read this cycle: ${facts.files.read.join(", ")}.`);
  if (facts.files.changed.length) lines.push(`Files changed this cycle: ${facts.files.changed.join(", ")}.`);
  return lines.join("\n");
}
