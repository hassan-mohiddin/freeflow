import { createHash } from "node:crypto";

import { DEFAULT_ROUTER_THRESHOLDS } from "./config.js";
import { assembleTextEvidence, byteLength, countLines, splitLines } from "./evidence.js";
import {
  deriveSourceUnavailableFailure,
  deriveValidationFailure,
  deriveExecutionFailure,
  storageFailure,
} from "./failure-contracts.js";
import { createVault, readOutputText, readVaultRecord, storeTextOutput } from "./vault.js";
import type {
  DeriveRoutedResult,
  EvidenceLineage,
  FailureRoutedResult,
  EvidencePacket,
  OutputStream,
  PreserveMode,
  RouterThresholds,
  SourceRef,
  VaultRecord,
  VaultRetentionPolicy,
} from "./types.js";

export interface DeriveVaultSourceInput {
  kind: "vault";
  outputId: string;
  stream?: OutputStream;
}

export type DeriveSourceInput = DeriveVaultSourceInput;

export interface RegexFilterDeriveOperation {
  kind: "regexFilter";
  pattern: string;
  flags?: string;
  contextLines?: number;
  maxMatches?: number;
}

export interface CountMatchesDeriveOperation {
  kind: "countMatches";
  pattern: string;
  flags?: string;
}

export interface JsonExtractDeriveOperation {
  kind: "jsonExtract";
  pointer?: string;
  path?: string;
}

export interface GroupByRegexDeriveOperation {
  kind: "groupByRegex";
  pattern: string;
  flags?: string;
  group?: number | string;
  maxGroups?: number;
  maxLinesPerGroup?: number;
}

export interface DedupeDeriveOperation {
  kind: "dedupe";
  trim?: boolean;
  caseSensitive?: boolean;
  maxLines?: number;
}

export interface TopNDeriveOperation {
  kind: "topN";
  limit: number;
  pattern?: string;
  flags?: string;
  group?: number | string;
  sort?: "text" | "numeric";
  order?: "asc" | "desc";
}

export interface ExtractUrlsDeriveOperation {
  kind: "extractUrls";
  dedupe?: boolean;
  maxMatches?: number;
}

export interface ExtractCitationsDeriveOperation {
  kind: "extractCitations";
  maxMatches?: number;
}

export interface LineStatsDeriveOperation {
  kind: "lineStats";
}

export interface SizeStatsDeriveOperation {
  kind: "sizeStats";
}

type RegexDeriveOperation = RegexFilterDeriveOperation | CountMatchesDeriveOperation | GroupByRegexDeriveOperation | TopNDeriveOperation;
type RegexPatternDeriveOperation = RegexFilterDeriveOperation | CountMatchesDeriveOperation | GroupByRegexDeriveOperation | (TopNDeriveOperation & { pattern: string });
export type DeriveOperation =
  | RegexFilterDeriveOperation
  | CountMatchesDeriveOperation
  | JsonExtractDeriveOperation
  | GroupByRegexDeriveOperation
  | DedupeDeriveOperation
  | TopNDeriveOperation
  | ExtractUrlsDeriveOperation
  | ExtractCitationsDeriveOperation
  | LineStatsDeriveOperation
  | SizeStatsDeriveOperation;

export interface DeriveInput {
  source: DeriveSourceInput;
  operation: DeriveOperation;
  preserve?: PreserveMode;
}

export interface FreeflowDeriveOptions extends DeriveInput {
  sessionId: string;
  vaultRoot?: string;
  vaultRetention?: VaultRetentionPolicy;
  thresholds?: Partial<RouterThresholds>;
}

export interface DeriveValidationIssue {
  path: string;
  message: string;
}

export type DeriveValidationResult =
  | { ok: true; value: DeriveInput }
  | { ok: false; issues: DeriveValidationIssue[] };

interface CompiledRegexOperation {
  regex: RegExp;
  displayPattern: string;
  flags: string;
}

interface PreparedJsonExtractOperation {
  selectorKind: "pointer" | "path";
  selector: string;
  segments: readonly JsonSelectorSegment[];
}

type PreparedDeriveOperation =
  | { kind: "regex"; value: CompiledRegexOperation }
  | { kind: "json"; value: PreparedJsonExtractOperation }
  | { kind: "none" };

type JsonSelectorSegment =
  | { kind: "property"; key: string }
  | { kind: "index"; index: number };

interface MatchStats {
  matches: number;
  matchedLines: number;
  matchedLineNumbers: number[];
  truncated: boolean;
}

interface DerivedOutput {
  text: string;
  summary: string;
  stats: MatchStats;
}

const PRESERVE_MODES = new Set(["summary", "important", "full"]);
const OPERATION_KINDS = new Set([
  "regexFilter",
  "countMatches",
  "jsonExtract",
  "groupByRegex",
  "dedupe",
  "topN",
  "extractUrls",
  "extractCitations",
  "lineStats",
  "sizeStats",
]);
const REGEX_FLAGS = new Set(["g", "i", "m", "s", "u"]);
const DEFAULT_CONTEXT_LINES = 0;
const DEFAULT_MAX_MATCHES = 50;
const MAX_CONTEXT_LINES = 20;
const MAX_MATCHES = 1_000;
const DEFAULT_MAX_GROUPS = 100;
const DEFAULT_MAX_LINES_PER_GROUP = 20;
const DEFAULT_MAX_DEDUPE_LINES = 1_000;
const MAX_GROUPS = 1_000;
const MAX_LINES_PER_GROUP = 1_000;
const MAX_DEDUPE_LINES = 10_000;
const MAX_TOP_N_LIMIT = 1_000;
const DEFAULT_MAX_EXTRACT_MATCHES = 1_000;
const MAX_EXTRACT_MATCHES = 10_000;
const URL_PATTERN = /https?:\/\/[^\s<>"'\])}]+/gi;

export function validateDeriveInput(value: unknown): DeriveValidationResult {
  const issues: DeriveValidationIssue[] = [];

  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: "$", message: "Expected derive input object." }] };
  }

  validateDeriveSource(value.source, "$.source", issues);
  validateDeriveOperation(value.operation, "$.operation", issues);

  if (value.preserve !== undefined && (typeof value.preserve !== "string" || !PRESERVE_MODES.has(value.preserve))) {
    issues.push({ path: "$.preserve", message: "Expected preserve mode summary, important, or full." });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const input: DeriveInput = {
    source: value.source as DeriveSourceInput,
    operation: value.operation as DeriveOperation,
  };
  if (value.preserve !== undefined) {
    input.preserve = value.preserve as PreserveMode;
  }
  return { ok: true, value: input };
}

