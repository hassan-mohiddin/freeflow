import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_ROUTER_THRESHOLDS, DEFAULT_SCRIPT_TRANSFORM_CONFIG, MAX_SCRIPT_TRANSFORM_LIMITS, SCRIPT_TRANSFORM_LANGUAGES } from "../config/config.js";
import { assembleTextEvidence, byteLength, countLines, splitLines } from "../evidence/evidence.js";
import { selectScriptSandboxAdapter } from "../sandbox/script-sandbox.js";
import {
  transformAdapterUnavailableFailure,
  transformSourceUnavailableFailure,
  transformValidationFailure,
  transformExecutionFailure,
  scriptTransformDisabledFailure,
  storageFailure,
} from "../evidence/failure-contracts.js";
import { createVault, readOutputText, readVaultRecord, storeTextOutput } from "../vault/vault.js";
import type {
  TransformRoutedResult,
  EvidenceLineage,
  FailureRoutedResult,
  EvidencePacket,
  OutputStream,
  PreserveMode,
  RouterThresholds,
  ScriptTransformConfig,
  ScriptTransformLanguage,
  SourceRef,
  VaultRecord,
  VaultRetentionPolicy,
} from "../config/types.js";
import type { ScriptSandboxAdapter, ScriptSandboxExecutionResult, ScriptSandboxSourceMount } from "../sandbox/script-sandbox.js";

export interface TransformVaultSourceInput {
  kind: "vault";
  outputId: string;
  stream?: OutputStream;
}

export type TransformSourceInput = TransformVaultSourceInput;

export interface ScriptTransformSourceInput extends TransformVaultSourceInput {
  alias: string;
}

export interface ScriptTransformLimitsInput {
  timeoutMs?: number;
  maxInputBytes?: number;
  maxOutputBytes?: number;
}

export interface RegexFilterTransformOperation {
  kind: "regexFilter";
  pattern: string;
  flags?: string;
  contextLines?: number;
  maxMatches?: number;
}

export interface CountMatchesTransformOperation {
  kind: "countMatches";
  pattern: string;
  flags?: string;
}

export interface JsonExtractTransformOperation {
  kind: "jsonExtract";
  pointer?: string;
  path?: string;
}

export interface GroupByRegexTransformOperation {
  kind: "groupByRegex";
  pattern: string;
  flags?: string;
  group?: number | string;
  maxGroups?: number;
  maxLinesPerGroup?: number;
}

export interface DedupeTransformOperation {
  kind: "dedupe";
  trim?: boolean;
  caseSensitive?: boolean;
  maxLines?: number;
}

export interface TopNTransformOperation {
  kind: "topN";
  limit: number;
  pattern?: string;
  flags?: string;
  group?: number | string;
  sort?: "text" | "numeric";
  order?: "asc" | "desc";
}

export interface ExtractUrlsTransformOperation {
  kind: "extractUrls";
  dedupe?: boolean;
  maxMatches?: number;
}

export interface ExtractCitationsTransformOperation {
  kind: "extractCitations";
  maxMatches?: number;
}

export interface LineStatsTransformOperation {
  kind: "lineStats";
}

export interface SizeStatsTransformOperation {
  kind: "sizeStats";
}

export interface ScriptTransformOperation {
  kind: "script";
  language: ScriptTransformLanguage;
  code: string;
  label?: string;
}

type RegexTransformOperation = RegexFilterTransformOperation | CountMatchesTransformOperation | GroupByRegexTransformOperation | TopNTransformOperation;
type RegexPatternTransformOperation = RegexFilterTransformOperation | CountMatchesTransformOperation | GroupByRegexTransformOperation | (TopNTransformOperation & { pattern: string });
export type DeterministicTransformOperation =
  | RegexFilterTransformOperation
  | CountMatchesTransformOperation
  | JsonExtractTransformOperation
  | GroupByRegexTransformOperation
  | DedupeTransformOperation
  | TopNTransformOperation
  | ExtractUrlsTransformOperation
  | ExtractCitationsTransformOperation
  | LineStatsTransformOperation
  | SizeStatsTransformOperation;

export type TransformOperation = DeterministicTransformOperation | ScriptTransformOperation;

export interface DeterministicTransformInput {
  source: TransformSourceInput;
  operation: DeterministicTransformOperation;
  preserve?: PreserveMode;
}

export interface ScriptTransformInput {
  sources: ScriptTransformSourceInput[];
  operation: ScriptTransformOperation;
  limits?: ScriptTransformLimitsInput;
  preserve?: PreserveMode;
}

export type TransformInput = DeterministicTransformInput | ScriptTransformInput;

export type FreeflowTransformOptions = TransformInput & {
  sessionId: string;
  vaultRoot?: string;
  vaultRetention?: VaultRetentionPolicy;
  thresholds?: Partial<RouterThresholds>;
  scriptTransform?: ScriptTransformConfig;
  scriptSandboxAdapters?: readonly ScriptSandboxAdapter[];
};

export const TRANSFORM_ENGINE_IMPLEMENTATION = "shared-transform-engine-v1";

export interface TransformValidationIssue {
  path: string;
  message: string;
}

export type TransformValidationResult =
  | { ok: true; value: TransformInput }
  | { ok: false; issues: TransformValidationIssue[] };

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

type PreparedTransformOperation =
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

