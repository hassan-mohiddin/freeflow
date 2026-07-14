import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeFreeflowConfig, normalizeLocalFreeflowConfig } from "../../router/dist/index.js";

export const VALID_MODES = new Set(["conversation", "workflow", "strict-workflow"]);

export const WORKFLOW_COMMANDS = [
  { command: "discover", skill: "discover" },
  { command: "write-spec", skill: "write-spec" },
  { command: "review-artifact", skill: "review-artifact" },
  { command: "write-plan", skill: "write-plan" },
  { command: "execute-plan", skill: "execute-plan" },
  { command: "diagnose-failure", skill: "diagnose-failure" },
  { command: "verify-work", skill: "verify-work" },
  { command: "review-work", skill: "review-work" },
  { command: "commit-work", skill: "commit-work" },
  { command: "handoff", skill: "handoff" },
  { command: "bypass", skill: "bypass" },
];

export const CONTRIBUTOR_COMMANDS = [
  "setup-freeflow",
  "write-skill",
  "evaluate-skill",
];

export const FREEFLOW_MODEL_SKILL_NAMES = [
  "bypass",
  "commit-work",
  "design-for-depth",
  "diagnose-failure",
  "discover",
  "evaluate-skill",
  "execute-plan",
  "handoff",
  "interview-gate",
  "mode-contract",
  "review-artifact",
  "review-work",
  "setup-freeflow",
  "verify-work",
  "workflow",
  "write-plan",
  "write-skill",
  "write-spec",
];

export function freeflowSkillPath(skillName) {
  return fileURLToPath(new URL(`../../skills/${skillName}/SKILL.md`, import.meta.url));
}

export function freeflowModelSkillPaths() {
  return FREEFLOW_MODEL_SKILL_NAMES.map((skillName) => freeflowSkillPath(skillName));
}

const MODE_STATE_ENTRY = "freeflow-mode";
const RESET_MODE_ARGS = new Set(["reset"]);

export const FREEFLOW_STATUS_TOOL_NAME = "freeflow_status";
export const OUTPUT_ROUTER_TOOL_NAMES = ["freeflow_search", "freeflow_run", "freeflow_batch"];

let runtimeContextCache = null;
let currentModeOverride = null;
let lastRouterConfigWarningKey = null;
async function loadRuntimeContext(capabilityState = undefined) {
  const skillsEnabled = capabilityState?.skills?.effective === true;
  const outputRouterEnabled = capabilityState?.outputRouter?.enabled === true;
  const [modeContractSkill, workflowSkill, interviewGateSkill, outputRouterSkill] = await Promise.all([
    skillsEnabled ? readFile(new URL("../../skills/mode-contract/SKILL.md", import.meta.url), "utf8") : Promise.resolve(null),
    skillsEnabled ? readFile(new URL("../../skills/workflow/SKILL.md", import.meta.url), "utf8") : Promise.resolve(null),
    skillsEnabled ? readFile(new URL("../../skills/interview-gate/SKILL.md", import.meta.url), "utf8") : Promise.resolve(null),
    outputRouterEnabled ? readFile(new URL("../../skills/output-router/SKILL.md", import.meta.url), "utf8") : Promise.resolve(null),
  ]);

  return { modeContractSkill, workflowSkill, interviewGateSkill, outputRouterSkill };
}