export async function freeflowDerive(options: FreeflowDeriveOptions): Promise<DeriveRoutedResult | FailureRoutedResult> {
  const preserve = options.preserve ?? "important";
  const inputValidation = validateDeriveInput(options);
  if (!inputValidation.ok) {
    return deriveValidationFailureWithOptionalLineage({
      message: validationMessage(inputValidation.issues),
      preserve,
      lineage: lineageFromInput(options),
      decisionSeed: "input-validation",
    });
  }

  const operation = inputValidation.value.operation;
  const prepared = prepareDeriveOperation(operation);
  if (!prepared.ok) {
    return deriveValidationFailureWithOptionalLineage({
      message: prepared.message,
      preserve,
      lineage: lineageFromInput(inputValidation.value),
      decisionSeed: "operation-validation",
    });
  }

  const source = inputValidation.value.source;
  const vaultOptions: { root?: string; retention?: VaultRetentionPolicy } = {};
  if (options.vaultRoot !== undefined) {
    vaultOptions.root = options.vaultRoot;
  }
  if (options.vaultRetention !== undefined) {
    vaultOptions.retention = options.vaultRetention;
  }
  const vault = createVault(vaultOptions);
  const thresholds = { ...DEFAULT_ROUTER_THRESHOLDS, ...options.thresholds };
  let sourceRecord: VaultRecord;
  let stream: OutputStream;
  let sourceText: string;

  try {
    sourceRecord = await readVaultRecord(vault, options.sessionId, source.outputId);
  } catch (error) {
    return deriveSourceUnavailableFailureWithOptionalLineage({
      message: `Vault source outputId=${source.outputId} could not be found or read: ${errorMessage(error)}`,
      preserve,
      lineage: lineageFromInput(inputValidation.value),
      decisionSeed: "source-record",
    });
  }

  const streamResult = resolveSourceStream(sourceRecord, source.stream);
  if (!streamResult.ok) {
    return deriveValidationFailure({
      message: streamResult.message,
      preserve,
      lineage: lineageForSource(sourceRecord, operation),
      decisionSeed: "source-stream",
    });
  }
  stream = streamResult.stream;

  try {
    sourceText = await readOutputText(vault, options.sessionId, source.outputId, stream);
  } catch (error) {
    return deriveSourceUnavailableFailure({
      message: `Vault source outputId=${source.outputId} stream=${stream} could not be read: ${errorMessage(error)}`,
      preserve,
      lineage: lineageForSource(sourceRecord, operation),
      decisionSeed: "source-text",
    });
  }

  let derived: DerivedOutput;
  try {
    derived = deriveText({
      text: sourceText,
      sourceLabel: `${source.outputId}:${stream}`,
      operation,
      prepared: prepared.value,
    });
  } catch (error) {
    return deriveExecutionFailure({
      message: `Derive operation ${operation.kind} failed: ${errorMessage(error)}`,
      preserve,
      lineage: lineageForSource(sourceRecord, operation),
      decisionSeed: "derive-execution",
    });
  }

  const producer = { kind: "derive" as const, name: operation.kind };
  const lineage = lineageForSource(sourceRecord, operation);
  let record;
  try {
    record = await storeTextOutput(vault, {
      sessionId: options.sessionId,
      raw: derived.text,
      sourceKind: "derive",
      producer,
      lineage,
      decisionIds: [decisionId("derive-store", source.outputId, stream, operation.kind, lineage.operationHash ?? "")],
    });
  } catch (error) {
    return storageFailure({
      operation: "derive",
      message: `Derived output could not be persisted: ${errorMessage(error)}`,
      preserve,
      producer,
      lineage,
    });
  }

  const routed = routeDerivedText({
    outputId: record.outputId,
    text: derived.text,
    preserve,
    thresholds,
    source: { kind: "vault", outputId: source.outputId, stream },
    operationKind: operation.kind,
  });

  return {
    toolStatus: "ok",
    decisionId: decisionId("derive", record.outputId, source.outputId, stream, operation.kind, routed.routingStatus),
    outputId: record.outputId,
    recordId: record.recordId,
    preserve,
    source: { kind: "vault", outputId: source.outputId, stream },
    operation: operationSummary(operation),
    producer: record.producer,
    persistence: record.persistence,
    lineage,
    routing: {
      status: routed.routingStatus,
      route: "derive",
      reason: routed.reason,
    },
    summary: derived.summary,
    evidence: routed.evidence,
    recovery: {
      how: `Use freeflow_retrieve with source.kind=vault and outputId=${record.outputId}, stream=raw, and an exact lineRange to recover exact derived content. Source evidence remains outputId=${source.outputId} stream=${stream}.`,
      outputId: record.outputId,
    },
  };
}

function validateDeriveSource(value: unknown, path: string, issues: DeriveValidationIssue[]) {
  if (!isRecord(value)) {
    issues.push({ path, message: "Expected derive source object." });
    return;
  }

  if (value.kind !== "vault") {
    issues.push({ path: `${path}.kind`, message: "Slice 5A supports only vault derive sources." });
    return;
  }

  if (typeof value.outputId !== "string" || value.outputId.length === 0) {
    issues.push({ path: `${path}.outputId`, message: "Expected non-empty vault outputId." });
  }
  if (value.stream !== undefined && !isOutputStream(value.stream)) {
    issues.push({ path: `${path}.stream`, message: "Expected a known output stream." });
  }
}

function validateDeriveOperation(value: unknown, path: string, issues: DeriveValidationIssue[]) {
  if (!isRecord(value)) {
    issues.push({ path, message: "Expected derive operation object." });
    return;
  }

  if (typeof value.kind !== "string" || !OPERATION_KINDS.has(value.kind)) {
    issues.push({ path: `${path}.kind`, message: "Expected a supported derive operation kind." });
    return;
  }

  if (value.kind === "jsonExtract") {
    validateJsonExtractOperation(value, path, issues);
    return;
  }

  if (value.kind === "dedupe") {
    validateDedupeOperation(value, path, issues);
    return;
  }

  if (value.kind === "topN") {
    validateTopNOperation(value, path, issues);
    return;
  }

  if (value.kind === "extractUrls" || value.kind === "extractCitations") {
    validateExtractOperation(value, path, issues);
    return;
  }

  if (value.kind === "lineStats" || value.kind === "sizeStats") {
    validateStatsOperation(value, path, issues);
    return;
  }

  if (typeof value.pattern !== "string" || value.pattern.length === 0) {
    issues.push({ path: `${path}.pattern`, message: "Expected a non-empty regex pattern string." });
  }

  validateRegexFlags(value.flags, `${path}.flags`, issues);

  if (value.kind === "regexFilter") {
    if (value.contextLines !== undefined) {
      validateIntegerRange(value.contextLines, `${path}.contextLines`, 0, MAX_CONTEXT_LINES, issues);
    }
    if (value.maxMatches !== undefined) {
      validateIntegerRange(value.maxMatches, `${path}.maxMatches`, 1, MAX_MATCHES, issues);
    }
    return;
  }

  if (value.kind === "groupByRegex") {
    validateGroupSelector(value.group, `${path}.group`, issues);
    if (value.maxGroups !== undefined) {
      validateIntegerRange(value.maxGroups, `${path}.maxGroups`, 1, MAX_GROUPS, issues);
    }
    if (value.maxLinesPerGroup !== undefined) {
      validateIntegerRange(value.maxLinesPerGroup, `${path}.maxLinesPerGroup`, 1, MAX_LINES_PER_GROUP, issues);
    }
    return;
  }

  for (const key of ["contextLines", "maxMatches", "group", "maxGroups", "maxLinesPerGroup"] as const) {
    if (value[key] !== undefined) {
      issues.push({ path: `${path}.${key}`, message: `Operation ${value.kind} does not accept ${key}.` });
    }
  }
}

function validateJsonExtractOperation(value: Record<string, unknown>, path: string, issues: DeriveValidationIssue[]) {
  const hasPointer = value.pointer !== undefined;
  const hasPath = value.path !== undefined;

  if (hasPointer === hasPath) {
    issues.push({ path, message: "Expected exactly one JSON selector: pointer or path." });
  }

  if (value.pointer !== undefined) {
    if (typeof value.pointer !== "string") {
      issues.push({ path: `${path}.pointer`, message: "Expected JSON pointer string." });
    } else {
      const pointer = parseJsonPointer(value.pointer);
      if (!pointer.ok) {
        issues.push({ path: `${path}.pointer`, message: `Invalid JSON pointer: ${pointer.message}` });
      }
    }
  }

  if (value.path !== undefined) {
    if (typeof value.path !== "string") {
      issues.push({ path: `${path}.path`, message: "Expected JSON path string." });
    } else {
      const parsedPath = parseJsonPath(value.path);
      if (!parsedPath.ok) {
        issues.push({ path: `${path}.path`, message: `Invalid JSON path: ${parsedPath.message}` });
      }
    }
  }

  for (const key of ["pattern", "flags", "contextLines", "maxMatches"] as const) {
    if (value[key] !== undefined) {
      issues.push({ path: `${path}.${key}`, message: `Operation jsonExtract does not accept ${key}.` });
    }
  }
}

