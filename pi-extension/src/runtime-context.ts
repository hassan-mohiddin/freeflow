import { readFile } from "node:fs/promises";
import { join } from "node:path";

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
  { command: "output-router", skill: "output-router" },
];

export const CONTRIBUTOR_COMMANDS = [
  "setup-freeflow",
  "write-skill",
  "evaluate-skill",
];

const MODE_STATE_ENTRY = "freeflow-mode";
const RESET_MODE_ARGS = new Set(["reset"]);

let runtimeContextCache = null;
let currentModeOverride = null;
let lastRouterConfigWarningKey = null;
let shouldInjectFullRuntimeContext = true;

export function resetRuntimeContextInjection() {
  shouldInjectFullRuntimeContext = true;
}

export function consumeRuntimeContextInjectionState() {
  const shouldInjectFull = shouldInjectFullRuntimeContext;
  shouldInjectFullRuntimeContext = false;
  return shouldInjectFull;
}

async function loadRuntimeContext() {
  const [workflowSkill, workflowMap, interviewGateSkill, discoverSkill, outputRouterSkill, outputRouterSafetyPolicy] = await Promise.all([
    readFile(new URL("../../skills/workflow/SKILL.md", import.meta.url), "utf8"),
    readFile(new URL("../../skills/workflow/references/workflow-map.md", import.meta.url), "utf8"),
    readFile(new URL("../../skills/interview-gate/SKILL.md", import.meta.url), "utf8"),
    readFile(new URL("../../skills/discover/SKILL.md", import.meta.url), "utf8"),
    readFile(new URL("../../skills/output-router/SKILL.md", import.meta.url), "utf8"),
    readFile(new URL("../../skills/output-router/references/safety-policy.md", import.meta.url), "utf8"),
  ]);

  return { workflowSkill, workflowMap, interviewGateSkill, discoverSkill, outputRouterSkill, outputRouterSafetyPolicy };
}

export async function refreshRuntimeContext() {
  runtimeContextCache = await loadRuntimeContext();
  return runtimeContextCache;
}

export async function getRuntimeContext() {
  if (runtimeContextCache) {
    return runtimeContextCache;
  }
  return refreshRuntimeContext();
}

