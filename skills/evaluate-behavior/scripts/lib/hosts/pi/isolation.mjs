import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { ensureLogin, piAgentDirectory, readJsonObject } from "./host.mjs";

// A copied OAuth login must outlast the process using it: a refresh inside the copy would rotate the token
// there and leave the user's own login holding a revoked one. So the login is refreshed centrally, in the
// user's agent directory, whenever it has less than SUBJECT_MINUTES left, to at least TARGET_MINUTES.
export const SUBJECT_MINUTES = 30;
export const TARGET_MINUTES = 120;

/**
 * Creates a private home, temp directory and Pi agent directory for one host process, and the environment
 * that points the process at them. Only the declared provider's login is copied in, never another's, after
 * a central refresh if it was close to expiring; the declared Pi settings become the agent directory's
 * settings.json. The parent's HOME, TMPDIR, XDG directories and Pi settings are not visible.
 *
 * @param {string} directory where the isolation root is created
 * @param {string | null} model the declared `provider/model`, or null
 * @param {{settings?: Record<string, unknown>}} [options]
 * @returns {Promise<{environment: Record<string, string>, evidence: any}>}
 */
export async function prepareIsolation(directory, model, { settings = {} } = {}) {
  const root = path.join(directory, "isolation");
  const home = path.join(root, "home");
  const agent = path.join(root, "agent");
  const tmp = path.join(root, "tmp");
  for (const entry of [home, agent, tmp]) await mkdir(entry, { recursive: true });
  if (Object.keys(settings).length > 0) {
    await writeFile(path.join(agent, "settings.json"), `${JSON.stringify(settings, null, 2)}\n`);
  }

  const provider = typeof model === "string" && model.includes("/") ? model.split("/")[0] : null;
  const source = piAgentDirectory();
  const credentials = [];
  if (provider !== null) {
    // The caller reports a refresh failure as an invalid run, before any host process starts.
    await ensureLogin(provider, { threshold: SUBJECT_MINUTES, target: TARGET_MINUTES });
    const login = (await readJsonObject(path.join(source, "auth.json")))?.[provider];
    if (login && typeof login === "object") {
      await writeFile(path.join(agent, "auth.json"), `${JSON.stringify({ [provider]: login })}\n`, { mode: 0o600 });
      credentials.push({ file: "auth.json", provider, type: typeof login.type === "string" ? login.type : null });
    }
    const models = await readJsonObject(path.join(source, "models.json"));
    const custom = models?.providers?.[provider];
    if (custom && typeof custom === "object") {
      await writeFile(path.join(agent, "models.json"), `${JSON.stringify({ providers: { [provider]: custom } })}\n`, {
        mode: 0o600,
      });
      credentials.push({ file: "models.json", provider, type: "provider" });
    }
  }

  return {
    environment: {
      HOME: home,
      TMPDIR: tmp,
      TMP: tmp,
      TEMP: tmp,
      XDG_CONFIG_HOME: path.join(home, ".config"),
      XDG_DATA_HOME: path.join(home, ".local", "share"),
      XDG_CACHE_HOME: path.join(home, ".cache"),
      PI_CODING_AGENT_DIR: agent,
    },
    evidence: { root, provider, credentials, settings },
  };
}

/**
 * Deletes the copied login and model entries once the process has exited, so no copy of a credential
 * stays in the run's evidence. Safe to call when nothing was copied.
 *
 * @param {string} directory the directory passed to prepareIsolation
 */
export async function removeCopiedCredentials(directory) {
  for (const file of ["auth.json", "models.json"]) {
    await rm(path.join(directory, "isolation", "agent", file), { force: true });
  }
}
