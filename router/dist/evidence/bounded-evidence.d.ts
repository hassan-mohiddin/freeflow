import type { EvidenceWindow } from "../config/types.js";
export interface LineRange {
    start: number;
    end: number;
}
export interface BoundedEvidenceCaps {
    queryExcerptMaxBytes: number;
    linePreviewMaxBytes: number;
    expandLines30MaxBytes: number;
    expandLines30MaxLines: number;
    expandLines80MaxBytes: number;
    expandLines80MaxLines: number;
    exactChunkMaxBytes: number;
}
export interface BuildBoundedExcerptOptions {
    lines: readonly string[];
    range: LineRange;
    window: EvidenceWindow;
    caps: BoundedEvidenceCaps;
    exactNormalizedPhrase?: string;
}
export interface BoundedExcerpt {
    range: LineRange;
    linesLabel: string;
    excerpt: string;
    truncatedByLineCap: boolean;
    truncatedByByteCap: boolean;
}
export interface BoundedEdgeChunk {
    range: LineRange;
    linesLabel: string;
    edge: "head" | "tail";
    excerpt: string;
}
export declare function buildBoundedEdgeChunks(options: {
    lines: readonly string[];
    range: LineRange;
    caps: BoundedEvidenceCaps;
}): BoundedEdgeChunk[];
export declare function buildBoundedExcerpt(options: BuildBoundedExcerptOptions): BoundedExcerpt;
