import { type ScriptDeriveLimitsInput } from "./transform.js";
import { type RunOutputFiltersInput } from "./run-filters.js";
import type { CommandRoutedResult, ExecutionStatus, PreserveMode, RouterThresholds, ScriptDeriveConfig, ScriptDeriveLanguage, StoragePolicyMode, VaultRetentionPolicy } from "./types.js";
import type { ScriptSandboxAdapter } from "./script-sandbox.js";
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
export interface RunScriptFilterInput {
    language: ScriptDeriveLanguage;
    code: string;
    label?: string;
    limits?: ScriptDeriveLimitsInput;
}
export interface FreeflowRunOptions extends HostCommandRunRequest {
    sessionId: string;
    vaultRoot?: string;
    vaultRetention?: VaultRetentionPolicy;
    preserve?: PreserveMode;
    goal?: string;
    thresholds?: Partial<RouterThresholds>;
    filters?: RunOutputFiltersInput;
    scriptFilter?: RunScriptFilterInput;
    scriptDerive?: ScriptDeriveConfig;
    scriptSandboxAdapters?: readonly ScriptSandboxAdapter[];
    storagePolicy?: StoragePolicyMode;
}
export declare function freeflowRun(options: FreeflowRunOptions, runner: HostCommandRunner): Promise<CommandRoutedResult>;
