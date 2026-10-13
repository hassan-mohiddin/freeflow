// How the evaluator launches Claude Code for a subject: headless (`claude -p`) with stream-json in and out, only the
// declared tools, no settings, instructions, plugins' skills, MCP servers or slash commands from anywhere on the
// machine, the evaluator's guard as a PreToolUse hook, and the system prompt the runtime's prompt mode asks for.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadDeclaredContext, renderDeclaredContext } from "../../../guard-rules.mjs";
import { CLAUDE_CODE_TOOLS, claudeCodeModel } from "./constraints.mjs";
import { readSkill, skillListing } from "./skills.mjs";

const guardHook = fileURLToPath(new URL("../../../claude-guard.mjs", import.meta.url));

// Claude Code switches every subject gets: no automatic compaction, no updater or nonessential traffic, and no
// CLAUDE.md or memory, which the isolated config directory would not hold anyway. Retries stay at Claude Code's own
// default, which the run records with the version.
export const CLAUDE_CODE_ENVIRONMENT = Object.freeze({
  DISABLE_AUTO_COMPACT: "1",
  DISABLE_AUTOUPDATER: "1",
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1",
  CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
});

const TOOL_LINES = {
  Read: "Read a file",
  Write: "Create or overwrite a file",
  Edit: "Replace exact text in a file",
  Glob: "Find files by name pattern",
  Grep: "Search file contents",
  Bash: "Run a shell command",
};

/** The Claude Code built-ins a group's evaluator tools run as, in a stable order. */
export function hostTools(tools) {
  return [...new Set(tools.map((tool) => CLAUDE_CODE_TOOLS[tool]))];
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

/** The settings file every Claude Code process the evaluator starts reads: declared settings and the guard hook. */
export function settingsWithGuard(settings) {
  return {
    ...settings,
    hooks: {
      PreToolUse: [
        {
          matcher: "*",
          hooks: [{ type: "command", command: `${shellQuote(process.execPath)} ${shellQuote(guardHook)}` }],
        },
      ],
    },
  };
}

/** The headless arguments every Claude Code process shares; `--tools` and the prompt flags are the caller's. */
export function baseArguments({ model, thinking = null, settingsFile, session = false }) {
  const args = ["-p", "--verbose", "--output-format", "stream-json", "--input-format", "stream-json"];
  args.push("--model", claudeCodeModel(model));
  if (thinking !== null && thinking !== undefined) args.push("--effort", thinking);
  args.push("--setting-sources", "", "--settings", settingsFile);
  args.push("--strict-mcp-config", "--disable-slash-commands", "--permission-mode", "dontAsk");
  if (!session) args.push("--no-session-persistence");
  return args;
}

function isolatedPrompt(tools, listing, declaredContext, cwd) {
  const lines = [
    "You are an expert coding assistant operating inside Claude Code, a coding agent harness.",
    "Help the user with the task using only the tools and resources listed below.",
    "",
    "Available tools:",
    ...(tools.length > 0 ? tools.map((tool) => `- ${tool}: ${TOOL_LINES[tool]}`) : ["(none)"]),
    "",
    "Guidelines:",
    "- Use Read to load a skill's SKILL.md when the task matches its description.",
    "- Resolve relative skill resources from the skill directory.",
    "- Be concise in your response.",
  ];
  if (listing !== "") lines.push("", listing);
  if (declaredContext.length > 0) lines.push("", renderDeclaredContext(declaredContext));
  lines.push(`Current working directory: ${cwd}`);
  return lines.join("\n");
}

/**
 * One subject's arguments and Claude Code's own variables. "isolated" replaces Claude Code's system prompt with the
 * evaluator's; "host" keeps Claude Code's and appends the declared skills and context. Claude Code still adds its
 * own identity line and an environment note to every request; the run's host-context record shows them.
 */
export async function prepareClaudeLaunch({ group, environment, runtime, model, workspace, isolation }) {
  const directory = path.join(isolation.root, "launch");
  await mkdir(directory, { recursive: true });
  const settingsFile = path.join(directory, "settings.json");
  await writeFile(settingsFile, `${JSON.stringify(settingsWithGuard(isolation.settings ?? {}), null, 2)}\n`);

  const skills = [];
  for (const skill of environment.skills) skills.push(await readSkill(skill.path));
  const declaredContext = loadDeclaredContext(environment.contextDelivery.manifestPath);
  const tools = hostTools(group.tools);
  const listing = skillListing(skills);
  const promptFile = path.join(directory, "system-prompt.md");
  const isolated = runtime.prompt !== "host";
  const appended = [listing, declaredContext.length > 0 ? renderDeclaredContext(declaredContext) : ""]
    .filter(Boolean)
    .join("\n\n");
  if (isolated) await writeFile(promptFile, isolatedPrompt(tools, listing, declaredContext, workspace));
  else if (appended !== "") await writeFile(promptFile, appended);

  const args = baseArguments({
    model: model.model,
    thinking: model.thinking ?? null,
    settingsFile,
    session: runtime.session,
  });
  args.push("--tools", tools.join(","));
  if (isolated) args.push("--system-prompt-file", promptFile);
  else if (appended !== "") args.push("--append-system-prompt-file", promptFile);
  return { args, environment: { ...CLAUDE_CODE_ENVIRONMENT } };
}
