import { createHash } from "node:crypto";

import { assembleTextEvidence, byteLength, countLines } from "../evidence/evidence.js";
import type {
  EvidencePacket,
  ObservedOutputNormalization,
  PreserveMode,
  ProducerDescriptor,
  RouterThresholds,
} from "../config/types.js";

export interface ObservedReducerInput {
  outputId: string;
  source: EvidencePacket["source"];
  preserve: PreserveMode;
  thresholds: RouterThresholds;
  text: string;
  rawValue?: unknown;
  normalized: ObservedOutputNormalization;
  producer?: ProducerDescriptor;
}

export interface ObservedReducerResult {
  reducer: string;
  routingStatus: "routed" | "partial";
  reason: string;
  summary: string;
  evidence: EvidencePacket[];
}

export interface ObservedReducer {
  name: string;
  supports(input: ObservedReducerInput): boolean;
  reduce(input: ObservedReducerInput): ObservedReducerResult;
}

export interface ObservedReducerRegistry {
  names(): string[];
  reduce(input: ObservedReducerInput): ObservedReducerResult;
}

const IMPORTANT_JSON_KEYS = new Set([
  "id",
  "url",
  "uri",
  "link",
  "status",
  "state",
  "error",
  "message",
  "path",
  "repo",
  "snippet",
  "citation",
  "source",
  "symbol",
  "code",
  "file",
  "line",
  "lines",
  "name",
  "title",
  "number",
  "html_url",
  "web_url",
]);
const MAX_JSON_ARRAY_ROWS = 3;
const MAX_JSON_OBJECT_FIELDS = 12;

export function createDefaultObservedReducerRegistry(): ObservedReducerRegistry {
  const reducers: ObservedReducer[] = [webSearchReducer(), fetchReducer(), codeSearchReducer(), mcpReducer(), jsonReducer(), genericTextReducer()];
  return {
    names() {
      return reducers.map((reducer) => reducer.name);
    },
    reduce(input) {
      const fallback = genericTextReducer();
      const reducer = reducers.find((candidate) => candidate.supports(input)) ?? fallback;
      try {
        return reducer.reduce(input);
      } catch (error) {
        if (reducer.name === fallback.name) {
          throw error;
        }
        const fallbackResult = fallback.reduce(input);
        return {
          ...fallbackResult,
          reason: `${reducer.name} reducer failed (${errorMessage(error)}); ${fallbackResult.reason}`,
        };
      }
    },
  };
}

export function reduceObservedOutput(input: ObservedReducerInput): ObservedReducerResult {
  return createDefaultObservedReducerRegistry().reduce(input);
}

export function webSearchReducer(): ObservedReducer {
  return {
    name: "web-search",
    supports(input) {
      return input.producer?.kind === "web";
    },
    reduce(input) {
      const rows = extractRows(input.rawValue, ["results", "items", "sources"]);
      if (!rows) {
        return producerTextFallback(input, "web-search", "web_search output did not expose structured results.");
      }
      const shown = rows.slice(0, MAX_JSON_ARRAY_ROWS).map((row) => selectFields(row, ["title", "url", "snippet", "citation", "source"]));
      const omittedItems = Math.max(0, rows.length - shown.length);
      const excerpt = stableJson({
        type: "web_search_results",
        itemCount: rows.length,
        results: shown,
        ...(omittedItems > 0 ? { omittedItems } : {}),
      });
      return producerEvidenceResult({
        input,
        reducer: "web-search",
        excerpt,
        partial: omittedItems > 0 || byteLength(input.text) > byteLength(excerpt),
        summary: `web_search results: ${rows.length} item(s).`,
        reason: `web_search output was compacted to title, URL, snippet, and citation fields.`,
      });
    },
  };
}

