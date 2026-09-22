import { Text } from "@earendil-works/pi-tui";

import { progressText, type ToolProgressSnapshot } from "./progress.js";

const TOOL_NAMES = ["freeflow_tools", "freeflow_run", "freeflow_result"] as const;
export type ToolRuntimeToolName = (typeof TOOL_NAMES)[number];

type RenderContext = {
  args?: any;
  isError?: boolean;
  expanded?: boolean;
};

function paint(theme: any, color: string, value: string): string {
  return typeof theme?.fg === "function" ? theme.fg(color, value) : value;
}

function title(theme: any, value: string): string {
  const bold = typeof theme?.bold === "function" ? theme.bold(value) : value;
  return paint(theme, "toolTitle", bold);
}

function textContent(result: any): string {
  return Array.isArray(result?.content)
    ? result.content
        .filter((block: any) => block?.type === "text" && typeof block.text === "string")
        .map((block: any) => block.text)
        .join("\n")
    : "";
}

function operationLabel(key: any): string {
  return typeof key?.id === "string"
    ? `${key.id}${typeof key.revision === "string" ? `@${key.revision}` : ""}`
    : "operation";
}

function boundedJson(value: unknown, maximum = 24_000): string {
  let rendered: string;
  try {
    rendered = JSON.stringify(value, null, 2);
  } catch {
    rendered = String(value);
  }
  return rendered.length <= maximum ? rendered : `${rendered.slice(0, maximum)}\n… renderer preview truncated`;
}

export function toolRuntimeCallText(name: ToolRuntimeToolName, args: any = {}, expanded = false): string {
  let headline: string;
  if (name === "freeflow_tools") {
    if (args?.operation === "search") headline = `Tool catalog · search · ${JSON.stringify(args.query ?? "")}`;
    else if (args?.operation === "describe")
      headline = `Tool catalog · describe · ${Array.isArray(args.operations) ? args.operations.length : 0} operation(s)`;
    else if (args?.operation === "call") headline = `Tool call · ${operationLabel(args.operationKey)}`;
    else headline = "Tool catalog";
  } else if (name === "freeflow_run") {
    const description =
      typeof args?.description === "string" && args.description ? args.description : "Preparing program";
    const operations = Array.isArray(args?.operations) ? args.operations.length : 0;
    const captures = Array.isArray(args?.captures) ? args.captures.length : 0;
    headline = `Program · ${description} · ${operations} operation(s) · ${captures} capture(s)`;
  } else {
    const id = typeof args?.id === "string" ? args.id : "captured result";
    const offset = Number.isSafeInteger(args?.offsetBytes) ? args.offsetBytes : 0;
    const budget = Number.isSafeInteger(args?.maxBytes) ? ` · budget ${args.maxBytes} bytes` : "";
    headline = `Result read · ${id} · offset ${offset}${budget}`;
  }
  if (!expanded) return headline;
  return `${headline}\n\n${boundedJson(args)}`;
}

function toolsSummary(details: any): string {
  if (details?.status === "searched") {
    const hits = Array.isArray(details.hits) ? details.hits.length : 0;
    return `Catalog searched · ${hits} result${hits === 1 ? "" : "s"}`;
  }
  if (details?.status === "described") {
    const operations = Array.isArray(details.operations) ? details.operations.length : 0;
    return `Contracts described · ${operations} operation${operations === 1 ? "" : "s"}`;
  }
  if (details?.status === "called") {
    const outcome = details.outcome ?? {};
    const effect = outcome.effect ? ` · ${outcome.effect}` : "";
    const effectState = outcome.effectState ? ` · effect ${outcome.effectState}` : "";
    return `${operationLabel(outcome.operation)} · ${outcome.status ?? "unknown"}${effect}${effectState}`;
  }
  return "Tool operation completed";
}

function runSummary(envelope: any): string {
  const counts = envelope?.calls ?? {};
  const settled =
    Number(counts.succeeded ?? 0) +
    Number(counts.denied ?? 0) +
    Number(counts.failed ?? 0) +
    Number(counts.cancelled ?? 0) +
    Number(counts.unknown ?? 0);
  const parts = [
    `Program ${envelope?.programStatus ?? "unknown"}`,
    `${settled}/${Number(counts.submitted ?? 0)} calls settled`,
    `${Array.isArray(envelope?.emitted) ? envelope.emitted.length : 0} emitted`,
    envelope?.effectsSettled ? "effects settled" : "effects unresolved",
  ];
  if (envelope?.continuation && envelope.continuation !== "none") parts.push(envelope.continuation);
  return parts.join(" · ");
}

function resultSummary(details: any): string {
  const captured = details?.capturedResult ?? {};
  const start = captured?.range?.startBytes;
  const end = captured?.range?.endBytes;
  const range = Number.isSafeInteger(start) && Number.isSafeInteger(end) ? ` · [${start},${end})` : "";
  const total = Number.isSafeInteger(captured.totalBytes) ? ` of ${captured.totalBytes} bytes` : "";
  return `${captured.id ?? "Captured result"}${range}${total}${captured.coverage ? ` · ${captured.coverage}` : ""}`;
}

export function toolRuntimeResultText(
  name: ToolRuntimeToolName,
  result: any,
  options: { expanded?: boolean; isPartial?: boolean } = {},
  context: RenderContext = {},
): string {
  const progress = result?.details?.freeflowProgress as ToolProgressSnapshot | undefined;
  if (options.isPartial) {
    const headline = progress ? progressText(progress) : "Working…";
    return options.expanded && progress ? `${headline}\n\n${boundedJson(progress)}` : headline;
  }

  const fallback = textContent(result);
  if (context.isError)
    return options.expanded ? fallback || "Operation failed" : fallback.split("\n")[0] || "Operation failed";

  let headline: string;
  let detail: unknown;
  if (name === "freeflow_tools") {
    headline = toolsSummary(result?.details);
    detail = result?.details;
  } else if (name === "freeflow_run") {
    const envelope = result?.details?.freeflowRun;
    headline = runSummary(envelope);
    detail = envelope;
  } else {
    headline = resultSummary(result?.details);
    detail = fallback;
  }
  if (!options.expanded) return headline;
  return [headline, typeof detail === "string" ? detail : boundedJson(detail)].filter(Boolean).join("\n\n");
}

export function renderToolRuntimeCall(name: ToolRuntimeToolName, args: any, theme: any, context: RenderContext = {}) {
  const output = toolRuntimeCallText(name, args, context.expanded === true);
  const separator = output.indexOf("\n\n");
  const headline = separator < 0 ? output : output.slice(0, separator);
  const detail = separator < 0 ? "" : output.slice(separator + 2);
  return new Text([title(theme, headline), detail].filter(Boolean).join("\n\n"), 0, 0);
}

export function renderToolRuntimeResult(
  name: ToolRuntimeToolName,
  result: any,
  options: { expanded?: boolean; isPartial?: boolean },
  theme: any,
  context: RenderContext,
) {
  const output = toolRuntimeResultText(name, result, options, context);
  const color = options.isPartial ? "warning" : context.isError ? "error" : "muted";
  return new Text(paint(theme, color, output), 0, 0);
}
