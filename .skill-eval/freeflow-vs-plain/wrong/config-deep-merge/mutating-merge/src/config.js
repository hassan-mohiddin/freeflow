import { existsSync, readFileSync } from "node:fs";

// Wrong on purpose: merges each section into the defaults object itself, so one load changes the next.
export const DEFAULTS = {
  server: { host: "127.0.0.1", port: 8080 },
  log: { level: "info", format: "text" },
  checks: [],
};

export function loadConfig(file = "config.json") {
  const user = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const config = { ...DEFAULTS };
  for (const [key, value] of Object.entries(user)) {
    config[key] =
      value && typeof value === "object" && !Array.isArray(value) ? Object.assign(DEFAULTS[key] ?? {}, value) : value;
  }
  return config;
}
