const PROGRAM_MODES = ["off", "reduction", "adapters"];
export const DEFAULT_TOOL_EXECUTION_CONFIG = Object.freeze({
  enabled: false,
  capture: Object.freeze({ enabled: false, maxInlineBytes: 8192, maxStoredBytes: 268_435_456 }),
  programs: Object.freeze({ mode: "off", timeoutMs: 30_000, maxParallelReads: 4 }),
  workspace: Object.freeze({ enabled: false, write: false, denyPaths: Object.freeze([".git"]) }),
  discovery: Object.freeze({ enabled: false }),
  adapters: Object.freeze({ allow: Object.freeze([]) }),
  accounting: Object.freeze({ enabled: false }),
});
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function knownKeys(value, allowed, label) {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  return unknown ? `${label} has unsupported key: ${unknown}` : null;
}
function booleanField(value, key, label) {
  return value[key] === undefined || typeof value[key] === "boolean" ? null : `${label}.${key} must be a boolean`;
}
function integerField(value, key, label, minimum, maximum) {
  const candidate = value[key];
  return candidate === undefined || (Number.isSafeInteger(candidate) && candidate >= minimum && candidate <= maximum)
    ? null
    : `${label}.${key} must be an integer between ${minimum} and ${maximum}`;
}
function section(value, key) {
  const candidate = value[key];
  return record(candidate) ? candidate : undefined;
}
export function validateToolExecutionConfig(value) {
  if (!record(value)) return "toolExecution must be an object";
  let error = knownKeys(
    value,
    ["enabled", "capture", "programs", "workspace", "discovery", "adapters", "accounting"],
    "toolExecution",
  );
  if (error) return error;
  error = booleanField(value, "enabled", "toolExecution");
  if (error) return error;
  const capture = section(value, "capture");
  if (value.capture !== undefined && !capture) return "toolExecution.capture must be an object";
  if (capture) {
    error = knownKeys(capture, ["enabled", "maxInlineBytes", "maxStoredBytes"], "toolExecution.capture");
    if (error) return error;
    error = booleanField(capture, "enabled", "toolExecution.capture");
    if (error) return error;
    error = integerField(capture, "maxInlineBytes", "toolExecution.capture", 256, 1_048_576);
    if (error) return error;
    error = integerField(capture, "maxStoredBytes", "toolExecution.capture", 4_194_304, 4_294_967_296);
    if (error) return error;
  }
  const programs = section(value, "programs");
  if (value.programs !== undefined && !programs) return "toolExecution.programs must be an object";
  if (programs) {
    error = knownKeys(programs, ["mode", "timeoutMs", "maxParallelReads"], "toolExecution.programs");
    if (error) return error;
    if (programs.mode !== undefined && !PROGRAM_MODES.includes(programs.mode)) {
      return `toolExecution.programs.mode must be one of ${PROGRAM_MODES.join(", ")}`;
    }
    error = integerField(programs, "timeoutMs", "toolExecution.programs", 100, 120_000);
    if (error) return error;
    error = integerField(programs, "maxParallelReads", "toolExecution.programs", 1, 32);
    if (error) return error;
  }
  const workspace = section(value, "workspace");
  if (value.workspace !== undefined && !workspace) return "toolExecution.workspace must be an object";
  if (workspace) {
    error = knownKeys(workspace, ["enabled", "write", "root", "denyPaths"], "toolExecution.workspace");
    if (error) return error;
    error = booleanField(workspace, "enabled", "toolExecution.workspace");
    if (error) return error;
    error = booleanField(workspace, "write", "toolExecution.workspace");
    if (error) return error;
    if (workspace.root !== undefined && (typeof workspace.root !== "string" || workspace.root.length === 0)) {
      return "toolExecution.workspace.root must be a non-empty string";
    }
    if (
      workspace.denyPaths !== undefined &&
      (!Array.isArray(workspace.denyPaths) ||
        workspace.denyPaths.length > 128 ||
        !workspace.denyPaths.every((item) => typeof item === "string" && item.length > 0 && item.length <= 4096))
    ) {
      return "toolExecution.workspace.denyPaths must be an array of at most 128 non-empty strings";
    }
  }
  const adapters = section(value, "adapters");
  if (value.adapters !== undefined && !adapters) return "toolExecution.adapters must be an object";
  if (adapters) {
    error = knownKeys(adapters, ["allow"], "toolExecution.adapters");
    if (error) return error;
    if (
      adapters.allow !== undefined &&
      (!Array.isArray(adapters.allow) ||
        adapters.allow.length > 64 ||
        new Set(adapters.allow).size !== adapters.allow.length ||
        !adapters.allow.every((item) => typeof item === "string" && /^[a-z][a-zA-Z0-9._-]{0,127}$/.test(item)))
    )
      return "toolExecution.adapters.allow must contain at most 64 unique adapter IDs";
  }
  for (const key of ["discovery", "accounting"]) {
    const candidate = section(value, key);
    if (value[key] !== undefined && !candidate) return `toolExecution.${key} must be an object`;
    if (!candidate) continue;
    error = knownKeys(candidate, ["enabled"], `toolExecution.${key}`);
    if (error) return error;
    error = booleanField(candidate, "enabled", `toolExecution.${key}`);
    if (error) return error;
  }
  return null;
}
function pick(repository, local, key, fallback) {
  if (Object.hasOwn(local, key)) return local[key];
  if (Object.hasOwn(repository, key)) return repository[key];
  return fallback;
}
function layer(repository, local, name) {
  return {
    repository: record(repository[name]) ? repository[name] : {},
    local: record(local[name]) ? local[name] : {},
  };
}
export function resolveToolExecutionConfig(repository, local, freeflowEnabled) {
  const repositoryTool = record(repository.toolExecution) ? repository.toolExecution : {};
  const localTool = record(local.toolExecution) ? local.toolExecution : {};
  const capture = layer(repositoryTool, localTool, "capture");
  const programs = layer(repositoryTool, localTool, "programs");
  const workspace = layer(repositoryTool, localTool, "workspace");
  const discovery = layer(repositoryTool, localTool, "discovery");
  const adapters = layer(repositoryTool, localTool, "adapters");
  const accounting = layer(repositoryTool, localTool, "accounting");
  const enabled = pick(repositoryTool, localTool, "enabled", DEFAULT_TOOL_EXECUTION_CONFIG.enabled) === true;
  const effective = freeflowEnabled && enabled;
  const captureEnabled =
    pick(capture.repository, capture.local, "enabled", DEFAULT_TOOL_EXECUTION_CONFIG.capture.enabled) === true;
  const programMode = pick(programs.repository, programs.local, "mode", DEFAULT_TOOL_EXECUTION_CONFIG.programs.mode);
  const workspaceEnabled =
    pick(workspace.repository, workspace.local, "enabled", DEFAULT_TOOL_EXECUTION_CONFIG.workspace.enabled) === true;
  const discoveryEnabled =
    pick(discovery.repository, discovery.local, "enabled", DEFAULT_TOOL_EXECUTION_CONFIG.discovery.enabled) === true;
  const accountingEnabled =
    pick(accounting.repository, accounting.local, "enabled", DEFAULT_TOOL_EXECUTION_CONFIG.accounting.enabled) === true;
  return {
    enabled,
    effective,
    capture: {
      enabled: captureEnabled,
      effective: effective && captureEnabled,
      maxInlineBytes: pick(
        capture.repository,
        capture.local,
        "maxInlineBytes",
        DEFAULT_TOOL_EXECUTION_CONFIG.capture.maxInlineBytes,
      ),
      maxStoredBytes: pick(
        capture.repository,
        capture.local,
        "maxStoredBytes",
        DEFAULT_TOOL_EXECUTION_CONFIG.capture.maxStoredBytes,
      ),
    },
    programs: {
      mode: programMode,
      effective: effective && programMode !== "off",
      timeoutMs: pick(
        programs.repository,
        programs.local,
        "timeoutMs",
        DEFAULT_TOOL_EXECUTION_CONFIG.programs.timeoutMs,
      ),
      maxParallelReads: pick(
        programs.repository,
        programs.local,
        "maxParallelReads",
        DEFAULT_TOOL_EXECUTION_CONFIG.programs.maxParallelReads,
      ),
    },
    workspace: {
      enabled: workspaceEnabled,
      effective: effective && workspaceEnabled,
      write:
        pick(workspace.repository, workspace.local, "write", DEFAULT_TOOL_EXECUTION_CONFIG.workspace.write) === true,
      ...(typeof pick(workspace.repository, workspace.local, "root", undefined) === "string"
        ? { root: pick(workspace.repository, workspace.local, "root", undefined) }
        : {}),
      denyPaths: [
        ...(pick(
          workspace.repository,
          workspace.local,
          "denyPaths",
          DEFAULT_TOOL_EXECUTION_CONFIG.workspace.denyPaths,
        ) ?? []),
      ],
    },
    discovery: { enabled: discoveryEnabled, effective: effective && discoveryEnabled },
    adapters: {
      allow: [
        ...(pick(adapters.repository, adapters.local, "allow", DEFAULT_TOOL_EXECUTION_CONFIG.adapters.allow) ?? []),
      ],
      effective:
        effective &&
        (pick(adapters.repository, adapters.local, "allow", DEFAULT_TOOL_EXECUTION_CONFIG.adapters.allow)?.length ??
          0) > 0,
    },
    accounting: { enabled: accountingEnabled, effective: effective && accountingEnabled },
  };
}
