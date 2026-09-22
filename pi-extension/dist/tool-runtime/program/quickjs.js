import { DefaultIntrinsics, newQuickJSWASMModuleFromVariant } from "quickjs-emscripten-core";
import RELEASE_SYNC from "@jitl/quickjs-wasmfile-release-sync";
import { guestProgramSource } from "./bootstrap.js";
import { PROGRAM_LIMITS, ProgramLimitError } from "./limits.js";
export class QuickJSRunner {
  setup;
  send;
  runtime;
  context;
  pending = new Map();
  immediate = new Set();
  sequence = 0;
  emitSequence = 0;
  submitted = 0;
  cancelled = false;
  jobError;
  pendingWaiters = [];
  constructor(setup, send) {
    this.setup = setup;
    this.send = send;
  }
  wakePending() {
    if (this.pending.size !== 0) return;
    for (const resolve of this.pendingWaiters.splice(0)) resolve();
  }
  async waitPending() {
    if (this.pending.size === 0) return;
    await new Promise((resolve) => this.pendingWaiters.push(resolve));
  }
  pump() {
    if (!this.runtime) return;
    for (let count = 0; count < 1024; count += 1) {
      const jobs = this.runtime.executePendingJobs();
      if (jobs?.error) {
        this.jobError = this.errorText(jobs.error);
        jobs.error.dispose();
        return;
      }
      if (!jobs?.value) return;
    }
    this.jobError = "QuickJS job queue exceeded the bounded pump.";
  }
  errorText(handle) {
    try {
      const value = this.context?.dump(handle);
      if (value && typeof value === "object") return String(value.message ?? value.name ?? JSON.stringify(value));
      return String(value);
    } catch {
      return "QuickJS guest error";
    }
  }
  immediateOutcome(json) {
    const deferred = this.context.newPromise();
    const value = this.context.newString(json);
    deferred.resolve(value);
    value.dispose();
    this.immediate.add(deferred);
    return deferred.handle;
  }
  installBindings() {
    const invoke = this.context.newFunction("__ffInvoke", (kindHandle, idHandle, rawHandle) => {
      const kind = this.context.getString(kindHandle);
      const id = this.context.getString(idHandle);
      const raw = this.context.getString(rawHandle);
      if (!["call", "capture-read"].includes(kind))
        return this.immediateOutcome(
          JSON.stringify({ ok: false, error: { code: "invalid_capability", message: "Unknown guest capability." } }),
        );
      if (Buffer.byteLength(raw, "utf8") > PROGRAM_LIMITS.frameBytes)
        return this.immediateOutcome(
          JSON.stringify({ ok: false, error: { code: "frame_limit", message: "Guest frame exceeds limit." } }),
        );
      if (this.pending.size >= PROGRAM_LIMITS.pendingCalls)
        return this.immediateOutcome(
          JSON.stringify({ ok: false, error: { code: "pending_limit", message: "Too many pending guest calls." } }),
        );
      if (++this.submitted > PROGRAM_LIMITS.totalCalls)
        return this.immediateOutcome(
          JSON.stringify({ ok: false, error: { code: "call_limit", message: "Guest call limit exceeded." } }),
        );
      const deferred = this.context.newPromise();
      const seq = ++this.sequence;
      this.pending.set(seq, deferred);
      this.send(
        kind === "call"
          ? { v: 1, type: "call", runId: this.setup.runId, seq, operation: id, inputJson: raw }
          : { v: 1, type: "capture-read", runId: this.setup.runId, seq, id, rangeJson: raw },
      );
      return deferred.handle;
    });
    const emit = this.context.newFunction("__ffEmit", (rawHandle) => {
      const valueJson = this.context.getString(rawHandle);
      if (Buffer.byteLength(valueJson, "utf8") > PROGRAM_LIMITS.frameBytes)
        throw new ProgramLimitError("frame_limit", "Guest frame exceeds limit.");
      this.send({ v: 1, type: "emit", runId: this.setup.runId, seq: ++this.emitSequence, valueJson });
    });
    const input = this.context.newString(this.setup.inputJson);
    this.context.setProp(this.context.global, "__ffInvoke", invoke);
    this.context.setProp(this.context.global, "__ffEmit", emit);
    this.context.setProp(this.context.global, "__ffInputJson", input);
    invoke.dispose();
    emit.dispose();
    input.dispose();
  }
  reply(frame) {
    if (!this.context || frame.runId !== this.setup.runId) return;
    const deferred = this.pending.get(frame.seq);
    if (!deferred) return;
    const value = this.context.newString(frame.outcomeJson);
    deferred.resolve(value);
    value.dispose();
    deferred.dispose();
    this.pending.delete(frame.seq);
    this.pump();
    this.wakePending();
  }
  cancel() {
    this.cancelled = true;
  }
  async run() {
    const QuickJS = await newQuickJSWASMModuleFromVariant(RELEASE_SYNC);
    this.runtime = QuickJS.newRuntime();
    this.runtime.setMemoryLimit(PROGRAM_LIMITS.heapBytes);
    this.runtime.setMaxStackSize(PROGRAM_LIMITS.stackBytes);
    this.runtime.setInterruptHandler(() => this.cancelled || performance.now() >= this.setup.deadlineMs);
    this.runtime.setModuleLoader(() => {
      throw new Error("Modules disabled");
    });
    this.context = this.runtime.newContext({
      intrinsics: { ...DefaultIntrinsics, Date: false },
    });
    let evaluated;
    let promiseHandle;
    try {
      this.installBindings();
      evaluated = this.context.evalCode(guestProgramSource(this.setup.request.code), "freeflow-program.js");
      if (evaluated.error) {
        const message = this.errorText(evaluated.error);
        evaluated.error.dispose();
        return { type: "failed", code: this.cancelled ? "cancelled" : "guest_error", message, detached: false };
      }
      promiseHandle = evaluated.value;
      const resultPromise = this.context.resolvePromise(promiseHandle);
      this.pump();
      const settled = await resultPromise;
      const detached = this.pending.size > 0;
      await this.waitPending();
      this.pump();
      if (settled.error) {
        const message = this.errorText(settled.error);
        settled.error.dispose();
        return { type: "failed", code: this.cancelled ? "cancelled" : "guest_error", message, detached };
      }
      settled.value.dispose();
      if (this.jobError) return { type: "failed", code: "guest_job_error", message: this.jobError, detached };
      if (detached)
        return {
          type: "failed",
          code: "detached_calls",
          message: "Program completed while capability calls were still detached.",
          detached: true,
        };
      return { type: "finished", detached: false };
    } finally {
      promiseHandle?.dispose?.();
      for (const deferred of this.pending.values()) deferred.dispose();
      for (const deferred of this.immediate) deferred.dispose();
      this.pending.clear();
      this.immediate.clear();
      this.context?.dispose();
      this.runtime?.dispose();
      this.context = undefined;
      this.runtime = undefined;
    }
  }
}
