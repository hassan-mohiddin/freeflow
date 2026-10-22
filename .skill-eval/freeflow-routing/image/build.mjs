#!/usr/bin/env node
// Builds the suite's image (freeflow-routing-shelf) from image/Dockerfile with the suite folder as the context, and
// records its local digest in image/digests.json, which scripts/groups.mjs pins into every group. Run from anywhere.
// Uses the standard docker CLI (Colima, Docker Desktop, OrbStack).
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const suite = join(dirname(fileURLToPath(import.meta.url)), "..");
const name = "freeflow-routing-shelf";
execFileSync("docker", ["build", "--quiet", "-t", name, "-f", join(suite, "image", "Dockerfile"), suite], {
  stdio: ["ignore", "ignore", "inherit"],
});
const digest = execFileSync("docker", ["image", "inspect", name, "--format", "{{index .RepoDigests 0}}"], {
  encoding: "utf8",
}).trim();
if (!/@sha256:[0-9a-f]{64}$/.test(digest)) throw new Error(`${name} has no digest: ${digest}`);
writeFileSync(join(suite, "image", "digests.json"), `${JSON.stringify({ shelf: digest }, null, 2)}\n`);
process.stdout.write(`${digest}\n`);
