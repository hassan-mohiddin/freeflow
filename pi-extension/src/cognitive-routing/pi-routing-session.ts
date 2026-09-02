import {
  COGNITIVE_ROUTING_INACTIVE_ENTRY,
  CognitiveRoutingController,
  type CognitiveRoutingControllerState,
  type CognitiveRoutingMechanism,
} from "./controller.js";
import {
  createPiSessionControllerHost,
  parsePiSessionModelStateCommit,
  PI_SESSION_MODEL_STATE_ENTRY,
} from "./pi-session-control.js";
import type {
  CognitiveRoutingCapabilityState,
  CognitiveRoutingProfileName,
  CognitiveRoutingSessionStart,
} from "./types.js";
import { isPiFlowHost } from "../runtime/runtime-identity.js";
import { readCapabilityState, refreshRuntimeContext } from "../runtime/runtime-context.js";

export type ArmedCognitiveRoutingState = CognitiveRoutingSessionStart;

export type ArmedCognitiveRoutingController = {
  state(): CognitiveRoutingControllerState;
  setManualProfile(
    profile: CognitiveRoutingProfileName,
    _mechanism?: string,
  ): Promise<{ status: "active"; profile: CognitiveRoutingProfileName }>;
  setAutomaticControl(_mechanism?: string): Promise<{ status: "automatic" }>;
};

export function armedCognitiveRoutingControllerState(
  armed: Readonly<ArmedCognitiveRoutingState>,
): CognitiveRoutingControllerState {
  return {
    effective: true,
    controlMode: armed.control === "manual" ? `manual-${armed.profile}` : "automatic",
    activeProfile: armed.profile,
  };
}

export function armedCognitiveRoutingStateFor(
  capabilityState: CognitiveRoutingCapabilityState,
): ArmedCognitiveRoutingState {
  return { ...capabilityState.sessionStart };
}