export async function readFreeflowConfig(cwd) {
  try {
    const raw = await readFile(join(cwd, ".freeflow/config.json"), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
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

export async function readOutputRouterConfig(cwd) {
  const [parsed, localParsed] = await Promise.all([readFreeflowConfig(cwd), readFreeflowLocalConfig(cwd)]);
  const normalized = normalizeFreeflowConfig(parsed);
  const local = normalizeLocalFreeflowConfig(localParsed);
  return {
    config: normalized.config.outputRouter,
    freeflowConfig: normalized.config,
    localConfig: local.config,
    warnings: [...normalized.warnings, ...local.warnings],
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

export function setModeStatus(ctx, modeState) {
  ctx.ui.setStatus("freeflow", `freeflow: ${modeState.effectiveMode}`);
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

export function hasFreeflowActivation(systemPrompt) {
  return (
    systemPrompt.includes("## Loaded Workflow Skill") &&
    systemPrompt.includes("## Loaded Workflow Map") &&
    systemPrompt.includes("## Loaded Interview Gate Skill")
  );
}

export function hasDiscoverActivation(systemPrompt) {
  return systemPrompt.includes("## Loaded Discover Skill");
}

export function hasFreeflowPriorityActivation(systemPrompt) {
  return systemPrompt.includes("## Freeflow Runtime Priority");
}

export function hasOutputRouterActivation(systemPrompt) {
  return (
    systemPrompt.includes("## Loaded Output Router Skill") &&
    systemPrompt.includes("## Loaded Output Router Safety Policy")
  );
}

function outputRouterModeGuidance(mode) {
  if (mode === "conversation") {
    return "conversation mode: keep routed-tool guidance soft; answer questions directly.";
  }
  if (mode === "strict-workflow") {
    return "strict-workflow mode: strongest guidance; prefer exact, recoverable routed evidence for risky work.";
  }
  return "workflow mode: prefer routed tools for exploration and likely-large command output.";
}

function outputRouterContext(modeState, freeflowContext, routerConfigResult) {
  const safetyNetText =
    routerConfigResult.config.postToolRouting === "off"
      ? ""
      : "\n\nOutput-router config note: large native read/bash outputs may be vaulted and replaced with labeled routed output. Use freeflow_search with the output id to recover exact content.";

  return `## Loaded Output Router Skill

Mode guidance: ${outputRouterModeGuidance(modeState.effectiveMode)}${safetyNetText}

\`\`\`md
${freeflowContext.outputRouterSkill.trim()}
\`\`\`

## Loaded Output Router Safety Policy

\`\`\`md
${freeflowContext.outputRouterSafetyPolicy.trim()}
\`\`\``;
}

function runtimePriorityContext() {
  return `## Freeflow Runtime Priority

Priority order for matched skills:

1. Workflow classifies conversation versus consequential work.
2. Interview Gate stops silent decisions, user-owned decisions, source-truth conflicts, and question-to-action mistakes.
3. Discover handles context-building after no immediate stop condition remains. Use it before first repo/code exploration or design answers for consequential product/API/tool/runtime hypotheses.
4. Output Router chooses evidence transport after the workflow/interview/discover route is clear.`;
}

function discoverContext(freeflowContext) {
  return `## Loaded Discover Skill

\`\`\`md
${freeflowContext.discoverSkill.trim()}
\`\`\``;
}

export function runtimeContext(
  modeState,
  freeflowContext,
  routerConfigResult,
  alreadyActivated,
  routerAlreadyActivated,
  discoverAlreadyActivated,
  priorityAlreadyActivated,
) {
  const currentMode = modeState.currentMode ?? "none";
  const priorityText = priorityAlreadyActivated ? "" : `\n\n${runtimePriorityContext()}`;
  const discoverText = discoverAlreadyActivated ? "" : `\n\n${discoverContext(freeflowContext)}`;
  const routerText = routerAlreadyActivated || !routerConfigResult.config.enabled ? "" : `\n\n${outputRouterContext(modeState, freeflowContext, routerConfigResult)}`;

  if (alreadyActivated) {
    return `## Freeflow Runtime Context

Repo default mode from \`.freeflow/config.json\`: ${modeState.defaultMode}.
Current session mode override: ${currentMode}.
Effective Freeflow mode: ${modeState.effectiveMode}.

Use the installed Freeflow skills when they match the task. This Pi extension loads context and routes commands only; it does not enforce policy, block tools, grant permissions, or create repo-local hooks.${priorityText}${discoverText}${routerText}`;
  }

  return `# Freeflow Runtime Context

Freeflow Pi extension loaded this before the agent turn.
These instructions are context-loading only. They do not override user instructions, repo instructions, or host safety and approval policy.

## Repo Setup

Repo default mode from \`.freeflow/config.json\`: \`${modeState.defaultMode}\`.
Current session mode override: \`${currentMode}\`.
Effective Freeflow mode: \`${modeState.effectiveMode}\`.
Treat the effective mode as the current mode for this agent turn.
For mode changes or mode interpretation, use \`mode-contract\`.
Do not announce the current mode on every reply. Mention it when the user asks, setup/config is discussed, or the mode changes the next action.

${runtimePriorityContext()}

## Loaded Workflow Skill

\`\`\`md
${freeflowContext.workflowSkill.trim()}
\`\`\`

## Loaded Interview Gate Skill

\`\`\`md
${freeflowContext.interviewGateSkill.trim()}
\`\`\`

${discoverContext(freeflowContext)}

## Loaded Workflow Map

\`\`\`md
${freeflowContext.workflowMap.trim()}
\`\`\`

${routerText ? `${routerText.trimStart()}\n\n` : ""}This Pi extension loads context and routes commands only; it does not enforce policy, block tools, grant permissions, or create repo-local hooks.`;
}

export async function handleWorkflowCommand(args, ctx, pi) {
  const arg = args?.trim();

  if (VALID_MODES.has(arg)) {
    currentModeOverride = arg;
    pi.appendEntry?.(MODE_STATE_ENTRY, { currentMode: arg });
    const modeState = await readModeState(ctx.cwd);
    setModeStatus(ctx, modeState);
    ctx.ui.notify(
      `Freeflow mode is now ${modeState.effectiveMode} for this session. Repo default remains ${modeState.defaultMode}.`,
      "info"
    );
    return;
  }

  if (RESET_MODE_ARGS.has(arg)) {
    currentModeOverride = null;
    pi.appendEntry?.(MODE_STATE_ENTRY, { currentMode: null });
    const modeState = await readModeState(ctx.cwd);
    setModeStatus(ctx, modeState);
    ctx.ui.notify(`Freeflow mode reset to repo default: ${modeState.defaultMode}.`, "info");
    return;
  }

  const modeState = await readModeState(ctx.cwd);
  setModeStatus(ctx, modeState);
  ctx.ui.notify(
    `Freeflow mode is ${modeState.effectiveMode} (${describeModeState(modeState)}). Use /workflow conversation, /workflow workflow, /workflow strict-workflow, or /workflow reset.`,
    "info"
  );
}
