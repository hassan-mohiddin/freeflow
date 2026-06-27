import type { ImportantLine } from "../config/types.js";
export type ImportantStream = ImportantLine["stream"];
export interface LineEntry {
    line: string;
    lineNumber: number;
}
export interface EvidenceCaps {
    maxLines?: number;
    maxExcerptBytes?: number;
    maxLineBytes?: number;
}
export interface BoundedEvidence {
    importantLines: ImportantLine[];
    fidelity: "exact" | "lossy";
    compressed: boolean;
    selectedLineCount: number;
    sourceLineCount: number;
}
export declare const DEFAULT_MAX_IMPORTANT_LINES = 8;
export declare const DEFAULT_MAX_IMPORTANT_EXCERPT_BYTES: number;
export declare const DEFAULT_MAX_IMPORTANT_LINE_BYTES: number;
export declare const TRUNCATION_MARKER = "\u2026 [truncated; recover exact output from vault]";
export declare function assembleImportantLines(options: {
    stream: ImportantStream;
    entries: readonly LineEntry[];
    sourceText: string;
    caps?: EvidenceCaps;
}): BoundedEvidence;
export declare function assembleTextEvidence(options: {
    stream: ImportantStream;
    text: string;
    caps?: EvidenceCaps;
}): BoundedEvidence;
export declare function lineEntries(text: string): LineEntry[];
export declare function nonEmptyLineEntries(text: string): LineEntry[];
export declare function splitLines(text: string): string[];
export declare function countLines(text: string): number;
export declare function byteLength(text: string): number;
