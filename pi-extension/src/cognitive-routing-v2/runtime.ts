import { estimateRequest } from "./budget.js";
import { annotateSources } from "../session-sources/provenance.js";
import { ROUTING_SCHEMAS } from "./schemas.js";
import { randomUUID } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { relative, resolve as resolvePath } from "node:path";
import { EventStore, type SessionReader } from "../session-sources/events.js";
import { Sources, bodyHash, textRef, isTaskEvidence, type Source } from "../session-sources/sources.js";
import { pairFromProfile, resolveCognitiveRoutingState, type CognitiveRoutingCapabilityState } from "./config.js";
import { prepareView, changeSelection, representationProblems, type PreparedView } from "./projection.js";
import { initialState } from "./state.js";
import {
  ROUTING_ENTRY,
  ROUTING_MESSAGE,
  PROFILES,
  RoutingError,
  canonical,
  emptySelection,
  idFor,
  isWorkerProfile,
  requireCondition as check,
  samePair,
  workersForDelegation,
  type Profile,
  type WorkerProfile,
  type View,
  type Pair,
  type State,
  type Handoff,
  type Recovery,
  type NativeEntry,
  type EventData,
  type Execution,
  type Problem,
  type ResultGrant,
} from "./types.js";

export const ROUTING_TOOLS = ["freeflow_delegate", "freeflow_return", "freeflow_unit", "freeflow_project"] as const;
const HANDOFF_TOOLS = new Set(["freeflow_delegate", "freeflow_return"]);
interface Turn {
  id: string;
  profile: View;
  assignmentId?: string;
  recoveryId?: string;
  basisUserEntryId: string | null;
  before: Set<string>;
  message?: any;
  bound?: string;
  sourceFingerprint?: string;
  opened?: boolean;
  pair: Pair;
}
export interface ResultGrantPort {
  resolve(id: string, ctx: any): Promise<ResultGrant | undefined>;
}
export interface EffectFencePort {
  status(): { unresolvedEffects: number };
}
export interface RoutingOperationScope {
  token: string;
  revision: number;
  sessionId?: string;
  supported: boolean;
  control: string;
  profile?: Profile;
  assignmentId?: string;
  turnId?: string;
  basisUserEntryId?: string | null;
}
interface Subject {
  token: string;
  revision: number;
  store: EventStore | undefined;
  leafId: string | null;
  userId: string | null;
}
export class RoutingRuntime {
  private store?: EventStore;
  private ctx: any;
  private capability?: CognitiveRoutingCapabilityState;
  private token = randomUUID();
  private turn?: Turn;
  private messages: any[] = [];
  private error?: string;
  private projectionError?: string;
  private suppressed = false;
  private applying?: Pair;
  private externalChange = false;
  private targetSignature?: string;
  private operations: Promise<unknown> = Promise.resolve();
  private revision = 0;
  private receipts = new Map<string, { input: string; value: any }>();
  private pages = new Map<
    string,
    {
      scope: string;
      basis: string | null;
      assignment?: string;
      compaction?: string;
      rows: any[];
      size: number;
      summary?: any;
    }
  >();
  private manualHold?: Profile;
  private automaticControl = false;
  private sourceCache?: { entries: NativeEntry[]; authors: number; source: Sources };
  private resultGrants?: ResultGrantPort;
  private effectFence?: EffectFencePort;
  constructor(
    private readonly pi: any,
    private readonly packageRoots: readonly string[] = [],
  ) {}
  setResultGrantPort(port: ResultGrantPort): void {
    this.resultGrants = port;
  }
  setEffectFencePort(port: EffectFencePort): void {
    this.effectFence = port;
  }
  private subject(): Subject {
    const branch = this.store?.reader.getBranch() ?? [];
    return {
      token: this.token,
      revision: this.revision,
      store: this.store,
      leafId: branch.at(-1)?.id ?? null,
      userId: branch.filter((e) => e.message?.role === "user").at(-1)?.id ?? null,
    };
  }
  private current(s: Subject): boolean {
    if (s.token !== this.token || s.revision !== this.revision || s.store !== this.store) return false;
    const branch = this.store?.reader.getBranch() ?? [];
    return (
      (!s.leafId || branch.some((e) => e.id === s.leafId)) &&
      (branch.filter((e) => e.message?.role === "user").at(-1)?.id ?? null) === s.userId
    );
  }
  private guard(s: Subject): void {
    check(
      this.current(s),
      "stale_operation",
      "Routing state changed while the operation was waiting; no further effects applied.",
    );
  }
  private taskBasis(state: State, assignmentId: string): string | null | undefined {
    return state.resumeBasis.has(assignmentId)
      ? state.resumeBasis.get(assignmentId)
      : state.assignments.get(assignmentId)?.basisUserEntryId;
  }
  private enabledWorkers(): readonly WorkerProfile[] {
    return workersForDelegation(this.capability?.delegation ?? "executor");
  }
  private assignedWorker(state: State, assignmentId = state.assignmentId): WorkerProfile {
    const assignment = assignmentId ? state.assignments.get(assignmentId) : undefined;
    const handoff = assignment ? state.handoffs.get(assignment.delegateHandoffId) : undefined;
    check(
      handoff?.kind === "delegate" && handoff.assignmentId === assignment?.id && isWorkerProfile(handoff.to),
      "assignment_worker_missing",
      "The current assignment has no valid recorded worker.",
    );
    return handoff.to;
  }
  private requiredProfiles(state = this.stateData()): Profile[] {
    const profiles = new Set<Profile>(["coordinator", ...this.enabledWorkers()]);
    if (state.profile) profiles.add(state.profile);
    if (this.manualHold) profiles.add(this.manualHold);
    const assignment = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
    if (assignment?.state === "outstanding" || state.recoveryId) profiles.add(this.assignedWorker(state));
    const pending = state.pendingId ? state.handoffs.get(state.pendingId) : undefined;
    if (pending && isWorkerProfile(pending.to)) profiles.add(pending.to);
    return [...profiles];
  }
  private retireUnbound(reason: string): void {
    for (const execution of this.stateData().executions.values()) {
      if (!execution.assistantEntryId && !execution.interrupted)
        this.append({ type: "execution-interrupted", executionId: execution.id, reason });
    }
    this.turn = undefined;
  }
  private openTurn(): void {
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
  async settled(ctx: any): Promise<void> {
    if (!this.store || !this.supported() || this.store.blocked || !ctx.isIdle?.()) return;
    this.ctx = ctx;
    this.retireUnbound("Native run settled without a complete source binding; prior effects remain unresolved.");
  }
  async beforeRun(ctx: any): Promise<void> {
    this.ctx = ctx;
    if (!this.store || !this.supported() || this.store.blocked || this.error) return;
    if (this.stateData().control === "automatic" && isWorkerProfile(this.stateData().profile)) {
      const result = await this.control("coordinator", false);
      check(result.status !== "blocked", "reconciliation_required", result.reason);
    }
  }
  private stateData(): State {
    return this.store?.state() ?? initialState();
  }
  private sources(state = this.stateData()): Sources {
    const entries = (this.ctx.sessionManager.getBranch() as NativeEntry[]).filter((e) =>
      ["message", "custom_message", "compaction", "branch_summary"].includes(e.type),
    );
    const cache = this.sourceCache;
    if (
      cache &&
      cache.authors === state.authors.size &&
      entries.length === cache.entries.length &&
      entries.every((e, i) => e === cache.entries[i])
    )
      return cache.source;
    const active = this.ctx.sessionManager.buildContextEntries?.();
    const activeIds = active ? new Set<string>(active.map((e: NativeEntry) => e.id)) : undefined;
    const source = cache?.source ?? new Sources([], state);
    source.refresh(entries, state, activeIds);
    this.sourceCache = { entries, authors: state.authors.size, source };
    return source;
  }
  private observed(ctx = this.ctx): Pair | undefined {
    return ctx?.model?.provider && ctx?.model?.id && ctx?.thinkingLevel
      ? { provider: ctx.model.provider, modelId: ctx.model.id, thinking: ctx.thinkingLevel }
      : undefined;
  }
  private supported(): boolean {
    return !!this.capability?.effective && !this.suppressed;
  }
  state() {
    let state: State;
    try {
      state = this.stateData();
    } catch {
      state = initialState();
    }
    const blocked = this.error ?? this.store?.blocked;
    return {
      effective: this.supported() && state.control !== "inactive" && !blocked,
      activeProfile: state.profile,
      delegation: this.capability?.delegation ?? "executor",
      controlMode: state.control === "manual" ? `manual-${state.profile}` : state.control,
      runtimeStatus: blocked
        ? ("blocked" as const)
        : this.supported() && state.control !== "inactive"
          ? ("active" as const)
          : ("inactive" as const),
      runtimeReason: blocked ?? (this.suppressed ? "startup_selection" : this.capability?.blockingReason.message),
      projectionFailure: this.projectionError,
    };
  }
  observationScope() {
    let state: State;
    try {
      state = this.stateData();
    } catch {
      state = initialState();
    }
    const runtime = this.state();
    const pair = this.observed();
    const profile: Profile | "solo" = runtime.activeProfile ?? "solo";
    const control: "manual" | "automatic" | "inactive" | "unknown" = String(runtime.controlMode).startsWith("manual-")
      ? "manual"
      : runtime.controlMode === "automatic" || runtime.controlMode === "inactive"
        ? runtime.controlMode
        : "unknown";
    return {
      profile,
      control,
      ...(state.assignmentId ? { assignmentId: state.assignmentId } : {}),
      ...(this.turn?.id ? { executionId: this.turn.id } : {}),
      ...(pair ? { provider: pair.provider, modelId: pair.modelId, thinking: pair.thinking } : {}),
    };
  }
  operationScope(ctx = this.ctx): RoutingOperationScope {
    let state: State;
    try {
      state = this.stateData();
    } catch {
      state = initialState();
    }
    const sessionId = ctx?.sessionManager?.getSessionId?.();
    return {
      token: this.token,
      revision: this.revision,
      ...(typeof sessionId === "string" ? { sessionId } : {}),
      supported: this.supported(),
      control: state.control,
      ...(state.profile ? { profile: state.profile } : {}),
      ...(state.assignmentId ? { assignmentId: state.assignmentId } : {}),
      ...(this.turn?.id ? { turnId: this.turn.id } : {}),
      ...(this.turn ? { basisUserEntryId: this.turn.basisUserEntryId } : {}),
    };
  }
  admitOperation(
    scope: RoutingOperationScope,
    effect: "captured-read" | "live-read" | "mutation",
    _operation: { id: string; revision: string },
    ctx = this.ctx,
  ): { kind: "allowed" } | { kind: "denied"; code: string; message: string } {
    try {
      const state = this.stateData();
      if (state.recoveryId && effect !== "captured-read")
        return {
          kind: "denied",
          code: "recovery_live_operation",
          message: "Live operations are unavailable during attached evidence recovery.",
        };
      const current = this.operationScope(ctx);
      const same =
        current.token === scope.token &&
        current.revision === scope.revision &&
        current.sessionId === scope.sessionId &&
        current.supported === scope.supported &&
        current.control === scope.control &&
        current.profile === scope.profile &&
        current.assignmentId === scope.assignmentId &&
        current.turnId === scope.turnId &&
        current.basisUserEntryId === scope.basisUserEntryId;
      return same
        ? { kind: "allowed" }
        : {
            kind: "denied",
            code: "routing_scope_changed",
            message: "Routing responsibility changed before operation execution.",
          };
    } catch {
      return { kind: "denied", code: "routing_unavailable", message: "Routing admission is unavailable." };
    }
  }
  admitProgram(
    scope: RoutingOperationScope,
    ctx = this.ctx,
  ): { kind: "allowed" } | { kind: "denied"; code: string; message: string } {
    try {
      if (this.stateData().recoveryId)
        return {
          kind: "denied",
          code: "recovery_program_unavailable",
          message: "Programs are unavailable during attached evidence recovery.",
        };
      return this.admitOperation(scope, "captured-read", { id: "freeflow_run", revision: "1" }, ctx);
    } catch {
      return { kind: "denied", code: "routing_unavailable", message: "Routing admission is unavailable." };
    }
  }
  resultReadAccess(id: string): { recovery: boolean; sha256?: string } {
    try {
      const state = this.stateData();
      const recovery = state.recoveryId ? state.recoveries.get(state.recoveryId) : undefined;
      if (recovery?.state !== "reading") return { recovery: false };
      const grant = (recovery.results ?? []).find((candidate) => candidate.id === id);
      return { recovery: true, ...(grant ? { sha256: grant.sha256 } : {}) };
    } catch {
      return { recovery: false };
    }
  }
  get projectionEnabled(): boolean {
    return this.supported() && this.capability?.projection === true && this.stateData().control === "automatic";
  }
  private append(data: EventData, op?: string, step?: string) {
    check(this.store, "routing_unavailable");
    return this.store.append(this.store.make(data, op, step));
  }
  private enqueue<T>(action: () => Promise<T> | T): Promise<T> {
    const token = this.token;
    const result = this.operations.then(() => {
      check(token === this.token, "stale_instance");
      return action();
    });
    this.operations = result.catch(() => {});
    return result;
  }
  private mark(error: unknown) {
    if (this.error && error instanceof RoutingError && error.code === "routing_blocked") return;
    this.error =
      error instanceof RoutingError
        ? `${error.code}: ${error.message}`
        : error instanceof Error
          ? error.message
          : String(error);
  }
  private assertAvailable(profile?: Profile) {
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
  private configuredProfilePair(profile: Profile): Pair {
    const configured = this.capability?.profiles[profile];
    check(configured, "profile_missing");
    return pairFromProfile(configured);
  }
  private profilePair(profile: Profile): Pair {
    return this.stateData().profileOverrides.get(profile) ?? this.configuredProfilePair(profile);
  }
  private profilePairs(profiles = this.requiredProfiles()): Partial<Record<Profile, Pair>> {
    return Object.fromEntries(profiles.map((profile) => [profile, this.profilePair(profile)]));
  }
  private async validateProfilePairs(pairs: Partial<Record<Profile, Pair>>): Promise<void> {
    check(pairs.coordinator, "profile_missing", "Configure the coordinator profile.");
    const helper = pairs.helper !== undefined;
    const executor = pairs.executor !== undefined;
    check(helper || executor, "profile_missing", "Configure an enabled worker profile.");
    const delegation = helper && executor ? "both" : helper ? "helper" : "executor";
    const profiles = Object.fromEntries(
      Object.entries(pairs).map(([profile, pair]) => [
        profile,
        { provider: pair!.provider, model: pair!.modelId, thinking: pair!.thinking },
      ]),
    );
    const result = await resolveCognitiveRoutingState(
      { cognitiveRouting: { enabled: true, delegation, profiles } },
      {},
      this.ctx,
    );
    check(result.effective, result.blockingReason.code, result.blockingReason.message);
  }
  private model(profile: Profile) {
    const pair = this.profilePair(profile);
    const model = this.ctx?.modelRegistry?.find(pair.provider, pair.modelId);
    check(model, "profile_unavailable");
    return model;
  }
  async bind(ctx: any, capability: CognitiveRoutingCapabilityState, startup = false): Promise<void> {
    this.token = randomUUID();
    this.ctx = ctx;
    this.capability = capability;
    this.turn = undefined;
    this.manualHold = undefined;
    this.automaticControl = false;
    this.messages = [];
    this.sourceCache = undefined;
    this.receipts.clear();
    this.pages.clear();
    this.applying = undefined;
    this.externalChange = false;
    this.error = undefined;
    this.projectionError = undefined;
    this.operations = Promise.resolve();
    this.targetSignature = canonical({ delegation: capability.delegation, profiles: capability.profiles });
    this.suppressed = startup && process.argv.some((a) => /^(--model|--thinking)(=|$)/.test(a));
    this.store = new EventStore(this.pi, ctx.sessionManager as SessionReader);
    const subject = this.subject();
    if (!capability.effective || this.suppressed) return;
    try {
      await this.store.reconcile();
      this.guard(subject);
      const state = this.stateData();
      this.manualHold = state.control === "manual" ? state.profile : undefined;
      this.automaticControl = !state.events.size || state.control === "automatic";
      await this.validateProfilePairs(this.profilePairs(this.requiredProfiles(state)));
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
  unbind(): void {
    this.token = randomUUID();
    this.store = undefined;
    this.turn = undefined;
    this.messages = [];
    this.ctx = undefined;
    this.sourceCache = undefined;
    this.receipts.clear();
    this.pages.clear();
  }
  async refresh(ctx: any, capability: CognitiveRoutingCapabilityState): Promise<void> {
    this.ctx = ctx;
    const was = this.capability?.effective === true;
    const signature = canonical({ delegation: capability.delegation, profiles: capability.profiles });
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
    if (canonical({ delegation: this.capability?.delegation, profiles: this.capability?.profiles }) === signature)
      this.targetSignature = signature;
  }
  async ancestryChanged(ctx: any, navigation = true): Promise<void> {
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
      const state = this.stateData();
      await this.validateProfilePairs(this.profilePairs(this.requiredProfiles(state)));
      this.retireUnbound("Selected historical ancestry ends before execution binding; effects are not replayed.");
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
  async nativeChange(ctx: any): Promise<void> {
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
  private async applyPair(target: Pair): Promise<void> {
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
  private async control(profile: Profile, manual: boolean): Promise<{ status: string; reason?: string }> {
    this.revision++;
    const subject = this.subject();
    return this.enqueue(async () => {
      try {
        check(this.capability?.effective && this.store, "routing_unavailable");
        if (manual && isWorkerProfile(profile))
          check(
            this.enabledWorkers().includes(profile),
            "worker_disabled",
            `${profile} is not enabled by delegation mode.`,
          );
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
        if (this.current(subject) && !(error instanceof RoutingError && error.code === "worker_disabled"))
          this.mark(error);
        return { status: "blocked", reason: error instanceof Error ? error.message : String(error) };
      }
    });
  }
  setManualProfile(profile: Profile, _mechanism?: string) {
    return this.control(profile, true);
  }
  sessionProfileOverrides(): Partial<Record<Profile, Pair>> {
    return Object.fromEntries(this.stateData().profileOverrides) as Partial<Record<Profile, Pair>>;
  }
  async setSessionProfileOverride(
    profile: Profile,
    override: Pair | null,
    mechanism = "Session profile override",
  ): Promise<{ status: string; reason?: string }> {
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
        const profiles = new Set(this.requiredProfiles(state));
        profiles.add(profile);
        const pairs = this.profilePairs([...profiles]);
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
  async resetSessionProfileOverrides(
    mechanism = "Reset session profile overrides",
  ): Promise<{ status: string; reason?: string }> {
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
        const previous = Object.fromEntries(state.profileOverrides) as Partial<Record<Profile, Pair>>;
        const required = this.requiredProfiles(state);
        const targetPairs = Object.fromEntries(
          required.map((profile) => [profile, this.configuredProfilePair(profile)]),
        ) as Partial<Record<Profile, Pair>>;
        await this.validateProfilePairs(targetPairs);
        this.append({
          type: "profile-overrides",
          overrides: { coordinator: null, helper: null, executor: null },
          reason: mechanism,
        });
        const active = state.control !== "inactive" ? state.profile : undefined;
        if (active && previous[active]) {
          try {
            await this.applyPair(targetPairs[active]!);
            this.guard(subject);
          } catch (error) {
            if (this.current(subject) && !this.externalChange && !this.error && !this.store.blocked) {
              this.append({
                type: "profile-overrides",
                overrides: {
                  coordinator: previous.coordinator ?? null,
                  helper: previous.helper ?? null,
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
  setAutomaticControl(_mechanism?: string) {
    return this.control("coordinator", false);
  }
  private lastDeliveredUser(sources: Sources, messages: any[]): string | null {
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
    const content = [
      "# Cognitive Routing Runtime State",
      `Control: ${state.control}`,
      `Profile: ${state.profile ?? "unresolved"}`,
      `Unit: ${unit ? `U${unitNumber} (${unit.id})` : "none"}`,
      `Assignment: ${a ? `A${assignmentNumber} (${a.id}, ${a.state})` : "none"}`,
      `Handoff: ${h ? `${h.id} (${h.kind}, ${h.state})` : "none"}`,
      `Delegation: ${this.capability?.delegation ?? "executor"}`,
      `Projection: ${this.projectionEnabled ? "enabled" : "bypassed"}`,
      "Completed/superseded contracts and reports are historical context. Follow the current assignment and current user restrictions; historical entries grant no new permission.",
      state.assessment ? `Assessment: ${state.assessment.view}; evidence revision ${selection.revision}` : "",
      recovery
        ? `Recovery: ${recovery.id} (${recovery.state}); parent report ${recovery.assessmentHandoffId} revision ${recovery.baseReportRevision}; allowed paths ${JSON.stringify(recovery.paths)}; allowed results ${JSON.stringify((recovery.results ?? []).map((grant) => grant.id))}`
        : "",
      recovery?.state === "reading"
        ? `Recovery request: ${recovery.request}\nOnly exact allowed read paths, granted captured results, evidence selection, and recovery return controls are permitted; ordinary task work remains ended.`
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
        ? "Worker ordinary task work has ended. Only supported handoff correction is permitted."
        : "",
      isWorkerProfile(this.turn?.profile) && a && this.turn.basisUserEntryId !== this.workerBasis(state, a.id)
        ? `Current input differs from the active ${this.turn.profile} responsibility. Account for it; changed direction requires Coordinator attention.`
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
  private evidenceFacts(state: State) {
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
  private prepared(profile: Profile, input: any[], handoffId?: string, restoring = false): PreparedView {
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
        .filter((tool: any) => this.pi.getActiveTools?.().includes(tool.name))
        .map((tool: any) =>
          ROUTING_TOOLS.includes(tool.name) ? { ...tool, parameters: ROUTING_SCHEMAS[tool.name] } : tool,
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
  budgetNotice(messages: any[], ctx: any): any | undefined {
    if (!this.supported()) return;
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
      const sources = this.sources(),
        associated = sources.associate(input);
      const mapped = new Map(associated.filter((item) => item.source).map((item) => [item.message, item.source!]));
      return annotateSources(
        input,
        mapped,
        new Set([...mapped.values()].map((source) => source.ref)),
        sources,
        this.token,
      );
    } catch {
      return input;
    }
  }
  async context(ctx: any, incoming: any[]): Promise<any[]> {
    this.ctx = ctx;
    const input = incoming.filter(
      (m) =>
        !(
          m?.details?.routingInstance === this.token &&
          [ROUTING_MESSAGE, "freeflow-routing-v2-refs"].includes(m.customType)
        ),
    );
    this.messages = input;
    if (!this.supported() || !this.store) return this.ordinaryContext(input);
    try {
      const state = this.stateData();
      if (state.control !== "automatic") return this.ordinaryContext(input);
      check(!this.error && !this.store.blocked && state.profile, "routing_blocked", this.error ?? this.store.blocked);
      check(samePair(this.observed(), this.profilePair(state.profile!)), "prepared_pair_mismatch");
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
      // New input reaching an already prepared worker request cannot be rerouted by changing only the live model.
      const outstanding = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
      const worker = outstanding ? this.assignedWorker(state, outstanding.id) : undefined;
      const interrupted =
        isWorkerProfile(state.profile) &&
        (state.profile !== worker || user !== (outstanding ? this.workerBasis(state, outstanding.id) : undefined));
      if (!this.turn || this.turn.bound) {
        this.receipts.clear();
        const execution: Execution = {
          id: randomUUID(),
          profile: state.profile!,
          assignmentId: state.assignmentId,
          recoveryId: state.recoveryId,
          basisUserEntryId: user,
          pair: this.observed()!,
          resultEntryIds: [],
        };
        const before = new Set((ctx.sessionManager.getBranch() as NativeEntry[]).map((e) => e.id));
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
      let prepared = this.prepared(state.profile!, input);
      if (!prepared.ready && state.profile === "coordinator" && this.stateData().assessment) {
        const assessment = this.stateData().assessment!;
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
      if (isWorkerProfile(this.turn.profile))
        for (let i = 0; i < added.length; i += 128)
          this.append({
            type: "sources-exposed",
            executionId: this.turn.id,
            view: this.turn.profile,
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
      // Do not send an accidental full worker history on a projection failure.
      return [
        {
          role: "custom",
          customType: ROUTING_MESSAGE,
          content: `Automatic request blocked: ${this.error}`,
          display: false,
          timestamp: 0,
          details: { routingInstance: this.token, routingRequestBlocked: true },
        },
      ];
    }
  }
  messageEnd(message: any): void {
    if (message?.role === "assistant" && this.turn && !this.turn.bound) this.turn.message = structuredClone(message);
  }
  private contextOperation(name: string, input: any): boolean {
    return name === "freeflow_context" && ["archive", "restore", "search", "retrieve"].includes(input?.operation);
  }
  private handoffOperation(name: string, input: any): boolean {
    if (name === "freeflow_delegate") return true;
    if (name === "freeflow_return") return ["submit", "supplement", "retry"].includes(input?.operation);
    return name === "freeflow_unit" && input?.operation === "recover";
  }
  private stableRecoveryPath(path: string): boolean {
    return (
      !path.startsWith("@") &&
      path !== "~" &&
      !path.startsWith("~/") &&
      !path.startsWith("file://") &&
      !/[\u00a0\u2000-\u200a\u202f\u205f\u3000]/u.test(path) &&
      !(process.platform === "win32" && /^\/(?:mnt\/|cygdrive\/)?[a-z](?:\/|$)/i.test(path))
    );
  }
  private canonicalRecoveryPath(path: string): string {
    check(this.stableRecoveryPath(path), "recovery_path_unsupported", `Recovery path spelling is unsupported: ${path}`);
    const requested = resolvePath(this.ctx.cwd, path);
    check(existsSync(requested), "recovery_path_unavailable", `Recovery path is unavailable: ${path}`);
    try {
      return realpathSync(requested);
    } catch {
      throw new RoutingError("recovery_path_unavailable", `Recovery path is unavailable: ${path}`);
    }
  }
  private packagedInstruction(path: string): boolean {
    return this.packageRoots.some((root) => {
      const inside = relative(root, path);
      if (!inside || inside.startsWith("..") || resolvePath(root, inside) !== path) return false;
      return (
        /^(?:skills|capabilities)\/[^/]+\/SKILL\.md$/.test(inside) ||
        /^(?:skills|capabilities)\/[^/]+\/references\/[^/]+\.md$/.test(inside)
      );
    });
  }
  private recoveryReadAllowed(state: State, name: string, input: any): boolean {
    if (!state.recoveryId) return false;
    const recovery = state.recoveries.get(state.recoveryId);
    if (!recovery || recovery.state !== "reading") return false;
    if (name === "freeflow_result" && typeof input?.id === "string") {
      return (recovery.results ?? []).some((grant) => grant.id === input.id);
    }
    if (name !== "read" || typeof input?.path !== "string" || !this.stableRecoveryPath(input.path)) return false;
    try {
      const path = this.canonicalRecoveryPath(input.path);
      return recovery.paths.includes(path) || this.packagedInstruction(path);
    } catch {
      return false;
    }
  }
  private workerBasis(state: State, assignmentId: string): string | null {
    const recovery = state.recoveryId ? state.recoveries.get(state.recoveryId) : undefined;
    if (recovery?.state === "reading") return state.handoffs.get(recovery.requestHandoffId)?.basisUserEntryId ?? null;
    return this.taskBasis(state, assignmentId);
  }
  private batch(callId: string, name: string): void {
    check(this.turn?.message, "batch_unavailable");
    const matches = (this.ctx.sessionManager.getBranch() as NativeEntry[]).filter(
      (e) =>
        !this.turn!.before.has(e.id) &&
        e.type === "message" &&
        e.message?.role === "assistant" &&
        e.message.content?.some((b: any) => b.type === "toolCall" && b.id === callId),
    );
    check(matches.length === 1, "batch_source_changed");
    const fingerprint = bodyHash(matches[0].message);
    check(!this.turn.sourceFingerprint || this.turn.sourceFingerprint === fingerprint, "batch_source_changed");
    // Later message_end handlers may legitimately replace the message. The first
    // preflight freezes the actually persisted batch before any of its tools act.
    this.turn.sourceFingerprint = fingerprint;
    this.turn.message = structuredClone(matches[0].message);
    const calls = (this.turn.message.content ?? []).filter((b: any) => b.type === "toolCall");
    const handoffs = calls.filter((b: any) => this.handoffOperation(b.name, b.arguments));
    check(
      !handoffs.length ||
        (handoffs.length === 1 &&
          this.handoffOperation(calls.at(-1)?.name, calls.at(-1)?.arguments) &&
          calls.every(
            (b: any) =>
              this.handoffOperation(b.name, b.arguments) ||
              b.name === "freeflow_project" ||
              this.contextOperation(b.name, b.arguments),
          )),
      "invalid_handoff_batch",
      "A handoff must be last and cannot accompany ordinary task tools.",
    );
    check(
      calls.some((b: any) => b.id === callId && b.name === name),
      "call_not_in_batch",
    );
  }
  preflight(event: any, ctx: any): any {
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
      if (isWorkerProfile(this.turn?.profile) && !isRouting && !this.contextOperation(name, event.input)) {
        const a = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
        const worker = a ? this.assignedWorker(state, a.id) : undefined;
        const ordinary =
          a?.state === "outstanding" &&
          this.turn.basisUserEntryId === this.taskBasis(state, a.id) &&
          state.profile === worker &&
          this.turn.profile === worker;
        const recovery =
          a?.state === "returned" &&
          this.turn.basisUserEntryId === this.workerBasis(state, a.id) &&
          state.profile === worker &&
          this.turn.profile === worker &&
          this.recoveryReadAllowed(state, name, event.input);
        check(ordinary || recovery, "worker_task_phase_ended");
      }
      return undefined;
    } catch (error) {
      return { block: true, reason: error instanceof Error ? error.message : String(error) };
    }
  }
  private callOperation(callId: string, name: string): string {
    check(this.turn && this.store, "execution_missing");
    this.batch(callId, name);
    return JSON.stringify([this.store.reader.getSessionId(), this.turn.id, callId, name]);
  }
  private result(value: any): any {
    return { content: [{ type: "text", text: JSON.stringify(value) }], details: value };
  }
  async invoke(name: string, callId: string, input: any, signal: AbortSignal | undefined, ctx: any): Promise<any> {
    return this.enqueue(async () => {
      this.ctx = ctx;
      try {
        check(!signal?.aborted, "cancelled");
        if (name === "freeflow_unit" && input.operation === "inspect") {
          check(this.supported(), "routing_unavailable");
          return this.result(this.inspectUnit(input));
        }
        const state = this.stateData();
        const expected =
          name === "freeflow_delegate" || name === "freeflow_unit" ? "coordinator" : this.assignedWorker(state);
        this.assertAvailable(expected);
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
                  ? await this.unit(input, callId, op)
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
                : (() => {
                    try {
                      return this.assignedWorker(this.stateData());
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
    const state = this.stateData();
    const enabled = this.enabledWorkers();
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
      state: "outstanding" as const,
      delegateHandoffId: id,
      basisUserEntryId: this.turn!.basisUserEntryId,
    };
    const h: Handoff = {
      id,
      kind: "delegate",
      assignmentId,
      text: input.contract,
      from: "coordinator",
      to: worker,
      executionId: this.turn!.id,
      toolCallId: callId,
      basisUserEntryId: this.turn!.basisUserEntryId,
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
  private returnReport(input: any, callId: string, op: string) {
    const state = this.stateData(),
      a = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
    check(a, "assignment_missing");
    const worker = this.assignedWorker(state, a.id);
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
          executionId: this.turn!.id,
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
        executionId: this.turn!.id,
        toolCallId: callId,
        basisUserEntryId: this.turn!.basisUserEntryId,
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
      executionId: this.turn!.id,
      toolCallId: callId,
      basisUserEntryId: this.turn!.basisUserEntryId,
      state: "pending",
      reportRevision: (original?.reportRevision ?? 0) + 1,
      outcome: input.outcome,
      limitations: input.limitations ?? [],
    };
    this.append({ type: "return-accepted", handoff: h }, op);
    return this.returnReadiness(h.id);
  }
  private returnReadiness(id: string) {
    const state = this.stateData();
    const h = state.handoffs.get(id)!;
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
      ...(isSupplement ? { supplement: h.text } : { report: h.text }),
      evidence: this.evidenceFacts(state),
    };
  }
  private project(input: any, op: string) {
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
    let page: any;
    if (input.operation === "inspect") {
      const model = this.model("coordinator");
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
                    : true) &&
              (s.original ||
                s.message.role === "toolResult" ||
                s.message.content?.some((b: any) => b.type === "text" && b.text?.trim())),
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
      evidence: this.evidenceFacts(this.stateData()),
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
    const state = this.stateData();
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
          request: recovery.request,
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
          !this.applying,
        "recovery_not_available",
      );
      const worker = this.assignedWorker(state, a.id);
      const id = randomUUID(),
        handoffId = randomUUID();
      const paths = [...new Set<string>((input.paths ?? []).map((path: string) => this.canonicalRecoveryPath(path)))];
      const requestedResults = [...(input.results ?? [])] as string[];
      check(new Set(requestedResults).size === requestedResults.length, "duplicate_result_grant");
      const results: ResultGrant[] = [];
      for (const resultId of requestedResults) {
        const grant = await this.resultGrants?.resolve(resultId, this.ctx);
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
        executionId: this.turn!.id,
        toolCallId: callId,
        basisUserEntryId: this.turn!.basisUserEntryId,
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
        results,
        transition: "pending",
      };
    }
    if (input.operation === "cancel-recovery") {
      check(state.recoveryId && !this.applying, "recovery_not_cancellable");
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
          basisUserEntryId: this.turn!.basisUserEntryId,
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
  private page(
    scope: string,
    rows: any[] | (() => any[]),
    cursor?: string,
    size = 30,
    assignment?: string,
    active = false,
    summarize?: (rows: any[]) => any,
  ): any {
    const branch = this.ctx.sessionManager.getBranch() as NativeEntry[];
    const compaction = branch.filter((e) => e.type === "compaction").at(-1)?.id;
    let key: string,
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
      if (this.pages.size >= 8) this.pages.delete(this.pages.keys().next().value!);
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
    const page = this.pages.get(key)!;
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
    const state = this.stateData();
    const unit = state.unitId ? state.units.get(state.unitId) : undefined;
    const a = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
    return {
      ...this.state(),
      unit: unit ? { id: unit.id, state: unit.state, assignments: unit.assignmentIds.length } : null,
      assignment: a ? { id: a.id, state: a.state, worker: this.assignedWorker(state, a.id) } : null,
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
  private async finishHandoff(h: Handoff, inputs: any[], token: string): Promise<void> {
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
    let attentionProblems: Problem[] = [];
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
          `Couldn’t switch to ${h.to.charAt(0).toUpperCase()}${h.to.slice(1)} — ${["return", "recovery-return"].includes(h.kind) ? "report" : "assignment"} saved.`,
          "warning",
        );
      } else throw error;
    }
  }
  async resume(ctx: any): Promise<void> {
    this.ctx = ctx;
    check(ctx.isIdle?.(), "not_idle");
    check(this.store && this.capability?.effective, "routing_unavailable");
    this.revision++;
    const subject = this.subject();
    return this.enqueue(() => this.resumeCurrent(ctx, subject));
  }
  private async resumeCurrent(ctx: any, subject: Subject): Promise<void> {
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
      "Queued input must be delivered and reconciled before resuming a worker.",
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
        const worker = this.assignedWorker(this.stateData(), pending.assignmentId);
        this.append({
          type: "control",
          control: "automatic",
          profile: worker,
          reason: "Explicit resume of saved-return evidence correction only; ordinary assignment work remains ended",
        });
        await this.applyPair(this.profilePair(worker));
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
      const worker = assignment ? this.assignedWorker(state, assignment.id) : undefined;
      if (assignment?.state === "returned" && recovery?.state === "reading") {
        check(
          user === this.workerBasis(state, assignment.id) || coordinatorSawInput,
          "input_unreconciled",
          "New input needs Coordinator attention before evidence recovery can resume.",
        );
        this.append({
          type: "control",
          control: "automatic",
          profile: worker!,
          reason: "Explicit user resume of unchanged evidence recovery; ordinary assignment work remains ended",
        });
        await this.applyPair(this.profilePair(worker!));
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
          profile: worker!,
          reason: "Explicit user resume of the unchanged assignment; current restrictions remain applicable",
        });
        await this.applyPair(this.profilePair(worker!));
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
      this.ctx = ctx;
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
        words[1] === "auto" ? await this.setAutomaticControl() : await this.setManualProfile(words[1] as Profile);
      ctx.ui.notify(JSON.stringify(result), result.status === "blocked" ? "warning" : "info");
    } catch (error) {
      ctx.ui.notify(error instanceof Error ? error.message : String(error), "warning");
    }
    return true;
  }
}
