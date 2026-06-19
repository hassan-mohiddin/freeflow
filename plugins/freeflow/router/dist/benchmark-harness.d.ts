export interface LatencySummary {
    p50: number;
    p95: number;
}
export interface BenchmarkCliDefaults {
    reportPath: string;
}
export interface ParsedBenchmarkCliArgs {
    iterations?: number;
    reportPath: string;
    jsonReportPath?: string | false;
}
export declare function normalizeIterations(value: unknown, defaultIterations?: number): number;
export declare function approximateTokens(bytes: number): number;
export declare function percentile(values: readonly number[], quantile: number): number;
export declare function latencySummary(values: readonly number[]): LatencySummary;
export declare function averagePercent(values: readonly number[]): number;
export declare function medianPercent(values: readonly number[]): number;
export declare function reductionPercent(raw: number, routed: number): number;
export declare function formatPercent(value: number): string;
export declare function escapeMarkdownTableCell(value: string): string;
export declare function defaultJsonRunReportPath(markdownReportPath: string): string;
export declare function parseBenchmarkCliArgs(argv: readonly string[], defaults: BenchmarkCliDefaults): ParsedBenchmarkCliArgs;
export declare function writeBenchmarkReportPair<TReport>(options: {
    report: TReport;
    markdownReportPath: string;
    jsonReportPath?: string | false | undefined;
    renderMarkdown(report: TReport): string;
}): Promise<{
    markdown: string;
    json?: string;
}>;
