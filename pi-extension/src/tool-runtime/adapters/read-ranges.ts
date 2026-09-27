import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";

import type { ToolExecutionState } from "../config.js";
import type { Json, OperationV2 } from "../contracts.js";
import { v2ModelHeader } from "../presentation/v2.js";
import { MAX_WORKSPACE_TEXT_BYTES, readWorkspaceSnapshot, resolveWorkspaceFile, WorkspaceError } from "./workspace.js";

const MAX_FILES = 4;
const MAX_RANGES_PER_FILE = 8;
const MAX_ACQUISITION_BYTES = 8 * 1024 * 1024;
const MAX_RESPONSE_TEXT_BYTES = 32 * 1024;
const DEFAULT_RESPONSE_TEXT_BYTES = 8192;
const boundary = "requested-project-line-ranges";

// A line includes its terminator. A final terminator does not invent an extra empty line.
type Range = { startLine: number; endLine: number };
type FileRequest = { path: string; expectedRevision?: string; ranges: Range[] };
type Request = { files: FileRequest[]; maxBytes?: number };
type Served = {
  requestIndex: number;
  requested: Range;
  range: Range & { startBytes: number; endBytes: number };
  text: string;
};
type Unserved = { requestIndex: number; requested: Range; range: Range; reason: string };
type FileValue = {
  path: string;
  revision?: string;
  totalBytes?: number;
  totalLines?: number;
  coverage: "complete-at-boundary" | "limited";
  served: Served[];
  unserved: Unserved[];
};
type RangeValue = {
  files: FileValue[];
  acquisitionBytes: number;
  selectedBytes: number;
  coverage: "complete-at-boundary" | "limited";
  scope: typeof boundary;
};

const rangeSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    startLine: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
    endLine: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
  },
  required: ["startLine", "endLine"],
};
const revisionSchema = { type: "string", pattern: "^[a-f0-9]{64}$" };

function lineEnds(bytes: Buffer): number[] {
  if (!bytes.length) return [];
  const ends: number[] = [];
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 10 && bytes[index] !== 13) continue;
    if (bytes[index] === 13 && bytes[index + 1] === 10) index += 1;
    ends.push(index + 1);
  }
  if (ends.at(-1) !== bytes.length) ends.push(bytes.length);
  return ends;
}

function unserved(file: FileValue, requestIndex: number, requested: Range, range: Range, reason: string): void {
  file.coverage = "limited";
  file.unserved.push({ requestIndex, requested, range, reason });
}

function presentation(value: RangeValue, maximum: number, refs: readonly string[]) {
  const omitted = "Some canonical ranges are not displayed in this bounded model view.";
  // Sidecar acknowledgment alone does not establish a native anchor for model-readable recovery.
  const source = refs.length
    ? `Canonical artifact recorded: ${refs[0]}; exact model recovery is not yet established.`
    : "No model-readable canonical artifact was published.";
  const served = value.files.reduce((sum, file) => sum + file.served.length, 0);
  const unservedCount = value.files.reduce((sum, file) => sum + file.unserved.length, 0);
  const heading = `Ranges: ${value.files.length} files; ${served} served segments; ${unservedCount} unserved segments; ${value.coverage} at ${boundary}.\n`;
  const status = value.files
    .flatMap((file) => [
      `${file.path}: ${file.revision ?? "revision unavailable"}; ${file.totalLines ?? "?"} lines; ${file.totalBytes ?? "?"} bytes; ${file.coverage}`,
      ...file.unserved.map(
        (entry) =>
          `  request #${entry.requestIndex + 1} [${entry.range.startLine},${entry.range.endLine}]: unserved (${entry.reason})`,
      ),
    ])
    .join("\n");
  const metadata = `${heading}${status}\n`;
  let shown = 0;
  let text = metadata;
  if (Buffer.byteLength(`${metadata}\n${omitted}\n\n${source}`, "utf8") > maximum) {
    text = `${heading}${omitted}\n${source}`;
    if (Buffer.byteLength(text, "utf8") > maximum)
      throw new Error("Range model metadata exceeds the presentation budget.");
  } else {
    for (const file of value.files) {
      for (const entry of file.served) {
        const rows = entry.text.replace(/\r\n|\r|\n/g, "\n").split("\n");
        if (rows.at(-1) === "") rows.pop();
        const formatted = rows.map((row, index) => `${entry.range.startLine + index}| ${row}`).join("\n");
        const block = `\n${file.path} request #${entry.requestIndex + 1} [${entry.range.startLine},${entry.range.endLine}]:\n${formatted}\n`;
        if (Buffer.byteLength(`${text}${block}\n${omitted}\n\n${source}`, "utf8") <= maximum) {
          text += block;
          shown += 1;
        }
      }
    }
    if (shown < served) text += `\n${omitted}\n`;
    text += `\n${source}`;
  }
  if (Buffer.byteLength(text, "utf8") > maximum) throw new Error("Range model view exceeds its presentation budget.");
  return { text, allShown: shown === served && text.startsWith(metadata) };
}

