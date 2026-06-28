import { createHash } from "node:crypto";
const DEFAULT_PRESERVE = "important";
export function storageFailure(options) {
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
export function scriptTransformDisabledFailure(options) {
    return createFailureResult({
        ...options,
        kind: "script_transform_disabled",
        operation: "transform",
        executionStatus: "unavailable",
    });
}
export function transformAdapterUnavailableFailure(options) {
    return createFailureResult({
        ...options,
        kind: "adapter_unavailable",
        operation: "transform",
        executionStatus: "unavailable",
    });
}
export function transformSourceUnavailableFailure(options) {
    return createFailureResult({
        ...options,
        kind: "transform_source_unavailable",
        operation: "transform",
        executionStatus: "unavailable",
    });
}
export function transformValidationFailure(options) {
    return createFailureResult({
        ...options,
        kind: "transform_validation_failure",
        operation: "transform",
        executionStatus: "rejected",
    });
}
export function transformExecutionFailure(options) {
    return createFailureResult({
        ...options,
        kind: "transform_execution_failure",
        operation: "transform",
        executionStatus: "failed",
    });
}
export function createFailureResult(options) {
    const preserve = options.preserve ?? DEFAULT_PRESERVE;
    const persistence = normalizePersistence(options.persistence, options.outputId);
    const routingStatus = options.routingStatus ?? "failed";
    const recovery = recoveryHintForPersistence(persistence);
    const executionStatus = options.executionStatus ?? defaultExecutionStatus(options.kind);
    const result = {
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
function executionFailure(status, failureKind, message) {
    return { status, failureKind, message };
}
function normalizePersistence(persistence, outputId) {
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
function noPersistence() {
    return { status: "not_persisted", recoverability: "none" };
}
function recoveryHintForPersistence(persistence) {
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
function defaultExecutionStatus(kind) {
    if (kind === "adapter_unavailable" || kind === "transform_source_unavailable" || kind === "script_transform_disabled") {
        return "unavailable";
    }
    if (kind === "transform_validation_failure") {
        return "rejected";
    }
    return "failed";
}
function failureReason(kind, operation, message, persistence) {
    return `${operation} failure kind=${kind}: ${message} persistence.status=${persistence.status}; recoverability=${persistence.recoverability}.`;
}
function failureDecisionId(options) {
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
function hash(value) {
    return createHash("sha256").update(value).digest("hex");
}
