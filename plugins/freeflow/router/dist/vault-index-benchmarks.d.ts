export interface RunVaultIndexStorageBenchmarkOptions {
    iterations?: number;
    generatedAt?: string;
}
export interface VaultIndexStorageBenchmarkReport {
    generatedAt: string;
    iterations: number;
    summary: VaultIndexStorageBenchmarkSummary;
    candidates: VaultIndexStorageCandidateResult[];
}
export interface VaultIndexStorageBenchmarkSummary {
    selectedEngine: string;
    selectedReason: string;
    fixtures: number;
    localSidecarPassed: boolean;
    scannerBaselinePassed: boolean;
    sqliteFtsStatus: "not-run" | "available" | "failed";
    localAppendMs: LatencyPair;
    localQueryMs: LatencyPair;
    scanQueryMs: LatencyPair;
    localQueryReductionPercent: number;
}
export interface LatencyPair {
    p50: number;
    p95: number;
}
export interface VaultIndexStorageCandidateResult {
    candidate: string;
    status: "pass" | "fail" | "not-run";
    adopted: boolean;
    appendMs?: LatencyPair;
    queryMs?: LatencyPair;
    rawBytes?: number;
    resultBytes?: number;
    reductionPercent?: number;
    checks: string[];
    notes: string[];
}
export declare function runVaultIndexStorageBenchmark(options?: RunVaultIndexStorageBenchmarkOptions): Promise<VaultIndexStorageBenchmarkReport>;
export declare function renderVaultIndexStorageBenchmarkReport(report: VaultIndexStorageBenchmarkReport): string;
export declare function writeVaultIndexStorageBenchmarkReport(report: VaultIndexStorageBenchmarkReport, reportPath: string): Promise<void>;
export declare function writeVaultIndexStorageBenchmarkReports(report: VaultIndexStorageBenchmarkReport, markdownReportPath: string, options?: {
    jsonReportPath?: string | false;
}): Promise<{
    markdown: string;
    json?: string;
}>;
