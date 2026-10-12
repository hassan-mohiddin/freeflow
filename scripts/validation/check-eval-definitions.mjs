#!/usr/bin/env node

// Loads every evaluation suite and group under .skill-eval with the evaluator's own loader, so a definition
// that the evaluator would reject fails `npm run check` instead of failing silently at run time.

import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadDefinition } from "../../skills/evaluate-behavior/scripts/lib/definitions.mjs";

const DEFINITION_DIRECTORIES = new Set(["cases", "adversarial-cases", "groups"]);
const SKIPPED_DIRECTORIES = new Set(["runs", "cache", "fixtures", "node_modules", "subjects", "reports", "provenance"]);

/** Every suite file (`suite.json` or `*-suite.json`) and every JSON file in a cases or groups directory. */
export async function findDefinitionFiles(evalRoot) {
  const files = [];
  async function walk(directory, insideDefinitions) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
        await walk(entryPath, insideDefinitions || DEFINITION_DIRECTORIES.has(entry.name));
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        if (insideDefinitions || entry.name === "suite.json" || entry.name.endsWith("-suite.json")) {
          files.push(entryPath);
        }
      }
    }
  }
  await walk(evalRoot, false);
  return files;
}

export async function checkEvalDefinitions(repositoryRoot) {
  const evalRoot = path.join(repositoryRoot, ".skill-eval");
  const files = await findDefinitionFiles(evalRoot);
  const failures = [];
  for (const file of files) {
    try {
      await loadDefinition(file, { root: repositoryRoot });
    } catch (error) {
      failures.push({
        file: path.relative(repositoryRoot, file),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { checked: files.length, failures };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootIndex = process.argv.indexOf("--root");
  const repositoryRoot =
    rootIndex === -1
      ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
      : path.resolve(process.argv[rootIndex + 1]);
  const { checked, failures } = await checkEvalDefinitions(repositoryRoot);
  for (const failure of failures) console.error(`FAIL: ${failure.file}: ${failure.message}`);
  if (failures.length > 0) {
    console.error(`${failures.length} of ${checked} evaluation definitions do not load.`);
    process.exit(1);
  }
  console.log(`${checked} evaluation definitions load.`);
}
