#!/usr/bin/env node
// What a commit would hold, and whose it is, before touching the index: every staged, unstaged and untracked path,
// marked yours, pre-existing or unknown; staged changes that were already staged before your work (never absorb or
// unstage them); files with both staged and unstaged changes; sensitive-looking paths and Working Records; and what
// `git diff --cached --check` finds. Read-only apart from its own snapshot file.
// Usage: commit-state.mjs snapshot [--root <repository>] [--scratch <dir>]
//        commit-state.mjs [--mine <path>]... [--root <repository>] [--scratch <dir>] [--json]
// `snapshot`, taken before your first edit, records the dirty and staged state that is not yours. Without one, --mine
// names the paths you changed; a path neither names is "unknown". --scratch defaults to a folder under the system
// temporary directory. Exit code 0 when it reports, 2 on a usage error or outside a Git repository.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { git, repositoryRoot, workingState } from "./lib/git-state.mjs";

const USAGE = [
  "Usage: commit-state.mjs snapshot [--root <repository>] [--scratch <dir>]",
  "       commit-state.mjs [--mine <path>]... [--root <repository>] [--scratch <dir>] [--json]",
].join("\n");
let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      root: { type: "string" },
      scratch: { type: "string" },
      mine: { type: "string", multiple: true, default: [] },
      json: { type: "boolean", default: false },
    },
  });
} catch (error) {
  console.error(`${error.message}\n${USAGE}`);
  process.exit(2);
}
const { values, positionals } = parsed;
if (positionals.length > 1 || (positionals.length && positionals[0] !== "snapshot")) {
  console.error(USAGE);
  process.exit(2);
}
const root = repositoryRoot(values.root ?? ".");
if (!root) {
  console.error("not inside a Git repository");
  process.exit(2);
}
const scratch = resolve(
  values.scratch ??
    join(
      tmpdir(),
      "freeflow-commit-state",
      `${basename(root)}-${createHash("sha256").update(root).digest("hex").slice(0, 8)}`,
    ),
);
const snapshotPath = join(scratch, "commit-state-snapshot.json");

// A path's identity in the index and in the working tree, so a later change to either shows.
const identity = (path) => ({
  index: git(root, ["ls-files", "-s", "--", path])?.split(/\s+/)[1] ?? null,
  tree: existsSync(join(root, path)) ? git(root, ["hash-object", "--", path]) : null,
});
const working = workingState(root);

if (positionals[0] === "snapshot") {
  mkdirSync(scratch, { recursive: true });
  const paths = Object.fromEntries(working.entries.map((entry) => [entry.path, { ...entry, ...identity(entry.path) }]));
  writeFileSync(
    snapshotPath,
    `${JSON.stringify({ root, head: git(root, ["rev-parse", "HEAD"]), at: new Date().toISOString(), paths }, null, 2)}\n`,
  );
  console.log(`Snapshot of ${working.entries.length} pre-existing changed path(s): ${snapshotPath}`);
  process.exit(0);
}

const snapshot = existsSync(snapshotPath) ? JSON.parse(readFileSync(snapshotPath, "utf8")) : null;
const mine = new Set(values.mine.map((path) => relative(root, resolve(path)).split("\\").join("/")));
function owner(entry) {
  if (snapshot) {
    const before = snapshot.paths[entry.path];
    if (!before) return "yours";
    const now = identity(entry.path);
    return now.index === before.index && now.tree === before.tree ? "pre-existing" : "mixed: pre-existing plus yours";
  }
  // A --mine path names a file, or a folder holding it.
  if ([...mine].some((path) => entry.path === path || entry.path.startsWith(`${path}/`))) return "yours";
  return "unknown";
}
const SENSITIVE =
  /(^|\/)(\.env(\..*)?|\.npmrc|\.pypirc|id_(rsa|ed25519|ecdsa)(\.pub)?|.*\.(pem|key|p12|pfx|keystore)|credentials?(\.json)?|secrets?(\.[a-z]+)?|.*\.tfstate)$/i;
const flags = (entry) => [
  ...(/^\.freeflow\/(tasks\/.*)?$/.test(entry.path) ? ["Working Record: never stage"] : []),
  ...(SENSITIVE.test(entry.path) ? ["sensitive-looking: inspect before staging"] : []),
];
const describe = (entry) => ({
  path: entry.path,
  ...(entry.from ? { from: entry.from } : {}),
  index: entry.x,
  tree: entry.y,
  owner: owner(entry),
  partial: entry.x !== " " && entry.x !== "?" && entry.y !== " " && entry.y !== "?",
  flags: flags(entry),
});
const staged = working.staged.map(describe);
const unstaged = working.unstaged.filter((entry) => entry.x === " ").map(describe);
const untracked = working.untracked.map(describe);
const conflicted = working.conflicted.map(describe);
// Conflict markers and whitespace damage in what is staged; Git exits nonzero when it finds any.
const cached = spawnSync("git", ["diff", "--cached", "--check"], { cwd: root, encoding: "utf8" });
const check =
  cached.status === 0 ? "clean" : (cached.stdout || cached.stderr).trim().split("\n").slice(0, 20).join("\n");
const report = {
  command: "commit-state",
  root,
  ownership: snapshot ? `snapshot of ${snapshot.at}` : mine.size ? "--mine paths" : "unknown: no snapshot or --mine",
  staged,
  stagedNotYours: staged.filter((each) => each.owner !== "yours").map((each) => each.path),
  unstaged,
  untracked,
  conflicted,
  cachedCheck: check,
};

if (values.json) console.log(JSON.stringify(report, null, 2));
else {
  const line = (each) =>
    `  ${each.index}${each.tree} ${each.from ? `${each.from} -> ` : ""}${each.path}  [${each.owner}]${each.partial ? " (staged and unstaged changes)" : ""}${each.flags.length ? `  ! ${each.flags.join("; ")}` : ""}`;
  const out = [`Ownership from: ${report.ownership}`];
  out.push(`Staged (${staged.length}):`, ...(staged.length ? staged.map(line) : ["  none"]));
  if (report.stagedNotYours.length)
    out.push(
      `  Not yours, or not known to be: ${report.stagedNotYours.join(", ")}. Do not absorb or unstage them; ask which commit the user wants.`,
    );
  out.push(`Unstaged only (${unstaged.length}):`, ...(unstaged.length ? unstaged.map(line) : ["  none"]));
  out.push(`Untracked (${untracked.length}):`, ...(untracked.length ? untracked.map(line) : ["  none"]));
  if (conflicted.length) out.push(`Conflicted (${conflicted.length}):`, ...conflicted.map(line));
  out.push(`git diff --cached --check: ${check}`);
  console.log(out.join("\n"));
}
