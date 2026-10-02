export type CompactionState = Readonly<{ enabled: boolean; effective: boolean }>;

/** Freeflow compaction is on whenever Freeflow is, unless a config turns it off. */
export const DEFAULT_COMPACTION_ENABLED = true;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateCompactionConfig(value: unknown): string | null {
  if (!record(value)) return "compaction must be an object";
  const unknown = Object.keys(value).find((key) => key !== "enabled");
  if (unknown) return `compaction has unsupported key: ${unknown}`;
  if (value.enabled !== undefined && typeof value.enabled !== "boolean") return "compaction.enabled must be a boolean";
  return null;
}

export function resolveCompactionConfig(
  repository: Record<string, unknown>,
  local: Record<string, unknown>,
  freeflowEnabled: boolean,
): CompactionState {
  const repositoryConfig = record(repository.compaction) ? repository.compaction : {};
  const localConfig = record(local.compaction) ? local.compaction : {};
  const setting = Object.hasOwn(localConfig, "enabled") ? localConfig.enabled : repositoryConfig.enabled;
  const enabled = setting === undefined ? DEFAULT_COMPACTION_ENABLED : setting === true;
  return { enabled, effective: freeflowEnabled && enabled };
}
