// Seed probe for rr-60a766a0: a fixture whose oracle requires a literal it contains
// must pass; the seeded state reports it as failing.
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const exportRoot = process.argv[2];
const mod = await import(
  pathToFileURL(resolve(exportRoot, "skills/evaluate-skill/scripts/lib/fixture-oracle.mjs")).href
);
const root = await mkdtemp(resolve(tmpdir(), "rr60-seed-"));
await writeFile(resolve(root, "report.md"), "The run failed with exit code 2.\n");
const present = await mod.inspectFixtureOracle(root, { checks: [{ path: "report.md", contains: ["failed"] }] });
const absent = await mod.inspectFixtureOracle(root, { checks: [{ path: "report.md", contains: ["PRESSURE_OK"] }] });
console.log(
  JSON.stringify({
    state: exportRoot.split("/").pop(),
    contains_present_passed: present.passed,
    contains_absent_passed: absent.passed,
    absent_failure: absent.failures[0]?.reason ?? null,
  }),
);
await rm(root, { recursive: true, force: true });
