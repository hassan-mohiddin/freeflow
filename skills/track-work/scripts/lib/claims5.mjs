// Claims on paths (SPEC-009 4.5): a session says which files it is changing, so another session warns before it
// writes them (the delegation gate, SPEC-008). Claims live in the store, in `<store>/projects/<project>/claims.jsonl`,
// or `<store>/claims.jsonl` for a task with no project: one line per claim, renewal or release, appended, merged by
// keeping both sides' lines (`claims.jsonl merge=union`), so two machines' claims both stand and the gate warns at the
// next sync ("first push wins"). A path is kept relative to its repository, named as Space names it, so two checkouts
// or worktrees of one repository claim the same file; a path outside any repository is kept whole.
//
// A claim lasts its hours (default 4, `delegation.claimHours`, which a driver passes as FREEFLOW_CLAIM_HOURS), is
// renewed by its session's next store sync while it is live, and ends at its release, its delegation's close, or its
// session's end.

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { normalPath, resolvePath } from "./gates5.mjs";
import { ensureUnionMerge, storeHome } from "./freeflow-store.mjs";
import { REPOSITORIES_FILE, isFreeflowStore } from "./store.mjs";
import { appendNoFollow } from "./no-follow.mjs";

export const CLAIMS_FILE = "claims.jsonl";
export const CLAIM_VERSION = 1;
export const DEFAULT_CLAIM_HOURS = 4;
const HOUR = 3_600_000;

class ClaimError extends Error {
  constructor(message) {
    super(message);
    this.name = "ClaimError";
  }
}

const fail = (message) => {
  throw new ClaimError(message);
};