export function createArmedCognitiveRoutingController(
  armed: ArmedCognitiveRoutingState,
): ArmedCognitiveRoutingController {
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

type SessionStartEvent = { reason?: string } | undefined;

type SessionEntriesContext = {
  sessionManager?: {
    getBranch?: () => readonly unknown[];
    getEntries?: () => readonly unknown[];
  };
};

export type PiRoutingSessionDisposition = "available" | "inactive" | "blocked";

type PiRoutingRuntimeState =
  | CognitiveRoutingControllerState
  | {
      effective: false;
      controlMode?: CognitiveRoutingControllerState["controlMode"];
      activeProfile?: CognitiveRoutingProfileName;
      runtimeStatus: "inactive" | "blocked";
      runtimeReason?: string;
    };

export type PiRoutingSessionSnapshot = {
  status: "available" | "active" | "armed" | "inactive" | "blocked";
  disposition: PiRoutingSessionDisposition;
  startupSelectionSuppressed: boolean;
  reason?: string;
  controllerState?: CognitiveRoutingControllerState;
  runtimeState?: PiRoutingRuntimeState;
};

const THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

function entriesFrom(ctx: SessionEntriesContext | undefined): readonly unknown[] {
  try {
    const entries = ctx?.sessionManager?.getBranch?.() ?? ctx?.sessionManager?.getEntries?.() ?? [];
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

function hasExplicitStartupSelection(argv: readonly string[]): boolean {
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

function hasInactiveEntry(entries: readonly unknown[]): boolean {
  return entries.some(
    (entry) =>
      Boolean(entry && typeof entry === "object") &&
      (entry as { type?: unknown; customType?: unknown }).type === "custom" &&
      (entry as { customType?: unknown }).customType === COGNITIVE_ROUTING_INACTIVE_ENTRY,
  );
}

function hasNativeOverrideAfterRoutingState(entries: readonly unknown[]): boolean {
  let latestNativePosition = -1;
  let latestCommittedRoutingPosition = -1;
  let latestInactivePosition = -1;
  let modelChangeCount = 0;
  let thinkingChangeCount = 0;

  entries.forEach((entry: unknown, position) => {
    if (!entry || typeof entry !== "object") return;
    const record = entry as Record<string, unknown>;
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

function hasPiSessionModelStateApi(pi: any): boolean {
  return (
    typeof pi?.appendEntry === "function" &&
    typeof pi?.setModel === "function" &&
    typeof pi?.setThinkingLevel === "function"
  );
}

function hasCognitiveRoutingHost(pi: any, ctx: any): boolean {
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

function cognitiveRoutingControllerHost(pi: any, ctx: any): any | undefined {
  if (isPiFlowHost(pi?.host) && typeof pi?.acquireModelStateControl === "function") return pi;
  if (hasPiSessionModelStateApi(pi) && hasCognitiveRoutingHost(pi, ctx)) {
    return createPiSessionControllerHost({ pi, ctx });
  }
  return undefined;
}

export class PiRoutingSession {
  private disposition: PiRoutingSessionDisposition = "available";
  private reason: string | undefined;
  private startupSelectionSuppressed = false;
  private readonly pi: any;
  private readonly stockPi: boolean;
  private newSessionBoundary = false;
  private explicitReactivationPending = false;
  private controllerState: CognitiveRoutingController | undefined;
  private armedState: ArmedCognitiveRoutingState | undefined;

  get controller(): CognitiveRoutingController | undefined {
    return this.controllerState;
  }

  controllerForTool(): CognitiveRoutingController | undefined {
    return this.controllerState;
  }

  hasController(): boolean {
    return this.controllerState !== undefined;
  }

  async reconcileLiveState(reason = "Pi model state diverged"): Promise<any> {
    return this.controllerState?.reconcileLiveState(reason) ?? { status: "ignored" };
  }

  async shutdown(reason?: string): Promise<any> {
    const controller = this.controllerState;
    this.reset();
    return controller?.shutdown(reason as any);
  }

  get armed(): Readonly<ArmedCognitiveRoutingState> | undefined {
    return this.armedState ? { ...this.armedState } : undefined;
  }

  clearController(): void {
    this.controllerState = undefined;
  }

  clearArmed(): void {
    this.armedState = undefined;
  }

  armFromCapability(capabilityState: CognitiveRoutingCapabilityState): void {
    this.armedState = armedCognitiveRoutingStateFor(capabilityState);
  }

  cycleArmedManual(): { target: CognitiveRoutingProfileName } | undefined {
    if (!this.armedState) return undefined;
    const target = this.armedState.profile === "reasoning" ? "standard" : "reasoning";
    this.armedState.profile = target;
    this.armedState.control = "manual";
    return { target };
  }

  cycleArmedAutomatic(): { kind: "control"; changed: boolean } | undefined {
    if (!this.armedState) return undefined;
    if (this.armedState.control === "automatic") return { kind: "control", changed: false };
    this.armedState.control = "automatic";
    return { kind: "control", changed: true };
  }

  armedController(): ArmedCognitiveRoutingController | undefined {
    return this.armedState ? createArmedCognitiveRoutingController(this.armedState) : undefined;
  }

  commandController(): ArmedCognitiveRoutingController | CognitiveRoutingController | undefined {
    return this.controllerState ?? this.armedController();
  }

  history(options: any = {}): any {
    return this.controllerState?.history(options);
  }

  async observeNativeChange(reason: string, source: "set" | "cycle" | "restore" | undefined = undefined): Promise<any> {
    return this.controllerState?.observeNativeChange(reason, source) ?? { status: "ignored" };
  }

  async setManualProfile(
    profile: CognitiveRoutingProfileName,
    mechanism: CognitiveRoutingMechanism = "profile-command",
  ): Promise<any> {
    if (this.controllerState) return this.controllerState.setManualProfile(profile, mechanism);
    return this.armedController()?.setManualProfile(profile, mechanism) ?? { status: "inactive", reason: "not_active" };
  }

  async setAutomaticControl(mechanism: CognitiveRoutingMechanism = "profile-command"): Promise<any> {
    if (this.controllerState) return this.controllerState.setAutomaticControl(mechanism);
    return this.armedController()?.setAutomaticControl(mechanism) ?? { status: "inactive", reason: "not_active" };
  }

  async switchAutomaticProfile(
    profile: CognitiveRoutingProfileName,
    reason: string,
    source: "agent" | "system" | "user" = "user",
    mechanism: CognitiveRoutingMechanism = "profile-shortcut",
  ): Promise<any> {
    return (
      this.controllerState?.switchAutomaticProfile(profile, reason, source, mechanism) ?? {
        status: "blocked",
        reason: "not_active",
      }
    );
  }

  async reconcileBranch(mechanism: CognitiveRoutingMechanism = "session-tree"): Promise<any> {
    return this.controllerState?.reconcileBranch(mechanism);
  }

  constructor({ pi, stockPi }: { pi: any; stockPi: boolean }) {
    this.pi = pi;
    this.stockPi = stockPi;
  }

  snapshot(): PiRoutingSessionSnapshot {
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

  supportsCognitiveRoutingRuntime(): boolean {
    return isPiFlowHost(this.pi?.host) || hasPiSessionModelStateApi(this.pi);
  }

  async reconcileController(
    ctx: any,
    capabilityState: any,
    initialSessionStart?: CognitiveRoutingSessionStart,
  ): Promise<CognitiveRoutingController | undefined> {
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
      let nextController: CognitiveRoutingController | undefined;
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

  async applyLiveCapabilityState(
    ctx: any,
    options: { reconcileCognitiveRouting?: boolean; materializeCognitiveRouting?: boolean } = {},
  ): Promise<CognitiveRoutingController | undefined> {
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

  runtimeState(): PiRoutingRuntimeState | undefined {
    if (this.disposition === "inactive") {
      return { effective: false, runtimeStatus: "inactive", ...(this.reason ? { runtimeReason: this.reason } : {}) };
    }
    if (this.disposition === "blocked") {
      return { effective: false, runtimeStatus: "blocked", ...(this.reason ? { runtimeReason: this.reason } : {}) };
    }
    return undefined;
  }

  canAutoActivate(): boolean {
    return !this.startupSelectionSuppressed && (this.disposition === "available" || this.explicitReactivationPending);
  }

  isExplicitReactivationPending(): boolean {
    return this.explicitReactivationPending;
  }

  resetForSession(ctx: SessionEntriesContext | undefined, event: SessionStartEvent, argv = process.argv): void {
    const persistedInactive = hasInactiveEntry(entriesFrom(ctx));
    this.disposition = "available";
    this.reason = undefined;
    this.newSessionBoundary = event?.reason !== "reload";
    this.explicitReactivationPending = false;
    this.armedState = undefined;
    const hostStartupSelection =
      !this.stockPi &&
      ((ctx as any)?.modelStateProvenance?.explicitModel === true ||
        (ctx as any)?.modelStateProvenance?.explicitThinking === true);
    this.startupSelectionSuppressed =
      hostStartupSelection || (hasExplicitStartupSelection(argv) && (this.newSessionBoundary || !persistedInactive));
  }

  ensureStartupInactive(ctx: SessionEntriesContext | undefined, effective: boolean): void {
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

  reconcileNativeEntries(ctx: SessionEntriesContext | undefined): void {
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

  observeArmedNativeChange(ctx: SessionEntriesContext | undefined, reason: string): void {
    if (!this.stockPi) return;
    this.disposition = "inactive";
    this.reason = reason;
    if (!this.persistInactive(ctx, reason)) {
      this.disposition = "blocked";
      this.reason = "inactive_state_persistence_failed";
    }
  }

  beginExplicitReactivation(): void {
    this.startupSelectionSuppressed = false;
    this.explicitReactivationPending = true;
  }

  cancelExplicitReactivation(): void {
    this.explicitReactivationPending = false;
  }

  markActive(): void {
    this.startupSelectionSuppressed = false;
    this.explicitReactivationPending = false;
    this.disposition = "available";
    this.reason = undefined;
  }

  reset(): void {
    this.startupSelectionSuppressed = false;
    this.explicitReactivationPending = false;
    this.disposition = "available";
    this.reason = undefined;
    this.newSessionBoundary = false;
    this.controllerState = undefined;
    this.armedState = undefined;
  }

  private persistInactive(ctx: SessionEntriesContext | undefined, reason: string): boolean {
    const candidate = (ctx as any)?.model;
    const thinkingLevel = (ctx as any)?.thinkingLevel;
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
