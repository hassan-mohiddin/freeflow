// Builds a task's Git history at image build time from history/history.json. Each listed commit is the fixture
// (head/) with that commit's overlay folder copied over it and its `remove` paths deleted; a commit without an
// overlay or removals is the fixture itself, and the last commit must be, so HEAD holds the fixture exactly. Fixed
// identity and dates keep the commit IDs the same on every build. Usage: node make-history.mjs <build> <git-dir>.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const [build, gitDirectory] = process.argv.slice(2);
const worktree = join(build, "worktree");
const { commits } = JSON.parse(readFileSync(join(build, "history", "history.json"), "utf8"));
const last = commits.at(-1);
if (last.overlay || last.remove) throw new Error("the last commit must be the fixture itself");

const identity = { name: "Sam Rivera", email: "sam@example.com" };
const env = {
  ...process.env,
  GIT_DIR: gitDirectory,
  GIT_WORK_TREE: worktree,
  GIT_AUTHOR_NAME: identity.name,
  GIT_AUTHOR_EMAIL: identity.email,
  GIT_COMMITTER_NAME: identity.name,
  GIT_COMMITTER_EMAIL: identity.email,
};
const git = (args, extra = {}) => execFileSync("git", args, { env: { ...env, ...extra }, encoding: "utf8" });

mkdirSync(worktree, { recursive: true });
git(["init", "--quiet", "--initial-branch=main"]);
git(["config", "core.fileMode", "false"]);
git(["config", "user.name", identity.name]);
git(["config", "user.email", identity.email]);

for (const commit of commits) {
  for (const entry of readdirSync(worktree)) rmSync(join(worktree, entry), { recursive: true, force: true });
  cpSync(join(build, "head"), worktree, { recursive: true });
  if (commit.overlay) cpSync(join(build, "history", commit.overlay), worktree, { recursive: true });
  for (const path of commit.remove ?? []) rmSync(join(worktree, path), { recursive: true, force: true });
  git(["add", "--all"]);
  git(["commit", "--quiet", "--allow-empty", "--message", commit.message], {
    GIT_AUTHOR_DATE: commit.date,
    GIT_COMMITTER_DATE: commit.date,
  });
}
if (git(["status", "--porcelain"]).trim() !== "") throw new Error("HEAD does not hold the fixture exactly");
process.stdout.write(git(["log", "--format=%H %s"]));
