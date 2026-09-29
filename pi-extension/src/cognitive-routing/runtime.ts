import { estimateRequest } from "./budget.js";
import { annotateSources } from "./provenance.js";
import { ROUTING_SCHEMAS } from "./schemas.js";
import { randomUUID } from "node:crypto";
import { EventStore, type SessionReader } from "./events.js";
import { ROUTING_RECOVERY_HINT, RoutingSession, type Subject } from "./session.js";
import { ToolGate } from "./gate.js";
import { ModelControl } from "./model-control.js";

export { ROUTING_RECOVERY_HINT };
import { Sources, bodyHash, deliveredSelection, isTaskEvidence, type Source } from "./sources.js";
import { type CognitiveRoutingCapabilityState } from "./config.js";
import { representationProblems, prepareView, changeSelection, type PreparedView } from "./projection.js";
import { presetWarnings } from "./economics.js";
import { initialState } from "./state.js";
import {
  PROFILES,
  ROUTING_ENTRY,
  ROUTING_MESSAGE,
  ROUTING_ATTENTION_MESSAGE,
  RoutingError,
  canonical,
  emptySelection,
  isWorkerProfile,
  requireCondition as check,
  samePair,
  type DelegationMode,
  type Profile,
  type WorkerProfile,
  type Pair,
  type State,
  type Handoff,
  type Recovery,
  type NativeEntry,
  type Execution,
  type Problem,
  type ResultGrant,
  ROUTING_TOOLS,
  type EffectFencePort,
  type ResultGrantPort,
  type RoutingOperationScope,
} from "./types.js";

const HANDOFF_TOOLS = new Set(["freeflow_delegate", "freeflow_return"]);

export { ROUTING_TOOLS, type EffectFencePort, type ResultGrantPort, type RoutingOperationScope };

