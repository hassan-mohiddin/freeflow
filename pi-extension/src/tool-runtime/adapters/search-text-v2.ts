import { createHash, randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { TextDecoder } from "node:util";

import type { ToolExecutionState } from "../config.js";
import type { Json, OperationV2 } from "../contracts.js";
import { canonicalJson } from "../schema.js";
import { v2ModelHeader } from "../presentation/v2.js";
import { runRg } from "./rg-backend.js";
import {
  authorizeProjectPaths,
  decodeProjectCursor,
  discoverProjectFiles,
  encodeProjectCursor,
  MAX_PROJECT_PATHS,
  projectFingerprint,
  type ProjectCursor,
} from "./rg-project.js";
import { MAX_WORKSPACE_TEXT_BYTES, readWorkspaceSnapshot, WorkspaceError } from "./workspace.js";

const key = { id: "project.searchText", revision: "2" };
const MAX_FILES = 256;
const MAX_RESULTS = 100;
const MAX_SCAN_BYTES = 32 * 1024 * 1024;
const DEFAULT_SCAN_BYTES = 16 * 1024 * 1024;
const DEFAULT_RESULTS = 20;
const DEFAULT_BYTES = 8192;
const MAX_BYTES = 32 * 1024;
const scopeName = "rg-workspace-scan";
const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");
type Mode = "files" | "count" | "matches" | "context";
type Request = {
  query: string;
  paths?: string[];
  patternKind?: "literal" | "regex";
  mode: Mode;
  caseSensitive?: boolean;
  maxResults?: number;
  maxBytes?: number;
  maxScanBytes?: number;
  contextLines?: number;
  cursor?: string;
};
type Match = {
  path: string;
  line: number;
  range: { startBytes: number; endBytes: number };
  excerpt: string;
  revision: string;
  clipped: boolean;
};
type FileMatch = { path: string; revision: string; count?: number };
type Value = {
  mode: Mode;
  files: FileMatch[];
  matches: Match[];
  count: number;
  scannedFiles: number;
  scannedBytes: number;
  skippedFiles: number;
  observedFiles: number;
  coverage: "complete-at-boundary" | "limited";
  scope: typeof scopeName;
  backend: { version: string; identity: string };
  next?: string;
};
const revision = { type: "string", pattern: "^[a-f0-9]{64}$" };

function excerpt(body: Buffer, start: number, end: number, contextLines: number): { text: string; clipped: boolean } {
  let from = Math.max(body.lastIndexOf(10, start - 1), body.lastIndexOf(13, start - 1)) + 1;
  let to = end;
  for (let count = 0; count <= contextLines; count += 1) {
    let next = to;
    while (next < body.length && body[next] !== 10 && body[next] !== 13) next += 1;
    if (body[next] === 13 && body[next + 1] === 10) next += 2;
    else if (next < body.length) next += 1;
    to = next;
  }
  for (let count = 0; count < contextLines; count += 1) {
    if (from === 0) break;
    const prior = from - (body[from - 1] === 10 && body[from - 2] === 13 ? 2 : 1);
    from = Math.max(body.lastIndexOf(10, prior - 1), body.lastIndexOf(13, prior - 1)) + 1;
  }
  if (to - from <= 500)
    return {
      text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(body.subarray(from, to)),
      clipped: false,
    };
  // Keep the actual match inside a bounded UTF-8 excerpt, even after a huge line prefix.
  let left = Math.max(from, start - 160);
  let right = Math.min(to, Math.max(end + 160, left + 420));
  if (right - left > 500) right = left + 500;
  while (left < start && (body[left] & 0xc0) === 0x80) left += 1;
  while (right > end && right < body.length && (body[right] & 0xc0) === 0x80) right -= 1;
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(body.subarray(left, right));
  return { text: `${left > from ? "…" : ""}${text}${right < to ? "…" : ""}`, clipped: true };
}

function matchesIn(bytes: Buffer, body: Buffer, path: string, revision: string, contextLines: number): Match[] {
  let stream: string;
  try {
    stream = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new WorkspaceError("backend_encoding", "Ripgrep JSON stream is not UTF-8.");
  }
  const matches: Match[] = [];
  // Ripgrep strips a leading UTF-8 BOM from its JSON lines/absolute offsets;
  // the workspace revision and exposed coordinates refer to the original raw file bytes.
  const bomBytes = body.length >= 3 && body[0] === 0xef && body[1] === 0xbb && body[2] === 0xbf ? 3 : 0;
  for (const line of stream.split("\n")) {
    if (!line) continue;
    let event: any;
    try {
      event = JSON.parse(line);
    } catch {
      throw new WorkspaceError("backend_output_invalid", "Ripgrep emitted malformed JSON.");
    }
    if (event?.type !== "match") continue;
    if (
      typeof event.data?.absolute_offset !== "number" ||
      typeof event.data?.line_number !== "number" ||
      !Array.isArray(event.data?.submatches)
    )
      throw new WorkspaceError("backend_output_invalid", "Ripgrep match coordinates are missing.");
    for (const submatch of event.data.submatches) {
      const startBytes = bomBytes + event.data.absolute_offset + submatch.start;
      const endBytes = bomBytes + event.data.absolute_offset + submatch.end;
      if (
        !Number.isSafeInteger(startBytes) ||
        !Number.isSafeInteger(endBytes) ||
        startBytes < 0 ||
        endBytes < startBytes ||
        endBytes > body.length
      )
        throw new WorkspaceError("backend_output_invalid", "Ripgrep match coordinates are invalid.");
      const expected =
        typeof submatch.match?.text === "string"
          ? Buffer.from(submatch.match.text)
          : typeof submatch.match?.bytes === "string"
            ? Buffer.from(submatch.match.bytes, "base64")
            : undefined;
      if (!expected || !body.subarray(startBytes, endBytes).equals(expected))
        throw new WorkspaceError("source_changed", "Project source differs from ripgrep's matched bytes.");
      const view = excerpt(body, startBytes, endBytes, contextLines);
      matches.push({
        path,
        line: event.data.line_number,
        range: { startBytes, endBytes },
        excerpt: view.text,
        revision,
        clipped: view.clipped,
      });
    }
  }
  return matches;
}

function argsFor(request: Request, path: string): string[] {
  const args = ["--hidden", "--no-require-git", "--color=never", "--with-filename"];
  if (request.caseSensitive !== true) args.push("--ignore-case");
  if (request.patternKind !== "regex") args.push("--fixed-strings");
  if (request.mode === "count") args.push("--count-matches", "-0");
  else if (request.mode === "files") args.push("--files-with-matches", "-0");
  else args.push("--json", "--line-number", "--byte-offset");
  return [...args, "--", request.query, path];
}

export function createSearchTextV2Operation(state: () => ToolExecutionState | undefined): OperationV2<Json, Json> {
  const cursorKey = randomBytes(32);
  return {
    key,
    contractVersion: 2,
    category: "project",
    description:
      "Ignore-aware literal or regex search. Choose files, count, matches or context; results carry source revisions, byte coordinates, coverage and continuation. Requires qualified PATH ripgrep.",
    keywords: ["project", "search", "text", "regex", "ignore", "count", "context"],
    owner: { adapterId: "freeflow.ripgrep", adapterRevision: "1", executionWorld: "local-workspace" },
    guidance: {
      useWhen: "Find candidate files or bounded exact text matches inside the configured project.",
      avoidWhen: "Do not treat an empty limited or unavailable search as proof of absence; use count for totals.",
    },
    cancellation: "settles",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string", minLength: 1, maxLength: 1024 },
        paths: {
          type: "array",
          minItems: 1,
          maxItems: MAX_PROJECT_PATHS,
          uniqueItems: true,
          items: { type: "string", minLength: 1, maxLength: 4096 },
        },
        patternKind: { type: "string", enum: ["literal", "regex"] },
        mode: { type: "string", enum: ["files", "count", "matches", "context"] },
        caseSensitive: { type: "boolean" },
        contextLines: { type: "integer", minimum: 0, maximum: 3 },
        maxResults: { type: "integer", minimum: 1, maximum: MAX_RESULTS },
        maxBytes: { type: "integer", minimum: 512, maximum: MAX_BYTES },
        maxScanBytes: { type: "integer", minimum: 1, maximum: MAX_SCAN_BYTES },
        cursor: { type: "string", minLength: 1, maxLength: 4096 },
      },
      required: ["query", "mode"],
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        mode: { type: "string", enum: ["files", "count", "matches", "context"] },
        files: {
          type: "array",
          maxItems: MAX_RESULTS,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              path: { type: "string", minLength: 1, maxLength: 4096 },
              revision,
              count: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
            },
            required: ["path", "revision"],
          },
        },
        matches: {
          type: "array",
          maxItems: MAX_RESULTS,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              path: { type: "string", minLength: 1, maxLength: 4096 },
              line: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
              range: {
                type: "object",
                additionalProperties: false,
                properties: {
                  startBytes: { type: "integer", minimum: 0, maximum: MAX_WORKSPACE_TEXT_BYTES },
                  endBytes: { type: "integer", minimum: 0, maximum: MAX_WORKSPACE_TEXT_BYTES },
                },
                required: ["startBytes", "endBytes"],
              },
              excerpt: { type: "string", maxLength: 512 },
              revision,
              clipped: { type: "boolean" },
            },
            required: ["path", "line", "range", "excerpt", "revision", "clipped"],
          },
        },
        count: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
        scannedFiles: { type: "integer", minimum: 0, maximum: MAX_FILES },
        scannedBytes: { type: "integer", minimum: 0, maximum: MAX_SCAN_BYTES },
        skippedFiles: { type: "integer", minimum: 0, maximum: MAX_FILES },
        observedFiles: { type: "integer", minimum: 0, maximum: 10_000 },
        coverage: { type: "string", enum: ["complete-at-boundary", "limited"] },
        scope: { type: "string", enum: [scopeName] },
        backend: {
          type: "object",
          additionalProperties: false,
          properties: { version: { type: "string", minLength: 1, maxLength: 128 }, identity: revision },
          required: ["version", "identity"],
        },
        next: { type: "string", minLength: 1, maxLength: 4096 },
      },
      required: [
        "mode",
        "files",
        "matches",
        "count",
        "scannedFiles",
        "scannedBytes",
        "skippedFiles",
        "observedFiles",
        "coverage",
        "scope",
        "backend",
      ],
    },
    effects: ["live-read"],
    effect: () => "live-read",
    concurrency: () => "read-parallel",
    exposure: { discoverable: true, direct: true, programmatic: true },
    async authorize(input, scope) {
      try {
        const request = input as Request;
        if (request.mode !== "context" && request.contextLines !== undefined)
          throw new WorkspaceError("invalid_input", "Context lines are only valid for context mode.");
        await authorizeProjectPaths(state(), scope, request.paths ?? ["."]);
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
      const request = input as Request;
      const paths = request.paths ?? ["."];
      const deadline = AbortSignal.timeout(30_000);
      const signal = context.signal ? AbortSignal.any([context.signal, deadline]) : deadline;
      const source = await discoverProjectFiles(state(), context.scope, paths, signal);
      const limit = request.maxResults ?? DEFAULT_RESULTS;
      const byteLimit = request.maxBytes ?? DEFAULT_BYTES;
      const scanLimit = request.maxScanBytes ?? DEFAULT_SCAN_BYTES;
      const fingerprint = projectFingerprint(source, {
        operation: key,
        query: request.query,
        paths: [...paths].sort(),
        mode: request.mode,
        patternKind: request.patternKind ?? "literal",
        caseSensitive: request.caseSensitive === true,
        contextLines: request.contextLines ?? 0,
        maxResults: limit,
        maxBytes: byteLimit,
        maxScanBytes: scanLimit,
      });
      const cursor = decodeProjectCursor(request.cursor, fingerprint, source.files.length, cursorKey);
      const files: FileMatch[] = [];
      const matches: Match[] = [];
      let count = 0;
      let scannedFiles = 0;
      let scannedBytes = 0;
      let skippedFiles = 0;
      let outputBytes = 0;
      let partial = false;
      let next: string | undefined;
      for (let index = cursor?.index ?? 0; index < source.files.length; index += 1) {
        if (scannedFiles + skippedFiles >= MAX_FILES || scannedBytes >= scanLimit) {
          next = encodeProjectCursor({ version: 1, fingerprint, index, offsetBytes: 0 }, cursorKey);
          break;
        }
        const path = source.files[index]!;
        const absolute = resolve(source.root, path);
        let body: Buffer;
        try {
          body = await readWorkspaceSnapshot(absolute, signal, scanLimit - scannedBytes);
        } catch (error) {
          if (!(error instanceof WorkspaceError) || error.code !== "file_too_large") throw error;
          if (scanLimit - scannedBytes < MAX_WORKSPACE_TEXT_BYTES && scannedBytes > 0) {
            next = encodeProjectCursor({ version: 1, fingerprint, index, offsetBytes: 0 }, cursorKey);
            break;
          }
          // A file that cannot fit on a fresh page must not yield a cursor to itself forever.
          skippedFiles += 1;
          partial = true;
          continue;
        }
        const digest = sha256(body);
        if (cursor?.index === index && cursor.fileSha256 && cursor.fileSha256 !== digest)
          throw new WorkspaceError("source_changed", "Search source changed before continuation.");
        scannedFiles += 1;
        scannedBytes += body.length;
        let text: string;
        try {
          text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(body);
        } catch {
          skippedFiles += 1;
          partial = true;
          continue;
        }
        if (text.includes("\0")) {
          skippedFiles += 1;
          partial = true;
          continue;
        }
        const result = await runRg(source.backend, argsFor(request, path), signal, undefined, source.root);
        const after = await readWorkspaceSnapshot(absolute, signal);
        if (sha256(after) !== digest)
          throw new WorkspaceError("source_changed", "Search source changed during ripgrep execution.");
        if (request.mode === "files" || request.mode === "count") {
          if (!result.bytes.length) continue;
          const nul = result.bytes.indexOf(0);
          const amount =
            request.mode === "count"
              ? Number(
                  result.bytes
                    .subarray(nul + 1)
                    .toString("utf8")
                    .trim(),
                )
              : 1;
          if (nul < 0 || !Number.isSafeInteger(amount) || amount < 1)
            throw new WorkspaceError("backend_output_invalid", "Ripgrep count/file response is invalid.");
          const item: FileMatch = { path, revision: digest, ...(request.mode === "count" ? { count: amount } : {}) };
          if (outputBytes + Buffer.byteLength(canonicalJson(item as any)) > byteLimit) {
            if (!files.length)
              throw new WorkspaceError("search_output_limit", "Search file fact cannot fit its budget.");
            next = encodeProjectCursor(
              { version: 1, fingerprint, index, offsetBytes: 0, fileSha256: digest },
              cursorKey,
            );
            break;
          }
          files.push(item);
          count += amount;
          outputBytes += Buffer.byteLength(canonicalJson(item as any));
        } else {
          const found = matchesIn(
            result.bytes,
            body,
            path,
            digest,
            request.mode === "context" ? (request.contextLines ?? 2) : 0,
          );
          for (
            let ordinal = cursor?.index === index ? (cursor.matchIndex ?? 0) : 0;
            ordinal < found.length;
            ordinal += 1
          ) {
            const item = found[ordinal]!;
            const itemBytes = Buffer.byteLength(canonicalJson(item as any));
            if (matches.length >= limit || outputBytes + itemBytes > byteLimit) {
              if (!matches.length)
                throw new WorkspaceError("search_output_limit", "Search match cannot fit its budget.");
              next = encodeProjectCursor(
                {
                  version: 1,
                  fingerprint,
                  index,
                  offsetBytes: item.range.startBytes,
                  matchIndex: ordinal,
                  fileSha256: digest,
                },
                cursorKey,
              );
              break;
            }
            matches.push(item);
            outputBytes += itemBytes;
            count += 1;
            if (item.clipped) partial = true;
          }
        }
        if (next) break;
        if (
          (request.mode === "files" || request.mode === "count") &&
          files.length >= limit &&
          index + 1 < source.files.length
        ) {
          next = encodeProjectCursor({ version: 1, fingerprint, index: index + 1, offsetBytes: 0 }, cursorKey);
          break;
        }
      }
      const coverage = next || partial ? "limited" : "complete-at-boundary";
      const value: Value = {
        mode: request.mode,
        files,
        matches,
        count,
        scannedFiles,
        scannedBytes,
        skippedFiles,
        observedFiles: source.files.length,
        coverage,
        scope: scopeName,
        backend: { version: source.backend.version, identity: source.backend.identity },
        ...(next ? { next } : {}),
      };
      return {
        value: value as unknown as Json,
        coverage: { kind: coverage, boundary: scopeName, ...(next ? { continuation: { cursor: next } } : {}) },
      };
    },
    presenter: {
      async model(input, outcome, policy) {
        const value = outcome.value as unknown as Value | undefined;
        if (!value)
          return {
            text: `Search ${outcome.status}; no result was verified.`,
            coverage: { kind: "unknown" as const, boundary: scopeName },
            artifactRefs: [],
          };
        const maximum = Math.min(
          policy.maxBytes,
          ((input as Request).maxBytes ?? DEFAULT_BYTES) - Buffer.byteLength(v2ModelHeader(outcome), "utf8"),
        );
        const label =
          value.mode === "files"
            ? `${value.files.length} matching files`
            : `${value.count} reported match${value.count === 1 ? "" : "es"}`;
        const heading = `${value.mode}: ${label}; ${value.scannedFiles} scanned, ${value.skippedFiles} skipped; ${value.coverage}.\n`;
        const cursor = value.next ? `Continue with cursor: ${value.next}\n` : "";
        const footer =
          cursor && Buffer.byteLength(heading + cursor, "utf8") <= maximum
            ? cursor
            : value.next
              ? "Continuation token omitted; rerun with larger maxBytes.\n"
              : "";
        const omitted = "Some canonical search rows omitted from this model view.\n";
        let text = heading;
        let shown = 0;
        const rows =
          value.mode === "files" || value.mode === "count"
            ? value.files.map(
                (item) => `${item.path}${item.count === undefined ? "" : `: ${item.count}`} (${item.revision})`,
              )
            : value.matches.map(
                (item) =>
                  `${item.path}:${item.line} [${item.range.startBytes},${item.range.endBytes}) ${item.excerpt}${item.clipped ? " [context clipped]" : ""}`,
              );
        for (const row of rows) {
          if (Buffer.byteLength(`${text}${row}\n${omitted}${footer}`, "utf8") > maximum) break;
          text += `${row}\n`;
          shown += 1;
        }
        if (shown < rows.length) text += omitted;
        text += footer;
        if (Buffer.byteLength(text, "utf8") > maximum) throw new Error("Search model view exceeds budget.");
        return {
          text,
          coverage:
            shown < rows.length
              ? { kind: "limited" as const, boundary: "rg-search-model-view" }
              : (outcome.coverage ?? { kind: value.coverage, boundary: scopeName }),
          artifactRefs: [...outcome.artifactRefs],
        };
      },
      async ui(_input, outcome) {
        const value = outcome.value as unknown as Value | undefined;
        return {
          summary: value
            ? `Search ${value.mode} · ${value.mode === "files" ? value.files.length : value.count} ${value.mode === "files" ? "files" : "matches"} · ${value.coverage}`
            : "Search unavailable",
        };
      },
    },
  };
}
