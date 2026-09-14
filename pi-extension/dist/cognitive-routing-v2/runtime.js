import { schemaForProfile } from "./schemas.js";
import { randomUUID } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { relative, resolve as resolvePath } from "node:path";
import { EventStore } from "../session-sources/events.js";
import { Sources, bodyHash, isTaskEvidence } from "../session-sources/sources.js";
import { pairFromProfile, resolveCognitiveRoutingState } from "./config.js";
import { prepareView, changeSelection, representationProblems } from "./projection.js";
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
  packageRoots;
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
  receipts = new Map();
  pages = new Map();
  manualHold;
  automaticControl = false;
  sourceCache;
  constructor(pi, packageRoots = []) {
    this.pi = pi;
    this.packageRoots = packageRoots;
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
        recoveryId: t.recoveryId,
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
  configuredProfilePair(profile) {
    const configured = this.capability?.profiles[profile];
    check(configured, "profile_missing");
    return pairFromProfile(configured);
  }
  profilePair(profile) {
    return this.stateData().profileOverrides.get(profile) ?? this.configuredProfilePair(profile);
  }
  profilePairs() {
    return Object.fromEntries(PROFILES.map((profile) => [profile, this.profilePair(profile)]));
  }
  async validateProfilePairs(pairs) {
    const profiles = Object.fromEntries(
      PROFILES.map((profile) => {
        const pair = pairs[profile];
        return [profile, { provider: pair.provider, model: pair.modelId, thinking: pair.thinking }];
      }),
    );
    const result = await resolveCognitiveRoutingState({ cognitiveRouting: { enabled: true, profiles } }, {}, this.ctx);
    check(result.effective, result.blockingReason.code, result.blockingReason.message);
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
    this.receipts.clear();
    this.pages.clear();
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
      await this.validateProfilePairs(this.profilePairs());
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
    this.receipts.clear();
    this.pages.clear();
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
    this.receipts.clear();
    this.pages.clear();
    if (!this.store || !this.supported()) return;
    const subject = this.subject();
    try {
      await this.store.reconcile();
      this.guard(subject);
      this.error = undefined;
      await this.validateProfilePairs(this.profilePairs());
      this.retireUnbound("Selected historical ancestry ends before execution binding; effects are not replayed.");
      const state = this.stateData();
      if (this.manualHold) {
        this.append({
          type: "control",
          control: "manual",
          profile: this.manualHold,
          reason: "Current explicit manual hold survives navigation",
        });
        await this.applyPair(this.profilePair(this.manualHold));
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
  sessionProfileOverrides() {
    return Object.fromEntries(this.stateData().profileOverrides);
  }
  async setSessionProfileOverride(profile, override, mechanism = "Session profile override") {
    this.revision++;
    const subject = this.subject();
    return this.enqueue(async () => {
      try {
        check(this.capability?.effective && this.store, "routing_unavailable");
        check(
          this.ctx?.isIdle?.() !== false,
          "host_busy",
          "Wait for Pi to become idle before changing session presets.",
        );
        await this.store.reconcile();
        this.guard(subject);
        const state = this.stateData();
        const previous = state.profileOverrides.get(profile);
        if ((override === null && !previous) || (override !== null && samePair(previous, override)))
          return { status: "unchanged" };
        const target = override ?? this.configuredProfilePair(profile);
        const pairs = this.profilePairs();
        pairs[profile] = target;
        await this.validateProfilePairs(pairs);
        this.append({
          type: "profile-overrides",
          overrides: { [profile]: override },
          reason: mechanism,
        });
        if (state.control !== "inactive" && state.profile === profile) {
          try {
            await this.applyPair(target);
            this.guard(subject);
          } catch (error) {
            if (this.current(subject) && !this.externalChange && !this.error && !this.store.blocked) {
              this.append({
                type: "profile-overrides",
                overrides: { [profile]: previous ?? null },
                reason: "Session profile application failed; prior override retained",
              });
            }
            throw error;
          }
          this.error = undefined;
          return { status: "active" };
        }
        this.error = undefined;
        return { status: "stored" };
      } catch (error) {
        if (this.current(subject)) this.mark(error);
        return { status: "blocked", reason: error instanceof Error ? error.message : String(error) };
      }
    });
  }
  async resetSessionProfileOverrides(mechanism = "Reset session profile overrides") {
    this.revision++;
    const subject = this.subject();
    return this.enqueue(async () => {
      try {
        check(this.capability?.effective && this.store, "routing_unavailable");
        check(
          this.ctx?.isIdle?.() !== false,
          "host_busy",
          "Wait for Pi to become idle before resetting session presets.",
        );
        await this.store.reconcile();
        this.guard(subject);
        const state = this.stateData();
        if (state.profileOverrides.size === 0) return { status: "unchanged" };
        const previous = Object.fromEntries(state.profileOverrides);
        const targetPairs = Object.fromEntries(
          PROFILES.map((profile) => [profile, this.configuredProfilePair(profile)]),
        );
        await this.validateProfilePairs(targetPairs);
        this.append({
          type: "profile-overrides",
          overrides: { coordinator: null, executor: null },
          reason: mechanism,
        });
        const active = state.control !== "inactive" ? state.profile : undefined;
        if (active && previous[active]) {
          try {
            await this.applyPair(targetPairs[active]);
            this.guard(subject);
          } catch (error) {
            if (this.current(subject) && !this.externalChange && !this.error && !this.store.blocked) {
              this.append({
                type: "profile-overrides",
                overrides: {
                  coordinator: previous.coordinator ?? null,
                  executor: previous.executor ?? null,
                },
                reason: "Session profile reset failed; prior overrides retained",
              });
            }
            throw error;
          }
          this.error = undefined;
          return { status: "active" };
        }
        this.error = undefined;
        return { status: "stored" };
      } catch (error) {
        if (this.current(subject)) this.mark(error);
        return { status: "blocked", reason: error instanceof Error ? error.message : String(error) };
      }
    });
  }
  setAutomaticControl(_mechanism) {
    return this.control("coordinator", false);
  }
  lastDeliveredUser(sources, messages) {
    const delivered = new Set(
      sources.associate(messages).flatMap((x) => (x.source?.message.role === "user" ? [x.source.entry.id] : [])),
    );
    // Compaction may remove every user message from the active view. Retain
    // observed delivery on this ancestry; a stored but undelivered user entry
    // must not advance the basis, and absence must not manufacture new input.
    for (const execution of this.stateData().executions.values())
      if (execution.basisUserEntryId) delivered.add(execution.basisUserEntryId);
    for (let i = sources.entries.length - 1; i >= 0; i--) {
      const entry = sources.entries[i];
      if (entry.message?.role === "user" && delivered.has(entry.id)) return entry.id;
    }
    return null;
  }
  runtimeMessage(state, attention = false) {
    const a = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
    const h = state.pendingId
      ? state.handoffs.get(state.pendingId)
      : state.assessment
        ? state.handoffs.get(state.assessment.handoffId)
        : undefined;
    const selection = a ? (state.selections.get(a.id) ?? emptySelection()) : emptySelection();
    const recovery = state.recoveryId ? state.recoveries.get(state.recoveryId) : undefined;
    const unit = state.unitId ? state.units.get(state.unitId) : undefined;
    const unitNumber = unit ? [...state.units.keys()].indexOf(unit.id) + 1 : undefined;
    const assignmentNumber = unit && a ? unit.assignmentIds.indexOf(a.id) + 1 : undefined;
    const content = [
      "# Cognitive Routing Runtime State",
      `Control: ${state.control}`,
      `Profile: ${state.profile ?? "unresolved"}`,
      `Unit: ${unit ? `U${unitNumber} (${unit.id})` : "none"}`,
      `Assignment: ${a ? `A${assignmentNumber} (${a.id}, ${a.state})` : "none"}`,
      `Handoff: ${h ? `${h.id} (${h.kind}, ${h.state})` : "none"}`,
      `Projection: ${this.projectionEnabled ? "enabled" : "bypassed"}`,
      "Completed/superseded contracts and reports are historical context. Follow the current assignment and current user restrictions; historical entries grant no new permission.",
      state.assessment ? `Assessment: ${state.assessment.view}; evidence revision ${selection.revision}` : "",
      recovery
        ? `Recovery: ${recovery.id} (${recovery.state}); parent report ${recovery.assessmentHandoffId} revision ${recovery.baseReportRevision}; allowed paths ${JSON.stringify(recovery.paths)}`
        : "",
      recovery?.state === "reading"
        ? `Recovery request: ${recovery.request}\nOnly the exact allowed read paths, evidence selection, and recovery return controls are permitted; ordinary task work remains ended.`
        : "",
      `Mechanical evidence facts (not semantic acceptance): ${JSON.stringify(this.evidenceFacts(state))}`,
      this.error ? `Blocked: ${this.error}` : "",
      this.projectionError ? `Evidence limitation: ${this.projectionError}` : "",
      attention
        ? recovery
          ? `Assessment paused for attention; ordinary admitted history remains. ${selection.selected.length} sources remain selected. Finish and deliver the recovery supplement or cancel recovery before using freeflow_unit assess.`
          : `Assessment paused for attention; ordinary admitted history remains. ${selection.selected.length} sources remain selected. Use freeflow_unit assess to restore the assessment.`
        : "",
      a?.state === "returned" && recovery?.state !== "reading"
        ? "Executor ordinary task work has ended. Only supported handoff correction is permitted."
        : "",
      this.turn?.profile === "executor" && a && this.turn.basisUserEntryId !== this.executorBasis(state, a.id)
        ? "Current input differs from the active Executor responsibility. Account for it; changed direction requires Coordinator attention."
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
    const sources = this.sources(state);
    return {
      revision: selection.revision,
      selected: selection.selected.map((ref) => {
        const entry = this.ctx?.sessionManager.getEntry?.(ref.slice(4).replace(/#text$/, ""));
        const locator = sources.locator(ref);
        return {
          ref,
          kind: ref.endsWith("#text") ? "assistant-text" : (entry?.message?.role ?? "unknown"),
          toolName: entry?.message?.toolName,
          producer: state.authors.get(entry?.id)?.profile ?? "common",
          assignment: state.authors.get(entry?.id)?.assignmentId,
          ...(locator ? { locator } : {}),
        };
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
      tools: (this.pi.getAllTools?.() ?? [])
        .filter((tool) =>
          ROUTING_TOOLS.includes(tool.name)
            ? tool.name === "freeflow_unit" ||
              (profile === "coordinator"
                ? tool.name === "freeflow_delegate"
                : tool.name === "freeflow_return" || (tool.name === "freeflow_project" && this.projectionEnabled))
            : this.pi.getActiveTools?.().includes(tool.name),
        )
        .map((tool) =>
          ROUTING_TOOLS.includes(tool.name)
            ? { ...tool, parameters: schemaForProfile(tool.name, profile === "coordinator") }
            : tool,
        ),
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
        state.profile === "executor" && user !== (outstanding ? this.executorBasis(state, outstanding.id) : undefined);
      if (!this.turn || this.turn.bound) {
        this.receipts.clear();
        const execution = {
          id: randomUUID(),
          profile: state.profile,
          assignmentId: state.assignmentId,
          recoveryId: state.recoveryId,
          basisUserEntryId: user,
          pair: this.observed(),
          resultEntryIds: [],
        };
        const before = new Set(ctx.sessionManager.getBranch().map((e) => e.id));
        this.turn = {
          id: execution.id,
          profile: execution.profile,
          assignmentId: execution.assignmentId,
          recoveryId: execution.recoveryId,
          basisUserEntryId: user,
          before,
          pair: execution.pair,
        };
        this.openTurn();
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
  contextOperation(name, input) {
    return name === "freeflow_context" && ["archive", "restore", "search", "retrieve"].includes(input?.operation);
  }
  handoffOperation(name, input) {
    if (name === "freeflow_delegate") return true;
    if (name === "freeflow_return") return ["submit", "supplement", "retry"].includes(input?.operation);
    return name === "freeflow_unit" && input?.operation === "recover";
  }
  stableRecoveryPath(path) {
    return (
      !path.startsWith("@") &&
      path !== "~" &&
      !path.startsWith("~/") &&
      !path.startsWith("file://") &&
      !/[\u00a0\u2000-\u200a\u202f\u205f\u3000]/u.test(path) &&
      !(process.platform === "win32" && /^\/(?:mnt\/|cygdrive\/)?[a-z](?:\/|$)/i.test(path))
    );
  }
  canonicalRecoveryPath(path) {
    check(this.stableRecoveryPath(path), "recovery_path_unsupported", `Recovery path spelling is unsupported: ${path}`);
    const requested = resolvePath(this.ctx.cwd, path);
    check(existsSync(requested), "recovery_path_unavailable", `Recovery path is unavailable: ${path}`);
    try {
      return realpathSync(requested);
    } catch {
      throw new RoutingError("recovery_path_unavailable", `Recovery path is unavailable: ${path}`);
    }
  }
  packagedInstruction(path) {
    return this.packageRoots.some((root) => {
      const inside = relative(root, path);
      if (!inside || inside.startsWith("..") || resolvePath(root, inside) !== path) return false;
      return (
        /^(?:skills|capabilities)\/[^/]+\/SKILL\.md$/.test(inside) ||
        /^(?:skills|capabilities)\/[^/]+\/references\/[^/]+\.md$/.test(inside)
      );
    });
  }
  recoveryReadAllowed(state, name, input) {
    if (name !== "read" || typeof input?.path !== "string" || !state.recoveryId) return false;
    const recovery = state.recoveries.get(state.recoveryId);
    if (!recovery || recovery.state !== "reading" || !this.stableRecoveryPath(input.path)) return false;
    try {
      const path = this.canonicalRecoveryPath(input.path);
      return recovery.paths.includes(path) || this.packagedInstruction(path);
    } catch {
      return false;
    }
  }
  executorBasis(state, assignmentId) {
    const recovery = state.recoveryId ? state.recoveries.get(state.recoveryId) : undefined;
    if (recovery?.state === "reading") return state.handoffs.get(recovery.requestHandoffId)?.basisUserEntryId ?? null;
    return this.taskBasis(state, assignmentId);
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
    const handoffs = calls.filter((b) => this.handoffOperation(b.name, b.arguments));
    check(
      !handoffs.length ||
        (handoffs.length === 1 &&
          this.handoffOperation(calls.at(-1)?.name, calls.at(-1)?.arguments) &&
          calls.every(
            (b) =>
              this.handoffOperation(b.name, b.arguments) ||
              b.name === "freeflow_project" ||
              this.contextOperation(b.name, b.arguments),
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
      if (this.turn?.profile === "executor" && !isRouting && !this.contextOperation(name, event.input)) {
        const a = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
        const ordinary =
          a?.state === "outstanding" &&
          this.turn.basisUserEntryId === this.taskBasis(state, a.id) &&
          state.profile === "executor";
        const recovery =
          a?.state === "returned" &&
          this.turn.basisUserEntryId === this.executorBasis(state, a.id) &&
          state.profile === "executor" &&
          this.recoveryReadAllowed(state, name, event.input);
        check(ordinary || recovery, "executor_task_phase_ended");
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
        if (name === "freeflow_unit" && input.operation === "inspect") return this.result(this.inspectUnit(input));
        this.assertAvailable(name === "freeflow_delegate" || name === "freeflow_unit" ? "coordinator" : "executor");
        const op = this.callOperation(callId, name);
        const cached = this.receipts.get(op);
        if (cached) {
          check(cached.input === canonical(input), "operation_conflict");
          return this.result(structuredClone(cached.value));
        }
        const value =
          name === "freeflow_delegate"
            ? this.delegate(input, callId, op)
            : name === "freeflow_return"
              ? this.returnReport(input, callId, op)
              : name === "freeflow_project"
                ? this.project(input, op)
                : name === "freeflow_unit"
                  ? this.unit(input, callId, op)
                  : undefined;
        if (value !== undefined) {
          this.receipts.set(op, { input: canonical(input), value: structuredClone(value) });
          return this.result(value);
        }
        throw new RoutingError("unknown_tool", name);
      } catch (error) {
        return this.result({
          status: "blocked",
          code: error instanceof RoutingError ? error.code : "operation_failed",
          message: error instanceof Error ? error.message : String(error),
          problems: error instanceof RoutingError ? error.problems : [],
          observed: this.observed(),
          expectedProfile:
            name === "freeflow_unit" && input.operation === "inspect"
              ? undefined
              : name === "freeflow_delegate" || name === "freeflow_unit"
                ? "coordinator"
                : "executor",
          recoveryAction:
            error instanceof RoutingError &&
            [
              "cursor_expired",
              "invalid_cursor",
              "work_ref_required",
              "invalid_work_ref",
              "work_unavailable",
              "invalid_inspection",
            ].includes(error.code)
              ? "Inspect again without a cursor and use a returned work ref. Lookup recovery does not require a new assignment."
              : "Preserve saved work. Use freeflow_unit inspect; reconcile current input/control before retrying the named operation.",
        });
      }
    });
  }
  duplicate(op) {
    return [...this.stateData().events.values()].find(
      (e) =>
        e.operationId === op &&
        [
          "delegate-accepted",
          "return-accepted",
          "recovery-request-accepted",
          "recovery-supplement-accepted",
          "recovery-cancelled",
          "handoff-retry-requested",
        ].includes(e.data.type),
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
      check(
        input.operation === "assign" && old?.state !== "outstanding" && !state.pendingId && !state.recoveryId,
        "assignment_outstanding",
      );
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
    const recovery = state.recoveryId ? state.recoveries.get(state.recoveryId) : undefined;
    const original = a.returnHandoffId ? state.handoffs.get(a.returnHandoffId) : undefined;
    const supplement = recovery?.supplementHandoffId ? state.handoffs.get(recovery.supplementHandoffId) : undefined;
    const retryingSupplement = input.operation === "retry" && recovery?.state === "returning";
    const saved = retryingSupplement || input.operation === "supplement" ? supplement : original;
    const selection = state.selections.get(a.id) ?? emptySelection();
    const duplicate = this.duplicate(op);
    if (duplicate) {
      if (input.operation === "retry") check(duplicate.data.type === "handoff-retry-requested", "operation_conflict");
      else {
        const expected = input.operation === "supplement" ? "recovery-supplement-accepted" : "return-accepted";
        check(
          duplicate.data.type === expected &&
            duplicate.data.handoff.text === input.report &&
            duplicate.data.handoff.outcome === input.outcome &&
            canonical(duplicate.data.handoff.limitations) === canonical(input.limitations ?? []),
          "operation_conflict",
        );
      }
      const handoff = duplicate.data.handoffId ?? duplicate.data.handoff.id;
      return { ...this.returnReadiness(handoff), unchanged: true };
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
      return {
        ...this.returnReadiness(saved.id),
        reportUnchanged: true,
        supplementUnchanged: saved.kind === "recovery-return",
      };
    }
    if (input.operation === "supplement") {
      check(
        recovery &&
          ["reading", "returning"].includes(recovery.state) &&
          (!supplement || ["pending", "blocked"].includes(supplement.state)),
        "recovery_not_returnable",
      );
      const h = {
        id: supplement?.id ?? randomUUID(),
        kind: "recovery-return",
        assignmentId: a.id,
        text: input.report,
        from: "executor",
        to: "coordinator",
        executionId: this.turn.id,
        toolCallId: callId,
        basisUserEntryId: this.turn.basisUserEntryId,
        state: "pending",
        reportRevision: (supplement?.reportRevision ?? 0) + 1,
        outcome: input.outcome,
        limitations: input.limitations ?? [],
      };
      this.append({ type: "recovery-supplement-accepted", recoveryId: recovery.id, handoff: h }, op);
      return this.returnReadiness(h.id);
    }
    check(input.operation === "submit", "invalid_return_operation");
    check(
      a.state === "outstanding" ||
        (a.state === "returned" && original && ["pending", "blocked"].includes(original.state)),
      "assignment_task_ended",
    );
    const h = {
      id: original?.id ?? randomUUID(),
      kind: "return",
      assignmentId: a.id,
      text: input.report,
      from: "executor",
      to: "coordinator",
      executionId: this.turn.id,
      toolCallId: callId,
      basisUserEntryId: this.turn.basisUserEntryId,
      state: "pending",
      reportRevision: (original?.reportRevision ?? 0) + 1,
      outcome: input.outcome,
      limitations: input.limitations ?? [],
    };
    this.append({ type: "return-accepted", handoff: h }, op);
    return this.returnReadiness(h.id);
  }
  returnReadiness(id) {
    const state = this.stateData();
    const h = state.handoffs.get(id);
    const prepared = this.prepared("coordinator", this.messages, id);
    const isSupplement = h.kind === "recovery-return";
    const recovery = isSupplement
      ? [...state.recoveries.values()].find((candidate) => candidate.supplementHandoffId === h.id)
      : undefined;
    return {
      status: "accepted",
      reportSaved: !isSupplement,
      supplementSaved: isSupplement,
      handoff: id,
      ...(recovery ? { recovery: recovery.id } : {}),
      ...(isSupplement ? { supplementRevision: h.reportRevision } : { reportRevision: h.reportRevision }),
      assignmentRef: `assignment:${h.assignmentId}`,
      ...(isSupplement
        ? { supplementRef: `supplement:${recovery?.id ?? "unknown"}:${h.reportRevision}` }
        : { reportRef: `report:${h.id}:${h.reportRevision}` }),
      producer: "executor",
      outcome: h.outcome,
      limitations: h.limitations,
      ready: prepared.ready,
      transition: prepared.ready ? "pending" : "blocked",
      problems: prepared.problems,
      warnings: prepared.warnings,
      stage: "completed-input preparation",
      finalExchangePending: true,
      provisional:
        "The finalized handoff exchange, target configuration and budget are revalidated at turn_end; this is not delivery evidence.",
      ...(isSupplement ? { supplement: h.text } : { report: h.text }),
      evidence: this.evidenceFacts(state),
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
    let next = selection;
    if (input.operation !== "inspect") {
      check(["add", "remove"].includes(input.operation), "invalid_projection_operation");
      next = changeSelection(selection, input, sources, state);
      if (next !== selection) this.append({ type: "selection-changed", assignmentId: a.id, selection: next }, op);
    }
    const prepared = this.prepared("coordinator", this.messages, a.returnHandoffId);
    const scope = input.scope ?? "assignment";
    let page;
    if (input.operation === "inspect") {
      const model = this.model("coordinator");
      const checksFor = (s) => {
        const eligibility = sources.selectionProblem(s.ref, state);
        const limitations = [
          ...(eligibility ? [eligibility] : []),
          ...representationProblems(s, model),
          ...sources.exchange(s).problems,
        ];
        return { eligible: !eligibility, targetReady: !limitations.length, limitations };
      };
      const rows = () =>
        [...sources.byRef.values()]
          .filter(
            (s) =>
              s.producer === "executor" &&
              (isTaskEvidence(s) || (scope === "selected" && next.selected.includes(s.ref))) &&
              (scope === "selected"
                ? next.selected.includes(s.ref)
                : scope === "assignment"
                  ? s.assignmentId === a.id
                  : scope === "active"
                    ? s.active
                    : true) &&
              (s.original ||
                s.message.role === "toolResult" ||
                s.message.content?.some((b) => b.type === "text" && b.text?.trim())),
          )
          .map((s) => {
            const locator = sources.locator(s.ref);
            return {
              ref: s.ref,
              kind: s.original ? "assistant-text" : s.message.role,
              producer: s.producer,
              assignment: s.assignmentId,
              toolName: s.message.toolName,
              ...(locator ? { locator } : {}),
              active: s.active,
              selected: next.selected.includes(s.ref),
              retainedSelection: next.selected.includes(s.ref) && !isTaskEvidence(s),
              ...checksFor(s),
            };
          })
          // Discovery offers usable candidates. Saved selections must remain
          // inspectable even when a later source or target check fails.
          .filter((row) => scope === "selected" || row.targetReady);
      page = this.page(
        `evidence:${scope}`,
        rows,
        input.cursor,
        30,
        scope === "assignment" || scope === "selected" ? a.id : undefined,
        scope === "active",
        (rows) => ({
          scopeCounts: {
            candidates: rows.length,
            eligible: rows.filter((r) => r.eligible).length,
            targetReady: rows.filter((r) => r.targetReady).length,
          },
          otherAssignments: [...sources.byRef.values()].filter(
            (s) =>
              s.producer === "executor" && s.assignmentId !== a.id && isTaskEvidence(s) && checksFor(s).targetReady,
          ).length,
        }),
      );
    }
    return {
      status: input.operation === "inspect" || next === selection ? "unchanged" : "saved",
      ...(page
        ? {
            scope,
            count: page.count,
            returned: page.items.length,
            candidates: page.items,
            nextCursor: page.nextCursor,
            ...page.summary,
            pageCounts: {
              candidates: page.items.length,
              eligible: page.items.filter((r) => r.eligible).length,
              targetReady: page.items.filter((r) => r.targetReady).length,
            },
            countsBasis:
              "Inspection snapshot; page counts describe returned candidates, scope counts describe all candidates in this scope.",
            historyHint: page.summary.otherAssignments
              ? "Previously exposed task evidence exists in other assignments; inspect scope history when needed."
              : undefined,
          }
        : {}),
      revision: next.revision,
      selected: next.selected,
      selectedCount: next.selected.length,
      unresolved: next.unresolved,
      ready: !next.unresolved.length && prepared.ready,
      problems: prepared.problems,
      warnings: prepared.warnings,
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
  unit(input, callId, op) {
    const state = this.stateData();
    const prior = [...state.events.values()].find((e) => e.operationId === op);
    if (prior) {
      if (input.operation === "recover") {
        check(
          prior.data.type === "recovery-request-accepted" &&
            prior.data.recovery.request === input.request &&
            canonical(prior.data.recovery.requestedPaths) === canonical([...new Set(input.paths ?? [])]),
          "operation_conflict",
        );
        const { recovery, handoff } = prior.data;
        return {
          status: "accepted",
          unchanged: true,
          recovery: recovery.id,
          handoff: handoff.id,
          assignmentRef: `assignment:${recovery.assignmentId}`,
          reportRef: `report:${recovery.assessmentHandoffId}:${recovery.baseReportRevision}`,
          request: recovery.request,
          paths: recovery.paths,
          transition: handoff.state,
        };
      }
      if (input.operation === "cancel-recovery") {
        check(prior.data.type === "recovery-cancelled" && prior.data.reason === input.reason, "operation_conflict");
        return {
          status: "cancelled",
          unchanged: true,
          recovery: prior.data.recoveryId,
          reason: prior.data.reason,
          assessment: state.assessment?.handoffId,
        };
      }
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
    if (input.operation === "recover") {
      const a = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
      const base = a?.returnHandoffId ? state.handoffs.get(a.returnHandoffId) : undefined;
      check(
        state.unitId &&
          a?.state === "returned" &&
          base?.kind === "return" &&
          base.state === "configured" &&
          state.assessment?.handoffId === base.id &&
          !state.pendingId &&
          !state.recoveryId &&
          !this.applying,
        "recovery_not_available",
      );
      const id = randomUUID(),
        handoffId = randomUUID();
      const paths = [...new Set((input.paths ?? []).map((path) => this.canonicalRecoveryPath(path)))];
      const recovery = {
        id,
        assignmentId: a.id,
        assessmentHandoffId: base.id,
        baseReportRevision: base.reportRevision,
        request: input.request,
        requestedPaths: [...new Set(input.paths ?? [])],
        paths,
        state: "requested",
        requestHandoffId: handoffId,
        supplementRevision: 0,
      };
      const handoff = {
        id: handoffId,
        kind: "recovery-request",
        assignmentId: a.id,
        text: input.request,
        from: "coordinator",
        to: "executor",
        executionId: this.turn.id,
        toolCallId: callId,
        basisUserEntryId: this.turn.basisUserEntryId,
        state: "pending",
        reportRevision: 0,
        limitations: [],
      };
      this.append({ type: "recovery-request-accepted", recovery, handoff }, op);
      return {
        status: "accepted",
        recovery: id,
        handoff: handoffId,
        assignmentRef: `assignment:${a.id}`,
        reportRef: `report:${base.id}:${base.reportRevision}`,
        request: input.request,
        paths,
        transition: "pending",
      };
    }
    if (input.operation === "cancel-recovery") {
      check(state.recoveryId && !this.applying, "recovery_not_cancellable");
      check(
        ![...state.executions.values()].some(
          (execution) =>
            execution.recoveryId === state.recoveryId &&
            execution.profile === "executor" &&
            !execution.assistantEntryId &&
            !execution.interrupted,
        ),
        "recovery_not_cancellable",
      );
      this.append({ type: "recovery-cancelled", recoveryId: state.recoveryId, reason: input.reason }, op);
      return {
        status: "cancelled",
        recovery: state.recoveryId,
        reason: input.reason,
        assessment: state.assessment?.handoffId,
      };
    }
    if (input.operation === "assess") {
      check(state.assessment, "assessment_missing");
      check(!state.recoveryId, "recovery_outstanding");
      if (state.assessment.view === "active") return { status: "unchanged", ready: true };
      const prepared = this.prepared("coordinator", this.messages, state.assessment.handoffId, true);
      if (!prepared.ready) return { status: "suspended", ready: false, problems: prepared.problems };
      if (this.projectionEnabled) check(prepared.reservation, "reservation_missing");
      this.append(
        {
          type: "assessment-resumed",
          handoffId: state.assessment.handoffId,
          basisUserEntryId: this.turn.basisUserEntryId,
          ...(prepared.reservation ? { reservation: prepared.reservation } : {}),
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
    if (state.recoveryId) {
      check(input.outcome !== "accepted", "unfinished_work");
      check(
        ![...state.executions.values()].some(
          (execution) =>
            execution.recoveryId === state.recoveryId &&
            execution.profile === "executor" &&
            !execution.assistantEntryId &&
            !execution.interrupted,
        ),
        "not_quiescent",
      );
    }
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
  page(scope, rows, cursor, size = 30, assignment, active = false, summarize) {
    const branch = this.ctx.sessionManager.getBranch();
    const compaction = branch.filter((e) => e.type === "compaction").at(-1)?.id;
    let key,
      offset = 0;
    if (cursor) {
      const match = /^([a-f0-9-]+):([0-9]+)$/.exec(cursor);
      check(match, "invalid_cursor", "Use the returned cursor unchanged.");
      key = match[1];
      offset = Number(match[2]);
      const page = this.pages.get(key);
      check(
        page &&
          page.scope === scope &&
          page.assignment === assignment &&
          (!page.basis || branch.some((e) => e.id === page.basis)) &&
          (!active || page.compaction === compaction),
        "cursor_expired",
        "History or scope changed. Inspect again without a cursor.",
      );
      check(
        Number.isSafeInteger(offset) && offset >= 0 && offset < page.rows.length && offset % page.size === 0,
        "invalid_cursor",
      );
    } else {
      key = randomUUID();
      if (this.pages.size >= 8) this.pages.delete(this.pages.keys().next().value);
      const items = typeof rows === "function" ? rows() : rows;
      this.pages.set(key, {
        scope,
        basis: branch.at(-1)?.id ?? null,
        assignment,
        compaction,
        rows: items,
        size,
        summary: summarize?.(items),
      });
    }
    const page = this.pages.get(key);
    return {
      scope,
      count: page.rows.length,
      offset,
      summary: page.summary,
      items: page.rows.slice(offset, offset + page.size),
      nextCursor: offset + page.size < page.rows.length ? `${key}:${offset + page.size}` : undefined,
    };
  }
  inspectUnit(input) {
    const state = this.stateData(),
      view = input.view ?? "current";
    check(view === "detail" || !input.ref, "invalid_inspection", "A work ref belongs to view detail.");
    check(
      view === "history" || (!input.cursor && !input.limit),
      "invalid_inspection",
      "Pagination belongs to view history.",
    );
    if (view === "current")
      return {
        ...this.status(),
        status: "inspected",
        view,
        currentRef: state.assignmentId ? `assignment:${state.assignmentId}` : undefined,
      };
    if (view === "history") {
      const numbers = new Map([...state.units.keys()].map((id, i) => [id, i + 1]));
      const rows = () =>
        [...state.assignments.values()].reverse().map((a) => {
          const u = state.units.get(a.unitId),
            h = a.returnHandoffId ? state.handoffs.get(a.returnHandoffId) : undefined;
          return {
            ref: `assignment:${a.id}`,
            unitRef: `unit:${a.unitId}`,
            unitNumber: numbers.get(a.unitId),
            assignmentNumber: (u?.assignmentIds.indexOf(a.id) ?? 0) + 1,
            state: a.state,
            unitState: u?.state,
            disposition: u?.disposition,
            summary: a.contract.slice(0, 160),
            reportAvailable: !!h,
            outcome: h?.outcome,
            from: "coordinator",
            to: "executor",
          };
        });
      const page = this.page("work-history", rows, input.cursor, input.limit ?? 20);
      return {
        status: "inspected",
        view,
        history: page.items,
        count: page.count,
        returned: page.items.length,
        nextCursor: page.nextCursor,
      };
    }
    check(
      view === "detail" && typeof input.ref === "string",
      "work_ref_required",
      "Use a ref returned by history inspection.",
    );
    check(
      /^(?:(?:unit|assignment|recovery):[^:\s]+|(?:report|supplement):[^:\s]+:[1-9][0-9]*)$/.test(input.ref),
      "invalid_work_ref",
      "Use assignment, report, recovery, or supplement refs returned by a receipt or inspection, unchanged. A bare handoff ID is not a work ref.",
    );
    if (input.ref.startsWith("unit:")) {
      const u = state.units.get(input.ref.slice(5));
      check(u, "work_unavailable", "Unit is not on current ancestry.");
      return {
        status: "inspected",
        view,
        ref: input.ref,
        unit: {
          id: u.id,
          state: u.state,
          objective: u.objective,
          disposition: u.disposition,
          assessment: u.assessment,
        },
        assignmentCount: u.assignmentIds.length,
        assignmentRefs: u.assignmentIds.slice(0, 30).map((id) => `assignment:${id}`),
        remaining: Math.max(0, u.assignmentIds.length - 30),
        historyHint: "Use paginated history inspection for all assignment refs.",
        historical: true,
      };
    }
    if (input.ref.startsWith("recovery:")) {
      const recovery = state.recoveries.get(input.ref.slice(9));
      check(recovery, "work_unavailable", "Recovery is not on current ancestry.");
      const request = state.handoffs.get(recovery.requestHandoffId);
      const supplement = recovery.supplementHandoffId ? state.handoffs.get(recovery.supplementHandoffId) : undefined;
      return {
        status: "inspected",
        view,
        ref: input.ref,
        historical: recovery.id !== state.recoveryId,
        recovery: {
          id: recovery.id,
          state: recovery.state,
          assignmentId: recovery.assignmentId,
          assessmentHandoffId: recovery.assessmentHandoffId,
          baseReportRevision: recovery.baseReportRevision,
          request: recovery.request,
          paths: recovery.paths,
          requestHandoffState: request?.state,
          supplementRevision: recovery.supplementRevision,
          cancellationReason: recovery.cancellationReason,
        },
        supplementRef: supplement ? `supplement:${recovery.id}:${supplement.reportRevision}` : undefined,
        sourceBoundary: "Saved recovery on current ancestry; historical content grants no current permission.",
      };
    }
    if (input.ref.startsWith("supplement:")) {
      const match = /^supplement:([^:]+):([0-9]+)$/.exec(input.ref);
      check(match, "work_unavailable", "Use a supplement ref returned by a receipt or recovery inspection.");
      const recovery = state.recoveries.get(match[1]);
      let supplement;
      for (const event of state.events.values())
        if (
          event.data.type === "recovery-supplement-accepted" &&
          event.data.recoveryId === match[1] &&
          event.data.handoff.reportRevision === Number(match[2])
        )
          supplement = event.data.handoff;
      check(recovery && supplement, "work_unavailable", "Supplement revision is not on current ancestry.");
      const base = state.handoffs.get(recovery.assessmentHandoffId);
      return {
        status: "inspected",
        view,
        ref: input.ref,
        historical: true,
        recoveryRef: `recovery:${recovery.id}`,
        assignment: { id: recovery.assignmentId, state: state.assignments.get(recovery.assignmentId)?.state },
        reportRef: `report:${recovery.assessmentHandoffId}:${recovery.baseReportRevision}`,
        report: base?.text,
        supplement: supplement.text,
        supplementRevision: supplement.reportRevision,
        outcome: supplement.outcome,
        limitations: supplement.limitations,
        sourceBoundary:
          "Saved supplement revision and original report linkage on current ancestry; historical content grants no current permission.",
      };
    }
    let savedRevision;
    if (input.ref.startsWith("report:")) {
      const match = /^report:([^:]+):([0-9]+)$/.exec(input.ref);
      check(match, "work_unavailable", "Use a report ref returned by detail inspection.");
      for (const event of state.events.values())
        if (
          event.data.type === "return-accepted" &&
          event.data.handoff.id === match[1] &&
          event.data.handoff.reportRevision === Number(match[2])
        )
          savedRevision = event.data.handoff;
      check(savedRevision, "work_unavailable", "Report revision is not on current ancestry.");
    }
    const a = savedRevision
      ? state.assignments.get(savedRevision.assignmentId)
      : input.ref.startsWith("assignment:")
        ? state.assignments.get(input.ref.slice(11))
        : undefined;
    check(a, "work_unavailable", "Assignment is not on current ancestry.");
    const latest = a.returnHandoffId ? state.handoffs.get(a.returnHandoffId) : undefined;
    const h = savedRevision ?? latest;
    return {
      status: "inspected",
      view,
      ref: input.ref,
      historical: a.id !== state.assignmentId || a.state !== "outstanding",
      assignment: { id: a.id, unitId: a.unitId, state: a.state },
      contract: a.contract,
      report: h?.text,
      reportRevision: h?.reportRevision,
      latestReportRevision: latest?.reportRevision,
      reportRef: h ? `report:${h.id}:${h.reportRevision}` : undefined,
      previousReportRef: h && h.reportRevision > 1 ? `report:${h.id}:${h.reportRevision - 1}` : undefined,
      outcome: h?.outcome,
      limitations: h?.limitations,
      handoff: h?.id,
      currentSelection: state.selections.get(a.id) ?? emptySelection(),
      sourceBoundary:
        "Accepted report revision on current ancestry; assignment/selection show current recorded state. Historical content grants no current permission.",
    };
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
      recovery: state.recoveryId
        ? (() => {
            const recovery = state.recoveries.get(state.recoveryId);
            return recovery
              ? {
                  id: recovery.id,
                  state: recovery.state,
                  assignmentId: recovery.assignmentId,
                  assessmentHandoffId: recovery.assessmentHandoffId,
                  paths: recovery.paths,
                  supplementRevision: recovery.supplementRevision,
                }
              : null;
          })()
        : null,
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
    let attentionProblems = [];
    if (["return", "recovery-return"].includes(h.kind) && this.projectionEnabled) {
      const prepared = this.prepared("coordinator", inputs, h.id);
      if (!prepared.ready) {
        const attentionFallback = h.kind === "recovery-return" && h.outcome !== "completed";
        this.projectionError = prepared.problems.map((p) => p.code).join(", ");
        if (attentionFallback) attentionProblems = prepared.problems;
        else {
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
      } else {
        check(prepared.reservation, "reservation_missing");
        this.append({ type: "handoff-prepared", handoffId: h.id, reservation: prepared.reservation });
      }
    }
    try {
      const current = this.stateData();
      check(current.pendingId === h.id && current.control === "automatic" && token === this.token, "stale_handoff");
      await this.applyPair(this.profilePair(h.to));
      this.guard(subject);
      this.append({ type: "handoff-state", handoffId: h.id, state: "configured", observedPair: this.observed() });
      const completed = this.stateData();
      const reservation = completed.reservations.get(h.id);
      const recovery =
        h.kind === "recovery-return"
          ? [...completed.recoveries.values()].find((candidate) => candidate.supplementHandoffId === h.id)
          : undefined;
      if (h.kind === "recovery-return" && recovery && completed.assessment?.view === "suspended") {
        if (attentionProblems.length) {
          this.append({
            type: "assessment-suspended",
            handoffId: recovery.assessmentHandoffId,
            reason: "delivery-gap",
            basisUserEntryId: this.lastDeliveredUser(this.sources(completed), inputs),
            problems: attentionProblems,
          });
        } else if (completed.assessment.suspensionReason === "recovery") {
          this.append({
            type: "assessment-resumed",
            handoffId: recovery.assessmentHandoffId,
            basisUserEntryId: this.lastDeliveredUser(this.sources(completed), inputs),
            ...(reservation ? { reservation } : {}),
          });
        }
      }
      if (h.kind === "return" && completed.assessment?.view === "suspended" && reservation) {
        this.append({
          type: "assessment-resumed",
          handoffId: h.id,
          basisUserEntryId: this.lastDeliveredUser(this.sources(completed), inputs),
          reservation,
        });
      }
      if (!attentionProblems.length) this.projectionError = undefined;
    } catch (error) {
      if (this.current(subject) && !this.store?.blocked && !this.error && this.stateData().pendingId === h.id) {
        this.append({
          type: "handoff-state",
          handoffId: h.id,
          state: "blocked",
          reason: error instanceof Error ? error.message.slice(0, 4096) : "configuration_failed",
        });
        this.ctx.ui?.notify?.(
          `Couldn’t switch to ${h.to === "coordinator" ? "Coordinator" : "Executor"} — ${["return", "recovery-return"].includes(h.kind) ? "report" : "assignment"} saved.`,
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
          ["return", "recovery-return"].includes(pending.kind) && this.projectionError,
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
      const recovery = state.recoveryId ? state.recoveries.get(state.recoveryId) : undefined;
      if (assignment?.state === "returned" && recovery?.state === "reading") {
        check(
          user === this.executorBasis(state, assignment.id) || coordinatorSawInput,
          "input_unreconciled",
          "New input needs Coordinator attention before evidence recovery can resume.",
        );
        this.append({
          type: "control",
          control: "automatic",
          profile: "executor",
          reason: "Explicit user resume of unchanged evidence recovery; ordinary assignment work remains ended",
        });
        await this.applyPair(this.profilePair("executor"));
      } else if (assignment?.state === "outstanding") {
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
        check(words.length === 2 || (words.length === 3 && words[2] === "diagnostics"), "invalid_history_command");
        ctx.ui.notify(
          JSON.stringify(
            words[2] === "diagnostics" ? this.status(30) : this.inspectUnit({ view: "history", limit: 30 }),
          ),
          "info",
        );
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
