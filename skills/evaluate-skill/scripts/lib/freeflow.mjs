import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const SNAPSHOT_SCRIPT = path.join("scripts", "freeflow-snapshot.mjs");
const ENTRY = path.join("pi-extension", "freeflow", "index.js");
const VALIDATOR = path.join("pi-extension", "dist", "host", "config-validation.js");

/**
 * Builds the Freeflow package each arm declares, once per distinct commit, into the group's resources, and
 * checks each arm's settings with the validator from its own build. Any failure refuses the group before a
 * subject starts. The build uses the definition root's own snapshot tool with an explicit target, so the
 * user's development snapshot is never touched.
 *
 * @param {{variants: Record<string, any>, root: string, groupDirectory: string}} options
 * @returns {Promise<Record<string, any>>} each arm's built Freeflow, or null when it declares none
 */
export async function prepareFreeflow({ variants, root, groupDirectory }) {
  const builds = new Map();
  const prepared = {};
  for (const [arm, variant] of Object.entries(variants)) {
    const freeflow = variant.freeflow;
    if (!freeflow) {
      prepared[arm] = null;
      continue;
    }
    if (!builds.has(freeflow.source.ref)) {
      builds.set(freeflow.source.ref, await build(freeflow.source.ref, root, groupDirectory, builds.size));
    }
    const built = builds.get(freeflow.source.ref);
    const validator = await import(pathToFileURL(path.join(built.packageRoot, VALIDATOR)).href);
    const problems = [
      ["repository", validator.validateRepositoryConfig(freeflow.repository)],
      ["personal", validator.validateLocalConfig(freeflow.personal)],
    ].filter(([, problem]) => problem !== null);
    if (problems.length > 0) {
      throw new Error(
        `${arm} Freeflow settings are invalid for ${built.commit.slice(0, 12)}: ${problems.map(([scope, problem]) => `${scope}: ${problem}`).join("; ")}`,
      );
    }
    prepared[arm] = {
      ...built,
      ref: freeflow.source.ref,
      repository: freeflow.repository,
      personal: freeflow.personal,
    };
  }
  return prepared;
}

async function build(ref, root, groupDirectory, index) {
  const script = path.join(root, SNAPSHOT_SCRIPT);
  if (!(await stat(script).catch(() => null))) {
    throw new Error(`a Freeflow configuration needs ${SNAPSHOT_SCRIPT} in the definition root`);
  }
  const directory = path.join(groupDirectory, "resources", "freeflow", String(index));
  await mkdir(directory, { recursive: true });
  const packageRoot = path.join(directory, "package");
  const metadataFile = path.join(directory, "snapshot.json");
  try {
    await run(
      process.execPath,
      [script, "--commit", ref, "--source-root", root, "--target", packageRoot, "--metadata", metadataFile],
      { cwd: root, timeout: 5 * 60 * 1000, maxBuffer: 16 * 1024 * 1024 },
    );
  } catch (error) {
    const detail = error?.stderr?.trim() || (error instanceof Error ? error.message : String(error));
    throw new Error(`building Freeflow at ${ref} failed: ${detail}`);
  }
  const metadata = JSON.parse(await readFile(metadataFile, "utf8"));
  const entry = path.join(packageRoot, ENTRY);
  if (!(await stat(entry).catch(() => null))) throw new Error(`the Freeflow build at ${ref} has no ${ENTRY}`);
  if (typeof metadata.sourceCommit !== "string") throw new Error(`the Freeflow build at ${ref} recorded no commit`);
  return {
    commit: metadata.sourceCommit,
    package: `${metadata.packageName}@${metadata.packageVersion}`,
    tarballSha256: metadata.tarballSha256 ?? null,
    packageRoot,
    entry,
    metadata: path.relative(groupDirectory, metadataFile),
  };
}

/**
 * Writes an arm's Freeflow settings into its workspace before the subject starts. A fixture that already
 * carries either file is refused: the settings belong to the configuration, where the comparison declares them.
 */
export async function writeFreeflowSettings(workspace, freeflow) {
  const directory = path.join(workspace, ".freeflow");
  for (const file of ["config.json", "local.json"]) {
    if (await stat(path.join(directory, file)).catch(() => null)) {
      throw new Error(`the fixture already has .freeflow/${file}; declare Freeflow settings in configuration.freeflow`);
    }
  }
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "config.json"), `${JSON.stringify(freeflow.repository, null, 2)}\n`);
  if (Object.keys(freeflow.personal).length > 0) {
    await writeFile(path.join(directory, "local.json"), `${JSON.stringify(freeflow.personal, null, 2)}\n`);
  }
}
