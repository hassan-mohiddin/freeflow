// The Freeflow store: one private Git repository, at the Freeflow home, that holds every task's memory and syncs
// itself. `store init` clones the user's remote into the home and, when the remote is empty, lays the store out and
// pushes its first commit; `store status` says where the store stands; `store sync` commits what changed, takes the
// remote's commits and pushes. The store marks itself with store.json at its root, so Track Work's Git check knows
// its records are tracked on purpose (lib/store.mjs). Every commit is the script's, authored as the user, with no
// trailers. A home that holds Pi's Task Memory (its registry.json) is never turned into a store.

import { execFile as execFileCallback } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { FREEFLOW_STORE_KIND, isFreeflowStore, STORE_MARKER, StoreError } from "./store.mjs";

const execFile = promisify(execFileCallback);

/** What Git never syncs: temporary work, raw evidence, this machine's paths and sync state, and live sessions. */
export const STORE_IGNORE = ["scratch/", "evidence/**/raw/", "local/", "sessions/"];
/** Files that only append merge by keeping both sides' lines. */
export const STORE_ATTRIBUTES = ["history.md merge=union", "sessions.md merge=union"];
const BRANCH = "main";
/** Folders a new store starts with; Git keeps an empty one only through a placeholder file. */
const FOLDERS = ["rules", "projects"];

function fail(code, message, exitCode = 1) {
  throw new StoreError(code, message, {}, exitCode);
}

async function git(cwd, args, { allowFailure = false } = {}) {
  try {
    const { stdout } = await execFile("git", ["-C", cwd, ...args], { maxBuffer: 16 * 1024 * 1024 });
    return { ok: true, stdout: stdout.trim() };
  } catch (error) {
    if (!allowFailure)
      fail("git-failure", `git ${args.join(" ")} failed: ${(error?.stderr ?? error?.message ?? "").trim()}`);
    return { ok: false, stdout: (error?.stdout ?? "").trim(), stderr: (error?.stderr ?? "").trim() };
  }
}

/** The store's folder: --home, else FREEFLOW_HOME, else ~/.freeflow. */
export function storeHome(explicit) {
  return resolve(explicit || process.env.FREEFLOW_HOME || join(homedir(), ".freeflow"));
}

