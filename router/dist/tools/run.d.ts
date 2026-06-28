import { type ScriptTransformLimitsInput } from "../transform/engine.js";
import { type RunOutputFiltersInput } from "../routing/run-filters.js";
import type { CommandRoutedResult, ExecutionStatus, PreserveMode, RouterThresholds, ScriptTransformConfig, ScriptTransformLanguage, StoragePolicyMode, VaultRetentionPolicy } from "../config/types.js";
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
export declare function freeflowRun(options: FreeflowRunOptions, runner: HostCommandRunner): Promise<CommandRoutedResult>;
