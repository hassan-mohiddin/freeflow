import type { CommandRoutedResult, ExecutionStatus, PreserveMode, RouterThresholds, VaultRetentionPolicy } from "./types.js";
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
export interface FreeflowRunOptions extends HostCommandRunRequest {
    sessionId: string;
    vaultRoot?: string;
    vaultRetention?: VaultRetentionPolicy;
    preserve?: PreserveMode;
    goal?: string;
    thresholds?: Partial<RouterThresholds>;
}
export declare function freeflowRun(options: FreeflowRunOptions, runner: HostCommandRunner): Promise<CommandRoutedResult>;
