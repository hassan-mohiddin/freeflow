// With FREEFLOW_UNTRUSTED_ROOTS set (Evaluate Behavior sets it for a Freeflow arm's host process), Track Work runs no
// Git in a folder someone else writes, but in the Freeflow store itself; unset, nothing changes.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { gitRefused } from "../../../skills/track-work/scripts/lib/untrusted.mjs";

const scriptPath = resolve("skills/track-work/scripts/working-record.mjs");
const GIT_ENV = { ...process.env, GIT_CONFIG_NOSYSTEM: "1" };
const git = (cwd, args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", env: GIT_ENV }).trim();

async function withFolder(run) {
  const folder = await realpath(await mkdtemp(join(tmpdir(), "track-work-untrusted-")));
  try {
    await run(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

/** A repository with one commit whose core.fsmonitor leaves a mark, as a subject would plant one. */
async function plantedRepository(folder, mark) {
  await mkdir(folder, { recursive: true });
  git(folder, ["init", "--quiet", "-b", "main"]);
  await writeFile(join(folder, "a.txt"), "a\n");
  git(folder, ["add", "a.txt"]);
  git(folder, ["-c", "user.name=s", "-c", "user.email=s@x", "commit", "--quiet", "-m", "planted"]);
  git(folder, ["config", "core.fsmonitor", `touch ${JSON.stringify(mark)}; false #`]);
  await writeFile(join(folder, "a.txt"), "changed\n");
}

test("gitRefused: unset, nothing is refused; set, a folder inside a named root is refused but the store's own folders", async () => {
  await withFolder(async (folder) => {
    const workspace = join(folder, "workspace");
    const store = join(folder, "store");
    await mkdir(join(workspace, "src"), { recursive: true });
    await mkdir(join(store, ".git"), { recursive: true });
    await mkdir(join(store, "rules", "planted", ".git"), { recursive: true });
    await mkdir(join(folder, "elsewhere"));
    const env = { FREEFLOW_HOME: store, FREEFLOW_UNTRUSTED_ROOTS: JSON.stringify([workspace, store]) };
    assert.equal(gitRefused(join(workspace, "src"), { FREEFLOW_HOME: store }), false);
    assert.equal(gitRefused(join(workspace, "src"), env), true);
    assert.equal(gitRefused(workspace, env), true);
    assert.equal(gitRefused(store, env), false);
    assert.equal(gitRefused(join(store, "rules"), env), false);
    // A repository of its own inside the store, or a folder below one.
    assert.equal(gitRefused(join(store, "rules", "planted"), env), true);
    assert.equal(gitRefused(join(store, "rules", "planted", ".git"), env), true);
    assert.equal(gitRefused(join(folder, "elsewhere"), env), false);
    assert.equal(gitRefused(join(folder, "missing"), env), true);
    // A store whose .git is not a folder (a gitdir file pointing elsewhere) is not trusted either.
    await rm(join(store, ".git"), { recursive: true });
    await writeFile(join(store, ".git"), "gitdir: /elsewhere\n");
    assert.equal(gitRefused(store, env), true);
  });
});

test("view bundle on the host runs no Git in a repository a subject planted and named in Space; unset, the same bundle does", async () => {
  await withFolder(async (folder) => {
    await writeFile(join(folder, "gitconfig"), "");
    const home = join(folder, "store");
    const workspace = join(folder, "workspace");
    const mark = join(folder, "fsmonitor-ran");
    const env = (extra = {}) => ({
      ...GIT_ENV,
      GIT_CONFIG_GLOBAL: join(folder, "gitconfig"),
      FREEFLOW_HOME: home,
      FREEFLOW_SESSION: "s-1",
      FREEFLOW_HARNESS: "Probe",
      CLAUDE_CODE_SESSION_ID: "",
      FREEFLOW_TRANSCRIPT: "",
      ...extra,
    });
    const cli = (args, extra) =>
      spawnSync(process.execPath, [scriptPath, ...args], { cwd: folder, encoding: "utf8", env: env(extra) });
    assert.equal(cli(["store", "init", "--git-name", "T", "--git-email", "t@x"]).status, 0);
    assert.equal(
      cli(["task", "create", "--title", "Probe", "--goal", "Probe.", "--cue", "read when probing", "--no-project"])
        .status,
      0,
    );
    // What a subject could write: a repository in its workspace, named in the record's Space and in the store's
    // local/repositories.json.
    await plantedRepository(workspace, mark);
    const record = join(home, "tasks", "task-001-probe", "record.md");
    const text = await readFile(record, "utf8");
    await writeFile(
      record,
      text.replace("### Space\n\n", `### Space\n\n- ${workspace} · main · 00000000 · not pushed\n`),
    );
    await writeFile(join(home, "local", "repositories.json"), JSON.stringify({ [workspace]: workspace }));
    const untrusted = { FREEFLOW_UNTRUSTED_ROOTS: JSON.stringify([workspace, home]) };
    for (const args of [
      ["view", "bundle", "--record", record],
      ["view", "bundle", "--record", record, "--fallback"],
      ["task", "here", "--cwd", workspace, "--scan", `${workspace}:${folder}`, "--rules"],
      ["session", "status"],
      ["store", "sync"],
    ])
      assert.equal(cli(args, untrusted).status, 0, `${args.join(" ")}`);
    assert.equal(existsSync(mark), false, "a planted core.fsmonitor ran on the host");
    // The control: without the variable, the same bundle runs Git there, so the test would see it.
    cli(["view", "bundle", "--record", record]);
    assert.equal(existsSync(mark), true, "the control did not run the planted core.fsmonitor");
  });
});
