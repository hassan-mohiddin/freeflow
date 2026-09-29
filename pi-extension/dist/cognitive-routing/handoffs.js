import { Sources } from "./sources.js";
import { canonical, requireCondition as check } from "./types.js";
/**
 * Finishes each routed turn and moves work between profiles: binds the finished response to its execution, completes
 * an accepted delegation or return by preparing and switching to the receiving profile, and resumes an outstanding
 * assignment after an interruption or crash (a technical resume, not a new delegation).
 */
export class Handoffs {
  session;
  pi;
  models;
  assembler;
  constructor(session, pi, models, assembler) {
    this.session = session;
    this.pi = pi;
    this.models = models;
    this.assembler = assembler;
  }
  /** The outstanding worker responsibility that no later user input has overtaken, if any. */
  resumableAssignment(state) {
    const assignment = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
    const reading = state.recoveryId !== undefined && state.recoveries.get(state.recoveryId)?.state === "reading";
    if (state.control !== "automatic" || !assignment || (assignment.state !== "outstanding" && !reading)) return;
    let worker;
    try {
      worker = this.session.assignedWorker(state, assignment.id);
    } catch {
      return;
    }
    const branch = this.session.store?.reader.getBranch() ?? [];
    const lastUser = branch.filter((e) => e.message?.role === "user").at(-1)?.id ?? null;
    return lastUser === this.session.workerBasis(state, assignment.id)
      ? { worker, assignmentId: assignment.id }
      : undefined;
  }
  /** A worker run cut off by a crash or reload leaves its execution opened but never bound. */
  interruptedRun(state) {
    const resumable = this.resumableAssignment(state);
    return (
      !!resumable &&
      state.profile === resumable.worker &&
      [...state.executions.values()].some(
        (x) =>
          !x.assistantEntryId &&
          !x.interrupted &&
          x.profile === resumable.worker &&
          x.assignmentId === resumable.assignmentId,
      )
    );
  }
  async resumeAfterCrash(ctx, token) {
    if (token !== this.session.token) return;
    try {
      check(!ctx.hasPendingMessages?.(), "pending_input", "Queued input needs Coordinator first.");
      await this.resume(ctx);
      ctx.ui?.notify?.("Cognitive Routing resumed the worker run that was interrupted.", "info");
    } catch (error) {
      ctx.ui?.notify?.(
        `Cognitive Routing could not resume the interrupted worker run automatically (${error instanceof Error ? error.message : String(error)}). Run /freeflow resume to retry.`,
        "warning",
      );
    }
  }
  messageEnd(message) {
    if (message?.role === "assistant" && this.session.turn && !this.session.turn.bound)
      this.session.turn.message = structuredClone(message);
  }
  async turnEnd(event, ctx) {
    this.session.ctx = ctx;
    if (!this.session.turn || this.session.turn.bound || !this.session.supported() || !this.session.store) return;
    if (!this.session.turn.opened) {
      this.session.turn = undefined;
      return;
    }
    const token = this.session.token,
      turn = this.session.turn;
    const subject = this.session.subject();
    try {
      const message = event.message ?? turn.message;
      const candidates = ctx.sessionManager
        .getBranch()
        .filter((e) => !turn.before.has(e.id) && e.type === "message" && canonical(e.message) === canonical(message));
      check(candidates.length === 1, "execution_binding_ambiguous");
      const assistant = candidates[0];
      const callIds = new Set((message?.content ?? []).filter((b) => b.type === "toolCall").map((b) => b.id));
      const results = ctx.sessionManager
        .getBranch()
        .filter((e) => !turn.before.has(e.id) && e.message?.role === "toolResult" && callIds.has(e.message.toolCallId));
      const outcome =
        message?.stopReason === "error" ? "failed" : message?.stopReason === "aborted" ? "aborted" : "completed";
      this.session.append(
        {
          type: "execution-bound",
          executionId: turn.id,
          assistantEntryId: assistant.id,
          resultEntryIds: results.map((e) => e.id),
          outcome,
        },
        JSON.stringify(["binding", turn.id]),
      );
      turn.bound = assistant.id;
      const state = this.session.stateData(),
        pending = state.pendingId ? state.handoffs.get(state.pendingId) : undefined;
      if (!pending || pending.state === "superseded") return;
      const attempt = state.attempts.get(pending.id);
      if (pending.executionId !== turn.id && attempt?.executionId !== turn.id) return;
      if (ctx.signal?.aborted || outcome === "aborted" || state.control !== "automatic") return;
      const inputs = [...this.session.messages, message, ...results.map((e) => e.message)].filter(Boolean);
      const latest = this.session.stateData();
      const retry = latest.attempts.get(pending.id);
      if (retry?.executionId === turn.id)
        check(
          retry.reportRevision === pending.reportRevision &&
            retry.selectionRevision === (latest.selections.get(pending.assignmentId)?.revision ?? 0),
          "stale_retry_revision",
        );
      await this.finishHandoff(pending, inputs, token);
    } catch (error) {
      if (this.session.current(subject)) {
        this.session.mark(error);
        ctx.abort?.();
      }
    }
  }
  async finishHandoff(h, inputs, token) {
    const subject = this.session.subject();
    const state = this.session.stateData();
    check(
      state.control === "automatic" && !this.session.store?.blocked && token === this.session.token,
      "transition_ineligible",
    );
    const execution = state.executions.get(h.executionId);
    check(
      execution?.assistantEntryId,
      "source_turn_incomplete",
      "Saved communication belongs to an incomplete historical turn. Reconcile its effects and replace or cancel the outstanding work; no tool result is fabricated.",
    );
    const source = new Sources(this.session.ctx.sessionManager.getBranch(), state);
    const carrier = source.byRef.get(`ctx:${execution.assistantEntryId}`);
    check(
      carrier && !source.exchange(carrier).problems.length,
      "source_exchange_incomplete",
      "The saved handoff has an incomplete native exchange; reconcile or explicitly dispose of it.",
    );
    let attentionProblems = [];
    if (["return", "recovery-return"].includes(h.kind) && this.session.projectionEnabled) {
      const prepared = this.assembler.prepared("coordinator", inputs, h.id);
      if (!prepared.ready) {
        const attentionFallback = h.kind === "recovery-return" && h.outcome !== "completed";
        this.session.projectionError = prepared.problems.map((p) => p.code).join(", ");
        if (attentionFallback) attentionProblems = prepared.problems;
        else {
          this.session.append({
            type: "handoff-state",
            handoffId: h.id,
            state: "blocked",
            reason: prepared.problems
              .map((p) => p.detail)
              .join("; ")
              .slice(0, 4096),
          });
          return;
        }
      } else {
        check(prepared.reservation, "reservation_missing");
        this.session.append({ type: "handoff-prepared", handoffId: h.id, reservation: prepared.reservation });
      }
    }
    try {
      const current = this.session.stateData();
      check(
        current.pendingId === h.id && current.control === "automatic" && token === this.session.token,
        "stale_handoff",
      );
      await this.models.applyPair(this.session.profilePair(h.to));
      this.session.guard(subject);
      this.session.append({
        type: "handoff-state",
        handoffId: h.id,
        state: "configured",
        observedPair: this.session.observed(),
      });
      const completed = this.session.stateData();
      const reservation = completed.reservations.get(h.id);
      const recovery =
        h.kind === "recovery-return"
          ? [...completed.recoveries.values()].find((candidate) => candidate.supplementHandoffId === h.id)
          : undefined;
      if (h.kind === "recovery-return" && recovery && completed.assessment?.view === "suspended") {
        if (attentionProblems.length) {
          this.session.append({
            type: "assessment-suspended",
            handoffId: recovery.assessmentHandoffId,
            reason: "delivery-gap",
            basisUserEntryId: this.assembler.lastDeliveredUser(this.session.sources(completed), inputs),
            problems: attentionProblems,
          });
        } else if (completed.assessment.suspensionReason === "recovery") {
          this.session.append({
            type: "assessment-resumed",
            handoffId: recovery.assessmentHandoffId,
            basisUserEntryId: this.assembler.lastDeliveredUser(this.session.sources(completed), inputs),
            ...(reservation ? { reservation } : {}),
          });
        }
      }
      if (h.kind === "return" && completed.assessment?.view === "suspended" && reservation) {
        this.session.append({
          type: "assessment-resumed",
          handoffId: h.id,
          basisUserEntryId: this.assembler.lastDeliveredUser(this.session.sources(completed), inputs),
          reservation,
        });
      }
      if (!attentionProblems.length) this.session.projectionError = undefined;
    } catch (error) {
      if (
        this.session.current(subject) &&
        !this.session.store?.blocked &&
        !this.session.error &&
        this.session.stateData().pendingId === h.id
      ) {
        this.session.append({
          type: "handoff-state",
          handoffId: h.id,
          state: "blocked",
          reason: error instanceof Error ? error.message.slice(0, 4096) : "configuration_failed",
        });
        this.session.ctx.ui?.notify?.(
          `Couldn’t switch to ${h.to.charAt(0).toUpperCase()}${h.to.slice(1)} — ${["return", "recovery-return"].includes(h.kind) ? "report" : "assignment"} saved.`,
          "warning",
        );
      } else throw error;
    }
  }
  async resume(ctx) {
    this.session.ctx = ctx;
    check(ctx.isIdle?.(), "not_idle");
    check(this.session.store && this.session.capability?.effective, "routing_unavailable");
    return this.session.enqueue(() => {
      this.session.revision++;
      return this.resumeCurrent(ctx, this.session.subject());
    });
  }
  async resumeCurrent(ctx, subject) {
    this.session.guard(subject);
    check(this.session.store, "routing_unavailable");
    await this.session.store.reconcile();
    this.session.guard(subject);
    this.session.error = undefined;
    this.session.retireUnbound(
      "Explicit resume retires an interrupted attempt without claiming its effects completed.",
    );
    const state = this.session.stateData();
    check(state.control === "automatic", "manual_control");
    check(
      !ctx.hasPendingMessages?.(),
      "pending_input",
      "Queued input must be delivered and reconciled before resuming a worker.",
    );
    const pending = state.pendingId ? state.handoffs.get(state.pendingId) : undefined;
    if (pending) {
      const source = ctx.sessionManager.buildSessionContext?.().messages;
      check(Array.isArray(source) || this.session.messages.length, "resume_context_unavailable");
      await this.finishHandoff(pending, source ?? this.session.messages, this.session.token);
      this.session.guard(subject);
      if (this.session.stateData().pendingId) {
        check(
          ["return", "recovery-return"].includes(pending.kind) && this.session.projectionError,
          "handoff_still_blocked",
          "Saved transfer is still blocked; reconcile its configuration before retrying.",
        );
        const worker = this.session.assignedWorker(this.session.stateData(), pending.assignmentId);
        await this.models.transition(
          this.session.profilePair(worker),
          () =>
            this.session.append({
              type: "control",
              control: "automatic",
              profile: worker,
              reason:
                "Explicit resume of saved-return evidence correction only; ordinary assignment work remains ended",
            }),
          subject,
        );
      }
    } else {
      const assignment = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
      const input = ctx.sessionManager.buildSessionContext?.().messages ?? this.session.messages;
      const user = this.assembler.lastDeliveredUser(new Sources(ctx.sessionManager.getBranch(), state), input);
      const coordinatorSawInput = [...state.executions.values()].some(
        (x) =>
          x.profile === "coordinator" && x.basisUserEntryId === user && x.assistantEntryId && x.outcome === "completed",
      );
      const recovery = state.recoveryId ? state.recoveries.get(state.recoveryId) : undefined;
      const worker = assignment ? this.session.assignedWorker(state, assignment.id) : undefined;
      if (assignment?.state === "returned" && recovery?.state === "reading") {
        check(
          user === this.session.workerBasis(state, assignment.id) || coordinatorSawInput,
          "input_unreconciled",
          "New input needs Coordinator attention before evidence recovery can resume.",
        );
        await this.models.transition(
          this.session.profilePair(worker),
          () =>
            this.session.append({
              type: "control",
              control: "automatic",
              profile: worker,
              reason: "Explicit user resume of unchanged evidence recovery; ordinary assignment work remains ended",
            }),
          subject,
        );
      } else if (assignment?.state === "outstanding") {
        check(
          user === this.session.taskBasis(state, assignment.id) || coordinatorSawInput,
          "input_unreconciled",
          "New input needs Coordinator attention before the unchanged assignment can resume.",
        );
        await this.models.transition(
          this.session.profilePair(worker),
          () => {
            this.session.append({ type: "assignment-resumed", assignmentId: assignment.id, basisUserEntryId: user });
            this.session.append({
              type: "control",
              control: "automatic",
              profile: worker,
              reason: "Explicit user resume of the unchanged assignment; current restrictions remain applicable",
            });
          },
          subject,
        );
      } else await this.models.applyPair(this.session.profilePair("coordinator"));
    }
    // Resume starts its run directly, so the resumed profile's model is applied here rather than at a prompt.
    await this.models.applyPending();
    this.session.guard(subject);
    this.pi.sendMessage(
      {
        customType: "freeflow-routing-v2-resume",
        content:
          "Explicit user resume of the saved routing responsibility. Recover the current contract and evidence before continuing.",
        display: true,
      },
      { triggerTurn: true },
    );
  }
}
