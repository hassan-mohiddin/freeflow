export interface ExperimentalLocalIndexOptions {
    root: string;
    cacheRoot?: string;
}
export interface ExperimentalIndexLoadResult {
    mode: ExperimentalIndexLoadMode;
    index: ExperimentalRepoIndex;
    cachePath: string;
    buildMs: number;
    refreshReason?: string;
}
export type ExperimentalIndexLoadMode = "cold-built" | "warm-loaded" | "stale-refreshed";
export interface ExperimentalRepoIndex {
    version: 1;
    root: string;
    builtAt: string;
    files: Record<string, ExperimentalIndexedFile>;
    chunks: ExperimentalIndexedChunk[];
    tokenDocumentFrequency: Record<string, number>;
    averageChunkTokens: number;
    cachePath: string;
}
export interface ExperimentalIndexedFile {
    path: string;
    hashSha256: string;
    sizeBytes: number;
    lineCount: number;
    chunkIds: number[];
}
export interface ExperimentalIndexedChunk {
    id: number;
    path: string;
    startLine: number;
    endLine: number;
    kind: "section" | "window";
    text: string;
    tokens: string[];
    tokenCounts: Record<string, number>;
    heading?: string;
}
export interface ExperimentalIndexQueryOptions {
    topK?: number;
}
export interface ExperimentalIndexCandidate {
    path: string;
    lines: string;
    excerpt: string;
    score: number;
    reason: string;
    chunkKind: ExperimentalIndexedChunk["kind"];
    hashSha256: string;
    contextBytes: number;
}
export declare function defaultExperimentalIndexCacheRoot(): string;
export declare function experimentalIndexCachePath(options: ExperimentalLocalIndexOptions): Promise<string>;
export declare function buildOrLoadExperimentalRepoIndex(options: ExperimentalLocalIndexOptions): Promise<ExperimentalIndexLoadResult>;
export declare function queryExperimentalRepoIndex(index: ExperimentalRepoIndex, query: string, options?: ExperimentalIndexQueryOptions): ExperimentalIndexCandidate[];
