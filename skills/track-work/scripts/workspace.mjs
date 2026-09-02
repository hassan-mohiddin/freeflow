import { execFile as execFileCallback } from "node:child_process";
import { access, lstat, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export class WorkspaceError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "WorkspaceError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new WorkspaceError(code, message, details);
}

export function pathInside(root, candidate) {
  const rootPath = resolve(root);
  const candidatePath = resolve(candidate);
  const rel = relative(rootPath, candidatePath);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

export async function assertNoSymlinkPath(path, stopAt) {
  let current = resolve(path);
  const boundary = resolve(stopAt);
  while (pathInside(boundary, current)) {
    try {
      const entry = await lstat(current);
      if (entry.isSymbolicLink()) fail("unsafe-symlink", `Mutable path contains a symlink: ${current}`);
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      if (error?.code !== "ENOENT") throw error;
    }
    if (current === boundary) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

export function taskRoot(root) {
  return resolve(root, ".freeflow", "tasks");
}

export function taskDirectory(number, shortName) {
  if (!Number.isSafeInteger(number) || number < 1)
    fail("invalid-task-number", "Task number must be a positive safe integer");
  if (typeof shortName !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(shortName))
    fail("invalid-short-name", "Short name must contain lowercase letters, digits, and hyphens only");
  return `task-${String(number).padStart(3, "0")}-${shortName}`;
}

export function taskRecordPath(root, number, shortName) {
  return join(taskRoot(root), taskDirectory(number, shortName), "record.md");
}

export function nextTaskNumber(entries) {
  const used = new Set();
  for (const entry of entries) {
    const name = typeof entry === "string" ? entry : entry?.name;
    const isDirectory = typeof entry === "string" || entry?.isDirectory?.();
    const match = /^task-(\d+)-/.exec(name ?? "");
    if (isDirectory && match) used.add(Number(match[1]));
  }
  let number = 1;
  while (used.has(number)) number += 1;
  return number;
}

export async function assertSafeRecordPath(root, recordPath) {
  const tasks = taskRoot(root);
  const resolvedPath = resolve(recordPath);
  if (!pathInside(tasks, resolvedPath) || basename(resolvedPath) !== "record.md")
    fail("unsafe-path", "Record must be a record.md under the task root");
  const taskName = basename(dirname(resolvedPath));
  if (!/^task-\d+-[a-z0-9][a-z0-9-]*$/.test(taskName))
    fail("unsafe-path", "Record must be inside a named task directory");
  await assertNoSymlinkPath(resolvedPath, tasks);
  return resolvedPath;
}

async function gitCommand(root, args) {
  try {
    const result = await execFile("git", ["-C", root, ...args], { maxBuffer: 1024 * 1024 });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return { ok: false, code: error.code, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

export async function versionControlEvidence(root, recordPath) {
  const rootResult = await gitCommand(root, ["rev-parse", "--show-toplevel"]);
  if (!rootResult.ok) return { available: false, ignored: null, tracked: null, gitRoot: null };
  const gitRoot = await realpath(rootResult.stdout.trim());
  const rootReal = await realpath(root).catch(() => resolve(root));
  const relativeToRoot = relative(resolve(root), resolve(recordPath));
  const canonicalPath = resolve(rootReal, relativeToRoot);
  const relativePath = relative(gitRoot, canonicalPath).split(sep).join("/");
  const ignored = await gitCommand(gitRoot, ["check-ignore", "--no-index", "-q", "--", relativePath]);
  const tracked = await gitCommand(gitRoot, ["ls-files", "--error-unmatch", "--", relativePath]);
  return { available: true, ignored: ignored.ok, tracked: tracked.ok, gitRoot, relativePath };
}

export async function assertGitSafeTaskPath(root, recordPath) {
  const evidence = await versionControlEvidence(root, recordPath);
  if (evidence.available && evidence.tracked)
    fail("tracked-task-path", "Persistence refuses a tracked task record", { path: recordPath });
  if (evidence.available && !evidence.ignored)
    fail("unignored-task-path", "Persistence refuses an unignored task record", { path: recordPath });
  return evidence;
}

export async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
