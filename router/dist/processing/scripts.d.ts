import { type ScriptSandboxAdapter } from "../sandbox/script-sandbox.js";
import type { ScriptDeriveConfig, ScriptDeriveLanguage } from "../config/types.js";
import type { LoadedProcessingSource } from "./engine.js";
export interface ProcessingScriptRequest {
    language: ScriptDeriveLanguage;
    code: string;
    label?: string;
    alias?: string;
    limits?: Partial<ScriptDeriveConfig["limits"]>;
}
export type ProcessingScriptResult = {
    status: "not_configured";
    reason: string;
} | {
    status: "unavailable";
    language: ScriptDeriveLanguage;
    reason: string;
    recommendation: string;
    noHostFallback: true;
    rawScriptPersistence: "disabled";
    codeHashSha256: string;
    adapterId?: string;
    adapterVersion?: string;
    failedProofs?: string[];
} | {
    status: "executed";
    language: ScriptDeriveLanguage;
    adapterId: string;
    adapterVersion: string;
    runtime?: {
        name: string;
        version?: string;
    };
    outputText: string;
    stderr: string;
    stdoutBytes: number;
    stderrBytes: number;
    durationMs?: number;
    noHostFallback: true;
    rawScriptPersistence: "disabled";
    codeHashSha256: string;
} | {
    status: "failed";
    language: ScriptDeriveLanguage;
    reason: string;
    adapterId?: string;
    adapterVersion?: string;
    stdoutBytes?: number;
    stderrBytes?: number;
    noHostFallback: true;
    rawScriptPersistence: "disabled";
    codeHashSha256: string;
};
export interface RunProcessingScriptOptions {
    loaded: LoadedProcessingSource;
    script: ProcessingScriptRequest;
    scriptDerive?: ScriptDeriveConfig;
    adapters?: readonly ScriptSandboxAdapter[];
}
export declare function processingScriptNotConfigured(): ProcessingScriptResult;
export declare function processingScriptUnavailableForUnloadedSource(script: ProcessingScriptRequest, reason: string): ProcessingScriptResult;
export declare function runProcessingScript(options: RunProcessingScriptOptions): Promise<ProcessingScriptResult>;
