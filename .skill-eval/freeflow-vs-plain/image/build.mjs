#!/usr/bin/env node
// Builds each task's image (freeflow-vs-plain-<task>) from image/Dockerfile with the suite folder as the context,
// and records its local digest in image/digests.json, which scripts/groups.mjs pins into the groups. Run from
// anywhere; pass task IDs to build only those. Uses the standard docker CLI (Colima, Docker Desktop, OrbStack).
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const suite = join(dirname(fileURLToPath(import.meta.url)), "..");
const all = readdirSync(join(suite, "fixtures")).sort();
const tasks = process.argv.length > 2 ? process.argv.slice(2) : all;
const file = join(suite, "image", "digests.json");
const digests = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};

for (const task of tasks) {
  if (!all.includes(task)) throw new Error(`no fixture for ${task}`);
  const name = `freeflow-vs-plain-${task}`;
  execFileSync(
    "docker",
    ["build", "--quiet", "-t", name, "--build-arg", `TASK=${task}`, "-f", join(suite, "image", "Dockerfile"), suite],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  const digest = execFileSync("docker", ["image", "inspect", name, "--format", "{{index .RepoDigests 0}}"], {
    encoding: "utf8",
  }).trim();
  if (!/@sha256:[0-9a-f]{64}$/.test(digest)) throw new Error(`${name} has no digest: ${digest}`);
  digests[task] = digest;
  process.stdout.write(`${digest}\n`);
}
const sorted = Object.fromEntries(Object.entries(digests).sort(([left], [right]) => left.localeCompare(right)));
writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`);
