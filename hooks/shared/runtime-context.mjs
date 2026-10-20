import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
// The validator Pi uses, so a config is valid or invalid on every host alike.
import {
  resolveReviewSettings,
  reviewStateLine,
  selectedRuntimePrompts,
  validateLocalConfig,
  validateRepositoryConfig,
} from "../../pi-extension/dist/host/config-validation.js";

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

function resolveLayeredValue(repository, local, key, fallback) {
  if (Object.hasOwn(local, key)) return local[key];
  if (Object.hasOwn(repository, key)) return repository[key];
  return fallback;
}

function resolveCoreConfig(repository, local) {
  return { enabled: resolveLayeredValue(repository, local, "enabled", true) };
}

export function readConfig(root) {
  const repository = readConfigLayer(path.join(root, ".freeflow", "config.json"), validateRepositoryConfig);
  const local = readConfigLayer(path.join(root, ".freeflow", "local.json"), validateLocalConfig);
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
    errorPath: repository.valid ? ".freeflow/local.json" : ".freeflow/config.json",
    enabled,
    prompts: selectedRuntimePrompts(repository.parsed, local.parsed),
    review: resolveReviewSettings(repository.parsed, local.parsed),
  };
}

const PROMPT_FILES = {
  core: "core.md",
  interactionContract: "interaction-contract.md",
  workingMethod: "working-method.md",
};

/**
 * The selected prompts in Pi's order, or only `part` when a host delivers each prompt through its own hook. A selected
 * core or Interaction Contract must exist; the Working Method is optional, as on Pi.
 */
function loadRuntimeContext(selection, part) {
  const prompts = [];
  for (const [key, file] of Object.entries(PROMPT_FILES)) {
    if (!selection[key] || (part && key !== part)) continue;
    const text = readText(path.join(PLUGIN_ROOT, "runtime", "prompts", file));
    if (!text && key !== "workingMethod") throw new Error("Freeflow core runtime prompt files are missing.");
    if (text) prompts.push(text);
  }
  return prompts;
}

// The review line is Pi's, and as on Pi only a choice the user made adds it.
function runtimeStateContext(config) {
  const review = reviewStateLine(config.review);
  return ["# Freeflow Runtime State", "", "Freeflow: active", ...(review ? [review] : [])].join("\n");
}

/**
 * The session-start context for the repository at `root`: every selected prompt, or one `part` of it (`core`,
 * `interactionContract`, `workingMethod`). Claude Code caps each hook's context at 10,000 characters, so it runs one
 * hook per part. A configuration error and the Runtime State, which the core prompt refers to, travel with the core.
 */
export function renderRuntimeContext(root, part = undefined) {
  if (part !== undefined && !Object.hasOwn(PROMPT_FILES, part)) return "";
  const config = readConfig(root);
  if (!config.valid) {
    // A missing repository config means Freeflow is not set up here: stay silent. An existing invalid file is reported,
    // as Pi's status does, so Freeflow is not silently missing.
    if (!config.error || (part && part !== "core")) return "";
    return [
      "# Freeflow Configuration Error",
      "",
      `Freeflow is inactive because ${config.errorPath} is invalid: ${config.error}`,
      `Fix ${config.errorPath} or use the setup-freeflow skill, then start a new session.`,
    ].join("\n");
  }
  if (!config.enabled) return "";

  // The user chooses the prompts on hosts other than Pi; with none selected there is nothing to deliver.
  const prompts = loadRuntimeContext(config.prompts, part);
  if (config.prompts.core && (!part || part === "core")) prompts.push(runtimeStateContext(config));
  return prompts.join("\n\n");
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
  // An optional third argument names the one prompt this hook delivers.
  const additionalContext = renderRuntimeContext(root, process.argv[3]);
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
  if (!process.argv[1]) return false;
  // Compare real paths: Node resolves symlinks in import.meta.url but not in argv, and a host may run the plugin from a
  // symlinked directory (macOS /var is /private/var).
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(metaUrl));
  } catch {
    return pathToFileURL(path.resolve(process.argv[1])).href === metaUrl;
  }
}
