import {
  type DelegationModelVisibleOutputFormat,
  type DelegationResultView,
  type DelegationResultViewRequest,
} from "./types.js";
export declare const DELEGATION_RESULT_VIEWS: readonly [
  "alert",
  "summary",
  "default",
  "findings",
  "checks",
  "files",
  "evidence",
  "risks",
  "diff",
  "full",
  "raw",
];
export declare const DELEGATION_MODEL_VISIBLE_OUTPUT_FORMATS: readonly ["compact_text", "markdown", "pipe_rows"];
export declare function normalizeDelegationResultViewRequest(
  input: Omit<DelegationResultViewRequest, "view" | "outputFormat"> &
    Partial<Pick<DelegationResultViewRequest, "view" | "outputFormat">>,
): DelegationResultViewRequest;
export declare function normalizeModelVisibleOutputFormat(
  format: string | undefined,
): DelegationModelVisibleOutputFormat;
export declare function isFullOrRawDelegationResultView(view: DelegationResultView): boolean;
