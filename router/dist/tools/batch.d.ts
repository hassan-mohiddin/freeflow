import { type HostCommandRunner } from "./run.js";
import type { BatchRoutedResult, BatchStepKind, PreserveMode, RouterThresholds, ScriptDeriveConfig, StoragePolicyMode, VaultRetentionPolicy } from "../config/types.js";
import type { ScriptSandboxAdapter } from "../sandbox/script-sandbox.js";
export interface FreeflowBatchStepInput {
    id?: string;
    kind: BatchStepKind;
    input: Record<string, unknown>;
}
export interface FreeflowBatchOptions {
    sessionId: string;
    steps: readonly FreeflowBatchStepInput[];
    concurrency?: number;
    preserve?: PreserveMode;
    vaultRoot?: string;
    vaultRetention?: VaultRetentionPolicy;
    thresholds?: Partial<RouterThresholds>;
    scriptDerive?: ScriptDeriveConfig;
    scriptSandboxAdapters?: readonly ScriptSandboxAdapter[];
    storagePolicy?: StoragePolicyMode;
    queries?: readonly string[];
}
export declare function freeflowBatch(options: FreeflowBatchOptions, runner: HostCommandRunner): Promise<BatchRoutedResult>;
