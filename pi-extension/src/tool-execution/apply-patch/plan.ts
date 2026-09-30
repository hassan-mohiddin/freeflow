import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { resolveToolPath } from "../file-state.js";
import { closestMatch } from "../edit-messages.js";
import { parsePatch, type Hunk, type UpdateChunk } from "./parser.js";
import { otherMatches, seekSequence } from "./match.js";

export type Operation = "add" | "update" | "delete" | "move";
export type FileOutcome = "written" | "not_written" | "failed";
export interface FileChange {
  path: string;
  operation: Operation;
  to?: string;
  outcome: FileOutcome;
  error?: string;
}
export interface PatchResult {
  status: "applied" | "not_applied" | "partial";
  files: FileChange[];
  /** Facts the model should see: ambiguous placement, files changed since read. */
  notes: string[];
  /** Why nothing was applied, as one next action. */
  error?: string;
}

/** What apply_patch needs from file tracking. */
export interface PatchFileState {
  wasRead(path: string, cwd: string): boolean;
  changedSinceObserved(path: string, cwd: string): Promise<boolean>;
}

class PlanError extends Error {}

interface Step {
  path: string;
  abs: string;
  operation: Operation;
  to?: string;
  toAbs?: string;
  content?: string;
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

const MAX_SHOWN_LINES = 20;

function notFound(path: string, hunk: number, oldLines: readonly string[], lines: readonly string[]): PlanError {
  const subject = `${path} hunk ${hunk}`;
  const match = closestMatch(lines.join("\n"), oldLines.join("\n"));
  if (!match)
    return new PlanError(
      `${subject}: context not found and no similar lines exist in the current file. Read the region you meant, then retry.`,
    );
  return new PlanError(
    [
      `${subject}: context not found. Closest match, lines ${match.start}–${match.end} (current file contents):`,
      ...lines.slice(match.start - 1, Math.min(match.end, match.start - 1 + MAX_SHOWN_LINES)),
      "If these are the lines you meant, retry with context copied exactly from them. If not, read the region you meant, then retry.",
    ].join("\n"),
  );
}

/** Split text as it was stored so it can be written back the same way: BOM, line ending, final newline. */
function splitText(raw: string) {
  const bom = raw.startsWith("﻿") ? "﻿" : "";
  const body = raw.slice(bom.length);
  const firstLf = body.indexOf("\n");
  const crlf = firstLf > 0 && body[firstLf - 1] === "\r";
  const lf = body.replace(/\r\n/g, "\n");
  const finalNewline = lf === "" || lf.endsWith("\n");
  const lines = lf === "" ? [] : lf.split("\n");
  if (lf.endsWith("\n")) lines.pop();
  return { bom, crlf, finalNewline, lines };
}

function joinText(parts: ReturnType<typeof splitText>, lines: string[]): string {
  const text = lines.join("\n") + (parts.finalNewline && lines.length > 0 ? "\n" : "");
  return parts.bom + (parts.crlf ? text.replace(/\n/g, "\r\n") : text);
}

/** Codex's compute_replacements, keeping the file's own bytes on context lines. */
function updateLines(path: string, lines: string[], chunks: readonly UpdateChunk[], notes: string[]): string[] {
  const replacements: { start: number; length: number; lines: string[] }[] = [];
  let cursor = 0;
  chunks.forEach((chunk, index) => {
    const hunk = index + 1;
    if (chunk.anchor !== undefined) {
      const anchor = seekSequence(lines, [chunk.anchor], cursor, false);
      if (!anchor)
        throw new PlanError(
          `${path} hunk ${hunk}: @@ line not found: '${chunk.anchor}'. Use a line that exists in the file after the previous hunk, or leave the @@ line empty.`,
        );
      cursor = anchor.index + 1;
    }
    if (chunk.oldLines.length === 0) {
      replacements.push({ start: lines.length, length: 0, lines: [...chunk.newLines] });
      return;
    }
    let pattern = chunk.oldLines;
    let replacement = chunk.newLines;
    let found = seekSequence(lines, pattern, cursor, chunk.endOfFile);
    if (!found && pattern.at(-1) === "") {
      // A trailing empty line stands for the file's final newline, which the line list does not hold.
      pattern = pattern.slice(0, -1);
      if (replacement.at(-1) === "") replacement = replacement.slice(0, -1);
      found = seekSequence(lines, pattern, cursor, chunk.endOfFile);
    }
    if (!found) throw notFound(path, hunk, chunk.oldLines, lines);
    const resolved = [...replacement];
    for (const [oldIndex, newIndex] of chunk.context)
      if (oldIndex < pattern.length && newIndex < resolved.length) resolved[newIndex] = lines[found.index + oldIndex];
    const others = otherMatches(lines, pattern, found.index, found.pass);
    if (others.length > 0)
      notes.push(
        `${path} hunk ${hunk}: its lines also match at line ${others.map((i) => i + 1).join(", ")}; it was applied at line ${found.index + 1}.`,
      );
    replacements.push({ start: found.index, length: pattern.length, lines: resolved });
    cursor = found.index + pattern.length;
  });
  const next = [...lines];
  for (const { start, length, lines: added } of [...replacements].sort((a, b) => b.start - a.start))
    next.splice(start, length, ...added);
  return next;
}

async function plan(hunks: readonly Hunk[], cwd: string, files: PatchFileState, notes: string[]): Promise<Step[]> {
  if (hunks.length === 0) throw new PlanError("The patch changes no files. Add at least one file section, then retry.");
  // Later sections see earlier sections' results, as they would if applied one by one.
  const virtual = new Map<string, string | null>();
  const current = async (abs: string): Promise<string | null> => {
    if (virtual.has(abs)) return virtual.get(abs)!;
    if (!(await isFile(abs))) return null;
    const bytes = await readFile(abs);
    const text = bytes.toString("utf8");
    return Buffer.from(text, "utf8").equals(bytes) ? text : "\u0000not-utf8";
  };
  const steps: Step[] = [];
  for (const hunk of hunks) {
    const abs = resolveToolPath(hunk.path, cwd);
    const existing = await current(abs);
    if (hunk.kind === "add") {
      if (existing !== null && !virtual.has(abs) && !files.wasRead(hunk.path, cwd))
        throw new PlanError(
          `${hunk.path} exists and has not been read in this session. Read ${hunk.path}, then retry the patch.`,
        );
      virtual.set(abs, hunk.contents);
      steps.push({ path: hunk.path, abs, operation: "add", content: hunk.contents });
      continue;
    }
    if (existing === null)
      throw new PlanError(
        hunk.kind === "delete"
          ? `${hunk.path}: file not found; nothing to delete.`
          : `${hunk.path}: file not found. Use *** Add File: ${hunk.path} to create it.`,
      );
    if (existing === "\u0000not-utf8")
      throw new PlanError(`${hunk.path}: not UTF-8 text; apply_patch edits text files only.`);
    if (!virtual.has(abs) && (await files.changedSinceObserved(hunk.path, cwd)))
      notes.push(`${hunk.path} changed since you read it; the patch applied to the current text.`);
    if (hunk.kind === "delete") {
      virtual.set(abs, null);
      steps.push({ path: hunk.path, abs, operation: "delete" });
      continue;
    }
    const parts = splitText(existing);
    const content = joinText(parts, updateLines(hunk.path, parts.lines, hunk.chunks, notes));
    if (hunk.moveTo !== undefined) {
      const toAbs = resolveToolPath(hunk.moveTo, cwd);
      if ((await current(toAbs)) !== null)
        throw new PlanError(`${hunk.moveTo} already exists. Delete or rename it first, or move to another path.`);
      virtual.set(abs, null);
      virtual.set(toAbs, content);
      steps.push({ path: hunk.path, abs, operation: "move", to: hunk.moveTo, toAbs, content });
      continue;
    }
    virtual.set(abs, content);
    steps.push({ path: hunk.path, abs, operation: "update", content });
  }
  return steps;
}

async function withLocks<T>(paths: readonly string[], fn: () => Promise<T>): Promise<T> {
  // Sorted, so two patches touching the same files never wait on each other in opposite order.
  const [first, ...rest] = [...new Set(paths)].sort();
  return first === undefined ? fn() : withFileMutationQueue(first, () => withLocks(rest, fn));
}

async function write(step: Step): Promise<void> {
  if (step.operation === "delete") return unlink(step.abs);
  const target = step.toAbs ?? step.abs;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, step.content!, "utf8");
  if (step.operation === "move") await unlink(step.abs);
}

