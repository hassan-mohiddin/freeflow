/** carry: context reuse, the agent carrying selected files and tool results into the next cycle. */
export type CompactionState = Readonly<{ enabled: boolean; effective: boolean; carry: boolean }>;

/** Freeflow compaction is on whenever Freeflow is, unless a config turns it off. */
export const DEFAULT_COMPACTION_ENABLED = true;
export const DEFAULT_COMPACTION_CARRY = true;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateCompactionConfig(value: unknown): string | null {
  if (!record(value)) return "compaction must be an object";
  const unknown = Object.keys(value).find((key) => key !== "enabled" && key !== "carry");
  if (unknown) return `compaction has unsupported key: ${unknown}`;
  for (const key of ["enabled", "carry"])
    if (value[key] !== undefined && typeof value[key] !== "boolean") return `compaction.${key} must be a boolean`;
  return null;
}

export function resolveCompactionConfig(
  repository: Record<string, unknown>,
  local: Record<string, unknown>,
  freeflowEnabled: boolean,
): CompactionState {
  const repositoryConfig = record(repository.compaction) ? repository.compaction : {};
  const localConfig = record(local.compaction) ? local.compaction : {};
  const layered = (key: string) => (Object.hasOwn(localConfig, key) ? localConfig[key] : repositoryConfig[key]);
  const enabled = layered("enabled") === undefined ? DEFAULT_COMPACTION_ENABLED : layered("enabled") === true;
  const carry = layered("carry") === undefined ? DEFAULT_COMPACTION_CARRY : layered("carry") === true;
  return { enabled, effective: freeflowEnabled && enabled, carry };
}
