import { discoverEryxPythonSandboxAdaptersFromEnv, discoverJqWasmSandboxAdaptersFromEnv, discoverQuickJsWasiSandboxAdaptersFromEnv, freeflowBatch, freeflowDerive, freeflowRetrieve, freeflowRun } from "../../router/dist/index.js";
import { buildFreeflowStatusReport } from "./status.js";
import {
  renderFreeflowBatchCall,
  renderFreeflowBatchResult,
  renderFreeflowDeriveCall,
  renderFreeflowDeriveResult,
  renderFreeflowRetrieveCall,
  renderFreeflowRetrieveResult,
  renderFreeflowRunCall,
  renderFreeflowRunResult,
  renderFreeflowStatusCall,
  renderFreeflowStatusResult,
} from "./renderers.js";
import { readOutputRouterConfig, notifyRouterConfigWarnings } from "./runtime-context.js";
import { FREEFLOW_BATCH_PARAMETERS, FREEFLOW_DERIVE_PARAMETERS, FREEFLOW_RETRIEVE_PARAMETERS, FREEFLOW_RUN_PARAMETERS, FREEFLOW_STATUS_PARAMETERS } from "./schemas.js";
import { compactBatchToolText, compactDeriveToolText, compactRetrieveToolText, compactRunToolText, getRouterSessionId, routedToolText } from "./utils.js";

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
  const operation = normalizeDeriveOperation(params.operation);
  if (operation?.kind === "script") {
    if (!Array.isArray(params.sources)) {
      throw new Error("freeflow_derive operation.kind=script requires sources[].");
    }
    return {
      ...params,
      operation,
      sources: params.sources.map((source, index) => {
        if (!source || source.kind !== "vault") {
          throw new Error(`freeflow_derive script source ${index} requires kind=vault.`);
        }
        return {
          kind: "vault",
          outputId: source.outputId,
          alias: source.alias,
          ...(source.stream ? { stream: source.stream } : {}),
        };
      }),
      ...(params.limits ? { limits: params.limits } : {}),
    };
  }

  const source = params.source;
  if (!source || source.kind !== "vault") {
    throw new Error("freeflow_derive currently supports source.kind=vault only.");
  }
  if (!source.outputId) {
    throw new Error("freeflow_derive source.kind=vault requires source.outputId.");
  }
  return {
    ...params,
    operation,
    source: {
      kind: "vault",
      outputId: source.outputId,
      ...(source.stream ? { stream: source.stream } : {}),
    },
  };
}

async function normalizeRetrieveParams(params, ctx, providedRouterConfigResult = undefined) {
  const routerConfigResult = providedRouterConfigResult ?? await readOutputRouterConfig(ctx.cwd);
  if (!providedRouterConfigResult) {
    notifyRouterConfigWarnings(ctx, routerConfigResult);
  }
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
    if (!source.outputId && params.action !== "query" && params.action !== "locate" && params.action !== "get") {
      throw new Error("freeflow_retrieve source.kind=vault requires source.outputId for retrieve, expand, and explain.");
    }
    return {
      ...params,
      source: {
        kind: "vault",
        root: routerConfigResult.config.vault.root,
        sessionId: getRouterSessionId(ctx),
        ...(source.outputId ? { outputId: source.outputId } : {}),
        ...(source.stream ? { stream: source.stream } : {}),
        ...(source.producerKind ? { producerKind: source.producerKind } : {}),
        ...(source.server ? { server: source.server } : {}),
        ...(source.tool ? { tool: source.tool } : {}),
        ...(source.hostToolName ? { hostToolName: source.hostToolName } : {}),
        ...(source.recordKind ? { recordKind: source.recordKind } : {}),
        ...(source.recoverability ? { recoverability: source.recoverability } : {}),
      },
    };
  }

  throw new Error(`Unsupported freeflow_retrieve source kind: ${source.kind}`);
}

