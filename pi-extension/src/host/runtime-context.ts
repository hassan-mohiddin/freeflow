import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveCognitiveRoutingState } from "../cognitive-routing/config.js";
import { supportsCognitiveRoutingModelRegistry } from "../cognitive-routing/config.js";
import { sessionStage, stagedFor } from "./staging.js";
import { resolveToolExecutionConfig, validateToolExecutionConfig } from "../tool-runtime/config.js";

export const WORKFLOW_COMMANDS = [
  { command: "discuss", skill: "discuss" },
  { command: "action-selection", skill: "action-selection" },
  { command: "track-work", skill: "track-work" },
  { command: "write-spec", skill: "write-spec" },
  { command: "review-artifact", skill: "review-artifact" },
  { command: "write-plan", skill: "write-plan" },
  { command: "execute-work", skill: "execute-work" },
  { command: "simplify-code", skill: "simplify-code" },
  { command: "migration-work", skill: "migration-work" },
  { command: "diagnose-failure", skill: "diagnose-failure" },
  { command: "verify-work", skill: "verify-work" },
  { command: "review-work", skill: "review-work" },
  { command: "commit-work", skill: "commit-work" },
  { command: "handoff", skill: "handoff" },
  { command: "finish-branch", skill: "finish-branch" },
  { command: "release-work", skill: "release-work" },
  { command: "launch-work", skill: "launch-work" },
  { command: "bypass", skill: "bypass" },
];

export const CONTRIBUTOR_COMMANDS = ["setup-freeflow", "write-skill", "evaluate-skill"];

const FREEFLOW_MODEL_SKILL_NAMES = [
  "action-selection",
  "bypass",
  "commit-work",
  "decision-gate",
  "migration-work",
  "design-for-depth",
  "diagnose-failure",
  "discuss",
  "evaluate-skill",
  "execute-work",
  "finish-branch",
  "handoff",
  "release-work",
  "review-artifact",
  "review-work",
  "setup-freeflow",
  "launch-work",
  "simplify-code",
  "track-work",
  "verify-work",
  "workflow",
  "write-plan",
  "write-skill",
  "write-spec",
];

export const STABLE_FREEFLOW_SURFACE = Object.freeze({
  enabled: true,
  cognitiveRouting: { effective: true },
  toolExecution: { effective: true },
});

export function freeflowSkillPath(skillName) {
  return fileURLToPath(new URL(`../../../skills/${skillName}/SKILL.md`, import.meta.url));
}

export function freeflowCapabilitySkillPath(skillName) {
  return fileURLToPath(new URL(`../../../capabilities/${skillName}/SKILL.md`, import.meta.url));
}

export function freeflowModelSkillPaths(capabilityState = undefined, toolExecutionCueAvailable = false) {
  const paths = FREEFLOW_MODEL_SKILL_NAMES.map((skillName) => freeflowSkillPath(skillName));
  if (capabilityState?.cognitiveRouting?.effective === true)
    paths.push(freeflowCapabilitySkillPath("cognitive-routing"));
  if (capabilityState?.toolExecution?.effective === true && toolExecutionCueAvailable) {
    const skill = freeflowCapabilitySkillPath("tool-execution");
    try {
      if (isPromptAvailable(readFileSync(skill, "utf8"))) paths.push(skill);
    } catch {
      // Missing optional skill does not suppress the core prompt or unrelated skills.
    }
  }
  return paths;
}

type SessionCoreKey = "enabled";
type SessionCoreOverrides = Partial<Record<SessionCoreKey, boolean>>;

const SESSION_OVERRIDES_ENTRY = "freeflow-session-overrides";
const SESSION_CORE_KEYS = new Set<SessionCoreKey>(["enabled"]);

const FREEFLOW_RUNTIME_STATE_MESSAGE_TYPE = "freeflow-runtime-state";
const COGNITIVE_ROUTING_RUNTIME_STATE_MESSAGE_TYPE = "freeflow-cognitive-routing-runtime-state";
const WORKFLOW_BOOTSTRAP_MESSAGE_TYPE = "freeflow-workflow-bootstrap";
const COGNITIVE_ROUTING_BOOTSTRAP_MESSAGE_TYPE = "freeflow-cognitive-routing-bootstrap";
const FREEFLOW_BOOTSTRAP_MESSAGE_TYPE = "freeflow-bootstrap";

