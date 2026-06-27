import type { EvidencePersistence, RecoveryHint, SourceRef } from "../config/types.js";
import type {
  ProcessingFact,
  ProcessingSourceDescriptor,
  ProcessingSourceStats,
  ReducerSelectionResult,
  ScriptPolicySelectionResult,
} from "./engine.js";

export type ProcessingRecoveryClass = "exact-result" | "exact-source" | "metadata-only" | "hint-only" | "none";

export interface ProcessingRenderInput {
  status: "ok" | "blocked" | "unavailable";
  source: ProcessingSourceDescriptor;
  facts: readonly ProcessingFact[];
  maxVisibleBytes: number;
  stats?: ProcessingSourceStats;
  reducer?: ReducerSelectionResult;
  script?: ScriptPolicySelectionResult;
  recovery?: RecoveryHint;
  persistence?: EvidencePersistence;
  recoveryClass?: ProcessingRecoveryClass;
  failure?: {
    policy?: string;
    reason: string;
  };
}

export function renderProcessingResult(input: ProcessingRenderInput): string {
  const lines = input.status === "ok" ? renderOkLines(input) : renderFailureLines(input);
  return truncateVisible(lines.join("\n"), input.maxVisibleBytes);
}

export function classifyProcessingRecovery(input: {
  recovery?: RecoveryHint;
  persistence?: EvidencePersistence;
  resultWillBePersisted?: boolean;
}): ProcessingRecoveryClass {
  if (input.resultWillBePersisted) {
    return "exact-result";
  }
  if (input.persistence?.recoverability === "exact") {
    return "exact-result";
  }
  if (input.persistence?.recoverability === "metadata_only") {
    return "metadata-only";
  }
  if (input.recovery?.outputId) {
    return "exact-source";
  }
  if (input.recovery?.how) {
    return "hint-only";
  }
  return "none";
}

function renderOkLines(input: ProcessingRenderInput): string[] {
  const recoveryClass = recoveryClassForInput(input);
  const scriptLines = scriptOutputLines(input.script);
  const visibleFacts = scriptLines.length > 0 ? scriptLines : visibleFactLines(input.facts, input.reducer);
  const lines = visibleFacts.length > 0 ? visibleFacts : [`status: ${input.status}`];
  lines.push(`source: ${sourcePointer(input.source, input.stats)}`);
  lines.push(`recovery: ${recoveryClass}`);
  if (input.script?.status === "executed") {
    lines.push(`script: ${input.script.language} sandboxed adapter=${input.script.adapterId}`);
  } else if (input.script?.status === "unavailable") {
    lines.push(`script: unavailable; reducer fallback; no host fallback`);
  } else if (input.script?.status === "failed") {
    lines.push(`script: failed; no host fallback`);
  }
  if (input.reducer?.status === "selected") {
    lines.push(`reducer: ${input.reducer.selected.name}@${input.reducer.selected.version} confidence=${input.reducer.selected.confidence.toFixed(2)}`);
  }
  return lines;
}

function renderFailureLines(input: ProcessingRenderInput): string[] {
  const lines = [`status: ${input.status}`];
  if (input.failure?.policy) {
    lines.push(`policy: ${input.failure.policy}`);
  }
  if (input.failure?.reason) {
    lines.push(`reason: ${oneLine(input.failure.reason, 240)}`);
  }
  lines.push(`source: ${sourcePointer(input.source, input.stats)}`);
  lines.push(`recovery: ${recoveryClassForInput(input)}`);
  return lines;
}

function recoveryClassForInput(input: ProcessingRenderInput): ProcessingRecoveryClass {
  if (input.recoveryClass !== undefined) {
    return input.recoveryClass;
  }
  return classifyProcessingRecovery({
    ...(input.recovery !== undefined ? { recovery: input.recovery } : {}),
    ...(input.persistence !== undefined ? { persistence: input.persistence } : {}),
  });
}

function scriptOutputLines(script: ScriptPolicySelectionResult | undefined): string[] {
  if (script?.status !== "executed") {
    return [];
  }
  const lines = script.outputText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length > 0) {
    return lines;
  }
  return [`script.stdoutBytes: ${script.stdoutBytes}`];
}

function visibleFactLines(facts: readonly ProcessingFact[], reducer: ReducerSelectionResult | undefined): string[] {
  const sourceFactsHidden = reducer?.status === "selected";
  const lines: string[] = [];
  const statusFacts: Array<[string, ProcessingFact["value"]]> = [];

  for (const fact of facts) {
    if (sourceFactsHidden && fact.name.startsWith("source.")) {
      continue;
    }
    if (fact.name.startsWith("status.")) {
      statusFacts.push([fact.name.slice("status.".length), fact.value]);
      continue;
    }
    lines.push(`${fact.name}: ${fact.value}`);
  }

  if (statusFacts.length > 0) {
    lines.push(`status: ${statusFacts.map(([status, value]) => `${status}:${value}`).join(", ")}`);
  }

  return lines;
}

function sourcePointer(source: ProcessingSourceDescriptor, stats: ProcessingSourceStats | undefined): string {
  const base = sourceRefLabel(source.ref, source.displayPath, source.stream);
  if (!stats) {
    return base;
  }
  return `${base} (${formatBytes(stats.bytes)}, ${stats.lines} lines)`;
}

function sourceRefLabel(source: SourceRef, displayPath: string, stream: ProcessingSourceDescriptor["stream"]): string {
  if (source.kind === "repo") {
    return `repo ${shortenMiddle(source.path || displayPath, 90)}`;
  }
  if (source.kind === "vault") {
    const selectedStream = stream ?? source.stream;
    return `vault ${shortenMiddle(source.outputId, 48)}${selectedStream ? `:${selectedStream}` : ""}`;
  }
  return `${source.tool} ${shortenMiddle(source.outputId || displayPath, 64)}${stream ? `:${stream}` : ""}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}B`;
  }
  if (bytes < 1024 * 1024) {
    return `${round(bytes / 1024)}KB`;
  }
  return `${round(bytes / (1024 * 1024))}MB`;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function oneLine(text: string, maxChars: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length <= maxChars ? compact : `${compact.slice(0, maxChars - 1)}…`;
}

function shortenMiddle(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  const keep = Math.max(4, Math.floor((maxChars - 1) / 2));
  return `${text.slice(0, keep)}…${text.slice(text.length - keep)}`;
}

function truncateVisible(text: string, maxBytes: number): string {
  if (byteLength(text) <= maxBytes) {
    return text;
  }
  let end = Math.min(text.length, maxBytes);
  while (end > 0 && byteLength(text.slice(0, end)) > maxBytes) {
    end -= 1;
  }
  return `${text.slice(0, end)}\n… [truncated]`;
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}