interface TransformedOutput {
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
  "script",
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
const SCRIPT_ALIAS_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const MAX_SCRIPT_CODE_BYTES = 256 * 1024;

export function validateTransformInput(value: unknown): TransformValidationResult {
  const issues: TransformValidationIssue[] = [];

  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: "$", message: "Expected transform input object." }] };
  }

  const operationKind = isRecord(value.operation) ? value.operation.kind : undefined;
  validateTransformOperation(value.operation, "$.operation", issues);

  if (operationKind === "script") {
    validateScriptTransformSources(value.sources, "$.sources", issues);
    validateScriptTransformLimits(value.limits, "$.limits", issues);
  } else {
    validateTransformSource(value.source, "$.source", issues);
  }

  if (value.preserve !== undefined && (typeof value.preserve !== "string" || !PRESERVE_MODES.has(value.preserve))) {
    issues.push({ path: "$.preserve", message: "Expected preserve mode summary, important, or full." });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  if (operationKind === "script") {
    const input: ScriptTransformInput = {
      sources: value.sources as ScriptTransformSourceInput[],
      operation: value.operation as ScriptTransformOperation,
    };
    if (value.limits !== undefined) {
      input.limits = value.limits as ScriptTransformLimitsInput;
    }
    if (value.preserve !== undefined) {
      input.preserve = value.preserve as PreserveMode;
    }
    return { ok: true, value: input };
  }

  const input: DeterministicTransformInput = {
    source: value.source as TransformSourceInput,
    operation: value.operation as DeterministicTransformOperation,
  };
  if (value.preserve !== undefined) {
    input.preserve = value.preserve as PreserveMode;
  }
  return { ok: true, value: input };
}

export async function freeflowTransform(options: FreeflowTransformOptions): Promise<TransformRoutedResult | FailureRoutedResult> {
  return executeTransform(options);
}

async function executeTransform(options: FreeflowTransformOptions): Promise<TransformRoutedResult | FailureRoutedResult> {
  const preserve = options.preserve ?? "important";
  const inputValidation = validateTransformInput(options);
  if (!inputValidation.ok) {
    return transformValidationFailureWithOptionalLineage({
      message: validationMessage(inputValidation.issues),
      preserve,
      lineage: lineageFromInput(options),
      decisionSeed: "input-validation",
    });
  }

  if (isScriptTransformInput(inputValidation.value)) {
    return handleScriptTransform({
      input: inputValidation.value,
      options,
      preserve,
    });
  }

  const deterministicInput = inputValidation.value;
  const operation = deterministicInput.operation;
  const prepared = prepareTransformOperation(operation);
  if (!prepared.ok) {
    return transformValidationFailureWithOptionalLineage({
      message: prepared.message,
      preserve,
      lineage: lineageFromInput(deterministicInput),
      decisionSeed: "operation-validation",
    });
  }

  const source = deterministicInput.source;
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
    return transformSourceUnavailableFailureWithOptionalLineage({
      message: `Vault source outputId=${source.outputId} could not be found or read: ${errorMessage(error)}`,
      preserve,
      lineage: lineageFromInput(inputValidation.value),
      decisionSeed: "source-record",
    });
  }

  const streamResult = resolveSourceStream(sourceRecord, source.stream);
  if (!streamResult.ok) {
    return transformValidationFailure({
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
    return transformSourceUnavailableFailure({
      message: `Vault source outputId=${source.outputId} stream=${stream} could not be read: ${errorMessage(error)}`,
      preserve,
      lineage: lineageForSource(sourceRecord, operation),
      decisionSeed: "source-text",
    });
  }

  let transformed: TransformedOutput;
  try {
    transformed = transformText({
      text: sourceText,
      sourceLabel: `${source.outputId}:${stream}`,
      operation,
      prepared: prepared.value,
    });
  } catch (error) {
    return transformExecutionFailure({
      message: `Transform operation ${operation.kind} failed: ${errorMessage(error)}`,
      preserve,
      lineage: lineageForSource(sourceRecord, operation),
      decisionSeed: "transform-execution",
    });
  }

  const producer = { kind: "transform" as const, name: operation.kind };
  const lineage = lineageForSource(sourceRecord, operation);
  let record;
  try {
    record = await storeTextOutput(vault, {
      sessionId: options.sessionId,
      raw: transformed.text,
      sourceKind: "transform",
      producer,
      lineage,
      decisionIds: [decisionId("transform-store", source.outputId, stream, operation.kind, lineage.operationHash ?? "")],
    });
  } catch (error) {
    return storageFailure({
      message: `Transformed output could not be persisted: ${errorMessage(error)}`,
      preserve,
      lineage,
    });
  }

  const routed = routeTransformedText({
    outputId: record.outputId,
    text: transformed.text,
    preserve,
    thresholds,
    source: { kind: "vault", outputId: source.outputId, stream },
    operationKind: operation.kind,
  });

  return {
    toolStatus: "ok",
    decisionId: decisionId("transform", record.outputId, source.outputId, stream, operation.kind, routed.routingStatus),
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
      route: "transform",
      reason: routed.reason,
    },
    summary: transformed.summary,
    evidence: routed.evidence,
    recovery: {
      how: `Use freeflow_search with source.kind=vault and outputId=${record.outputId}, stream=raw, and an exact lineRange to recover exact transformed content. Source evidence remains outputId=${source.outputId} stream=${stream}.`,
      outputId: record.outputId,
    },
  };
}

