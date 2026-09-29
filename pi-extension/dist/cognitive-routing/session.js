import { randomUUID } from "node:crypto";
import { Sources } from "./sources.js";
import { pairFromProfile } from "./config.js";
import { initialState } from "./state.js";
import { RoutingError, isWorkerProfile, requireCondition as check, samePair, workersForDelegation } from "./types.js";
const STAGED_CONTROL = new Set(["control", "profile-overrides", "delegation-override"]);
export const ROUTING_RECOVERY_HINT =
  "Run /freeflow profile auto to reconcile routing, or /freeflow resume to continue saved work.";
/**
 * State and identity shared by every part of routing for one bound session: the event journal, the host
 * context, the current turn, blocking errors, control mode, and the queue that orders control changes.
 */
export class RoutingSession {
  store;
  ctx;
  capability;
  token = randomUUID();
  turn;
  messages = [];
  error;
  projectionError;
  suppressed = false;
  operations = Promise.resolve();
  revision = 0;
  manualHold;
  automaticControl = false;
  sourceCache;
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
  delegation(state = this.stateData()) {
    return state.delegationOverride ?? this.capability?.delegation ?? "executor";
  }
  enabledWorkers(state = this.stateData()) {
    return workersForDelegation(this.delegation(state));
  }
  assignedWorker(state, assignmentId = state.assignmentId) {
    const assignment = assignmentId ? state.assignments.get(assignmentId) : undefined;
    const handoff = assignment ? state.handoffs.get(assignment.delegateHandoffId) : undefined;
    check(
      handoff?.kind === "delegate" && handoff.assignmentId === assignment?.id && isWorkerProfile(handoff.to),
      "assignment_worker_missing",
      "The current assignment has no valid recorded worker.",
    );
    return handoff.to;
  }
  requiredProfiles(state = this.stateData(), delegation = this.delegation(state)) {
    const profiles = new Set(["coordinator", ...workersForDelegation(delegation)]);
    if (state.profile) profiles.add(state.profile);
    if (this.manualHold) profiles.add(this.manualHold);
    const assignment = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
    if (assignment?.state === "outstanding" || state.recoveryId) profiles.add(this.assignedWorker(state));
    const pending = state.pendingId ? state.handoffs.get(state.pendingId) : undefined;
    if (pending && isWorkerProfile(pending.to)) profiles.add(pending.to);
    return [...profiles];
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
  append(data, op, step) {
    check(this.store, "routing_unavailable");
    // Control changes made while no run is active affect no request until the next prompt; stage them there.
    const stage = STAGED_CONTROL.has(data.type) && this.ctx?.isIdle?.() !== false;
    return this.store.append(this.store.make(data, op, step), stage);
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
  announced;
  // Tell the user once per distinct block; routing stays blocked until an explicit control clears it.
  announceBlock(ctx) {
    if (!this.error || this.announced === this.error) return;
    this.announced = this.error;
    ctx?.ui?.notify?.(`Cognitive Routing blocked: ${this.error}. ${ROUTING_RECOVERY_HINT}`, "warning");
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
  profilePairs(profiles = this.requiredProfiles()) {
    return Object.fromEntries(profiles.map((profile) => [profile, this.profilePair(profile)]));
  }
  workerBasis(state, assignmentId) {
    const recovery = state.recoveryId ? state.recoveries.get(state.recoveryId) : undefined;
    if (recovery?.state === "reading") return state.handoffs.get(recovery.requestHandoffId)?.basisUserEntryId ?? null;
    return this.taskBasis(state, assignmentId);
  }
}
