import { type ExperimentalIndexLoadMode } from "./experimental-local-index.js";
export interface RunIndexBenchmarksOptions {
    iterations?: number;
    generatedAt?: string;
}
export interface IndexBenchmarkReport {
    generatedAt: string;
    iterations: number;
    summary: IndexBenchmarkSummary;
    fixtures: IndexBenchmarkFixtureResult[];
}
export interface IndexBenchmarkSummary {
    fixtures: number;
    modeResults: number;
    scannerDefault: boolean;
    indexAdopted: boolean;
    scanner: IndexModeSummary;
    index: IndexModeSummary;
    generatedFalsePositiveCount: number;
    coldBuildMs: LatencySummary;
    warmQueryMs: LatencySummary;
    staleRefreshMs: LatencySummary;
}
export interface IndexModeSummary {
    passed: number;
    failed: number;
    pathCorrect: number;
    spanCorrect: number;
    excerptComplete: number;
    totalRawBytes: number;
    totalContextBytes: number;
    weightedContextReductionPercent: number;
}
export interface LatencySummary {
    p50: number;
    p95: number;
}
export interface IndexBenchmarkFixtureResult {
    id: string;
    title: string;
    expected: IndexBenchmarkExpected;
    results: IndexBenchmarkModeResult[];
}
export interface IndexBenchmarkExpected {
    path: string;
    lines?: string;
    requiredExcerpt: string[];
}
export interface IndexBenchmarkModeResult {
    mode: IndexBenchmarkMode;
    toolPathUsed: string;
    rawBytes: number;
    contextBytes: number;
    contextReductionPercent: number;
    latencyMs: LatencySummary;
    buildMs?: number;
    queryMs?: number;
    indexMode?: ExperimentalIndexLoadMode;
    actualPath?: string;
    actualLines?: string;
    excerpt: string;
    correctness: IndexCorrectnessResult;
    notes: string[];
}
export interface IndexCorrectnessResult {
    passed: boolean;
    pathCorrect: boolean;
    spanCorrect: boolean;
    excerptComplete: boolean;
    generatedFalsePositive: boolean;
}
type IndexBenchmarkMode = "scanner-default" | "index-cold" | "index-warm" | "index-stale-refresh";
export declare function runIndexBenchmarks(options?: RunIndexBenchmarksOptions): Promise<IndexBenchmarkReport>;
export declare function renderIndexBenchmarkReport(report: IndexBenchmarkReport): string;
export declare function writeIndexBenchmarkReport(report: IndexBenchmarkReport, reportPath: string): Promise<void>;
export declare function writeIndexBenchmarkJsonReport(report: IndexBenchmarkReport, reportPath: string): Promise<void>;
export interface WriteIndexBenchmarkReportsOptions {
    jsonReportPath?: string | false;
}
export declare function writeIndexBenchmarkReports(report: IndexBenchmarkReport, markdownReportPath: string, options?: WriteIndexBenchmarkReportsOptions): Promise<{
    markdown: string;
    json?: string;
}>;
export {};
