// Host extensions built from source: a directory at an exact commit of the definition root's repository, or a
// committed directory under the definition root, optionally built with a declared argv. Each distinct source is
// snapshotted and built once per group into the group's resources, before any subject starts; a failed build
// makes the group invalid. The resolved commit, a hash of the built directory and the build's outcome are recorded
// beside each arm's other host extensions.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, lstat, mkdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

import { runProcess } from "./grade-command.mjs";
import { isContained, isSafeRelativePath } from "./grade-support.mjs";

const BUILD_TIMEOUT_MS = 10 * 60 * 1000;
const COMMIT_REF = /^[0-9a-f]{7,64}$/;
const OUTPUT_TAIL_CHARACTERS = 4000;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Whether a declared host extension is built from source rather than found among installed Pi packages. */
export function isSourceExtension(entry) {
  return isPlainObject(entry) && !Object.hasOwn(entry, "package");
}

/** A declared host extension as the run plan names it. */
export function extensionLabel(entry) {
  if (!isSourceExtension(entry)) return `${entry.package}@${entry.version}`;
  const built = entry.build === undefined ? "" : " (built)";
  return entry.source === undefined
    ? `${entry.path}${built} from the working tree`
    : `${entry.source.path}@${entry.source.ref}${built}`;
}

/**
 * Validates one source-built host extension entry: `{ source: { kind: "git", ref, path }, build?, entry }` or
 * `{ path, build?, entry }`.
 *
 * @param {any} entry
 * @param {string} label
 * @param {(code: string, message: string) => never} fail
 */
export function validateSourceExtension(entry, label, fail) {
  if (!isPlainObject(entry)) fail("invalid-definition", `${label} must be an object`);
  const allowed = Object.hasOwn(entry, "source") ? ["source", "build", "entry"] : ["path", "build", "entry"];
  for (const key of Object.keys(entry)) {
    if (!allowed.includes(key)) fail("invalid-definition", `${label} contains unsupported field ${key}`);
  }
  if (Object.hasOwn(entry, "source")) {
    const source = entry.source;
    if (!isPlainObject(source)) fail("invalid-definition", `${label}.source must be an object`);
    for (const key of Object.keys(source)) {
      if (!["kind", "ref", "path"].includes(key)) {
        fail("invalid-definition", `${label}.source contains unsupported field ${key}`);
      }
    }
    if (source.kind !== "git") fail("invalid-definition", `${label}.source.kind must be git`);
    if (typeof source.ref !== "string" || !COMMIT_REF.test(source.ref)) {
      fail(
        "invalid-definition",
        `${label}.source.ref must be a commit SHA (7 to 64 hex characters), not a branch or tag`,
      );
    }
    if (typeof source.path !== "string" || (source.path !== "." && !isSafeRelativePath(source.path))) {
      fail("unsafe-path", `${label}.source.path must be a directory path relative to the definition root, or "."`);
    }
  } else if (typeof entry.path !== "string" || (entry.path !== "." && !isSafeRelativePath(entry.path))) {
    fail("unsafe-path", `${label} needs package and version, source, or a path inside the definition root`);
  }
  if (typeof entry.entry !== "string" || !isSafeRelativePath(entry.entry)) {
    fail("invalid-definition", `${label}.entry must be a file path relative to the built directory`);
  }
  if (
    Object.hasOwn(entry, "build") &&
    (!Array.isArray(entry.build) ||
      entry.build.length === 0 ||
      !entry.build.every((part) => typeof part === "string" && part !== ""))
  ) {
    fail("invalid-definition", `${label}.build must be a non-empty array of non-empty strings`);
  }
}

/**
 * The working-tree directories that path-sourced host extensions read, across every arm, so the committed-input
 * check covers them.
 *
 * @param {Array<Array<any>>} extensionLists each arm's declared host extensions
 * @param {string} root the definition root
 */
export function sourceExtensionInputs(extensionLists, root) {
  const inputs = new Set();
  for (const extensions of extensionLists) {
    for (const entry of extensions ?? []) {
      if (isSourceExtension(entry) && typeof entry.path === "string") inputs.add(path.resolve(root, entry.path));
    }
  }
  return [...inputs];
}

