#!/usr/bin/env node
// Builds the suite's images and records each local digest in image/digests.json, which scripts/groups.mjs pins into
// the groups: `tools` (freeflow-tool-use, image/Dockerfile, the tool tasks) and `ledger` (freeflow-tool-use-ledger,
// image/Dockerfile.ledger with the suite folder as its context, the script tasks and their project history). Name
// keys to build only those: `node image/build.mjs ledger`. Run from anywhere. Uses the standard docker CLI (Colima,
// Docker Desktop, OrbStack).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const image = join(dirname(fileURLToPath(import.meta.url)));
const suite = join(image, "..");
const IMAGES = {
  tools: { name: "freeflow-tool-use", dockerfile: join(image, "Dockerfile"), context: image },
  ledger: { name: "freeflow-tool-use-ledger", dockerfile: join(image, "Dockerfile.ledger"), context: suite },
};
const selected = process.argv.slice(2);
for (const key of selected)
  if (!IMAGES[key]) throw new Error(`unknown image ${key}: ${Object.keys(IMAGES).join(", ")}`);
const file = join(image, "digests.json");
const digests = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
for (const key of selected.length > 0 ? selected : Object.keys(IMAGES)) {
  const { name, dockerfile, context } = IMAGES[key];
  execFileSync("docker", ["build", "--quiet", "-t", name, "-f", dockerfile, context], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  const digest = execFileSync("docker", ["image", "inspect", name, "--format", "{{index .RepoDigests 0}}"], {
    encoding: "utf8",
  }).trim();
  if (!/@sha256:[0-9a-f]{64}$/.test(digest)) throw new Error(`${name} has no digest: ${digest}`);
  digests[key] = digest;
  process.stdout.write(`${key}: ${digest}\n`);
}
writeFileSync(file, `${JSON.stringify(digests, null, 2)}\n`);
