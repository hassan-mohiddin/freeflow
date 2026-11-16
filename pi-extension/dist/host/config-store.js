import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { HARNESSES, SETTINGS, sanitizeConfigFile, settingSpec, validSettingValue } from "./config-validation.js";
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
/**
 * Where the settings live (D-060): in the Freeflow home, never in the repository. The everywhere layer is the home's
 * `settings.json` (the layer the code names `repository`, the wider of the two files); the folder layer is the home's
 * `folders.json`, one entry per repository folder (`personal`, which overrides it). A session's values are in
 * `sessions/<id>/settings.json`. The repository's own `.freeflow/config.json` and `.freeflow/local.json` are no longer
 * read: the settings doctor moves their keys to the folder layer.
 */
export const HOME_FILES = { repository: "settings.json", personal: "folders.json" };
export const LEGACY_FILES = { repository: ".freeflow/config.json", personal: ".freeflow/local.json" };
/**
 * The repository a folder is in, as every host and the settings script find it: the nearest folder up with `.git`, else
 * the folder itself. The folder layer is keyed by it, so a session in a subfolder reads its repository's settings (D-060).
 */
export function repositoryRoot(folder) {
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
export function portableRemoteKey(url) {
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
const originCache = new Map();
/** A repository's `origin` remote URL, read once per process; null when it has none or is not a Git repository. */
function originOf(repo) {
  if (originCache.has(repo)) return originCache.get(repo) ?? null;
  let origin = null;
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
export function folderKey(root) {
  const repo = repositoryRoot(root);
  const origin = originOf(repo);
  return origin ? portableRemoteKey(origin) : repo;
}
/** The path of a layer's file in the Freeflow home. */
export function layerPath(home, scope) {
  return join(home, HOME_FILES[scope]);
}
function readHomeObject(path) {
  if (!existsSync(path)) return { exists: false };
  try {
    return { exists: true, raw: JSON.parse(readFileSync(path, "utf8")) };
  } catch (error) {
    return { exists: true, error: `not JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}
/** The folder layer's entries by repository folder; a file that is not one JSON object reads as an error. */
function readFolders(home) {
  const read = readHomeObject(layerPath(home, "personal"));
  if (!read.exists) return { entries: {}, error: null };
  if (read.error !== undefined) return { entries: {}, error: read.error };
  if (!isRecord(read.raw)) return { entries: {}, error: "must hold a JSON object of folders" };
  return { entries: read.raw, error: null };
}
export function readConfigFile(root, scope, home) {
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
export async function writeLayer(root, scope, next, home) {
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
export async function writeConfigValue(root, scope, path, value, home, harness = null) {
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
/** A session's values by dotted key; values the table does not accept are dropped, as Pi drops them. A harness tick is `harness.<name>.<key>`. */
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
    const tick = /^harness\.([^.]+)\.(.+)$/.exec(key);
    if (tick && !HARNESSES.includes(tick[1])) continue;
    const spec = settingSpec(tick ? tick[2] : key);
    if (spec?.session && validSettingValue(spec, value)) values[key] = value;
  }
  return values;
}
/** Writes a session's value for a key, or its tick for one harness (`harness`), and removes an empty file. */
export async function writeSessionValue(home, id, key, value, harness = null) {
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
 * Whether the Freeflow home is a store with a remote named origin, read from the store's Git config: no process, so it
 * is cheap enough for the request path (D-060, Setting 2).
 */
export function storeHasRemote(home) {
  if (!home) return false;
  try {
    return /^\[remote "origin"\]/m.test(readFileSync(join(home, ".git", "config"), "utf8"));
  } catch {
    return false;
  }
}
/**
 * A setting's default where no layer sets it: `defaultWithRemote` when the home's store has a remote, else `default`.
 * memory.mode is sync with a remote and local without one, unless a layer says otherwise (D-060, round 3).
 */
export function defaultValueFor(spec, home) {
  return spec.defaultWithRemote !== undefined && storeHasRemote(home) ? spec.defaultWithRemote : spec.default;
}
export function resolveSetting(spec, layers, harness = null, home = null) {
  if (harness && `harness.${harness}.${spec.key}` in layers.session)
    return { spec, value: layers.session[`harness.${harness}.${spec.key}`], scope: "session", ticked: true };
  if (spec.key in layers.session) return { spec, value: layers.session[spec.key], scope: "session", ticked: false };
  const path = spec.key.split(".");
  for (const scope of ["personal", "repository"]) {
    if (harness) {
      const tick = getPath(layers[scope], ["harness", harness, ...path]);
      if (tick !== undefined) return { spec, value: tick, scope, ticked: true };
    }
    const value = getPath(layers[scope], path);
    if (value !== undefined) return { spec, value: value, scope, ticked: false };
  }
  return { spec, value: defaultValueFor(spec, home), scope: "default", ticked: false };
}
/** A session's values as one harness applies them: its general values, with that harness's ticks over them. */
export function sessionValuesForHarness(session, harness) {
  const values = {};
  for (const [key, value] of Object.entries(session)) if (!key.startsWith("harness.")) values[key] = value;
  if (harness)
    for (const [key, value] of Object.entries(session))
      if (key.startsWith(`harness.${harness}.`)) values[key.slice(`harness.${harness}.`.length)] = value;
  return values;
}
