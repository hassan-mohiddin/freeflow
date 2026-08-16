#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseVersion } from "../release-utils.mjs";

const VERSION_FILES = [
  { path: "package.json", getVersion: (data) => data.version },
  { path: ".codex-plugin/plugin.json", getVersion: (data) => data.version },
  { path: ".claude-plugin/plugin.json", getVersion: (data) => data.version },
  { path: ".claude-plugin/marketplace.json", getVersion: (data) => data.plugins?.[0]?.version },
];

function readJson(path) {
  try {
    return JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch (error) {
    throw new Error(`Invalid JSON in ${path}`, { cause: error });
  }
}

function parseArgs(args) {
  const options = { tag: undefined };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--tag") {
      options.tag = args[index + 1];
      if (!options.tag) throw new Error("--tag requires a value");
      index += 1;
      continue;
    }
    if (argument === "--help") {
      console.log("Usage: node scripts/validation/check-release-version.mjs [--tag vX.Y.Z]");
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const versions = VERSION_FILES.map(({ path, getVersion }) => ({ path, version: getVersion(readJson(path)) }));
  const packageLock = readJson("package-lock.json");
  versions.push({ path: "package-lock.json", version: packageLock.version });
  versions.push({ path: "package-lock.json#/packages/", version: packageLock.packages?.[""].version });

  const normalized = versions.map(({ path, version }) => ({ path, version: parseVersion(version).version }));
  const expected = normalized[0].version;
  const mismatches = normalized.filter(({ version }) => version !== expected);
  if (mismatches.length > 0) {
    throw new Error(
      `Version metadata disagrees with ${expected}: ${mismatches.map(({ path, version }) => `${path}=${version}`).join(", ")}`,
    );
  }

  if (options.tag) {
    const match = /^v(\d+\.\d+\.\d+)$/.exec(options.tag);
    if (!match) throw new Error(`Release tag must use vX.Y.Z, got: ${options.tag}`);
    if (match[1] !== expected) throw new Error(`Release tag ${options.tag} does not match package version ${expected}`);
  }

  console.log(`Release version metadata is consistent: ${expected}${options.tag ? ` (${options.tag})` : ""}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
