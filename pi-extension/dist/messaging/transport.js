import { createHash } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
/**
 * The transport: a Unix socket per session in a folder only the user can open. One request per connection, as one
 * line of JSON, answered with one line of JSON. Socket paths are short (macOS allows about 104 bytes), so they live
 * under the OS temp folder, named by a hash of the session ID.
 */
const MAX_REQUEST_BYTES = 1_100_000;
const CLIENT_TIMEOUT_MS = 5_000;
/** A connection that has not sent its request line by then is closed, so a stray client cannot hold the server open. */
const REQUEST_TIMEOUT_MS = 10_000;
export function socketPathFor(sessionId) {
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
export async function listen(path, handle) {
  await mkdir(join(path, ".."), { recursive: true, mode: 0o700 });
  await rm(path, { force: true });
  const server = createServer((socket) => {
    let buffer = "";
    let answered = false;
    socket.setEncoding("utf8");
    socket.on("error", () => {});
    socket.setTimeout(REQUEST_TIMEOUT_MS, () => {
      if (!answered) socket.destroy();
    });
    const onData = async (chunk) => {
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
      let reply;
      try {
        reply = await handle(JSON.parse(buffer.slice(0, end)));
      } catch (error) {
        reply = { status: "refused", reason: error instanceof Error ? error.message : String(error) };
      }
      socket.end(`${JSON.stringify(reply)}\n`);
    };
    // A failure while answering closes the connection, rather than surfacing as an unhandled rejection.
    socket.on("data", (chunk) => void onData(chunk).catch(() => socket.destroy()));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(path, () => {
      server.off("error", reject);
      resolve();
    });
  });
  // A later server error (an accept that fails, say) must not reach Node as an uncaught exception and end Pi.
  server.on("error", () => {});
  // The socket alone never keeps Pi running: a print-mode run still exits when its work is done.
  server.unref();
  return server;
}
export async function close(server, path) {
  if (server) await new Promise((resolve) => server.close(() => resolve()));
  await rm(path, { force: true });
}
/** Send one request and wait for its answer; rejects when nothing listens or no answer comes in time. */
export function request(path, body, timeoutMs = CLIENT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const socket = createConnection(path);
    let buffer = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("The session did not answer in time."));
    }, timeoutMs);
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.write(`${JSON.stringify(body)}\n`));
    socket.on("data", (chunk) => (buffer += chunk));
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
