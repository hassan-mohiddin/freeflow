import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { relative } from "node:path";

import { resolveRepoPath } from "../repo/repo-traversal.js";
import { renderProcessingResult, classifyProcessingRecovery } from "./renderers.js";
import { selectProcessingReducer, type ProcessingReducerSelection } from "./reducers.js";
import {
  processingScriptNotConfigured,
  processingScriptUnavailableForUnloadedSource,
  runProcessingScript,
  type ProcessingScriptRequest,
  type ProcessingScriptResult,
} from "./scripts.js";
import { createVault, readOutputText, readVaultRecord, storeRepoFileReference, storeTextOutput } from "../vault/vault.js";
import type { EvidenceLineage, EvidencePersistence, OutputStream, RecoveryHint, ScriptDeriveConfig, SourceRef, VaultRecord, VaultRetentionPolicy } from "../config/types.js";
import type { ScriptSandboxAdapter } from "../sandbox/script-sandbox.js";

export const PROCESSING_ENGINE_IMPLEMENTATION = "processing-engine-skeleton-v1";

export interface ProcessingLimits {
  maxSourceBytes: number;
  maxVisibleBytes: number;
}

export interface ProcessingEngineOptions {
  sessionId?: string;
  vaultRoot?: string;
  vaultRetention?: VaultRetentionPolicy;
  limits?: Partial<ProcessingLimits>;
  script?: ProcessingScriptRequest;
  scriptDerive?: ScriptDeriveConfig;
  scriptSandboxAdapters?: readonly ScriptSandboxAdapter[];
}

export interface RepoFileProcessingSource {
  kind: "repo-file";
  root: string;
  path: string;
}

export interface VaultOutputProcessingSource {
  kind: "vault-output";
  sessionId: string;
  outputId: string;
  stream?: OutputStream;
  vaultRoot?: string;
}

export interface CapturedCommandOutputProcessingSource {
  kind: "command-output";
  stdout?: string;
  stderr?: string;
  combined?: string;
  stream?: Exclude<OutputStream, "raw">;
  outputId?: string;
}

export type ProcessingSourceInput = RepoFileProcessingSource | VaultOutputProcessingSource | CapturedCommandOutputProcessingSource;

export interface ProcessingSourceStats {
  bytes: number;
  lines: number;
  sha256: string;
}

export interface ProcessingSourceDescriptor {
  kind: ProcessingSourceInput["kind"];
  ref: SourceRef;
  displayPath: string;
  stream?: OutputStream;
}

export interface LoadedProcessingSource {
  status: "ok";
  source: ProcessingSourceDescriptor;
  text: string;
  stats: ProcessingSourceStats;
  lineage?: EvidenceLineage;
  persistence?: EvidencePersistence;
  recovery?: RecoveryHint;
}

export interface BlockedProcessingSource {
  status: "blocked";
  source: ProcessingSourceDescriptor;
  reason: string;
  policy: "repo_containment" | "source_limit";
  stats?: Pick<ProcessingSourceStats, "bytes">;
}

export interface UnavailableProcessingSource {
  status: "unavailable";
  source: ProcessingSourceDescriptor;
  reason: string;
}

export type ProcessingSourceLoadResult = LoadedProcessingSource | BlockedProcessingSource | UnavailableProcessingSource;

export interface ProcessingFact {
  name: string;
  value: string | number | boolean;
}

export type ReducerSelectionResult = ProcessingReducerSelection;

export type ScriptPolicySelectionResult = ProcessingScriptResult;

export interface ProcessingResultBase {
  implementation: typeof PROCESSING_ENGINE_IMPLEMENTATION;
  source: ProcessingSourceDescriptor;
  visibleText: string;
  facts: ProcessingFact[];
  reducer: ReducerSelectionResult;
  script: ScriptPolicySelectionResult;
  lineage?: EvidenceLineage;
  persistence?: EvidencePersistence;
  recovery?: RecoveryHint;
}

export interface ProcessingOkResult extends ProcessingResultBase {
  status: "ok";
  stats: ProcessingSourceStats;
}

export interface ProcessingBlockedResult extends ProcessingResultBase {
  status: "blocked";
  reason: string;
  policy: BlockedProcessingSource["policy"];
}

export interface ProcessingUnavailableResult extends ProcessingResultBase {
  status: "unavailable";
  reason: string;
}

