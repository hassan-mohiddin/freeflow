import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import { canonicalJson, freezeJson } from "../schema.js";
import { PROGRAM_LIMITS, ProgramLimitError, validateProgramRequest } from "./limits.js";
import { guestFrame } from "./protocol.js";
import { ProgramScheduler } from "./scheduler.js";
export const RUN_MANIFEST_ENTRY = "freeflow-tool-run-v1";
function boundedMessage(value) {
  return (value instanceof Error ? value.message : String(value)).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 1000);
}
export class ProgramHost {
  pi;
  tools;
  state;
  lastFailure;
  constructor(pi, tools, state) {
    this.pi = pi;
    this.tools = tools;
    this.state = state;
  }
  reset() {
    this.lastFailure = undefined;
  }
  allowedOperations(request, mode) {
    const result = new Map();
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
  async run(callId, raw, signal, ctx) {
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
    const emitted = [];
    let emittedBytes = 0;
    let emitSequence = 0;
    let terminal;
    let terminalStatus;
    let terminalError;
    let modelContext;
    let settled = false;
    let finalizing = false;
    let worker;
    let scheduler;
    let finish;
    const result = new Promise((resolve) => {
      finish = resolve;
    });
    const finalize = async () => {
      if (settled || finalizing || !scheduler || (!terminal && !terminalStatus)) return;
      finalizing = true;
      await scheduler.drain();
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
      const envelope = {
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
      let manifestRef;
      try {
        this.pi.appendEntry?.(RUN_MANIFEST_ENTRY, manifest);
        const matches = (ctx.sessionManager?.getBranch?.() ?? []).filter(
          (entry) => entry?.type === "custom" && entry.customType === RUN_MANIFEST_ENTRY && entry.data?.runId === runId,
        );
        if (matches.length === 1) manifestRef = runId;
      } catch {}
      finish(Object.freeze({ ...envelope, ...(manifestRef ? { manifestRef } : {}) }));
    };
    const send = (frame) => worker?.postMessage(frame);
    let interruptForModel = () => {};
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
    const abort = (code, message, context) => {
      if (settled || terminalStatus) return;
      terminalStatus = code;
      terminalError = { code: context === undefined ? code : "needs_model", message };
      if (context !== undefined) modelContext = freezeJson(context);
      scheduler.cancel(message);
      try {
        send({ v: 1, type: "cancel", runId, reason: message });
      } catch {}
      void worker?.terminate().finally(() => void finalize());
    };
    interruptForModel = (context) => abort("interrupted", "Program stopped for a model decision.", context);
    const onAbort = () => abort("cancelled", "Program cancelled by the native caller.");
    signal?.addEventListener("abort", onAbort, { once: true });
    const watchdog = setTimeout(() => abort("limit", "Program deadline exceeded."), request.timeoutMs + 25);
    worker.on("message", (rawFrame) => {
      if (settled || terminalStatus) return;
      try {
        const frame = guestFrame(rawFrame);
        if (frame.runId !== runId) throw new ProgramLimitError("foreign_frame", "Worker frame has a foreign run ID.");
        if (frame.type === "call" || frame.type === "capture-read") scheduler.submit(frame);
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
        } else {
          terminal = frame;
          scheduler.closeAdmission();
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
        scheduler.cancel(terminalError.message);
      }
      void finalize();
    });
    if (signal?.aborted) onAbort();
    try {
      const envelope = await result;
      const content = canonicalJson(envelope);
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
  patchResult(event) {
    return event?.toolName === "freeflow_run" && event?.details?.freeflowRun?.programStatus !== "completed"
      ? { isError: true }
      : undefined;
  }
  status() {
    return { lastFailure: this.lastFailure };
  }
}
