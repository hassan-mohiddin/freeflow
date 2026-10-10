import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { resolveCognitiveRoutingState, supportsCognitiveRoutingModelRegistry } from "../cognitive-routing/config.js";
import { sessionStage, stagedFor } from "./staging.js";
import { resolveToolExecutionConfig } from "../tool-execution/config.js";
import { resolveCompactionConfig } from "../compaction/config.js";
import { resolveTaskMemoryConfig } from "../task-memory/config.js";
import { validateLocalConfig, validateRepositoryConfig } from "./config-validation.js";
import { cachedBranch } from "./branch.js";
/**
 * Freeflow configuration: the repository and personal config files, their layering, per-session core overrides, and
 * the resulting capability state, with optional capabilities disabled inside subagents.
 */
/**
 * Settings a session may override, as dotted config paths. "enabled" is Freeflow's master switch; the others switch a
 * capability and are applied as a layer above the personal config.
 */
export const SESSION_OVERRIDE_KEYS = [
  "enabled",
  "cognitiveRouting.enabled",
  "cognitiveRouting.projection",
  "toolExecution.enabled",
  "compaction.enabled",
  "compaction.carry",
  "taskMemory.enabled",
] as const;
export type SessionCoreKey = (typeof SESSION_OVERRIDE_KEYS)[number];

type SessionCoreOverrides = Partial<Record<SessionCoreKey, boolean>>;

const SESSION_OVERRIDES_ENTRY = "freeflow-session-overrides";

const SESSION_CORE_KEYS = new Set<SessionCoreKey>(SESSION_OVERRIDE_KEYS);

let currentSessionOverrides: SessionCoreOverrides = {};

// pi-subagents stamps child system prompts with this tag before binding extensions.
// Keeping detection at the prompt boundary avoids a process-global child flag.
const SUBAGENT_AGENT_TAG = /<active_agent\s+name="[^"]+"\s*\/>/;

const FREEFLOW_SUBAGENT_CAPABILITIES_DISABLED_MARKER = "<!-- freeflow-subagent-capabilities: disabled -->";

const SUBAGENT_OPTIONAL_CAPABILITIES_MESSAGE = "Optional Freeflow capabilities are disabled for subagents.";

function isSubagentContext(context: unknown): boolean {
  try {
    const systemPrompt = (context as { getSystemPrompt?: () => unknown })?.getSystemPrompt?.();
    return (
      typeof systemPrompt === "string" &&
      (SUBAGENT_AGENT_TAG.test(systemPrompt) || systemPrompt.includes(FREEFLOW_SUBAGENT_CAPABILITIES_DISABLED_MARKER))
    );
  } catch {
    return false;
  }
}

