import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { writeAtomically } from "../../../skills/track-work/scripts/lib/store.mjs";

// What the script does whatever the task: its help and options, where a record may be, how it is written and found,
// and validate's pointer checks. Schema 5's commands are tested in schema5.test.mjs and the files beside it.

const scriptPath = resolve("skills/track-work/scripts/working-record.mjs");
const gitEnv = { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" };

async function makeWorkspace() {
  return mkdtemp(join(tmpdir(), "track-work-cli-"));
}

function runScript(workspace, args, input = "", cwd = workspace) {
  return new Promise((resolveResult) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd,
      env: { ...process.env, ...gitEnv, TRACK_WORK_TEST_MODE: "1", FREEFLOW_HOME: "", FREEFLOW_CONTEXT_WINDOW: "" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (exitCode) => resolveResult({ exitCode, stdout, stderr }));
    child.stdin.end(input);
  });
}

async function cleanup(workspace) {
  await rm(workspace, { recursive: true, force: true });
}

/** A Schema 5 task at root, through init; returns its record's path (init's first line). */
async function initRecord(workspace, name, root = workspace) {
  const result = await runScript(
    workspace,
    ["init", "--root", root, "--name", name, "--cue", "read when testing the script", "--input", "-"],
    "### Goal\n- Test task.\n\n### Next action\n- Continue the focused test.\n",
  );
  assert.equal(result.exitCode, 0, result.stderr);
  return result.stdout.split("\n")[0];
}

const git = (cwd, ...args) =>
  execFileSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args],
    { cwd, env: { ...process.env, ...gitEnv }, encoding: "utf8" },
  ).trim();

test("command help is local and unknown options fail before reading a record", async () => {
  const workspace = await makeWorkspace();
  try {
    const help = await runScript(workspace, ["slice", "start", "--help"]);
    assert.equal(help.exitCode, 0, help.stderr);
    assert.match(help.stdout, /slice start/);
    assert.match(help.stdout, /Stop if and Started from required/);

    const unknown = await runScript(workspace, ["slice", "start", "--not-an-option", "value"]);
    assert.notEqual(unknown.exitCode, 0);
    assert.match(unknown.stderr, /Unknown option/);
  } finally {
    await cleanup(workspace);
  }
});

test("help documents slice record, root resolution, and that input never carries State", async () => {
  const workspace = await makeWorkspace();
  try {
    const group = await runScript(workspace, ["slice", "--help"]);
    assert.match(group.stdout, /slice record/);
    const record = await runScript(workspace, ["slice", "record", "--help"]);
    assert.match(record.stdout, /Occurred \(YYYY-MM-DD or YYYY-MM-DD to YYYY-MM-DD\)/);
    assert.match(record.stdout, /absolute --record path finds its own root/);
    const propose = await runScript(workspace, ["slice", "propose", "--help"]);
    assert.match(propose.stdout, /input never includes it/);
  } finally {
    await cleanup(workspace);
  }
});

test("task numbers continue after the highest existing task and support more than three digits", async () => {
  const workspace = await makeWorkspace();
  try {
    const first = resolve(workspace, await initRecord(workspace, "first"));
    await initRecord(workspace, "second");
    await rm(dirname(first), { recursive: true });
    assert.match(await initRecord(workspace, "third"), /task-003-third[\\/]record\.md$/);

    await mkdir(join(workspace, ".freeflow/tasks/task-1000-large"));
    const large = await initRecord(workspace, "after-large");
    assert.match(large, /task-1001-after-large[\\/]record\.md$/);
    assert.equal((await runScript(workspace, ["validate", "--record", large])).exitCode, 0);
  } finally {
    await cleanup(workspace);
  }
});

