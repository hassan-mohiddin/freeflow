export interface RunContextSavingBaselineOptions {
    generatedAt?: string;
}
export interface ContextSavingBaselineReport {
    generatedAt: string;
    summary: ContextSavingBaselineSummary;
    observations: ContextSavingBaselineObservation[];
    guardrails: ContextSavingGuardrail[];
    notes: string[];
}
export interface ContextSavingBaselineSummary {
    fixtures: number;
    factsPreserved: number;
    recoveryAvailable: number;
    totalRawBytes: number;
    totalModelVisibleBytes: number;
    totalDetailsPayloadBytes: number;
    totalRawTokensApprox: number;
    totalModelVisibleTokensApprox: number;
    totalDetailsPayloadTokensApprox: number;
    weightedModelVisibleReductionPercent: number;
}
export interface ContextSavingBaselineObservation {
    id: string;
    title: string;
    tool: "freeflow_run" | "freeflow_search" | "freeflow_search action=transform";
    action: string;
    rawBytes: number;
    modelVisibleBytes: number;
    detailsPayloadBytes: number;
    rawTokensApprox: number;
    modelVisibleTokensApprox: number;
    detailsPayloadTokensApprox: number;
    modelVisibleReductionPercent: number;
    factsPreserved: boolean;
    recoveryAvailable: boolean;
    recoveryHint: string;
    status: string;
    outputId?: string;
    evidenceLocations: string[];
    notes: string[];
}
export interface ContextSavingGuardrail {
    path: string;
    behaviors: string[];
}
export declare function runContextSavingBaseline(options?: RunContextSavingBaselineOptions): Promise<ContextSavingBaselineReport>;
export declare function renderContextSavingBaselineReport(report: ContextSavingBaselineReport): string;
export declare function writeContextSavingBaselineReport(report: ContextSavingBaselineReport, markdownReportPath: string, options?: {
    jsonReportPath?: string | false;
}): Promise<{
    markdown: string;
    json?: string;
}>;
