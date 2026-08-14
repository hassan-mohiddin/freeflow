import { execFile as execFileCallback } from "node:child_process";
import { access, lstat, realpath } from "node:fs/promises";
import { promisify } from "node:util";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { ensureString, fail } from "./model.mjs";

const execFile = promisify(execFileCallback);

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
      if (error?.code !== "ENOENT") throw error;
    }
    if (current === boundary) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

export async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function gitInfo(root) {
  try {
    const result = await execFile("git", ["-C", root, "rev-parse", "--show-toplevel"], { maxBuffer: 1024 * 1024 });
    const gitRoot = await realpath(result.stdout.trim());
    return { available: true, root: gitRoot };
  } catch {
    return { available: false, root: null };
  }
}

export async function gitCommand(root, args) {
  try {
    const result = await execFile("git", ["-C", root, ...args], { maxBuffer: 1024 * 1024 });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return { ok: false, code: error.code, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

export async function versionControlEvidence(root, path) {
  const git = await gitInfo(root);
  if (!git.available) return { available: false, ignored: null, tracked: null, gitRoot: null };
  const rootReal = await realpath(root).catch(() => resolve(root));
  const canonicalize = (candidate) => {
    const fromRoot = relative(resolve(root), candidate);
    return resolve(rootReal, fromRoot);
  };
  const relativePath = relative(git.root, canonicalize(path)).split(sep).join("/");
  const ignored = await gitCommand(git.root, ["check-ignore", "--no-index", "-q", "--", relativePath]);
  const parentPaths = [dirname(path), dirname(dirname(path))];
  let ignoredParent = { ok: false };
  if (!ignored.ok) {
    for (const parentPath of parentPaths) {
      const parentRelativePath = relative(git.root, canonicalize(parentPath)).split(sep).join("/");
      ignoredParent = await gitCommand(git.root, ["check-ignore", "--no-index", "-q", "--", parentRelativePath]);
      if (ignoredParent.ok) break;
    }
  }
  const tracked = await gitCommand(git.root, ["ls-files", "--error-unmatch", "--", relativePath]);
  return {
    available: true,
    ignored: ignored.ok || ignoredParent.ok,
    tracked: tracked.ok,
    gitRoot: git.root,
    relativePath,
  };
}

export function displayPath(root, path) {
  const rel = relative(resolve(root), resolve(path));
  return rel && !rel.startsWith(`..${sep}`) && rel !== ".." ? rel.split(sep).join("/") : path;
}

export function taskRoot(root) {
  return resolve(root, ".freeflow", "tasks");
}

export function assertTaskRecordPath(root, recordPath) {
  const tasks = taskRoot(root);
  const resolved = resolve(recordPath);
  if (!pathInside(tasks, resolved) || basename(resolved) !== "record.md")
    fail("unsafe-path", `Record must be a record.md under ${displayPath(root, tasks)}`);
  const taskDirectory = basename(dirname(resolved));
  if (!/^task-\d{3}-[a-z0-9][a-z0-9-]*$/.test(taskDirectory))
    fail("unsafe-path", `Invalid task directory: ${taskDirectory}`);
  return resolved;
}

export function resolveRecordPath(root, options, positionals = []) {
  const supplied = options["--record"] ?? options["--task"] ?? positionals[0];
  if (!supplied) fail("invalid-arguments", "A record path or task directory is required");
  const candidate = isAbsolute(supplied) ? supplied : resolve(root, supplied);
  const path = basename(candidate) === "record.md" ? candidate : join(candidate, "record.md");
  return assertTaskRecordPath(root, path);
}

export function nextTaskNumber(entries) {
  const used = new Set();
  for (const entry of entries) {
    const match = /^task-(\d{3})-/.exec(entry.name);
    if (entry.isDirectory() && match) used.add(Number(match[1]));
  }
  let number = 1;
  while (used.has(number)) number += 1;
  return number;
}

export function safeShortName(value) {
  const shortName = ensureString(value).trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(shortName))
    fail("invalid-short-name", "Short name must contain lowercase letters, digits, and hyphens only");
  return shortName;
}
