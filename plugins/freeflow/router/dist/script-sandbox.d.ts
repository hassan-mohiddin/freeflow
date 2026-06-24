import type { ScriptDeriveConfig, ScriptDeriveLanguage } from "./types.js";
export declare const SCRIPT_SANDBOX_ADAPTER_CONTRACT_VERSION = 1;
export declare const SCRIPT_SANDBOX_REQUIRED_PROOFS: readonly ["env_access_denied", "home_access_denied", "repo_access_denied", "vault_access_denied", "network_access_denied", "input_read_only", "output_escape_denied", "stdout_stderr_bounded", "timeout_enforced"];
export type ScriptSandboxProof = (typeof SCRIPT_SANDBOX_REQUIRED_PROOFS)[number];
export type ScriptSandboxAvailability = "available" | "unavailable";
export interface ScriptSandboxRuntimeInfo {
    name: string;
    version?: string;
}
export interface ScriptSandboxProbeResult {
    status: ScriptSandboxAvailability;
    reason: string;
    passedProofs: ScriptSandboxProof[];
    failedProofs: ScriptSandboxProof[];
    runtime?: ScriptSandboxRuntimeInfo;
}
export interface ScriptSandboxSourceMount {
    alias: string;
    path: string;
    bytes: number;
    sha256: string;
}
export interface ScriptSandboxExecutionRequest {
    language: ScriptDeriveLanguage;
    code: string;
    inputDir: string;
    workDir: string;
    outputDir: string;
    sources: ScriptSandboxSourceMount[];
    limits: ScriptDeriveConfig["limits"];
    network: ScriptDeriveConfig["network"];
}
export interface ScriptSandboxExecutionResult {
    status: "success" | "failed" | "timed_out" | "policy_violation";
    stdout: string;
    stderr: string;
    outputFiles: Array<{
        path: string;
        bytes: number;
        sha256?: string;
    }>;
    exitCode?: number | null;
    durationMs?: number;
    reason?: string;
}
export interface ScriptSandboxAdapter {
    id: string;
    version: string;
    languages: readonly ScriptDeriveLanguage[];
    probe(language: ScriptDeriveLanguage, config: ScriptDeriveConfig): Promise<ScriptSandboxProbeResult>;
    execute(request: ScriptSandboxExecutionRequest): Promise<ScriptSandboxExecutionResult>;
}
export interface ScriptSandboxCandidateMechanism {
    id: string;
    languages: readonly ScriptDeriveLanguage[];
    status: "rejected" | "candidate_unproven";
    reason: string;
}
export interface ScriptSandboxLanguageStatus {
    language: ScriptDeriveLanguage;
    status: ScriptSandboxAvailability;
    reason: string;
    adapterId?: string;
    adapterVersion?: string;
    runtime?: ScriptSandboxRuntimeInfo;
    requiredProofs: ScriptSandboxProof[];
    passedProofs: ScriptSandboxProof[];
    failedProofs: ScriptSandboxProof[];
}
export interface ScriptSandboxProbeReport {
    contractVersion: number;
    sandbox: ScriptDeriveConfig["sandbox"];
    network: ScriptDeriveConfig["network"];
    configuredLanguages: ScriptDeriveLanguage[];
    adapterAvailable: boolean;
    adapterStatus: ScriptSandboxAvailability;
    availableLanguages: ScriptDeriveLanguage[];
    unavailableLanguages: ScriptSandboxLanguageStatus[];
    languages: ScriptSandboxLanguageStatus[];
    registeredAdapters: Array<{
        id: string;
        version: string;
        languages: ScriptDeriveLanguage[];
    }>;
    requiredProofs: ScriptSandboxProof[];
    candidateMechanisms: ScriptSandboxCandidateMechanism[];
    notes: string[];
}
export declare const SCRIPT_SANDBOX_CANDIDATE_MECHANISMS: ScriptSandboxCandidateMechanism[];
export interface ProbeScriptSandboxAdaptersOptions {
    config?: ScriptDeriveConfig;
    adapters?: readonly ScriptSandboxAdapter[];
}
export declare function probeScriptSandboxAdapters(options?: ProbeScriptSandboxAdaptersOptions): Promise<ScriptSandboxProbeReport>;
export declare function selectScriptSandboxAdapter(language: ScriptDeriveLanguage, config: ScriptDeriveConfig, adapters?: readonly ScriptSandboxAdapter[]): Promise<{
    ok: true;
    adapter: ScriptSandboxAdapter;
    status: ScriptSandboxLanguageStatus;
} | {
    ok: false;
    status: ScriptSandboxLanguageStatus;
}>;
