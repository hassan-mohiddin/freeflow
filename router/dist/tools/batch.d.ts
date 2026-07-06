import { type HostCommandRunner } from "./run.js";
import type { BatchRoutedResult, BatchStepKind, PreserveMode, RouterThresholds, ScriptTransformConfig, StoragePolicyMode, VaultRetentionPolicy } from "../config/types.js";
import type { ScriptSandboxAdapter } from "../sandbox/script-sandbox.js";
export interface FreeflowBatchStepInput {
    id?: string;
    kind: BatchStepKind;
    input: Record<string, unknown>;
}
export interface DelegationBatchOperationMetadata {
    readsHarnessState: boolean;
    writesEvidence: boolean;
    mutatesHarnessState: boolean;
    mutatesRepoState: boolean;
    parallelSafety: "safe" | "conditional" | "denied";
}
export interface FreeflowBatchOptions {
    sessionId: string;
    steps: readonly FreeflowBatchStepInput[];
    concurrency?: number;
    preserve?: PreserveMode;
    vaultRoot?: string;
    vaultRetention?: VaultRetentionPolicy;
    thresholds?: Partial<RouterThresholds>;
    scriptTransform?: ScriptTransformConfig;
    scriptSandboxAdapters?: readonly ScriptSandboxAdapter[];
    storagePolicy?: StoragePolicyMode;
    queries?: readonly string[];
    delegationExecutor?: (step: {
        kind: BatchStepKind;
        input: Record<string, unknown>;
        id: string;
        index: number;
    }) => Promise<unknown>;
}
export declare const DELEGATION_BATCH_OPERATION_METADATA: Record<string, DelegationBatchOperationMetadata>;
export declare function freeflowBatch(options: FreeflowBatchOptions, runner: HostCommandRunner): Promise<BatchRoutedResult>;
