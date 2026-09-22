import { randomUUID } from "node:crypto";
import { TextDecoder } from "node:util";

import { canonical } from "../../cognitive-routing-v2/types.js";
import type { ToolExecutionState } from "../config.js";
import type { ResponsibilitySnapshot } from "../contracts.js";
import {
  CAPTURE_DESCRIPTOR_ENTRY,
  CAPTURE_POLICY_REVISION,
  DEFAULT_READER_RESPONSE_BYTES,
  MAX_CAPTURE_BYTES,
  MAX_READER_RESPONSE_BYTES,
  isCaptureDescriptor,
  type CaptureDescriptorV1,
  type ResultGrant,
} from "./contracts.js";
import { isWellFormedUnicode, renderCapturePresentation, sha256 } from "./presentation.js";
import { CaptureStore, CaptureStoreError } from "./store.js";

interface CapturedCall {
  sessionId: string;
  sessionFile: string;
  assistantEntryId: string;
  responsibility: ResponsibilitySnapshot;
  source: string;
}

export type ResultReadAccess = Readonly<{ recovery: boolean; sha256?: string }>;

export class ResultRuntimeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "ResultRuntimeError";
  }
}

function branch(ctx: any): any[] {
  const entries = ctx?.sessionManager?.getBranch?.();
  return Array.isArray(entries) ? entries : [];
}

function sessionId(ctx: any): string | undefined {
  const value = ctx?.sessionManager?.getSessionId?.();
  return typeof value === "string" && value ? value : undefined;
}

function sessionFile(ctx: any): string | undefined {
  const value = ctx?.sessionManager?.getSessionFile?.();
  return typeof value === "string" && value ? value : undefined;
}

function textBlock(message: any): string | undefined {
  return Array.isArray(message?.content) &&
    message.content.length === 1 &&
    message.content[0]?.type === "text" &&
    typeof message.content[0].text === "string"
    ? message.content[0].text
    : undefined;
}

