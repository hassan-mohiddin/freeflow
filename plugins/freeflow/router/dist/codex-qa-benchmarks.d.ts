export interface RunCodexQaBenchmarksOptions {
    iterations?: number;
    generatedAt?: string;
}
export interface CodexQaBenchmarkReport {
    generatedAt: string;
    iterations: number;
    summary: CodexQaBenchmarkSummary;
    fixtures: CodexQaBenchmarkFixtureResult[];
    skippedExternalTools: CodexQaSkippedExternalTool[];
}
export interface CodexQaBenchmarkSummary {
    fixtures: number;
    modeResults: number;
    improved: CodexQaModeSummary;
    nativeBaseline: CodexQaModeSummary;
    sandboxFailureFixed: boolean;
    generatedFalsePositiveCount: number;
}
export interface CodexQaModeSummary {
    passed: number;
    failed: number;
    skipped: number;
    answerCorrect: number;
    citationCorrect: number;
    evidenceCorrect: number;
    generatedFalsePositiveCount: number;
    totalRawBytes: number;
    totalContextBytes: number;
    totalRawTokensApprox: number;
    totalContextTokensApprox: number;
    weightedByteReductionPercent: number;
    weightedTokenReductionPercent: number;
}
export interface CodexQaBenchmarkFixtureResult {
    id: string;
    title: string;
    question: string;
    expected: CodexQaExpected;
    results: CodexQaModeResult[];
}
export interface CodexQaExpected {
    path: string;
    requiredEvidence: string[];
    requiredAnswer: string[];
    sourceCitationStatus: "skipped-unavailable" | "checked";
}
export interface CodexQaModeResult {
    mode: CodexQaBenchmarkMode;
    toolPathUsed: string;
    skipped: boolean;
    skipReason?: string;
    proxyCalls: number;
    rawBytes: number;
    rawTokensApprox: number;
    contextBytes: number;
    contextTokensApprox: number;
    byteReductionPercent: number;
    tokenReductionPercent: number;
    latencyMs: {
        p50: number;
        p95: number;
    };
    actualPath?: string;
    actualLines?: string;
    answer: string;
    evidenceExcerpt: string;
    correctness: CodexQaCorrectness;
    notes: string[];
}
export interface CodexQaCorrectness {
    passed: boolean;
    answerCorrect: boolean;
    citationCorrect: boolean;
    evidenceCorrect: boolean;
    generatedFalsePositive: boolean;
}
export interface CodexQaSkippedExternalTool {
    name: string;
    reason: string;
}
type CodexQaBenchmarkMode = "native-broad-search-proxy" | "improved-freeflow-router";
export declare function runCodexQaBenchmarks(options?: RunCodexQaBenchmarksOptions): Promise<CodexQaBenchmarkReport>;
export declare function writeCodexQaBenchmarkReports(report: CodexQaBenchmarkReport, markdownReportPath: string, options?: {
    jsonReportPath?: string | false | undefined;
}): Promise<{
    markdown: string;
    json?: string;
}>;
export declare function renderCodexQaBenchmarkReport(report: CodexQaBenchmarkReport): string;
export {};
