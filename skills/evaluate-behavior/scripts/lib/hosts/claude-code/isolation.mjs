import { mkdir } from "node:fs/promises";
import path from "node:path";

// Claude Code's login reaches a subject only through these variables, passed from the evaluator's own environment.
// No credential file is copied: a refresh inside a copy would rotate the token there and revoke the user's own.
// On a machine whose Claude Code login lives in the keychain, `claude setup-token` prints a token for
// CLAUDE_CODE_OAUTH_TOKEN.
export const LOGIN_VARIABLES = [
  "CLAUDE_CODE_OAUTH_TOKEN",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_SESSION_INGRESS_TOKEN_FILE",
];
// Where the API is and how the machine reaches the network; passed when set, so a subject connects as the user does.
const CONNECTION_VARIABLES = [
  "ANTHROPIC_BASE_URL",
  "HTTPS_PROXY",
  "https_proxy",
  "HTTP_PROXY",
  "http_proxy",
  "NO_PROXY",
  "no_proxy",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
];

/**
 * Creates a private home, temp and Claude Code configuration directory for one process, and the environment that
 * points the process at them, with the login and connection variables of the evaluator's environment. A process
 * with a model needs a login; the confinement probe, which answers from a local stub, runs with none.
 *
 * @param {string} directory where the isolation root is created
 * @param {string | null} model the declared model, or null for a probe
 * @param {{settings?: Record<string, unknown>}} [options]
 * @returns {Promise<{environment: Record<string, string>, evidence: any}>}
 */
export async function prepareClaudeIsolation(directory, model, { settings = {} } = {}) {
  const root = path.join(directory, "isolation");
  const home = path.join(root, "home");
  const config = path.join(root, "config");
  const tmp = path.join(root, "tmp");
  for (const entry of [home, config, tmp]) await mkdir(entry, { recursive: true });

  const login = model === null ? [] : LOGIN_VARIABLES.filter((name) => process.env[name]);
  if (model !== null && login.length === 0) {
    throw new Error(
      `Claude Code needs a login in the evaluator's environment: set one of ${LOGIN_VARIABLES.join(", ")} (on a Mac, \`claude setup-token\` prints a token for CLAUDE_CODE_OAUTH_TOKEN)`,
    );
  }
  const passed = [...login, ...CONNECTION_VARIABLES.filter((name) => process.env[name] !== undefined)];
  return {
    environment: {
      HOME: home,
      TMPDIR: tmp,
      TMP: tmp,
      TEMP: tmp,
      XDG_CONFIG_HOME: path.join(home, ".config"),
      XDG_DATA_HOME: path.join(home, ".local", "share"),
      XDG_CACHE_HOME: path.join(home, ".cache"),
      CLAUDE_CONFIG_DIR: config,
      ...Object.fromEntries(passed.map((name) => [name, process.env[name]])),
    },
    // The names of the variables passed, never their values.
    evidence: {
      root,
      provider: model === null ? null : "anthropic",
      credentials: login.map((variable) => ({ variable })),
      passed,
      settings,
    },
  };
}