function disableSubagentCapability(capability: any): any {
  return {
    ...capability,
    enabled: false,
    effective: false,
    blockingReason: { code: "disabled", message: SUBAGENT_OPTIONAL_CAPABILITIES_MESSAGE },
  };
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readConfigFileState(path, validate) {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    const validationError = validate(parsed);
    if (validationError) {
      return {
        path,
        exists: true,
        valid: false,
        parsed: {},
        parseError: validationError,
      };
    }
    return { path, exists: true, valid: true, parsed, parseError: null };
  } catch (error) {
    const code = error && typeof error === "object" ? error.code : undefined;
    if (code === "ENOENT") {
      return {
        path,
        exists: false,
        valid: false,
        parsed: {},
        parseError: null,
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      path,
      exists: true,
      valid: false,
      parsed: {},
      parseError: message,
    };
  }
}

function readFreeflowConfigState(cwd) {
  return readConfigFileState(join(cwd, ".freeflow/config.json"), validateRepositoryConfig);
}

function readFreeflowLocalConfigState(cwd) {
  return readConfigFileState(join(cwd, ".freeflow/local.json"), validateLocalConfig);
}

export async function readFreeflowConfig(cwd) {
  const state = await readFreeflowConfigState(cwd);
  return state.valid ? state.parsed : {};
}

export async function readFreeflowLocalConfig(cwd) {
  const state = await readFreeflowLocalConfigState(cwd);
  return state.valid ? state.parsed : {};
}

function resolveLayeredValue(repository, local, key, fallback) {
  if (Object.hasOwn(local, key)) {
    return { value: local[key], source: "local" };
  }
  if (Object.hasOwn(repository, key)) {
    return { value: repository[key], source: "repository" };
  }
  return { value: fallback, source: "builtin" };
}

function resolveCoreConfig(repository, local) {
  const enabled = resolveLayeredValue(repository, local, "enabled", true);
  return {
    config: { enabled: enabled.value },
    sources: { enabled: enabled.source },
  };
}

function normalizeSessionOverrides(value): SessionCoreOverrides {
  if (!isRecord(value)) return {};
  const overrides: SessionCoreOverrides = {};
  for (const key of SESSION_CORE_KEYS) {
    if (typeof value[key] === "boolean") {
      overrides[key] = value[key];
    }
  }
  return overrides;
}

/** The capability overrides of this session as a config layer, e.g. { compaction: { carry: false } }. */
function sessionConfigLayer(overrides: SessionCoreOverrides): Record<string, Record<string, boolean>> {
  const layer: Record<string, Record<string, boolean>> = {};
  for (const [key, value] of Object.entries(overrides)) {
    const [section, field] = key.split(".");
    if (!field || typeof value !== "boolean") continue;
    layer[section] = { ...(layer[section] ?? {}), [field]: value };
  }
  return layer;
}

function withSessionLayer(local: Record<string, unknown>, session: Record<string, Record<string, boolean>>) {
  const merged: Record<string, unknown> = { ...local };
  for (const [section, fields] of Object.entries(session))
    merged[section] = { ...(isRecord(local[section]) ? (local[section] as Record<string, unknown>) : {}), ...fields };
  return merged;
}

function resolveSessionCoreConfig(layers) {
  const configured = layers.coreConfig;
  const sources = layers.sources;
  const enabled = currentSessionOverrides.enabled;

  return {
    config: { enabled: typeof enabled === "boolean" ? enabled : configured.enabled },
    sources: { enabled: typeof enabled === "boolean" ? "session" : sources.enabled },
  };
}

export async function readFreeflowConfigLayers(cwd) {
  const [repository, local] = await Promise.all([readFreeflowConfigState(cwd), readFreeflowLocalConfigState(cwd)]);
  const repositoryConfig = repository.valid ? repository.parsed : {};
  const localConfig = local.valid ? local.parsed : {};
  const core = resolveCoreConfig(repositoryConfig, localConfig);
  const localValid = !local.exists || local.valid;
  const configured = repository.valid && localValid;
  let blockingState = null;
  if (!repository.valid) {
    blockingState = repository;
  } else if (local.exists && !local.valid) {
    blockingState = local;
  }

  return {
    configured,
    repositoryConfigured: repository.valid,
    repository,
    local,
    coreConfig: core.config,
    sources: core.sources,
    blockingConfigPath: blockingState?.path ?? null,
    parseError: blockingState?.parseError ?? null,
  };
}

export async function readCapabilityState(cwd, host = undefined) {
  const layers = await readFreeflowConfigLayers(cwd);
  const effectiveCore = resolveSessionCoreConfig(layers);
  const enabled = layers.configured && effectiveCore.config.enabled;
  const subagentContext = isSubagentContext(host);
  const hostSupportsCognitiveRouting = !subagentContext && supportsCognitiveRoutingModelRegistry(host);
  const sessionLayer = sessionConfigLayer(currentSessionOverrides);
  const configuredCognitiveRouting = await resolveCognitiveRoutingState(
    layers.repository.parsed,
    layers.local.parsed,
    hostSupportsCognitiveRouting ? host : undefined,
    sessionLayer,
  );
  const disabledReason = enabled ? undefined : { code: "disabled" as const, message: "Freeflow is disabled" };
  const cognitiveRouting = enabled
    ? configuredCognitiveRouting
    : {
        ...configuredCognitiveRouting,
        enabled: false,
        effective: false,
        blockingReason: disabledReason,
      };
  const repositoryConfig = layers.repository.valid ? layers.repository.parsed : {};
  const localConfig = layers.local.valid ? layers.local.parsed : {};
  const sessionLocalConfig = withSessionLayer(localConfig, sessionLayer);
  const toolExecution = resolveToolExecutionConfig(repositoryConfig, sessionLocalConfig, enabled);
  const compaction = resolveCompactionConfig(repositoryConfig, sessionLocalConfig, enabled);
  const taskMemory = resolveTaskMemoryConfig(repositoryConfig, sessionLocalConfig, enabled);
  const capabilityState = {
    configured: layers.configured,
    repositoryConfigured: layers.repositoryConfigured,
    configExists: layers.repository.exists,
    configValid: layers.configured,
    configPath: layers.blockingConfigPath ?? layers.repository.path,
    parseError: layers.parseError,
    localConfigExists: layers.local.exists,
    localConfigValid: !layers.local.exists || layers.local.valid,
    localConfigPath: layers.local.path,
    localConfigParseError: layers.local.parseError,
    configuredCoreConfig: layers.coreConfig,
    configuredSources: layers.sources,
    sessionOverrides: { ...currentSessionOverrides },
    configSources: effectiveCore.sources,
    enabled,
    hostSupportsCognitiveRouting,
    cognitiveRouting,
    toolExecution,
    compaction,
    taskMemory,
  };
  if (!subagentContext) return capabilityState;

  return {
    ...capabilityState,
    cognitiveRouting: disableSubagentCapability(capabilityState.cognitiveRouting),
    toolExecution: disableSubagentCapability(capabilityState.toolExecution),
    compaction: disableSubagentCapability(capabilityState.compaction),
    taskMemory: disableSubagentCapability(capabilityState.taskMemory),
  };
}

function recordedSessionOverrides(sessionManager) {
  let recorded = {};
  for (const entry of sessionManager?.getBranch ? cachedBranch(sessionManager) : (sessionManager?.getEntries?.() ?? []))
    if (entry.type === "custom" && entry.customType === SESSION_OVERRIDES_ENTRY)
      recorded = normalizeSessionOverrides(entry.data?.overrides);
  return recorded;
}

export function restoreSessionOverrides(ctx) {
  const staged = stagedFor(ctx.sessionManager)?.overrides;
  currentSessionOverrides = normalizeSessionOverrides(staged ?? recordedSessionOverrides(ctx.sessionManager));
}

/** Session overrides change nothing until the next prompt, so they are staged and written then. */
function recordSessionOverrides(ctx, pi) {
  const stage = sessionStage(ctx?.sessionManager);
  if (stage) stage.overrides = { ...currentSessionOverrides };
  else pi?.appendEntry?.(SESSION_OVERRIDES_ENTRY, { overrides: { ...currentSessionOverrides } });
}

/** Write staged session overrides at the start of a prompt, unless they equal what the session recorded. */
export function writeStagedSessionOverrides(overrides, pi, sessionManager) {
  if (!overrides) return;
  const next = normalizeSessionOverrides(overrides);
  if (JSON.stringify(next) === JSON.stringify(recordedSessionOverrides(sessionManager))) return;
  pi?.appendEntry?.(SESSION_OVERRIDES_ENTRY, { overrides: { ...next } });
}

export async function setSessionCoreOverride(key: SessionCoreKey, value: boolean | null, ctx, pi) {
  if (!SESSION_CORE_KEYS.has(key)) {
    throw new Error(`Invalid Freeflow session override: ${String(key)}`);
  }
  if (value !== null && typeof value !== "boolean") {
    throw new Error(`Invalid Freeflow session override value for ${key}: ${String(value)}`);
  }

  const hasOverride = Object.hasOwn(currentSessionOverrides, key);
  if ((value === null && !hasOverride) || (value !== null && hasOverride && currentSessionOverrides[key] === value)) {
    return { changed: false, sessionOverrides: { ...currentSessionOverrides } };
  }

  const next = { ...currentSessionOverrides };
  if (value === null) {
    delete next[key];
  } else {
    next[key] = value;
  }
  currentSessionOverrides = next;
  recordSessionOverrides(ctx, pi);
  return {
    changed: true,
    // Every session override switches Freeflow or a capability, which changes tools and guidance: reload.
    reloadRequired: true,
    sessionOverrides: { ...currentSessionOverrides },
    capabilityState: await readCapabilityState(ctx.cwd, ctx),
  };
}

export async function resetSessionOverrides(ctx, pi) {
  const hadCoreOverrides = Object.keys(currentSessionOverrides).length > 0;
  const reloadRequired = hadCoreOverrides;

  if (hadCoreOverrides) {
    currentSessionOverrides = {};
    recordSessionOverrides(ctx, pi);
  }

  return {
    changed: hadCoreOverrides,
    reloadRequired,
    sessionOverrides: { ...currentSessionOverrides },
    capabilityState: await readCapabilityState(ctx.cwd, ctx),
  };
}
