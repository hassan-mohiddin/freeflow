import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export class LockError extends Error {}

function isRunning(pid) {
  if (!Number.isInteger(pid) || pid < 1 || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

/**
 * Claims the data folder for this process through `<dataDir>/server.lock`, which holds the owner's process id. A lock
 * whose process is no longer running is taken over. Returns the lock; `release` removes it.
 * @param {string} dataDir
 * @param {ReturnType<import("./log.js").createLogger>} log
 */
export async function lockDataDir(dataDir, log) {
  const file = path.join(dataDir, "server.lock");
  await mkdir(dataDir, { recursive: true });
  try {
    await writeFile(file, `${process.pid}\n`, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const owner = Number((await readFile(file, "utf8")).trim());
    if (isRunning(owner)) throw new LockError(`the data folder ${dataDir} is in use by process ${owner}`);
    log.warn("taking over a stale lock", { file, pid: owner });
    await writeFile(file, `${process.pid}\n`);
  }
  return {
    file,
    release: () => rm(file, { force: true }),
  };
}
