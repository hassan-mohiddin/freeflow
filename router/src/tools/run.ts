import { createHash } from "node:crypto";

import {
  commandOutputFingerprints,
  createVault,
  findExactDuplicateCommandOutput,
  storeCommandOutput,
  storeMetadataOutput,
  storeTextOutput,
} from "../vault/vault.js";
import { DEFAULT_ROUTER_THRESHOLDS, DEFAULT_STORAGE_POLICY } from "../config/config.js";
import { executeSandboxedScriptOperation, freeflowTransform, validateTransformInput, type ScriptTransformLimitsInput, type ScriptTransformOperation, type SandboxedScriptOperationResult } from "../transform/engine.js";
import { assembleTextEvidence, byteLength, countLines, type BoundedEvidence } from "../evidence/evidence.js";
import { parseCommandOutput, type ParsedCommandOutput } from "../routing/parsers.js";
import {
  applyRunOutputFilters,
  hasRunOutputFilters,
  normalizeRunOutputFilters,
  type NormalizedRunOutputFilters,
  type RunOutputFilterMetadata,
  type RunOutputFiltersInput,
} from "../routing/run-filters.js";
import {
  parserWithReducer,
  reducerImportantLines,
  selectRunReducerRoute,
  type RunReducerRoute,
} from "../routing/run-reducers.js";
import type {
  CommandOutputRecord,
  CommandParserMetadata,
  MetadataOutputRecord,
  TextOutputRecord,
  CommandRoutedResult,
  TransformRoutedResult,
  ExecutionStatus,
  FailureRoutedResult,
  ImportantLine,
  ProducerDescriptor,
  PreserveMode,
  RouterThresholds,
  ScriptTransformConfig,
  ScriptTransformLanguage,
  SessionIndexEntry,
  StoragePolicyMode,
  VaultRetentionPolicy,
} from "../config/types.js";
import type { ScriptSandboxAdapter } from "../sandbox/script-sandbox.js";

export interface HostCommandRunRequest {
  command: string | readonly string[];
  cwd?: string;
  timeoutMs?: number;
}

export interface HostCommandRunResult {
  stdout: string;
  stderr: string;
  executionStatus: ExecutionStatus;
  exitCode: number | null;
  combined?: string;
  durationMs?: number;
}

export interface HostCommandRunner {
  run(request: HostCommandRunRequest): Promise<HostCommandRunResult>;
}

export interface RunScriptProducerInput {
  language: ScriptTransformLanguage;
  code: string;
  label?: string;
  limits?: ScriptTransformLimitsInput;
}

export interface RunScriptFilterInput {
  language: ScriptTransformLanguage;
  code: string;
  label?: string;
  limits?: ScriptTransformLimitsInput;
}

export interface FreeflowRunOptions {
  command?: string | readonly string[];
  script?: RunScriptProducerInput;
  cwd?: string;
  timeoutMs?: number;
  sessionId: string;
  vaultRoot?: string;
  vaultRetention?: VaultRetentionPolicy;
  preserve?: PreserveMode;
  goal?: string;
  thresholds?: Partial<RouterThresholds>;
  filters?: RunOutputFiltersInput;
  scriptFilter?: RunScriptFilterInput;
  scriptTransform?: ScriptTransformConfig;
  scriptSandboxAdapters?: readonly ScriptSandboxAdapter[];
  storagePolicy?: StoragePolicyMode;
}

type NormalizedRunProducer =
  | { kind: "command"; command: string | readonly string[]; producer: ProducerDescriptor }
  | { kind: "script"; command: string; script: RunScriptProducerInput };

