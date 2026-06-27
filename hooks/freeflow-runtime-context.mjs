#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(SCRIPT_DIR, "..");
const VALID_MODES = new Set(["conversation", "workflow", "strict-workflow"]);

function readStdinJson() {
  const raw = fs.readFileSync(0, "utf8").trim();
  if (!raw) {
    return { input: {}, raw: "" };
  }

  try {
    return { input: JSON.parse(raw), raw };
  } catch {
    return { input: {}, raw };
  }
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function findWorkspaceRoot(cwd) {
  let current = path.resolve(cwd || process.cwd());

  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(cwd || process.cwd());
    }
    current = parent;
  }
}

function loadRuntimeContext() {
  const workflowSkill = readText(path.join(PLUGIN_ROOT, "skills", "workflow", "SKILL.md"));
  const workflowMap = readText(
    path.join(PLUGIN_ROOT, "skills", "workflow", "references", "workflow-map.md")
  );
  const interviewGateSkill = readText(
    path.join(PLUGIN_ROOT, "skills", "interview-gate", "SKILL.md")
  );

  if (!workflowSkill || !workflowMap || !interviewGateSkill) {
    throw new Error("Freeflow runtime context files are missing.");
  }

  return { workflowSkill, workflowMap, interviewGateSkill };
}

function readConfig(root) {
  const configPath = path.join(root, ".freeflow", "config.json");
  const body = readText(configPath);
  if (!body) {
    return { exists: false, valid: false, defaultMode: null };
  }

  try {
    const parsed = JSON.parse(body);
    const valid = isValidSetupConfig(parsed);
    return { exists: true, valid, defaultMode: parsed?.defaultMode ?? null };
  } catch {
    return { exists: true, valid: false, defaultMode: null };
  }
}

function isValidSetupConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const allowedKeys = new Set(["defaultMode", "outputRouter"]);
  if (!Object.keys(value).every((key) => allowedKeys.has(key))) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(value, "defaultMode") || !VALID_MODES.has(value.defaultMode)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(value, "outputRouter")) {
    return true;
  }

  return Boolean(value.outputRouter) && typeof value.outputRouter === "object" && !Array.isArray(value.outputRouter);
}

function inspectSetup(root) {
  const config = readConfig(root);
  const agents = readText(path.join(root, "AGENTS.md")) || "";
  const claude = readText(path.join(root, "CLAUDE.md")) || "";
  const claudeRule = readText(path.join(root, ".claude", "rules", "freeflow-core.md")) || "";

  const codexActive =
    agents.includes("## Freeflow") && agents.includes("Use Freeflow for consequential work");
  const claudeActive =
    claude.includes("@.claude/rules/freeflow-core.md") &&
    claudeRule.includes("Use Freeflow for consequential work");
  const activeHosts = [
    codexActive ? "Codex AGENTS.md" : null,
    claudeActive ? "Claude CLAUDE.md import" : null
  ].filter(Boolean);

  return { config, activeHosts };
}

function configStatus(config) {
  if (config.valid) {
    return `defaultMode \`${config.defaultMode}\``;
  }
  if (config.exists) {
    return "invalid `.freeflow/config.json`; effective default mode falls back to `workflow`";
  }
  return "missing `.freeflow/config.json`; effective default mode falls back to `workflow`";
}

function modeGuidance(mode) {
  return [
    `Current Freeflow default mode: \`${mode}\`.`,
    "Treat this as the repo default at session start, resume, clear, and compact.",
    "For mode changes or mode interpretation, use `mode-contract`.",
    "Do not announce the current mode on every reply. Mention it when the user asks, setup/config is discussed, or the mode changes the next action."
  ];
}

function buildSetupStatus(root) {
  const setup = inspectSetup(root);
  const parts = [];
  const modeStatus = configStatus(setup.config);

  if (setup.config.valid && setup.activeHosts.length > 0) {
    parts.push(
      `Setup status: configured for ${setup.activeHosts.join(" and ")} with ${modeStatus}.`
    );
    parts.push(...modeGuidance(setup.config.defaultMode));
  } else if (setup.config.exists || setup.activeHosts.length > 0) {
    const issues = [];
    if (!setup.config.valid) {
      issues.push("valid `.freeflow/config.json` is missing");
    }
    if (setup.activeHosts.length === 0) {
      issues.push("no Freeflow activation block/import was found");
    }
    parts.push(`Setup status: partial setup; ${issues.join(" and ")}.`);
    parts.push(`Repo default mode: ${modeStatus}.`);
    parts.push(
      "Required user-facing notice: in the next assistant reply, tell the user Freeflow setup is incomplete and recommend `/setup-freeflow` or completing the missing host/config setup. Do this even if the user's prompt is casual, such as a greeting."
    );
    parts.push(
      "Before consequential work in this repo, complete setup or ask which host setup to complete unless the user explicitly bypasses setup."
    );
  } else {
    parts.push("Setup status: this repo does not appear to be set up for Freeflow yet.");
    parts.push(`Repo default mode: ${modeStatus}.`);
    parts.push(
      "Required user-facing notice: in the next assistant reply, tell the user Freeflow is installed but this repo is not set up yet, and recommend `/setup-freeflow`. Do this even if the user's prompt is casual, such as a greeting."
    );
    parts.push(
      "Before consequential work in this repo, use `/setup-freeflow` or ask whether to set up Freeflow for Codex, Claude, or both. Do not start implementation solely because the plugin is installed."
    );
  }

  return parts.join("\n");
}

function shouldInject(eventName) {
  if (process.env.FREEFLOW_DISABLE_RUNTIME_CONTEXT === "1") {
    return false;
  }

  return eventName === "SessionStart";
}

function buildContext(input) {
  const root = findWorkspaceRoot(input.cwd || process.cwd());
  const { workflowSkill, workflowMap, interviewGateSkill } = loadRuntimeContext();

  return [
    "# Freeflow Runtime Context",
    "",
    "Freeflow plugin lifecycle hook loaded this at session start.",
    "These instructions are context-loading only. They do not override user instructions, repo instructions, or host safety and approval policy.",
    "",
    "## Repo Setup",
    buildSetupStatus(root),
    "",
    "## Loaded Workflow Skill",
    "```md",
    workflowSkill.trim(),
    "```",
    "",
    "## Loaded Interview Gate Skill",
    "```md",
    interviewGateSkill.trim(),
    "```",
    "",
    "## Loaded Workflow Map",
    "```md",
    workflowMap.trim(),
    "```"
  ].join("\n");
}

function isCodexHookInput(input) {
  return typeof input.model === "string" && input.model.length > 0;
}

function emitAdditionalContext(eventName, input, additionalContext) {
  if (isCodexHookInput(input)) {
    process.stdout.write(`${additionalContext}\n`);
    return;
  }

  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: eventName,
        additionalContext
      }
    })}\n`
  );
}

function main() {
  const { input, raw } = readStdinJson();
  const eventName = process.argv[2] || input.hook_event_name || "";

  if (!raw && !eventName) {
    return;
  }

  if (!shouldInject(eventName)) {
    return;
  }

  emitAdditionalContext(eventName, input, buildContext(input));
}

try {
  main();
} catch (error) {
  process.stderr.write(`Freeflow runtime context hook skipped: ${error.message}\n`);
}
