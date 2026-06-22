import { createHash } from "node:crypto";

import { DEFAULT_ROUTER_THRESHOLDS } from "./config.js";
import { assembleTextEvidence, byteLength, countLines } from "./evidence.js";
import {
  adapterUnavailableFailure,
  mutatingProducerRejectedFailure,
  partialCaptureFailure,
  producerExecutionFailure,
  storageFailure,
  unsupportedProducerFailure,
} from "./failure-contracts.js";
import { createVault, storeTextOutput } from "./vault.js";
import type {
  CaptureRoutedResult,
  EvidencePacket,
  FailureRoutedResult,
  PreserveMode,
  ProducerDescriptor,
  RouterThresholds,
  TextOutputRecord,
  VaultRetentionPolicy,
} from "./types.js";

export interface CaptureInput {
  producer: ProducerDescriptor;
  args?: unknown;
  preserve?: PreserveMode;
}

export interface CaptureProducerContext {
  producer: ProducerDescriptor;
  args: unknown;
  signal?: AbortSignal;
}

export interface CaptureProducerResult {
  text: string;
  mediaType?: string;
  partial?: boolean;
}

export interface CaptureProducerAdapter {
  producer: ProducerDescriptor;
  readOnly: boolean;
  isAvailable?: () => boolean | Promise<boolean>;
  capture(context: CaptureProducerContext): Promise<CaptureProducerResult>;
}

export interface FreeflowCaptureOptions extends CaptureInput {
  sessionId: string;
  adapters: readonly CaptureProducerAdapter[];
  vaultRoot?: string;
  vaultRetention?: VaultRetentionPolicy;
  thresholds?: Partial<RouterThresholds>;
  signal?: AbortSignal;
}

export interface CaptureValidationIssue {
  path: string;
  message: string;
}

export type CaptureValidationResult =
  | { ok: true; value: CaptureInput }
  | { ok: false; issues: CaptureValidationIssue[] };

const PRESERVE_MODES = new Set(["summary", "important", "full"]);
const PRODUCER_KINDS = new Set(["command", "native", "repo", "web", "fetch", "code_search", "mcp", "provider", "derive", "other"]);

export function validateCaptureInput(value: unknown): CaptureValidationResult {
  const issues: CaptureValidationIssue[] = [];

  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: "$", message: "Expected capture input object." }] };
  }

  validateProducer(value.producer, "$.producer", issues);

  if (value.preserve !== undefined && (typeof value.preserve !== "string" || !PRESERVE_MODES.has(value.preserve))) {
    issues.push({ path: "$.preserve", message: "Expected preserve mode summary, important, or full." });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const input: CaptureInput = {
    producer: value.producer as ProducerDescriptor,
  };
  if ("args" in value) {
    input.args = value.args;
  }
  if (value.preserve !== undefined) {
    input.preserve = value.preserve as PreserveMode;
  }
  return { ok: true, value: input };
}

export async function freeflowCapture(options: FreeflowCaptureOptions): Promise<CaptureRoutedResult | FailureRoutedResult> {
  const preserve = options.preserve ?? "important";
  const thresholds = { ...DEFAULT_ROUTER_THRESHOLDS, ...options.thresholds };
  const adapter = findCaptureAdapter(options.adapters, options.producer);

  if (!adapter) {
    return unsupportedProducerFailure({
      message: `No read-only capture adapter is registered for producer ${producerLabel(options.producer)}.`,
      preserve,
      producer: options.producer,
    });
  }

  if (!adapter.readOnly) {
    return mutatingProducerRejectedFailure({
      message: `Producer ${producerLabel(options.producer)} is not read-only and cannot be called through freeflow_capture.`,
      preserve,
      producer: options.producer,
    });
  }

  let available = true;
  try {
    available = adapter.isAvailable ? await adapter.isAvailable() : true;
  } catch (error) {
    available = false;
  }

  if (!available) {
    return adapterUnavailableFailure({
      message: `Read-only capture adapter is unavailable for producer ${producerLabel(options.producer)}.`,
      preserve,
      producer: options.producer,
    });
  }

  let captured: CaptureProducerResult;
  try {
    const context: CaptureProducerContext = { producer: options.producer, args: options.args };
    if (options.signal !== undefined) {
      context.signal = options.signal;
    }
    captured = await adapter.capture(context);
  } catch (error) {
    return producerExecutionFailure({
      message: `Producer ${producerLabel(options.producer)} failed before output could be captured: ${errorMessage(error)}`,
      preserve,
      producer: options.producer,
    });
  }

  if (typeof captured.text !== "string") {
    return producerExecutionFailure({
      message: `Producer ${producerLabel(options.producer)} returned non-text output; no deterministic capture adapter conversion is available yet.`,
      preserve,
      producer: options.producer,
    });
  }

  let record: TextOutputRecord;
  try {
    const vaultOptions: { root?: string; retention?: VaultRetentionPolicy } = {};
    if (options.vaultRoot !== undefined) {
      vaultOptions.root = options.vaultRoot;
    }
    if (options.vaultRetention !== undefined) {
      vaultOptions.retention = options.vaultRetention;
    }
    const vault = createVault(vaultOptions);
    record = await storeTextOutput(vault, {
      sessionId: options.sessionId,
      raw: captured.text,
      sourceKind: sourceKindForProducer(options.producer),
      decisionIds: [decisionId("capture-store", producerLabel(options.producer), options.sessionId)],
      producer: options.producer,
    });
  } catch (error) {
    return storageFailure({
      message: `Captured producer output could not be persisted: ${errorMessage(error)}`,
      preserve,
      operation: "capture",
      producer: options.producer,
    });
  }

  const routed = routeCapturedText({
    outputId: record.outputId,
    text: captured.text,
    preserve,
    thresholds,
    producer: options.producer,
  });

  if (captured.partial) {
    return partialCaptureFailure({
      message: `Producer ${producerLabel(options.producer)} returned partial captured output.`,
      preserve,
      producer: options.producer,
      recordId: record.recordId,
      outputId: record.outputId,
      persistence: record.persistence,
      evidence: routed.evidence,
    });
  }

  return {
    toolStatus: "ok",
    decisionId: decisionId("capture", record.outputId, producerLabel(options.producer), routed.routingStatus),
    outputId: record.outputId,
    recordId: record.recordId,
    preserve,
    producer: record.producer,
    persistence: record.persistence,
    routing: {
      status: routed.routingStatus,
      route: "capture",
      reason: routed.reason,
    },
    summary: routed.summary,
    evidence: routed.evidence,
    recovery: {
      how: `Use freeflow_retrieve with source.kind=vault and outputId=${record.outputId}, stream=raw, and an exact lineRange to recover exact captured content.`,
      outputId: record.outputId,
    },
  };
}

