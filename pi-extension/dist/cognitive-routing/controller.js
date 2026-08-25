import { randomUUID } from "node:crypto";
import { readCognitiveRoutingHistory } from "./history.js";
export const COGNITIVE_ROUTING_INTENT_ENTRY = "freeflow-cognitive-routing-intent";
export const COGNITIVE_ROUTING_CONTROL_ENTRY = "freeflow-cognitive-routing-control";
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
function latestHostPair(context) {
  const entries = branchEntriesFrom(context);
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry;
    if (candidate.type !== "model_state_change") continue;
    const pair = asPair({
      provider: candidate.provider,
      modelId: candidate.modelId,
      thinkingLevel: candidate.thinkingLevel,
    });
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
    if (!candidateIntent || candidateIntent.phase !== "prepared" || candidateIntent.epoch !== intent.epoch) continue;
    if (candidateIntent.kind === "profile" || candidateIntent.kind === "activation") {
      return controlModeForIntent(candidateIntent);
    }
  }
  return "automatic";
}
function hasMatchingHostEntry(entries, intent) {
  return entries.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const candidate = entry;
    return (
      candidate.type === "model_state_change" &&
      candidate.correlationId === intent.correlationId &&
      pairEquals(asPair(candidate), intent.target)
    );
  });
}
export class CognitiveRoutingController {
  capabilityState;
  pi;
  ctx;
  label;
  idFactory;
  lease;
  activeProfile;
  epoch;
  returnTarget;
  controlMode = "automatic";
  branchPending = false;
  operation = Promise.resolve();
  constructor(options) {
    this.capabilityState = options.capabilityState;
    this.pi = options.pi;
    this.ctx = options.ctx;
    this.label = options.label ?? "Cognitive Routing";
    this.idFactory = options.idFactory ?? randomUUID;
  }
  state() {
    const hostPair = latestHostPair(this.ctx);
    const observedPair = hostPair ?? this.currentPair();
    const observedProfile = this.activeProfile ? profileNameForPair(this.capabilityState, observedPair) : undefined;
    const activeProfile = hostPair ? observedProfile : (observedProfile ?? this.activeProfile);
    return {
      effective: this.lease !== undefined && activeProfile !== undefined && !this.branchPending,
      controlMode: this.controlMode,
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
  async _activate() {
    if (this.state().effective && this.activeProfile) {
      return { status: "active", profile: this.activeProfile };
    }
    if (!this.capabilityState.effective) {
      return { status: "inactive", reason: "not_effective" };
    }
    const sessionEntries = entriesFrom(this.ctx);
    const lifecycleIntent = latestIntent(
      sessionEntries,
      (intent) => intent.kind === "activation" || intent.kind === "closing",
    );
    if (lifecycleIntent && !hasMatchingHostEntry(sessionEntries, lifecycleIntent)) {
      return { status: "inactive", reason: "pending_intent" };
    }
    if (lifecycleIntent?.kind === "activation") {
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
    const sessionStart = this.capabilityState.sessionStart ?? {
      control: "automatic",
      profile: "standard",
    };
    const profileName = preservedReload ? lifecycleIntent.resumeProfile : sessionStart.profile;
    const profile = this.capabilityState.resolvedProfiles[profileName];
    if (!profile) {
      return { status: "inactive", reason: preservedReload ? "resume_profile_unavailable" : "profile_unavailable" };
    }
    let controlMode;
    if (preservedReload) {
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
    const fromPair = latestHostPair(this.ctx) ?? this.currentPair();
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
      const result = await lease.setState({ ...returnTarget, correlationId: intent.correlationId });
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
  async _recover() {
    const sessionEntries = entriesFrom(this.ctx);
    const branchEntries = branchEntriesFrom(this.ctx);
    const lifecycleIntent = latestIntent(
      sessionEntries,
      (intent) => intent.kind === "activation" || intent.kind === "closing",
    );
    if (!lifecycleIntent) {
      return { status: "inactive", reason: "no_pending_intent" };
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
    if (activationMatched && !pairEquals(activationTarget, lifecycleIntent.target)) {
      return { status: "pending", reason: "applied_target_changed" };
    }
    if (!activationMatched && !pairEquals(activationTarget, lifecycleIntent.target)) {
      return this.abandonIntent(lifecycleIntent, "Prepared profile target changed.");
    }
    if (!activationMatched) {
      const retried = await this.activatePrepared({
        kind: "activation",
        controlMode: "automatic",
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
      controlMode: "automatic",
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
    const fromPair = latestHostPair(this.ctx) ?? this.currentPair();
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
      const result = await acquisition.lease.setState({ ...intent.target, correlationId: retryIntent.correlationId });
      return result.status === "applied" || result.status === "unchanged"
        ? { status: "inactive", reason: "restored" }
        : { status: "pending", reason: "closing_recovery_rejected" };
    } catch {
      return { status: "pending", reason: "closing_recovery_failed" };
    } finally {
      await this.releaseLease(acquisition.lease);
    }
  }
  async abandonIntent(intent, reason) {
    try {
      const fromPair = intent.fromPair ?? latestHostPair(this.ctx) ?? this.currentPair();
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
    const activation = this.state().effective ? { status: "active" } : await this._activate();
    if (activation.status !== "active") return activation;
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
    const fromPair = latestHostPair(this.ctx) ?? this.currentPair();
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
      const result = await lease.setState({ ...target, correlationId: intent.correlationId });
      if (result.status !== "applied" && result.status !== "unchanged") {
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
      return { status: "rejected", reason: "not_active" };
    }
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
    const fromPair = latestHostPair(this.ctx) ?? this.currentPair();
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
      const result = await acquisition.lease.setState({ ...options.target, correlationId: intent.correlationId });
      if (result.status !== "applied" && result.status !== "unchanged") {
        await this.releaseLease(acquisition.lease);
        this.clearActiveState();
        return { status: "inactive", reason: "transition_rejected" };
      }
      this.epoch = options.epoch;
      this.returnTarget = options.returnTarget;
      this.activeProfile = options.profile;
      this.controlMode = options.controlMode;
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
