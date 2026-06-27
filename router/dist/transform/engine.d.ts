import type { DeriveRoutedResult, FailureRoutedResult, OutputStream, PreserveMode, RouterThresholds, ScriptDeriveConfig, ScriptDeriveLanguage, VaultRetentionPolicy } from "../config/types.js";
import type { ScriptSandboxAdapter } from "../sandbox/script-sandbox.js";
export interface DeriveVaultSourceInput {
    kind: "vault";
    outputId: string;
    stream?: OutputStream;
}
export type DeriveSourceInput = DeriveVaultSourceInput;
export interface ScriptDeriveSourceInput extends DeriveVaultSourceInput {
    alias: string;
}
export interface ScriptDeriveLimitsInput {
    timeoutMs?: number;
    maxInputBytes?: number;
    maxOutputBytes?: number;
}
export interface RegexFilterDeriveOperation {
    kind: "regexFilter";
    pattern: string;
    flags?: string;
    contextLines?: number;
    maxMatches?: number;
}
export interface CountMatchesDeriveOperation {
    kind: "countMatches";
    pattern: string;
    flags?: string;
}
export interface JsonExtractDeriveOperation {
    kind: "jsonExtract";
    pointer?: string;
    path?: string;
}
export interface GroupByRegexDeriveOperation {
    kind: "groupByRegex";
    pattern: string;
    flags?: string;
    group?: number | string;
    maxGroups?: number;
    maxLinesPerGroup?: number;
}
export interface DedupeDeriveOperation {
    kind: "dedupe";
    trim?: boolean;
    caseSensitive?: boolean;
    maxLines?: number;
}
export interface TopNDeriveOperation {
    kind: "topN";
    limit: number;
    pattern?: string;
    flags?: string;
    group?: number | string;
    sort?: "text" | "numeric";
    order?: "asc" | "desc";
}
export interface ExtractUrlsDeriveOperation {
    kind: "extractUrls";
    dedupe?: boolean;
    maxMatches?: number;
}
export interface ExtractCitationsDeriveOperation {
    kind: "extractCitations";
    maxMatches?: number;
}
export interface LineStatsDeriveOperation {
    kind: "lineStats";
}
export interface SizeStatsDeriveOperation {
    kind: "sizeStats";
}
export interface ScriptDeriveOperation {
    kind: "script";
    language: ScriptDeriveLanguage;
    code: string;
    label?: string;
}
export type DeterministicDeriveOperation = RegexFilterDeriveOperation | CountMatchesDeriveOperation | JsonExtractDeriveOperation | GroupByRegexDeriveOperation | DedupeDeriveOperation | TopNDeriveOperation | ExtractUrlsDeriveOperation | ExtractCitationsDeriveOperation | LineStatsDeriveOperation | SizeStatsDeriveOperation;
export type DeriveOperation = DeterministicDeriveOperation | ScriptDeriveOperation;
export interface DeterministicDeriveInput {
    source: DeriveSourceInput;
    operation: DeterministicDeriveOperation;
    preserve?: PreserveMode;
}
export interface ScriptDeriveInput {
    sources: ScriptDeriveSourceInput[];
    operation: ScriptDeriveOperation;
    limits?: ScriptDeriveLimitsInput;
    preserve?: PreserveMode;
}
export type DeriveInput = DeterministicDeriveInput | ScriptDeriveInput;
export type FreeflowDeriveOptions = DeriveInput & {
    sessionId: string;
    vaultRoot?: string;
    vaultRetention?: VaultRetentionPolicy;
    thresholds?: Partial<RouterThresholds>;
    scriptDerive?: ScriptDeriveConfig;
    scriptSandboxAdapters?: readonly ScriptSandboxAdapter[];
};
export type FreeflowTransformOptions = FreeflowDeriveOptions;
export declare const TRANSFORM_ENGINE_IMPLEMENTATION = "shared-transform-engine-v1";
export interface DeriveValidationIssue {
    path: string;
    message: string;
}
export type DeriveValidationResult = {
    ok: true;
    value: DeriveInput;
} | {
    ok: false;
    issues: DeriveValidationIssue[];
};
export declare function validateDeriveInput(value: unknown): DeriveValidationResult;
export declare function freeflowTransform(options: FreeflowTransformOptions): Promise<DeriveRoutedResult | FailureRoutedResult>;
export declare function freeflowDerive(options: FreeflowDeriveOptions): Promise<DeriveRoutedResult | FailureRoutedResult>;