export async function freeflowRun(
  options: FreeflowRunOptions,
  runner: HostCommandRunner,
): Promise<CommandRoutedResult> {
  const preserve = options.preserve ?? "important";
  const producerValidation = normalizeRunProducer(options);
  if (!producerValidation.ok) {
    return runProducerValidationFailureResult({
      preserve,
      message: producerValidation.message,
      path: producerValidation.path,
    });
  }
  const runProducer = producerValidation.producer;
  const command = runProducer.command;
  const validationProducer: ProducerDescriptor = runProducer.kind === "script" ? { kind: "script", name: `script:${runProducer.script.language}` } : runProducer.producer;

  const filterValidation = normalizeRunOutputFilters(options.filters);
  if (!filterValidation.ok) {
    return commandFilterValidationFailureResult({
      command,
      producer: validationProducer,
      preserve,
      message: filterValidation.message,
      path: filterValidation.path,
    });
  }
  const scriptFilterValidation = normalizeRunScriptFilter(options.scriptFilter);
  if (!scriptFilterValidation.ok) {
    return commandScriptFilterValidationFailureResult({
      command,
      producer: validationProducer,
      preserve,
      message: scriptFilterValidation.message,
      path: scriptFilterValidation.path,
    });
  }
  const filters = hasRunOutputFilters(filterValidation.filters) ? filterValidation.filters : undefined;
  const scriptFilter = scriptFilterValidation.scriptFilter;
  const thresholds = { ...DEFAULT_ROUTER_THRESHOLDS, ...options.thresholds };
  const vaultOptions: { root?: string; retention?: VaultRetentionPolicy } = {};
  if (options.vaultRoot !== undefined) {
    vaultOptions.root = options.vaultRoot;
  }
  if (options.vaultRetention !== undefined) {
    vaultOptions.retention = options.vaultRetention;
  }
  const vault = createVault(vaultOptions);

  let runResult: HostCommandRunResult;
  let producer: ProducerDescriptor = runProducer.kind === "command" ? runProducer.producer : { kind: "script", name: `script:${runProducer.script.language}` };
  let scriptProducer: CommandRoutedResult["scriptProducer"];
  if (runProducer.kind === "command") {
    try {
      const runRequest: HostCommandRunRequest = { command: runProducer.command };
      if (options.cwd !== undefined) {
        runRequest.cwd = options.cwd;
      }
      if (options.timeoutMs !== undefined) {
        runRequest.timeoutMs = options.timeoutMs;
      }
      runResult = await runner.run(runRequest);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        toolStatus: "error",
        decisionId: decisionId("run-error", commandText(command), message),
        preserve,
        outputId: "",
        execution: { status: "failed", exitCode: null },
        producer,
        persistence: { status: "not_persisted", recoverability: "none" },
        routing: {
          status: "failed",
          route: "run",
          reason: `Adapter-provided runner failed before command output could be captured: ${message}`,
        },
        recovery: {
          how: "No command output was captured. Retry through the host-approved runner or use the host-native shell tool if direct raw behavior is required.",
        },
      };
    }
  } else {
    const scriptExecutionOptions = {
      operation: runScriptProducerOperation(runProducer.script),
      scriptSandboxAdapters: options.scriptSandboxAdapters ?? [],
    };
    const limits = scriptProducerLimits(runProducer.script, options.timeoutMs);
    if (limits !== undefined) {
      Object.assign(scriptExecutionOptions, { limits });
    }
    if (options.scriptTransform !== undefined) {
      Object.assign(scriptExecutionOptions, { scriptTransform: options.scriptTransform });
    }
    const scriptExecution = await executeSandboxedScriptOperation(scriptExecutionOptions);
    scriptProducer = runScriptProducerMetadata(runProducer.script, scriptExecution);
    producer = scriptProducerDescriptor(runProducer.script, scriptExecution);
    if (!scriptExecution.ok) {
      return scriptProducerExecutionFailureResult({
        command,
        preserve,
        producer,
        scriptProducer,
        execution: scriptExecution,
      });
    }
    runResult = scriptExecutionResult(scriptExecution);
  }

  const combined = runResult.combined ?? combineOutputSections(runResult.stdout, runResult.stderr);
  let record: CommandOutputRecord | MetadataOutputRecord | undefined;
  let duplicate: SessionIndexEntry | undefined;

  const fingerprints = commandOutputFingerprints({
    command,
    stdout: runResult.stdout,
    stderr: runResult.stderr,
    combined,
    executionStatus: runResult.executionStatus,
    exitCode: runResult.exitCode,
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
  });
  try {
    duplicate = await findExactDuplicateCommandOutput(vault, {
      sessionId: options.sessionId,
      fingerprints,
    });
  } catch {
    duplicate = undefined;
  }

  const storagePolicy = options.storagePolicy ?? DEFAULT_STORAGE_POLICY;
  const storageParser = parseCommandOutput({
    command,
    executionStatus: runResult.executionStatus,
    exitCode: runResult.exitCode,
    stdout: runResult.stdout,
    stderr: runResult.stderr,
    combined,
    ...(options.goal !== undefined ? { goal: options.goal } : {}),
  });
  const reducerRoute = selectRunReducerRoute({
    command,
    ...(options.goal !== undefined ? { goal: options.goal } : {}),
    executionStatus: runResult.executionStatus,
    stdout: runResult.stdout,
    stderr: runResult.stderr,
    combined,
    preserve,
    thresholds,
    hasFilters: filters !== undefined,
    hasScriptFilter: scriptFilter !== undefined,
  });
  const storageInput = {
    policy: storagePolicy,
    command,
    producerKind: runProducer.kind,
    preserve,
    executionStatus: runResult.executionStatus,
    outputBytes: byteLength(combined),
    outputLines: countLines(combined),
    thresholds,
    parserName: storageParser.parser.name,
    hasFilters: filters !== undefined,
    hasScriptFilter: scriptFilter !== undefined,
    hasReducer: reducerRoute.status === "selected",
  };
  if (options.goal !== undefined) {
    Object.assign(storageInput, { goal: options.goal });
  }
  if (duplicate !== undefined) {
    Object.assign(storageInput, { duplicate });
  }
  const storageDecision = decideCommandStorage(storageInput);

  const execution = {
    status: runResult.executionStatus,
    exitCode: runResult.exitCode,
  };
  if (runResult.durationMs !== undefined) {
    Object.assign(execution, { durationMs: runResult.durationMs });
  }

  try {
    const storeOptions = {
      sessionId: options.sessionId,
      command,
      stdout: runResult.stdout,
      stderr: runResult.stderr,
      combined,
      executionStatus: runResult.executionStatus,
      exitCode: runResult.exitCode,
      decisionIds: [decisionId("run", commandText(command), options.sessionId)],
      producer,
    };
    if (options.cwd !== undefined) {
      Object.assign(storeOptions, { cwd: options.cwd });
    }
    if (runResult.durationMs !== undefined) {
      Object.assign(storeOptions, { durationMs: runResult.durationMs });
    }
    const metadataStoreOptions = {
      vault,
      sessionId: options.sessionId,
      command,
      runResult,
      combined,
      fingerprints,
      storageDecision,
      parserName: storageParser.parser.name,
      producer,
    };
    if (options.cwd !== undefined) {
      Object.assign(metadataStoreOptions, { cwd: options.cwd });
    }
    record = storageDecision.mode === "exact"
      ? await storeCommandOutput(vault, storeOptions)
      : await storeCommandMetadataOutput(metadataStoreOptions);

    const routeOptions: RouteCommandOutputOptions = {
      outputId: record.outputId,
      command,
      executionStatus: runResult.executionStatus,
      exitCode: runResult.exitCode,
      stdout: runResult.stdout,
      stderr: runResult.stderr,
      combined,
      preserve,
      thresholds,
      storage: storageDecision,
    };
    if (filters !== undefined) {
      routeOptions.filters = filters;
    }
    if (options.goal !== undefined) {
      routeOptions.goal = options.goal;
    }
    if (reducerRoute.status === "selected") {
      routeOptions.reducer = reducerRoute;
    }
    let routing: CommandRoutingOutcome;
    const duplicateForRouting = duplicate && preserve !== "full" && filters === undefined && scriptFilter === undefined ? duplicate : undefined;
    if (duplicateForRouting) {
      routing = routeDuplicateCommandOutput({
        outputId: record.outputId,
        duplicate: duplicateForRouting,
        storage: storageDecision,
        command,
        executionStatus: runResult.executionStatus,
        exitCode: runResult.exitCode,
      });
    } else if (scriptFilter) {
      const scriptRouteOptions = {
        routeOptions,
        rawRecord: record as CommandOutputRecord,
        sessionId: options.sessionId,
        scriptFilter,
        scriptSandboxAdapters: options.scriptSandboxAdapters ?? [],
      };
      if (options.vaultRoot !== undefined) {
        Object.assign(scriptRouteOptions, { vaultRoot: options.vaultRoot });
      }
      if (options.vaultRetention !== undefined) {
        Object.assign(scriptRouteOptions, { vaultRetention: options.vaultRetention });
      }
      if (options.scriptTransform !== undefined) {
        Object.assign(scriptRouteOptions, { scriptTransform: options.scriptTransform });
      }
      routing = await routeScriptFilteredOutput(scriptRouteOptions);
    } else {
      if (routeOptions.reducer?.status === "selected" && record.kind === "command" && storageDecision.mode === "exact") {
        routeOptions.reducerRecord = await storeReducerOutput({
          vault,
          sessionId: options.sessionId,
          rawRecord: record,
          reducer: routeOptions.reducer,
        });
      }
      routing = routeCommandOutput(routeOptions);
    }

    return {
      toolStatus: "ok",
      decisionId: routing.decisionId,
      outputId: record.outputId,
      recordId: record.recordId,
      preserve,
      execution,
      producer: record.producer,
      persistence: record.persistence,
      ...(routing.lineage !== undefined ? { lineage: routing.lineage } : record.lineage !== undefined ? { lineage: record.lineage } : {}),
      ...(routing.failure !== undefined ? { failure: routing.failure } : {}),
      ...(routing.transformExecution !== undefined ? { transformExecution: routing.transformExecution } : {}),
      ...(routing.evidence !== undefined ? { evidence: routing.evidence } : {}),
      routing: {
        status: routing.routingStatus,
        route: "run",
        reason: routing.reason,
      },
      summary: routing.summary,
      importantLines: routing.importantLines,
      parser: routing.parser,
      ...(routing.filters !== undefined ? { filters: routing.filters } : {}),
      ...(scriptProducer !== undefined ? { scriptProducer } : {}),
      ...(routing.scriptFilter !== undefined ? { scriptFilter: routing.scriptFilter } : {}),
      ...(routing.reducer !== undefined ? { reducer: routing.reducer } : {}),
      recovery: routing.recovery ?? commandRecoveryHint(record.outputId, storageDecision),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return commandRoutingFailureResult({
      command,
      outputId: record?.outputId ?? "",
      record,
      preserve,
      execution,
      stdout: runResult.stdout,
      stderr: runResult.stderr,
      combined,
      errorMessage: message,
      storage: storageDecision,
      producer,
      ...(scriptProducer !== undefined ? { scriptProducer } : {}),
    });
  }
}

