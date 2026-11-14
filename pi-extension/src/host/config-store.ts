import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  HARNESSES,
  SETTINGS,
  sanitizeConfigFile,
  settingSpec,
  validSettingValue,
  type IgnoredSetting,
  type SettingScope,
  type SettingSpec,
  type SettingValue,
} from "./config-validation.js";

/**
 * Reading and writing Freeflow's settings, the same for Pi's screen and for the settings script every other host runs:
 * the repository's `.freeflow/config.json`, the personal `.freeflow/local.json`, and, outside Pi, a session's own file
 * in the Freeflow home. Plain Node only: the script imports the built file.
 */

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

/**
 * Where the settings live (D-060): in the Freeflow home, never in the repository. The everywhere layer is the home's
 * `settings.json` (the layer the code names `repository`, the wider of the two files); the folder layer is the home's
 * `folders.json`, one entry per repository folder (`personal`, which overrides it). A session's values are in
 * `sessions/<id>/settings.json`. The repository's own `.freeflow/config.json` and `.freeflow/local.json` are no longer
 * read: the settings doctor moves their keys to the folder layer.
 */
export const HOME_FILES = { repository: "settings.json", personal: "folders.json" } as const;
export const LEGACY_FILES = { repository: ".freeflow/config.json", personal: ".freeflow/local.json" } as const;

/**
 * The repository a folder is in, as every host and the settings script find it: the nearest folder up with `.git`, else
 * the folder itself. The folder layer is keyed by it, so a session in a subfolder reads its repository's settings (D-060).
 */
export function repositoryRoot(folder: string): string {
  const start = resolve(folder);
  for (let current = start; ; current = dirname(current)) {
    if (existsSync(join(current, ".git"))) return current;
    if (dirname(current) === current) return start;
  }
}

/**
 * A repository's remote URL in the portable form the folder layer is keyed by (D-060, Q4): the host lowercased, with no
 * scheme, no user, no port and no trailing `.git`, e.g. `github.com/owner/repo`. A scp-style `user@host:path` is read
 * as `host/path`. Worktrees of one repository share the key.
 */
export function portableRemoteKey(url: string): string {
  let s = url.trim();
  const scheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s);
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/^[^@/]+@/, "");
  if (!scheme) {
    const scp = /^([^/:]+):(.*)$/.exec(s);
    if (scp) s = `${scp[1]}/${scp[2]}`;
  }
  s = s.replace(/\/+$/, "").replace(/\.git$/i, "");
  const slash = s.indexOf("/");
  const host = (slash < 0 ? s : s.slice(0, slash)).replace(/:\d+$/, "").toLowerCase();
  return host + (slash < 0 ? "" : s.slice(slash));
}

const originCache = new Map<string, string | null>();

