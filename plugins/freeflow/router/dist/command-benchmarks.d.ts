import type { CommandParserMetadata, ExecutionStatus } from "./types.js";
export interface RunCommandBenchmarksOptions {
    iterations?: number;
    generatedAt?: string;
    externalComparators?: readonly CommandBenchmarkExternalComparator[];
}
export interface CommandBenchmarkExternalComparator {
    name: string;
    mode: string;
    run(fixture: CommandBenchmarkFixtureInput): Promise<CommandBenchmarkExternalObservation>;
}
export interface CommandBenchmarkFixtureInput {
    id: string;
    title: string;
    command: string;
    executionStatus: ExecutionStatus;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    combined: string;
    requiredFacts: string[];
}
export interface CommandBenchmarkExternalObservation {
    routedText: string;
    routedBytes?: number;
    rawBytes?: number;
    parser?: CommandParserMetadata;
    latencyMs?: number;
    notes?: string[];
}
export interface CommandBenchmarkReport {
    generatedAt: string;
    iterations: number;
    summary: CommandBenchmarkSummary;
    fixtures: CommandBenchmarkFixtureResult[];
    skippedExternalTools: CommandSkippedExternalTool[];
}
export interface CommandBenchmarkSummary {
    fixtures: number;
    modeResults: number;
    improved: CommandModeSummary;
    nativeBaseline: CommandModeSummary;
    failedCommandFactsPreserved: boolean;
}
export interface CommandModeSummary {
    passed: number;
    failed: number;
    skipped: number;
    exactFactsPreserved: number;
    recoveryPassed: number;
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
export interface CommandBenchmarkFixtureResult {
    id: string;
    title: string;
    kind: CommandBenchmarkKind;
    expected: CommandBenchmarkExpected;
    results: CommandBenchmarkModeResult[];
}
export interface CommandBenchmarkExpected {
    executionStatus: ExecutionStatus;
    exitCode: number | null;
    requiredFacts: string[];
    failedFactsMustBeExact?: boolean;
}
export interface CommandBenchmarkModeResult {
    mode: CommandBenchmarkMode;
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
    executionStatus?: ExecutionStatus;
    exitCode?: number | null;
    outputId?: string;
    parser?: CommandParserMetadata;
    routedExcerpt: string;
    correctness: CommandCorrectnessResult;
    recovery: CommandBenchmarkRecoveryResult;
    notes: string[];
}
export interface CommandCorrectnessResult {
    passed: boolean;
    statusCorrect: boolean;
    exitCodeCorrect: boolean;
    exactFactsPreserved: boolean;
    failedFactsExact: boolean;
}
export interface CommandBenchmarkRecoveryResult {
    status: "passed" | "failed" | "not-applicable" | "skipped";
    detail: string;
}
export interface CommandSkippedExternalTool {
    name: string;
    reason: string;
}
type CommandBenchmarkKind = "noisy-success" | "failed-stack" | "test-summary" | "diagnostics" | "git-output" | "repetitive-log" | "huge-json-table" | "repeated-output";
type BuiltInCommandBenchmarkMode = "native-baseline-proxy" | "improved-freeflow-run";
type CommandBenchmarkMode = BuiltInCommandBenchmarkMode | string;
export declare function runCommandBenchmarks(options?: RunCommandBenchmarksOptions): Promise<CommandBenchmarkReport>;
export declare function renderCommandBenchmarkReport(report: CommandBenchmarkReport): string;
export declare function writeCommandBenchmarkReport(report: CommandBenchmarkReport, reportPath: string): Promise<void>;
export declare function writeCommandBenchmarkJsonReport(report: CommandBenchmarkReport, reportPath: string): Promise<void>;
export interface WriteCommandBenchmarkReportsOptions {
    jsonReportPath?: string | false;
}
export declare function writeCommandBenchmarkReports(report: CommandBenchmarkReport, markdownReportPath: string, options?: WriteCommandBenchmarkReportsOptions): Promise<{
    markdown: string;
    json?: string;
}>;
export {};
