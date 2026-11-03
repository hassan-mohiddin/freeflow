import { hasUsableMandatoryPrompts } from "./prompts.js";
/**
 * Freeflow's two status surfaces. The footer shows current Freeflow settings only; the /freeflow status report carries
 * diagnostics such as prompt-cache health.
 */
export function setFreeflowStatus(ctx, capabilityState = undefined, freeflowContext = undefined, options = {}) {
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
  // The footer shows state that changes while you work: the task this session holds; capabilities are settings
  // (Task 005). With every capability off it says so.
  if (options.task) active.push(`task ${options.task}`);
  const anyOn = ["compaction", "toolExecution", "messaging"].some(
    (name) => capabilityState?.[name]?.effective === true || capabilityState?.[name]?.enabled === true,
  );
  ctx.ui.setStatus(
    "freeflow",
    `freeflow: ${active.length > 0 ? active.join(" · ") : anyOn || !capabilityState ? "on" : "on (all capabilities off)"}`,
  );
}
/** The /freeflow status report: capability state and diagnostics, including prompt-cache health. */
export function freeflowStatusText(state, diagnostics) {
  if (!state.configured) {
    if (!state.configExists) return "Freeflow: inactive (repo not set up); run /setup-freeflow";
    const configPath =
      state.localConfigExists && !state.localConfigValid ? ".freeflow/local.json" : ".freeflow/config.json";
    return `Freeflow: inactive (invalid config: ${state.parseError ?? "unknown parse error"}); fix ${configPath} or run /setup-freeflow`;
  }
  const sessionSuffix = (source) => (source === "session" ? " (session override)" : "");
  return [
    `Freeflow: ${state.enabled ? "enabled" : "disabled"}${sessionSuffix(state.configSources.enabled)}`,
    `tool execution: ${state.toolExecution?.effective ? "enabled" : "disabled"}`,
    ...(diagnostics?.backgroundRunning ? [`background commands: ${diagnostics.backgroundRunning} running`] : []),
    `compaction: ${state.compaction?.effective ? `enabled${diagnostics?.compaction ? ` (${diagnostics.compaction})` : ""}` : "disabled"}`,
    ...(state.taskMemoryRetired
      ? [
          "task memory: Pi's Task Memory is gone, and its taskMemory settings are ignored: tasks live in the Freeflow store (Setup Freeflow moves old records in)",
        ]
      : []),
    ...(diagnostics?.store ? [`store: ${diagnostics.store}`] : []),
    ...(state.messaging?.effective
      ? [`messaging: enabled${diagnostics?.messaging ? ` (${diagnostics.messaging})` : ""}`]
      : []),
    ...(diagnostics?.cacheHealth?.length ? [`prompt cache: ${diagnostics.cacheHealth.join(" ")}`] : []),
  ].join("; ");
}