let runtimeContextCache = null;
let currentSessionOverrides: SessionCoreOverrides = {};

export function isPromptAvailable(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

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

export function hasUsableMandatoryPrompts(freeflowContext: any): boolean {
  return (
    isPromptAvailable(freeflowContext?.corePrompt) && isPromptAvailable(freeflowContext?.interactionContractPrompt)
  );
}

async function readPromptFile(url: URL): Promise<string | null> {
  try {
    const prompt = await readFile(url, "utf8");
    return isPromptAvailable(prompt) ? prompt.trim() : null;
  } catch {
    return null;
  }
}

async function loadRuntimeContext(capabilityState = undefined) {
  const freeflowEnabled = capabilityState?.enabled === true;
  const cognitiveRoutingEnabled = capabilityState?.cognitiveRouting?.effective === true;
  const [corePrompt, interactionContractPrompt, cognitiveRoutingPrompt, toolExecutionPrompt] = await Promise.all([
    freeflowEnabled
      ? readPromptFile(new URL("../../../runtime/prompts/core.md", import.meta.url))
      : Promise.resolve(null),
    freeflowEnabled
      ? readPromptFile(new URL("../../../runtime/prompts/interaction-contract.md", import.meta.url))
      : Promise.resolve(null),
    cognitiveRoutingEnabled
      ? readPromptFile(new URL("../../../runtime/prompts/cognitive-routing.md", import.meta.url))
      : Promise.resolve(null),
    capabilityState?.toolExecution?.effective === true
      ? readPromptFile(new URL("../../../runtime/prompts/tool-execution.md", import.meta.url))
      : Promise.resolve(null),
  ]);

  return { corePrompt, interactionContractPrompt, cognitiveRoutingPrompt, toolExecutionPrompt };
}

function runtimeContextCacheSatisfies(capabilityState) {
  if (!runtimeContextCache) return false;
  const expected = {
    corePrompt: capabilityState?.enabled === true,
    interactionContractPrompt: capabilityState?.enabled === true,
    cognitiveRoutingPrompt: capabilityState?.cognitiveRouting?.effective === true,
  };
  return Object.entries(expected).every(([key, required]) => !required || isPromptAvailable(runtimeContextCache[key]));
}

export async function refreshRuntimeContext(capabilityState = undefined) {
  runtimeContextCache = await loadRuntimeContext(capabilityState);
  return runtimeContextCache;
}

export async function getRuntimeContext(capabilityState = undefined) {
  if (runtimeContextCacheSatisfies(capabilityState)) {
    return runtimeContextCache;
  }
  return refreshRuntimeContext(capabilityState);
}

const BOOTSTRAP_COMPONENTS = Object.freeze({
  workflow: "workflow",
  cognitiveRouting: "cognitive-routing",
});

function bootstrapEntryComponents(entry) {
  const isCustomMessage = entry?.role === "custom" || entry?.type === "custom_message" || entry?.type === "custom";
  if (!isCustomMessage) return [];
  if (entry.customType === FREEFLOW_BOOTSTRAP_MESSAGE_TYPE) {
    if (Array.isArray(entry.details?.components)) return entry.details.components;
    return [
      ...(entry.content?.includes("<!-- freeflow-bootstrap:workflow -->") ? [BOOTSTRAP_COMPONENTS.workflow] : []),
      ...(entry.content?.includes("<!-- freeflow-bootstrap:cognitive-routing -->")
        ? [BOOTSTRAP_COMPONENTS.cognitiveRouting]
        : []),
    ];
  }
  if (entry.customType === WORKFLOW_BOOTSTRAP_MESSAGE_TYPE) {
    return [BOOTSTRAP_COMPONENTS.workflow];
  }
  if (entry.customType === COGNITIVE_ROUTING_BOOTSTRAP_MESSAGE_TYPE) {
    return [BOOTSTRAP_COMPONENTS.cognitiveRouting];
  }
  return [];
}

export function filterBootstrapMessage(message) {
  return bootstrapEntryComponents(message).length === 0 ? message : undefined;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function removedContextConfigError(value, filePath) {
  const removedKeys = ["contextVirtualization", "conversationHistory"].filter((key) =>
    Object.prototype.hasOwnProperty.call(value, key),
  );
  return removedKeys.length > 0
    ? `Removed Freeflow context setting(s) in ${filePath}: ${removedKeys.join(", ")}. Delete those keys before using Freeflow.`
    : null;
}

function validateCoreConfigFields(value) {
  if (value.enabled !== undefined && typeof value.enabled !== "boolean") {
    return "enabled must be a boolean";
  }

  return null;
}

function validateFreeflowConfigShape(value) {
  if (!isRecord(value)) {
    return "config must be a JSON object";
  }

  const removedContextError = removedContextConfigError(value, ".freeflow/config.json");
  if (removedContextError) return removedContextError;

  // outputRouter, observedRouting, and scriptTransform belong to retired features; they are accepted and ignored so
  // existing configs keep loading.
  const allowedKeys = new Set([
    "enabled",
    "outputRouter",
    "observedRouting",
    "scriptTransform",
    "cognitiveRouting",
    "toolExecution",
  ]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      return `unsupported top-level config key: ${key}`;
    }
  }

  const coreError = validateCoreConfigFields(value);
  if (coreError) return coreError;

  for (const key of ["outputRouter", "observedRouting", "scriptTransform"]) {
    if (value[key] !== undefined && !isRecord(value[key])) {
      return `${key} must be an object`;
    }
  }
  if (value.toolExecution !== undefined) {
    const error = validateToolExecutionConfig(value.toolExecution);
    if (error) return error;
  }

  return null;
}

function validateFreeflowLocalConfigShape(value) {
  if (!isRecord(value)) {
    return "local config must be a JSON object";
  }

  const removedContextError = removedContextConfigError(value, ".freeflow/local.json");
  if (removedContextError) return removedContextError;

  // processing belongs to a retired feature; it is accepted and ignored so existing local configs keep loading.
  const allowedKeys = new Set(["enabled", "processing", "cognitiveRouting", "toolExecution"]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      return `unsupported top-level local config key: ${key}`;
    }
  }

  const coreError = validateCoreConfigFields(value);
  if (coreError) return coreError;
  if (value.toolExecution !== undefined) return validateToolExecutionConfig(value.toolExecution);
  return null;
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
  return readConfigFileState(join(cwd, ".freeflow/config.json"), validateFreeflowConfigShape);
}

