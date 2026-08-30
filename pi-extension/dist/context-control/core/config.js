export const CONTEXT_CONTROL_MODES = ["model-only", "model-approval", "automatic"];
export const CONTEXT_CONTROL_RECOVERY_SCOPES = ["active-branch", "current-session", "current-project"];
export const DEFAULT_CONTEXT_CONTROL_CONFIG = Object.freeze({
  enabled: false,
  cleanupMode: "model-only",
  recoveryMode: "model-only",
  recoveryScope: "active-branch",
});
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function validateContextControlConfig(value) {
  if (value === undefined) return null;
  if (!isRecord(value)) return "contextControl must be an object";
  const allowedKeys = new Set(["enabled", "cleanupMode", "recoveryMode", "recoveryScope"]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) return `unsupported contextControl config key: ${key}`;
  }
  if (value.enabled !== undefined && typeof value.enabled !== "boolean") {
    return "contextControl.enabled must be a boolean";
  }
  if (value.cleanupMode !== undefined && !CONTEXT_CONTROL_MODES.includes(value.cleanupMode)) {
    return `invalid contextControl.cleanupMode: ${JSON.stringify(value.cleanupMode)}`;
  }
  if (value.recoveryMode !== undefined && !CONTEXT_CONTROL_MODES.includes(value.recoveryMode)) {
    return `invalid contextControl.recoveryMode: ${JSON.stringify(value.recoveryMode)}`;
  }
  if (value.recoveryScope !== undefined && !CONTEXT_CONTROL_RECOVERY_SCOPES.includes(value.recoveryScope)) {
    return `invalid contextControl.recoveryScope: ${JSON.stringify(value.recoveryScope)}`;
  }
  return null;
}
function layerValue(repository, local, key) {
  const repositoryBlock = isRecord(repository.contextControl) ? repository.contextControl : {};
  const localBlock = isRecord(local.contextControl) ? local.contextControl : {};
  if (Object.hasOwn(localBlock, key)) return { value: localBlock[key], source: "local" };
  if (Object.hasOwn(repositoryBlock, key)) return { value: repositoryBlock[key], source: "repository" };
  return { value: DEFAULT_CONTEXT_CONTROL_CONFIG[key], source: "builtin" };
}
export function resolveContextControlConfig(repositoryConfig, localConfig) {
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
      enabled: enabled.value,
      cleanupMode: cleanupMode.value,
      recoveryMode: recoveryMode.value,
      recoveryScope: recoveryScope.value,
    },
    sources: {
      enabled: enabled.source,
      cleanupMode: cleanupMode.source,
      recoveryMode: recoveryMode.source,
      recoveryScope: recoveryScope.source,
    },
  };
}
export function contextControlConfigFromState(value) {
  if (!isRecord(value)) return DEFAULT_CONTEXT_CONTROL_CONFIG;
  const enabled = typeof value.enabled === "boolean" ? value.enabled : DEFAULT_CONTEXT_CONTROL_CONFIG.enabled;
  const cleanupMode = CONTEXT_CONTROL_MODES.includes(value.cleanupMode)
    ? value.cleanupMode
    : DEFAULT_CONTEXT_CONTROL_CONFIG.cleanupMode;
  const recoveryMode = CONTEXT_CONTROL_MODES.includes(value.recoveryMode)
    ? value.recoveryMode
    : DEFAULT_CONTEXT_CONTROL_CONFIG.recoveryMode;
  const recoveryScope = CONTEXT_CONTROL_RECOVERY_SCOPES.includes(value.recoveryScope)
    ? value.recoveryScope
    : DEFAULT_CONTEXT_CONTROL_CONFIG.recoveryScope;
  return { enabled, cleanupMode, recoveryMode, recoveryScope };
}
