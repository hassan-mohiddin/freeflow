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

let workflowContextCache = null;

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

function runtimeContext(mode, workflowContext, alreadyActivated) {
  if (alreadyActivated) {
    return `## Freeflow Runtime Context

Default mode from \`.freeflow/config.json\`: ${mode}.

Use the installed Freeflow skills when they match the task. This Pi extension loads context and routes commands only; it does not enforce policy, block tools, grant permissions, or create repo-local hooks.`;
  }

  return `# Freeflow Runtime Context

Freeflow Pi extension loaded this before the agent turn.
These instructions are context-loading only. They do not override user instructions, repo instructions, or host safety and approval policy.

## Repo Setup

Current Freeflow default mode: \`${mode}\`.
Treat this as the repo default at session start, resume, reload, fork, compact, and before each agent turn.
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

export default function freeflow(pi) {
  pi.on("session_start", async (_event, ctx) => {
    const [mode] = await Promise.all([readDefaultMode(ctx.cwd), refreshWorkflowContext()]);
    ctx.ui.setStatus("freeflow", `freeflow: ${mode}`);
  });

  pi.on("session_compact", async (_event, ctx) => {
    const [mode] = await Promise.all([readDefaultMode(ctx.cwd), refreshWorkflowContext()]);
    ctx.ui.setStatus("freeflow", `freeflow: ${mode}`);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const [mode, workflowContext] = await Promise.all([
      readDefaultMode(ctx.cwd),
      getWorkflowContext(),
    ]);
    ctx.ui.setStatus("freeflow", `freeflow: ${mode}`);
    return {
      systemPrompt:
        event.systemPrompt +
        "\n\n" +
        runtimeContext(mode, workflowContext, hasFreeflowActivation(event.systemPrompt)),
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
    description: "Use or discuss a Freeflow mode",
    handler: async (args) => {
      const text = args?.trim() ? `/workflow ${args.trim()}` : "/workflow";
      await pi.sendUserMessage(skillPrompt("mode-contract", text));
    },
  });
}