function runtimeContextCacheSatisfies(capabilityState) {
  if (!runtimeContextCache) {
    return false;
  }
  if (capabilityState?.skills?.effective === true && (!runtimeContextCache.modeContractSkill || !runtimeContextCache.workflowSkill || !runtimeContextCache.interviewGateSkill)) {
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

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateFreeflowConfigShape(value) {
  if (!isRecord(value)) {
    return "config must be a JSON object";
  }

  const allowedKeys = new Set(["enabled", "defaultMode", "skills", "outputRouter", "observedRouting", "scriptTransform"]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      return `unsupported top-level config key: ${key}`;
    }
  }

  if (value.defaultMode !== undefined && !VALID_MODES.has(value.defaultMode)) {
    return `invalid defaultMode: ${JSON.stringify(value.defaultMode)}`;
  }

  if (value.enabled !== undefined && typeof value.enabled !== "boolean") {
    return "enabled must be a boolean";
  }

  if (value.skills !== undefined) {
    if (!isRecord(value.skills)) {
      return "skills must be an object";
    }
    if (value.skills.enabled !== undefined && typeof value.skills.enabled !== "boolean") {
      return "skills.enabled must be a boolean";
    }
  }

  for (const key of ["outputRouter", "observedRouting", "scriptTransform"]) {
    if (value[key] !== undefined && !isRecord(value[key])) {
      return `${key} must be an object`;
    }
  }

  return null;
}

export async function readFreeflowConfigState(cwd) {
  const path = join(cwd, ".freeflow/config.json");
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    const validationError = validateFreeflowConfigShape(parsed);
    if (validationError) {
      return { path, exists: true, valid: false, parsed: {}, parseError: validationError };
    }
    return { path, exists: true, valid: true, parsed, parseError: null };
  } catch (error) {
    const code = error && typeof error === "object" ? error.code : undefined;
    if (code === "ENOENT") {
      return { path, exists: false, valid: false, parsed: {}, parseError: null };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { path, exists: true, valid: false, parsed: {}, parseError: message };
  }
}

export async function readFreeflowConfig(cwd) {
  const state = await readFreeflowConfigState(cwd);
  return state.valid ? state.parsed : {};
}

export async function readFreeflowLocalConfig(cwd) {
  try {
    const raw = await readFile(join(cwd, ".freeflow/local.json"), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function readDefaultMode(cwd) {
  const parsed = await readFreeflowConfig(cwd);
  return VALID_MODES.has(parsed.defaultMode) ? parsed.defaultMode : "workflow";
}

export async function readCapabilityState(cwd) {
  const configState = await readFreeflowConfigState(cwd);
  const parsed = configState.valid ? configState.parsed : {};
  const normalized = normalizeFreeflowConfig(parsed);
  const configured = configState.valid;
  const enabled = configured && parsed.enabled !== false;
  const skillsConfigEnabled = !isRecord(parsed.skills) || parsed.skills.enabled !== false;
  const outputRouterConfigEnabled = normalized.config.outputRouter.enabled;
  return {
    configured,
    configExists: configState.exists,
    configValid: configState.valid,
    configPath: configState.path,
    parseError: configState.parseError,
    enabled,
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
  const [configState, localParsed] = await Promise.all([readFreeflowConfigState(cwd), readFreeflowLocalConfig(cwd)]);
  const parsed = configState.valid ? configState.parsed : {};
  const normalized = normalizeFreeflowConfig(parsed);
  const local = normalizeLocalFreeflowConfig(localParsed);
  const freeflowEnabled = configState.valid && parsed.enabled !== false;
  const effectiveConfig = freeflowEnabled
    ? normalized.config
    : {
        ...normalized.config,
        outputRouter: { ...normalized.config.outputRouter, enabled: false },
        observedRouting: { ...normalized.config.observedRouting, enabled: false },
        scriptTransform: { ...normalized.config.scriptTransform, enabled: false },
      };
  const configWarnings = [...normalized.warnings];
  if (configState.exists && !configState.valid) {
    configWarnings.unshift(`.freeflow/config.json could not be parsed; Freeflow runtime is inactive. ${configState.parseError ?? ""}`.trim());
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
  const entries = ctx.sessionManager?.getEntries?.() ?? [];

  for (const entry of entries) {
    if (entry.type !== "custom" || entry.customType !== MODE_STATE_ENTRY) {
      continue;
    }

    const mode = entry.data?.currentMode;
    currentModeOverride = VALID_MODES.has(mode) ? mode : null;
  }
}

export async function readModeState(cwd) {
  const defaultMode = await readDefaultMode(cwd);
  const currentMode = VALID_MODES.has(currentModeOverride) ? currentModeOverride : null;
  return {
    defaultMode,
    currentMode,
    effectiveMode: currentMode ?? defaultMode,
  };
}

export function setModeStatus(ctx, modeState, capabilityState = undefined) {
  if (capabilityState && !capabilityState.configured) {
    ctx.ui.setStatus("freeflow", capabilityState.configExists ? "freeflow: config error" : "freeflow: setup needed");
    return;
  }
  if (capabilityState && !capabilityState.enabled) {
    ctx.ui.setStatus("freeflow", "freeflow: off");
    return;
  }

  const active: string[] = [];
  if (capabilityState?.skills.effective) {
    active.push(`${modeState.effectiveMode}${modeState.currentMode ? " (session)" : ""}`);
  }
  if (capabilityState?.outputRouter.enabled) {
    active.push("router");
  }
  ctx.ui.setStatus("freeflow", `freeflow: ${active.length > 0 ? active.join(" · ") : "idle"}`);
}

function describeModeState(modeState) {
  if (modeState.currentMode) {
    return `current ${modeState.currentMode}; default ${modeState.defaultMode}`;
  }
  return `default ${modeState.defaultMode}`;
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

function runtimePriorityContext() {
  return `## Freeflow Runtime Priority

Mode Contract handles mode setting, mode interpretation, and mode mismatch before task routing when mode is at issue.

Priority order for matched non-mode workflow skills:

1. Workflow classifies conversation versus consequential work.
2. Interview Gate stops silent decisions, user-owned decisions, source-truth conflicts, and question-to-action mistakes.
3. Discovery-light handles context-building after no immediate stop condition remains. Use it before first repo/code exploration or design answers for consequential product/API/tool/runtime hypotheses.
4. Enabled Freeflow capabilities add their own runtime guidance below.`;
}

function capabilityContext(capabilityState) {
  const skills = capabilityState.skills.effective ? "enabled" : "disabled";
  const outputRouter = capabilityState.outputRouter.enabled ? "enabled" : "disabled";
  return `## Freeflow Capabilities

- Skills: ${skills}. Configure with \`/freeflow settings\`; inspect with \`/freeflow status\`.
- Output router: ${outputRouter}. Configure with \`/freeflow settings\` or \`/output-router\`; inspect with \`/output-router status\`.

Disabled capabilities are named only for status/config awareness. Capability-specific instructions and tools are active only while that capability is enabled.`;
}

function discoveryLightContext() {
  return `## Discovery-light

For codebase exploration, brainstorming, planning direction, vague ideas, design/API/runtime questions, “should we” / “what do you think” prompts, or first steps before spec/plan/build, inspect the smallest relevant evidence, answer directly, and ask only path-changing questions. Do not create questionnaires or artifacts unless requested. Use full \`discover\` when sustained discovery, checkpointing, or routing from discovery is needed.`;
}

function modeContractContext(freeflowContext) {
  return `## Loaded Mode Contract Skill

\`\`\`md
${freeflowContext.modeContractSkill.trim()}
\`\`\``;
}

function hasModelFacingCapability(capabilityState) {
  return capabilityState.skills.effective || capabilityState.outputRouter.enabled;
}

function activeModeContext(modeState) {
  const currentMode = modeState.currentMode ?? "none";
  return `## Repo Setup

Repo default mode from \`.freeflow/config.json\`: \`${modeState.defaultMode}\`.
Current session mode override: \`${currentMode}\`.
Effective Freeflow mode: \`${modeState.effectiveMode}\`.
Do not announce the current mode on every reply. Mention it when the user asks, setup/config is discussed, or the mode changes the next action.`;
}

function inactiveModeContext(modeState) {
  return `## Repo Setup

Default mode: \`${modeState.defaultMode}\` (inactive because Skills are disabled).
Freeflow workflow modes are dormant until Skills are enabled with \`/freeflow settings\`.`;
}

function controlPlaneContext(modeState, capabilityState) {
  return `# Freeflow Control Plane

Freeflow is enabled for this repo, but no model-facing capabilities are enabled.
These lines are status/config awareness only; do not apply Freeflow workflow or output-router behavior.

${inactiveModeContext(modeState)}

${capabilityContext(capabilityState)}

Use \`/freeflow settings\` to enable Skills or Output Router. The read-only \`freeflow_status\` diagnostic may be available so the model can answer setup/status questions.`;
}

export function runtimeContext(modeState, freeflowContext, routerConfigResult, capabilityState) {
  if (!capabilityState.configured) {
    return "";
  }

  if (!capabilityState.enabled) {
    return `# Freeflow Disabled

Freeflow is disabled by \`.freeflow/config.json\` for this repo. Ignore Freeflow activation blocks and do not apply Freeflow workflow or output-router behavior unless the user re-enables Freeflow with \`/freeflow enable\` or \`/freeflow settings\`.

These instructions are context-loading only. They do not override user instructions, repo instructions, or host safety and approval policy.`;
  }

  if (!hasModelFacingCapability(capabilityState)) {
    return controlPlaneContext(modeState, capabilityState);
  }

  const modeText = capabilityState.skills.effective ? activeModeContext(modeState) : inactiveModeContext(modeState);
  const skillsText = capabilityState.skills.effective
    ? `\n\n${runtimePriorityContext()}\n\n${modeContractContext(freeflowContext)}\n\n## Loaded Workflow Skill\n\n\`\`\`md\n${freeflowContext.workflowSkill.trim()}\n\`\`\`\n\n## Loaded Interview Gate Skill\n\n\`\`\`md\n${freeflowContext.interviewGateSkill.trim()}\n\`\`\`\n\n${discoveryLightContext()}`
    : "";
  const routerText = capabilityState.outputRouter.enabled && routerConfigResult.config.enabled
    ? `\n\n${outputRouterContext(modeState, freeflowContext, routerConfigResult, capabilityState)}`
    : "";

  return `# Freeflow Runtime Context

Freeflow Pi extension loaded this before the agent turn.
These instructions are context-loading only. They do not override user instructions, repo instructions, or host safety and approval policy.

${modeText}

${capabilityContext(capabilityState)}${skillsText}${routerText}

This Pi extension loads enabled runtime context before every agent turn and routes commands only; it does not enforce policy, block tools, grant permissions, or create repo-local hooks.`;
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
    ctx.ui.notify("Freeflow is installed but this repo is not set up. Run /setup-freeflow before changing mode.", "warning");
    return { changed: false, error: "not_configured" };
  }
  if (!capabilityState.enabled) {
    setModeStatus(ctx, inactiveModeState, capabilityState);
    ctx.ui.notify("Freeflow is disabled for this repo. Use /freeflow enable or /freeflow settings to re-enable it.", "warning");
    return { changed: false, error: "freeflow_disabled" };
  }
  if (!capabilityState.skills.effective) {
    setModeStatus(ctx, inactiveModeState, capabilityState);
    ctx.ui.notify(
      `Freeflow modes are inactive because Skills are disabled. Current default mode: ${inactiveModeState.defaultMode}. Enable Skills in /freeflow settings before changing mode.`,
      "warning"
    );
    return { changed: false, error: "skills_disabled" };
  }

  if (VALID_MODES.has(arg)) {
    const modeState = await setSessionMode(arg, ctx, pi);
    setModeStatus(ctx, modeState, capabilityState);
    ctx.ui.notify(
      `Freeflow mode is now ${modeState.effectiveMode} for this session. Repo default remains ${modeState.defaultMode}.`,
      "info"
    );
    return { changed: true, modeState };
  }

  if (RESET_MODE_ARGS.has(arg) || arg === "default") {
    const modeState = await setSessionMode(null, ctx, pi);
    setModeStatus(ctx, modeState, capabilityState);
    ctx.ui.notify(`Freeflow mode reset to repo default: ${modeState.defaultMode}.`, "info");
    return { changed: true, modeState };
  }

  const modeState = await readModeState(ctx.cwd);
  setModeStatus(ctx, modeState, capabilityState);
  ctx.ui.notify(
    `Freeflow mode is ${modeState.effectiveMode} (${describeModeState(modeState)}). Use /freeflow mode conversation, /freeflow mode workflow, /freeflow mode strict-workflow, or /freeflow mode reset.`,
    "info"
  );
  return { changed: false, modeState, error: arg ? "invalid_mode" : undefined };
}
