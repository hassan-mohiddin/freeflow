import { existsSync, readFileSync } from "node:fs";

export const DEFAULTS = {
  server: { host: "127.0.0.1", port: 8080 },
  log: { level: "info", format: "text" },
  checks: [],
};

/** The settings: the file's values laid over the defaults. A missing file gives the defaults. */
export function loadConfig(file = "config.json") {
  const user = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  return { ...DEFAULTS, ...user };
}
