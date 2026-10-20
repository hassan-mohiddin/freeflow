import { readFileSync, writeFileSync, existsSync } from "node:fs";

export const DEFAULT_PATH = "data/jobs.json";

export function load(path = DEFAULT_PATH) {
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf8"));
}

export function save(jobs, path = DEFAULT_PATH) {
  writeFileSync(path, JSON.stringify(jobs, null, 2) + "\n");
}
