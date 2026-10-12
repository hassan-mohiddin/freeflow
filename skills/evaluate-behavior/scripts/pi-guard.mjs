import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

const PATH_TOOLS = new Set(["read", "write", "edit"]);
// Listing and search tools take an optional path that defaults to the working directory; an explicit path is
// confined to the readable roots like a read.
const LISTING_TOOLS = new Set(["ls", "find", "grep"]);

function parseStringArray(value) {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string") ? parsed : [];
  } catch {
    return [];
  }
}

// A declared shell (SKILL_EVAL_SHELL, set by the evaluator only for arms whose shell isolation it verified)
// is the only way bash is allowed. Its optional `workspace` is the path where the isolation shows the workspace.
function parseShell(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed !== null && typeof parsed === "object" && typeof parsed.isolation === "string" ? parsed : null;
  } catch {
    return null;
  }
}

// A path under the isolation's workspace mount (such as /workspace/src/a.js) names the same file in the host
// workspace, so it is checked there; every other path is checked as a host path.
function mapGuestPath(requested, shell, writableRoot) {
  const mount = shell?.workspace;
  if (typeof mount !== "string" || !requested.startsWith("/")) return requested;
  const normalized = path.posix.normalize(requested);
  if (normalized === mount) return writableRoot;
  if (!normalized.startsWith(`${mount}/`)) return requested;
  return path.join(writableRoot, ...normalized.slice(mount.length + 1).split("/"));
}

// The running container a container environment's bash is routed into: { name, host, workdir }.
function parseContainer(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed?.name === "string" && typeof parsed.workdir === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

function containerCommand(target, command) {
  const host = typeof target.host === "string" && target.host !== "" ? `--host ${shellQuote(target.host)} ` : "";
  return `docker ${host}exec --workdir ${shellQuote(target.workdir)} ${shellQuote(target.name)} sh -c ${shellQuote(command)}`;
}

function isContained(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
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

function loadDeclaredContext(manifestPath) {
  if (!manifestPath) return [];
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Declared context manifest cannot be read: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (manifest?.schema_version !== 1 || !Array.isArray(manifest.entries)) {
    throw new Error("Declared context manifest must use schema_version 1 and contain entries");
  }
  for (const entry of manifest.entries) {
    if (typeof entry?.declaredPath !== "string" || !Array.isArray(entry.files)) {
      throw new Error("Declared context manifest entry is malformed");
    }
    for (const file of entry.files) {
      if (
        typeof file?.path !== "string" ||
        typeof file.sha256 !== "string" ||
        typeof file.content !== "string" ||
        createHash("sha256").update(file.content).digest("hex") !== file.sha256
      ) {
        throw new Error(`Declared context file is malformed or changed: ${file?.path ?? "unknown"}`);
      }
    }
  }
  return manifest.entries;
}

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

function renderDeclaredContext(declaredContext) {
  const lines = ["<declared_context>"];
  for (const entry of declaredContext) {
    lines.push(`  <context declared-path="${escapeXml(entry.declaredPath)}">`);
    for (const file of entry.files) {
      lines.push(`    <file path="${escapeXml(file.path)}">\n${file.content}</file>`);
    }
    lines.push("  </context>");
  }
  lines.push("</declared_context>");
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
  const allowedRoots = parseStringArray(process.env.SKILL_EVAL_ALLOWED_ROOTS).map((root) => realpathSync(root));
  const writableRootValue = process.env.SKILL_EVAL_WRITABLE_ROOT;
  if (!writableRootValue) throw new Error("SKILL_EVAL_WRITABLE_ROOT is required");
  const writableRoot = realpathSync(writableRootValue);
  const allowedTools = new Set(parseStringArray(process.env.SKILL_EVAL_ALLOWED_TOOLS));
  const shell = parseShell(process.env.SKILL_EVAL_SHELL);
  const declaredContext = loadDeclaredContext(process.env.SKILL_EVAL_CONTEXT_MANIFEST);
  const promptMode = process.env.SKILL_EVAL_PROMPT_MODE || "isolated";
  if (promptMode !== "isolated" && promptMode !== "host") {
    throw new Error(`SKILL_EVAL_PROMPT_MODE must be isolated or host: ${promptMode}`);
  }

  pi.on("before_agent_start", beforeAgentStartHandler(promptMode, declaredContext));

  pi.on("tool_call", (event, ctx) => {
    if (!allowedTools.has(event.toolName)) {
      return { block: true, reason: `Tool is not declared for this evaluation: ${event.toolName}` };
    }
    if (event.toolName === "bash" && shell === null) {
      return { block: true, reason: "bash runs only in a declared shell isolation for this evaluation" };
    }
    if (event.toolName === "bash" && shell.container) {
      const target = parseContainer(process.env.SKILL_EVAL_CONTAINER);
      if (target === null) return { block: true, reason: "the container for this evaluation is not running" };
      if (typeof event.input?.command !== "string") return { block: true, reason: "bash needs a command" };
      // Pi's bash then runs only the docker client; the command itself runs in the subject's container.
      event.input.command = containerCommand(target, event.input.command);
      return undefined;
    }
    const listing = LISTING_TOOLS.has(event.toolName);
    if (!PATH_TOOLS.has(event.toolName) && !listing) return undefined;
    if (listing && event.input?.path === undefined) {
      const cwd = realpathSync(ctx.cwd);
      return allowedRoots.some((root) => isContained(root, cwd))
        ? undefined
        : { block: true, reason: `${event.toolName} needs a path inside the evaluation environment` };
    }
    if (typeof event.input?.path !== "string") {
      return { block: true, reason: `${event.toolName} requires a path inside the evaluation environment` };
    }

    const declared = event.input.path.startsWith("@") ? event.input.path.slice(1) : event.input.path;
    const requested = mapGuestPath(declared, shell, writableRoot);
    let canonical;
    try {
      canonical =
        event.toolName === "write"
          ? resolveWritablePath(ctx.cwd, requested)
          : realpathSync(path.resolve(ctx.cwd, requested));
    } catch {
      return {
        block: true,
        reason: `${event.toolName} path cannot be resolved inside the evaluation environment: ${declared}`,
      };
    }
    const roots = event.toolName === "read" || listing ? allowedRoots : [writableRoot];
    if (!roots.some((root) => isContained(root, canonical))) {
      return { block: true, reason: `${event.toolName} path escapes the evaluation environment: ${declared}` };
    }
    return undefined;
  });
}