export type ProcessingResult = ProcessingOkResult | ProcessingBlockedResult | ProcessingUnavailableResult;

const DEFAULT_PROCESSING_LIMITS: ProcessingLimits = {
  maxSourceBytes: 2 * 1024 * 1024,
  maxVisibleBytes: 4_096,
};

export async function loadProcessingSource(
  source: ProcessingSourceInput,
  options: ProcessingEngineOptions = {},
): Promise<ProcessingSourceLoadResult> {
  const limits = normalizeLimits(options.limits);
  switch (source.kind) {
    case "repo-file":
      return loadRepoFileSource(source, options, limits);
    case "vault-output":
      return loadVaultOutputSource(source, options, limits);
    case "command-output":
      return loadCapturedCommandOutputSource(source, limits);
  }
}

export async function processSource(
  source: ProcessingSourceInput,
  options: ProcessingEngineOptions = {},
): Promise<ProcessingResult> {
  const loaded = await loadProcessingSource(source, options);
  const limits = normalizeLimits(options.limits);
  const reducer = notSelectedReducer("Source was not loaded; reducer selection was skipped.");
  const script = options.script
    ? processingScriptUnavailableForUnloadedSource(options.script, "Source was not loaded; script processing was skipped.")
    : processingScriptNotConfigured();

  if (loaded.status === "blocked") {
    return {
      implementation: PROCESSING_ENGINE_IMPLEMENTATION,
      status: "blocked",
      source: loaded.source,
      reason: loaded.reason,
      policy: loaded.policy,
      visibleText: renderProcessingResult({
        status: "blocked",
        source: loaded.source,
        facts: [],
        maxVisibleBytes: limits.maxVisibleBytes,
        failure: { policy: loaded.policy, reason: loaded.reason },
      }),
      facts: [],
      reducer,
      script,
    };
  }

  if (loaded.status === "unavailable") {
    return {
      implementation: PROCESSING_ENGINE_IMPLEMENTATION,
      status: "unavailable",
      source: loaded.source,
      reason: loaded.reason,
      visibleText: renderProcessingResult({
        status: "unavailable",
        source: loaded.source,
        facts: [],
        maxVisibleBytes: limits.maxVisibleBytes,
        failure: { reason: loaded.reason },
      }),
      facts: [],
      reducer,
      script,
    };
  }

  const selectedScript = options.script
    ? await runProcessingScript({
        loaded,
        script: options.script,
        ...(options.scriptDerive !== undefined ? { scriptDerive: options.scriptDerive } : {}),
        ...(options.scriptSandboxAdapters !== undefined ? { adapters: options.scriptSandboxAdapters } : {}),
      })
    : processingScriptNotConfigured();
  const selectedReducer = selectedScript.status === "executed"
    ? notSelectedReducer("Sandboxed script processing produced output; reducer selection was skipped.")
    : selectProcessingReducer({ text: loaded.text });
  const facts = selectedReducer.status === "selected" ? [...selectedReducer.result.facts, ...sourceFacts(loaded)] : sourceFacts(loaded);
  const visibleText = renderProcessingResult({
    status: "ok",
    source: loaded.source,
    stats: loaded.stats,
    facts,
    reducer: selectedReducer,
    script: selectedScript,
    ...(loaded.recovery !== undefined ? { recovery: loaded.recovery } : {}),
    ...(loaded.persistence !== undefined ? { persistence: loaded.persistence } : {}),
    recoveryClass: classifyProcessingRecovery({
      ...(loaded.recovery !== undefined ? { recovery: loaded.recovery } : {}),
      ...(loaded.persistence !== undefined ? { persistence: loaded.persistence } : {}),
      resultWillBePersisted: options.sessionId !== undefined,
    }),
    maxVisibleBytes: limits.maxVisibleBytes,
  });
  const persisted = await persistProcessingResultText({
    resultText: selectedScript.status === "executed" ? selectedScript.outputText : visibleText,
    loaded,
    options,
    operation: selectedScript.status === "executed" ? `processing-script:${selectedScript.language}` : "processing-fact-summary",
    producerName: selectedScript.status === "executed" ? `processing-script:${selectedScript.language}` : "processing-engine",
    operationHashSeed: selectedScript.status === "executed"
      ? { source: loaded.source, stats: loaded.stats, script: { language: selectedScript.language, codeHashSha256: selectedScript.codeHashSha256 } }
      : { source: loaded.source, stats: loaded.stats },
  });

  const result: ProcessingOkResult = {
    implementation: PROCESSING_ENGINE_IMPLEMENTATION,
    status: "ok",
    source: loaded.source,
    stats: loaded.stats,
    visibleText,
    facts,
    reducer: selectedReducer,
    script: selectedScript,
  };
  const lineage = persisted.lineage ?? loaded.lineage;
  const persistence = persisted.persistence ?? loaded.persistence;
  const recovery = persisted.recovery ?? loaded.recovery;
  if (lineage !== undefined) {
    result.lineage = lineage;
  }
  if (persistence !== undefined) {
    result.persistence = persistence;
  }
  if (recovery !== undefined) {
    result.recovery = recovery;
  }
  return result;
}

