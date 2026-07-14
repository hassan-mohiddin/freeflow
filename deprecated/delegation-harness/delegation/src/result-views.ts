import {
  type DelegationModelVisibleOutputFormat,
  type DelegationResultView,
  type DelegationResultViewRequest,
} from "./types.js";
import { validateSafeId } from "./paths.js";

export const DELEGATION_RESULT_VIEWS = [
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
] as const satisfies readonly DelegationResultView[];

export const DELEGATION_MODEL_VISIBLE_OUTPUT_FORMATS = ["compact_text", "markdown", "pipe_rows"] as const satisfies readonly DelegationModelVisibleOutputFormat[];

export function normalizeDelegationResultViewRequest(
  input: Omit<DelegationResultViewRequest, "view" | "outputFormat"> & Partial<Pick<DelegationResultViewRequest, "view" | "outputFormat">>,
): DelegationResultViewRequest {
  const normalized: DelegationResultViewRequest = {
    taskId: validateSafeId(input.taskId, "task id"),
    agentId: validateSafeId(input.agentId, "agent id"),
    view: oneOf(input.view ?? "default", DELEGATION_RESULT_VIEWS, "result view"),
    outputFormat: normalizeModelVisibleOutputFormat(input.outputFormat),
  };

  if (input.maxBytes !== undefined) {
    if (!Number.isInteger(input.maxBytes) || input.maxBytes < 1) {
      throw new Error("maxBytes must be a positive integer");
    }
    normalized.maxBytes = input.maxBytes;
  }

  return normalized;
}

export function normalizeModelVisibleOutputFormat(format: string | undefined): DelegationModelVisibleOutputFormat {
  return oneOf(format ?? "compact_text", DELEGATION_MODEL_VISIBLE_OUTPUT_FORMATS, "output format");
}

export function isFullOrRawDelegationResultView(view: DelegationResultView): boolean {
  return view === "full" || view === "raw";
}

function oneOf<const T extends string>(value: string, allowed: readonly T[], label: string): T {
  if ((allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  throw new Error(`invalid ${label}: ${value}`);
}
