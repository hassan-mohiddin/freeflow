import { canonicalJson, freezeJson } from "../schema.js";
import { PROGRAM_LIMITS, ProgramLimitError } from "./limits.js";
export class ProgramScheduler {
  runtime;
  scope;
  operations;
  captures;
  send;
  runId;
  parallelReads;
  host;
  onControl;
  counts = {
    submitted: 0,
    started: 0,
    succeeded: 0,
    denied: 0,
    failed: 0,
    cancelled: 0,
    unknown: 0,
  };
  outcomes = [];
  queue = [];
  settled = new Map();
  active = 0;
  exclusiveActive = false;
  admitting = false;
  inFlight = new Map();
  abandoned = new Set();
  abandonmentTimer;
  nextSubmitted = 1;
  nextCommit = 1;
  admissionClosed = false;
  transferredBytes = 0;
  controller = new AbortController();
  idleWaiters = [];
  lane = Promise.resolve();
  lanePending = 0;
  flushScheduled = false;
  constructor(runtime, scope, operations, captures, send, runId, parallelReads, host, onControl = () => {}) {
    this.runtime = runtime;
    this.scope = scope;
    this.operations = operations;
    this.captures = captures;
    this.send = send;
    this.runId = runId;
    this.parallelReads = parallelReads;
    this.host = host;
    this.onControl = onControl;
  }
  get signal() {
    return this.controller.signal;
  }
  outcomeJson(outcome) {
    const value =
      outcome.status === "succeeded"
        ? { ok: true, value: outcome.value, coverage: outcome.coverage, effectState: outcome.effectState }
        : {
            ok: false,
            error: {
              code: outcome.error?.code ?? outcome.status,
              message: outcome.error?.message ?? "Operation failed.",
              effectState: outcome.effectState,
              status: outcome.status,
              ...(outcome.context !== undefined ? { context: outcome.context } : {}),
            },
          };
    return canonicalJson(freezeJson(value));
  }
  denied(key, code, message) {
    return {
      operation: key,
      catalogGeneration: this.scope.catalogGeneration,
      status: code === "cancelled" ? "cancelled" : "denied",
      effectState: "none",
      bodyStarted: false,
      error: { code, message },
    };
  }
  enqueueLane(action) {
    this.lanePending += 1;
    const result = this.lane.then(action, action);
    this.lane = result.then(
      () => {},
      () => {},
    );
    void result.then(
      () => {
        this.lanePending -= 1;
        this.wakeIdle();
      },
      () => {
        this.lanePending -= 1;
        this.wakeIdle();
      },
    );
    return result;
  }
  submit(frame) {
    if (this.admissionClosed) throw new ProgramLimitError("admission_closed", "Program admission is closed.");
    if (frame.seq !== this.nextSubmitted++)
      throw new ProgramLimitError("sequence_invalid", "Guest call sequence is invalid.");
    this.counts.submitted += 1;
    let key;
    let input;
    if (frame.type === "call") {
      key = this.operations.get(frame.operation);
      input = JSON.parse(frame.inputJson);
    } else {
      key = { id: "result.read", revision: "1" };
      if (!this.captures.has(frame.id)) {
        const pending = { frame, key, input: {}, concurrency: "read-parallel" };
        this.settle(pending, this.denied(key, "capture_not_allowed", "Capture is not in the outer allowlist."));
        return;
      }
      const range = JSON.parse(frame.rangeJson);
      if (
        !range ||
        typeof range !== "object" ||
        Array.isArray(range) ||
        Object.keys(range).some((name) => !["offsetBytes", "maxBytes"].includes(name))
      ) {
        const pending = { frame, key, input: { id: frame.id }, concurrency: "read-parallel" };
        this.settle(pending, this.denied(key, "invalid_input", "Captured range is invalid."));
        return;
      }
      input = { ...range, id: frame.id };
    }
    if (!key) {
      const missing = { id: frame.type === "call" ? frame.operation : "result.read", revision: "unknown" };
      const pending = { frame, key: missing, input, concurrency: "read-parallel" };
      this.settle(pending, this.denied(missing, "operation_not_allowed", "Operation is not in the outer allowlist."));
      return;
    }
    if (
      key.id === "result.read" &&
      (!input || typeof input !== "object" || Array.isArray(input) || !this.captures.has(input.id))
    ) {
      const pending = { frame, key, input, concurrency: "read-parallel" };
      this.settle(pending, this.denied(key, "capture_not_allowed", "Capture is not in the outer allowlist."));
      return;
    }
    if (this.counts.submitted > PROGRAM_LIMITS.totalCalls) {
      const pending = { frame, key, input, concurrency: "read-parallel" };
      this.settle(pending, this.denied(key, "call_limit", "Program call limit exceeded."));
      return;
    }
    if (this.queue.length + this.active + this.settled.size >= PROGRAM_LIMITS.pendingCalls) {
      const pending = { frame, key, input, concurrency: "read-parallel" };
      this.settle(pending, this.denied(key, "pending_limit", "Program pending-call limit exceeded."));
      return;
    }
    this.transferredBytes += Buffer.byteLength(frame.type === "call" ? frame.inputJson : frame.rangeJson, "utf8");
    if (this.transferredBytes > PROGRAM_LIMITS.transferBytes) {
      const pending = { frame, key, input, concurrency: "read-parallel" };
      this.settle(pending, this.denied(key, "transfer_limit", "Program transfer limit exceeded."));
      return;
    }
    const classification = this.runtime.classifyProgrammatic(key, input, this.scope);
    if ("outcome" in classification) {
      const pending = { frame, key, input, concurrency: "read-parallel" };
      this.settle(pending, classification.outcome);
      return;
    }
    this.queue.push({ frame, key, input, concurrency: classification.call.concurrency });
    this.drive();
  }
  canAdmit(pending) {
    if (this.controller.signal.aborted || this.admitting || this.exclusiveActive) return false;
    if (pending.concurrency === "exclusive")
      return this.active === 0 && this.settled.size === 0 && this.nextCommit === pending.frame.seq;
    return this.active < this.parallelReads;
  }
  drive() {
    const pending = this.queue[0];
    if (!pending || !this.canAdmit(pending)) return;
    this.queue.shift();
    this.admitting = true;
    void this.enqueueLane(() =>
      this.runtime.prepareProgrammatic(pending.key, pending.input, this.scope, this.controller.signal, this.host),
    )
      .then((prepared) => {
        this.admitting = false;
        if ("outcome" in prepared) {
          this.settle(pending, prepared.outcome);
          this.drive();
          return;
        }
        this.launch(pending, prepared.call);
        this.drive();
      })
      .catch((error) => {
        this.admitting = false;
        this.settle(pending, {
          operation: pending.key,
          catalogGeneration: this.scope.catalogGeneration,
          status: "failed",
          effectState: "none",
          bodyStarted: false,
          error: {
            code: "scheduler_admission_failed",
            message: error instanceof Error ? error.message : String(error),
          },
        });
        this.drive();
      });
  }
  launch(pending, call) {
    this.active += 1;
    this.inFlight.set(pending.frame.seq, { pending, call });
    if (pending.concurrency === "exclusive") this.exclusiveActive = true;
    this.runtime
      .executePrepared(call, this.controller.signal)
      .then((outcome) => {
        if (!this.abandoned.has(pending.frame.seq)) this.settle(pending, outcome);
      })
      .catch((error) => {
        if (this.abandoned.has(pending.frame.seq)) return;
        this.settle(pending, {
          operation: pending.key,
          catalogGeneration: this.scope.catalogGeneration,
          status: call.effect === "mutation" ? "unknown" : "failed",
          effect: call.effect,
          effectState: call.effect === "mutation" ? "unknown" : "none",
          bodyStarted: true,
          error: { code: "scheduler_failed", message: error instanceof Error ? error.message : String(error) },
        });
      })
      .finally(() => {
        this.inFlight.delete(pending.frame.seq);
        if (this.inFlight.size === 0 && this.abandonmentTimer) {
          clearTimeout(this.abandonmentTimer);
          this.abandonmentTimer = undefined;
        }
        if (!this.abandoned.has(pending.frame.seq)) {
          this.active -= 1;
          if (pending.concurrency === "exclusive") this.exclusiveActive = false;
        }
        this.drive();
        this.wakeIdle();
      });
  }
  abandonActive(reason) {
    for (const [sequence, { pending, call }] of this.inFlight) {
      if (this.abandoned.has(sequence)) continue;
      this.abandoned.add(sequence);
      this.active -= 1;
      if (pending.concurrency === "exclusive") this.exclusiveActive = false;
      this.settle(pending, {
        operation: pending.key,
        catalogGeneration: this.scope.catalogGeneration,
        status: call.effect === "mutation" ? "unknown" : "cancelled",
        effect: call.effect,
        effectState: call.effect === "mutation" ? "unknown" : "none",
        bodyStarted: true,
        error: {
          code: call.effect === "mutation" ? "effect_unsettled" : "cancelled",
          message:
            call.effect === "mutation" ? "Mutation outcome did not settle before the program return boundary." : reason,
        },
      });
    }
    this.wakeIdle();
  }
  settle(pending, outcome) {
    if (outcome.bodyStarted) this.counts.started += 1;
    let json = this.outcomeJson(outcome);
    this.transferredBytes += Buffer.byteLength(json, "utf8");
    if (this.transferredBytes > PROGRAM_LIMITS.transferBytes) {
      outcome = {
        operation: pending.key,
        catalogGeneration: outcome.catalogGeneration,
        status: outcome.effectState === "unknown" ? "unknown" : "failed",
        effect: outcome.effect,
        effectState: outcome.effectState,
        bodyStarted: outcome.bodyStarted,
        error: { code: "transfer_limit", message: "Program transfer limit exceeded." },
      };
      json = this.outcomeJson(outcome);
    }
    this.settled.set(pending.frame.seq, { pending, outcome, json });
    this.scheduleFlush();
  }
  scheduleFlush() {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    void this.enqueueLane(() => {
      this.flushScheduled = false;
      this.flush();
    });
  }
  flush() {
    for (;;) {
      const item = this.settled.get(this.nextCommit);
      if (!item) break;
      this.settled.delete(this.nextCommit);
      this.nextCommit += 1;
      const { outcome, pending, json } = item;
      if (outcome.status === "succeeded") this.counts.succeeded += 1;
      else if (outcome.status === "denied" || outcome.status === "needs-model") this.counts.denied += 1;
      else if (outcome.status === "cancelled") this.counts.cancelled += 1;
      else if (outcome.status === "unknown" || outcome.effectState === "unknown") this.counts.unknown += 1;
      else this.counts.failed += 1;
      this.outcomes.push({
        seq: pending.frame.seq,
        operation: pending.key,
        status: outcome.status,
        effectState: outcome.effectState,
        ...(outcome.error ? { error: outcome.error.code } : {}),
      });
      if (outcome.status === "needs-model") this.onControl(outcome);
      else if (!this.controller.signal.aborted)
        this.send({ v: 1, type: "reply", runId: this.runId, seq: pending.frame.seq, outcomeJson: json });
    }
    this.drive();
    this.wakeIdle();
  }
  closeAdmission() {
    this.admissionClosed = true;
    while (this.queue.length) {
      const pending = this.queue.shift();
      this.settle(pending, this.denied(pending.key, "admission_closed", "Program admission is closed."));
    }
  }
  cancel(reason = "Program cancelled.") {
    this.admissionClosed = true;
    if (!this.controller.signal.aborted) this.controller.abort(reason);
    while (this.queue.length) {
      const pending = this.queue.shift();
      this.settle(pending, this.denied(pending.key, "cancelled", reason));
    }
    if (this.inFlight.size > 0 && !this.abandonmentTimer) {
      this.abandonmentTimer = setTimeout(() => {
        this.abandonmentTimer = undefined;
        this.abandonActive(reason);
      }, PROGRAM_LIMITS.settleGraceMs);
    }
    this.wakeIdle();
  }
  idle() {
    return (
      this.active === 0 &&
      !this.admitting &&
      this.queue.length === 0 &&
      this.settled.size === 0 &&
      this.lanePending === 0 &&
      !this.flushScheduled
    );
  }
  wakeIdle() {
    if (!this.idle()) return;
    for (const resolve of this.idleWaiters.splice(0)) resolve();
  }
  async drain() {
    if (this.idle()) return;
    await new Promise((resolve) => this.idleWaiters.push(resolve));
  }
}
