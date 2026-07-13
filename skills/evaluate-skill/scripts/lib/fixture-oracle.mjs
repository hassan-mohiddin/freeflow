import { lstat, readFile, realpath } from "node:fs/promises";
import { isWithin } from "./path-policy.mjs";
import { sha256 } from "./hash.mjs";
import { resolveInside } from "./workspace.mjs";

const MAX_FILE_BYTES = 1024 * 1024;

export async function inspectFixtureOracle(fixtureRoot, declaration) {
  if (!fixtureRoot) throw new Error("Fixture oracle requires a fixture root");
  const fixtureReal = await realpath(fixtureRoot);
  const observations = [];
  const failures = [];

  for (const check of declaration.checks) {
    const path = resolveInside(fixtureRoot, check.path, "fixture oracle path");
    let info;
    try {
      info = await lstat(path);
    } catch (error) {
      if (error.code === "ENOENT") {
        failures.push({ path: check.path, reason: "missing-file" });
        continue;
      }
      throw error;
    }
    if (info.isSymbolicLink()) {
      failures.push({ path: check.path, reason: "symlink-forbidden" });
      continue;
    }
    if (!info.isFile()) {
      failures.push({ path: check.path, reason: "not-a-regular-file" });
      continue;
    }
    if (!isWithin(fixtureReal, await realpath(path))) throw new Error(`Fixture oracle path escapes fixture root: ${check.path}`);
    if (info.size > MAX_FILE_BYTES) {
      failures.push({ path: check.path, reason: "file-too-large", bytes: info.size, limit: MAX_FILE_BYTES });
      continue;
    }

    const bytes = await readFile(path);
    const content = bytes.toString("utf8");
    const observation = { path: check.path, sha256: sha256(bytes), bytes: bytes.length };
    observations.push(observation);
    if (check.sha256 !== undefined && observation.sha256 !== check.sha256) failures.push({ path: check.path, reason: "sha256-mismatch", expected: check.sha256, actual: observation.sha256 });
    for (const value of check.contains ?? []) if (!content.includes(value)) failures.push({ path: check.path, reason: "missing-literal", value });
    for (const value of check.not_contains ?? []) if (content.includes(value)) failures.push({ path: check.path, reason: "forbidden-literal", value });
  }

  return { passed: failures.length === 0, observations, failures };
}
