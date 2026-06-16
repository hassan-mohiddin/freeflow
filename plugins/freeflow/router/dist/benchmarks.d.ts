export interface RunRouterBenchmarksOptions {
    iterations?: number;
    generatedAt?: string;
}
export interface RouterBenchmarkReport {
    generatedAt: string;
    iterations: number;
    summary: RouterBenchmarkSummary;
    fixtures: RouterBenchmarkFixtureResult[];
    skippedExternalTools: SkippedExternalTool[];
}
export interface RouterBenchmarkSummary {
    fixtures: number;
    modeResults: number;
    improved: ModeSummary;
    nativeBaseline: ModeSummary;
    freeflowBaseline: ModeSummary;
    generatedFalsePositiveCount: number;
    sandboxFailureFixed: boolean;
}
export interface ModeSummary {
    passed: number;
    failed: number;
    skipped: number;
    pathCorrect: number;
    spanCorrect: number;
    excerptComplete: number;
    generatedFalsePositiveCount: number;
    totalRawBytes: number;
    totalRoutedBytes: number;
    totalRawTokensApprox: number;
    totalRoutedTokensApprox: number;
    weightedByteReductionPercent: number;
    weightedTokenReductionPercent: number;
    averageByteReductionPercent: number;
    medianByteReductionPercent: number;
    averageTokenReductionPercent: number;
    medianTokenReductionPercent: number;
}
export interface RouterBenchmarkFixtureResult {
    id: string;
    title: string;
    kind: BenchmarkKind;
    expected: BenchmarkExpected;
    results: RouterBenchmarkModeResult[];
}
export interface RouterBenchmarkModeResult {
    mode: BenchmarkMode;
    toolPathUsed: string;
    skipped: boolean;
    skipReason?: string;
    rawBytes: number;
    rawTokensApprox: number;
    routedBytes: number;
    routedTokensApprox: number;
    byteReductionPercent: number;
    tokenReductionPercent: number;
    latencyMs: {
        p50: number;
        p95: number;
    };
    actualPath?: string;
    actualLines?: string;
    correctness: CorrectnessResult;
    recovery: RecoveryResult;
    notes: string[];
}
export interface BenchmarkExpected {
    path?: string;
    pathIncludes?: string;
    lines?: string;
    requiredExcerpt?: string[];
}
export interface CorrectnessResult {
    passed: boolean;
    pathCorrect: boolean;
    spanCorrect: boolean;
    excerptComplete: boolean;
    generatedFalsePositive: boolean;
}
export interface RecoveryResult {
    status: "passed" | "failed" | "not-applicable" | "skipped";
    detail: string;
}
export interface SkippedExternalTool {
    name: string;
    reason: string;
}
type BenchmarkKind = "repo-query" | "repo-expand" | "vault-query";
type BenchmarkMode = "native-baseline-proxy" | "pre-hardening-freeflow-proxy" | "improved-freeflow-router";
export declare function runRouterBenchmarks(options?: RunRouterBenchmarksOptions): Promise<RouterBenchmarkReport>;
export declare function renderRouterBenchmarkReport(report: RouterBenchmarkReport): string;
export declare function writeRouterBenchmarkReport(report: RouterBenchmarkReport, reportPath: string): Promise<void>;
export declare function writeRouterBenchmarkJsonReport(report: RouterBenchmarkReport, reportPath: string): Promise<void>;
export declare function writeRouterBenchmarkReports(report: RouterBenchmarkReport, markdownReportPath: string): Promise<{
    markdown: string;
    json: string;
}>;
export {};
