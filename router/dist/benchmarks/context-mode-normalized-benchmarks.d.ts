export interface RunContextModeNormalizedBenchmarksOptions {
    iterations?: number;
    generatedAt?: string;
}
export interface ContextModeNormalizedBenchmarkReport {
    generatedAt: string;
    iterations: number;
    summary: ContextModeNormalizedSummary;
    fixtures: ContextModeFixtureResult[];
    notes: string[];
}
export interface ContextModeNormalizedSummary {
    fixtures: number;
    modeResults: number;
    freeflow: ContextModeModeSummary;
    contextModeProxy: ContextModeModeSummary;
    freeflowBetterModelVisibleBytes: number;
    freeflowBetterToolCalls: number;
    allFreeflowFactsPreserved: boolean;
    allFreeflowRecoveryAvailable: boolean;
    publicClaimsAllowed: boolean;
}
export interface ContextModeModeSummary {
    passed: number;
    failed: number;
    answerAccurate: number;
    exactFactsPreserved: number;
    recoveryAvailable: number;
    totalRawBytes: number;
    totalModelVisibleBytes: number;
    totalModelVisibleTokensApprox: number;
    totalToolCalls: number;
    totalStorageBytes: number;
    weightedModelVisibleReductionPercent: number;
}
export interface ContextModeFixtureResult {
    id: string;
    title: string;
    category: ContextModeFixtureCategory;
    expectedFacts: string[];
    results: ContextModeModeResult[];
}
export interface ContextModeModeResult {
    mode: ContextModeMode;
    toolPathUsed: string;
    rawBytes: number;
    modelVisibleBytes: number;
    modelVisibleTokensApprox: number;
    detailsPayloadBytes: number;
    storageBytes: number;
    toolCalls: number;
    latencyMs: {
        p50: number;
        p95: number;
    };
    modelVisibleReductionPercent: number;
    answerAccuracy: boolean;
    exactFactsPreserved: boolean;
    recoveryAvailable: boolean;
    recoveryDetail: string;
    notes: string[];
}
type ContextModeFixtureCategory = "command" | "docs" | "logs" | "json-csv" | "repo-search" | "batch";
type ContextModeMode = "context-mode-normalized-proxy" | "freeflow-owned-tools";
export declare function runContextModeNormalizedBenchmarks(options?: RunContextModeNormalizedBenchmarksOptions): Promise<ContextModeNormalizedBenchmarkReport>;
export declare function renderContextModeNormalizedBenchmarkReport(report: ContextModeNormalizedBenchmarkReport): string;
export interface WriteContextModeNormalizedBenchmarkReportsOptions {
    jsonReportPath?: string | false;
}
export declare function writeContextModeNormalizedBenchmarkReports(report: ContextModeNormalizedBenchmarkReport, markdownReportPath: string, options?: WriteContextModeNormalizedBenchmarkReportsOptions): Promise<{
    markdown: string;
    json?: string;
}>;
export {};
