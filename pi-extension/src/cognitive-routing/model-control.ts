import { ROUTING_RECOVERY_HINT, RoutingSession, type Subject } from "./session.js";

export { ROUTING_RECOVERY_HINT };
import { sessionStage, stagedFor } from "../host/staging.js";
import { resolveCognitiveRoutingState } from "./config.js";
import { presetWarnings } from "./economics.js";
import { keepsCacheAcrossEffort } from "../provider-support/effort.js";
import {
  workersForDelegation,
  RoutingError,
  isWorkerProfile,
  requireCondition as check,
  samePair,
  type DelegationMode,
  type Profile,
  type Pair,
  type State,
} from "./types.js";

/**
 * The only part of routing that changes the host model and effort: manual holds and releases, session presets,
 * delegation mode, switches staged until the next prompt, and preset advice. Idle switches are recorded and applied
 * as the next prompt starts; switches during a run apply at once, and a recorded profile never names a model the
 * host is not running.
 */
export class ModelControl {
  constructor(
    readonly session: RoutingSession,
    private readonly pi: any,
  ) {}
  applying?: Pair;
  externalChange = false;
  private heldNotice?: string;
  /** A manual hold whose profile model is not what the host runs, e.g. after a change in Pi's model picker. */
  heldMismatch(state = this.session.stateData()): { profile: Profile; expected: Pair; observed: Pair } | undefined {
    if (!this.session.supported() || state.control !== "manual" || !state.profile || this.applying) return;
    const observed = this.intended();
    let expected: Pair;
    try {
      expected = this.session.profilePair(state.profile);
    } catch {
      return;
    }
    return observed && !samePair(observed, expected) ? { profile: state.profile, expected, observed } : undefined;
  }
  /** Set by a user prompt's before_agent_start; consumed by the run it starts. */
  private promptRun = false;
  /** A run that no user prompt prepared has started and its first message has not been seen yet. */
  private unpreparedRun = false;
  /** The next run is already prepared by routing itself (explicit resume sends the message that starts it). */
  preparedRun(): void {
    this.promptRun = true;
  }
  /** Pi starts a run: from a user prompt (prepared in beforeRun), a message an extension sent, or a retry. */
  runStarted(): void {
    this.unpreparedRun = !this.promptRun;
    this.promptRun = false;
  }
  /**
   * Whether this message starts a run an extension's message triggered. Pi skips before_agent_start for those runs,
   * so routing prepares them here, before their first request. A retry's run starts with no message and is left as is.
   */
  startedByMessage(message: any): boolean {
    if (!this.unpreparedRun) return false;
    this.unpreparedRun = false;
    return message?.role === "custom";
  }
  async beforeRun(ctx: any, fromPrompt = true): Promise<void> {
    if (fromPrompt) this.promptRun = true;
    this.session.ctx = ctx;
    if (this.session.store && this.session.supported() && !this.session.store.blocked && !this.session.error) {
      if (this.session.stateData().control === "automatic" && isWorkerProfile(this.session.stateData().profile)) {
        const result = await this.control("coordinator", false);
        check(result.status !== "blocked", "reconciliation_required", result.reason);
      }
      // A switch made while idle reaches Pi's model now, as the prompt starts and before it is recorded.
      const target = this.pending();
      try {
        await this.applyPending();
      } catch (error) {
        const current = this.session.observed();
        ctx.ui?.notify?.(
          `Could not switch to ${target?.modelId}/${target?.thinking} (${error instanceof Error ? error.message : String(error)}); this prompt runs on ${current?.modelId}/${current?.thinking}.`,
          "warning",
        );
      }
    }
    const held = this.session.store ? this.heldMismatch() : undefined;
    const notice = held && JSON.stringify(held);
    // The hold is the user's; report the divergence once instead of overriding a deliberate model choice.
    if (notice && notice !== this.heldNotice)
      ctx.ui?.notify?.(
        `Manual hold is ${held.profile} (${held.expected.modelId}/${held.expected.thinking}) but Pi is using ${held.observed.modelId}/${held.observed.thinking}. Run /freeflow profile ${held.profile} to reapply it, or /freeflow profile auto to release the hold.`,
        "warning",
      );
    this.heldNotice = notice;
  }
  async validateProfilePairs(pairs: Partial<Record<Profile, Pair>>): Promise<void> {
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
      this.session.ctx,
    );
    check(result.effective, result.blockingReason.code, result.blockingReason.message);
  }
  model(profile: Profile) {
    const pair = this.session.profilePair(profile);
    const model = this.session.ctx?.modelRegistry?.find(pair.provider, pair.modelId);
    check(model, "profile_unavailable");
    return model;
  }
  /** Advisory preset checks for the effective Coordinator and enabled workers. */
  presetWarnings(state = this.session.stateData()): string[] {
    if (!this.session.supported()) return [];
    const pairs: Partial<Record<Profile, Pair>> = {};
    for (const profile of ["coordinator", ...this.session.enabledWorkers(state)] as Profile[])
      try {
        pairs[profile] = this.session.profilePair(profile);
      } catch {}
    return presetWarnings(
      pairs,
      this.session.enabledWorkers(state),
      (provider, modelId) => this.session.ctx?.modelRegistry?.find?.(provider, modelId),
      (model) => keepsCacheAcrossEffort(model, this.session.ctx),
      // Pi's only retention control; unset means the short tier.
      process.env.PI_CACHE_RETENTION === "long" ? "long" : "short",
    );
  }
  private presetNotice?: string;
  announcePresets(ctx: any = this.session.ctx): void {
    const warnings = this.presetWarnings();
    const notice = warnings.length ? JSON.stringify(warnings) : undefined;
    if (notice && notice !== this.presetNotice)
      ctx?.ui?.notify?.(`Cognitive Routing preset: ${warnings.join(" ")}`, "warning");
    this.presetNotice = notice;
  }
  /**
   * The user picked a model or effort in Pi itself. Under automatic control that ends routing's ownership of the
   * model: returns true when it did, so the caller turns routing off for the session where the user can see it.
   */
  async nativeChange(ctx: any): Promise<boolean> {
    this.session.ctx = ctx;
    if (!this.session.supported() || !this.session.store) return false;
    if (this.applying) {
      if (ctx.model?.provider !== this.applying.provider || ctx.model?.id !== this.applying.modelId) {
        this.externalChange = true;
        this.session.revision++;
      }
      return false; // Never await a queue already held by our setter.
    }
    // The user's own pick in Pi wins over a switch still waiting for the next prompt.
    this.setPending(undefined);
    const state = this.session.stateData();
    if (
      state.control !== "automatic" ||
      !state.profile ||
      samePair(this.session.observed(), this.session.profilePair(state.profile))
    )
      return false;
    try {
      this.session.revision++;
      this.session.manualHold = undefined;
      this.session.automaticControl = false;
      this.session.append({ type: "control", control: "inactive", reason: "External native model/effort change" });
      const now = this.session.observed();
      ctx.ui?.notify?.(
        `Cognitive Routing is off for this session: the model or effort was changed outside routing${now ? ` (now ${now.modelId}/${now.thinking})` : ""}. Turn it back on with /freeflow profile auto, Ctrl+Shift+A, or /freeflow settings.`,
        "warning",
      );
      return true;
    } catch (error) {
      this.session.mark(error);
      return false;
    }
  }
  async applyPair(target: Pair): Promise<void> {
    const subject = this.session.subject(),
      token = this.session.token,
      prior = this.session.observed();
    if (samePair(prior, target)) return;
    const model = this.session.ctx.modelRegistry.find(target.provider, target.modelId);
    check(model, "profile_unavailable");
    const auth = await this.session.ctx.modelRegistry.getApiKeyAndHeaders(model);
    this.session.guard(subject);
    check(auth?.ok, "profile_unauthenticated");
    this.applying = target;
    let ownedPair = target;
    this.externalChange = false;
    try {
      check(await this.pi.setModel(model), "model_rejected");
      this.session.guard(subject);
      this.pi.setThinkingLevel(target.thinking);
      check(!this.externalChange && samePair(this.session.observed(), target), "configuration_mismatch");
    } catch (error) {
      if (this.session.current(subject) && prior && !this.externalChange) {
        const old = this.session.ctx.modelRegistry.find(prior.provider, prior.modelId);
        try {
          this.applying = prior;
          ownedPair = prior;
          check(old && (await this.pi.setModel(old)), "rollback_failed");
          this.session.guard(subject);
          this.pi.setThinkingLevel(prior.thinking);
          check(samePair(this.session.observed(), prior), "rollback_failed");
        } catch {
          if (this.session.current(subject))
            this.session.error = "configuration_unknown: rollback could not be observed";
        }
      }
      throw error;
    } finally {
      if (token === this.session.token && this.applying === ownedPair) this.applying = undefined;
    }
  }
  /** A profile switch made while idle, kept with the session's stage so a reload keeps it. */
  pending(): Pair | undefined {
    return stagedFor(this.session.ctx?.sessionManager)?.pair as Pair | undefined;
  }
  private setPending(pair: Pair | undefined): void {
    const stage = pair ? sessionStage(this.session.ctx?.sessionManager) : stagedFor(this.session.ctx?.sessionManager);
    if (!stage) return;
    if (pair) stage.pair = pair;
    else delete stage.pair;
  }
  /** The pair routing intends the host to run: a pending switch, or what the host runs now. */
  intended(): Pair | undefined {
    return this.pending() ?? this.session.observed();
  }
  private async checkPair(target: Pair): Promise<void> {
    const model = this.session.ctx.modelRegistry.find(target.provider, target.modelId);
    check(model, "profile_unavailable");
    check((await this.session.ctx.modelRegistry.getApiKeyAndHeaders(model))?.ok, "profile_unauthenticated");
  }
  /**
   * Apply a switch made while idle, so the prompt runs on the profile the user chose. If the host cannot run it,
   * the switch and the control changes staged with it are dropped, so recorded control still names what runs.
   */
  async applyPending(): Promise<void> {
    const target = this.pending();
    if (!target) return;
    try {
      await this.applyPair(target);
    } catch (error) {
      const stage = stagedFor(this.session.ctx?.sessionManager);
      if (stage) stage.events = [];
      throw error;
    } finally {
      this.setPending(undefined);
    }
  }
  /**
   * Switch the host model, then record what the switch means. A switch that fails records nothing, and a
   * record that cannot be written restores the prior model, so recorded control never names a profile
   * whose model the host is not running.
   */
  async transition(target: Pair, record: () => void, subject: Subject): Promise<void> {
    if (this.session.ctx?.isIdle?.() !== false) {
      // An idle switch reaches Pi's model at the next prompt; checking the target now keeps errors immediate.
      if (!samePair(this.intended(), target)) await this.checkPair(target);
      this.session.guard(subject);
      record();
      this.setPending(samePair(this.session.observed(), target) ? undefined : target);
      return;
    }
    this.setPending(undefined);
    const prior = this.session.observed();
    await this.applyPair(target);
    try {
      this.session.guard(subject);
      record();
    } catch (error) {
      if (subject.token === this.session.token && prior && !samePair(this.session.observed(), prior))
        await this.applyPair(prior).catch(() => {});
      throw error;
    }
  }
  /**
   * Control requests run one at a time, each against the state left by the previous one. The host model
   * is switched before the new control is recorded, so a superseded or failed request never leaves a
   * recorded profile running on another profile's model.
   */
  async control(
    request: Profile | ((state: State) => Profile),
    manual: boolean,
  ): Promise<{ status: string; reason?: string }> {
    return this.session.enqueue(async () => {
      this.session.revision++;
      const subject = this.session.subject();
      try {
        check(this.session.capability?.effective && this.session.store, "routing_unavailable");
        await this.session.store.reconcile();
        this.session.guard(subject);
        const previous = this.session.stateData();
        const profile = typeof request === "function" ? request(previous) : request;
        if (manual && isWorkerProfile(profile))
          check(
            this.session.enabledWorkers().includes(profile),
            "worker_disabled",
            `${profile} is not enabled by delegation mode.`,
          );
        this.session.error = undefined;
        this.session.suppressed = false;
        if (
          previous.control === (manual ? "manual" : "automatic") &&
          previous.profile === profile &&
          samePair(this.intended(), this.session.profilePair(profile))
        ) {
          this.session.manualHold = manual ? profile : undefined;
          this.session.automaticControl = !manual;
          return { status: manual ? "active" : "automatic" };
        }
        await this.transition(
          this.session.profilePair(profile),
          () =>
            this.session.append({
              type: "control",
              control: manual ? "manual" : "automatic",
              profile,
              reason: manual ? "Explicit user manual hold" : "Explicit user automatic release/reconciliation",
            }),
          subject,
        );
        this.session.manualHold = manual ? profile : undefined;
        this.session.automaticControl = !manual;
        return { status: manual ? "active" : "automatic" };
      } catch (error) {
        if (this.session.current(subject) && !(error instanceof RoutingError && error.code === "worker_disabled"))
          this.session.mark(error);
        return { status: "blocked", reason: error instanceof Error ? error.message : String(error) };
      }
    });
  }
  /** Advance one manual-hold step from the state left by any earlier queued request. */
  cycleManualProfile() {
    return this.control((state) => {
      const profiles: Profile[] = ["coordinator", ...workersForDelegation(this.session.delegation(state))];
      return profiles[(profiles.indexOf(state.profile ?? "coordinator") + 1) % profiles.length]!;
    }, true);
  }
  setManualProfile(profile: Profile, _mechanism?: string) {
    return this.control(profile, true);
  }
  sessionProfileOverrides(): Partial<Record<Profile, Pair>> {
    return Object.fromEntries(this.session.stateData().profileOverrides) as Partial<Record<Profile, Pair>>;
  }
  sessionDelegationOverride(): DelegationMode | undefined {
    return this.session.stateData().delegationOverride;
  }
  async setSessionDelegationOverride(
    override: DelegationMode | null,
    mechanism = "Session delegation override",
  ): Promise<{ status: string; reason?: string }> {
    return this.session.enqueue(async () => {
      this.session.revision++;
      const subject = this.session.subject();
      try {
        check(this.session.capability?.effective && this.session.store, "routing_unavailable");
        check(
          this.session.ctx?.isIdle?.() !== false,
          "host_busy",
          "Wait for Pi to become idle before changing delegation mode.",
        );
        await this.session.store.reconcile();
        this.session.guard(subject);
        const state = this.session.stateData();
        if ((state.delegationOverride ?? null) === override) return { status: "unchanged" };
        const delegation = override ?? this.session.capability.delegation;
        await this.validateProfilePairs(this.session.profilePairs(this.session.requiredProfiles(state, delegation)));
        this.session.guard(subject);
        this.session.append({ type: "delegation-override", delegation: override, reason: mechanism });
        this.announcePresets();
        return { status: "stored" };
      } catch (error) {
        return { status: "blocked", reason: error instanceof Error ? error.message : String(error) };
      }
    });
  }
  async setSessionProfileOverride(
    profile: Profile,
    override: Pair | null,
    mechanism = "Session profile override",
  ): Promise<{ status: string; reason?: string }> {
    return this.session.enqueue(async () => {
      this.session.revision++;
      const subject = this.session.subject();
      try {
        check(this.session.capability?.effective && this.session.store, "routing_unavailable");
        check(
          this.session.ctx?.isIdle?.() !== false,
          "host_busy",
          "Wait for Pi to become idle before changing session presets.",
        );
        await this.session.store.reconcile();
        this.session.guard(subject);
        const state = this.session.stateData();
        const previous = state.profileOverrides.get(profile);
        if ((override === null && !previous) || (override !== null && samePair(previous, override)))
          return { status: "unchanged" };
        const target = override ?? this.session.configuredProfilePair(profile);
        const profiles = new Set(this.session.requiredProfiles(state));
        profiles.add(profile);
        const pairs = Object.fromEntries(
          [...profiles].map((name) => [name, name === profile ? target : this.session.profilePair(name)]),
        ) as Partial<Record<Profile, Pair>>;
        await this.validateProfilePairs(pairs);
        const record = () =>
          this.session.append({
            type: "profile-overrides",
            overrides: { [profile]: override },
            reason: mechanism,
          });
        if (state.control !== "inactive" && state.profile === profile) {
          await this.transition(target, record, subject);
          this.session.error = undefined;
          this.announcePresets();
          return { status: "active" };
        }
        this.session.guard(subject);
        record();
        this.session.error = undefined;
        this.announcePresets();
        return { status: "stored" };
      } catch (error) {
        if (this.session.current(subject)) this.session.mark(error);
        return { status: "blocked", reason: error instanceof Error ? error.message : String(error) };
      }
    });
  }
  async resetSessionProfileOverrides(
    mechanism = "Reset session profile overrides",
  ): Promise<{ status: string; reason?: string }> {
    return this.session.enqueue(async () => {
      this.session.revision++;
      const subject = this.session.subject();
      try {
        check(this.session.capability?.effective && this.session.store, "routing_unavailable");
        check(
          this.session.ctx?.isIdle?.() !== false,
          "host_busy",
          "Wait for Pi to become idle before resetting session presets.",
        );
        await this.session.store.reconcile();
        this.session.guard(subject);
        const state = this.session.stateData();
        if (state.profileOverrides.size === 0) return { status: "unchanged" };
        const previous = Object.fromEntries(state.profileOverrides) as Partial<Record<Profile, Pair>>;
        const required = this.session.requiredProfiles(state);
        const targetPairs = Object.fromEntries(
          required.map((profile) => [profile, this.session.configuredProfilePair(profile)]),
        ) as Partial<Record<Profile, Pair>>;
        await this.validateProfilePairs(targetPairs);
        const record = () =>
          this.session.append({
            type: "profile-overrides",
            overrides: { coordinator: null, helper: null, executor: null },
            reason: mechanism,
          });
        const active = state.control !== "inactive" ? state.profile : undefined;
        if (active && previous[active]) {
          await this.transition(targetPairs[active]!, record, subject);
          this.session.error = undefined;
          this.announcePresets();
          return { status: "active" };
        }
        this.session.guard(subject);
        record();
        this.session.error = undefined;
        this.announcePresets();
        return { status: "stored" };
      } catch (error) {
        if (this.session.current(subject)) this.session.mark(error);
        return { status: "blocked", reason: error instanceof Error ? error.message : String(error) };
      }
    });
  }
  setAutomaticControl(_mechanism?: string) {
    return this.control("coordinator", false);
  }
}
