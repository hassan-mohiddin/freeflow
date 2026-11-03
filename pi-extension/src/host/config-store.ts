import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import {
  SETTINGS,
  settingSpec,
  validSettingValue,
  validateLocalConfig,
  validateRepositoryConfig,
  type SettingScope,
  type SettingSpec,
  type SettingValue,
} from "./config-validation.js";

/**
 * Reading and writing Freeflow's settings, the same for Pi's screen and for the settings script every other host runs:
 * the repository's `.freeflow/config.json`, the personal `.freeflow/local.json`, and, outside Pi, a session's own file
 * in the Freeflow home. Plain Node only: the script imports the built file.
 */

const execFileAsync = promisify(execFile);

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function cloneJson<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

export function getPath(source: unknown, path: readonly string[]): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

export function setPath(target: JsonObject, path: readonly string[], value: unknown) {
  let current = target;
  for (const key of path.slice(0, -1)) {
    if (!isRecord(current[key])) current[key] = {};
    current = current[key] as JsonObject;
  }
  current[path[path.length - 1]!] = value;
}

/** Deletes the key at `path` and every object it leaves empty. */
export function deletePath(target: JsonObject, path: readonly string[]) {
  let current: unknown = target;
  const parents: Array<{ object: JsonObject; key: string }> = [];
  for (const key of path.slice(0, -1)) {
    if (!isRecord(current)) return;
    parents.push({ object: current, key });
    current = current[key];
  }
  if (!isRecord(current)) return;
  delete current[path[path.length - 1]!];
  for (let index = parents.length - 1; index >= 0; index--) {
    const { object, key } = parents[index]!;
    const child = object[key];
    if (isRecord(child) && Object.keys(child).length === 0) delete object[key];
  }
}

const valuesEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Drops from a repository file every setting equal to its default: unset and the default are the same there, since
 * nothing is below it. A personal file keeps them, so a personal `auto` can return a shared `off` to the default.
 */
export function pruneDefaults(config: JsonObject) {
  for (const spec of SETTINGS) {
    const path = spec.key.split(".");
    if (spec.default !== null && valuesEqual(getPath(config, path), spec.default)) deletePath(config, path);
  }
}

export const CONFIG_FILES = { repository: ".freeflow/config.json", personal: ".freeflow/local.json" } as const;

/** A config file: absent, valid with its value, or invalid with the reason. */
export type ConfigFileState = { exists: boolean; value: JsonObject; error: string | null };

export function readConfigFile(root: string, scope: "repository" | "personal"): ConfigFileState {
  const path = join(root, CONFIG_FILES[scope]);
  if (!existsSync(path)) return { exists: false, value: {}, error: null };
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return { exists: true, value: {}, error: `not JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  const error = scope === "repository" ? validateRepositoryConfig(value) : validateLocalConfig(value);
  return { exists: true, value: error ? {} : (value as JsonObject), error };
}

/**
 * Keeps `.freeflow/local.json` out of Git before the first personal write: refuses when Git tracks it, and adds it to the
 * repository's exclude file unless something already ignores it. Outside a Git repository it does nothing.
 */
export async function ensureLocalConfigIgnored(root: string) {
  let gitPath: string;
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
export async function writeConfigValue(
  root: string,
  scope: "repository" | "personal",
  path: readonly string[],
  value: unknown,
) {
  const current = readConfigFile(root, scope);
  if (current.error) throw new Error(`${CONFIG_FILES[scope]} is invalid (${current.error}); fix it first.`);
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
export function freeflowHome(env: NodeJS.ProcessEnv = process.env) {
  return env.FREEFLOW_HOME || join(homedir(), ".freeflow");
}

/** The session a script runs in, as the harness names it (Claude Code, else a layer's `FREEFLOW_SESSION`); or null. */
export function sessionId(env: NodeJS.ProcessEnv = process.env): string | null {
  const id = env.CLAUDE_CODE_SESSION_ID || env.FREEFLOW_SESSION || "";
  return /^[A-Za-z0-9._-]+$/.test(id) ? id : null;
}

/** Where a session's own settings live outside Pi: beside its summary and cycle counter, never synced. */
export function sessionSettingsPath(home: string, id: string) {
  return join(home, "sessions", id, "settings.json");
}

/** A session's values by dotted key; values the table does not accept are dropped, as Pi drops them. */
export function readSessionSettings(home: string, id: string | null): Record<string, SettingValue> {
  if (!id) return {};
  const path = sessionSettingsPath(home, id);
  if (!existsSync(path)) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
  const values: Record<string, SettingValue> = {};
  if (!isRecord(raw)) return values;
  for (const [key, value] of Object.entries(raw)) {
    const spec = settingSpec(key);
    if (spec?.session && validSettingValue(spec, value)) values[key] = value;
  }
  return values;
}

export async function writeSessionValue(home: string, id: string, key: string, value: SettingValue | undefined) {
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

/** A setting's value now and the scope it comes from: Session, then Personal, then Repository, then the default. */
export type ResolvedSetting = { spec: SettingSpec; value: SettingValue | null; scope: SettingScope | "default" };

export function resolveSetting(
  spec: SettingSpec,
  layers: { repository: JsonObject; personal: JsonObject; session: Record<string, SettingValue> },
): ResolvedSetting {
  if (spec.key in layers.session) return { spec, value: layers.session[spec.key]!, scope: "session" };
  const path = spec.key.split(".");
  for (const scope of ["personal", "repository"] as const) {
    const value = getPath(layers[scope], path);
    if (value !== undefined) return { spec, value: value as SettingValue, scope };
  }
  return { spec, value: spec.default, scope: "default" };
}