function validateDedupeOperation(value: Record<string, unknown>, path: string, issues: DeriveValidationIssue[]) {
  if (value.trim !== undefined && typeof value.trim !== "boolean") {
    issues.push({ path: `${path}.trim`, message: "Expected boolean when present." });
  }
  if (value.caseSensitive !== undefined && typeof value.caseSensitive !== "boolean") {
    issues.push({ path: `${path}.caseSensitive`, message: "Expected boolean when present." });
  }
  if (value.maxLines !== undefined) {
    validateIntegerRange(value.maxLines, `${path}.maxLines`, 1, MAX_DEDUPE_LINES, issues);
  }

  for (const key of ["pattern", "flags", "contextLines", "maxMatches", "group", "maxGroups", "maxLinesPerGroup", "limit", "sort", "order"] as const) {
    if (value[key] !== undefined) {
      issues.push({ path: `${path}.${key}`, message: `Operation dedupe does not accept ${key}.` });
    }
  }
}

function validateTopNOperation(value: Record<string, unknown>, path: string, issues: DeriveValidationIssue[]) {
  validateIntegerRange(value.limit, `${path}.limit`, 1, MAX_TOP_N_LIMIT, issues);

  const hasPattern = value.pattern !== undefined;
  if (hasPattern) {
    if (typeof value.pattern !== "string" || value.pattern.length === 0) {
      issues.push({ path: `${path}.pattern`, message: "Expected a non-empty regex pattern string." });
    }
    validateRegexFlags(value.flags, `${path}.flags`, issues);
    validateGroupSelector(value.group, `${path}.group`, issues);
  } else {
    if (value.flags !== undefined) {
      issues.push({ path: `${path}.flags`, message: "topN flags require a pattern." });
    }
    if (value.group !== undefined) {
      issues.push({ path: `${path}.group`, message: "topN group requires a pattern." });
    }
  }

  if (value.sort !== undefined && value.sort !== "text" && value.sort !== "numeric") {
    issues.push({ path: `${path}.sort`, message: "Expected sort text or numeric." });
  }
  if (value.order !== undefined && value.order !== "asc" && value.order !== "desc") {
    issues.push({ path: `${path}.order`, message: "Expected order asc or desc." });
  }

  for (const key of ["contextLines", "maxMatches", "maxGroups", "maxLinesPerGroup", "trim", "caseSensitive", "maxLines"] as const) {
    if (value[key] !== undefined) {
      issues.push({ path: `${path}.${key}`, message: `Operation topN does not accept ${key}.` });
    }
  }
}

function validateExtractOperation(value: Record<string, unknown>, path: string, issues: DeriveValidationIssue[]) {
  if (value.maxMatches !== undefined) {
    validateIntegerRange(value.maxMatches, `${path}.maxMatches`, 1, MAX_EXTRACT_MATCHES, issues);
  }
  if (value.kind === "extractUrls" && value.dedupe !== undefined && typeof value.dedupe !== "boolean") {
    issues.push({ path: `${path}.dedupe`, message: "Expected boolean when present." });
  }
  if (value.kind === "extractCitations" && value.dedupe !== undefined) {
    issues.push({ path: `${path}.dedupe`, message: "Operation extractCitations does not accept dedupe." });
  }

  for (const key of ["pattern", "flags", "contextLines", "group", "maxGroups", "maxLinesPerGroup", "limit", "sort", "order", "trim", "caseSensitive", "maxLines"] as const) {
    if (value[key] !== undefined) {
      issues.push({ path: `${path}.${key}`, message: `Operation ${value.kind} does not accept ${key}.` });
    }
  }
}

function validateStatsOperation(value: Record<string, unknown>, path: string, issues: DeriveValidationIssue[]) {
  for (const key of ["pattern", "flags", "contextLines", "maxMatches", "group", "maxGroups", "maxLinesPerGroup", "limit", "sort", "order", "trim", "caseSensitive", "maxLines", "dedupe"] as const) {
    if (value[key] !== undefined) {
      issues.push({ path: `${path}.${key}`, message: `Operation ${value.kind} does not accept ${key}.` });
    }
  }
}

function validateGroupSelector(value: unknown, path: string, issues: DeriveValidationIssue[]) {
  if (value === undefined) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0) {
      issues.push({ path, message: "Expected a non-negative integer group index." });
    }
    return;
  }
  if (typeof value === "string" && value.length > 0) {
    return;
  }
  issues.push({ path, message: "Expected a non-empty string group name or non-negative integer group index." });
}

function validateRegexFlags(value: unknown, path: string, issues: DeriveValidationIssue[]) {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "string") {
    issues.push({ path, message: "Expected regex flags string when present." });
    return;
  }

  const seen = new Set<string>();
  for (const flag of value) {
    if (!REGEX_FLAGS.has(flag)) {
      issues.push({ path, message: "Expected regex flags to contain only g, i, m, s, or u." });
      return;
    }
    if (seen.has(flag)) {
      issues.push({ path, message: "Expected regex flags without duplicates." });
      return;
    }
    seen.add(flag);
  }
}

function validateIntegerRange(
  value: unknown,
  path: string,
  min: number,
  max: number,
  issues: DeriveValidationIssue[],
) {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    issues.push({ path, message: `Expected integer from ${min} to ${max}.` });
  }
}

function prepareDeriveOperation(
  operation: DeriveOperation,
): { ok: true; value: PreparedDeriveOperation } | { ok: false; message: string } {
  if (operation.kind === "jsonExtract") {
    const preparedJson = prepareJsonExtractOperation(operation);
    if (!preparedJson.ok) {
      return preparedJson;
    }
    return { ok: true, value: { kind: "json", value: preparedJson.value } };
  }

  if (
    operation.kind === "dedupe" ||
    operation.kind === "extractUrls" ||
    operation.kind === "extractCitations" ||
    operation.kind === "lineStats" ||
    operation.kind === "sizeStats" ||
    (operation.kind === "topN" && operation.pattern === undefined)
  ) {
    return { ok: true, value: { kind: "none" } };
  }

  const compiledRegex = compileRegexOperation(operation as RegexPatternDeriveOperation);
  if (!compiledRegex.ok) {
    return compiledRegex;
  }
  return { ok: true, value: { kind: "regex", value: compiledRegex.value } };
}

function compileRegexOperation(
  operation: RegexPatternDeriveOperation,
): { ok: true; value: CompiledRegexOperation } | { ok: false; message: string } {
  const flags = normalizeRegexFlags(operation.flags);
  let regex: RegExp;
  try {
    regex = new RegExp(operation.pattern, ensureGlobalFlag(flags));
  } catch (error) {
    return { ok: false, message: `Invalid regex pattern for ${operation.kind}: ${errorMessage(error)}` };
  }

  try {
    const zeroWidthCheck = new RegExp(operation.pattern, flags);
    if (zeroWidthCheck.test("")) {
      return { ok: false, message: `Invalid regex pattern for ${operation.kind}: patterns that match empty strings are not supported.` };
    }
  } catch (error) {
    return { ok: false, message: `Invalid regex pattern for ${operation.kind}: ${errorMessage(error)}` };
  }

  return {
    ok: true,
    value: {
      regex,
      displayPattern: operation.pattern,
      flags,
    },
  };
}

