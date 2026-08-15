import { cp, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SNAPSHOT_MARKER = ".piflow-snapshot.json";
export const EXCLUDED_STATE_NAMES = new Set(["sessions", "run-history.jsonl"]);

export function piflowPaths(env = process.env) {
  const home = env.HOME ? resolve(env.HOME) : homedir();
  return {
    sourceAgentDir: env.PIFLOW_SOURCE_AGENT_DIR
      ? resolve(env.PIFLOW_SOURCE_AGENT_DIR.replace(/^~(?=$|\/)/, home))
      : join(home, ".pi", "agent"),
    targetAgentDir: env.PIFLOW_AGENT_DIR
      ? resolve(env.PIFLOW_AGENT_DIR.replace(/^~(?=$|\/)/, home))
      : join(home, ".piflow", "agent"),
    freeflowRoot: env.PIFLOW_FREEFLOW_ROOT
      ? resolve(env.PIFLOW_FREEFLOW_ROOT)
      : resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  };
}

function isExcluded(sourceRoot, candidate) {
  const relative = candidate.slice(sourceRoot.length).replace(/^[/\\]/, "");
  if (!relative) return false;
  const first = relative.split(/[/\\]/, 1)[0];
  return EXCLUDED_STATE_NAMES.has(first);
}

async function copyTree(source, target) {
  await mkdir(target, { recursive: true });
  await cp(source, target, {
    recursive: true,
    force: true,
    errorOnExist: false,
    filter: (candidate) => !isExcluded(source, candidate),
  });
}

function packageSource(packageEntry) {
  return typeof packageEntry === "string" ? packageEntry : packageEntry?.source;
}

function replacePackageSource(packageEntry, source) {
  if (typeof packageEntry === "string") return source;
  if (!packageEntry || typeof packageEntry !== "object") return packageEntry;
  return { ...packageEntry, source };
}

function isFreeflowSource(source) {
  return typeof source === "string" && /(?:^|[/:])freeflow(?:$|[/:])/i.test(source);
}

function isAbsoluteLocalSource(source) {
  return typeof source === "string" && source.startsWith("/");
}

function safePackageDirectoryName(source) {
  return basename(source).replace(/[^A-Za-z0-9._-]+/g, "-") || "package";
}

async function rewriteFunctionalSettings(targetAgentDir, freeflowRoot) {
  const settingsPath = join(targetAgentDir, "settings.json");
  let settings;
  try {
    settings = JSON.parse(await readFile(settingsPath, "utf8"));
  } catch (error) {
    throw new Error(
      `PiFlow requires a valid copied settings.json: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const packages = Array.isArray(settings.packages) ? settings.packages : [];
  const rewrittenPackages = [];
  const externalCopies = [];
  for (const packageEntry of packages) {
    const source = packageSource(packageEntry);
    if (isFreeflowSource(source)) {
      rewrittenPackages.push(replacePackageSource(packageEntry, freeflowRoot));
      continue;
    }
    if (isAbsoluteLocalSource(source) && source !== freeflowRoot) {
      const target = join(targetAgentDir, "local-packages", safePackageDirectoryName(source));
      externalCopies.push({ source, target });
      rewrittenPackages.push(replacePackageSource(packageEntry, target));
      continue;
    }
    rewrittenPackages.push(packageEntry);
  }

  for (const { source, target } of externalCopies) {
    await rm(target, { recursive: true, force: true });
    await copyTree(source, target);
  }

  settings.packages = rewrittenPackages;
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  await rm(join(targetAgentDir, "local-packages", "freeflow"), { recursive: true, force: true });
}

async function preserveTargetHistory(targetAgentDir, stagingDir) {
  for (const name of EXCLUDED_STATE_NAMES) {
    const source = join(targetAgentDir, name);
    const target = join(stagingDir, name);
    try {
      await rename(source, target);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

async function restoreTargetHistory(stagingDir, targetAgentDir) {
  for (const name of EXCLUDED_STATE_NAMES) {
    const source = join(stagingDir, name);
    const target = join(targetAgentDir, name);
    try {
      await rename(source, target);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

async function backupExistingTarget(targetAgentDir) {
  try {
    await readdir(targetAgentDir);
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
  const backup = `${targetAgentDir}.backup.${new Date().toISOString().replace(/[-:.TZ]/g, "")}`;
  await rename(targetAgentDir, backup);
  return backup;
}

export async function syncFromPi({ sourceAgentDir, targetAgentDir, freeflowRoot } = piflowPaths()) {
  if (resolve(sourceAgentDir) === resolve(targetAgentDir)) {
    throw new Error("PiFlow source and target agent directories must be different.");
  }

  const sourceSettings = join(sourceAgentDir, "settings.json");
  try {
    await readFile(sourceSettings, "utf8");
  } catch (error) {
    throw new Error(
      `Normal Pi settings were not found at ${sourceSettings}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const backup = await backupExistingTarget(targetAgentDir);
  const stagingDir = await mkdtemp(join(tmpdir(), "piflow-sync-"));
  try {
    if (backup) await preserveTargetHistory(backup, stagingDir);
    await copyTree(sourceAgentDir, targetAgentDir);
    await rewriteFunctionalSettings(targetAgentDir, freeflowRoot);
    await restoreTargetHistory(stagingDir, targetAgentDir);
    await writeFile(
      join(targetAgentDir, SNAPSHOT_MARKER),
      `${JSON.stringify(
        {
          version: 1,
          sourceAgentDir,
          freeflowRoot,
          syncedAt: new Date().toISOString(),
          excluded: [...EXCLUDED_STATE_NAMES],
          backup,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    return { targetAgentDir, backup, marker: join(targetAgentDir, SNAPSHOT_MARKER) };
  } catch (error) {
    await rm(targetAgentDir, { recursive: true, force: true });
    if (backup) {
      await restoreTargetHistory(stagingDir, backup);
      await rename(backup, targetAgentDir);
    }
    throw error;
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
}

async function ensurePiFlowSnapshot(paths = piflowPaths()) {
  try {
    await readFile(join(paths.targetAgentDir, SNAPSHOT_MARKER), "utf8");
    return { initialized: false, targetAgentDir: paths.targetAgentDir };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return { initialized: true, ...(await syncFromPi(paths)) };
}

if (process.argv[1]?.endsWith("/scripts/piflow.mjs")) {
  const action = process.argv[2];
  const paths = piflowPaths();
  if (action !== "sync-from-pi" && action !== "--ensure") {
    console.error("Usage: piflow sync-from-pi");
    process.exitCode = 2;
  } else {
    try {
      const result = action === "--ensure" ? await ensurePiFlowSnapshot(paths) : await syncFromPi(paths);
      if (action === "sync-from-pi") {
        console.log(`PiFlow synced from normal Pi into ${result.targetAgentDir}.`);
        if (result.backup) console.log(`Previous PiFlow state preserved at ${result.backup}.`);
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
