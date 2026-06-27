export declare const CONTEXT_MODE_REAL_DEEP_IMPLEMENTATION = "context-mode-real-deep-benchmark-v1";
export declare const EXPECTED_BASELINE_FAILURE_KEYS: readonly ["outside-file-boundary/freeflow:run-cat-host-shell"];
export interface RunContextModeRealDeepBenchmarkOptions {
    contextModeRepo?: string;
    contextModeServer?: string;
    fixtureSource?: string;
    freeflowRepo?: string;
    generatedAt?: string;
    keepArtifacts?: boolean;
}
export interface ContextModeAvailability {
    status: "available" | "unavailable";
    repo: string;
    server: string;
    fixtureSource: string;
    clientModulePath: string;
    transportModulePath: string;
    missingPaths: string[];
    reason?: string;
}
export interface ContextModeRealDeepReport {
    generatedAt: string;
    implementation: string;
    benchmarkLabel: string;
    contextMode: ContextModeReportMetadata;
    freeflow: FreeflowReportMetadata;
    benchmarkRoot: string;
    publicClaimsAllowed: boolean;
    methodology: string[];
    summaries: BenchmarkModeSummary[];
    baselineChecks: BaselineChecks;
    failureClusters: FailureClusters;
    rows: DeepBenchmarkRow[];
    contextModeStatsPreview: string;
    notes: string[];
}
export interface ContextModeReportMetadata {
    status: "available" | "unavailable";
    repo: string;
    server: string;
    fixtureSource: string;
    commit: string;
    version: string;
    storeRoot?: string;
    unavailableReason?: string;
    missingPaths: string[];
}
export interface FreeflowReportMetadata {
    repo: string;
    commit: string;
    vaultRoot?: string;
    sessionId?: string;
}
export interface BenchmarkModeSummary {
    mode: string;
    scenarios: number;
    correct: number;
    totalFactsFound: number;
    totalFacts: number;
    totalRawBytes: number;
    totalVisibleBytes: number;
    avgLatencyMs: number;
    exactRecovery: number;
    metadataOnly: number;
    weightedReductionPct: number;
}
export interface BaselineChecks {
    expectedCurrentFailuresDetected: boolean;
    expectedFailureKeys: string[];
    detectedFailureKeys: string[];
    missingExpectedFailureKeys: string[];
    notes: string[];
}
export interface FailureClusters {
    freeflowIncorrect: FailureClusterEntry[];
    contextModeIncorrect: FailureClusterEntry[];
    freeflowVerbose: VerboseClusterEntry[];
    metadataOnly: MetadataOnlyClusterEntry[];
}
export interface FailureClusterEntry {
    fixture: string;
    mode: string;
    category: string;
    facts: string;
    notes: string;
    visibleBytes: number;
}
export interface VerboseClusterEntry {
    fixture: string;
    mode: string;
    reductionPct: number;
    visibleBytes: number;
    rawBytes: number;
}
export interface MetadataOnlyClusterEntry {
    fixture: string;
    mode: string;
    notes: string;
}
export interface DeepBenchmarkRow {
    fixture: string;
    category: string;
    mode: string;
    capability: string;
    correct: boolean;
    factsFound: number;
    factsTotal: number;
    rawBytes: number;
    visibleBytes: number;
    reductionPct: number;
    latencyMs: number;
    recovery: string;
    notes: string;
    preview: string;
}
export declare function runContextModeRealDeepBenchmark(options?: RunContextModeRealDeepBenchmarkOptions): Promise<ContextModeRealDeepReport>;
export declare function renderContextModeRealDeepBenchmarkReport(report: ContextModeRealDeepReport): string;
export declare function writeContextModeRealDeepBenchmarkReports(report: ContextModeRealDeepReport, markdownReportPath: string, options?: {
    jsonReportPath?: string | false;
}): Promise<{
    markdown: string;
    json?: string;
}>;
export declare function baselineFailureClassesDetected(report: Pick<ContextModeRealDeepReport, "failureClusters">): boolean;