interface RouteCapturedTextOptions {
  outputId: string;
  text: string;
  preserve: PreserveMode;
  thresholds: RouterThresholds;
  producer: ProducerDescriptor;
}

function routeCapturedText(options: RouteCapturedTextOptions): {
  routingStatus: "routed" | "partial";
  reason: string;
  summary: string;
  evidence: EvidencePacket[];
} {
  const caps =
    options.preserve === "full"
      ? {
          maxLines: Number.MAX_SAFE_INTEGER,
          maxExcerptBytes: options.thresholds.largeOutputBytes,
          maxLineBytes: options.thresholds.largeOutputBytes,
        }
      : {
          maxLines: options.thresholds.largeOutputLines,
          maxExcerptBytes: options.thresholds.largeOutputBytes,
          maxLineBytes: options.thresholds.largeOutputBytes,
        };
  const bounded = assembleTextEvidence({ stream: "combined", text: options.text, caps });
  const outputBytes = byteLength(options.text);
  const outputLines = countLines(options.text);
  const routingStatus = bounded.compressed || bounded.fidelity === "lossy" ? "partial" : "routed";
  const evidence = bounded.importantLines.map((line, index): EvidencePacket => ({
    id: evidenceId(options.outputId, line.lines, index),
    source: { kind: "vault", outputId: options.outputId, stream: "raw" },
    path: `${options.outputId}:raw`,
    lines: line.lines,
    excerpt: line.excerpt,
    why:
      routingStatus === "partial"
        ? `Bounded captured output from producer ${producerLabel(options.producer)}; exact raw content is recoverable from the vault.`
        : `Captured exact output from producer ${producerLabel(options.producer)} within routing caps.`,
    window: routingStatus === "partial" ? "small" : "exact",
    expandable: true,
  }));

  return {
    routingStatus,
    reason:
      routingStatus === "partial"
        ? `Captured output from producer ${producerLabel(options.producer)} (${outputBytes} bytes, ${outputLines} lines) was vaulted; bounded evidence was returned with exact recovery.`
        : `Captured output from producer ${producerLabel(options.producer)} (${outputBytes} bytes, ${outputLines} lines) was vaulted and returned within routing caps.`,
    summary: `Captured ${outputLines} line(s), ${outputBytes} byte(s) from producer ${producerLabel(options.producer)}.`,
    evidence,
  };
}

function findCaptureAdapter(
  adapters: readonly CaptureProducerAdapter[],
  producer: ProducerDescriptor,
): CaptureProducerAdapter | undefined {
  return adapters.find((adapter) => producerMatches(adapter.producer, producer));
}

function producerMatches(adapterProducer: ProducerDescriptor, requested: ProducerDescriptor): boolean {
  if (adapterProducer.kind !== requested.kind) {
    return false;
  }

  for (const key of ["adapter", "name", "server", "tool"] as const) {
    if (requested[key] !== undefined && adapterProducer[key] !== requested[key]) {
      return false;
    }
  }

  return true;
}

function validateProducer(value: unknown, path: string, issues: CaptureValidationIssue[]) {
  if (!isRecord(value)) {
    issues.push({ path, message: "Expected producer object." });
    return;
  }

  if (typeof value.kind !== "string" || !PRODUCER_KINDS.has(value.kind)) {
    issues.push({ path: `${path}.kind`, message: "Expected a supported producer kind." });
  }

  for (const key of ["adapter", "name", "server", "tool"] as const) {
    if (value[key] !== undefined && typeof value[key] !== "string") {
      issues.push({ path: `${path}.${key}`, message: "Expected a string when present." });
    }
  }
}

function sourceKindForProducer(producer: ProducerDescriptor): TextOutputRecord["sourceKind"] {
  if (producer.kind === "mcp") {
    return "mcp";
  }
  if (producer.kind === "fetch" || producer.kind === "web") {
    return "fetch";
  }
  if (producer.kind === "native") {
    return "native";
  }
  return "other";
}

function producerLabel(producer: ProducerDescriptor): string {
  const parts = [producer.kind, producer.adapter, producer.name, producer.server, producer.tool].filter(Boolean);
  return parts.join(":");
}

function evidenceId(outputId: string, lines: string, index: number): string {
  return `ev_${hash(`${outputId}:${lines}:${index}`).slice(0, 16)}`;
}

function decisionId(...parts: string[]): string {
  return `ffdec_${hash(parts.join("\0")).slice(0, 16)}`;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
