import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const scriptPath = resolve("skills/track-work/scripts/working-record.mjs");
const BRIEF =
  "## Result wanted\nA file named thing.txt.\n## Scope\nmay write: thing.txt\n## Done when\nthing.txt exists.\n";

/** A Schema 5 task with a current Slice, beside a repository with one commit; returns their paths and a runner. */
async function withTask(run) {
  const folder = realpathSync(await mkdtemp(join(tmpdir(), "track-work-delegations5-")));
  try {
    await writeFile(join(folder, "gitconfig"), "");
    const cli = (args, input = "") =>
      spawnSync(process.execPath, [scriptPath, ...args], {
        cwd: folder,
        input,
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_CONFIG_GLOBAL: join(folder, "gitconfig"),
          GIT_CONFIG_NOSYSTEM: "1",
          FREEFLOW_HOME: "",
        },
      });
    const record = ok(
      cli(
        [
          "init",
          "--schema",
          "5",
          "--root",
          folder,
          "--name",
          "Delegating",
          "--cue",
          "read when delegation matters",
          "--input",
          "-",
        ],
        "### Goal\n- Hand work out.\n### Next action\n- Delegate.\n",
      ),
    ).split("\n")[0];
    ok(
      cli(
        [
          "slice",
          "start-direct",
          "--record",
          record,
          "--title",
          "Coordinate",
          "--next-action",
          "Wait.",
          "--input",
          "-",
        ],
        "- Result wanted: r.\n- Under: the user's request.\n- Scope: s.\n- Done when: d.\n- Stop if: x.\n- Started from: y.\n",
      ),
    );
    const repo = join(folder, "repo");
    execFileSync("git", ["init", "--quiet", "-b", "main", repo]);
    git(repo, ["commit", "--quiet", "--allow-empty", "-m", "base"]);
    await run({ folder, record, repo, taskDir: dirname(record), cli });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

function ok(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

const git = (cwd, args) =>
  execFileSync("git", ["-C", cwd, "-c", "user.name=T", "-c", "user.email=t@example.com", ...args], {
    encoding: "utf8",
  }).trim();

const RETURN = (id, commit) =>
  `# ${id} return\nState: done\n## Result\nthing.txt\n## Identities\nbranch, commit ${commit}\n## Checks\nls shows it\n## Left open\nnone\n## Not done\nnone\n`;

function openBuild(cli, record, repo, extra = []) {
  return ok(
    cli(
      [
        "delegate",
        "open",
        "--record",
        record,
        "--title",
        "Build the thing",
        "--kind",
        "build",
        "--agent",
        "Haiku, xhigh",
        "--repo",
        repo,
        ...extra,
        "--input",
        "-",
      ],
      BRIEF,
    ),
  );
}

test("delegate open writes the brief, makes the worker's worktree on its own branch at the base, and writes the delegation's line", async () => {
  await withTask(async ({ folder, record, repo, taskDir, cli }) => {
    const base = git(repo, ["rev-parse", "--short=8", "HEAD"]);
    git(repo, ["commit", "--quiet", "--allow-empty", "-m", "after the base"]);
    const out = openBuild(cli, record, repo, ["--base", base]);
    const worktree = join(folder, "repo-d-001-build-the-thing");
    assert.match(out, /^Opened D-001 — Build the thing\ndelegations\/D-001-build-the-thing\/brief.md\n/);
    assert.equal(git(worktree, ["branch", "--show-current"]), "d-001-build-the-thing");
    assert.equal(git(worktree, ["rev-parse", "--short=8", "HEAD"]), base);
    const brief = await readFile(join(taskDir, "delegations", "D-001-build-the-thing", "brief.md"), "utf8");
    assert.match(
      brief,
      /^# D-001 — Build the thing\nTask: task-001-delegating · From: S-001 · Opened: \d{4}-\d{2}-\d{2}\nAgent: Haiku, xhigh · Kind: build · Handle: not started\n/,
    );
    assert.ok(
      brief.includes(
        `Space: ${repo} worktree ${worktree} at ${base}, branch d-001-build-the-thing\n## Result wanted\nA file named thing.txt.\n`,
      ),
    );
    assert.match(
      brief,
      /## Read\n- .+execute-work\/references\/delegation.md, Work From A Brief: .+\n- After a compaction, recover with: node .+working-record.mjs view recover --record .+ --delegation D-001\n/,
    );
    assert.match(brief, /## Return when\nDone, blocked, or a choice that is not yours to make.\n\n## Changes\n$/);
    assert.match(
      await readFile(record, "utf8"),
      /### Delegations\n\n- D-001 — Build the thing \(build, Haiku xhigh\) · from S-001 · running · delegations\/D-001-build-the-thing\/brief.md\n/,
    );
    assert.match(
      cli(
        [
          "delegate",
          "open",
          "--record",
          record,
          "--title",
          "x",
          "--kind",
          "plan",
          "--agent",
          "Haiku, xhigh",
          "--input",
          "-",
        ],
        BRIEF,
      ).stderr,
      /--kind is one of build, review, research, eval, gather/,
    );
    assert.match(
      cli(
        [
          "delegate",
          "open",
          "--record",
          record,
          "--title",
          "x",
          "--kind",
          "gather",
          "--agent",
          "Haiku, xhigh",
          "--input",
          "-",
        ],
        "## Scope\nx\n",
      ).stderr,
      /requires the brief's Result wanted section/,
    );
  });
});

test("delegate amend appends a dated change and records the handle; a returned delegation runs again", async () => {
  await withTask(async ({ record, repo, taskDir, cli }) => {
    openBuild(cli, record, repo);
    const worktree = join(dirname(repo), "repo-d-001-build-the-thing");
    await writeFile(join(worktree, "thing.txt"), "t\n");
    git(worktree, ["add", "thing.txt"]);
    git(worktree, ["commit", "--quiet", "-m", "thing"]);
    await writeFile(
      join(taskDir, "delegations", "D-001-build-the-thing", "return.md"),
      RETURN("D-001", git(worktree, ["rev-parse", "--short=8", "HEAD"])),
    );
    ok(cli(["delegate", "check-return", "--record", record, "--id", "D-001"]));
    assert.match(await readFile(record, "utf8"), / · returned · /);
    assert.match(
      ok(
        cli([
          "delegate",
          "amend",
          "--record",
          record,
          "--id",
          "D-001",
          "--text",
          "Name it thing.md instead.",
          "--handle",
          "agent-7",
        ]),
      ),
      /D-001 is running again\./,
    );
    const brief = await readFile(join(taskDir, "delegations", "D-001-build-the-thing", "brief.md"), "utf8");
    assert.match(brief, /· Handle: agent-7\n/);
    assert.match(brief, /## Changes\n- \d{4}-\d{2}-\d{2}: Name it thing.md instead.\n$/);
    assert.match(await readFile(record, "utf8"), / · running · /);
  });
});

test("delegate check-return refuses a missing return, a missing heading and a commit absent from the brief's branch", async () => {
  await withTask(async ({ record, repo, taskDir, cli }) => {
    openBuild(cli, record, repo);
    const folder = join(taskDir, "delegations", "D-001-build-the-thing");
    assert.match(
      cli(["delegate", "check-return", "--record", record, "--id", "D-001"]).stderr,
      /D-001's return is not ready: no return.md yet/,
    );
    const worktree = join(dirname(repo), "repo-d-001-build-the-thing");
    await writeFile(join(worktree, "thing.txt"), "t\n");
    git(worktree, ["add", "thing.txt"]);
    git(worktree, ["commit", "--quiet", "-m", "thing"]);
    const onBranch = git(worktree, ["rev-parse", "--short=8", "HEAD"]);
    git(repo, ["commit", "--quiet", "--allow-empty", "-m", "elsewhere"]);
    const elsewhere = git(repo, ["rev-parse", "--short=8", "HEAD"]);
    await writeFile(join(folder, "return.md"), RETURN("D-001", onBranch).replace("## Checks\nls shows it\n", ""));
    assert.match(
      cli(["delegate", "check-return", "--record", record, "--id", "D-001"]).stderr,
      /the heading "## Checks" is missing/,
    );
    await writeFile(join(folder, "return.md"), RETURN("D-001", elsewhere));
    assert.match(
      cli(["delegate", "check-return", "--record", record, "--id", "D-001"]).stderr,
      new RegExp(`commit ${elsewhere} is not on branch d-001-build-the-thing`),
    );
    await writeFile(join(folder, "return.md"), RETURN("D-001", onBranch));
    assert.match(
      ok(cli(["delegate", "check-return", "--record", record, "--id", "D-001"])),
      /^D-001's return: State done; every heading is there; its 1 commit\(s\) are on branch d-001-build-the-thing\. Its line now says returned\./,
    );
  });
});

test("open --parent nests a sub-worker's folder in its worker's and refuses a fourth level; recovery shows each its own brief, progress and return", async () => {
  await withTask(async ({ record, repo, taskDir, cli }) => {
    openBuild(cli, record, repo);
    const worker = join(taskDir, "delegations", "D-001-build-the-thing");
    await writeFile(
      join(worker, "progress.md"),
      "# D-001 progress\nAs of: now\n## Done\nthe plan\n## Half done\n## Didn't work\n## Next\nwrite thing.txt\n",
    );
    const sub = "## Result wanted\nWhich files name the thing.\n## Scope\nread only\n## Done when\nthe list.\n";
    assert.match(
      ok(
        cli(
          [
            "delegate",
            "open",
            "--record",
            record,
            "--parent",
            "D-001",
            "--title",
            "Find the names",
            "--kind",
            "gather",
            "--agent",
            "Haiku, xhigh",
            "--input",
            "-",
          ],
          sub,
        ),
      ),
      /^Opened D-001\.1 — Find the names\ndelegations\/D-001-build-the-thing\/D-001\.1-find-the-names\/brief.md\n/,
    );
    assert.match(await readFile(join(worker, "D-001.1-find-the-names", "brief.md"), "utf8"), /· From: D-001 ·/);
    const refused = cli(
      [
        "delegate",
        "open",
        "--record",
        record,
        "--parent",
        "D-001.1",
        "--title",
        "Deeper",
        "--kind",
        "gather",
        "--agent",
        "Haiku, xhigh",
        "--input",
        "-",
      ],
      sub,
    );
    assert.match(refused.stderr, /D-001\.1 is a sub-worker, the third and last level/);
    assert.equal((await readFile(record, "utf8")).match(/^- D-/gm).length, 1);
    const workerView = ok(cli(["view", "recover", "--record", record, "--delegation", "D-001"]));
    assert.match(
      workerView,
      /\nYou are D-001's worker: the brief is your scope\. Where it and the record disagree, the brief wins/,
    );
    assert.match(
      workerView,
      /## Delegation D-001\n\n### delegations\/D-001-build-the-thing\/brief.md\n\n# D-001 — Build the thing\n/,
    );
    assert.match(
      workerView,
      /### delegations\/D-001-build-the-thing\/progress.md\n\n# D-001 progress\n[^]*## Next\nwrite thing.txt\n\n### delegations\/D-001-build-the-thing\/return.md\n\nNone yet\.\n/,
    );
    assert.ok(workerView.indexOf("## Delegation D-001") < workerView.indexOf("## Rules"));
    assert.match(
      workerView,
      /Execute Work with its delegation reference \(Work From A Brief\); continue from progress.md's Next/,
    );
    const subView = ok(cli(["view", "recover", "--record", record, "--delegation", "D-001.1"]));
    assert.match(
      subView,
      /You are D-001\.1's sub-worker: .+; your worker's brief \(delegations\/D-001-build-the-thing\/brief.md\) governs yours\./,
    );
    assert.match(
      subView,
      /### delegations\/D-001-build-the-thing\/D-001\.1-find-the-names\/brief.md\n\n# D-001\.1 — Find the names\n/,
    );
    assert.match(
      ok(cli(["delegate", "status", "--record", record])),
      /^- D-001 — Build the thing · build, Haiku xhigh · opened .+ · branch d-001-build-the-thing · no return yet · .+\n  - D-001\.1 — Find the names · gather, Haiku xhigh · no return yet\n$/,
    );
    // The coordinator's own recovery lists its open delegations with where each stands.
    assert.match(
      ok(cli(["view", "recover", "--record", record])),
      /\n- Delegation D-001: opened \d{4}-\d{2}-\d{2}, branch d-001-build-the-thing; no return yet\.\n/,
    );
  });
});

test("a Slice closes while its delegation runs; closing the delegation later appends one History entry with its cost and merge", async () => {
  await withTask(async ({ record, repo, taskDir, cli }) => {
    openBuild(cli, record, repo);
    ok(
      cli(
        [
          "slice",
          "close",
          "--record",
          record,
          "--state",
          "completed",
          "--next-action",
          "Wait for D-001.",
          "--input",
          "-",
        ],
        "- Cue: read when coordinating matters\n- Result: R.\n- Evidence: E.\n- Task effect: T.\n",
      ),
    );
    assert.match(await readFile(record, "utf8"), /- D-001 — Build the thing .+ · running · /);
    const worktree = join(dirname(repo), "repo-d-001-build-the-thing");
    await writeFile(join(worktree, "thing.txt"), "t\n");
    git(worktree, ["add", "thing.txt"]);
    git(worktree, ["commit", "--quiet", "-m", "thing"]);
    await writeFile(
      join(taskDir, "delegations", "D-001-build-the-thing", "return.md"),
      RETURN("D-001", git(worktree, ["rev-parse", "--short=8", "HEAD"])),
    );
    const close = (args) =>
      cli(
        ["delegate", "close", "--record", record, "--id", "D-001", ...args, "--input", "-"],
        "- Cue: read when the thing matters\n- Result: thing.txt exists.\n- Task effect: Built.\n",
      );
    assert.match(
      close(["--outcome", "accepted"]).stderr,
      /accepting it records the commit that merged it, --merge <commit>/,
    );
    const before = git(repo, ["rev-parse", "--short=8", "HEAD"]);
    assert.match(
      close(["--outcome", "accepted", "--merge", before]).stderr,
      /Branch d-001-build-the-thing is not merged in /,
    );
    git(repo, ["merge", "--quiet", "--no-ff", "-m", "Merge D-001", "d-001-build-the-thing"]);
    const merge = git(repo, ["rev-parse", "--short=8", "HEAD"]);
    assert.equal(
      ok(close(["--outcome", "accepted", "--merge", merge, "--tokens", "41000", "--minutes", "6"])),
      "Closed D-001 — accepted\nNot in a Freeflow store: nothing to commit.\n",
    );
    const history = await readFile(join(taskDir, "history.md"), "utf8");
    assert.deepEqual(
      history.split("\n").filter((line) => line.startsWith("## ")),
      ["## S-001 — Coordinate", "## D-001 — Build the thing"],
    );
    assert.ok(
      history.endsWith(
        `- Cue: read when the thing matters\n- Under: the user's request\n- From: S-001\n- Kind: build\n- Agent: Haiku, xhigh\n- Tokens: 41000\n- Minutes: 6\n- Result: thing.txt exists.\n- Task effect: Built.\n- Merge commit: ${merge}\n- Return: delegations/D-001-build-the-thing/return.md\n`,
      ),
    );
    assert.match(await readFile(record, "utf8"), /### Delegations\n\n### Space/);
    assert.match(
      close(["--outcome", "accepted", "--merge", merge]).stderr,
      /D-001 has no line in Current Work's Delegations/,
    );
    assert.match(ok(cli(["validate", "--record", record])), /2 history entries/);
    assert.match(
      cli(["delegate", "close", "--record", record, "--id", "D-001.1", "--outcome", "stopped"]).stderr,
      /its worker reports it in its own return/,
    );
  });
});

test("delegate is for Schema 5 records", async () => {
  const folder = await mkdtemp(join(tmpdir(), "track-work-delegations5-four-"));
  try {
    const run = (args, input = "") =>
      spawnSync(process.execPath, [scriptPath, ...args], { cwd: folder, input, encoding: "utf8" });
    const four = run(
      ["init", "--root", folder, "--name", "Four", "--input", "-"],
      "### Goal\n- G.\n\n### Next useful action\n- N.\n",
    ).stdout.trim();
    assert.match(run(["delegate", "status", "--record", four]).stderr, /delegate is for Schema 5 records/);
    assert.ok(!existsSync(join(dirname(four), "delegations")));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