async function normalizeBatchParams(params, ctx, routerConfigResult) {
  if (!Array.isArray(params.steps)) {
    throw new Error("freeflow_batch requires steps[].");
  }
  const steps = [];
  for (let index = 0; index < params.steps.length; index += 1) {
    const step = params.steps[index];
    if (!step || typeof step !== "object") {
      throw new Error(`freeflow_batch step ${index} must be an object.`);
    }
    const input = step.input ?? {};
    if (step.kind === "run") {
      steps.push({
        id: step.id,
        kind: "run",
        input: {
          ...input,
          cwd: input.cwd ?? ctx.cwd,
        },
      });
      continue;
    }
    if (step.kind === "retrieve" || step.kind === "search") {
      steps.push({
        id: step.id,
        kind: step.kind,
        input: await normalizeRetrieveParams(input, ctx, routerConfigResult),
      });
      continue;
    }
    if (step.kind === "derive" || step.kind === "transform") {
      steps.push({
        id: step.id,
        kind: step.kind,
        input: await normalizeDeriveParams(input, ctx),
      });
      continue;
    }
    throw new Error(`Unsupported freeflow_batch step kind: ${step.kind}`);
  }
  return {
    steps,
    ...(params.concurrency !== undefined ? { concurrency: params.concurrency } : {}),
    ...(params.preserve !== undefined ? { preserve: params.preserve } : {}),
  };
}

