import { hasUsableMandatoryPrompts } from "./prompts.js";
/**
 * Freeflow's two status surfaces. The footer shows current Freeflow settings only; the /freeflow status report carries
 * diagnostics such as tool-runtime issues and prompt-cache health.
 */
export function setFreeflowStatus(
  ctx,
  capabilityState = undefined,
  cognitiveRoutingRuntime = undefined,
  freeflowContext = undefined,
  options = {},
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
  const active = [];
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
/** The /freeflow status report: capability state and diagnostics, including prompt-cache health. */
export function freeflowStatusText(state, cognitiveRoutingController, toolExecutionRuntime) {
  if (!state.configured) {
    if (!state.configExists) return "Freeflow: inactive (repo not set up); run /setup-freeflow";
    const configPath =
      state.localConfigExists && !state.localConfigValid ? ".freeflow/local.json" : ".freeflow/config.json";
    return `Freeflow: inactive (invalid config: ${state.parseError ?? "unknown parse error"}); fix ${configPath} or run /setup-freeflow`;
  }
  const sessionSuffix = (source) => (source === "session" ? " (session override)" : "");
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
  const toolIssue =
    toolExecutionRuntime?.lastFailure ??
    toolExecutionRuntime?.failures?.at(-1) ??
    toolExecutionRuntime?.adapters?.failures?.at(-1);
  return [
    `Freeflow: ${state.enabled ? "enabled" : "disabled"}${sessionSuffix(state.configSources.enabled)}`,
    ...(cognitiveRoutingStatus ? [`cognitive routing: ${cognitiveRoutingStatus}`] : []),
    ...(routingState?.presetWarnings?.length
      ? [`routing preset warnings: ${routingState.presetWarnings.join(" ")}`]
      : []),
    `tool execution: ${state.toolExecution?.effective ? "enabled" : "disabled"} (capture ${state.toolExecution?.capture?.effective ? "enabled" : "disabled"}, verified reader ${state.toolExecution?.effective ? "enabled" : "disabled"}, workspace ${state.toolExecution?.workspace?.effective ? (state.toolExecution.workspace.write ? "read/write" : "read-only") : "disabled"}, programs ${state.toolExecution?.programs?.mode ?? "off"}, live effects ${toolExecutionRuntime?.unresolvedEffects ? `fenced (${toolExecutionRuntime.unresolvedEffects})` : "settled"}, discovery ${state.toolExecution?.discovery?.effective ? "enabled" : "disabled"}, catalog ${toolExecutionRuntime?.catalog?.operations ?? 0} operations/${toolExecutionRuntime?.catalog?.metadataBytes ?? 0} bytes, adapters ${toolExecutionRuntime?.adapters?.announced?.filter((adapter) => adapter.active).length ?? 0} active/${toolExecutionRuntime?.adapters?.allowed?.length ?? 0} allowed, accounting ${state.toolExecution?.accounting?.effective ? "enabled" : "disabled"}; native Bash is built in, custom tools require adapters; captured files are retained until explicit deletion${toolIssue?.code ? `; latest ${toolExecutionRuntime?.lastFailure ? "program" : toolExecutionRuntime?.failures?.length ? "capture" : "adapter"} issue ${toolIssue.code}${toolIssue.message ? `: ${toolIssue.message}` : ""}` : ""})`,
    ...(toolExecutionRuntime?.queued ? [`capture publications queued: ${toolExecutionRuntime.queued}`] : []),
    ...(toolExecutionRuntime?.cacheHealth?.length
      ? [`prompt cache: ${toolExecutionRuntime.cacheHealth.join(" ")}`]
      : []),
  ].join("; ");
}
