import { randomUUID } from "node:crypto";
import { readCognitiveRoutingHistory } from "./history.js";
import { PI_SESSION_MODEL_STATE_ENTRY, parsePiSessionModelStateCommit } from "./pi-session-control.js";
export const COGNITIVE_ROUTING_INTENT_ENTRY = "freeflow-cognitive-routing-intent";
export const COGNITIVE_ROUTING_CONTROL_ENTRY = "freeflow-cognitive-routing-control";
export const COGNITIVE_ROUTING_INACTIVE_ENTRY = "freeflow-cognitive-routing-inactive";
function isProfileName(value) {
  return value === "standard" || value === "reasoning";
}
function isMechanism(value) {
  return [
    "agent-tool",
    "profile-command",
    "profile-shortcut",
    "profile-settings",
    "session-tree",
    "session-compact",
    "activation",
    "reload-restore",
    "recovery",
    "shutdown-restore",
  ].includes(value);
}
function asIntentSource(value) {
  if (value === "user" || value === "agent") return value;
  return "system";
}
function pairEquals(a, b) {
  return a?.provider === b?.provider && a?.modelId === b?.modelId && a?.thinkingLevel === b?.thinkingLevel;
}
function asPair(value) {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value;
  if (
    typeof candidate.provider !== "string" ||
    typeof candidate.modelId !== "string" ||
    typeof candidate.thinkingLevel !== "string"
  ) {
    return undefined;
  }
  return {
    provider: candidate.provider,
    modelId: candidate.modelId,
    thinkingLevel: candidate.thinkingLevel,
  };
}
function hostPairFromEntry(entry) {
  if (entry.type === "model_state_change") {
    return asPair({
      provider: entry.provider,
      modelId: entry.modelId,
      thinkingLevel: entry.thinkingLevel,
    });
  }
  if (entry.type !== "custom" || entry.customType !== PI_SESSION_MODEL_STATE_ENTRY) return undefined;
  const commit = parsePiSessionModelStateCommit(entry.data);
  if (!commit || commit.phase !== "committed" || commit.status !== "applied") return undefined;
  return commit.target;
}
function hostCorrelationIdFromEntry(entry) {
  if (entry.type === "model_state_change") {
    return typeof entry.correlationId === "string" ? entry.correlationId : undefined;
  }
  if (entry.type !== "custom" || entry.customType !== PI_SESSION_MODEL_STATE_ENTRY) return undefined;
  const commit = parsePiSessionModelStateCommit(entry.data);
  return commit?.phase === "committed" && commit.status === "applied" ? commit.correlationId : undefined;
}
function latestPiSessionCommit(entries, correlationId) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry;
    if (candidate.type !== "custom" || candidate.customType !== PI_SESSION_MODEL_STATE_ENTRY) continue;
    const commit = parsePiSessionModelStateCommit(candidate.data);
    if (commit?.correlationId === correlationId) return commit;
  }
  return undefined;
}
function latestHostPair(context) {
  const entries = branchEntriesFrom(context);
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (!entry || typeof entry !== "object") continue;
    const pair = hostPairFromEntry(entry);
    if (pair) return pair;
  }
  return undefined;
}
function profileNameForPair(capabilityState, pair) {
  if (!pair) return undefined;
  for (const [name, profile] of Object.entries(capabilityState.resolvedProfiles)) {
    if (!profile) continue;
    if (
      pairEquals(pair, {
        provider: profile.provider,
        modelId: profile.model,
        thinkingLevel: profile.effectiveThinkingLevel,
      })
    ) {
      return isProfileName(name) ? name : undefined;
    }
  }
  return undefined;
}
function pairMatchesProfile(capabilityState, pair, profileName) {
  const profile = capabilityState.resolvedProfiles[profileName];
  return Boolean(
    profile &&
    pairEquals(pair, {
      provider: profile.provider,
      modelId: profile.model,
      thinkingLevel: profile.effectiveThinkingLevel,
    }),
  );
}
function asIntent(value) {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value;
  if (
    (candidate.version !== 1 && candidate.version !== 2) ||
    (candidate.kind !== "activation" && candidate.kind !== "profile" && candidate.kind !== "closing") ||
    (candidate.phase !== "prepared" && candidate.phase !== "abandoned") ||
    typeof candidate.epoch !== "string" ||
    typeof candidate.correlationId !== "string"
  ) {
    return undefined;
  }
  const target = asPair(candidate.target);
  const returnTarget = asPair(candidate.returnTarget);
  const fromPair = asPair(candidate.fromPair);
  if (!target || !returnTarget) return undefined;
  return {
    version: candidate.version,
    kind: candidate.kind,
    phase: candidate.phase,
    control: candidate.control === "manual" ? "manual" : "automatic",
    source: asIntentSource(candidate.source),
    ...(isMechanism(candidate.mechanism) ? { mechanism: candidate.mechanism } : {}),
    ...(typeof candidate.decisionCorrelationId === "string"
      ? { decisionCorrelationId: candidate.decisionCorrelationId }
      : {}),
    ...(fromPair ? { fromPair } : {}),
    ...(isProfileName(candidate.fromProfile) ? { fromProfile: candidate.fromProfile } : {}),
    ...(candidate.fromControl === "automatic" || candidate.fromControl === "manual"
      ? { fromControl: candidate.fromControl }
      : {}),
    ...(typeof candidate.reason === "string" ? { reason: candidate.reason } : {}),
    ...(typeof candidate.branchId === "string" || candidate.branchId === null ? { branchId: candidate.branchId } : {}),
    epoch: candidate.epoch,
    correlationId: candidate.correlationId,
    ...(isProfileName(candidate.profile) ? { profile: candidate.profile } : {}),
    ...(isProfileName(candidate.resumeProfile) ? { resumeProfile: candidate.resumeProfile } : {}),
    ...(candidate.resumeControl === "automatic" || candidate.resumeControl === "manual"
      ? { resumeControl: candidate.resumeControl }
      : {}),
    ...(typeof candidate.resumeReason === "string" ? { resumeReason: candidate.resumeReason } : {}),
    target,
    returnTarget,
  };
}
function asInactiveEntry(value) {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value;
  const pair = asPair(candidate.pair);
  if (
    candidate.version !== 1 ||
    candidate.source !== "user" ||
    typeof candidate.reason !== "string" ||
    candidate.reason.length === 0 ||
    !pair
  ) {
    return undefined;
  }
  return {
    version: 1,
    source: "user",
    reason: candidate.reason,
    ...(typeof candidate.branchId === "string" || candidate.branchId === null ? { branchId: candidate.branchId } : {}),
    pair,
  };
}
function latestInactiveEntry(entries) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const candidate = entries[index];
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate;
    if (record.type !== "custom" || record.customType !== COGNITIVE_ROUTING_INACTIVE_ENTRY) continue;
    const entry = asInactiveEntry(record.data);
    if (entry) return { entry, position: index };
  }
  return undefined;
}
function entriesFrom(context) {
  try {
    const entries = context.sessionManager?.getEntries?.();
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}
function branchEntriesFrom(context) {
  try {
    const entries = context.sessionManager?.getBranch?.();
    return Array.isArray(entries) ? entries : entriesFrom(context);
  } catch {
    return entriesFrom(context);
  }
}
function latestIntent(entries, predicate = () => true) {
  const abandonedCorrelations = new Set();
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry;
    if (candidate.type !== "custom" || candidate.customType !== COGNITIVE_ROUTING_INTENT_ENTRY) continue;
    const intent = asIntent(candidate.data);
    if (!intent) continue;
    if (intent.phase === "abandoned") {
      abandonedCorrelations.add(intent.correlationId);
      continue;
    }
    if (!abandonedCorrelations.has(intent.correlationId) && predicate(intent)) return intent;
  }
  return undefined;
}
function controlModeForIntent(intent) {
  if (intent.control === "manual" && intent.profile) return `manual-${intent.profile}`;
  return "automatic";
}
function decisionCorrelationForIntent(intent) {
  if (intent.decisionCorrelationId) return intent.decisionCorrelationId;
  return intent.source === "user" || intent.source === "agent" ? intent.correlationId : undefined;
}
function latestControlMode(entries, intent) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry;
    if (candidate.type !== "custom") continue;
    if (candidate.customType === COGNITIVE_ROUTING_CONTROL_ENTRY) {
      const data = candidate.data;
      if (
        data &&
        typeof data === "object" &&
        (data.version === 1 || data.version === 2) &&
        data.epoch === intent.epoch &&
        data.control === "automatic"
      ) {
        return "automatic";
      }
    }
    if (candidate.customType !== COGNITIVE_ROUTING_INTENT_ENTRY) continue;
    const candidateIntent = asIntent(candidate.data);
    if (!candidateIntent || candidateIntent.epoch !== intent.epoch) continue;
    if (candidateIntent.phase === "abandoned") {
      if (candidateIntent.fromControl === "manual" && candidateIntent.fromProfile) {
        return `manual-${candidateIntent.fromProfile}`;
      }
      if (candidateIntent.fromControl === "automatic") return "automatic";
      continue;
    }
    if (candidateIntent.kind === "profile" || candidateIntent.kind === "activation") {
      return controlModeForIntent(candidateIntent);
    }
  }
  return "automatic";
}
function intentEntryIndex(entries, intent) {
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry;
    if (candidate.type !== "custom" || candidate.customType !== COGNITIVE_ROUTING_INTENT_ENTRY) continue;
    const parsed = asIntent(candidate.data);
    if (parsed?.correlationId === intent.correlationId && parsed.phase === "prepared") return index;
  }
  return entries.length;
}
function matchesBaseline(candidate, failed) {
  if (failed.fromPair && !pairEquals(candidate.target, failed.fromPair)) return false;
  if (failed.fromProfile && candidate.profile !== failed.fromProfile) return false;
  return true;
}
export function resolveControlBeforeIntent(entries, intent) {
  if (intent.fromControl === "automatic") return "automatic";
  if (intent.fromControl === "manual") {
    return intent.fromProfile ? `manual-${intent.fromProfile}` : undefined;
  }
  const priorEntries = entries.slice(0, intentEntryIndex(entries, intent));
  const abandonedCorrelations = new Set();
  for (const entry of priorEntries) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry;
    if (candidate.type !== "custom" || candidate.customType !== COGNITIVE_ROUTING_INTENT_ENTRY) continue;
    const parsed = asIntent(candidate.data);
    if (parsed?.phase === "abandoned") abandonedCorrelations.add(parsed.correlationId);
  }
  let resolved;
  for (const entry of priorEntries) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry;
    if (candidate.type !== "custom") continue;
    if (candidate.customType === COGNITIVE_ROUTING_CONTROL_ENTRY) {
      const data = candidate.data;
      if (
        data &&
        typeof data === "object" &&
        (data.version === 1 || data.version === 2) &&
        data.epoch === intent.epoch &&
        data.control === "automatic"
      ) {
        resolved = "automatic";
      }
      continue;
    }
    if (candidate.customType !== COGNITIVE_ROUTING_INTENT_ENTRY) continue;
    const parsed = asIntent(candidate.data);
    if (
      !parsed ||
      parsed.phase !== "prepared" ||
      parsed.epoch !== intent.epoch ||
      abandonedCorrelations.has(parsed.correlationId) ||
      (parsed.kind !== "profile" && parsed.kind !== "activation") ||
      !hasMatchingHostEntry(priorEntries, parsed) ||
      !matchesBaseline(parsed, intent)
    ) {
      continue;
    }
    resolved = controlModeForIntent(parsed);
  }
  return resolved;
}
function hasMatchingHostEntry(entries, intent) {
  return entries.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const candidate = entry;
    return (
      hostCorrelationIdFromEntry(candidate) === intent.correlationId &&
      pairEquals(hostPairFromEntry(candidate), intent.target)
    );
  });
}
export class CognitiveRoutingController {
  capabilityState;
  pi;
  ctx;
  initialSessionStart;
  label;
  idFactory;
  liveStateAuthoritative;
  lease;
  activeProfile;
  epoch;
  returnTarget;
  controlMode = "automatic";
  nativeInactiveReason;
  nativeBlockedReason;
  transitionInFlight = false;
  branchPending = false;
  operation = Promise.resolve();
  constructor(options) {
    this.capabilityState = options.capabilityState;
    this.pi = options.pi;
    this.ctx = options.ctx;
    this.initialSessionStart = options.initialSessionStart;
    this.label = options.label ?? "Cognitive Routing";
    this.idFactory = options.idFactory ?? randomUUID;
    this.liveStateAuthoritative = options.liveStateAuthoritative === true;
  }
  state() {
    const hostPair = this.liveStateAuthoritative ? undefined : latestHostPair(this.ctx);
    const observedPair = this.liveStateAuthoritative ? this.currentPair() : (hostPair ?? this.currentPair());
    const observedProfile = this.activeProfile ? profileNameForPair(this.capabilityState, observedPair) : undefined;
    const activeProfile = this.liveStateAuthoritative
      ? observedProfile
      : hostPair
        ? observedProfile
        : (observedProfile ?? this.activeProfile);
    const effective = this.lease !== undefined && activeProfile !== undefined && !this.branchPending;
    return {
      effective,
      controlMode: this.controlMode,
      ...(this.nativeBlockedReason
        ? { runtimeStatus: "blocked", runtimeReason: this.nativeBlockedReason }
        : this.nativeInactiveReason
          ? { runtimeStatus: "inactive", runtimeReason: this.nativeInactiveReason }
          : effective
            ? { runtimeStatus: "active" }
            : {}),
      ...(activeProfile ? { activeProfile } : {}),
      ...(this.epoch ? { epoch: this.epoch } : {}),
      ...(this.returnTarget ? { returnTarget: { ...this.returnTarget } } : {}),
    };
  }
  history(options = {}) {
    const state = this.state();
    const current = {
      control: state.effective ? (state.controlMode === "automatic" ? "automatic" : "manual") : "unavailable",
      profile: state.effective && state.activeProfile ? state.activeProfile : "unavailable",
    };
    const profilePairs = {
      ...(this.capabilityState.resolvedProfiles.standard
        ? {
            standard: {
              provider: this.capabilityState.resolvedProfiles.standard.provider,
              modelId: this.capabilityState.resolvedProfiles.standard.model,
              thinkingLevel: this.capabilityState.resolvedProfiles.standard.effectiveThinkingLevel,
            },
          }
        : {}),
      ...(this.capabilityState.resolvedProfiles.reasoning
        ? {
            reasoning: {
              provider: this.capabilityState.resolvedProfiles.reasoning.provider,
              modelId: this.capabilityState.resolvedProfiles.reasoning.model,
              thinkingLevel: this.capabilityState.resolvedProfiles.reasoning.effectiveThinkingLevel,
            },
          }
        : {}),
    };
    return readCognitiveRoutingHistory(this.ctx, { ...options, current, profilePairs });
  }
  async activate() {
    return this.enqueue(() => this._activate());
  }
  async deactivate() {
    return this.enqueue(() => this._deactivate());
  }
  async shutdown(reason) {
    return this.enqueue(() =>
      reason === "quit" ? this._releaseWithoutRestore() : this._deactivate(reason === "reload"),
    );
  }
  async recover() {
    return this.enqueue(() => this._recover());
  }
  async reconcileBranch(mechanism = "session-tree") {
    return this.enqueue(() => this._reconcileBranch(mechanism));
  }
  async observeNativeChange(reason, source = undefined) {
    if (this.transitionInFlight || source === "restore") return { status: "ignored" };
    return this.enqueue(() => this._observeNativeChange(reason, source));
  }
  async reconcileLiveState(reason = "Pi model state diverged") {
    if (this.transitionInFlight) return { status: "ignored" };
    return this.enqueue(() => this._observeNativeChange(reason));
  }
  recordNativeInactive(reason, pair) {
    try {
      this.pi.appendEntryDurable(COGNITIVE_ROUTING_INACTIVE_ENTRY, {
        version: 1,
        source: "user",
        reason,
        branchId: this.currentBranchId(),
        pair,
      });
    } catch {
      this.nativeInactiveReason = undefined;
      this.nativeBlockedReason = "inactive_state_persistence_failed";
      return { status: "blocked", reason: this.nativeBlockedReason };
    }
    this.nativeInactiveReason = reason;
    this.nativeBlockedReason = undefined;
    return { status: "inactive", reason };
  }
  async _observeNativeChange(reason, source = undefined) {
    if (!this.lease || !this.activeProfile) return { status: "ignored" };
    const profile = this.capabilityState.resolvedProfiles[this.activeProfile];
    const current = this.currentPair();
    const expected = profile
      ? {
          provider: profile.provider,
          modelId: profile.model,
          thinkingLevel: profile.effectiveThinkingLevel,
        }
      : undefined;
    if (current && expected && pairEquals(current, expected) && source !== "set") return { status: "ignored" };
    const lease = this.lease;
    if (!current) {
      await this.releaseLease(lease);
      this.clearActiveState();
      this.nativeBlockedReason = "native_state_unavailable";
      return { status: "blocked", reason: this.nativeBlockedReason };
    }
    const result = this.recordNativeInactive(reason, current);
    await this.releaseLease(lease);
    this.clearActiveState();
    return result;
  }
  async _activate(allowInactive = false, requestedProfile, requestedControlMode) {
    if (this.state().effective && this.activeProfile) {
      return { status: "active", profile: this.activeProfile };
    }
    if (!this.capabilityState.effective) {
      return { status: "inactive", reason: "not_effective" };
    }
    if ((this.nativeInactiveReason || this.nativeBlockedReason) && !allowInactive) {
      return {
        status: "inactive",
        reason: this.nativeBlockedReason ? "runtime_blocked" : "native_override",
      };
    }
    const sessionEntries = entriesFrom(this.ctx);
    const lifecycleIntent = latestIntent(
      sessionEntries,
      (intent) => intent.kind === "activation" || intent.kind === "closing",
    );
    if (lifecycleIntent && !hasMatchingHostEntry(sessionEntries, lifecycleIntent)) {
      return { status: "inactive", reason: "pending_intent" };
    }
    if (
      lifecycleIntent?.kind === "activation" &&
      !(allowInactive && (this.nativeInactiveReason || this.nativeBlockedReason))
    ) {
      return { status: "inactive", reason: "recover_required" };
    }
    const preservedReload = lifecycleIntent?.kind === "closing" && lifecycleIntent.resumeProfile !== undefined;
    if (preservedReload && !lifecycleIntent.resumeControl) {
      return { status: "inactive", reason: "resume_state_invalid" };
    }
    const returnTarget = this.currentPair();
    if (!returnTarget) {
      return { status: "inactive", reason: "current_state_unavailable" };
    }
    const epoch = this.epoch ?? this.idFactory();
    const branchId = this.currentBranchId();
    const sessionStart = this.initialSessionStart ??
      this.capabilityState.sessionStart ?? {
        control: "automatic",
        profile: "reasoning",
      };
    let profileName;
    if (requestedProfile) {
      profileName = requestedProfile;
    } else if (preservedReload) {
      profileName = lifecycleIntent.resumeProfile;
    } else if (sessionStart.control === "automatic") {
      profileName = "reasoning";
    } else {
      profileName = sessionStart.profile;
    }
    const profile = this.capabilityState.resolvedProfiles[profileName];
    if (!profile) {
      return { status: "inactive", reason: preservedReload ? "resume_profile_unavailable" : "profile_unavailable" };
    }
    let controlMode;
    if (requestedControlMode) {
      controlMode = requestedControlMode;
    } else if (preservedReload) {
      controlMode = lifecycleIntent.resumeControl === "manual" ? `manual-${profileName}` : "automatic";
    } else {
      controlMode = sessionStart.control === "manual" ? `manual-${profileName}` : "automatic";
    }
    const target = {
      provider: profile.provider,
      modelId: profile.model,
      thinkingLevel: profile.effectiveThinkingLevel,
    };
    return this.activatePrepared({
      kind: "activation",
      controlMode,
      source: "system",
      mechanism: preservedReload ? "reload-restore" : "activation",
      ...(preservedReload && lifecycleIntent.resumeReason ? { reason: lifecycleIntent.resumeReason } : {}),
      epoch,
      branchId,
      returnTarget,
      target,
      profile: profileName,
    });
  }
  async _releaseWithoutRestore() {
    const lease = this.lease;
    if (!lease) {
      this.clearActiveState();
      return { status: "inactive", reason: "not_active" };
    }
    await this.releaseLease(lease);
    this.clearActiveState();
    return { status: "inactive", reason: "released_on_quit" };
  }
  async _deactivate(preserveSemanticState = false) {
    const lease = this.lease;
    const returnTarget = this.returnTarget;
    if (!lease || !returnTarget || !this.epoch) {
      this.clearActiveState();
      return { status: "inactive", reason: "not_active" };
    }
    const currentState = preserveSemanticState ? this.state() : undefined;
    const resumeProfile = currentState?.effective ? currentState.activeProfile : undefined;
    let resumeControl;
    if (resumeProfile && currentState?.controlMode === "automatic") {
      resumeControl = "automatic";
    } else if (resumeProfile && currentState?.controlMode === `manual-${resumeProfile}`) {
      resumeControl = "manual";
    }
    const resumeIntent = resumeProfile
      ? latestIntent(
          branchEntriesFrom(this.ctx),
          (candidate) => candidate.kind === "profile" && candidate.epoch === this.epoch,
        )
      : undefined;
    const fromPair = this.observedHostPair();
    const fromProfile = this.activeProfile ?? profileNameForPair(this.capabilityState, fromPair);
    const intent = this.prepareIntent({
      kind: "closing",
      control: "automatic",
      source: "system",
      mechanism: "shutdown-restore",
      ...(fromPair ? { fromPair } : {}),
      ...(fromProfile ? { fromProfile } : {}),
      ...(resumeProfile ? { resumeProfile } : {}),
      ...(resumeControl ? { resumeControl } : {}),
      ...(resumeIntent?.reason ? { resumeReason: resumeIntent.reason } : {}),
      epoch: this.epoch,
      correlationId: this.idFactory(),
      branchId: this.currentBranchId(),
      target: returnTarget,
      returnTarget,
    });
    try {
      this.pi.appendEntryDurable(COGNITIVE_ROUTING_INTENT_ENTRY, intent);
    } catch {
      await this.releaseLease(lease);
      this.clearActiveState();
      return { status: "inactive", reason: "prepare_failed" };
    }
    this.clearActiveState(false);
    try {
      const result = await this.setState(lease, { ...returnTarget, correlationId: intent.correlationId });
      if (result.status !== "applied" && result.status !== "unchanged") {
        return { status: "inactive", reason: "restore_rejected" };
      }
      return { status: "inactive", reason: "restored" };
    } catch {
      return { status: "inactive", reason: "restore_failed" };
    } finally {
      await this.releaseLease(lease);
    }
  }
  async recoverTerminalIntent(intent) {
    const commit = latestPiSessionCommit(branchEntriesFrom(this.ctx), intent.correlationId);
    if (!commit) return undefined;
    if (commit.phase === "prepared") {
      if (!this.pi.recoverPreparedModelState) {
        return { status: "pending", reason: "prepared_recovery_unsupported" };
      }
      let recovery;
      try {
        recovery = await this.pi.recoverPreparedModelState({
          fromPair: commit.fromPair,
          target: commit.target,
          correlationId: commit.correlationId,
        });
      } catch {
        return { status: "pending", reason: "prepared_recovery_failed" };
      }
      if (recovery.status === "rollback-failed") {
        return { status: "pending", reason: "rollback_failed" };
      }
      if (recovery.status !== "restored") {
        return { status: "pending", reason: "prepared_recovery_failed" };
      }
      try {
        this.abandonPreparedIntent(intent, "Pi session transition interrupted.");
      } catch {
        return { status: "pending", reason: "intent_abandon_failed" };
      }
      const recovered = await this._recover();
      return recovered.status === "inactive" && recovered.reason === "no_pending_intent"
        ? { status: "inactive", reason: "intent_abandoned" }
        : recovered;
    }
    if (commit.phase !== "aborted") return undefined;
    if (commit.status === "rollback-failed") {
      return { status: "pending", reason: "rollback_failed" };
    }
    try {
      this.abandonPreparedIntent(intent, "Pi session transition rolled back.");
    } catch {
      return { status: "pending", reason: "intent_abandon_failed" };
    }
    return this._recover();
  }
  async recoverTerminalProfileIntent(intent) {
    const commit = latestPiSessionCommit(branchEntriesFrom(this.ctx), intent.correlationId);
    if (!commit || commit.phase === "committed") return undefined;
    if (commit.phase === "aborted" && commit.status === "rollback-failed") {
      return { status: "pending", reason: "rollback_failed" };
    }
    const controlMode = resolveControlBeforeIntent(branchEntriesFrom(this.ctx), intent);
    if (
      !controlMode ||
      !intent.fromPair ||
      !intent.fromProfile ||
      !pairMatchesProfile(this.capabilityState, intent.fromPair, intent.fromProfile)
    ) {
      return { status: "pending", reason: "baseline_control_unknown" };
    }
    if (commit.phase === "prepared") {
      if (!this.pi.recoverPreparedModelState) {
        return { status: "pending", reason: "prepared_recovery_unsupported" };
      }
      let recovery;
      try {
        recovery = await this.pi.recoverPreparedModelState({
          fromPair: commit.fromPair,
          target: commit.target,
          correlationId: commit.correlationId,
        });
      } catch {
        return { status: "pending", reason: "prepared_recovery_failed" };
      }
      if (recovery.status === "rollback-failed") {
        return { status: "pending", reason: "rollback_failed" };
      }
      if (recovery.status !== "restored") {
        return { status: "pending", reason: "prepared_recovery_failed" };
      }
    }
    try {
      this.abandonPreparedIntent(intent, "Pi session transition interrupted or rolled back.");
    } catch {
      return { status: "pending", reason: "intent_abandon_failed" };
    }
    const recovered = await this.activatePrepared({
      kind: "profile",
      controlMode,
      source: "system",
      mechanism: "recovery",
      ...(decisionCorrelationForIntent(intent) ? { decisionCorrelationId: decisionCorrelationForIntent(intent) } : {}),
      branchId: this.currentBranchId(),
      epoch: intent.epoch,
      returnTarget: intent.returnTarget,
      target: intent.fromPair,
      profile: intent.fromProfile,
    });
    return recovered.status === "active" ? recovered : { status: "pending", reason: "baseline_recovery_failed" };
  }
  async _recover() {
    const sessionEntries = entriesFrom(this.ctx);
    const branchEntries = branchEntriesFrom(this.ctx);
    const inactive = latestInactiveEntry(branchEntries);
    const branchLifecycleIntent = latestIntent(
      branchEntries,
      (intent) => intent.kind === "activation" || intent.kind === "closing",
    );
    if (
      inactive &&
      (!branchLifecycleIntent || intentEntryIndex(branchEntries, branchLifecycleIntent) <= inactive.position)
    ) {
      this.nativeInactiveReason = inactive.entry.reason;
      this.nativeBlockedReason = undefined;
      this.clearActiveState();
      return { status: "inactive", reason: "native_override" };
    }
    const lifecycleIntent = latestIntent(
      sessionEntries,
      (intent) => intent.kind === "activation" || intent.kind === "closing",
    );
    if (!lifecycleIntent) {
      return { status: "inactive", reason: "no_pending_intent" };
    }
    if (lifecycleIntent.kind === "activation") {
      const lifecycleTerminal = await this.recoverTerminalIntent(lifecycleIntent);
      if (lifecycleTerminal) return lifecycleTerminal;
    }
    if (lifecycleIntent.kind === "closing") {
      return hasMatchingHostEntry(sessionEntries, lifecycleIntent)
        ? { status: "inactive", reason: "closed" }
        : this.recoverClosingIntent(lifecycleIntent);
    }
    const currentActivationProfile = this.capabilityState.resolvedProfiles[lifecycleIntent.profile ?? "standard"];
    if (!this.capabilityState.effective) {
      return hasMatchingHostEntry(sessionEntries, lifecycleIntent)
        ? { status: "inactive", reason: "not_effective" }
        : this.abandonIntent(lifecycleIntent, "Cognitive Routing is not effective.");
    }
    if (!currentActivationProfile) {
      return this.abandonIntent(lifecycleIntent, "Prepared profile is unavailable.");
    }
    const activationTarget = {
      provider: currentActivationProfile.provider,
      modelId: currentActivationProfile.model,
      thinkingLevel: currentActivationProfile.effectiveThinkingLevel,
    };
    const activationMatched = hasMatchingHostEntry(sessionEntries, lifecycleIntent);
    if (this.liveStateAuthoritative && activationMatched) {
      const livePair = this.currentPair();
      if (!livePair) {
        this.clearActiveState();
        this.nativeBlockedReason = "native_state_unavailable";
        return { status: "inactive", reason: "native_override" };
      }
      if (!pairEquals(livePair, activationTarget)) {
        this.recordNativeInactive("Pi model state diverged during recovery", livePair);
        this.clearActiveState();
        return { status: "inactive", reason: "native_override" };
      }
    }
    if (activationMatched && !pairEquals(activationTarget, lifecycleIntent.target)) {
      return { status: "pending", reason: "applied_target_changed" };
    }
    if (!activationMatched && !pairEquals(activationTarget, lifecycleIntent.target)) {
      return this.abandonIntent(lifecycleIntent, "Prepared profile target changed.");
    }
    if (!activationMatched) {
      const retried = await this.activatePrepared({
        kind: "activation",
        controlMode: latestControlMode(branchEntries, lifecycleIntent),
        source: "system",
        mechanism: "recovery",
        branchId: this.currentBranchId(),
        epoch: lifecycleIntent.epoch,
        returnTarget: lifecycleIntent.returnTarget,
        target: lifecycleIntent.target,
        profile: lifecycleIntent.profile ?? "standard",
      });
      return retried.status === "active" ? retried : { status: "pending", reason: "activation_recovery_failed" };
    }
    const profileIntent = latestIntent(
      branchEntries,
      (intent) => intent.kind === "profile" && intent.epoch === lifecycleIntent.epoch,
    );
    if (profileIntent) {
      const terminal = await this.recoverTerminalProfileIntent(profileIntent);
      if (terminal) return terminal;
      const currentProfile = this.capabilityState.resolvedProfiles[profileIntent.profile ?? "standard"];
      if (!currentProfile) {
        return this.abandonIntent(profileIntent, "Prepared profile is unavailable.");
      }
      const profileTarget = {
        provider: currentProfile.provider,
        modelId: currentProfile.model,
        thinkingLevel: currentProfile.effectiveThinkingLevel,
      };
      if (!pairEquals(profileTarget, profileIntent.target)) {
        return hasMatchingHostEntry(branchEntries, profileIntent)
          ? { status: "pending", reason: "applied_target_changed" }
          : this.abandonIntent(profileIntent, "Prepared profile target changed.");
      }
      const profileMatched = hasMatchingHostEntry(branchEntries, profileIntent);
      const retried = await this.activatePrepared({
        kind: "profile",
        controlMode: latestControlMode(branchEntries, profileIntent),
        source: "system",
        mechanism: "recovery",
        ...(decisionCorrelationForIntent(profileIntent)
          ? { decisionCorrelationId: decisionCorrelationForIntent(profileIntent) }
          : {}),
        branchId: this.currentBranchId(),
        epoch: lifecycleIntent.epoch,
        returnTarget: lifecycleIntent.returnTarget,
        target: profileMatched ? profileTarget : profileIntent.target,
        profile: profileIntent.profile ?? "standard",
      });
      return retried.status === "active" ? retried : { status: "pending", reason: "profile_recovery_failed" };
    }
    return this.activatePrepared({
      kind: "activation",
      controlMode: latestControlMode(branchEntries, lifecycleIntent),
      source: "system",
      mechanism: "recovery",
      branchId: this.currentBranchId(),
      epoch: lifecycleIntent.epoch,
      returnTarget: lifecycleIntent.returnTarget,
      target: activationTarget,
      profile: lifecycleIntent.profile ?? "standard",
    });
  }
  async recoverClosingIntent(intent) {
    const fromPair = this.observedHostPair();
    const fromProfile = intent.fromProfile ?? profileNameForPair(this.capabilityState, fromPair);
    const retryIntent = this.prepareIntent({
      kind: "closing",
      control: "automatic",
      source: "system",
      mechanism: "shutdown-restore",
      ...(fromPair ? { fromPair } : {}),
      ...(fromProfile ? { fromProfile } : {}),
      reason: "Closing recovery",
      ...(intent.resumeProfile ? { resumeProfile: intent.resumeProfile } : {}),
      ...(intent.resumeControl ? { resumeControl: intent.resumeControl } : {}),
      ...(intent.resumeReason ? { resumeReason: intent.resumeReason } : {}),
      branchId: this.currentBranchId(),
      epoch: intent.epoch,
      correlationId: this.idFactory(),
      target: intent.target,
      returnTarget: intent.returnTarget,
    });
    try {
      this.pi.appendEntryDurable(COGNITIVE_ROUTING_INTENT_ENTRY, retryIntent);
    } catch {
      return { status: "pending", reason: "closing_recovery_prepare_failed" };
    }
    let acquisition;
    try {
      acquisition = await this.pi.acquireModelStateControl({ label: this.label });
    } catch {
      return { status: "pending", reason: "closing_recovery_acquire_failed" };
    }
    if (acquisition.status !== "acquired") {
      return { status: "pending", reason: `closing_recovery_acquire_${acquisition.status}` };
    }
    try {
      const result = await this.setState(acquisition.lease, {
        ...intent.target,
        correlationId: retryIntent.correlationId,
      });
      return result.status === "applied" || result.status === "unchanged"
        ? { status: "inactive", reason: "restored" }
        : { status: "pending", reason: "closing_recovery_rejected" };
    } catch {
      return { status: "pending", reason: "closing_recovery_failed" };
    } finally {
      await this.releaseLease(acquisition.lease);
    }
  }
  abandonPreparedIntent(intent, reason) {
    const fromPair = intent.fromPair ?? this.observedHostPair();
    const fromProfile = intent.fromProfile ?? profileNameForPair(this.capabilityState, fromPair);
    this.pi.appendEntryDurable(COGNITIVE_ROUTING_INTENT_ENTRY, {
      ...intent,
      version: 2,
      phase: "abandoned",
      source: "system",
      mechanism: intent.mechanism ?? "recovery",
      ...(fromPair ? { fromPair } : {}),
      ...(fromProfile ? { fromProfile } : {}),
      reason,
    });
  }
  async abandonIntent(intent, reason) {
    try {
      this.abandonPreparedIntent(intent, reason);
      const recovered = await this._recover();
      return recovered.status === "inactive" && recovered.reason === "no_pending_intent"
        ? { status: "inactive", reason: "intent_abandoned" }
        : recovered;
    } catch {
      return { status: "pending", reason: "intent_abandon_failed" };
    }
  }
  async _reconcileBranch(mechanism) {
    if (!this.capabilityState.effective) return { status: "inactive", reason: "not_effective" };
    if (!this.activeProfile || !this.lease) {
      return { status: "inactive", reason: "not_active" };
    }
    const currentProfile = this.activeProfile;
    const sessionEntries = entriesFrom(this.ctx);
    const lifecycleIntent = latestIntent(
      sessionEntries,
      (intent) => intent.kind === "activation" || intent.kind === "closing",
    );
    if (lifecycleIntent?.kind === "closing") {
      this.branchPending = true;
      return hasMatchingHostEntry(sessionEntries, lifecycleIntent)
        ? { status: "inactive", reason: "closed" }
        : { status: "pending", reason: "closing_intent_unmatched" };
    }
    if (lifecycleIntent && !hasMatchingHostEntry(sessionEntries, lifecycleIntent)) {
      this.branchPending = true;
      return { status: "pending", reason: "activation_intent_unmatched" };
    }
    const entries = branchEntriesFrom(this.ctx);
    const intent = latestIntent(
      entries,
      (candidate) => candidate.kind === "profile" && candidate.epoch === lifecycleIntent?.epoch,
    );
    if (!intent) {
      this.branchPending = false;
      return { status: "active", profile: currentProfile };
    }
    if (!hasMatchingHostEntry(entries, intent)) {
      this.branchPending = true;
      return { status: "pending", reason: "branch_intent_unmatched" };
    }
    const decisionCorrelationId = decisionCorrelationForIntent(intent);
    if (intent.source === "system" && !decisionCorrelationId) {
      this.branchPending = false;
      return { status: "active", profile: currentProfile };
    }
    if (!intent.profile) {
      this.branchPending = false;
      return { status: "active", profile: currentProfile };
    }
    const controlMode = latestControlMode(entries, intent);
    if (this.activeProfile === intent.profile && this.controlMode === controlMode) {
      this.branchPending = false;
      return { status: "active", profile: intent.profile };
    }
    const result = await this._setProfile(intent.profile, {
      controlMode,
      source: "system",
      mechanism,
      ...(decisionCorrelationId ? { decisionCorrelationId } : {}),
      reason: "Branch reconciliation",
    });
    this.branchPending = result.status !== "active";
    return result;
  }
  async setManualProfile(profile, mechanism = "profile-command") {
    return this.enqueue(() => this._setManualProfile(profile, mechanism));
  }
  async setAutomaticControl(mechanism = "profile-command") {
    return this.enqueue(() => this._setAutomaticControl(mechanism));
  }
  async switchAutomaticProfile(profile, reason, source = "agent", mechanism = "agent-tool") {
    return this.enqueue(() => this._switchAutomaticProfile(profile, reason, source, mechanism));
  }
  async _setManualProfile(profile, mechanism) {
    if (!this.capabilityState.effective) {
      return { status: "inactive", reason: "not_effective" };
    }
    if (!this.state().effective) {
      return this._activate(true, profile, `manual-${profile}`);
    }
    return this._setProfile(profile, {
      controlMode: `manual-${profile}`,
      source: "user",
      mechanism,
      reason: "manual profile command",
    });
  }
  async _switchAutomaticProfile(profile, reason, source, mechanism) {
    if (!this.capabilityState.effective) return { status: "blocked", reason: "not_effective" };
    const current = this.state();
    if (!current.effective) return { status: "blocked", reason: "not_active" };
    if (this.controlMode !== "automatic") return { status: "blocked", reason: "manual_hold" };
    const from = current.activeProfile;
    if (!from) return { status: "blocked", reason: "profile_unknown" };
    if (from === profile) return { status: "active", changed: false, from, to: profile, profile };
    const transition = await this._setProfile(profile, { controlMode: "automatic", source, reason, mechanism });
    if (transition.status !== "active") return transition;
    return { status: "active", changed: true, from, to: transition.profile, profile: transition.profile };
  }
  async _setProfile(profile, options) {
    const resolvedProfile = this.capabilityState.resolvedProfiles[profile];
    const lease = this.lease;
    if (!resolvedProfile || !lease || !this.epoch || !this.returnTarget) {
      return { status: "inactive", reason: "profile_unavailable" };
    }
    const target = {
      provider: resolvedProfile.provider,
      modelId: resolvedProfile.model,
      thinkingLevel: resolvedProfile.effectiveThinkingLevel,
    };
    const fromPair = this.observedHostPair();
    if (!fromPair) return { status: "inactive", reason: "current_state_unavailable" };
    const fromProfile = this.activeProfile ?? profileNameForPair(this.capabilityState, fromPair);
    const correlationId = this.idFactory();
    const decisionCorrelationId =
      options.decisionCorrelationId ??
      (options.source === "user" || options.source === "agent" ? correlationId : undefined);
    const intent = this.prepareIntent({
      kind: "profile",
      control: options.controlMode === "automatic" ? "automatic" : "manual",
      source: options.source,
      mechanism: options.mechanism,
      ...(decisionCorrelationId ? { decisionCorrelationId } : {}),
      ...(fromPair ? { fromPair } : {}),
      ...(fromProfile ? { fromProfile } : {}),
      fromControl: options.controlMode === "automatic" ? "automatic" : "manual",
      reason: options.reason,
      branchId: this.currentBranchId(),
      epoch: this.epoch,
      correlationId,
      profile,
      target,
      returnTarget: this.returnTarget,
    });
    const sessionEntries = entriesFrom(this.ctx);
    const lifecycleIntent = latestIntent(
      sessionEntries,
      (candidate) => candidate.kind === "activation" || candidate.kind === "closing",
    );
    if (lifecycleIntent && !hasMatchingHostEntry(sessionEntries, lifecycleIntent)) {
      return { status: "inactive", reason: "pending_intent" };
    }
    const entries = branchEntriesFrom(this.ctx);
    const latest = latestIntent(entries, (candidate) => candidate.kind === "profile" && candidate.epoch === this.epoch);
    if (latest && !hasMatchingHostEntry(entries, latest)) {
      return { status: "inactive", reason: "pending_intent" };
    }
    try {
      this.pi.appendEntryDurable(COGNITIVE_ROUTING_INTENT_ENTRY, intent);
      this.branchPending = true;
    } catch {
      return { status: "inactive", reason: "prepare_failed" };
    }
    try {
      const result = await this.setState(lease, { ...target, correlationId: intent.correlationId });
      if (result.status !== "applied" && result.status !== "unchanged") {
        const commit = latestPiSessionCommit(branchEntriesFrom(this.ctx), intent.correlationId);
        if (result.status === "rejected" && commit?.phase === "aborted" && commit.status === "rollback-failed") {
          try {
            this.abandonPreparedIntent(intent, "Pi session rollback failed.");
          } catch {
            // Fail closed even when the terminal abandonment cannot be persisted.
          }
          await this.releaseLease(lease);
          this.clearActiveState();
          return { status: "inactive", reason: "rollback_failed" };
        }
        if (result.status === "rejected" && commit?.phase === "aborted" && commit.status === "rolled-back") {
          try {
            this.abandonPreparedIntent(intent, "Pi session transition rolled back.");
            this.branchPending = false;
          } catch {
            // Preserve the pending boundary when the terminal abandonment cannot be persisted.
          }
        }
        return { status: "inactive", reason: "transition_rejected" };
      }
      this.activeProfile = profile;
      this.controlMode = options.controlMode;
      this.branchPending = false;
      return { status: "active", profile };
    } catch {
      return { status: "inactive", reason: "transition_failed" };
    }
  }
  async _setAutomaticControl(mechanism) {
    if (!this.lease || !this.epoch) {
      if (!this.nativeInactiveReason && !this.nativeBlockedReason) return { status: "rejected", reason: "not_active" };
      const activation = await this._activate(true, this.profileForCurrentPair(), "automatic");
      return activation.status === "active"
        ? { status: "automatic" }
        : { status: "rejected", reason: activation.reason };
    }
    const current = this.state();
    if (!current.activeProfile) {
      return { status: "rejected", reason: "profile_unknown" };
    }
    if (current.activeProfile !== "reasoning") {
      const transition = await this._setProfile("reasoning", {
        controlMode: "automatic",
        source: "user",
        mechanism,
        reason: "automatic control selects the Reasoning profile",
      });
      if (transition.status !== "active") return { status: "rejected", reason: transition.reason };
      return { status: "automatic" };
    }
    if (this.controlMode === "automatic") return { status: "automatic" };
    try {
      this.pi.appendEntryDurable(COGNITIVE_ROUTING_CONTROL_ENTRY, {
        version: 2,
        control: "automatic",
        source: "user",
        mechanism,
        reason: "manual hold release",
        branchId: this.currentBranchId(),
        epoch: this.epoch,
      });
    } catch {
      return { status: "rejected", reason: "prepare_failed" };
    }
    this.controlMode = "automatic";
    return { status: "automatic" };
  }
  currentBranchId() {
    const leafId = this.ctx.sessionManager?.getLeafId?.();
    if (typeof leafId === "string" || leafId === null) return leafId;
    try {
      const branch = this.ctx.sessionManager?.getBranch?.();
      const last = Array.isArray(branch) ? branch.at(-1) : undefined;
      return last && typeof last === "object" && typeof last.id === "string" ? last.id : undefined;
    } catch {
      return undefined;
    }
  }
  observedHostPair() {
    const livePair = this.currentPair();
    return this.liveStateAuthoritative ? livePair : (latestHostPair(this.ctx) ?? livePair);
  }
  profileForCurrentPair() {
    return profileNameForPair(this.capabilityState, this.currentPair());
  }
  currentPair() {
    const model = this.ctx.model;
    if (
      !model ||
      typeof model.provider !== "string" ||
      typeof model.id !== "string" ||
      typeof this.ctx.thinkingLevel !== "string"
    ) {
      return undefined;
    }
    return {
      provider: model.provider,
      modelId: model.id,
      thinkingLevel: this.ctx.thinkingLevel,
    };
  }
  prepareIntent(input) {
    return { version: 2, phase: "prepared", ...input };
  }
  async activatePrepared(options) {
    const fromPair = this.observedHostPair();
    if (!fromPair) return { status: "inactive", reason: "current_state_unavailable" };
    const fromProfile = profileNameForPair(this.capabilityState, fromPair);
    const correlationId = this.idFactory();
    const decisionCorrelationId =
      options.decisionCorrelationId ??
      (options.source === "user" || options.source === "agent" ? correlationId : undefined);
    const intent = this.prepareIntent({
      kind: options.kind,
      control: options.controlMode === "automatic" ? "automatic" : "manual",
      source: options.source,
      mechanism: options.mechanism,
      ...(decisionCorrelationId ? { decisionCorrelationId } : {}),
      ...(fromPair ? { fromPair } : {}),
      ...(fromProfile ? { fromProfile } : {}),
      ...(options.reason ? { reason: options.reason } : {}),
      ...(options.branchId === undefined ? {} : { branchId: options.branchId }),
      epoch: options.epoch,
      correlationId,
      profile: options.profile,
      target: options.target,
      returnTarget: options.returnTarget,
    });
    try {
      this.pi.appendEntryDurable(COGNITIVE_ROUTING_INTENT_ENTRY, intent);
    } catch {
      return { status: "inactive", reason: "prepare_failed" };
    }
    let acquisition;
    try {
      acquisition = await this.pi.acquireModelStateControl({ label: this.label });
    } catch {
      return { status: "inactive", reason: "acquire_failed" };
    }
    if (acquisition.status !== "acquired") {
      return { status: "inactive", reason: `acquire_${acquisition.status}` };
    }
    this.lease = acquisition.lease;
    try {
      const result = await this.setState(acquisition.lease, { ...options.target, correlationId: intent.correlationId });
      if (result.status !== "applied" && result.status !== "unchanged") {
        await this.releaseLease(acquisition.lease);
        this.clearActiveState();
        return { status: "inactive", reason: "transition_rejected" };
      }
      this.epoch = options.epoch;
      this.returnTarget = options.returnTarget;
      this.activeProfile = options.profile;
      this.controlMode = options.controlMode;
      this.nativeInactiveReason = undefined;
      this.nativeBlockedReason = undefined;
      return { status: "active", profile: options.profile };
    } catch {
      await this.releaseLease(acquisition.lease);
      this.clearActiveState();
      return { status: "inactive", reason: "transition_failed" };
    }
  }
  enqueue(operation) {
    const next = this.operation.then(operation, operation);
    this.operation = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
  async setState(lease, request) {
    this.transitionInFlight = true;
    try {
      return await lease.setState(request);
    } finally {
      this.transitionInFlight = false;
    }
  }
  async releaseLease(lease) {
    try {
      await lease.release();
    } catch {
      // The host invalidates stale leases independently; do not retain local ownership after cleanup.
    }
    if (this.lease === lease) this.lease = undefined;
  }
  clearActiveState(clearReturnTarget = true) {
    this.lease = undefined;
    this.activeProfile = undefined;
    this.controlMode = "automatic";
    this.branchPending = false;
    if (clearReturnTarget) {
      this.epoch = undefined;
      this.returnTarget = undefined;
    }
  }
}
