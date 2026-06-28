import { readFile } from "node:fs/promises";

import {
  createVault,
  findExactDuplicateTextOutput,
  isNativeSafetyNetEnabled,
  storeTextOutput,
  textOutputFingerprints,
} from "../../router/dist/index.js";
import { readOutputRouterConfig, notifyRouterConfigWarnings } from "./runtime-context.js";
import {
  byteLength,
  extractTextContent,
  getRouterSessionId,
  splitLines,
  stableHash,
  truncateText,
} from "./utils.js";

const SAFETY_NET_NATIVE_TOOLS = new Set(["read", "bash"]);
const SAFETY_NET_EXCERPT_LINES = 8;
const SAFETY_NET_HEURISTIC_MIN_BYTES = 16_384;
const SAFETY_NET_HEURISTIC_MIN_LINES = 200;

async function nativeResultText(event) {
  const fullOutputPath = event.toolName === "bash" ? event.details?.fullOutputPath : undefined;
  if (typeof fullOutputPath === "string" && fullOutputPath.length > 0) {
    try {
      return await readFile(fullOutputPath, "utf8");
    } catch {
      // Fall back to the exact text that would otherwise enter model context.
    }
  }

  return extractTextContent(event.content);
}

function nativeOutputStats(text, truncation) {
  const measuredLines = splitLines(text).length;
  const measuredBytes = byteLength(text);
  return {
    lines: Number.isInteger(truncation?.totalLines) ? truncation.totalLines : measuredLines,
    bytes: Number.isInteger(truncation?.totalBytes) ? truncation.totalBytes : measuredBytes,
    capturedLines: measuredLines,
    capturedBytes: measuredBytes,
  };
}

function isSafetyNetEnabled(routerConfig) {
  return routerConfig.enabled !== false && isNativeSafetyNetEnabled(routerConfig.postToolRouting);
}

function shouldRouteNativeToolResult(event, routerConfig, text) {
  if (!SAFETY_NET_NATIVE_TOOLS.has(event.toolName) || !isSafetyNetEnabled(routerConfig)) {
    return { route: false };
  }

  const stats = nativeOutputStats(text, event.details?.truncation);
  if (stats.bytes > routerConfig.thresholds.largeOutputBytes) {
    return {
      route: true,
      stats,
      reason: `native ${event.toolName} output exceeded largeOutputBytes (${stats.bytes} > ${routerConfig.thresholds.largeOutputBytes})`,
    };
  }

  if (stats.lines > routerConfig.thresholds.largeOutputLines) {
    return {
      route: true,
      stats,
      reason: `native ${event.toolName} output exceeded largeOutputLines (${stats.lines} > ${routerConfig.thresholds.largeOutputLines})`,
    };
  }

  if (matchesConfiguredNoiseHint(event, routerConfig) && exceedsHeuristicMinimum(stats, routerConfig)) {
    return {
      route: true,
      stats,
      reason: `native ${event.toolName} output matched configured noisy/generated-output hints and exceeded the conservative heuristic floor`,
    };
  }

  return { route: false };
}

function exceedsHeuristicMinimum(stats, routerConfig) {
  const byteFloor = Math.min(routerConfig.thresholds.largeOutputBytes, SAFETY_NET_HEURISTIC_MIN_BYTES);
  const lineFloor = Math.min(routerConfig.thresholds.largeOutputLines, SAFETY_NET_HEURISTIC_MIN_LINES);
  return stats.bytes > byteFloor || stats.lines > lineFloor;
}

function matchesConfiguredNoiseHint(event, routerConfig) {
  if (event.toolName === "bash") {
    const command = typeof event.input?.command === "string" ? event.input.command : "";
    return matchesAnyHint(command, routerConfig.hints?.noisyCommandPatterns);
  }

  if (event.toolName === "read") {
    const path = typeof event.input?.path === "string" ? event.input.path : "";
    return matchesAnyPathHint(path, routerConfig.hints?.generatedPathGlobs);
  }

  return false;
}

function matchesAnyHint(value, hints) {
  if (!value || !Array.isArray(hints)) {
    return false;
  }
  return hints.some((hint) => typeof hint === "string" && hint.length > 0 && value.includes(hint));
}

function matchesAnyPathHint(path, hints) {
  if (!path || !Array.isArray(hints)) {
    return false;
  }
  return hints.some((hint) => matchesSimpleGlob(path, hint));
}

