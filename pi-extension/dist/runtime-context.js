import { mkdir, readFile, writeFile } from "node:fs/promises";
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
];
export const CONTRIBUTOR_COMMANDS = [
    "setup-freeflow",
    "write-skill",
    "evaluate-skill",
];
const MODE_STATE_ENTRY = "freeflow-mode";
const RESET_MODE_ARGS = new Set(["reset"]);
export const OUTPUT_ROUTER_TOOL_NAMES = ["freeflow_search", "freeflow_run", "freeflow_batch"];
export const DELEGATION_HARNESS_ENV_FLAG = "FREEFLOW_DELEGATION_HARNESS_ENABLED";
let runtimeContextCache = null;
let currentModeOverride = null;
let lastRouterConfigWarningKey = null;
async function loadRuntimeContext(capabilityState = undefined) {
    const outputRouterEnabled = capabilityState?.outputRouter?.enabled === true;
    const delegationHarnessEnabled = capabilityState?.delegationHarness?.enabled === true;
    const [modeContractSkill, workflowSkill, interviewGateSkill, outputRouterSkill, delegationHarnessSkill] = await Promise.all([
        readFile(new URL("../../skills/mode-contract/SKILL.md", import.meta.url), "utf8"),
        readFile(new URL("../../skills/workflow/SKILL.md", import.meta.url), "utf8"),
        readFile(new URL("../../skills/interview-gate/SKILL.md", import.meta.url), "utf8"),
        outputRouterEnabled ? readFile(new URL("../../skills/output-router/SKILL.md", import.meta.url), "utf8") : Promise.resolve(null),
        delegationHarnessEnabled ? readFile(new URL("../../skills/delegation-harness/SKILL.md", import.meta.url), "utf8") : Promise.resolve(null),
    ]);
    return { modeContractSkill, workflowSkill, interviewGateSkill, outputRouterSkill, delegationHarnessSkill };
}
function runtimeContextCacheSatisfies(capabilityState) {
    if (!runtimeContextCache) {
        return false;
    }
    if (capabilityState?.outputRouter?.enabled === true && !runtimeContextCache.outputRouterSkill) {
        return false;
    }
    if (capabilityState?.delegationHarness?.enabled === true && !runtimeContextCache.delegationHarnessSkill) {
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
export async function readFreeflowConfig(cwd) {
    try {
        const raw = await readFile(join(cwd, ".freeflow/config.json"), "utf8");
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    }
    catch {
        return {};
    }
}
export async function readFreeflowLocalConfig(cwd) {
    try {
        const raw = await readFile(join(cwd, ".freeflow/local.json"), "utf8");
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    }
    catch {
        return {};
    }
}
async function readDefaultMode(cwd) {
    const parsed = await readFreeflowConfig(cwd);
    return VALID_MODES.has(parsed.defaultMode) ? parsed.defaultMode : "workflow";
}
export async function readCapabilityState(cwd) {
    const parsed = await readFreeflowConfig(cwd);
    const normalized = normalizeFreeflowConfig(parsed);
    return {
        outputRouter: {
            enabled: normalized.config.outputRouter.enabled,
        },
        delegationHarness: {
            enabled: parsed?.delegationHarness?.enabled === true || process.env[DELEGATION_HARNESS_ENV_FLAG] === "1",
            configEnabled: parsed?.delegationHarness?.enabled === true,
            envEnabled: process.env[DELEGATION_HARNESS_ENV_FLAG] === "1",
        },
    };
}
async function writeCapabilityEnabled(cwd, capability, enabled) {
    const parsed = await readFreeflowConfig(cwd);
    const next = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { ...parsed } : {};
    if (capability === "outputRouter") {
        const current = next.outputRouter && typeof next.outputRouter === "object" && !Array.isArray(next.outputRouter) ? next.outputRouter : {};
        next.outputRouter = { ...current, enabled };
    }
    else if (capability === "delegationHarness") {
        const current = next.delegationHarness && typeof next.delegationHarness === "object" && !Array.isArray(next.delegationHarness) ? next.delegationHarness : {};
        next.delegationHarness = { ...current, enabled };
    }
    else {
        throw new Error(`Unsupported Freeflow capability: ${capability}`);
    }
    await mkdir(join(cwd, ".freeflow"), { recursive: true });
    await writeFile(join(cwd, ".freeflow/config.json"), `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return next;
}
function capabilityCommandUsage(command) {
    return `Usage: /${command}, /${command} settings, or /${command} status`;
}
function capabilityLabel(capability) {
    return capability === "outputRouter" ? "Output router" : "Delegation harness";
}
function capabilityEnabledFromState(state, capability) {
    return capability === "outputRouter" ? state.outputRouter.enabled : state.delegationHarness.enabled;
}
export async function handleCapabilityCommand(capability, args, ctx) {
    const command = capability === "outputRouter" ? "output-router" : "delegation-harness";
    const action = (args ?? "status").trim().toLowerCase() || "status";
    const state = await readCapabilityState(ctx.cwd);
    if (["status", "enabled", "disabled"].includes(action)) {
        const enabled = capabilityEnabledFromState(state, capability);
        ctx.ui.notify(`${capabilityLabel(capability)} is ${enabled ? "enabled" : "disabled"}. ${capabilityCommandUsage(command)}.`, "info");
        return { changed: false, enabled };
    }
    if (["enable", "on", "true"].includes(action) || ["disable", "off", "false"].includes(action)) {
        const enabled = ["enable", "on", "true"].includes(action);
        await writeCapabilityEnabled(ctx.cwd, capability, enabled);
        ctx.ui.notify(`${capabilityLabel(capability)} ${enabled ? "enabled" : "disabled"}. Reloading Freeflow runtime...`, "info");
        if (typeof ctx.reload === "function") {
            await ctx.reload();
            return { changed: true, enabled, reloaded: true };
        }
        ctx.ui.notify(`Run /reload for ${capabilityLabel(capability).toLowerCase()} changes to fully apply.`, "warning");
        return { changed: true, enabled, reloaded: false };
    }
    ctx.ui.notify(capabilityCommandUsage(command), "warning");
    return { changed: false, enabled: capabilityEnabledFromState(state, capability), error: "invalid_action" };
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
    const safetyNetText = routerConfigResult.config.postToolRouting === "off"
        ? ""
        : "\n\nOutput-router config note: large native read/bash outputs may be vaulted and replaced with labeled routed output. Use freeflow_search with the output id to recover exact content.";
    return `## Loaded Output Router Skill

Mode guidance: ${outputRouterModeGuidance(modeState.effectiveMode)}${safetyNetText}

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
    const outputRouter = capabilityState.outputRouter.enabled ? "enabled" : "disabled";
    const delegationHarness = capabilityState.delegationHarness.enabled ? "enabled" : "disabled";
    return `## Freeflow Capabilities

- Output router: ${outputRouter}. Configure with \`/output-router\`; inspect with \`/output-router status\`.
- Delegation harness: ${delegationHarness}. Configure with \`/delegation-harness\`; inspect with \`/delegation-harness status\`.

Capability-specific instructions and tools are active only while that capability is enabled.`;
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
export function runtimeContext(modeState, freeflowContext, routerConfigResult, capabilityState) {
    const currentMode = modeState.currentMode ?? "none";
    const routerText = capabilityState.outputRouter.enabled && routerConfigResult.config.enabled
        ? `\n\n${outputRouterContext(modeState, freeflowContext, routerConfigResult)}`
        : "";
    const delegationText = capabilityState.delegationHarness.enabled
        ? `\n\n## Loaded Delegation Harness Skill\n\n\`\`\`md\n${freeflowContext.delegationHarnessSkill.trim()}\n\`\`\``
        : "";
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

${capabilityContext(capabilityState)}

${modeContractContext(freeflowContext)}

## Loaded Workflow Skill

\`\`\`md
${freeflowContext.workflowSkill.trim()}
\`\`\`

## Loaded Interview Gate Skill

\`\`\`md
${freeflowContext.interviewGateSkill.trim()}
\`\`\`

${discoveryLightContext()}

${routerText ? `${routerText.trimStart()}\n\n` : ""}${delegationText ? `${delegationText.trimStart()}\n\n` : ""}This Pi extension loads core runtime context before every agent turn and routes commands only; it does not enforce policy, block tools, grant permissions, or create repo-local hooks.`;
}
export async function handleWorkflowCommand(args, ctx, pi) {
    const arg = args?.trim();
    if (VALID_MODES.has(arg)) {
        currentModeOverride = arg;
        pi.appendEntry?.(MODE_STATE_ENTRY, { currentMode: arg });
        const modeState = await readModeState(ctx.cwd);
        setModeStatus(ctx, modeState);
        ctx.ui.notify(`Freeflow mode is now ${modeState.effectiveMode} for this session. Repo default remains ${modeState.defaultMode}.`, "info");
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
    ctx.ui.notify(`Freeflow mode is ${modeState.effectiveMode} (${describeModeState(modeState)}). Use /workflow conversation, /workflow workflow, /workflow strict-workflow, or /workflow reset.`, "info");
}
