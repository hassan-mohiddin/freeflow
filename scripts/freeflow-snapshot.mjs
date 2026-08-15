import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, relative, resolve, sep, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const MAX_BUFFER = 256 * 1024 * 1024;

export const FREEFLOW_PACKAGE_NAME = "@hassangameryt/freeflow";
export const DEFAULT_TARGET_DIR = join(homedir(), ".cache", "freeflow", "pi-package");
export const DEFAULT_REQUIRED_RUNTIME_ENTRYPOINTS = ["pi-extension/freeflow/index.js"];

const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function expandHome(value) {
  const home = homedir();
  return value.replace(/^~(?=$|\/)/, home);
}

function commandText(command, args) {
  return [command, ...args].join(" ");
}

async function run(command, args, options = {}) {
  try {
    return await execFile(command, args, { maxBuffer: MAX_BUFFER, ...options });
  } catch (error) {
    const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : "";
    const stdout = typeof error?.stdout === "string" ? error.stdout.trim() : "";
    const detail = stderr || stdout || (error instanceof Error ? error.message : String(error));
    throw new Error(`${commandText(command, args)} failed: ${detail}`, { cause: error });
  }
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function readJson(path, label) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`Could not read ${label} at ${path}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Could not parse ${label} at ${path}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
}

async function gitOutput(sourceRoot, args) {
  const result = await run("git", args, { cwd: sourceRoot });
  return result.stdout.trim();
}

async function resolveRepository(sourceRoot) {
  const canonicalSourceRoot = await realpath(sourceRoot);
  const reportedRepository = await gitOutput(sourceRoot, ["rev-parse", "--show-toplevel"]);
  const repository = await realpath(resolve(reportedRepository));
  if (repository !== canonicalSourceRoot) {
    throw new Error(`Source root must be the Git repository root: ${sourceRoot}`);
  }
  return repository;
}

async function resolveRevision(sourceRoot, selector) {
  const sourceCommit = await gitOutput(sourceRoot, [
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${selector}^{commit}`,
  ]);
  const sourceTree = await gitOutput(sourceRoot, [
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${sourceCommit}^{tree}`,
  ]);
  return { sourceCommit, sourceTree };
}

async function worktreeIsDirty(sourceRoot) {
  const status = await gitOutput(sourceRoot, ["status", "--porcelain=v1", "--untracked-files=all"]);
  return status.length > 0;
}

async function extractTar(archivePath, destination, gzip = false) {
  await mkdir(destination, { recursive: true });
  await run("tar", [gzip ? "-xzf" : "-xf", archivePath, "-C", destination]);
}

async function packageWithNpm(archiveRoot, destination) {
  await mkdir(destination, { recursive: true });
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = await run(npmCommand, ["pack", "--ignore-scripts", "--json", "--pack-destination", destination], {
    cwd: archiveRoot,
  });
  let records;
  try {
    records = JSON.parse(result.stdout.trim());
  } catch (error) {
    throw new Error(`npm pack returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
  const record = Array.isArray(records) ? records.at(-1) : records;
  if (!record || typeof record.filename !== "string") {
    throw new Error("npm pack did not report a tarball filename");
  }
  const tarballPath = resolve(destination, record.filename);
  if (!(await isFile(tarballPath))) {
    throw new Error(`npm pack reported a missing tarball: ${tarballPath}`);
  }
  return { record, tarballPath };
}

function assertSafeRelativePath(entrypoint) {
  if (
    typeof entrypoint !== "string" ||
    entrypoint.length === 0 ||
    entrypoint.startsWith("/") ||
    entrypoint.startsWith("\\") ||
    entrypoint.split(/[\\/]+/).includes("..")
  ) {
    throw new Error(`Invalid runtime entrypoint in package metadata: ${String(entrypoint)}`);
  }
}

async function validatePackage(packageRoot, { expectedPackageName, requiredRuntimeEntrypoints }) {
  const packageJsonPath = join(packageRoot, "package.json");
  const packageJson = await readJson(packageJsonPath, "packed package metadata");
  if (packageJson.name !== expectedPackageName) {
    throw new Error(`Packed package name ${String(packageJson.name)} does not match ${expectedPackageName}`);
  }
  if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
    throw new Error("Packed package metadata has no version");
  }

  const entrypoints = new Set(requiredRuntimeEntrypoints);
  for (const entrypoint of entrypoints) {
    assertSafeRelativePath(entrypoint);
    if (!(await isFile(join(packageRoot, entrypoint)))) {
      throw new Error(`Packed package is missing required runtime entrypoint: ${entrypoint}`);
    }
  }
  return packageJson;
}

