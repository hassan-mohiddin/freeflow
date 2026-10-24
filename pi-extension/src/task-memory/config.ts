/** Task memory: Working Records attached to a Pi session. A prototype, off unless a config turns it on. */
export type TaskMemoryState = Readonly<{
  enabled: boolean;
  effective: boolean;
  /** Proposals whose group is on run without the user's dialog (Task 004 D-002); all off by default. */
  autoApprove: Readonly<Record<AutoApproveGroup, boolean>>;
}>;

export const DEFAULT_TASK_MEMORY_ENABLED = false;
/** The keys `taskMemory` accepts; `autoApprove` holds one switch per group. The settings test checks each has a row. */
export const TASK_MEMORY_KEYS = ["enabled", "autoApprove"] as const;

/** The groups of proposed actions that can skip the confirmation dialog, and the task_memory actions in each. */
export const AUTO_APPROVE_GROUPS = {
  attach: ["attach", "confirm"],
  create: ["create", "child"],
  env: ["env"],
  fanout: ["fanout"],
  projects: ["project_new", "project_link", "import"],
} as const;
export type AutoApproveGroup = keyof typeof AUTO_APPROVE_GROUPS;
const GROUP_NAMES = Object.keys(AUTO_APPROVE_GROUPS) as AutoApproveGroup[];

/** The group a proposed action belongs to. */
export function autoApproveGroup(action: string): AutoApproveGroup | undefined {
  return GROUP_NAMES.find((group) => (AUTO_APPROVE_GROUPS[group] as readonly string[]).includes(action));
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateTaskMemoryConfig(value: unknown): string | null {
  if (!record(value)) return "taskMemory must be an object";
  const unknown = Object.keys(value).find((key) => !(TASK_MEMORY_KEYS as readonly string[]).includes(key));
  if (unknown) return `taskMemory has unsupported key: ${unknown}`;
  if (value.enabled !== undefined && typeof value.enabled !== "boolean") return "taskMemory.enabled must be a boolean";
  if (value.autoApprove !== undefined) {
    if (!record(value.autoApprove)) return "taskMemory.autoApprove must be an object";
    for (const [key, on] of Object.entries(value.autoApprove)) {
      if (!(GROUP_NAMES as string[]).includes(key))
        return `taskMemory.autoApprove has unsupported key: ${key}; use ${GROUP_NAMES.join(", ")}`;
      if (typeof on !== "boolean") return `taskMemory.autoApprove.${key} must be a boolean`;
    }
  }
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
  const repositoryApprove = record(repositoryConfig.autoApprove) ? repositoryConfig.autoApprove : {};
  const localApprove = record(localConfig.autoApprove) ? localConfig.autoApprove : {};
  const autoApprove = Object.fromEntries(
    GROUP_NAMES.map((group) => [
      group,
      (Object.hasOwn(localApprove, group) ? localApprove[group] : repositoryApprove[group]) === true,
    ]),
  ) as Record<AutoApproveGroup, boolean>;
  return { enabled, effective: freeflowEnabled && enabled, autoApprove };
}
