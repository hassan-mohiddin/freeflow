import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export function store(jobs) {
  const path = join(mkdtempSync(join(tmpdir(), "jobs-grader-")), "jobs.json");
  writeFileSync(path, JSON.stringify(jobs));
  return path;
}

export function read(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export const imports = {
  queue: () => import(new URL("./src/queue.js", import.meta.url)),
  format: () => import(new URL("./src/format.js", import.meta.url)),
  cli: () => import(new URL("./src/cli.js", import.meta.url)),
};
