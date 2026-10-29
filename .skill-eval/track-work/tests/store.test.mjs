import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const scriptPath = resolve("skills/track-work/scripts/working-record.mjs");
const IDENTITY = ["--git-name", "Test User", "--git-email", "test@example.com"];

async function withFolder(run) {
  const folder = await mkdtemp(join(tmpdir(), "freeflow-store-"));
  try {
    await run(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

/** Runs the script with a Git configuration of the folder's own, so the developer's identity never leaks in. */
function store(folder, args, extraEnv = {}) {
  const gitConfig = join(folder, "gitconfig");
  return spawnSync(process.execPath, [scriptPath, "store", ...args], {
    cwd: folder,
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_GLOBAL: gitConfig, GIT_CONFIG_NOSYSTEM: "1", FREEFLOW_HOME: "", ...extraEnv },
  });
}

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" },
  }).trim();
}

async function bareRemote(folder, name = "remote.git") {
  const remote = join(folder, name);
  execFileSync("git", ["init", "--quiet", "--bare", remote]);
  await writeFile(join(folder, "gitconfig"), "");
  return remote;
}

test("store init lays an empty remote out as the store and pushes its first commit, authored as the user", async () => {
  await withFolder(async (folder) => {
    const remote = await bareRemote(folder);
    const home = join(folder, "home");
    const made = store(folder, ["init", "--remote", remote, "--home", home, ...IDENTITY]);
    assert.equal(made.status, 0, made.stderr);
    assert.match(
      made.stdout,
      /^Created the Freeflow store at .+, first commit pushed; commits are authored as Test User/,
    );
    assert.deepEqual(JSON.parse(await readFile(join(home, "store.json"), "utf8")), {
      kind: "freeflow-store",
      version: 1,
    });
    assert.equal(await readFile(join(home, ".gitignore"), "utf8"), "scratch/\nevidence/**/raw/\nlocal/\nsessions/\n");
    assert.equal(
      await readFile(join(home, ".gitattributes"), "utf8"),
      "history.md merge=union\nsessions.md merge=union\n",
    );
    for (const folderName of ["rules", "projects"]) assert.ok(existsSync(join(home, folderName, ".gitkeep")));
    assert.equal(git(home, ["branch", "--show-current"]), "main");
    const log = git(home, ["log", "--format=%an <%ae>%n%B"]);
    assert.equal(log, "Test User <test@example.com>\nCreate the Freeflow store");
    // The remote holds the commit, and the sync state stays on this machine.
    assert.equal(
      execFileSync("git", ["--git-dir", remote, "rev-parse", "main"], { encoding: "utf8" }).trim(),
      git(home, ["rev-parse", "HEAD"]),
    );
    assert.equal(git(home, ["ls-files", "local"]), "");
    assert.equal(JSON.parse(await readFile(join(home, "local", "sync.json"), "utf8")).result, "created");
  });
});

test("store init on a second machine joins the store as it is, with no commit of its own", async () => {
  await withFolder(async (folder) => {
    const remote = await bareRemote(folder);
    assert.equal(store(folder, ["init", "--remote", remote, "--home", join(folder, "one"), ...IDENTITY]).status, 0);
    const second = store(folder, ["init", "--remote", remote, "--home", join(folder, "two"), ...IDENTITY]);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /^Joined the Freeflow store at /);
    assert.equal(git(join(folder, "two"), ["rev-list", "--count", "HEAD"]), "1");
    assert.equal(git(join(folder, "two"), ["branch", "--show-current"]), "main");
  });
});

test("store init refuses a remote that holds another repository, and leaves no folder behind", async () => {
  await withFolder(async (folder) => {
    const remote = await bareRemote(folder);
    const other = join(folder, "other");
    execFileSync("git", ["init", "--quiet", "-b", "main", other]);
    await writeFile(join(other, "README.md"), "code\n");
    git(other, ["add", "README.md"]);
    git(other, ["-c", "user.name=x", "-c", "user.email=x@example.com", "commit", "--quiet", "-m", "code"]);
    git(other, ["push", "--quiet", remote, "main"]);
    const home = join(folder, "home");
    const refused = store(folder, ["init", "--remote", remote, "--home", home, ...IDENTITY]);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /holds a repository that is not a Freeflow store \(no store\.json at its root\)/);
    assert.equal(existsSync(home), false);
  });
});