/** A repository's `origin` remote URL, read once per process; null when it has none or is not a Git repository. */
function originOf(repo: string): string | null {
  if (originCache.has(repo)) return originCache.get(repo) ?? null;
  let origin: string | null = null;
  if (existsSync(join(repo, ".git"))) {
    try {
      origin =
        execFileSync("git", ["-C", repo, "config", "--get", "remote.origin.url"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim() || null;
    } catch {
      origin = null;
    }
  }
  originCache.set(repo, origin);
  return origin;
}

/**
 * The key a repository's folder layer is stored under: its portable remote key when it has an `origin`, else its
 * absolute root (D-060, Q4).
 */
export function folderKey(root: string): string {
  const repo = repositoryRoot(root);
  const origin = originOf(repo);
  return origin ? portableRemoteKey(origin) : repo;
}

/** The path of a layer's file in the Freeflow home. */
export function layerPath(home: string, scope: "repository" | "personal"): string {
  return join(home, HOME_FILES[scope]);
}

/**
 * A layer as the hosts read it: absent, or its settings with the ones it ignores. A file that is not JSON reads as
 * empty, with `error` and one ignored entry (D-045). A layer with ignored entries is never written over: see
 * writeConfigValue. The value keeps the layer's `harness` ticks; settingsForHarness(value, harness) applies them.
 */
export type ConfigFileState = { exists: boolean; value: JsonObject; error: string | null; ignored: IgnoredSetting[] };

function readHomeObject(path: string): { exists: boolean; raw?: unknown; error?: string } {
  if (!existsSync(path)) return { exists: false };
  try {
    return { exists: true, raw: JSON.parse(readFileSync(path, "utf8")) };
  } catch (error) {
    return { exists: true, error: `not JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** The folder layer's entries by repository folder; a file that is not one JSON object reads as an error. */
function readFolders(home: string): { entries: JsonObject; error: string | null } {
  const read = readHomeObject(layerPath(home, "personal"));
  if (!read.exists) return { entries: {}, error: null };
  if (read.error !== undefined) return { entries: {}, error: read.error };
  if (!isRecord(read.raw)) return { entries: {}, error: "must hold a JSON object of folders" };
  return { entries: read.raw, error: null };
}

export function readConfigFile(root: string, scope: "repository" | "personal", home: string): ConfigFileState {
  if (scope === "repository") {
    const read = readHomeObject(layerPath(home, "repository"));
    if (!read.exists) return { exists: false, value: {}, error: null, ignored: [] };
    if (read.error !== undefined)
      return { exists: true, value: {}, error: read.error, ignored: [{ key: null, reason: read.error }] };
    const { config, ignored } = sanitizeConfigFile(read.raw, "repository");
    return { exists: true, value: config, error: null, ignored };
  }
  const folders = readFolders(home);
  if (folders.error !== null)
    return { exists: true, value: {}, error: folders.error, ignored: [{ key: null, reason: folders.error }] };
  // A folder written under the absolute root before the portable key (D-060, Q4) is read as before.
  const entry = folders.entries[folderKey(root)] ?? folders.entries[repositoryRoot(root)];
  if (entry === undefined) return { exists: false, value: {}, error: null, ignored: [] };
  const { config, ignored } = sanitizeConfigFile(entry, "personal");
  return { exists: true, value: config, error: null, ignored };
}

/**
 * Writes a layer's whole settings object (`next`), with the rules the layers keep: the everywhere file drops values
 * equal to their default (unset and the default are the same there); the folder entry keeps them, since it overrides
 * the everywhere file. An object with nothing left removes the layer's file or the folder's entry.
 */
export async function writeLayer(root: string, scope: "repository" | "personal", next: JsonObject, home: string) {
  if (scope === "repository") {
    pruneDefaults(next);
    if (Object.keys(next).length === 0) {
      await rm(layerPath(home, "repository"), { force: true });
      return;
    }
    await mkdir(home, { recursive: true });
    await writeFile(layerPath(home, "repository"), `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return;
  }
  const folders = readFolders(home);
  // Written under the portable key; an entry under the absolute root is moved there.
  delete folders.entries[repositoryRoot(root)];
  if (Object.keys(next).length === 0) delete folders.entries[folderKey(root)];
  else folders.entries[folderKey(root)] = next;
  if (Object.keys(folders.entries).length === 0) {
    await rm(layerPath(home, "personal"), { force: true });
    return;
  }
  await mkdir(home, { recursive: true });
  await writeFile(layerPath(home, "personal"), `${JSON.stringify(folders.entries, null, 2)}\n`, "utf8");
}

/**
 * Writes one value into a layer (`undefined` removes it), through writeLayer. Refuses to touch a layer that is invalid
 * now: doctor fixes it first (D-045). With `harness`, the value is that harness's tick.
 */
export async function writeConfigValue(
  root: string,
  scope: "repository" | "personal",
  path: readonly string[],
  value: unknown,
  home: string,
  harness: string | null = null,
) {
  const current = readConfigFile(root, scope, home);
  if (current.ignored.length > 0)
    throw new Error(
      `${HOME_FILES[scope]} in the Freeflow home has settings Freeflow ignores; run settings.mjs doctor to see the fix before changing a setting.`,
    );
  const target = harness ? ["harness", harness, ...path] : [...path];
  const next = cloneJson(current.value);
  if (value === undefined) deletePath(next, target);
  else setPath(next, target, value);
  await writeLayer(root, scope, next, home);
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

/** A session's values by dotted key; values the table does not accept are dropped, as Pi drops them. A harness tick is `harness.<name>.<key>`. */
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
    const tick = /^harness\.([^.]+)\.(.+)$/.exec(key);
    if (tick && !(HARNESSES as readonly string[]).includes(tick[1]!)) continue;
    const spec = settingSpec(tick ? tick[2]! : key);
    if (spec?.session && validSettingValue(spec, value)) values[key] = value;
  }
  return values;
}

/** Writes a session's value for a key, or its tick for one harness (`harness`), and removes an empty file. */
export async function writeSessionValue(
  home: string,
  id: string,
  key: string,
  value: SettingValue | undefined,
  harness: string | null = null,
) {
  const values = readSessionSettings(home, id);
  const stored = harness ? `harness.${harness}.${key}` : key;
  if (value === undefined) delete values[stored];
  else values[stored] = value;
  const path = sessionSettingsPath(home, id);
  if (Object.keys(values).length === 0) {
    await rm(path, { force: true });
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(values, null, 2)}\n`, "utf8");
}

/**
 * A setting's value now and the scope it comes from: Session, then Folder (`personal`), then Everywhere (`repository`),
 * then the default. Within each scope a value ticked for `harness` wins over that scope's general value (D-060);
 * `ticked` says the value came from a tick.
 */
export type ResolvedSetting = {
  spec: SettingSpec;
  value: SettingValue | null;
  scope: SettingScope | "default";
  ticked: boolean;
};

export function resolveSetting(
  spec: SettingSpec,
  layers: { repository: JsonObject; personal: JsonObject; session: Record<string, SettingValue> },
  harness: string | null = null,
): ResolvedSetting {
  if (harness && `harness.${harness}.${spec.key}` in layers.session)
    return { spec, value: layers.session[`harness.${harness}.${spec.key}`]!, scope: "session", ticked: true };
  if (spec.key in layers.session) return { spec, value: layers.session[spec.key]!, scope: "session", ticked: false };
  const path = spec.key.split(".");
  for (const scope of ["personal", "repository"] as const) {
    if (harness) {
      const tick = getPath(layers[scope], ["harness", harness, ...path]);
      if (tick !== undefined) return { spec, value: tick as SettingValue, scope, ticked: true };
    }
    const value = getPath(layers[scope], path);
    if (value !== undefined) return { spec, value: value as SettingValue, scope, ticked: false };
  }
  return { spec, value: spec.default, scope: "default", ticked: false };
}

/** A session's values as one harness applies them: its general values, with that harness's ticks over them. */
export function sessionValuesForHarness(
  session: Record<string, SettingValue>,
  harness: string | null,
): Record<string, SettingValue> {
  const values: Record<string, SettingValue> = {};
  for (const [key, value] of Object.entries(session)) if (!key.startsWith("harness.")) values[key] = value;
  if (harness)
    for (const [key, value] of Object.entries(session))
      if (key.startsWith(`harness.${harness}.`)) values[key.slice(`harness.${harness}.`.length)] = value;
  return values;
}