/**
 * Replaces each arm's deferred source extensions with built ones, building each distinct source and build once.
 * Package extensions pass through unchanged, in their declared order.
 *
 * @param {{ extensions: Record<string, any[]>, root: string, groupDirectory: string, signal?: AbortSignal }} options
 * @returns {Promise<Record<string, any[]>>}
 */
export async function prepareSourceExtensions({ extensions, root, groupDirectory, signal }) {
  const builds = new Map();
  const prepared = {};
  for (const [arm, list] of Object.entries(extensions ?? {})) {
    prepared[arm] = [];
    for (const extension of list ?? []) {
      if (extension?.pending === undefined) {
        prepared[arm].push(extension);
        continue;
      }
      const declared = extension.pending;
      const key = JSON.stringify([declared.source ?? { path: declared.path }, declared.build ?? null]);
      if (!builds.has(key)) {
        const directory = path.join(groupDirectory, "resources", "host-extensions", String(builds.size));
        builds.set(key, await buildSource(declared, { root, directory, signal }));
      }
      const built = builds.get(key);
      const entry = await realpath(path.join(built.root, declared.entry)).catch(() => null);
      if (entry === null || !isContained(built.root, entry) || !(await stat(entry)).isFile()) {
        throw new Error(`host extension entry is missing from its build or escapes it: ${declared.entry}`);
      }
      prepared[arm].push({
        path: entry,
        source: built.source,
        entry: declared.entry,
        directory: path.relative(groupDirectory, built.root).split(path.sep).join("/"),
        sha256: built.sha256,
        build: built.build,
      });
    }
  }
  return prepared;
}

// definitions.mjs imports this module for validation, so the host and sandbox modules load only when building.
async function fingerprintDirectory(directory) {
  const sandbox = await import("./sandbox.mjs");
  return sandbox.fingerprintDirectory(directory);
}

async function buildSource(declared, { root, directory, signal }) {
  const canonicalRoot = await realpath(root);
  const tree = path.join(directory, "source");
  await mkdir(directory, { recursive: true });
  let source;
  if (declared.source !== undefined) {
    const { commit } = await archiveCommit(canonicalRoot, declared.source, tree);
    source = { kind: "git", ref: declared.source.ref, path: declared.source.path, commit };
  } else {
    await snapshotPath(canonicalRoot, declared.path, tree);
    source = { kind: "path", path: declared.path };
  }

  let build = null;
  if (declared.build !== undefined) {
    // The build gets the subject-style isolation: its own home, temp and Pi directories, no copied login.
    const { prepareIsolation } = await import("./hosts/pi/isolation.mjs");
    const isolation = await prepareIsolation(directory, null);
    const { baseProcessEnvironment } = await import("./process.mjs");
    const environment = { ...baseProcessEnvironment(), PWD: tree, ...isolation.environment };
    let result;
    try {
      result = await runProcess(declared.build, { cwd: tree, environment, timeoutMs: BUILD_TIMEOUT_MS, signal });
    } catch (error) {
      throw new Error(`building host extension ${describe(source)} could not start: ${messageOf(error)}`);
    }
    build = {
      argv: declared.build,
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
      stdout: result.stdout.summary().tail.slice(-OUTPUT_TAIL_CHARACTERS),
      stderr: result.stderr.summary().tail.slice(-OUTPUT_TAIL_CHARACTERS),
    };
    if (result.exitCode !== 0 || result.timedOut) {
      const outcome = result.timedOut ? "timed out" : `exit ${result.exitCode ?? result.signal}`;
      const detail = (build.stderr.trim() || build.stdout.trim()).slice(-1000);
      throw new Error(`building host extension ${describe(source)} failed (${outcome})${detail ? `: ${detail}` : ""}`);
    }
  }
  const builtRoot = await realpath(tree);
  const files = await fingerprintDirectory(builtRoot);
  return { root: builtRoot, source, build, sha256: sha256(JSON.stringify(files)) };
}