function prepareJsonExtractOperation(
  operation: JsonExtractDeriveOperation,
): { ok: true; value: PreparedJsonExtractOperation } | { ok: false; message: string } {
  if (operation.pointer !== undefined) {
    const pointer = parseJsonPointer(operation.pointer);
    if (!pointer.ok) {
      return { ok: false, message: `Invalid JSON pointer: ${pointer.message}` };
    }
    return {
      ok: true,
      value: {
        selectorKind: "pointer",
        selector: operation.pointer,
        segments: pointer.segments,
      },
    };
  }

  if (operation.path !== undefined) {
    const path = parseJsonPath(operation.path);
    if (!path.ok) {
      return { ok: false, message: `Invalid JSON path: ${path.message}` };
    }
    return {
      ok: true,
      value: {
        selectorKind: "path",
        selector: operation.path,
        segments: path.segments,
      },
    };
  }

  return { ok: false, message: "jsonExtract requires exactly one JSON selector: pointer or path." };
}

function deriveText(options: {
  text: string;
  sourceLabel: string;
  operation: DeriveOperation;
  prepared: PreparedDeriveOperation;
}): DerivedOutput {
  if (options.operation.kind === "jsonExtract") {
    if (options.prepared.kind !== "json") {
      throw new Error("jsonExtract operation was not prepared with a JSON selector.");
    }
    return deriveJsonExtract({
      text: options.text,
      sourceLabel: options.sourceLabel,
      operation: options.operation,
      prepared: options.prepared.value,
    });
  }

  if (options.operation.kind === "dedupe") {
    return deriveDedupe({
      text: options.text,
      sourceLabel: options.sourceLabel,
      operation: options.operation,
    });
  }

  if (options.operation.kind === "topN") {
    const topNOptions: {
      text: string;
      sourceLabel: string;
      operation: TopNDeriveOperation;
      compiled?: CompiledRegexOperation;
    } = {
      text: options.text,
      sourceLabel: options.sourceLabel,
      operation: options.operation,
    };
    if (options.prepared.kind === "regex") {
      topNOptions.compiled = options.prepared.value;
    }
    return deriveTopN(topNOptions);
  }

  if (options.operation.kind === "extractUrls") {
    return deriveExtractUrls({ text: options.text, sourceLabel: options.sourceLabel, operation: options.operation });
  }

  if (options.operation.kind === "extractCitations") {
    return deriveExtractCitations({ text: options.text, sourceLabel: options.sourceLabel, operation: options.operation });
  }

  if (options.operation.kind === "lineStats") {
    return deriveLineStats({ text: options.text, sourceLabel: options.sourceLabel });
  }

  if (options.operation.kind === "sizeStats") {
    return deriveSizeStats({ text: options.text, sourceLabel: options.sourceLabel });
  }

  if (options.prepared.kind !== "regex") {
    throw new Error(`${options.operation.kind} operation was not prepared with a regex.`);
  }

  if (options.operation.kind === "regexFilter") {
    return deriveRegexFilter({
      text: options.text,
      sourceLabel: options.sourceLabel,
      operation: options.operation,
      compiled: options.prepared.value,
    });
  }
  if (options.operation.kind === "groupByRegex") {
    return deriveGroupByRegex({
      text: options.text,
      sourceLabel: options.sourceLabel,
      operation: options.operation,
      compiled: options.prepared.value,
    });
  }
  return deriveCountMatches({
    text: options.text,
    sourceLabel: options.sourceLabel,
    operation: options.operation,
    compiled: options.prepared.value,
  });
}

function deriveRegexFilter(options: {
  text: string;
  sourceLabel: string;
  operation: RegexFilterDeriveOperation;
  compiled: CompiledRegexOperation;
}): DerivedOutput {
  const lines = splitLines(options.text);
  const contextLines = options.operation.contextLines ?? DEFAULT_CONTEXT_LINES;
  const maxMatches = options.operation.maxMatches ?? DEFAULT_MAX_MATCHES;
  const stats = collectMatches(lines, options.compiled.regex, maxMatches);
  const windows = mergeLineWindows(
    stats.matchedLineNumbers.map((lineNumber) => ({
      start: Math.max(1, lineNumber - contextLines),
      end: Math.min(lines.length, lineNumber + contextLines),
    })),
  );
  const parts = [
    "# freeflow_derive regexFilter",
    `source: ${options.sourceLabel}`,
    `pattern: ${formatPattern(options.compiled)}`,
    `contextLines: ${contextLines}`,
    `maxMatches: ${maxMatches}`,
    `matches: ${stats.matches}`,
    `matchedLines: ${stats.matchedLines}`,
    `truncated: ${stats.truncated}`,
  ];

  for (const window of windows) {
    parts.push("", `@@ source lines ${window.start}-${window.end} @@`);
    for (let lineNumber = window.start; lineNumber <= window.end; lineNumber += 1) {
      parts.push(`${lineNumber}| ${lines[lineNumber - 1] ?? ""}`);
    }
  }

  return {
    text: `${parts.join("\n")}\n`,
    summary: `Derived regexFilter from vaulted ${sourceStreamLabel(options.sourceLabel)} output: ${stats.matches} match(es) across ${stats.matchedLines} line(s).`,
    stats,
  };
}

function deriveCountMatches(options: {
  text: string;
  sourceLabel: string;
  operation: CountMatchesDeriveOperation;
  compiled: CompiledRegexOperation;
}): DerivedOutput {
  const lines = splitLines(options.text);
  const stats = collectMatches(lines, options.compiled.regex);
  const text = [
    "# freeflow_derive countMatches",
    `source: ${options.sourceLabel}`,
    `pattern: ${formatPattern(options.compiled)}`,
    `matches: ${stats.matches}`,
    `matchedLines: ${stats.matchedLines}`,
    "",
  ].join("\n");

  return {
    text,
    summary: `Derived countMatches from vaulted ${sourceStreamLabel(options.sourceLabel)} output: ${stats.matches} match(es) across ${stats.matchedLines} line(s).`,
    stats,
  };
}

function deriveGroupByRegex(options: {
  text: string;
  sourceLabel: string;
  operation: GroupByRegexDeriveOperation;
  compiled: CompiledRegexOperation;
}): DerivedOutput {
  const lines = splitLines(options.text);
  const groupSelector = options.operation.group ?? 1;
  const maxGroups = options.operation.maxGroups ?? DEFAULT_MAX_GROUPS;
  const maxLinesPerGroup = options.operation.maxLinesPerGroup ?? DEFAULT_MAX_LINES_PER_GROUP;
  const groups = new Map<string, { count: number; entries: { lineNumber: number; line: string }[] }>();
  const allGroupKeys = new Set<string>();
  let matchedLines = 0;
  let truncated = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    options.compiled.regex.lastIndex = 0;
    const match = options.compiled.regex.exec(line);
    if (!match) {
      continue;
    }
    if (match[0].length === 0) {
      throw new Error("Regex patterns that produce zero-width matches are not supported.");
    }

    matchedLines += 1;
    const groupKey = matchGroupValue(match, groupSelector, index + 1);
    allGroupKeys.add(groupKey);
    let group = groups.get(groupKey);
    if (!group) {
      if (groups.size >= maxGroups) {
        truncated = true;
        continue;
      }
      group = { count: 0, entries: [] };
      groups.set(groupKey, group);
    }

    group.count += 1;
    if (group.entries.length < maxLinesPerGroup) {
      group.entries.push({ lineNumber: index + 1, line });
    } else {
      truncated = true;
    }
  }

  const parts = [
    "# freeflow_derive groupByRegex",
    `source: ${options.sourceLabel}`,
    `pattern: ${formatPattern(options.compiled)}`,
    `group: ${String(groupSelector)}`,
    `maxGroups: ${maxGroups}`,
    `maxLinesPerGroup: ${maxLinesPerGroup}`,
    `groups: ${allGroupKeys.size}`,
    `returnedGroups: ${groups.size}`,
    `matchedLines: ${matchedLines}`,
    `truncated: ${truncated}`,
  ];

  for (const [groupKey, group] of groups.entries()) {
    parts.push("", `## group: ${groupKey}`, `count: ${group.count}`);
    for (const entry of group.entries) {
      parts.push(`${entry.lineNumber}| ${entry.line}`);
    }
  }

  return {
    text: `${parts.join("\n")}\n`,
    summary: `Derived groupByRegex from vaulted ${sourceStreamLabel(options.sourceLabel)} output: ${allGroupKeys.size} group(s), ${matchedLines} matched line(s).`,
    stats: {
      matches: matchedLines,
      matchedLines,
      matchedLineNumbers: [],
      truncated,
    },
  };
}

