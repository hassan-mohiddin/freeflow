import { type BoundedEvidence } from "./evidence.js";
import type { ImportantLine, RunOutputFilterMetadata } from "./types.js";
export type { RunOutputFilterMetadata } from "./types.js";
export declare const RUN_FILTER_STREAMS: readonly ["stdout", "stderr", "combined"];
export type RunFilterStream = (typeof RUN_FILTER_STREAMS)[number];
export interface RunOutputFiltersInput {
    stream?: RunFilterStream;
    include?: string | readonly string[];
    exclude?: string | readonly string[];
    flags?: string;
    head?: number;
    tail?: number;
    maxLines?: number;
    maxBytes?: number;
}
export interface NormalizedRunOutputFilters {
    stream?: RunFilterStream;
    include: string[];
    exclude: string[];
    flags: string;
    head?: number;
    tail?: number;
    maxLines?: number;
    maxBytes?: number;
}
export interface RunOutputFilterResult {
    stream: RunFilterStream;
    evidence: BoundedEvidence;
    metadata: RunOutputFilterMetadata;
    description: string;
}
export type RunOutputFilterValidationResult = {
    ok: true;
    filters?: NormalizedRunOutputFilters;
} | {
    ok: false;
    message: string;
    path: string;
};
export declare function normalizeRunOutputFilters(input: unknown): RunOutputFilterValidationResult;
export declare function hasRunOutputFilters(filters: NormalizedRunOutputFilters | undefined): filters is NormalizedRunOutputFilters;
export declare function applyRunOutputFilters(options: {
    filters: NormalizedRunOutputFilters;
    defaultStream: RunFilterStream;
    stdout: string;
    stderr: string;
    combined: string;
    fallbackImportantLines?: readonly ImportantLine[];
    preserveFallbackFailureEvidence?: boolean;
    caps?: {
        maxLines?: number;
        maxExcerptBytes?: number;
        maxLineBytes?: number;
    };
}): RunOutputFilterResult;
export declare function describeRunOutputFilters(metadata: RunOutputFilterMetadata): string;
