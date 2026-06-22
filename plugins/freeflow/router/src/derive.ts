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

export type DeriveOperation = RegexFilterDeriveOperation | CountMatchesDeriveOperation;

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
const OPERATION_KINDS = new Set(["regexFilter", "countMatches"]);
const REGEX_FLAGS = new Set(["g", "i", "m", "s", "u"]);
const DEFAULT_CONTEXT_LINES = 0;
const DEFAULT_MAX_MATCHES = 50;
const MAX_CONTEXT_LINES = 20;
const MAX_MATCHES = 1_000;

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
  const compiled = compileRegexOperation(operation);
  if (!compiled.ok) {
    return deriveValidationFailureWithOptionalLineage({
      message: compiled.message,
      preserve,
      lineage: lineageFromInput(inputValidation.value),
      decisionSeed: "regex-validation",
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
      compiled: compiled.value,
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
    issues.push({ path: `${path}.kind`, message: "Expected derive operation kind regexFilter or countMatches." });
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
  } else {
    for (const key of ["contextLines", "maxMatches"] as const) {
      if (value[key] !== undefined) {
        issues.push({ path: `${path}.${key}`, message: `Operation ${value.kind} does not accept ${key}.` });
      }
    }
  }
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

function compileRegexOperation(
  operation: DeriveOperation,
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

function deriveText(options: {
  text: string;
  sourceLabel: string;
  operation: DeriveOperation;
  compiled: CompiledRegexOperation;
}): DerivedOutput {
  if (options.operation.kind === "regexFilter") {
    return deriveRegexFilter({
      text: options.text,
      sourceLabel: options.sourceLabel,
      operation: options.operation,
      compiled: options.compiled,
    });
  }
  return deriveCountMatches({
    text: options.text,
    sourceLabel: options.sourceLabel,
    operation: options.operation,
    compiled: options.compiled,
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

  return {
    kind: operation.kind,
    pattern: operation.pattern,
    ...(operation.flags !== undefined ? { flags: normalizeRegexFlags(operation.flags) } : {}),
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
