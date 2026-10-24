export const DEFAULT_TOOL_EXECUTION_CONFIG = Object.freeze({
  enabled: true,
  guidanceNotices: true,
});
/** The keys `toolExecution` acts on; the settings test checks each has a /freeflow settings row. */
export const TOOL_EXECUTION_KEYS = ["enabled", "guidanceNotices"];
// Settings of the retired v2 runtime (.deprecated/tool-execution-v2). Existing configuration files keep loading;
// the values no longer do anything.
const RETIRED_KEYS = ["capture", "programs", "workspace", "discovery", "adapters", "accounting"];
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function validateToolExecutionConfig(value) {
  if (!record(value)) return "toolExecution must be an object";
  const unknown = Object.keys(value).find((key) => !TOOL_EXECUTION_KEYS.includes(key) && !RETIRED_KEYS.includes(key));
  if (unknown) return `toolExecution has unsupported key: ${unknown}`;
  if (value.enabled !== undefined && typeof value.enabled !== "boolean")
    return "toolExecution.enabled must be a boolean";
  if (value.guidanceNotices !== undefined && typeof value.guidanceNotices !== "boolean")
    return "toolExecution.guidanceNotices must be a boolean";
  return null;
}
export function resolveToolExecutionConfig(repository, local, freeflowEnabled) {
  const repositoryTool = record(repository.toolExecution) ? repository.toolExecution : {};
  const localTool = record(local.toolExecution) ? local.toolExecution : {};
  const setting = Object.hasOwn(localTool, "enabled") ? localTool.enabled : repositoryTool.enabled;
  const enabled = setting === undefined ? DEFAULT_TOOL_EXECUTION_CONFIG.enabled : setting === true;
  const notices = Object.hasOwn(localTool, "guidanceNotices")
    ? localTool.guidanceNotices
    : repositoryTool.guidanceNotices;
  const guidanceNotices = notices === undefined ? DEFAULT_TOOL_EXECUTION_CONFIG.guidanceNotices : notices === true;
  return { enabled, guidanceNotices, effective: freeflowEnabled && enabled };
}
