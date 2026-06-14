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
    systemPrompt.includes("Move forward when context is sufficient") &&
    systemPrompt.includes("Verify before completion claims")
  );
}

function runtimeContext(mode, alreadyActivated) {
  if (alreadyActivated) {
    return `## Freeflow Runtime Context

Default mode from \`.freeflow/config.json\`: ${mode}.

Use the installed Freeflow skills when they match the task. This Pi extension loads context and routes commands only; it does not enforce policy, block tools, grant permissions, or create repo-local hooks.`;
  }

  return `## Freeflow

Use Freeflow for consequential work. Default mode: ${mode}.

Move forward when context is sufficient. Re-enter clarification when new ambiguity would change the next action.

Ask before user-owned decisions: product behavior, scope, public APIs, security, privacy, billing, data loss, compatibility, permissions, or irreversible architecture.

Treat live repo evidence and existing docs/tests as source truth. If the user request conflicts with them, stop and ask before changing behavior.

Verify before completion claims. Capture only stable decisions, glossary terms, ADR-worthy tradeoffs, or useful handoff memory.

This Pi extension loads context and routes commands only; it does not enforce policy, block tools, grant permissions, or create repo-local hooks.`;
}

export default function freeflow(pi) {
  pi.on("session_start", async (_event, ctx) => {
    const mode = await readDefaultMode(ctx.cwd);
    ctx.ui.setStatus("freeflow", `freeflow: ${mode}`);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const mode = await readDefaultMode(ctx.cwd);
    ctx.ui.setStatus("freeflow", `freeflow: ${mode}`);
    return {
      systemPrompt:
        event.systemPrompt +
        "\n\n" +
        runtimeContext(mode, hasFreeflowActivation(event.systemPrompt)),
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
