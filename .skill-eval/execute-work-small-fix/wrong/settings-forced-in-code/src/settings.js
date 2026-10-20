import { readFileSync } from "node:fs";

const defaults = JSON.parse(readFileSync(new URL("../config/defaults.json", import.meta.url), "utf8"));

export function loadSettings(overrides = {}) {
  const settings = { ...defaults, ...overrides, pageSize: 20 };
  if (settings.pageSize > settings.maxPageSize) {
    throw new RangeError(`pageSize ${settings.pageSize} exceeds maxPageSize ${settings.maxPageSize}`);
  }
  return settings;
}
