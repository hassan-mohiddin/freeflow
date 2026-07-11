import { lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

function stripAtPrefix(value) {
  return value.startsWith("@") ? value.slice(1) : value;
}

export function isWithin(root, target) {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

export function assertSafeOwnedRoot(candidate, { repoRoot, homeDir, label = "path" } = {}) {
  if (typeof candidate !== "string" || candidate.length === 0) {
    throw new Error(`${label} must be a non-empty path`);
  }

  const absolute = resolve(candidate);
  const forbidden = new Set([resolve("/"), homeDir && resolve(homeDir), repoRoot && resolve(repoRoot)].filter(Boolean));
  if (forbidden.has(absolute)) {
    throw new Error(`${label} is a destructive root: ${absolute}`);
  }
  return absolute;
}

async function canonicalizeCandidate(absolute) {
  try {
    return await realpath(absolute);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const tail = [];
  let cursor = absolute;
  for (;;) {
    try {
      const base = await realpath(cursor);
      return resolve(base, ...tail.reverse());
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = dirname(cursor);
      if (parent === cursor) throw error;
      tail.push(cursor.slice(parent.length + (parent.endsWith(sep) ? 0 : 1)));
      cursor = parent;
    }
  }
}

export async function canonicalizeRoot(path) {
  const absolute = resolve(path);
  const info = await lstat(absolute);
  if (!info.isDirectory()) throw new Error(`Root is not a directory: ${absolute}`);
  return realpath(absolute);
}

export async function resolveGuardedPath(inputPath, cwd) {
  if (typeof inputPath !== "string" || inputPath.length === 0) {
    throw new Error("Tool path must be a non-empty string");
  }
  const normalized = stripAtPrefix(inputPath);
  const absolute = resolve(cwd, normalized);
  return canonicalizeCandidate(absolute);
}

export async function createRootPolicy({ readRoots, writeRoots }) {
  if (!Array.isArray(readRoots) || readRoots.length === 0) {
    throw new Error("At least one read root is required");
  }
  if (!Array.isArray(writeRoots) || writeRoots.length === 0) {
    throw new Error("At least one write root is required");
  }

  const reads = await Promise.all(readRoots.map(canonicalizeRoot));
  const writes = await Promise.all(writeRoots.map(canonicalizeRoot));

  for (const writeRoot of writes) {
    if (!reads.some((readRoot) => isWithin(readRoot, writeRoot))) {
      throw new Error(`Write root must also be readable: ${writeRoot}`);
    }
  }

  return Object.freeze({ readRoots: Object.freeze(reads), writeRoots: Object.freeze(writes) });
}

export async function authorizeToolPath({ inputPath, cwd, operation, policy }) {
  const target = await resolveGuardedPath(inputPath, cwd);
  const roots = operation === "write" ? policy.writeRoots : policy.readRoots;
  const allowed = roots.some((root) => isWithin(root, target));
  return { allowed, target, operation };
}
