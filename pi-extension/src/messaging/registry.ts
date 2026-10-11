import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The live-session registry: one JSON file per running session with messaging on, under `<home>/sessions/`, written
 * when messaging starts, updated when the session turns busy or idle, removed when it stops. An entry whose process is
 * gone is stale: listing skips it and removes it, so a crashed session does not linger.
 */
export type LiveSession = Readonly<{
  sessionId: string;
  name: string;
  cwd: string;
  pid: number;
  socket: string;
  busy: boolean;
  /** The Task Memory project of the session's repository, when it has one. */
  project?: string;
  /** The task ID of the session's focused Working Record, when it is registered. */
  task?: string;
  /** The Task Memory tasks this session owns, so another session can find the one that owns a task. */
  owns?: readonly string[];
  startedAt: string;
}>;

const fileName = (sessionId: string) => `${sessionId.replace(/[^A-Za-z0-9._-]/g, "_")}.json`;

export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    return error?.code === "EPERM";
  }
}

export class LiveRegistry {
  readonly folder: string;

  constructor(home: string) {
    this.folder = join(home, "sessions");
  }

  async write(entry: LiveSession): Promise<void> {
    await mkdir(this.folder, { recursive: true, mode: 0o700 });
    const path = join(this.folder, fileName(entry.sessionId));
    // One temporary file per write, so two writes in flight never rename each other's file.
    const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(entry, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, path);
  }

  async remove(sessionId: string): Promise<void> {
    await rm(join(this.folder, fileName(sessionId)), { force: true });
  }

  /** Every live session, oldest first; stale entries and their sockets are removed on the way. */
  async list(): Promise<LiveSession[]> {
    let names: string[];
    try {
      names = await readdir(this.folder);
    } catch {
      return [];
    }
    const sessions: LiveSession[] = [];
    for (const name of names.filter((each) => each.endsWith(".json"))) {
      const path = join(this.folder, name);
      let entry: LiveSession;
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