function deriveDedupe(options: {
  text: string;
  sourceLabel: string;
  operation: DedupeDeriveOperation;
}): DerivedOutput {
  const lines = splitLines(options.text);
  const trim = options.operation.trim ?? false;
  const caseSensitive = options.operation.caseSensitive ?? true;
  const maxLines = options.operation.maxLines ?? DEFAULT_MAX_DEDUPE_LINES;
  const seen = new Set<string>();
  const uniqueEntries: { lineNumber: number; line: string }[] = [];
  let duplicatesRemoved = 0;
  let truncated = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const displayLine = trim ? line.trim() : line;
    const key = caseSensitive ? displayLine : displayLine.toLowerCase();
    if (seen.has(key)) {
      duplicatesRemoved += 1;
      continue;
    }
    seen.add(key);
    if (uniqueEntries.length < maxLines) {
      uniqueEntries.push({ lineNumber: index + 1, line: displayLine });
    } else {
      truncated = true;
    }
  }

  const parts = [
    "# freeflow_derive dedupe",
    `source: ${options.sourceLabel}`,
    `trim: ${trim}`,
    `caseSensitive: ${caseSensitive}`,
    `maxLines: ${maxLines}`,
    `inputLines: ${lines.length}`,
    `uniqueLines: ${seen.size}`,
    `returnedLines: ${uniqueEntries.length}`,
    `duplicatesRemoved: ${duplicatesRemoved}`,
    `truncated: ${truncated}`,
    "",
  ];

  for (const entry of uniqueEntries) {
    parts.push(`${entry.lineNumber}| ${entry.line}`);
  }

  return {
    text: `${parts.join("\n")}\n`,
    summary: `Derived dedupe from vaulted ${sourceStreamLabel(options.sourceLabel)} output: ${seen.size} unique line(s), ${duplicatesRemoved} duplicate line(s) removed.`,
    stats: {
      matches: seen.size,
      matchedLines: seen.size,
      matchedLineNumbers: uniqueEntries.map((entry) => entry.lineNumber),
      truncated,
    },
  };
}

function deriveTopN(options: {
  text: string;
  sourceLabel: string;
  operation: TopNDeriveOperation;
  compiled?: CompiledRegexOperation;
}): DerivedOutput {
  const lines = splitLines(options.text);
  const sort = options.operation.sort ?? "text";
  const order = options.operation.order ?? "asc";
  const groupSelector = options.operation.group ?? 0;
  const scored: { lineNumber: number; line: string; score: string | number }[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    let scoreText = line;
    if (options.compiled !== undefined) {
      options.compiled.regex.lastIndex = 0;
      const match = options.compiled.regex.exec(line);
      if (!match) {
        continue;
      }
      if (match[0].length === 0) {
        throw new Error("Regex patterns that produce zero-width matches are not supported.");
      }
      scoreText = matchGroupValue(match, groupSelector, index + 1);
    }

    const score = sort === "numeric" ? Number(scoreText) : scoreText;
    if (sort === "numeric" && (typeof score !== "number" || !Number.isFinite(score))) {
      throw new Error(`topN numeric score on source line ${index + 1} is not finite: ${scoreText}`);
    }
    scored.push({ lineNumber: index + 1, line, score });
  }

  const sorted = [...scored].sort((left, right) => compareTopNEntries(left, right, sort, order));
  const selected = sorted.slice(0, options.operation.limit);
  const parts = [
    "# freeflow_derive topN",
    `source: ${options.sourceLabel}`,
    ...(options.compiled !== undefined ? [`pattern: ${formatPattern(options.compiled)}`, `group: ${String(groupSelector)}`] : []),
    `sort: ${sort}`,
    `order: ${order}`,
    `limit: ${options.operation.limit}`,
    `matchedLines: ${scored.length}`,
    `returnedLines: ${selected.length}`,
    `truncated: ${selected.length < scored.length}`,
    "",
  ];

  for (const entry of selected) {
    parts.push(`${entry.lineNumber}| score=${String(entry.score)} | ${entry.line}`);
  }

  return {
    text: `${parts.join("\n")}\n`,
    summary: `Derived topN from vaulted ${sourceStreamLabel(options.sourceLabel)} output: returned ${selected.length} of ${scored.length} matched line(s).`,
    stats: {
      matches: selected.length,
      matchedLines: scored.length,
      matchedLineNumbers: selected.map((entry) => entry.lineNumber),
      truncated: selected.length < scored.length,
    },
  };
}

function deriveExtractUrls(options: {
  text: string;
  sourceLabel: string;
  operation: ExtractUrlsDeriveOperation;
}): DerivedOutput {
  const maxMatches = options.operation.maxMatches ?? DEFAULT_MAX_EXTRACT_MATCHES;
  const dedupe = options.operation.dedupe ?? false;
  const lines = splitLines(options.text);
  const seen = new Set<string>();
  const entries: { lineNumber: number; url: string }[] = [];
  let matches = 0;
  let truncated = false;

  lineLoop: for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    URL_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = URL_PATTERN.exec(line)) !== null) {
      const rawUrl = match[0];
      const url = trimUrl(rawUrl);
      if (url.length === 0) {
        continue;
      }
      matches += 1;
      if (!dedupe || !seen.has(url)) {
        seen.add(url);
        entries.push({ lineNumber: index + 1, url });
      }
      if (matches >= maxMatches) {
        truncated = index < lines.length - 1 || URL_PATTERN.lastIndex < line.length;
        break lineLoop;
      }
    }
  }

  const parts = [
    "# freeflow_derive extractUrls",
    `source: ${options.sourceLabel}`,
    `dedupe: ${dedupe}`,
    `maxMatches: ${maxMatches}`,
    `matches: ${matches}`,
    `returnedUrls: ${entries.length}`,
    `truncated: ${truncated}`,
    "",
  ];

  for (const entry of entries) {
    parts.push(`${entry.lineNumber}| ${entry.url}`);
  }

  return {
    text: `${parts.join("\n")}\n`,
    summary: `Derived extractUrls from vaulted ${sourceStreamLabel(options.sourceLabel)} output: ${entries.length} URL(s) returned from ${matches} match(es).`,
    stats: {
      matches: entries.length,
      matchedLines: new Set(entries.map((entry) => entry.lineNumber)).size,
      matchedLineNumbers: entries.map((entry) => entry.lineNumber),
      truncated,
    },
  };
}

