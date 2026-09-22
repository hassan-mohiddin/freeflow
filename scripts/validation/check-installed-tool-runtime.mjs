#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const root = process.cwd();
const temporary = mkdtempSync(join(tmpdir(), "freeflow installed tool runtime "));
const tarballs = join(temporary, "package tarballs");
const installation = join(temporary, "installed candidate with spaces");
mkdirSync(tarballs, { recursive: true });
mkdirSync(installation, { recursive: true });

function pack(path) {
  const output = execFileSync(npm, ["pack", "--ignore-scripts", "--json", "--pack-destination", tarballs, path], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  const parsed = JSON.parse(output);
  if (!Array.isArray(parsed) || parsed.length !== 1 || typeof parsed[0]?.filename !== "string")
    throw new Error(`Unexpected npm pack output for ${path}`);
  return join(tarballs, basename(parsed[0].filename));
}

// npm runs a dependency package's prepare script when packing a local directory,
// even with --ignore-scripts. Archive the already installed exact artifact instead;
// this fixture qualifies what the candidate actually resolves without rebuilding it.
function archiveInstalledPackage(path) {
  const manifest = JSON.parse(readFileSync(join(path, "package.json"), "utf8"));
  const stage = mkdtempSync(join(temporary, "dependency stage "));
  const packageDirectory = join(stage, "package");
  cpSync(path, packageDirectory, { recursive: true });
  const filename = `${String(manifest.name).replace(/^@/, "").replaceAll("/", "-")}-${manifest.version}.tgz`;
  const output = join(tarballs, filename);
  execFileSync("tar", ["-czf", output, "-C", stage, "package"], { stdio: "inherit" });
  rmSync(stage, { recursive: true, force: true });
  return output;
}

try {
  const candidates = [
    pack(root),
    archiveInstalledPackage(resolve(root, "node_modules/quickjs-emscripten-core")),
    archiveInstalledPackage(resolve(root, "node_modules/@jitl/quickjs-wasmfile-release-sync")),
    archiveInstalledPackage(resolve(root, "node_modules/@jitl/quickjs-ffi-types")),
  ];
  execFileSync(
    npm,
    [
      "install",
      "--ignore-scripts",
      "--offline",
      "--no-audit",
      "--no-fund",
      "--no-package-lock",
      "--legacy-peer-deps",
      "--prefix",
      installation,
      ...candidates,
    ],
    { cwd: root, stdio: ["ignore", "pipe", "inherit"] },
  );

  const packageRoot = join(installation, "node_modules/@hassangameryt/freeflow");
  const wasm = join(installation, "node_modules/@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm");
  for (const path of [
    join(packageRoot, "pi-extension/dist/tool-runtime/program/worker.js"),
    join(packageRoot, "pi-extension/dist/tool-runtime/program/host.js"),
    wasm,
    join(installation, "node_modules/quickjs-emscripten-core/LICENSE"),
    join(installation, "node_modules/@jitl/quickjs-wasmfile-release-sync/LICENSE"),
  ])
    if (!existsSync(path)) throw new Error(`Installed candidate is missing ${path}`);

  const script = join(installation, "verify installed tool runtime.mjs");
  writeFileSync(
    script,
    `
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const packageRoot = ${JSON.stringify(packageRoot)};
const { resolveToolExecutionConfig } = await import(pathToFileURL(packageRoot + "/pi-extension/dist/tool-runtime/config.js"));
const { ToolRuntime } = await import(pathToFileURL(packageRoot + "/pi-extension/dist/tool-runtime/index.js"));
const { ProgramHost } = await import(pathToFileURL(packageRoot + "/pi-extension/dist/tool-runtime/program/host.js"));

const entries = [];
const manager = {
  getSessionId: () => "installed-candidate-session",
  getBranch: () => entries,
};
const state = resolveToolExecutionConfig({
  toolExecution: { enabled: true, programs: { mode: "reduction", timeoutMs: 1000, maxParallelReads: 2 } },
}, {}, true);
const runtime = new ToolRuntime(
  () => state,
  {
    scope: () => ({ installed: true }),
    responsibility: () => ({ profile: "solo", control: "inactive" }),
    admit: () => ({ kind: "allowed" }),
    admitProgram: () => ({ kind: "allowed" }),
  },
  { read: async () => { throw new Error("capture read not expected"); } },
);
const pi = {
  appendEntry(type, data) {
    entries.push({ type: "custom", customType: type, data });
  },
};
const host = new ProgramHost(pi, runtime, () => state);
const result = await host.run(
  "installed-call",
  {
    code: 'emit({ installed: true, value: input.value + 1 });',
    description: "installed Worker/WASM smoke",
    operations: [],
    captures: [],
    input: { value: 41 },
    timeoutMs: 1000,
  },
  undefined,
  { cwd: ${JSON.stringify(installation)}, sessionManager: manager },
);
assert.equal(result.details.freeflowRun.programStatus, "completed");
assert.deepEqual(result.details.freeflowRun.emitted, [{ installed: true, value: 42 }]);
assert.equal(result.details.freeflowRun.manifestRef, result.details.freeflowRun.runId);
console.log(JSON.stringify({ status: "passed", runId: result.details.freeflowRun.runId }));
`,
  );
  const output = execFileSync(process.execPath, [script], {
    cwd: installation,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
  const result = JSON.parse(output);
  if (result.status !== "passed") throw new Error("Installed Worker/WASM fixture did not pass");

  const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  const corePackage = JSON.parse(
    readFileSync(join(installation, "node_modules/quickjs-emscripten-core/package.json"), "utf8"),
  );
  const variantPackage = JSON.parse(
    readFileSync(join(installation, "node_modules/@jitl/quickjs-wasmfile-release-sync/package.json"), "utf8"),
  );
  const wasmSha256 = createHash("sha256").update(readFileSync(wasm)).digest("hex");
  if (
    packageJson.dependencies?.["quickjs-emscripten-core"] !== "0.32.0" ||
    packageJson.dependencies?.["@jitl/quickjs-wasmfile-release-sync"] !== "0.32.0" ||
    corePackage.version !== "0.32.0" ||
    variantPackage.version !== "0.32.0" ||
    wasmSha256 !== "105c3bed22d457e43e3d1c3c1c6959fda62a8fe06f0fc8a985303c3a2be72232"
  )
    throw new Error("Installed candidate runtime dependencies are not exact qualified versions");

  console.log(
    `Installed Tool Execution check passed: ${packageJson.name}@${packageJson.version}; Worker and WASM ${wasmSha256} executed from a path containing spaces.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
