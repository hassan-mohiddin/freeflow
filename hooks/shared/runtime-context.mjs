import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
// The validator and reader Pi uses, so a config reads the same on every host: a file's settings it cannot use are
// ignored and named, and the rest stays (D-045). The settings live in the Freeflow home (D-060).
import {
  HARNESSES,
  harnessNamed,
  ignoredStateLine,
  selectedRuntimePrompts,
  settingsForHarness,
  skillsOff,
  skillsStateLine,
} from "../../pi-extension/dist/host/config-validation.js";
import {
  HOME_FILES,
  LEGACY_FILES,
  cloneJson,
  freeflowHome,
  readConfigFile,
  readSessionSettings,
  sessionId,
  sessionValuesForHarness,
  setPath,
} from "../../pi-extension/dist/host/config-store.js";

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

function resolveLayeredValue(repository, local, key, fallback) {
  if (Object.hasOwn(local, key)) return local[key];
  if (Object.hasOwn(repository, key)) return repository[key];
  return fallback;
}

function resolveCoreConfig(repository, local) {
  return { enabled: resolveLayeredValue(repository, local, "enabled", true) };
}

/**
 * The session this hook runs in, as the settings script names it (Claude Code's session ID, else a layer's
 * FREEFLOW_SESSION), else the session the hook's input names; null when none is named.
 */
export function hookSessionId(input = {}, env = process.env) {
  return (
    sessionId(env) ?? sessionId({ FREEFLOW_SESSION: typeof input.session_id === "string" ? input.session_id : "" })
  );
}

/**
 * The personal layer with the session's own values over it: Session, then Personal, then Repository, as on Pi. The
 * session's values live in the Freeflow home, written by the settings script, and are read again on resume, /clear and
 * compaction; a new session has none.
 */
function withSession(local, session) {
  const keys = Object.keys(session);
  if (keys.length === 0) return local;
  const merged = cloneJson(local);
  for (const key of keys) setPath(merged, key.split("."), session[key]);
  return merged;
}

/** The harness this process runs for: FREEFLOW_HARNESS when it names one (a driver's name, such as "Pi", included), else Claude Code when its session is named; or null. */
export function harnessFromEnv(env = process.env) {
  const named = harnessNamed(env.FREEFLOW_HARNESS);
  if (HARNESSES.includes(named)) return named;
  return env.CLAUDE_CODE_SESSION_ID ? "claude-code" : null;
}

/** The repository's own config files, which no layer reads (D-060): each is named until the settings doctor moves it. */
function legacyIgnored(root) {
  return ["repository", "personal"]
    .filter((scope) => fs.existsSync(path.join(root, LEGACY_FILES[scope])))
    .map((scope) => ({
      key: null,
      reason: "moved to This folder: run settings.mjs doctor --fix to move it",
      file: LEGACY_FILES[scope],
    }));
}

/**
 * The settings for a folder as one harness reads them: the everywhere and this-folder layers in the Freeflow home, the
 * session's values over them, each harness's ticks over the layer's general values. Nothing here needs a file: with none,
 * the defaults apply (installed means on, D-060). A setting a layer ignores is named, and the rest is used (D-045).
 */