function git(directory, args) {
  try {
    return execFileSync("git", ["-C", directory, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/** A remote URL as Space names its repository (transitions5's remoteName): host/owner/repo. */
export function repositoryName(url) {
  const value = String(url ?? "")
    .trim()
    .replace(/\.git$/, "");
  const scp = /^[^@\s/]+@([^:\s/]+):(.+)$/.exec(value);
  if (scp) return `${scp[1]}/${scp[2]}`;
  const parsed = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/i.exec(value);
  return parsed ? `${parsed[1]}/${parsed[2]}` : value;
}

/** A path with its existing part's real path, so it compares with what Git reports (a symlinked temporary folder). */
function realOf(path) {
  const missing = [];
  let at = path;
  while (at && !existsSync(at)) {
    missing.unshift(basename(at));
    const up = dirname(at);
    if (up === at) return path;
    at = up;
  }
  return normalPath([realpathSync(at), ...missing].join("/"));
}

/** The repository a folder is in: its name (the remote's, else its top folder) and its top folder; null outside one. */
export function repositoryOf(directory) {
  let at = directory;
  while (at && !existsSync(at)) at = dirname(at);
  const top = at ? git(statSync(at).isDirectory() ? at : dirname(at), ["rev-parse", "--show-toplevel"]) : null;
  if (!top) return null;
  const remotes = (git(top, ["remote"]) ?? "").split("\n").filter(Boolean);
  const remote = remotes.includes("origin") ? "origin" : remotes[0];
  const url = remote ? git(top, ["remote", "get-url", remote]) : null;
  return { name: url ? repositoryName(url) : top, top: normalPath(top) };
}

/**
 * The paths or globs a claim names, grouped by repository: relative to its top folder in one, whole outside any. A
 * relative path is taken from `cwd`.
 * @param {string[]} globs
 * @param {string} cwd
 */
export function claimGroups(globs, cwd) {
  const groups = new Map();
  for (const glob of globs) {
    const full = realOf(resolvePath(normalPath(cwd), glob));
    // The repository of the glob's fixed part, the folders before its first wildcard.
    const fixed = full.split("/").filter((name, index, all) => !/[*?]/.test(all.slice(0, index + 1).join("/")));
    const repo = repositoryOf(fixed.join("/") || "/");
    const key = repo?.name ?? "";
    const path = repo ? relative(repo.top, full).split("\\").join("/") || "." : full;
    if (!groups.has(key)) groups.set(key, { repo: repo?.name ?? null, paths: [] });
    groups.get(key).paths.push(path);
  }
  return [...groups.values()];
}

/** The claims file of a task folder in the store, or null for a task kept outside one. */
export function claimsPathFor(taskDir) {
  const tasks = dirname(resolve(taskDir));
  if (basename(tasks) !== "tasks") return null;
  const above = dirname(tasks);
  if (isFreeflowStore(above)) return { home: above, path: join(above, CLAIMS_FILE) };
  const projects = dirname(above);
  return basename(projects) === "projects" && isFreeflowStore(dirname(projects))
    ? { home: dirname(projects), path: join(above, CLAIMS_FILE) }
    : null;
}

/** Every claims file in the store: its own, then each project's. */
export function claimsFiles(home) {
  const files = [join(home, CLAIMS_FILE)];
  const projects = join(home, "projects");
  if (existsSync(projects)) for (const name of readdirSync(projects)) files.push(join(projects, name, CLAIMS_FILE));
  return files.filter((path) => existsSync(path));
}

/** A file's lines that read as claim lines, oldest first; a line that does not is skipped. */
export function readClaimLines(path) {
  if (!existsSync(path)) return [];
  const lines = [];
  for (const text of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!text.trim()) continue;
    try {
      const line = JSON.parse(text);
      if (line?.v === CLAIM_VERSION && typeof line.id === "string" && typeof line.ts === "string") lines.push(line);
    } catch {
      // A line cut short by a crash, or not a claim: skipped.
    }
  }
  return lines.sort((a, b) => a.ts.localeCompare(b.ts));
}

/** The claims still live at `now`: each claim's latest line, unless past its time; a release is final. */
export function liveClaims(lines, now = Date.now()) {
  const latest = new Map();
  const released = new Set(lines.filter((line) => line.released).map((line) => line.id));
  for (const line of lines)
    if (!line.released) latest.set(line.id, { ...line, first: latest.get(line.id)?.first ?? line.ts });
  return [...latest.values()].filter((line) => !released.has(line.id) && Date.parse(line.until) > now);
}

/** Every live claim in the store, with the file it is in. */
export function storeClaims(home, now = Date.now()) {
  return claimsFiles(home).flatMap((path) =>
    liveClaims(readClaimLines(path), now).map((claim) => ({ ...claim, path })),
  );
}

/** The hours a new claim lasts: --for, else the driver's FREEFLOW_CLAIM_HOURS (delegation.claimHours), else 4. */
export function claimHours(option, env = process.env) {
  const given = option ?? env.FREEFLOW_CLAIM_HOURS;
  if (given === undefined || given === "") return DEFAULT_CLAIM_HOURS;
  const hours = Number(given);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 168)
    fail("--for is a number of hours, more than 0 and at most 168.");
  return hours;
}

async function append(file, lines) {
  await ensureUnionMerge(file.home);
  await appendNoFollow(file.path, lines.map((line) => `${JSON.stringify(line)}\n`).join(""));
}

/**
 * Writes one claim per repository the paths fall in, for the task (and delegation) on behalf of the session.
 * @param {{ taskDir: string, task: string, delegation?: string | null, identity: { id: string }, globs: string[], cwd: string, hours: number, now?: Date }} options
 */
export async function addClaims({ taskDir, task, delegation = null, identity, globs, cwd, hours, now = new Date() }) {
  const file = claimsPathFor(taskDir);
  if (!file) fail("Claims live in the Freeflow store: this task is kept outside one.");
  if (!identity) fail("No session ID: a claim names the session that holds it.");
  if (!globs.length) fail("claim takes --paths, one glob or path each.");
  const until = new Date(now.getTime() + hours * HOUR).toISOString();
  const lines = claimGroups(globs, cwd).map((group) => ({
    v: CLAIM_VERSION,
    id: randomBytes(6).toString("hex"),
    task,
    ...(delegation ? { delegation } : {}),
    session: identity.id,
    repo: group.repo,
    paths: group.paths,
    until,
    ts: now.toISOString(),
  }));
  await append(file, lines);
  return lines;
}

/**
 * Releases claims in the store: this session's (all, or those naming one of `globs`), or a delegation's of a task.
 * Returns the claims released.
 * @param {{ home: string, identity?: { id: string } | null, globs?: string[], cwd?: string, task?: string, delegation?: string, now?: Date }} options
 */
export async function releaseClaims({
  home,
  identity = null,
  globs = [],
  cwd = process.cwd(),
  task,
  delegation,
  now = new Date(),
}) {
  const wanted = globs.length ? claimGroups(globs, cwd) : null;
  const released = [];
  for (const path of claimsFiles(home)) {
    const mine = liveClaims(readClaimLines(path), now.getTime()).filter((claim) =>
      delegation
        ? claim.task === task && claim.delegation === delegation
        : claim.session === identity?.id &&
          (!wanted ||
            wanted.some(
              (group) => group.repo === (claim.repo ?? null) && group.paths.some((each) => claim.paths.includes(each)),
            )),
    );
    if (!mine.length) continue;
    await append(
      { home, path },
      mine.map((claim) => ({
        v: CLAIM_VERSION,
        id: claim.id,
        task: claim.task,
        session: identity?.id ?? claim.session,
        released: true,
        ts: now.toISOString(),
      })),
    );
    released.push(...mine);
  }
  return released;
}

/**
 * Renews this session's live claims that have less than half their time left, each by its own length (SPEC-009 4.5):
 * run at the session's store sync, so a claim lasts while its session works.
 */
export async function renewClaims({ home, identity, now = new Date() }) {
  if (!identity || !isFreeflowStore(home)) return [];
  const renewed = [];
  for (const path of claimsFiles(home)) {
    const due = liveClaims(readClaimLines(path), now.getTime()).filter((claim) => {
      if (claim.session !== identity.id) return false;
      // Its length is its latest line's own: a renewal must not add the time since the claim was first made.
      const length = Date.parse(claim.until) - Date.parse(claim.ts);
      return Date.parse(claim.until) - now.getTime() < length / 2;
    });
    if (!due.length) continue;
    const lines = due.map(({ first: _first, path: _path, ...claim }) => ({
      ...claim,
      until: new Date(now.getTime() + (Date.parse(claim.until) - Date.parse(claim.ts))).toISOString(),
      ts: now.toISOString(),
    }));
    await append({ home, path }, lines);
    renewed.push(...lines);
  }
  return renewed;
}

/** The folders a repository is checked out in on this machine: the one the store remembers, and its worktrees. */
function checkoutsOf(home, name, cache) {
  if (cache.has(name)) return cache.get(name);
  let known = {};
  try {
    known = JSON.parse(readFileSync(join(home, REPOSITORIES_FILE), "utf8"));
  } catch {
    known = {};
  }
  const tops = new Set();
  const top = known[name];
  if (top && existsSync(top)) {
    tops.add(normalPath(top));
    for (const line of (git(top, ["worktree", "list", "--porcelain"]) ?? "").split("\n"))
      if (line.startsWith("worktree ")) tops.add(normalPath(line.slice(9)));
  }
  cache.set(name, [...tops]);
  return cache.get(name);
}

/**
 * The live claims the gates warn on in this session (SPEC-009 4.5): every one in the store but the session's own and,
 * in a worker session, its own delegation's; each with the absolute globs it covers on this machine (the repository's
 * checkouts and worktrees here, and `extraCheckouts`, such as the folder the command ran in).
 * @param {{ home: string, identity: { id: string }, joined?: { id: string, task: string } | null, now?: number, extraCheckouts?: { name: string, top: string }[] }} options
 */
export function claimsForGates({ home, identity, joined = null, now = Date.now(), extraCheckouts = [] }) {
  if (!isFreeflowStore(home)) return [];
  const cache = new Map();
  return storeClaims(home, now)
    .filter((claim) => claim.session !== identity.id)
    .filter((claim) => !(joined && claim.task === joined.task && claim.delegation === joined.id))
    .map((claim) => {
      const tops = claim.repo
        ? [
            ...new Set([
              ...checkoutsOf(home, claim.repo, cache),
              ...extraCheckouts.filter((each) => each.name === claim.repo).map((each) => each.top),
            ]),
          ]
        : [""];
      const writes = tops.flatMap((top) =>
        claim.paths.map((path) => (top ? resolvePath(top, path) : isAbsolute(path) ? normalPath(path) : path)),
      );
      return {
        id: claim.id,
        task: claim.task,
        ...(claim.delegation ? { delegation: claim.delegation } : {}),
        session: claim.session,
        until: claim.until,
        writes,
      };
    })
    .filter((claim) => claim.writes.length);
}

/** One line per live claim in the store, for `claim --list`. */
export function renderClaims(home, identity, now = Date.now()) {
  const claims = storeClaims(home, now);
  if (!claims.length) return "No live claims in the store.\n";
  return `${claims
    .map(
      (claim) =>
        `- ${claim.id} · ${claim.task}${claim.delegation ? ` ${claim.delegation}` : ""} · session ${claim.session.slice(0, 8)}${claim.session === identity?.id ? " (this session)" : ""} · until ${claim.until.slice(0, 16).replace("T", " ")} UTC · ${claim.repo ? `${claim.repo}: ` : ""}${claim.paths.join(", ")}`,
    )
    .join("\n")}\n`;
}

export { ClaimError, storeHome };