async function handleScriptTransform(options: {
  input: ScriptTransformInput;
  options: FreeflowTransformOptions;
  preserve: PreserveMode;
}): Promise<TransformRoutedResult | FailureRoutedResult> {
  const config = effectiveScriptTransformConfig(options.options.scriptTransform);
  const limits = effectiveScriptLimits(config, options.input.limits);
  const initialLineage = lineageForScriptInput(options.input, limits);

  if (!config.enabled) {
    return scriptTransformDisabledFailure({
      message: "Script transform is disabled by default. Enable scriptTransform.enabled only after a sandbox adapter has passed capability probes and review. No script code was executed.",
      preserve: options.preserve,
      lineage: initialLineage,
      decisionSeed: "script-transform-disabled",
    });
  }

  const vaultOptions: { root?: string; retention?: VaultRetentionPolicy } = {};
  if (options.options.vaultRoot !== undefined) {
    vaultOptions.root = options.options.vaultRoot;
  }
  if (options.options.vaultRetention !== undefined) {
    vaultOptions.retention = options.options.vaultRetention;
  }
  const vault = createVault(vaultOptions);
  const resolved = await resolveScriptSources({
    vault,
    sessionId: options.options.sessionId,
    sources: options.input.sources,
    maxInputBytes: limits.maxInputBytes,
    operation: options.input.operation,
    preserve: options.preserve,
  });
  if (!resolved.ok) {
    return resolved.failure;
  }

  const adapterSelection = await selectScriptSandboxAdapter(options.input.operation.language, config, options.options.scriptSandboxAdapters ?? []);
  if (!adapterSelection.ok) {
    return transformAdapterUnavailableFailure({
      message: `${adapterSelection.status.reason} No script code was executed.`,
      preserve: options.preserve,
      lineage: lineageForResolvedScriptSources(resolved.sources, options.input, limits),
      decisionSeed: "script-transform-adapter-unavailable",
    });
  }

  const execution = await executeScriptWithAdapter({
    adapter: adapterSelection.adapter,
    input: options.input,
    resolvedSources: resolved.sources,
    limits,
    config,
  });
  const lineage = lineageForResolvedScriptSources(resolved.sources, options.input, limits);
  if (!execution.ok) {
    return transformExecutionFailure({
      message: execution.message,
      preserve: options.preserve,
      lineage,
      decisionSeed: "script-transform-execution",
    });
  }

  const producer = { kind: "transform" as const, name: `script:${options.input.operation.language}` };
  const vaultOptionsForStore: { root?: string; retention?: VaultRetentionPolicy } = {};
  if (options.options.vaultRoot !== undefined) {
    vaultOptionsForStore.root = options.options.vaultRoot;
  }
  if (options.options.vaultRetention !== undefined) {
    vaultOptionsForStore.retention = options.options.vaultRetention;
  }
  const storeVault = createVault(vaultOptionsForStore);
  let record;
  try {
    record = await storeTextOutput(storeVault, {
      sessionId: options.options.sessionId,
      raw: execution.result.stdout,
      sourceKind: "transform",
      producer,
      lineage,
      decisionIds: [decisionId("script-transform-store", options.input.operation.language, lineage.operationHash ?? "")],
    });
  } catch (error) {
    return storageFailure({
      message: `Script-transformed output could not be persisted: ${errorMessage(error)}`,
      preserve: options.preserve,
      lineage,
    });
  }

  const thresholds = { ...DEFAULT_ROUTER_THRESHOLDS, ...options.options.thresholds };
  const primarySource = primaryScriptSourceRef(resolved.sources, options.input.sources);
  const routed = routeTransformedText({
    outputId: record.outputId,
    text: execution.result.stdout,
    preserve: options.preserve,
    thresholds,
    source: primarySource,
    operationKind: "script",
  });

  return {
    toolStatus: "ok",
    decisionId: decisionId("script-transform", record.outputId, options.input.operation.language, routed.routingStatus),
    outputId: record.outputId,
    recordId: record.recordId,
    preserve: options.preserve,
    source: primarySource,
    operation: operationSummary(options.input.operation),
    producer: record.producer,
    persistence: record.persistence,
    lineage,
    routing: {
      status: routed.routingStatus,
      route: "transform",
      reason: routed.reason,
    },
    summary: `Script transform ${options.input.operation.language} completed with ${byteLength(execution.result.stdout)} stdout bytes and ${byteLength(execution.result.stderr)} stderr bytes.`,
    evidence: routed.evidence,
    recovery: {
      how: `Use freeflow_search with source.kind=vault and outputId=${record.outputId}, stream=raw, and an exact lineRange to recover exact script-transformed content. Source evidence remains linked in lineage.sourceOutputIds.`,
      outputId: record.outputId,
    },
  };
}

function primaryScriptSourceRef(resolvedSources: readonly ResolvedScriptSource[], inputSources: readonly ScriptTransformSourceInput[]): Extract<SourceRef, { kind: "vault" }> {
  const resolved = resolvedSources[0];
  if (resolved) {
    return { kind: "vault", outputId: resolved.outputId, stream: resolved.stream };
  }
  const input = inputSources[0];
  if (input?.stream !== undefined) {
    return { kind: "vault", outputId: input.outputId, stream: input.stream };
  }
  return { kind: "vault", outputId: input?.outputId ?? "unknown" };
}

