#!/usr/bin/env node
// Builds the suite's image (freeflow-tool-use) from image/Dockerfile and records its local digest in
// image/digests.json, which scripts/groups.mjs pins into every group. Run from anywhere. Uses the standard docker CLI
// (Colima, Docker Desktop, OrbStack).
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const image = join(dirname(fileURLToPath(import.meta.url)));
const name = "freeflow-tool-use";
execFileSync("docker", ["build", "--quiet", "-t", name, "-f", join(image, "Dockerfile"), image], {
  stdio: ["ignore", "ignore", "inherit"],
});
const digest = execFileSync("docker", ["image", "inspect", name, "--format", "{{index .RepoDigests 0}}"], {
  encoding: "utf8",
}).trim();
if (!/@sha256:[0-9a-f]{64}$/.test(digest)) throw new Error(`${name} has no digest: ${digest}`);
writeFileSync(join(image, "digests.json"), `${JSON.stringify({ tools: digest }, null, 2)}\n`);
process.stdout.write(`${digest}\n`);
