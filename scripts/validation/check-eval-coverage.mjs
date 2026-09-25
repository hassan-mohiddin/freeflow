#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MATRIX_PATH = ".skill-eval/coverage-matrix.json";

// Coverage entries identify the exact skill source they describe; an edited skill silently orphans that evidence.
export async function findStaleCoverage(root) {
  const matrix = JSON.parse(await readFile(path.join(root, MATRIX_PATH), "utf8"));
  const stale = [];
  for (const [skill, entry] of Object.entries(matrix.skills ?? {})) {
    if (typeof entry.source_path !== "string" || typeof entry.source_sha256 !== "string") continue;
    const contents = await readFile(path.join(root, entry.source_path)).catch(() => null);
    if (contents === null) {
      stale.push({ skill, sourcePath: entry.source_path, reason: "source missing" });
    } else if (createHash("sha256").update(contents).digest("hex") !== entry.source_sha256) {
      stale.push({ skill, sourcePath: entry.source_path, reason: "source changed" });
    }
  }
  return stale;
}

async function main() {
  const root = process.cwd();
  const strict = process.argv.includes("--strict");
  const matrix = JSON.parse(await readFile(path.join(root, MATRIX_PATH), "utf8"));
  const recorded = Object.values(matrix.skills ?? {}).filter((entry) => typeof entry.source_sha256 === "string").length;
  const stale = await findStaleCoverage(root);
  if (stale.length === 0) {
    process.stdout.write(`${recorded} coverage entries match their skill source.\n`);
    return;
  }
  process.stderr.write(
    `${stale.length} coverage entries no longer match their skill source; their recorded evidence describes an earlier version:\n`,
  );
  for (const entry of stale) process.stderr.write(`  ${entry.skill}: ${entry.sourcePath} (${entry.reason})\n`);
  if (strict) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
