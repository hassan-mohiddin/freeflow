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

test("store init --remote uses an empty clone of that remote already in the folder, as a cloud session has it (P97)", async () => {
  await withFolder(async (folder) => {
    const remote = await bareRemote(folder);
    const home = join(folder, "home");
    execFileSync("git", ["clone", "--quiet", remote, home], { stdio: "ignore" });
    const made = store(folder, ["init", "--remote", `${remote}/`, "--home", home, ...IDENTITY]);
    assert.equal(made.status, 0, made.stderr);
    assert.match(made.stdout, /^Created the Freeflow store at .+, first commit pushed/);
    assert.ok(existsSync(join(home, "store.json")));
    assert.equal(
      execFileSync("git", ["--git-dir", remote, "rev-parse", "main"], { encoding: "utf8" }).trim(),
      git(home, ["rev-parse", "HEAD"]),
    );
    // A clone of another repository, or one with files in it, is still refused.
    const other = await bareRemote(folder, "other.git");
    const elsewhere = join(folder, "elsewhere");
    execFileSync("git", ["clone", "--quiet", other, elsewhere], { stdio: "ignore" });
    const refused = store(folder, ["init", "--remote", remote, "--home", elsewhere, ...IDENTITY]);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /is not empty and is not a Freeflow store/);
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
      spawnSync(
        process.execPath,
        [scriptPath, "init", "--schema", "4", "--root", root, "--name", "Demo", "--input", "-"],
        {
          encoding: "utf8",
          input,
        },
      );
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

/** Two machines on one store: `one` made it, `two` joined it. */
async function twoMachines(folder) {
  const remote = await bareRemote(folder);
  const one = join(folder, "one");
  const two = join(folder, "two");
  assert.equal(store(folder, ["init", "--remote", remote, "--home", one, ...IDENTITY]).status, 0);
  assert.equal(store(folder, ["init", "--remote", remote, "--home", two, ...IDENTITY]).status, 0);
  const remoteFile = (path) =>
    spawnSync("git", ["--git-dir", remote, "show", `main:${path}`], { encoding: "utf8" }).stdout;
  return { remote, one, two, remoteFile };
}

async function writeIn(home, path, text) {
  await mkdir(join(home, path, ".."), { recursive: true });
  await writeFile(join(home, path), text);
}

const TASK = "projects/demo/tasks/task-001-demo";

test("appends to history.md on two machines merge by keeping both sides' lines", async () => {
  await withFolder(async (folder) => {
    const { one, two, remoteFile } = await twoMachines(folder);
    await writeIn(one, `${TASK}/history.md`, "- S-001 completed\n");
    assert.equal(store(folder, ["sync", "--home", one]).status, 0);
    assert.equal(store(folder, ["sync", "--home", two]).status, 0);
    await writeIn(one, `${TASK}/history.md`, "- S-001 completed\n- S-002 completed, on one\n");
    await writeIn(two, `${TASK}/history.md`, "- S-001 completed\n- S-003 completed, on two\n");
    assert.equal(store(folder, ["sync", "--home", one]).status, 0);
    const merged = store(folder, ["sync", "--home", two]);
    assert.equal(merged.status, 0, merged.stderr);
    for (const text of [await readFile(join(two, TASK, "history.md"), "utf8"), remoteFile(`${TASK}/history.md`)]) {
      assert.match(text, /S-002 completed, on one/);
      assert.match(text, /S-003 completed, on two/);
    }
  });
});

test("a record both machines changed keeps both copies and stops, until store sync --resolved", async () => {
  await withFolder(async (folder) => {
    const { one, two, remoteFile } = await twoMachines(folder);
    await writeIn(one, `${TASK}/record.md`, "Goal: first\n");
    assert.equal(store(folder, ["sync", "--home", one]).status, 0);
    assert.equal(store(folder, ["sync", "--home", two]).status, 0);
    await writeIn(one, `${TASK}/record.md`, "Goal: from one\n");
    assert.equal(store(folder, ["sync", "--home", one]).status, 0);
    await writeIn(two, `${TASK}/record.md`, "Goal: from two\n");
    const stopped = store(folder, ["sync", "--home", two]);
    assert.equal(stopped.status, 1);
    assert.match(stopped.stderr, new RegExp(`The remote changed what this store changed too: ${TASK}/record\\.md`));
    assert.match(stopped.stderr, /local\/conflicts\//);
    // Both copies: this machine's in place, committed and not pushed; the remote's beside it, where Git ignores it.
    assert.equal(await readFile(join(two, TASK, "record.md"), "utf8"), "Goal: from two\n");
    assert.equal(await readFile(join(two, "local", "conflicts", TASK, "record.md"), "utf8"), "Goal: from one\n");
    assert.equal(remoteFile(`${TASK}/record.md`), "Goal: from one\n");
    assert.equal(git(two, ["status", "--porcelain"]), "");
    assert.match(store(folder, ["status", "--home", two]).stdout, /^Conflict waiting: .+record\.md/m);
    assert.match(store(folder, ["sync", "--home", two]).stderr, /A conflict waits in .+record\.md/);

    await writeIn(two, `${TASK}/record.md`, "Goal: from one and two\n");
    const resolved = store(folder, ["sync", "--home", two, "--resolved"]);
    assert.equal(resolved.status, 0, resolved.stderr);
    assert.equal(remoteFile(`${TASK}/record.md`), "Goal: from one and two\n");
    assert.equal(existsSync(join(two, "local", "conflict.json")), false);
    assert.equal(existsSync(join(two, "local", "conflicts")), false);
    assert.equal(store(folder, ["sync", "--home", one]).status, 0);
    assert.equal(await readFile(join(one, TASK, "record.md"), "utf8"), "Goal: from one and two\n");
  });
});

test("with no network the commit stays here without failing, and the next sync pushes it", async () => {
  await withFolder(async (folder) => {
    const { remote, two, remoteFile } = await twoMachines(folder);
    git(two, ["remote", "set-url", "origin", join(folder, "unreachable.git")]);
    await writeIn(two, "rules/offline.md", "Written offline.\n");
    const offline = store(folder, ["sync", "--home", two]);
    assert.equal(offline.status, 0, offline.stderr);
    assert.match(
      offline.stdout,
      /committed 1 path\(s\), not pushed \(no network or no access: .*unreachable\.git.*\); the next store sync pushes it/,
    );
    assert.match(store(folder, ["status", "--home", two]).stdout, /^Not pushed: 1 commit\(s\)/m);
    assert.match(store(folder, ["status", "--home", two]).stdout, /^Last sync: .+, offline/m);
    git(two, ["remote", "set-url", "origin", remote]);
    const online = store(folder, ["sync", "--home", two]);
    assert.equal(online.status, 0, online.stderr);
    assert.match(online.stdout, /nothing to commit, pushed\./);
    assert.equal(remoteFile("rules/offline.md"), "Written offline.\n");
  });
});

test("a secret stops the push, named by path, line and kind, and a commit that held it never leaves", async () => {
  await withFolder(async (folder) => {
    const { remote, two } = await twoMachines(folder);
    // Assembled here, so the token shape never appears whole in this repository.
    const key = ["AKIA", "Q7Z3", "PLANTEDTESTKEY"].join("").slice(0, 20);
    await writeIn(two, "rules/notes.md", `Plain words.\nThe key is ${key} for now.\n`);
    const refused = store(folder, ["sync", "--home", two]);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /Not pushed: rules\/notes\.md:2 looks like an AWS access key/);
    assert.doesNotMatch(refused.stderr, new RegExp(key));
    const remoteLog = () => execFileSync("git", ["--git-dir", remote, "log", "-p", "main"], { encoding: "utf8" });
    assert.doesNotMatch(remoteLog(), /notes\.md/);

    await writeIn(two, "rules/notes.md", "Plain words.\nThe key is in the vault.\n");
    const pushed = store(folder, ["sync", "--home", two]);
    assert.equal(pushed.status, 0, pushed.stderr);
    assert.match(remoteLog(), /The key is in the vault/);
    assert.doesNotMatch(remoteLog(), new RegExp(key));
    assert.equal(
      git(two, ["log", "-1", "--format=%s"]),
      "Sync 2 commits as one: an earlier one held a secret, since removed",
    );
  });
});

test("a push the remote refused because it moved takes the remote's commits and pushes again", async () => {
  await withFolder(async (folder) => {
    const { one, two, remoteFile } = await twoMachines(folder);
    await writeIn(one, "rules/from-one.md", "One.\n");
    // While two pushes, one pushes first: two's push is refused as not a fast-forward, once.
    const hook = join(two, ".git", "hooks", "pre-push");
    await writeFile(
      hook,
      `#!/bin/sh\nif [ ! -f "${join(folder, "raced")}" ]; then\n  touch "${join(folder, "raced")}"\n  unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_PREFIX\n  "${process.execPath}" "${scriptPath}" store sync --home "${one}" >/dev/null 2>&1\nfi\nexit 0\n`,
      { mode: 0o755 },
    );
    await writeIn(two, "rules/from-two.md", "Two.\n");
    const synced = store(folder, ["sync", "--home", two]);
    assert.equal(synced.status, 0, synced.stderr);
    assert.match(synced.stdout, /pushed\./);
    assert.ok(existsSync(join(folder, "raced")), "one pushed while two was pushing");
    assert.equal(remoteFile("rules/from-one.md"), "One.\n");
    assert.equal(remoteFile("rules/from-two.md"), "Two.\n");
  });
});

test("store sync --pull takes the remote's commits and pushes nothing", async () => {
  await withFolder(async (folder) => {
    const { one, two, remoteFile } = await twoMachines(folder);
    await writeIn(one, "rules/from-one.md", "One.\n");
    assert.equal(store(folder, ["sync", "--home", one]).status, 0);
    await writeIn(two, "rules/from-two.md", "Two.\n");
    const pulled = store(folder, ["sync", "--home", two, "--pull"]);
    assert.equal(pulled.status, 0, pulled.stderr);
    assert.match(pulled.stdout, /^Took the remote's commits into .+: committed 1 path\(s\), nothing pushed\.$/m);
    assert.equal(await readFile(join(two, "rules", "from-one.md"), "utf8"), "One.\n");
    assert.equal(remoteFile("rules/from-two.md"), "");
    assert.match(
      store(folder, ["sync", "--home", two, "--pull", "--resolved"]).stderr,
      /--pull or --resolved, not both/,
    );
  });
});

test("the secret scan reads only a patch's added lines, at their line in the new file", async () => {
  const { secretsInDiff } = await import("../../../skills/track-work/scripts/lib/freeflow-store.mjs");
  const token = ["ghp", "_", "a".repeat(36)].join("");
  const diff = [
    "diff --git a/rules/a.md b/rules/a.md",
    "--- a/rules/a.md",
    "+++ b/rules/a.md",
    "@@ -3,0 +4,2 @@",
    "+fine",
    `+token ${token}`,
    "diff --git a/rules/b.md b/rules/b.md",
    "--- a/rules/b.md",
    "+++ b/rules/b.md",
    "@@ -1 +1 @@",
    `-old ${token}`,
    "+new",
  ].join("\n");
  assert.deepEqual(secretsInDiff(diff), [{ path: "rules/a.md", line: 5, kind: "a GitHub token" }]);
});

test("store init without --remote makes a local store: committed here, nothing to push", async () => {
  await withFolder(async (folder) => {
    await writeFile(join(folder, "gitconfig"), "");
    const home = join(folder, "home");
    const made = store(folder, ["init", "--home", home, ...IDENTITY]);
    assert.equal(made.status, 0, made.stderr);
    assert.match(
      made.stdout,
      /^Created a local Freeflow store at .+; nothing leaves this machine until store remote --url <url>/,
    );
    assert.deepEqual(JSON.parse(await readFile(join(home, "store.json"), "utf8")), {
      kind: "freeflow-store",
      version: 1,
    });
    assert.equal(git(home, ["remote"]), "");
    assert.equal(git(home, ["branch", "--show-current"]), "main");
    assert.equal(git(home, ["log", "--format=%an%n%B"]), "Test User\nCreate the Freeflow store");
    assert.match(store(folder, ["status", "--home", home]).stdout, /^Remote: none, a local store/m);
    await writeFile(join(home, "rules", "style.md"), "Plain words.\n");
    const synced = store(folder, ["sync", "--home", home]);
    assert.equal(synced.status, 0, synced.stderr);
    assert.match(synced.stdout, /^Synced the local store .+: committed 1 path\(s\), nothing to push\.$/m);
    assert.equal(git(home, ["rev-list", "--count", "HEAD"]), "2");
  });
});

test("store remote makes a local store a cloud store with its history, and refuses a repository that holds commits", async () => {
  await withFolder(async (folder) => {
    const remote = await bareRemote(folder);
    const home = join(folder, "home");
    assert.equal(store(folder, ["init", "--home", home, ...IDENTITY]).status, 0);
    await writeFile(join(home, "rules", "style.md"), "Plain words.\n");
    assert.equal(store(folder, ["sync", "--home", home]).status, 0);
    const moved = store(folder, ["remote", "--url", remote, "--home", home]);
    assert.equal(moved.status, 0, moved.stderr);
    assert.match(
      moved.stdout,
      /is now a cloud store: it syncs with .+remote\.git, and its history \(2 commit\(s\)\) is pushed\./,
    );
    assert.equal(
      execFileSync("git", ["--git-dir", remote, "rev-list", "--count", "main"], { encoding: "utf8" }).trim(),
      "2",
    );
    assert.match(store(folder, ["remote", "--url", remote, "--home", home]).stderr, /already syncs with/);
    // Another device joins the cloud store it became, and the two stay in step.
    const other = join(folder, "other");
    assert.equal(store(folder, ["init", "--remote", remote, "--home", other, ...IDENTITY]).status, 0);
    assert.equal(await readFile(join(other, "rules", "style.md"), "utf8"), "Plain words.\n");

    const second = join(folder, "second");
    assert.equal(store(folder, ["init", "--home", second, ...IDENTITY]).status, 0);
    const refused = store(folder, ["remote", "--url", remote, "--home", second]);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /already holds commits; a local store moves only into an empty repository/);
    assert.equal(git(second, ["remote"]), "");
  });
});

test("session status names what keeps the session from a working store, and who fixes it (P94)", async () => {
  await withFolder(async (folder) => {
    const remote = await bareRemote(folder);
    const status = (home, env = {}) => {
      const run = spawnSync(process.execPath, [scriptPath, "session", "status"], {
        cwd: folder,
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_CONFIG_GLOBAL: join(folder, "gitconfig"),
          GIT_CONFIG_NOSYSTEM: "1",
          FREEFLOW_HOME: home,
          CLAUDE_CODE_REMOTE: "",
          CLAUDE_CODE_REMOTE_SESSION_ID: "",
          ...env,
        },
      });
      assert.equal(run.status, 0, run.stderr);
      return JSON.parse(run.stdout).missing;
    };
    const cloud = { CLAUDE_CODE_REMOTE: "true" };
    // FREEFLOW_HOME names a store that is not there: in a cloud session the user selects its repository.
    const absent = join(folder, "absent");
    assert.deepEqual(
      status(absent, cloud).map((part) => part.by),
      ["user"],
    );
    assert.match(status(absent, cloud)[0].fix, /select the store's repository when starting a session/);
    assert.match(status(absent)[0].fix, /^store init \(local only\) or store init --remote <url>/);
    // An empty clone of the store's repository: the agent lays it out.
    const clone = join(folder, "clone");
    execFileSync("git", ["clone", "--quiet", remote, clone], { stdio: "ignore" });
    assert.deepEqual(status(clone, cloud), [
      {
        what: `${clone} is an empty clone of ${remote}, not yet laid out as the store`,
        fix: `store init --remote ${remote}, on the user's word`,
        by: "agent",
      },
    ]);
    // A local store: nothing missing on this machine, but a cloud session needs its remote.
    const local = join(folder, "local");
    assert.equal(store(folder, ["init", "--home", local, ...IDENTITY]).status, 0);
    assert.deepEqual(status(local), []);
    assert.match(status(local, cloud)[0].what, /has no remote, so its task memory is lost with this container/);
  });
});
