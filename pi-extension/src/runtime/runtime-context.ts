import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeFreeflowConfig, normalizeLocalFreeflowConfig } from "../../../router/dist/index.js";

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

type SessionCoreKey = "enabled" | "interactionContract" | "skillsEnabled";
type SessionCoreOverrides = Partial<Record<SessionCoreKey, boolean>>;

const MODE_STATE_ENTRY = "freeflow-mode";
const SESSION_OVERRIDES_ENTRY = "freeflow-session-overrides";
const SESSION_CORE_KEYS = new Set<SessionCoreKey>(["enabled", "interactionContract", "skillsEnabled"]);
const RESET_MODE_ARGS = new Set(["reset"]);

export const FREEFLOW_STATUS_TOOL_NAME = "freeflow_status";
export const OUTPUT_ROUTER_TOOL_NAMES = ["freeflow_search", "freeflow_run", "freeflow_batch"];
export const WORKFLOW_BOOTSTRAP_MESSAGE_TYPE = "freeflow-workflow-bootstrap";

let runtimeContextCache = null;
let currentModeOverride = null;
let currentSessionOverrides: SessionCoreOverrides = {};
let lastRouterConfigWarningKey = null;
async function loadRuntimeContext(capabilityState = undefined) {
  const interactionContractEnabled = capabilityState?.interactionContract?.effective === true;
  const skillsEnabled = capabilityState?.skills?.effective === true;
  const outputRouterEnabled = capabilityState?.outputRouter?.enabled === true;
  const [interactionContract, workflowSkill, outputRouterSkill] = await Promise.all([
    interactionContractEnabled
      ? readFile(new URL("../../../runtime/interaction-contract.md", import.meta.url), "utf8")
      : Promise.resolve(null),
    skillsEnabled
      ? readFile(new URL("../../../skills/workflow/SKILL.md", import.meta.url), "utf8")
      : Promise.resolve(null),
    outputRouterEnabled
      ? readFile(new URL("../../../capabilities/output-router/SKILL.md", import.meta.url), "utf8")
      : Promise.resolve(null),
  ]);

  return { interactionContract, workflowSkill, outputRouterSkill };
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
  if (capabilityState?.outputRouter?.enabled === true && !runtimeContextCache.outputRouterSkill) {
    return false;
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

export function workflowBootstrapMessage(freeflowContext, capabilityState, sessionManager) {
  if (capabilityState?.skills?.effective !== true || !freeflowContext?.workflowSkill) {
    return undefined;
  }

  const alreadyLoaded = activeSessionEntries(sessionManager).some(
    (entry) => entry?.type === "custom_message" && entry?.customType === WORKFLOW_BOOTSTRAP_MESSAGE_TYPE,
  );
  if (alreadyLoaded) {
    return undefined;
  }

  return {
    customType: WORKFLOW_BOOTSTRAP_MESSAGE_TYPE,
    content: `# Freeflow Workflow Bootstrap\n\n${freeflowContext.workflowSkill.trim()}`,
    display: false,
    details: { skill: "workflow", source: "first-turn-bootstrap" },
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

  const allowedKeys = new Set([
    "enabled",
    "defaultMode",
    "interactionContract",
    "skills",
    "outputRouter",
    "observedRouting",
    "scriptTransform",
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

  const allowedKeys = new Set(["enabled", "defaultMode", "interactionContract", "skills", "processing"]);
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
  const defaultMode = resolveLayeredValue(repository, local, "defaultMode", "workflow");
  const repositorySkills = isRecord(repository.skills) ? repository.skills : {};
  const localSkills = isRecord(local.skills) ? local.skills : {};
  const skillsEnabled = resolveLayeredValue(repositorySkills, localSkills, "enabled", true);

  return {
    config: {
      enabled: enabled.value,
      interactionContract: interactionContract.value,
      skills: { enabled: skillsEnabled.value },
      defaultMode: defaultMode.value,
    },
    sources: {
      enabled: enabled.source,
      interactionContract: interactionContract.source,
      skillsEnabled: skillsEnabled.source,
      defaultMode: defaultMode.source,
    },
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
  const interactionContract = currentSessionOverrides.interactionContract;
  const skillsEnabled = currentSessionOverrides.skillsEnabled;

  return {
    config: {
      enabled: typeof enabled === "boolean" ? enabled : configured.enabled,
      interactionContract:
        typeof interactionContract === "boolean" ? interactionContract : configured.interactionContract,
      skills: { enabled: typeof skillsEnabled === "boolean" ? skillsEnabled : configured.skills.enabled },
      defaultMode: configured.defaultMode,
    },
    sources: {
      enabled: typeof enabled === "boolean" ? "session" : sources.enabled,
      interactionContract: typeof interactionContract === "boolean" ? "session" : sources.interactionContract,
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

export async function readCapabilityState(cwd) {
  const layers = await readFreeflowConfigLayers(cwd);
  const parsed = layers.repository.valid ? layers.repository.parsed : {};
  const normalized = normalizeFreeflowConfig(parsed);
  const effectiveCore = resolveSessionCoreConfig(layers);
  const enabled = layers.configured && effectiveCore.config.enabled;
  const interactionContractConfigEnabled = effectiveCore.config.interactionContract;
  const skillsConfigEnabled = effectiveCore.config.skills.enabled;
  const outputRouterConfigEnabled = normalized.config.outputRouter.enabled;
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
    outputRouter: {
      enabled: enabled && outputRouterConfigEnabled,
      configEnabled: outputRouterConfigEnabled,
    },
  };
}

export const readRuntimeState = readCapabilityState;

export async function readOutputRouterConfig(cwd) {
  const layers = await readFreeflowConfigLayers(cwd);
  const parsed = layers.repository.valid ? layers.repository.parsed : {};
  const localParsed = layers.local.valid ? layers.local.parsed : {};
  const normalized = normalizeFreeflowConfig(parsed);
  const local = normalizeLocalFreeflowConfig(localParsed);
  const freeflowEnabled = layers.configured && layers.coreConfig.enabled;
  const effectiveConfig = freeflowEnabled
    ? normalized.config
    : {
        ...normalized.config,
        outputRouter: { ...normalized.config.outputRouter, enabled: false },
        observedRouting: {
          ...normalized.config.observedRouting,
          enabled: false,
        },
        scriptTransform: {
          ...normalized.config.scriptTransform,
          enabled: false,
        },
      };
  const configWarnings = [...normalized.warnings];
  if (layers.repository.exists && !layers.repository.valid) {
    configWarnings.unshift(
      `.freeflow/config.json could not be parsed; Freeflow runtime is inactive. ${layers.repository.parseError ?? ""}`.trim(),
    );
  }
  if (layers.local.exists && !layers.local.valid) {
    configWarnings.unshift(
      `.freeflow/local.json could not be parsed; Freeflow runtime is inactive. ${layers.local.parseError ?? ""}`.trim(),
    );
  }
  return {
    config: effectiveConfig.outputRouter,
    freeflowConfig: effectiveConfig,
    localConfig: local.config,
    warnings: [...configWarnings, ...local.warnings],
  };
}

export function notifyRouterConfigWarnings(ctx, routerConfigResult) {
  if (!routerConfigResult.warnings.length) {
    return;
  }

  const key = routerConfigResult.warnings.join("\n");
  if (key === lastRouterConfigWarningKey) {
    return;
  }

  lastRouterConfigWarningKey = key;
  ctx.ui.notify(`Freeflow config warning: ${routerConfigResult.warnings.join(" ")}`, "warning");
}

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

export function setModeStatus(ctx, modeState, capabilityState = undefined) {
  if (capabilityState && !capabilityState.configured) {
    ctx.ui.setStatus("freeflow", capabilityState.configExists ? "freeflow: config error" : "freeflow: setup needed");
    return;
  }
  if (capabilityState && !capabilityState.enabled) {
    const source = capabilityState.configSources?.enabled === "session" ? " (session)" : "";
    ctx.ui.setStatus("freeflow", `freeflow: off${source}`);
    return;
  }

  const active: string[] = [];
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
  if (capabilityState?.outputRouter.enabled) {
    active.push("router");
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

function outputRouterModeGuidance(mode, skillsEnabled = true) {
  if (!skillsEnabled) {
    return "Freeflow Skills are disabled: no Freeflow workflow mode is active; apply only output-router evidence guidance.";
  }
  if (mode === "conversation") {
    return "conversation mode: keep routed-tool guidance soft; answer questions directly.";
  }
  if (mode === "strict-workflow") {
    return "strict-workflow mode: strongest guidance; prefer exact, recoverable routed evidence for risky work.";
  }
  return "workflow mode: prefer routed tools for exploration and likely-large command output.";
}

function outputRouterContext(modeState, freeflowContext, routerConfigResult, capabilityState) {
  const safetyNetText =
    routerConfigResult.config.postToolRouting === "off"
      ? ""
      : "\n\nOutput-router config note: large native read/bash outputs may be vaulted and replaced with labeled routed output. Use freeflow_search with the output id to recover exact content.";

  return `## Loaded Output Router Skill

Mode guidance: ${outputRouterModeGuidance(modeState.effectiveMode, capabilityState.skills.effective)}${safetyNetText}

\`\`\`md
${freeflowContext.outputRouterSkill.trim()}
\`\`\``;
}

function capabilityContext(capabilityState) {
  const sessionSuffix = (source) => (source === "session" ? " (session override)" : "");
  const interactionContract = `${capabilityState.interactionContract.effective ? "enabled" : "disabled"}${sessionSuffix(
    capabilityState.configSources.interactionContract,
  )}`;
  const skills = `${capabilityState.skills.effective ? "enabled" : "disabled"}${sessionSuffix(
    capabilityState.configSources.skillsEnabled,
  )}`;
  const outputRouter = capabilityState.outputRouter.enabled ? "enabled" : "disabled";
  return `## Freeflow Capabilities

- Interaction contract: ${interactionContract}. Configure with \`/freeflow settings\` or temporarily with \`/freeflow settings session\`; inspect with \`/freeflow status\`.
- Skills: ${skills}. Configure with \`/freeflow settings\` or temporarily with \`/freeflow settings session\`; inspect with \`/freeflow status\`.
- Output router: ${outputRouter}. Configure with \`/freeflow settings\` or \`/output-router\`; inspect with \`/output-router status\`.

Disabled capabilities are named only for status/config awareness. Capability-specific instructions and tools are active only while that capability is enabled.`;
}

function hasModelFacingCapability(capabilityState) {
  return (
    capabilityState.interactionContract.effective ||
    capabilityState.skills.effective ||
    capabilityState.outputRouter.enabled
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
These lines are status/config awareness only; do not apply Freeflow workflow or output-router behavior.

${inactiveModeContext(modeState)}

${capabilityContext(capabilityState)}

Use \`/freeflow settings\` to enable the Interaction Contract, Skills, or Output Router. The read-only \`freeflow_status\` diagnostic may be available so the model can answer setup/status questions.`;
}

export function runtimeContext(modeState, freeflowContext, routerConfigResult, capabilityState) {
  if (!capabilityState.configured) {
    return "";
  }

  if (!capabilityState.enabled) {
    return `# Freeflow Disabled

Freeflow is disabled by \`.freeflow/config.json\` for this repo. Do not apply the Freeflow Interaction Contract, workflow, or output-router behavior unless the user re-enables Freeflow with \`/freeflow enable\` or \`/freeflow settings\`.

These instructions are context-loading only. They do not override user instructions, repo instructions, or host safety and approval policy.`;
  }

  if (!hasModelFacingCapability(capabilityState)) {
    return controlPlaneContext(modeState, capabilityState);
  }

  const modeText = capabilityState.skills.effective ? activeModeContext(modeState) : inactiveModeContext(modeState);
  const interactionContractText = capabilityState.interactionContract.effective
    ? `\n\n${freeflowContext.interactionContract.trim()}`
    : "";
  const routerText =
    capabilityState.outputRouter.enabled && routerConfigResult.config.enabled
      ? `\n\n${outputRouterContext(modeState, freeflowContext, routerConfigResult, capabilityState)}`
      : "";

  return `# Freeflow Runtime Context

Freeflow Pi extension loaded this before the agent turn.
Runtime delivery: confirmed for this Pi \`before_agent_start\` invocation.
These instructions are context-loading only. They do not override user instructions, repo instructions, or host safety and approval policy.

${modeText}

${capabilityContext(capabilityState)}${interactionContractText}${routerText}

This Pi extension loads enabled runtime context before every agent turn and routes commands only; it does not enforce policy, block tools, grant permissions, or create repo-local hooks.`;
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
  pi?.appendEntry?.(SESSION_OVERRIDES_ENTRY, { overrides: { ...currentSessionOverrides } });
  return {
    changed: true,
    reloadRequired: key === "enabled" || key === "skillsEnabled",
    sessionOverrides: { ...currentSessionOverrides },
    capabilityState: await readCapabilityState(ctx.cwd),
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
  const capabilityState = await readCapabilityState(ctx.cwd);
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
