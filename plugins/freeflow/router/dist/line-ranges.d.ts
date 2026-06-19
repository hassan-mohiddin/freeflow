export interface ExactLineRangeInput {
    start: number;
    end: number;
}
export interface ExactLineRange {
    start: number;
    end: number;
}
export interface ResolveExactLineRangeOptions {
    requested: ExactLineRangeInput;
    lineCount: number;
    availableLabel: string;
    invalidReason: string;
}
export type ResolveExactLineRangeResult = {
    ok: true;
    range: ExactLineRange;
} | {
    ok: false;
    reason: string;
};
export declare function resolveExactLineRange(options: ResolveExactLineRangeOptions): ResolveExactLineRangeResult;
