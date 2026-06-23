import { freeflowCapture, freeflowDerive, freeflowRetrieve, freeflowRun } from "../../router/dist/index.js";
import { buildFreeflowStatusReport } from "./status.js";
import { createPiCaptureAdapters, normalizeCaptureParams } from "./mcp-capture.js";
import { renderFreeflowCaptureCall, renderFreeflowCaptureResult, renderFreeflowDeriveCall, renderFreeflowDeriveResult, renderFreeflowRetrieveCall, renderFreeflowRetrieveResult, renderFreeflowRunCall, renderFreeflowRunResult, renderFreeflowStatusCall, renderFreeflowStatusResult, } from "./renderers.js";
import { readOutputRouterConfig, notifyRouterConfigWarnings } from "./runtime-context.js";
import { FREEFLOW_CAPTURE_PARAMETERS, FREEFLOW_DERIVE_PARAMETERS, FREEFLOW_RETRIEVE_PARAMETERS, FREEFLOW_RUN_PARAMETERS, FREEFLOW_STATUS_PARAMETERS } from "./schemas.js";
import { getRouterSessionId, routedToolText } from "./utils.js";
function normalizeDeriveOperation(operation) {
    if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
        return operation;
    }
    if (typeof operation.group !== "string" || !/^(0|[1-9][0-9]*)$/.test(operation.group)) {
        return operation;
    }
    return {
        ...operation,
        group: Number(operation.group),
    };
}
async function normalizeDeriveParams(params, ctx) {
    const source = params.source;
    if (!source || source.kind !== "vault") {
        throw new Error("freeflow_derive currently supports source.kind=vault only.");
    }
    if (!source.outputId) {
        throw new Error("freeflow_derive source.kind=vault requires source.outputId.");
    }
    return {
        ...params,
        operation: normalizeDeriveOperation(params.operation),
        source: {
            kind: "vault",
            outputId: source.outputId,
            ...(source.stream ? { stream: source.stream } : {}),
        },
    };
}
async function normalizeRetrieveParams(params, ctx) {
    const routerConfigResult = await readOutputRouterConfig(ctx.cwd);
    notifyRouterConfigWarnings(ctx, routerConfigResult);
    const source = params.source ?? { kind: "repo" };
    if (source.kind === "repo") {
        return {
            ...params,
            generatedPathGlobs: routerConfigResult.config.hints?.generatedPathGlobs,
            source: {
                kind: "repo",
                root: ctx.cwd,
                ...(source.path ? { path: source.path } : {}),
            },
        };
    }
    if (source.kind === "vault") {
        if (!source.outputId) {
            throw new Error("freeflow_retrieve source.kind=vault requires source.outputId.");
        }
        return {
            ...params,
            source: {
                kind: "vault",
                root: routerConfigResult.config.vault.root,
                sessionId: getRouterSessionId(ctx),
                outputId: source.outputId,
                ...(source.stream ? { stream: source.stream } : {}),
            },
        };
    }
    throw new Error(`Unsupported freeflow_retrieve source kind: ${source.kind}`);
}
function createPiCommandRunner(pi, signal) {
    return {
        async run(request) {
            const startedAt = Date.now();
            const command = Array.isArray(request.command) ? request.command.join(" ") : request.command;
            const result = await pi.exec("bash", ["-lc", command], {
                cwd: request.cwd,
                timeout: request.timeoutMs,
                signal,
            });
            const durationMs = Date.now() - startedAt;
            const killed = Boolean(result.killed);
            const code = typeof result.code === "number" ? result.code : null;
            const executionStatus = (signal?.aborted ? "cancelled" : killed ? "timed_out" : code === 0 ? "success" : "failed");
            return {
                stdout: result.stdout ?? "",
                stderr: result.stderr ?? "",
                executionStatus,
                exitCode: code,
                durationMs,
            };
        },
    };
}
export function registerRouterTools(pi) {
    pi.registerTool({
        name: "freeflow_status",
        label: "Freeflow Status",
        description: "Inspect effective Freeflow router/capture/provider behavior, vault writability, warnings, and non-destructive migration recommendations.",
        promptSnippet: "Inspect Freeflow effective config, provider availability, vault status, and migration recommendations.",
        promptGuidelines: [
            "Use freeflow_status when setup/config/status/doctor evidence is needed.",
            "Status and migration recommendations are read-only; do not rewrite .freeflow/config.json without explicit confirmation.",
        ],
        parameters: FREEFLOW_STATUS_PARAMETERS,
        async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
            const result = await buildFreeflowStatusReport(params, ctx);
            return {
                content: [{ type: "text", text: routedToolText(result) }],
                details: { result },
            };
        },
        renderCall(args, theme) {
            return renderFreeflowStatusCall(args, theme);
        },
        renderResult(result, options, theme) {
            return renderFreeflowStatusResult(result, options, theme);
        },
    });
    pi.registerTool({
        name: "freeflow_retrieve",
        label: "Freeflow Retrieve",
        description: "Retrieve targeted evidence from repo files or Freeflow-vaulted output. Returns labeled, recoverable routed evidence instead of broad raw output.",
        promptSnippet: "Retrieve targeted repo/vault evidence with recoverable routed output.",
        promptGuidelines: [
            "Use freeflow_retrieve for targeted repo or vault evidence before reading whole files or dumping captured output.",
            "Use freeflow_retrieve with source.kind=vault and an outputId to recover exact output from freeflow_run.",
        ],
        parameters: FREEFLOW_RETRIEVE_PARAMETERS,
        async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
            const result = await freeflowRetrieve(await normalizeRetrieveParams(params, ctx));
            return {
                content: [{ type: "text", text: routedToolText(result) }],
                details: { result },
            };
        },
        renderCall(args, theme) {
            return renderFreeflowRetrieveCall(args, theme);
        },
        renderResult(result, options, theme) {
            return renderFreeflowRetrieveResult(result, options, theme);
        },
    });
    pi.registerTool({
        name: "freeflow_run",
        label: "Freeflow Run",
        description: "Run a command through Pi's approved runner, vault exact stdout/stderr, and return compact routed evidence plus an outputId.",
        promptSnippet: "Run likely-large/noisy commands with vaulted raw output and compact evidence.",
        promptGuidelines: [
            "Use freeflow_run for commands likely to produce large or noisy output when routed evidence is enough.",
            "Use native bash when direct shell behavior or exact small raw output is intentionally needed.",
        ],
        parameters: FREEFLOW_RUN_PARAMETERS,
        async execute(_toolCallId, params, signal, _onUpdate, ctx) {
            const routerConfigResult = await readOutputRouterConfig(ctx.cwd);
            notifyRouterConfigWarnings(ctx, routerConfigResult);
            const runner = createPiCommandRunner(pi, signal);
            const result = await freeflowRun({
                command: params.command,
                cwd: params.cwd ?? ctx.cwd,
                timeoutMs: params.timeoutMs,
                preserve: params.preserve,
                goal: params.goal,
                sessionId: getRouterSessionId(ctx),
                vaultRoot: routerConfigResult.config.vault.root,
                vaultRetention: routerConfigResult.config.vault.retention,
                thresholds: routerConfigResult.config.thresholds,
            }, {
                async run(request) {
                    if (signal?.aborted) {
                        return { stdout: "", stderr: "", executionStatus: "cancelled", exitCode: null };
                    }
                    return runner.run(request);
                },
            });
            return {
                content: [{ type: "text", text: routedToolText(result) }],
                details: { result },
            };
        },
        renderCall(args, theme) {
            return renderFreeflowRunCall(args, theme);
        },
        renderResult(result, options, theme, context) {
            return renderFreeflowRunResult(result, options, theme, context);
        },
    });
    pi.registerTool({
        name: "freeflow_derive",
        label: "Freeflow Derive",
        description: "Derive deterministic, bounded evidence from existing Freeflow-vaulted output. Supports regex filtering/counting, JSON extraction, grouping, dedupe, topN, URL/citation extraction, and line/size stats.",
        promptSnippet: "Transform existing vaulted evidence into bounded derived evidence with lineage and recovery.",
        promptGuidelines: [
            "Use freeflow_derive when existing vaulted evidence needs deterministic filtering, extraction, counting, grouping, dedupe, topN, URL/citation extraction, or line/size stats.",
            "Use freeflow_retrieve first when you need to locate or recover the source evidence before deriving from it.",
            "freeflow_derive does not execute arbitrary code and currently derives only from existing vaulted evidence.",
        ],
        parameters: FREEFLOW_DERIVE_PARAMETERS,
        async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
            const routerConfigResult = await readOutputRouterConfig(ctx.cwd);
            notifyRouterConfigWarnings(ctx, routerConfigResult);
            const normalized = await normalizeDeriveParams(params, ctx);
            const result = await freeflowDerive({
                ...normalized,
                sessionId: getRouterSessionId(ctx),
                vaultRoot: routerConfigResult.config.vault.root,
                vaultRetention: routerConfigResult.config.vault.retention,
                thresholds: routerConfigResult.config.thresholds,
            });
            return {
                content: [{ type: "text", text: routedToolText(result) }],
                details: { result },
            };
        },
        renderCall(args, theme) {
            return renderFreeflowDeriveCall(args, theme);
        },
        renderResult(result, options, theme) {
            return renderFreeflowDeriveResult(result, options, theme);
        },
    });
    pi.registerTool({
        name: "freeflow_capture",
        label: "Freeflow Capture",
        description: "Capture output from a supported read-only service/protocol producer, vault exact raw text when allowed, and return routed evidence. Currently supports Serena read-only MCP symbol/reference/diagnostic tools.",
        promptSnippet: "Capture read-only MCP/Serena producer output with Freeflow routing and recovery.",
        promptGuidelines: [
            "Use freeflow_capture for supported read-only Serena MCP symbol, reference, and diagnostic evidence when recoverable routing is useful.",
            "Do not use freeflow_capture for mutating provider tools; call those directly only after explicit user intent, then review and verify the resulting state.",
            "Use direct mcp calls when direct provider behavior is intended or when the Serena tool is not in Freeflow's read-only capture allowlist.",
        ],
        parameters: FREEFLOW_CAPTURE_PARAMETERS,
        async execute(_toolCallId, params, signal, _onUpdate, ctx) {
            const routerConfigResult = await readOutputRouterConfig(ctx.cwd);
            notifyRouterConfigWarnings(ctx, routerConfigResult);
            const normalized = normalizeCaptureParams(params);
            const result = await freeflowCapture({
                ...normalized,
                sessionId: getRouterSessionId(ctx),
                adapters: createPiCaptureAdapters(ctx, signal),
                vaultRoot: routerConfigResult.config.vault.root,
                vaultRetention: routerConfigResult.config.vault.retention,
                thresholds: routerConfigResult.config.thresholds,
                signal,
            });
            return {
                content: [{ type: "text", text: routedToolText(result) }],
                details: { result },
            };
        },
        renderCall(args, theme) {
            return renderFreeflowCaptureCall(args, theme);
        },
        renderResult(result, options, theme) {
            return renderFreeflowCaptureResult(result, options, theme);
        },
    });
}
