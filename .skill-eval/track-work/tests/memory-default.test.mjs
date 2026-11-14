// Task memory's default follows the store (D-060, round 3): unset in every layer, a store with a remote syncs and one
// without stays local; an explicit value wins. Memory off stops the commands that record a task (Setting 2).
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const scriptPath = resolve("skills/track-work/scripts/working-record.mjs");
const IDENTITY = ["--git-name", "Test User", "--git-email", "test@example.com"];

async function withFolder(run) {
  const folder = await mkdtemp(join(tmpdir(), "freeflow-memory-default-"));
  try {
    await run(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

/** The script run in this folder, with the Freeflow home as the store and a Git configuration of the folder's own. */
function cliIn(folder, home, session = "aaaaaaaa-1111") {
  return (args, { input = "" } = {}) => {
    const env = {
      ...process.env,
      GIT_CONFIG_GLOBAL: join(folder, "gitconfig"),
      GIT_CONFIG_NOSYSTEM: "1",
      FREEFLOW_HOME: home,
      FREEFLOW_SESSION: session,
      FREEFLOW_HARNESS: "Claude Code",
      FREEFLOW_RESUME: `resume ${session}`,
    };
    for (const name of ["GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"])
      delete env[name];
    return spawnSync(process.execPath, [scriptPath, ...args], { cwd: folder, input, encoding: "utf8", env });
  };
}

async function bareRemote(folder) {
  const remote = join(folder, "remote.git");
  execFileSync("git", ["init", "--quiet", "--bare", remote]);
  await writeFile(join(folder, "gitconfig"), "");
  return remote;
}

const commitsOn = (remote) =>
  execFileSync("git", ["--git-dir", remote, "rev-list", "--count", "main"], { encoding: "utf8" }).trim();

test("a store with a remote and no memory.mode is sync: its first sync pushes (D-060, round 3)", async () => {
  await withFolder(async (folder) => {
    const remote = await bareRemote(folder);
    const home = join(folder, "home");
    const run = cliIn(folder, home);
    const made = run(["store", "init", "--remote", remote, "--home", home, ...IDENTITY]);
    assert.equal(made.status, 0, made.stderr);
    assert.match(run(["store", "status", "--home", home]).stdout, /Task memory: sync/);
    await writeFile(join(home, "rules", "style.md"), "Plain words.\n");
    const synced = run(["store", "sync", "--home", home]);
    assert.equal(synced.status, 0, synced.stderr);
    assert.match(synced.stdout, /committed 1 path\(s\), pushed\./);
    assert.equal(commitsOn(remote), "2");
  });
});

test("a local store with no memory.mode stays local: its sync commits and pushes nothing (D-060, round 3)", async () => {
  await withFolder(async (folder) => {
    const home = join(folder, "home");
    const run = cliIn(folder, home);
    assert.equal(run(["store", "init", "--home", home, ...IDENTITY]).status, 0);
    assert.match(run(["store", "status", "--home", home]).stdout, /Task memory: local$/m);
    await writeFile(join(home, "rules", "style.md"), "Plain words.\n");
    const synced = run(["store", "sync", "--home", home]);
    assert.equal(synced.status, 0, synced.stderr);
    assert.match(synced.stdout, /committed 1 path\(s\), nothing to push\./);
  });
});

test("an explicit local on a store with a remote stays local: its sync commits and pushes nothing (D-060, round 3)", async () => {
  await withFolder(async (folder) => {
    const remote = await bareRemote(folder);
    const home = join(folder, "home");
    const run = cliIn(folder, home);
    assert.equal(run(["store", "init", "--remote", remote, "--home", home, ...IDENTITY]).status, 0);
    assert.equal(commitsOn(remote), "1");
    await writeFile(join(home, "settings.json"), `${JSON.stringify({ memory: { mode: "local" } }, null, 2)}\n`);
    assert.match(run(["store", "status", "--home", home]).stdout, /Task memory: local, not synced with its remote/);
    await writeFile(join(home, "rules", "style.md"), "Plain words.\n");
    const synced = run(["store", "sync", "--home", home]);
    assert.equal(synced.status, 0, synced.stderr);
    assert.equal(commitsOn(remote), "1", "local never pushes, whatever the store's remote");
  });
});

test("with memory.mode off, task create, task take and checkpoint refuse and name the setting; reads still work (D-060, Setting 2)", async () => {
  await withFolder(async (folder) => {
    const home = join(folder, "home");
    const run = cliIn(folder, home);
    assert.equal(run(["store", "init", "--home", home, ...IDENTITY]).status, 0);
    assert.equal(run(["project", "new", "--name", "widget"]).status, 0);
    const created = run([
      "task",
      "create",
      "--title",
      "Probe",
      "--goal",
      "Probe.",
      "--cue",
      "read when probing",
      "--project",
      "widget",
    ]);
    assert.equal(created.status, 0, created.stderr);
    await writeFile(join(home, "settings.json"), `${JSON.stringify({ memory: { mode: "off" } }, null, 2)}\n`);
    const refusals = [
      [
        "task create",
        ["task", "create", "--title", "Two", "--goal", "Two.", "--cue", "read when two", "--project", "widget"],
      ],
      ["task take", ["task", "take", "--id", "widget/task-001"]],
      ["checkpoint", ["checkpoint", "--record", "widget/task-001", "--input", "-"]],
    ];
    for (const [label, args] of refusals) {
      const refused = run(args, { input: "## Goal\n- g\n" });
      assert.equal(refused.status, 1, `${label} should refuse: ${refused.stdout}${refused.stderr}`);
      assert.match(refused.stderr, /Task memory is off here \(memory\.mode\)/, label);
      assert.match(refused.stderr, /settings\.mjs set memory\.mode local/, label);
    }
    // A scratch delegation records nothing in the store, so it is not refused.
    const scratch = join(folder, "scratch");
    const brief = run(
      [
        "delegate",
        "open",
        "--scratch",
        scratch,
        "--title",
        "Probe worker",
        "--agent",
        "claude-haiku-5-5, low",
        "--kind",
        "gather",
        "--input",
        "-",
      ],
      { input: "## Result wanted\n- r\n" },
    );
    assert.doesNotMatch(brief.stderr, /Task memory is off here/, brief.stderr);
    // Reads keep working: the held task's recovery view.
    const read = run(["view", "recover", "--record", "widget/task-001"]);
    assert.equal(read.status, 0, read.stderr);
    assert.match(read.stdout, /# Probe/);
    // On again, the same command records a task (the session releases its held task first).
    await writeFile(join(home, "settings.json"), `${JSON.stringify({ memory: { mode: "local" } }, null, 2)}\n`);
    assert.equal(run(["task", "release"]).status, 0);
    const again = run([
      "task",
      "create",
      "--title",
      "Two",
      "--goal",
      "Two.",
      "--cue",
      "read when two",
      "--project",
      "widget",
    ]);
    assert.equal(again.status, 0, again.stderr);
    assert.match(
      await readFile(join(home, "projects", "widget", "tasks", "task-002-two", "record.md"), "utf8"),
      /# Two/,
    );
  });
});