async function loadRepoFileSource(
  source: RepoFileProcessingSource,
  options: ProcessingEngineOptions,
  limits: ProcessingLimits,
): Promise<ProcessingSourceLoadResult> {
  const descriptor = repoSourceDescriptor(source.path);
  let resolved: Awaited<ReturnType<typeof resolveRepoPath>>;
  try {
    resolved = await resolveRepoPath(source.root, source.path);
  } catch (error) {
    const message = errorMessage(error);
    const blocked = message.includes("escapes root");
    return blocked
      ? { status: "blocked", source: descriptor, policy: "repo_containment", reason: message }
      : { status: "unavailable", source: descriptor, reason: message };
  }

  const resolvedDescriptor = repoSourceDescriptor(resolved.relativePath || ".");
  const fileStat = await stat(resolved.absolutePath);
  if (!fileStat.isFile()) {
    return { status: "unavailable", source: resolvedDescriptor, reason: `Repo source is not a file: ${resolved.relativePath || "."}` };
  }
  if (fileStat.size > limits.maxSourceBytes) {
    return {
      status: "blocked",
      source: resolvedDescriptor,
      policy: "source_limit",
      reason: `Repo source ${resolved.relativePath} is ${fileStat.size} bytes, above maxSourceBytes=${limits.maxSourceBytes}.`,
      stats: { bytes: fileStat.size },
    };
  }

  const text = await readFile(resolved.absolutePath, "utf8");
  const stats = textStats(text);
  const lineage = await persistRepoFileReferenceIfRequested({ sourcePath: resolved.relativePath, text, options });
  return {
    status: "ok",
    source: resolvedDescriptor,
    text,
    stats,
    ...(lineage !== undefined ? { lineage } : {}),
  };
}

async function loadVaultOutputSource(
  source: VaultOutputProcessingSource,
  options: ProcessingEngineOptions,
  limits: ProcessingLimits,
): Promise<ProcessingSourceLoadResult> {
  const requestedStream = source.stream;
  const unavailableDescriptor = vaultSourceDescriptor(source.outputId, requestedStream ?? "combined");
  const vaultOptions: { root?: string; retention?: VaultRetentionPolicy } = {};
  const vaultRoot = source.vaultRoot ?? options.vaultRoot;
  if (vaultRoot !== undefined) {
    vaultOptions.root = vaultRoot;
  }
  if (options.vaultRetention !== undefined) {
    vaultOptions.retention = options.vaultRetention;
  }
  const vault = createVault(vaultOptions);

  let record: VaultRecord;
  try {
    record = await readVaultRecord(vault, source.sessionId, source.outputId);
  } catch (error) {
    return { status: "unavailable", source: unavailableDescriptor, reason: errorMessage(error) };
  }

  const stream = resolveProcessingVaultStream(record, requestedStream);
  const descriptor = vaultSourceDescriptor(source.outputId, stream);
  const sourceBytes = byteCountForVaultStream(record, stream);
  if (sourceBytes !== undefined && sourceBytes > limits.maxSourceBytes) {
    return {
      status: "blocked",
      source: descriptor,
      policy: "source_limit",
      reason: `Vault source ${source.outputId}:${stream} is ${sourceBytes} bytes, above maxSourceBytes=${limits.maxSourceBytes}.`,
      stats: { bytes: sourceBytes },
    };
  }

  try {
    const text = await readOutputText(vault, source.sessionId, source.outputId, stream);
    const stats = textStats(text);
    if (stats.bytes > limits.maxSourceBytes) {
      return {
        status: "blocked",
        source: descriptor,
        policy: "source_limit",
        reason: `Vault source ${source.outputId}:${stream} is ${stats.bytes} bytes, above maxSourceBytes=${limits.maxSourceBytes}.`,
        stats: { bytes: stats.bytes },
      };
    }
    const lineage: EvidenceLineage = {
      sourceRecordIds: record.recordId ? [record.recordId] : [],
      sourceOutputIds: [source.outputId],
      operation: "processing-source-load",
    };
    return {
      status: "ok",
      source: descriptor,
      text,
      stats,
      lineage,
      recovery: { how: `Recover source with freeflow_retrieve action=retrieve outputId=${source.outputId} stream=${stream}.`, outputId: source.outputId },
    };
  } catch (error) {
    return { status: "unavailable", source: descriptor, reason: errorMessage(error) };
  }
}

