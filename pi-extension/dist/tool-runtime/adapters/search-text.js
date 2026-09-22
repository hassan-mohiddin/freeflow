import { createHash } from "node:crypto";
import { lstat, opendir } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { TextDecoder } from "node:util";
import { canonicalJson, jsonDigest } from "../schema.js";
import {
  insideWorkspace,
  readWorkspaceSnapshot,
  resolveWorkspaceRoot,
  workspaceDenied,
  WorkspaceError,
} from "./workspace.js";
const MAX_SEARCH_PATHS = 32;
const MAX_SEARCH_FILES = 10_000;
const MAX_DIRECTORY_ENTRIES = 4096;
const MAX_RESULTS = 100;
const DEFAULT_RESULTS = 20;
const DEFAULT_OUTPUT_BYTES = 32 * 1024;
const MAX_OUTPUT_BYTES = 256 * 1024;
const DEFAULT_SCAN_BYTES = 16 * 1024 * 1024;
const MAX_SCAN_BYTES = 32 * 1024 * 1024;
function escapeLiteral(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function continuation(byte) {
  return byte !== undefined && (byte & 0xc0) === 0x80;
}
async function collectFiles(root, denyPaths, requested, signal) {
  const files = new Set();
  const visit = async (path, explicit = false) => {
    if (signal?.aborted) throw new WorkspaceError("cancelled", "Workspace search was cancelled.");
    const relativePath = relative(root, path).replaceAll("\\", "/");
    if (!insideWorkspace(root, path))
      throw new WorkspaceError("path_outside_root", "Workspace search path escapes the configured root.");
    if (workspaceDenied(relativePath, denyPaths)) {
      if (explicit) throw new WorkspaceError("path_denied", "Workspace search path is denied by policy.");
      return;
    }
    const value = await lstat(path).catch(() => {
      throw new WorkspaceError("path_unavailable", "Workspace search path is unavailable.");
    });
    if (value.isSymbolicLink()) {
      if (explicit) throw new WorkspaceError("path_unsupported", "Workspace search does not follow symlinks.");
      return;
    }
    if (value.isFile()) {
      files.add(relativePath);
      if (files.size > MAX_SEARCH_FILES)
        throw new WorkspaceError("search_too_large", "Workspace search exceeds the file-count limit.");
      return;
    }
    if (!value.isDirectory())
      throw new WorkspaceError("path_unsupported", "Workspace search path is not a regular file or directory.");
    const directory = await opendir(path);
    const names = [];
    try {
      for await (const entry of directory) {
        names.push(entry.name);
        if (names.length > MAX_DIRECTORY_ENTRIES)
          throw new WorkspaceError("directory_too_large", "Workspace directory exceeds the entry limit.");
      }
    } finally {
      await directory.close().catch(() => {});
    }
    names.sort((a, b) => a.localeCompare(b));
    for (const name of names) await visit(resolve(path, name));
  };
  for (const requestedPath of [...new Set(requested)].sort()) {
    if (!requestedPath || requestedPath.includes("\0") || isAbsolute(requestedPath))
      throw new WorkspaceError("path_invalid", "Workspace search paths must be relative.");
    const path = resolve(root, requestedPath);
    if (!insideWorkspace(root, path))
      throw new WorkspaceError("path_outside_root", "Workspace search path escapes the configured root.");
    await visit(path, true);
  }
  return [...files].sort((a, b) => a.localeCompare(b));
}
const cursorSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    fingerprint: { type: "string", pattern: "^[a-f0-9]{64}$" },
    path: { type: "string", minLength: 1, maxLength: 4096 },
    offsetBytes: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
    fileSha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
  },
  required: ["fingerprint", "path", "offsetBytes", "fileSha256"],
};
export function createSearchTextOperation(state) {
  return {
    key: { id: "project.searchText", revision: "1" },
    description: "Search for a literal string in bounded configured local-workspace paths.",
    keywords: ["project", "workspace", "search", "literal", "text", "matches"],
    owner: { adapterId: "freeflow.workspace", adapterRevision: "1", executionWorld: "local-workspace" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string", minLength: 1, maxLength: 1000 },
        paths: {
          type: "array",
          minItems: 1,
          maxItems: MAX_SEARCH_PATHS,
          uniqueItems: true,
          items: { type: "string", minLength: 1, maxLength: 4096 },
        },
        caseSensitive: { type: "boolean" },
        maxResults: { type: "integer", minimum: 1, maximum: MAX_RESULTS },
        maxBytes: { type: "integer", minimum: 1024, maximum: MAX_OUTPUT_BYTES },
        maxScanBytes: { type: "integer", minimum: 4 * 1024 * 1024, maximum: MAX_SCAN_BYTES },
        cursor: cursorSchema,
      },
      required: ["query", "paths"],
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        matches: {
          type: "array",
          maxItems: MAX_RESULTS,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              path: { type: "string", minLength: 1, maxLength: 4096 },
              range: {
                type: "object",
                additionalProperties: false,
                properties: {
                  startBytes: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
                  endBytes: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
                },
                required: ["startBytes", "endBytes"],
              },
              excerpt: { type: "string", maxLength: 512 },
            },
            required: ["path", "range", "excerpt"],
          },
        },
        scannedFiles: { type: "integer", minimum: 0, maximum: MAX_SEARCH_FILES },
        scannedBytes: { type: "integer", minimum: 0, maximum: MAX_SCAN_BYTES },
        skippedFiles: { type: "integer", minimum: 0, maximum: MAX_SEARCH_FILES },
        coverage: { type: "string", enum: ["complete-at-boundary", "limited"] },
        scope: { type: "string", enum: ["workspace-scan"] },
        next: cursorSchema,
      },
      required: ["matches", "scannedFiles", "scannedBytes", "skippedFiles", "coverage", "scope"],
    },
    effects: ["live-read"],
    effect: () => "live-read",
    concurrency: () => "read-parallel",
    exposure: { discoverable: true, direct: true, programmatic: true },
    async authorize(input, scope) {
      try {
        const request = input;
        const { root, denyPaths } = await resolveWorkspaceRoot(state(), scope);
        for (const item of request.paths) {
          if (!item || item.includes("\0") || isAbsolute(item))
            throw new WorkspaceError("path_invalid", "Workspace search paths must be relative.");
          const path = resolve(root, item);
          const relativePath = relative(root, path).replaceAll("\\", "/");
          if (!insideWorkspace(root, path))
            throw new WorkspaceError("path_outside_root", "Workspace search path escapes the configured root.");
          if (workspaceDenied(relativePath, denyPaths))
            throw new WorkspaceError("path_denied", "Workspace search path is denied by policy.");
        }
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
      const { root, denyPaths } = await resolveWorkspaceRoot(state(), context.scope);
      const files = await collectFiles(root, denyPaths, request.paths, context.signal);
      const caseSensitive = request.caseSensitive === true;
      const fingerprint = jsonDigest({
        root,
        query: request.query,
        paths: [...request.paths].sort(),
        caseSensitive,
      });
      const cursor = request.cursor;
      let startIndex = 0;
      if (cursor) {
        if (cursor.fingerprint !== fingerprint)
          throw new WorkspaceError("cursor_invalid", "Workspace search cursor does not match the request.");
        startIndex = files.indexOf(cursor.path);
        if (startIndex < 0) throw new WorkspaceError("cursor_invalid", "Workspace search cursor path is unavailable.");
      }
      const matches = [];
      let outputBytes = 0;
      let scannedFiles = 0;
      let scannedBytes = 0;
      let skippedFiles = 0;
      let next;
      const maximumResults = request.maxResults ?? DEFAULT_RESULTS;
      const maximumOutputBytes = request.maxBytes ?? DEFAULT_OUTPUT_BYTES;
      const maximumScanBytes = request.maxScanBytes ?? DEFAULT_SCAN_BYTES;
      const pattern = new RegExp(escapeLiteral(request.query), caseSensitive ? "gu" : "giu");
      for (let index = startIndex; index < files.length; index += 1) {
        if (context.signal?.aborted) throw new WorkspaceError("cancelled", "Workspace search was cancelled.");
        const relativePath = files[index];
        const path = resolve(root, relativePath);
        let body;
        try {
          body = await readWorkspaceSnapshot(path, context.signal);
        } catch (error) {
          if (error instanceof WorkspaceError && ["file_too_large", "path_unsupported"].includes(error.code)) {
            skippedFiles += 1;
            continue;
          }
          throw error;
        }
        const digest = sha256(body);
        let offsetBytes = cursor && index === startIndex ? cursor.offsetBytes : 0;
        if (cursor && index === startIndex && cursor.fileSha256 !== digest)
          throw new WorkspaceError("source_changed", "Workspace search cursor file changed before continuation.");
        if (offsetBytes > body.length || (offsetBytes < body.length && continuation(body[offsetBytes])))
          throw new WorkspaceError("cursor_invalid", "Workspace search cursor offset is invalid.");
        if (scannedBytes + body.length > maximumScanBytes) {
          next = { fingerprint, path: relativePath, offsetBytes, fileSha256: digest };
          break;
        }
        scannedFiles += 1;
        scannedBytes += body.length;
        let text;
        try {
          text = new TextDecoder("utf-8", { fatal: true }).decode(body);
        } catch {
          skippedFiles += 1;
          continue;
        }
        if (text.includes("\0")) {
          skippedFiles += 1;
          continue;
        }
        const startCharacter = new TextDecoder("utf-8", { fatal: true }).decode(body.subarray(0, offsetBytes)).length;
        pattern.lastIndex = startCharacter;
        for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
          const startBytes = Buffer.byteLength(text.slice(0, match.index), "utf8");
          if (startBytes < offsetBytes) continue;
          const endBytes = startBytes + Buffer.byteLength(match[0], "utf8");
          const item = {
            path: relativePath,
            range: { startBytes, endBytes },
            excerpt: text.slice(
              Math.max(0, match.index - 120),
              Math.min(text.length, match.index + match[0].length + 120),
            ),
          };
          const itemBytes = Buffer.byteLength(canonicalJson(item), "utf8");
          if (matches.length >= maximumResults || outputBytes + itemBytes > maximumOutputBytes) {
            if (matches.length === 0)
              throw new WorkspaceError(
                "search_output_limit",
                "Workspace search result cannot fit the requested output budget.",
              );
            next = { fingerprint, path: relativePath, offsetBytes: startBytes, fileSha256: digest };
            break;
          }
          matches.push(item);
          outputBytes += itemBytes;
        }
        if (next) break;
      }
      const complete = next === undefined;
      const value = {
        matches,
        scannedFiles,
        scannedBytes,
        skippedFiles,
        coverage: complete ? "complete-at-boundary" : "limited",
        scope: "workspace-scan",
        ...(next ? { next } : {}),
      };
      return {
        value,
        coverage: {
          kind: complete ? "complete-at-boundary" : "limited",
          boundary: "workspace-scan",
          ...(next ? { continuation: next } : {}),
        },
      };
    },
  };
}
