import { randomUUID } from "node:crypto";
import { EventStore } from "./events.js";
import { Sources } from "./sources.js";
import { pairFromProfile, type CognitiveRoutingCapabilityState } from "./config.js";
import { initialState } from "./state.js";
import {
  RoutingError,
  isWorkerProfile,
  requireCondition as check,
  samePair,
  workersForDelegation,
  type DelegationMode,
  type Profile,
  type WorkerProfile,
  type View,
  type Pair,
  type State,
  type NativeEntry,
  type EventData,
} from "./types.js";

const STAGED_CONTROL = new Set(["control", "profile-overrides", "delegation-override"]);

export interface Turn {
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
export interface Subject {
  token: string;
  revision: number;
  store: EventStore | undefined;
  leafId: string | null;
  userId: string | null;
}

export const ROUTING_RECOVERY_HINT =
  "Run /freeflow profile auto to reconcile routing, or /freeflow resume to continue saved work.";

/**
 * State and identity shared by every part of routing for one bound session: the event journal, the host
 * context, the current turn, blocking errors, control mode, and the queue that orders control changes.
 */
export class RoutingSession {
  store?: EventStore;
  ctx: any;
  capability?: CognitiveRoutingCapabilityState;
  token = randomUUID();
  turn?: Turn;
  messages: any[] = [];
  error?: string;
  projectionError?: string;
  suppressed = false;
  operations: Promise<unknown> = Promise.resolve();
  revision = 0;
  manualHold?: Profile;
  automaticControl = false;
  sourceCache?: { entries: NativeEntry[]; authors: number; source: Sources };
  subject(): Subject {
    const branch = this.store?.reader.getBranch() ?? [];
    return {
      token: this.token,
      revision: this.revision,
      store: this.store,
      leafId: branch.at(-1)?.id ?? null,
      userId: branch.filter((e) => e.message?.role === "user").at(-1)?.id ?? null,
    };
  }
  current(s: Subject): boolean {
    if (s.token !== this.token || s.revision !== this.revision || s.store !== this.store) return false;
    const branch = this.store?.reader.getBranch() ?? [];
    return (
      (!s.leafId || branch.some((e) => e.id === s.leafId)) &&
      (branch.filter((e) => e.message?.role === "user").at(-1)?.id ?? null) === s.userId
    );
  }
  guard(s: Subject): void {
    check(
      this.current(s),
      "stale_operation",
      "Routing state changed while the operation was waiting; no further effects applied.",
    );
  }
  taskBasis(state: State, assignmentId: string): string | null | undefined {
    return state.resumeBasis.has(assignmentId)
      ? state.resumeBasis.get(assignmentId)
      : state.assignments.get(assignmentId)?.basisUserEntryId;
  }
  delegation(state = this.stateData()): DelegationMode {
    return state.delegationOverride ?? this.capability?.delegation ?? "executor";
  }
  enabledWorkers(state = this.stateData()): readonly WorkerProfile[] {
    return workersForDelegation(this.delegation(state));
  }
  assignedWorker(state: State, assignmentId = state.assignmentId): WorkerProfile {
    const assignment = assignmentId ? state.assignments.get(assignmentId) : undefined;
    const handoff = assignment ? state.handoffs.get(assignment.delegateHandoffId) : undefined;
    check(
      handoff?.kind === "delegate" && handoff.assignmentId === assignment?.id && isWorkerProfile(handoff.to),
      "assignment_worker_missing",
      "The current assignment has no valid recorded worker.",
    );
    return handoff.to;
  }
  requiredProfiles(state = this.stateData(), delegation = this.delegation(state)): Profile[] {
    const profiles = new Set<Profile>(["coordinator", ...workersForDelegation(delegation)]);
    if (state.profile) profiles.add(state.profile);
    if (this.manualHold) profiles.add(this.manualHold);
    const assignment = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
    if (assignment?.state === "outstanding" || state.recoveryId) profiles.add(this.assignedWorker(state));
    const pending = state.pendingId ? state.handoffs.get(state.pendingId) : undefined;
    if (pending && isWorkerProfile(pending.to)) profiles.add(pending.to);
    return [...profiles];
  }
  retireUnbound(reason: string): void {
    for (const execution of this.stateData().executions.values()) {
      if (!execution.assistantEntryId && !execution.interrupted)
        this.append({ type: "execution-interrupted", executionId: execution.id, reason });
    }
    this.turn = undefined;
  }
  openTurn(): void {
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
  stateData(): State {
    return this.store?.state() ?? initialState();
  }
  sources(state = this.stateData()): Sources {
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
  observed(ctx = this.ctx): Pair | undefined {
    return ctx?.model?.provider && ctx?.model?.id && ctx?.thinkingLevel
      ? { provider: ctx.model.provider, modelId: ctx.model.id, thinking: ctx.thinkingLevel }
      : undefined;
  }
  supported(): boolean {
    return !!this.capability?.effective && !this.suppressed;
  }
  append(data: EventData, op?: string, step?: string) {
    check(this.store, "routing_unavailable");
    // Control changes made while no run is active affect no request until the next prompt; stage them there.
    const stage = STAGED_CONTROL.has(data.type) && this.ctx?.isIdle?.() !== false;
    return this.store.append(this.store.make(data, op, step), stage);
  }
  enqueue<T>(action: () => Promise<T> | T): Promise<T> {
    const token = this.token;
    const result = this.operations.then(() => {
      check(token === this.token, "stale_instance");
      return action();
    });
    this.operations = result.catch(() => {});
    return result;
  }
  mark(error: unknown) {
    if (this.error && error instanceof RoutingError && error.code === "routing_blocked") return;
    this.error =
      error instanceof RoutingError
        ? `${error.code}: ${error.message}`
        : error instanceof Error
          ? error.message
          : String(error);
  }
  announced?: string;
  // Tell the user once per distinct block; routing stays blocked until an explicit control clears it.
  announceBlock(ctx: any): void {
    if (!this.error || this.announced === this.error) return;
    this.announced = this.error;
    ctx?.ui?.notify?.(`Cognitive Routing blocked: ${this.error}. ${ROUTING_RECOVERY_HINT}`, "warning");
  }
  assertAvailable(profile?: Profile) {
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
  configuredProfilePair(profile: Profile): Pair {
    const configured = this.capability?.profiles[profile];
    check(configured, "profile_missing");
    return pairFromProfile(configured);
  }
  profilePair(profile: Profile): Pair {
    return this.stateData().profileOverrides.get(profile) ?? this.configuredProfilePair(profile);
  }
  profilePairs(profiles = this.requiredProfiles()): Partial<Record<Profile, Pair>> {
    return Object.fromEntries(profiles.map((profile) => [profile, this.profilePair(profile)]));
  }
  workerBasis(state: State, assignmentId: string): string | null {
    const recovery = state.recoveryId ? state.recoveries.get(state.recoveryId) : undefined;
    if (recovery?.state === "reading") return state.handoffs.get(recovery.requestHandoffId)?.basisUserEntryId ?? null;
    return this.taskBasis(state, assignmentId);
  }
}
