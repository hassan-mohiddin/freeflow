import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCognitiveRoutingState } from "../cognitive-routing-v2/config.js";
import { supportsCognitiveRoutingModelRegistry } from "../cognitive-routing-v2/config.js";
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
export const FREEFLOW_MODEL_SKILL_NAMES = [
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
  contextVirtualization: { effective: true },
  conversationHistory: { effective: true },
});
export const FREEFLOW_CAPABILITY_SKILL_NAMES = ["cognitive-routing", "context-virtualization", "conversation-history"];
export function freeflowSkillPath(skillName) {
  return fileURLToPath(new URL(`../../../skills/${skillName}/SKILL.md`, import.meta.url));
}
export function freeflowCapabilitySkillPath(skillName) {
  return fileURLToPath(new URL(`../../../capabilities/${skillName}/SKILL.md`, import.meta.url));
}
export function freeflowModelSkillPaths(capabilityState = undefined) {
  const paths = FREEFLOW_MODEL_SKILL_NAMES.map((skillName) => freeflowSkillPath(skillName));
  const capabilityStates = {
    "cognitive-routing": capabilityState?.cognitiveRouting,
    "context-virtualization": capabilityState?.contextVirtualization,
    "conversation-history": capabilityState?.conversationHistory,
  };
  for (const skillName of FREEFLOW_CAPABILITY_SKILL_NAMES) {
    if (capabilityStates[skillName]?.effective === true) {
      paths.push(freeflowCapabilitySkillPath(skillName));
    }
  }
  return paths;
}
const SESSION_OVERRIDES_ENTRY = "freeflow-session-overrides";
const SESSION_CORE_KEYS = new Set(["enabled", "contextVirtualization", "conversationHistory"]);
export const FREEFLOW_RUNTIME_STATE_MESSAGE_TYPE = "freeflow-runtime-state";
export const COGNITIVE_ROUTING_RUNTIME_STATE_MESSAGE_TYPE = "freeflow-cognitive-routing-runtime-state";
export const WORKFLOW_BOOTSTRAP_MESSAGE_TYPE = "freeflow-workflow-bootstrap";
export const COGNITIVE_ROUTING_BOOTSTRAP_MESSAGE_TYPE = "freeflow-cognitive-routing-bootstrap";
export const FREEFLOW_BOOTSTRAP_MESSAGE_TYPE = "freeflow-bootstrap";
let runtimeContextCache = null;
let currentSessionOverrides = {};
export function isPromptAvailable(value) {
  return typeof value === "string" && value.trim().length > 0;
}
// pi-subagents stamps child system prompts with this tag before binding extensions.
// Keeping detection at the prompt boundary avoids a process-global child flag.
export const SUBAGENT_AGENT_TAG = /<active_agent\s+name="[^"]+"\s*\/>/;
export const FREEFLOW_SUBAGENT_CAPABILITIES_DISABLED_MARKER = "<!-- freeflow-subagent-capabilities: disabled -->";
const SUBAGENT_OPTIONAL_CAPABILITIES_MESSAGE = "Optional Freeflow capabilities are disabled for subagents.";
export function isSubagentContext(context) {
  try {
    const systemPrompt = context?.getSystemPrompt?.();
    return (
      typeof systemPrompt === "string" &&
      (SUBAGENT_AGENT_TAG.test(systemPrompt) || systemPrompt.includes(FREEFLOW_SUBAGENT_CAPABILITIES_DISABLED_MARKER))
    );
  } catch {
    return false;
  }
}
function disableSubagentCapability(capability) {
  return {
    ...capability,
    enabled: false,
    effective: false,
    blockingReason: { code: "disabled", message: SUBAGENT_OPTIONAL_CAPABILITIES_MESSAGE },
  };
}
export function hasUsableMandatoryPrompts(freeflowContext) {
  return (
    isPromptAvailable(freeflowContext?.corePrompt) && isPromptAvailable(freeflowContext?.interactionContractPrompt)
  );
}
async function readPromptFile(url) {
  try {
    const prompt = await readFile(url, "utf8");
    return isPromptAvailable(prompt) ? prompt.trim() : null;
  } catch {
    return null;
  }
}
async function loadRuntimeContext(capabilityState = undefined) {
  const freeflowEnabled = capabilityState?.enabled === true;
  const contextVirtualizationEnabled = capabilityState?.contextVirtualization?.effective === true;
  const conversationHistoryEnabled = capabilityState?.conversationHistory?.effective === true;
  const cognitiveRoutingEnabled = capabilityState?.cognitiveRouting?.effective === true;
  const [
    corePrompt,
    interactionContractPrompt,
    cognitiveRoutingPrompt,
    contextVirtualizationPrompt,
    conversationHistoryPrompt,
  ] = await Promise.all([
    freeflowEnabled
      ? readPromptFile(new URL("../../../runtime/prompts/core.md", import.meta.url))
      : Promise.resolve(null),
    freeflowEnabled
      ? readPromptFile(new URL("../../../runtime/prompts/interaction-contract.md", import.meta.url))
      : Promise.resolve(null),
    cognitiveRoutingEnabled
      ? readPromptFile(new URL("../../../runtime/prompts/cognitive-routing.md", import.meta.url))
      : Promise.resolve(null),
    contextVirtualizationEnabled
      ? readPromptFile(new URL("../../../runtime/prompts/context-virtualization.md", import.meta.url))
      : Promise.resolve(null),
    conversationHistoryEnabled
      ? readPromptFile(new URL("../../../runtime/prompts/conversation-history.md", import.meta.url))
      : Promise.resolve(null),
  ]);
  return {
    corePrompt,
    interactionContractPrompt,
    cognitiveRoutingPrompt,
    contextVirtualizationPrompt,
    conversationHistoryPrompt,
  };
}
function runtimeContextCacheSatisfies(capabilityState) {
  if (!runtimeContextCache) return false;
  const expected = {
    corePrompt: capabilityState?.enabled === true,
    interactionContractPrompt: capabilityState?.enabled === true,
    cognitiveRoutingPrompt: capabilityState?.cognitiveRouting?.effective === true,
    contextVirtualizationPrompt: capabilityState?.contextVirtualization?.effective === true,
    conversationHistoryPrompt: capabilityState?.conversationHistory?.effective === true,
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
function validateCoreConfigFields(value) {
  if (value.enabled !== undefined && typeof value.enabled !== "boolean") {
    return "enabled must be a boolean";
  }
  if (value.contextVirtualization !== undefined && typeof value.contextVirtualization !== "boolean") {
    return "contextVirtualization must be a boolean";
  }
  if (value.conversationHistory !== undefined && typeof value.conversationHistory !== "boolean") {
    return "conversationHistory must be a boolean";
  }
  return null;
}
function validateFreeflowConfigShape(value) {
  if (!isRecord(value)) {
    return "config must be a JSON object";
  }
  // Keep retired capability keys shape-tolerated so existing repositories remain activated; runtime behavior ignores them.
  const allowedKeys = new Set([
    "enabled",
    "outputRouter",
    "observedRouting",
    "scriptTransform",
    "cognitiveRouting",
    "contextVirtualization",
    "conversationHistory",
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
  const allowedKeys = new Set([
    "enabled",
    "processing",
    "cognitiveRouting",
    "contextVirtualization",
    "conversationHistory",
    "toolExecution",
  ]);
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
export function readFreeflowConfigState(cwd) {
  return readConfigFileState(join(cwd, ".freeflow/config.json"), validateFreeflowConfigShape);
}
export function readFreeflowLocalConfigState(cwd) {
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
  const contextVirtualization = resolveLayeredValue(repository, local, "contextVirtualization", false);
  const conversationHistory = resolveLayeredValue(repository, local, "conversationHistory", false);
  return {
    config: {
      enabled: enabled.value,
      contextVirtualization: contextVirtualization.value,
      conversationHistory: conversationHistory.value,
    },
    sources: {
      enabled: enabled.source,
      contextVirtualization: contextVirtualization.source,
      conversationHistory: conversationHistory.source,
    },
  };
}
function normalizeSessionOverrides(value) {
  if (!isRecord(value)) return {};
  const overrides = {};
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
  const contextVirtualization = currentSessionOverrides.contextVirtualization;
  const conversationHistory = currentSessionOverrides.conversationHistory;
  return {
    config: {
      enabled: typeof enabled === "boolean" ? enabled : configured.enabled,
      contextVirtualization:
        typeof contextVirtualization === "boolean" ? contextVirtualization : configured.contextVirtualization,
      conversationHistory:
        typeof conversationHistory === "boolean" ? conversationHistory : configured.conversationHistory,
    },
    sources: {
      enabled: typeof enabled === "boolean" ? "session" : sources.enabled,
      contextVirtualization: typeof contextVirtualization === "boolean" ? "session" : sources.contextVirtualization,
      conversationHistory: typeof conversationHistory === "boolean" ? "session" : sources.conversationHistory,
    },
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
export async function readCapabilityState(cwd, host = undefined, extensionHost = undefined) {
  const layers = await readFreeflowConfigLayers(cwd);
  const effectiveCore = resolveSessionCoreConfig(layers);
  const enabled = layers.configured && effectiveCore.config.enabled;
  const contextVirtualizationConfigEnabled = effectiveCore.config.contextVirtualization;
  const conversationHistoryConfigEnabled = effectiveCore.config.conversationHistory;
  const subagentContext = isSubagentContext(host);
  const hostSupportsCognitiveRouting = !subagentContext && supportsCognitiveRoutingModelRegistry(host);
  const configuredCognitiveRouting = await resolveCognitiveRoutingState(
    layers.repository.parsed,
    layers.local.parsed,
    hostSupportsCognitiveRouting ? host : undefined,
  );
  const disabledReason = enabled ? undefined : { code: "disabled", message: "Freeflow is disabled" };
  const childCapability = (configuredEnabled) => ({
    enabled: configuredEnabled,
    effective: enabled && configuredEnabled,
    ...(disabledReason ? { blockingReason: disabledReason } : {}),
  });
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
    contextVirtualization: childCapability(contextVirtualizationConfigEnabled),
    conversationHistory: childCapability(conversationHistoryConfigEnabled),
    hostSupportsCognitiveRouting,
    cognitiveRouting,
    toolExecution,
  };
  if (!subagentContext) return capabilityState;
  return {
    ...capabilityState,
    contextVirtualization: disableSubagentCapability(capabilityState.contextVirtualization),
    conversationHistory: disableSubagentCapability(capabilityState.conversationHistory),
    cognitiveRouting: disableSubagentCapability(capabilityState.cognitiveRouting),
    toolExecution: disableSubagentCapability(capabilityState.toolExecution),
  };
}
export const readRuntimeState = readCapabilityState;
export function restoreSessionOverrides(ctx) {
  currentSessionOverrides = {};
  const entries = ctx.sessionManager?.getBranch?.() ?? ctx.sessionManager?.getEntries?.() ?? [];
  for (const entry of entries) {
    if (entry.type === "custom" && entry.customType === SESSION_OVERRIDES_ENTRY) {
      currentSessionOverrides = normalizeSessionOverrides(entry.data?.overrides);
    }
  }
}
export function setFreeflowStatus(
  ctx,
  capabilityState = undefined,
  cognitiveRoutingRuntime = undefined,
  freeflowContext = undefined,
  options = {},
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
  const active = [];
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
    active.push(`cognitive blocked · ${cognitiveRoutingRuntime?.runtimeReason ?? "runtime_blocked"}`);
  } else if (cognitiveRoutingActive) {
    const profile = cognitiveRoutingRuntime.activeProfile;
    const control = String(cognitiveRoutingRuntime.controlMode).startsWith("manual-") ? "manual hold" : "automatic";
    active.push(`${profile} · ${control}`);
  } else if (cognitiveRouting?.enabled === true) {
    if (cognitiveRouting.blockingReason?.code === "runtime_disabled") {
      active.push("cognitive blocked · runtime_disabled");
    } else if (
      cognitiveRouting.effective === true &&
      cognitiveRoutingRuntime === undefined &&
      options.cognitiveRoutingStartupPending === true &&
      !startupSelectionSuppressesCognitiveRouting
    ) {
      const startupProfile =
        cognitiveRouting.sessionStart?.control === "manual"
          ? (cognitiveRouting.sessionStart.profile ?? "coordinator")
          : "coordinator";
      active.push(`${startupProfile} · pending`);
    } else {
      const reason =
        cognitiveRouting.effective === true
          ? (cognitiveRoutingRuntime?.blockingReason?.code ?? "runtime_inactive")
          : (cognitiveRouting.blockingReason?.code ?? "unavailable");
      active.push(`cognitive blocked · ${reason}`);
    }
  }
  if (capabilityState?.contextVirtualization?.effective || capabilityState?.conversationHistory?.effective) {
    active.push("context");
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
function publicCognitiveRoutingProjectionMode(capability, runtime, projectionFailure) {
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
  cognitiveRoutingRuntime = undefined,
  freeflowContext = undefined,
  options = {},
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
      `- Context Virtualization: ${publicCapabilityStatus(capabilityState?.contextVirtualization)}`,
      `- Conversation History: ${publicCapabilityStatus(capabilityState?.conversationHistory)}`,
      `- Cognitive Routing: ${publicCognitiveRoutingStatus(capabilityState?.cognitiveRouting, cognitiveRoutingRuntime)}`,
      `- Tool Execution: ${publicCapabilityStatus(capabilityState?.toolExecution)}${
        capabilityState?.toolExecution?.effective === true
          ? ` · capture ${capabilityState.toolExecution.capture?.effective === true ? "active" : "inactive"} · reader enabled · workspace ${capabilityState.toolExecution.workspace?.effective === true ? "active" : "inactive"} · discovery ${capabilityState.toolExecution.discovery?.effective === true ? "active" : "inactive"} · accounting ${capabilityState.toolExecution.accounting?.effective === true ? "active" : "inactive"} · programs ${capabilityState.toolExecution.programs?.effective === true ? "active" : "pending"} · catalog ${options.toolExecutionRuntime?.catalog?.operations ?? 0} · adapters ${options.toolExecutionRuntime?.adapters?.announced?.filter((adapter) => adapter.active).length ?? 0}/${options.toolExecutionRuntime?.adapters?.allowed?.length ?? 0} · live effects ${options.toolExecutionRuntime?.unresolvedEffects ? `fenced (${options.toolExecutionRuntime.unresolvedEffects})` : "settled"} · native Bash built-in; custom tools require adapters${options.toolExecutionRuntime?.lastFailure?.code ? ` · last program issue ${options.toolExecutionRuntime.lastFailure.code}` : options.toolExecutionRuntime?.failures?.at(-1)?.code ? ` · last capture issue ${options.toolExecutionRuntime.failures.at(-1).code}` : options.toolExecutionRuntime?.adapters?.failures?.at(-1)?.code ? ` · last adapter issue ${options.toolExecutionRuntime.adapters.failures.at(-1).code}` : ""}`
          : ""
      }`,
      "",
      "Cognitive Routing:",
      `- Control: \`${control}\``,
      `- Profile: \`${profile}\``,
      `- Delegation: \`${capabilityState?.cognitiveRouting?.delegation ?? "executor"}\``,
      `- Projection: \`${projectionMode}\``,
    ].join("\n"),
    display: false,
    details: { source: "provider-request-runtime-state" },
  };
}
export function withoutFreeflowRuntimeState(messages) {
  return (Array.isArray(messages) ? messages : []).filter(
    (message) =>
      message?.customType !== FREEFLOW_RUNTIME_STATE_MESSAGE_TYPE &&
      message?.customType !== COGNITIVE_ROUTING_RUNTIME_STATE_MESSAGE_TYPE,
  );
}
function lastUserMessageIndex(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return index;
  }
  return -1;
}
function insertRuntimeStateBeforeLatestUser(messages, runtimeState) {
  const latestUserIndex = lastUserMessageIndex(messages);
  if (latestUserIndex < 0) return [...messages, runtimeState];
  return [...messages.slice(0, latestUserIndex), runtimeState, ...messages.slice(latestUserIndex)];
}
export function withFreeflowRuntimeState(
  messages,
  capabilityState,
  cognitiveRoutingRuntime = undefined,
  freeflowContext = undefined,
  options = {},
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
  const expectedRuntimeStateIndex = lastUserMessageIndex(withoutRuntimeState);
  const runtimeStateIndex = source.findIndex((message) => message?.customType === FREEFLOW_RUNTIME_STATE_MESSAGE_TYPE);
  const unchanged =
    options.force !== true &&
    runtimeStateMessages.length === 1 &&
    runtimeStateMessages[0]?.customType === FREEFLOW_RUNTIME_STATE_MESSAGE_TYPE &&
    runtimeStateMessages[0]?.content === runtimeState.content &&
    runtimeStateIndex === (expectedRuntimeStateIndex < 0 ? withoutRuntimeState.length : expectedRuntimeStateIndex);
  if (unchanged) return source;
  return insertRuntimeStateBeforeLatestUser(withoutRuntimeState, runtimeState);
}
export function stableRuntimeContext(context) {
  const sections = [
    ["Freeflow core", context?.corePrompt],
    ["Freeflow core", context?.interactionContractPrompt],
    ["Cognitive Routing", context?.cognitiveRoutingPrompt],
    ["Context Virtualization", context?.contextVirtualizationPrompt],
    ["Conversation History", context?.conversationHistoryPrompt],
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
export function runtimeContext(freeflowContext, capabilityState) {
  if (
    capabilityState?.configured !== true ||
    capabilityState?.enabled !== true ||
    !hasUsableMandatoryPrompts(freeflowContext)
  ) {
    return "";
  }
  const blocks = [freeflowContext.corePrompt.trim(), freeflowContext.interactionContractPrompt.trim()];
  if (
    capabilityState.cognitiveRouting?.effective === true &&
    isPromptAvailable(freeflowContext.cognitiveRoutingPrompt)
  ) {
    blocks.push(freeflowContext.cognitiveRoutingPrompt.trim());
  }
  if (
    capabilityState.contextVirtualization?.effective === true &&
    isPromptAvailable(freeflowContext.contextVirtualizationPrompt)
  ) {
    blocks.push(freeflowContext.contextVirtualizationPrompt.trim());
  }
  if (
    capabilityState.conversationHistory?.effective === true &&
    isPromptAvailable(freeflowContext.conversationHistoryPrompt)
  ) {
    blocks.push(freeflowContext.conversationHistoryPrompt.trim());
  }
  return blocks.filter(Boolean).join("\n\n");
}
export async function setSessionCoreOverride(key, value, ctx, pi) {
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
  pi?.appendEntry?.(SESSION_OVERRIDES_ENTRY, { overrides: { ...currentSessionOverrides } });
  return {
    changed: true,
    reloadRequired: key === "enabled",
    sessionOverrides: { ...currentSessionOverrides },
    capabilityState: await readCapabilityState(ctx.cwd, ctx, pi?.host),
  };
}
export async function resetSessionOverrides(ctx, pi) {
  const hadCoreOverrides = Object.keys(currentSessionOverrides).length > 0;
  const reloadRequired = Object.hasOwn(currentSessionOverrides, "enabled");
  if (hadCoreOverrides) {
    currentSessionOverrides = {};
    pi?.appendEntry?.(SESSION_OVERRIDES_ENTRY, { overrides: {} });
  }
  return {
    changed: hadCoreOverrides,
    reloadRequired,
    sessionOverrides: { ...currentSessionOverrides },
    capabilityState: await readCapabilityState(ctx.cwd, ctx, pi?.host),
  };
}
