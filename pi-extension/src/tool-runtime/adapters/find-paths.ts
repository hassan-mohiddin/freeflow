import { randomBytes } from "node:crypto";

import type { ToolExecutionState } from "../config.js";
import type { Json, OperationV2 } from "../contracts.js";
import { v2ModelHeader } from "../presentation/v2.js";
import {
  authorizeProjectPaths,
  decodeProjectCursor,
  discoverProjectFiles,
  encodeProjectCursor,
  MAX_PROJECT_PATHS,
  projectFingerprint,
} from "./rg-project.js";
import { WorkspaceError } from "./workspace.js";

const key = { id: "project.findPaths", revision: "1" };
const DEFAULT_RESULTS = 50;
const MAX_RESULTS = 100;
const DEFAULT_BYTES = 8192;
type Request = {
  query?: string;
  paths?: string[];
  caseSensitive?: boolean;
  maxResults?: number;
  maxBytes?: number;
  cursor?: string;
};
type Value = {
  paths: string[];
  observedPaths: number;
  coverage: "complete-at-boundary" | "limited";
  scope: "rg-project-paths";
  backend: { version: string; identity: string };
  next?: string;
};

export function createFindPathsOperation(state: () => ToolExecutionState | undefined): OperationV2<Json, Json> {
  const cursorKey = randomBytes(32);
  return {
    key,
    contractVersion: 2,
    category: "project",
    description:
      "Find ignore-aware project paths by case-insensitive substring (or list paths with no query), with bounded output and explicit continuation; requires qualified PATH ripgrep.",
    keywords: ["project", "files", "paths", "find", "ignore", "discovery"],
    owner: { adapterId: "freeflow.ripgrep", adapterRevision: "1", executionWorld: "local-workspace" },
    guidance: {
      useWhen: "Find a small set of candidate project-relative files before reading content.",
      avoidWhen: "Use project.searchText@2 for content, and do not treat limited or unavailable discovery as absence.",
    },
    cancellation: "settles",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string", minLength: 1, maxLength: 256 },
        paths: {
          type: "array",
          minItems: 1,
          maxItems: MAX_PROJECT_PATHS,
          uniqueItems: true,
          items: { type: "string", minLength: 1, maxLength: 4096 },
        },
        caseSensitive: { type: "boolean" },
        maxResults: { type: "integer", minimum: 1, maximum: MAX_RESULTS },
        maxBytes: { type: "integer", minimum: 512, maximum: 32_768 },
        cursor: { type: "string", minLength: 1, maxLength: 4096 },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        paths: { type: "array", maxItems: MAX_RESULTS, items: { type: "string", minLength: 1, maxLength: 4096 } },
        observedPaths: { type: "integer", minimum: 0, maximum: 10_000 },
        coverage: { type: "string", enum: ["complete-at-boundary", "limited"] },
        scope: { type: "string", enum: ["rg-project-paths"] },
        backend: {
          type: "object",
          additionalProperties: false,
          properties: {
            version: { type: "string", minLength: 1, maxLength: 128 },
            identity: { type: "string", pattern: "^[a-f0-9]{64}$" },
          },
          required: ["version", "identity"],
        },
        next: { type: "string", minLength: 1, maxLength: 4096 },
      },
      required: ["paths", "observedPaths", "coverage", "scope", "backend"],
    },
    effects: ["live-read"],
    effect: () => "live-read",
    concurrency: () => "read-parallel",
    exposure: { discoverable: true, direct: true, programmatic: true },
    async authorize(input, scope) {
      try {
        await authorizeProjectPaths(state(), scope, (input as Request).paths ?? ["."]);
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
      const requested = request.paths ?? ["."];
      const deadline = AbortSignal.timeout(30_000);
      const signal = context.signal ? AbortSignal.any([context.signal, deadline]) : deadline;
      const source = await discoverProjectFiles(state(), context.scope, requested, signal);
      const limit = request.maxResults ?? DEFAULT_RESULTS;
      const byteLimit = request.maxBytes ?? DEFAULT_BYTES;
      const fingerprint = projectFingerprint(source, {
        operation: key,
        query: request.query ?? "",
        paths: [...requested].sort(),
        caseSensitive: request.caseSensitive === true,
        maxResults: limit,
        maxBytes: byteLimit,
      });
      const cursor = decodeProjectCursor(request.cursor, fingerprint, source.files.length, cursorKey);
      const paths: string[] = [];
      const query = request.caseSensitive ? request.query : request.query?.toLowerCase();
      let selectedBytes = 0;
      let next: string | undefined;
      for (let index = cursor?.index ?? 0; index < source.files.length; index += 1) {
        const path = source.files[index]!;
        if (query && !(request.caseSensitive ? path : path.toLowerCase()).includes(query)) continue;
        const bytes = Buffer.byteLength(path, "utf8");
        if (selectedBytes + bytes > byteLimit) {
          if (!paths.length)
            throw new WorkspaceError("search_output_limit", "A project path cannot fit the output budget.");
          next = encodeProjectCursor({ version: 1, fingerprint, index, offsetBytes: 0 }, cursorKey);
          break;
        }
        paths.push(path);
        selectedBytes += bytes;
        if (paths.length === limit && index + 1 < source.files.length) {
          next = encodeProjectCursor({ version: 1, fingerprint, index: index + 1, offsetBytes: 0 }, cursorKey);
          break;
        }
      }
      const value: Value = {
        paths,
        observedPaths: source.files.length,
        coverage: next ? "limited" : "complete-at-boundary",
        scope: "rg-project-paths",
        backend: { version: source.backend.version, identity: source.backend.identity },
        ...(next ? { next } : {}),
      };
      return {
        value: value as unknown as Json,
        coverage: { kind: value.coverage, boundary: value.scope, ...(next ? { continuation: { cursor: next } } : {}) },
      };
    },
    presenter: {
      async model(input, outcome, policy) {
        const value = outcome.value as unknown as Value | undefined;
        if (!value)
          return {
            text: `Path discovery ${outcome.status}; no result was verified.`,
            coverage: { kind: "unknown" as const, boundary: "rg-project-paths" },
            artifactRefs: [],
          };
        const maximum = Math.min(
          policy.maxBytes,
          ((input as Request).maxBytes ?? DEFAULT_BYTES) - Buffer.byteLength(v2ModelHeader(outcome), "utf8"),
        );
        const heading = `Project paths: ${value.paths.length} returned; ${value.observedPaths} candidates; ${value.coverage}.\n`;
        const cursor = value.next ? `Continue with cursor: ${value.next}\n` : "";
        const footer =
          cursor && Buffer.byteLength(heading + cursor, "utf8") <= maximum
            ? cursor
            : value.next
              ? "Continuation token omitted; rerun with larger maxBytes.\n"
              : "";
        const omitted = "Further path details omitted from this model view.\n";
        let text = heading;
        let shown = 0;
        for (const path of value.paths) {
          const line = `${path}\n`;
          if (Buffer.byteLength(text + line + omitted + footer, "utf8") > maximum) break;
          text += line;
          shown += 1;
        }
        if (shown < value.paths.length) text += omitted;
        text += footer;
        if (Buffer.byteLength(text, "utf8") > maximum) throw new Error("Path model view exceeds budget.");
        return {
          text,
          coverage:
            shown < value.paths.length
              ? { kind: "limited" as const, boundary: "rg-path-model-view" }
              : (outcome.coverage ?? { kind: value.coverage, boundary: value.scope }),
          artifactRefs: [...outcome.artifactRefs],
        };
      },
      async ui(_input, outcome) {
        const value = outcome.value as unknown as Value | undefined;
        return {
          summary: value
            ? `Paths · ${value.paths.length} of ${value.observedPaths} · ${value.coverage}`
            : "Paths unavailable",
        };
      },
    },
  };
}
