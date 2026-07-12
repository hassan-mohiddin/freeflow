import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { authorizeToolPath, createRootPolicy } from "./path-policy.mjs";
import { capabilitiesFor } from "./capabilities.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const guardPath = resolve(scriptDir, "..", "pi-root-guard.mjs");

export async function probeRootGuard() {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-guard-probe-"));
  try {
    const fixture = resolve(root, "fixture");
    const snapshot = resolve(root, "snapshot");
    const denied = resolve(root, "denied");
    await Promise.all([mkdir(fixture), mkdir(snapshot), mkdir(denied)]);
    await Promise.all([
      writeFile(resolve(fixture, "allowed.txt"), "fixture"),
      writeFile(resolve(snapshot, "SKILL.md"), "snapshot"),
      writeFile(resolve(denied, "answers.json"), "secret"),
    ]);
    await symlink(resolve(denied, "answers.json"), resolve(fixture, "escape-link"));

    const policy = await createRootPolicy({ readRoots: [fixture, snapshot], writeRoots: [fixture] });
    const probes = {
      fixture_read: await authorizeToolPath({ inputPath: "allowed.txt", cwd: fixture, operation: "read", policy }),
      fixture_write: await authorizeToolPath({ inputPath: "new.txt", cwd: fixture, operation: "write", policy }),
      snapshot_read: await authorizeToolPath({ inputPath: resolve(snapshot, "SKILL.md"), cwd: fixture, operation: "read", policy }),
      snapshot_write: await authorizeToolPath({ inputPath: resolve(snapshot, "SKILL.md"), cwd: fixture, operation: "write", policy }),
      denied_read: await authorizeToolPath({ inputPath: resolve(denied, "answers.json"), cwd: fixture, operation: "read", policy }),
      traversal_read: await authorizeToolPath({ inputPath: "../denied/answers.json", cwd: fixture, operation: "read", policy }),
      symlink_read: await authorizeToolPath({ inputPath: "escape-link", cwd: fixture, operation: "read", policy }),
    };

    const modulePolicyPass = probes.fixture_read.allowed
      && probes.fixture_write.allowed
      && probes.snapshot_read.allowed
      && !probes.snapshot_write.allowed
      && !probes.denied_read.allowed
      && !probes.traversal_read.allowed
      && !probes.symlink_read.allowed;

    const env = {
      ...process.env,
      FREEFLOW_EVAL_ROOT_POLICY: JSON.stringify({ read_roots: [fixture, snapshot], write_roots: [fixture] }),
      FREEFLOW_EVAL_GUARD_PROBE: "1",
    };
    const load = spawnSync("pi", [
      "--no-extensions",
      "--no-skills",
      "--no-prompt-templates",
      "--no-themes",
      "--no-context-files",
      "--no-approve",
      "--offline",
      "--extension",
      guardPath,
      "--list-models",
    ], { encoding: "utf8", env });
    const explicitLoadPass = load.status === 0 && load.stderr.includes("FREEFLOW_EVAL_GUARD_LOADED");

    return {
      available: modulePolicyPass && explicitLoadPass,
      guard_path: guardPath,
      module_policy_pass: modulePolicyPass,
      explicit_load_pass: explicitLoadPass,
      probes: Object.fromEntries(Object.entries(probes).map(([key, value]) => [key, value.allowed])),
      load_error: explicitLoadPass ? null : (load.error?.message ?? load.stderr.trim()),
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export async function doctorReport() {
  const pi = await capabilitiesFor("pi", "rpc-scripted");
  const rootGuard = pi.available ? await probeRootGuard() : { available: false, error: "Pi unavailable" };
  const nodeSupported = Number(process.versions.node.split(".")[0]) >= 22;
  return {
    schema_version: 1,
    node: { version: process.version, supported: nodeSupported },
    pi,
    root_guard: rootGuard,
    model_requests: 0,
    ready_for_planning: nodeSupported && pi.available && rootGuard.available,
    ready_for_rpc_planning: nodeSupported && pi.available && pi.capabilities.rpc_jsonl && rootGuard.available,
  };
}
