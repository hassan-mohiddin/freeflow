import { COGNITIVE_ROUTING_INACTIVE_ENTRY, CognitiveRoutingController } from "./controller.js";
import {
  createPiSessionControllerHost,
  parsePiSessionModelStateCommit,
  PI_SESSION_MODEL_STATE_ENTRY,
} from "./pi-session-control.js";
import { isPiFlowHost } from "../runtime/runtime-identity.js";
import { readCapabilityState, refreshRuntimeContext } from "../runtime/runtime-context.js";
export function armedCognitiveRoutingControllerState(armed) {
  return {
    effective: true,
    controlMode: armed.control === "manual" ? `manual-${armed.profile}` : "automatic",
    activeProfile: armed.profile,
  };
}
export function armedCognitiveRoutingStateFor(capabilityState) {
  return { ...capabilityState.sessionStart };
}
export function createArmedCognitiveRoutingController(armed) {
  return {
    state: () => armedCognitiveRoutingControllerState(armed),
    async setManualProfile(profile) {
      armed.profile = profile;
      armed.control = "manual";
      return { status: "active", profile };
    },
    async setAutomaticControl() {
      armed.control = "automatic";
      return { status: "automatic" };
    },
  };
}
const THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
function entriesFrom(ctx) {
  try {
    const entries = ctx?.sessionManager?.getBranch?.() ?? ctx?.sessionManager?.getEntries?.() ?? [];
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}
function hasExplicitStartupSelection(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--model" && typeof argv[index + 1] === "string" && !argv[index + 1].startsWith("--")) {
      return true;
    }
    if (argument.startsWith("--model=") && argument.length > "--model=".length) return true;
    if (argument === "--thinking" && THINKING_LEVELS.has(argv[index + 1])) return true;
    if (argument.startsWith("--thinking=") && THINKING_LEVELS.has(argument.slice("--thinking=".length))) {
      return true;
    }
  }
  return false;
}
function hasInactiveEntry(entries) {
  return entries.some(
    (entry) =>
      Boolean(entry && typeof entry === "object") &&
      entry.type === "custom" &&
      entry.customType === COGNITIVE_ROUTING_INACTIVE_ENTRY,
  );
}
function hasNativeOverrideAfterRoutingState(entries) {
  let latestNativePosition = -1;
  let latestCommittedRoutingPosition = -1;
  let latestInactivePosition = -1;
  let modelChangeCount = 0;
  let thinkingChangeCount = 0;
  entries.forEach((entry, position) => {
    if (!entry || typeof entry !== "object") return;
    const record = entry;
    if (record.type === "model_change") {
      latestNativePosition = position;
      modelChangeCount += 1;
      return;
    }
    if (record.type === "thinking_level_change") {
      latestNativePosition = position;
      thinkingChangeCount += 1;
      return;
    }
    if (record.type !== "custom") return;
    if (record.customType === COGNITIVE_ROUTING_INACTIVE_ENTRY) {
      latestInactivePosition = position;
      return;
    }
    if (record.customType !== PI_SESSION_MODEL_STATE_ENTRY) return;
    const commit = parsePiSessionModelStateCommit(record.data);
    if (commit?.phase === "committed" && commit.status === "applied") {
      latestCommittedRoutingPosition = position;
    }
  });
  if (latestInactivePosition > latestCommittedRoutingPosition) return true;
  if (latestCommittedRoutingPosition >= 0) return latestNativePosition > latestCommittedRoutingPosition;
  return modelChangeCount > 1 || thinkingChangeCount > 1;
}
function hasPiSessionModelStateApi(pi) {
  return (
    typeof pi?.appendEntry === "function" &&
    typeof pi?.setModel === "function" &&
    typeof pi?.setThinkingLevel === "function"
  );
}
function hasCognitiveRoutingHost(pi, ctx) {
  if (
    isPiFlowHost(pi?.host) &&
    typeof pi?.appendEntryDurable === "function" &&
    typeof pi?.acquireModelStateControl === "function"
  ) {
    return true;
  }
  return (
    hasPiSessionModelStateApi(pi) &&
    typeof ctx?.modelRegistry?.find === "function" &&
    typeof ctx?.modelRegistry?.getApiKeyAndHeaders === "function"
  );
}
function cognitiveRoutingControllerHost(pi, ctx) {
  if (isPiFlowHost(pi?.host) && typeof pi?.acquireModelStateControl === "function") return pi;
  if (hasPiSessionModelStateApi(pi) && hasCognitiveRoutingHost(pi, ctx)) {
    return createPiSessionControllerHost({ pi, ctx });
  }
  return undefined;
}
export class PiRoutingSession {
  disposition = "available";
  reason;
  startupSelectionSuppressed = false;
  pi;
  stockPi;
  newSessionBoundary = false;
  explicitReactivationPending = false;
  controllerState;
  armedState;
  get controller() {
    return this.controllerState;
  }
  controllerForTool() {
    return this.controllerState;
  }
  hasController() {
    return this.controllerState !== undefined;
  }
  async reconcileLiveState(reason = "Pi model state diverged") {
    return this.controllerState?.reconcileLiveState(reason) ?? { status: "ignored" };
  }
  async shutdown(reason) {
    const controller = this.controllerState;
    this.reset();
    return controller?.shutdown(reason);
  }
  get armed() {
    return this.armedState ? { ...this.armedState } : undefined;
  }
  clearController() {
    this.controllerState = undefined;
  }
  clearArmed() {
    this.armedState = undefined;
  }
  armFromCapability(capabilityState) {
    this.armedState = armedCognitiveRoutingStateFor(capabilityState);
  }
  cycleArmedManual() {
    if (!this.armedState) return undefined;
    const target = this.armedState.profile === "reasoning" ? "standard" : "reasoning";
    this.armedState.profile = target;
    this.armedState.control = "manual";
    return { target };
  }
  cycleArmedAutomatic() {
    if (!this.armedState) return undefined;
    if (this.armedState.control === "automatic") return { kind: "control", changed: false };
    this.armedState.control = "automatic";
    return { kind: "control", changed: true };
  }
  armedController() {
    return this.armedState ? createArmedCognitiveRoutingController(this.armedState) : undefined;
  }
  commandController() {
    return this.controllerState ?? this.armedController();
  }
  history(options = {}) {
    return this.controllerState?.history(options);
  }
  async observeNativeChange(reason, source = undefined) {
    return this.controllerState?.observeNativeChange(reason, source) ?? { status: "ignored" };
  }
  async setManualProfile(profile, mechanism = "profile-command") {
    if (this.controllerState) return this.controllerState.setManualProfile(profile, mechanism);
    return this.armedController()?.setManualProfile(profile, mechanism) ?? { status: "inactive", reason: "not_active" };
  }
  async setAutomaticControl(mechanism = "profile-command") {
    if (this.controllerState) return this.controllerState.setAutomaticControl(mechanism);
    return this.armedController()?.setAutomaticControl(mechanism) ?? { status: "inactive", reason: "not_active" };
  }
  async switchAutomaticProfile(profile, reason, source = "user", mechanism = "profile-shortcut") {
    return (
      this.controllerState?.switchAutomaticProfile(profile, reason, source, mechanism) ?? {
        status: "blocked",
        reason: "not_active",
      }
    );
  }
  async reconcileBranch(mechanism = "session-tree") {
    return this.controllerState?.reconcileBranch(mechanism);
  }
  constructor({ pi, stockPi }) {
    this.pi = pi;
    this.stockPi = stockPi;
  }
  snapshot() {
    const controllerState = this.controllerState?.state();
    const armedRuntimeState = this.armedState ? armedCognitiveRoutingControllerState(this.armedState) : undefined;
    const runtimeState = controllerState ?? armedRuntimeState ?? this.runtimeState();
    const status =
      this.disposition === "blocked"
        ? "blocked"
        : this.disposition === "inactive"
          ? "inactive"
          : controllerState?.runtimeStatus === "blocked"
            ? "blocked"
            : controllerState?.runtimeStatus === "inactive"
              ? "inactive"
              : controllerState?.effective === true
                ? "active"
                : this.armedState
                  ? "armed"
                  : "available";
    return {
      status,
      disposition: this.disposition,
      startupSelectionSuppressed: this.startupSelectionSuppressed,
      ...(this.reason ? { reason: this.reason } : {}),
      ...(controllerState ? { controllerState } : {}),
      ...(runtimeState ? { runtimeState } : {}),
    };
  }
  supportsCognitiveRoutingRuntime() {
    return isPiFlowHost(this.pi?.host) || hasPiSessionModelStateApi(this.pi);
  }
  async reconcileController(ctx, capabilityState, initialSessionStart) {
    const cognitiveRouting = capabilityState?.cognitiveRouting;
    const controllerPi = cognitiveRoutingControllerHost(this.pi, ctx);
    if (!cognitiveRouting?.effective || this.startupSelectionSuppressed || !controllerPi) {
      if (this.controllerState) await this.controllerState.deactivate();
      this.controllerState = undefined;
      return undefined;
    }
    const controller = new CognitiveRoutingController({
      capabilityState: cognitiveRouting,
      pi: controllerPi,
      ctx,
      liveStateAuthoritative: !isPiFlowHost(this.pi?.host),
      ...(initialSessionStart ? { initialSessionStart } : {}),
    });
    // Pi emits model/thinking events while setModel() is still awaiting its transition.
    // Publish the controller first so those events can observe transitionInFlight and ignore
    // host notifications generated by this activation rather than treating them as overrides.
    this.controllerState = controller;
    try {
      const recovered = await controller.recover();
      let nextController;
      if (
        recovered.status === "pending" ||
        (recovered.status === "inactive" && recovered.reason === "native_override")
      ) {
        nextController = controller;
      } else if (recovered.status === "active") {
        nextController = controller;
      } else {
        const activated = await controller.activate();
        nextController = activated.status === "active" ? controller : undefined;
      }
      this.controllerState = nextController;
      return nextController;
    } catch (error) {
      if (this.controllerState === controller) this.controllerState = undefined;
      throw error;
    }
  }
  async applyLiveCapabilityState(ctx, options = {}) {
    const capabilityState = await readCapabilityState(ctx.cwd, ctx, this.pi?.host);
    await refreshRuntimeContext(capabilityState);
    this.reconcileNativeEntries(ctx);
    let nextController = this.controllerState;
    if (!isPiFlowHost(this.pi?.host) && nextController) await nextController.reconcileLiveState();
    if (
      options.reconcileCognitiveRouting &&
      (this.armedState === undefined || options.materializeCognitiveRouting === true) &&
      (nextController === undefined || capabilityState.cognitiveRouting?.effective !== true)
    ) {
      nextController = await this.reconcileController(
        ctx,
        capabilityState,
        options.materializeCognitiveRouting ? this.armedState : undefined,
      );
    }
    this.controllerState = nextController;
    const controllerState = nextController?.state();
    if (controllerState?.effective === true) {
      this.markActive();
    } else if (this.isExplicitReactivationPending() && options.reconcileCognitiveRouting) {
      this.cancelExplicitReactivation();
    }
    return nextController;
  }
  runtimeState() {
    if (this.disposition === "inactive") {
      return { effective: false, runtimeStatus: "inactive", ...(this.reason ? { runtimeReason: this.reason } : {}) };
    }
    if (this.disposition === "blocked") {
      return { effective: false, runtimeStatus: "blocked", ...(this.reason ? { runtimeReason: this.reason } : {}) };
    }
    return undefined;
  }
  canAutoActivate() {
    return !this.startupSelectionSuppressed && (this.disposition === "available" || this.explicitReactivationPending);
  }
  isExplicitReactivationPending() {
    return this.explicitReactivationPending;
  }
  resetForSession(ctx, event, argv = process.argv) {
    const persistedInactive = hasInactiveEntry(entriesFrom(ctx));
    this.disposition = "available";
    this.reason = undefined;
    this.newSessionBoundary = event?.reason !== "reload";
    this.explicitReactivationPending = false;
    this.armedState = undefined;
    const hostStartupSelection =
      !this.stockPi &&
      (ctx?.modelStateProvenance?.explicitModel === true || ctx?.modelStateProvenance?.explicitThinking === true);
    this.startupSelectionSuppressed =
      hostStartupSelection || (hasExplicitStartupSelection(argv) && (this.newSessionBoundary || !persistedInactive));
  }
  ensureStartupInactive(ctx, effective) {
    if (!this.stockPi || !this.startupSelectionSuppressed || !effective) return;
    const entries = entriesFrom(ctx);
    const shouldPersistFresh = this.newSessionBoundary || !hasInactiveEntry(entries);
    if (shouldPersistFresh && !this.persistInactive(ctx, "Pi startup model or thinking selection")) {
      this.disposition = "blocked";
      this.reason = "inactive_state_persistence_failed";
      return;
    }
    this.disposition = "inactive";
    this.reason = "Pi startup model or thinking selection";
  }
  reconcileNativeEntries(ctx) {
    if (!this.stockPi || this.startupSelectionSuppressed || this.explicitReactivationPending) return;
    const entries = entriesFrom(ctx);
    if (!hasNativeOverrideAfterRoutingState(entries)) return;
    this.disposition = "inactive";
    this.reason = "Pi model state override during recovery";
    if (!hasInactiveEntry(entries) && !this.persistInactive(ctx, this.reason)) {
      this.disposition = "blocked";
      this.reason = "inactive_state_persistence_failed";
    }
  }
  observeArmedNativeChange(ctx, reason) {
    if (!this.stockPi) return;
    this.disposition = "inactive";
    this.reason = reason;
    if (!this.persistInactive(ctx, reason)) {
      this.disposition = "blocked";
      this.reason = "inactive_state_persistence_failed";
    }
  }
  beginExplicitReactivation() {
    this.startupSelectionSuppressed = false;
    this.explicitReactivationPending = true;
  }
  cancelExplicitReactivation() {
    this.explicitReactivationPending = false;
  }
  markActive() {
    this.startupSelectionSuppressed = false;
    this.explicitReactivationPending = false;
    this.disposition = "available";
    this.reason = undefined;
  }
  reset() {
    this.startupSelectionSuppressed = false;
    this.explicitReactivationPending = false;
    this.disposition = "available";
    this.reason = undefined;
    this.newSessionBoundary = false;
    this.controllerState = undefined;
    this.armedState = undefined;
  }
  persistInactive(ctx, reason) {
    const candidate = ctx?.model;
    const thinkingLevel = ctx?.thinkingLevel;
    if (
      !candidate ||
      typeof candidate.provider !== "string" ||
      typeof candidate.id !== "string" ||
      typeof thinkingLevel !== "string"
    ) {
      return false;
    }
    try {
      this.pi.appendEntry(COGNITIVE_ROUTING_INACTIVE_ENTRY, {
        version: 1,
        source: "user",
        reason,
        pair: { provider: candidate.provider, modelId: candidate.id, thinkingLevel },
      });
      return true;
    } catch {
      return false;
    }
  }
}