interface CommandStorageDecision {
  policy: StoragePolicyMode;
  mode: "exact" | "metadata-only" | "duplicate-metadata";
  exactnessSensitive: boolean;
  exactRecoveryOutputId?: string;
  reason: string;
}

interface RouteCommandOutputOptions {
  outputId: string;
  command: string | readonly string[];
  executionStatus: ExecutionStatus;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  combined: string;
  preserve: PreserveMode;
  thresholds: RouterThresholds;
  storage?: CommandStorageDecision;
  goal?: string;
  filters?: NormalizedRunOutputFilters;
  reducer?: Extract<RunReducerRoute, { status: "selected" }>;
  reducerRecord?: TextOutputRecord;
}

interface CommandRoutingOutcome {
  decisionId: string;
  routingStatus: "routed" | "passed_through" | "partial" | "failed";
  reason: string;
  summary: string;
  importantLines: ImportantLine[];
  parser: CommandParserMetadata;
  filters?: RunOutputFilterMetadata;
  scriptFilter?: CommandRoutedResult["scriptFilter"];
  reducer?: CommandRoutedResult["reducer"];
  failure?: CommandRoutedResult["failure"];
  transformExecution?: CommandRoutedResult["transformExecution"];
  lineage?: CommandRoutedResult["lineage"];
  evidence?: CommandRoutedResult["evidence"];
  recovery?: CommandRoutedResult["recovery"];
}

function routeDuplicateCommandOutput(options: {
  outputId: string;
  duplicate: SessionIndexEntry;
  storage: CommandStorageDecision;
  command: string | readonly string[];
  executionStatus: ExecutionStatus;
  exitCode: number | null;
}): CommandRoutingOutcome {
  const currentVaultText =
    options.storage.mode === "duplicate-metadata"
      ? `Current run stored metadata-only as outputId=${options.outputId}; exact raw output remains recoverable from prior outputId=${options.duplicate.outputId}.`
      : options.outputId === options.duplicate.outputId
        ? `Current run resolved to the same outputId=${options.outputId}.`
        : `Current raw output was vaulted as outputId=${options.outputId}.`;
  const statusText = `executionStatus=${options.executionStatus} exitCode=${options.exitCode}`;

  return {
    decisionId: decisionId("run-route", options.outputId, "exact-duplicate", options.duplicate.outputId),
    routingStatus: "partial",
    reason: `Exact duplicate run output matched previous outputId=${options.duplicate.outputId} by exact output hash and producer/cwd/status fingerprint (${statusText}); returning a compact duplicate note instead of re-injecting repeated output. ${currentVaultText}`,
    summary: `Run output is an exact duplicate of previous outputId=${options.duplicate.outputId}. ${currentVaultText}`,
    importantLines: [],
    parser: {
      name: "duplicate-output",
      confidence: 1,
      fidelity: "exact",
      compressed: true,
      counts: { duplicateOutputs: 1 },
    },
  };
}

function commandRecoveryHint(outputId: string, storage: CommandStorageDecision) {
  if (storage.mode === "exact") {
    return {
      how: `Use freeflow_search with source.kind=vault and outputId=${outputId} to recover exact run output.`,
      outputId,
    };
  }

  if (storage.mode === "duplicate-metadata" && storage.exactRecoveryOutputId) {
    return {
      how: `Current run record is metadata-only outputId=${outputId}; exact duplicate raw output is recoverable with freeflow_search source.kind=vault outputId=${storage.exactRecoveryOutputId}.`,
      outputId: storage.exactRecoveryOutputId,
    };
  }

  return {
    how: `Current run record is metadata-only outputId=${outputId}; exact raw output was not vaulted by storagePolicy=${storage.policy}. Rerun with preserve=full or a verification/diagnosis goal if exact recovery is required.`,
  };
}

function commandStorageReason(storage: CommandStorageDecision | undefined): string {
  if (!storage || storage.mode === "exact") {
    return "raw output was vaulted";
  }
  if (storage.mode === "duplicate-metadata" && storage.exactRecoveryOutputId) {
    return `current output was stored as metadata-only with exact duplicate recovery from outputId=${storage.exactRecoveryOutputId}`;
  }
  return `current output was stored as metadata-only by storagePolicy=${storage.policy}; exact raw output was not vaulted`;
}

function decideCommandStorage(options: {
  policy: StoragePolicyMode;
  command: string | readonly string[];
  producerKind: NormalizedRunProducer["kind"];
  preserve: PreserveMode;
  executionStatus: ExecutionStatus;
  outputBytes: number;
  outputLines: number;
  thresholds: RouterThresholds;
  parserName: string;
  goal?: string;
  hasFilters: boolean;
  hasScriptFilter: boolean;
  hasReducer: boolean;
  duplicate?: SessionIndexEntry;
}): CommandStorageDecision {
  const exactnessSensitive = commandOutputIsExactnessSensitive(options);
  if (options.policy === "store-everything") {
    return { policy: options.policy, mode: "exact", exactnessSensitive, reason: "storagePolicy=store-everything stores every run output exactly." };
  }
  if (!exactnessSensitive) {
    return {
      policy: options.policy,
      mode: "metadata-only",
      exactnessSensitive,
      reason: "Small non-sensitive successful run output is stored metadata-only by storagePolicy=hybrid-dedupe.",
    };
  }
  if (options.duplicate?.outputId && !options.hasScriptFilter) {
    return {
      policy: options.policy,
      mode: "duplicate-metadata",
      exactnessSensitive,
      exactRecoveryOutputId: options.duplicate.outputId,
      reason: `Exactness-sensitive run output duplicates prior exact outputId=${options.duplicate.outputId}; current record stores metadata only.`,
    };
  }
  return {
    policy: options.policy,
    mode: "exact",
    exactnessSensitive,
    reason: "Run output is exactness-sensitive or large/noisy; storagePolicy=hybrid-dedupe stores it exactly.",
  };
}

function commandOutputIsExactnessSensitive(options: {
  command: string | readonly string[];
  producerKind: NormalizedRunProducer["kind"];
  preserve: PreserveMode;
  executionStatus: ExecutionStatus;
  outputBytes: number;
  outputLines: number;
  thresholds: RouterThresholds;
  parserName: string;
  goal?: string;
  hasFilters: boolean;
  hasScriptFilter: boolean;
  hasReducer: boolean;
}): boolean {
  if (options.preserve === "full" || options.executionStatus !== "success" || options.hasFilters || options.hasScriptFilter || options.hasReducer) {
    return true;
  }
  if (options.producerKind === "script") {
    return true;
  }
  if (options.outputBytes > options.thresholds.largeOutputBytes || options.outputLines > options.thresholds.largeOutputLines) {
    return true;
  }
  const goalText = `${options.goal ?? ""} ${commandText(options.command)}`.toLowerCase();
  if (/\b(verify|verification|test|tests|lint|typecheck|type-check|diagnos|debug|build|ci)\b/.test(goalText)) {
    return true;
  }
  return options.parserName !== "generic";
}

