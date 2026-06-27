export interface ProcessingReducerInput {
    text: string;
}
export interface ProcessingReducerFact {
    name: string;
    value: string | number | boolean;
}
export interface ProcessingReducerCandidate {
    name: string;
    version: string;
    confidence: number;
    reason: string;
}
export interface ProcessingReducerResult {
    name: string;
    version: string;
    confidence: number;
    reason: string;
    facts: ProcessingReducerFact[];
    visibleText: string;
    details: AccessLogReducerDetails | TestOutputReducerDetails | BuildOutputReducerDetails | DiagnosticsReducerDetails | McpToolsReducerDetails | TableReducerDetails | BrowserSnapshotReducerDetails | GitLogReducerDetails;
}
export type ProcessingReducerSelection = {
    status: "selected";
    candidates: ProcessingReducerCandidate[];
    selected: ProcessingReducerCandidate;
    result: ProcessingReducerResult;
    reason: string;
} | {
    status: "not_selected";
    candidates: ProcessingReducerCandidate[];
    reason: string;
};
export interface AccessLogReducerDetails {
    kind: "access-log";
    requestCount: number;
    statusCounts: Record<string, number>;
    errorCount: number;
    errorRatePercent: number;
    averageLatencyMs: number;
    slowThresholdMs: number;
    slowRequestCount: number;
    slowExamples: AccessLogSlowExample[];
    ignoredLineCount: number;
}
export interface TestOutputReducerDetails {
    kind: "test-output";
    testFiles: TestOutputCounts;
    tests: TestOutputCounts;
    failedFiles: string[];
    failedTests: string[];
}
export interface TestOutputCounts {
    failed?: number;
    passed?: number;
    skipped?: number;
    total?: number;
}
export interface BuildOutputReducerDetails {
    kind: "build-output";
    finalStatus?: string;
    errorCount: number;
    warningCount: number;
    compiledCount: number;
    errorFiles: string[];
    warningFiles: string[];
    firstErrors: BuildIssueSummary[];
    firstWarnings: BuildIssueSummary[];
}
export interface BuildIssueSummary {
    file: string;
    message: string;
    line?: number;
    column?: number;
}
export interface DiagnosticsReducerDetails {
    kind: "diagnostics";
    total: number;
    errorCount: number;
    warningCount: number;
    fileCount: number;
    topFiles: Array<{
        file: string;
        count: number;
    }>;
    topCodes: Array<{
        code: string;
        count: number;
    }>;
    firstDiagnostics: DiagnosticSummary[];
}
export interface DiagnosticSummary {
    file: string;
    line: number;
    column: number;
    severity: "error" | "warning";
    code?: string;
    message: string;
}
export interface McpToolsReducerDetails {
    kind: "mcp-tools";
    toolCount: number;
    categories: Array<{
        category: string;
        count: number;
    }>;
    signatures: McpToolSignature[];
}
export interface McpToolSignature {
    name: string;
    category: string;
    parameters: string[];
    required: string[];
    description?: string;
}
export interface TableReducerDetails {
    kind: "table";
    format: "csv" | "json";
    rowCount: number;
    columns: string[];
    categorical: TableCategoricalSummary[];
    numeric: TableNumericSummary[];
}
export interface TableCategoricalSummary {
    column: string;
    counts: Array<{
        value: string;
        count: number;
    }>;
}
export interface TableNumericSummary {
    column: string;
    min: number;
    max: number;
    average: number;
}
export interface BrowserSnapshotReducerDetails {
    kind: "browser-snapshot";
    lineCount: number;
    pageTitle?: string;
    pageUrl?: string;
    refCount: number;
    namedLinkCount: number;
    textNodeCount: number;
    storyLikeLinkCount: number;
    roleCounts: Array<{
        role: string;
        count: number;
    }>;
    topInteractiveNodes: BrowserSnapshotNode[];
    topTextNodes: string[];
}
export interface BrowserSnapshotNode {
    role: string;
    name: string;
    ref?: string;
}
export interface GitLogReducerDetails {
    kind: "git-log";
    commitCount: number;
    typeCounts: Array<{
        type: string;
        count: number;
    }>;
    scopeCounts: Array<{
        scope: string;
        count: number;
    }>;
    authorCounts: Array<{
        author: string;
        count: number;
    }>;
    recentCommits: GitLogCommitSummary[];
}
export interface GitLogCommitSummary {
    hash: string;
    date?: string;
    author?: string;
    type: string;
    scope?: string;
    subject: string;
}
export interface AccessLogSlowExample {
    method: string;
    path: string;
    status: number;
    latencyMs: number;
}
export declare function selectProcessingReducer(input: ProcessingReducerInput): ProcessingReducerSelection;
export declare function reduceTestOutput(text: string): {
    candidate: ProcessingReducerCandidate;
    result?: ProcessingReducerResult;
};
export declare function reduceBuildOutput(text: string): {
    candidate: ProcessingReducerCandidate;
    result?: ProcessingReducerResult;
};
export declare function reduceDiagnosticsOutput(text: string): {
    candidate: ProcessingReducerCandidate;
    result?: ProcessingReducerResult;
};
export declare function reduceMcpToolsOutput(text: string): {
    candidate: ProcessingReducerCandidate;
    result?: ProcessingReducerResult;
};
export declare function reduceTableOutput(text: string): {
    candidate: ProcessingReducerCandidate;
    result?: ProcessingReducerResult;
};
export declare function reduceBrowserSnapshotOutput(text: string): {
    candidate: ProcessingReducerCandidate;
    result?: ProcessingReducerResult;
};
export declare function reduceGitLogOutput(text: string): {
    candidate: ProcessingReducerCandidate;
    result?: ProcessingReducerResult;
};
export declare function reduceAccessLog(text: string): {
    candidate: ProcessingReducerCandidate;
    result?: ProcessingReducerResult;
};
