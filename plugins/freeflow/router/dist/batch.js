import { createHash } from "node:crypto";
import { freeflowRetrieve } from "./retrieve.js";
import { freeflowRun } from "./run.js";
import { freeflowTransform } from "./transform.js";
const DEFAULT_BATCH_CONCURRENCY = 4;
const MAX_BATCH_CONCURRENCY = 16;
const MAX_BATCH_STEPS = 50;
const BATCH_STEP_KINDS = new Set(["run", "retrieve", "search", "derive", "transform"]);
export async function freeflowBatch(options, runner) {
    const validation = validateBatchInput(options);
    if (!validation.ok) {
        return batchValidationFailure(options.preserve ?? "important", validation.issues);
    }
    const startedAt = Date.now();
    const steps = await mapWithConcurrency(validation.value.steps, validation.value.concurrency, (step, index) => executeBatchStep({
        step,
        index,
        options: validation.value,
        runner,
    }));
    const failedCount = steps.filter((step) => step.status === "failed").length;
    const okCount = steps.length - failedCount;
    const routingStatus = failedCount === 0 ? "routed" : okCount === 0 ? "failed" : "partial";
    const durationMs = Date.now() - startedAt;
    return {
        toolStatus: failedCount === 0 ? "ok" : "error",
        decisionId: decisionId("batch", validation.value.sessionId, String(steps.length), String(failedCount), stepDecisionSeed(steps)),
        preserve: validation.value.preserve,
        producer: { kind: "other", name: "batch" },
        persistence: { status: "not_persisted", recoverability: "none" },
        routing: {
            status: routingStatus,
            route: "batch",
            reason: failedCount === 0
                ? `Ran ${steps.length} independent Freeflow-owned step(s) with concurrency=${validation.value.concurrency}; child results are available in details.result.steps.`
                : `Ran ${steps.length} independent Freeflow-owned step(s) with concurrency=${validation.value.concurrency}; ${failedCount} step(s) failed and ${okCount} step(s) completed. Child results are available in details.result.steps.`,
        },
        summary: `Batch completed ${okCount}/${steps.length} step(s) successfully in ${durationMs}ms with concurrency=${validation.value.concurrency}.`,
        concurrency: validation.value.concurrency,
        stepCount: steps.length,
        okCount,
        failedCount,
        steps,
        recovery: {
            how: "Inspect details.result.steps for each child result. Child run/derive outputs remain recoverable by their own outputId; child retrieve results keep exact path/outputId and line-range recovery hints.",
        },
    };
}
function validateBatchInput(value) {
    const issues = [];
    if (!isRecord(value)) {
        return { ok: false, issues: [{ path: "$", message: "Expected batch input object." }] };
    }
    if (typeof value.sessionId !== "string" || value.sessionId.length === 0) {
        issues.push({ path: "$.sessionId", message: "Expected non-empty sessionId." });
    }
    if (!Array.isArray(value.steps) || value.steps.length === 0) {
        issues.push({ path: "$.steps", message: "Expected at least one batch step." });
    }
    else if (value.steps.length > MAX_BATCH_STEPS) {
        issues.push({ path: "$.steps", message: `Expected at most ${MAX_BATCH_STEPS} batch steps.` });
    }
    const concurrency = normalizeConcurrency(value.concurrency);
    if (!concurrency.ok) {
        issues.push({ path: "$.concurrency", message: concurrency.message });
    }
    if (value.preserve !== undefined && value.preserve !== "summary" && value.preserve !== "important" && value.preserve !== "full") {
        issues.push({ path: "$.preserve", message: "Expected preserve mode summary, important, or full." });
    }
    const normalizedSteps = [];
    if (Array.isArray(value.steps)) {
        value.steps.forEach((step, index) => {
            if (!isRecord(step)) {
                issues.push({ path: `$.steps[${index}]`, message: "Expected batch step object." });
                return;
            }
            if (typeof step.kind !== "string" || !BATCH_STEP_KINDS.has(step.kind)) {
                issues.push({ path: `$.steps[${index}].kind`, message: "Expected step kind run, retrieve, search, derive, or transform." });
            }
            if (step.id !== undefined && (typeof step.id !== "string" || step.id.length === 0)) {
                issues.push({ path: `$.steps[${index}].id`, message: "Expected non-empty string id when present." });
            }
            if (!isRecord(step.input)) {
                issues.push({ path: `$.steps[${index}].input`, message: "Expected step input object." });
            }
            if (typeof step.kind === "string" && BATCH_STEP_KINDS.has(step.kind) && isRecord(step.input)) {
                normalizedSteps.push({
                    id: typeof step.id === "string" && step.id.length > 0 ? step.id : `${step.kind}-${index + 1}`,
                    kind: step.kind,
                    input: step.input,
                });
            }
        });
    }
    if (issues.length > 0 || !concurrency.ok) {
        return { ok: false, issues };
    }
    const normalized = {
        ...value,
        steps: normalizedSteps,
        concurrency: concurrency.value,
        preserve: value.preserve ?? "important",
    };
    return { ok: true, value: normalized };
}
function normalizeConcurrency(value) {
    if (value === undefined) {
        return { ok: true, value: DEFAULT_BATCH_CONCURRENCY };
    }
    if (!Number.isInteger(value) || value < 1 || value > MAX_BATCH_CONCURRENCY) {
        return { ok: false, message: `Expected integer concurrency from 1 to ${MAX_BATCH_CONCURRENCY}.` };
    }
    return { ok: true, value };
}
async function executeBatchStep(options) {
    const startedAt = Date.now();
    try {
        const result = await executeStepResult(options.step, options.options, options.runner);
        return {
            id: options.step.id,
            index: options.index,
            kind: options.step.kind,
            status: isFailedChildResult(result, options.step.kind) ? "failed" : "ok",
            toolStatus: result.toolStatus,
            durationMs: Date.now() - startedAt,
            result,
        };
    }
    catch (error) {
        return {
            id: options.step.id,
            index: options.index,
            kind: options.step.kind,
            status: "failed",
            durationMs: Date.now() - startedAt,
            error: errorMessage(error),
        };
    }
}
async function executeStepResult(step, options, runner) {
    if (step.kind === "run") {
        return freeflowRun({
            ...step.input,
            preserve: step.input.preserve ?? options.preserve,
            sessionId: options.sessionId,
            ...(options.vaultRoot !== undefined ? { vaultRoot: options.vaultRoot } : {}),
            ...(options.vaultRetention !== undefined ? { vaultRetention: options.vaultRetention } : {}),
            ...(options.thresholds !== undefined ? { thresholds: options.thresholds } : {}),
            ...(options.scriptDerive !== undefined ? { scriptDerive: options.scriptDerive } : {}),
            ...(options.scriptSandboxAdapters !== undefined ? { scriptSandboxAdapters: options.scriptSandboxAdapters } : {}),
            ...(options.storagePolicy !== undefined ? { storagePolicy: options.storagePolicy } : {}),
        }, runner);
    }
    if (step.kind === "retrieve" || step.kind === "search") {
        return freeflowRetrieve({
            ...step.input,
            preserve: step.input.preserve ?? options.preserve,
        });
    }
    return freeflowTransform({
        ...step.input,
        preserve: step.input.preserve ?? options.preserve,
        sessionId: options.sessionId,
        ...(options.vaultRoot !== undefined ? { vaultRoot: options.vaultRoot } : {}),
        ...(options.vaultRetention !== undefined ? { vaultRetention: options.vaultRetention } : {}),
        ...(options.thresholds !== undefined ? { thresholds: options.thresholds } : {}),
        ...(options.scriptDerive !== undefined ? { scriptDerive: options.scriptDerive } : {}),
        ...(options.scriptSandboxAdapters !== undefined ? { scriptSandboxAdapters: options.scriptSandboxAdapters } : {}),
    });
}
function isFailedChildResult(result, kind) {
    if (result.toolStatus === "error" || result.routing?.status === "failed") {
        return true;
    }
    if (kind === "run" && "execution" in result && result.execution?.status !== "success") {
        return true;
    }
    return false;
}
async function mapWithConcurrency(items, concurrency, worker) {
    const results = new Array(items.length);
    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (nextIndex < items.length) {
            const index = nextIndex;
            nextIndex += 1;
            const item = items[index];
            if (item !== undefined) {
                results[index] = await worker(item, index);
            }
        }
    });
    await Promise.all(workers);
    return results;
}
function batchValidationFailure(preserve, issues) {
    return {
        toolStatus: "error",
        decisionId: decisionId("batch-validation", validationMessage(issues)),
        preserve,
        producer: { kind: "other", name: "batch" },
        persistence: { status: "not_persisted", recoverability: "none" },
        routing: {
            status: "failed",
            route: "batch",
            reason: `Invalid freeflow_batch input: ${validationMessage(issues)}`,
        },
        summary: "Batch was not executed because the input was invalid.",
        concurrency: 0,
        stepCount: 0,
        okCount: 0,
        failedCount: 0,
        steps: [],
        recovery: {
            how: "No batch steps were executed. Fix the batch schema and rerun.",
        },
    };
}
function stepDecisionSeed(steps) {
    return steps.map((step) => `${step.index}:${step.kind}:${step.status}:${step.result?.decisionId ?? step.error ?? "none"}`).join("|");
}
function validationMessage(issues) {
    return issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function decisionId(...parts) {
    return `ffdec_${hash(parts.join("\0")).slice(0, 16)}`;
}
function hash(value) {
    return createHash("sha256").update(value).digest("hex");
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
