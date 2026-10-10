export const DEFAULT_TASK_MEMORY_ENABLED = false;
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function validateTaskMemoryConfig(value) {
  if (!record(value)) return "taskMemory must be an object";
  const unknown = Object.keys(value).find((key) => key !== "enabled");
  if (unknown) return `taskMemory has unsupported key: ${unknown}`;
  if (value.enabled !== undefined && typeof value.enabled !== "boolean") return "taskMemory.enabled must be a boolean";
  return null;
}
export function resolveTaskMemoryConfig(repository, local, freeflowEnabled) {
  const repositoryConfig = record(repository.taskMemory) ? repository.taskMemory : {};
  const localConfig = record(local.taskMemory) ? local.taskMemory : {};
  const value = Object.hasOwn(localConfig, "enabled") ? localConfig.enabled : repositoryConfig.enabled;
  const enabled = value === undefined ? DEFAULT_TASK_MEMORY_ENABLED : value === true;
  return { enabled, effective: freeflowEnabled && enabled };
}
