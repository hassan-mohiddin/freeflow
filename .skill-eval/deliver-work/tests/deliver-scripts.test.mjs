import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const scripts = resolve("skills/deliver-work/scripts");
const gitEnv = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
const git = (cwd, ...args) =>
  execFileSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args],
    {
      cwd,
      env: gitEnv,
      encoding: "utf8",
    },
  ).trim();
const write = async (root, files) => {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
};
const run = (name, cwd, args = []) => {
  const result = spawnSync(process.execPath, [join(scripts, name), ...args], { cwd, env: gitEnv, encoding: "utf8" });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    json: result.stdout.trimStart().startsWith("{") ? JSON.parse(result.stdout) : null,
  };
};

// A clone of a bare remote, so upstream counts come from real remote-tracking refs.
async function clone() {
  const top = await realpath(await mkdtemp(join(tmpdir(), "deliver-")));
  const remote = join(top, "remote.git");
  const root = join(top, "work");
  git(top, "init", "--quiet", "--bare", "--initial-branch=main", remote);
  git(top, "clone", "--quiet", remote, root);
  // An empty clone starts on the machine's default branch name; name it main as the remote does.
  git(root, "symbolic-ref", "HEAD", "refs/heads/main");
  await write(root, {
    "package.json": JSON.stringify({ name: "demo", version: "1.2.0", files: ["index.js"], main: "index.js" }),
    "index.js": "export default 1;\n",
    "CHANGELOG.md":
      "# Changelog\n\n## Unreleased\n\n### Added\n\n- A thing.\n- Another.\n\n### Fixed\n\n- A bug.\n\n## 1.1.0\n\n- Old.\n",
  });
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "base");
  git(root, "push", "--quiet", "-u", "origin", "main");
  return { top, root };
}