function resolveProcessingVaultStream(record: VaultRecord, requested: OutputStream | undefined): OutputStream {
  if (requested !== undefined) {
    return requested;
  }
  return record.kind === "text" ? "raw" : "combined";
}

function vaultSourceDescriptor(outputId: string, stream: OutputStream): ProcessingSourceDescriptor {
  return {
    kind: "vault-output",
    ref: { kind: "vault", outputId, stream },
    displayPath: `${outputId}:${stream}`,
    stream,
  };
}

function loadCapturedCommandOutputSource(
  source: CapturedCommandOutputProcessingSource,
  limits: ProcessingLimits,
): ProcessingSourceLoadResult {
  const stream = source.stream ?? "combined";
  const descriptor: ProcessingSourceDescriptor = {
    kind: "command-output",
    ref: { kind: "native", tool: "command", outputId: source.outputId ?? "inline-command-output" },
    displayPath: source.outputId ? `${source.outputId}:${stream}` : `inline-command-output:${stream}`,
    stream,
  };
  const text = commandOutputStreamText(source, stream);
  const stats = textStats(text);
  if (stats.bytes > limits.maxSourceBytes) {
    return {
      status: "blocked",
      source: descriptor,
      policy: "source_limit",
      reason: `Captured command output ${descriptor.displayPath} is ${stats.bytes} bytes, above maxSourceBytes=${limits.maxSourceBytes}.`,
      stats: { bytes: stats.bytes },
    };
  }

  const lineage: EvidenceLineage | undefined = source.outputId
    ? { sourceOutputIds: [source.outputId], operation: "processing-source-load" }
    : undefined;
  return {
    status: "ok",
    source: descriptor,
    text,
    stats,
    ...(lineage !== undefined ? { lineage } : {}),
    ...(source.outputId !== undefined
      ? { recovery: { how: `Recover source from captured command outputId=${source.outputId} stream=${stream}.`, outputId: source.outputId } }
      : {}),
  };
}

async function persistRepoFileReferenceIfRequested(input: {
  sourcePath: string;
  text: string;
  options: ProcessingEngineOptions;
}): Promise<EvidenceLineage | undefined> {
  if (input.options.sessionId === undefined) {
    return undefined;
  }

  const vaultOptions: { root?: string; retention?: VaultRetentionPolicy } = {};
  if (input.options.vaultRoot !== undefined) {
    vaultOptions.root = input.options.vaultRoot;
  }
  if (input.options.vaultRetention !== undefined) {
    vaultOptions.retention = input.options.vaultRetention;
  }
  const record = await storeRepoFileReference(createVault(vaultOptions), {
    sessionId: input.options.sessionId,
    path: input.sourcePath,
    hashSha256: sha256(input.text),
    producer: { kind: "repo", name: "processing-source-loader" },
    persistence: { status: "metadata_only", recoverability: "metadata_only" },
  });
  return {
    sourceRecordIds: [record.recordId],
    sourceOutputIds: [record.outputId],
    operation: "processing-source-load",
  };
}