function digest(buffer, algorithm, encoding = "hex") {
  return createHash(algorithm).update(buffer).digest(encoding);
}

async function countFiles(root) {
  let count = 0;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) count += await countFiles(path);
    else count += 1;
  }
  return count;
}

function uniqueToken() {
  return `${Date.now()}-${process.pid}-${Math.random().toString(16).slice(2)}`;
}

function failAt(stage, configuredStage) {
  if (configuredStage === stage) throw new Error(`Injected snapshot failure at ${stage}`);
}

async function restoreAfterPublicationFailure({
  metadata,
  metadataBackup,
  metadataBackedUp,
  metadataInstalled,
  target,
  targetBackup,
  targetBackedUp,
  targetInstalled,
}) {
  const rollbackErrors = [];
  const attempt = async (action) => {
    try {
      await action();
    } catch (error) {
      rollbackErrors.push(error instanceof Error ? error.message : String(error));
    }
  };

  if (metadataInstalled) await attempt(() => rm(metadata, { force: true }));
  if (targetInstalled) await attempt(() => rm(target, { recursive: true, force: true }));
  if (metadataBackedUp && (await exists(metadataBackup))) await attempt(() => rename(metadataBackup, metadata));
  if (targetBackedUp && (await exists(targetBackup))) await attempt(() => rename(targetBackup, target));

  if (rollbackErrors.length > 0) {
    throw new Error(`Snapshot publication failed and rollback was incomplete: ${rollbackErrors.join("; ")}`);
  }
}

function defaultMetadataPath(target) {
  return `${target}.snapshot.json`;
}

function normalizeOptions(options) {
  const sourceRoot = resolve(expandHome(options.sourceRoot ?? SCRIPT_ROOT));
  const target = resolve(expandHome(options.targetDir ?? DEFAULT_TARGET_DIR));
  const metadata = resolve(expandHome(options.metadataPath ?? defaultMetadataPath(target)));
  const metadataRelativeToTarget = relative(target, metadata);
  if (metadata === target || (metadataRelativeToTarget && !metadataRelativeToTarget.startsWith(`..${sep}`))) {
    throw new Error("metadataPath must be outside targetDir");
  }
  return {
    commit: options.commit ?? "HEAD",
    expectedPackageName: options.expectedPackageName ?? FREEFLOW_PACKAGE_NAME,
    failAt: options.failAt,
    metadata,
    requiredRuntimeEntrypoints: options.requiredRuntimeEntrypoints ?? DEFAULT_REQUIRED_RUNTIME_ENTRYPOINTS,
    sourceRoot,
    target,
  };
}