function batchNeedsScriptAdapters(params) {
  if (!Array.isArray(params?.steps)) {
    return false;
  }
  return params.steps.some((step) => {
    const input = step?.input;
    if (!input || typeof input !== "object") {
      return false;
    }
    if (step.kind === "run") {
      return Boolean(input.scriptFilter);
    }
    if (step.kind === "derive" || step.kind === "transform") {
      return input.operation?.kind === "script";
    }
    return false;
  });
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
      const executionStatus = (signal?.aborted ? "cancelled" : killed ? "timed_out" : code === 0 ? "success" : "failed") as "cancelled" | "timed_out" | "success" | "failed";
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
    description:
      "Inspect effective Freeflow router/capture/provider behavior, vault writability, warnings, and non-destructive migration recommendations.",
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
    description:
      "Retrieve targeted evidence from repo files or Freeflow-vaulted output. Returns labeled, recoverable routed evidence instead of broad raw output.",
    promptSnippet: "Retrieve targeted repo/vault evidence with recoverable routed output.",
    promptGuidelines: [
      "Use freeflow_retrieve for targeted repo or vault evidence before reading whole files or dumping captured output.",
      "Use freeflow_retrieve with source.kind=vault and an outputId to recover exact output from freeflow_run.",
    ],
    parameters: FREEFLOW_RETRIEVE_PARAMETERS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await freeflowRetrieve(await normalizeRetrieveParams(params, ctx));
      return {
        content: [{ type: "text", text: compactRetrieveToolText(result) }],
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
    description:
      "Run a command through Pi's approved runner, vault exact stdout/stderr, and return compact routed evidence plus an outputId.",
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
      const scriptSandboxAdapters = params.scriptFilter
        ? [
            ...(await discoverQuickJsWasiSandboxAdaptersFromEnv()),
            ...(await discoverJqWasmSandboxAdaptersFromEnv()),
            ...(await discoverEryxPythonSandboxAdaptersFromEnv()),
          ]
        : [];
      const result = await freeflowRun(
        {
          command: params.command,
          cwd: params.cwd ?? ctx.cwd,
          timeoutMs: params.timeoutMs,
          preserve: params.preserve,
          goal: params.goal,
          filters: params.filters,
          scriptFilter: params.scriptFilter,
          sessionId: getRouterSessionId(ctx),
          vaultRoot: routerConfigResult.config.vault.root,
          vaultRetention: routerConfigResult.config.vault.retention,
          thresholds: routerConfigResult.config.thresholds,
          storagePolicy: routerConfigResult.config.storagePolicy,
          scriptDerive: routerConfigResult.freeflowConfig.scriptDerive,
          scriptSandboxAdapters,
        },
        {
          async run(request) {
            if (signal?.aborted) {
              return { stdout: "", stderr: "", executionStatus: "cancelled", exitCode: null };
            }
            return runner.run(request);
          },
        },
      );
      return {
        content: [{ type: "text", text: compactRunToolText(result) }],
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
    name: "freeflow_batch",
    label: "Freeflow Batch",
    description:
      "Run independent Freeflow-owned operations in parallel and return one compact summary while preserving full child results in details.result.steps.",
    promptSnippet: "Batch independent Freeflow run/search/transform operations with compact model-visible output.",
    promptGuidelines: [
      "Use freeflow_batch when several independent Freeflow-owned run, search/retrieve, or transform/derive operations can run in parallel.",
      "Do not use freeflow_batch for sequenced workflows, arbitrary external tool orchestration, or mutating batch work in v1.",
      "Intermediate child outputs are suppressed from model-visible output; inspect details.result.steps or child recovery ids when needed.",
    ],
    parameters: FREEFLOW_BATCH_PARAMETERS,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const routerConfigResult = await readOutputRouterConfig(ctx.cwd);
      notifyRouterConfigWarnings(ctx, routerConfigResult);
      const normalized = await normalizeBatchParams(params, ctx, routerConfigResult);
      const runner = createPiCommandRunner(pi, signal);
      const scriptSandboxAdapters = batchNeedsScriptAdapters(params)
        ? [
            ...(await discoverQuickJsWasiSandboxAdaptersFromEnv()),
            ...(await discoverJqWasmSandboxAdaptersFromEnv()),
            ...(await discoverEryxPythonSandboxAdaptersFromEnv()),
          ]
        : [];
      const result = await freeflowBatch(
        {
          ...normalized,
          sessionId: getRouterSessionId(ctx),
          vaultRoot: routerConfigResult.config.vault.root,
          vaultRetention: routerConfigResult.config.vault.retention,
          thresholds: routerConfigResult.config.thresholds,
          storagePolicy: routerConfigResult.config.storagePolicy,
          scriptDerive: routerConfigResult.freeflowConfig.scriptDerive,
          scriptSandboxAdapters,
        },
        {
          async run(request) {
            if (signal?.aborted) {
              return { stdout: "", stderr: "", executionStatus: "cancelled", exitCode: null };
            }
            return runner.run(request);
          },
        },
      );
      return {
        content: [{ type: "text", text: compactBatchToolText(result) }],
        details: { result },
      };
    },
    renderCall(args, theme) {
      return renderFreeflowBatchCall(args, theme);
    },
    renderResult(result, options, theme) {
      return renderFreeflowBatchResult(result, options, theme);
    },
  });

  pi.registerTool({
    name: "freeflow_derive",
    label: "Freeflow Derive",
    description:
      "Derive deterministic, bounded evidence from existing Freeflow-vaulted output. Supports regex filtering/counting, JSON extraction, grouping, dedupe, topN, URL/citation extraction, line/size stats, and a disabled-by-default sandboxed script operation.",
    promptSnippet: "Transform existing vaulted evidence into bounded derived evidence with lineage and recovery.",
    promptGuidelines: [
      "Use freeflow_derive when existing vaulted evidence needs deterministic filtering, extraction, counting, grouping, dedupe, topN, URL/citation extraction, or line/size stats.",
      "Use freeflow_retrieve first when you need to locate or recover the source evidence before deriving from it.",
      "Script derive uses operation.kind=script, is disabled by default, and must return structured unavailable/disabled unless an approved sandbox adapter is configured.",
      "Do not use script derive as an unsandboxed code execution path.",
    ],
    parameters: FREEFLOW_DERIVE_PARAMETERS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const routerConfigResult = await readOutputRouterConfig(ctx.cwd);
      notifyRouterConfigWarnings(ctx, routerConfigResult);
      const normalized = await normalizeDeriveParams(params, ctx);
      const scriptSandboxAdapters = [
        ...(await discoverQuickJsWasiSandboxAdaptersFromEnv()),
        ...(await discoverJqWasmSandboxAdaptersFromEnv()),
        ...(await discoverEryxPythonSandboxAdaptersFromEnv()),
      ];
      const result = await freeflowDerive({
        ...normalized,
        sessionId: getRouterSessionId(ctx),
        vaultRoot: routerConfigResult.config.vault.root,
        vaultRetention: routerConfigResult.config.vault.retention,
        thresholds: routerConfigResult.config.thresholds,
        scriptDerive: routerConfigResult.freeflowConfig.scriptDerive,
        scriptSandboxAdapters,
      });
      return {
        content: [{ type: "text", text: compactDeriveToolText(result) }],
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

}
