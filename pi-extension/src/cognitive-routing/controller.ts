import { randomUUID } from "node:crypto";
import type {
  CognitiveRoutingCapabilityState,
  CognitiveRoutingProfileName,
  CognitiveRoutingThinkingLevel,
} from "./types.js";

export const COGNITIVE_ROUTING_INTENT_ENTRY = "freeflow-cognitive-routing-intent";
export const COGNITIVE_ROUTING_CONTROL_ENTRY = "freeflow-cognitive-routing-control";

type CognitiveRoutingPair = {
  provider: string;
  modelId: string;
  thinkingLevel: CognitiveRoutingThinkingLevel;
};

type CognitiveRoutingIntent = {
  version: 1;
  kind: "activation" | "profile" | "closing";
  phase: "prepared" | "abandoned";
  control: "automatic" | "manual";
  source: "system" | "user" | "agent";
  reason?: string;
  branchId?: string | null;
  epoch: string;
  correlationId: string;
  profile?: CognitiveRoutingProfileName;
  target: CognitiveRoutingPair;
  returnTarget: CognitiveRoutingPair;
};

type CognitiveRoutingControlEntry = {
  version: 1;
  control: "automatic";
  source: "user";
  reason?: string;
  branchId?: string | null;
  epoch: string;
};

type CognitiveRoutingPersistedData = CognitiveRoutingIntent | CognitiveRoutingControlEntry;

type ModelStateLease = {
  setState(request: CognitiveRoutingPair & { correlationId: string }): Promise<{ status: string }>;
  release(): Promise<unknown>;
};

type ModelStateAcquisition =
  { status: "acquired"; lease: ModelStateLease } | { status: "conflict"; owner: string } | { status: "busy" };

type ControllerPi = {
  appendEntryDurable(customType: string, data: CognitiveRoutingPersistedData): void;
  acquireModelStateControl(options: { label: string }): Promise<ModelStateAcquisition>;
};

type ControllerContext = {
  model?: { provider?: string; id?: string };
  thinkingLevel?: CognitiveRoutingThinkingLevel;
  sessionManager?: {
    getEntries?: () => readonly unknown[];
    getBranch?: () => readonly unknown[];
    getLeafId?: () => string | null;
  };
};

type ControllerOptions = {
  capabilityState: CognitiveRoutingCapabilityState;
  pi: ControllerPi;
  ctx: ControllerContext;
  label?: string;
  idFactory?: () => string;
};

export type CognitiveRoutingControlMode = "automatic" | "manual-standard" | "manual-reasoning";

export type CognitiveRoutingControllerState = {
  effective: boolean;
  controlMode: CognitiveRoutingControlMode;
  activeProfile?: CognitiveRoutingProfileName;
  epoch?: string;
  returnTarget?: CognitiveRoutingPair;
};

export type CognitiveRoutingActivationResult =
  { status: "active"; profile: CognitiveRoutingProfileName } | { status: "inactive"; reason: string };

export type CognitiveRoutingDeactivationResult = { status: "inactive"; reason: string };
export type CognitiveRoutingShutdownReason = "quit" | "reload" | "new" | "resume" | "fork" | undefined;

export type CognitiveRoutingManualResult =
  { status: "active"; profile: CognitiveRoutingProfileName } | { status: "inactive"; reason: string };

export type CognitiveRoutingAutomaticResult = { status: "automatic" } | { status: "rejected"; reason: string };

export type CognitiveRoutingSwitchResult =
  | { status: "active"; profile: CognitiveRoutingProfileName }
  | { status: "blocked"; reason: string }
  | { status: "inactive"; reason: string };

type CognitiveRoutingProfileTransitionResult =
  { status: "active"; profile: CognitiveRoutingProfileName } | { status: "inactive"; reason: string };

export type CognitiveRoutingRecoveryResult =
  | { status: "active"; profile: CognitiveRoutingProfileName }
  | { status: "pending"; reason: string }
  | { status: "inactive"; reason: string };

export type CognitiveRoutingBranchResult =
  | { status: "active"; profile: CognitiveRoutingProfileName }
  | { status: "pending"; reason: string }
  | { status: "inactive"; reason: string };

function isProfileName(value: unknown): value is CognitiveRoutingProfileName {
  return value === "standard" || value === "reasoning";
}

function asIntentSource(value: unknown): "system" | "user" | "agent" {
  if (value === "user" || value === "agent") return value;
  return "system";
}

function pairEquals(a: CognitiveRoutingPair | undefined, b: CognitiveRoutingPair | undefined): boolean {
  return a?.provider === b?.provider && a?.modelId === b?.modelId && a?.thinkingLevel === b?.thinkingLevel;
}