export function createReadRangesOperation(state: () => ToolExecutionState | undefined): OperationV2<Json, Json> {
  return {
    key: { id: "project.readRanges", revision: "1" },
    contractVersion: 2,
    category: "project",
    description:
      "Read one-based inclusive project line ranges (up to four files); maxBytes bounds both selected raw text and the full model response, with revisions and explicit unserved reasons.",
    keywords: ["project", "read", "ranges", "lines", "revision", "batch"],
    owner: { adapterId: "freeflow.workspace", adapterRevision: "2", executionWorld: "local-workspace" },
    guidance: {
      useWhen: "Read a few focused project line ranges, optionally requiring known SHA-256 revisions.",
      avoidWhen: "Use project.readText@1 for exact byte offsets; unserved ranges are not empty file content.",
    },
    cancellation: "settles",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        files: {
          type: "array",
          minItems: 1,
          maxItems: MAX_FILES,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              path: { type: "string", minLength: 1, maxLength: 1024 },
              expectedRevision: revisionSchema,
              ranges: { type: "array", minItems: 1, maxItems: MAX_RANGES_PER_FILE, items: rangeSchema },
            },
            required: ["path", "ranges"],
          },
        },
        maxBytes: { type: "integer", minimum: 512, maximum: MAX_RESPONSE_TEXT_BYTES },
      },
      required: ["files"],
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        files: {
          type: "array",
          minItems: 1,
          maxItems: MAX_FILES,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              path: { type: "string", minLength: 1, maxLength: 1024 },
              revision: revisionSchema,
              totalBytes: { type: "integer", minimum: 0, maximum: MAX_WORKSPACE_TEXT_BYTES },
              totalLines: { type: "integer", minimum: 0, maximum: MAX_WORKSPACE_TEXT_BYTES },
              coverage: { type: "string", enum: ["complete-at-boundary", "limited"] },
              served: {
                type: "array",
                maxItems: MAX_RANGES_PER_FILE,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    requestIndex: { type: "integer", minimum: 0, maximum: MAX_RANGES_PER_FILE - 1 },
                    requested: rangeSchema,
                    range: {
                      ...rangeSchema,
                      properties: {
                        ...rangeSchema.properties,
                        startBytes: { type: "integer", minimum: 0, maximum: MAX_WORKSPACE_TEXT_BYTES },
                        endBytes: { type: "integer", minimum: 0, maximum: MAX_WORKSPACE_TEXT_BYTES },
                      },
                      required: ["startLine", "endLine", "startBytes", "endBytes"],
                    },
                    text: { type: "string", maxLength: MAX_RESPONSE_TEXT_BYTES },
                  },
                  required: ["requestIndex", "requested", "range", "text"],
                },
              },
              unserved: {
                type: "array",
                maxItems: MAX_RANGES_PER_FILE * 2,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    requestIndex: { type: "integer", minimum: 0, maximum: MAX_RANGES_PER_FILE - 1 },
                    requested: rangeSchema,
                    range: rangeSchema,
                    reason: {
                      type: "string",
                      enum: [
                        "revision_mismatch",
                        "out_of_range",
                        "response_budget",
                        "acquisition_budget",
                        "file_too_large",
                      ],
                    },
                  },
                  required: ["requestIndex", "requested", "range", "reason"],
                },
              },
            },
            required: ["path", "coverage", "served", "unserved"],
          },
        },
        acquisitionBytes: { type: "integer", minimum: 0, maximum: MAX_ACQUISITION_BYTES },
        selectedBytes: { type: "integer", minimum: 0, maximum: MAX_RESPONSE_TEXT_BYTES },
        coverage: { type: "string", enum: ["complete-at-boundary", "limited"] },
        scope: { type: "string", enum: [boundary] },
      },
      required: ["files", "acquisitionBytes", "selectedBytes", "coverage", "scope"],
    },
    effects: ["live-read"],
    effect: () => "live-read",
    concurrency: () => "read-parallel",
    exposure: { discoverable: true, direct: true, programmatic: true },
    async authorize(input, scope) {
      try {
        const request = input as unknown as Request;
        for (const file of request.files) {
          if (file.ranges.some((range) => range.endLine < range.startLine))
            throw new WorkspaceError("invalid_range", "Line range end precedes its start.");
          await resolveWorkspaceFile(state(), scope, file.path);
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
      const request = input as unknown as Request;
      const selectedLimit = request.maxBytes ?? DEFAULT_RESPONSE_TEXT_BYTES;
      const files: FileValue[] = [];
      const snapshots = new Map<string, { body: Buffer; lineEnds: number[]; revision: string }>();
      let acquisitionBytes = 0;
      let selectedBytes = 0;
      let responseExhausted = false;
      for (const item of request.files) {
        const resolved = await resolveWorkspaceFile(state(), context.scope, item.path);
        const file: FileValue = { path: item.path, coverage: "complete-at-boundary", served: [], unserved: [] };
        files.push(file);
        let snapshot = snapshots.get(resolved.path);
        if (!snapshot) {
          const remaining = MAX_ACQUISITION_BYTES - acquisitionBytes;
          if (remaining > 0) {
            let body: Buffer;
            try {
              body = await readWorkspaceSnapshot(resolved.path, context.signal, remaining);
            } catch (error) {
              if (!(error instanceof WorkspaceError) || error.code !== "file_too_large") throw error;
              for (const [requestIndex, range] of item.ranges.entries())
                unserved(
                  file,
                  requestIndex,
                  range,
                  range,
                  remaining < MAX_WORKSPACE_TEXT_BYTES ? "acquisition_budget" : "file_too_large",
                );
              continue;
            }
            let text: string;
            try {
              text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(body);
            } catch {
              throw new WorkspaceError("invalid_encoding", "Workspace file is not valid UTF-8 text.");
            }
            if (text.includes("\0"))
              throw new WorkspaceError("binary_unsupported", "Binary workspace files are unsupported.");
            snapshot = { body, lineEnds: lineEnds(body), revision: createHash("sha256").update(body).digest("hex") };
            snapshots.set(resolved.path, snapshot);
            acquisitionBytes += body.length;
          } else {
            for (const [requestIndex, range] of item.ranges.entries())
              unserved(file, requestIndex, range, range, "acquisition_budget");
            continue;
          }
        }
        file.revision = snapshot.revision;
        file.totalBytes = snapshot.body.length;
        file.totalLines = snapshot.lineEnds.length;
        for (const [requestIndex, requested] of item.ranges.entries()) {
          if (item.expectedRevision && item.expectedRevision !== snapshot.revision) {
            unserved(file, requestIndex, requested, requested, "revision_mismatch");
            continue;
          }
          if (requested.startLine > snapshot.lineEnds.length) {
            unserved(file, requestIndex, requested, requested, "out_of_range");
            continue;
          }
          const last = Math.min(requested.endLine, snapshot.lineEnds.length);
          let end = requested.startLine - 1;
          if (!responseExhausted) {
            while (end < last) {
              const startBytes = end === 0 ? 0 : snapshot.lineEnds[end - 1]!;
              const endBytes = snapshot.lineEnds[end]!;
              if (endBytes - startBytes > selectedLimit - selectedBytes) {
                responseExhausted = true;
                break;
              }
              selectedBytes += endBytes - startBytes;
              end += 1;
            }
          }
          if (end >= requested.startLine) {
            const startBytes = requested.startLine === 1 ? 0 : snapshot.lineEnds[requested.startLine - 2]!;
            const endBytes = snapshot.lineEnds[end - 1]!;
            file.served.push({
              requestIndex,
              requested,
              range: { startLine: requested.startLine, endLine: end, startBytes, endBytes },
              text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
                snapshot.body.subarray(startBytes, endBytes),
              ),
            });
          }
          if (end < last)
            unserved(file, requestIndex, requested, { startLine: end + 1, endLine: last }, "response_budget");
          if (last < requested.endLine)
            unserved(
              file,
              requestIndex,
              requested,
              { startLine: last + 1, endLine: requested.endLine },
              "out_of_range",
            );
        }
      }
      const complete = files.every((file) => file.unserved.length === 0);
      const value: RangeValue = {
        files,
        acquisitionBytes,
        selectedBytes,
        coverage: complete ? "complete-at-boundary" : "limited",
        scope: boundary,
      };
      const firstBudget = files
        .flatMap((file) => file.unserved.map((entry) => ({ file, entry })))
        .find(({ entry }) => entry.reason === "response_budget");
      return {
        value: value as unknown as Json,
        coverage: {
          kind: value.coverage,
          boundary,
          ...(firstBudget
            ? {
                continuation: {
                  path: firstBudget.file.path,
                  startLine: firstBudget.entry.range.startLine,
                  ...(firstBudget.file.revision ? { expectedRevision: firstBudget.file.revision } : {}),
                },
              }
            : {}),
        },
      };
    },
    presenter: {
      async model(input, outcome, policy) {
        const value = outcome.value as unknown as RangeValue | undefined;
        if (!value)
          return {
            text: `Read ${outcome.status} (${outcome.error?.code ?? "unavailable"}); no project ranges were served.`,
            coverage: { kind: "unknown" as const, boundary },
            artifactRefs: [],
          };
        const requested = (input as unknown as Request).maxBytes ?? DEFAULT_RESPONSE_TEXT_BYTES;
        const maximum = Math.min(policy.maxBytes, requested - Buffer.byteLength(v2ModelHeader(outcome), "utf8"));
        const shown = presentation(value, maximum, outcome.artifactRefs);
        return {
          text: shown.text,
          coverage: shown.allShown
            ? (outcome.coverage ?? { kind: value.coverage, boundary })
            : { kind: "limited" as const, boundary: "project-range-model-view" },
          artifactRefs: [...outcome.artifactRefs],
        };
      },
      async ui(_input, outcome) {
        const value = outcome.value as unknown as RangeValue | undefined;
        return {
          summary: value
            ? `Project ranges · ${value.files.length} files · ${value.coverage}`
            : "Project ranges unavailable",
        };
      },
    },
  };
}
