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
    details: AccessLogReducerDetails;
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
export interface AccessLogSlowExample {
    method: string;
    path: string;
    status: number;
    latencyMs: number;
}
export declare function selectProcessingReducer(input: ProcessingReducerInput): ProcessingReducerSelection;
export declare function reduceAccessLog(text: string): {
    candidate: ProcessingReducerCandidate;
    result?: ProcessingReducerResult;
};