export function readConfig(root, { session = null, env = process.env, harness = harnessFromEnv(env) } = {}) {
  const home = freeflowHome(env);
  const repository = readConfigFile(root, "repository", home);
  const personal = readConfigFile(root, "personal", home);
  const repositoryValues = settingsForHarness(repository.value, harness);
  const local = withSession(
    settingsForHarness(personal.value, harness),
    sessionValuesForHarness(readSessionSettings(home, session), harness),
  );
  const core = resolveCoreConfig(repositoryValues, local);
  const ignored = [
    ...repository.ignored.map((item) => ({ ...item, file: HOME_FILES.repository })),
    ...personal.ignored.map((item) => ({ ...item, file: HOME_FILES.personal })),
    ...legacyIgnored(root),
  ];

  return {
    home,
    enabled: core.enabled,
    ignored,
    prompts: selectedRuntimePrompts(repositoryValues, local),
    skillsOff: skillsOff(repositoryValues, local),
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

// The skills line is Pi's, and as on Pi only a choice the user made adds it. This host loads plugin
// skills itself, so the skills line is how an off skill reaches the agent here. With the core prompt off, which the
// Runtime State belongs to, the lines still come when there are any: the rest of Freeflow stays on.
function runtimeStateContext(config, firstSession) {
  const lines = [firstSession, skillsStateLine(config.skillsOff), ignoredStateLine(config.ignored)].filter(Boolean);
  if (!config.prompts.core && lines.length === 0) return null;
  return ["# Freeflow Runtime State", "", "Freeflow: active", ...lines].join("\n");
}

/**
 * The line that reaches the agent once per user, at the first session (D-060): what Freeflow does here and where its guide
 * is. It is written once, by the first session that renders it, as a marker in the Freeflow home; the home is created then.
 * Null when the line was given before, or when the marker cannot be written (the line is then left out).
 */
export function firstSessionLine(home, { guide = path.join(PLUGIN_ROOT, "plugin-docs", "using-freeflow.md") } = {}) {
  const marker = path.join(home, "first-session.json");
  if (fs.existsSync(marker)) return null;
  try {
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(marker, `${JSON.stringify({ at: new Date().toISOString() })}\n`, "utf8");
  } catch {
    return null;
  }
  return `Freeflow is installed and on in every folder with its defaults: no setup is needed. Your settings and rules are kept in the Freeflow home (${home}). The guide is ${guide}; settings are \`/freeflow settings\` on Claude Code, and the settings script on other hosts.`;
}

/**
 * The session-start context for the repository at `root`: every selected prompt, or one `part` of it (`core`,
 * `interactionContract`, `workingMethod`). Claude Code caps each hook's context at 10,000 characters, so it runs one
 * hook per part. The Runtime State, which the core prompt refers to, travels with the core.
 */
export function renderRuntimeContext(
  root,
  part = undefined,
  { session = null, env = process.env, harness = harnessFromEnv(env) } = {},
) {
  if (part !== undefined && !Object.hasOwn(PROMPT_FILES, part)) return "";
  const config = readConfig(root, { session, env, harness });
  // Installed means on (D-060): Freeflow runs in every folder with its defaults, and only a setting that turns it off
  // silences it. Settings a layer ignores are named by the Runtime State, and the rest stays (D-045).
  if (!config.enabled) return "";

  // The user chooses the prompts on hosts other than Pi; with none selected there is nothing to deliver.
  const prompts = loadRuntimeContext(config.prompts, part);
  const firstSession = !part || part === "core" ? firstSessionLine(config.home) : null;
  const state = !part || part === "core" ? runtimeStateContext(config, firstSession) : null;
  if (state) prompts.push(state);
  return prompts.join("\n\n");
}

export function emitHookOutput(output) {
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

export function runSessionStartAdapter({ eventNames, getWorkspaceCwd, formatOutput, harness = null }) {
  const { input, raw } = readHookInput();
  const eventName = process.argv[2] || input.hook_event_name || "";
  if ((!raw && !eventName) || process.env.FREEFLOW_DISABLE_RUNTIME_CONTEXT === "1") return;
  if (!eventNames.includes(eventName)) return;

  const root = findWorkspaceRoot(getWorkspaceCwd(input));
  // An optional third argument names the one prompt this hook delivers.
  const additionalContext = renderRuntimeContext(root, process.argv[3], { session: hookSessionId(input), harness });
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

/**
 * What Claude Code's session-start hooks deliver, one entry per hook in `hooks/claude/hooks.json`'s order (`core`,
 * `interactionContract`, `workingMethod`), each the text that hook prints or "" when it prints nothing. Claude Code's mod
 * pins them, joined, as one system prompt section, and knows each hook's text by it (SPEC-013).
 */
export function hookParts(root, { session = null, env = process.env, harness = harnessFromEnv(env) } = {}) {
  if (env.FREEFLOW_DISABLE_RUNTIME_CONTEXT === "1") return Object.keys(PROMPT_FILES).map(() => "");
  return Object.keys(PROMPT_FILES).map((part) => {
    const text = renderRuntimeContext(root, part, { session, env, harness });
    return text.trim() ? text : "";
  });
}

// The mod runs in no Node, so it asks for the parts here: `node runtime-context.mjs section --cwd <dir>`, the session
// from CLAUDE_CODE_SESSION_ID as the hooks read it, prints `{ "parts": [...], "home": <the Freeflow home> }`, the home
// where the mod's session-start ledger is before the mod has read it from the store's status.
if (isMainModule(import.meta.url) && process.argv[2] === "section")
  runSafely(() => {
    const at = process.argv.indexOf("--cwd");
    const cwd = at > 0 ? process.argv[at + 1] : process.cwd();
    const parts = hookParts(findWorkspaceRoot(cwd), { session: hookSessionId({}) });
    process.stdout.write(`${JSON.stringify({ parts, home: freeflowHome(process.env) })}\n`);
  });