function assistantForCall(entries: any[], toolCallId: string, toolName: string): any | undefined {
  const matches = entries.filter(
    (entry) =>
      entry?.type === "message" &&
      entry.message?.role === "assistant" &&
      (entry.message.content ?? []).filter(
        (block: any) => block?.type === "toolCall" && block.id === toolCallId && block.name === toolName,
      ).length === 1,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function isContinuation(byte: number | undefined): boolean {
  return byte !== undefined && (byte & 0xc0) === 0x80;
}

function rangeEnd(buffer: Buffer, start: number, available: number): number {
  let end = Math.min(buffer.length, start + Math.max(0, available));
  while (end > start && end < buffer.length && isContinuation(buffer[end])) end -= 1;
  return end;
}

function exactRange(
  descriptor: CaptureDescriptorV1,
  buffer: Buffer,
  offsetBytes: number,
  maximumBytes: number,
): {
  id: string;
  text: string;
  range: { startBytes: number; endBytes: number };
  totalBytes: number;
  coverage: string;
  scope: string;
  nextOffsetBytes?: number;
} {
  if (offsetBytes > buffer.length) throw new ResultRuntimeError("invalid_range", "Offset exceeds captured bytes.");
  if (offsetBytes < buffer.length && isContinuation(buffer[offsetBytes])) {
    throw new ResultRuntimeError("invalid_range", "Offset is inside a UTF-8 code point.");
  }
  const endBytes = rangeEnd(buffer, offsetBytes, maximumBytes);
  if (offsetBytes < buffer.length && endBytes === offsetBytes) {
    throw new ResultRuntimeError("invalid_range", "Requested byte budget cannot fit the next UTF-8 code point.");
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(offsetBytes, endBytes));
  return {
    id: descriptor.id,
    text,
    range: { startBytes: offsetBytes, endBytes },
    totalBytes: buffer.length,
    coverage: descriptor.capture.externalCoverage,
    scope: descriptor.capture.scope,
    ...(endBytes < buffer.length ? { nextOffsetBytes: endBytes } : {}),
  };
}

function renderRead(
  descriptor: CaptureDescriptorV1,
  buffer: Buffer,
  offsetBytes: number,
  maximumBytes: number,
): { content: string; endBytes: number; nextOffsetBytes?: number } {
  if (offsetBytes > buffer.length) throw new ResultRuntimeError("invalid_range", "Offset exceeds captured bytes.");
  if (offsetBytes < buffer.length && isContinuation(buffer[offsetBytes])) {
    throw new ResultRuntimeError("invalid_range", "Offset is inside a UTF-8 code point.");
  }
  let endBytes = offsetBytes;
  let content = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const sizingHeader =
      [
        `Captured result: ${descriptor.id}`,
        `Range: [${offsetBytes},${endBytes}) of ${buffer.length} bytes`,
        `Coverage: ${descriptor.capture.externalCoverage} at tool-result-hook`,
        "Payload:",
      ].join("\n") + "\n";
    const sizingFooter = endBytes < buffer.length ? `\nNext offset: ${endBytes}` : "\nEnd of captured result.";
    const available = maximumBytes - Buffer.byteLength(sizingHeader + sizingFooter, "utf8");
    if (available < 0)
      throw new ResultRuntimeError("invalid_range", "Requested byte budget cannot fit reader metadata.");
    endBytes = rangeEnd(buffer, offsetBytes, available);
    if (offsetBytes < buffer.length && endBytes === offsetBytes) {
      throw new ResultRuntimeError("invalid_range", "Requested byte budget cannot fit the next UTF-8 code point.");
    }
    const header =
      [
        `Captured result: ${descriptor.id}`,
        `Range: [${offsetBytes},${endBytes}) of ${buffer.length} bytes`,
        `Coverage: ${descriptor.capture.externalCoverage} at tool-result-hook`,
        "Payload:",
      ].join("\n") + "\n";
    const payload = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(offsetBytes, endBytes));
    const footer = endBytes < buffer.length ? `\nNext offset: ${endBytes}` : "\nEnd of captured result.";
    content = `${header}${payload}${footer}`;
  }
  if (Buffer.byteLength(content, "utf8") > maximumBytes) {
    throw new ResultRuntimeError("invalid_range", "Reader response exceeds the requested byte budget.");
  }
  return {
    content,
    endBytes,
    ...(endBytes < buffer.length ? { nextOffsetBytes: endBytes } : {}),
  };
}

export class ResultRuntime {
  private readonly store: CaptureStore;
  private readonly calls = new Map<string, CapturedCall>();
  private serial: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private queued = 0;
  private failures: { code: string; message: string }[] = [];

  constructor(
    private readonly pi: any,
    private readonly state: () => ToolExecutionState | undefined,
    private readonly responsibility: () => ResponsibilitySnapshot,
    private readonly access: (id: string) => ResultReadAccess = () => ({ recovery: false }),
  ) {
    this.store = new CaptureStore(pi);
  }

  reset(): void {
    this.generation += 1;
    this.calls.clear();
    this.failures = [];
  }

  private rememberFailure(error: unknown): void {
    const code =
      error instanceof CaptureStoreError || error instanceof ResultRuntimeError ? error.code : "capture_failed";
    const message = error instanceof Error ? error.message : String(error);
    this.failures.push({ code, message: message.slice(0, 512) });
    if (this.failures.length > 16) this.failures.shift();
  }

  toolCall(event: any, ctx: any): void {
    const current = this.state();
    if (!current?.effective || !current.capture.effective || event?.toolName !== "bash") return;
    const id = sessionId(ctx);
    const file = sessionFile(ctx);
    if (!id || !file) return;
    const assistant = assistantForCall(branch(ctx), event.toolCallId, "bash");
    const metadata = this.pi.getAllTools?.().find((tool: any) => tool?.name === "bash")?.sourceInfo;
    if (!assistant || metadata?.source !== "builtin") return;
    this.calls.set(event.toolCallId, {
      sessionId: id,
      sessionFile: file,
      assistantEntryId: assistant.id,
      responsibility: structuredClone(this.responsibility()),
      source: metadata.source,
    });
  }

