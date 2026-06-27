import { createHash } from "node:crypto";

import type {
  DeriveExecutionFailure,
  EvidenceLineage,
  EvidencePacket,
  EvidencePersistence,
  FailureExecutionStatus,
  FailureRoutedResult,
  PreserveMode,
  ProducerDescriptor,
  ProducerExecutionFailure,
  RecoveryHint,
  RouterFailureKind,
  RoutingStatus,
  ToolStatus,
} from "../config/types.js";

export type FailureOperationKind = "capture" | "derive";

export interface FailureResultOptions {
  kind: RouterFailureKind;
  operation: FailureOperationKind;
  message: string;
  preserve?: PreserveMode;
  producer?: ProducerDescriptor;
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

export type CaptureFailureOptions = Omit<FailureResultOptions, "kind" | "operation" | "executionStatus"> & {
  producer?: ProducerDescriptor;
};

export type DeriveFailureOptions = Omit<FailureResultOptions, "kind" | "operation" | "executionStatus" | "producer">;

export type StorageFailureOptions = Omit<FailureResultOptions, "kind" | "operation" | "executionStatus"> & {
  operation?: FailureOperationKind;
};

const DEFAULT_PRESERVE: PreserveMode = "important";

export function adapterUnavailableFailure(options: CaptureFailureOptions): FailureRoutedResult {
  return createFailureResult({
    ...options,
    kind: "adapter_unavailable",
    operation: "capture",
    executionStatus: "unavailable",
  });
}

export function unsupportedProducerFailure(options: CaptureFailureOptions): FailureRoutedResult {
  return createFailureResult({
    ...options,
    kind: "unsupported_producer",
    operation: "capture",
    executionStatus: "unsupported",
  });
}

export function mutatingProducerRejectedFailure(options: CaptureFailureOptions): FailureRoutedResult {
  return createFailureResult({
    ...options,
    kind: "mutating_producer_rejected",
    operation: "capture",
    executionStatus: "rejected",
  });
}

export function producerExecutionFailure(options: CaptureFailureOptions): FailureRoutedResult {
  return createFailureResult({
    ...options,
    kind: "producer_execution_failure",
    operation: "capture",
    executionStatus: "failed",
  });
}

export function partialCaptureFailure(options: CaptureFailureOptions): FailureRoutedResult {
  return createFailureResult({
    routingStatus: "partial",
    ...options,
    kind: "partial_capture",
    operation: "capture",
    executionStatus: "partial",
  });
}

export function storageFailure(options: StorageFailureOptions): FailureRoutedResult {
  return createFailureResult({
    toolStatus: "error",
    routingStatus: "failed",
    ...options,
    kind: "storage_failure",
    operation: options.operation ?? "capture",
    executionStatus: "failed",
    persistence: options.persistence ?? noPersistence(),
  });
}

export function redactionFailure(options: StorageFailureOptions): FailureRoutedResult {
  return createFailureResult({
    toolStatus: "error",
    routingStatus: "failed",
    ...options,
    kind: "redaction_failure",
    operation: options.operation ?? "capture",
    executionStatus: "failed",
    persistence: options.persistence ?? noPersistence(),
  });
}

export function scriptDeriveDisabledFailure(options: DeriveFailureOptions): FailureRoutedResult {
  return createFailureResult({
    ...options,
    kind: "script_derive_disabled",
    operation: "derive",
    executionStatus: "unavailable",
  });
}

export function deriveAdapterUnavailableFailure(options: DeriveFailureOptions): FailureRoutedResult {
  return createFailureResult({
    ...options,
    kind: "adapter_unavailable",
    operation: "derive",
    executionStatus: "unavailable",
  });
}

export function deriveSourceUnavailableFailure(options: DeriveFailureOptions): FailureRoutedResult {
  return createFailureResult({
    ...options,
    kind: "derive_source_unavailable",
    operation: "derive",
    executionStatus: "unavailable",
  });
}

export function deriveValidationFailure(options: DeriveFailureOptions): FailureRoutedResult {
  return createFailureResult({
    ...options,
    kind: "derive_validation_failure",
    operation: "derive",
    executionStatus: "rejected",
  });
}

export function deriveExecutionFailure(options: DeriveFailureOptions): FailureRoutedResult {
  return createFailureResult({
    ...options,
    kind: "derive_execution_failure",
    operation: "derive",
    executionStatus: "failed",
  });
}

export function createFailureResult(options: FailureResultOptions): FailureRoutedResult {
  const preserve = options.preserve ?? DEFAULT_PRESERVE;
  const persistence = normalizePersistence(options.persistence, options.outputId);
  const routingStatus = options.routingStatus ?? (options.kind === "partial_capture" ? "partial" : "failed");
  const recovery = recoveryHintForPersistence(persistence);
  const route = options.operation === "derive" ? "derive" : "capture";
  const executionStatus = options.executionStatus ?? defaultExecutionStatus(options.kind);
  const result: FailureRoutedResult = {
    toolStatus: options.toolStatus ?? "ok",
    decisionId: failureDecisionId(options),
    preserve,
    routing: {
      status: routingStatus,
      route,
      reason: options.routingReason ?? failureReason(options.kind, options.operation, options.message, persistence),
    },
    failure: {
      kind: options.kind,
      message: options.message,
    },
    persistence,
    recovery,
  };

  if (options.recordId !== undefined) {
    result.recordId = options.recordId;
  }
  if (options.outputId !== undefined) {
    result.outputId = options.outputId;
  }
  if (options.producer !== undefined) {
    result.producer = options.producer;
  }
  if (options.lineage !== undefined) {
    result.lineage = options.lineage;
  }
  if (options.evidence !== undefined) {
    result.evidence = options.evidence;
  }

  if (options.operation === "derive") {
    result.deriveExecution = executionFailure(executionStatus, options.kind, options.message);
  } else {
    result.producerExecution = executionFailure(executionStatus, options.kind, options.message);
  }

  return result;
}

function executionFailure(
  status: FailureExecutionStatus,
  failureKind: RouterFailureKind,
  message: string,
): ProducerExecutionFailure | DeriveExecutionFailure {
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
      how: `Use freeflow_retrieve with source.kind=vault and outputId=${recoveryOutputId} to recover exact captured content.`,
      outputId: recoveryOutputId,
    };
  }

  if (persistence.recoverability === "redacted" && recoveryOutputId !== undefined) {
    return {
      how: `Use freeflow_retrieve with source.kind=vault and outputId=${recoveryOutputId} to recover redacted persisted content. Exact raw recovery is unavailable.`,
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
  if (kind === "adapter_unavailable" || kind === "derive_source_unavailable" || kind === "script_derive_disabled") {
    return "unavailable";
  }
  if (kind === "unsupported_producer") {
    return "unsupported";
  }
  if (kind === "mutating_producer_rejected" || kind === "derive_validation_failure") {
    return "rejected";
  }
  if (kind === "partial_capture") {
    return "partial";
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
    options.producer ?? null,
    options.recordId ?? null,
    options.outputId ?? null,
    options.decisionSeed ?? null,
    options.message,
  ])).slice(0, 16)}`;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
