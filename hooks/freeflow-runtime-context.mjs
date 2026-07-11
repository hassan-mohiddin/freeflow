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

function loadRuntimeContext(options = {}) {
  const includeSkills = options.skills === true;
  const includeOutputRouter = options.outputRouter === true;
  const includeDelegationHarness = options.delegationHarness === true;
  const runtimeKernel = includeSkills
    ? readText(path.join(PLUGIN_ROOT, "skills", "decision-gate", "references", "runtime-kernel.md"))
    : null;
  const outputRouterSkill = includeOutputRouter
    ? readText(path.join(PLUGIN_ROOT, "skills", "output-router", "SKILL.md"))
    : null;
  const delegationHarnessSkill = includeDelegationHarness
    ? readText(path.join(PLUGIN_ROOT, "skills", "delegation-harness", "SKILL.md"))
    : null;

  if (
    (includeSkills && !runtimeKernel) ||
    (includeOutputRouter && !outputRouterSkill) ||
    (includeDelegationHarness && !delegationHarnessSkill)
  ) {
    throw new Error("Freeflow runtime context files are missing.");
  }

  return { runtimeKernel, outputRouterSkill, delegationHarnessSkill };
}

function readConfig(root) {
  const configPath = path.join(root, ".freeflow", "config.json");
  const body = readText(configPath);
  if (!body) {
    return { exists: false, valid: false, configured: false, enabled: false, skillsEnabled: false, defaultMode: null, outputRouterEnabled: false, delegationHarnessEnabled: false };
  }

  try {
    const parsed = JSON.parse(body);
    const valid = isValidSetupConfig(parsed);
    const enabled = valid && parsed?.enabled !== false;
    return {
      exists: true,
      valid,
      configured: valid,
      enabled,
      skillsEnabled: enabled && parsed?.skills?.enabled !== false,
      defaultMode: VALID_MODES.has(parsed?.defaultMode) ? parsed.defaultMode : "workflow",
      outputRouterEnabled: enabled && parsed?.outputRouter?.enabled === true,
      delegationHarnessEnabled: enabled && parsed?.delegationHarness?.enabled === true,
    };
  } catch {
    return { exists: true, valid: false, configured: false, enabled: false, skillsEnabled: false, defaultMode: null, outputRouterEnabled: false, delegationHarnessEnabled: false };
  }
}

function isValidSetupConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const allowedKeys = new Set(["enabled", "defaultMode", "skills", "outputRouter", "delegationHarness", "observedRouting", "scriptTransform"]);
  if (!Object.keys(value).every((key) => allowedKeys.has(key))) {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(value, "defaultMode") && !VALID_MODES.has(value.defaultMode)) {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(value, "enabled") && typeof value.enabled !== "boolean") {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(value, "skills")) {
    if (!Boolean(value.skills) || typeof value.skills !== "object" || Array.isArray(value.skills)) {
      return false;
    }
    if (Object.prototype.hasOwnProperty.call(value.skills, "enabled") && typeof value.skills.enabled !== "boolean") {
      return false;
    }
  }

  if (Object.prototype.hasOwnProperty.call(value, "outputRouter")) {
    if (!Boolean(value.outputRouter) || typeof value.outputRouter !== "object" || Array.isArray(value.outputRouter)) {
      return false;
    }
  }

  if (Object.prototype.hasOwnProperty.call(value, "observedRouting")) {
    if (!Boolean(value.observedRouting) || typeof value.observedRouting !== "object" || Array.isArray(value.observedRouting)) {
      return false;
    }
  }

  if (Object.prototype.hasOwnProperty.call(value, "scriptTransform")) {
    if (!Boolean(value.scriptTransform) || typeof value.scriptTransform !== "object" || Array.isArray(value.scriptTransform)) {
      return false;
    }
  }

  if (Object.prototype.hasOwnProperty.call(value, "delegationHarness")) {
    if (!Boolean(value.delegationHarness) || typeof value.delegationHarness !== "object" || Array.isArray(value.delegationHarness)) {
      return false;
    }
  }

  return true;
}

