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
  const includeInteractionContract = options.interactionContract === true;
  const includeSkills = options.skills === true;
  const includeOutputRouter = options.outputRouter === true;
  const interactionContract = includeInteractionContract
    ? readText(path.join(PLUGIN_ROOT, "runtime", "interaction-contract.md"))
    : null;
  const workflowSkill = includeSkills
    ? readText(path.join(PLUGIN_ROOT, "skills", "workflow", "SKILL.md"))
    : null;
  const outputRouterSkill = includeOutputRouter
    ? readText(path.join(PLUGIN_ROOT, "skills", "output-router", "SKILL.md"))
    : null;

  if (
    (includeInteractionContract && !interactionContract) ||
    (includeSkills && !workflowSkill) ||
    (includeOutputRouter && !outputRouterSkill)
  ) {
    throw new Error("Freeflow runtime context files are missing.");
  }

  return { interactionContract, workflowSkill, outputRouterSkill };
}

function readConfig(root) {
  const repository = readConfigLayer(
    path.join(root, ".freeflow", "config.json"),
    isValidSetupConfig,
  );
  const local = readConfigLayer(
    path.join(root, ".freeflow", "local.json"),
    isValidLocalConfig,
  );
  const localValid = !local.exists || local.valid;
  const configured = repository.valid && localValid;
  const core = resolveCoreConfig(
    repository.valid ? repository.parsed : {},
    local.valid ? local.parsed : {},
  );
  const enabled = configured && core.config.enabled;
  const repositoryConfig = repository.valid ? repository.parsed : {};

  return {
    exists: repository.exists,
    valid: configured,
    configured,
    repositoryValid: repository.valid,
    localExists: local.exists,
    localValid,
    error: !repository.valid ? repository.error : local.error,
    enabled,
    interactionContractEnabled: enabled && core.config.interactionContract,
    skillsEnabled: enabled && core.config.skills.enabled,
    defaultMode: core.config.defaultMode,
    sources: core.sources,
    outputRouterEnabled:
      enabled && repositoryConfig?.outputRouter?.enabled === true,
  };
}