function matchesSimpleGlob(path, pattern) {
  if (typeof pattern !== "string" || pattern.length === 0) {
    return false;
  }

  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return path === prefix || path.startsWith(`${prefix}/`);
  }

  if (!pattern.includes("*")) {
    return path === pattern || path.includes(pattern);
  }

  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[|\\{}()[\]^$+?.]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`).test(path);
}

function nativeSafetyDecisionId(event, text) {
  return `ffdec_native_${stableHash(`${event.toolName}:${event.toolCallId}:${text}`).slice(0, 24)}`;
}

function formatNativeSafetyNetResult({ event, record, duplicate, stats, reason, mode, text }) {
  const lines = splitLines(text);
  const shownLines = lines.slice(0, SAFETY_NET_EXCERPT_LINES);
  const shownEnd = shownLines.length;
  const omittedLines = Math.max(0, stats.capturedLines - shownLines.length);
  const inputLabel = nativeInputLabel(event);
  const duplicateLine = duplicate
    ? `Duplicate: exact native output matches previous outputId=${duplicate.outputId}; current raw output was vaulted as outputId=${record.outputId}.`
    : null;

  return [
    `Freeflow routed this native ${event.toolName} result (post-tool safety net).`,
    `Reason: ${reason}; outputRouter.postToolRouting=${mode}.`,
    `Captured exact native text in the Freeflow vault: outputId=${record.outputId}, stream=raw, lines=${stats.capturedLines}, bytes=${stats.capturedBytes}.`,
    ...(duplicateLine ? [duplicateLine] : []),
    `Original native result stats: lines=${stats.lines}, bytes=${stats.bytes}.${inputLabel ? ` Input: ${inputLabel}.` : ""}`,
    `Recovery: use freeflow_search with action=retrieve, source.kind=vault, outputId=${record.outputId}, stream=raw, and a lineRange to recover exact content.`,
    `Showing exact captured lines 1-${shownEnd}${omittedLines > 0 ? ` (${omittedLines} captured lines omitted from context)` : ""}:`,
    "```text",
    shownLines.join("\n"),
    "```",
  ].join("\n");
}

function nativeInputLabel(event) {
  if (event.toolName === "bash" && typeof event.input?.command === "string") {
    return `command=${JSON.stringify(event.input.command)}`;
  }
  if (event.toolName === "read" && typeof event.input?.path === "string") {
    return `path=${JSON.stringify(event.input.path)}`;
  }
  return "";
}

function appendSafetyNetWarning(event, message) {
  return [
    ...event.content,
    {
      type: "text",
      text: `Freeflow safety-net warning: ${message} Native output was not shortened or removed.`,
    },
  ];
}

// Keep post-tool native transformations aligned with
// skills/output-router/references/safety-policy.md.
export async function handleNativeToolSafetyNet(event, ctx) {
  const routerConfigResult = await readOutputRouterConfig(ctx.cwd);
  notifyRouterConfigWarnings(ctx, routerConfigResult);
  const routerConfig = routerConfigResult.config;

  if (!SAFETY_NET_NATIVE_TOOLS.has(event.toolName) || !isSafetyNetEnabled(routerConfig)) {
    return undefined;
  }

  const text = await nativeResultText(event);
  if (text === null) {
    return undefined;
  }

  const routeDecision = shouldRouteNativeToolResult(event, routerConfig, text);
  if (!routeDecision.route) {
    return undefined;
  }

  try {
    const vault = createVault({ root: routerConfig.vault.root, retention: routerConfig.vault.retention });
    const sessionId = getRouterSessionId(ctx);
    const fingerprints = textOutputFingerprints({ raw: text });
    const duplicate = await findExactDuplicateTextOutput(vault, { sessionId, fingerprints });
    const decisionId = nativeSafetyDecisionId(event, text);
    const record = await storeTextOutput(vault, {
      sessionId,
      raw: text,
      sourceKind: "native",
      decisionIds: [decisionId],
    });
    const routedText = formatNativeSafetyNetResult({
      event,
      record,
      duplicate,
      stats: routeDecision.stats,
      reason: routeDecision.reason,
      mode: routerConfig.postToolRouting,
      text,
    });

    return {
      content: [{ type: "text", text: routedText }],
      details: {
        ...(event.details && typeof event.details === "object" ? event.details : {}),
        freeflowOutputRouter: {
          route: "safety-net",
          outputId: record.outputId,
          decisionId,
          reason: routeDecision.reason,
          ...(duplicate ? { duplicateOfOutputId: duplicate.outputId } : {}),
        },
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Freeflow safety-net routing failed; passing native ${event.toolName} output through. ${message}`, "warning");
    return {
      content: appendSafetyNetWarning(event, message),
    };
  }
}
