import { APPLY_PATCH } from "./apply-patch/tool.js";
/** Freeflow's own Tool Execution tools; registered once and declared exactly while Tool Execution is effective. */
export const TOOL_EXECUTION_TOOLS = [APPLY_PATCH];
/**
 * Declare or withdraw Freeflow's tools when Tool Execution's effective state changes. Missing tools are appended and
 * existing ones keep their place, so repeated calls leave the tool list unchanged within a configuration.
 */
export function applyToolExecutionTools(pi, effective) {
  if (typeof pi.getActiveTools !== "function" || typeof pi.setActiveTools !== "function") return;
  const current = pi.getActiveTools();
  const next = effective
    ? [...current, ...TOOL_EXECUTION_TOOLS.filter((name) => !current.includes(name))]
    : current.filter((name) => !TOOL_EXECUTION_TOOLS.includes(name));
  if (next.length !== current.length) pi.setActiveTools(next);
}
