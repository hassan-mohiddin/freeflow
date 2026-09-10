import { randomUUID } from "node:crypto";
import { EventStore } from "../session-sources/events.js";
import { Sources, bodyHash } from "../session-sources/sources.js";
import { pairFromProfile } from "./config.js";
import { prepareView, changeSelection } from "./projection.js";
import { initialState } from "./state.js";
import {
  ROUTING_MESSAGE,
  PROFILES,
  RoutingError,
  canonical,
  emptySelection,
  requireCondition as check,
  samePair,
} from "./types.js";
export const ROUTING_TOOLS = ["freeflow_delegate", "freeflow_return", "freeflow_unit", "freeflow_project"];
const HANDOFF_TOOLS = new Set(["freeflow_delegate", "freeflow_return"]);
export class RoutingRuntime {
  pi;
  store;
  ctx;
  capability;
  token = randomUUID();
  turn;
  messages = [];
  error;
  projectionError;
  suppressed = false;
  applying;
  externalChange = false;
  targetSignature;
  operations = Promise.resolve();
  revision = 0;
  manualHold;
  automaticControl = false;
  sourceCache;
  constructor(pi) {
    this.pi = pi;
  }
  subject() {
    const branch = this.store?.reader.getBranch() ?? [];
    return {
      token: this.token,
      revision: this.revision,
      store: this.store,
      leafId: branch.at(-1)?.id ?? null,
      userId: branch.filter((e) => e.message?.role === "user").at(-1)?.id ?? null,
    };
  }
  current(s) {
    if (s.token !== this.token || s.revision !== this.revision || s.store !== this.store) return false;
    const branch = this.store?.reader.getBranch() ?? [];
    return (
      (!s.leafId || branch.some((e) => e.id === s.leafId)) &&
      (branch.filter((e) => e.message?.role === "user").at(-1)?.id ?? null) === s.userId
    );
  }
  guard(s) {
    check(
      this.current(s),
      "stale_operation",
      "Routing state changed while the operation was waiting; no further effects applied.",
    );
  }
  taskBasis(state, assignmentId) {
    return state.resumeBasis.has(assignmentId)
      ? state.resumeBasis.get(assignmentId)
      : state.assignments.get(assignmentId)?.basisUserEntryId;
  }
  retireUnbound(reason) {
    for (const execution of this.stateData().executions.values()) {
      if (!execution.assistantEntryId && !execution.interrupted)
        this.append({ type: "execution-interrupted", executionId: execution.id, reason });
    }
    this.turn = undefined;
  }
  openTurn() {
    if (!this.turn || this.turn.opened) return;
    const t = this.turn;
    this.append({
      type: "execution-opened",
      execution: {
        id: t.id,
        profile: t.profile,
        assignmentId: t.assignmentId,
        basisUserEntryId: t.basisUserEntryId,
        pair: t.pair,
        resultEntryIds: [],
      },
    });
    t.opened = true;
  }
  async settled(ctx) {
    if (!this.store || !this.supported() || this.store.blocked || !ctx.isIdle?.()) return;
    this.ctx = ctx;
    this.retireUnbound("Native run settled without a complete source binding; prior effects remain unresolved.");
  }
  async beforeRun(ctx) {
    this.ctx = ctx;
    if (!this.store || !this.supported() || this.store.blocked || this.error) return;
    if (this.stateData().control === "automatic" && this.stateData().profile === "executor") {
      const result = await this.control("coordinator", false);
      check(result.status !== "blocked", "reconciliation_required", result.reason);
    }
  }
  stateData() {
    return this.store?.state() ?? initialState();
  }
  sources(state = this.stateData()) {
    const entries = this.ctx.sessionManager
      .getBranch()
      .filter((e) => ["message", "custom_message", "compaction", "branch_summary"].includes(e.type));
    const cache = this.sourceCache;
    if (
      cache &&
      cache.authors === state.authors.size &&
      entries.length === cache.entries.length &&
      entries.every((e, i) => e === cache.entries[i])
    )
      return cache.source;
    const active = this.ctx.sessionManager.buildContextEntries?.();
    const activeIds = active ? new Set(active.map((e) => e.id)) : undefined;
    const source = cache?.source ?? new Sources([], state);
    source.refresh(entries, state, activeIds);
    this.sourceCache = { entries, authors: state.authors.size, source };
    return source;
  }
  observed(ctx = this.ctx) {
    return ctx?.model?.provider && ctx?.model?.id && ctx?.thinkingLevel
      ? { provider: ctx.model.provider, modelId: ctx.model.id, thinking: ctx.thinkingLevel }
      : undefined;
  }
  supported() {
    return !!this.capability?.effective && !this.suppressed;
  }
  state() {
    let state;
    try {
      state = this.stateData();
    } catch {
      state = initialState();
    }
    const blocked = this.error ?? this.store?.blocked;
    return {
      effective: this.supported() && state.control !== "inactive" && !blocked,
      activeProfile: state.profile,
      controlMode: state.control === "manual" ? `manual-${state.profile}` : state.control,
      runtimeStatus: blocked ? "blocked" : this.supported() && state.control !== "inactive" ? "active" : "inactive",
      runtimeReason: blocked ?? (this.suppressed ? "startup_selection" : this.capability?.blockingReason.message),
      projectionFailure: this.projectionError,
    };
  }
  get projectionEnabled() {
    return this.supported() && this.capability?.projection === true && this.stateData().control === "automatic";
  }
  append(data, op, step) {
    check(this.store, "routing_unavailable");
    return this.store.append(this.store.make(data, op, step));
  }
  enqueue(action) {
    const token = this.token;
    const result = this.operations.then(() => {
      check(token === this.token, "stale_instance");
      return action();
    });
    this.operations = result.catch(() => {});
    return result;
  }
  mark(error) {
    if (this.error && error instanceof RoutingError && error.code === "routing_blocked") return;
    this.error =
      error instanceof RoutingError
        ? `${error.code}: ${error.message}`
        : error instanceof Error
          ? error.message
          : String(error);
  }
  assertAvailable(profile) {
    check(
      this.supported() && this.store && !this.error && !this.store.blocked,
      "routing_unavailable",
      this.error ?? this.store?.blocked ?? "Routing is inactive.",
    );
    const state = this.stateData();
    check(state.control === "automatic", "manual_control");
    if (profile) check(state.profile === profile && this.turn?.profile === profile, "wrong_profile");
    if (state.profile) check(samePair(this.observed(), this.profilePair(state.profile)), "configuration_mismatch");
  }
  profilePair(profile) {
    const configured = this.capability?.profiles[profile];
    check(configured, "profile_missing");
    return pairFromProfile(configured);
  }
  model(profile) {
    const pair = this.profilePair(profile);
    const model = this.ctx?.modelRegistry?.find(pair.provider, pair.modelId);
    check(model, "profile_unavailable");
    return model;
  }
  async bind(ctx, capability, startup = false) {
    this.token = randomUUID();
    this.ctx = ctx;
    this.capability = capability;
    this.turn = undefined;
    this.messages = [];
    this.sourceCache = undefined;
    this.applying = undefined;
    this.externalChange = false;
    this.error = undefined;
    this.projectionError = undefined;
    this.operations = Promise.resolve();
    this.targetSignature = canonical(capability.profiles);
    this.suppressed = startup && process.argv.some((a) => /^(--model|--thinking)(=|$)/.test(a));
    this.store = new EventStore(this.pi, ctx.sessionManager);
    const subject = this.subject();
    if (!capability.effective || this.suppressed) return;
    try {
      await this.store.reconcile();
      this.guard(subject);
      const state = this.stateData();
      this.manualHold = state.control === "manual" ? state.profile : undefined;
      this.automaticControl = !state.events.size || state.control === "automatic";
      this.retireUnbound("Session rebind found an unfinished execution; no task effects replayed.");
      if (!state.events.size) {
        this.append({
          type: "control",
          control: "automatic",
          profile: "coordinator",
          reason: "Initial routing activation",
        });
        await this.applyPair(this.profilePair("coordinator"));
      } else if (
        state.control === "automatic" &&
        state.profile &&
        !samePair(this.observed(), this.profilePair(state.profile))
      ) {
        // Reload reconstructs responsibility; it does not silently reapply the last setter.
        this.append({
          type: "control",
          control: "automatic",
          profile: "coordinator",
          reason: "Rebind reconciles historical responsibility with current host control",
        });
        await this.applyPair(this.profilePair("coordinator"));
      }
    } catch (error) {
      if (this.current(subject)) this.mark(error);
    }
  }
  unbind() {
    this.token = randomUUID();
    this.store = undefined;
    this.turn = undefined;
    this.messages = [];
    this.ctx = undefined;
    this.sourceCache = undefined;
  }
  async refresh(ctx, capability) {
    this.ctx = ctx;
    const was = this.capability?.effective === true;
    const signature = canonical(capability.profiles);
    if (this.capability && (was !== capability.effective || signature !== this.targetSignature)) this.revision++;
    this.capability = capability;
    if (!capability.effective) {
      this.turn = undefined;
      return;
    }
    if (!this.store) {
      await this.bind(ctx, capability);
      return;
    }
    if (!was) {
      const subject = this.subject();
      this.suppressed = false;
      try {
        await this.store.reconcile();
        this.guard(subject);
        this.error = undefined;
        this.append({
          type: "control",
          control: "automatic",
          profile: "coordinator",
          reason: "Capability re-enabled; Coordinator reconciliation",
        });
        this.automaticControl = true;
        await this.applyPair(this.profilePair("coordinator"));
      } catch (error) {
        if (this.current(subject)) this.mark(error);
      }
    } else if (this.targetSignature && signature !== this.targetSignature) {
      this.error = "configuration_changed: reconcile profile configuration before automatic execution";
    }
    if (canonical(this.capability?.profiles) === signature) this.targetSignature = signature;
  }
  async ancestryChanged(ctx, navigation = true) {
    this.revision++;
    this.ctx = ctx;
    this.turn = undefined;
    this.messages = [];
    this.sourceCache = undefined;
    if (!this.store || !this.supported()) return;
    const subject = this.subject();
    try {
      await this.store.reconcile();
      this.guard(subject);
      this.error = undefined;
      this.retireUnbound("Selected historical ancestry ends before execution binding; effects are not replayed.");
      const state = this.stateData();
      if (this.manualHold) {
        this.append({
          type: "control",
          control: "manual",
          profile: this.manualHold,
          reason: "Current explicit manual hold survives navigation",
        });
      } else if (
        (this.automaticControl || !state.events.size) &&
        (navigation || !samePair(this.observed(), this.profilePair(state.profile ?? "coordinator")))
      ) {
        this.append({
          type: "control",
          control: "automatic",
          profile: "coordinator",
          reason: "Coordinator reconciles selected native ancestry",
        });
        await this.applyPair(this.profilePair("coordinator"));
      }
    } catch (error) {
      if (this.current(subject)) this.mark(error);
    }
  }
  async nativeChange(ctx) {
    this.ctx = ctx;
    if (!this.supported() || !this.store) return;
    if (this.applying) {
      if (ctx.model?.provider !== this.applying.provider || ctx.model?.id !== this.applying.modelId) {
        this.externalChange = true;
        this.revision++;
      }
      return; // Never await a queue already held by our setter.
    }
    const state = this.stateData();
    if (state.control !== "automatic" || !state.profile || samePair(this.observed(), this.profilePair(state.profile)))
      return;
    try {
      this.revision++;
      this.manualHold = undefined;
      this.automaticControl = false;
      this.append({ type: "control", control: "inactive", reason: "External native model/effort change" });
    } catch (error) {
      this.mark(error);
    }
  }
  async applyPair(target) {
    const subject = this.subject(),
      token = this.token,
      prior = this.observed();
    if (samePair(prior, target)) return;
    const model = this.ctx.modelRegistry.find(target.provider, target.modelId);
    check(model, "profile_unavailable");
    const auth = await this.ctx.modelRegistry.getApiKeyAndHeaders(model);
    this.guard(subject);
    check(auth?.ok, "profile_unauthenticated");
    this.applying = target;
    let ownedPair = target;
    this.externalChange = false;
    try {
      check(await this.pi.setModel(model), "model_rejected");
      this.guard(subject);
      this.pi.setThinkingLevel(target.thinking);
      check(!this.externalChange && samePair(this.observed(), target), "configuration_mismatch");
    } catch (error) {
      if (this.current(subject) && prior && !this.externalChange) {
        const old = this.ctx.modelRegistry.find(prior.provider, prior.modelId);
        try {
          this.applying = prior;
          ownedPair = prior;
          check(old && (await this.pi.setModel(old)), "rollback_failed");
          this.guard(subject);
          this.pi.setThinkingLevel(prior.thinking);
          check(samePair(this.observed(), prior), "rollback_failed");
        } catch {
          if (this.current(subject)) this.error = "configuration_unknown: rollback could not be observed";
        }
      }
      throw error;
    } finally {
      if (token === this.token && this.applying === ownedPair) this.applying = undefined;
    }
  }
  async control(profile, manual) {
    this.revision++;
    const subject = this.subject();
    return this.enqueue(async () => {
      try {
        check(this.capability?.effective && this.store, "routing_unavailable");
        await this.store.reconcile();
        this.guard(subject);
        this.error = undefined;
        this.suppressed = false;
        const previous = this.stateData();
        if (
          previous.control === (manual ? "manual" : "automatic") &&
          previous.profile === profile &&
          samePair(this.observed(), this.profilePair(profile))
        ) {
          this.manualHold = manual ? profile : undefined;
          this.automaticControl = !manual;
          return { status: manual ? "active" : "automatic" };
        }
        this.append({
          type: "control",
          control: manual ? "manual" : "automatic",
          profile,
          reason: manual ? "Explicit user manual hold" : "Explicit user automatic release/reconciliation",
        });
        try {
          await this.applyPair(this.profilePair(profile));
          this.guard(subject);
        } catch (error) {
          if (this.current(subject) && !this.error && !this.store.blocked)
            this.append({
              type: "control",
              control: previous.control,
              profile: previous.profile,
              reason: "Control request failed; prior control retained",
            });
          throw error;
        }
        this.manualHold = manual ? profile : undefined;
        this.automaticControl = !manual;
        return { status: manual ? "active" : "automatic" };
      } catch (error) {
        if (this.current(subject)) this.mark(error);
        return { status: "blocked", reason: error instanceof Error ? error.message : String(error) };
      }
    });
  }
  setManualProfile(profile, _mechanism) {
    return this.control(profile, true);
  }
  setAutomaticControl(_mechanism) {
    return this.control("coordinator", false);
  }
  lastDeliveredUser(sources, messages) {
    const users = sources.associate(messages).filter((x) => x.source?.message.role === "user");
    return users.at(-1)?.source?.entry.id ?? null;
  }
  runtimeMessage(state, attention = false) {
    const a = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
    const h = state.pendingId
      ? state.handoffs.get(state.pendingId)
      : state.assessment
        ? state.handoffs.get(state.assessment.handoffId)
        : undefined;
    const selection = a ? (state.selections.get(a.id) ?? emptySelection()) : emptySelection();
    const content = [
      "# Cognitive Routing Runtime State",
      `Control: ${state.control}`,
      `Profile: ${state.profile ?? "unresolved"}`,
      `Unit: ${state.unitId ?? "none"}`,
      `Assignment: ${a ? `${a.id} (${a.state})` : "none"}`,
      `Handoff: ${h ? `${h.id} (${h.kind}, ${h.state})` : "none"}`,
      `Projection: ${this.projectionEnabled ? "enabled" : "bypassed"}`,
      state.assessment ? `Assessment: ${state.assessment.view}; evidence revision ${selection.revision}` : "",
      `Mechanical evidence facts (not semantic acceptance): ${JSON.stringify(this.evidenceFacts(state))}`,
      this.error ? `Blocked: ${this.error}` : "",
      this.projectionError ? `Evidence limitation: ${this.projectionError}` : "",
      attention
        ? `Saved report/evidence suspended for attention. ${selection.selected.length} sources remain selected. Use freeflow_unit assess to restore the assessment.`
        : "",
      ...(attention
        ? []
        : [
            a ? `\nCurrent exact assignment:\n${a.contract}` : "",
            h?.kind === "return"
              ? `\nSaved report (revision ${h.reportRevision}, ${h.outcome}):\n${h.text}\nLimitations: ${h.limitations.join("; ")}`
              : "",
          ]),
      a?.state === "returned"
        ? "Executor ordinary task work has ended. Only supported handoff correction is permitted."
        : "",
      this.turn?.profile === "executor" && a && this.turn.basisUserEntryId !== this.taskBasis(state, a.id)
        ? "Current input differs from the original assignment. Account for it; changed direction requires Coordinator attention."
        : "",
      ...(state.assessment?.problems ?? []).map((p) => `${p.code}: ${p.detail}`),
    ]
      .filter(Boolean)
      .join("\n");
    return {
      role: "custom",
      customType: ROUTING_MESSAGE,
      content,
      display: false,
      timestamp: 0,
      details: { routingInstance: this.token },
    };
  }
  evidenceFacts(state) {
    const selection = state.assignmentId
      ? (state.selections.get(state.assignmentId) ?? emptySelection())
      : emptySelection();
    return {
      revision: selection.revision,
      selected: selection.selected.map((ref) => {
        const entry = this.ctx?.sessionManager.getEntry?.(ref.slice(4));
        return { ref, kind: entry?.message?.role ?? "unknown", toolName: entry?.message?.toolName };
      }),
      unresolved: selection.unresolved,
      withdrawals: selection.withdrawals,
      preparedRevision: state.assessment?.reservation?.selectionRevision,
      limitations: state.assessment?.problems ?? [],
    };
  }
  prepared(profile, input, handoffId, restoring = false) {
    const state = this.stateData(),
      model = this.model(profile);
    return prepareView({
      messages: input,
      sources: this.sources(state),
      state,
      view: profile,
      projection: this.projectionEnabled,
      model,
      pair: this.profilePair(profile),
      systemPrompt: this.ctx.getSystemPrompt?.() ?? "",
      tools: (this.pi.getAllTools?.() ?? []).filter((tool) => this.pi.getActiveTools?.().includes(tool.name)),
      runtimeMessage: this.runtimeMessage(
        state,
        profile === "coordinator" && state.assessment?.view === "suspended" && !restoring && !handoffId,
      ),
      instance: this.token,
      preparingReturn: handoffId,
      restoring,
    });
  }
  async context(ctx, incoming) {
    this.ctx = ctx;
    const input = incoming.filter(
      (m) =>
        !(
          m?.details?.routingInstance === this.token &&
          [ROUTING_MESSAGE, "freeflow-routing-v2-refs"].includes(m.customType)
        ),
    );
    this.messages = input;
    if (!this.supported() || !this.store) return input;
    try {
      const state = this.stateData();
      if (state.control !== "automatic") return input;
      check(!this.error && !this.store.blocked && state.profile, "routing_blocked", this.error ?? this.store.blocked);
      check(samePair(this.observed(), this.profilePair(state.profile)), "prepared_pair_mismatch");
      const sources = this.sources(state),
        user = this.lastDeliveredUser(sources, input);
      if (state.assessment && user && user !== state.assessment.basisUserEntryId)
        this.append(
          {
            type: "assessment-suspended",
            handoffId: state.assessment.handoffId,
            reason: "user-attention",
            basisUserEntryId: user,
            problems: [],
          },
          JSON.stringify(["attention", state.assessment.handoffId, user]),
        );
      // New input reaching an already prepared Executor request cannot be rerouted by changing only the live model.
      const outstanding = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
      const interrupted =
        state.profile === "executor" && user !== (outstanding ? this.taskBasis(state, outstanding.id) : undefined);
      if (!this.turn || this.turn.bound) {
        const execution = {
          id: randomUUID(),
          profile: state.profile,
          assignmentId: state.assignmentId,
          basisUserEntryId: user,
          pair: this.observed(),
          resultEntryIds: [],
        };
        const before = new Set(ctx.sessionManager.getBranch().map((e) => e.id));
        this.turn = {
          id: execution.id,
          profile: execution.profile,
          assignmentId: execution.assignmentId,
          basisUserEntryId: user,
          before,
          pair: execution.pair,
        };
        if (state.unitId || state.profile === "executor") this.openTurn();
      }
      let prepared = this.prepared(state.profile, input);
      if (!prepared.ready && state.profile === "coordinator" && this.stateData().assessment) {
        const assessment = this.stateData().assessment;
        this.append({
          type: "assessment-suspended",
          handoffId: assessment.handoffId,
          reason: "delivery-gap",
          basisUserEntryId: user,
          problems: prepared.problems,
        });
        this.projectionError = prepared.problems.map((p) => p.code).join(", ");
        prepared = this.prepared("coordinator", input);
      }
      check(prepared.ready, "context_unavailable", prepared.problems.map((p) => p.detail).join("; "));
      const known = this.stateData().exposure;
      const added = prepared.fullSources.filter((s) => known.get(s.ref) !== s.hash);
      if (this.turn.profile === "executor")
        for (let i = 0; i < added.length; i += 128)
          this.append({
            type: "sources-exposed",
            executionId: this.turn.id,
            view: "executor",
            sources: added.slice(i, i + 128).map((s) => ({ ref: s.ref, bodyHash: s.hash })),
          });
      if (interrupted)
        prepared.messages.push({
          role: "custom",
          customType: ROUTING_MESSAGE,
          display: false,
          timestamp: 0,
          details: { routingInstance: this.token },
          content:
            "New delivered user input requires Coordinator attention. Do not run ordinary task tools; return the current partial result.",
        });
      return prepared.messages;
    } catch (error) {
      this.mark(error);
      ctx.abort?.();
      // Do not send an accidental full Executor history on a projection failure.
      return [
        {
          role: "custom",
          customType: ROUTING_MESSAGE,
          content: `Automatic request blocked: ${this.error}`,
          display: false,
          timestamp: 0,
          details: { routingInstance: this.token },
        },
      ];
    }
  }
  messageEnd(message) {
    if (message?.role === "assistant" && this.turn && !this.turn.bound) this.turn.message = structuredClone(message);
  }
  batch(callId, name) {
    check(this.turn?.message, "batch_unavailable");
    const matches = this.ctx.sessionManager
      .getBranch()
      .filter(
        (e) =>
          !this.turn.before.has(e.id) &&
          e.type === "message" &&
          e.message?.role === "assistant" &&
          e.message.content?.some((b) => b.type === "toolCall" && b.id === callId),
      );
    check(matches.length === 1, "batch_source_changed");
    const fingerprint = bodyHash(matches[0].message);
    check(!this.turn.sourceFingerprint || this.turn.sourceFingerprint === fingerprint, "batch_source_changed");
    // Later message_end handlers may legitimately replace the message. The first
    // preflight freezes the actually persisted batch before any of its tools act.
    this.turn.sourceFingerprint = fingerprint;
    this.turn.message = structuredClone(matches[0].message);
    const calls = (this.turn.message.content ?? []).filter((b) => b.type === "toolCall");
    const handoffs = calls.filter((b) => HANDOFF_TOOLS.has(b.name));
    check(
      !handoffs.length ||
        (handoffs.length === 1 &&
          HANDOFF_TOOLS.has(calls.at(-1)?.name) &&
          calls.every(
            (b) => HANDOFF_TOOLS.has(b.name) || b.name === "freeflow_project" || b.name === "freeflow_context",
          )),
      "invalid_handoff_batch",
      "A handoff must be last and cannot accompany ordinary task tools.",
    );
    check(
      calls.some((b) => b.id === callId && b.name === name),
      "call_not_in_batch",
    );
  }
  preflight(event, ctx) {
    this.ctx = ctx;
    const name = event.toolName,
      isRouting = ROUTING_TOOLS.includes(name);
    if (!this.supported()) return isRouting ? { block: true, reason: "Routing is unavailable." } : undefined;
    try {
      const state = this.stateData();
      if (state.control === "manual")
        return isRouting && name !== "freeflow_unit" ? { block: true, reason: "Manual control is active." } : undefined;
      if (state.control !== "automatic")
        return isRouting ? { block: true, reason: "Automatic routing is inactive." } : undefined;
      this.batch(event.toolCallId, name);
      check(!this.error && !this.store?.blocked, "routing_blocked");
      this.openTurn();
      if (this.turn?.profile === "executor" && !isRouting && name !== "freeflow_context") {
        const a = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
        check(
          a?.state === "outstanding" &&
            this.turn.basisUserEntryId === this.taskBasis(state, a.id) &&
            state.profile === "executor",
          "executor_task_phase_ended",
        );
      }
      return undefined;
    } catch (error) {
      return { block: true, reason: error instanceof Error ? error.message : String(error) };
    }
  }
  callOperation(callId, name) {
    check(this.turn && this.store, "execution_missing");
    this.batch(callId, name);
    return JSON.stringify([this.store.reader.getSessionId(), this.turn.id, callId, name]);
  }
  result(value) {
    return { content: [{ type: "text", text: JSON.stringify(value) }], details: value };
  }
  async invoke(name, callId, input, signal, ctx) {
    return this.enqueue(async () => {
      this.ctx = ctx;
      try {
        check(!signal?.aborted, "cancelled");
        if (name === "freeflow_unit" && ["status", "history"].includes(input.operation))
          return this.result(this.status(input.operation === "history" ? (input.limit ?? 20) : 0));
        this.assertAvailable(name === "freeflow_delegate" || name === "freeflow_unit" ? "coordinator" : "executor");
        const op = this.callOperation(callId, name);
        if (name === "freeflow_delegate") return this.result(this.delegate(input, callId, op));
        if (name === "freeflow_return") return this.result(this.returnReport(input, callId, op));
        if (name === "freeflow_project") return this.result(this.project(input, op));
        if (name === "freeflow_unit") return this.result(this.unit(input, op));
        throw new RoutingError("unknown_tool", name);
      } catch (error) {
        return this.result({
          status: "blocked",
          code: error instanceof RoutingError ? error.code : "operation_failed",
          message: error instanceof Error ? error.message : String(error),
          problems: error instanceof RoutingError ? error.problems : [],
          observed: this.observed(),
          expectedProfile: name === "freeflow_delegate" || name === "freeflow_unit" ? "coordinator" : "executor",
          recoveryAction:
            "Preserve saved work. Inspect freeflow_unit status; reconcile current input/control before retrying the named operation.",
        });
      }
    });
  }
  duplicate(op) {
    return [...this.stateData().events.values()].find(
      (e) =>
        e.operationId === op &&
        ["delegate-accepted", "return-accepted", "handoff-retry-requested"].includes(e.data.type),
    );
  }
  delegate(input, callId, op) {
    const prior = this.duplicate(op);
    if (prior) {
      check(
        prior.data.type === "delegate-accepted" && prior.data.assignment.contract === input.contract,
        "operation_conflict",
      );
      return { status: "accepted", handoff: prior.data.handoff.id, unchanged: true };
    }
    const state = this.stateData();
    const unit = state.unitId
      ? state.units.get(state.unitId)
      : { id: randomUUID(), objective: input.contract, state: "open", assignmentIds: [] };
    const old = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
    if (input.operation === "replace") check(old?.state === "outstanding" && !this.applying, "no_quiescent_assignment");
    else
      check(input.operation === "assign" && old?.state !== "outstanding" && !state.pendingId, "assignment_outstanding");
    const assignmentId = randomUUID(),
      id = randomUUID();
    const assignment = {
      id: assignmentId,
      unitId: unit.id,
      contract: input.contract,
      state: "outstanding",
      delegateHandoffId: id,
      basisUserEntryId: this.turn.basisUserEntryId,
    };
    const h = {
      id,
      kind: "delegate",
      assignmentId,
      text: input.contract,
      from: "coordinator",
      to: "executor",
      executionId: this.turn.id,
      toolCallId: callId,
      basisUserEntryId: this.turn.basisUserEntryId,
      state: "pending",
      reportRevision: 0,
      limitations: [],
    };
    this.append(
      {
        type: "delegate-accepted",
        unit: { ...unit, assignmentIds: [...unit.assignmentIds, assignmentId] },
        assignment,
        handoff: h,
        ...(input.operation === "replace"
          ? {
              replacement: {
                assignmentId: old.id,
                reason: input.reason,
                ...(state.pendingId ? { supersededHandoffId: state.pendingId } : {}),
              },
            }
          : {}),
      },
      op,
    );
    return {
      status: "accepted",
      unit: unit.id,
      assignment: assignmentId,
      handoff: id,
      transition: "pending",
      contract: input.contract,
      reason: input.reason,
      createdUnit: !state.unitId,
      ...(old && input.operation === "replace"
        ? {
            replacedAssignment: old.id,
            continuity:
              "Prior effects and evidence remain on native history. Reconcile uncertain effects before dependent work.",
          }
        : {}),
    };
  }
  returnReport(input, callId, op) {
    const state = this.stateData(),
      a = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
    check(a, "assignment_missing");
    const saved = a.returnHandoffId ? state.handoffs.get(a.returnHandoffId) : undefined;
    const selection = state.selections.get(a.id) ?? emptySelection();
    const duplicate = this.duplicate(op);
    if (duplicate) {
      if (input.operation === "retry") check(duplicate.data.type === "handoff-retry-requested", "operation_conflict");
      else
        check(
          duplicate.data.type === "return-accepted" &&
            duplicate.data.handoff.text === input.report &&
            duplicate.data.handoff.outcome === input.outcome &&
            canonical(duplicate.data.handoff.limitations) === canonical(input.limitations ?? []),
          "operation_conflict",
        );
      return {
        status: "accepted",
        reportSaved: true,
        unchanged: true,
        handoff: duplicate.data.handoffId ?? duplicate.data.handoff.id,
      };
    }
    if (input.operation === "retry") {
      check(saved && ["blocked", "pending"].includes(saved.state), "saved_return_missing");
      this.append(
        {
          type: "handoff-retry-requested",
          handoffId: saved.id,
          attemptId: randomUUID(),
          executionId: this.turn.id,
          toolCallId: callId,
          reportRevision: saved.reportRevision,
          selectionRevision: selection.revision,
        },
        op,
      );
      return { ...this.returnReadiness(saved.id), reportUnchanged: true };
    }
    check(input.operation === "submit", "invalid_return_operation");
    check(
      a.state === "outstanding" || (a.state === "returned" && saved && ["pending", "blocked"].includes(saved.state)),
      "assignment_task_ended",
    );
    const h = {
      id: saved?.id ?? randomUUID(),
      kind: "return",
      assignmentId: a.id,
      text: input.report,
      from: "executor",
      to: "coordinator",
      executionId: this.turn.id,
      toolCallId: callId,
      basisUserEntryId: this.turn.basisUserEntryId,
      state: "pending",
      reportRevision: (saved?.reportRevision ?? 0) + 1,
      outcome: input.outcome,
      limitations: input.limitations ?? [],
    };
    this.append({ type: "return-accepted", handoff: h }, op);
    return this.returnReadiness(h.id);
  }
  returnReadiness(id) {
    const h = this.stateData().handoffs.get(id);
    const prepared = this.prepared("coordinator", this.messages, id);
    return {
      status: "accepted",
      reportSaved: true,
      handoff: id,
      reportRevision: h.reportRevision,
      ready: prepared.ready,
      transition: prepared.ready ? "pending" : "blocked",
      problems: prepared.problems,
      stage: "completed-input preparation",
      finalExchangePending: true,
      provisional:
        "The finalized handoff exchange, target configuration and budget are revalidated at turn_end; this is not delivery evidence.",
      report: h.text,
      evidence: this.evidenceFacts(this.stateData()),
    };
  }
  project(input, op) {
    check(this.projectionEnabled, "projection_disabled");
    const state = this.stateData(),
      a = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
    check(a, "assignment_missing");
    const sources = this.sources(state);
    sources.associate(this.messages);
    const selection = state.selections.get(a.id) ?? emptySelection();
    if (input.operation === "list") {
      const scope = input.scope ?? "assignment";
      const offset = input.cursor === undefined ? 0 : Number(input.cursor);
      check(Number.isSafeInteger(offset) && offset >= 0, "invalid_cursor");
      const items = [...sources.byRef.values()]
        .filter(
          (s) =>
            s.producer === "executor" &&
            (scope === "assignment" ? s.assignmentId === a.id : s.active) &&
            (s.message.role === "toolResult" || s.message.content?.some((b) => b.type === "text" && b.text?.trim())),
        )
        .map((s) => ({
          ref: s.ref,
          kind: s.message.role,
          toolName: s.message.toolName,
          active: s.active,
          eligible: !sources.eligible(s.ref, state),
        }));
      return {
        status: "listed",
        scope,
        offset,
        count: items.length,
        selectableCount: items.filter((item) => item.eligible).length,
        otherAssignments: [...sources.byRef.values()].filter(
          (s) => s.producer === "executor" && s.assignmentId !== a.id,
        ).length,
        items: items.slice(offset, offset + 30),
        nextCursor: offset + 30 < items.length ? String(offset + 30) : undefined,
      };
    }
    let next = selection;
    if (input.operation !== "inspect") {
      check(["add", "remove"].includes(input.operation), "invalid_projection_operation");
      next = changeSelection(selection, input, sources, state);
      this.append({ type: "selection-changed", assignmentId: a.id, selection: next }, op);
    }
    const prepared = this.prepared("coordinator", this.messages, a.returnHandoffId);
    return {
      status: input.operation === "inspect" ? "unchanged" : "saved",
      revision: next.revision,
      selected: next.selected,
      unresolved: next.unresolved,
      ready: !next.unresolved.length && prepared.ready,
      problems: prepared.problems,
      evidence: this.evidenceFacts(this.stateData()),
      items: (input.refs ? [...new Set(input.refs)] : []).map((ref) => ({
        ref,
        status: next.unresolved.some((p) => p.ref === ref)
          ? "rejected"
          : input.operation === "remove"
            ? selection.selected.includes(ref)
              ? "removed"
              : selection.unresolved.some((p) => p.ref === ref)
                ? "withdrawn"
                : "unchanged"
            : selection.selected.includes(ref)
              ? "already_selected"
              : "added",
      })),
      estimate: { tokens: prepared.estimatedTokens, method: prepared.estimateMethod },
    };
  }
  unit(input, op) {
    const state = this.stateData();
    const prior = [...state.events.values()].find((e) => e.operationId === op);
    if (prior) {
      check(
        (input.operation === "assess" && prior.data.type === "assessment-resumed") ||
          (input.operation === "close" &&
            prior.data.type === "unit-closed" &&
            prior.data.outcome === input.outcome &&
            prior.data.assessment === input.assessment),
        "operation_conflict",
      );
      return { status: "unchanged", operation: input.operation };
    }
    if (input.operation === "assess") {
      check(state.assessment, "assessment_missing");
      if (state.assessment.view === "active") return { status: "unchanged", ready: true };
      const prepared = this.prepared("coordinator", this.messages, state.assessment.handoffId, true);
      if (!prepared.ready) return { status: "suspended", ready: false, problems: prepared.problems };
      check(prepared.reservation, "reservation_missing");
      this.append(
        {
          type: "assessment-resumed",
          handoffId: state.assessment.handoffId,
          basisUserEntryId: this.turn.basisUserEntryId,
          reservation: prepared.reservation,
        },
        op,
      );
      this.projectionError = undefined;
      return {
        status: "resumed",
        ready: true,
        stage: "prepared assessment; next request revalidated",
        evidence: this.evidenceFacts(this.stateData()),
      };
    }
    check(input.operation === "close" && state.unitId, "unit_missing");
    const a = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
    check(!this.applying, "not_quiescent");
    this.append(
      {
        type: "unit-closed",
        unitId: state.unitId,
        outcome: input.outcome,
        assessment: input.assessment,
        ...(a?.state === "outstanding" && input.outcome !== "accepted" ? { supersededAssignmentId: a.id } : {}),
      },
      op,
    );
    return { status: "closed", unit: state.unitId, outcome: input.outcome, assessment: input.assessment };
  }
  status(limit = 0) {
    const state = this.stateData();
    const unit = state.unitId ? state.units.get(state.unitId) : undefined;
    const a = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
    return {
      ...this.state(),
      unit: unit ? { id: unit.id, state: unit.state, assignments: unit.assignmentIds.length } : null,
      assignment: a ? { id: a.id, state: a.state } : null,
      pendingHandoff: state.pendingId ?? null,
      assessment: state.assessment
        ? { handoffId: state.assessment.handoffId, view: state.assessment.view, problems: state.assessment.problems }
        : null,
      ...(limit
        ? {
            history: [...state.events.values()]
              .slice(-Math.min(100, Math.max(1, limit)))
              .map((e) => ({ event: e.eventId, type: e.data.type, operation: e.operationId })),
          }
        : {}),
    };
  }
  async turnEnd(event, ctx) {
    this.ctx = ctx;
    if (!this.turn || this.turn.bound || !this.supported() || !this.store) return;
    if (!this.turn.opened) {
      this.turn = undefined;
      return;
    }
    const token = this.token,
      turn = this.turn;
    const subject = this.subject();
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
      this.append(
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
      const state = this.stateData(),
        pending = state.pendingId ? state.handoffs.get(state.pendingId) : undefined;
      if (!pending || pending.state === "superseded") return;
      const attempt = state.attempts.get(pending.id);
      if (pending.executionId !== turn.id && attempt?.executionId !== turn.id) return;
      if (ctx.signal?.aborted || outcome === "aborted" || state.control !== "automatic") return;
      const inputs = [...this.messages, message, ...results.map((e) => e.message)].filter(Boolean);
      const latest = this.stateData();
      const retry = latest.attempts.get(pending.id);
      if (retry?.executionId === turn.id)
        check(
          retry.reportRevision === pending.reportRevision &&
            retry.selectionRevision === (latest.selections.get(pending.assignmentId)?.revision ?? 0),
          "stale_retry_revision",
        );
      await this.finishHandoff(pending, inputs, token);
    } catch (error) {
      if (this.current(subject)) {
        this.mark(error);
        ctx.abort?.();
      }
    }
  }
  async finishHandoff(h, inputs, token) {
    const subject = this.subject();
    const state = this.stateData();
    check(state.control === "automatic" && !this.store?.blocked && token === this.token, "transition_ineligible");
    const execution = state.executions.get(h.executionId);
    check(
      execution?.assistantEntryId,
      "source_turn_incomplete",
      "Saved communication belongs to an incomplete historical turn. Reconcile its effects and replace or cancel the outstanding work; no tool result is fabricated.",
    );
    const source = new Sources(this.ctx.sessionManager.getBranch(), state);
    const carrier = source.byRef.get(`ctx:${execution.assistantEntryId}`);
    check(
      carrier && !source.exchange(carrier).problems.length,
      "source_exchange_incomplete",
      "The saved handoff has an incomplete native exchange; reconcile or explicitly dispose of it.",
    );
    if (h.kind === "return" && this.projectionEnabled) {
      const prepared = this.prepared("coordinator", inputs, h.id);
      if (!prepared.ready) {
        this.projectionError = prepared.problems.map((p) => p.code).join(", ");
        this.append({
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
      check(prepared.reservation, "reservation_missing");
      this.append({ type: "handoff-prepared", handoffId: h.id, reservation: prepared.reservation });
    }
    try {
      const current = this.stateData();
      check(current.pendingId === h.id && current.control === "automatic" && token === this.token, "stale_handoff");
      await this.applyPair(this.profilePair(h.to));
      this.guard(subject);
      this.append({ type: "handoff-state", handoffId: h.id, state: "configured", observedPair: this.observed() });
      const completed = this.stateData();
      const reservation = completed.reservations.get(h.id);
      if (h.kind === "return" && completed.assessment?.view === "suspended" && reservation) {
        this.append({
          type: "assessment-resumed",
          handoffId: h.id,
          basisUserEntryId: this.lastDeliveredUser(this.sources(completed), inputs),
          reservation,
        });
      }
      this.projectionError = undefined;
    } catch (error) {
      if (this.current(subject) && !this.store?.blocked && !this.error && this.stateData().pendingId === h.id) {
        this.append({
          type: "handoff-state",
          handoffId: h.id,
          state: "blocked",
          reason: error instanceof Error ? error.message.slice(0, 4096) : "configuration_failed",
        });
        this.ctx.ui?.notify?.(
          `Couldn’t switch to ${h.to === "coordinator" ? "Coordinator" : "Executor"} — ${h.kind === "return" ? "report" : "assignment"} saved.`,
          "warning",
        );
      } else throw error;
    }
  }
  async resume(ctx) {
    this.ctx = ctx;
    check(ctx.isIdle?.(), "not_idle");
    check(this.store && this.capability?.effective, "routing_unavailable");
    this.revision++;
    const subject = this.subject();
    return this.enqueue(() => this.resumeCurrent(ctx, subject));
  }
  async resumeCurrent(ctx, subject) {
    this.guard(subject);
    check(this.store, "routing_unavailable");
    await this.store.reconcile();
    this.guard(subject);
    this.error = undefined;
    this.retireUnbound("Explicit resume retires an interrupted attempt without claiming its effects completed.");
    const state = this.stateData();
    check(state.control === "automatic", "manual_control");
    check(
      !ctx.hasPendingMessages?.(),
      "pending_input",
      "Queued input must be delivered and reconciled before resuming Executor.",
    );
    const pending = state.pendingId ? state.handoffs.get(state.pendingId) : undefined;
    if (pending) {
      const source = ctx.sessionManager.buildSessionContext?.().messages;
      check(Array.isArray(source) || this.messages.length, "resume_context_unavailable");
      await this.finishHandoff(pending, source ?? this.messages, this.token);
      this.guard(subject);
      if (this.stateData().pendingId) {
        check(
          pending.kind === "return" && this.projectionError,
          "handoff_still_blocked",
          "Saved transfer is still blocked; reconcile its configuration before retrying.",
        );
        this.append({
          type: "control",
          control: "automatic",
          profile: "executor",
          reason: "Explicit resume of saved-return evidence correction only; ordinary assignment work remains ended",
        });
        await this.applyPair(this.profilePair("executor"));
      }
    } else {
      const assignment = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
      const input = ctx.sessionManager.buildSessionContext?.().messages ?? this.messages;
      const user = this.lastDeliveredUser(new Sources(ctx.sessionManager.getBranch(), state), input);
      const coordinatorSawInput = [...state.executions.values()].some(
        (x) =>
          x.profile === "coordinator" && x.basisUserEntryId === user && x.assistantEntryId && x.outcome === "completed",
      );
      if (assignment?.state === "outstanding") {
        check(
          user === this.taskBasis(state, assignment.id) || coordinatorSawInput,
          "input_unreconciled",
          "New input needs Coordinator attention before the unchanged assignment can resume.",
        );
        this.append({ type: "assignment-resumed", assignmentId: assignment.id, basisUserEntryId: user });
        this.append({
          type: "control",
          control: "automatic",
          profile: "executor",
          reason: "Explicit user resume of the unchanged assignment; current restrictions remain applicable",
        });
        await this.applyPair(this.profilePair("executor"));
      } else await this.applyPair(this.profilePair("coordinator"));
    }
    this.guard(subject);
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
  async command(args, ctx) {
    const words = args.trim().split(/\s+/);
    if (!["profile", "resume"].includes(words[0])) return false;
    try {
      if (words[0] === "profile" && words[1] === "history") {
        ctx.ui.notify(JSON.stringify(this.status(30)), "info");
        return true;
      }
      check(ctx.isIdle?.(), "not_idle");
      this.ctx = ctx;
      if (words[0] === "resume" && words.length === 1) {
        await this.resume(ctx);
        return true;
      }
      check(
        words.length === 2 && [...PROFILES, "auto"].includes(words[1]),
        "invalid_profile_command",
        "Use /freeflow profile coordinator|executor|auto|history, or /freeflow resume.",
      );
      const result = words[1] === "auto" ? await this.setAutomaticControl() : await this.setManualProfile(words[1]);
      ctx.ui.notify(JSON.stringify(result), result.status === "blocked" ? "warning" : "info");
    } catch (error) {
      ctx.ui.notify(error instanceof Error ? error.message : String(error), "warning");
    }
    return true;
  }
}
