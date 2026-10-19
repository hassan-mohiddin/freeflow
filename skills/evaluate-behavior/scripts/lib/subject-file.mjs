// Reading what a subject wrote. A workspace is the subject's work, so it is untrusted: a subject can leave a link to
// any file the evaluator can read (a provider login, /dev/zero) or a FIFO, and a reader that follows it would put
// that file in a judge's prompt or a result page, or hang. Every reader of a subject's files opens them here: never
// through a link, only a regular file, only inside the workspace, and at most `limit` bytes.

import { constants } from "node:fs";
import { lstat, open, readlink, realpath } from "node:fs/promises";
import path from "node:path";

import { isContained } from "./grade-support.mjs";

/** The most of one subject file any reader takes. */
export const SUBJECT_FILE_LIMIT = 1024 * 1024;

// O_NOFOLLOW refuses a link swapped in after the check; O_NONBLOCK keeps a FIFO swapped in from blocking the open.
const OPEN_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);

/**
 * One file a subject wrote, by its path relative to the workspace. Returns its text (`truncated` when it was longer
 * than `limit` bytes), or why it was not read: `skipped` is "missing", "binary", "link" (with the link's `target`,
 * never followed), "not a regular file", "outside the workspace" or "unreadable".
 *
 * @param {string} workspace
 * @param {string} relative
 * @param {{ limit?: number }} [options]
 * @returns {Promise<{ text: string, truncated: boolean, size: number } | { skipped: string, target?: string }>}
 */
export async function readSubjectFile(workspace, relative, { limit = SUBJECT_FILE_LIMIT } = {}) {
  const root = await realpath(workspace).catch(() => null);
  if (root === null) return { skipped: "missing" };
  const file = path.resolve(root, relative);
  if (file === root || !isContained(root, file)) return { skipped: "outside the workspace" };
  const entry = await lstat(file).catch(() => null);
  if (entry === null) return { skipped: "missing" };
  if (entry.isSymbolicLink()) {
    const target = await readlink(file).catch(() => null);
    return target === null ? { skipped: "link" } : { skipped: "link", target };
  }
  if (!entry.isFile()) return { skipped: "not a regular file" };
  // A directory on the way may itself be a link out of the workspace.
  const canonical = await realpath(file).catch(() => null);
  if (canonical === null || !isContained(root, canonical)) return { skipped: "outside the workspace" };
  return readRegularFile(canonical, limit);
}

/**
 * A regular file's text, read without following a link and at most `limit` bytes; `skipped` otherwise.
 *
 * @param {string} file
 * @param {number} [limit]
 */
export async function readRegularFile(file, limit = SUBJECT_FILE_LIMIT) {
  let handle;
  try {
    handle = await open(file, OPEN_FLAGS);
  } catch (error) {
    return { skipped: error?.code === "ENOENT" ? "missing" : error?.code === "ELOOP" ? "link" : "unreadable" };
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) return { skipped: "not a regular file" };
    const length = Math.min(stat.size, limit);
    const buffer = Buffer.alloc(length);
    let offset = 0;
    while (offset < length) {
      const { bytesRead } = await handle.read(buffer, offset, length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    const bytes = buffer.subarray(0, offset);
    if (bytes.includes(0)) return { skipped: "binary" };
    return { text: bytes.toString("utf8"), truncated: stat.size > limit, size: stat.size };
  } catch {
    return { skipped: "unreadable" };
  } finally {
    await handle.close();
  }
}

/** One line saying why a subject file was not read, for a judge's prompt, a page or a record. */
export function skippedNote(result) {
  if (result.skipped === "link") {
    return result.target === undefined
      ? "a link the run made; not followed"
      : `a link the run made, to ${result.target}; not followed`;
  }
  return `not read: ${result.skipped}`;
}