test("store init stops on a home that holds Pi's Task Memory, and clones nothing", async () => {
  await withFolder(async (folder) => {
    const remote = await bareRemote(folder);
    const home = join(folder, "home");
    await mkdir(home);
    await writeFile(join(home, "registry.json"), "{}\n");
    const stopped = store(folder, ["init", "--remote", remote], { FREEFLOW_HOME: home });
    assert.equal(stopped.status, 1);
    assert.match(stopped.stderr, /holds Pi's Task Memory \(registry\.json\), which stays as it is/);
    assert.match(stopped.stderr, /--home <folder>/);
    assert.deepEqual(await readdir(home), ["registry.json"]);
  });
});

test("store init needs an identity for the store's commits, and leaves an empty folder empty", async () => {
  await withFolder(async (folder) => {
    const remote = await bareRemote(folder);
    const home = join(folder, "home");
    await mkdir(home);
    const refused = store(folder, ["init", "--remote", remote, "--home", home], { HOME: folder });
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /no Git identity is set: pass --git-name and --git-email/);
    assert.deepEqual(await readdir(home), []);
  });
});

test("store status says what is not committed or pushed, and store sync commits and pushes it", async () => {
  await withFolder(async (folder) => {
    const remote = await bareRemote(folder);
    const home = join(folder, "home");
    assert.equal(store(folder, ["init", "--remote", remote, "--home", home, ...IDENTITY]).status, 0);
    await writeFile(join(home, "rules", "style.md"), "Plain words.\n");
    const before = store(folder, ["status", "--home", home]);
    assert.equal(before.status, 0, before.stderr);
    assert.match(before.stdout, /^Remote: .+remote\.git · branch main$/m);
    assert.match(before.stdout, /^Not committed: 1 path\(s\)$/m);
    assert.match(before.stdout, /^Not pushed: 0 commit\(s\)/m);
    const synced = store(folder, ["sync", "--home", home]);
    assert.equal(synced.status, 0, synced.stderr);
    assert.match(synced.stdout, /committed 1 path\(s\), pushed\./);
    assert.equal(
      execFileSync("git", ["--git-dir", remote, "rev-list", "--count", "main"], { encoding: "utf8" }).trim(),
      "2",
    );
    assert.equal(git(home, ["log", "-1", "--format=%an%n%B"]), "Test User\nSync 1 changed path");
    const after = store(folder, ["status", "--home", home]);
    assert.match(after.stdout, /^Not committed: 0 path\(s\)$/m);
    assert.match(after.stdout, /^Last sync: .+, synced$/m);
    assert.match(store(folder, ["status", "--home", join(folder, "nowhere")]).stderr, /is not a Freeflow store/);
  });
});

test("the Git check accepts a record inside the store and still refuses one a code repository does not ignore", async () => {
  await withFolder(async (folder) => {
    const remote = await bareRemote(folder);
    const home = join(folder, "home");
    assert.equal(store(folder, ["init", "--remote", remote, "--home", home, ...IDENTITY]).status, 0);
    // A project folder in the project-store layout Track Work already reads (its records under tasks/).
    const project = join(home, "projects", "demo");
    await mkdir(project, { recursive: true });
    await writeFile(join(project, "store.json"), `${JSON.stringify({ version: 1, project: "demo" })}\n`);
    const input = "### Goal\n- Test task.\n\n### Next useful action\n- Continue.\n";
    const init = (root) =>
      spawnSync(process.execPath, [scriptPath, "init", "--root", root, "--name", "Demo", "--input", "-"], {
        encoding: "utf8",
        input,
      });
    const inStore = init(project);
    assert.equal(inStore.status, 0, inStore.stderr);
    assert.ok(existsSync(join(project, "tasks", "task-001-demo", "record.md")));
    // The record is a path Git tracks once committed, as the store intends.
    const ignored = spawnSync("git", ["-C", home, "check-ignore", "-q", "projects/demo/tasks/task-001-demo/record.md"]);
    assert.equal(ignored.status, 1, "the store's .gitignore leaves records tracked");

    const code = join(folder, "code");
    execFileSync("git", ["init", "--quiet", code]);
    const refused = init(code);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /is not ignored by Git/);
  });
});
