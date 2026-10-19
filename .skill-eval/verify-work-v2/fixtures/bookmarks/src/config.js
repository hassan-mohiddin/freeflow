import path from "node:path";

export class ConfigError extends Error {}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new ConfigError(`BOOKMARKS_PORT must be a whole number from 0 to 65535, not ${JSON.stringify(value)}`);
  }
  return port;
}

/**
 * The service's settings, read from the environment.
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ port: number, host: string, dataDir: string, token: string | null }}
 */
export function readConfig(env = process.env) {
  const token = env.BOOKMARKS_TOKEN ?? "";
  if (/\s/.test(token)) throw new ConfigError("BOOKMARKS_TOKEN may not contain spaces");
  return {
    port: parsePort(env.BOOKMARKS_PORT ?? "8080"),
    host: env.BOOKMARKS_HOST || "127.0.0.1",
    dataDir: path.resolve(env.BOOKMARKS_DATA_DIR || "data"),
    token: token === "" ? null : token,
  };
}
