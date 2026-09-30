import { statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { FileState, resolveToolPath } from "./file-state.js";
import {
  changedAfterEdit,
  changedAfterWrite,
  editableText,
  noNeedToReread,
  rewriteEditError,
  writeRefusal,
} from "./edit-messages.js";

function existingFile(path: string, cwd: string): boolean {
  try {
    return statSync(resolveToolPath(path, cwd)).isFile();
  } catch {
    return false;
  }
}

function withLines(content: readonly any[], lines: readonly string[]) {
  const text = content.map((part) => (part?.type === "text" ? part.text : "")).join("");
  return [{ type: "text", text: [text, ...lines].join("\n") }, ...content.filter((part) => part?.type !== "text")];
}

/**
 * Claude Code's file awareness around Pi's read, edit and write: refuse a whole-file write over a file never read,
 * say when an edited file changed since it was read, and turn edit errors into one next action. Nested calls
 * (codemode) are handled like direct ones.
 */
export class FileTracking {
  private readonly state = new FileState();
  private readonly changed = new Map<string, string>();
  private built = false;

  reset(): void {
    this.state.reset();
    this.changed.clear();
    this.built = false;
  }

  /** Forget the branch's files; they are rebuilt from the new branch before the next tool call. */
  invalidate(): void {
    this.built = false;
  }

  clearPending(): void {
    this.changed.clear();
  }

  /** The branch's file state for apply_patch, built when needed. */
  async forPatch(ctx: any): Promise<FileState> {
    await this.ensureBuilt(ctx);
    return this.state;
  }

  /** Record files a successful apply_patch wrote or moved, as a successful write records them. */
  async written(paths: readonly string[], ctx: any): Promise<void> {
    await this.ensureBuilt(ctx);
    for (const path of paths) await this.state.observe(path, ctx.cwd, "apply_patch");
  }

  private async ensureBuilt(ctx: any): Promise<void> {
    if (this.built) return;
    await this.state.rebuild(ctx.sessionManager?.getBranch?.() ?? [], ctx.cwd);
    this.built = true;
  }

  async toolCall(event: any, ctx: any): Promise<{ block: true; reason: string } | undefined> {
    const name = event.toolName;
    const path = event.input?.path;
    if (!["edit", "write"].includes(name) || typeof path !== "string") return undefined;
    await this.ensureBuilt(ctx);
    if (name === "write" && existingFile(path, ctx.cwd) && !this.state.wasRead(path, ctx.cwd))
      return { block: true, reason: writeRefusal(path) };
    if (await this.state.changedSinceObserved(path, ctx.cwd)) this.changed.set(event.toolCallId, path);
    return undefined;
  }

  async toolResult(event: any, ctx: any): Promise<{ content: any[] } | undefined> {
    const name = event.toolName;
    const path = event.input?.path;
    if (!["read", "edit", "write"].includes(name) || typeof path !== "string") return undefined;
    await this.ensureBuilt(ctx);
    const changed = this.changed.get(event.toolCallId);
    this.changed.delete(event.toolCallId);
    if (event.isError) {
      if (name !== "edit") return undefined;
      let fileText: string;
      try {
        fileText = editableText(await readFile(resolveToolPath(path, ctx.cwd), "utf8"));
      } catch {
        return undefined;
      }
      const error = (event.content ?? []).map((part: any) => (part?.type === "text" ? part.text : "")).join("");
      const rewritten = rewriteEditError(error, path, event.input?.edits ?? [], fileText);
      return rewritten === undefined ? undefined : { content: [{ type: "text", text: rewritten }] };
    }
    await this.state.observe(path, ctx.cwd, name);
    if (name === "read") return undefined;
    const lines =
      name === "edit"
        ? [...(changed ? [changedAfterEdit(path)] : []), noNeedToReread(path)]
        : changed
          ? [changedAfterWrite(path)]
          : [];
    return lines.length > 0 ? { content: withLines(event.content ?? [], lines) } : undefined;
  }
}