async function isEmptyDirectory(path) {
  try {
    return (await readdir(path)).length === 0;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
}

/** The user's Git identity for the store's commits: the options given, else the user's own Git configuration. */
async function identity(home, { name, email }) {
  const configured = async (key) => (await git(home, ["config", key], { allowFailure: true })).stdout;
  const author = { name: name || (await configured("user.name")), email: email || (await configured("user.email")) };
  if (!author.name || !author.email)
    fail(
      "missing-identity",
      "The store's commits are authored as you, and no Git identity is set: pass --git-name and --git-email, or set git config --global user.name and user.email",
    );
  await git(home, ["config", "user.name", author.name]);
  await git(home, ["config", "user.email", author.email]);
  return author;
}

/** Writes the sync state to local/, which only this machine reads. */
async function recordSync(home, state) {
  await mkdir(join(home, "local"), { recursive: true });
  await writeFile(
    join(home, "local", "sync.json"),
    `${JSON.stringify({ at: new Date().toISOString(), ...state }, null, 2)}\n`,
  );
}

async function push(home) {
  const pushed = await git(home, ["push", "-u", "origin", BRANCH], { allowFailure: true });
  return pushed.ok ? { pushed: true } : { pushed: false, reason: pushed.stderr.split("\n").at(-1) || "push failed" };
}

/**
 * Clones `remote` into the store's folder. An empty remote gets the store's layout and first commit, pushed; a remote
 * that already holds a store is joined as it is. Refuses a folder that holds Pi's Task Memory or anything else, and a
 * remote that holds a repository that is not a store.
 *
 * @param {{ home?: string, remote: string, name?: string, email?: string }} options
 */
export async function initStore({ home: explicit, remote, name, email }) {
  if (!remote) fail("missing-remote", "store init needs --remote <url>: the private repository that holds the store");
  const home = storeHome(explicit);
  if (existsSync(join(home, "registry.json")))
    fail(
      "task-memory-home",
      `${home} holds Pi's Task Memory (registry.json), which stays as it is until Freeflow's Pi layer moves to the store; choose another folder for the store with --home <folder>, and set FREEFLOW_HOME to it for the sessions that use the store`,
    );
  if (isFreeflowStore(home))
    fail("already-a-store", `${home} is already a Freeflow store; run store status or store sync`);
  if (!(await isEmptyDirectory(home)))
    fail("home-not-empty", `${home} is not empty and is not a Freeflow store; choose an empty folder with --home`);
  const created = !existsSync(home);
  // A failed init leaves the folder as it found it: gone if it made it, empty if it was empty.
  const undo = async () => {
    if (created) return rm(home, { recursive: true, force: true });
    for (const entry of await readdir(home).catch(() => []))
      await rm(join(home, entry), { recursive: true, force: true });
  };
  await mkdir(resolve(home, ".."), { recursive: true });
  const cloned = await git(resolve(home, ".."), ["clone", "--quiet", remote, home], { allowFailure: true });
  if (!cloned.ok) {
    await undo();
    fail("clone-failure", `Could not clone ${remote}: ${cloned.stderr.split("\n").at(-1) || "git clone failed"}`);
  }
  try {
    const author = await identity(home, { name, email });
    const hasCommits = (await git(home, ["rev-parse", "--verify", "--quiet", "HEAD"], { allowFailure: true })).ok;
    const remoteBranch = (
      await git(home, ["rev-parse", "--verify", "--quiet", `origin/${BRANCH}`], { allowFailure: true })
    ).ok;
    // A remote whose HEAD names no branch clones with nothing checked out; take its main.
    if (!hasCommits && remoteBranch) await git(home, ["checkout", "--quiet", "-B", BRANCH, `origin/${BRANCH}`]);
    if (hasCommits || remoteBranch) {
      if (!isFreeflowStore(home))
        fail(
          "not-a-store",
          `${remote} holds a repository that is not a Freeflow store (no ${STORE_MARKER} at its root)`,
        );
      await recordSync(home, { pushed: true, result: "joined" });
      return { home, remote, joined: true, author, pushed: true };
    }
    await git(home, ["symbolic-ref", "HEAD", `refs/heads/${BRANCH}`]);
    await writeFile(
      join(home, STORE_MARKER),
      `${JSON.stringify({ kind: FREEFLOW_STORE_KIND, version: 1 }, null, 2)}\n`,
    );
    await writeFile(join(home, ".gitignore"), `${STORE_IGNORE.join("\n")}\n`);
    await writeFile(join(home, ".gitattributes"), `${STORE_ATTRIBUTES.join("\n")}\n`);
    for (const folder of FOLDERS) {
      await mkdir(join(home, folder), { recursive: true });
      await writeFile(join(home, folder, ".gitkeep"), "");
    }
    await git(home, ["add", "--all"]);
    await git(home, ["commit", "--quiet", "--no-verify", "-m", "Create the Freeflow store"]);
    const outcome = await push(home);
    await recordSync(home, { ...outcome, result: "created" });
    return { home, remote, joined: false, author, ...outcome };
  } catch (error) {
    await undo();
    throw error;
  }
}

function requireStore(home) {
  if (!isFreeflowStore(home))
    fail("not-a-store", `${home} is not a Freeflow store; run store init --remote <url> first`);
}

async function lastSync(home) {
  try {
    return JSON.parse(await readFile(join(home, "local", "sync.json"), "utf8"));
  } catch {
    return null;
  }
}

/** Where the store stands: its remote and branch, what is not committed or not pushed, and the last sync. */
export async function storeStatus({ home: explicit }) {
  const home = storeHome(explicit);
  requireStore(home);
  const remote = (await git(home, ["remote", "get-url", "origin"], { allowFailure: true })).stdout || null;
  const branch = (await git(home, ["branch", "--show-current"], { allowFailure: true })).stdout || null;
  const uncommitted = (await git(home, ["status", "--porcelain"])).stdout.split("\n").filter(Boolean).length;
  const count = async (range) => {
    const counted = await git(home, ["rev-list", "--count", range], { allowFailure: true });
    return counted.ok ? Number(counted.stdout) : null;
  };
  return {
    home,
    remote,
    branch,
    uncommitted,
    // As of the last fetch: status itself never reaches the network.
    unpushed: await count("@{upstream}..HEAD"),
    behind: await count("HEAD..@{upstream}"),
    lastSync: await lastSync(home),
  };
}

/** Commits what changed, takes the remote's commits under the local ones, and pushes. */
export async function syncStore({ home: explicit, message }) {
  const home = storeHome(explicit);
  requireStore(home);
  const changed = (await git(home, ["status", "--porcelain"])).stdout.split("\n").filter(Boolean);
  if (changed.length > 0) {
    await git(home, ["add", "--all"]);
    await git(home, [
      "commit",
      "--quiet",
      "--no-verify",
      "-m",
      message || `Sync ${changed.length} changed path${changed.length === 1 ? "" : "s"}`,
    ]);
  }
  const pulled = await git(home, ["pull", "--quiet", "--rebase", "origin", BRANCH], { allowFailure: true });
  if (!pulled.ok) {
    await recordSync(home, { pushed: false, result: "pull-failed", reason: pulled.stderr.split("\n").at(-1) });
    fail(
      "pull-failure",
      `Could not take the remote's commits: ${pulled.stderr.split("\n").at(-1) || "git pull failed"}`,
    );
  }
  const outcome = await push(home);
  await recordSync(home, { ...outcome, committed: changed.length, result: outcome.pushed ? "synced" : "not-pushed" });
  return { home, committed: changed.length, ...outcome };
}
