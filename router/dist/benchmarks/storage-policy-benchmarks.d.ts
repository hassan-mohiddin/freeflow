import type { ExecutionStatus } from "../config/types.js";
export interface StoragePolicyBenchmarkOptions {
    iterations?: number;
    generatedAt?: string;
}
export interface StoragePolicyBenchmarkReport {
    generatedAt: string;
    iterations: number;
    summary: StoragePolicyBenchmarkSummary;
    fixtures: StoragePolicyFixtureDefinition[];
    policies: StoragePolicyResult[];
}
export interface StoragePolicyBenchmarkSummary {
    fixtures: number;
    policies: number;
    safeCandidateIds: string[];
    disqualifiedCandidateIds: string[];
    defaultUnchanged: true;
}
export interface StoragePolicyResult {
    policyId: StoragePolicyId;
    label: string;
    description: string;
    totals: StoragePolicyTotals;
    safety: StoragePolicySafety;
    fixtures: StoragePolicyFixtureResult[];
    notes: string[];
}
export interface StoragePolicyTotals {
    rawCombinedBytes: number;
    rawCombinedTokensApprox: number;
    exactStoredCombinedBytes: number;
    exactStoredTokensApprox: number;
    storageBytes: number;
    indexBytes: number;
    metadataOnlyRecords: number;
    exactRecords: number;
    duplicateMetadataRecords: number;
    storageReductionPercent: number;
    tokenSurfaceReductionPercent: number;
    privacySurfacePercent: number;
    latencyMs: {
        p50: number;
        p95: number;
    };
}
export interface StoragePolicySafety {
    exactnessSensitiveFixtures: number;
    exactnessSensitiveRecoverable: number;
    exactnessSensitiveRecoveryPassed: boolean;
    metadataOnlyRecoveryLabeled: boolean;
    repeatedOutputsDeduped: boolean;
}
export interface StoragePolicyFixtureResult {
    fixtureId: string;
    iteration: number;
    outputId: string;
    recordKind: "command" | "metadata";
    persistence: string;
    recoverability: string;
    rawCombinedBytes: number;
    exactStoredCombinedBytes: number;
    latencyMs: number;
    exactRecovery: "passed" | "failed" | "not-exact";
    usefulRecovery: "exact" | "metadata-only" | "duplicate-ref" | "none";
    duplicateOf?: string;
    exactnessSensitive: boolean;
    notes: string[];
}
interface StoragePolicyFixtureDefinition {
    id: string;
    title: string;
    command: string;
    stdout: string;
    stderr: string;
    executionStatus: ExecutionStatus;
    exitCode: number | null;
    exactnessSensitive: boolean;
    repeatedGroup?: string;
}
type StoragePolicyId = "store-everything" | "threshold-exact" | "metadata-small-exact-large-hybrid" | "duplicate-output-dedupe" | "hybrid-dedupe";
export declare function runStoragePolicyBenchmarks(options?: StoragePolicyBenchmarkOptions): Promise<StoragePolicyBenchmarkReport>;
export declare function renderStoragePolicyBenchmarkReport(report: StoragePolicyBenchmarkReport): string;
export declare function writeStoragePolicyBenchmarkReports(report: StoragePolicyBenchmarkReport, markdownReportPath?: string, options?: {
    jsonReportPath?: string | false;
}): Promise<{
    markdown: string;
    json?: string;
}>;
export {};
