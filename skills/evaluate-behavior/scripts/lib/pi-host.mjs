// Pi-specific knowledge the evaluator needs outside a subject process: where the user's Pi agent directory
// is, how installed Pi packages are found, and how a stored OAuth login is kept fresh. Kept in one module so a
// later host adapter has one place to grow from (D-007).

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const REFRESH_HELPER = fileURLToPath(new URL("../pi-login-refresh.mjs", import.meta.url));
const LOCK_STALE_MS = 2 * 60 * 1000;
const LOCK_WAIT_MS = 90 * 1000;

/**
 * Pi settings the evaluator uses unless a configuration's host.settings declares otherwise: automatic retry and
 * compaction stay off, so a provider error or a compaction never happens silently inside a measured run.
 */
export const EVALUATOR_PI_SETTINGS = Object.freeze({ retry: { enabled: false }, compaction: { enabled: false } });

/** The settings a subject actually runs with: the evaluator's defaults, with every declared setting winning. */
export function effectivePiSettings(declared = {}) {
  const merge = (base, overlay) => {
    const result = structuredClone(base);
    for (const [key, value] of Object.entries(overlay)) {
      const isObject = (entry) => entry !== null && typeof entry === "object" && !Array.isArray(entry);
      result[key] = isObject(result[key]) && isObject(value) ? merge(result[key], value) : structuredClone(value);
    }
    return result;
  };
  return merge(EVALUATOR_PI_SETTINGS, declared);
}

/** The user's Pi agent directory: an explicit override for the evaluator, then Pi's own variable, then its default. */
export function piAgentDirectory() {
  return (
    process.env.SKILL_EVAL_CREDENTIALS_DIR ||
    process.env.PI_CODING_AGENT_DIR ||
    path.join(process.env.HOME || os.homedir(), ".pi", "agent")
  );
}

export async function readJsonObject(file) {
  try {
    const value = JSON.parse(await readFile(file, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Finds each declared package extension among the user's installed Pi packages (`<agent dir>/npm/node_modules`),
 * by exact name and version. A missing package or another version refuses the run. An extension built from source
 * (`source` or `path`, see build-source.mjs) is built per group into its resources, so with `deferSources` it stays
 * in its declared position as `{ pending: <declared entry> }`; without it, it is refused.
 *
 * @param {Array<any>} declared
 * @param {{deferSources?: boolean}} [options]
 */
export async function resolveHostExtensions(declared, { deferSources = false } = {}) {
  const root = path.join(piAgentDirectory(), "npm", "node_modules");
  const resolved = [];
  for (const extension of declared) {
    if (!Object.hasOwn(extension, "package")) {
      if (!deferSources) throw new Error("host.extensions built from source are supported only in arm configurations");
      resolved.push({ pending: extension });
      continue;
    }
    const directory = path.join(root, ...extension.package.split("/"));
    const manifest = await readJsonObject(path.join(directory, "package.json"));
    if (manifest === null) {
      throw new Error(`host.extensions: ${extension.package} is not installed in Pi (looked in ${root})`);
    }
    if (manifest.version !== extension.version) {
      throw new Error(
        `host.extensions: ${extension.package} is ${manifest.version} in Pi, but the definition declares ${extension.version}`,
      );
    }
    resolved.push({ path: directory, package: `${extension.package}@${extension.version}` });
  }
  return resolved;
}

/** Minutes left on a provider's stored OAuth login, or null when the login is not OAuth or not stored. */
export async function loginMinutesLeft(provider) {
  const login = (await readJsonObject(path.join(piAgentDirectory(), "auth.json")))?.[provider];
  if (!login || login.type !== "oauth" || typeof login.expires !== "number") return null;
  return Math.floor((login.expires - Date.now()) / 60000);
}

/**
 * Makes a provider's stored OAuth login valid for at least `target` minutes when it has fewer than `threshold`
 * left, by asking the installed Pi to refresh it in the user's own agent directory. One evaluator process
 * refreshes at a time; the others wait and then reread. API-key and absent logins are left alone.
 *
 * @returns {Promise<number | null>} minutes left afterwards, or null when the login is not OAuth
 */
export async function ensureLogin(provider, { threshold, target }) {
  const before = await loginMinutesLeft(provider);
  if (before === null || before >= threshold) return before;
  const authPath = path.join(piAgentDirectory(), "auth.json");
  await withLock(authPath, async () => {
    const current = await loginMinutesLeft(provider);
    if (current !== null && current >= threshold) return;
    const helper = process.env.SKILL_EVAL_LOGIN_REFRESH || REFRESH_HELPER;
    try {
      await run(process.execPath, [helper, authPath, provider, String(target)], { timeout: 60000 });
    } catch (error) {
      const detail = error?.stderr?.trim() || (error instanceof Error ? error.message : String(error));
      throw new Error(`refreshing the ${provider} login failed (log in again in Pi): ${detail}`);
    }
  });
  const after = await loginMinutesLeft(provider);
  if (after === null || after < threshold) {
    throw new Error(`the ${provider} login has ${after ?? 0} minutes left after a refresh; log in again in Pi`);
  }
  return after;
}

async function withLock(authPath, work) {
  const lock = path.join(
    os.tmpdir(),
    `skill-eval-login-${createHash("sha256").update(authPath).digest("hex").slice(0, 16)}.lock`,
  );
  await mkdir(path.dirname(lock), { recursive: true });
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      await mkdir(lock);
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const info = await stat(lock).catch(() => null);
      if (info && Date.now() - info.mtimeMs > LOCK_STALE_MS) await rm(lock, { recursive: true, force: true });
      if (Date.now() > deadline) throw new Error(`timed out waiting for another login refresh (${lock})`);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  try {
    return await work();
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}