async function storeCommandMetadataOutput(options: {
  vault: ReturnType<typeof createVault>;
  sessionId: string;
  command: string | readonly string[];
  cwd?: string;
  runResult: HostCommandRunResult;
  combined: string;
  fingerprints: ReturnType<typeof commandOutputFingerprints>;
  storageDecision: CommandStorageDecision;
  parserName: string;
  producer: ProducerDescriptor;
}): Promise<MetadataOutputRecord> {
  const metadata: Record<string, unknown> = {
    storagePolicy: options.storageDecision.policy,
    storageDecision: options.storageDecision.mode,
    storageReason: options.storageDecision.reason,
    command: options.command,
    executionStatus: options.runResult.executionStatus,
    exitCode: options.runResult.exitCode,
    parserName: options.parserName,
    exactnessSensitive: options.storageDecision.exactnessSensitive,
    byteCounts: {
      stdout: byteLength(options.runResult.stdout),
      stderr: byteLength(options.runResult.stderr),
      combined: byteLength(options.combined),
    },
    lineCounts: {
      stdout: countLines(options.runResult.stdout),
      stderr: countLines(options.runResult.stderr),
      combined: countLines(options.combined),
    },
    fingerprints: options.fingerprints,
  };
  if (options.cwd !== undefined) {
    metadata.cwd = options.cwd;
  }
  if (options.runResult.durationMs !== undefined) {
    metadata.durationMs = options.runResult.durationMs;
  }
  if (options.storageDecision.exactRecoveryOutputId !== undefined) {
    metadata.exactRecoveryOutputId = options.storageDecision.exactRecoveryOutputId;
  }

  return storeMetadataOutput(options.vault, {
    sessionId: options.sessionId,
    sourceKind: options.producer.kind === "script" ? "script" : "other",
    rawLineCount: countLines(options.combined),
    rawByteCount: byteLength(options.combined),
    rawSha256: hash(options.combined),
    decisionIds: [decisionId("run-metadata", commandText(options.command), options.sessionId, options.storageDecision.mode)],
    producer: options.producer,
    metadata,
  });
}

function normalizeRunProducer(options: FreeflowRunOptions):
  | { ok: true; producer: NormalizedRunProducer }
  | { ok: false; path: string; message: string } {
  const hasCommand = options.command !== undefined && options.command !== null;
  const hasScript = options.script !== undefined && options.script !== null;
  if (hasCommand === hasScript) {
    return {
      ok: false,
      path: "$",
      message: hasCommand
        ? "freeflow_run accepts either command or script, not both."
        : "freeflow_run requires either command or script.",
    };
  }

  if (hasCommand) {
    const command = options.command;
    if (typeof command === "string") {
      if (command.trim().length === 0) {
        return { ok: false, path: "$.command", message: "Expected non-empty shell command string." };
      }
      return { ok: true, producer: { kind: "command", command, producer: { kind: "command" } } };
    }
    if (Array.isArray(command) && command.length > 0 && command.every((part) => typeof part === "string" && part.length > 0)) {
      return { ok: true, producer: { kind: "command", command, producer: { kind: "command" } } };
    }
    return { ok: false, path: "$.command", message: "Expected non-empty shell command string or command argument array." };
  }

  const scriptValidation = normalizeRunScriptProducer(options.script);
  if (!scriptValidation.ok) {
    return scriptValidation;
  }
  return {
    ok: true,
    producer: {
      kind: "script",
      command: scriptCommandDescriptor(scriptValidation.script),
      script: scriptValidation.script,
    },
  };
}

function normalizeRunScriptProducer(input: unknown):
  | { ok: true; script: RunScriptProducerInput }
  | { ok: false; path: string; message: string } {
  if (!isRecord(input)) {
    return { ok: false, path: "$.script", message: "freeflow_run script must be an object." };
  }

  const operation: Record<string, unknown> = { kind: "script" };
  if (input.language !== undefined) {
    operation.language = input.language;
  }
  if (input.code !== undefined) {
    operation.code = input.code;
  }
  if (input.label !== undefined) {
    operation.label = input.label;
  }
  const candidate: Record<string, unknown> = {
    sources: runScriptFilterSources("ffout_run_script_producer_validation"),
    operation,
  };
  if (input.limits !== undefined) {
    candidate.limits = input.limits;
  }
  const validation = validateTransformInput(candidate);
  if (!validation.ok) {
    const issue = validation.issues[0] ?? { path: "$.script", message: "Invalid script producer." };
    return {
      ok: false,
      path: issue.path.replace(/^\$\.operation/, "$.script").replace(/^\$\.limits/, "$.script.limits"),
      message: issue.message,
    };
  }

  const script: RunScriptProducerInput = {
    language: input.language as ScriptTransformLanguage,
    code: input.code as string,
  };
  if (input.label !== undefined) {
    script.label = input.label as string;
  }
  if (input.limits !== undefined) {
    script.limits = input.limits as ScriptTransformLimitsInput;
  }
  return { ok: true, script };
}

function runScriptProducerOperation(script: RunScriptProducerInput): ScriptTransformOperation {
  const operation: ScriptTransformOperation = {
    kind: "script",
    language: script.language,
    code: script.code,
  };
  if (script.label !== undefined) {
    operation.label = script.label;
  }
  return operation;
}

function scriptProducerLimits(script: RunScriptProducerInput, timeoutMs: number | undefined): ScriptTransformLimitsInput | undefined {
  if (timeoutMs === undefined || script.limits?.timeoutMs !== undefined) {
    return script.limits;
  }
  return { ...(script.limits ?? {}), timeoutMs };
}

function scriptExecutionResult(execution: Extract<SandboxedScriptOperationResult, { ok: true }>): HostCommandRunResult {
  const result = execution.result;
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    executionStatus: scriptExecutionStatus(result.status),
    exitCode: result.exitCode ?? (result.status === "success" ? 0 : null),
    combined: combineOutputSections(result.stdout ?? "", result.stderr ?? ""),
    ...(result.durationMs !== undefined ? { durationMs: result.durationMs } : {}),
  };
}

function scriptExecutionStatus(status: Extract<SandboxedScriptOperationResult, { ok: true }>["result"]["status"]): ExecutionStatus {
  if (status === "success") {
    return "success";
  }
  if (status === "timed_out") {
    return "timed_out";
  }
  return "failed";
}

function runScriptProducerMetadata(
  script: RunScriptProducerInput,
  execution: SandboxedScriptOperationResult,
): NonNullable<CommandRoutedResult["scriptProducer"]> {
  const metadata: NonNullable<CommandRoutedResult["scriptProducer"]> = {
    status: execution.ok ? execution.result.status : execution.executionStatus === "unavailable" ? "unavailable" : "failed",
    language: script.language,
    policy: "sandboxed",
    rawScriptPersistence: "disabled",
    codeSha256: scriptCodeSha256(script),
    limits: execution.limits,
    operation: execution.operation,
  };
  if (script.label !== undefined) {
    metadata.label = script.label;
  }
  if (execution.ok) {
    metadata.adapterId = execution.adapterId;
    metadata.adapterVersion = execution.adapterVersion;
    if (execution.runtime !== undefined) {
      metadata.runtime = execution.runtime;
    }
    metadata.stdoutBytes = byteLength(execution.result.stdout ?? "");
    metadata.stderrBytes = byteLength(execution.result.stderr ?? "");
    if (execution.result.exitCode !== undefined) {
      metadata.exitCode = execution.result.exitCode;
    }
    if (execution.result.durationMs !== undefined) {
      metadata.durationMs = execution.result.durationMs;
    }
  } else {
    if (execution.adapterId !== undefined) {
      metadata.adapterId = execution.adapterId;
    }
    if (execution.adapterVersion !== undefined) {
      metadata.adapterVersion = execution.adapterVersion;
    }
    metadata.failure = { kind: execution.failureKind, message: execution.message };
    metadata.transformExecution = {
      status: execution.executionStatus,
      failureKind: execution.failureKind,
      message: execution.message,
    };
  }
  return metadata;
}