function asPair(value: unknown): CognitiveRoutingPair | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
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
    thinkingLevel: candidate.thinkingLevel as CognitiveRoutingThinkingLevel,
  };
}

function asIntent(value: unknown): CognitiveRoutingIntent | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== 1 ||
    (candidate.kind !== "activation" && candidate.kind !== "profile" && candidate.kind !== "closing") ||
    (candidate.phase !== "prepared" && candidate.phase !== "abandoned") ||
    typeof candidate.epoch !== "string" ||
    typeof candidate.correlationId !== "string"
  ) {
    return undefined;
  }
  const target = asPair(candidate.target);
  const returnTarget = asPair(candidate.returnTarget);
  if (!target || !returnTarget) return undefined;
  return {
    version: 1,
    kind: candidate.kind,
    phase: candidate.phase,
    control: candidate.control === "manual" ? "manual" : "automatic",
    source: asIntentSource(candidate.source),
    ...(typeof candidate.reason === "string" ? { reason: candidate.reason } : {}),
    ...(typeof candidate.branchId === "string" || candidate.branchId === null
      ? { branchId: candidate.branchId as string | null }
      : {}),
    epoch: candidate.epoch,
    correlationId: candidate.correlationId,
    ...(isProfileName(candidate.profile) ? { profile: candidate.profile } : {}),
    target,
    returnTarget,
  };
}

function entriesFrom(context: ControllerContext): readonly unknown[] {
  try {
    const entries = context.sessionManager?.getEntries?.();
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

function branchEntriesFrom(context: ControllerContext): readonly unknown[] {
  try {
    const entries = context.sessionManager?.getBranch?.();
    return Array.isArray(entries) ? entries : entriesFrom(context);
  } catch {
    return entriesFrom(context);
  }
}

function latestIntent(
  entries: readonly unknown[],
  predicate: (intent: CognitiveRoutingIntent) => boolean = () => true,
): CognitiveRoutingIntent | undefined {
  const abandonedCorrelations = new Set<string>();
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as Record<string, unknown>;
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

function latestControlMode(entries: readonly unknown[], intent: CognitiveRoutingIntent): CognitiveRoutingControlMode {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as Record<string, unknown>;
    if (candidate.type !== "custom") continue;
    if (candidate.customType === COGNITIVE_ROUTING_CONTROL_ENTRY) {
      const data = candidate.data;
      if (
        data &&
        typeof data === "object" &&
        (data as Record<string, unknown>).version === 1 &&
        (data as Record<string, unknown>).epoch === intent.epoch &&
        (data as Record<string, unknown>).control === "automatic"
      ) {
        return "automatic";
      }
    }
    if (candidate.customType !== COGNITIVE_ROUTING_INTENT_ENTRY) continue;
    const candidateIntent = asIntent(candidate.data);
    if (!candidateIntent || candidateIntent.phase !== "prepared" || candidateIntent.epoch !== intent.epoch) continue;
    if (candidateIntent.kind === "profile" && candidateIntent.control === "manual" && candidateIntent.profile) {
      return `manual-${candidateIntent.profile}` as CognitiveRoutingControlMode;
    }
    if (candidateIntent.kind === "activation") return "automatic";
  }
  return "automatic";
}

function hasMatchingHostEntry(entries: readonly unknown[], intent: CognitiveRoutingIntent): boolean {
  return entries.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const candidate = entry as Record<string, unknown>;
    return (
      candidate.type === "model_state_change" &&
      candidate.correlationId === intent.correlationId &&
      pairEquals(asPair(candidate), intent.target)
    );
  });
}

export class CognitiveRoutingController {
  private readonly capabilityState: CognitiveRoutingCapabilityState;
  private readonly pi: ControllerPi;
  private readonly ctx: ControllerContext;
  private readonly label: string;
  private readonly idFactory: () => string;
  private lease: ModelStateLease | undefined;
  private activeProfile: CognitiveRoutingProfileName | undefined;
  private epoch: string | undefined;
  private returnTarget: CognitiveRoutingPair | undefined;
  private controlMode: CognitiveRoutingControlMode = "automatic";
  private branchPending = false;
  private operation: Promise<unknown> = Promise.resolve();

  constructor(options: ControllerOptions) {
    this.capabilityState = options.capabilityState;
    this.pi = options.pi;
    this.ctx = options.ctx;
    this.label = options.label ?? "Cognitive Routing";
    this.idFactory = options.idFactory ?? randomUUID;
  }

