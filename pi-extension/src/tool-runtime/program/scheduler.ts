import type { CallOutcome, Concurrency, OperationKey, ToolScope } from "../contracts.js";
import type { ToolRuntime } from "../index.js";
import type { PreparedCall } from "../kernel.js";
import { canonicalJson, freezeJson } from "../schema.js";
import { PROGRAM_LIMITS, ProgramLimitError } from "./limits.js";
import type { GuestFrame, HostFrame } from "./protocol.js";

type CallFrame = Extract<GuestFrame, { type: "call" | "capture-read" }>;

type Pending = { frame: CallFrame; key: OperationKey; input: unknown; concurrency: Concurrency };

export type CallCounts = {
  submitted: number;
  started: number;
  succeeded: number;
  denied: number;
  failed: number;
  cancelled: number;
  unknown: number;
};

export class ProgramScheduler {
  readonly counts: CallCounts = {
    submitted: 0,
    started: 0,
    succeeded: 0,
    denied: 0,
    failed: 0,
    cancelled: 0,
    unknown: 0,
  };
  readonly outcomes: { seq: number; operation: OperationKey; status: string; effectState: string; error?: string }[] =
    [];
  private readonly queue: Pending[] = [];
  private readonly settled = new Map<number, { pending: Pending; outcome: CallOutcome; json: string }>();
  private active = 0;
  private exclusiveActive = false;
  private admitting = false;
  private readonly inFlight = new Map<number, { pending: Pending; call: PreparedCall }>();
  private readonly abandoned = new Set<number>();
  private abandonmentTimer: ReturnType<typeof setTimeout> | undefined;
  private nextSubmitted = 1;
  private nextCommit = 1;
  private admissionClosed = false;
  private transferredBytes = 0;
  private readonly controller = new AbortController();
  private idleWaiters: (() => void)[] = [];
  private lane: Promise<void> = Promise.resolve();
  private lanePending = 0;
  private flushScheduled = false;

  constructor(
    private readonly runtime: ToolRuntime,
    private readonly scope: ToolScope,
    private readonly operations: ReadonlyMap<string, OperationKey>,
    private readonly captures: ReadonlySet<string>,
    private readonly send: (frame: HostFrame) => void,
    private readonly runId: string,
    private readonly parallelReads: number,
    private readonly host: unknown,
    private readonly onControl: (outcome: CallOutcome) => void = () => {},
  ) {}

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  private outcomeJson(outcome: CallOutcome): string {
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

  private denied(key: OperationKey, code: string, message: string): CallOutcome {
    return {
      operation: key,
      catalogGeneration: this.scope.catalogGeneration,
      status: code === "cancelled" ? "cancelled" : "denied",
      effectState: "none",
      bodyStarted: false,
      error: { code, message },
    };
  }

  private enqueueLane<T>(action: () => Promise<T> | T): Promise<T> {
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

  submit(frame: CallFrame): void {
    if (this.admissionClosed) throw new ProgramLimitError("admission_closed", "Program admission is closed.");
    if (frame.seq !== this.nextSubmitted++)
      throw new ProgramLimitError("sequence_invalid", "Guest call sequence is invalid.");
    this.counts.submitted += 1;
    let key: OperationKey | undefined;
    let input: unknown;
    if (frame.type === "call") {
      key = this.operations.get(frame.operation);
      input = JSON.parse(frame.inputJson);
    } else {
      key = { id: "result.read", revision: "1" };
      if (!this.captures.has(frame.id)) {
        const pending = { frame, key, input: {}, concurrency: "read-parallel" as const };
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
        const pending = { frame, key, input: { id: frame.id }, concurrency: "read-parallel" as const };
        this.settle(pending, this.denied(key, "invalid_input", "Captured range is invalid."));
        return;
      }
      input = { ...range, id: frame.id };
    }
    if (!key) {
      const missing = { id: frame.type === "call" ? frame.operation : "result.read", revision: "unknown" };
      const pending = { frame, key: missing, input, concurrency: "read-parallel" as const };
      this.settle(pending, this.denied(missing, "operation_not_allowed", "Operation is not in the outer allowlist."));
      return;
    }
    if (
      key.id === "result.read" &&
      (!input || typeof input !== "object" || Array.isArray(input) || !this.captures.has((input as any).id))
    ) {
      const pending = { frame, key, input, concurrency: "read-parallel" as const };
      this.settle(pending, this.denied(key, "capture_not_allowed", "Capture is not in the outer allowlist."));
      return;
    }
    if (this.counts.submitted > PROGRAM_LIMITS.totalCalls) {
      const pending = { frame, key, input, concurrency: "read-parallel" as const };
      this.settle(pending, this.denied(key, "call_limit", "Program call limit exceeded."));
      return;
    }
    if (this.queue.length + this.active + this.settled.size >= PROGRAM_LIMITS.pendingCalls) {
      const pending = { frame, key, input, concurrency: "read-parallel" as const };
      this.settle(pending, this.denied(key, "pending_limit", "Program pending-call limit exceeded."));
      return;
    }
    this.transferredBytes += Buffer.byteLength(frame.type === "call" ? frame.inputJson : frame.rangeJson, "utf8");
    if (this.transferredBytes > PROGRAM_LIMITS.transferBytes) {
      const pending = { frame, key, input, concurrency: "read-parallel" as const };
      this.settle(pending, this.denied(key, "transfer_limit", "Program transfer limit exceeded."));
      return;
    }
    const classification = this.runtime.classifyProgrammatic(key, input, this.scope);
    if ("outcome" in classification) {
      const pending = { frame, key, input, concurrency: "read-parallel" as const };
      this.settle(pending, classification.outcome);
      return;
    }
    this.queue.push({ frame, key, input, concurrency: classification.call.concurrency });
    this.drive();
  }

  private canAdmit(pending: Pending): boolean {
    if (this.controller.signal.aborted || this.admitting || this.exclusiveActive) return false;
    if (pending.concurrency === "exclusive")
      return this.active === 0 && this.settled.size === 0 && this.nextCommit === pending.frame.seq;
    return this.active < this.parallelReads;
  }

  private drive(): void {
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

  private launch(pending: Pending, call: PreparedCall): void {
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

  private abandonActive(reason: string): void {
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

  private settle(pending: Pending, outcome: CallOutcome): void {
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

  private scheduleFlush(): void {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    void this.enqueueLane(() => {
      this.flushScheduled = false;
      this.flush();
    });
  }

  private flush(): void {
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

  closeAdmission(): void {
    this.admissionClosed = true;
    while (this.queue.length) {
      const pending = this.queue.shift()!;
      this.settle(pending, this.denied(pending.key, "admission_closed", "Program admission is closed."));
    }
  }

  cancel(reason = "Program cancelled."): void {
    this.admissionClosed = true;
    if (!this.controller.signal.aborted) this.controller.abort(reason);
    while (this.queue.length) {
      const pending = this.queue.shift()!;
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

  private idle(): boolean {
    return (
      this.active === 0 &&
      !this.admitting &&
      this.queue.length === 0 &&
      this.settled.size === 0 &&
      this.lanePending === 0 &&
      !this.flushScheduled
    );
  }

  private wakeIdle(): void {
    if (!this.idle()) return;
    for (const resolve of this.idleWaiters.splice(0)) resolve();
  }

  async drain(): Promise<void> {
    if (this.idle()) return;
    await new Promise<void>((resolve) => this.idleWaiters.push(resolve));
  }
}
