import type { EvidenceLineage, EvidencePacket, EvidencePersistence, FailureExecutionStatus, FailureRoutedResult, PreserveMode, RouterFailureKind, RoutingStatus, ToolStatus } from "../config/types.js";
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
export declare function storageFailure(options: StorageFailureOptions): FailureRoutedResult;
export declare function scriptTransformDisabledFailure(options: TransformFailureOptions): FailureRoutedResult;
export declare function transformAdapterUnavailableFailure(options: TransformFailureOptions): FailureRoutedResult;
export declare function transformSourceUnavailableFailure(options: TransformFailureOptions): FailureRoutedResult;
export declare function transformValidationFailure(options: TransformFailureOptions): FailureRoutedResult;
export declare function transformExecutionFailure(options: TransformFailureOptions): FailureRoutedResult;
export declare function createFailureResult(options: FailureResultOptions): FailureRoutedResult;
