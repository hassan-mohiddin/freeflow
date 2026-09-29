import { randomUUID } from "node:crypto";
import { ContextAssembler } from "./assembler.js";
import { EventStore } from "./events.js";
import { ToolGate } from "./gate.js";
import { Handoffs } from "./handoffs.js";
import { ToolHandlers } from "./handlers.js";
import { ModelControl } from "./model-control.js";
import { RoutingSession } from "./session.js";
import { RoutingStatus } from "./status.js";
import { PROFILES, canonical, isWorkerProfile, requireCondition as check, samePair } from "./types.js";
/**
 * Cognitive Routing as the Pi extension sees it. Binds routing to the current session, follows ancestry and
 * configuration changes, handles /freeflow profile and resume commands, and forwards each host hook to the part that
 * owns it: model control, status, the tool gate, request assembly, handoffs, and the routing tools.
 */
export class RoutingRuntime {
  pi;
  packageRoots;
  /** State shared with every part of routing for the bound session. */
  session = new RoutingSession();
  models;
  status;
  gate;
  assembler;
  handoffs;
  tools;
  targetSignature;
  constructor(pi, packageRoots = []) {
    this.pi = pi;
    this.packageRoots = packageRoots;
    this.models = new ModelControl(this.session, this.pi);
    this.status = new RoutingStatus(this.session, this.models);
    this.gate = new ToolGate(this.session, this.packageRoots);
    this.assembler = new ContextAssembler(this.session, this.pi, this.models);
    this.handoffs = new Handoffs(this.session, this.pi, this.models, this.assembler);
    this.tools = new ToolHandlers(this.session, this.models, this.gate, this.assembler, this.status);
  }
  get projectionEnabled() {
    return this.session.projectionEnabled;
  }
  async settled(ctx) {
    if (!this.session.store || !this.session.supported() || this.session.store.blocked || !ctx.isIdle?.()) return;
    this.session.ctx = ctx;
    this.session.retireUnbound(
      "Native run settled without a complete source binding; prior effects remain unresolved.",
    );
  }
  /** The Coordinator's model while a delegated worker holds the assignment; the Coordinator resumes on return. */
  suspendedCoordinator() {
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
  async bind(ctx, capability, startup = false) {
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
    this.session.store = new EventStore(this.pi, ctx.sessionManager);
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
      const interrupted = this.handoffs.interruptedRun(state);
      const resumable = this.handoffs.resumableAssignment(state);
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
        setTimeout(() => void this.handoffs.resumeAfterCrash(ctx, token), 0);
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
  writeStaged(events) {
    if (!this.session.store || !events.length) return;
    try {
      this.session.store.writeStaged(events);
    } catch (error) {
      this.session.mark(error);
    }
  }
  unbind() {
    this.session.token = randomUUID();
    this.session.store = undefined;
    this.session.ctx = undefined;
    this.session.resetTurn();
  }
  async refresh(ctx, capability) {
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
  async ancestryChanged(ctx, navigation = true) {
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
  async command(args, ctx) {
    const words = args.trim().split(/\s+/);
    if (!["profile", "resume"].includes(words[0])) return false;
    try {
      if (words[0] === "profile" && words[1] === "history") {
        check(words.length === 2 || (words.length === 3 && words[2] === "diagnostics"), "invalid_history_command");
        ctx.ui.notify(
          JSON.stringify(
            words[2] === "diagnostics"
              ? this.status.detail(30)
              : this.tools.inspectUnit({ view: "history", limit: 30 }),
          ),
          "info",
        );
        return true;
      }
      check(ctx.isIdle?.(), "not_idle");
      this.session.ctx = ctx;
      if (words[0] === "resume" && words.length === 1) {
        await this.handoffs.resume(ctx);
        return true;
      }
      check(
        words.length === 2 && [...PROFILES, "auto"].includes(words[1]),
        "invalid_profile_command",
        "Use /freeflow profile coordinator|helper|executor|auto|history, or /freeflow resume.",
      );
      const result =
        words[1] === "auto" ? await this.models.setAutomaticControl() : await this.models.setManualProfile(words[1]);
      ctx.ui.notify(JSON.stringify(result), result.status === "blocked" ? "warning" : "info");
    } catch (error) {
      ctx.ui.notify(error instanceof Error ? error.message : String(error), "warning");
    }
    return true;
  }
  beforeRun(ctx) {
    return this.models.beforeRun(ctx);
  }
  nativeChange(ctx) {
    return this.models.nativeChange(ctx);
  }
  cycleManualProfile() {
    return this.models.cycleManualProfile();
  }
  setManualProfile(profile, _mechanism) {
    return this.models.setManualProfile(profile, _mechanism);
  }
  setAutomaticControl(_mechanism) {
    return this.models.setAutomaticControl(_mechanism);
  }
  sessionProfileOverrides() {
    return this.models.sessionProfileOverrides();
  }
  sessionDelegationOverride() {
    return this.models.sessionDelegationOverride();
  }
  setSessionDelegationOverride(override, mechanism = "Session delegation override") {
    return this.models.setSessionDelegationOverride(override, mechanism);
  }
  setSessionProfileOverride(profile, override, mechanism = "Session profile override") {
    return this.models.setSessionProfileOverride(profile, override, mechanism);
  }
  resetSessionProfileOverrides(mechanism = "Reset session profile overrides") {
    return this.models.resetSessionProfileOverrides(mechanism);
  }
  preflight(event, ctx) {
    return this.gate.preflight(event, ctx);
  }
  operationScope(ctx = this.session.ctx) {
    return this.gate.operationScope(ctx);
  }
  observationScope() {
    return this.gate.observationScope();
  }
  admitOperation(scope, effect, _operation, ctx = this.session.ctx) {
    return this.gate.admitOperation(scope, effect, _operation, ctx);
  }
  admitProgram(scope, ctx = this.session.ctx) {
    return this.gate.admitProgram(scope, ctx);
  }
  resultReadAccess(id) {
    return this.gate.resultReadAccess(id);
  }
  budgetNotice(messages, ctx) {
    return this.assembler.budgetNotice(messages, ctx);
  }
  context(ctx, incoming) {
    return this.assembler.context(ctx, incoming);
  }
  messageEnd(message) {
    return this.handoffs.messageEnd(message);
  }
  turnEnd(event, ctx) {
    return this.handoffs.turnEnd(event, ctx);
  }
  state() {
    return this.status.state();
  }
  setResultGrantPort(port) {
    return this.tools.setResultGrantPort(port);
  }
  setEffectFencePort(port) {
    return this.tools.setEffectFencePort(port);
  }
  invoke(name, callId, input, signal, ctx) {
    return this.tools.invoke(name, callId, input, signal, ctx);
  }
}
