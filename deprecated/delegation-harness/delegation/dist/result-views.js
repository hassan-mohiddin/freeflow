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
];
export const DELEGATION_MODEL_VISIBLE_OUTPUT_FORMATS = ["compact_text", "markdown", "pipe_rows"];
export function normalizeDelegationResultViewRequest(input) {
    const normalized = {
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
export function normalizeModelVisibleOutputFormat(format) {
    return oneOf(format ?? "compact_text", DELEGATION_MODEL_VISIBLE_OUTPUT_FORMATS, "output format");
}
export function isFullOrRawDelegationResultView(view) {
    return view === "full" || view === "raw";
}
function oneOf(value, allowed, label) {
    if (allowed.includes(value)) {
        return value;
    }
    throw new Error(`invalid ${label}: ${value}`);
}