function readFreeflowLocalConfigState(cwd) {
  return readConfigFileState(join(cwd, ".freeflow/local.json"), validateFreeflowLocalConfigShape);
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
  const configuredCognitiveRouting = await resolveCognitiveRoutingState(
    layers.repository.parsed,
    layers.local.parsed,
    hostSupportsCognitiveRouting ? host : undefined,
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
  const toolExecution = resolveToolExecutionConfig(repositoryConfig, localConfig, enabled);
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
  };
  if (!subagentContext) return capabilityState;

  return {
    ...capabilityState,
    cognitiveRouting: disableSubagentCapability(capabilityState.cognitiveRouting),
    toolExecution: disableSubagentCapability(capabilityState.toolExecution),
  };
}

function recordedSessionOverrides(sessionManager) {
  let recorded = {};
  for (const entry of sessionManager?.getBranch?.() ?? sessionManager?.getEntries?.() ?? [])
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

type ToolExecutionRuntimeSnapshot = {
  queued?: number;
  failures?: { code?: string }[];
  lastFailure?: { code?: string; message?: string };
  unresolvedEffects?: number;
  store?: { state?: string; reason?: string };
  guidance?: { state?: string };
  catalog?: { generation?: string; operations?: number; metadataBytes?: number };
  adapters?: {
    allowed?: readonly string[];
    announced?: readonly { active?: boolean }[];
    failures?: readonly { code?: string; message?: string }[];
  };
};

export function setFreeflowStatus(
  ctx,
  capabilityState = undefined,
  cognitiveRoutingRuntime = undefined,
  freeflowContext = undefined,
  options: {
    cognitiveRoutingStartupPending?: boolean;
    startupSelectionSuppressed?: boolean;
    toolExecutionRuntime?: ToolExecutionRuntimeSnapshot;
  } = {},
) {
  if (capabilityState && !capabilityState.configured) {
    ctx.ui.setStatus("freeflow", capabilityState.configExists ? "freeflow: config error" : "freeflow: setup needed");
    return;
  }
  if (capabilityState && !capabilityState.enabled) {
    const source = capabilityState.configSources?.enabled === "session" ? " (session)" : "";
    ctx.ui.setStatus("freeflow", `freeflow: off${source}`);
    return;
  }
  if (capabilityState?.enabled === true && !hasUsableMandatoryPrompts(freeflowContext)) {
    ctx.ui.setStatus("freeflow", "freeflow: unavailable");
    return;
  }

  const active: string[] = [];
  const cognitiveRouting = capabilityState?.cognitiveRouting;
  const cognitiveRoutingInactive =
    cognitiveRouting?.enabled === true && cognitiveRoutingRuntime?.runtimeStatus === "inactive";
  const cognitiveRoutingBlocked =
    cognitiveRouting?.enabled === true &&
    (cognitiveRouting?.blockingReason?.code === "runtime_blocked" ||
      cognitiveRoutingRuntime?.runtimeStatus === "blocked");
  const cognitiveRoutingActive = cognitiveRouting?.effective === true && cognitiveRoutingRuntime?.effective === true;
  const startupSelectionSuppressesCognitiveRouting = options.startupSelectionSuppressed === true;
  if (cognitiveRoutingInactive) {
    active.push("cognitive inactive");
  } else if (cognitiveRoutingBlocked) {
    active.push(
      `cognitive blocked · ${cognitiveRoutingRuntime?.runtimeReason ?? "runtime_blocked"} · /freeflow profile auto`,
    );
  } else if (cognitiveRoutingActive) {
    const profile = cognitiveRoutingRuntime.activeProfile;
    const control = String(cognitiveRoutingRuntime.controlMode).startsWith("manual-") ? "manual hold" : "automatic";
    active.push(
      `${profile} · ${control} · ${cognitiveRoutingRuntime.delegation ?? cognitiveRouting.delegation ?? "executor"} mode${cognitiveRoutingRuntime.pendingPair ? ` · ${cognitiveRoutingRuntime.pendingPair} on next prompt` : ""}${cognitiveRoutingRuntime.pairMismatch ? " · model differs" : ""}`,
    );
  } else if (cognitiveRouting?.enabled === true) {
    if (cognitiveRouting.blockingReason?.code === "runtime_disabled") {
      active.push("cognitive blocked · runtime_disabled");
    } else if (
      cognitiveRouting.effective === true &&
      cognitiveRoutingRuntime === undefined &&
      options.cognitiveRoutingStartupPending === true &&
      !startupSelectionSuppressesCognitiveRouting
    ) {
      active.push("coordinator · pending");
    } else {
      const reason =
        cognitiveRouting.effective === true
          ? (cognitiveRoutingRuntime?.blockingReason?.code ?? "runtime_inactive")
          : (cognitiveRouting.blockingReason?.code ?? "unavailable");
      active.push(`cognitive blocked · ${reason}`);
    }
  }
  const toolIssue =
    options.toolExecutionRuntime?.lastFailure?.code ??
    options.toolExecutionRuntime?.failures?.at(-1)?.code ??
    options.toolExecutionRuntime?.adapters?.failures?.at(-1)?.code;
  if (capabilityState?.toolExecution?.effective === true && options.toolExecutionRuntime?.unresolvedEffects)
    active.push(`tools fenced ${options.toolExecutionRuntime.unresolvedEffects}`);
  else if (capabilityState?.toolExecution?.effective === true && toolIssue) active.push(`tools ${toolIssue}`);
  ctx.ui.setStatus("freeflow", `freeflow: ${active.length > 0 ? active.join(" · ") : "active"}`);
}

export function skillPrompt(skill, args) {
  const trimmed = args?.trim();
  return trimmed ? `/skill:${skill}\n\n${trimmed}` : `/skill:${skill}`;
}

type CognitiveRoutingRuntimeSnapshot = {
  effective?: boolean;
  runtimeStatus?: "active" | "inactive" | "blocked";
  runtimeReason?: unknown;
  activeProfile?: unknown;
  pendingPair?: unknown;
  delegation?: unknown;
  controlMode?: unknown;
};

type CognitiveRoutingProjectionMode = "disabled" | "enabled" | "manual-bypass" | "blocked" | "unavailable" | "pending";

type FreeflowContextMessage = {
  customType?: unknown;
  [key: string]: unknown;
};

function publicCognitiveRoutingControl(controlMode) {
  if (controlMode === "automatic") return "automatic";
  if (["manual-helper", "manual-executor", "manual-coordinator"].includes(controlMode)) return "manual";
  return "unavailable";
}

function publicCognitiveRoutingProfile(activeProfile, effective) {
  if (effective !== true) return "unavailable";
  return ["helper", "executor", "coordinator"].includes(activeProfile) ? activeProfile : "unavailable";
}

function publicCapabilityStatus(capability) {
  if (capability?.effective === true) return "active";
  if (!capability) return "unavailable";
  const blockingCode = capability.blockingReason?.code;
  if (blockingCode && blockingCode !== "disabled") return "unavailable";
  return "inactive";
}

function publicCognitiveRoutingStatus(capability, runtime) {
  if (runtime?.runtimeStatus === "inactive") return "inactive";
  return publicCapabilityStatus(capability);
}

function publicCognitiveRoutingProjectionMode(
  capability: any,
  runtime: CognitiveRoutingRuntimeSnapshot | undefined,
  projectionFailure?: string,
): CognitiveRoutingProjectionMode {
  if (capability?.projection !== true) return "disabled";
  if (capability?.effective !== true) return "unavailable";
  if (String(runtime?.controlMode).startsWith("manual-")) return "manual-bypass";
  if (projectionFailure) return "blocked";
  if (runtime?.runtimeStatus === "inactive" || runtime?.runtimeStatus === "blocked") return "unavailable";
  if (runtime?.effective === true && runtime.controlMode === "automatic") return "enabled";
  return "pending";
}

export function freeflowRuntimeStateMessage(
  capabilityState,
  cognitiveRoutingRuntime: CognitiveRoutingRuntimeSnapshot | undefined = undefined,
  freeflowContext = undefined,
  options: {
    projectionFailure?: string;
    toolExecutionRuntime?: ToolExecutionRuntimeSnapshot;
  } = {},
) {
  const cognitiveRoutingEffective = capabilityState?.cognitiveRouting?.effective === true;
  const profile = publicCognitiveRoutingProfile(
    cognitiveRoutingRuntime?.activeProfile,
    cognitiveRoutingEffective && cognitiveRoutingRuntime?.effective === true,
  );
  const control =
    profile === "unavailable" ? "unavailable" : publicCognitiveRoutingControl(cognitiveRoutingRuntime?.controlMode);
  const projectionMode = publicCognitiveRoutingProjectionMode(
    capabilityState?.cognitiveRouting,
    cognitiveRoutingRuntime,
    options.projectionFailure,
  );
  const mandatoryPromptAvailable = capabilityState?.enabled !== true || hasUsableMandatoryPrompts(freeflowContext);
  const freeflowStatus = capabilityState?.configured
    ? capabilityState.enabled
      ? mandatoryPromptAvailable
        ? "active"
        : "unavailable"
      : "inactive"
    : capabilityState?.configExists
      ? "config error"
      : "setup needed";

  return {
    role: "custom",
    customType: FREEFLOW_RUNTIME_STATE_MESSAGE_TYPE,
    content: [
      "# Freeflow Runtime State",
      "",
      "This is extension-generated runtime state. Use it to interpret the stable Freeflow guidance.",
      "",
      `Freeflow: ${freeflowStatus}`,
      "",
      "Capabilities:",
      `- Cognitive Routing: ${publicCognitiveRoutingStatus(capabilityState?.cognitiveRouting, cognitiveRoutingRuntime)}`,
      `- Tool Execution: ${publicCapabilityStatus(capabilityState?.toolExecution)}${
        capabilityState?.toolExecution?.effective === true
          ? ` · capture ${capabilityState.toolExecution.capture?.effective === true ? "active" : "inactive"} · reader enabled · workspace ${capabilityState.toolExecution.workspace?.effective === true ? (capabilityState.toolExecution.workspace.write ? "read/write" : "read-only") : "inactive"} · discovery ${capabilityState.toolExecution.discovery?.effective === true ? "active" : "inactive"} · accounting ${capabilityState.toolExecution.accounting?.effective === true ? "active" : "inactive"} · programs ${capabilityState.toolExecution.programs?.mode ?? "off"} · catalog ${options.toolExecutionRuntime?.catalog?.operations ?? 0} · adapters ${options.toolExecutionRuntime?.adapters?.announced?.filter((adapter) => adapter.active).length ?? 0}/${options.toolExecutionRuntime?.adapters?.allowed?.length ?? 0} · live effects ${options.toolExecutionRuntime?.unresolvedEffects ? `fenced (${options.toolExecutionRuntime.unresolvedEffects})` : "settled"} · native Bash built-in; custom tools require adapters · store ${options.toolExecutionRuntime?.store?.state ?? "unavailable"}${options.toolExecutionRuntime?.store?.reason ? ` (${options.toolExecutionRuntime.store.reason})` : ""} · guidance ${options.toolExecutionRuntime?.guidance?.state ?? "unobserved"}${options.toolExecutionRuntime?.lastFailure?.code ? ` · last program issue ${options.toolExecutionRuntime.lastFailure.code}` : options.toolExecutionRuntime?.failures?.at(-1)?.code ? ` · last capture issue ${options.toolExecutionRuntime.failures.at(-1).code}` : options.toolExecutionRuntime?.adapters?.failures?.at(-1)?.code ? ` · last adapter issue ${options.toolExecutionRuntime.adapters.failures.at(-1).code}` : ""}`
          : ""
      }`,
      "",
      "Cognitive Routing:",
      `- Control: \`${control}\``,
      // Under Automatic control the routing Runtime State owns the active profile, so switches do not churn this state.
      ...(control === "automatic" ? [] : [`- Profile: \`${profile}\``]),
      `- Delegation: \`${cognitiveRoutingRuntime?.delegation ?? capabilityState?.cognitiveRouting?.delegation ?? "executor"}\``,
      `- Projection: \`${projectionMode}\``,
    ].join("\n"),
    display: false,
    details: { source: "provider-request-runtime-state" },
  };
}

function withoutFreeflowRuntimeState(messages: readonly FreeflowContextMessage[] | undefined) {
  return (Array.isArray(messages) ? messages : []).filter(
    (message) =>
      message?.customType !== FREEFLOW_RUNTIME_STATE_MESSAGE_TYPE &&
      message?.customType !== COGNITIVE_ROUTING_RUNTIME_STATE_MESSAGE_TYPE,
  );
}

function firstUserMessageIndex(messages: readonly FreeflowContextMessage[]): number {
  for (let index = 0; index < messages.length; index += 1) {
    if (messages[index]?.role === "user") return index;
  }
  return -1;
}

function insertRuntimeStateBeforeFirstUser(
  messages: readonly FreeflowContextMessage[],
  runtimeState: FreeflowContextMessage,
): FreeflowContextMessage[] {
  const firstUserIndex = firstUserMessageIndex(messages);
  if (firstUserIndex < 0) return [...messages, runtimeState];
  return [...messages.slice(0, firstUserIndex), runtimeState, ...messages.slice(firstUserIndex)];
}

export function withFreeflowRuntimeState(
  messages: readonly FreeflowContextMessage[] | undefined,
  capabilityState,
  cognitiveRoutingRuntime: CognitiveRoutingRuntimeSnapshot | undefined = undefined,
  freeflowContext = undefined,
  options: {
    force?: boolean;
    projectionFailure?: string;
    toolExecutionRuntime?: ToolExecutionRuntimeSnapshot;
    anchor?: RuntimeStateAnchor;
  } = {},
) {
  const source = Array.isArray(messages) ? messages : [];
  const runtimeState = freeflowRuntimeStateMessage(capabilityState, cognitiveRoutingRuntime, freeflowContext, {
    projectionFailure: options.projectionFailure,
    toolExecutionRuntime: options.toolExecutionRuntime,
  });
  const runtimeStateMessages = source.filter(
    (message) =>
      message?.customType === FREEFLOW_RUNTIME_STATE_MESSAGE_TYPE ||
      message?.customType === COGNITIVE_ROUTING_RUNTIME_STATE_MESSAGE_TYPE,
  );
  const withoutRuntimeState = withoutFreeflowRuntimeState(source);
  const expectedRuntimeStateIndex = firstUserMessageIndex(withoutRuntimeState);
  const runtimeStateIndex = source.findIndex((message) => message?.customType === FREEFLOW_RUNTIME_STATE_MESSAGE_TYPE);
  const unchanged =
    options.force !== true &&
    runtimeStateMessages.length === 1 &&
    runtimeStateMessages[0]?.customType === FREEFLOW_RUNTIME_STATE_MESSAGE_TYPE &&
    runtimeStateMessages[0]?.content === runtimeState.content &&
    runtimeStateIndex === (expectedRuntimeStateIndex < 0 ? withoutRuntimeState.length : expectedRuntimeStateIndex);
  if (unchanged) return source;
  if (options.anchor) return insertAnchoredRuntimeState(withoutRuntimeState, runtimeState, options.anchor);
  return insertRuntimeStateBeforeFirstUser(withoutRuntimeState, runtimeState);
}

/** Caller-owned memory of where the current Runtime State was placed; reset it when history is replaced. */
export interface RuntimeStateAnchor {
  content?: string;
  index?: number;
}

// Unchanged state keeps its position so the cached prefix survives; changed state is placed before the
// latest user message so earlier input is not rewritten, and then stays at that position.
function insertAnchoredRuntimeState(
  messages: readonly FreeflowContextMessage[],
  runtimeState: FreeflowContextMessage,
  anchor: RuntimeStateAnchor,
): FreeflowContextMessage[] {
  let index: number;
  if (anchor.content === runtimeState.content && anchor.index !== undefined && anchor.index <= messages.length)
    index = anchor.index;
  else if (anchor.content === undefined) {
    const first = firstUserMessageIndex(messages);
    index = first < 0 ? messages.length : first;
  } else {
    let latest = messages.length;
    for (let i = messages.length - 1; i >= 0; i -= 1)
      if (messages[i]?.role === "user") {
        latest = i;
        break;
      }
    index = latest;
  }
  anchor.content = runtimeState.content as string;
  anchor.index = index;
  return [...messages.slice(0, index), runtimeState, ...messages.slice(index)];
}

export function stableRuntimeContext(context) {
  const sections = [
    ["Freeflow core", context?.corePrompt],
    ["Freeflow core", context?.interactionContractPrompt],
    ["Cognitive Routing", context?.cognitiveRoutingPrompt],
    ["Tool Execution", context?.toolExecutionPrompt],
  ];
  return [
    "# Freeflow availability contract",
    "Freeflow keeps a fixed reference catalog of its instructions, skills, and tools to preserve prompt caching. Presence in this catalog does not mean a feature is active or an operation is permitted.",
    "Apply the following guidance and Freeflow skills only when the latest extension-generated Freeflow Runtime State marks the corresponding feature active. When Freeflow is inactive, unavailable, or not configured, its core and capability guidance is dormant; do not bootstrap or follow it merely because it is listed. Explicit user instructions retain their normal authority.",
    "For Cognitive Routing, follow the latest control/profile/responsibility snapshots on this branch. Earlier snapshots and notices are historical; they grant no current permission. Tool permissions are checked by the runtime, even though all definitions remain visible. Never call a disabled operation.",
    ...sections
      .filter(([, text]) => isPromptAvailable(text))
      .map(([feature, text]) => `## Reference guidance: ${feature}\n\n${text.trim()}`),
  ].join("\n\n");
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
    reloadRequired: key === "enabled",
    sessionOverrides: { ...currentSessionOverrides },
    capabilityState: await readCapabilityState(ctx.cwd, ctx),
  };
}

export async function resetSessionOverrides(ctx, pi) {
  const hadCoreOverrides = Object.keys(currentSessionOverrides).length > 0;
  const reloadRequired = Object.hasOwn(currentSessionOverrides, "enabled");

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
