import { createHash } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { createConnection, createServer, type Server } from "node:net";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";

/**
 * The transport: a Unix socket per session in a folder only the user can open. One request per connection, as one
 * line of JSON, answered with one line of JSON. Socket paths are short (macOS allows about 104 bytes), so they live
 * under the OS temp folder, named by a hash of the session ID.
 */
const MAX_REQUEST_BYTES = 1_100_000;
const CLIENT_TIMEOUT_MS = 5_000;

export function socketPathFor(sessionId: string): string {
  const user = (() => {
    try {
      return String(userInfo().uid);
    } catch {
      return "user";
    }
  })();
  const name = createHash("sha256").update(sessionId).digest("hex").slice(0, 16);
  return join(tmpdir(), `freeflow-${user}`, "msg", `${name}.sock`);
}

export async function listen(path: string, handle: (request: any) => Promise<any>): Promise<Server> {
  await mkdir(join(path, ".."), { recursive: true, mode: 0o700 });
  await rm(path, { force: true });
  const server = createServer((socket) => {
    let buffer = "";
    let answered = false;
    socket.setEncoding("utf8");
    socket.on("error", () => {});
    socket.on("data", async (chunk: string) => {
      if (answered) return;
      buffer += chunk;
      if (buffer.length > MAX_REQUEST_BYTES) {
        answered = true;
        socket.end(`${JSON.stringify({ status: "refused", reason: "The message is too large." })}\n`);
        return;
      }
      const end = buffer.indexOf("\n");
      if (end < 0) return;
      answered = true;
      let reply: any;
      try {
        reply = await handle(JSON.parse(buffer.slice(0, end)));
      } catch (error) {
        reply = { status: "refused", reason: error instanceof Error ? error.message : String(error) };
      }
      socket.end(`${JSON.stringify(reply)}\n`);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(path, () => {
      server.off("error", reject);
      resolve();
    });
  });
  // The socket alone never keeps Pi running: a print-mode run still exits when its work is done.
  server.unref();
  return server;
}

export async function close(server: Server | undefined, path: string): Promise<void> {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(path, { force: true });
}

/** Send one request and wait for its answer; rejects when nothing listens or no answer comes in time. */
export function request(path: string, body: unknown, timeoutMs = CLIENT_TIMEOUT_MS): Promise<any> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(path);
    let buffer = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("The session did not answer in time."));
    }, timeoutMs);
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.write(`${JSON.stringify(body)}\n`));
    socket.on("data", (chunk: string) => (buffer += chunk));
    socket.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.on("end", () => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(buffer.trim()));
      } catch {
        reject(new Error("The session sent no readable answer."));
      }
    });
  });
}