export async function refreshSnapshot(options = {}) {
  const config = normalizeOptions(options);
  config.sourceRoot = await resolveRepository(config.sourceRoot);
  const { sourceCommit, sourceTree } = await resolveRevision(config.sourceRoot, config.commit);
  const dirtyWorktree = await worktreeIsDirty(config.sourceRoot);
  const targetParent = dirname(config.target);
  const metadataParent = dirname(config.metadata);
  const previousTargetPresent = await exists(config.target);
  const previousMetadataPresent = await exists(config.metadata);
  const operation = previousTargetPresent ? "replacement" : "first-installation";
  await mkdir(targetParent, { recursive: true });
  await mkdir(metadataParent, { recursive: true });

  const workRoot = await mkdtemp(join(targetParent, `.${basename(config.target)}.work-`));
  const metadataWorkRoot = await mkdtemp(join(metadataParent, `.${basename(config.metadata)}.work-`));
  const archivePath = join(workRoot, "source.tar");
  const archiveRoot = join(workRoot, "source");
  const packageTarballRoot = join(workRoot, "package-tarball");
  const packageExtractRoot = join(workRoot, "package-extract");
  const metadataTemp = join(metadataWorkRoot, "snapshot.json");
  let targetBackup;
  let metadataBackup;
  let targetBackedUp = false;
  let metadataBackedUp = false;
  let targetInstalled = false;
  let metadataInstalled = false;
  let published = false;
  let publishedMetadata;

  try {
    failAt("archive", config.failAt);
    await run("git", ["archive", "--format=tar", "--output", archivePath, sourceCommit], {
      cwd: config.sourceRoot,
    });
    await extractTar(archivePath, archiveRoot);

    failAt("package", config.failAt);
    const { record: packRecord, tarballPath } = await packageWithNpm(archiveRoot, packageTarballRoot);
    const tarball = await readFile(tarballPath);
    await extractTar(tarballPath, packageExtractRoot, true);
    const packageRoot = join(packageExtractRoot, "package");
    const packageJson = await validatePackage(packageRoot, config);
    let packageFileCount;
    if (typeof packRecord.entryCount === "number") packageFileCount = packRecord.entryCount;
    else if (Array.isArray(packRecord.files)) packageFileCount = packRecord.files.length;
    else packageFileCount = await countFiles(packageRoot);

    const metadata = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      sourceRepository: config.sourceRoot,
      sourceSelector: config.commit,
      sourceCommit,
      sourceTree,
      sourceWorktreeDirty: dirtyWorktree,
      committedContentOnly: true,
      ignoredFilesExcluded: true,
      construction: "git archive <commit> followed by npm pack --ignore-scripts",
      packageName: packageJson.name,
      packageVersion: packageJson.version,
      npmPackIntegrity: `sha512-${digest(tarball, "sha512", "base64")}`,
      npmPackShasum: digest(tarball, "sha1"),
      tarballSha256: digest(tarball, "sha256"),
      fileCount: packageFileCount,
      target: config.target,
      operation,
      previousTargetPresent,
      previousMetadataPresent,
    };
    publishedMetadata = metadata;
    failAt("provenance", config.failAt);
    await writeFile(metadataTemp, `${JSON.stringify(metadata, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });

    failAt("validation", config.failAt);
    if (previousTargetPresent) {
      targetBackup = `${config.target}.previous.${uniqueToken()}`;
      await rename(config.target, targetBackup);
      targetBackedUp = true;
    }
    if (previousMetadataPresent) {
      metadataBackup = `${config.metadata}.previous.${uniqueToken()}`;
      await rename(config.metadata, metadataBackup);
      metadataBackedUp = true;
    }

    failAt("publication", config.failAt);
    await rename(packageRoot, config.target);
    targetInstalled = true;
    failAt("publication-after-target", config.failAt);
    await rename(metadataTemp, config.metadata);
    metadataInstalled = true;
    failAt("publication-after-metadata", config.failAt);
    await validatePackage(config.target, config);
    published = true;
  } catch (error) {
    if (targetBackedUp || metadataBackedUp || targetInstalled || metadataInstalled) {
      try {
        await restoreAfterPublicationFailure({
          metadata: config.metadata,
          metadataBackup,
          metadataBackedUp,
          metadataInstalled,
          target: config.target,
          targetBackup,
          targetBackedUp,
          targetInstalled,
        });
      } catch (rollbackError) {
        throw new Error(
          `${error instanceof Error ? error.message : String(error)}; ${
            rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
          }`,
          { cause: error },
        );
      }
    }
    throw error;
  } finally {
    if (published) {
      if (targetBackup) await rm(targetBackup, { recursive: true, force: true });
      if (metadataBackup) await rm(metadataBackup, { force: true });
    }
    await rm(workRoot, { recursive: true, force: true });
    await rm(metadataWorkRoot, { recursive: true, force: true });
  }

  return {
    metadataPath: config.metadata,
    operation,
    packageName: publishedMetadata.packageName,
    packageVersion: publishedMetadata.packageVersion,
    previousMetadataPresent,
    previousTargetPresent,
    sourceCommit,
    sourceTree,
    target: config.target,
    worktreeDirty: dirtyWorktree,
  };
}

export function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    const [name, inlineValue] = argument.split("=", 2);
    if (!["--commit", "--source-root", "--target", "--metadata"].includes(name)) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const value = inlineValue ?? argv[++index];
    if (!value) throw new Error(`${name} requires a value`);
    if (name === "--commit") options.commit = value;
    if (name === "--source-root") options.sourceRoot = value;
    if (name === "--target") options.targetDir = value;
    if (name === "--metadata") options.metadataPath = value;
  }
  return options;
}

function usage() {
  return [
    "Usage: node scripts/freeflow-snapshot.mjs [options]",
    "",
    "Refresh the exact-commit Freeflow development package snapshot.",
    "",
    "Options:",
    "  --commit <ref>       Git commit/ref to package (default: HEAD)",
    "  --source-root <dir>  Freeflow Git repository (default: this repository)",
    "  --target <dir>       Stable package target (default: ~/.cache/freeflow/pi-package)",
    "  --metadata <file>    Provenance sidecar (default: <target>.snapshot.json)",
  ].join("\n");
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
    } else {
      const result = await refreshSnapshot(options);
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
