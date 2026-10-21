import { existsSync, readFileSync } from "node:fs";

export const DEFAULTS = {
  server: { host: "127.0.0.1", port: 8080 },
  log: { level: "info", format: "text" },
  checks: [],
};

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/** `over` laid over `base`, object by object, into a new value; arrays and other values replace. */
function merge(base, over) {
  if (!isPlainObject(base) || !isPlainObject(over)) return structuredClone(over === undefined ? base : over);
  const merged = structuredClone(base);
  for (const [key, value] of Object.entries(over)) merged[key] = merge(base[key], value);
  return merged;
}

/** The settings: the file's values laid over the defaults, section by section. A missing file gives the defaults. */
export function loadConfig(file = "config.json") {
  const user = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  return merge(DEFAULTS, user);
}