async function executeScriptWithAdapter(options: {
  adapter: ScriptSandboxAdapter;
  input: ScriptTransformInput;
  resolvedSources: readonly ResolvedScriptSource[];
  limits: Required<ScriptTransformLimitsInput>;
  config: ScriptTransformConfig;
}): Promise<{ ok: true; result: ScriptSandboxExecutionResult } | { ok: false; message: string }> {
  const tempRoot = await mkdtemp(join(tmpdir(), "freeflow-script-transform-"));
  const inputDir = join(tempRoot, "input");
  const workDir = join(tempRoot, "work");
  const outputDir = join(tempRoot, "output");
  try {
    await mkdir(inputDir, { recursive: true });
    await mkdir(workDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });
    const mounts: ScriptSandboxSourceMount[] = [];
    for (const source of options.resolvedSources) {
      const path = join(inputDir, `${source.alias}.txt`);
      await writeFile(path, source.text, "utf8");
      mounts.push({ alias: source.alias, path, bytes: source.bytes, sha256: source.textSha256 });
    }
    await writeFile(join(inputDir, "manifest.json"), JSON.stringify({
      schemaVersion: 1,
      sources: options.resolvedSources.map((source) => ({
        alias: source.alias,
        outputId: source.outputId,
        stream: source.stream,
        bytes: source.bytes,
        sha256: source.textSha256,
      })),
    }, null, 2), "utf8");

    let result: ScriptSandboxExecutionResult;
    try {
      result = await options.adapter.execute({
        language: options.input.operation.language,
        code: options.input.operation.code,
        inputDir,
        workDir,
        outputDir,
        sources: mounts,
        limits: options.limits,
        network: options.config.network,
      });
    } catch (error) {
      return { ok: false, message: `Script transform adapter ${options.adapter.id} threw before returning a result: ${errorMessage(error)}` };
    }

    const stdoutBytes = byteLength(result.stdout ?? "");
    const stderrBytes = byteLength(result.stderr ?? "");
    if (stdoutBytes + stderrBytes > options.limits.maxOutputBytes) {
      return { ok: false, message: `Script transform output bytes ${stdoutBytes + stderrBytes} exceed maxOutputBytes ${options.limits.maxOutputBytes}.` };
    }
    if (result.status !== "success") {
      const detail = result.reason ? ` ${result.reason}` : "";
      return { ok: false, message: `Script transform ${options.input.operation.language} ${result.status}.${detail} stdoutBytes=${stdoutBytes} stderrBytes=${stderrBytes}.` };
    }
    return { ok: true, result };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function resolveScriptSources(options: {
  vault: ReturnType<typeof createVault>;
  sessionId: string;
  sources: readonly ScriptTransformSourceInput[];
  maxInputBytes: number;
  operation: ScriptTransformOperation;
  preserve: PreserveMode;
}): Promise<
  | { ok: true; sources: ResolvedScriptSource[] }
  | { ok: false; failure: FailureRoutedResult }
> {
  const resolved: ResolvedScriptSource[] = [];
  let totalBytes = 0;

  for (const source of options.sources) {
    let record: VaultRecord;
    try {
      record = await readVaultRecord(options.vault, options.sessionId, source.outputId);
    } catch (error) {
      return {
        ok: false,
        failure: transformSourceUnavailableFailure({
          message: `Script transform source alias=${source.alias} outputId=${source.outputId} could not be found or read: ${errorMessage(error)}`,
          preserve: options.preserve,
          lineage: lineageForScriptInput({ sources: [...options.sources], operation: options.operation }, { maxInputBytes: options.maxInputBytes }),
          decisionSeed: "script-source-record",
        }),
      };
    }

    const streamResult = resolveSourceStream(record, source.stream);
    if (!streamResult.ok) {
      return {
        ok: false,
        failure: transformValidationFailure({
          message: `Script transform source alias=${source.alias} outputId=${source.outputId} stream is invalid: ${streamResult.message}`,
          preserve: options.preserve,
          lineage: lineageForSource(record, options.operation),
          decisionSeed: "script-source-stream",
        }),
      };
    }

    let text: string;
    try {
      text = await readOutputText(options.vault, options.sessionId, source.outputId, streamResult.stream);
    } catch (error) {
      return {
        ok: false,
        failure: transformSourceUnavailableFailure({
          message: `Script transform source alias=${source.alias} outputId=${source.outputId} stream=${streamResult.stream} could not be read: ${errorMessage(error)}`,
          preserve: options.preserve,
          lineage: lineageForSource(record, options.operation),
          decisionSeed: "script-source-text",
        }),
      };
    }

    const bytes = byteLength(text);
    totalBytes += bytes;
    if (totalBytes > options.maxInputBytes) {
      return {
        ok: false,
        failure: transformValidationFailure({
          message: `Script transform input bytes ${totalBytes} exceed maxInputBytes ${options.maxInputBytes}.`,
          preserve: options.preserve,
          lineage: lineageForSource(record, options.operation),
          decisionSeed: "script-source-size",
        }),
      };
    }

    resolved.push({
      alias: source.alias,
      outputId: source.outputId,
      recordId: record.recordId,
      stream: streamResult.stream,
      bytes,
      contentHashSha256: record.contentHashSha256,
      textSha256: hashText(text),
      text,
    });
  }

  return { ok: true, sources: resolved };
}

interface ResolvedScriptSource {
  alias: string;
  outputId: string;
  recordId: string;
  stream: OutputStream;
  bytes: number;
  contentHashSha256: string;
  textSha256: string;
  text: string;
}

function validateTransformSource(value: unknown, path: string, issues: TransformValidationIssue[]) {
  if (!isRecord(value)) {
    issues.push({ path, message: "Expected transform source object." });
    return;
  }

  if (value.kind !== "vault") {
    issues.push({ path: `${path}.kind`, message: "Slice 5A supports only vault transform sources." });
    return;
  }

  if (typeof value.outputId !== "string" || value.outputId.length === 0) {
    issues.push({ path: `${path}.outputId`, message: "Expected non-empty vault outputId." });
  }
  if (value.stream !== undefined && !isOutputStream(value.stream)) {
    issues.push({ path: `${path}.stream`, message: "Expected a known output stream." });
  }
}

function validateTransformOperation(value: unknown, path: string, issues: TransformValidationIssue[]) {
  if (!isRecord(value)) {
    issues.push({ path, message: "Expected transform operation object." });
    return;
  }

  if (typeof value.kind !== "string" || !OPERATION_KINDS.has(value.kind)) {
    issues.push({ path: `${path}.kind`, message: "Expected a supported transform operation kind." });
    return;
  }

  if (value.kind === "script") {
    validateScriptOperation(value, path, issues);
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

function validateScriptOperation(value: Record<string, unknown>, path: string, issues: TransformValidationIssue[]) {
  if (!isStringIn(value.language, SCRIPT_TRANSFORM_LANGUAGES)) {
    issues.push({ path: `${path}.language`, message: `Expected script language ${SCRIPT_TRANSFORM_LANGUAGES.join(", ")}.` });
  }
  if (typeof value.code !== "string" || value.code.length === 0) {
    issues.push({ path: `${path}.code`, message: "Expected non-empty script code string." });
  } else if (byteLength(value.code) > MAX_SCRIPT_CODE_BYTES) {
    issues.push({ path: `${path}.code`, message: `Script code must be at most ${MAX_SCRIPT_CODE_BYTES} bytes.` });
  }
  if (value.label !== undefined && (typeof value.label !== "string" || value.label.length === 0)) {
    issues.push({ path: `${path}.label`, message: "Expected non-empty script label string when present." });
  }
}

function validateScriptTransformSources(value: unknown, path: string, issues: TransformValidationIssue[]) {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push({ path, message: "Expected one or more script transform vault sources." });
    return;
  }

  const aliases = new Set<string>();
  value.forEach((source, index) => {
    const sourcePath = `${path}[${index}]`;
    validateTransformSource(source, sourcePath, issues);
    if (!isRecord(source)) {
      return;
    }
    if (typeof source.alias !== "string" || !SCRIPT_ALIAS_PATTERN.test(source.alias)) {
      issues.push({ path: `${sourcePath}.alias`, message: "Expected alias matching ^[A-Za-z][A-Za-z0-9_-]{0,63}$." });
      return;
    }
    if (aliases.has(source.alias)) {
      issues.push({ path: `${sourcePath}.alias`, message: `Duplicate script source alias ${source.alias}.` });
    }
    aliases.add(source.alias);
  });
}

function validateScriptTransformLimits(value: unknown, path: string, issues: TransformValidationIssue[]) {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    issues.push({ path, message: "Expected script transform limits object." });
    return;
  }
  validateOptionalIntegerRange(value.timeoutMs, `${path}.timeoutMs`, 1, MAX_SCRIPT_TRANSFORM_LIMITS.timeoutMs, issues);
  validateOptionalIntegerRange(value.maxInputBytes, `${path}.maxInputBytes`, 1, MAX_SCRIPT_TRANSFORM_LIMITS.maxInputBytes, issues);
  validateOptionalIntegerRange(value.maxOutputBytes, `${path}.maxOutputBytes`, 1, MAX_SCRIPT_TRANSFORM_LIMITS.maxOutputBytes, issues);
}

function validateOptionalIntegerRange(value: unknown, path: string, min: number, max: number, issues: TransformValidationIssue[]) {
  if (value === undefined) {
    return;
  }
  validateIntegerRange(value, path, min, max, issues);
}

function validateJsonExtractOperation(value: Record<string, unknown>, path: string, issues: TransformValidationIssue[]) {
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

function validateDedupeOperation(value: Record<string, unknown>, path: string, issues: TransformValidationIssue[]) {
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

function validateTopNOperation(value: Record<string, unknown>, path: string, issues: TransformValidationIssue[]) {
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

function validateExtractOperation(value: Record<string, unknown>, path: string, issues: TransformValidationIssue[]) {
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

function validateStatsOperation(value: Record<string, unknown>, path: string, issues: TransformValidationIssue[]) {
  for (const key of ["pattern", "flags", "contextLines", "maxMatches", "group", "maxGroups", "maxLinesPerGroup", "limit", "sort", "order", "trim", "caseSensitive", "maxLines", "dedupe"] as const) {
    if (value[key] !== undefined) {
      issues.push({ path: `${path}.${key}`, message: `Operation ${value.kind} does not accept ${key}.` });
    }
  }
}

function validateGroupSelector(value: unknown, path: string, issues: TransformValidationIssue[]) {
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

function validateRegexFlags(value: unknown, path: string, issues: TransformValidationIssue[]) {
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
  issues: TransformValidationIssue[],
) {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    issues.push({ path, message: `Expected integer from ${min} to ${max}.` });
  }
}

function prepareTransformOperation(
  operation: DeterministicTransformOperation,
): { ok: true; value: PreparedTransformOperation } | { ok: false; message: string } {
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

  const compiledRegex = compileRegexOperation(operation as RegexPatternTransformOperation);
  if (!compiledRegex.ok) {
    return compiledRegex;
  }
  return { ok: true, value: { kind: "regex", value: compiledRegex.value } };
}

function compileRegexOperation(
  operation: RegexPatternTransformOperation,
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
  operation: JsonExtractTransformOperation,
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

function transformText(options: {
  text: string;
  sourceLabel: string;
  operation: DeterministicTransformOperation;
  prepared: PreparedTransformOperation;
}): TransformedOutput {
  if (options.operation.kind === "jsonExtract") {
    if (options.prepared.kind !== "json") {
      throw new Error("jsonExtract operation was not prepared with a JSON selector.");
    }
    return transformJsonExtract({
      text: options.text,
      sourceLabel: options.sourceLabel,
      operation: options.operation,
      prepared: options.prepared.value,
    });
  }

  if (options.operation.kind === "dedupe") {
    return transformDedupe({
      text: options.text,
      sourceLabel: options.sourceLabel,
      operation: options.operation,
    });
  }

  if (options.operation.kind === "topN") {
    const topNOptions: {
      text: string;
      sourceLabel: string;
      operation: TopNTransformOperation;
      compiled?: CompiledRegexOperation;
    } = {
      text: options.text,
      sourceLabel: options.sourceLabel,
      operation: options.operation,
    };
    if (options.prepared.kind === "regex") {
      topNOptions.compiled = options.prepared.value;
    }
    return transformTopN(topNOptions);
  }

  if (options.operation.kind === "extractUrls") {
    return transformExtractUrls({ text: options.text, sourceLabel: options.sourceLabel, operation: options.operation });
  }

  if (options.operation.kind === "extractCitations") {
    return transformExtractCitations({ text: options.text, sourceLabel: options.sourceLabel, operation: options.operation });
  }

  if (options.operation.kind === "lineStats") {
    return transformLineStats({ text: options.text, sourceLabel: options.sourceLabel });
  }

  if (options.operation.kind === "sizeStats") {
    return transformSizeStats({ text: options.text, sourceLabel: options.sourceLabel });
  }

  if (options.prepared.kind !== "regex") {
    throw new Error(`${options.operation.kind} operation was not prepared with a regex.`);
  }

  if (options.operation.kind === "regexFilter") {
    return transformRegexFilter({
      text: options.text,
      sourceLabel: options.sourceLabel,
      operation: options.operation,
      compiled: options.prepared.value,
    });
  }
  if (options.operation.kind === "groupByRegex") {
    return transformGroupByRegex({
      text: options.text,
      sourceLabel: options.sourceLabel,
      operation: options.operation,
      compiled: options.prepared.value,
    });
  }
  return transformCountMatches({
    text: options.text,
    sourceLabel: options.sourceLabel,
    operation: options.operation,
    compiled: options.prepared.value,
  });
}

function transformRegexFilter(options: {
  text: string;
  sourceLabel: string;
  operation: RegexFilterTransformOperation;
  compiled: CompiledRegexOperation;
}): TransformedOutput {
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
    "# freeflow_search action=transform regexFilter",
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
    summary: `Transformed regexFilter from vaulted ${sourceStreamLabel(options.sourceLabel)} output: ${stats.matches} match(es) across ${stats.matchedLines} line(s).`,
    stats,
  };
}

function transformCountMatches(options: {
  text: string;
  sourceLabel: string;
  operation: CountMatchesTransformOperation;
  compiled: CompiledRegexOperation;
}): TransformedOutput {
  const lines = splitLines(options.text);
  const stats = collectMatches(lines, options.compiled.regex);
  const text = [
    "# freeflow_search action=transform countMatches",
    `source: ${options.sourceLabel}`,
    `pattern: ${formatPattern(options.compiled)}`,
    `matches: ${stats.matches}`,
    `matchedLines: ${stats.matchedLines}`,
    "",
  ].join("\n");

  return {
    text,
    summary: `Transformed countMatches from vaulted ${sourceStreamLabel(options.sourceLabel)} output: ${stats.matches} match(es) across ${stats.matchedLines} line(s).`,
    stats,
  };
}

function transformGroupByRegex(options: {
  text: string;
  sourceLabel: string;
  operation: GroupByRegexTransformOperation;
  compiled: CompiledRegexOperation;
}): TransformedOutput {
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
    "# freeflow_search action=transform groupByRegex",
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
    summary: `Transformed groupByRegex from vaulted ${sourceStreamLabel(options.sourceLabel)} output: ${allGroupKeys.size} group(s), ${matchedLines} matched line(s).`,
    stats: {
      matches: matchedLines,
      matchedLines,
      matchedLineNumbers: [],
      truncated,
    },
  };
}

function transformDedupe(options: {
  text: string;
  sourceLabel: string;
  operation: DedupeTransformOperation;
}): TransformedOutput {
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
    "# freeflow_search action=transform dedupe",
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
    summary: `Transformed dedupe from vaulted ${sourceStreamLabel(options.sourceLabel)} output: ${seen.size} unique line(s), ${duplicatesRemoved} duplicate line(s) removed.`,
    stats: {
      matches: seen.size,
      matchedLines: seen.size,
      matchedLineNumbers: uniqueEntries.map((entry) => entry.lineNumber),
      truncated,
    },
  };
}

function transformTopN(options: {
  text: string;
  sourceLabel: string;
  operation: TopNTransformOperation;
  compiled?: CompiledRegexOperation;
}): TransformedOutput {
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
    "# freeflow_search action=transform topN",
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
    summary: `Transformed topN from vaulted ${sourceStreamLabel(options.sourceLabel)} output: returned ${selected.length} of ${scored.length} matched line(s).`,
    stats: {
      matches: selected.length,
      matchedLines: scored.length,
      matchedLineNumbers: selected.map((entry) => entry.lineNumber),
      truncated: selected.length < scored.length,
    },
  };
}

function transformExtractUrls(options: {
  text: string;
  sourceLabel: string;
  operation: ExtractUrlsTransformOperation;
}): TransformedOutput {
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
    "# freeflow_search action=transform extractUrls",
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
    summary: `Transformed extractUrls from vaulted ${sourceStreamLabel(options.sourceLabel)} output: ${entries.length} URL(s) returned from ${matches} match(es).`,
    stats: {
      matches: entries.length,
      matchedLines: new Set(entries.map((entry) => entry.lineNumber)).size,
      matchedLineNumbers: entries.map((entry) => entry.lineNumber),
      truncated,
    },
  };
}

function transformExtractCitations(options: {
  text: string;
  sourceLabel: string;
  operation: ExtractCitationsTransformOperation;
}): TransformedOutput {
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
    "# freeflow_search action=transform extractCitations",
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
    summary: `Transformed extractCitations from vaulted ${sourceStreamLabel(options.sourceLabel)} output: ${entries.length} citation(s) returned.`,
    stats: {
      matches: entries.length,
      matchedLines: new Set(entries.map((entry) => entry.lineNumber)).size,
      matchedLineNumbers: entries.map((entry) => entry.lineNumber),
      truncated,
    },
  };
}