function scriptProducerDescriptor(script: RunScriptProducerInput, execution: SandboxedScriptOperationResult): ProducerDescriptor {
  const descriptor: ProducerDescriptor = {
    kind: "script",
    name: script.label ?? `script:${script.language}`,
  };
  if (execution.ok) {
    descriptor.adapter = execution.adapterId;
  } else if (execution.adapterId !== undefined) {
    descriptor.adapter = execution.adapterId;
  }
  return descriptor;
}

function scriptCommandDescriptor(script: RunScriptProducerInput): string {
  const label = script.label ? ` label=${JSON.stringify(script.label)}` : "";
  return `script:${script.language} code=${scriptCodeSha256(script)}${label}`;
}

function scriptCodeSha256(script: Pick<RunScriptProducerInput, "code">): string {
  return `sha256_${hash(script.code)}`;
}

function runProducerValidationFailureResult(options: {
  preserve: PreserveMode;
  message: string;
  path: string;
}): CommandRoutedResult {
  return {
    toolStatus: "error",
    decisionId: decisionId("run-producer-validation", options.path, options.message),
    outputId: "",
    preserve: options.preserve,
    execution: { status: "failed", exitCode: null },
    producer: { kind: "other", name: "freeflow_run" },
    persistence: { status: "not_persisted", recoverability: "none" },
    routing: {
      status: "failed",
      route: "run",
      reason: `Invalid freeflow_run producer at ${options.path}: ${options.message}`,
    },
    summary: "Run producer was not executed because freeflow_run input was invalid.",
    recovery: {
      how: "No command or script output was captured. Fix the freeflow_run producer input and rerun.",
    },
  };
}

function scriptProducerExecutionFailureResult(options: {
  command: string | readonly string[];
  preserve: PreserveMode;
  producer: ProducerDescriptor;
  scriptProducer: NonNullable<CommandRoutedResult["scriptProducer"]>;
  execution: Extract<SandboxedScriptOperationResult, { ok: false }>;
}): CommandRoutedResult {
  return {
    toolStatus: "error",
    decisionId: decisionId("run-script-producer", commandText(options.command), options.execution.failureKind, options.execution.message),
    outputId: "",
    preserve: options.preserve,
    execution: { status: "failed", exitCode: null },
    producer: options.producer,
    scriptProducer: options.scriptProducer,
    failure: {
      kind: options.execution.failureKind,
      message: options.execution.message,
    },
    transformExecution: {
      status: options.execution.executionStatus,
      failureKind: options.execution.failureKind,
      message: options.execution.message,
    },
    persistence: { status: "not_persisted", recoverability: "none" },
    routing: {
      status: "failed",
      route: "run",
      reason: `Sandboxed script producer could not execute: ${options.execution.message}`,
    },
    summary: "Script producer was not executed; no stdout/stderr was captured.",
    recovery: {
      how: "No script output was captured. Enable scriptTransform with a proof-backed sandbox adapter, fix the script producer input, or use a shell command when host execution is intentionally required.",
    },
  };
}

function commandFilterValidationFailureResult(options: {
  command: string | readonly string[];
  producer: ProducerDescriptor;
  preserve: PreserveMode;
  message: string;
  path: string;
}): CommandRoutedResult {
  return {
    toolStatus: "error",
    decisionId: decisionId("run-filter-validation", commandText(options.command), options.path, options.message),
    outputId: "",
    preserve: options.preserve,
    execution: { status: "failed", exitCode: null },
    producer: options.producer,
    persistence: { status: "not_persisted", recoverability: "none" },
    routing: {
      status: "failed",
      route: "run",
      reason: `Invalid freeflow_run filters at ${options.path}: ${options.message}`,
    },
    summary: "Run producer was not executed because freeflow_run filters were invalid.",
    recovery: {
      how: "No command or script output was captured. Fix the declarative filter and rerun through freeflow_run.",
    },
  };
}

function commandScriptFilterValidationFailureResult(options: {
  command: string | readonly string[];
  producer: ProducerDescriptor;
  preserve: PreserveMode;
  message: string;
  path: string;
}): CommandRoutedResult {
  return {
    toolStatus: "error",
    decisionId: decisionId("run-script-filter-validation", commandText(options.command), options.path, options.message),
    outputId: "",
    preserve: options.preserve,
    execution: { status: "failed", exitCode: null },
    producer: options.producer,
    persistence: { status: "not_persisted", recoverability: "none" },
    routing: {
      status: "failed",
      route: "run",
      reason: `Invalid freeflow_run scriptFilter at ${options.path}: ${options.message}`,
    },
    summary: "Run producer was not executed because freeflow_run scriptFilter was invalid.",
    recovery: {
      how: "No command or script output was captured. Fix the sandboxed script filter and rerun through freeflow_run.",
    },
  };
}

function commandRoutingFailureResult(options: {
  command: string | readonly string[];
  outputId: string;
  record: CommandOutputRecord | MetadataOutputRecord | undefined;
  preserve: PreserveMode;
  execution: CommandRoutedResult["execution"];
  stdout: string;
  stderr: string;
  combined: string;
  errorMessage: string;
  storage?: CommandStorageDecision;
  producer: ProducerDescriptor;
  scriptProducer?: CommandRoutedResult["scriptProducer"];
}): CommandRoutedResult {
  const { stream, text } = routedCommandText({
    outputId: options.outputId,
    command: options.command,
    executionStatus: options.execution.status,
    exitCode: options.execution.exitCode,
    stdout: options.stdout,
    stderr: options.stderr,
    combined: options.combined,
    preserve: options.preserve,
    thresholds: DEFAULT_ROUTER_THRESHOLDS,
  });
  const fallback = assembleTextEvidence({ stream, text });
  const parser: CommandParserMetadata = {
    name: "router-fallback",
    confidence: 0,
    fidelity: fallback.fidelity,
    compressed: fallback.compressed,
  };
  const recovery = options.outputId
    ? options.storage !== undefined
      ? commandRecoveryHint(options.outputId, options.storage)
      : {
          how: `Routing failed after vault capture; use freeflow_search with source.kind=vault and outputId=${options.outputId} to recover exact run output.`,
          outputId: options.outputId,
        }
    : {
        how: "Run output could not be vaulted. A bounded in-memory preview was returned; rerun through the appropriate producer if exact recovery is required.",
      };

  return {
    toolStatus: "error",
    decisionId: decisionId("run-route-error", commandText(options.command), options.errorMessage),
    outputId: options.outputId,
    ...(options.record !== undefined ? { recordId: options.record.recordId } : {}),
    preserve: options.preserve,
    execution: options.execution,
    producer: options.record?.producer ?? options.producer,
    persistence: options.record?.persistence ?? { status: "not_persisted", recoverability: "none" },
    ...(options.record?.lineage !== undefined ? { lineage: options.record.lineage } : {}),
    ...(options.scriptProducer !== undefined ? { scriptProducer: options.scriptProducer } : {}),
    routing: {
      status: "failed",
      route: "run",
      reason: `Run producer executed, but Freeflow routing failed after execution: ${options.errorMessage}`,
    },
    summary: "Run producer executed, but Freeflow routing failed after execution.",
    importantLines: fallback.importantLines,
    parser,
    recovery,
  };
}