/** Extracts one directory of an exact commit with `git archive`, from the repository holding the definition root. */
async function archiveCommit(canonicalRoot, source, destination) {
  const repositoryRoot = await realpath((await git(canonicalRoot, ["rev-parse", "--show-toplevel"])).trim());
  if (!isContained(repositoryRoot, canonicalRoot)) throw new Error("definition root is not inside its Git repository");
  const commit = (
    await git(canonicalRoot, ["rev-parse", "--verify", "--end-of-options", `${source.ref}^{commit}`])
  ).trim();
  if (!/^[0-9a-f]{40,64}$/.test(commit)) throw new Error(`Git ref did not resolve to one commit: ${source.ref}`);
  const prefix = path.relative(repositoryRoot, canonicalRoot).split(path.sep).join("/");
  const gitPath = [prefix, source.path === "." ? "" : source.path].filter(Boolean).join("/");
  const type = (
    await git(repositoryRoot, ["cat-file", "-t", gitPath === "" ? commit : `${commit}:${gitPath}`]).catch(() => "")
  ).trim();
  if (type !== "tree") throw new Error(`host extension source ${source.path} is not a directory at ${commit}`);
  await mkdir(destination, { recursive: true });
  await pipeArchive(repositoryRoot, gitPath === "" ? commit : `${commit}:${gitPath}`, destination);
  return { commit };
}

/** `git archive --format=tar <tree> | tar -x -C <destination>`. */
function pipeArchive(repositoryRoot, tree, destination) {
  return new Promise((resolve, reject) => {
    const archive = spawn("git", ["-C", repositoryRoot, "archive", "--format=tar", tree], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const extract = spawn("tar", ["-x", "-f", "-", "-C", destination], {
      shell: false,
      stdio: ["pipe", "ignore", "pipe"],
    });
    archive.stdout.pipe(extract.stdin);
    const errors = [];
    archive.stderr.on("data", (chunk) => errors.push(chunk));
    extract.stderr.on("data", (chunk) => errors.push(chunk));
    let pending = 2;
    let failed = null;
    const done = (label) => (code) => {
      if (code !== 0) failed ??= `${label} exited ${code}`;
      pending -= 1;
      if (pending > 0) return;
      if (failed === null) resolve();
      else reject(new Error(`extracting ${tree} failed (${failed}): ${Buffer.concat(errors).toString("utf8").trim()}`));
    };
    archive.once("error", reject);
    extract.once("error", reject);
    archive.once("close", done("git archive"));
    extract.once("close", done("tar"));
  });
}

/** Copies a committed working-tree directory, refusing one that changes while it is copied. */
async function snapshotPath(canonicalRoot, declaredPath, destination) {
  const sourcePath = await realpath(path.resolve(canonicalRoot, declaredPath)).catch(() => null);
  if (sourcePath === null || !isContained(canonicalRoot, sourcePath)) {
    throw new Error(`host extension path is missing or escapes the definition root: ${declaredPath}`);
  }
  if (!(await lstat(sourcePath)).isDirectory())
    throw new Error(`host extension path is not a directory: ${declaredPath}`);
  const before = JSON.stringify(await fingerprintDirectory(sourcePath));
  await cp(sourcePath, destination, { recursive: true, dereference: false, errorOnExist: true, force: false });
  const copied = JSON.stringify(await fingerprintDirectory(destination));
  const after = JSON.stringify(await fingerprintDirectory(sourcePath));
  if (copied !== before || after !== before) {
    throw new Error(`host extension path changed while it was being snapshotted: ${declaredPath}`);
  }
}

function git(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["-C", cwd, ...args], { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(Buffer.concat(stdout).toString("utf8"));
      else reject(new Error(`git ${args[0]} failed: ${Buffer.concat(stderr).toString("utf8").trim()}`));
    });
  });
}

function describe(source) {
  return source.kind === "git" ? `${source.path} at ${source.commit.slice(0, 12)}` : source.path;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
