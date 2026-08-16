#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractChangelogSection } from "./release-utils.mjs";

function usage() {
  console.error("Usage: node scripts/release-notes.mjs --version <x.y.z> [--changelog <path>] [--out <path>]");
}

function parseArgs(args) {
  const options = { changelog: "CHANGELOG.md", out: undefined, version: undefined };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--version" || argument === "--changelog" || argument === "--out") {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      if (argument === "--version") options.version = value;
      if (argument === "--changelog") options.changelog = value;
      if (argument === "--out") options.out = value;
      index += 1;
      continue;
    }
    if (argument === "--help") {
      usage();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.version) throw new Error("--version is required");
  return options;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const changelog = readFileSync(resolve(options.changelog), "utf8");
  const notes = `${extractChangelogSection(changelog, options.version)}\n`;
  if (options.out) {
    writeFileSync(resolve(options.out), notes);
  } else {
    process.stdout.write(notes);
  }
} catch (error) {
  usage();
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
