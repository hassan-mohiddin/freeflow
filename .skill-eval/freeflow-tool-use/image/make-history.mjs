// Builds the ledger project's Git history (the script tasks' fixtures/ledger) at image build time from
// history/history.json, as .skill-eval/freeflow-routing/image/make-history.mjs does for shelf. Each listed commit is the
// fixture (head/) with that commit's overlay folders copied over it, in order, and its `remove` paths deleted, made on
// its `branch` (main unless named). After the last commit the work tree is the fixture itself, so the files
// `uncommitted` lists are changed or untracked and nothing else differs. Fixed identity and dates keep the commit IDs
// the same on every build. Usage: node make-history.mjs <build> <git-dir>, or `node make-history.mjs --check` to build
// it from this suite's folder into a temporary directory and print the log.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let [build, gitDirectory] = process.argv.slice(2);
let scratch = null;
if (build === "--check") {
  const suite = join(dirname(fileURLToPath(import.meta.url)), "..");
  scratch = mkdtempSync(join(tmpdir(), "ledger-history-"));
  build = join(scratch, "build");
  gitDirectory = join(scratch, "project.git");
  cpSync(join(suite, "fixtures", "ledger"), join(build, "head"), { recursive: true });
  cpSync(join(suite, "image", "ledger-history"), join(build, "history"), { recursive: true });
}
const worktree = join(build, "worktree");
const { commits, uncommitted = [] } = JSON.parse(readFileSync(join(build, "history", "history.json"), "utf8"));

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

const fill = (overlays = [], remove = []) => {
  for (const entry of readdirSync(worktree)) rmSync(join(worktree, entry), { recursive: true, force: true });
  cpSync(join(build, "head"), worktree, { recursive: true });
  for (const overlay of overlays) cpSync(join(build, "history", overlay), worktree, { recursive: true });
  for (const path of remove) rmSync(join(worktree, path), { recursive: true, force: true });
};

mkdirSync(worktree, { recursive: true });
git(["init", "--quiet", "--initial-branch=main"]);
git(["config", "core.fileMode", "false"]);
git(["config", "user.name", identity.name]);
git(["config", "user.email", identity.email]);

let branch = "main";
for (const commit of commits) {
  const wanted = commit.branch ?? "main";
  if (wanted !== branch) {
    const exists = git(["branch", "--list", wanted]).trim() !== "";
    if (!exists) git(["branch", wanted]);
    git(["symbolic-ref", "HEAD", `refs/heads/${wanted}`]);
    branch = wanted;
  }
  fill(commit.overlay, commit.remove);
  git(["add", "--all"]);
  git(["commit", "--quiet", "--allow-empty", "--message", commit.message], {
    GIT_AUTHOR_DATE: commit.date,
    GIT_COMMITTER_DATE: commit.date,
  });
}
git(["reset", "--quiet"]);
fill();
const changed = git(["status", "--porcelain"])
  .split("\n")
  .filter(Boolean)
  .map((line) => line.slice(3))
  .sort();
if (JSON.stringify(changed) !== JSON.stringify([...uncommitted].sort())) {
  throw new Error(`the work tree differs from the last commit in ${changed.join(", ") || "nothing"}`);
}
process.stdout.write(git(["log", "--all", "--format=%H %D %s"]));
if (scratch !== null) rmSync(scratch, { recursive: true, force: true });
