import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { TextDecoder } from "node:util";

import type { ToolExecutionState } from "../config.js";
import type { Json, Operation } from "../contracts.js";
import { OperationExecutionError } from "../contracts.js";
import {
  MAX_WORKSPACE_TEXT_BYTES,
  readWorkspaceSnapshot,
  resolveWorkspaceFile,
  WorkspaceCoordinator,
  WorkspaceError,
} from "./workspace.js";

const MAX_REPLACEMENT_TEXT = 1024 * 1024;

function digest(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function occurrenceCount(value: string, search: string): number {
  let count = 0;
  let offset = 0;
  while (offset <= value.length - search.length) {
    const found = value.indexOf(search, offset);
    if (found < 0) break;
    count += 1;
    offset = found + 1;
  }
  return count;
}

export function createReplaceExactOperation(
  state: () => ToolExecutionState | undefined,
  coordinator: WorkspaceCoordinator,
): Operation<Json, Json> {
  return {
    key: { id: "project.replaceExact", revision: "1" },
    description: "Replace one exact text occurrence under an expected full-file revision in the local workspace.",
    keywords: ["project", "workspace", "replace", "exact", "hash", "mutation"],
    owner: { adapterId: "freeflow.workspace", adapterRevision: "1", executionWorld: "local-workspace" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        path: { type: "string", minLength: 1, maxLength: 4096 },
        expectedSha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
        oldText: { type: "string", minLength: 1, maxLength: MAX_REPLACEMENT_TEXT },
        replacement: { type: "string", maxLength: MAX_REPLACEMENT_TEXT },
      },
      required: ["path", "expectedSha256", "oldText", "replacement"],
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        path: { type: "string", minLength: 1, maxLength: 4096 },
        beforeSha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
        afterSha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
        applied: { type: "integer", minimum: 1, maximum: 1 },
        bytes: { type: "integer", minimum: 0, maximum: MAX_WORKSPACE_TEXT_BYTES },
        coordination: { type: "string", enum: ["runtime-instance-file-exclusive"] },
      },
      required: ["path", "beforeSha256", "afterSha256", "applied", "bytes", "coordination"],
    },
    effects: ["mutation"],
    effect: () => "mutation",
    concurrency: () => "exclusive",
    exposure: { discoverable: true, direct: true, programmatic: true },
    async authorize(input, scope) {
      try {
        const current = state();
        if (!current?.workspace.effective || !current.workspace.write)
          throw new WorkspaceError("workspace_write_disabled", "Workspace mutation is disabled.");
        await resolveWorkspaceFile(current, scope, (input as any).path);
        return { kind: "allowed" };
      } catch (error) {
        return {
          kind: "denied",
          code: error instanceof WorkspaceError ? error.code : "workspace_authorization",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
    async execute(input, context) {
      const request = input as any;
      const current = state();
      if (!current?.workspace.effective || !current.workspace.write)
        throw new OperationExecutionError("workspace_write_disabled", "Workspace mutation is disabled.", "none");
      const resolved = await resolveWorkspaceFile(current, context.scope, request.path);
      return coordinator.exclusive(resolved.path, async () => {
        let temporary: string | undefined;
        let renamed = false;
        try {
          const body = await readWorkspaceSnapshot(resolved.path, context.signal);
          let text: string;
          try {
            text = new TextDecoder("utf-8", { fatal: true }).decode(body);
          } catch {
            throw new OperationExecutionError("invalid_encoding", "Workspace file is not valid UTF-8 text.", "none");
          }
          if (text.includes("\0"))
            throw new OperationExecutionError("binary_unsupported", "Binary workspace files are unsupported.", "none");
          const beforeSha256 = digest(body);
          if (beforeSha256 !== request.expectedSha256)
            throw new OperationExecutionError(
              "source_changed",
              "Workspace file revision differs from the expected hash.",
              "none",
            );
          if (occurrenceCount(text, request.oldText) !== 1)
            throw new OperationExecutionError(
              "match_ambiguous",
              "Exact replacement requires one and only one matching occurrence.",
              "none",
            );
          const replacement = text.replace(request.oldText, () => request.replacement);
          const next = Buffer.from(replacement, "utf8");
          if (next.length > MAX_WORKSPACE_TEXT_BYTES)
            throw new OperationExecutionError(
              "file_too_large",
              "Replacement exceeds the supported 4 MiB limit.",
              "none",
            );
          if (context.signal?.aborted)
            throw new OperationExecutionError("cancelled", "Workspace replacement was cancelled before write.", "none");
          const mode = (await lstat(resolved.path)).mode & 0o7777;
          temporary = join(dirname(resolved.path), `.freeflow-replace-${randomUUID()}.tmp`);
          await writeFile(temporary, next, { flag: "wx", mode });
          await chmod(temporary, mode);
          if (context.signal?.aborted)
            throw new OperationExecutionError(
              "cancelled",
              "Workspace replacement was cancelled before commit.",
              "none",
            );
          try {
            await rename(temporary, resolved.path);
            renamed = true;
            temporary = undefined;
          } catch (error) {
            let observed: "none" | "completed" | "unknown" = "unknown";
            try {
              const currentBody = await readWorkspaceSnapshot(resolved.path);
              const currentHash = digest(currentBody);
              observed = currentHash === digest(next) ? "completed" : currentHash === beforeSha256 ? "none" : "unknown";
            } catch {}
            throw new OperationExecutionError(
              observed === "unknown" ? "replace_commit_unknown" : "replace_commit_failed",
              error instanceof Error ? error.message : "Workspace replacement commit failed.",
              observed,
            );
          }
          if (context.signal?.aborted)
            throw new OperationExecutionError(
              "cancelled",
              "Workspace replacement completed before cancellation.",
              "completed",
            );
          const value: Record<string, Json> = {
            path: resolved.relativePath,
            beforeSha256,
            afterSha256: digest(next),
            applied: 1,
            bytes: next.length,
            coordination: "runtime-instance-file-exclusive",
          };
          return { value, coverage: { kind: "complete-at-boundary", boundary: "runtime-instance-file-revision" } };
        } catch (error) {
          if (error instanceof OperationExecutionError) throw error;
          throw new OperationExecutionError(
            error instanceof WorkspaceError ? error.code : "replace_failed",
            error instanceof Error ? error.message : String(error),
            renamed ? "unknown" : "none",
          );
        } finally {
          if (temporary) await rm(temporary, { force: true }).catch(() => {});
        }
      });
    },
  };
}
