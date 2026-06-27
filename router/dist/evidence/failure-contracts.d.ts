import type { EvidenceLineage, EvidencePacket, EvidencePersistence, FailureExecutionStatus, FailureRoutedResult, PreserveMode, ProducerDescriptor, RouterFailureKind, RoutingStatus, ToolStatus } from "../config/types.js";
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
export declare function adapterUnavailableFailure(options: CaptureFailureOptions): FailureRoutedResult;
export declare function unsupportedProducerFailure(options: CaptureFailureOptions): FailureRoutedResult;
export declare function mutatingProducerRejectedFailure(options: CaptureFailureOptions): FailureRoutedResult;
export declare function producerExecutionFailure(options: CaptureFailureOptions): FailureRoutedResult;
export declare function partialCaptureFailure(options: CaptureFailureOptions): FailureRoutedResult;
export declare function storageFailure(options: StorageFailureOptions): FailureRoutedResult;
export declare function redactionFailure(options: StorageFailureOptions): FailureRoutedResult;
export declare function scriptDeriveDisabledFailure(options: DeriveFailureOptions): FailureRoutedResult;
export declare function deriveAdapterUnavailableFailure(options: DeriveFailureOptions): FailureRoutedResult;
export declare function deriveSourceUnavailableFailure(options: DeriveFailureOptions): FailureRoutedResult;
export declare function deriveValidationFailure(options: DeriveFailureOptions): FailureRoutedResult;
export declare function deriveExecutionFailure(options: DeriveFailureOptions): FailureRoutedResult;
export declare function createFailureResult(options: FailureResultOptions): FailureRoutedResult;