  private callCurrent(call: CapturedCall, ctx: any): boolean {
    return (
      sessionId(ctx) === call.sessionId &&
      sessionFile(ctx) === call.sessionFile &&
      branch(ctx).some((entry) => entry?.id === call.assistantEntryId)
    );
  }

  async capture(event: any, ctx: any): Promise<any | undefined> {
    const current = this.state();
    const call = this.calls.get(event?.toolCallId);
    const body = textBlock(event);
    if (
      !current?.effective ||
      !current.capture.effective ||
      event?.toolName !== "bash" ||
      event?.isError !== false ||
      !call ||
      call.source !== "builtin" ||
      !this.callCurrent(call, ctx) ||
      body === undefined ||
      !isWellFormedUnicode(body)
    )
      return undefined;
    const captureBytes = Buffer.byteLength(body, "utf8");
    if (captureBytes <= current.capture.maxInlineBytes || captureBytes > MAX_CAPTURE_BYTES || this.queued >= 16)
      return undefined;
    const id = `result:${randomUUID()}`;
    const externalCoverage = event?.details?.truncation?.truncated === true ? "limited" : "unspecified";
    const presentation = renderCapturePresentation(body, id, current.capture.maxInlineBytes, externalCoverage);
    if (!presentation) return undefined;
    const descriptor: CaptureDescriptorV1 = {
      version: 1,
      id,
      originSessionId: call.sessionId,
      assistantEntryId: call.assistantEntryId,
      toolCallId: event.toolCallId,
      toolName: "bash",
      producer: call.responsibility,
      policyRevision: CAPTURE_POLICY_REVISION,
      capture: {
        encoding: "utf-8",
        scope: "tool-result-hook",
        externalCoverage,
        bytes: captureBytes,
        sha256: sha256(body),
      },
      emission: {
        bytes: presentation.bytes,
        sha256: sha256(presentation.text),
        representation: "excerpt",
      },
      storageKey: `${sha256(id)}.txt`,
    };
    this.queued += 1;
    const generation = this.generation;
    const currentFence = () => generation === this.generation && this.callCurrent(call, ctx);
    const operation = this.serial.then(async () => {
      if (!currentFence()) return undefined;
      await this.store.publish(ctx, descriptor, body, current.capture.maxStoredBytes, currentFence);
      if (!currentFence()) return undefined;
      return { content: [{ type: "text", text: presentation.text }] };
    });
    this.serial = operation.catch(() => {});
    try {
      return await operation;
    } catch (error) {
      this.rememberFailure(error);
      return undefined;
    } finally {
      this.queued -= 1;
    }
  }

  turnEnd(event: any): void {
    for (const result of Array.isArray(event?.toolResults) ? event.toolResults : []) {
      if (typeof result?.toolCallId === "string") this.calls.delete(result.toolCallId);
    }
  }

  private descriptor(ctx: any, id: string): CaptureDescriptorV1 {
    const matches = branch(ctx).filter(
      (entry) =>
        entry?.type === "custom" &&
        entry.customType === CAPTURE_DESCRIPTOR_ENTRY &&
        entry.data?.id === id &&
        isCaptureDescriptor(entry.data),
    );
    if (matches.length !== 1) throw new ResultRuntimeError("result_unavailable", "Captured result is unavailable.");
    return structuredClone(matches[0].data);
  }

