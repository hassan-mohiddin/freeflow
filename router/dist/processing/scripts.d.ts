import { type ScriptSandboxAdapter } from "../sandbox/script-sandbox.js";
import type { LocalFreeflowConfig, ProcessingScriptPolicy, ScriptTransformConfig, ScriptTransformLanguage } from "../config/types.js";
import type { LoadedProcessingSource } from "./engine.js";
export interface ProcessingScriptRequest {
    language: ScriptTransformLanguage;
    code: string;
    label?: string;
    alias?: string;
    policy?: ProcessingScriptPolicy;
    limits?: Partial<ScriptTransformConfig["limits"]>;
}
export type ProcessingScriptResult = {
    status: "not_configured";
    reason: string;
} | {
    status: "unavailable";
    language: ScriptTransformLanguage;
    policy: ProcessingScriptPolicy;
    reason: string;
    recommendation: string;
    noHostFallback: true;
    rawScriptPersistence: "disabled";
    codeHashSha256: string;
    adapterId?: string;
    adapterVersion?: string;
    failedProofs?: string[];
} | {
    status: "rejected";
    language: ScriptTransformLanguage;
    policy: "unsafe-unsandboxed";
    reason: string;
    recommendation: string;
    rawScriptPersistence: "disabled";
    codeHashSha256: string;
    localOptInRequired?: true;
} | {
    status: "executed";
    language: ScriptTransformLanguage;
    policy: ProcessingScriptPolicy;
    adapterId?: string;
    adapterVersion?: string;
    runtime?: {
        name: string;
        version?: string;
    };
    outputText: string;
    stderr: string;
    stdoutBytes: number;
    stderrBytes: number;
    durationMs?: number;
    noHostFallback?: true;
    unsafeUnsandboxed?: true;
    rawScriptPersistence: "disabled";
    codeHashSha256: string;
} | {
    status: "failed";
    language: ScriptTransformLanguage;
    policy: ProcessingScriptPolicy;
    reason: string;
    adapterId?: string;
    adapterVersion?: string;
    stdoutBytes?: number;
    stderrBytes?: number;
    noHostFallback?: true;
    unsafeUnsandboxed?: true;
    rawScriptPersistence: "disabled";
    codeHashSha256: string;
};
export interface RunProcessingScriptOptions {
    loaded: LoadedProcessingSource;
    script: ProcessingScriptRequest;
    scriptTransform?: ScriptTransformConfig;
    localConfig?: LocalFreeflowConfig;
    adapters?: readonly ScriptSandboxAdapter[];
}
export declare function processingScriptNotConfigured(): ProcessingScriptResult;
export declare function processingScriptUnavailableForUnloadedSource(script: ProcessingScriptRequest, reason: string): ProcessingScriptResult;
export declare function runProcessingScript(options: RunProcessingScriptOptions): Promise<ProcessingScriptResult>;