export class RoutingRuntime {
  readonly gate: ToolGate;
  readonly models: ModelControl;
  /** State shared with every part of routing for the bound session. */
  readonly session = new RoutingSession();
  private targetSignature?: string;
  private resultGrants?: ResultGrantPort;
  private effectFence?: EffectFencePort;
  constructor(
    private readonly pi: any,
    private readonly packageRoots: readonly string[] = [],
  ) {
    this.models = new ModelControl(this.session, this.pi);
    this.gate = new ToolGate(this.session, this.packageRoots);
  }
  get projectionEnabled(): boolean {
    return this.session.projectionEnabled;
  }
  setResultGrantPort(port: ResultGrantPort): void {
    this.resultGrants = port;
  }
  setEffectFencePort(port: EffectFencePort): void {
    this.effectFence = port;
  }
  async settled(ctx: any): Promise<void> {
    if (!this.session.store || !this.session.supported() || this.session.store.blocked || !ctx.isIdle?.()) return;
    this.session.ctx = ctx;
    this.session.retireUnbound(
      "Native run settled without a complete source binding; prior effects remain unresolved.",
    );
  }
  state() {
    let state: State;
    try {
      state = this.session.stateData();
    } catch {
      state = initialState();
    }
    const blocked = this.session.error ?? this.session.store?.blocked;
    return {
      effective: this.session.supported() && state.control !== "inactive" && !blocked,
      activeProfile: state.profile,
      delegation: this.session.delegation(state),
      controlMode: state.control === "manual" ? `manual-${state.profile}` : state.control,
      runtimeStatus: blocked
        ? ("blocked" as const)
        : this.session.supported() && state.control !== "inactive"
          ? ("active" as const)
          : ("inactive" as const),
      runtimeReason:
        blocked ?? (this.session.suppressed ? "startup_selection" : this.session.capability?.blockingReason.message),
      projectionFailure: this.session.projectionError,
      ...((pending) => (pending ? { pendingPair: `${pending.modelId}/${pending.thinking}` } : {}))(
        this.models.pending(),
      ),
      ...(this.models.heldMismatch(state) ? { pairMismatch: true } : {}),
      ...((warnings) => (warnings.length ? { presetWarnings: warnings } : {}))(this.models.presetWarnings(state)),
    };
  }
  /** The Coordinator's model while a delegated worker holds the assignment; the Coordinator resumes on return. */
  suspendedCoordinator(): { provider: string; modelId: string; requester: "coordinator" } | undefined {
    try {
      const state = this.session.stateData();
      if (
        !this.session.supported() ||
        state.control !== "automatic" ||
        !isWorkerProfile(state.profile) ||
        !state.assignmentId
      )
        return;
      const pair = this.session.profilePair("coordinator");
      return { provider: pair.provider, modelId: pair.modelId, requester: "coordinator" };
    } catch {
      return;
    }
  }
  /** The outstanding worker responsibility that no later user input has overtaken, if any. */
  private resumableAssignment(state: State): { worker: WorkerProfile; assignmentId: string } | undefined {
    const assignment = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
    const reading = state.recoveryId !== undefined && state.recoveries.get(state.recoveryId)?.state === "reading";
    if (state.control !== "automatic" || !assignment || (assignment.state !== "outstanding" && !reading)) return;
    let worker: WorkerProfile;
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
  private interruptedRun(state: State): boolean {
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
  private async resumeAfterCrash(ctx: any, token: string): Promise<void> {
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
  async bind(ctx: any, capability: CognitiveRoutingCapabilityState, startup = false): Promise<void> {
    this.session.token = randomUUID();
    this.session.ctx = ctx;
    this.session.capability = capability;
    this.session.resetTurn();
    this.session.manualHold = undefined;
    this.session.automaticControl = false;
    this.models.applying = undefined;
    this.models.externalChange = false;
    this.session.error = undefined;
    this.session.projectionError = undefined;
    this.session.operations = Promise.resolve();
    this.targetSignature = canonical({ delegation: capability.delegation, profiles: capability.profiles });
    this.session.suppressed = startup && process.argv.some((a) => /^(--model|--thinking)(=|$)/.test(a));
    this.session.store = new EventStore(this.pi, ctx.sessionManager as SessionReader);
    const subject = this.session.subject();
    if (!capability.effective || this.session.suppressed) return;
    try {
      await this.session.store.reconcile();
      this.session.guard(subject);
      const state = this.session.stateData();
      this.session.manualHold = state.control === "manual" ? state.profile : undefined;
      this.session.automaticControl = !state.events.size || state.control === "automatic";
      await this.models.validateProfilePairs(this.session.profilePairs(this.session.requiredProfiles(state)));
      this.models.announcePresets(ctx);
      const interrupted = this.interruptedRun(state);
      const resumable = this.resumableAssignment(state);
      this.session.retireUnbound("Session rebind found an unfinished execution; no task effects replayed.");
      if (!state.events.size) {
        await this.models.transition(
          this.session.profilePair("coordinator"),
          () =>
            this.session.append({
              type: "control",
              control: "automatic",
              profile: "coordinator",
              reason: "Initial routing activation",
            }),
          subject,
        );
      } else if (
        state.control === "automatic" &&
        state.profile &&
        !samePair(this.models.intended(), this.session.profilePair(state.profile))
      ) {
        // Reload reconstructs responsibility; it does not silently reapply the last setter.
        await this.models.transition(
          this.session.profilePair("coordinator"),
          () =>
            this.session.append({
              type: "control",
              control: "automatic",
              profile: "coordinator",
              reason: "Rebind reconciles historical responsibility with current host control",
            }),
          subject,
        );
      }
      // Only a run cut off mid-flight resumes on its own; reopening an idle session never starts work.
      if (interrupted && ctx.hasUI) {
        const token = this.session.token;
        setTimeout(() => void this.resumeAfterCrash(ctx, token), 0);
      } else if (resumable)
        ctx.ui?.notify?.(
          `The ${resumable.worker} assignment is unchanged. Run /freeflow resume to continue it; a new message goes to Coordinator.`,
          "info",
        );
    } catch (error) {
      if (this.session.current(subject)) this.session.mark(error);
    }
  }
  /** Write routing events staged before the session's first prompt; nothing to write once routing is unbound. */
  writeStaged(events: readonly unknown[]): void {
    if (!this.session.store || !events.length) return;
    try {
      this.session.store.writeStaged(events);
    } catch (error) {
      this.session.mark(error);
    }
  }
  unbind(): void {
    this.session.token = randomUUID();
    this.session.store = undefined;
    this.session.ctx = undefined;
    this.session.resetTurn();
  }
  async refresh(ctx: any, capability: CognitiveRoutingCapabilityState): Promise<void> {
    this.session.ctx = ctx;
    const was = this.session.capability?.effective === true;
    const signature = canonical({ delegation: capability.delegation, profiles: capability.profiles });
    if (this.session.capability && (was !== capability.effective || signature !== this.targetSignature))
      this.session.revision++;
    this.session.capability = capability;
    if (!capability.effective) {
      this.session.turn = undefined;
      return;
    }
    if (!this.session.store) {
      await this.bind(ctx, capability);
      return;
    }
    if (!was) {
      const subject = this.session.subject();
      this.session.suppressed = false;
      try {
        await this.session.store.reconcile();
        this.session.guard(subject);
        this.session.error = undefined;
        await this.models.transition(
          this.session.profilePair("coordinator"),
          () =>
            this.session.append({
              type: "control",
              control: "automatic",
              profile: "coordinator",
              reason: "Capability re-enabled; Coordinator reconciliation",
            }),
          subject,
        );
        this.session.automaticControl = true;
      } catch (error) {
        if (this.session.current(subject)) this.session.mark(error);
      }
    } else if (this.targetSignature && signature !== this.targetSignature) {
      this.session.error = "configuration_changed: reconcile profile configuration before automatic execution";
      this.session.announceBlock(ctx);
    }
    if (
      canonical({ delegation: this.session.capability?.delegation, profiles: this.session.capability?.profiles }) ===
      signature
    )
      this.targetSignature = signature;
    this.models.announcePresets(ctx);
  }
  async ancestryChanged(ctx: any, navigation = true): Promise<void> {
    this.session.revision++;
    this.session.ctx = ctx;
    this.session.resetTurn();
    if (!this.session.store || !this.session.supported()) return;
    const subject = this.session.subject();
    try {
      await this.session.store.reconcile();
      this.session.guard(subject);
      this.session.error = undefined;
      const state = this.session.stateData();
      await this.models.validateProfilePairs(this.session.profilePairs(this.session.requiredProfiles(state)));
      this.session.retireUnbound(
        "Selected historical ancestry ends before execution binding; effects are not replayed.",
      );
      if (this.session.manualHold) {
        const held = this.session.manualHold;
        await this.models.transition(
          this.session.profilePair(held),
          () =>
            this.session.append({
              type: "control",
              control: "manual",
              profile: held,
              reason: "Current explicit manual hold survives navigation",
            }),
          subject,
        );
      } else if (
        (this.session.automaticControl || !state.events.size) &&
        (navigation || !samePair(this.models.intended(), this.session.profilePair(state.profile ?? "coordinator")))
      ) {
        await this.models.transition(
          this.session.profilePair("coordinator"),
          () =>
            this.session.append({
              type: "control",
              control: "automatic",
              profile: "coordinator",
              reason: "Coordinator reconciles selected native ancestry",
            }),
          subject,
        );
      }
    } catch (error) {
      if (this.session.current(subject)) this.session.mark(error);
    }
  }
  private lastDeliveredUser(sources: Sources, messages: any[]): string | null {
    const delivered = new Set(
      sources.associate(messages).flatMap((x) => (x.source?.message.role === "user" ? [x.source.entry.id] : [])),
    );
    // Compaction may remove every user message from the active view. Retain
    // observed delivery on this ancestry; a stored but undelivered user entry
    // must not advance the basis, and absence must not manufacture new input.
    for (const execution of this.session.stateData().executions.values())
      if (execution.basisUserEntryId) delivered.add(execution.basisUserEntryId);
    for (let i = sources.entries.length - 1; i >= 0; i--) {
      const entry = sources.entries[i];
      if (entry.message?.role === "user" && delivered.has(entry.id)) return entry.id;
    }
    return null;
  }
  private runtimeMessage(state: State, attention = false): any {
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
    const worker = a ? state.handoffs.get(a.delegateHandoffId)?.to : undefined;
    const prepared = state.assessment?.reservation?.selectionRevision;
    // Only material, decision-bearing fields: every change appends a new copy to request history.
    // Control, delegation and projection belong to the Freeflow Runtime State; ids are available through inspection.
    const evidence = a
      ? [
          `Evidence: revision ${selection.revision}; selected ${selection.selected.join(", ") || "none"}`,
          selection.unresolved.length
            ? `unresolved ${selection.unresolved.map((p) => `${p.ref} (${p.code})`).join(", ")}`
            : "",
          selection.withdrawals.length ? `withdrawn ${selection.withdrawals.length}` : "",
          prepared !== undefined && prepared !== selection.revision ? `prepared revision ${prepared}` : "",
        ]
          .filter(Boolean)
          .join("; ")
      : "";
    const content = [
      "# Cognitive Routing Runtime State",
      `Profile: ${state.profile ?? "unresolved"}`,
      `Unit: ${unit ? `U${unitNumber}` : "none"}`,
      `Assignment: ${a ? `A${assignmentNumber} (${worker ?? "unknown"}, ${a.state})` : "none"}`,
      `Handoff: ${h ? `${h.kind} ${h.state}` : "none"}`,
      state.assessment ? `Assessment: ${state.assessment.view}` : "",
      recovery
        ? `Recovery: ${recovery.state}; parent report revision ${recovery.baseReportRevision}; allowed paths ${JSON.stringify(recovery.paths)}; allowed results ${JSON.stringify((recovery.results ?? []).map((grant) => grant.id))}`
        : "",
      recovery?.state === "reading"
        ? `Recovery request: ${recovery.request}\nOnly exact allowed read paths, granted captured results, evidence selection, and recovery return controls are permitted; ordinary task work remains ended.`
        : "",
      evidence,
      this.session.error ? `Blocked: ${this.session.error}` : "",
      this.session.projectionError ? `Evidence limitation: ${this.session.projectionError}` : "",
      attention
        ? recovery
          ? `Assessment paused for attention; ordinary admitted history remains. ${selection.selected.length} sources remain selected. Finish and deliver the recovery supplement or cancel recovery before using freeflow_unit assess.`
          : `Assessment paused for attention; ordinary admitted history remains. ${selection.selected.length} sources remain selected. Use freeflow_unit assess to restore the assessment.`
        : "",
      a?.state === "returned" && recovery?.state !== "reading"
        ? "Worker ordinary task work has ended. Only supported handoff correction is permitted."
        : "",
      isWorkerProfile(this.session.turn?.profile) &&
      a &&
      this.session.turn.basisUserEntryId !== this.session.workerBasis(state, a.id)
        ? `Current input differs from the active ${this.session.turn.profile} responsibility. Account for it; changed direction requires Coordinator attention.`
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
      details: { routingInstance: this.session.token },
    };
  }
  private evidenceFacts(state: State) {
    const selection = state.assignmentId
      ? (state.selections.get(state.assignmentId) ?? emptySelection())
      : emptySelection();
    const sources = this.session.sources(state);
    return {
      revision: selection.revision,
      selected: selection.selected
        .filter((ref) => deliveredSelection(sources, ref))
        .map((ref) => {
          const entry = this.session.ctx?.sessionManager.getEntry?.(ref.slice(4));
          const locator = sources.locator(ref);
          return {
            ref,
            kind: entry?.message?.role ?? "unknown",
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
  private admissionCache?: {
    state: State;
    leaf: string | null;
    admissions: Map<string, number>;
    resumedAt?: number;
  };
  /**
   * Source rank at which each currently selected ref was first admitted, derived from native selection events,
   * and the rank at which the current assessment last resumed from an attention suspension.
   */
  private admissions(state: State): { admissions: Map<string, number>; resumedAt?: number } {
    const reader = this.session.ctx.sessionManager,
      leaf = reader.getLeafId?.() ?? null;
    const cache = this.admissionCache;
    if (cache && cache.state === state && cache.leaf === leaf) return cache;
    const admissions = new Map<string, number>();
    let rank = 0,
      resumedAt: number | undefined;
    for (const entry of reader.getBranch() as NativeEntry[]) {
      if (["message", "custom_message", "compaction", "branch_summary"].includes(entry.type)) rank++;
      else if (entry.type === "custom" && entry.customType === ROUTING_ENTRY) {
        const data = (entry as any).data?.data;
        if (data?.type === "assessment-resumed" && data.handoffId === state.assessment?.handoffId) resumedAt = rank;
        if (data?.type !== "selection-changed") continue;
        const current = state.selections.get(data.assignmentId)?.selected ?? [];
        for (const ref of data.selection?.selected ?? [])
          if (current.includes(ref) && !admissions.has(ref)) admissions.set(ref, rank);
      }
    }
    this.admissionCache = { state, leaf, admissions, resumedAt };
    return this.admissionCache;
  }
  private prepared(profile: Profile, input: any[], handoffId?: string, restoring = false): PreparedView {
    const state = this.session.stateData(),
      model = this.models.model(profile);
    return prepareView({
      ...(({ admissions, resumedAt }) => ({ admissions, resumedAt }))(this.admissions(state)),
      messages: input,
      sources: this.session.sources(state),
      state,
      view: profile,
      projection: this.session.projectionEnabled,
      model,
      pair: this.session.profilePair(profile),
      systemPrompt: this.session.ctx.getSystemPrompt?.() ?? "",
      tools: (this.pi.getAllTools?.() ?? [])
        .filter((tool: any) => this.pi.getActiveTools?.().includes(tool.name))
        .map((tool: any) =>
          ROUTING_TOOLS.includes(tool.name) ? { ...tool, parameters: ROUTING_SCHEMAS[tool.name] } : tool,
        ),
      runtimeMessage: this.runtimeMessage(
        state,
        profile === "coordinator" && state.assessment?.view === "suspended" && !restoring && !handoffId,
      ),
      instance: this.session.token,
      preparingReturn: handoffId,
      restoring,
    });
  }
  budgetNotice(messages: any[], ctx: any): any | undefined {
    if (!this.session.supported()) return;
    const tools = (this.pi.getAllTools?.() ?? []).filter((tool: any) => this.pi.getActiveTools?.().includes(tool.name));
    const estimate = estimateRequest(ctx.getSystemPrompt?.() ?? "", tools, messages, ctx.model);
    if (!estimate.warnings.length) return;
    return {
      role: "custom",
      customType: "freeflow-routing-budget",
      display: false,
      content: estimate.warnings.map((warning) => warning.detail).join("\n"),
      timestamp: 0,
    };
  }
  private ordinaryContext(input: any[]): any[] {
    try {
      const sources = this.session.sources(),
        associated = sources.associate(input);
      const mapped = new Map(associated.filter((item) => item.source).map((item) => [item.message, item.source!]));
      return annotateSources(
        input,
        mapped,
        new Set([...mapped.values()].map((source) => source.ref)),
        sources,
        this.session.token,
      );
    } catch {
      return input;
    }
  }
  async context(ctx: any, incoming: any[]): Promise<any[]> {
    this.session.ctx = ctx;
    const input = incoming.filter(
      (m) =>
        !(
          m?.details?.routingInstance === this.session.token &&
          [ROUTING_MESSAGE, ROUTING_ATTENTION_MESSAGE, "freeflow-routing-v2-refs"].includes(m.customType)
        ),
    );
    this.session.messages = input;
    if (!this.session.supported() || !this.session.store) return this.ordinaryContext(input);
    try {
      const state = this.session.stateData();
      if (state.control !== "automatic") return this.ordinaryContext(input);
      check(
        !this.session.error && !this.session.store.blocked && state.profile,
        "routing_blocked",
        this.session.error ?? this.session.store.blocked,
      );
      this.session.announced = undefined;
      check(samePair(this.session.observed(), this.session.profilePair(state.profile!)), "prepared_pair_mismatch");
      const sources = this.session.sources(state),
        user = this.lastDeliveredUser(sources, input);
      if (state.assessment && user && user !== state.assessment.basisUserEntryId)
        this.session.append(
          {
            type: "assessment-suspended",
            handoffId: state.assessment.handoffId,
            reason: "user-attention",
            basisUserEntryId: user,
            problems: [],
          },
          JSON.stringify(["attention", state.assessment.handoffId, user]),
        );
      // New input reaching an already prepared worker request cannot be rerouted by changing only the live model.
      const outstanding = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
      const worker = outstanding ? this.session.assignedWorker(state, outstanding.id) : undefined;
      const interrupted =
        isWorkerProfile(state.profile) &&
        (state.profile !== worker ||
          user !== (outstanding ? this.session.workerBasis(state, outstanding.id) : undefined));
      if (!this.session.turn || this.session.turn.bound) {
        this.session.receipts.clear();
        const execution: Execution = {
          id: randomUUID(),
          profile: state.profile!,
          assignmentId: state.assignmentId,
          recoveryId: state.recoveryId,
          basisUserEntryId: user,
          pair: this.session.observed()!,
          resultEntryIds: [],
        };
        const before = new Set((ctx.sessionManager.getBranch() as NativeEntry[]).map((e) => e.id));
        this.session.turn = {
          id: execution.id,
          profile: execution.profile,
          assignmentId: execution.assignmentId,
          recoveryId: execution.recoveryId,
          basisUserEntryId: user,
          before,
          pair: execution.pair,
        };
        this.session.openTurn();
      }
      let prepared = this.prepared(state.profile!, input);
      if (!prepared.ready && state.profile === "coordinator" && this.session.stateData().assessment) {
        const assessment = this.session.stateData().assessment!;
        this.session.append({
          type: "assessment-suspended",
          handoffId: assessment.handoffId,
          reason: "delivery-gap",
          basisUserEntryId: user,
          problems: prepared.problems,
        });
        this.session.projectionError = prepared.problems.map((p) => p.code).join(", ");
        prepared = this.prepared("coordinator", input);
      }
      check(prepared.ready, "context_unavailable", prepared.problems.map((p) => p.detail).join("; "));
      const known = this.session.stateData().exposure;
      const added = prepared.fullSources.filter((s) => known.get(s.ref) !== s.hash);
      if (isWorkerProfile(this.session.turn.profile))
        for (let i = 0; i < added.length; i += 128)
          this.session.append({
            type: "sources-exposed",
            executionId: this.session.turn.id,
            view: this.session.turn.profile,
            sources: added.slice(i, i + 128).map((s) => ({ ref: s.ref, bodyHash: s.hash })),
          });
      if (interrupted)
        prepared.messages.push({
          role: "custom",
          customType: ROUTING_ATTENTION_MESSAGE,
          display: false,
          timestamp: 0,
          details: { routingInstance: this.session.token },
          content:
            "New delivered user input requires Coordinator attention. Do not run ordinary task tools; return the current partial result.",
        });
      return prepared.messages;
    } catch (error) {
      this.session.mark(error);
      this.session.announceBlock(ctx);
      ctx.abort?.();
      // Do not send an accidental full worker history on a projection failure.
      return [
        {
          role: "custom",
          customType: ROUTING_MESSAGE,
          content: `Automatic request blocked: ${this.session.error}. ${ROUTING_RECOVERY_HINT}`,
          display: false,
          timestamp: 0,
          details: { routingInstance: this.session.token, routingRequestBlocked: true },
        },
      ];
    }
  }
  messageEnd(message: any): void {
    if (message?.role === "assistant" && this.session.turn && !this.session.turn.bound)
      this.session.turn.message = structuredClone(message);
  }
  private callOperation(callId: string, name: string): string {
    check(this.session.turn && this.session.store, "execution_missing");
    this.gate.batch(callId, name);
    return JSON.stringify([this.session.store.reader.getSessionId(), this.session.turn.id, callId, name]);
  }
  private result(value: any): any {
    return { content: [{ type: "text", text: JSON.stringify(value) }], details: value };
  }
  async invoke(name: string, callId: string, input: any, signal: AbortSignal | undefined, ctx: any): Promise<any> {
    return this.session.enqueue(async () => {
      this.session.ctx = ctx;
      try {
        check(!signal?.aborted, "cancelled");
        if (name === "freeflow_unit" && input.operation === "inspect") {
          check(this.session.supported(), "routing_unavailable");
          return this.result(this.inspectUnit(input));
        }
        const state = this.session.stateData();
        const expected =
          name === "freeflow_delegate" || name === "freeflow_unit" ? "coordinator" : this.session.assignedWorker(state);
        this.session.assertAvailable(expected);
        const op = this.callOperation(callId, name);
        const cached = this.session.receipts.get(op);
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
                  ? await this.unit(input, callId, op)
                  : undefined;
        if (value !== undefined) {
          this.session.receipts.set(op, { input: canonical(input), value: structuredClone(value) });
          return this.result(value);
        }
        throw new RoutingError("unknown_tool", name);
      } catch (error) {
        return this.result({
          status: "blocked",
          code: error instanceof RoutingError ? error.code : "operation_failed",
          message: error instanceof Error ? error.message : String(error),
          problems: error instanceof RoutingError ? error.problems : [],
          observed: this.session.observed(),
          expectedProfile:
            name === "freeflow_unit" && input.operation === "inspect"
              ? undefined
              : name === "freeflow_delegate" || name === "freeflow_unit"
                ? "coordinator"
                : (() => {
                    try {
                      return this.session.assignedWorker(this.session.stateData());
                    } catch {
                      return undefined;
                    }
                  })(),
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
  private duplicate(op: string): any {
    return [...this.session.stateData().events.values()].find(
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
  private delegate(input: any, callId: string, op: string) {
    const prior = this.duplicate(op);
    if (prior) {
      check(
        prior.data.type === "delegate-accepted" &&
          prior.data.assignment.contract === input.contract &&
          (input.worker === undefined || prior.data.handoff.to === input.worker),
        "operation_conflict",
      );
      return { status: "accepted", handoff: prior.data.handoff.id, unchanged: true };
    }
    const state = this.session.stateData();
    const enabled = this.session.enabledWorkers();
    let worker: WorkerProfile;
    if (input.worker === undefined) {
      check(enabled.length === 1, "worker_required", "Delegation mode 'both' requires choosing helper or executor.");
      worker = enabled[0]!;
    } else {
      check(isWorkerProfile(input.worker), "invalid_worker");
      worker = input.worker;
    }
    check(enabled.includes(worker), "worker_disabled", `${worker} is not enabled by delegation mode.`);
    const unit = state.unitId
      ? state.units.get(state.unitId)!
      : { id: randomUUID(), objective: input.contract, state: "open" as const, assignmentIds: [] };
    const old = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
    if (input.operation === "replace")
      check(old?.state === "outstanding" && !this.models.applying, "no_quiescent_assignment");
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
      state: "outstanding" as const,
      delegateHandoffId: id,
      basisUserEntryId: this.session.turn!.basisUserEntryId,
    };
    const h: Handoff = {
      id,
      kind: "delegate",
      assignmentId,
      text: input.contract,
      from: "coordinator",
      to: worker,
      executionId: this.session.turn!.id,
      toolCallId: callId,
      basisUserEntryId: this.session.turn!.basisUserEntryId,
      state: "pending",
      reportRevision: 0,
      limitations: [],
    };
    this.session.append(
      {
        type: "delegate-accepted",
        unit: { ...unit, assignmentIds: [...unit.assignmentIds, assignmentId] },
        assignment,
        handoff: h,
        ...(input.operation === "replace"
          ? {
              replacement: {
                assignmentId: old!.id,
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
      worker,
      handoff: id,
      transition: "pending",
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
  private returnReport(input: any, callId: string, op: string) {
    const state = this.session.stateData(),
      a = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
    check(a, "assignment_missing");
    const worker = this.session.assignedWorker(state, a.id);
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
      this.session.append(
        {
          type: "handoff-retry-requested",
          handoffId: saved.id,
          attemptId: randomUUID(),
          executionId: this.session.turn!.id,
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
      const h: Handoff = {
        id: supplement?.id ?? randomUUID(),
        kind: "recovery-return",
        assignmentId: a.id,
        text: input.report,
        from: worker,
        to: "coordinator",
        executionId: this.session.turn!.id,
        toolCallId: callId,
        basisUserEntryId: this.session.turn!.basisUserEntryId,
        state: "pending",
        reportRevision: (supplement?.reportRevision ?? 0) + 1,
        outcome: input.outcome,
        limitations: input.limitations ?? [],
      };
      this.session.append({ type: "recovery-supplement-accepted", recoveryId: recovery.id, handoff: h }, op);
      return this.returnReadiness(h.id);
    }
    check(input.operation === "submit", "invalid_return_operation");
    check(
      input.outcome !== "completed" || !this.effectFence?.status().unresolvedEffects,
      "unresolved_effect",
      "A clean completed return is unavailable while a live effect requires reconciliation.",
    );
    check(
      a.state === "outstanding" ||
        (a.state === "returned" && original && ["pending", "blocked"].includes(original.state)),
      "assignment_task_ended",
    );
    const h: Handoff = {
      id: original?.id ?? randomUUID(),
      kind: "return",
      assignmentId: a.id,
      text: input.report,
      from: worker,
      to: "coordinator",
      executionId: this.session.turn!.id,
      toolCallId: callId,
      basisUserEntryId: this.session.turn!.basisUserEntryId,
      state: "pending",
      reportRevision: (original?.reportRevision ?? 0) + 1,
      outcome: input.outcome,
      limitations: input.limitations ?? [],
    };
    this.session.append({ type: "return-accepted", handoff: h }, op);
    return this.returnReadiness(h.id);
  }
  private returnReadiness(id: string) {
    const state = this.session.stateData();
    const h = state.handoffs.get(id)!;
    const prepared = this.prepared("coordinator", this.session.messages, id);
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
      producer: h.from,
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
      // The text is already in the call arguments; the hash identifies it without a second copy.
      ...(isSupplement ? { supplementSha256: bodyHash(h.text) } : { reportSha256: bodyHash(h.text) }),
      evidence: this.evidenceFacts(state),
    };
  }
  private project(input: any, op: string) {
    check(this.session.projectionEnabled, "projection_disabled");
    const state = this.session.stateData(),
      a = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
    check(a, "assignment_missing");
    const sources = this.session.sources(state);
    sources.associate(this.session.messages);
    const selection = state.selections.get(a.id) ?? emptySelection();
    let next = selection;
    if (input.operation !== "inspect") {
      check(["add", "remove"].includes(input.operation), "invalid_projection_operation");
      next = changeSelection(selection, input, sources, state);
      if (next !== selection)
        this.session.append({ type: "selection-changed", assignmentId: a.id, selection: next }, op);
    }
    const prepared = this.prepared("coordinator", this.session.messages, a.returnHandoffId);
    const scope = input.scope ?? "assignment";
    let page: any;
    if (input.operation === "inspect") {
      const model = this.models.model("coordinator");
      const checksFor = (s: Source) => {
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
              isWorkerProfile(s.producer) &&
              (isTaskEvidence(s) || (scope === "selected" && next.selected.includes(s.ref))) &&
              (scope === "selected"
                ? next.selected.includes(s.ref)
                : scope === "assignment"
                  ? s.assignmentId === a.id
                  : scope === "active"
                    ? s.active
                    : true),
          )
          .map((s) => {
            const locator = sources.locator(s.ref);
            return {
              ref: s.ref,
              kind: s.message.role,
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
            eligible: rows.filter((r: any) => r.eligible).length,
            targetReady: rows.filter((r: any) => r.targetReady).length,
          },
          otherAssignments: [...sources.byRef.values()].filter(
            (s) =>
              isWorkerProfile(s.producer) && s.assignmentId !== a.id && isTaskEvidence(s) && checksFor(s).targetReady,
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
              eligible: page.items.filter((r: any) => r.eligible).length,
              targetReady: page.items.filter((r: any) => r.targetReady).length,
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
      evidence: this.evidenceFacts(this.session.stateData()),
      items: (input.refs ? [...new Set<string>(input.refs)] : []).map((ref) => ({
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
  private async unit(input: any, callId: string, op: string) {
    const state = this.session.stateData();
    const prior = [...state.events.values()].find((e) => e.operationId === op);
    if (prior) {
      if (input.operation === "recover") {
        check(
          prior.data.type === "recovery-request-accepted" &&
            prior.data.recovery.request === input.request &&
            canonical(prior.data.recovery.requestedPaths) === canonical([...new Set<string>(input.paths ?? [])]) &&
            canonical(prior.data.recovery.requestedResults ?? []) === canonical(input.results ?? []),
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
          paths: recovery.paths,
          results: recovery.results ?? [],
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
          !this.models.applying,
        "recovery_not_available",
      );
      const worker = this.session.assignedWorker(state, a.id);
      const id = randomUUID(),
        handoffId = randomUUID();
      const paths = [
        ...new Set<string>((input.paths ?? []).map((path: string) => this.gate.canonicalRecoveryPath(path))),
      ];
      const requestedResults = [...(input.results ?? [])] as string[];
      check(new Set(requestedResults).size === requestedResults.length, "duplicate_result_grant");
      const results: ResultGrant[] = [];
      for (const resultId of requestedResults) {
        const grant = await this.resultGrants?.resolve(resultId, this.session.ctx);
        check(grant?.id === resultId, "result_unavailable", `Captured result is unavailable: ${resultId}`);
        results.push(grant);
      }
      const recovery: Recovery = {
        id,
        assignmentId: a.id,
        assessmentHandoffId: base.id,
        baseReportRevision: base.reportRevision,
        request: input.request,
        requestedPaths: [...new Set<string>(input.paths ?? [])],
        paths,
        requestedResults,
        results,
        state: "requested",
        requestHandoffId: handoffId,
        supplementRevision: 0,
      };
      const handoff: Handoff = {
        id: handoffId,
        kind: "recovery-request",
        assignmentId: a.id,
        text: input.request,
        from: "coordinator",
        to: worker,
        executionId: this.session.turn!.id,
        toolCallId: callId,
        basisUserEntryId: this.session.turn!.basisUserEntryId,
        state: "pending",
        reportRevision: 0,
        limitations: [],
      };
      this.session.append({ type: "recovery-request-accepted", recovery, handoff }, op);
      return {
        status: "accepted",
        recovery: id,
        handoff: handoffId,
        assignmentRef: `assignment:${a.id}`,
        reportRef: `report:${base.id}:${base.reportRevision}`,
        paths,
        results,
        transition: "pending",
      };
    }
    if (input.operation === "cancel-recovery") {
      check(state.recoveryId && !this.models.applying, "recovery_not_cancellable");
      check(
        ![...state.executions.values()].some(
          (execution) =>
            execution.recoveryId === state.recoveryId &&
            isWorkerProfile(execution.profile) &&
            !execution.assistantEntryId &&
            !execution.interrupted,
        ),
        "recovery_not_cancellable",
      );
      this.session.append({ type: "recovery-cancelled", recoveryId: state.recoveryId, reason: input.reason }, op);
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
      const prepared = this.prepared("coordinator", this.session.messages, state.assessment.handoffId, true);
      if (!prepared.ready) return { status: "suspended", ready: false, problems: prepared.problems };
      if (this.session.projectionEnabled) check(prepared.reservation, "reservation_missing");
      this.session.append(
        {
          type: "assessment-resumed",
          handoffId: state.assessment.handoffId,
          basisUserEntryId: this.session.turn!.basisUserEntryId,
          ...(prepared.reservation ? { reservation: prepared.reservation } : {}),
        },
        op,
      );
      this.session.projectionError = undefined;
      return {
        status: "resumed",
        ready: true,
        stage: "prepared assessment; next request revalidated",
        evidence: this.evidenceFacts(this.session.stateData()),
      };
    }
    check(input.operation === "close" && state.unitId, "unit_missing");
    const a = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
    check(!this.models.applying, "not_quiescent");
    check(
      input.outcome !== "accepted" || !this.effectFence?.status().unresolvedEffects,
      "unresolved_effect",
      "Accepted closure is unavailable while a live effect requires reconciliation.",
    );
    if (state.recoveryId) {
      check(input.outcome !== "accepted", "unfinished_work");
      check(
        ![...state.executions.values()].some(
          (execution) =>
            execution.recoveryId === state.recoveryId &&
            isWorkerProfile(execution.profile) &&
            !execution.assistantEntryId &&
            !execution.interrupted,
        ),
        "not_quiescent",
      );
    }
    this.session.append(
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
  private page(
    scope: string,
    rows: any[] | (() => any[]),
    cursor?: string,
    size = 30,
    assignment?: string,
    active = false,
    summarize?: (rows: any[]) => any,
  ): any {
    const branch = this.session.ctx.sessionManager.getBranch() as NativeEntry[];
    const compaction = branch.filter((e) => e.type === "compaction").at(-1)?.id;
    let key: string,
      offset = 0;
    if (cursor) {
      const match = /^([a-f0-9-]+):([0-9]+)$/.exec(cursor);
      check(match, "invalid_cursor", "Use the returned cursor unchanged.");
      key = match[1];
      offset = Number(match[2]);
      const page = this.session.pages.get(key);
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
      if (this.session.pages.size >= 8) this.session.pages.delete(this.session.pages.keys().next().value!);
      const items = typeof rows === "function" ? rows() : rows;
      this.session.pages.set(key, {
        scope,
        basis: branch.at(-1)?.id ?? null,
        assignment,
        compaction,
        rows: items,
        size,
        summary: summarize?.(items),
      });
    }
    const page = this.session.pages.get(key)!;
    return {
      scope,
      count: page.rows.length,
      offset,
      summary: page.summary,
      items: page.rows.slice(offset, offset + page.size),
      nextCursor: offset + page.size < page.rows.length ? `${key}:${offset + page.size}` : undefined,
    };
  }
  private inspectUnit(input: any): any {
    const state = this.session.stateData(),
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
          const delegate = state.handoffs.get(a.delegateHandoffId);
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
            from: delegate?.from,
            to: delegate?.to,
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
          results: recovery.results ?? [],
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
      let supplement: Handoff | undefined;
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
    let savedRevision: Handoff | undefined;
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
  status(limit = 0): any {
    const state = this.session.stateData();
    const unit = state.unitId ? state.units.get(state.unitId) : undefined;
    const a = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
    return {
      ...this.state(),
      unit: unit ? { id: unit.id, state: unit.state, assignments: unit.assignmentIds.length } : null,
      assignment: a ? { id: a.id, state: a.state, worker: this.session.assignedWorker(state, a.id) } : null,
      pendingHandoff: state.pendingId ?? null,
      recovery: state.recoveryId
        ? (() => {
            const recovery = state.recoveries.get(state.recoveryId!);
            return recovery
              ? {
                  id: recovery.id,
                  state: recovery.state,
                  assignmentId: recovery.assignmentId,
                  assessmentHandoffId: recovery.assessmentHandoffId,
                  paths: recovery.paths,
                  results: recovery.results ?? [],
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
  async turnEnd(event: any, ctx: any): Promise<void> {
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
      const candidates = (ctx.sessionManager.getBranch() as NativeEntry[]).filter(
        (e) => !turn.before.has(e.id) && e.type === "message" && canonical(e.message) === canonical(message),
      );
      check(candidates.length === 1, "execution_binding_ambiguous");
      const assistant = candidates[0];
      const callIds = new Set((message?.content ?? []).filter((b: any) => b.type === "toolCall").map((b: any) => b.id));
      const results = (ctx.sessionManager.getBranch() as NativeEntry[]).filter(
        (e) => !turn.before.has(e.id) && e.message?.role === "toolResult" && callIds.has(e.message.toolCallId),
      );
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
  private async finishHandoff(h: Handoff, inputs: any[], token: string): Promise<void> {
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
    let attentionProblems: Problem[] = [];
    if (["return", "recovery-return"].includes(h.kind) && this.session.projectionEnabled) {
      const prepared = this.prepared("coordinator", inputs, h.id);
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
            basisUserEntryId: this.lastDeliveredUser(this.session.sources(completed), inputs),
            problems: attentionProblems,
          });
        } else if (completed.assessment.suspensionReason === "recovery") {
          this.session.append({
            type: "assessment-resumed",
            handoffId: recovery.assessmentHandoffId,
            basisUserEntryId: this.lastDeliveredUser(this.session.sources(completed), inputs),
            ...(reservation ? { reservation } : {}),
          });
        }
      }
      if (h.kind === "return" && completed.assessment?.view === "suspended" && reservation) {
        this.session.append({
          type: "assessment-resumed",
          handoffId: h.id,
          basisUserEntryId: this.lastDeliveredUser(this.session.sources(completed), inputs),
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
  async resume(ctx: any): Promise<void> {
    this.session.ctx = ctx;
    check(ctx.isIdle?.(), "not_idle");
    check(this.session.store && this.session.capability?.effective, "routing_unavailable");
    return this.session.enqueue(() => {
      this.session.revision++;
      return this.resumeCurrent(ctx, this.session.subject());
    });
  }
  private async resumeCurrent(ctx: any, subject: Subject): Promise<void> {
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
      const user = this.lastDeliveredUser(new Sources(ctx.sessionManager.getBranch(), state), input);
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
          this.session.profilePair(worker!),
          () =>
            this.session.append({
              type: "control",
              control: "automatic",
              profile: worker!,
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
          this.session.profilePair(worker!),
          () => {
            this.session.append({ type: "assignment-resumed", assignmentId: assignment.id, basisUserEntryId: user });
            this.session.append({
              type: "control",
              control: "automatic",
              profile: worker!,
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
  async command(args: string, ctx: any): Promise<boolean> {
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
      this.session.ctx = ctx;
      if (words[0] === "resume" && words.length === 1) {
        await this.resume(ctx);
        return true;
      }
      check(
        words.length === 2 && [...PROFILES, "auto"].includes(words[1]),
        "invalid_profile_command",
        "Use /freeflow profile coordinator|helper|executor|auto|history, or /freeflow resume.",
      );
      const result =
        words[1] === "auto"
          ? await this.models.setAutomaticControl()
          : await this.models.setManualProfile(words[1] as Profile);
      ctx.ui.notify(JSON.stringify(result), result.status === "blocked" ? "warning" : "info");
    } catch (error) {
      ctx.ui.notify(error instanceof Error ? error.message : String(error), "warning");
    }
    return true;
  }
  beforeRun(ctx: any) {
    return this.models.beforeRun(ctx);
  }
  nativeChange(ctx: any) {
    return this.models.nativeChange(ctx);
  }
  cycleManualProfile() {
    return this.models.cycleManualProfile();
  }
  setManualProfile(profile: Profile, _mechanism?: string) {
    return this.models.setManualProfile(profile, _mechanism);
  }
  setAutomaticControl(_mechanism?: string) {
    return this.models.setAutomaticControl(_mechanism);
  }
  sessionProfileOverrides() {
    return this.models.sessionProfileOverrides();
  }
  sessionDelegationOverride() {
    return this.models.sessionDelegationOverride();
  }
  setSessionDelegationOverride(override: DelegationMode | null, mechanism = "Session delegation override") {
    return this.models.setSessionDelegationOverride(override, mechanism);
  }
  setSessionProfileOverride(profile: Profile, override: Pair | null, mechanism = "Session profile override") {
    return this.models.setSessionProfileOverride(profile, override, mechanism);
  }
  resetSessionProfileOverrides(mechanism = "Reset session profile overrides") {
    return this.models.resetSessionProfileOverrides(mechanism);
  }
  preflight(event: any, ctx: any) {
    return this.gate.preflight(event, ctx);
  }
  operationScope(ctx = this.session.ctx) {
    return this.gate.operationScope(ctx);
  }
  observationScope() {
    return this.gate.observationScope();
  }
  admitOperation(
    scope: RoutingOperationScope,
    effect: "captured-read" | "live-read" | "mutation",
    _operation: { id: string; revision: string },
    ctx = this.session.ctx,
  ) {
    return this.gate.admitOperation(scope, effect, _operation, ctx);
  }
  admitProgram(scope: RoutingOperationScope, ctx = this.session.ctx) {
    return this.gate.admitProgram(scope, ctx);
  }
  resultReadAccess(id: string) {
    return this.gate.resultReadAccess(id);
  }
}
