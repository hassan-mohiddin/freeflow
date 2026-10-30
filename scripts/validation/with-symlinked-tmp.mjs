#!/usr/bin/env node
// Runs a command with its temporary folder reached through a symlink, as macOS's is (/var is /private/var), so code or
// a test that compares a path it was given with the one Git or the filesystem reports fails on Linux too, before CI's
// macOS job finds it. Track Work's suite runs through it, with no session transcript named (FREEFLOW_TRANSCRIPT, which
// Freeflow's Claude Code mod sets), so a test never measures the session that runs it; a test that needs one names its own.
// Nor does it pass on a Git identity from the environment (GIT_AUTHOR_*, GIT_COMMITTER_*, as a cloud environment may set
// so its commits are the user's), which would override the identity each test gives its own fixtures.
// Usage: with-symlinked-tmp.mjs <command> [args...]   Exit code: the command's; 2 on a usage error.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Usage: with-symlinked-tmp.mjs <command> [args...]");
  process.exit(2);
}
const real = mkdtempSync(join(tmpdir(), "freeflow-tmp-"));
const linked = `${real}-link`;
symlinkSync(real, linked, process.platform === "win32" ? "junction" : "dir");
let status = 1;
try {
  const env = { ...process.env, TMPDIR: linked, FREEFLOW_TRANSCRIPT: "" };
  for (const name of ["GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"])
    delete env[name];
  const result = spawnSync(command, args, { stdio: "inherit", env });
  if (result.error) console.error(`with-symlinked-tmp: ${result.error.message}`);
  status = result.status ?? 1;
} finally {
  rmSync(linked, { force: true });
  rmSync(real, { recursive: true, force: true });
}
process.exit(status);
