import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";

import type { Json, OperationKey } from "../contracts.js";
import type { ToolRuntime } from "../index.js";
import { canonicalJson, freezeJson } from "../schema.js";
import { PROGRAM_LIMITS, ProgramLimitError, validateProgramRequest } from "./limits.js";
import { guestFrame, type GuestFrame, type HostFrame } from "./protocol.js";
import { ProgramScheduler, type ProgramSchedulerProgress } from "./scheduler.js";
import type { ToolProgressReporter } from "../progress.js";

export const RUN_MANIFEST_ENTRY = "freeflow-tool-run-v1";

export type RunEnvelope = Readonly<{
  runId: string;
  programStatus: "completed" | "failed" | "cancelled" | "limit" | "interrupted";
  effectsSettled: boolean;
  calls: {
    submitted: number;
    started: number;
    succeeded: number;
    denied: number;
    failed: number;
    cancelled: number;
    unknown: number;
  };
  emitted: readonly Json[];
  manifestRef?: string;
  continuation: "none" | "reconcile-effects" | "model-decision";
  modelContext?: Json;
  error?: { code: string; message: string };
}>;

function boundedMessage(value: unknown): string {
  return (value instanceof Error ? value.message : String(value)).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 1000);
}

export class ProgramHost {
  private lastFailure: { code: string; message: string } | undefined;

  constructor(
    private readonly pi: any,
    private readonly tools: ToolRuntime,
    private readonly state: () => any,
  ) {}

  reset(): void {
    this.lastFailure = undefined;
  }

  private allowedOperations(
    request: ReturnType<typeof validateProgramRequest>,
    mode: "reduction" | "adapters",
  ): Map<string, OperationKey> {
    const result = new Map<string, OperationKey>();
    for (const key of request.operations) {
      const descriptor = this.tools.registry.describe(key);
      if (!descriptor?.available || !descriptor.exposure.programmatic)
        throw new ProgramLimitError(
          "operation_unavailable",
          `Program operation is unavailable: ${key.id}@${key.revision}.`,
        );
      if (mode !== "adapters" && descriptor.effects.some((effect) => effect !== "captured-read"))
        throw new ProgramLimitError(
          "live_operations_unavailable",
          `Live operation is unavailable in reduction mode: ${key.id}.`,
        );
      if (result.has(key.id))
        throw new ProgramLimitError("operation_ambiguous", `Program repeats operation ID: ${key.id}.`);
      result.set(key.id, Object.freeze({ ...key }));
    }
    return result;
  }