/** Plan the whole patch against current files, then write it; a planning failure writes nothing. */
export async function applyPatch(text: string, cwd: string, files: PatchFileState): Promise<PatchResult> {
  const notes: string[] = [];
  let hunks: Hunk[];
  try {
    hunks = parsePatch(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { status: "not_applied", files: [], notes, error: `Invalid patch: ${reason}. Fix the patch, then retry.` };
  }
  const paths = hunks.flatMap((hunk) => [
    resolveToolPath(hunk.path, cwd),
    ...(hunk.kind === "update" && hunk.moveTo !== undefined ? [resolveToolPath(hunk.moveTo, cwd)] : []),
  ]);
  return withLocks(paths, async () => {
    let steps: Step[];
    try {
      steps = await plan(hunks, cwd, files, notes);
    } catch (error) {
      if (!(error instanceof PlanError)) throw error;
      return { status: "not_applied", files: [], notes, error: error.message };
    }
    const changes: FileChange[] = steps.map((step) => ({
      path: step.path,
      operation: step.operation,
      ...(step.to === undefined ? {} : { to: step.to }),
      outcome: "not_written",
    }));
    for (const [index, step] of steps.entries()) {
      try {
        await write(step);
        changes[index].outcome = "written";
      } catch (error) {
        changes[index].outcome = "failed";
        changes[index].error = error instanceof Error ? error.message : String(error);
        // A failed write may already have changed its target, so this is never reported as "not applied".
        // Nothing after it is attempted.
        return { status: "partial", files: changes, notes };
      }
    }
    return { status: "applied", files: changes, notes };
  });
}
