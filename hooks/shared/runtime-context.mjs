import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = path.resolve(SCRIPT_DIR, "../..");

export function readHookInput() {
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

export function findWorkspaceRoot(cwd) {
  let current = path.resolve(cwd || process.cwd());

  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) return current;

    const parent = path.dirname(current);
    if (parent === current) return path.resolve(cwd || process.cwd());
    current = parent;
  }
}

function readConfigLayer(filePath, validate) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, valid: false, parsed: {}, error: null };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const error = validate(parsed);
    return {
      exists: true,
      valid: error === null,
      parsed: error === null ? parsed : {},
      error,
    };
  } catch (error) {
    return {
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
    enabled: resolveLayeredValue(repository, local, "enabled", true),
    contextVirtualization: resolveLayeredValue(repository, local, "contextVirtualization", false),
    conversationHistory: resolveLayeredValue(repository, local, "conversationHistory", false),
  };
}

export function readConfig(root) {
  const repository = readConfigLayer(path.join(root, ".freeflow", "config.json"), isValidSetupConfig);
  const local = readConfigLayer(path.join(root, ".freeflow", "local.json"), isValidLocalConfig);
  const localValid = !local.exists || local.valid;
  const configured = repository.valid && localValid;
  const core = resolveCoreConfig(repository.valid ? repository.parsed : {}, local.valid ? local.parsed : {});
  const enabled = configured && core.enabled;

  return {
    exists: repository.exists,
    valid: configured,
    configured,
    repositoryValid: repository.valid,
    localExists: local.exists,
    localValid,
    error: repository.valid ? local.error : repository.error,
    enabled,
    contextVirtualizationEnabled: enabled && core.contextVirtualization,
    conversationHistoryEnabled: enabled && core.conversationHistory,
  };
}

function loadRuntimeContext() {
  const corePrompt = readText(path.join(PLUGIN_ROOT, "runtime", "prompts", "core.md"));
  const interactionContract = readText(path.join(PLUGIN_ROOT, "runtime", "prompts", "interaction-contract.md"));

  if (!corePrompt || !interactionContract) {
    throw new Error("Freeflow core runtime prompt files are missing.");
  }

  return { corePrompt, interactionContract };
}

function runtimeStateContext() {
  return ["# Freeflow Runtime State", "", "Freeflow: active"].join("\n");
}

export function renderRuntimeContext(root) {
  const config = readConfig(root);
  if (!config.valid || !config.enabled) return "";

  const { corePrompt, interactionContract } = loadRuntimeContext();
  return [corePrompt, interactionContract, runtimeStateContext()].filter(Boolean).join("\n\n");
}

export function emitHookOutput(output) {
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

export function runSessionStartAdapter({ eventNames, getWorkspaceCwd, formatOutput }) {
  const { input, raw } = readHookInput();
  const eventName = process.argv[2] || input.hook_event_name || "";
  if ((!raw && !eventName) || process.env.FREEFLOW_DISABLE_RUNTIME_CONTEXT === "1") return;
  if (!eventNames.includes(eventName)) return;

  const root = findWorkspaceRoot(getWorkspaceCwd(input));
  const additionalContext = renderRuntimeContext(root);
  if (additionalContext.trim()) {
    emitHookOutput(formatOutput({ eventName, input, additionalContext }));
  }
}

export function runSafely(run) {
  try {
    run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Freeflow runtime context hook skipped: ${message}\n`);
  }
}

export function isMainModule(metaUrl) {
  return process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === metaUrl;
}
