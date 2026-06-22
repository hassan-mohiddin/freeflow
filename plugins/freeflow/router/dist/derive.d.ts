import type { DeriveRoutedResult, FailureRoutedResult, OutputStream, PreserveMode, RouterThresholds, VaultRetentionPolicy } from "./types.js";
export interface DeriveVaultSourceInput {
    kind: "vault";
    outputId: string;
    stream?: OutputStream;
}
export type DeriveSourceInput = DeriveVaultSourceInput;
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
export type DeriveOperation = RegexFilterDeriveOperation | CountMatchesDeriveOperation | JsonExtractDeriveOperation | GroupByRegexDeriveOperation | DedupeDeriveOperation | TopNDeriveOperation;
export interface DeriveInput {
    source: DeriveSourceInput;
    operation: DeriveOperation;
    preserve?: PreserveMode;
}
export interface FreeflowDeriveOptions extends DeriveInput {
    sessionId: string;
    vaultRoot?: string;
    vaultRetention?: VaultRetentionPolicy;
    thresholds?: Partial<RouterThresholds>;
}
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
export declare function freeflowDerive(options: FreeflowDeriveOptions): Promise<DeriveRoutedResult | FailureRoutedResult>;
