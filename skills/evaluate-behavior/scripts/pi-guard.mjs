import {
  CONTAINER_ROUTE,
  decideToolCall,
  escapeXml,
  guardState,
  loadDeclaredContext,
  renderDeclaredContext,
} from "./guard-rules.mjs";

function buildSubjectSystemPrompt(options, declaredContext) {
  const tools = options.selectedTools ?? [];
  const toolLines = tools.map((tool) => `- ${tool}: ${options.toolSnippets?.[tool] ?? "Declared evaluation tool"}`);
  const lines = [
    "You are an expert coding assistant operating inside pi, a coding agent harness.",
    "Help the user with the task using only the tools and resources listed below.",
    "",
    "Available tools:",
    ...(toolLines.length > 0 ? toolLines : ["(none)"]),
    "",
    "Guidelines:",
    "- Use read to load a skill's SKILL.md when the task matches its description.",
    "- Resolve relative skill resources from the skill directory.",
    "- Be concise in your response.",
  ];
  const skills = (options.skills ?? []).filter((skill) => !skill.disableModelInvocation);
  if (skills.length > 0) {
    lines.push("", "<available_skills>");
    for (const skill of skills) {
      lines.push(
        "  <skill>",
        `    <name>${escapeXml(skill.name)}</name>`,
        `    <description>${escapeXml(skill.description)}</description>`,
        `    <location>${escapeXml(skill.filePath)}</location>`,
        "  </skill>",
      );
    }
    lines.push("</available_skills>");
  }
  if (declaredContext.length > 0) lines.push("", renderDeclaredContext(declaredContext));
  lines.push(`Current working directory: ${options.cwd}`);
  return lines.join("\n");
}

// "isolated" replaces the host prompt with an evaluator-owned one; "host" keeps the host's own prompt
// (and anything declared extensions compose onto it) so evidence reflects the production prompt.
function beforeAgentStartHandler(promptMode, declaredContext) {
  if (promptMode === "isolated") {
    return (event) => ({ systemPrompt: buildSubjectSystemPrompt(event.systemPromptOptions, declaredContext) });
  }
  return (event) =>
    declaredContext.length === 0
      ? undefined
      : { systemPrompt: `${event.systemPrompt}\n\n${renderDeclaredContext(declaredContext)}` };
}

export default function registerSkillEvalGuard(pi) {
  const state = guardState(process.env);
  const declaredContext = loadDeclaredContext(process.env.SKILL_EVAL_CONTEXT_MANIFEST);
  const promptMode = process.env.SKILL_EVAL_PROMPT_MODE || "isolated";
  if (promptMode !== "isolated" && promptMode !== "host") {
    throw new Error(`SKILL_EVAL_PROMPT_MODE must be isolated or host: ${promptMode}`);
  }

  pi.on("before_agent_start", beforeAgentStartHandler(promptMode, declaredContext));

  pi.on("tool_call", (event, ctx) => {
    const decision = decideToolCall(state, event.toolName, event.input, ctx.cwd, process.env);
    if (decision?.command === undefined) return decision;
    // A shell tool's command runs in the subject's container. The route extension, loaded after every other one,
    // rewrites it there, so extensions that read the command (Freeflow refuses a trailing `&` in bash) see the one
    // the model wrote. Without the route nothing would move it into the container, so the call is refused.
    if (globalThis[CONTAINER_ROUTE] !== true) {
      return { block: true, reason: "the evaluator's container route is not loaded, so this command cannot run" };
    }
    return undefined;
  });
}