function inspectSetup(root) {
  return { config: readConfig(root) };
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
    "Mode behavior:",
    "- `conversation`: answer, discuss, critique, and inspect read-only; switch modes before mutating state.",
    "- `workflow`: use the adaptive workflow for normal consequential work.",
    "- `strict-workflow`: strengthen user-owned decisions, review, and verification for high-risk or hard-to-reverse work.",
    "For mode changes or mode interpretation, use `mode-contract`.",
    "Do not announce the current mode on every reply. Mention it when the user asks, setup/config is discussed, or the mode changes the next action."
  ];
}

function buildSetupStatus(root) {
  const { config } = inspectSetup(root);
  if (!config.valid) {
    return "Setup status: Freeflow is not configured for this repo.";
  }

  return [
    `Setup status: configured by \`.freeflow/config.json\` with ${configStatus(config)}.`,
    "Runtime delivery: confirmed for this lifecycle-hook invocation.",
    ...modeGuidance(config.defaultMode)
  ].join("\n");
}

function shouldInject(eventName) {
  if (process.env.FREEFLOW_DISABLE_RUNTIME_CONTEXT === "1") {
    return false;
  }

  return eventName === "SessionStart";
}

function capabilityStatus(config) {
  return [
    "## Freeflow Capabilities",
    "",
    `- Skills: ${config.skillsEnabled ? "enabled" : "disabled"}.`,
    `- Output router: ${config.outputRouterEnabled ? "enabled" : "disabled"}.`,
    `- Delegation harness: ${config.delegationHarnessEnabled ? "enabled" : "disabled"}.`,
    "",
    "Capability-specific instructions are active only while that capability is enabled."
  ];
}

function buildContext(input) {
  const root = findWorkspaceRoot(input.cwd || process.cwd());
  const setup = inspectSetup(root);

  if (!setup.config.valid) {
    return "";
  }

  if (!setup.config.enabled) {
    return [
      "# Freeflow Disabled",
      "",
      "Freeflow is installed and configured for this repo, but `.freeflow/config.json` has `enabled: false`.",
      "Do not inject Freeflow workflow skills, output routing, delegation guidance, or setup pressure while disabled.",
      "Re-enable only if the user asks: set `.freeflow/config.json` `enabled` to true, or use `/freeflow enable` in Pi."
    ].join("\n");
  }

  const { runtimeKernel, outputRouterSkill, delegationHarnessSkill } = loadRuntimeContext({
    skills: setup.config.skillsEnabled,
    outputRouter: setup.config.outputRouterEnabled,
    delegationHarness: setup.config.delegationHarnessEnabled,
  });
  const skillSections = setup.config.skillsEnabled
    ? ["", runtimeKernel.trim()]
    : [];
  const outputRouterSection = setup.config.outputRouterEnabled
    ? [
        "",
        "## Loaded Output Router Skill",
        "```md",
        outputRouterSkill.trim(),
        "```"
      ]
    : [];
  const delegationHarnessSection = setup.config.delegationHarnessEnabled
    ? [
        "",
        "## Loaded Delegation Harness Skill",
        "```md",
        delegationHarnessSkill.trim(),
        "```"
      ]
    : [];

  return [
    "# Freeflow Runtime Context",
    "",
    "Freeflow plugin lifecycle hook loaded this at session start.",
    "These instructions are context-loading only. They do not override user instructions, repo instructions, or host safety and approval policy.",
    "",
    "## Repo Setup",
    buildSetupStatus(root),
    "",
    ...capabilityStatus(setup.config),
    ...skillSections,
    ...outputRouterSection,
    ...delegationHarnessSection
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

  const additionalContext = buildContext(input);
  if (!additionalContext.trim()) {
    return;
  }
  emitAdditionalContext(eventName, input, additionalContext);
}

try {
  main();
} catch (error) {
  process.stderr.write(`Freeflow runtime context hook skipped: ${error.message}\n`);
}