// Keep exactness-sensitive command routing aligned with
// skills/output-router/references/safety-policy.md.
function routeCommandOutput(options: RouteCommandOutputOptions): CommandRoutingOutcome {
  const outputBytes = byteLength(options.combined);
  const outputLines = countLines(options.combined);
  const isLarge = outputBytes > options.thresholds.largeOutputBytes || outputLines > options.thresholds.largeOutputLines;
  const parseInput = {
    command: options.command,
    executionStatus: options.executionStatus,
    exitCode: options.exitCode,
    stdout: options.stdout,
    stderr: options.stderr,
    combined: options.combined,
  };
  if (options.goal !== undefined) {
    Object.assign(parseInput, { goal: options.goal });
  }
  const parsed = parseCommandOutput(parseInput);
  const parser = parsed.parser;
  const statusText = `executionStatus=${options.executionStatus} exitCode=${options.exitCode}`;
  const parserText = parserTextFor(parser);

  if (options.filters) {
    return routeFilteredOutput({ ...options, filters: options.filters }, parsed, statusText);
  }

  if (options.preserve === "full") {
    return routeFullOutput(options, parsed, outputBytes, outputLines, statusText);
  }

  if (options.executionStatus !== "success") {
    return {
      decisionId: decisionId("run-route", options.outputId, options.executionStatus, "failed", parser.name),
      routingStatus: "routed",
      reason: `Command failed or did not complete (${statusText}); selected failure evidence was returned and ${commandStorageReason(options.storage)} before routing (${parserText}).`,
      summary: parsed.summary ?? `Command ${options.executionStatus} with exitCode=${options.exitCode}.`,
      importantLines: parsed.importantLines,
      parser,
    };
  }

  if (options.reducer) {
    return routeReducedCommandOutput({ ...options, reducer: options.reducer }, parsed, statusText);
  }

  if (isLarge) {
    return {
      decisionId: decisionId("run-route", options.outputId, "large-success", parser.name),
      routingStatus: "partial",
      reason: `Large successful run output (${outputBytes} bytes, ${outputLines} lines): ${commandStorageReason(options.storage)}; bounded important lines were returned instead of full output (${parserText}).`,
      summary: parsed.summary ?? `Command succeeded with ${outputLines} output lines and ${outputBytes} bytes.`,
      importantLines: parsed.importantLines,
      parser,
    };
  }

  const nearRaw = selectNearRawSuccessfulLines(options);
  const nearRawParser = parserWithEvidence(parser, nearRaw);
  return {
    decisionId: decisionId("run-route", options.outputId, "small-success", parser.name, nearRaw.fidelity),
    routingStatus: nearRaw.fidelity === "exact" ? "routed" : "partial",
    reason: `Small successful run output: ${commandStorageReason(options.storage)}; routed evidence was returned near-raw from the captured execution (${parserTextFor(nearRawParser)}).`,
    summary: parsed.summary ?? `Command success with exitCode=${options.exitCode}.`,
    importantLines: nearRaw.importantLines,
    parser: nearRawParser,
  };
}

function routeReducedCommandOutput(
  options: RouteCommandOutputOptions & { reducer: Extract<RunReducerRoute, { status: "selected" }> },
  parsed: ParsedCommandOutput,
  statusText: string,
): CommandRoutingOutcome {
  const importantLines = reducerImportantLines(options.reducer);
  const parser = parserWithReducer(parsed.parser, options.reducer);
  return {
    decisionId: decisionId("run-route", options.outputId, "reducer", options.reducer.result.name, options.reducer.result.version),
    routingStatus: "partial",
    reason: `Reducer ${options.reducer.result.name}@${options.reducer.result.version} selected for successful run output (${statusText}); raw output was vaulted before deterministic reduction (${parserTextFor(parser)}).`,
    summary: options.reducer.result.visibleText,
    importantLines,
    parser,
    reducer: runReducerMetadata(options.outputId, options.reducer, options.reducerRecord),
    ...(options.reducerRecord?.lineage !== undefined ? { lineage: options.reducerRecord.lineage } : {}),
    recovery: commandReducerRecoveryHint(options.outputId, options.reducerRecord?.outputId),
  };
}

function routeFilteredOutput(
  options: RouteCommandOutputOptions & { filters: NormalizedRunOutputFilters },
  parsed: ParsedCommandOutput,
  statusText: string,
): CommandRoutingOutcome {
  const defaultText = routedCommandText(options);
  const filtered = applyRunOutputFilters({
    filters: options.filters,
    defaultStream: defaultText.stream,
    stdout: options.stdout,
    stderr: options.stderr,
    combined: options.combined,
    fallbackImportantLines: parsed.importantLines,
    preserveFallbackFailureEvidence: options.executionStatus !== "success",
    caps: {
      maxLines: options.thresholds.largeOutputLines,
      maxExcerptBytes: options.thresholds.largeOutputBytes,
      maxLineBytes: options.thresholds.largeOutputBytes,
    },
  });
  const parser = parserWithEvidence(parsed.parser, filtered.evidence);
  const fallbackText = filtered.metadata.fallbackPreservedFailureEvidence
    ? " No filtered lines matched, so parsed failure evidence was preserved instead of hiding the failure."
    : "";
  const selectedText = `${filtered.metadata.selectedLines}/${filtered.metadata.sourceLines} line(s) selected`;

  return {
    decisionId: decisionId("run-route", options.outputId, "filtered", filtered.description, parser.name),
    routingStatus: filtered.evidence.compressed ? "partial" : "routed",
    reason: `Run output was vaulted before declarative filters were applied (${statusText}; filters: ${filtered.description}; ${parserTextFor(parser)}).${fallbackText}`,
    summary: `${parsed.summary ?? `Command ${options.executionStatus} with exitCode=${options.exitCode}.`} Filtered routed evidence: ${selectedText} from ${filtered.stream}.`,
    importantLines: filtered.evidence.importantLines,
    parser: {
      ...parser,
      counts: {
        ...(parser.counts ?? {}),
        filterSourceLines: filtered.metadata.sourceLines,
        filterSelectedLines: filtered.metadata.selectedLines,
      },
    },
    filters: filtered.metadata,
  };
}