function transformLineStats(options: { text: string; sourceLabel: string }): TransformedOutput {
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
    "# freeflow_search action=transform lineStats",
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
    summary: `Transformed lineStats from vaulted ${sourceStreamLabel(options.sourceLabel)} output: ${lines.length} line(s), ${nonEmptyLines} non-empty, ${blankLines} blank.`,
    stats: {
      matches: lines.length,
      matchedLines: lines.length,
      matchedLineNumbers: [],
      truncated: false,
    },
  };
}

function transformSizeStats(options: { text: string; sourceLabel: string }): TransformedOutput {
  const bytes = byteLength(options.text);
  const utf16CodeUnits = options.text.length;
  const codePoints = Array.from(options.text).length;
  const lines = countLines(options.text);
  const hash = hashText(options.text);
  const text = [
    "# freeflow_search action=transform sizeStats",
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
    summary: `Transformed sizeStats from vaulted ${sourceStreamLabel(options.sourceLabel)} output: ${bytes} byte(s), ${utf16CodeUnits} code unit(s), ${lines} line(s).`,
    stats: {
      matches: bytes,
      matchedLines: lines,
      matchedLineNumbers: [],
      truncated: false,
    },
  };
}

function transformJsonExtract(options: {
  text: string;
  sourceLabel: string;
  operation: JsonExtractTransformOperation;
  prepared: PreparedJsonExtractOperation;
}): TransformedOutput {
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
    "# freeflow_search action=transform jsonExtract",
    `source: ${options.sourceLabel}`,
    `selectorKind: ${options.prepared.selectorKind}`,
    `selector: ${options.prepared.selector}`,
    `valueType: ${valueType}`,
    "",
    valueText,
  ].join("\n");

  return {
    text,
    summary: `Transformed jsonExtract from vaulted ${sourceStreamLabel(options.sourceLabel)} output using ${options.prepared.selectorKind} ${options.prepared.selector}.`,
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

function routeTransformedText(options: {
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
        ? `Bounded transformed ${options.operationKind} output from source ${sourceLabel}; exact transformed content is recoverable from the vault and source lineage is preserved.`
        : `Transformed exact ${options.operationKind} output from source ${sourceLabel} within routing caps; source lineage is preserved.`,
    window: routingStatus === "partial" ? "small" : "exact",
    expandable: true,
  }));

  return {
    routingStatus,
    reason:
      routingStatus === "partial"
        ? `Transformed output from operation ${options.operationKind} over source ${sourceLabel} (${outputBytes} bytes, ${outputLines} lines) was vaulted; bounded evidence was returned with exact recovery.`
        : `Transformed output from operation ${options.operationKind} over source ${sourceLabel} (${outputBytes} bytes, ${outputLines} lines) was vaulted and returned within routing caps.`,
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

function effectiveScriptTransformConfig(config: ScriptTransformConfig | undefined): ScriptTransformConfig {
  if (config === undefined) {
    return {
      ...DEFAULT_SCRIPT_TRANSFORM_CONFIG,
      languages: [...DEFAULT_SCRIPT_TRANSFORM_CONFIG.languages],
      limits: { ...DEFAULT_SCRIPT_TRANSFORM_CONFIG.limits },
    };
  }
  return {
    ...config,
    languages: [...config.languages],
    limits: { ...config.limits },
  };
}

function effectiveScriptLimits(config: ScriptTransformConfig, input: ScriptTransformLimitsInput | undefined): Required<ScriptTransformLimitsInput> {
  return {
    timeoutMs: boundedScriptLimit(input?.timeoutMs, config.limits.timeoutMs, MAX_SCRIPT_TRANSFORM_LIMITS.timeoutMs),
    maxInputBytes: boundedScriptLimit(input?.maxInputBytes, config.limits.maxInputBytes, MAX_SCRIPT_TRANSFORM_LIMITS.maxInputBytes),
    maxOutputBytes: boundedScriptLimit(input?.maxOutputBytes, config.limits.maxOutputBytes, MAX_SCRIPT_TRANSFORM_LIMITS.maxOutputBytes),
  };
}

function boundedScriptLimit(value: number | undefined, configured: number, max: number): number {
  const configuredLimit = Math.min(configured, max);
  if (!Number.isInteger(value) || Number(value) <= 0) {
    return configuredLimit;
  }
  return Math.min(Number(value), configuredLimit);
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

  return { ok: false, message: "Repo file reference vault records store metadata only and cannot be used as transform text sources." };
}

function lineageForSource(record: VaultRecord, operation: TransformOperation): EvidenceLineage {
  return {
    sourceRecordIds: [record.recordId],
    sourceOutputIds: [record.outputId],
    operation: operation.kind === "script" ? `script:${operation.language}` : operation.kind,
    operationHash: operationHash(operation),
  };
}

function lineageForScriptInput(input: Pick<ScriptTransformInput, "sources" | "operation" | "limits">, limits?: Partial<ScriptTransformLimitsInput>): EvidenceLineage {
  return {
    sourceOutputIds: input.sources.map((source) => source.outputId),
    operation: `script:${input.operation.language}`,
    operationHash: operationHashForScript(input.operation, input.sources, limits ?? input.limits),
  };
}

function lineageForResolvedScriptSources(sources: readonly ResolvedScriptSource[], input: ScriptTransformInput, limits: Required<ScriptTransformLimitsInput>): EvidenceLineage {
  return {
    sourceRecordIds: sources.map((source) => source.recordId),
    sourceOutputIds: sources.map((source) => source.outputId),
    operation: `script:${input.operation.language}`,
    operationHash: operationHashForScript(input.operation, input.sources, limits, sources),
  };
}

function lineageFromInput(input: unknown): EvidenceLineage | undefined {
  if (!isRecord(input) || !isRecord(input.operation)) {
    return undefined;
  }

  if (input.operation.kind === "script" && Array.isArray(input.sources)) {
    const sources = input.sources.filter(isRecord) as Record<string, unknown>[];
    const outputIds = sources.map((source) => source.outputId).filter((outputId): outputId is string => typeof outputId === "string");
    return {
      ...(outputIds.length > 0 ? { sourceOutputIds: outputIds } : {}),
      operation: typeof input.operation.language === "string" ? `script:${input.operation.language}` : "script",
    };
  }

  if (!isRecord(input.source)) {
    return undefined;
  }

  const lineage: EvidenceLineage = {};
  if (typeof input.source.outputId === "string") {
    lineage.sourceOutputIds = [input.source.outputId];
  }
  if (typeof input.operation.kind === "string") {
    lineage.operation = input.operation.kind;
  }
  return Object.keys(lineage).length > 0 ? lineage : undefined;
}

function operationSummary(operation: TransformOperation): Record<string, unknown> {
  if (operation.kind === "script") {
    return scriptOperationSummary(operation);
  }

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

function operationHash(operation: TransformOperation): string {
  return `sha256_${hash(JSON.stringify(operationSummary(operation)))}`;
}

function operationHashForScript(
  operation: ScriptTransformOperation,
  sources: readonly ScriptTransformSourceInput[],
  limits: Partial<ScriptTransformLimitsInput> | undefined,
  resolvedSources: readonly ResolvedScriptSource[] = [],
): string {
  return `sha256_${hash(JSON.stringify({
    schemaVersion: 1,
    operation: scriptOperationSummary(operation),
    sources: sources.map((source) => ({ alias: source.alias, outputId: source.outputId, stream: source.stream })),
    resolvedSources: resolvedSources.map((source) => ({
      alias: source.alias,
      outputId: source.outputId,
      recordId: source.recordId,
      stream: source.stream,
      bytes: source.bytes,
      contentHashSha256: source.contentHashSha256,
      textSha256: source.textSha256,
    })),
    limits,
  }))}`;
}

function scriptOperationSummary(operation: ScriptTransformOperation): Record<string, unknown> {
  return {
    kind: "script",
    language: operation.language,
    codeSha256: `sha256_${hash(operation.code)}`,
    ...(operation.label !== undefined ? { label: operation.label } : {}),
  };
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

function transformValidationFailureWithOptionalLineage(options: {
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
    return transformValidationFailure({ ...failureOptions, lineage: options.lineage });
  }
  return transformValidationFailure(failureOptions);
}

function transformSourceUnavailableFailureWithOptionalLineage(options: {
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
    return transformSourceUnavailableFailure({ ...failureOptions, lineage: options.lineage });
  }
  return transformSourceUnavailableFailure(failureOptions);
}

function validationMessage(issues: readonly TransformValidationIssue[]): string {
  return `Invalid transform input: ${issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`;
}

function isScriptTransformInput(input: TransformInput): input is ScriptTransformInput {
  return input.operation.kind === "script";
}

function isOutputStream(value: unknown): value is OutputStream {
  return value === "stdout" || value === "stderr" || value === "combined" || value === "raw";
}

function isStringIn<TValue extends string>(value: unknown, allowed: readonly TValue[]): value is TValue {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
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
