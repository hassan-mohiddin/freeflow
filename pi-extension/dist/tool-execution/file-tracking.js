import { realpathSync, statSync } from "node:fs";
import { isAbsolute, relative } from "node:path";
import { readFile } from "node:fs/promises";
import { FileState, resolveToolPath } from "./file-state.js";
import {
  changedAfterEdit,
  changedAfterWrite,
  changedFilesNotice,
  editableText,
  noNeedToReread,
  rewriteEditError,
  writeRefusal,
} from "./edit-messages.js";
import { SkillReads } from "./skill-reads.js";
import { cachedBranch } from "../host/branch.js";
function existingFile(path, cwd) {
  try {
    return statSync(resolveToolPath(path, cwd)).isFile();
  } catch {
    return false;
  }
}
// Tools whose own targets are observed after they run; any other tool may change files behind the model's back.
const TRACKED_TOOLS = ["read", "edit", "write", "apply_patch"];
/** A tracked file (keyed by real path) as the model would name it: relative to the working directory when inside. */
function shown(path, cwd) {
  let real = cwd;
  try {
    real = realpathSync(cwd);
  } catch {}
  for (const base of [real, cwd]) {
    const inside = relative(base, path);
    if (inside && !inside.startsWith("..") && !isAbsolute(inside)) return inside;
  }
  return path;
}
/** A tool result's content with lines appended to its text (before delivery: nothing already sent changes). */
export function withLines(content, lines) {
  const text = content.map((part) => (part?.type === "text" ? part.text : "")).join("");
  return [
    { type: "text", text: [text, ...lines].filter(Boolean).join("\n") },
    ...content.filter((part) => part?.type !== "text"),
  ];
}
/**
 * Claude Code's file awareness around Pi's read, edit and write: refuse a whole-file write over a file never read,
 * say when an edited file changed since it was read, turn edit errors into one next action, and answer a repeat
 * read of a Freeflow instruction file the model already holds with one line. Nested calls (codemode) are handled like
 * direct ones, except that a nested read is never answered for the model: the script consumes its text.
 */
export class FileTracking {
  state = new FileState();
  changed = new Map();
  skillReads = new SkillReads();
  built = false;
  reset() {
    this.state.reset();
    this.changed.clear();
    this.skillReads.reset();
    this.built = false;
  }
  /** Forget the branch's files; they are rebuilt from the new branch before the next tool call. */
  invalidate() {
    this.built = false;
    this.skillReads.invalidate();
  }
  /** After Pi's own compaction the files are unchanged, but the instruction files read before it are out of view. */
  piCompacted() {
    this.skillReads.clear();
  }
  clearPending() {
    this.changed.clear();
  }
  /** After a Freeflow compaction the model holds only the carried files, read at compaction time. */
  async compacted(carried, ctx) {
    this.state.reset();
    this.changed.clear();
    for (const path of carried) await this.state.observe(path, ctx.cwd, "read");
    this.built = true;
    this.skillReads.clear();
  }
  /** Freeflow skills the model holds in this context, by name; reads are rebuilt from the branch when needed. */
  loadedSkills(ctx) {
    if (!this.skillReads.built) this.skillReads.rebuild(cachedBranch(ctx.sessionManager) ?? [], ctx.cwd);
    return this.skillReads.skills();
  }
  /** The branch's file state for apply_patch, built when needed. */
  async forPatch(ctx) {
    await this.ensureBuilt(ctx);
    return this.state;
  }
  /** Record files a successful apply_patch wrote or moved, as a successful write records them. */
  async written(paths, ctx) {
    await this.ensureBuilt(ctx);
    for (const path of paths) await this.state.observe(path, ctx.cwd, "apply_patch");
  }
  async ensureBuilt(ctx) {
    if (!this.skillReads.built) this.skillReads.rebuild(cachedBranch(ctx.sessionManager) ?? [], ctx.cwd);
    if (this.built) return;
    await this.state.rebuild(cachedBranch(ctx.sessionManager) ?? [], ctx.cwd);
    this.built = true;
  }
  async toolCall(event, ctx) {
    const name = event.toolName;
    const path = event.input?.path;
    if (!["edit", "write"].includes(name) || typeof path !== "string") return undefined;
    await this.ensureBuilt(ctx);
    if (name === "write" && existingFile(path, ctx.cwd) && !this.state.wasRead(path, ctx.cwd))
      return { block: true, reason: writeRefusal(path) };
    if (await this.state.changedSinceObserved(path, ctx.cwd)) this.changed.set(event.toolCallId, path);
    return undefined;
  }
  /** Files the model read that changed since, not yet reported; undefined when there are none. */
  async changedNotice(ctx, build = true) {
    // Before a prompt nothing is rebuilt: a branch not yet rebuilt has no baseline to compare against.
    if (!build && !this.built) return undefined;
    await this.ensureBuilt(ctx);
    const found = await this.state.changedSinceNoticed();
    return changedFilesNotice(
      found.filter((file) => !file.deleted).map((file) => shown(file.path, ctx.cwd)),
      found.filter((file) => file.deleted).map((file) => shown(file.path, ctx.cwd)),
    );
  }
  async toolResult(event, ctx) {
    const name = event.toolName;
    // A command (or any other tool) may have changed files the model read. Nested calls are reported on the
    // result of the script that made them, which is what the model sees.
    if (!TRACKED_TOOLS.includes(name)) {
      if (event.parentToolCallId) return undefined;
      const notice = await this.changedNotice(ctx);
      return notice === undefined ? undefined : { content: withLines(event.content ?? [], [notice]) };
    }
    const path = event.input?.path;
    if (!["read", "edit", "write"].includes(name) || typeof path !== "string") return undefined;
    await this.ensureBuilt(ctx);
    const changed = this.changed.get(event.toolCallId);
    this.changed.delete(event.toolCallId);
    if (event.isError) {
      if (name !== "edit") return undefined;
      let fileText;
      try {
        fileText = editableText(await readFile(resolveToolPath(path, ctx.cwd), "utf8"));
      } catch {
        return undefined;
      }
      const error = (event.content ?? []).map((part) => (part?.type === "text" ? part.text : "")).join("");
      const rewritten = rewriteEditError(error, path, event.input?.edits ?? [], fileText);
      return rewritten === undefined ? undefined : { content: [{ type: "text", text: rewritten }] };
    }
    await this.state.observe(path, ctx.cwd, name);
    if (name === "read") {
      this.skillReads.observe(event, ctx.cwd);
      return undefined;
    }
    const lines =
      name === "edit"
        ? [...(changed ? [changedAfterEdit(path)] : []), noNeedToReread(path)]
        : changed
          ? [changedAfterWrite(path)]
          : [];
    return lines.length > 0 ? { content: withLines(event.content ?? [], lines) } : undefined;
  }
}