function deriveExtractCitations(options: {
  text: string;
  sourceLabel: string;
  operation: ExtractCitationsDeriveOperation;
}): DerivedOutput {
  const maxMatches = options.operation.maxMatches ?? DEFAULT_MAX_EXTRACT_MATCHES;
  const lines = splitLines(options.text);
  const entries: { lineNumber: number; type: string; label: string; target?: string }[] = [];
  let truncated = false;

  lineLoop: for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const lineEntries = citationEntriesForLine(line, index + 1);
    for (let entryIndex = 0; entryIndex < lineEntries.length; entryIndex += 1) {
      const entry = lineEntries[entryIndex];
      if (entry === undefined) {
        continue;
      }
      entries.push(entry);
      if (entries.length >= maxMatches) {
        truncated = entryIndex < lineEntries.length - 1 || index < lines.length - 1;
        break lineLoop;
      }
    }
  }

  const parts = [
    "# freeflow_derive extractCitations",
    `source: ${options.sourceLabel}`,
    `maxMatches: ${maxMatches}`,
    `citations: ${entries.length}`,
    `truncated: ${truncated}`,
    "",
  ];

  for (const entry of entries) {
    parts.push(
      entry.target === undefined
        ? `${entry.lineNumber}| ${entry.type} | ${entry.label}`
        : `${entry.lineNumber}| ${entry.type} | ${entry.label} | ${entry.target}`,
    );
  }

  return {
    text: `${parts.join("\n")}\n`,
    summary: `Derived extractCitations from vaulted ${sourceStreamLabel(options.sourceLabel)} output: ${entries.length} citation(s) returned.`,
    stats: {
      matches: entries.length,
      matchedLines: new Set(entries.map((entry) => entry.lineNumber)).size,
      matchedLineNumbers: entries.map((entry) => entry.lineNumber),
      truncated,
    },
  };
}

function deriveLineStats(options: { text: string; sourceLabel: string }): DerivedOutput {
  const lines = splitLines(options.text);
  let blankLines = 0;
  let maxLineBytes = 0;
  let maxLineNumber = 0;

  lines.forEach((line, index) => {
    if (line.trim().length === 0) {
      blankLines += 1;
    }
    const lineBytes = byteLength(line);
    if (lineBytes > maxLineBytes) {
      maxLineBytes = lineBytes;
      maxLineNumber = index + 1;
    }
  });

  const nonEmptyLines = lines.length - blankLines;
  const text = [
    "# freeflow_derive lineStats",
    `source: ${options.sourceLabel}`,
    `lines: ${lines.length}`,
    `nonEmptyLines: ${nonEmptyLines}`,
    `blankLines: ${blankLines}`,
    `maxLineBytes: ${maxLineBytes}`,
    `maxLineNumber: ${maxLineNumber}`,
    "",
  ].join("\n");

  return {
    text,
    summary: `Derived lineStats from vaulted ${sourceStreamLabel(options.sourceLabel)} output: ${lines.length} line(s), ${nonEmptyLines} non-empty, ${blankLines} blank.`,
    stats: {
      matches: lines.length,
      matchedLines: lines.length,
      matchedLineNumbers: [],
      truncated: false,
    },
  };
}

function deriveSizeStats(options: { text: string; sourceLabel: string }): DerivedOutput {
  const bytes = byteLength(options.text);
  const utf16CodeUnits = options.text.length;
  const codePoints = Array.from(options.text).length;
  const lines = countLines(options.text);
  const hash = hashText(options.text);
  const text = [
    "# freeflow_derive sizeStats",
    `source: ${options.sourceLabel}`,
    `bytes: ${bytes}`,
    `utf16CodeUnits: ${utf16CodeUnits}`,
    `codePoints: ${codePoints}`,
    `lines: ${lines}`,
    `sha256: ${hash}`,
    "",
  ].join("\n");

  return {
    text,
    summary: `Derived sizeStats from vaulted ${sourceStreamLabel(options.sourceLabel)} output: ${bytes} byte(s), ${utf16CodeUnits} code unit(s), ${lines} line(s).`,
    stats: {
      matches: bytes,
      matchedLines: lines,
      matchedLineNumbers: [],
      truncated: false,
    },
  };
}

