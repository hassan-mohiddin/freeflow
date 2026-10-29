import { randomUUID } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { lstat, mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { readFileSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export class StoreError extends Error {
  constructor(code, message, details = {}, exitCode = 1) {
    super(message);
    this.name = "StoreError";
    this.code = code;
    this.details = details;
    this.exitCode = exitCode;
  }
}

function fail(code, message, details = {}, exitCode = 1) {
  throw new StoreError(code, message, details, exitCode);
}

async function gitCommand(root, args) {
  try {
    const result = await execFile("git", ["-C", root, ...args], { maxBuffer: 1024 * 1024 });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return { ok: false, code: error?.code, stdout: error?.stdout ?? "", stderr: error?.stderr ?? "" };
  }
}

async function assertGitSafePath(root, path, { directory = false } = {}) {
  const repository = await gitCommand(root, ["rev-parse", "--show-toplevel"]);
  if (!repository.ok) return;
  const repositoryRoot = canonicalPath(repository.stdout.trim());
  // The Freeflow store tracks its records on purpose; every other repository must ignore them.
  if (isFreeflowStore(repositoryRoot)) return;
  const relativePath = relative(repositoryRoot, canonicalPath(path)).split(sep).join("/");
  // A trailing slash lets a directory-only rule such as `.freeflow/*/` match a folder that does not exist yet.
  const ignorePath = directory ? `${relativePath}/` : relativePath;
  const ignored = await gitCommand(repositoryRoot, ["check-ignore", "--no-index", "-q", "--", ignorePath]);
  if (!ignored.ok) fail("unignored-path", `Record path is not ignored by Git: ${relativePath}`);
  const tracked = await gitCommand(repositoryRoot, ["ls-files", "--error-unmatch", "--", relativePath]);
  if (tracked.ok) fail("tracked-path", `Record path is already tracked by Git: ${relativePath}`);
}

function inside(root, candidate) {
  const rootPath = resolve(root);
  const candidatePath = resolve(candidate);
  const relativePath = relative(rootPath, candidatePath);
  return (
    relativePath === "" || (!relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath))
  );
}

async function assertNoSymlinkPath(target, stopAt) {
  let current = resolve(target);
  const boundary = resolve(stopAt);
  while (inside(boundary, current)) {
    try {
      if ((await lstat(current)).isSymbolicLink())
        fail("unsafe-symlink", `Mutable path contains a symlink: ${current}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (current === boundary) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

/** The marker a project store keeps at its root; see registry.mjs. The Freeflow store's root marker has the same name. */
export const STORE_MARKER = "store.json";

/** The `kind` in the Freeflow store's root marker (lib/freeflow-store.mjs). */
export const FREEFLOW_STORE_KIND = "freeflow-store";

/** Whether root is the Freeflow store: one Git repository whose records are tracked on purpose. */
export function isFreeflowStore(root) {
  try {
    const marker = JSON.parse(readFileSync(join(root, STORE_MARKER), "utf8"));
    return marker?.kind === FREEFLOW_STORE_KIND && marker.version === 1;
  } catch {
    return false;
  }
}

/** In a tasks directory: the highest task number a removal took away, so numbering never goes back. */
export const LAST_TASK_NUMBER = ".last-task-number";

/** Whether root is a project store: its store.json is the registry's marker, not some other file of that name. */
function isStore(root) {
  try {
    const marker = JSON.parse(readFileSync(join(root, STORE_MARKER), "utf8"));
    return marker?.version === 1 && typeof marker.project === "string";
  } catch {
    return false;
  }
}

/** A repository keeps its records in .freeflow/tasks; a project store, marked by store.json, in tasks. */
export function taskRoot(root) {
  return isStore(root) ? resolve(root, "tasks") : resolve(root, ".freeflow", "tasks");
}

/** The project store holding an absolute record path (<store>/tasks/<task>/record.md), or undefined. */
export function storeOf(recordPath) {
  const store = dirname(dirname(dirname(resolve(recordPath))));
  return basename(dirname(dirname(resolve(recordPath)))) === "tasks" && isStore(store) ? store : undefined;
}

/**
 * The path with every symlink resolved, including for a path that does not exist yet: the nearest existing ancestor is
 * resolved and the rest appended. Git reports canonical paths, so comparisons with it need the same form.
 */
function canonicalPath(path) {
  const candidate = resolve(path);
  const missing = [];
  let current = candidate;
  for (;;) {
    try {
      return join(realpathSync(current), ...missing);
    } catch {
      const parent = dirname(current);
      if (parent === current) return candidate;
      missing.unshift(basename(current));
      current = parent;
    }
  }
}

export function resolveRecordPath(root, supplied) {
  if (!supplied) fail("missing-record", "A record path is required");
  const rootPath = canonicalPath(root);
  const tasks = canonicalPath(taskRoot(rootPath));
  const candidate = isAbsolute(supplied) ? resolve(supplied) : resolve(rootPath, supplied);
  const recordPath = basename(candidate) === "record.md" ? candidate : join(candidate, "record.md");
  const canonicalRecord = canonicalPath(recordPath);
  if (!inside(tasks, canonicalRecord) || basename(canonicalRecord) !== "record.md")
    fail("unsafe-path", `Record must be a record.md below ${tasks}; pass --root or an absolute --record path`);
  const taskDirectory = basename(dirname(canonicalRecord));
  if (!/^task-\d{3,}-[a-z0-9][a-z0-9-]*$/.test(taskDirectory))
    fail("unsafe-path", `Invalid task directory: ${taskDirectory}`);
  return canonicalRecord;
}

export async function assertRecordPath(root, recordPath) {
  const path = resolveRecordPath(root, recordPath);
  await assertNoSymlinkPath(path, canonicalPath(taskRoot(root)));
  await assertGitSafePath(root, path);
  return path;
}

export async function readRecord(root, recordPath) {
  const path = await assertRecordPath(root, recordPath);
  try {
    return { path, text: await readFile(path, "utf8") };
  } catch (error) {
    if (error?.code === "ENOENT") fail("missing-record", `Record does not exist: ${path}`);
    fail("record-read-failure", `Could not read record: ${path}`);
  }
}

export async function readInput(inputPath, cwd = process.cwd()) {
  if (!inputPath) return "";
  if (inputPath === "-")
    return new Promise((resolveInput, reject) => {
      let text = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => {
        text += chunk;
      });
      process.stdin.on("end", () => resolveInput(text));
      process.stdin.on("error", reject);
    });
  try {
    return await readFile(isAbsolute(inputPath) ? inputPath : resolve(cwd, inputPath), "utf8");
  } catch {
    fail("input-read-failure", `Could not read input: ${inputPath}`);
  }
}

export async function nextTaskNumber(tasks) {
  let entries = [];
  try {
    entries = await readdir(tasks, { withFileTypes: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  // Numbers are never reused, so an old reference to a deleted task cannot point at a new one; a removal records the
  // highest number it took away (LAST_TASK_NUMBER), since its directory is gone.
  let highest = Number((await readFile(join(tasks, LAST_TASK_NUMBER), "utf8").catch(() => "0")).trim()) || 0;
  for (const entry of entries) {
    const match = /^task-(\d{3,})-/.exec(entry.name);
    if (entry.isDirectory() && match) highest = Math.max(highest, Number(match[1]));
  }
  return highest + 1;
}

export async function createRecordPath(root, taskName, slug) {
  const tasks = taskRoot(root);
  await assertGitSafePath(root, tasks, { directory: true });
  await mkdir(tasks, { recursive: true });
  await assertNoSymlinkPath(tasks, canonicalPath(root));
  const number = await nextTaskNumber(tasks);
  const directory = join(tasks, `task-${String(number).padStart(3, "0")}-${slug}`);
  const path = join(directory, "record.md");
  await assertGitSafePath(root, path);
  try {
    await mkdir(directory, { recursive: false });
  } catch (error) {
    if (error?.code === "EEXIST") fail("task-already-exists", `Task directory already exists: ${directory}`);
    throw error;
  }
  // The task's place for temporary work, ignored by Git with the rest of the task directory.
  await mkdir(join(directory, "scratch"));
  return { path, taskName };
}

export async function writeInitialAtomically(root, recordPath, text) {
  const path = await assertRecordPath(root, recordPath);
  const temporaryPath = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  let published = false;
  try {
    await writeFile(temporaryPath, text, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, path);
    published = true;
    const confirmedText = await readFile(path, "utf8");
    if (confirmedText !== text) fail("publication-confirmation", "Published record differs from the candidate", {}, 2);
  } catch (error) {
    if (!published) await unlink(temporaryPath).catch(() => undefined);
    if (error instanceof StoreError) throw error;
    fail("publication-failure", `Could not publish record: ${error?.code ?? "write"}`, {}, published ? 2 : 1);
  }
  return { path, changed: true };
}

export async function writeAtomically(root, recordPath, sourceText, candidateText) {
  const path = await assertRecordPath(root, recordPath);
  let currentText;
  try {
    currentText = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") fail("missing-record", `Record does not exist: ${path}`);
    throw error;
  }
  if (currentText !== sourceText)
    fail("stale-source", "Record changed while the operation was preparing; nothing was written");
  if (candidateText === sourceText) return { path, changed: false };

  const temporaryPath = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  let published = false;
  try {
    await writeFile(temporaryPath, candidateText, { encoding: "utf8", flag: "wx" });
    const beforeRename = await readFile(path, "utf8");
    if (beforeRename !== sourceText) fail("stale-source", "Record changed before publication; nothing was written");
    await rename(temporaryPath, path);
    published = true;
    let confirmedText;
    try {
      confirmedText = await readFile(path, "utf8");
    } catch (error) {
      fail("publication-confirmation", `Could not confirm published record: ${error?.code ?? "read"}`, {}, 2);
    }
    if (confirmedText !== candidateText)
      fail("publication-confirmation", "Published record differs from the candidate", {}, 2);
  } catch (error) {
    if (!published) await unlink(temporaryPath).catch(() => undefined);
    if (error instanceof StoreError) throw error;
    fail("publication-failure", `Could not publish record: ${error?.code ?? "write"}`, {}, published ? 2 : 1);
  }
  return { path, changed: true };
}

export function displayPath(root, path) {
  const relativePath = relative(resolve(root), resolve(path));
  return relativePath && !relativePath.startsWith(`..${sep}`) && relativePath !== ".." ? relativePath : path;
}