export function fetchReducer(): ObservedReducer {
  return {
    name: "fetch",
    supports(input) {
      return input.producer?.kind === "fetch";
    },
    reduce(input) {
      const value = isRecord(input.rawValue) ? input.rawValue : undefined;
      const content = firstString(value?.content, value?.text, value?.markdown, input.text);
      if (!content) {
        return producerTextFallback(input, "fetch", "fetch_content output did not expose textual content.");
      }
      const excerpt = fetchExcerpt({
        title: firstString(value?.title, value?.name),
        url: firstString(value?.url, value?.canonicalUrl, value?.sourceUrl),
        contentType: firstString(value?.contentType, value?.mimeType),
        content,
      });
      return producerEvidenceResult({
        input,
        reducer: "fetch",
        excerpt,
        partial: byteLength(input.text) > byteLength(excerpt),
        summary: `fetch_content fetched content: ${countLines(content)} line(s), ${byteLength(content)} byte(s).`,
        reason: "fetch_content output was reduced to URL/title, headings, and code blocks.",
      });
    },
  };
}

export function codeSearchReducer(): ObservedReducer {
  return {
    name: "code-search",
    supports(input) {
      return input.producer?.kind === "code_search";
    },
    reduce(input) {
      const rows = extractRows(input.rawValue, ["results", "items", "matches"]);
      if (!rows) {
        return producerTextFallback(input, "code-search", "code_search output did not expose structured results.");
      }
      const shown = rows.slice(0, MAX_JSON_ARRAY_ROWS).map((row) => selectFields(row, ["repo", "path", "file", "line", "lines", "symbol", "snippet", "code"]));
      const omittedItems = Math.max(0, rows.length - shown.length);
      const excerpt = stableJson({
        type: "code_search_results",
        itemCount: rows.length,
        results: shown,
        ...(omittedItems > 0 ? { omittedItems } : {}),
      });
      return producerEvidenceResult({
        input,
        reducer: "code-search",
        excerpt,
        partial: omittedItems > 0 || byteLength(input.text) > byteLength(excerpt),
        summary: `code_search results: ${rows.length} item(s).`,
        reason: "code_search output was compacted to repo, path, line, symbol, and exact snippet fields.",
      });
    },
  };
}

export function mcpReducer(): ObservedReducer {
  return {
    name: "mcp",
    supports(input) {
      return input.producer?.kind === "mcp";
    },
    reduce(input) {
      const payload = extractMcpPayload(input);
      if (payload.jsonValues.length > 0 && payload.textBlocks.length === 0) {
        return reduceMcpJson(input, payload.jsonValues.length === 1 ? payload.jsonValues[0] : payload.jsonValues);
      }
      if (payload.jsonValues.length > 0 || payload.textBlocks.length > 0) {
        return reduceMcpMixed(input, payload);
      }
      const result = genericTextReducer().reduce(input);
      return {
        ...result,
        reducer: "mcp",
        summary: `MCP ${mcpLabel(input)} text: ${countLines(input.text)} line(s), ${byteLength(input.text)} byte(s).`,
        reason: `MCP ${mcpLabel(input)} output used generic text reduction. ${result.reason}`,
      };
    },
  };
}

export function genericTextReducer(): ObservedReducer {
  return {
    name: "generic-text",
    supports() {
      return true;
    },
    reduce(input) {
      const caps = textCaps(input.preserve, input.thresholds);
      const bounded = assembleTextEvidence({ stream: "combined", text: input.text, caps });
      const outputBytes = byteLength(input.text);
      const outputLines = countLines(input.text);
      const routingStatus = bounded.compressed || bounded.fidelity === "lossy" ? "partial" : "routed";
      const evidence = bounded.importantLines.map((line, index): EvidencePacket => ({
        id: evidenceId(input.outputId, line.lines, index),
        source: input.source,
        path: `${input.outputId}:observed`,
        lines: line.lines,
        excerpt: line.excerpt,
        why: bounded.compressed ? "Bounded observed tool output evidence." : "Observed tool output fits within routing caps.",
        window: bounded.compressed ? "section" : "exact",
        expandable: input.source.kind === "vault" && bounded.compressed,
      }));

      return {
        reducer: "generic-text",
        routingStatus,
        reason: bounded.compressed
          ? `Observed tool output was reduced from ${outputLines} line(s), ${outputBytes} byte(s); exact recovery depends on persistence policy.`
          : `Observed tool output fits within caps (${outputLines} line(s), ${outputBytes} byte(s)).`,
        summary: `Observed tool output: ${outputLines} line(s), ${outputBytes} byte(s).`,
        evidence,
      };
    },
  };
}