  state(): CognitiveRoutingControllerState {
    return {
      effective: this.lease !== undefined && this.activeProfile !== undefined && !this.branchPending,
      controlMode: this.controlMode,
      ...(this.activeProfile ? { activeProfile: this.activeProfile } : {}),
      ...(this.epoch ? { epoch: this.epoch } : {}),
      ...(this.returnTarget ? { returnTarget: { ...this.returnTarget } } : {}),
    };
  }

  async activate(): Promise<CognitiveRoutingActivationResult> {
    return this.enqueue(() => this._activate());
  }

  async deactivate(): Promise<CognitiveRoutingDeactivationResult> {
    return this.enqueue(() => this._deactivate());
  }

  async shutdown(reason: CognitiveRoutingShutdownReason): Promise<CognitiveRoutingDeactivationResult> {
    return this.enqueue(() => (reason === "quit" ? this._releaseWithoutRestore() : this._deactivate()));
  }

  async recover(): Promise<CognitiveRoutingRecoveryResult> {
    return this.enqueue(() => this._recover());
  }

  async reconcileBranch(): Promise<CognitiveRoutingBranchResult> {
    return this.enqueue(() => this._reconcileBranch());
  }

  private async _activate(): Promise<CognitiveRoutingActivationResult> {
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
    const returnTarget = this.currentPair();
    if (!returnTarget) {
      return { status: "inactive", reason: "current_state_unavailable" };
    }
    const epoch = this.epoch ?? this.idFactory();
    const branchId = this.currentBranchId();
    const profile = this.capabilityState.resolvedProfiles.standard;
    if (!profile) {
      return { status: "inactive", reason: "profile_unavailable" };
    }
    const target = {
      provider: profile.provider,
      modelId: profile.model,
      thinkingLevel: profile.effectiveThinkingLevel,
    };
    return this.activatePrepared({
      kind: "activation",
      controlMode: "automatic",
      source: "system",
      epoch,
      branchId,
      returnTarget,
      target,
      profile: "standard",
    });
  }

  private async _releaseWithoutRestore(): Promise<CognitiveRoutingDeactivationResult> {
    const lease = this.lease;
    if (!lease) {
      this.clearActiveState();
      return { status: "inactive", reason: "not_active" };
    }
    await this.releaseLease(lease);
    this.clearActiveState();
    return { status: "inactive", reason: "released_on_quit" };
  }

