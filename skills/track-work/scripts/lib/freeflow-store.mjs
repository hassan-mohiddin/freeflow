// The Freeflow store: one Git repository, at the Freeflow home, that holds every task's memory. It is local by
// default, on this device only; with the user's private remote it is a cloud store, the same store kept in step on
// every device. `store init` makes a local store, or with --remote clones the user's remote into the home and, when
// the remote is empty, lays the store out and pushes its first commit; `store remote` turns a local store into a
// cloud store; `store status` says where the store stands; `store sync` commits what changed and, in a cloud store,
// takes the remote's commits and pushes. The store marks itself with store.json at its root, so Track Work's Git check knows
// its records are tracked on purpose (lib/store.mjs). Every commit is the script's, authored as the user, with no
// trailers. A home that holds Pi's Task Memory (its registry.json) is never turned into a store.

import { execFile as execFileCallback } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
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
  await guardSecrets(home);
  const pushed = await git(home, ["push", "-u", "origin", BRANCH], { allowFailure: true });
  return pushed.ok ? { pushed: true } : { pushed: false, reason: pushed.stderr.split("\n").at(-1) || "push failed" };
}

/** Writes the store's layout in a repository with no commit yet, on main, and commits it. */
async function layOut(home) {
  await git(home, ["symbolic-ref", "HEAD", `refs/heads/${BRANCH}`]);
  await writeFile(join(home, STORE_MARKER), `${JSON.stringify({ kind: FREEFLOW_STORE_KIND, version: 1 }, null, 2)}\n`);
  await writeFile(join(home, ".gitignore"), `${STORE_IGNORE.join("\n")}\n`);
  await writeFile(join(home, ".gitattributes"), `${STORE_ATTRIBUTES.join("\n")}\n`);
  for (const folder of FOLDERS) {
    await mkdir(join(home, folder), { recursive: true });
    await writeFile(join(home, folder, ".gitkeep"), "");
  }
  await git(home, ["add", "--all"]);
  await git(home, ["commit", "--quiet", "--no-verify", "-m", "Create the Freeflow store"]);
}

async function hasRemote(home) {
  return (await git(home, ["remote", "get-url", "origin"], { allowFailure: true })).ok;
}

/**
 * Turns a local store into a cloud store: adds the user's private repository as its remote and pushes the store's
 * whole history there. The repository must be empty; a store already in one is joined with store init --remote.
 *
 * @param {{ home?: string, url: string }} options
 */
export async function addStoreRemote({ home: explicit, url }) {
  const home = storeHome(explicit);
  requireStore(home);
  if (await hasRemote(home))
    fail("has-remote", `${home} already syncs with ${(await git(home, ["remote", "get-url", "origin"])).stdout}`);
  await git(home, ["remote", "add", "origin", url]);
  const drop = () => git(home, ["remote", "remove", "origin"], { allowFailure: true });
  const fetched = await git(home, ["fetch", "--quiet", "origin"], { allowFailure: true });
  if (!fetched.ok) {
    await drop();
    fail("remote-unreachable", `Could not reach ${url}: ${lastLine(fetched.stderr, "git fetch failed")}`);
  }
  if ((await git(home, ["branch", "--remotes"])).stdout !== "") {
    await drop();
    fail(
      "remote-not-empty",
      `${url} already holds commits; a local store moves only into an empty repository. To use a store already there, run store init --remote ${url} --home <another folder>`,
    );
  }
  const outcome = await push(home);
  if (!outcome.pushed) {
    await drop();
    fail("push-failure", `Could not push to ${url}: ${outcome.reason}`);
  }
  const commits = (await git(home, ["rev-list", "--count", "HEAD"])).stdout;
  await recordSync(home, { pushed: true, result: "went-cloud" });
  return { home, url, commits: Number(commits) };
}

/**
 * Clones `remote` into the store's folder, or with no remote makes a local store there. An empty remote gets the store's layout and first commit, pushed; a remote
 * that already holds a store is joined as it is. Refuses a folder that holds Pi's Task Memory or anything else, and a
 * remote that holds a repository that is not a store.
 *
 * @param {{ home?: string, remote: string, name?: string, email?: string }} options
 */
export async function initStore({ home: explicit, remote, name, email }) {
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
  if (!remote) {
    try {
      await mkdir(home, { recursive: true });
      await git(home, ["init", "--quiet"]);
      const author = await identity(home, { name, email });
      await layOut(home);
      await recordSync(home, { pushed: false, result: "created-local" });
      return { home, remote: null, joined: false, author, pushed: false, local: true };
    } catch (error) {
      await undo();
      throw error;
    }
  }
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
    await layOut(home);
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
    conflict: (await pendingConflict(home))?.paths ?? null,
  };
}

