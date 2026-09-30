import type { readCapabilityState } from "./config.js";
import { hasUsableMandatoryPrompts } from "./prompts.js";

/**
 * Freeflow's two status surfaces. The footer shows current Freeflow settings only; the /freeflow status report carries
 * diagnostics such as prompt-cache health.
 */
export function setFreeflowStatus(
  ctx,
  capabilityState = undefined,
  cognitiveRoutingRuntime = undefined,
  freeflowContext = undefined,
  options: {
    cognitiveRoutingStartupPending?: boolean;
    startupSelectionSuppressed?: boolean;
  } = {},
) {
  if (capabilityState && !capabilityState.configured) {
    ctx.ui.setStatus("freeflow", capabilityState.configExists ? "freeflow: config error" : "freeflow: setup needed");
    return;
  }
  if (capabilityState && !capabilityState.enabled) {
    const source = capabilityState.configSources?.enabled === "session" ? " (session)" : "";
    ctx.ui.setStatus("freeflow", `freeflow: off${source}`);
    return;
  }
  if (capabilityState?.enabled === true && !hasUsableMandatoryPrompts(freeflowContext)) {
    ctx.ui.setStatus("freeflow", "freeflow: unavailable");
    return;
  }

  const active: string[] = [];
  const cognitiveRouting = capabilityState?.cognitiveRouting;
  const cognitiveRoutingInactive =
    cognitiveRouting?.enabled === true && cognitiveRoutingRuntime?.runtimeStatus === "inactive";
  const cognitiveRoutingBlocked =
    cognitiveRouting?.enabled === true &&
    (cognitiveRouting?.blockingReason?.code === "runtime_blocked" ||
      cognitiveRoutingRuntime?.runtimeStatus === "blocked");
  const cognitiveRoutingActive = cognitiveRouting?.effective === true && cognitiveRoutingRuntime?.effective === true;
  const startupSelectionSuppressesCognitiveRouting = options.startupSelectionSuppressed === true;
  if (cognitiveRoutingInactive) {
    active.push("cognitive inactive");
  } else if (cognitiveRoutingBlocked) {
    active.push(
      `cognitive blocked · ${cognitiveRoutingRuntime?.runtimeReason ?? "runtime_blocked"} · /freeflow profile auto`,
    );
  } else if (cognitiveRoutingActive) {
    const profile = cognitiveRoutingRuntime.activeProfile;
    const control = String(cognitiveRoutingRuntime.controlMode).startsWith("manual-") ? "manual hold" : "automatic";
    active.push(
      `${profile} · ${control} · ${cognitiveRoutingRuntime.delegation ?? cognitiveRouting.delegation ?? "executor"} mode${cognitiveRoutingRuntime.pendingPair ? ` · ${cognitiveRoutingRuntime.pendingPair} on next prompt` : ""}${cognitiveRoutingRuntime.pairMismatch ? " · model differs" : ""}`,
    );
  } else if (cognitiveRouting?.enabled === true) {
    if (cognitiveRouting.blockingReason?.code === "runtime_disabled") {
      active.push("cognitive blocked · runtime_disabled");
    } else if (
      cognitiveRouting.effective === true &&
      cognitiveRoutingRuntime === undefined &&
      options.cognitiveRoutingStartupPending === true &&
      !startupSelectionSuppressesCognitiveRouting
    ) {
      active.push("coordinator · pending");
    } else {
      const reason =
        cognitiveRouting.effective === true
          ? (cognitiveRoutingRuntime?.blockingReason?.code ?? "runtime_inactive")
          : (cognitiveRouting.blockingReason?.code ?? "unavailable");
      active.push(`cognitive blocked · ${reason}`);
    }
  }
  ctx.ui.setStatus("freeflow", `freeflow: ${active.length > 0 ? active.join(" · ") : "active"}`);
}

/** The /freeflow status report: capability state and diagnostics, including prompt-cache health. */
export function freeflowStatusText(
  state: Awaited<ReturnType<typeof readCapabilityState>>,
  cognitiveRoutingController?: {
    state(): {
      effective?: boolean;
      activeProfile?: unknown;
      controlMode?: unknown;
      presetWarnings?: readonly string[];
    };
  },
  diagnostics?: { cacheHealth?: readonly string[]; backgroundRunning?: number },
): string {
  if (!state.configured) {
    if (!state.configExists) return "Freeflow: inactive (repo not set up); run /setup-freeflow";
    const configPath =
      state.localConfigExists && !state.localConfigValid ? ".freeflow/local.json" : ".freeflow/config.json";
    return `Freeflow: inactive (invalid config: ${state.parseError ?? "unknown parse error"}); fix ${configPath} or run /setup-freeflow`;
  }
  const sessionSuffix = (source: string) => (source === "session" ? " (session override)" : "");
  const routingState = cognitiveRoutingController?.state();
  const cognitiveRouting = state.cognitiveRouting;
  const cognitiveRoutingStatus = cognitiveRouting
    ? cognitiveRouting.blockingReason?.code === "runtime_disabled"
      ? "unavailable (host unsupported)"
      : cognitiveRouting.effective
        ? routingState?.effective
          ? `active (${routingState.activeProfile ?? "unknown"}, ${routingState.controlMode})`
          : "effective (inactive)"
        : cognitiveRouting.enabled
          ? `blocked (${cognitiveRouting.blockingReason.code})`
          : "disabled"
    : undefined;
  return [
    `Freeflow: ${state.enabled ? "enabled" : "disabled"}${sessionSuffix(state.configSources.enabled)}`,
    ...(cognitiveRoutingStatus ? [`cognitive routing: ${cognitiveRoutingStatus}`] : []),
    ...(routingState?.presetWarnings?.length
      ? [`routing preset warnings: ${routingState.presetWarnings.join(" ")}`]
      : []),
    `tool execution: ${state.toolExecution?.effective ? "enabled" : "disabled"}`,
    ...(diagnostics?.backgroundRunning ? [`background commands: ${diagnostics.backgroundRunning} running`] : []),
    ...(diagnostics?.cacheHealth?.length ? [`prompt cache: ${diagnostics.cacheHealth.join(" ")}`] : []),
  ].join("; ");
}
