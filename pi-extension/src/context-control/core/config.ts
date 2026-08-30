export const CONTEXT_CONTROL_MODES = ["model-only", "model-approval", "automatic"] as const;
export const CONTEXT_CONTROL_RECOVERY_SCOPES = ["active-branch", "current-session", "current-project"] as const;

export type ContextControlMode = (typeof CONTEXT_CONTROL_MODES)[number];
export type ContextControlRecoveryScope = (typeof CONTEXT_CONTROL_RECOVERY_SCOPES)[number];
export type ContextControlConfigSource = "repository" | "local" | "builtin";

export type ContextControlConfig = {
  enabled: boolean;
  cleanupMode: ContextControlMode;
  recoveryMode: ContextControlMode;
  recoveryScope: ContextControlRecoveryScope;
};

export type ContextControlConfigResolution = {
  configured: boolean;
  config: ContextControlConfig;
  sources: {
    enabled: ContextControlConfigSource;
    cleanupMode: ContextControlConfigSource;
    recoveryMode: ContextControlConfigSource;
    recoveryScope: ContextControlConfigSource;
  };
};

export const DEFAULT_CONTEXT_CONTROL_CONFIG: ContextControlConfig = Object.freeze({
  enabled: false,
  cleanupMode: "model-only",
  recoveryMode: "model-only",
  recoveryScope: "active-branch",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateContextControlConfig(value: unknown): string | null {
  if (value === undefined) return null;
  if (!isRecord(value)) return "contextControl must be an object";

  const allowedKeys = new Set(["enabled", "cleanupMode", "recoveryMode", "recoveryScope"]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) return `unsupported contextControl config key: ${key}`;
  }
  if (value.enabled !== undefined && typeof value.enabled !== "boolean") {
    return "contextControl.enabled must be a boolean";
  }
  if (value.cleanupMode !== undefined && !CONTEXT_CONTROL_MODES.includes(value.cleanupMode as ContextControlMode)) {
    return `invalid contextControl.cleanupMode: ${JSON.stringify(value.cleanupMode)}`;
  }
  if (value.recoveryMode !== undefined && !CONTEXT_CONTROL_MODES.includes(value.recoveryMode as ContextControlMode)) {
    return `invalid contextControl.recoveryMode: ${JSON.stringify(value.recoveryMode)}`;
  }
  if (
    value.recoveryScope !== undefined &&
    !CONTEXT_CONTROL_RECOVERY_SCOPES.includes(value.recoveryScope as ContextControlRecoveryScope)
  ) {
    return `invalid contextControl.recoveryScope: ${JSON.stringify(value.recoveryScope)}`;
  }
  return null;
}

function layerValue(
  repository: Record<string, unknown>,
  local: Record<string, unknown>,
  key: keyof ContextControlConfig,
): { value: unknown; source: ContextControlConfigSource } {
  const repositoryBlock = isRecord(repository.contextControl) ? repository.contextControl : {};
  const localBlock = isRecord(local.contextControl) ? local.contextControl : {};
  if (Object.hasOwn(localBlock, key)) return { value: localBlock[key], source: "local" };
  if (Object.hasOwn(repositoryBlock, key)) return { value: repositoryBlock[key], source: "repository" };
  return { value: DEFAULT_CONTEXT_CONTROL_CONFIG[key], source: "builtin" };
}

export function resolveContextControlConfig(
  repositoryConfig: unknown,
  localConfig: unknown,
): ContextControlConfigResolution {
  const repository = isRecord(repositoryConfig) ? repositoryConfig : {};
  const local = isRecord(localConfig) ? localConfig : {};
  const repositoryConfigured = Object.hasOwn(repository, "contextControl");
  const localConfigured = Object.hasOwn(local, "contextControl");
  const enabled = layerValue(repository, local, "enabled");
  const cleanupMode = layerValue(repository, local, "cleanupMode");
  const recoveryMode = layerValue(repository, local, "recoveryMode");
  const recoveryScope = layerValue(repository, local, "recoveryScope");
  return {
    configured: repositoryConfigured || localConfigured,
    config: {
      enabled: enabled.value as boolean,
      cleanupMode: cleanupMode.value as ContextControlMode,
      recoveryMode: recoveryMode.value as ContextControlMode,
      recoveryScope: recoveryScope.value as ContextControlRecoveryScope,
    },
    sources: {
      enabled: enabled.source,
      cleanupMode: cleanupMode.source,
      recoveryMode: recoveryMode.source,
      recoveryScope: recoveryScope.source,
    },
  };
}

export function contextControlConfigFromState(value: unknown): ContextControlConfig {
  if (!isRecord(value)) return DEFAULT_CONTEXT_CONTROL_CONFIG;
  const enabled = typeof value.enabled === "boolean" ? value.enabled : DEFAULT_CONTEXT_CONTROL_CONFIG.enabled;
  const cleanupMode = CONTEXT_CONTROL_MODES.includes(value.cleanupMode as ContextControlMode)
    ? (value.cleanupMode as ContextControlMode)
    : DEFAULT_CONTEXT_CONTROL_CONFIG.cleanupMode;
  const recoveryMode = CONTEXT_CONTROL_MODES.includes(value.recoveryMode as ContextControlMode)
    ? (value.recoveryMode as ContextControlMode)
    : DEFAULT_CONTEXT_CONTROL_CONFIG.recoveryMode;
  const recoveryScope = CONTEXT_CONTROL_RECOVERY_SCOPES.includes(value.recoveryScope as ContextControlRecoveryScope)
    ? (value.recoveryScope as ContextControlRecoveryScope)
    : DEFAULT_CONTEXT_CONTROL_CONFIG.recoveryScope;
  return { enabled, cleanupMode, recoveryMode, recoveryScope };
}