function readConfigLayer(filePath, validate) {
  if (!fs.existsSync(filePath)) {
    return { path: filePath, exists: false, valid: false, parsed: {}, error: null };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const error = validate(parsed);
    return {
      path: filePath,
      exists: true,
      valid: error === null,
      parsed: error === null ? parsed : {},
      error,
    };
  } catch (error) {
    return {
      path: filePath,
      exists: true,
      valid: false,
      parsed: {},
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateCoreConfigFields(value) {
  if (Object.prototype.hasOwnProperty.call(value, "defaultMode") && !VALID_MODES.has(value.defaultMode)) {
    return "defaultMode must be conversation, workflow, or strict-workflow";
  }
  if (Object.prototype.hasOwnProperty.call(value, "enabled") && typeof value.enabled !== "boolean") {
    return "enabled must be a boolean";
  }
  if (Object.prototype.hasOwnProperty.call(value, "interactionContract") && typeof value.interactionContract !== "boolean") {
    return "interactionContract must be a boolean";
  }
  if (Object.prototype.hasOwnProperty.call(value, "skills")) {
    if (!isRecord(value.skills)) {
      return "skills must be an object";
    }
    if (Object.prototype.hasOwnProperty.call(value.skills, "enabled") && typeof value.skills.enabled !== "boolean") {
      return "skills.enabled must be a boolean";
    }
  }
  return null;
}

function isValidSetupConfig(value) {
  if (!isRecord(value)) {
    return "repository config must be a JSON object";
  }

  const allowedKeys = new Set([
    "enabled",
    "defaultMode",
    "interactionContract",
    "skills",
    "outputRouter",
    "observedRouting",
    "scriptTransform",
  ]);
  if (!Object.keys(value).every((key) => allowedKeys.has(key))) {
    return "repository config contains unsupported top-level keys";
  }

  const coreError = validateCoreConfigFields(value);
  if (coreError) {
    return coreError;
  }

  for (const key of [
    "outputRouter",
    "observedRouting",
    "scriptTransform",
  ]) {
    if (Object.prototype.hasOwnProperty.call(value, key) && !isRecord(value[key])) {
      return `${key} must be an object`;
    }
  }
  return null;
}

function isValidLocalConfig(value) {
  if (!isRecord(value)) {
    return "local config must be a JSON object";
  }

  const allowedKeys = new Set([
    "enabled",
    "defaultMode",
    "interactionContract",
    "skills",
    "processing",
  ]);
  if (!Object.keys(value).every((key) => allowedKeys.has(key))) {
    return "local config contains unsupported top-level keys";
  }
  return validateCoreConfigFields(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function resolveLayeredValue(repository, local, key, fallback) {
  if (hasOwn(local, key)) {
    return { value: local[key], source: "local" };
  }
  if (hasOwn(repository, key)) {
    return { value: repository[key], source: "repository" };
  }
  return { value: fallback, source: "builtin" };
}

function resolveCoreConfig(repository, local) {
  const enabled = resolveLayeredValue(repository, local, "enabled", true);
  const interactionContract = resolveLayeredValue(
    repository,
    local,
    "interactionContract",
    true,
  );
  const defaultMode = resolveLayeredValue(
    repository,
    local,
    "defaultMode",
    "workflow",
  );
  const repositorySkills = isRecord(repository.skills) ? repository.skills : {};
  const localSkills = isRecord(local.skills) ? local.skills : {};
  const skillsEnabled = resolveLayeredValue(
    repositorySkills,
    localSkills,
    "enabled",
    true,
  );

  return {
    config: {
      enabled: enabled.value,
      interactionContract: interactionContract.value,
      skills: { enabled: skillsEnabled.value },
      defaultMode: defaultMode.value,
    },
    sources: {
      enabled: enabled.source,
      interactionContract: interactionContract.source,
      skillsEnabled: skillsEnabled.source,
      defaultMode: defaultMode.source,
    },
  };
}

function inspectSetup(root) {
  return { config: readConfig(root) };
}

function configStatus(config) {
  if (!config.valid) {
    return "invalid layered configuration";
  }
  const source = config.sources.defaultMode;
  const personal = config.localExists ? "; personal overrides present" : "";
  return `defaultMode \`${config.defaultMode}\` from ${source}${personal}`;
}

function modeGuidance(mode) {
  return [
    `Current Freeflow default mode: \`${mode}\`.`,
    "Treat this as the resolved default at session start, resume, clear, and compact.",
    "Mode behavior:",
    "- `conversation`: answer, discuss, critique, and inspect read-only; switch modes before mutating state.",
    "- `workflow`: use the adaptive workflow for normal consequential work.",
    "- `strict-workflow`: strengthen user-owned decisions, review, and verification for high-risk or hard-to-reverse work.",
    "Do not announce the current mode on every reply. Mention it when the user asks, setup/config is discussed, or the mode changes the next action.",
  ];
}

function buildSetupStatus(root) {
  const { config } = inspectSetup(root);
  if (!config.valid) {
    return "Setup status: Freeflow is not configured for this repo.";
  }

  const modeStatus = config.skillsEnabled
    ? modeGuidance(config.defaultMode)
    : [
        `Resolved default mode: \`${config.defaultMode}\` (dormant because Skills are disabled).`,
      ];
  return [
    `Setup status: configured by \`.freeflow/config.json\` with ${configStatus(config)}.`,
    "Runtime delivery: confirmed for this lifecycle-hook invocation.",
    ...modeStatus,
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
    `- Interaction Contract: ${config.interactionContractEnabled ? "enabled" : "disabled"}.`,
    `- Skills: ${config.skillsEnabled ? "enabled" : "disabled"}.`,
    `- Output router: ${config.outputRouterEnabled ? "enabled" : "disabled"}.`,
    "",
    "Capability-specific instructions are active only while that capability is enabled.",
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
      `Freeflow is configured for this repo, but effective \`enabled\` is false from ${setup.config.sources.enabled}.`,
      "Do not inject the Interaction Contract, Freeflow workflow skills, output routing, or setup pressure while disabled.",
      "Re-enable only if the user asks; use /freeflow settings for a personal override or /freeflow settings repo for the shared repository default in Pi.",
    ].join("\n");
  }

  const { interactionContract, workflowSkill, outputRouterSkill } = loadRuntimeContext({
    interactionContract: setup.config.interactionContractEnabled,
    skills: setup.config.skillsEnabled,
    outputRouter: setup.config.outputRouterEnabled,
  });
  const interactionSection = setup.config.interactionContractEnabled
    ? ["", interactionContract.trim()]
    : [];
  const skillSections = setup.config.skillsEnabled
    ? [
        "",
        "# Freeflow Workflow Bootstrap",
        "",
        workflowSkill.trim(),
      ]
    : [];
  const outputRouterSection = setup.config.outputRouterEnabled
    ? [
        "",
        "## Loaded Output Router Skill",
        "```md",
        outputRouterSkill.trim(),
        "```",
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
    ...interactionSection,
    ...skillSections,
    ...outputRouterSection,
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