async function routeScriptFilteredOutput(options: {
  routeOptions: RouteCommandOutputOptions;
  rawRecord: CommandOutputRecord;
  sessionId: string;
  vaultRoot?: string;
  vaultRetention?: VaultRetentionPolicy;
  scriptFilter: RunScriptFilterInput;
  scriptTransform?: ScriptTransformConfig;
  scriptSandboxAdapters: readonly ScriptSandboxAdapter[];
}): Promise<CommandRoutingOutcome> {
  const { routeOptions, rawRecord, scriptFilter } = options;
  const baseRouting = routeCommandOutput(routeOptions);
  const operation: { kind: "script"; language: ScriptTransformLanguage; code: string; label?: string } = {
    kind: "script",
    language: scriptFilter.language,
    code: scriptFilter.code,
  };
  if (scriptFilter.label !== undefined) {
    operation.label = scriptFilter.label;
  }

  const transformOptions = {
    sessionId: options.sessionId,
    sources: runScriptFilterSources(rawRecord.outputId),
    operation,
    preserve: routeOptions.preserve,
    thresholds: routeOptions.thresholds,
    scriptSandboxAdapters: options.scriptSandboxAdapters,
  };
  if (options.scriptTransform !== undefined) {
    Object.assign(transformOptions, { scriptTransform: options.scriptTransform });
  }
  if (options.vaultRoot !== undefined) {
    Object.assign(transformOptions, { vaultRoot: options.vaultRoot });
  }
  if (options.vaultRetention !== undefined) {
    Object.assign(transformOptions, { vaultRetention: options.vaultRetention });
  }
  if (scriptFilter.limits !== undefined) {
    Object.assign(transformOptions, { limits: scriptFilter.limits });
  }

  const scriptResult = await freeflowTransform(transformOptions);
  const metadata = runScriptFilterMetadata(scriptFilter, scriptResult, rawRecord.outputId);

  if (isSuccessfulScriptFilterResult(scriptResult)) {
    const importantLines = evidencePacketsAsImportantLines(scriptResult.evidence);
    const parser: CommandParserMetadata = {
      name: `script-filter:${scriptFilter.language}`,
      confidence: 1,
      fidelity: "exact",
      compressed: scriptResult.routing.status === "partial",
      counts: {
        scriptEvidencePackets: scriptResult.evidence?.length ?? 0,
      },
    };

    return {
      decisionId: decisionId("run-route", rawRecord.outputId, "script-filter", scriptResult.outputId, scriptFilter.language),
      routingStatus: scriptResult.routing.status,
      reason: `Run output was vaulted as outputId=${rawRecord.outputId} before a sandboxed ${scriptFilter.language} script filter ran over captured stdout/stderr/combined. ${scriptResult.routing.reason}`,
      summary: `${baseRouting.summary} Script filter completed; transformed outputId=${scriptResult.outputId}.`,
      importantLines,
      parser,
      ...(baseRouting.filters !== undefined ? { filters: baseRouting.filters } : {}),
      scriptFilter: metadata,
      ...(scriptResult.lineage !== undefined ? { lineage: scriptResult.lineage } : {}),
      ...(scriptResult.evidence !== undefined ? { evidence: scriptResult.evidence } : {}),
      recovery: commandScriptFilterRecoveryHint(rawRecord.outputId, scriptResult.outputId),
    };
  }

  const failureMessage = scriptResult.failure?.message ?? scriptResult.routing.reason;
  return {
    ...baseRouting,
    decisionId: decisionId("run-route", rawRecord.outputId, "script-filter-failed", scriptFilter.language, failureMessage),
    routingStatus: baseRouting.routingStatus === "failed" ? "failed" : "partial",
    reason: `Run producer executed and raw output was vaulted as outputId=${rawRecord.outputId}, but the sandboxed ${scriptFilter.language} script filter did not produce transformed output: ${failureMessage} Base run evidence was returned instead.`,
    summary: `${baseRouting.summary} Script filter did not produce transformed output: ${failureMessage}`,
    parser: {
      ...baseRouting.parser,
      counts: {
        ...(baseRouting.parser.counts ?? {}),
        scriptFilterFailures: 1,
      },
    },
    scriptFilter: metadata,
    ...(scriptResult.failure !== undefined ? { failure: scriptResult.failure } : {}),
    ...(scriptResult.transformExecution !== undefined ? { transformExecution: scriptResult.transformExecution } : {}),
    ...(scriptResult.lineage !== undefined ? { lineage: scriptResult.lineage } : {}),
    recovery: commandScriptFilterRecoveryHint(rawRecord.outputId),
  };
}

function routeFullOutput(
  options: RouteCommandOutputOptions,
  parsed: ParsedCommandOutput,
  outputBytes: number,
  outputLines: number,
  statusText: string,
): CommandRoutingOutcome {
  const full = selectFullOutputLines(options);
  const parser = parserWithEvidence(parsed.parser, full);
  const routedStatus = full.fidelity === "exact" ? "routed" : "partial";
  const capText = `${options.thresholds.largeOutputBytes} byte full-context cap`;
  const reason =
    full.fidelity === "exact"
      ? `preserve=full returned exact run output within the ${capText} after ${commandStorageReason(options.storage)} (${statusText}; ${parserTextFor(parser)}).`
      : `preserve=full output exceeded the bounded context policy (${outputBytes} bytes, ${outputLines} lines); a bounded preview was returned with raw vault recovery (${statusText}; ${parserTextFor(parser)}).`;

  return {
    decisionId: decisionId("run-route", options.outputId, "preserve-full", full.fidelity, parsed.parser.name),
    routingStatus: routedStatus,
    reason,
    summary: parsed.summary ?? `Command ${options.executionStatus} with exitCode=${options.exitCode}.`,
    importantLines: full.importantLines,
    parser,
  };
}

function selectNearRawSuccessfulLines(options: RouteCommandOutputOptions): BoundedEvidence {
  const { stream, text } = routedCommandText(options);
  return assembleTextEvidence({
    stream,
    text,
    caps: {
      maxLines: options.thresholds.largeOutputLines,
      maxExcerptBytes: options.thresholds.largeOutputBytes,
      maxLineBytes: options.thresholds.largeOutputBytes,
    },
  });
}

function selectFullOutputLines(options: RouteCommandOutputOptions): BoundedEvidence {
  const { stream, text } = routedCommandText(options);
  return assembleTextEvidence({
    stream,
    text,
    caps: {
      maxLines: Number.MAX_SAFE_INTEGER,
      maxExcerptBytes: options.thresholds.largeOutputBytes,
      maxLineBytes: options.thresholds.largeOutputBytes,
    },
  });
}

function routedCommandText(options: RouteCommandOutputOptions): { stream: ImportantLine["stream"]; text: string } {
  if (options.stdout.length > 0 && options.stderr.length === 0) {
    return { stream: "stdout", text: options.stdout };
  }
  if (options.stderr.length > 0 && options.stdout.length === 0) {
    return { stream: "stderr", text: options.stderr };
  }
  return { stream: "combined", text: options.combined };
}

function runScriptFilterSources(outputId: string) {
  return [
    { kind: "vault" as const, outputId, stream: "stdout" as const, alias: "stdout" },
    { kind: "vault" as const, outputId, stream: "stderr" as const, alias: "stderr" },
    { kind: "vault" as const, outputId, stream: "combined" as const, alias: "combined" },
  ];
}

function isSuccessfulScriptFilterResult(result: TransformRoutedResult | FailureRoutedResult): result is TransformRoutedResult {
  return result.toolStatus === "ok" && result.failure === undefined && typeof result.outputId === "string" && result.outputId.length > 0;
}

