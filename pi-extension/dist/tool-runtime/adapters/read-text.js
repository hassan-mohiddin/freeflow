import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";
import { readWorkspaceSnapshot, resolveWorkspaceFile, WorkspaceError } from "./workspace.js";
const DEFAULT_READ_BYTES = 32 * 1024;
const MAX_READ_BYTES = 32 * 1024;
function continuation(byte) {
  return byte !== undefined && (byte & 0xc0) === 0x80;
}
function rangeEnd(buffer, start, maximum) {
  let end = Math.min(buffer.length, start + maximum);
  while (end > start && end < buffer.length && continuation(buffer[end])) end -= 1;
  return end;
}
export function createReadTextOperation(state) {
  return {
    key: { id: "project.readText", revision: "1" },
    description: "Read a bounded exact UTF-8 byte range from the configured local workspace.",
    keywords: ["project", "workspace", "read", "text", "file", "hash"],
    owner: { adapterId: "freeflow.workspace", adapterRevision: "1", executionWorld: "local-workspace" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        path: { type: "string", minLength: 1, maxLength: 4096 },
        offsetBytes: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
        maxBytes: { type: "integer", minimum: 1, maximum: MAX_READ_BYTES },
      },
      required: ["path"],
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        path: { type: "string", minLength: 1, maxLength: 4096 },
        text: { type: "string", maxLength: MAX_READ_BYTES },
        sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
        totalBytes: { type: "integer", minimum: 0, maximum: 4 * 1024 * 1024 },
        range: {
          type: "object",
          additionalProperties: false,
          properties: {
            startBytes: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
            endBytes: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
          },
          required: ["startBytes", "endBytes"],
        },
        coverage: { type: "string", enum: ["complete-at-boundary", "limited"] },
        scope: { type: "string", enum: ["whole-file-snapshot"] },
        nextOffsetBytes: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
      },
      required: ["path", "text", "sha256", "totalBytes", "range", "coverage", "scope"],
    },
    effects: ["live-read"],
    effect: () => "live-read",
    concurrency: () => "read-parallel",
    exposure: { discoverable: true, direct: true, programmatic: true },
    async authorize(input, scope) {
      try {
        await resolveWorkspaceFile(state(), scope, input.path);
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
      const request = input;
      const resolved = await resolveWorkspaceFile(state(), context.scope, request.path);
      const body = await readWorkspaceSnapshot(resolved.path, context.signal);
      let text;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(body);
      } catch {
        throw new WorkspaceError("invalid_encoding", "Workspace file is not valid UTF-8 text.");
      }
      if (text.includes("\0"))
        throw new WorkspaceError("binary_unsupported", "Binary workspace files are unsupported.");
      const startBytes = request.offsetBytes ?? 0;
      if (startBytes > body.length) throw new WorkspaceError("invalid_range", "Offset exceeds workspace file bytes.");
      if (startBytes < body.length && continuation(body[startBytes]))
        throw new WorkspaceError("invalid_range", "Offset is inside a UTF-8 code point.");
      const endBytes = rangeEnd(body, startBytes, request.maxBytes ?? DEFAULT_READ_BYTES);
      if (startBytes < body.length && endBytes === startBytes)
        throw new WorkspaceError("invalid_range", "Requested range cannot fit the next UTF-8 code point.");
      const selected = new TextDecoder("utf-8", { fatal: true }).decode(body.subarray(startBytes, endBytes));
      const complete = startBytes === 0 && endBytes === body.length;
      const value = {
        path: resolved.relativePath,
        text: selected,
        sha256: createHash("sha256").update(body).digest("hex"),
        totalBytes: body.length,
        range: { startBytes, endBytes },
        coverage: complete ? "complete-at-boundary" : "limited",
        scope: "whole-file-snapshot",
        ...(endBytes < body.length ? { nextOffsetBytes: endBytes } : {}),
      };
      return {
        value,
        coverage: {
          kind: complete ? "complete-at-boundary" : "limited",
          boundary: "whole-file-snapshot",
          ...(endBytes < body.length ? { continuation: { offsetBytes: endBytes } } : {}),
        },
      };
    },
  };
}