test("delivery-state reports branch, upstream counts, dirt, operations, worktrees with the session's, tag, version and changelog", async () => {
  const { top, root } = await clone();
  try {
    git(root, "tag", "v1.1.0");
    git(root, "commit", "--quiet", "--allow-empty", "-m", "local only");
    await write(root, { "index.js": "export default 2;\n", "new.txt": "x\n", "staged.txt": "s\n" });
    git(root, "add", "staged.txt");
    git(root, "worktree", "add", "--quiet", "-b", "side", join(top, "side"));
    const state = run("delivery-state.mjs", join(top, "side"), ["--root", root, "--json"]).json;
    assert.equal(state.branch.branch, "main");
    assert.equal(state.branch.upstream, "origin/main");
    assert.equal(state.branch.ahead, 1);
    assert.equal(state.branch.behind, 0);
    assert.deepEqual(state.working, { staged: 1, unstaged: 1, untracked: 1, conflicted: 0 });
    assert.deepEqual(state.inProgress, []);
    assert.deepEqual(
      state.worktrees.map((tree) => [tree.branch, tree.sessionCwd]),
      [
        ["main", false],
        ["side", true],
      ],
    );
    assert.equal(state.latestTag.tag, "v1.1.0");
    assert.equal(state.latestTag.commitsSince, 1);
    assert.equal(state.version.version, "1.2.0");
    assert.deepEqual(state.changelog.unreleased, { entries: 3, categories: { Added: 2, Fixed: 1 } });
    assert.ok(state.unavailable.length);
    const text = run("delivery-state.mjs", root).stdout;
    assert.match(text, /<- this session's cwd is inside/);
  } finally {
    await rm(top, { recursive: true, force: true });
  }
});

test("delivery-state reports a merge in progress", async () => {
  const { top, root } = await clone();
  try {
    git(root, "checkout", "--quiet", "-b", "other");
    await write(root, { "index.js": "export default 3;\n" });
    git(root, "commit", "--quiet", "-am", "other");
    git(root, "checkout", "--quiet", "main");
    await write(root, { "index.js": "export default 4;\n" });
    git(root, "commit", "--quiet", "-am", "main");
    spawnSync("git", ["merge", "other"], { cwd: root, env: gitEnv });
    const state = run("delivery-state.mjs", root, ["--json"]).json;
    assert.deepEqual(state.inProgress, ["merge"]);
    assert.equal(state.working.conflicted, 1);
  } finally {
    await rm(top, { recursive: true, force: true });
  }
});

test("commit-state tells pre-existing staged work from yours, and flags sensitive files and Working Records", async () => {
  const { top, root } = await clone();
  const scratch = join(top, "scratch");
  try {
    await write(root, { "theirs.txt": "staged before\n" });
    git(root, "add", "theirs.txt");
    assert.equal(run("commit-state.mjs", root, ["snapshot", "--scratch", scratch]).status, 0);
    await write(root, { "index.js": "export default 5;\n", ".env": "KEY=1\n", ".freeflow/tasks/t/record.md": "# R\n" });
    git(root, "add", "index.js");
    const report = run("commit-state.mjs", root, ["--scratch", scratch, "--json"]).json;
    const owners = Object.fromEntries([...report.staged, ...report.untracked].map((each) => [each.path, each.owner]));
    assert.equal(owners["theirs.txt"], "pre-existing");
    assert.equal(owners["index.js"], "yours");
    assert.deepEqual(report.stagedNotYours, ["theirs.txt"]);
    const flags = Object.fromEntries(report.untracked.map((each) => [each.path, each.flags.join("; ")]));
    assert.match(flags[".env"], /sensitive-looking/);
    assert.match(flags[".freeflow/"], /Working Record/);
    assert.equal(report.cachedCheck, "clean");

    const unknown = run("commit-state.mjs", root, [
      "--scratch",
      join(top, "none"),
      "--mine",
      "index.js",
      "--json",
    ]).json;
    assert.deepEqual(unknown.stagedNotYours, ["theirs.txt"]);
    await write(root, { "index.js": "export default 6; \n" });
    git(root, "add", "index.js");
    assert.match(
      run("commit-state.mjs", root, ["--scratch", scratch, "--json"]).json.cachedCheck,
      /trailing whitespace/,
    );
  } finally {
    await rm(top, { recursive: true, force: true });
  }
});

test("release-preflight finds an existing tag elsewhere, a dirty tree and a version older than the latest tag", async () => {
  const { top, root } = await clone();
  try {
    const clean = run("release-preflight.mjs", root, ["--json"]);
    assert.equal(clean.status, 0, clean.stdout);
    assert.equal(clean.json.pack.version, "1.2.0");
    assert.equal(clean.json.pack.files, 2);
    git(root, "tag", "v1.2.0");
    git(root, "commit", "--quiet", "--allow-empty", "-m", "after tag");
    await write(root, { "index.js": "dirty\n" });
    const problems = run("release-preflight.mjs", root, ["--no-pack", "--json"]).json.problems.join("\n");
    assert.match(problems, /tag v1\.2\.0 already exists locally at [0-9a-f]{12}, not HEAD/);
    assert.match(problems, /1 uncommitted change/);
    const older = run("release-preflight.mjs", root, ["--no-pack", "--version", "1.0.0", "--json"]);
    assert.equal(older.status, 1);
    assert.match(older.json.problems.join("\n"), /older than the latest tag v1\.2\.0/);
    assert.match(older.json.problems.join("\n"), /differs from the declared 1\.2\.0/);
  } finally {
    await rm(top, { recursive: true, force: true });
  }
});

test("push-route names the simple push, and stops on divergence and detached HEAD", async () => {
  const { top, root } = await clone();
  try {
    git(root, "commit", "--quiet", "--allow-empty", "-m", "ahead");
    const ahead = run("push-route.mjs", root, ["--json"]);
    assert.equal(ahead.status, 0, ahead.stdout);
    assert.equal(ahead.json.pushCommand, "git push origin main");
    assert.equal(ahead.json.commits.length, 1);

    git(root, "checkout", "--quiet", "-b", "feature");
    const fresh = run("push-route.mjs", root, ["--json"]).json;
    assert.equal(fresh.pushCommand, "git push --set-upstream origin feature");

    const other = join(top, "other");
    git(top, "clone", "--quiet", join(top, "remote.git"), other);
    git(other, "commit", "--quiet", "--allow-empty", "-m", "theirs");
    git(other, "push", "--quiet", "origin", "main");
    git(root, "checkout", "--quiet", "main");
    git(root, "fetch", "--quiet");
    const diverged = run("push-route.mjs", root, ["--json"]);
    assert.equal(diverged.status, 1);
    assert.match(diverged.json.stops.join("\n"), /have diverged \(ahead 1, behind 1\)/);
    assert.equal(diverged.json.pushCommand, null);

    git(root, "checkout", "--quiet", "--detach");
    assert.match(run("push-route.mjs", root, ["--json"]).json.stops.join("\n"), /HEAD is detached/);
  } finally {
    await rm(top, { recursive: true, force: true });
  }
});
