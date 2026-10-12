import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// An OAuth login is refused when it could expire during the run: a refresh inside the copy would rotate the
// token there and leave the user's own login holding a revoked one.
const MIN_OAUTH_MINUTES = 60;

/**
 * Creates a private home, temp directory and Pi agent directory for one host process, and the environment
 * that points the process at them. Only the declared provider's login is copied in, never another's; the
 * parent's HOME, TMPDIR, XDG directories and Pi settings are not visible.
 *
 * @param {string} directory where the isolation root is created
 * @param {string | null} model the declared `provider/model`, or null
 * @returns {Promise<{environment: Record<string, string>, evidence: any}>}
 */
export async function prepareIsolation(directory, model) {
  const root = path.join(directory, "isolation");
  const home = path.join(root, "home");
  const agent = path.join(root, "agent");
  const tmp = path.join(root, "tmp");
  for (const entry of [home, agent, tmp]) await mkdir(entry, { recursive: true });

  const provider = typeof model === "string" && model.includes("/") ? model.split("/")[0] : null;
  const source = credentialsDirectory();
  const credentials = [];
  if (provider !== null) {
    const auth = await readJsonObject(path.join(source, "auth.json"));
    const login = auth?.[provider];
    if (login && typeof login === "object") {
      if (login.type === "oauth" && typeof login.expires === "number") {
        const minutes = Math.floor((login.expires - Date.now()) / 60000);
        if (minutes < MIN_OAUTH_MINUTES) {
          // The caller reports a setup error as an invalid run, before any host process starts.
          throw new Error(
            `login for ${provider} expires in ${minutes} minutes; log in again so it has at least ${MIN_OAUTH_MINUTES} left`,
          );
        }
      }
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
    evidence: { root, provider, credentials },
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

/** Where the user's Pi logins live: an explicit override, then Pi's agent directory, then its default. */
function credentialsDirectory() {
  return (
    process.env.SKILL_EVAL_CREDENTIALS_DIR ||
    process.env.PI_CODING_AGENT_DIR ||
    path.join(process.env.HOME || os.homedir(), ".pi", "agent")
  );
}

async function readJsonObject(file) {
  try {
    const value = JSON.parse(await readFile(file, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}
