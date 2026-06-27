export interface LineRange {
    start: number;
    end: number;
}
export type EvidenceChunkKind = "section" | "symbol" | "window";
export type EvidenceRangeMatchKind = "exact-phrase" | "coverage" | "best-line";
export interface SelectEvidenceRangeForChunkOptions {
    lines: readonly string[];
    chunkRange: LineRange;
    chunkKind: EvidenceChunkKind;
    queryTokens: readonly string[];
    normalizedQueryPhrase: string;
    chunkHasExactPhrase: boolean;
    defaultContextLines: number;
    queryCoverageMaxLines: number;
}
export interface EvidenceRangeSelection {
    range: LineRange;
    anchorLine: number;
    matchKind: EvidenceRangeMatchKind;
}
export declare function selectEvidenceRangeForChunk(options: SelectEvidenceRangeForChunkOptions): EvidenceRangeSelection;
