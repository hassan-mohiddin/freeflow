import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
const fileName = (sessionId) => `${sessionId.replace(/[^A-Za-z0-9._-]/g, "_")}.json`;
export function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}
export class LiveRegistry {
  folder;
  constructor(home) {
    this.folder = join(home, "sessions");
  }
  async write(entry) {
    await mkdir(this.folder, { recursive: true, mode: 0o700 });
    const path = join(this.folder, fileName(entry.sessionId));
    // One temporary file per write, so two writes in flight never rename each other's file.
    const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(entry, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, path);
  }
  async remove(sessionId) {
    await rm(join(this.folder, fileName(sessionId)), { force: true });
  }
  /** Every live session, oldest first; stale entries and their sockets are removed on the way. */
  async list() {
    let names;
    try {
      names = await readdir(this.folder);
    } catch {
      return [];
    }
    const sessions = [];
    for (const name of names.filter((each) => each.endsWith(".json"))) {
      const path = join(this.folder, name);
      let entry;
      try {
        entry = JSON.parse(await readFile(path, "utf8"));
      } catch {
        continue;
      }
      if (typeof entry?.pid !== "number" || typeof entry.sessionId !== "string" || typeof entry.socket !== "string")
        continue;
      if (!alive(entry.pid)) {
        await rm(path, { force: true });
        await rm(entry.socket, { force: true });
        continue;
      }
      sessions.push(entry);
    }
    return sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }
}