function runScriptFilterMetadata(
  input: RunScriptFilterInput,
  result: TransformRoutedResult | FailureRoutedResult,
  rawOutputId: string,
): NonNullable<CommandRoutedResult["scriptFilter"]> {
  const metadata: NonNullable<CommandRoutedResult["scriptFilter"]> = {
    status: isSuccessfulScriptFilterResult(result) ? "success" : result.transformExecution?.status ?? "failed",
    language: input.language,
    sourceAliases: ["stdout", "stderr", "combined"],
    rawOutputId,
  };
  if (input.label !== undefined) {
    metadata.label = input.label;
  }
  if ("operation" in result && result.operation !== undefined) {
    metadata.operation = result.operation;
  }
  if (result.outputId !== undefined) {
    metadata.outputId = result.outputId;
  }
  if (result.recordId !== undefined) {
    metadata.recordId = result.recordId;
  }
  if (result.persistence !== undefined) {
    metadata.persistence = result.persistence;
  }
  if (result.lineage !== undefined) {
    metadata.lineage = result.lineage;
  }
  if (result.failure !== undefined) {
    metadata.failure = result.failure;
  }
  if (result.transformExecution !== undefined) {
    metadata.transformExecution = result.transformExecution;
  }
  if ("summary" in result && result.summary !== undefined) {
    metadata.summary = result.summary;
  }
  return metadata;
}

function evidencePacketsAsImportantLines(evidence: CommandRoutedResult["evidence"]): ImportantLine[] {
  if (!Array.isArray(evidence)) {
    return [];
  }
  return evidence
    .filter((packet) => typeof packet.excerpt === "string" && typeof packet.lines === "string")
    .map((packet) => ({
      stream: "combined" as const,
      lines: packet.lines!,
      excerpt: packet.excerpt,
    }));
}

function storeReducerOutput(options: {
  vault: ReturnType<typeof createVault>;
  sessionId: string;
  rawRecord: CommandOutputRecord;
  reducer: Extract<RunReducerRoute, { status: "selected" }>;
}): Promise<TextOutputRecord> {
  const operation = `run-reducer:${options.reducer.result.name}@${options.reducer.result.version}`;
  return storeTextOutput(options.vault, {
    sessionId: options.sessionId,
    raw: options.reducer.result.visibleText,
    sourceKind: "transform",
    decisionIds: [decisionId("run-reducer", options.rawRecord.outputId, options.reducer.result.name, options.reducer.result.version)],
    producer: { kind: "transform", name: "freeflow_run reducer" },
    lineage: {
      sourceRecordIds: [options.rawRecord.recordId],
      sourceOutputIds: [options.rawRecord.outputId],
      operation,
      operationHash: hash(JSON.stringify({ operation, sourceOutputId: options.rawRecord.outputId, facts: options.reducer.result.facts })),
    },
  });
}

function runReducerMetadata(
  rawOutputId: string,
  reducer: Extract<RunReducerRoute, { status: "selected" }>,
  reducerRecord: TextOutputRecord | undefined,
): NonNullable<CommandRoutedResult["reducer"]> {
  return {
    status: reducerRecord === undefined ? "selected" : "success",
    name: reducer.result.name,
    version: reducer.result.version,
    confidence: reducer.result.confidence,
    rawOutputId,
    summary: reducer.result.visibleText,
    facts: reducer.result.facts,
    ...(reducerRecord !== undefined ? {
      outputId: reducerRecord.outputId,
      recordId: reducerRecord.recordId,
      persistence: reducerRecord.persistence,
      lineage: reducerRecord.lineage,
    } : {}),
  };
}

function commandReducerRecoveryHint(rawOutputId: string, transformedOutputId?: string) {
  if (transformedOutputId) {
    return {
      how: `Raw run output: use freeflow_search with source.kind=vault and outputId=${rawOutputId}. Reducer-transformed output: use freeflow_search with source.kind=vault, outputId=${transformedOutputId}, stream=raw, and an exact lineRange.`,
      outputId: rawOutputId,
    };
  }
  return {
    how: `Reducer output was returned in the structured run result. Raw run output remains recoverable with freeflow_search source.kind=vault outputId=${rawOutputId}.`,
    outputId: rawOutputId,
  };
}

function commandScriptFilterRecoveryHint(rawOutputId: string, transformedOutputId?: string) {
  if (transformedOutputId) {
    return {
      how: `Raw run output: use freeflow_search with source.kind=vault and outputId=${rawOutputId}. Script-filtered transformed output: use freeflow_search with source.kind=vault, outputId=${transformedOutputId}, stream=raw, and an exact lineRange.`,
      outputId: rawOutputId,
    };
  }
  return {
    how: `Script filter did not produce transformed output. Raw run output remains recoverable with freeflow_search source.kind=vault outputId=${rawOutputId}.`,
    outputId: rawOutputId,
  };
}

function normalizeRunScriptFilter(input: unknown):
  | { ok: true; scriptFilter?: RunScriptFilterInput }
  | { ok: false; path: string; message: string } {
  if (input === undefined || input === null) {
    return { ok: true };
  }
  if (!isRecord(input)) {
    return { ok: false, path: "$.scriptFilter", message: "freeflow_run scriptFilter must be an object." };
  }

  const operation: Record<string, unknown> = { kind: "script" };
  if (input.language !== undefined) {
    operation.language = input.language;
  }
  if (input.code !== undefined) {
    operation.code = input.code;
  }
  if (input.label !== undefined) {
    operation.label = input.label;
  }
  const candidate: Record<string, unknown> = {
    sources: runScriptFilterSources("ffout_run_script_filter_validation"),
    operation,
  };
  if (input.limits !== undefined) {
    candidate.limits = input.limits;
  }
  const validation = validateTransformInput(candidate);
  if (!validation.ok) {
    const issue = validation.issues[0] ?? { path: "$.scriptFilter", message: "Invalid script filter." };
    return {
      ok: false,
      path: issue.path.replace(/^\$\.operation/, "$.scriptFilter").replace(/^\$\.limits/, "$.scriptFilter.limits"),
      message: issue.message,
    };
  }

  const scriptFilter: RunScriptFilterInput = {
    language: input.language as ScriptTransformLanguage,
    code: input.code as string,
  };
  if (input.label !== undefined) {
    scriptFilter.label = input.label as string;
  }
  if (input.limits !== undefined) {
    scriptFilter.limits = input.limits as ScriptTransformLimitsInput;
  }
  return { ok: true, scriptFilter };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parserWithEvidence(parser: CommandParserMetadata, evidence: BoundedEvidence): CommandParserMetadata {
  return {
    ...parser,
    fidelity: parser.fidelity === "lossy" || evidence.fidelity === "lossy" ? "lossy" : "exact",
    compressed: evidence.compressed,
  };
}

function parserTextFor(parser: CommandParserMetadata): string {
  return `parser=${parser.name} confidence=${parser.confidence.toFixed(2)} fidelity=${parser.fidelity}`;
}

function combineOutputSections(stdout: string, stderr: string): string {
  if (stdout.length === 0) {
    return stderr;
  }
  if (stderr.length === 0) {
    return stdout;
  }
  return `[stdout]\n${stdout}\n[stderr]\n${stderr}`;
}

function commandText(command: string | readonly string[]): string {
  return typeof command === "string" ? command : command.join(" ");
}

function decisionId(...parts: string[]): string {
  return `ffdec_${hash(parts.join("\0")).slice(0, 16)}`;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
