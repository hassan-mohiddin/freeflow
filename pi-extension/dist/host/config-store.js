import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { SETTINGS, sanitizeConfigFile, settingSpec, validSettingValue } from "./config-validation.js";
/**
 * Reading and writing Freeflow's settings, the same for Pi's screen and for the settings script every other host runs:
 * the repository's `.freeflow/config.json`, the personal `.freeflow/local.json`, and, outside Pi, a session's own file
 * in the Freeflow home. Plain Node only: the script imports the built file.
 */
const execFileAsync = promisify(execFile);
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function cloneJson(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}
export function getPath(source, path) {
  let current = source;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}
export function setPath(target, path, value) {
  let current = target;
  for (const key of path.slice(0, -1)) {
    if (!isRecord(current[key])) current[key] = {};
    current = current[key];
  }
  current[path[path.length - 1]] = value;
}
/** Deletes the key at `path` and every object it leaves empty. */
export function deletePath(target, path) {
  let current = target;
  const parents = [];
  for (const key of path.slice(0, -1)) {
    if (!isRecord(current)) return;
    parents.push({ object: current, key });
    current = current[key];
  }
  if (!isRecord(current)) return;
  delete current[path[path.length - 1]];
  for (let index = parents.length - 1; index >= 0; index--) {
    const { object, key } = parents[index];
    const child = object[key];
    if (isRecord(child) && Object.keys(child).length === 0) delete object[key];
  }
}
const valuesEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/**
 * Drops from a repository file every setting equal to its default: unset and the default are the same there, since
 * nothing is below it. A personal file keeps them, so a personal `auto` can return a shared `off` to the default.
 */
export function pruneDefaults(config) {
  for (const spec of SETTINGS) {
    const path = spec.key.split(".");
    if (spec.default !== null && valuesEqual(getPath(config, path), spec.default)) deletePath(config, path);
  }
}
export const CONFIG_FILES = { repository: ".freeflow/config.json", personal: ".freeflow/local.json" };
export function readConfigFile(root, scope) {
  const path = join(root, CONFIG_FILES[scope]);
  if (!existsSync(path)) return { exists: false, value: {}, error: null, ignored: [] };
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const message = `not JSON: ${error instanceof Error ? error.message : String(error)}`;
    return { exists: true, value: {}, error: message, ignored: [{ key: null, reason: message }] };
  }
  const { config, ignored } = sanitizeConfigFile(raw, scope);
  return { exists: true, value: config, error: null, ignored };
}
/**
 * Keeps `.freeflow/local.json` out of Git before the first personal write: refuses when Git tracks it, and adds it to the
 * repository's exclude file unless something already ignores it. Outside a Git repository it does nothing.
 */
export async function ensureLocalConfigIgnored(root) {
  let gitPath;
  try {
    gitPath = (await execFileAsync("git", ["-C", root, "rev-parse", "--git-path", "info/exclude"])).stdout.trim();
  } catch {
    return;
  }
  const tracked = await execFileAsync("git", ["-C", root, "ls-files", "--", CONFIG_FILES.personal]);
  if (tracked.stdout.trim())
    throw new Error(
      ".freeflow/local.json is tracked by git; remove it from the index before writing personal overrides.",
    );
  try {
    await execFileAsync("git", ["-C", root, "check-ignore", "-q", "--", CONFIG_FILES.personal]);
    return;
  } catch {
    // Add a local exclude when the repository does not already ignore the file.
  }
  const excludePath = isAbsolute(gitPath) ? gitPath : resolve(root, gitPath);
  let existing = "";
  try {
    existing = await readFile(excludePath, "utf8");
  } catch {
    // The git metadata path may not exist yet in a minimal repository.
  }
  if (existing.split(/\r?\n/).includes(CONFIG_FILES.personal)) return;
  await mkdir(dirname(excludePath), { recursive: true });
  const prefix = existing && !existing.endsWith("\n") ? "\n" : "";
  await appendFile(excludePath, `${prefix}${CONFIG_FILES.personal}\n`, "utf8");
}
/**
 * Writes one value into a file scope (`undefined` removes it), with Pi's rules: a repository write drops values equal
 * to their default; a personal write keeps them, keeps the file out of Git, and removes the file once it is empty.
 * Refuses to touch a file that is invalid now.
 */
export async function writeConfigValue(root, scope, path, value) {
  const current = readConfigFile(root, scope);
  // Writing would drop what the file ignores, so a file with ignored settings is fixed by doctor first (D-045).
  if (current.ignored.length > 0)
    throw new Error(
      `${CONFIG_FILES[scope]} has settings Freeflow ignores; run settings.mjs doctor to see the fix before changing a setting.`,
    );
  const next = cloneJson(current.value);
  if (value === undefined) deletePath(next, path);
  else setPath(next, path, value);
  const file = join(root, CONFIG_FILES[scope]);
  if (scope === "personal") {
    if (value === undefined && !current.exists) return;
    await ensureLocalConfigIgnored(root);
    if (Object.keys(next).length === 0) {
      await rm(file, { force: true });
      return;
    }
  } else pruneDefaults(next);
  await mkdir(join(root, ".freeflow"), { recursive: true });
  await writeFile(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}
/** The Freeflow home: `FREEFLOW_HOME`, else `~/.freeflow`. */
export function freeflowHome(env = process.env) {
  return env.FREEFLOW_HOME || join(homedir(), ".freeflow");
}
/** The session a script runs in, as the harness names it (Claude Code, else a layer's `FREEFLOW_SESSION`); or null. */
export function sessionId(env = process.env) {
  const id = env.CLAUDE_CODE_SESSION_ID || env.FREEFLOW_SESSION || "";
  return /^[A-Za-z0-9._-]+$/.test(id) ? id : null;
}
/** Where a session's own settings live outside Pi: beside its summary and cycle counter, never synced. */
export function sessionSettingsPath(home, id) {
  return join(home, "sessions", id, "settings.json");
}
/** A session's values by dotted key; values the table does not accept are dropped, as Pi drops them. */
export function readSessionSettings(home, id) {
  if (!id) return {};
  const path = sessionSettingsPath(home, id);
  if (!existsSync(path)) return {};
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
  const values = {};
  if (!isRecord(raw)) return values;
  for (const [key, value] of Object.entries(raw)) {
    const spec = settingSpec(key);
    if (spec?.session && validSettingValue(spec, value)) values[key] = value;
  }
  return values;
}
export async function writeSessionValue(home, id, key, value) {
  const values = readSessionSettings(home, id);
  if (value === undefined) delete values[key];
  else values[key] = value;
  const path = sessionSettingsPath(home, id);
  if (Object.keys(values).length === 0) {
    await rm(path, { force: true });
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(values, null, 2)}\n`, "utf8");
}
export function resolveSetting(spec, layers) {
  if (spec.key in layers.session) return { spec, value: layers.session[spec.key], scope: "session" };
  const path = spec.key.split(".");
  for (const scope of ["personal", "repository"]) {
    const value = getPath(layers[scope], path);
    if (value !== undefined) return { spec, value: value, scope };
  }
  return { spec, value: spec.default, scope: "default" };
}
