import { createHash } from "node:crypto";

import type {
  TransformExecutionFailure,
  EvidenceLineage,
  EvidencePacket,
  EvidencePersistence,
  FailureExecutionStatus,
  FailureRoutedResult,
  PreserveMode,
  RecoveryHint,
  RouterFailureKind,
  RoutingStatus,
  ToolStatus,
} from "../config/types.js";

export type FailureOperationKind = "transform";

export interface FailureResultOptions {
  kind: RouterFailureKind;
  operation: FailureOperationKind;
  message: string;
  preserve?: PreserveMode;
  executionStatus?: FailureExecutionStatus;
  toolStatus?: ToolStatus;
  routingStatus?: RoutingStatus;
  routingReason?: string;
  persistence?: EvidencePersistence;
  recordId?: string;
  outputId?: string;
  lineage?: EvidenceLineage;
  evidence?: EvidencePacket[];
  decisionSeed?: string;
}

export type TransformFailureOptions = Omit<FailureResultOptions, "kind" | "operation" | "executionStatus">;

export type StorageFailureOptions = Omit<FailureResultOptions, "kind" | "operation" | "executionStatus">;

const DEFAULT_PRESERVE: PreserveMode = "important";

export function storageFailure(options: StorageFailureOptions): FailureRoutedResult {
  return createFailureResult({
    toolStatus: "error",
    routingStatus: "failed",
    ...options,
    kind: "storage_failure",
    operation: "transform",
    executionStatus: "failed",
    persistence: options.persistence ?? noPersistence(),
  });
}

export function scriptTransformDisabledFailure(options: TransformFailureOptions): FailureRoutedResult {
  return createFailureResult({
    ...options,
    kind: "script_transform_disabled",
    operation: "transform",
    executionStatus: "unavailable",
  });
}

export function transformAdapterUnavailableFailure(options: TransformFailureOptions): FailureRoutedResult {
  return createFailureResult({
    ...options,
    kind: "adapter_unavailable",
    operation: "transform",
    executionStatus: "unavailable",
  });
}

export function transformSourceUnavailableFailure(options: TransformFailureOptions): FailureRoutedResult {
  return createFailureResult({
    ...options,
    kind: "transform_source_unavailable",
    operation: "transform",
    executionStatus: "unavailable",
  });
}

export function transformValidationFailure(options: TransformFailureOptions): FailureRoutedResult {
  return createFailureResult({
    ...options,
    kind: "transform_validation_failure",
    operation: "transform",
    executionStatus: "rejected",
  });
}

export function transformExecutionFailure(options: TransformFailureOptions): FailureRoutedResult {
  return createFailureResult({
    ...options,
    kind: "transform_execution_failure",
    operation: "transform",
    executionStatus: "failed",
  });
}

export function createFailureResult(options: FailureResultOptions): FailureRoutedResult {
  const preserve = options.preserve ?? DEFAULT_PRESERVE;
  const persistence = normalizePersistence(options.persistence, options.outputId);
  const routingStatus = options.routingStatus ?? "failed";
  const recovery = recoveryHintForPersistence(persistence);
  const executionStatus = options.executionStatus ?? defaultExecutionStatus(options.kind);
  const result: FailureRoutedResult = {
    toolStatus: options.toolStatus ?? "ok",
    decisionId: failureDecisionId(options),
    preserve,
    routing: {
      status: routingStatus,
      route: "transform",
      reason: options.routingReason ?? failureReason(options.kind, options.operation, options.message, persistence),
    },
    failure: {
      kind: options.kind,
      message: options.message,
    },
    persistence,
    recovery,
    transformExecution: executionFailure(executionStatus, options.kind, options.message),
  };

  if (options.recordId !== undefined) {
    result.recordId = options.recordId;
  }
  if (options.outputId !== undefined) {
    result.outputId = options.outputId;
  }
  if (options.lineage !== undefined) {
    result.lineage = options.lineage;
  }
  if (options.evidence !== undefined) {
    result.evidence = options.evidence;
  }

  return result;
}

function executionFailure(
  status: FailureExecutionStatus,
  failureKind: RouterFailureKind,
  message: string,
): TransformExecutionFailure {
  return { status, failureKind, message };
}

function normalizePersistence(persistence: EvidencePersistence | undefined, outputId: string | undefined): EvidencePersistence {
  const candidate = persistence ?? noPersistence();
  if (candidate.recoverability !== "exact" && candidate.recoverability !== "redacted") {
    return candidate;
  }

  const recoveryOutputId = candidate.recoveryOutputId ?? candidate.outputId ?? outputId;
  if (recoveryOutputId === undefined) {
    return noPersistence();
  }

  return {
    ...candidate,
    recoveryOutputId,
    ...(candidate.outputId !== undefined ? { outputId: candidate.outputId } : {}),
  };
}

function noPersistence(): EvidencePersistence {
  return { status: "not_persisted", recoverability: "none" };
}

function recoveryHintForPersistence(persistence: EvidencePersistence): RecoveryHint {
  const recoveryOutputId = persistence.recoveryOutputId ?? persistence.outputId;

  if (persistence.recoverability === "exact" && recoveryOutputId !== undefined) {
    return {
      how: `Use freeflow_search with source.kind=vault and outputId=${recoveryOutputId} to recover exact transformed content.`,
      outputId: recoveryOutputId,
    };
  }

  if (persistence.recoverability === "redacted" && recoveryOutputId !== undefined) {
    return {
      how: `Use freeflow_search with source.kind=vault and outputId=${recoveryOutputId} to recover redacted persisted content. Exact raw recovery is unavailable.`,
      outputId: recoveryOutputId,
    };
  }

  if (persistence.recoverability === "metadata_only") {
    return {
      how: "Only metadata was persisted for this failure. No raw content stream is recoverable.",
    };
  }

  return {
    how: "No content was persisted for this failure. Recovery is unavailable.",
  };
}

function defaultExecutionStatus(kind: RouterFailureKind): FailureExecutionStatus {
  if (kind === "adapter_unavailable" || kind === "transform_source_unavailable" || kind === "script_transform_disabled") {
    return "unavailable";
  }
  if (kind === "transform_validation_failure") {
    return "rejected";
  }
  return "failed";
}

function failureReason(
  kind: RouterFailureKind,
  operation: FailureOperationKind,
  message: string,
  persistence: EvidencePersistence,
): string {
  return `${operation} failure kind=${kind}: ${message} persistence.status=${persistence.status}; recoverability=${persistence.recoverability}.`;
}

function failureDecisionId(options: FailureResultOptions): string {
  return `ffdec_${hash(JSON.stringify([
    "failure",
    options.kind,
    options.operation,
    options.recordId ?? null,
    options.outputId ?? null,
    options.decisionSeed ?? null,
    options.message,
  ])).slice(0, 16)}`;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