/** Token shapes the scan looks for before every push: common credentials, not every secret a file can hold. */
export const SECRET_PATTERNS = [
  ["an AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["a GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/],
  ["an Anthropic API key", /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["an OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9]{32,}/],
  ["a Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["a Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["a private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

/** The secrets a patch's added lines hold: each one's path, its line in the new file, and what it looks like. */
export function secretsInDiff(diff) {
  const found = [];
  let path = null;
  let line = 0;
  let inHunk = false;
  for (const text of diff.split("\n")) {
    if (text.startsWith("diff --git ")) {
      inHunk = false;
      continue;
    }
    if (!inHunk && text.startsWith("+++ ")) {
      path = text === "+++ /dev/null" ? null : text.replace(/^\+\+\+ (?:b\/)?/, "");
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (hunk) {
      inHunk = true;
      line = Number(hunk[1]);
      continue;
    }
    if (!inHunk) continue;
    if (text.startsWith("+")) {
      for (const [kind, pattern] of SECRET_PATTERNS) if (pattern.test(text)) found.push({ path, line, kind });
      line += 1;
    } else if (text.startsWith(" ")) line += 1;
  }
  return found;
}

// Git's empty tree: what a store with nothing on its remote yet is compared against.
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const CONFLICT = join("local", "conflict.json");
const CONFLICT_COPIES = join("local", "conflicts");

/** What Git said went wrong: its fatal or error line when it printed one, else its last line. */
const lastLine = (text, fallback) => {
  const lines = (text ?? "").split("\n").filter(Boolean);
  const said = lines.find((line) => /^(?:fatal|error): /.test(line));
  return said ? said.replace(/^(?:fatal|error): /, "") : lines.at(-1) || fallback;
};

/** Git's output exactly as printed, for file contents and patches. */
async function gitRaw(cwd, args) {
  const { stdout } = await execFile("git", ["-C", cwd, ...args], { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

async function remoteBranch(home) {
  return (await git(home, ["rev-parse", "--verify", "--quiet", `origin/${BRANCH}`], { allowFailure: true })).ok;
}

async function commitChanges(home, message) {
  const changed = (await git(home, ["status", "--porcelain"])).stdout.split("\n").filter(Boolean);
  if (changed.length === 0) return 0;
  await git(home, ["add", "--all"]);
  await git(home, [
    "commit",
    "--quiet",
    "--no-verify",
    "-m",
    message || `Sync ${changed.length} changed path${changed.length === 1 ? "" : "s"}`,
  ]);
  return changed.length;
}

/**
 * Refuses a push that would carry a secret, naming each one's path, line and kind, never its value. A secret only an
 * earlier unpushed commit holds is removed from what leaves this machine by folding the unpushed commits into one.
 */
async function guardSecrets(home) {
  const onRemote = await remoteBranch(home);
  const net = secretsInDiff(
    await gitRaw(home, [
      "diff",
      "--no-color",
      "--no-ext-diff",
      "-U0",
      onRemote ? `origin/${BRANCH}` : EMPTY_TREE,
      "HEAD",
    ]),
  );
  if (net.length > 0) {
    const where = net.map(({ path, line, kind }) => `${path}:${line} looks like ${kind}`).join("; ");
    await recordSync(home, { pushed: false, result: "secret", reason: where });
    fail(
      "secret-found",
      `Not pushed: ${where}. Remove it and run store sync again; a commit that held it never leaves this machine.`,
    );
  }
  const range = onRemote ? `origin/${BRANCH}..HEAD` : "HEAD";
  const past = secretsInDiff(
    await gitRaw(home, ["log", "-p", "--no-color", "--no-ext-diff", "-U0", "--format=", range]),
  );
  if (past.length === 0) return;
  const count = (await git(home, ["rev-list", "--count", range])).stdout;
  if (onRemote) await git(home, ["reset", "--soft", `origin/${BRANCH}`]);
  else await git(home, ["update-ref", "-d", `refs/heads/${BRANCH}`]);
  await git(home, [
    "commit",
    "--quiet",
    "--no-verify",
    "-m",
    `Sync ${count} commit${count === "1" ? "" : "s"} as one: an earlier one held a secret, since removed`,
  ]);
}

async function pendingConflict(home) {
  try {
    return JSON.parse(await readFile(join(home, CONFLICT), "utf8"));
  } catch {
    return null;
  }
}

/**
 * Puts the local commits on top of the remote's. History and sessions files merge by union; any other conflict
 * aborts, keeps the remote's copy of each conflicted file under local/conflicts/ beside this store's own, committed
 * in place, and stops for the user. With `resolved`, this store's version wins where the two still conflict.
 */
async function rebaseOntoRemote(home, { resolved = false } = {}) {
  // In a rebase, "theirs" are the local commits being replayed.
  const rebased = await git(home, ["rebase", "--quiet", ...(resolved ? ["-X", "theirs"] : []), `origin/${BRANCH}`], {
    allowFailure: true,
  });
  if (rebased.ok) return;
  const listed = await git(home, ["diff", "--name-only", "--diff-filter=U"], { allowFailure: true });
  const paths = listed.stdout.split("\n").filter(Boolean);
  await git(home, ["rebase", "--abort"], { allowFailure: true });
  if (paths.length === 0)
    fail(
      "rebase-failure",
      `Could not put the local commits on the remote's: ${lastLine(rebased.stderr, "git rebase failed")}`,
    );
  for (const path of paths) {
    const copy = join(home, CONFLICT_COPIES, path);
    await mkdir(dirname(copy), { recursive: true });
    await writeFile(copy, await gitRaw(home, ["show", `origin/${BRANCH}:${path}`]).catch(() => ""));
  }
  await writeFile(join(home, CONFLICT), `${JSON.stringify({ at: new Date().toISOString(), paths }, null, 2)}\n`);
  await recordSync(home, { pushed: false, result: "conflict", reason: paths.join(", ") });
  fail(
    "sync-conflict",
    `The remote changed what this store changed too: ${paths.join(", ")}. Both copies are kept: this store's in place, committed and not pushed, and the remote's under ${CONFLICT_COPIES}/. Merge what should stay into this store's file, then run store sync --resolved, which keeps this store's version where the two still conflict.`,
  );
}

/**
 * Commits what changed, takes the remote's commits under the local ones, and pushes, after the secret scan. A push
 * refused because the remote moved takes its commits and tries again; no network or no access leaves the commits
 * here and says so, without failing: work never waits on the network. With `pull`, nothing is pushed. A conflict
 * stops until `resolved`.
 *
 * @param {{ home?: string, message?: string, pull?: boolean, resolved?: boolean }} options
 */
export async function syncStore({ home: explicit, message, pull = false, resolved = false }) {
  const home = storeHome(explicit);
  requireStore(home);
  const conflict = await pendingConflict(home);
  if (conflict && !resolved)
    fail(
      "conflict-pending",
      `A conflict waits in ${conflict.paths.join(", ")}, with the remote's copies under ${CONFLICT_COPIES}/: merge what should stay into this store's files, then run store sync --resolved`,
    );
  if (resolved && !conflict) fail("no-conflict", "No conflict waits; run store sync");
  const committed = await commitChanges(home, message);
  // A local store has nothing to take or push: its commits are its history.
  if (!(await hasRemote(home))) {
    await recordSync(home, { pushed: false, committed, result: "local" });
    return { home, committed, local: true, pulled: false, pushed: false };
  }
  const offline = async (reason) => {
    const why = `no network or no access: ${reason}`;
    await recordSync(home, { pushed: false, committed, result: "offline", reason: why });
    return { home, committed, pulled: false, pushed: false, reason: why };
  };
  const fetched = await git(home, ["fetch", "--quiet", "origin"], { allowFailure: true });
  if (!fetched.ok) return offline(lastLine(fetched.stderr, "git fetch failed"));
  if (await remoteBranch(home)) await rebaseOntoRemote(home, { resolved });
  if (resolved) {
    await rm(join(home, CONFLICT), { force: true });
    await rm(join(home, CONFLICT_COPIES), { recursive: true, force: true });
  }
  if (pull) {
    await recordSync(home, { pushed: false, committed, result: "pulled" });
    return { home, committed, pulled: true, pushed: false };
  }
  for (let attempt = 1; ; attempt += 1) {
    await guardSecrets(home);
    const pushed = await git(home, ["push", "--quiet", "-u", "origin", BRANCH], { allowFailure: true });
    if (pushed.ok) break;
    const moved = /rejected|fetch first|non-fast-forward/i.test(pushed.stderr);
    if (!moved) return offline(lastLine(pushed.stderr, "git push failed"));
    const why = `the remote kept moving: ${lastLine(pushed.stderr, "push rejected")}`;
    if (attempt === 3) {
      await recordSync(home, { pushed: false, committed, result: "not-pushed", reason: why });
      return { home, committed, pulled: true, pushed: false, reason: why };
    }
    // The remote moved after the fetch: take its commits and push again.
    const refetched = await git(home, ["fetch", "--quiet", "origin"], { allowFailure: true });
    if (!refetched.ok) return offline(lastLine(refetched.stderr, "git fetch failed"));
    await rebaseOntoRemote(home);
  }
  await recordSync(home, { pushed: true, committed, result: "synced" });
  return { home, committed, pulled: true, pushed: true };
}