  private async _deactivate(): Promise<CognitiveRoutingDeactivationResult> {
    const lease = this.lease;
    const returnTarget = this.returnTarget;
    if (!lease || !returnTarget || !this.epoch) {
      this.clearActiveState();
      return { status: "inactive", reason: "not_active" };
    }

    const intent = this.prepareIntent({
      kind: "closing",
      control: "automatic",
      source: "system",
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

  private async _recover(): Promise<CognitiveRoutingRecoveryResult> {
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
      branchId: this.currentBranchId(),
      epoch: lifecycleIntent.epoch,
      returnTarget: lifecycleIntent.returnTarget,
      target: activationTarget,
      profile: lifecycleIntent.profile ?? "standard",
    });
  }

  private async recoverClosingIntent(intent: CognitiveRoutingIntent): Promise<CognitiveRoutingRecoveryResult> {
    const retryIntent = this.prepareIntent({
      kind: "closing",
      control: "automatic",
      source: "system",
      reason: "Closing recovery",
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

    let acquisition: ModelStateAcquisition;
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

  private async abandonIntent(intent: CognitiveRoutingIntent, reason: string): Promise<CognitiveRoutingRecoveryResult> {
    try {
      this.pi.appendEntryDurable(COGNITIVE_ROUTING_INTENT_ENTRY, {
        ...intent,
        phase: "abandoned",
        source: "system",
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

  private async _reconcileBranch(): Promise<CognitiveRoutingBranchResult> {
    if (!this.capabilityState.effective) return { status: "inactive", reason: "not_effective" };
    if (!this.activeProfile || !this.lease) {
      return { status: "inactive", reason: "not_active" };
    }

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
    if (intent && !hasMatchingHostEntry(entries, intent)) {
      this.branchPending = true;
      return { status: "pending", reason: "branch_intent_unmatched" };
    }

    const profile = intent?.profile ?? "standard";
    const controlMode = intent ? latestControlMode(entries, intent) : "automatic";
    if (this.activeProfile === profile && this.controlMode === controlMode) {
      this.branchPending = false;
      return { status: "active", profile };
    }
    const result = await this._setProfile(profile, {
      controlMode,
      source: "system",
      reason: "Branch reconciliation",
    });
    this.branchPending = result.status !== "active";
    return result;
  }

  async setManualProfile(profile: CognitiveRoutingProfileName): Promise<CognitiveRoutingManualResult> {
    return this.enqueue(() => this._setManualProfile(profile));
  }

  async setAutomaticControl(): Promise<CognitiveRoutingAutomaticResult> {
    return this.enqueue(() => this._setAutomaticControl());
  }

  async switchAutomaticProfile(
    profile: CognitiveRoutingProfileName,
    reason: string,
    source: "agent" | "system" = "agent",
  ): Promise<CognitiveRoutingSwitchResult> {
    return this.enqueue(() => this._switchAutomaticProfile(profile, reason, source));
  }

  private async _setManualProfile(profile: CognitiveRoutingProfileName): Promise<CognitiveRoutingManualResult> {
    if (!this.capabilityState.effective) {
      return { status: "inactive", reason: "not_effective" };
    }

    const activation = this.state().effective ? { status: "active" as const } : await this._activate();
    if (activation.status !== "active") return activation;
    return this._setProfile(profile, {
      controlMode: `manual-${profile}`,
      source: "user",
      reason: "manual profile command",
    });
  }

  private async _switchAutomaticProfile(
    profile: CognitiveRoutingProfileName,
    reason: string,
    source: "agent" | "system",
  ): Promise<CognitiveRoutingSwitchResult> {
    if (!this.capabilityState.effective) return { status: "blocked", reason: "not_effective" };
    if (!this.state().effective) return { status: "blocked", reason: "not_active" };
    if (this.controlMode !== "automatic") return { status: "blocked", reason: "manual_hold" };
    return this._setProfile(profile, { controlMode: "automatic", source, reason });
  }

  private async _setProfile(
    profile: CognitiveRoutingProfileName,
    options: {
      controlMode: CognitiveRoutingControlMode;
      source: "system" | "user" | "agent";
      reason: string;
    },
  ): Promise<CognitiveRoutingProfileTransitionResult> {
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
    const intent = this.prepareIntent({
      kind: "profile",
      control: options.controlMode === "automatic" ? "automatic" : "manual",
      source: options.source,
      reason: options.reason,
      branchId: this.currentBranchId(),
      epoch: this.epoch,
      correlationId: this.idFactory(),
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

  private async _setAutomaticControl(): Promise<CognitiveRoutingAutomaticResult> {
    if (!this.lease || !this.epoch) {
      return { status: "rejected", reason: "not_active" };
    }
    try {
      this.pi.appendEntryDurable(COGNITIVE_ROUTING_CONTROL_ENTRY, {
        version: 1,
        control: "automatic",
        source: "user",
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

  private currentBranchId(): string | null | undefined {
    const leafId = this.ctx.sessionManager?.getLeafId?.();
    if (typeof leafId === "string" || leafId === null) return leafId;
    try {
      const branch = this.ctx.sessionManager?.getBranch?.();
      const last = Array.isArray(branch) ? branch.at(-1) : undefined;
      return last && typeof last === "object" && typeof (last as Record<string, unknown>).id === "string"
        ? ((last as Record<string, unknown>).id as string)
        : undefined;
    } catch {
      return undefined;
    }
  }

  private currentPair(): CognitiveRoutingPair | undefined {
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

  private prepareIntent(input: Omit<CognitiveRoutingIntent, "version" | "phase">): CognitiveRoutingIntent {
    return { version: 1, phase: "prepared", ...input };
  }

  private async activatePrepared(options: {
    kind: "activation" | "profile";
    controlMode: CognitiveRoutingControlMode;
    source: "system" | "user" | "agent";
    branchId?: string | null;
    reason?: string;
    epoch: string;
    returnTarget: CognitiveRoutingPair;
    target: CognitiveRoutingPair;
    profile: CognitiveRoutingProfileName;
  }): Promise<CognitiveRoutingActivationResult> {
    const intent = this.prepareIntent({
      kind: options.kind,
      control: options.controlMode === "automatic" ? "automatic" : "manual",
      source: options.source,
      ...(options.reason ? { reason: options.reason } : {}),
      ...(options.branchId === undefined ? {} : { branchId: options.branchId }),
      epoch: options.epoch,
      correlationId: this.idFactory(),
      profile: options.profile,
      target: options.target,
      returnTarget: options.returnTarget,
    });
    try {
      this.pi.appendEntryDurable(COGNITIVE_ROUTING_INTENT_ENTRY, intent);
    } catch {
      return { status: "inactive", reason: "prepare_failed" };
    }

    let acquisition: ModelStateAcquisition;
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

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operation.then(operation, operation);
    this.operation = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async releaseLease(lease: ModelStateLease): Promise<void> {
    try {
      await lease.release();
    } catch {
      // The host invalidates stale leases independently; do not retain local ownership after cleanup.
    }
    if (this.lease === lease) this.lease = undefined;
  }

  private clearActiveState(clearReturnTarget = true): void {
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
