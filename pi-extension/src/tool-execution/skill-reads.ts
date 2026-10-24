import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** The Freeflow package root, as this module was loaded and through its real path. */
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const ROOTS = [...new Set([resolve(ROOT), realOr(ROOT)])];
const INSTRUCTION_DIRS = ["capabilities", "skills", "runtime"];

function realOr(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/**
 * A Freeflow instruction file (a skill, a reference, a runtime prompt) by its path inside the package, such as
 * `skills/track-work/SKILL.md`; undefined for any other path. No file system access: a path is matched as written,
 * against the package root and its real path.
 */
export function instructionPath(path: string, cwd: string = process.cwd()): string | undefined {
  let candidate = path.startsWith("@") ? path.slice(1) : path;
  if (candidate === "~" || candidate.startsWith("~/")) candidate = `${homedir()}${candidate.slice(1)}`;
  const absolute = isAbsolute(candidate) ? resolve(candidate) : resolve(cwd, candidate);
  for (const root of ROOTS) {
    const inside = relative(root, absolute);
    if (!inside || inside.startsWith("..") || isAbsolute(inside)) continue;
    if (INSTRUCTION_DIRS.some((dir) => inside.startsWith(dir + sep))) return inside.split(sep).join("/");
  }
  return undefined;
}

/** Whether a tool call reads one of Freeflow's own instruction files. */
export function isFreeflowInstruction(tool: string, input: any, cwd?: string): boolean {
  return tool === "read" && typeof input?.path === "string" && instructionPath(input.path, cwd) !== undefined;
}

/** The skill a path's `SKILL.md` belongs to, by its directory name; undefined for any other file. */
export function skillName(path: string, cwd?: string): string | undefined {
  const inside = instructionPath(path, cwd);
  return inside?.match(/^(?:skills|capabilities)\/([^/]+)\/SKILL\.md$/)?.[1];
}

/** Skills whose `SKILL.md` a successful top-level read in these entries returned, in first-read order. */
export function skillsRead(entries: readonly any[], cwd?: string): string[] {
  const calls = new Map<string, any>();
  const names = new Set<string>();
  for (const entry of entries) {
    const message = entry?.type === "message" ? entry.message : undefined;
    if (message?.role === "assistant")
      for (const block of message.content ?? [])
        if (block?.type === "toolCall" && block.name === "read") calls.set(block.id, block.arguments);
    if (message?.role !== "toolResult" || message.isError === true) continue;
    const input = calls.get(message.toolCallId);
    const name = typeof input?.path === "string" ? skillName(input.path, cwd) : undefined;
    if (name) names.add(name);
  }
  return [...names];
}

/** Marks a read result an earlier version replaced with one line, so a rebuild does not take it for the file's text. */
const REPLACED = "freeflowSkillRead";

/** Pi's note after a read cut short by its `limit` while the file goes on. */
const MORE_LINES = /\n\n(\[\d+ more lines in file\. Use offset=\d+ to continue\.\])$/;

interface Seen {
  /** The file line the text starts at (Pi's read is 1-based). */
  start: number;
  lines: string[];
  /** Whether the text ran to the end of the file. */
  toEnd: boolean;
}

/**
 * The text of a successful, complete read as the model saw it: its first line number, its lines, and Pi's trailing
 * note when a limit stopped it early. Undefined when Pi truncated it, it holds an image, or its range is unusual.
 */
function readText(
  input: any,
  content: readonly any[] | undefined,
  details: any,
): (Seen & { note?: string }) | undefined {
  if (!Array.isArray(content) || content.some((part) => part?.type !== "text")) return undefined;
  if (details?.truncation?.truncated || details?.truncation?.firstLineExceedsLimit) return undefined;
  const { offset, limit } = input ?? {};
  if (offset !== undefined && !Number.isFinite(offset)) return undefined;
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) return undefined;
  // Pi starts at offset - 1, as an array index.
  const start = offset ? Math.trunc(Math.max(0, offset - 1)) + 1 : 1;
  let text = content.map((part) => part.text ?? "").join("");
  const more = limit === undefined ? null : MORE_LINES.exec(text);
  if (more) text = text.slice(0, more.index);
  return { start, lines: text.split("\n"), toEnd: !more, ...(more ? { note: more[1] } : {}) };
}

/**
 * The text of Freeflow's instruction files the model holds in this context, from successful top-level reads, for the
 * skills-read list. A repeat read passes through untouched. Any compaction clears it; navigation rebuilds it from the
 * branch. Memory only.
 */
export class SkillReads {
  private readonly seen = new Map<string, Seen[]>();
  built = false;

  reset(): void {
    this.seen.clear();
    this.built = false;
  }

  /** Forget the branch's reads; they are rebuilt from the new branch before the next tool call. */
  invalidate(): void {
    this.built = false;
  }

  /** After any compaction the earlier reads are out of the model's view. */
  clear(): void {
    this.seen.clear();
    this.built = true;
  }

  /** Every read since the latest compaction on the branch. */
  rebuild(branch: readonly any[], cwd: string): void {
    this.seen.clear();
    const calls = new Map<string, any>();
    for (const entry of branch) {
      if (entry?.type === "compaction") {
        this.seen.clear();
        calls.clear();
      }
      const message = entry?.type === "message" ? entry.message : undefined;
      if (message?.role === "assistant")
        for (const block of message.content ?? [])
          if (block?.type === "toolCall" && block.name === "read") calls.set(block.id, block.arguments);
      if (message?.role !== "toolResult" || message.isError === true || message.details?.[REPLACED]) continue;
      const input = calls.get(message.toolCallId);
      const key = typeof input?.path === "string" ? instructionPath(input.path, cwd) : undefined;
      const read = key === undefined ? undefined : readText(input, message.content, message.details);
      if (key !== undefined && read) this.record(key, read);
    }
    this.built = true;
  }

  /**
   * Skills whose `SKILL.md` text the model holds, by name, sorted: parallel reads record in completion order live and
   * in branch order on rebuild, so a sorted list is the same before and after a resume and costs no new state copy.
   */
  skills(): string[] {
    return [...this.seen.keys()]
      .flatMap((key) => key.match(/^(?:skills|capabilities)\/([^/]+)\/SKILL\.md$/)?.[1] ?? [])
      .sort();
  }

  private record(key: string, read: Seen): void {
    const seen = this.seen.get(key) ?? [];
    seen.push({ start: read.start, lines: read.lines, toEnd: read.toEnd });
    this.seen.set(key, seen);
  }

  /** Records a successful, complete top-level read of an instruction file; its result reaches the model unchanged. */
  observe(event: any, cwd: string): void {
    if (event.toolName !== "read" || event.isError || event.parentToolCallId) return;
    const input = event.input;
    const key = typeof input?.path === "string" ? instructionPath(input.path, cwd) : undefined;
    if (key === undefined) return;
    const read = readText(input, event.content, event.details);
    if (read) this.record(key, read);
  }
}