  async run(
    callId: string,
    raw: unknown,
    signal: AbortSignal | undefined,
    ctx: any,
    progress?: ToolProgressReporter,
  ): Promise<any> {
    const state = this.state();
    if (!state?.effective || state.programs.mode === "off")
      throw new ProgramLimitError("programs_disabled", "Freeflow programs are disabled.");
    const request = validateProgramRequest(raw, state.programs.timeoutMs);
    const operations = this.allowedOperations(request, state.programs.mode);
    const runId = `run:${randomUUID()}`;
    const scope = this.tools.createProgramScope(callId, ctx);
    const programAdmission = this.tools.admitProgram(scope);
    if (programAdmission.kind !== "allowed")
      throw new ProgramLimitError(
        programAdmission.kind === "needs-model" ? "needs_model" : programAdmission.code,
        programAdmission.kind === "needs-model"
          ? "Program execution requires a model decision."
          : programAdmission.message,
      );
    const captures = new Set(request.captures);
    const inputJson = canonicalJson(request.input);
    const emitted: Json[] = [];
    const initialCounts = {
      submitted: 0,
      started: 0,
      succeeded: 0,
      denied: 0,
      failed: 0,
      cancelled: 0,
      unknown: 0,
    };
    progress?.publish({
      version: 1,
      tool: "freeflow_run",
      phase: "running",
      activity: "Starting restricted program",
      runId,
      counts: initialCounts,
      emittedCount: 0,
    });
    let emittedBytes = 0;
    let emitSequence = 0;
    let terminal: Extract<GuestFrame, { type: "finished" | "failed" }> | undefined;
    let terminalStatus: RunEnvelope["programStatus"] | undefined;
    let terminalError: RunEnvelope["error"] | undefined;
    let modelContext: Json | undefined;
    let settled = false;
    let finalizing = false;
    let worker: Worker | undefined;
    let scheduler: ProgramScheduler | undefined;
    let finish!: (value: RunEnvelope) => void;
    const result = new Promise<RunEnvelope>((resolve) => {
      finish = resolve;
    });
    let lastCurrent: ProgramSchedulerProgress["current"];
    const publishSchedulerProgress = (snapshot: ProgramSchedulerProgress) => {
      const current = snapshot.current;
      if (current) lastCurrent = current;
      const settledCurrent = current && current.status !== "running";
      progress?.publish({
        version: 1,
        tool: "freeflow_run",
        phase: settledCurrent ? "settling" : "running",
        activity: current
          ? `${current.status === "running" ? "Running" : "Settled"} ${current.operation.id}`
          : "Running restricted program",
        runId,
        counts: snapshot.counts,
        emittedCount: emitted.length,
        ...(current ? { current } : {}),
      });
    };
    const finalize = async () => {
      if (settled || finalizing || !scheduler || (!terminal && !terminalStatus)) return;
      finalizing = true;
      progress?.flush();
      progress?.publish({
        version: 1,
        tool: "freeflow_run",
        phase: "settling",
        activity: "Settling program operations",
        runId,
        counts: { ...scheduler.counts },
        emittedCount: emitted.length,
        ...(lastCurrent ? { current: lastCurrent } : {}),
      });
      await scheduler.drain();
      progress?.flush();
      settled = true;
      const status =
        scheduler.counts.unknown > 0
          ? "interrupted"
          : (terminalStatus ?? (terminal?.type === "finished" ? "completed" : "failed"));
      const error =
        scheduler.counts.unknown > 0
          ? { code: "unresolved_effects", message: "One or more live effects require reconciliation." }
          : (terminalError ??
            (terminal?.type === "failed" ? { code: terminal.code, message: terminal.message } : undefined));
      const envelope: RunEnvelope = {
        runId,
        programStatus: status,
        effectsSettled: scheduler.counts.unknown === 0,
        calls: { ...scheduler.counts },
        emitted: Object.freeze([...emitted]),
        continuation:
          scheduler.counts.unknown > 0 ? "reconcile-effects" : modelContext !== undefined ? "model-decision" : "none",
        ...(modelContext !== undefined ? { modelContext } : {}),
        ...(error ? { error } : {}),
      };
      const manifest = {
        version: 1,
        runId,
        parentCallId: callId,
        sessionId: scope.sessionId,
        responsibility: scope.responsibility,
        operations: [...operations.values()],
        captures: [...captures],
        programStatus: envelope.programStatus,
        effectsSettled: envelope.effectsSettled,
        calls: envelope.calls,
        outcomes: scheduler.outcomes,
        emitted: envelope.emitted,
        continuation: envelope.continuation,
        ...(envelope.modelContext !== undefined ? { modelContext: envelope.modelContext } : {}),
        ...(envelope.error ? { error: envelope.error } : {}),
      };
      let manifestRef: string | undefined;
      progress?.publish(
        {
          version: 1,
          tool: "freeflow_run",
          phase: "settling",
          activity: status === "completed" ? "Finalizing settled program" : `Finalizing ${status} program`,
          runId,
          counts: { ...scheduler.counts },
          emittedCount: emitted.length,
          ...(lastCurrent ? { current: lastCurrent } : {}),
        },
        true,
      );
      try {
        this.pi.appendEntry?.(RUN_MANIFEST_ENTRY, manifest);
        const matches = (ctx.sessionManager?.getBranch?.() ?? []).filter(
          (entry: any) =>
            entry?.type === "custom" && entry.customType === RUN_MANIFEST_ENTRY && entry.data?.runId === runId,
        );
        if (matches.length === 1) manifestRef = runId;
      } catch {}
      finish(Object.freeze({ ...envelope, ...(manifestRef ? { manifestRef } : {}) }));
    };

    const send = (frame: HostFrame) => worker?.postMessage(frame);
    let interruptForModel: (context: Json) => void = () => {};
    scheduler = new ProgramScheduler(
      this.tools,
      scope,
      operations,
      captures,
      send,
      runId,
      Math.min(state.programs.maxParallelReads, PROGRAM_LIMITS.parallelReads),
      ctx,
      (outcome) => interruptForModel(outcome.context ?? null),
      publishSchedulerProgress,
    );
    try {
      worker = new Worker(new URL("./worker.js", import.meta.url), {
        workerData: {
          runId,
          request,
          inputJson,
          deadlineMs: performance.now() + request.timeoutMs,
        },
      });
    } catch (error) {
      throw new ProgramLimitError("worker_unavailable", boundedMessage(error));
    }

    const abort = (code: "cancelled" | "limit" | "interrupted" | "failed", message: string, context?: Json) => {
      if (settled || terminalStatus) return;
      terminalStatus = code;
      progress?.publish(
        {
          version: 1,
          tool: "freeflow_run",
          phase: "cancelling",
          activity: context === undefined ? `Stopping program: ${code}` : "Stopping for model decision",
          runId,
          counts: scheduler ? { ...scheduler.counts } : initialCounts,
          emittedCount: emitted.length,
          ...(lastCurrent ? { current: lastCurrent } : {}),
        },
        true,
      );
      terminalError = { code: context === undefined ? code : "needs_model", message };
      if (context !== undefined) modelContext = freezeJson(context);
      scheduler!.cancel(message);
      try {
        send({ v: 1, type: "cancel", runId, reason: message });
      } catch {}
      void worker?.terminate().finally(() => void finalize());
    };
    interruptForModel = (context: Json) => abort("interrupted", "Program stopped for a model decision.", context);
    const onAbort = () => abort("cancelled", "Program cancelled by the native caller.");
    signal?.addEventListener("abort", onAbort, { once: true });
    const watchdog = setTimeout(() => abort("limit", "Program deadline exceeded."), request.timeoutMs + 25);

    worker.on("message", (rawFrame) => {
      if (settled || terminalStatus) return;
      try {
        const frame = guestFrame(rawFrame);
        if (frame.runId !== runId) throw new ProgramLimitError("foreign_frame", "Worker frame has a foreign run ID.");
        if (frame.type === "call" || frame.type === "capture-read") scheduler!.submit(frame);
        else if (frame.type === "emit") {
          if (frame.seq !== ++emitSequence)
            throw new ProgramLimitError("emit_sequence", "Emission sequence is invalid.");
          const value = freezeJson(JSON.parse(frame.valueJson));
          emittedBytes += Buffer.byteLength(canonicalJson(value), "utf8");
          if (emittedBytes > PROGRAM_LIMITS.emissionBytes) {
            abort("limit", "Program emission limit exceeded.");
            return;
          }
          emitted.push(value);
          progress?.publish({
            version: 1,
            tool: "freeflow_run",
            phase: "running",
            activity: "Program emitted an observation",
            runId,
            counts: scheduler ? { ...scheduler.counts } : initialCounts,
            emittedCount: emitted.length,
            ...(lastCurrent ? { current: lastCurrent } : {}),
          });
        } else {
          terminal = frame;
          scheduler!.closeAdmission();
          void finalize();
        }
      } catch (error) {
        abort("failed", boundedMessage(error));
      }
    });
    worker.on("error", (error) => abort("interrupted", boundedMessage(error)));
    worker.on("exit", (code) => {
      if (!terminal && !terminalStatus) {
        terminalStatus = "interrupted";
        terminalError = { code: "worker_exit", message: `Program Worker exited with code ${code}.` };
        scheduler!.cancel(terminalError.message);
      }
      void finalize();
    });
    if (signal?.aborted) onAbort();

    try {
      const envelope = await result;
      const content = canonicalJson(envelope as unknown as Json);
      if (Buffer.byteLength(content, "utf8") > PROGRAM_LIMITS.resultBytes)
        throw new ProgramLimitError("result_limit", "Program result exceeds the model response limit.");
      if (envelope.programStatus !== "completed" || !envelope.effectsSettled) this.lastFailure = envelope.error;
      return { content: [{ type: "text", text: content }], details: { freeflowRun: envelope } };
    } finally {
      clearTimeout(watchdog);
      signal?.removeEventListener("abort", onAbort);
      await worker?.terminate().catch(() => {});
    }
  }

  patchResult(event: any): { isError: true } | undefined {
    return event?.toolName === "freeflow_run" && event?.details?.freeflowRun?.programStatus !== "completed"
      ? { isError: true }
      : undefined;
  }

  status() {
    return { lastFailure: this.lastFailure };
  }
}
