import { hasUsableMandatoryPrompts } from "./prompts.js";
import type { ToolExecutionRuntimeSnapshot } from "./runtime-state.js";

/**
 * The freeflow footer status: current Freeflow settings only, never cache or tool diagnostics (those go to /freeflow
 * status).
 */
export function setFreeflowStatus(
  ctx,
  capabilityState = undefined,
  cognitiveRoutingRuntime = undefined,
  freeflowContext = undefined,
  options: {
    cognitiveRoutingStartupPending?: boolean;
    startupSelectionSuppressed?: boolean;
    toolExecutionRuntime?: ToolExecutionRuntimeSnapshot;
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
  const toolIssue =
    options.toolExecutionRuntime?.lastFailure?.code ??
    options.toolExecutionRuntime?.failures?.at(-1)?.code ??
    options.toolExecutionRuntime?.adapters?.failures?.at(-1)?.code;
  if (capabilityState?.toolExecution?.effective === true && options.toolExecutionRuntime?.unresolvedEffects)
    active.push(`tools fenced ${options.toolExecutionRuntime.unresolvedEffects}`);
  else if (capabilityState?.toolExecution?.effective === true && toolIssue) active.push(`tools ${toolIssue}`);
  ctx.ui.setStatus("freeflow", `freeflow: ${active.length > 0 ? active.join(" · ") : "active"}`);
}