export function jsonReducer(): ObservedReducer {
  return {
    name: "json",
    supports(input) {
      return input.normalized.shape === "json" || parsesAsJson(input.text);
    },
    reduce(input) {
      const value = input.rawValue !== undefined ? input.rawValue : parseJson(input.text);
      if (Array.isArray(value)) {
        return reduceJsonArray(input, value);
      }
      if (isRecord(value)) {
        return reduceJsonObject(input, value);
      }
      return genericTextReducer().reduce(input);
    },
  };
}

function producerEvidenceResult(options: {
  input: ObservedReducerInput;
  reducer: string;
  excerpt: string;
  partial: boolean;
  summary: string;
  reason: string;
}): ObservedReducerResult {
  return {
    reducer: options.reducer,
    routingStatus: options.partial ? "partial" : "routed",
    reason: options.reason,
    summary: options.summary,
    evidence: [
      {
        id: evidenceId(options.input.outputId, options.reducer, 0),
        source: options.input.source,
        path: `${options.input.outputId}:observed-${options.reducer}`,
        excerpt: options.excerpt,
        why: `${options.reducer} reducer preserved exact producer evidence fields.`,
        window: options.partial ? "section" : "exact",
        expandable: options.input.source.kind === "vault" && options.partial,
      },
    ],
  };
}

function producerTextFallback(input: ObservedReducerInput, reducer: string, reason: string): ObservedReducerResult {
  const result = genericTextReducer().reduce(input);
  return {
    ...result,
    reducer,
    reason: `${reason} ${result.reason}`,
  };
}

