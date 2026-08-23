import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCognitiveRoutingState } from "../cognitive-routing/runtime.js";
import { isPiFlowHost } from "./runtime-identity.js";
export const VALID_MODES = new Set(["conversation", "workflow", "strict-workflow"]);
export const WORKFLOW_COMMANDS = [
  { command: "discuss", skill: "discuss" },
  { command: "discover", skill: "discuss" },
  { command: "track-work", skill: "track-work" },
  { command: "write-spec", skill: "write-spec" },
  { command: "review-artifact", skill: "review-artifact" },
  { command: "write-plan", skill: "write-plan" },
  { command: "execute-work", skill: "execute-work" },
  { command: "execute-plan", skill: "execute-work" },
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
  "mode-contract",
  "release-work",
  "review-artifact",
  "review-work",
  "setup-freeflow",
  "launch-work",
  "simplify-code",
  "tdd",
  "track-work",
  "verify-work",
  "workflow",
  "write-plan",
  "write-skill",
  "write-spec",
];
export function freeflowSkillPath(skillName) {
  return fileURLToPath(new URL(`../../../skills/${skillName}/SKILL.md`, import.meta.url));
}
export function freeflowModelSkillPaths() {
  return FREEFLOW_MODEL_SKILL_NAMES.map((skillName) => freeflowSkillPath(skillName));
}
const MODE_STATE_ENTRY = "freeflow-mode";
const SESSION_OVERRIDES_ENTRY = "freeflow-session-overrides";
const SESSION_CORE_KEYS = new Set(["enabled", "interactionContract", "skillsEnabled", "contextVirtualization"]);
const RESET_MODE_ARGS = new Set(["reset"]);
export const COGNITIVE_ROUTING_SWITCH_TOOL_NAME = "freeflow_switch_profile";
export const COGNITIVE_ROUTING_RUNTIME_STATE_MESSAGE_TYPE = "freeflow-cognitive-routing-runtime-state";
export const WORKFLOW_BOOTSTRAP_MESSAGE_TYPE = "freeflow-workflow-bootstrap";
export const COGNITIVE_ROUTING_BOOTSTRAP_MESSAGE_TYPE = "freeflow-cognitive-routing-bootstrap";
export const FREEFLOW_BOOTSTRAP_MESSAGE_TYPE = "freeflow-bootstrap";
let runtimeContextCache = null;
let currentModeOverride = null;
let currentSessionOverrides = {};
async function loadRuntimeContext(capabilityState = undefined) {
  const interactionContractEnabled = capabilityState?.interactionContract?.effective === true;
  const skillsEnabled = capabilityState?.skills?.effective === true;
  const contextVirtualizationEnabled = capabilityState?.contextVirtualization?.effective === true;
  const cognitiveRoutingEnabled = capabilityState?.cognitiveRouting?.effective === true;
  const [
    interactionContract,
    workflowSkill,
    contextVirtualizationSkill,
    cognitiveRoutingSkill,
    cognitiveRoutingReference,
  ] = await Promise.all([
    interactionContractEnabled
      ? readFile(new URL("../../../capabilities/interaction-contract/interaction-contract.md", import.meta.url), "utf8")
      : Promise.resolve(null),
    skillsEnabled
      ? readFile(new URL("../../../skills/workflow/SKILL.md", import.meta.url), "utf8")
      : Promise.resolve(null),
    contextVirtualizationEnabled
      ? readFile(new URL("../../../capabilities/context-virtualization/SKILL.md", import.meta.url), "utf8")
      : Promise.resolve(null),
    cognitiveRoutingEnabled
      ? readFile(new URL("../../../capabilities/cognitive-routing/SKILL.md", import.meta.url), "utf8")
      : Promise.resolve(null),
    cognitiveRoutingEnabled
      ? readFile(
          new URL("../../../capabilities/cognitive-routing/references/automatic-routing-kernel.md", import.meta.url),
          "utf8",
        )
      : Promise.resolve(null),
  ]);
  return {
    interactionContract,
    workflowSkill,
    contextVirtualizationSkill,
    cognitiveRoutingSkill,
    cognitiveRoutingReference,
  };
}
function runtimeContextCacheSatisfies(capabilityState) {
  if (!runtimeContextCache) {
    return false;
  }
  if (capabilityState?.interactionContract?.effective === true && !runtimeContextCache.interactionContract) {
    return false;
  }
  if (capabilityState?.skills?.effective === true && !runtimeContextCache.workflowSkill) {
    return false;
  }
  if (capabilityState?.contextVirtualization?.effective === true && !runtimeContextCache.contextVirtualizationSkill) {
    return false;
  }
  if (capabilityState?.cognitiveRouting?.effective === true) {
    if (!runtimeContextCache.cognitiveRoutingSkill || !runtimeContextCache.cognitiveRoutingReference) {
      return false;
    }
  }
  return true;
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
function activeSessionEntries(sessionManager) {
  try {
    if (typeof sessionManager?.buildContextEntries === "function") {
      const entries = sessionManager.buildContextEntries();
      if (Array.isArray(entries)) {
        return entries;
      }
    }
    if (typeof sessionManager?.getEntries === "function") {
      const entries = sessionManager.getEntries();
      if (Array.isArray(entries)) {
        return entries;
      }
    }
  } catch {
    // A missing session snapshot should reload useful context rather than suppress it.
  }
  return [];
}
const BOOTSTRAP_COMPONENTS = Object.freeze({
  workflow: "workflow",
  cognitiveRouting: "cognitive-routing",
});
function availableBootstrapComponents(freeflowContext, capabilityState) {
  const components = [];
  if (capabilityState?.skills?.effective === true && freeflowContext?.workflowSkill) {
    components.push(BOOTSTRAP_COMPONENTS.workflow);
  }
  if (capabilityState?.cognitiveRouting?.effective === true && freeflowContext?.cognitiveRoutingSkill) {
    components.push(BOOTSTRAP_COMPONENTS.cognitiveRouting);
  }
  return components;
}
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
function bootstrapComponentContent(component, freeflowContext) {
  if (component === BOOTSTRAP_COMPONENTS.workflow) {
    return `# Freeflow Workflow Bootstrap\n\n${freeflowContext.workflowSkill.trim()}`;
  }
  if (component === BOOTSTRAP_COMPONENTS.cognitiveRouting) {
    return `# Freeflow Cognitive Routing Bootstrap\n\n${freeflowContext.cognitiveRoutingSkill.trim()}`;
  }
  return "";
}
function combinedBootstrapContent(components, freeflowContext) {
  const sections = components.map(
    (component) =>
      `<!-- freeflow-bootstrap:${component} -->\n${bootstrapComponentContent(component, freeflowContext)}\n<!-- /freeflow-bootstrap:${component} -->`,
  );
  return `# Freeflow Bootstrap\n\n${sections.join("\n\n")}`;
}
export function bootstrapMessage(freeflowContext, capabilityState, sessionManager) {
  const available = availableBootstrapComponents(freeflowContext, capabilityState);
  if (available.length === 0) return undefined;
  const loaded = new Set(activeSessionEntries(sessionManager).flatMap(bootstrapEntryComponents));
  const missing = available.filter((component) => !loaded.has(component));
  if (missing.length === 0) return undefined;
  if (missing.length === 1 && missing[0] === BOOTSTRAP_COMPONENTS.workflow) {
    return {
      customType: WORKFLOW_BOOTSTRAP_MESSAGE_TYPE,
      content: bootstrapComponentContent(BOOTSTRAP_COMPONENTS.workflow, freeflowContext),
      display: false,
      details: { skill: "workflow", source: "context-start-bootstrap" },
    };
  }
  if (missing.length === 1 && missing[0] === BOOTSTRAP_COMPONENTS.cognitiveRouting) {
    return {
      customType: COGNITIVE_ROUTING_BOOTSTRAP_MESSAGE_TYPE,
      content: bootstrapComponentContent(BOOTSTRAP_COMPONENTS.cognitiveRouting, freeflowContext),
      display: false,
      details: { skill: "cognitive-routing", source: "context-start-bootstrap" },
    };
  }
  return {
    customType: FREEFLOW_BOOTSTRAP_MESSAGE_TYPE,
    content: combinedBootstrapContent(missing, freeflowContext),
    display: false,
    details: { components: missing, source: "context-start-bootstrap" },
  };
}
export function workflowBootstrapMessage(freeflowContext, capabilityState, sessionManager) {
  if (capabilityState?.skills?.effective !== true || !freeflowContext?.workflowSkill) {
    return undefined;
  }
  const alreadyLoaded = activeSessionEntries(sessionManager).some((entry) =>
    bootstrapEntryComponents(entry).includes(BOOTSTRAP_COMPONENTS.workflow),
  );
  if (alreadyLoaded) return undefined;
  return {
    customType: WORKFLOW_BOOTSTRAP_MESSAGE_TYPE,
    content: bootstrapComponentContent(BOOTSTRAP_COMPONENTS.workflow, freeflowContext),
    display: false,
    details: { skill: "workflow", source: "first-turn-bootstrap" },
  };
}
function enabledBootstrapComponents(capabilityState) {
  const components = [];
  if (capabilityState?.skills?.effective === true) components.push(BOOTSTRAP_COMPONENTS.workflow);
  if (capabilityState?.cognitiveRouting?.effective === true) {
    components.push(BOOTSTRAP_COMPONENTS.cognitiveRouting);
  }
  return components;
}
function bootstrapSection(content, component) {
  const startMarker = `<!-- freeflow-bootstrap:${component} -->`;
  const endMarker = `<!-- /freeflow-bootstrap:${component} -->`;
  const start = typeof content === "string" ? content.indexOf(startMarker) : -1;
  if (start < 0) return undefined;
  const end = content.indexOf(endMarker, start + startMarker.length);
  if (end < 0) return undefined;
  return content.slice(start, end + endMarker.length);
}
export function filterBootstrapMessage(message, capabilityState) {
  const components = bootstrapEntryComponents(message);
  if (components.length === 0) return message;
  const enabled = new Set(enabledBootstrapComponents(capabilityState));
  const retained = components.filter((component) => enabled.has(component));
  if (retained.length === 0) return undefined;
  if (retained.length === components.length) return message;
  if (message.customType !== FREEFLOW_BOOTSTRAP_MESSAGE_TYPE) return undefined;
  const sections = retained.map((component) => bootstrapSection(message.content, component)).filter(Boolean);
  if (sections.length === 0) return undefined;
  return {
    ...message,
    content: `# Freeflow Bootstrap\n\n${sections.join("\n\n")}`,
    details: { ...message.details, components: retained },
  };
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validateCoreConfigFields(value) {
  if (value.defaultMode !== undefined && !VALID_MODES.has(value.defaultMode)) {
    return `invalid defaultMode: ${JSON.stringify(value.defaultMode)}`;
  }
  if (value.enabled !== undefined && typeof value.enabled !== "boolean") {
    return "enabled must be a boolean";
  }
  if (value.contextVirtualization !== undefined && typeof value.contextVirtualization !== "boolean") {
    return "contextVirtualization must be a boolean";
  }
  if (value.interactionContract !== undefined && typeof value.interactionContract !== "boolean") {
    return "interactionContract must be a boolean";
  }
  if (value.skills !== undefined) {
    if (!isRecord(value.skills)) {
      return "skills must be an object";
    }
    for (const key of Object.keys(value.skills)) {
      if (key !== "enabled") {
        return `unsupported skills config key: ${key}`;
      }
    }
    if (value.skills.enabled !== undefined && typeof value.skills.enabled !== "boolean") {
      return "skills.enabled must be a boolean";
    }
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
    "defaultMode",
    "interactionContract",
    "skills",
    "outputRouter",
    "observedRouting",
    "scriptTransform",
    "cognitiveRouting",
    "contextVirtualization",
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
  return null;
}
function validateFreeflowLocalConfigShape(value) {
  if (!isRecord(value)) {
    return "local config must be a JSON object";
  }
  const allowedKeys = new Set([
    "enabled",
    "defaultMode",
    "interactionContract",
    "skills",
    "processing",
    "cognitiveRouting",
    "contextVirtualization",
  ]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      return `unsupported top-level local config key: ${key}`;
    }
  }
  return validateCoreConfigFields(value);
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
  const interactionContract = resolveLayeredValue(repository, local, "interactionContract", true);
  const contextVirtualization = resolveLayeredValue(repository, local, "contextVirtualization", false);
  const defaultMode = resolveLayeredValue(repository, local, "defaultMode", "workflow");
  const repositorySkills = isRecord(repository.skills) ? repository.skills : {};
  const localSkills = isRecord(local.skills) ? local.skills : {};
  const skillsEnabled = resolveLayeredValue(repositorySkills, localSkills, "enabled", true);
  return {
    config: {
      enabled: enabled.value,
      interactionContract: interactionContract.value,
      contextVirtualization: contextVirtualization.value,
      skills: { enabled: skillsEnabled.value },
      defaultMode: defaultMode.value,
    },
    sources: {
      enabled: enabled.source,
      interactionContract: interactionContract.source,
      contextVirtualization: contextVirtualization.source,
      skillsEnabled: skillsEnabled.source,
      defaultMode: defaultMode.source,
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
  const interactionContract = currentSessionOverrides.interactionContract;
  const contextVirtualization = currentSessionOverrides.contextVirtualization;
  const skillsEnabled = currentSessionOverrides.skillsEnabled;
  return {
    config: {
      enabled: typeof enabled === "boolean" ? enabled : configured.enabled,
      interactionContract:
        typeof interactionContract === "boolean" ? interactionContract : configured.interactionContract,
      contextVirtualization:
        typeof contextVirtualization === "boolean" ? contextVirtualization : configured.contextVirtualization,
      skills: { enabled: typeof skillsEnabled === "boolean" ? skillsEnabled : configured.skills.enabled },
      defaultMode: configured.defaultMode,
    },
    sources: {
      enabled: typeof enabled === "boolean" ? "session" : sources.enabled,
      interactionContract: typeof interactionContract === "boolean" ? "session" : sources.interactionContract,
      contextVirtualization: typeof contextVirtualization === "boolean" ? "session" : sources.contextVirtualization,
      skillsEnabled: typeof skillsEnabled === "boolean" ? "session" : sources.skillsEnabled,
      defaultMode: sources.defaultMode,
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
  const interactionContractConfigEnabled = effectiveCore.config.interactionContract;
  const skillsConfigEnabled = effectiveCore.config.skills.enabled;
  const contextVirtualizationConfigEnabled = effectiveCore.config.contextVirtualization;
  const hostSupportsCognitiveRouting = isPiFlowHost(extensionHost);
  const configuredCognitiveRouting = await resolveCognitiveRoutingState(
    layers.repository.parsed,
    layers.local.parsed,
    hostSupportsCognitiveRouting ? host : undefined,
  );
  const cognitiveRouting = enabled
    ? !hostSupportsCognitiveRouting && configuredCognitiveRouting.configValid
      ? {
          ...configuredCognitiveRouting,
          effective: false,
          blockingReason: {
            code: "runtime_disabled",
            message: "Cognitive Routing is disabled outside the PiFlow runtime",
          },
        }
      : configuredCognitiveRouting
    : {
        ...configuredCognitiveRouting,
        enabled: false,
        effective: false,
        blockingReason: {
          code: "disabled",
          message: "Freeflow is disabled",
        },
      };
  return {
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
    defaultMode: effectiveCore.config.defaultMode,
    enabled,
    interactionContract: {
      enabled: interactionContractConfigEnabled,
      effective: enabled && interactionContractConfigEnabled,
    },
    skills: {
      enabled: skillsConfigEnabled,
      effective: enabled && skillsConfigEnabled,
    },
    contextVirtualization: {
      enabled: contextVirtualizationConfigEnabled,
      effective: enabled && contextVirtualizationConfigEnabled,
    },
    hostSupportsCognitiveRouting,
    cognitiveRouting,
  };
}
export const readRuntimeState = readCapabilityState;
export function restoreModeOverride(ctx) {
  currentModeOverride = null;
  currentSessionOverrides = {};
  const entries = ctx.sessionManager?.getBranch?.() ?? ctx.sessionManager?.getEntries?.() ?? [];
  for (const entry of entries) {
    if (entry.type !== "custom") continue;
    if (entry.customType === MODE_STATE_ENTRY) {
      const mode = entry.data?.currentMode;
      currentModeOverride = VALID_MODES.has(mode) ? mode : null;
    } else if (entry.customType === SESSION_OVERRIDES_ENTRY) {
      currentSessionOverrides = normalizeSessionOverrides(entry.data?.overrides);
    }
  }
}
export async function readModeState(cwd) {
  const layers = await readFreeflowConfigLayers(cwd);
  const effectiveCore = resolveSessionCoreConfig(layers);
  const repositoryDefaultMode = VALID_MODES.has(layers.repository.parsed.defaultMode)
    ? layers.repository.parsed.defaultMode
    : "workflow";
  const personalDefaultMode = VALID_MODES.has(layers.local.parsed.defaultMode) ? layers.local.parsed.defaultMode : null;
  const sessionMode = VALID_MODES.has(currentModeOverride) ? currentModeOverride : null;
  const resolvedMode = sessionMode ?? effectiveCore.config.defaultMode;
  const active = layers.configured && effectiveCore.config.enabled && effectiveCore.config.skills.enabled;
  return {
    repositoryDefaultMode,
    repositoryDefaultModeSource: VALID_MODES.has(layers.repository.parsed.defaultMode) ? "repository" : "builtin",
    personalDefaultMode,
    defaultMode: effectiveCore.config.defaultMode,
    defaultModeSource: effectiveCore.sources.defaultMode,
    currentMode: sessionMode,
    sessionMode,
    resolvedMode,
    active,
    effectiveMode: active ? resolvedMode : null,
  };
}
export function setModeStatus(
  ctx,
  modeState,
  capabilityState = undefined,
  cognitiveRoutingRuntime = undefined,
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
  const active = [];
  if (capabilityState?.interactionContract.effective) {
    active.push("interaction");
  } else if (capabilityState?.configSources?.interactionContract === "session") {
    active.push("interaction off (session)");
  }
  if (capabilityState?.skills.effective) {
    active.push(`${modeState.effectiveMode}${modeState.currentMode ? " (session)" : ""}`);
  } else if (capabilityState?.configSources?.skillsEnabled === "session") {
    active.push("skills off (session)");
  }
  const cognitiveRouting = capabilityState?.cognitiveRouting;
  const cognitiveRoutingActive = cognitiveRouting?.effective === true && cognitiveRoutingRuntime?.effective === true;
  const startupSelectionSuppressesCognitiveRouting =
    ctx?.modelStateProvenance?.explicitModel === true || ctx?.modelStateProvenance?.explicitThinking === true;
  if (cognitiveRoutingActive) {
    const profile = cognitiveRoutingRuntime.activeProfile;
    const control =
      cognitiveRoutingRuntime.controlMode === "manual-standard" ||
      cognitiveRoutingRuntime.controlMode === "manual-reasoning"
        ? "manual hold"
        : "automatic";
    active.push(`cognitive ${profile} · ${control}`);
  } else if (cognitiveRouting?.enabled === true) {
    if (cognitiveRouting.blockingReason?.code === "runtime_disabled") {
      active.push("cognitive disabled · PiFlow only");
    } else if (
      cognitiveRouting.effective === true &&
      cognitiveRoutingRuntime === undefined &&
      options.cognitiveRoutingStartupPending === true &&
      !startupSelectionSuppressesCognitiveRouting
    ) {
      active.push("cognitive standard · pending");
    } else {
      const reason =
        cognitiveRouting?.effective === true
          ? (cognitiveRoutingRuntime?.blockingReason?.code ?? "runtime_inactive")
          : (cognitiveRouting.blockingReason?.code ?? "unavailable");
      active.push(`cognitive blocked · ${reason}`);
    }
  }
  if (capabilityState?.contextVirtualization?.effective) {
    active.push("context virtualization");
  }
  ctx.ui.setStatus("freeflow", `freeflow: ${active.length > 0 ? active.join(" · ") : "idle"}`);
}
function modeSourceLabel(source) {
  if (source === "local") return "personal override";
  if (source === "repository") return "repository default";
  return "built-in default";
}
function describeModeState(modeState) {
  const configuredDefault = `configured default ${modeState.defaultMode} (${modeSourceLabel(modeState.defaultModeSource)})`;
  if (modeState.sessionMode) {
    return `session ${modeState.sessionMode}; ${configuredDefault}`;
  }
  return configuredDefault;
}
export function skillPrompt(skill, args) {
  const trimmed = args?.trim();
  return trimmed ? `/skill:${skill}\n\n${trimmed}` : `/skill:${skill}`;
}
function cognitiveRoutingContext(freeflowContext) {
  const reference = freeflowContext?.cognitiveRoutingReference?.trim();
  return reference ? `\n\n${reference}` : "";
}
function publicCognitiveRoutingControl(controlMode) {
  if (controlMode === "automatic") return "automatic";
  if (controlMode === "manual-standard" || controlMode === "manual-reasoning") return "manual";
  return "unavailable";
}
function publicCognitiveRoutingProfile(activeProfile, effective) {
  if (effective !== true) return "unavailable";
  return activeProfile === "standard" || activeProfile === "reasoning" ? activeProfile : "unavailable";
}
export function cognitiveRoutingRuntimeStateMessage(cognitiveRoutingRuntime = undefined) {
  const profile = publicCognitiveRoutingProfile(
    cognitiveRoutingRuntime?.activeProfile,
    cognitiveRoutingRuntime?.effective,
  );
  const control =
    profile === "unavailable" ? "unavailable" : publicCognitiveRoutingControl(cognitiveRoutingRuntime?.controlMode);
  return {
    role: "custom",
    customType: COGNITIVE_ROUTING_RUNTIME_STATE_MESSAGE_TYPE,
    content: `# Cognitive Routing Current State\n\nControl: \`${control}\`\nProfile: \`${profile}\``,
    display: false,
    details: { source: "provider-request-runtime-state" },
  };
}
export function withoutCognitiveRoutingRuntimeState(messages) {
  return (Array.isArray(messages) ? messages : []).filter(
    (message) => message?.customType !== COGNITIVE_ROUTING_RUNTIME_STATE_MESSAGE_TYPE,
  );
}
export function withCognitiveRoutingRuntimeState(messages, cognitiveRoutingRuntime = undefined) {
  return [
    ...withoutCognitiveRoutingRuntimeState(messages),
    cognitiveRoutingRuntimeStateMessage(cognitiveRoutingRuntime),
  ];
}
function capabilityContext(capabilityState) {
  const sessionSuffix = (source) => (source === "session" ? " (session override)" : "");
  const interactionContract = `${capabilityState.interactionContract.effective ? "enabled" : "disabled"}${sessionSuffix(capabilityState.configSources.interactionContract)}`;
  const skills = `${capabilityState.skills.effective ? "enabled" : "disabled"}${sessionSuffix(capabilityState.configSources.skillsEnabled)}`;
  const contextVirtualization = capabilityState.contextVirtualization?.effective ? "enabled" : "disabled";
  const cognitiveRouting = capabilityState.hostSupportsCognitiveRouting ? capabilityState.cognitiveRouting : undefined;
  const cognitiveLine = cognitiveRouting
    ? `\n- Cognitive Routing: ${
        cognitiveRouting.effective
          ? "effective"
          : cognitiveRouting.enabled
            ? `blocked (${cognitiveRouting.blockingReason.code})`
            : "disabled"
      }. Configure with \`/freeflow settings\` or \`/freeflow profile auto\`; inspect with \`/freeflow status\`.`
    : "";
  return `## Freeflow Capabilities

- Interaction contract: ${interactionContract}. Configure with \`/freeflow settings\` or temporarily with \`/freeflow settings session\`; inspect with \`/freeflow status\`.
- Skills: ${skills}. Configure with \`/freeflow settings\` or temporarily with \`/freeflow settings session\`; inspect with \`/freeflow status\`.
- Context Virtualization: ${contextVirtualization}. Configure with \`/freeflow settings\`; inspect with \`/freeflow context status\`.${cognitiveLine}

Disabled capabilities are named only for status/config awareness. Capability-specific instructions and tools are active only while that capability is enabled.`;
}
function hasModelFacingCapability(capabilityState) {
  return (
    capabilityState.interactionContract.effective ||
    capabilityState.skills.effective ||
    capabilityState.contextVirtualization?.effective === true ||
    capabilityState.cognitiveRouting?.effective === true
  );
}
function modeOverlayContext(mode) {
  if (mode === "conversation") {
    return `

## Conversation Mode Boundary

Conversation mode is active and read-only.

Do not call write, edit, or mutating tools. Do not create, delete, commit, push, or change repository, system, external, or durable state.

A mutation request does not switch mode, and an execution skill does not override this boundary. Explain that conversation mode is read-only and ask the user to switch to workflow or strict-workflow.`;
  }
  if (mode === "strict-workflow") {
    return `

## Strict Workflow Overlay

Strict Workflow is active. Use the adaptive Workflow, but increase decision, evidence, verification, and checkpoint pressure at high-risk or hard-to-reverse boundaries.

For work affecting security, privacy, billing, data loss, migrations, public interfaces, compatibility, deployment, or architecture:

- stop for any user-owned choice or source conflict;
- inspect the relevant risk surface before crossing the boundary;
- select only artifacts, checkpoints, and independent review that materially reduce risk;
- verify at the affected boundary before claiming success.

Do not manufacture ceremony for low-risk, reversible work. Strict Workflow does not authorize mutation, bypass safety, or make every implementation detail a user decision.`;
  }
  return "";
}
function activeModeContext(modeState) {
  return `## Freeflow Mode State

Repository default mode: \`${modeState.repositoryDefaultMode}\` (${modeState.repositoryDefaultModeSource}).
Personal default override: \`${modeState.personalDefaultMode ?? "none"}\`.
Configured default mode: \`${modeState.defaultMode}\` (${modeSourceLabel(modeState.defaultModeSource)}).
Session mode override: \`${modeState.sessionMode ?? "none"}\`.
Resolved mode: \`${modeState.resolvedMode}\`.
Effective Freeflow mode: \`${modeState.effectiveMode}\`.

Mode behavior:
- \`conversation\`: answer, discuss, critique, and inspect read-only; require a mode change before mutating state.
- \`workflow\`: use the adaptive workflow for consequential or mutating work.
- \`strict-workflow\`: use the same workflow with stronger decision, evidence, and checkpoint pressure at high-risk or hard-to-reverse boundaries.

Task type, risk classification, and direct skill calls do not change mode. Recommend another mode when useful; the user decides.
Do not announce mode on every reply. Mention it when the user asks, configuration is discussed, or it changes the next action.${modeOverlayContext(modeState.effectiveMode)}`;
}
function inactiveModeContext(modeState) {
  return `## Freeflow Mode State

Repository default mode: \`${modeState.repositoryDefaultMode}\` (${modeState.repositoryDefaultModeSource}).
Personal default override: \`${modeState.personalDefaultMode ?? "none"}\`.
Configured default mode: \`${modeState.defaultMode}\` (${modeSourceLabel(modeState.defaultModeSource)}).
Session mode override: \`${modeState.sessionMode ?? "none"}\`.
Resolved mode: \`${modeState.resolvedMode}\` (inactive because Skills are disabled).
Effective Freeflow mode: \`none\`.

Freeflow workflow modes are dormant until Skills are enabled with \`/freeflow settings\`.`;
}
function controlPlaneContext(modeState, capabilityState) {
  return `# Freeflow Control Plane

Freeflow is enabled for this repo, but no model-facing capabilities are enabled.
These lines are status/config awareness only; do not apply Freeflow workflow behavior.

${inactiveModeContext(modeState)}

${capabilityContext(capabilityState)}

Use \`/freeflow settings\` to enable the Interaction Contract, Skills, or Context Virtualization.`;
}
export function runtimeContext(modeState, freeflowContext, capabilityState) {
  if (!capabilityState.configured) {
    return "";
  }
  if (!capabilityState.enabled) {
    return `# Freeflow Disabled

Freeflow is disabled by \`.freeflow/config.json\` for this repo. Do not apply the Freeflow Interaction Contract or workflow behavior unless the user re-enables Freeflow with \`/freeflow enable\` or \`/freeflow settings\`.

These instructions are context-loading only. They do not override user instructions, repo instructions, or host safety and approval policy.`;
  }
  if (!hasModelFacingCapability(capabilityState)) {
    return controlPlaneContext(modeState, capabilityState);
  }
  const modeText = capabilityState.skills.effective ? activeModeContext(modeState) : inactiveModeContext(modeState);
  const interactionContractText = capabilityState.interactionContract.effective
    ? `\n\n${freeflowContext.interactionContract.trim()}`
    : "";
  const contextVirtualizationText = capabilityState.contextVirtualization?.effective
    ? `\n\n## Loaded Context Virtualization Skill\n\n${freeflowContext.contextVirtualizationSkill.trim()}`
    : "";
  const cognitiveRoutingText =
    capabilityState.cognitiveRouting?.effective === true ? cognitiveRoutingContext(freeflowContext) : "";
  return `# Freeflow Runtime Context

Freeflow Pi extension loaded this before the agent turn.
Runtime delivery: confirmed for this Pi \`before_agent_start\` invocation.
These instructions are context-loading only. They do not override user instructions, repo instructions, or host safety and approval policy.

${modeText}

${capabilityContext(capabilityState)}${interactionContractText}${contextVirtualizationText}${cognitiveRoutingText}

This Pi extension loads enabled runtime context before every agent turn and routes commands only; it does not enforce policy, block tools, grant permissions, or create repo-local hooks.`;
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
    reloadRequired: key === "enabled" || key === "skillsEnabled",
    sessionOverrides: { ...currentSessionOverrides },
    capabilityState: await readCapabilityState(ctx.cwd, ctx, pi?.host),
  };
}
export async function resetSessionOverrides(ctx, pi) {
  const hadCoreOverrides = Object.keys(currentSessionOverrides).length > 0;
  const reloadRequired =
    Object.hasOwn(currentSessionOverrides, "enabled") || Object.hasOwn(currentSessionOverrides, "skillsEnabled");
  const hadModeOverride = VALID_MODES.has(currentModeOverride);
  if (hadCoreOverrides) {
    currentSessionOverrides = {};
    pi?.appendEntry?.(SESSION_OVERRIDES_ENTRY, { overrides: {} });
  }
  if (hadModeOverride) {
    await setSessionMode(null, ctx, pi);
  }
  return {
    changed: hadCoreOverrides || hadModeOverride,
    reloadRequired,
    sessionOverrides: { ...currentSessionOverrides },
    modeState: await readModeState(ctx.cwd),
  };
}
export async function setSessionMode(mode, ctx, pi) {
  const nextMode = mode === "default" || mode === "reset" || mode === null ? null : mode;
  if (nextMode !== null && !VALID_MODES.has(nextMode)) {
    throw new Error(`Invalid Freeflow mode: ${String(mode)}`);
  }
  currentModeOverride = nextMode;
  pi?.appendEntry?.(MODE_STATE_ENTRY, { currentMode: nextMode });
  return readModeState(ctx.cwd);
}
export async function handleModeCommand(args, ctx, pi) {
  const arg = args?.trim();
  const capabilityState = await readCapabilityState(ctx.cwd, ctx, pi?.host);
  const inactiveModeState = await readModeState(ctx.cwd);
  if (!capabilityState.configured) {
    setModeStatus(ctx, inactiveModeState, capabilityState);
    ctx.ui.notify(
      "Freeflow is installed but this repo is not set up. Run /setup-freeflow before changing mode.",
      "warning",
    );
    return { changed: false, error: "not_configured" };
  }
  if (!capabilityState.enabled) {
    setModeStatus(ctx, inactiveModeState, capabilityState);
    ctx.ui.notify(
      "Freeflow is disabled for this repo. Use /freeflow enable or /freeflow settings to re-enable it.",
      "warning",
    );
    return { changed: false, error: "freeflow_disabled" };
  }
  if (!capabilityState.skills.effective) {
    setModeStatus(ctx, inactiveModeState, capabilityState);
    ctx.ui.notify(
      `Freeflow modes are inactive because Skills are disabled. Configured default mode: ${inactiveModeState.defaultMode} (${modeSourceLabel(inactiveModeState.defaultModeSource)}). Enable Skills in /freeflow settings before changing mode.`,
      "warning",
    );
    return { changed: false, error: "skills_disabled" };
  }
  if (VALID_MODES.has(arg)) {
    if (inactiveModeState.effectiveMode === arg) {
      setModeStatus(ctx, inactiveModeState, capabilityState);
      const message = inactiveModeState.sessionMode
        ? `Freeflow is already in ${arg} mode for this Pi session. No session entry was added. Configured default remains ${inactiveModeState.defaultMode} (${modeSourceLabel(inactiveModeState.defaultModeSource)}).`
        : `Freeflow is already in ${arg} mode from the configured default (${modeSourceLabel(inactiveModeState.defaultModeSource)}). No session override was created.`;
      ctx.ui.notify(message, "info");
      return { changed: false, modeState: inactiveModeState };
    }
    const modeState = await setSessionMode(arg, ctx, pi);
    setModeStatus(ctx, modeState, capabilityState);
    ctx.ui.notify(
      `Freeflow mode is now ${modeState.effectiveMode} for this Pi session. Stored in Pi session history; .freeflow/local.json and .freeflow/config.json were not changed. Configured default remains ${modeState.defaultMode} (${modeSourceLabel(modeState.defaultModeSource)}).`,
      "info",
    );
    return { changed: true, modeState };
  }
  if (RESET_MODE_ARGS.has(arg) || arg === "default") {
    if (!inactiveModeState.sessionMode) {
      setModeStatus(ctx, inactiveModeState, capabilityState);
      ctx.ui.notify(
        `Freeflow is already using the configured default: ${inactiveModeState.defaultMode} (${modeSourceLabel(inactiveModeState.defaultModeSource)}). No session override is active.`,
        "info",
      );
      return { changed: false, modeState: inactiveModeState };
    }
    const modeState = await setSessionMode(null, ctx, pi);
    setModeStatus(ctx, modeState, capabilityState);
    ctx.ui.notify(
      `Freeflow mode reset to configured default: ${modeState.defaultMode} (${modeSourceLabel(modeState.defaultModeSource)}). Session override cleared; .freeflow/local.json and .freeflow/config.json were not changed.`,
      "info",
    );
    return { changed: true, modeState };
  }
  const modeState = await readModeState(ctx.cwd);
  setModeStatus(ctx, modeState, capabilityState);
  ctx.ui.notify(
    `Freeflow mode is ${modeState.effectiveMode} (${describeModeState(modeState)}). Use /freeflow mode conversation, /freeflow mode workflow, /freeflow mode strict-workflow, or /freeflow mode reset.`,
    "info",
  );
  return { changed: false, modeState, error: arg ? "invalid_mode" : undefined };
}