async function persistProcessingResultText(input: {
  resultText: string;
  loaded: LoadedProcessingSource;
  options: ProcessingEngineOptions;
  operation: string;
  producerName: string;
  operationHashSeed: unknown;
}): Promise<{ lineage?: EvidenceLineage; persistence?: EvidencePersistence; recovery?: RecoveryHint }> {
  if (input.options.sessionId === undefined) {
    return {};
  }

  const vaultOptions: { root?: string; retention?: VaultRetentionPolicy } = {};
  if (input.options.vaultRoot !== undefined) {
    vaultOptions.root = input.options.vaultRoot;
  }
  if (input.options.vaultRetention !== undefined) {
    vaultOptions.retention = input.options.vaultRetention;
  }
  const lineage: EvidenceLineage = {
    ...(input.loaded.lineage?.sourceRecordIds !== undefined ? { sourceRecordIds: input.loaded.lineage.sourceRecordIds } : {}),
    ...(input.loaded.lineage?.sourceOutputIds !== undefined ? { sourceOutputIds: input.loaded.lineage.sourceOutputIds } : {}),
    operation: input.operation,
    operationHash: sha256(JSON.stringify(input.operationHashSeed)),
  };
  const record = await storeTextOutput(createVault(vaultOptions), {
    sessionId: input.options.sessionId,
    raw: input.resultText,
    sourceKind: "derive",
    producer: { kind: "derive", name: input.producerName },
    persistence: { status: "vaulted", recoverability: "exact" },
    lineage,
  });
  const persistence: EvidencePersistence = { status: "vaulted", recoverability: "exact", outputId: record.outputId };
  return {
    lineage,
    persistence,
    recovery: { how: `Recover processing result with freeflow_retrieve action=retrieve outputId=${record.outputId} stream=raw.`, outputId: record.outputId },
  };
}

function notSelectedReducer(reason: string): ReducerSelectionResult {
  return {
    status: "not_selected",
    candidates: [],
    reason,
  };
}

function sourceFacts(loaded: LoadedProcessingSource): ProcessingFact[] {
  return [
    { name: "source.kind", value: loaded.source.kind },
    { name: "source.path", value: loaded.source.displayPath },
    { name: "source.bytes", value: loaded.stats.bytes },
    { name: "source.lines", value: loaded.stats.lines },
    { name: "source.sha256", value: loaded.stats.sha256 },
  ];
}

function commandOutputStreamText(source: CapturedCommandOutputProcessingSource, stream: Exclude<OutputStream, "raw">): string {
  if (stream === "stdout") {
    return source.stdout ?? "";
  }
  if (stream === "stderr") {
    return source.stderr ?? "";
  }
  return source.combined ?? combineOutput(source.stdout ?? "", source.stderr ?? "");
}

function byteCountForVaultStream(record: VaultRecord, stream: OutputStream): number | undefined {
  if (record.kind === "command") {
    if (stream === "stdout") {
      return record.byteCounts.stdout;
    }
    if (stream === "stderr") {
      return record.byteCounts.stderr;
    }
    if (stream === "combined" || stream === "raw") {
      return record.byteCounts.combined;
    }
  }
  if (record.kind === "text" && stream === "raw") {
    return record.byteCounts.raw;
  }
  return undefined;
}

function normalizeLimits(limits: Partial<ProcessingLimits> | undefined): ProcessingLimits {
  return {
    maxSourceBytes: positiveInteger(limits?.maxSourceBytes) ?? DEFAULT_PROCESSING_LIMITS.maxSourceBytes,
    maxVisibleBytes: positiveInteger(limits?.maxVisibleBytes) ?? DEFAULT_PROCESSING_LIMITS.maxVisibleBytes,
  };
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

function repoSourceDescriptor(displayPath: string): ProcessingSourceDescriptor {
  return {
    kind: "repo-file",
    ref: { kind: "repo", path: displayPath },
    displayPath,
  };
}

function textStats(text: string): ProcessingSourceStats {
  return {
    bytes: byteLength(text),
    lines: countLines(text),
    sha256: sha256(text),
  };
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function countLines(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  return text.split(/\r?\n/).length;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function combineOutput(stdout: string, stderr: string): string {
  if (stdout && stderr) {
    return `[stdout]\n${stdout}\n[stderr]\n${stderr}`;
  }
  return stdout || stderr;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isProcessingPathInsideRoot(root: string, absolutePath: string): boolean {
  const relativePath = relative(root, absolutePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.startsWith("/") && !/^[A-Za-z]:/.test(relativePath));
}
