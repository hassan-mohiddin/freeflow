import { spawnSync } from "node:child_process";
import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { isWithin } from "./path-policy.mjs";
import { resolveInside } from "./workspace.mjs";

const MAX_OUTPUT = 1024 * 1024;
const TIMEOUT_MS = 5000;

export async function runFixtureOracle(fixtureRoot, declaration) {
  if (!fixtureRoot) throw new Error("Fixture oracle requires a fixture root");
  if (declaration.argv[0] !== "node") throw new Error("Fixture oracle executable is not allowlisted");
  const script = resolveInside(fixtureRoot, declaration.argv[1], "fixture oracle script");
  if (!isWithin(await realpath(fixtureRoot), await realpath(script))) throw new Error("Fixture oracle script escapes fixture root");
  const result = spawnSync(process.execPath, [script, ...declaration.argv.slice(2)], {
    cwd: resolve(fixtureRoot),
    encoding: "utf8",
    timeout: TIMEOUT_MS,
    maxBuffer: MAX_OUTPUT,
    shell: false,
    env: { PATH: process.env.PATH ?? "", LANG: "C", LC_ALL: "C" },
  });
  return {
    exit_code: result.status,
    signal: result.signal,
    timed_out: result.error?.code === "ETIMEDOUT",
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}