test("an absolute record path works from any directory; a mismatched root names the fix", async () => {
  const workspace = await makeWorkspace();
  const elsewhere = await makeWorkspace();
  try {
    const recordPath = resolve(workspace, await initRecord(workspace, "elsewhere"));
    const absolute = await runScript(workspace, ["validate", "--record", recordPath], "", elsewhere);
    assert.equal(absolute.exitCode, 0, absolute.stderr);
    const proposed = await runScript(
      workspace,
      ["slice", "propose", "--record", recordPath, "--title", "Later", "--input", "-"],
      "- Result wanted: Something later.\n",
      elsewhere,
    );
    assert.equal(proposed.exitCode, 0, proposed.stderr);
    const mismatched = await runScript(
      workspace,
      ["validate", "--root", elsewhere, "--record", recordPath],
      "",
      elsewhere,
    );
    assert.notEqual(mismatched.exitCode, 0);
    assert.match(mismatched.stderr, /pass --root or an absolute --record path/);
  } finally {
    await cleanup(elsewhere);
    await cleanup(workspace);
  }
});

test("atomic publication rejects a stale source without overwriting newer content", async () => {
  const workspace = await makeWorkspace();
  try {
    const recordPath = resolve(workspace, await initRecord(workspace, "stale-source"));
    const source = await readFile(recordPath, "utf8");
    const newer = `${source}\nA newer direct edit.\n`;
    await writeFile(recordPath, newer, "utf8");
    await assert.rejects(
      writeAtomically(workspace, recordPath, source, `${source}Published stale content.\n`),
      (error) => error.code === "stale-source",
    );
    assert.equal(await readFile(recordPath, "utf8"), newer);
  } finally {
    await cleanup(workspace);
  }
});

test("init works when only a directory-only ignore rule covers the not-yet-created tasks folder", async () => {
  const workspace = await makeWorkspace();
  try {
    const repo = join(workspace, "repo");
    await mkdir(repo);
    git(repo, "init", "-q");
    await writeFile(join(repo, ".gitignore"), ".freeflow/*/\n");
    await initRecord(repo, "fresh-clone");
  } finally {
    await cleanup(workspace);
  }
});

test("a repository reached through a symlinked directory works like any other", async () => {
  const real = await realpath(await makeWorkspace());
  const linkParent = await makeWorkspace();
  const linked = join(linkParent, "linked");
  try {
    await mkdir(join(real, "repo"));
    git(join(real, "repo"), "init", "-q");
    await writeFile(join(real, "repo", ".gitignore"), ".freeflow/tasks\n");
    await symlink(real, linked);
    const repo = join(linked, "repo");
    await initRecord(repo, "via-link");
    const relativeRecord = ".freeflow/tasks/task-001-via-link/record.md";
    const proposed = await runScript(
      repo,
      ["slice", "propose", "--record", relativeRecord, "--title", "Keep it", "--input", "-"],
      "- Result wanted: It is kept.\n",
    );
    assert.equal(proposed.exitCode, 0, proposed.stderr);
    const valid = await runScript(repo, ["validate", "--record", relativeRecord]);
    assert.equal(valid.exitCode, 0, valid.stderr);
  } finally {
    await cleanup(linkParent);
    await cleanup(real);
  }
});