function deriveJsonExtract(options: {
  text: string;
  sourceLabel: string;
  operation: JsonExtractDeriveOperation;
  prepared: PreparedJsonExtractOperation;
}): DerivedOutput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(options.text) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON source for jsonExtract: ${errorMessage(error)}`);
  }

  const resolved = resolveJsonSelector(parsed, options.prepared.segments);
  if (!resolved.ok) {
    throw new Error(`JSON selector ${options.prepared.selector} did not resolve: ${resolved.message}`);
  }

  const valueType = jsonValueType(resolved.value);
  const valueText = `${JSON.stringify(resolved.value, null, 2)}\n`;
  const text = [
    "# freeflow_derive jsonExtract",
    `source: ${options.sourceLabel}`,
    `selectorKind: ${options.prepared.selectorKind}`,
    `selector: ${options.prepared.selector}`,
    `valueType: ${valueType}`,
    "",
    valueText,
  ].join("\n");

  return {
    text,
    summary: `Derived jsonExtract from vaulted ${sourceStreamLabel(options.sourceLabel)} output using ${options.prepared.selectorKind} ${options.prepared.selector}.`,
    stats: {
      matches: 1,
      matchedLines: 1,
      matchedLineNumbers: [],
      truncated: false,
    },
  };
}

function collectMatches(lines: readonly string[], regex: RegExp, maxMatches?: number): MatchStats {
  let matches = 0;
  let truncated = false;
  const matchedLineNumbers: number[] = [];

  lineLoop: for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    let lineMatches = 0;
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      if (match[0].length === 0) {
        throw new Error("Regex patterns that produce zero-width matches are not supported.");
      }
      lineMatches += 1;
      matches += 1;
      if (maxMatches !== undefined && matches >= maxMatches) {
        truncated = index < lines.length - 1 || regex.lastIndex < line.length;
        break;
      }
    }
    if (lineMatches > 0) {
      matchedLineNumbers.push(index + 1);
    }
    if (maxMatches !== undefined && matches >= maxMatches) {
      break lineLoop;
    }
  }

  return {
    matches,
    matchedLines: matchedLineNumbers.length,
    matchedLineNumbers,
    truncated,
  };
}

function mergeLineWindows(windows: { start: number; end: number }[]): { start: number; end: number }[] {
  const sorted = windows
    .filter((window) => window.start <= window.end)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: { start: number; end: number }[] = [];

  for (const window of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || window.start > previous.end + 1) {
      merged.push({ ...window });
    } else {
      previous.end = Math.max(previous.end, window.end);
    }
  }

  return merged;
}

function routeDerivedText(options: {
  outputId: string;
  text: string;
  preserve: PreserveMode;
  thresholds: RouterThresholds;
  source: Extract<SourceRef, { kind: "vault" }>;
  operationKind: string;
}): { routingStatus: "routed" | "partial"; reason: string; evidence: EvidencePacket[] } {
  const caps =
    options.preserve === "full"
      ? {
          maxLines: Number.MAX_SAFE_INTEGER,
          maxExcerptBytes: options.thresholds.largeOutputBytes,
          maxLineBytes: options.thresholds.largeOutputBytes,
        }
      : {
          maxLines: options.thresholds.largeOutputLines,
          maxExcerptBytes: options.thresholds.largeOutputBytes,
          maxLineBytes: options.thresholds.largeOutputBytes,
        };
  const bounded = assembleTextEvidence({ stream: "combined", text: options.text, caps });
  const outputBytes = byteLength(options.text);
  const outputLines = countLines(options.text);
  const routingStatus = bounded.compressed || bounded.fidelity === "lossy" ? "partial" : "routed";
  const sourceLabel = `${options.source.outputId}:${options.source.stream ?? "combined"}`;
  const evidence = bounded.importantLines.map((line, index): EvidencePacket => ({
    id: evidenceId(options.outputId, line.lines, index),
    source: { kind: "vault", outputId: options.outputId, stream: "raw" },
    path: `${options.outputId}:raw`,
    lines: line.lines,
    excerpt: line.excerpt,
    why:
      routingStatus === "partial"
        ? `Bounded derived ${options.operationKind} output from source ${sourceLabel}; exact derived content is recoverable from the vault and source lineage is preserved.`
        : `Derived exact ${options.operationKind} output from source ${sourceLabel} within routing caps; source lineage is preserved.`,
    window: routingStatus === "partial" ? "small" : "exact",
    expandable: true,
  }));

  return {
    routingStatus,
    reason:
      routingStatus === "partial"
        ? `Derived output from operation ${options.operationKind} over source ${sourceLabel} (${outputBytes} bytes, ${outputLines} lines) was vaulted; bounded evidence was returned with exact recovery.`
        : `Derived output from operation ${options.operationKind} over source ${sourceLabel} (${outputBytes} bytes, ${outputLines} lines) was vaulted and returned within routing caps.`,
    evidence,
  };
}

function citationEntriesForLine(
  line: string,
  lineNumber: number,
): { lineNumber: number; type: string; label: string; target?: string }[] {
  const entries: { lineNumber: number; type: string; label: string; target?: string }[] = [];

  const inlineLinkPattern = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/gi;
  let inlineMatch: RegExpExecArray | null;
  while ((inlineMatch = inlineLinkPattern.exec(line)) !== null) {
    const label = inlineMatch[1];
    const target = inlineMatch[2];
    if (label !== undefined && target !== undefined) {
      entries.push({ lineNumber, type: "markdown-link", label, target: trimUrl(target) });
    }
  }

  const citeKeyPattern = /\[@([A-Za-z0-9_.:#-]+)\]/g;
  let citeKeyMatch: RegExpExecArray | null;
  while ((citeKeyMatch = citeKeyPattern.exec(line)) !== null) {
    const label = citeKeyMatch[1];
    if (label !== undefined) {
      entries.push({ lineNumber, type: "citekey", label });
    }
  }

  const footnote = /^\s*\[\^([^\]\n]+)\]:\s*(.+?)\s*$/.exec(line);
  if (footnote?.[1] !== undefined && footnote[2] !== undefined) {
    entries.push({ lineNumber, type: "footnote", label: footnote[1], target: footnote[2] });
  }

  const reference = /^\s*\[([^\]^][^\]\n]*)\]:\s*(.+?)\s*$/.exec(line);
  if (reference?.[1] !== undefined && reference[2] !== undefined) {
    entries.push({ lineNumber, type: "reference", label: reference[1], target: reference[2] });
  }

  return entries;
}

function trimUrl(url: string): string {
  return url.replace(/[.,;:!?]+$/g, "");
}

function matchGroupValue(match: RegExpExecArray, group: number | string, lineNumber: number): string {
  if (typeof group === "number") {
    const value = match[group];
    if (value === undefined) {
      throw new Error(`Regex group ${group} did not resolve on source line ${lineNumber}.`);
    }
    return value;
  }

  const value = match.groups?.[group];
  if (value === undefined) {
    throw new Error(`Regex group ${group} did not resolve on source line ${lineNumber}.`);
  }
  return value;
}

function compareTopNEntries(
  left: { lineNumber: number; score: string | number },
  right: { lineNumber: number; score: string | number },
  sort: "text" | "numeric",
  order: "asc" | "desc",
): number {
  let comparison: number;
  if (sort === "numeric") {
    comparison = (left.score as number) - (right.score as number);
  } else {
    const leftText = String(left.score);
    const rightText = String(right.score);
    comparison = leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
  }

  if (comparison !== 0) {
    return order === "desc" ? -comparison : comparison;
  }

  return left.lineNumber - right.lineNumber;
}

function parseJsonPointer(
  pointer: string,
): { ok: true; segments: JsonSelectorSegment[] } | { ok: false; message: string } {
  if (pointer === "") {
    return { ok: true, segments: [] };
  }

  if (!pointer.startsWith("/")) {
    return { ok: false, message: "JSON pointer must be empty or start with /." };
  }

  const segments: JsonSelectorSegment[] = [];
  for (const rawSegment of pointer.slice(1).split("/")) {
    if (/~(?![01])/.test(rawSegment)) {
      return { ok: false, message: "JSON pointer contains an invalid escape; use ~0 for ~ and ~1 for /." };
    }
    segments.push({ kind: "property", key: rawSegment.replace(/~1/g, "/").replace(/~0/g, "~") });
  }
  return { ok: true, segments };
}

function parseJsonPath(path: string): { ok: true; segments: JsonSelectorSegment[] } | { ok: false; message: string } {
  if (path.length === 0 || path[0] !== "$") {
    return { ok: false, message: "JSON path must start with $." };
  }

  const segments: JsonSelectorSegment[] = [];
  let index = 1;

  while (index < path.length) {
    const char = path[index];
    if (char === ".") {
      const parsed = parseJsonPathProperty(path, index + 1);
      if (!parsed.ok) {
        return parsed;
      }
      segments.push({ kind: "property", key: parsed.key });
      index = parsed.nextIndex;
      continue;
    }

    if (char === "[") {
      const parsed = parseJsonPathBracket(path, index + 1);
      if (!parsed.ok) {
        return parsed;
      }
      segments.push(parsed.segment);
      index = parsed.nextIndex;
      continue;
    }

    return { ok: false, message: `Unexpected token ${char} at offset ${index}.` };
  }

  return { ok: true, segments };
}

function parseJsonPathProperty(
  path: string,
  startIndex: number,
): { ok: true; key: string; nextIndex: number } | { ok: false; message: string } {
  const match = /^[A-Za-z_$][A-Za-z0-9_$-]*/.exec(path.slice(startIndex));
  if (!match?.[0]) {
    return { ok: false, message: `Expected property name after . at offset ${startIndex - 1}.` };
  }
  return { ok: true, key: match[0], nextIndex: startIndex + match[0].length };
}

function parseJsonPathBracket(
  path: string,
  startIndex: number,
): { ok: true; segment: JsonSelectorSegment; nextIndex: number } | { ok: false; message: string } {
  const first = path[startIndex];
  if (first === '"') {
    return parseJsonPathQuotedProperty(path, startIndex);
  }
  if (first === "'") {
    return { ok: false, message: `Use double-quoted bracket properties at offset ${startIndex}.` };
  }

  const closeIndex = path.indexOf("]", startIndex);
  if (closeIndex === -1) {
    return { ok: false, message: `Expected ] for bracket selector at offset ${startIndex - 1}.` };
  }
  const indexText = path.slice(startIndex, closeIndex);
  if (!/^(0|[1-9][0-9]*)$/.test(indexText)) {
    return { ok: false, message: `Expected non-negative array index in bracket selector at offset ${startIndex - 1}.` };
  }
  return { ok: true, segment: { kind: "index", index: Number(indexText) }, nextIndex: closeIndex + 1 };
}

function parseJsonPathQuotedProperty(
  path: string,
  quoteIndex: number,
): { ok: true; segment: JsonSelectorSegment; nextIndex: number } | { ok: false; message: string } {
  let escaped = false;
  for (let index = quoteIndex + 1; index < path.length; index += 1) {
    const char = path[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      if (path[index + 1] !== "]") {
        return { ok: false, message: `Expected ] after quoted property at offset ${index}.` };
      }
      const literal = path.slice(quoteIndex, index + 1);
      try {
        const key = JSON.parse(literal) as unknown;
        if (typeof key !== "string") {
          return { ok: false, message: "Expected quoted JSON path property to decode to a string." };
        }
        return { ok: true, segment: { kind: "property", key }, nextIndex: index + 2 };
      } catch (error) {
        return { ok: false, message: `Invalid quoted property string: ${errorMessage(error)}` };
      }
    }
  }

  return { ok: false, message: `Unterminated quoted property at offset ${quoteIndex}.` };
}

function resolveJsonSelector(value: unknown, segments: readonly JsonSelectorSegment[]): { ok: true; value: unknown } | { ok: false; message: string } {
  let current = value;

  for (const segment of segments) {
    if (segment.kind === "index") {
      if (!Array.isArray(current)) {
        return { ok: false, message: `array index ${segment.index} cannot be applied to ${jsonValueType(current)}.` };
      }
      if (segment.index >= current.length) {
        return { ok: false, message: `array index ${segment.index} is outside length ${current.length}.` };
      }
      current = current[segment.index];
      continue;
    }

    if (Array.isArray(current)) {
      if (!isArrayIndexSegment(segment.key)) {
        return { ok: false, message: `array source requires numeric pointer segment, got ${segment.key}.` };
      }
      const arrayIndex = Number(segment.key);
      if (arrayIndex >= current.length) {
        return { ok: false, message: `array index ${arrayIndex} is outside length ${current.length}.` };
      }
      current = current[arrayIndex];
      continue;
    }

    if (!isJsonObject(current)) {
      return { ok: false, message: `property ${segment.key} cannot be applied to ${jsonValueType(current)}.` };
    }
    if (!Object.prototype.hasOwnProperty.call(current, segment.key)) {
      return { ok: false, message: `property ${segment.key} is not present.` };
    }
    current = current[segment.key];
  }

  return { ok: true, value: current };
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isArrayIndexSegment(value: string): boolean {
  return /^(0|[1-9][0-9]*)$/.test(value);
}

function jsonValueType(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}

function resolveSourceStream(
  record: VaultRecord,
  requested: OutputStream | undefined,
): { ok: true; stream: OutputStream } | { ok: false; message: string } {
  if (record.kind === "command") {
    const stream = requested ?? "combined";
    if (stream === "raw") {
      return { ok: false, message: "Command vault sources support stdout, stderr, or combined streams, not raw." };
    }
    return { ok: true, stream };
  }

  if (record.kind === "text") {
    const stream = requested ?? "raw";
    if (stream !== "raw") {
      return { ok: false, message: "Text vault sources support only the raw stream." };
    }
    return { ok: true, stream };
  }

  return { ok: false, message: "Repo file reference vault records store metadata only and cannot be used as derive text sources." };
}

function lineageForSource(record: VaultRecord, operation: DeriveOperation): EvidenceLineage {
  return {
    sourceRecordIds: [record.recordId],
    sourceOutputIds: [record.outputId],
    operation: operation.kind,
    operationHash: operationHash(operation),
  };
}

function lineageFromInput(input: unknown): EvidenceLineage | undefined {
  if (!isRecord(input) || !isRecord(input.source)) {
    return undefined;
  }

  const lineage: EvidenceLineage = {};
  if (typeof input.source.outputId === "string") {
    lineage.sourceOutputIds = [input.source.outputId];
  }
  if (isRecord(input.operation) && typeof input.operation.kind === "string") {
    lineage.operation = input.operation.kind;
  }
  return Object.keys(lineage).length > 0 ? lineage : undefined;
}

function operationSummary(operation: DeriveOperation): Record<string, unknown> {
  if (operation.kind === "regexFilter") {
    return {
      kind: operation.kind,
      pattern: operation.pattern,
      ...(operation.flags !== undefined ? { flags: normalizeRegexFlags(operation.flags) } : {}),
      contextLines: operation.contextLines ?? DEFAULT_CONTEXT_LINES,
      maxMatches: operation.maxMatches ?? DEFAULT_MAX_MATCHES,
    };
  }

  if (operation.kind === "countMatches") {
    return {
      kind: operation.kind,
      pattern: operation.pattern,
      ...(operation.flags !== undefined ? { flags: normalizeRegexFlags(operation.flags) } : {}),
    };
  }

  if (operation.kind === "groupByRegex") {
    return {
      kind: operation.kind,
      pattern: operation.pattern,
      ...(operation.flags !== undefined ? { flags: normalizeRegexFlags(operation.flags) } : {}),
      group: operation.group ?? 1,
      maxGroups: operation.maxGroups ?? DEFAULT_MAX_GROUPS,
      maxLinesPerGroup: operation.maxLinesPerGroup ?? DEFAULT_MAX_LINES_PER_GROUP,
    };
  }

  if (operation.kind === "dedupe") {
    return {
      kind: operation.kind,
      trim: operation.trim ?? false,
      caseSensitive: operation.caseSensitive ?? true,
      maxLines: operation.maxLines ?? DEFAULT_MAX_DEDUPE_LINES,
    };
  }

  if (operation.kind === "topN") {
    return {
      kind: operation.kind,
      limit: operation.limit,
      ...(operation.pattern !== undefined ? { pattern: operation.pattern } : {}),
      ...(operation.flags !== undefined ? { flags: normalizeRegexFlags(operation.flags) } : {}),
      ...(operation.group !== undefined ? { group: operation.group } : {}),
      sort: operation.sort ?? "text",
      order: operation.order ?? "asc",
    };
  }

  if (operation.kind === "extractUrls") {
    return {
      kind: operation.kind,
      dedupe: operation.dedupe ?? false,
      maxMatches: operation.maxMatches ?? DEFAULT_MAX_EXTRACT_MATCHES,
    };
  }

  if (operation.kind === "extractCitations") {
    return {
      kind: operation.kind,
      maxMatches: operation.maxMatches ?? DEFAULT_MAX_EXTRACT_MATCHES,
    };
  }

  if (operation.kind === "lineStats" || operation.kind === "sizeStats") {
    return { kind: operation.kind };
  }

  return {
    kind: operation.kind,
    ...(operation.pointer !== undefined ? { pointer: operation.pointer } : {}),
    ...(operation.path !== undefined ? { path: operation.path } : {}),
  };
}

function operationHash(operation: DeriveOperation): string {
  return `sha256_${hash(JSON.stringify(operationSummary(operation)))}`;
}

function normalizeRegexFlags(flags: string | undefined): string {
  return [...new Set((flags ?? "").replace(/g/g, "").split(""))].sort().join("");
}

function ensureGlobalFlag(flags: string): string {
  return flags.includes("g") ? flags : `${flags}g`;
}

function formatPattern(compiled: CompiledRegexOperation): string {
  return `/${compiled.displayPattern}/${compiled.flags}`;
}

function sourceStreamLabel(sourceLabel: string): string {
  const [, stream] = sourceLabel.split(":");
  return stream ?? "combined";
}

function deriveValidationFailureWithOptionalLineage(options: {
  message: string;
  preserve: PreserveMode;
  lineage: EvidenceLineage | undefined;
  decisionSeed: string;
}): FailureRoutedResult {
  const failureOptions = {
    message: options.message,
    preserve: options.preserve,
    decisionSeed: options.decisionSeed,
  };
  if (options.lineage !== undefined) {
    return deriveValidationFailure({ ...failureOptions, lineage: options.lineage });
  }
  return deriveValidationFailure(failureOptions);
}

function deriveSourceUnavailableFailureWithOptionalLineage(options: {
  message: string;
  preserve: PreserveMode;
  lineage: EvidenceLineage | undefined;
  decisionSeed: string;
}): FailureRoutedResult {
  const failureOptions = {
    message: options.message,
    preserve: options.preserve,
    decisionSeed: options.decisionSeed,
  };
  if (options.lineage !== undefined) {
    return deriveSourceUnavailableFailure({ ...failureOptions, lineage: options.lineage });
  }
  return deriveSourceUnavailableFailure(failureOptions);
}

function validationMessage(issues: readonly DeriveValidationIssue[]): string {
  return `Invalid derive input: ${issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`;
}

function isOutputStream(value: unknown): value is OutputStream {
  return value === "stdout" || value === "stderr" || value === "combined" || value === "raw";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function evidenceId(outputId: string, lines: string, index: number): string {
  return `ev_${hash(`${outputId}:${lines}:${index}`).slice(0, 16)}`;
}

function decisionId(...parts: string[]): string {
  return `ffdec_${hash(parts.join("\0")).slice(0, 16)}`;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