function fetchExcerpt(options: { title?: string | undefined; url?: string | undefined; contentType?: string | undefined; content: string }): string {
  const lines = normalizeNewlines(options.content).split("\n");
  const headings = lines.filter((line) => /^#{1,6}\s+/.test(line)).slice(0, 8);
  const codeBlocks = extractCodeBlocks(options.content).slice(0, 3);
  return [
    options.title ? `Title: ${options.title}` : "",
    options.url ? `URL: ${options.url}` : "",
    options.contentType ? `Content-Type: ${options.contentType}` : "",
    headings.length > 0 ? ["Headings:", ...headings].join("\n") : "",
    codeBlocks.length > 0 ? ["Code blocks:", ...codeBlocks].join("\n\n") : "",
  ].filter(Boolean).join("\n");
}

function extractCodeBlocks(text: string): string[] {
  return Array.from(normalizeNewlines(text).matchAll(/```[\s\S]*?```/g), (match) => match[0]);
}

function extractRows(value: unknown, keys: readonly string[]): unknown[] | undefined {
  if (Array.isArray(value)) {
    return value;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  for (const key of keys) {
    if (Array.isArray(value[key])) {
      return value[key] as unknown[];
    }
  }
  return undefined;
}

function selectFields(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) {
    return { value: truncateScalar(value) };
  }
  const selected: Record<string, unknown> = {};
  for (const key of keys) {
    if (value[key] !== undefined) {
      selected[key] = truncateScalar(value[key]);
    }
  }
  return selected;
}

function truncateScalar(value: unknown): unknown {
  if (typeof value === "string") {
    const dedupedRuns = value.replace(/(.)\1{15,}/g, (match) => `${match.slice(0, 15)}…`);
    return dedupedRuns.length > 240 ? `${dedupedRuns.slice(0, 239)}…` : dedupedRuns;
  }
  return value;
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function reduceMcpJson(input: ObservedReducerInput, value: unknown): ObservedReducerResult {
  const unwrapped = unwrapCommonArray(value);
  if (unwrapped) {
    return reduceMcpJsonArray(input, unwrapped.key, unwrapped.rows);
  }
  if (Array.isArray(value)) {
    return reduceMcpJsonArray(input, undefined, value);
  }
  if (isRecord(value)) {
    return reduceMcpJsonObject(input, value);
  }
  return mcpGenericTextFallback(input, "MCP JSON payload was scalar; generic text evidence is safer.");
}

function reduceMcpJsonArray(input: ObservedReducerInput, key: string | undefined, rows: unknown[]): ObservedReducerResult {
  const shown = rows.slice(0, MAX_JSON_ARRAY_ROWS).map(compactJsonValue);
  const omittedItems = Math.max(0, rows.length - shown.length);
  const excerpt = stableJson({
    type: "mcp_array",
    server: input.producer?.server,
    tool: input.producer?.tool,
    ...(key !== undefined ? { sourceKey: key } : {}),
    itemCount: rows.length,
    items: shown,
    ...(omittedItems > 0 ? { omittedItems } : {}),
  });
  return mcpEvidenceResult({
    input,
    excerpt,
    partial: omittedItems > 0 || byteLength(input.text) > byteLength(excerpt),
    summary: `MCP ${mcpLabel(input)} JSON array: ${rows.length} item(s).`,
    reason: omittedItems > 0
      ? `MCP ${mcpLabel(input)} JSON array was compacted to ${shown.length} row(s); ${omittedItems} item(s) omitted.`
      : `MCP ${mcpLabel(input)} JSON array was compacted to ${shown.length} row(s).`,
  });
}

function reduceMcpJsonObject(input: ObservedReducerInput, value: Record<string, unknown>): ObservedReducerResult {
  const fields = importantJsonFields(value).slice(0, MAX_JSON_OBJECT_FIELDS);
  const compact = fields.length > 0 ? Object.fromEntries(fields) : compactJsonValue(value);
  const excerpt = stableJson({
    type: "mcp_object",
    server: input.producer?.server,
    tool: input.producer?.tool,
    keys: Object.keys(value).sort(),
    fields: compact,
  });
  return mcpEvidenceResult({
    input,
    excerpt,
    partial: byteLength(input.text) > byteLength(excerpt),
    summary: `MCP ${mcpLabel(input)} JSON object: ${Object.keys(value).length} top-level key(s).`,
    reason: `MCP ${mcpLabel(input)} JSON object was compacted to stable important scalar fields.`,
  });
}

function reduceMcpMixed(input: ObservedReducerInput, payload: McpPayload): ObservedReducerResult {
  const compactedTextBlocks = payload.textBlocks.map(compactMcpTextBlock);
  const text = compactedTextBlocks.map((block) => block.text).join("\n\n");
  const textWasCompacted = compactedTextBlocks.some((block) => block.compacted);
  const jsonValues = payload.jsonValues.map((value) => {
    const unwrapped = unwrapCommonArray(value);
    if (unwrapped) {
      return { [unwrapped.key]: unwrapped.rows.slice(0, MAX_JSON_ARRAY_ROWS).map(compactJsonValue), itemCount: unwrapped.rows.length };
    }
    if (Array.isArray(value)) {
      return { items: value.slice(0, MAX_JSON_ARRAY_ROWS).map(compactJsonValue), itemCount: value.length };
    }
    return compactJsonValue(value);
  });
  const excerpt = [
    text,
    jsonValues.length > 0 ? stableJson({ jsonBlocks: jsonValues }) : "",
  ].filter(Boolean).join("\n\n");
  return mcpEvidenceResult({
    input,
    excerpt,
    partial: textWasCompacted || byteLength(input.text) > byteLength(excerpt),
    summary: `MCP ${mcpLabel(input)} mixed content: ${payload.textBlocks.length} text block(s), ${payload.jsonValues.length} JSON block(s).`,
    reason: textWasCompacted
      ? `MCP ${mcpLabel(input)} mixed content was reduced by bounding text blocks and compact JSON fields.`
      : `MCP ${mcpLabel(input)} mixed content was reduced by preserving text blocks and compact JSON fields.`,
  });
}

function compactMcpTextBlock(text: string): { text: string; compacted: boolean } {
  const normalized = normalizeNewlines(text);
  const lines = normalized.split("\n");
  const shown = lines.slice(0, 8).map((line) => String(truncateScalar(line)));
  const omittedLines = Math.max(0, lines.length - shown.length);
  const compacted = omittedLines > 0 || byteLength(shown.join("\n")) < byteLength(normalized);
  return {
    text: [
      ...shown,
      omittedLines > 0 ? `[... ${omittedLines} more line(s) omitted from MCP text block ...]` : "",
    ].filter(Boolean).join("\n"),
    compacted,
  };
}

function mcpEvidenceResult(options: {
  input: ObservedReducerInput;
  excerpt: string;
  partial: boolean;
  summary: string;
  reason: string;
}): ObservedReducerResult {
  return {
    reducer: "mcp",
    routingStatus: options.partial ? "partial" : "routed",
    reason: options.reason,
    summary: options.summary,
    evidence: [
      {
        id: evidenceId(options.input.outputId, "mcp", 0),
        source: options.input.source,
        path: `${options.input.outputId}:observed-mcp`,
        excerpt: options.excerpt,
        why: `Deterministic MCP reducer preserved exact IDs, URLs, statuses, paths, errors, and code snippets for ${mcpLabel(options.input)}.`,
        window: options.partial ? "section" : "exact",
        expandable: options.input.source.kind === "vault" && options.partial,
      },
    ],
  };
}

function mcpGenericTextFallback(input: ObservedReducerInput, reason: string): ObservedReducerResult {
  const result = genericTextReducer().reduce(input);
  return {
    ...result,
    reducer: "mcp",
    summary: `MCP ${mcpLabel(input)} text: ${countLines(input.text)} line(s), ${byteLength(input.text)} byte(s).`,
    reason: `${reason} ${result.reason}`,
  };
}

interface McpPayload {
  textBlocks: string[];
  jsonValues: unknown[];
}

function extractMcpPayload(input: ObservedReducerInput): McpPayload {
  const textBlocks: string[] = [];
  const jsonValues: unknown[] = [];
  collectMcpPayload(input.rawValue, textBlocks, jsonValues);

  if (textBlocks.length === 0 && jsonValues.length === 0) {
    const parsed = parseJson(input.text);
    if (parsed !== undefined) {
      jsonValues.push(parsed);
    } else if (input.text.length > 0) {
      textBlocks.push(input.text);
    }
  }

  return { textBlocks, jsonValues };
}

function collectMcpPayload(value: unknown, textBlocks: string[], jsonValues: unknown[]) {
  if (!isRecord(value)) {
    if (typeof value === "string" && value.length > 0) {
      textBlocks.push(value);
    }
    return;
  }

  if (Array.isArray(value.content)) {
    for (const block of value.content) {
      collectMcpBlock(block, textBlocks, jsonValues);
    }
    return;
  }

  if (value.json !== undefined) {
    jsonValues.push(value.json);
    return;
  }

  if (typeof value.text === "string") {
    collectMcpText(value.text, textBlocks, jsonValues);
    return;
  }

  jsonValues.push(value);
}

function collectMcpBlock(block: unknown, textBlocks: string[], jsonValues: unknown[]) {
  if (typeof block === "string") {
    collectMcpText(block, textBlocks, jsonValues);
    return;
  }
  if (!isRecord(block)) {
    return;
  }
  if (block.json !== undefined) {
    jsonValues.push(block.json);
    return;
  }
  if (typeof block.text === "string") {
    collectMcpText(block.text, textBlocks, jsonValues);
    return;
  }
  if (block.content !== undefined) {
    collectMcpPayload(block, textBlocks, jsonValues);
    return;
  }
  jsonValues.push(block);
}

function collectMcpText(text: string, textBlocks: string[], jsonValues: unknown[]) {
  const parsed = parseJson(text);
  if (parsed !== undefined) {
    jsonValues.push(parsed);
    return;
  }
  textBlocks.push(text);
}

function unwrapCommonArray(value: unknown): { key: string; rows: unknown[] } | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  for (const key of ["items", "results", "data", "deployments", "issues", "messages"]) {
    const entry = value[key];
    if (Array.isArray(entry)) {
      return { key, rows: entry };
    }
  }
  return undefined;
}

function mcpLabel(input: ObservedReducerInput): string {
  return [input.producer?.server, input.producer?.tool].filter(Boolean).join(" ") || "unknown";
}

function reduceJsonArray(input: ObservedReducerInput, rows: unknown[]): ObservedReducerResult {
  const shown = rows.slice(0, MAX_JSON_ARRAY_ROWS).map(compactJsonValue);
  const omittedItems = Math.max(0, rows.length - shown.length);
  const excerpt = stableJson({
    type: "array",
    itemCount: rows.length,
    items: shown,
    ...(omittedItems > 0 ? { omittedItems } : {}),
  });
  return jsonEvidenceResult({
    input,
    excerpt,
    partial: omittedItems > 0 || byteLength(input.text) > byteLength(excerpt),
    summary: `JSON array: ${rows.length} item(s).`,
    reason: omittedItems > 0
      ? `JSON array output was compacted to ${shown.length} row(s); ${omittedItems} item(s) omitted.`
      : `JSON array output was compacted to ${shown.length} row(s).`,
  });
}

function reduceJsonObject(input: ObservedReducerInput, value: Record<string, unknown>): ObservedReducerResult {
  const fields = importantJsonFields(value).slice(0, MAX_JSON_OBJECT_FIELDS);
  const compact = fields.length > 0 ? Object.fromEntries(fields) : compactJsonValue(value);
  const excerpt = stableJson({
    type: "object",
    keys: Object.keys(value).sort(),
    fields: compact,
  });
  return jsonEvidenceResult({
    input,
    excerpt,
    partial: byteLength(input.text) > byteLength(excerpt),
    summary: `JSON object: ${Object.keys(value).length} top-level key(s).`,
    reason: "JSON object output was compacted to stable important scalar fields.",
  });
}

function jsonEvidenceResult(options: {
  input: ObservedReducerInput;
  excerpt: string;
  partial: boolean;
  summary: string;
  reason: string;
}): ObservedReducerResult {
  return {
    reducer: "json",
    routingStatus: options.partial ? "partial" : "routed",
    reason: options.reason,
    summary: options.summary,
    evidence: [
      {
        id: evidenceId(options.input.outputId, "json", 0),
        source: options.input.source,
        path: `${options.input.outputId}:observed-json`,
        excerpt: options.excerpt,
        why: "Deterministic JSON reducer preserved compact exact scalar evidence.",
        window: options.partial ? "section" : "exact",
        expandable: options.input.source.kind === "vault" && options.partial,
      },
    ],
  };
}

function compactJsonValue(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const selected = Object.fromEntries(importantJsonFields(value).slice(0, MAX_JSON_OBJECT_FIELDS));
  if (Object.keys(selected).length > 0) {
    return selected;
  }

  const scalars = Object.entries(value)
    .filter(([, entry]) => isScalar(entry))
    .slice(0, MAX_JSON_OBJECT_FIELDS);
  return Object.fromEntries(scalars);
}

function importantJsonFields(value: Record<string, unknown>, prefix = "", depth = 0): [string, unknown][] {
  const fields: [string, unknown][] = [];
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));

  for (const [key, entry] of entries) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isScalar(entry) && IMPORTANT_JSON_KEYS.has(key.toLowerCase())) {
      fields.push([path, entry]);
      continue;
    }
    if (isRecord(entry) && depth < 2) {
      fields.push(...importantJsonFields(entry, path, depth + 1));
    }
  }

  return fields;
}

function textCaps(preserve: PreserveMode, thresholds: RouterThresholds) {
  return preserve === "full"
    ? {
        maxLines: Number.MAX_SAFE_INTEGER,
        maxExcerptBytes: thresholds.largeOutputBytes,
        maxLineBytes: thresholds.largeOutputBytes,
      }
    : {
        maxLines: thresholds.largeOutputLines,
        maxExcerptBytes: thresholds.largeOutputBytes,
        maxLineBytes: thresholds.largeOutputBytes,
      };
}

function parsesAsJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, sortJsonKeys, 2);
}

function sortJsonKeys(_key: string, value: unknown): unknown {
  if (!isRecord(value) || Array.isArray(value)) {
    return value;
  }
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function evidenceId(outputId: string, lines: string, index: number): string {
  return `ffe_${createHash("sha256").update(`${outputId}:${lines}:${index}`).digest("hex").slice(0, 16)}`;
}

function isScalar(value: unknown): boolean {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
