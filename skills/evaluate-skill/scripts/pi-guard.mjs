import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";

const PATH_TOOLS = new Set(["read", "write", "edit"]);

function parseStringArray(value) {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string") ? parsed : [];
  } catch {
    return [];
  }
}

function isContained(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveWritablePath(cwd, requested) {
  const absolute = path.resolve(cwd, requested);
  /** @type {string[]} */
  const missingSegments = [];
  let candidate = absolute;
  while (true) {
    try {
      return path.join(realpathSync(candidate), ...missingSegments);
    } catch {
      try {
        lstatSync(candidate);
        throw new Error(`Existing writable path cannot be resolved: ${requested}`);
      } catch (error) {
        if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") throw error;
      }
      const parent = path.dirname(candidate);
      if (parent === candidate) throw new Error(`Cannot resolve writable path: ${requested}`);
      missingSegments.unshift(path.basename(candidate));
      candidate = parent;
    }
  }
}

function escapeXml(value) {
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
  return value.replace(/[&<>"']/g, (character) => entities[character]);
}

function buildSubjectSystemPrompt(options) {
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
  lines.push(`Current working directory: ${options.cwd}`);
  return lines.join("\n");
}

export default function registerSkillEvalGuard(pi) {
  const allowedRoots = parseStringArray(process.env.SKILL_EVAL_ALLOWED_ROOTS).map((root) => realpathSync(root));
  const writableRootValue = process.env.SKILL_EVAL_WRITABLE_ROOT;
  if (!writableRootValue) throw new Error("SKILL_EVAL_WRITABLE_ROOT is required");
  const writableRoot = realpathSync(writableRootValue);
  const allowedTools = new Set(parseStringArray(process.env.SKILL_EVAL_ALLOWED_TOOLS));

  pi.on("before_agent_start", (event) => ({
    systemPrompt: buildSubjectSystemPrompt(event.systemPromptOptions),
  }));

  pi.on("tool_call", (event, ctx) => {
    if (!allowedTools.has(event.toolName)) {
      return { block: true, reason: `Tool is not declared for this evaluation: ${event.toolName}` };
    }
    if (!PATH_TOOLS.has(event.toolName)) return undefined;
    if (typeof event.input?.path !== "string") {
      return { block: true, reason: `${event.toolName} requires a path inside the evaluation environment` };
    }

    const requested = event.input.path.startsWith("@") ? event.input.path.slice(1) : event.input.path;
    let canonical;
    try {
      canonical =
        event.toolName === "write"
          ? resolveWritablePath(ctx.cwd, requested)
          : realpathSync(path.resolve(ctx.cwd, requested));
    } catch {
      return {
        block: true,
        reason: `${event.toolName} path cannot be resolved inside the evaluation environment: ${requested}`,
      };
    }
    const roots = event.toolName === "read" ? allowedRoots : [writableRoot];
    if (!roots.some((root) => isContained(root, canonical))) {
      return { block: true, reason: `${event.toolName} path escapes the evaluation environment: ${requested}` };
    }
    return undefined;
  });
}
