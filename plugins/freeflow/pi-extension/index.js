import { readFile } from "node:fs/promises";
import { join } from "node:path";

const VALID_MODES = new Set(["conversation", "workflow", "strict-workflow"]);

const WORKFLOW_COMMANDS = [
  "grill-context",
  "research-brief",
  "write-spec",
  "review-artifact",
  "write-plan",
  "execute-plan",
  "diagnose-failure",
  "verify-work",
  "review-work",
  "commit-work",
  "capture-decisions",
  "handoff",
  "bypass",
];

const CONTRIBUTOR_COMMANDS = [
  "setup-freeflow",
  "write-skill",
  "evaluate-skill",
];

const MODE_STATE_ENTRY = "freeflow-mode";
const RESET_MODE_ARGS = new Set(["reset"]);

let workflowContextCache = null;
let currentModeOverride = null;

async function loadWorkflowContext() {
  const [workflowSkill, workflowMap] = await Promise.all([
    readFile(new URL("../skills/workflow/SKILL.md", import.meta.url), "utf8"),
    readFile(new URL("../skills/workflow/references/workflow-map.md", import.meta.url), "utf8"),
  ]);

  return { workflowSkill, workflowMap };
}

async function refreshWorkflowContext() {
  workflowContextCache = await loadWorkflowContext();
  return workflowContextCache;
}

async function getWorkflowContext() {
  if (workflowContextCache) {
    return workflowContextCache;
  }
  return refreshWorkflowContext();
}

async function readDefaultMode(cwd) {
  try {
    const raw = await readFile(join(cwd, ".freeflow/config.json"), "utf8");
    const parsed = JSON.parse(raw);
    return VALID_MODES.has(parsed.defaultMode) ? parsed.defaultMode : "workflow";
  } catch {
    return "workflow";
  }
}

function restoreModeOverride(ctx) {
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

async function readModeState(cwd) {
  const defaultMode = await readDefaultMode(cwd);
  const currentMode = VALID_MODES.has(currentModeOverride) ? currentModeOverride : null;
  return {
    defaultMode,
    currentMode,
    effectiveMode: currentMode ?? defaultMode,
  };
}

function setModeStatus(ctx, modeState) {
  ctx.ui.setStatus("freeflow", `freeflow: ${modeState.effectiveMode}`);
}

function describeModeState(modeState) {
  if (modeState.currentMode) {
    return `current ${modeState.currentMode}; default ${modeState.defaultMode}`;
  }
  return `default ${modeState.defaultMode}`;
}

function skillPrompt(skill, args) {
  const trimmed = args?.trim();
  return trimmed ? `/skill:${skill}\n\n${trimmed}` : `/skill:${skill}`;
}

function hasFreeflowActivation(systemPrompt) {
  return (
    systemPrompt.includes("## Loaded Workflow Skill") &&
    systemPrompt.includes("## Loaded Workflow Map")
  );
}

function runtimeContext(modeState, workflowContext, alreadyActivated) {
  const currentMode = modeState.currentMode ?? "none";

  if (alreadyActivated) {
    return `## Freeflow Runtime Context

Repo default mode from \`.freeflow/config.json\`: ${modeState.defaultMode}.
Current session mode override: ${currentMode}.
Effective Freeflow mode: ${modeState.effectiveMode}.

Use the installed Freeflow skills when they match the task. This Pi extension loads context and routes commands only; it does not enforce policy, block tools, grant permissions, or create repo-local hooks.`;
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

## Loaded Workflow Skill

\`\`\`md
${workflowContext.workflowSkill.trim()}
\`\`\`

## Loaded Workflow Map

\`\`\`md
${workflowContext.workflowMap.trim()}
\`\`\`

This Pi extension loads context and routes commands only; it does not enforce policy, block tools, grant permissions, or create repo-local hooks.`;
}

async function handleWorkflowCommand(args, ctx, pi) {
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

export default function freeflow(pi) {
  pi.on("session_start", async (_event, ctx) => {
    restoreModeOverride(ctx);
    const [modeState] = await Promise.all([readModeState(ctx.cwd), refreshWorkflowContext()]);
    setModeStatus(ctx, modeState);
  });

  pi.on("session_compact", async (_event, ctx) => {
    const [modeState] = await Promise.all([readModeState(ctx.cwd), refreshWorkflowContext()]);
    setModeStatus(ctx, modeState);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const [modeState, workflowContext] = await Promise.all([
      readModeState(ctx.cwd),
      getWorkflowContext(),
    ]);
    setModeStatus(ctx, modeState);
    return {
      systemPrompt:
        event.systemPrompt +
        "\n\n" +
        runtimeContext(modeState, workflowContext, hasFreeflowActivation(event.systemPrompt)),
    };
  });

  for (const skill of WORKFLOW_COMMANDS) {
    pi.registerCommand(skill, {
      description: `Run Freeflow ${skill}`,
      handler: async (args) => {
        await pi.sendUserMessage(skillPrompt(skill, args));
      },
    });
  }

  for (const skill of CONTRIBUTOR_COMMANDS) {
    pi.registerCommand(skill, {
      description: `Run Freeflow ${skill}`,
      handler: async (args) => {
        await pi.sendUserMessage(skillPrompt(skill, args));
      },
    });
  }

  pi.registerCommand("workflow", {
    description: "Set or inspect the current Freeflow session mode",
    getArgumentCompletions: (prefix) => {
      const query = prefix ?? "";
      const values = ["conversation", "workflow", "strict-workflow", "reset"];
      const filtered = values.filter((value) => value.startsWith(query));
      return filtered.map((value) => ({ value, label: value }));
    },
    handler: async (args, ctx) => {
      await handleWorkflowCommand(args, ctx, pi);
    },
  });
}
