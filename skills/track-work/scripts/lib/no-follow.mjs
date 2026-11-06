// Writes and reads in Freeflow's files that never follow a symbolic link. Someone who may write the store's files
// but not run code on this machine, such as an evaluation's subject in a container that sees the store, could plant
// a link where Track Work writes, and turn a write into the store into a write anywhere this process may write. So a
// write opens its file with O_NOFOLLOW, refuses anything but a regular file, and, inside the Freeflow home, refuses a
// folder on the way that is a link; a read refuses a link the same way.
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const NOFOLLOW = constants.O_NOFOLLOW ?? 0;
// A FIFO planted in place of a file would block an open for writing until someone reads it; non-blocking, the open
// fails instead. It changes nothing for a regular file.
const NONBLOCK = constants.O_NONBLOCK ?? 0;

/** Refused: the path, or a folder on the way to it inside the Freeflow home, is a link, or the file is not a file. */
export class LinkRefused extends Error {
  /** @param {string} path @param {string} why */
  constructor(path, why) {
    super(`Refused to use ${path}: ${why}`);
    this.code = "link-refused";
  }
}

const freeflowHome = () => resolve(process.env.FREEFLOW_HOME || join(homedir(), ".freeflow"));

/** The folders between the Freeflow home and the file, outermost first; none for a file outside the home. */
function foldersInsideHome(target) {
  const home = freeflowHome();
  const inside = relative(home, dirname(target));
  if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) return [];
  const folders = [];
  let at = home;
  for (const name of inside.split(sep)) folders.push((at = join(at, name)));
  return folders;
}

/**
 * Refuses `path` when a folder on the way to it inside the Freeflow home is a symbolic link: for a write through a
 * temporary file and a rename, which replaces a link at the file itself but would still land wherever such a folder
 * points.
 *
 * @param {string} path
 */
export function refuseLinkedFolders(path) {
  return refuseLinkedFoldersOf(resolve(path));
}

async function refuseLinkedFoldersOf(target) {
  for (const folder of foldersInsideHome(target)) {
    const stat = await lstat(folder).catch(() => null);
    if (stat === null) return;
    if (stat.isSymbolicLink()) throw new LinkRefused(target, `${folder} is a symbolic link`);
  }
}

function refuseLinkedFoldersSync(target) {
  for (const folder of foldersInsideHome(target)) {
    let stat;
    try {
      stat = lstatSync(folder);
    } catch {
      return;
    }
    if (stat.isSymbolicLink()) throw new LinkRefused(target, `${folder} is a symbolic link`);
  }
}

/** Where O_NOFOLLOW does not exist (Windows), the file is looked at first. */
async function refuseLinkedFile(target) {
  if (NOFOLLOW) return;
  const stat = await lstat(target).catch(() => null);
  if (stat?.isSymbolicLink()) throw new LinkRefused(target, "it is a symbolic link");
}

function refusal(target, error) {
  if (error?.code === "ELOOP" || error?.code === "EMLINK") return new LinkRefused(target, "it is a symbolic link");
  if (error?.code === "ENXIO") return new LinkRefused(target, "it is not a regular file");
  return error;
}

/**
 * Writes `data` to `path` as fs.writeFile does (or appends it, with `append`), never through a symbolic link: the
 * file itself, or a folder inside the Freeflow home on the way to it, being a link refuses the write, as does a
 * file that is not a regular one (a FIFO or a device).
 *
 * @param {string} path
 * @param {string | Uint8Array} data
 * @param {{ append?: boolean, mode?: number }} [options]
 */
export async function writeNoFollow(path, data, { append = false, mode = 0o666 } = {}) {
  const target = resolve(path);
  await refuseLinkedFoldersOf(target);
  await refuseLinkedFile(target);
  const flags =
    constants.O_WRONLY | constants.O_CREAT | NOFOLLOW | NONBLOCK | (append ? constants.O_APPEND : constants.O_TRUNC);
  let handle;
  try {
    handle = await open(target, flags, mode);
  } catch (error) {
    throw refusal(target, error);
  }
  try {
    if (!(await handle.stat()).isFile()) throw new LinkRefused(target, "it is not a regular file");
    await handle.writeFile(data, "utf8");
  } finally {
    await handle.close();
  }
}

/** Appends `data` to `path`, never through a symbolic link (writeNoFollow). */
export function appendNoFollow(path, data, { mode = 0o666 } = {}) {
  return writeNoFollow(path, data, { append: true, mode });
}

/**
 * Opens `path` for reading, never through a symbolic link (as readNoFollowSync refuses one); the caller closes the
 * handle.
 *
 * @param {string} path
 */
export async function openNoFollow(path) {
  const target = resolve(path);
  await refuseLinkedFoldersOf(target);
  await refuseLinkedFile(target);
  let handle;
  try {
    handle = await open(target, constants.O_RDONLY | NOFOLLOW | NONBLOCK);
  } catch (error) {
    throw refusal(target, error);
  }
  if (!(await handle.stat()).isFile()) {
    await handle.close();
    throw new LinkRefused(target, "it is not a regular file");
  }
  return handle;
}

/**
 * Reads `path` as text, as fs.readFileSync does, never through a symbolic link: the file, or a folder inside the
 * Freeflow home on the way to it, being a link refuses the read, as does a file that is not a regular one.
 *
 * @param {string} path
 * @returns {{ text: string, bytes: number }}
 */
export function readNoFollowSync(path) {
  const target = resolve(path);
  refuseLinkedFoldersSync(target);
  if (!NOFOLLOW && lstatSync(target).isSymbolicLink()) throw new LinkRefused(target, "it is a symbolic link");
  let descriptor;
  try {
    descriptor = openSync(target, constants.O_RDONLY | NOFOLLOW | NONBLOCK);
  } catch (error) {
    throw refusal(target, error);
  }
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile()) throw new LinkRefused(target, "it is not a regular file");
    return { text: readFileSync(descriptor, "utf8"), bytes: stat.size };
  } finally {
    closeSync(descriptor);
  }
}
