import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
        ["init", "--root", folder, "--name", "Delegating", "--cue", "read when delegation matters", "--input", "-"],
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
    const worktree = join(folder, "repo.worktrees", "D-001-build-the-thing");
    assert.match(out, /^Opened D-001 — Build the thing\ndelegations\/D-001-build-the-thing\/brief.md\n/);
    assert.equal(git(worktree, ["branch", "--show-current"]), "d-001-build-the-thing");
    assert.equal(git(worktree, ["rev-parse", "--short=8", "HEAD"]), base);
    const brief = await readFile(join(taskDir, "delegations", "D-001-build-the-thing", "brief.md"), "utf8");
    assert.match(
      brief,
      /^# D-001 — Build the thing\nTask: task-001-delegating · From: S-001 · Opened: \d{4}-\d{2}-\d{2}\nAgent: Haiku, xhigh · Kind: build · Route: given · Handle: not started\n/,
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
    const worktree = join(dirname(repo), "repo.worktrees", "D-001-build-the-thing");
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
    const worktree = join(dirname(repo), "repo.worktrees", "D-001-build-the-thing");
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

test("delegate check-return takes no email ID, UUID or path folder for a commit, and refuses every other commit that is not there, a URL's ref included", async () => {
  await withTask(async ({ record, repo, taskDir, cli }) => {
    openBuild(cli, record, repo);
    const folder = join(taskDir, "delegations", "D-001-build-the-thing");
    const worktree = join(dirname(repo), "repo.worktrees", "D-001-build-the-thing");
    const base = git(worktree, ["rev-parse", "--short=8", "HEAD"]);
    await writeFile(join(worktree, "thing.txt"), "t\n");
    git(worktree, ["add", "thing.txt"]);
    git(worktree, ["commit", "--quiet", "-m", "thing"]);
    const onBranch = git(worktree, ["rev-parse", "--short=8", "HEAD"]);
    const identities = [
      `- Commits ${base}..${onBranch}, author Hassan Mohiddin <63719517+hassan-mohiddin@users.noreply.github.com>:`,
      `  - ${onBranch} thing.`,
      "- Evidence: /tmp/claude-0/-home-user/d5d6ba82-6849-5796-ad46-8163c07640ac/scratchpad/self-review.md",
      "- Checked under /tmp/runs/a1b2c3d4e5/out/",
    ].join("\n");
    const withIdentities = (lines) => RETURN("D-001", onBranch).replace(`branch, commit ${onBranch}\n`, `${lines}\n`);
    await writeFile(join(folder, "return.md"), withIdentities(identities));
    assert.match(
      ok(cli(["delegate", "check-return", "--record", record, "--id", "D-001"])),
      /^D-001's return: State done; every heading is there; its 2 commit\(s\) are on branch d-001-build-the-thing\./,
    );
    const full = "7e57ab1e7e57ab1e7e57ab1e7e57ab1e7e57ab1e";
    for (const missing of [
      "- Fix: 7e57ab1e",
      "- Shipped in skills/track-work/scripts/lib/delegations5.mjs 7e57ab1e.",
      "- Base: origin/main 7e57ab1e",
      "- Checked and/or 7e57ab1e",
      "- Pushed origin/7e57ab1e",
      "- Branch fix-7e57ab1e",
      "- Head 7e57ab1e-dirty",
      `- Shipped in lib/delegations5.mjs ${full}.`,
      `- Checked and/or ${full}`,
      `- Branch d-001/build ${full}`,
      `- Schemas at openai/codex ${full}`,
      `- See https://github.com/o/r/blob/${full}/skills/x.md`,
      `- See https://github.com/o/r/tree/${full}/skills`,
      `- Fix ${full}@v1.2`,
      `- Fix ${full}@x.yz`,
      `- See https://github.com/o/r/commit/${full}`,
    ]) {
      await writeFile(join(folder, "return.md"), withIdentities(`${identities}\n${missing}`));
      assert.match(
        cli(["delegate", "check-return", "--record", record, "--id", "D-001"]).stderr,
        /D-001's return is not ready: commit 7e57ab1e\w* does not exist\.$/m,
        missing,
      );
    }
    git(repo, ["commit", "--quiet", "--allow-empty", "-m", "elsewhere"]);
    const offBranch = git(repo, ["rev-parse", "HEAD"]);
    await writeFile(
      join(folder, "return.md"),
      withIdentities(`${identities}\n- See https://github.com/o/r/blob/${offBranch}/x.md`),
    );
    assert.match(
      cli(["delegate", "check-return", "--record", record, "--id", "D-001"]).stderr,
      new RegExp(`commit ${offBranch} is not on branch d-001-build-the-thing`),
    );
  });
});

test("delegate check-return takes a commit in uppercase or joined to a word by _", async () => {
  await withTask(async ({ record, repo, taskDir, cli }) => {
    openBuild(cli, record, repo);
    const folder = join(taskDir, "delegations", "D-001-build-the-thing");
    const worktree = join(dirname(repo), "repo.worktrees", "D-001-build-the-thing");
    await writeFile(join(worktree, "thing.txt"), "t\n");
    git(worktree, ["add", "thing.txt"]);
    git(worktree, ["commit", "--quiet", "-m", "thing"]);
    const onBranch = git(worktree, ["rev-parse", "--short=8", "HEAD"]);
    const check = () => cli(["delegate", "check-return", "--record", record, "--id", "D-001"]);
    const write = (text) => writeFile(join(folder, "return.md"), text);
    // A commit in uppercase, and one joined to "commit" by _, is checked like any other.
    const upper = onBranch.toUpperCase();
    await write(RETURN("D-001", upper));
    assert.match(
      ok(check()),
      /^D-001's return: State done; every heading is there; its 1 commit\(s\) are on branch d-001-build-the-thing\./,
    );
    await write(RETURN("D-001", onBranch).replace(`commit ${onBranch}`, `commit_${onBranch}`));
    assert.match(
      ok(check()),
      /^D-001's return: State done; every heading is there; its 1 commit\(s\) are on branch d-001-build-the-thing\./,
    );
    // Either form that names no commit of the repository is still refused.
    for (const [text, hash] of [
      [RETURN("D-001", "ABCDEF12"), "ABCDEF12"],
      [RETURN("D-001", "abcdef12").replace("commit abcdef12", "commit_abcdef12"), "abcdef12"],
    ]) {
      await write(text);
      assert.match(
        check().stderr,
        new RegExp(`D-001's return is not ready: commit ${hash} does not exist\\.$`, "m"),
        text,
      );
    }
  });
});

test("delegate check-return and close take another repository's commit only as --elsewhere names it, and History records it", async () => {
  await withTask(async ({ record, repo, taskDir, cli }) => {
    openBuild(cli, record, repo);
    const folder = join(taskDir, "delegations", "D-001-build-the-thing");
    const worktree = join(dirname(repo), "repo.worktrees", "D-001-build-the-thing");
    await writeFile(join(worktree, "thing.txt"), "t\n");
    git(worktree, ["add", "thing.txt"]);
    git(worktree, ["commit", "--quiet", "-m", "thing"]);
    const onBranch = git(worktree, ["rev-parse", "--short=8", "HEAD"]);
    const upstream = "079e17a422347e49d02501304f79fade7e569362";
    const lines = `branch, commit ${onBranch}\n- Schemas at openai/codex ${upstream} (main at 079e17a4)\n`;
    await writeFile(
      join(folder, "return.md"),
      RETURN("D-001", onBranch).replace(`branch, commit ${onBranch}\n`, lines),
    );
    const check = (...extra) => cli(["delegate", "check-return", "--record", record, "--id", "D-001", ...extra]);
    assert.match(
      check().stderr,
      /commit 079e17a422347e49d02501304f79fade7e569362 does not exist; commit 079e17a4 does not exist\./,
    );
    assert.match(check("--elsewhere", "079e17a4").stderr, /--elsewhere is <hash>=<owner\/name>/);
    assert.match(
      check("--elsewhere", "1234567=acme/other", "--elsewhere", `${upstream}=openai/codex`).stderr,
      /--elsewhere 1234567=acme\/other names no commit of the return that is missing here/,
    );
    assert.match(
      ok(check("--elsewhere", `${upstream}=openai/codex`)),
      /its 1 commit\(s\) are on branch d-001-build-the-thing; not checked here, named another repository's: 079e17a4 \(openai\/codex\)\./,
    );
    git(repo, ["merge", "--quiet", "--no-ff", "-m", "Merge D-001", "d-001-build-the-thing"]);
    const merge = git(repo, ["rev-parse", "--short=8", "HEAD"]);
    const close = (...extra) =>
      cli(
        [
          "delegate",
          "close",
          "--record",
          record,
          "--id",
          "D-001",
          "--outcome",
          "accepted",
          "--merge",
          merge,
          ...extra,
          "--input",
          "-",
        ],
        "- Cue: read when the thing matters\n- Result: thing.txt\n- Task effect: built\n",
      );
    assert.match(close().stderr, /D-001 cannot be accepted: its return is not ready: commit 079e17a4/);
    ok(close("--elsewhere", "079e17a4=openai/codex"));
    assert.match(
      await readFile(join(taskDir, "history.md"), "utf8"),
      /\n- Elsewhere: not checked here, named another repository's: 079e17a4 \(openai\/codex\)\n/,
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
    // The same as data, for Freeflow's Claude Code pane (SPEC-015), with a return's State once there is one.
    await writeFile(join(worker, "D-001.1-find-the-names", "return.md"), "# D-001.1 return\nState: done\n");
    const status = JSON.parse(ok(cli(["delegate", "status", "--record", record, "--json"])));
    assert.equal(status.delegations.length, 1);
    const [top] = status.delegations;
    assert.deepEqual(
      { ...top, opened: undefined, sub: undefined },
      {
        id: "D-001",
        title: "Build the thing",
        kind: "build",
        agent: "Haiku, xhigh",
        settled: null,
        check: null,
        route: "given",
        opened: undefined,
        handle: top.handle,
        branch: "d-001-build-the-thing",
        worktree: top.worktree,
        returned: null,
        folder: worker,
        sub: undefined,
      },
    );
    assert.match(top.opened, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(
      top.sub.map((each) => [each.id, each.title, each.kind, each.agent, each.returned, each.branch, each.sub]),
      [["D-001.1", "Find the names", "gather", "Haiku, xhigh", "done", null, undefined]],
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
    const worktree = join(dirname(repo), "repo.worktrees", "D-001-build-the-thing");
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
      `Closed D-001 — accepted\nRemoved the worktree ${join(dirname(repo), "repo.worktrees", "D-001-build-the-thing")}; branch d-001-build-the-thing is kept.\nNot in a Freeflow store: nothing to commit.\n`,
    );
    const history = await readFile(join(taskDir, "history.md"), "utf8");
    assert.deepEqual(
      history.split("\n").filter((line) => line.startsWith("## ")),
      ["## S-001 — Coordinate", "## D-001 — Build the thing"],
    );
    assert.ok(
      history.endsWith(
        `- Cue: read when the thing matters\n- Under: the user's request\n- From: S-001\n- Kind: build\n- Agent: Haiku, xhigh\n- Route: given\n- Tokens: 41000\n- Minutes: 6\n- Measured: not measured\n- Result: thing.txt exists.\n- Task effect: Built.\n- Merge commit: ${merge}\n- Return: delegations/D-001-build-the-thing/return.md\n`,
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

test("delegate close measures the worker from its own log, beside the coordinator's transcript (A)", async () => {
  await withTask(async ({ record, taskDir, cli }) => {
    ok(
      cli(
        [
          "delegate",
          "open",
          "--record",
          record,
          "--title",
          "Read the callers",
          "--kind",
          "gather",
          "--agent",
          "Haiku, xhigh",
          "--handle",
          "a1b2",
          "--input",
          "-",
        ],
        BRIEF,
      ),
    );
    await writeFile(
      join(taskDir, "delegations", "D-001-read-the-callers", "return.md"),
      "# D-001 return\nState: done\n## Result\nthe callers\n## Identities\nnone\n## Checks\ngrep\n## Left open\nnone\n## Not done\nnone\n",
    );
    // The coordinator's transcript, and beside it the worker's own log: two requests three minutes apart.
    const transcript = join(taskDir, "scratch", "session.jsonl");
    const logs = join(taskDir, "scratch", "session", "subagents");
    await mkdir(logs, { recursive: true });
    await writeFile(transcript, "");
    const request = (minute, id, usage) =>
      JSON.stringify({
        type: "assistant",
        isSidechain: true,
        agentId: "a1b2",
        timestamp: new Date(Date.UTC(2026, 9, 30, 10, minute)).toISOString(),
        effort: "xhigh",
        message: { id, model: "claude-haiku-5-5", usage },
      });
    await writeFile(
      join(logs, "agent-a1b2.jsonl"),
      `${[
        request(0, "w1", {
          input_tokens: 2,
          cache_creation_input_tokens: 10_000,
          cache_read_input_tokens: 0,
          output_tokens: 500,
        }),
        request(3, "w2", {
          input_tokens: 2,
          cache_creation_input_tokens: 1_000,
          cache_read_input_tokens: 10_500,
          output_tokens: 800,
        }),
      ].join("\n")}\n`,
    );
    ok(
      cli(
        [
          "delegate",
          "close",
          "--record",
          record,
          "--id",
          "D-001",
          "--outcome",
          "accepted",
          "--transcript",
          transcript,
          "--input",
          "-",
        ],
        "- Cue: read when the callers matter\n- Result: The callers.\n- Task effect: Known.\n",
      ),
    );
    assert.match(
      await readFile(join(taskDir, "history.md"), "utf8"),
      /\n- Measured: context 12,302 over 1 context cycle\(s\); working 3 min, wall 3 min; claude-haiku-5-5 xhigh: 4 in, 11,000 written, 10,500 read, 1,300 out, \$0\.00; as of 2026-10-30T10:03:00\.000Z at 12,302 tokens\n/,
    );
  });
});

test("delegate open and check-return --scratch keep a delegation in a folder with no task, and record nothing", async () => {
  const folder = realpathSync(await mkdtemp(join(tmpdir(), "track-work-scratch-")));
  try {
    const cli = (args, input = "") =>
      spawnSync(process.execPath, [scriptPath, ...args], {
        cwd: folder,
        input,
        encoding: "utf8",
        env: { ...process.env, FREEFLOW_HOME: "" },
      });
    const scratch = join(folder, "scratch");
    const open = (title) =>
      ok(
        cli(
          [
            "delegate",
            "open",
            "--scratch",
            scratch,
            "--title",
            title,
            "--kind",
            "gather",
            "--agent",
            "Haiku, xhigh",
            "--input",
            "-",
          ],
          BRIEF,
        ),
      );
    const out = open("Read the callers");
    const brief = join(scratch, "delegations", "D-001-read-the-callers", "brief.md");
    assert.ok(out.startsWith(`Opened D-001 — Read the callers\n${brief}\n`), out);
    assert.match(out, /nothing is recorded/);
    const text = await readFile(brief, "utf8");
    assert.match(
      text,
      /^# D-001 — Read the callers\nTask: none \(a scratch folder; nothing is recorded\) · Opened: \d{4}-\d{2}-\d{2}\n/,
    );
    assert.match(
      text,
      new RegExp(`- After a compaction, read this brief again: ${brief.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\n`),
    );
    assert.doesNotMatch(text, /view recover/);
    // Numbered within the folder.
    assert.match(open("Read the tests"), /^Opened D-002 — Read the tests\n/);

    const check = () => cli(["delegate", "check-return", "--scratch", scratch, "--id", "D-001"]);
    assert.match(check().stderr, /D-001's return is not ready: no return\.md/);
    await writeFile(join(dirname(brief), "return.md"), RETURN("D-001", "").replace("branch, commit ", "none"));
    assert.match(ok(check()), /^D-001's return: State done; every heading is there; it names no commit\./);

    // A record and a scratch folder are not both given.
    assert.match(
      cli(["delegate", "check-return", "--scratch", scratch, "--record", join(folder, "record.md"), "--id", "D-001"])
        .stderr,
      /--scratch is for a delegation with no task: give --record or --scratch, not both/,
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("the start command quotes a worktree path only when the shell would split it", async () => {
  const { shellWord } = await import("../../../skills/track-work/scripts/lib/delegations5.mjs");
  assert.equal(shellWord("/home/u/widget-d-001-build"), "/home/u/widget-d-001-build");
  assert.equal(shellWord("/home/u/my widget-d-001"), "'/home/u/my widget-d-001'");
  assert.equal(shellWord("/tmp/it's"), "'/tmp/it'\\''s'");
});

test("delegate check-return checks a commit a dot joins to a URL suffix or a word, and matches --elsewhere in any case", async () => {
  await withTask(async ({ record, repo, taskDir, cli }) => {
    openBuild(cli, record, repo);
    const folder = join(taskDir, "delegations", "D-001-build-the-thing");
    const check = (...extra) => cli(["delegate", "check-return", "--record", record, "--id", "D-001", ...extra]);
    const write = (line) => writeFile(join(folder, "return.md"), RETURN("D-001", "none").replace("commit none", line));
    git(repo, ["commit", "--quiet", "--allow-empty", "-m", "on main only"]);
    const offBranch = git(repo, ["rev-parse", "HEAD"]);
    const missing = "0123456789abcdef0123456789abcdef01234567";
    const forms = (hash) => [
      `https://github.com/o/r/commit/${hash}.patch`,
      `https://github.com/o/r/commit/${hash}.diff`,
      `https://github.com/o/r/pull/12/commits/${hash}.patch`,
      `https://gitlab.com/o/r/-/commit/${hash}.patch`,
      `https://github.com/o/r/compare/${"a".repeat(7)}0000...${hash}.diff`,
      `commit ${hash}.Next step`,
      `main.${hash}`,
      `Missing commit ${hash}.then`,
      `file ${hash}.txt`,
    ];
    // A missing commit, full and short, in each form is refused; so is one that is only on main.
    for (const hash of [missing, missing.slice(0, 8)])
      for (const line of forms(hash)) {
        await write(line);
        assert.match(check().stderr, new RegExp(`commit ${hash} does not exist`), line);
      }
    for (const hash of [offBranch, offBranch.slice(0, 8)])
      for (const line of forms(hash).filter((form) => !form.includes("compare/"))) {
        await write(line);
        assert.match(check().stderr, new RegExp(`commit ${hash} is not on branch d-001-build-the-thing`), line);
      }
    // Another repository's commit written in uppercase is matched by --elsewhere in lowercase, and the other way.
    const upstream = "079e17a422347e49d02501304f79fade7e569362";
    await write(`pinned ${upstream.toUpperCase()}`);
    assert.match(ok(check("--elsewhere", `${upstream.slice(0, 8)}=openai/codex`)), /openai\/codex/);
    await write(`pinned ${upstream}`);
    assert.match(ok(check("--elsewhere", `${upstream.slice(0, 8).toUpperCase()}=openai/codex`)), /openai\/codex/);
  });
});

const CLOSE_INPUT = "- Cue: read when the thing matters\n- Result: thing.txt exists.\n- Task effect: Built.\n";
const NO_COMMITS_RETURN = (id) =>
  `# ${id} return\nState: done\n## Result\nSurveyed.\n## Identities\nnone\n## Checks\nread the code\n## Left open\nnone\n## Not done\nnone\n`;

test("delegate close accepts a reader without --merge; a builder whose branch holds commits is refused without it, and says why", async () => {
  await withTask(async ({ record, repo, taskDir, cli }) => {
    // A reader: opened with no repository, so it has no worktree and no branch.
    ok(
      cli(
        [
          "delegate",
          "open",
          "--record",
          record,
          "--title",
          "Survey the code",
          "--kind",
          "research",
          "--agent",
          "Haiku, xhigh",
          "--input",
          "-",
        ],
        BRIEF,
      ),
    );
    await writeFile(join(taskDir, "delegations", "D-001-survey-the-code", "return.md"), NO_COMMITS_RETURN("D-001"));
    const close = (id, args) =>
      cli(["delegate", "close", "--record", record, "--id", id, ...args, "--input", "-"], CLOSE_INPUT);
    assert.match(ok(close("D-001", ["--outcome", "accepted"])), /^Closed D-001 — accepted\n/);
    // A builder with a commit on its branch: accepting it without --merge is refused, with the reason.
    openBuild(cli, record, repo);
    const worktree = join(dirname(repo), "repo.worktrees", "D-002-build-the-thing");
    await writeFile(join(worktree, "thing.txt"), "t\n");
    git(worktree, ["add", "thing.txt"]);
    git(worktree, ["commit", "--quiet", "-m", "thing"]);
    const commit = git(worktree, ["rev-parse", "--short=8", "HEAD"]);
    await writeFile(join(taskDir, "delegations", "D-002-build-the-thing", "return.md"), RETURN("D-002", commit));
    const refused = close("D-002", ["--outcome", "accepted"]);
    assert.equal(refused.status, 1);
    assert.match(
      refused.stderr,
      /D-002 has branch d-002-build-the-thing with 1 commit\(s\) beyond .+: accepting it records the commit that merged it, --merge <commit>, since its commits must reach the repository\./,
    );
    git(repo, ["merge", "--quiet", "--ff-only", "d-002-build-the-thing"]);
    assert.match(
      ok(close("D-002", ["--outcome", "accepted", "--merge", git(repo, ["rev-parse", "--short=8", "HEAD"])])),
      /^Closed D-002 — accepted\n/,
    );
  });
});

test("delegate open puts a worktree in <repo>.worktrees; close removes a clean one (accepted or stopped), leaves a dirty one, and keeps the branch", async () => {
  await withTask(async ({ folder, record, repo, cli }) => {
    const open = (title, extra = []) =>
      ok(
        cli(
          [
            "delegate",
            "open",
            "--record",
            record,
            "--title",
            title,
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
    const close = (id, outcome) =>
      cli(["delegate", "close", "--record", record, "--id", id, "--outcome", outcome, "--input", "-"], CLOSE_INPUT);
    const clean = join(folder, "repo.worktrees", "D-001-build-the-clean");
    const dirty = join(folder, "repo.worktrees", "D-002-build-the-dirty");
    const stopped = join(folder, "repo.worktrees", "D-003-build-the-stopped");
    const explicit = join(folder, "explicit-worktree");
    open("Build the clean");
    open("Build the dirty");
    open("Build the stopped");
    open("Build the explicit", ["--worktree", explicit]);
    assert.ok(existsSync(clean) && existsSync(dirty) && existsSync(stopped) && existsSync(explicit));
    // No commits on any branch: each return is a reader's, so accepting it needs no --merge.
    const taskDir = dirname(record);
    await writeFile(join(taskDir, "delegations", "D-001-build-the-clean", "return.md"), NO_COMMITS_RETURN("D-001"));
    await writeFile(join(taskDir, "delegations", "D-002-build-the-dirty", "return.md"), NO_COMMITS_RETURN("D-002"));
    await writeFile(join(taskDir, "delegations", "D-003-build-the-stopped", "return.md"), NO_COMMITS_RETURN("D-003"));
    await writeFile(join(taskDir, "delegations", "D-004-build-the-explicit", "return.md"), NO_COMMITS_RETURN("D-004"));
    await writeFile(join(dirty, "scratch.txt"), "not committed\n");
    const removed = ok(close("D-001", "accepted"));
    assert.match(
      removed,
      new RegExp(
        `Removed the worktree ${clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}; branch d-001-build-the-clean is kept\\.`,
      ),
    );
    assert.equal(existsSync(clean), false);
    assert.match(git(repo, ["branch", "--list", "d-001-build-the-clean"]), /d-001-build-the-clean/);
    const left = ok(close("D-002", "accepted"));
    assert.match(left, /Left the worktree .+D-002-build-the-dirty: it has uncommitted or untracked changes\./);
    assert.equal(existsSync(dirty), true);
    assert.match(ok(close("D-003", "stopped")), /Removed the worktree .+D-003-build-the-stopped/);
    assert.equal(existsSync(stopped), false);
    assert.match(
      ok(close("D-004", "accepted")),
      /Removed the worktree .+explicit-worktree; branch d-004-build-the-explicit is kept\./,
    );
    assert.equal(existsSync(explicit), false);
  });
});
