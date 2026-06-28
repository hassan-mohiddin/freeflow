import type { TransformRoutedResult, FailureRoutedResult, FailureExecutionStatus, OutputStream, PreserveMode, RouterFailureKind, RouterThresholds, ScriptTransformConfig, ScriptTransformLanguage, VaultRetentionPolicy } from "../config/types.js";
import type { ScriptSandboxAdapter, ScriptSandboxExecutionResult } from "../sandbox/script-sandbox.js";
export interface TransformVaultSourceInput {
    kind: "vault";
    outputId: string;
    stream?: OutputStream;
}
export type TransformSourceInput = TransformVaultSourceInput;
export interface ScriptTransformSourceInput extends TransformVaultSourceInput {
    alias: string;
}
export interface ScriptTransformLimitsInput {
    timeoutMs?: number;
    maxInputBytes?: number;
    maxOutputBytes?: number;
}
export interface RegexFilterTransformOperation {
    kind: "regexFilter";
    pattern: string;
    flags?: string;
    contextLines?: number;
    maxMatches?: number;
}
export interface CountMatchesTransformOperation {
    kind: "countMatches";
    pattern: string;
    flags?: string;
}
export interface JsonExtractTransformOperation {
    kind: "jsonExtract";
    pointer?: string;
    path?: string;
}
export interface GroupByRegexTransformOperation {
    kind: "groupByRegex";
    pattern: string;
    flags?: string;
    group?: number | string;
    maxGroups?: number;
    maxLinesPerGroup?: number;
}
export interface DedupeTransformOperation {
    kind: "dedupe";
    trim?: boolean;
    caseSensitive?: boolean;
    maxLines?: number;
}
export interface TopNTransformOperation {
    kind: "topN";
    limit: number;
    pattern?: string;
    flags?: string;
    group?: number | string;
    sort?: "text" | "numeric";
    order?: "asc" | "desc";
}
export interface ExtractUrlsTransformOperation {
    kind: "extractUrls";
    dedupe?: boolean;
    maxMatches?: number;
}
export interface ExtractCitationsTransformOperation {
    kind: "extractCitations";
    maxMatches?: number;
}
export interface LineStatsTransformOperation {
    kind: "lineStats";
}
export interface SizeStatsTransformOperation {
    kind: "sizeStats";
}
export interface ScriptTransformOperation {
    kind: "script";
    language: ScriptTransformLanguage;
    code: string;
    label?: string;
}
export type DeterministicTransformOperation = RegexFilterTransformOperation | CountMatchesTransformOperation | JsonExtractTransformOperation | GroupByRegexTransformOperation | DedupeTransformOperation | TopNTransformOperation | ExtractUrlsTransformOperation | ExtractCitationsTransformOperation | LineStatsTransformOperation | SizeStatsTransformOperation;
export type TransformOperation = DeterministicTransformOperation | ScriptTransformOperation;
export interface DeterministicTransformInput {
    source: TransformSourceInput;
    operation: DeterministicTransformOperation;
    preserve?: PreserveMode;
}
export interface ScriptTransformInput {
    sources: ScriptTransformSourceInput[];
    operation: ScriptTransformOperation;
    limits?: ScriptTransformLimitsInput;
    preserve?: PreserveMode;
}
export interface SandboxedScriptOperationSuccess {
    ok: true;
    result: ScriptSandboxExecutionResult;
    limits: Required<ScriptTransformLimitsInput>;
    operation: Record<string, unknown>;
    adapterId: string;
    adapterVersion: string;
    runtime?: {
        name: string;
        version?: string;
    };
}
export interface SandboxedScriptOperationFailure {
    ok: false;
    failureKind: RouterFailureKind;
    executionStatus: FailureExecutionStatus;
    message: string;
    limits: Required<ScriptTransformLimitsInput>;
    operation: Record<string, unknown>;
    adapterId?: string;
    adapterVersion?: string;
    failedProofs?: string[];
}
export type SandboxedScriptOperationResult = SandboxedScriptOperationSuccess | SandboxedScriptOperationFailure;
export type TransformInput = DeterministicTransformInput | ScriptTransformInput;
export type FreeflowTransformOptions = TransformInput & {
    sessionId: string;
    vaultRoot?: string;
    vaultRetention?: VaultRetentionPolicy;
    thresholds?: Partial<RouterThresholds>;
    scriptTransform?: ScriptTransformConfig;
    scriptSandboxAdapters?: readonly ScriptSandboxAdapter[];
};
export declare const TRANSFORM_ENGINE_IMPLEMENTATION = "shared-transform-engine-v1";
export interface TransformValidationIssue {
    path: string;
    message: string;
}
export type TransformValidationResult = {
    ok: true;
    value: TransformInput;
} | {
    ok: false;
    issues: TransformValidationIssue[];
};
export declare function validateTransformInput(value: unknown): TransformValidationResult;
export declare function freeflowTransform(options: FreeflowTransformOptions): Promise<TransformRoutedResult | FailureRoutedResult>;
export declare function executeSandboxedScriptOperation(options: {
    operation: ScriptTransformOperation;
    limits?: ScriptTransformLimitsInput;
    scriptTransform?: ScriptTransformConfig;
    scriptSandboxAdapters?: readonly ScriptSandboxAdapter[];
}): Promise<SandboxedScriptOperationResult>;
