export const DEFAULT_TASK_MEMORY_ENABLED = false;
/** The keys `taskMemory` accepts; `autoApprove` holds one switch per group. The settings test checks each has a row. */
export const TASK_MEMORY_KEYS = ["enabled", "autoApprove"];
/** The groups of proposed actions that can skip the confirmation dialog, and the task_memory actions in each. */
export const AUTO_APPROVE_GROUPS = {
  attach: ["attach", "confirm"],
  create: ["create", "child"],
  env: ["env"],
  fanout: ["fanout"],
  projects: ["project_new", "project_link", "import"],
};
const GROUP_NAMES = Object.keys(AUTO_APPROVE_GROUPS);
/** The group a proposed action belongs to. */
export function autoApproveGroup(action) {
  return GROUP_NAMES.find((group) => AUTO_APPROVE_GROUPS[group].includes(action));
}
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function validateTaskMemoryConfig(value) {
  if (!record(value)) return "taskMemory must be an object";
  const unknown = Object.keys(value).find((key) => !TASK_MEMORY_KEYS.includes(key));
  if (unknown) return `taskMemory has unsupported key: ${unknown}`;
  if (value.enabled !== undefined && typeof value.enabled !== "boolean") return "taskMemory.enabled must be a boolean";
  if (value.autoApprove !== undefined) {
    if (!record(value.autoApprove)) return "taskMemory.autoApprove must be an object";
    for (const [key, on] of Object.entries(value.autoApprove)) {
      if (!GROUP_NAMES.includes(key))
        return `taskMemory.autoApprove has unsupported key: ${key}; use ${GROUP_NAMES.join(", ")}`;
      if (typeof on !== "boolean") return `taskMemory.autoApprove.${key} must be a boolean`;
    }
  }
  return null;
}
export function resolveTaskMemoryConfig(repository, local, freeflowEnabled) {
  const repositoryConfig = record(repository.taskMemory) ? repository.taskMemory : {};
  const localConfig = record(local.taskMemory) ? local.taskMemory : {};
  const value = Object.hasOwn(localConfig, "enabled") ? localConfig.enabled : repositoryConfig.enabled;
  const enabled = value === undefined ? DEFAULT_TASK_MEMORY_ENABLED : value === true;
  const repositoryApprove = record(repositoryConfig.autoApprove) ? repositoryConfig.autoApprove : {};
  const localApprove = record(localConfig.autoApprove) ? localConfig.autoApprove : {};
  const autoApprove = Object.fromEntries(
    GROUP_NAMES.map((group) => [
      group,
      (Object.hasOwn(localApprove, group) ? localApprove[group] : repositoryApprove[group]) === true,
    ]),
  );
  return { enabled, effective: freeflowEnabled && enabled, autoApprove };
}
