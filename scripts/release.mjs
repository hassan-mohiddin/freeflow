#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { prepareChangelog, resolveReleaseVersion } from "./release-utils.mjs";

const VERSIONED_JSON_FILES = [
  "package.json",
  ".codex-plugin/plugin.json",
  ".claude-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
];

function usage() {
  console.error("Usage: npm run release:prepare -- <major|minor|patch|x.y.z> [--date YYYY-MM-DD] [--dry-run]");
}

function parseArgs(args) {
  const target = args.find((argument) => !argument.startsWith("--"));
  const options = { date: new Date().toISOString().slice(0, 10), dryRun: false, target };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (argument === "--date") {
      const value = args[index + 1];
      if (!value) throw new Error("--date requires a value");
      options.date = value;
      index += 1;
      continue;
    }
    if (argument === "--help") {
      usage();
      process.exit(0);
    }
    if (argument.startsWith("--")) throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.target) throw new Error("A release target is required");
  return options;
}

function repoRoot() {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
}

function assertCleanWorktree() {
  const status = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim();
  if (status) {
    throw new Error("Release preparation requires a clean worktree. Commit or preserve current work first.");
  }
}

function parseJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Invalid JSON in ${path}`, { cause: error });
  }
}

function replaceVersion(text, currentVersion, nextVersion, path) {
  const escapedVersion = currentVersion.replace(/[.*+?^${}()|[\\]\\]/g, "\\\\$&");
  const pattern = new RegExp(`("version"\\s*:\\s*)"${escapedVersion}"`);
  if (!pattern.test(text)) {
    throw new Error(`${path} does not contain version ${currentVersion}`);
  }
  return text.replace(pattern, `$1"${nextVersion}"`);
}

function prepareFiles(root, currentVersion, nextVersion, date) {
  const changes = new Map();
  for (const relativePath of VERSIONED_JSON_FILES) {
    const path = resolve(root, relativePath);
    const current = readFileSync(path, "utf8");
    changes.set(path, replaceVersion(current, currentVersion, nextVersion, relativePath));
  }

  const lockPath = resolve(root, "package-lock.json");
  const lock = parseJson(lockPath);
  if (lock.version !== currentVersion || lock.packages?.[""].version !== currentVersion) {
    throw new Error("package-lock.json root version does not match package.json");
  }
  lock.version = nextVersion;
  lock.packages[""].version = nextVersion;
  changes.set(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

  const changelogPath = resolve(root, "CHANGELOG.md");
  const changelog = readFileSync(changelogPath, "utf8");
  changes.set(changelogPath, prepareChangelog(changelog, nextVersion, date));
  return changes;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const root = repoRoot();
  process.chdir(root);
  assertCleanWorktree();

  const packagePath = resolve(root, "package.json");
  const currentVersion = parseJson(packagePath).version;
  const nextVersion = resolveReleaseVersion(currentVersion, options.target);
  const changes = prepareFiles(root, currentVersion, nextVersion, options.date);

  console.log(`Release preparation: ${currentVersion} -> ${nextVersion}`);
  for (const path of changes.keys()) {
    console.log(`  ${path.slice(root.length + 1)}`);
  }
  if (options.dryRun) {
    console.log("Dry run: no files changed.");
    process.exit(0);
  }

  for (const [path, content] of changes) writeFileSync(path, content);
  console.log("Prepared release files. Run npm run check before committing or tagging.");
  console.log("No commit, tag, push, npm publish, or GitHub Release was performed.");
} catch (error) {
  usage();
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
