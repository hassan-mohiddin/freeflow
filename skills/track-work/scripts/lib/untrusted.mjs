// Folders whose files someone who may not run code on this machine can write, named in FREEFLOW_UNTRUSTED_ROOTS (a
// JSON array of folders). Evaluate Behavior sets it for a Freeflow arm's host process, naming the subject's workspace
// and the arm's store, which the subject's container writes. A Git repository there could carry its own configuration
// (core.fsmonitor, a filter, gpg.program and the like), which any Git command run in it would obey, on this machine.
// So Track Work runs no Git in a folder inside one of them, except in the Freeflow store itself, whose .git the
// evaluator mounts read-only for the subject and holds no repository of its own below it. Unset, nothing changes.
import { lstatSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export const UNTRUSTED_ROOTS = "FREEFLOW_UNTRUSTED_ROOTS";

const inside = (root, path) => {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

const real = (path) => {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
};

/** The folders FREEFLOW_UNTRUSTED_ROOTS names, each as its real path; none when it is unset or not a JSON array. */
function untrustedRoots(env) {
  let named;
  try {
    named = JSON.parse(env[UNTRUSTED_ROOTS] ?? "[]");
  } catch {
    return [];
  }
  return Array.isArray(named)
    ? named.filter((each) => typeof each === "string").map((each) => real(each) ?? resolve(each))
    : [];
}

/** Whether a folder or one of its parents up to the store's root (not the root itself) holds a `.git` of its own. */
function nestedRepository(at, store) {
  for (let folder = at; folder !== store && inside(store, folder); folder = dirname(folder)) {
    try {
      lstatSync(join(folder, ".git"));
      return true;
    } catch {
      // none here: look one folder up
    }
  }
  return false;
}

/**
 * Whether Track Work must not run Git in `directory`: with FREEFLOW_UNTRUSTED_ROOTS set, a folder inside one of the
 * folders it names, unless it is in the Freeflow store (FREEFLOW_HOME) with no repository of its own between it and
 * the store's root. A folder that cannot be resolved is refused while the variable is set.
 *
 * @param {string} directory
 * @param {Record<string, string | undefined>} [env]
 */
export function gitRefused(directory, env = process.env) {
  const roots = untrustedRoots(env);
  if (roots.length === 0) return false;
  const at = real(resolve(directory));
  if (at === null) return true;
  if (!roots.some((root) => inside(root, at))) return false;
  const store = real(resolve(env.FREEFLOW_HOME || join(homedir(), ".freeflow")));
  if (store === null || !inside(store, at)) return true;
  try {
    if (!lstatSync(join(store, ".git")).isDirectory()) return true;
  } catch {
    return true;
  }
  return nestedRepository(at, store);
}