  private finalResult(ctx: any, descriptor: CaptureDescriptorV1): any {
    const entries = branch(ctx);
    const assistantIndex = entries.findIndex((entry) => entry?.id === descriptor.assistantEntryId);
    if (assistantIndex < 0)
      throw new ResultRuntimeError("result_unavailable", "Capture origin is outside current ancestry.");
    const assistant = entries[assistantIndex];
    const calls = (assistant.message?.content ?? []).filter(
      (block: any) =>
        block?.type === "toolCall" && block.id === descriptor.toolCallId && block.name === descriptor.toolName,
    );
    if (calls.length !== 1) throw new ResultRuntimeError("result_unavailable", "Capture origin call is ambiguous.");
    const results = entries
      .slice(assistantIndex + 1)
      .filter(
        (entry) =>
          entry?.type === "message" &&
          entry.message?.role === "toolResult" &&
          entry.message.toolCallId === descriptor.toolCallId &&
          entry.message.toolName === descriptor.toolName,
      );
    if (results.length !== 1) throw new ResultRuntimeError("result_unavailable", "Final native result is unavailable.");
    const text = textBlock(results[0].message);
    if (results[0].message.isError !== false || text === undefined || sha256(text) !== descriptor.emission.sha256) {
      throw new ResultRuntimeError(
        "source_representation_changed",
        "Final native result differs from the captured emission; earlier bytes cannot be disclosed.",
      );
    }
    return results[0];
  }

  async resolveGrant(id: string, ctx: any): Promise<ResultGrant | undefined> {
    try {
      if (!this.state()?.effective) return undefined;
      const descriptor = this.descriptor(ctx, id);
      this.finalResult(ctx, descriptor);
      await this.store.read(ctx, descriptor);
      return { id: descriptor.id, sha256: descriptor.capture.sha256 };
    } catch {
      return undefined;
    }
  }

  private async verified(
    input: any,
    signal: AbortSignal | undefined,
    ctx: any,
  ): Promise<{ descriptor: CaptureDescriptorV1; buffer: Buffer }> {
    if (signal?.aborted) throw new ResultRuntimeError("cancelled", "Captured read was cancelled.");
    if (!this.state()?.effective) throw new ResultRuntimeError("reader_unavailable", "Tool Execution is disabled.");
    const descriptor = this.descriptor(ctx, input.id);
    this.finalResult(ctx, descriptor);
    const access = this.access(descriptor.id);
    if (access.recovery && access.sha256 !== descriptor.capture.sha256) {
      throw new ResultRuntimeError("result_not_admitted", "Captured result is not granted for attached recovery.");
    }
    const buffer = await this.store.read(ctx, descriptor);
    if (signal?.aborted) throw new ResultRuntimeError("cancelled", "Captured read was cancelled.");
    return { descriptor, buffer };
  }

  async readValue(input: any, signal: AbortSignal | undefined, ctx: any): Promise<any> {
    const { descriptor, buffer } = await this.verified(input, signal, ctx);
    return exactRange(
      descriptor,
      buffer,
      input.offsetBytes ?? 0,
      Math.min(input.maxBytes ?? DEFAULT_READER_RESPONSE_BYTES, MAX_READER_RESPONSE_BYTES),
    );
  }

  async read(input: any, signal: AbortSignal | undefined, ctx: any): Promise<any> {
    const { descriptor, buffer } = await this.verified(input, signal, ctx);
    const offsetBytes = input.offsetBytes ?? 0;
    const maximumBytes = Math.min(input.maxBytes ?? DEFAULT_READER_RESPONSE_BYTES, MAX_READER_RESPONSE_BYTES);
    const rendered = renderRead(descriptor, buffer, offsetBytes, maximumBytes);
    return {
      content: [{ type: "text", text: rendered.content }],
      details: {
        capturedResult: {
          id: descriptor.id,
          range: { startBytes: offsetBytes, endBytes: rendered.endBytes },
          totalBytes: buffer.length,
          coverage: descriptor.capture.externalCoverage,
          scope: descriptor.capture.scope,
          ...(rendered.nextOffsetBytes !== undefined ? { nextOffsetBytes: rendered.nextOffsetBytes } : {}),
        },
      },
    };
  }

  status() {
    return { queued: this.queued, failures: structuredClone(this.failures) };
  }
}
