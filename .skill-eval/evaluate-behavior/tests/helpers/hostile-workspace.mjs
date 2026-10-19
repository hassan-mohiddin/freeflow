// A workspace a hostile subject could leave: links to a secret outside it, to /dev/zero and to a FIFO, and a FIFO of
// its own, beside one honest file. Readers of subject files must read only the honest one, and finish.

import { spawnSync } from "node:child_process";
import { closeSync, constants, openSync } from "node:fs";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const SECRET = "sk-secret-login-token-7f3a";
export const HONEST = "Honest notes the subject wrote.";
/** The secret file's lines: distinctive enough that any reader that took them in would show them. */
export const SECRET_LINES = [
  `access token for the provider login: ${SECRET}`,
  `refresh token for the provider login: ${SECRET}-refresh`,
  `account behind the provider login: ${SECRET}-account`,
];

/** The written paths, as a run's `effects.changes.created` would list them. */
export const WRITTEN = ["honest.md", "login.md", "zero.md", "pipe.md", "fifo.md", "linked-dir/inner.md"];

/**
 * Builds the workspace under `workspace`, with the secret and a FIFO under `outside`. Returns `release()`, which
 * opens each FIFO for writing so a reader stuck on one is let go, and should run in a test's `finally`.
 */
export async function hostileWorkspace(workspace, outside) {
  await mkdir(workspace, { recursive: true });
  await mkdir(path.join(outside, "secrets"), { recursive: true });
  const secret = path.join(outside, "secrets", "auth.json");
  await writeFile(secret, `${SECRET_LINES.join("\n")}\n`);
  await writeFile(path.join(outside, "secrets", "inner.md"), `${SECRET}\n`);
  const outsideFifo = path.join(outside, "pipe");
  const insideFifo = path.join(workspace, "fifo.md");
  for (const fifo of [outsideFifo, insideFifo]) {
    const made = spawnSync("mkfifo", [fifo]);
    if (made.status !== 0) throw new Error(`mkfifo failed: ${made.stderr}`);
  }
  await writeFile(path.join(workspace, "honest.md"), `${HONEST}\n`);
  await symlink(secret, path.join(workspace, "login.md"));
  await symlink("/dev/zero", path.join(workspace, "zero.md"));
  await symlink(outsideFifo, path.join(workspace, "pipe.md"));
  // A directory link: `linked-dir/inner.md` names a file outside through it.
  await symlink(path.join(outside, "secrets"), path.join(workspace, "linked-dir"));
  return {
    release() {
      for (const fifo of [outsideFifo, insideFifo]) {
        try {
          closeSync(openSync(fifo, constants.O_WRONLY | constants.O_NONBLOCK));
        } catch {
          // No reader is waiting.
        }
      }
    },
  };
}

/** Rejects when `promise` takes longer than `ms`: a reader stuck on a FIFO or /dev/zero fails the test, not hangs it. */
export function within(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not finish within ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
