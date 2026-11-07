import type { readCapabilityState } from "./config.js";
import { ignoredStateLine } from "./config-validation.js";
import { hasUsableMandatoryPrompts } from "./prompts.js";

/**
 * Freeflow's two status surfaces. The footer shows current Freeflow settings only; the /freeflow status report carries
 * diagnostics such as prompt-cache health.
 */
export function setFreeflowStatus(
  ctx: any,
  capabilityState: any = undefined,
  freeflowContext: any = undefined,
  options: {
    /** The task this session holds in the Freeflow store, which the footer shows (P6). */
    task?: string;
  } = {},
) {
  // Setup needed (D-045, round 3): no shared config file, so Freeflow is not running in this folder.
  if (capabilityState?.setupNeeded) {
    ctx.ui.setStatus("freeflow", "freeflow: setup needed");
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

  // The footer shows state that changes while you work: the task this session holds; capabilities are settings
  // (Task 005). With every capability off it says so. Settings a config file ignores keep their defaults, and the
  // footer says how many and where to look (D-045).
  const anyOn = ["compaction", "toolExecution", "messaging"].some(
    (name) => capabilityState?.[name]?.effective === true || capabilityState?.[name]?.enabled === true,
  );
  const base = options.task ? `task ${options.task}` : anyOn || !capabilityState ? "on" : "on (all capabilities off)";
  const ignored = capabilityState?.ignored?.length ?? 0;
  const notice = ignored > 0 ? `${ignored} setting${ignored === 1 ? "" : "s"} ignored (settings.mjs doctor)` : null;
  ctx.ui.setStatus("freeflow", `freeflow: ${[base, notice].filter(Boolean).join(" · ")}`);
}

/** The /freeflow status report: capability state and diagnostics, including prompt-cache health. */
export function freeflowStatusText(
  state: Awaited<ReturnType<typeof readCapabilityState>>,
  diagnostics?: {
    cacheHealth?: readonly string[];
    backgroundRunning?: number;
    compaction?: string;
    store?: string;
    messaging?: string;
  },
): string {
  if (state.setupNeeded) return "Freeflow: inactive (repo not set up); run /setup-freeflow";
  const sessionSuffix = (source: string) => (source === "session" ? " (session override)" : "");
  return [
    `Freeflow: ${state.enabled ? "enabled" : "disabled"}${sessionSuffix(state.configSources.enabled)}`,
    ...(ignoredStateLine(state.ignored ?? []) ? [ignoredStateLine(state.ignored ?? [])!] : []),
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
