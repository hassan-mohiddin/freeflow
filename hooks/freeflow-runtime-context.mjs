#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(SCRIPT_DIR, "..");

function readStdinJson() {
  const raw = fs.readFileSync(0, "utf8").trim();
  if (!raw) return { input: {}, raw: "" };

  try {
    return { input: JSON.parse(raw), raw };
  } catch {
    return { input: {}, raw };
  }
}

function readText(filePath) {
  try {
    const text = fs.readFileSync(filePath, "utf8").trim();
    return text || null;
  } catch {
    return null;
  }
}

function findWorkspaceRoot(cwd) {
  let current = path.resolve(cwd || process.cwd());

  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) return current;

    const parent = path.dirname(current);
    if (parent === current) return path.resolve(cwd || process.cwd());
    current = parent;
  }
}

function loadRuntimeContext() {
  const corePrompt = readText(path.join(PLUGIN_ROOT, "runtime", "prompts", "core.md"));
  const interactionContract = readText(path.join(PLUGIN_ROOT, "runtime", "prompts", "interaction-contract.md"));

  if (!corePrompt || !interactionContract) {
    throw new Error("Freeflow core runtime prompt files are missing.");
  }

  return { corePrompt, interactionContract };
}

function readConfig(root) {
  const repository = readConfigLayer(path.join(root, ".freeflow", "config.json"), isValidSetupConfig);
  const local = readConfigLayer(path.join(root, ".freeflow", "local.json"), isValidLocalConfig);
  const localValid = !local.exists || local.valid;
  const configured = repository.valid && localValid;
  const core = resolveCoreConfig(repository.valid ? repository.parsed : {}, local.valid ? local.parsed : {});
  const enabled = configured && core.config.enabled;

  return {
    exists: repository.exists,
    valid: configured,
    configured,
    repositoryValid: repository.valid,
    localExists: local.exists,
    localValid,
    error: repository.valid ? local.error : repository.error,
    enabled,
    contextVirtualizationEnabled: enabled && core.config.contextVirtualization,
    conversationHistoryEnabled: enabled && core.config.conversationHistory,
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
  if (Object.hasOwn(value, "enabled") && typeof value.enabled !== "boolean") {
    return "enabled must be a boolean";
  }
  if (Object.hasOwn(value, "contextVirtualization") && typeof value.contextVirtualization !== "boolean") {
    return "contextVirtualization must be a boolean";
  }
  if (Object.hasOwn(value, "conversationHistory") && typeof value.conversationHistory !== "boolean") {
    return "conversationHistory must be a boolean";
  }
  return null;
}

function isValidSetupConfig(value) {
  if (!isRecord(value)) return "repository config must be a JSON object";

  const allowedKeys = new Set([
    "enabled",
    "contextVirtualization",
    "conversationHistory",
    "outputRouter",
    "observedRouting",
    "scriptTransform",
    "cognitiveRouting",
  ]);
  if (!Object.keys(value).every((key) => allowedKeys.has(key))) {
    return "repository config contains unsupported top-level keys";
  }

  const coreError = validateCoreConfigFields(value);
  if (coreError) return coreError;

  for (const key of ["outputRouter", "observedRouting", "scriptTransform"]) {
    if (Object.hasOwn(value, key) && !isRecord(value[key])) return `${key} must be an object`;
  }
  return null;
}

function isValidLocalConfig(value) {
  if (!isRecord(value)) return "local config must be a JSON object";

  const allowedKeys = new Set([
    "enabled",
    "processing",
    "cognitiveRouting",
    "contextVirtualization",
    "conversationHistory",
  ]);
  if (!Object.keys(value).every((key) => allowedKeys.has(key))) {
    return "local config contains unsupported top-level keys";
  }
  return validateCoreConfigFields(value);
}

function resolveLayeredValue(repository, local, key, fallback) {
  if (Object.hasOwn(local, key)) return local[key];
  if (Object.hasOwn(repository, key)) return repository[key];
  return fallback;
}

function resolveCoreConfig(repository, local) {
  return {
    config: {
      enabled: resolveLayeredValue(repository, local, "enabled", true),
      contextVirtualization: resolveLayeredValue(repository, local, "contextVirtualization", false),
      conversationHistory: resolveLayeredValue(repository, local, "conversationHistory", false),
    },
  };
}

function runtimeStateContext() {
  return ["# Freeflow Runtime State", "", "Freeflow: active"].join("\n");
}

function renderSessionStart(config) {
  if (!config.valid || !config.enabled) return "";

  const { corePrompt, interactionContract } = loadRuntimeContext();
  return [corePrompt.trim(), interactionContract.trim(), runtimeStateContext()].filter(Boolean).join("\n\n");
}

function shouldHandle(eventName) {
  if (process.env.FREEFLOW_DISABLE_RUNTIME_CONTEXT === "1") return false;
  return eventName === "SessionStart";
}

function emitAdditionalContext(eventName, additionalContext) {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: eventName,
        additionalContext,
      },
    })}\n`,
  );
}

function main() {
  const { input, raw } = readStdinJson();
  const eventName = process.argv[2] || input.hook_event_name || "";

  if ((!raw && !eventName) || !shouldHandle(eventName)) return;

  const root = findWorkspaceRoot(input.cwd || process.cwd());
  const additionalContext = renderSessionStart(readConfig(root));
  if (additionalContext.trim()) emitAdditionalContext(eventName, additionalContext);
}

try {
  main();
} catch (error) {
  process.stderr.write(`Freeflow runtime context hook skipped: ${error.message}\n`);
}
