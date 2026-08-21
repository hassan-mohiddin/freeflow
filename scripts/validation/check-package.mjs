#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const requiredFiles = [
  "capabilities/output-router/SKILL.md",
  "pi-extension/freeflow/index.js",
  "router/dist/index.js",
  "capabilities/interaction-contract/interaction-contract.md",
  "skills/workflow/SKILL.md",
];
const excludedPrefixes = ["plugin-docs/", ".skill-eval/", "router/evals/", ".deprecated/"];

try {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const output = execFileSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  const files = new Set(JSON.parse(output)[0].files.map(({ path }) => path));
  const missing = requiredFiles.filter((path) => !files.has(path));
  const excluded = [...files].filter((path) => excludedPrefixes.some((prefix) => path.startsWith(prefix)));
  if (missing.length > 0) throw new Error(`npm package is missing: ${missing.join(", ")}`);
  if (excluded.length > 0) throw new Error(`npm package includes excluded files: ${excluded.join(", ")}`);
  if (packageJson.files?.some((path) => excludedPrefixes.some((prefix) => path.startsWith(prefix)))) {
    throw new Error("package.json files list includes GitHub-only or deprecated content");
  }
  console.log(`Package boundary check passed: ${files.size} files inspected.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
