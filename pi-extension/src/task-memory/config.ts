/** Task memory: Working Records attached to a Pi session. A prototype, off unless a config turns it on. */
export type TaskMemoryState = Readonly<{ enabled: boolean; effective: boolean }>;

export const DEFAULT_TASK_MEMORY_ENABLED = false;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateTaskMemoryConfig(value: unknown): string | null {
  if (!record(value)) return "taskMemory must be an object";
  const unknown = Object.keys(value).find((key) => key !== "enabled");
  if (unknown) return `taskMemory has unsupported key: ${unknown}`;
  if (value.enabled !== undefined && typeof value.enabled !== "boolean") return "taskMemory.enabled must be a boolean";
  return null;
}

export function resolveTaskMemoryConfig(
  repository: Record<string, unknown>,
  local: Record<string, unknown>,
  freeflowEnabled: boolean,
): TaskMemoryState {
  const repositoryConfig = record(repository.taskMemory) ? repository.taskMemory : {};
  const localConfig = record(local.taskMemory) ? local.taskMemory : {};
  const value = Object.hasOwn(localConfig, "enabled") ? localConfig.enabled : repositoryConfig.enabled;
  const enabled = value === undefined ? DEFAULT_TASK_MEMORY_ENABLED : value === true;
  return { enabled, effective: freeflowEnabled && enabled };
}