test("validate warns on unresolved pointers, fails on them only with --strict, and lists outside ones", async () => {
  const root = await realpath(await makeWorkspace());
  try {
    git(root, "init", "--quiet", "--initial-branch=main");
    await writeFile(join(root, ".gitignore"), ".freeflow/\n");
    await mkdir(join(root, "docs"), { recursive: true });
    await writeFile(join(root, "docs/spec.md"), "# Spec\n\nOne.\nTwo.\n");
    git(root, "add", "--all");
    git(root, "commit", "--quiet", "-m", "base");
    const head = git(root, "rev-parse", "HEAD");
    const recordPath = resolve(root, await initRecord(root, "Queue"));
    const started = await runScript(
      root,
      [
        "slice",
        "start-direct",
        "--record",
        recordPath,
        "--title",
        "Build the queue",
        "--next-action",
        "Edit.",
        "--input",
        "-",
      ],
      "- Result wanted: a queue.\n- Under: the user's request to build it\n- Scope: src/.\n- Done when: tests pass.\n- Stop if: done.\n- Started from: main.\n",
    );
    assert.equal(started.exitCode, 0, started.stderr);
    const updates = [
      `- Result: identity ${head} — docs/spec.md`,
      "- Evidence (observed): fast; 17/9 runs passed — scratch/bench.json",
      "- Evidence (reported): compared — ~/elsewhere/notes.md",
      "- Extension: a new script — src/planned.mjs",
      "- Result: merged upstream — 2d3dd0bc",
      "- Extension: seen again in session d5d6ba82 (Session 4b1e90c2) — sources/notes.md",
    ];
    const text = await readFile(recordPath, "utf8");
    await writeFile(recordPath, text.replace("\n\n### Delegations", `\n${updates.join("\n")}\n\n### Delegations`));

    const warned = await runScript(root, ["validate", "--record", recordPath]);
    assert.equal(warned.exitCode, 0, warned.stderr);
    assert.match(warned.stdout, /^valid\n/);
    assert.match(warned.stdout, /does not resolve here: line \d+: scratch\/bench\.json does not exist/);
    assert.match(warned.stdout, /does not resolve here: line \d+: src\/planned\.mjs does not exist/);
    assert.match(warned.stdout, /does not resolve here: line \d+: commit 2d3dd0bc is not in this repository/);
    assert.doesNotMatch(warned.stdout, /17\/9/);
    // A session's ID is a hex word too, but not a commit.
    assert.doesNotMatch(warned.stdout, /d5d6ba82|4b1e90c2/);
    assert.match(warned.stdout, /outside the repository, not checked: line \d+: ~\/elsewhere\/notes\.md/);

    const strict = await runScript(root, ["validate", "--record", recordPath, "--strict"]);
    assert.equal(strict.exitCode, 1, strict.stdout);
    assert.match(
      strict.stderr,
      /on Evidence or Result lines do not resolve:\n- line \d+: scratch\/bench\.json does not exist\n- line \d+: commit 2d3dd0bc/,
    );
    // A planned path on an Extension line stays a warning, even with --strict.
    assert.doesNotMatch(strict.stderr, /src\/planned\.mjs/);

    await mkdir(join(dirname(recordPath), "scratch"), { recursive: true });
    await writeFile(join(dirname(recordPath), "scratch/bench.json"), "{}\n");
    await writeFile(
      recordPath,
      (await readFile(recordPath, "utf8")).replace("merged upstream — 2d3dd0bc", `merged — ${head}`),
    );
    const passing = await runScript(root, ["validate", "--record", recordPath, "--strict"]);
    assert.equal(passing.exitCode, 0, passing.stderr);
    assert.match(passing.stdout, /does not resolve here: line \d+: src\/planned\.mjs/);
    assert.doesNotMatch(passing.stdout, /bench\.json|2d3dd0bc/);
  } finally {
    await cleanup(root);
  }
});

test("a Schema 4 record is read only by migrate and view full; every other command names migrate", async () => {
  const workspace = await makeWorkspace();
  try {
    const fixture = resolve(".skill-eval/track-work/fixtures/schema4-full/task-001-full-record/record.md");
    const folder = join(workspace, ".freeflow/tasks/task-001-old");
    await mkdir(folder, { recursive: true });
    const recordPath = join(folder, "record.md");
    const text = await readFile(fixture, "utf8");
    await writeFile(recordPath, text);
    assert.equal((await runScript(workspace, ["view", "full", "--record", recordPath])).stdout, text);
    for (const args of [
      ["view", "recover"],
      ["validate"],
      ["slice", "propose", "--title", "X"],
      ["budget"],
      ["delegate", "status"],
    ]) {
      const refused = await runScript(workspace, [...args, "--record", recordPath], "- Result wanted: X.\n");
      assert.notEqual(refused.exitCode, 0, args.join(" "));
      assert.match(refused.stderr, /is a Schema 4 record, which only migrate reads now: convert it with migrate/);
    }
    assert.equal(await readFile(recordPath, "utf8"), text);
    const init = await runScript(workspace, ["init", "--schema", "4", "--root", workspace, "--name", "Four"]);
    assert.match(init.stderr, /Unknown option --schema for init/);
  } finally {
    await cleanup(workspace);
  }
});
