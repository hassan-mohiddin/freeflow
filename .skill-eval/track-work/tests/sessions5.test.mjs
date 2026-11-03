// SPEC-009: delegation to a separate session, the delegation log, Left open into decisions.md, Waits on in session
// status, and claims on paths read by the delegation gate.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import { channelProblem, readChannel } from "../../../skills/track-work/scripts/lib/channel5.mjs";
import { liveClaims, renewClaims, readClaimLines } from "../../../skills/track-work/scripts/lib/claims5.mjs";
import { decisionsWithLeftOpen, leftOpen } from "../../../skills/track-work/scripts/lib/delegations5.mjs";
import { decide, gateText } from "../../../skills/track-work/scripts/lib/gates5.mjs";

const scriptPath = resolve("skills/track-work/scripts/working-record.mjs");
const COORDINATOR = "aaaaaaaa-1111";
const WORKER = "bbbbbbbb-2222";
const OTHER = "cccccccc-3333";
const SLICE = "- Result wanted: r.\n- Scope: s.\n- Done when: d.\n- Stop if: x.\n- Started from: y.\n";
const BRIEF = "## Result wanted\nThe thing.\n## Scope\nsrc\n## Done when\nIt runs.\n";

function ok(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

function refused(result, pattern) {
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, pattern);
}

const git = (cwd, args) =>
  execFileSync("git", ["-C", cwd, "-c", "user.name=T", "-c", "user.email=t@example.com", ...args], {
    encoding: "utf8",
  }).trim();

/** A cloud store with a project, a repository and a task the coordinator holds, with an agreement and a Slice. */
async function withTask(run) {
  const folder = realpathSync(await mkdtemp(join(tmpdir(), "track-work-sessions5-")));
  try {
    await writeFile(join(folder, "gitconfig"), "");
    const remote = join(folder, "store.git");
    execFileSync("git", ["init", "--quiet", "--bare", remote]);
    const repo = join(folder, "widget");
    execFileSync("git", ["init", "--quiet", "-b", "main", repo]);
    git(repo, ["commit", "--quiet", "--allow-empty", "-m", "start"]);
    git(repo, ["remote", "add", "origin", "git@github.com:acme/widget.git"]);
    const cli = (
      args,
      { input = "", session = COORDINATOR, home = join(folder, "home"), cwd = folder, env = {} } = {},
    ) =>
      spawnSync(process.execPath, [scriptPath, ...args], {
        cwd,
        input,
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_CONFIG_GLOBAL: join(folder, "gitconfig"),
          GIT_CONFIG_NOSYSTEM: "1",
          FREEFLOW_HOME: home,
          FREEFLOW_SESSION: session,
          FREEFLOW_HARNESS: "Claude Code",
          FREEFLOW_RESUME: `resume ${session}`,
          FREEFLOW_TRANSCRIPT: "",
          FREEFLOW_CLAIM_HOURS: "",
          CLAUDECODE: "",
          CLAUDE_CODE_SESSION_ID: "",
          CLAUDE_CODE_REMOTE: "",
          CLAUDE_CODE_REMOTE_SESSION_ID: "",
          ...env,
        },
      });
    const home = join(folder, "home");
    ok(cli(["store", "init", "--remote", remote, "--git-name", "Test User", "--git-email", "t@example.com"]));
    ok(cli(["project", "new", "--name", "widget"]));
    const record = ok(
      cli([
        "task",
        "create",
        "--title",
        "Widget",
        "--goal",
        "Build it.",
        "--cue",
        "read when widget",
        "--project",
        "widget",
        "--cwd",
        repo,
      ]),
    ).split("\n")[1];
    ok(
      cli(["agreement", "open", "--record", "widget/task-001", "--title", "Go", "--input", "-"], {
        input: "- Done when it runs.\n",
      }),
    );
    ok(
      cli(
        [
          "slice",
          "start-direct",
          "--record",
          "widget/task-001",
          "--title",
          "Coordinate",
          "--next-action",
          "Wait.",
          "--input",
          "-",
        ],
        { input: SLICE },
      ),
    );
    await run({ folder, home, remote, repo, record, taskDir: dirname(record), cli });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

function openSession(cli, repo, extra = []) {
  return ok(
    cli(
      [
        "delegate",
        "open",
        "--record",
        "widget/task-001",
        "--title",
        "Build the gates",
        "--kind",
        "build",
        "--agent",
        "Opus, high",
        "--session",
        "--repo",
        repo,
        "--base",
        "main",
        ...extra,
        "--input",
        "-",
      ],
      { input: BRIEF },
    ),
  );
}

const gates = async (home, session) =>
  JSON.parse(await readFile(join(home, "sessions", session, "gates.json"), "utf8"));
const kinds = (taskDir) => readChannel(taskDir).lines.map((line) => `${line.delegation} ${line.kind}`);

test("delegate open --session writes the brief, worktree and claims, and prints the start command for Claude Code and Pi", async () => {
  await withTask(async ({ folder, repo, taskDir, cli }) => {
    const out = openSession(cli, repo, ["--writes", "src/**"]);
    const worktree = join(folder, "widget-d-001-build-the-gates");
    assert.match(out, /^Opened D-001 — Build the gates \(a separate session\)\n/);
    assert.match(out, /Claimed: src\/\*\* for widget\/task-001 D-001\n/);
    const prompt = `"You are the worker for D-001 of widget/task-001. Run: node ${scriptPath} delegate join --record widget/task-001 --id D-001"`;
    assert.ok(out.includes(`  Claude Code: cd ${worktree} && claude --name D-001 ${prompt}\n`), out);
    assert.ok(out.includes(`  Pi: cd ${worktree} && pi --session-name D-001 ${prompt}\n`), out);
    const brief = await readFile(join(taskDir, "delegations", "D-001-build-the-gates", "brief.md"), "utf8");
    assert.match(brief, /^Agent: Opus, high · Kind: build · Process: session · Handle: not started$/m);
    assert.match(brief, /^May write: `src\/\*\*`$/m);
    assert.equal(git(worktree, ["branch", "--show-current"]), "d-001-build-the-gates");
    const claims = liveClaims(readClaimLines(join(taskDir, "..", "..", "claims.jsonl")));
    assert.deepEqual(
      claims.map((claim) => [claim.task, claim.delegation, claim.session, claim.repo, claim.paths]),
      [["widget/task-001", "D-001", COORDINATOR, "github.com/acme/widget", ["src/**"]]],
    );
    // A sub-worker is a subagent, never a session.
    refused(
      cli(
        [
          "delegate",
          "open",
          "--record",
          "widget/task-001",
          "--title",
          "x",
          "--kind",
          "build",
          "--agent",
          "Haiku, xhigh",
          "--parent",
          "D-001",
          "--session",
          "--input",
          "-",
        ],
        { input: BRIEF },
      ),
      /--session is for the coordinator's own delegations/,
    );
  });
});

test("delegate join records the Handle and the session, prints the worker's recovery, and the joined session's record commands are refused", async () => {
  await withTask(async ({ home, repo, taskDir, cli }) => {
    openSession(cli, repo);
    // A delegation opened for a subagent takes no session.
    ok(
      cli(
        [
          "delegate",
          "open",
          "--record",
          "widget/task-001",
          "--title",
          "Read",
          "--kind",
          "gather",
          "--agent",
          "Haiku, xhigh",
          "--input",
          "-",
        ],
        { input: BRIEF },
      ),
    );
    refused(
      cli(["delegate", "join", "--record", "widget/task-001", "--id", "D-002"], { session: WORKER }),
      /opened for a subagent/,
    );
    // The coordinator holds a task, so it cannot be a worker.
    refused(
      cli(["delegate", "join", "--record", "widget/task-001", "--id", "D-001"]),
      /holds widget\/task-001: a worker session holds no task/,
    );

    const out = ok(cli(["delegate", "join", "--record", "widget/task-001", "--id", "D-001"], { session: WORKER }));
    assert.match(out, /^This session is the worker for D-001 of widget\/task-001 \(Handle: session bbbbbbbb-2222\)/);
    assert.match(out, /You are D-001's worker: the brief is your scope\./);
    assert.match(out, /## Delegation D-001\n\n### delegations\/D-001-build-the-gates\/brief.md/);
    const brief = await readFile(join(taskDir, "delegations", "D-001-build-the-gates", "brief.md"), "utf8");
    assert.match(brief, /· Process: session · Handle: session bbbbbbbb-2222$/m);
    const joined = JSON.parse(await readFile(join(home, "sessions", WORKER, "delegation.json"), "utf8"));
    assert.deepEqual([joined.id, joined.task, joined.taskDir], ["D-001", "widget/task-001", taskDir]);
    assert.deepEqual(kinds(taskDir).slice(-1), ["D-001 inform"]);

    // The one-writer rule is code: every record command is refused in the worker session.
    const works = /This session works for D-001 of widget\/task-001/;
    const worker = { session: WORKER };
    refused(cli(["task", "take", "--id", "widget/task-001"], worker), works);
    refused(
      cli(["task", "create", "--title", "x", "--goal", "g", "--cue", "read when x", "--project", "widget"], worker),
      works,
    );
    refused(cli(["checkpoint", "--record", "widget/task-001", "--input", "-"], { ...worker, input: "none\n" }), works);
    refused(cli(["checkpoint", "--session", "--input", "-"], { ...worker, input: "## Goal\n- g\n" }), works);
    refused(
      cli(
        ["slice", "pause", "--record", "widget/task-001", "--reason", "r", "--resume-when", "w", "--next-action", "n"],
        worker,
      ),
      works,
    );
    refused(cli(["agreement", "update", "--record", "widget/task-001", "--text", "t"], worker), works);
    refused(
      cli(
        ["delegate", "close", "--record", "widget/task-001", "--id", "D-001", "--outcome", "stopped", "--input", "-"],
        worker,
      ),
      works,
    );
    refused(
      cli(
        [
          "delegate",
          "open",
          "--record",
          "widget/task-001",
          "--title",
          "x",
          "--kind",
          "build",
          "--agent",
          "Haiku, xhigh",
          "--input",
          "-",
        ],
        { ...worker, input: BRIEF },
      ),
      /never to another session/,
    );
    // Its own subagents it may start.
    ok(
      cli(
        [
          "delegate",
          "open",
          "--record",
          "widget/task-001",
          "--title",
          "Sub",
          "--kind",
          "gather",
          "--agent",
          "Haiku, xhigh",
          "--parent",
          "D-001",
          "--input",
          "-",
        ],
        { ...worker, input: BRIEF },
      ),
    );
    // Its gate state is its delegation's: the coordinator's agreement, its own scope, no Slice.
    const state = await gates(home, WORKER);
    assert.deepEqual(
      [state.task, state.worker, state.agreement, state.slice],
      ["widget/task-001", "D-001", "A-001", null],
    );
    assert.ok(state.delegations["D-001"]);
    const write = decide(state, { tool: "Edit", paths: [join(taskDir, "record.md")], cwd: repo });
    assert.deepEqual(
      write.fired.map((each) => `${each.gate}:${each.rule}`),
      ["delegation:a worker on the record"],
    );
    // Its own Track Work commands do not count as writing the record.
    const own = decide(state, {
      tool: "Bash",
      command: `node ${scriptPath} checkpoint --delegation D-001 --record widget/task-001 --input -`,
      cwd: repo,
    });
    assert.equal(own.decision, "allow");
  });
});

test("checkpoint --delegation rewrites progress.md and logs it; view bundle --delegation is the worker's bundle", async () => {
  await withTask(async ({ home, repo, taskDir, cli }) => {
    openSession(cli, repo);
    ok(cli(["delegate", "join", "--record", "widget/task-001", "--id", "D-001"], { session: WORKER }));
    refused(
      cli(["checkpoint", "--delegation", "D-001", "--record", "widget/task-001", "--input", "-"], {
        session: WORKER,
        input: "## Done\n- a\n",
      }),
      /requires Next/,
    );
    const out = ok(
      cli(["checkpoint", "--delegation", "D-001", "--record", "widget/task-001", "--input", "-"], {
        session: WORKER,
        input: "## Done\n- the parser\n## Half done\n- the tests\n## Next\n- finish the tests\n",
      }),
    );
    assert.match(out, /^Wrote delegations\/D-001-build-the-gates\/progress.md as of \S+\.\n$/);
    const progress = await readFile(join(taskDir, "delegations", "D-001-build-the-gates", "progress.md"), "utf8");
    assert.match(
      progress,
      /^# D-001 progress\nAs of: \S+\n\n## Done\n- the parser\n\n## Half done\n- the tests\n\n## Didn't work\nNone.\n\n## Next\n- finish the tests\n$/,
    );
    const line = readChannel(taskDir).lines.at(-1);
    assert.deepEqual(
      [line.kind, line.from, line.body, line.ref],
      ["progress", WORKER, "Next: finish the tests", "delegations/D-001-build-the-gates/progress.md"],
    );
    // Another delegation's progress is not this worker's to write.
    refused(
      cli(["checkpoint", "--delegation", "D-002", "--record", "widget/task-001", "--input", "-"], {
        session: WORKER,
        input: "## Next\n- x\n",
      }),
      /works for D-001/,
    );
    // Session status gives the driver the delegation and its progress time, for the notice and the compaction.
    const status = JSON.parse(ok(cli(["session", "status"], { session: WORKER })));
    assert.equal(status.task, null);
    assert.equal(status.delegation.id, "D-001");
    assert.equal(status.delegation.progressAsOf, /^As of: (\S+)$/m.exec(progress)[1]);
    const bundle = ok(
      cli(["view", "bundle", "--record", "widget/task-001", "--delegation", "D-001"], { session: WORKER }),
    );
    assert.match(bundle, /You are D-001's worker: the brief is your scope/);
    assert.ok(bundle.includes("- finish the tests"));
    assert.match(bundle, /## Record\n/);
    assert.match(
      bundle,
      /A new cycle starts here, for the worker of this delegation\..*continue from progress.md's Next\.\n$/,
    );
    assert.doesNotMatch(bundle, /## Core skills/);
    assert.ok(existsSync(join(home, "sessions", WORKER, "delegation.json")));
  });
});

test("every delegation command appends its line to channel.jsonl; the lines validate; delegate log prints them", async () => {
  await withTask(async ({ repo, taskDir, cli }) => {
    openSession(cli, repo);
    ok(cli(["delegate", "amend", "--record", "widget/task-001", "--id", "D-001", "--text", "Also the docs."]));
    ok(cli(["delegate", "join", "--record", "widget/task-001", "--id", "D-001"], { session: WORKER }));
    ok(
      cli(["checkpoint", "--delegation", "D-001", "--record", "widget/task-001", "--input", "-"], {
        session: WORKER,
        input: "## Next\n- go\n",
      }),
    );
    const worktree = join(dirname(repo), "widget-d-001-build-the-gates");
    git(worktree, ["commit", "--quiet", "--allow-empty", "-m", "work"]);
    const head = git(worktree, ["rev-parse", "--short", "HEAD"]);
    const returnPath = join(taskDir, "delegations", "D-001-build-the-gates", "return.md");
    await writeFile(
      returnPath,
      `# D-001 return\nState: blocked\n## Result\nhalf\n## Identities\ncommit ${head}\n## Checks\nnone\n## Left open\nthe queue is odd\n## Not done\nall\n`,
    );
    // A worker checks its own return: logged, and the record stays the coordinator's.
    const checked = ok(
      cli(["delegate", "check-return", "--record", "widget/task-001", "--id", "D-001"], { session: WORKER }),
    );
    assert.match(checked, /Warning: Left open has text but no choice line/);
    assert.match(checked, /Now tell your coordinator/);
    assert.doesNotMatch(await readFile(join(taskDir, "record.md"), "utf8"), /· returned ·/);
    ok(
      cli([
        "delegate",
        "log",
        "--record",
        "widget/task-001",
        "--id",
        "D-001",
        "--append",
        "--kind",
        "inform",
        "--body",
        "context at 80%",
        "--agent",
        "agent-7",
      ]),
    );
    refused(
      cli([
        "delegate",
        "log",
        "--record",
        "widget/task-001",
        "--id",
        "D-001",
        "--append",
        "--kind",
        "accepted",
        "--body",
        "x",
      ]),
      /come from the commands that act/,
    );
    ok(
      cli(
        ["delegate", "close", "--record", "widget/task-001", "--id", "D-001", "--outcome", "sent back", "--input", "-"],
        { input: "- Cue: read when gates\n- Result: the tests are missing\n- Task effect: none\n" },
      ),
    );
    assert.deepEqual(kinds(taskDir), [
      "D-001 brief",
      "D-001 amend",
      "D-001 inform",
      "D-001 progress",
      "D-001 blocked",
      "D-001 inform",
      "D-001 sent-back",
    ]);
    const { lines, unreadable } = readChannel(taskDir);
    assert.equal(unreadable, 0);
    for (const line of lines) assert.equal(channelProblem(line), null);
    assert.equal(lines[5].from, `${COORDINATOR}/agent-7`);
    assert.equal(lines.at(-1).body, "the tests are missing");
    const log = ok(cli(["delegate", "log", "--record", "widget/task-001"]));
    assert.match(
      log,
      /^\d{4}-\d\d-\d\d \d\d:\d\d D-001 brief · from aaaaaaaa-1111 · Build the gates · delegations\/D-001-build-the-gates\/brief.md$/m,
    );
    assert.match(
      log,
      / D-001 sent-back · from aaaaaaaa-1111 · the tests are missing · delegations\/D-001-build-the-gates\/return.md$/m,
    );
    // A body is redacted and cut.
    ok(
      cli([
        "delegate",
        "log",
        "--record",
        "widget/task-001",
        "--id",
        "D-001",
        "--append",
        "--kind",
        "inform",
        "--body",
        `token ghp_${"a".repeat(36)} ${"x".repeat(400)}`,
      ]),
    );
    const last = readChannel(taskDir).lines.at(-1);
    assert.equal(last.body.length, 300);
    assert.doesNotMatch(last.body, /ghp_a{36}/);
  });
});

test("delegate close adds the return's Left open choices to decisions.md with the next IDs, and the list validates", async () => {
  await withTask(async ({ repo, taskDir, cli }) => {
    await writeFile(
      join(taskDir, "decisions.md"),
      '# Decisions\n- P1 [agreed] Which store -> the cloud one. You: "yes" (2026-11-03)\n',
    );
    openSession(cli, repo);
    const worktree = join(dirname(repo), "widget-d-001-build-the-gates");
    git(worktree, ["commit", "--quiet", "--allow-empty", "-m", "work"]);
    const head = git(worktree, ["rev-parse", "--short", "HEAD"]);
    await writeFile(
      join(taskDir, "delegations", "D-001-build-the-gates", "return.md"),
      `# D-001 return\nState: done\n## Result\nbuilt\n## Identities\ncommit ${head}\n## Checks\nran\n## Left open\n- When jobs pile up, which runs first -> oldest first\n- Queue structure -> an array, technical\nSome notes the coordinator reads.\n## Not done\nnone\n`,
    );
    const checked = ok(cli(["delegate", "check-return", "--record", "widget/task-001", "--id", "D-001"]));
    assert.match(checked, /2 Left open choice\(s\)/);
    assert.doesNotMatch(checked, /Warning/);
    git(repo, ["merge", "--quiet", "--no-edit", "d-001-build-the-gates"]);
    const merge = git(repo, ["rev-parse", "--short", "HEAD"]);
    const out = ok(
      cli(
        [
          "delegate",
          "close",
          "--record",
          "widget/task-001",
          "--id",
          "D-001",
          "--outcome",
          "accepted",
          "--merge",
          merge,
          "--input",
          "-",
        ],
        { input: "- Cue: read when gates\n- Result: built\n- Task effect: none\n" },
      ),
    );
    assert.match(out, /Added to decisions.md from D-001's Left open: P2, T1 \(T1 serves P2 until you relink it\)\./);
    assert.equal(
      await readFile(join(taskDir, "decisions.md"), "utf8"),
      '# Decisions\n- P1 [agreed] Which store -> the cloud one. You: "yes" (2026-11-03)\n- P2 [default] When jobs pile up, which runs first -> oldest first (from D-001)\n- T1 [default] Queue structure: an array (from D-001) -> serves P2\n',
    );
    const validated = spawnSync(
      process.execPath,
      [resolve("skills/discuss-work/scripts/choices.mjs"), "validate", "--record", join(taskDir, "record.md")],
      { encoding: "utf8" },
    );
    assert.equal(validated.status, 0, validated.stderr);
    assert.deepEqual(kinds(taskDir).slice(-2), ["D-001 return", "D-001 accepted"]);
  });
});

test("Left open choices: the parser, the IDs, and an invalid decision list refusing the close", () => {
  assert.deepEqual(leftOpen("## Left open\n- A -> b\n- C -> d, technical\nnone\n## Not done\n"), {
    choices: [
      { choice: "A", taken: "b", technical: false },
      { choice: "C", taken: "d", technical: true },
    ],
    other: false,
  });
  assert.deepEqual(leftOpen("## Left open\nnone\n"), { choices: [], other: false });
  assert.equal(leftOpen("## Left open\nI was not sure about the queue.\n").other, true);
  // A technical choice with no plain item to serve becomes a plain one.
  assert.equal(
    decisionsWithLeftOpen(null, [{ choice: "Array", taken: "yes", technical: true }], "D-004").text,
    "# Decisions\n- P1 [default] Array -> yes (technical, from D-004)\n",
  );
  assert.throws(
    () =>
      decisionsWithLeftOpen(
        "# Decisions\n- P1 [default] no default here\n",
        [{ choice: "A", taken: "b", technical: false }],
        "D-004",
      ),
    /D-004 cannot be closed: decisions.md would not validate/,
  );
});

test("session status names the Slice's Waits on and what came back, from the log or return.md", async () => {
  await withTask(async ({ repo, taskDir, cli }) => {
    openSession(cli, repo);
    ok(
      cli(
        ["slice", "close", "--record", "widget/task-001", "--state", "completed", "--next-action", "n", "--input", "-"],
        { input: "- Cue: read when x\n- Result: r\n- Evidence: e\n- Task effect: t\n" },
      ),
    );
    ok(
      cli(
        [
          "slice",
          "start-direct",
          "--record",
          "widget/task-001",
          "--title",
          "Wait",
          "--next-action",
          "wait",
          "--input",
          "-",
        ],
        { input: `${SLICE}- Waits on: D-001\n` },
      ),
    );
    let status = JSON.parse(ok(cli(["session", "status"])));
    assert.deepEqual(status.waits, {
      slice: "S-002",
      channel: join(taskDir, "channel.jsonl"),
      delegations: [{ id: "D-001", returned: null, at: null }],
    });
    // A return.md with its State, before any line is logged, counts.
    await writeFile(
      join(taskDir, "delegations", "D-001-build-the-gates", "return.md"),
      "# D-001 return\nState: done\n",
    );
    status = JSON.parse(ok(cli(["session", "status"])));
    assert.deepEqual(status.waits.delegations, [{ id: "D-001", returned: "done", at: null }]);
  });
});

test("claims: claim, release, expiry and renewal; the gate warns on another session's claim", async () => {
  await withTask(async ({ home, repo, taskDir, cli }) => {
    refused(cli(["claim", "--paths", "src/a.ts"], { session: OTHER, cwd: repo }), /A claim belongs to a task/);
    const out = ok(cli(["claim", "--paths", "src/a.ts", "--paths", "docs/**", "--for", "2"], { cwd: repo }));
    assert.match(
      out,
      /^Claimed github.com\/acme\/widget: src\/a.ts, docs\/\*\* for widget\/task-001 until \S+ \S+ UTC \(\w+\)\.$/m,
    );
    assert.match(
      ok(cli(["claim", "--list"])),
      /widget\/task-001 · session aaaaaaaa \(this session\) · until .* · github.com\/acme\/widget: src\/a.ts, docs\/\*\*/,
    );
    // Another session's gate state carries the claim, at every checkout of the repository on this machine.
    ok(cli(["session", "status"], { session: OTHER, cwd: repo }));
    const other = await gates(home, OTHER);
    assert.equal(other.claims.length, 1);
    assert.ok(other.claims[0].writes.includes(join(repo, "src/a.ts")));
    const warned = decide(other, { tool: "Write", paths: [join(repo, "src/a.ts")], cwd: repo });
    const claimed = warned.fired.find((each) => each.rule === "claimed by another session");
    assert.ok(claimed);
    assert.match(
      gateText(claimed),
      /^Freeflow gate \(warn, delegation\): src\/a.ts is claimed by widget\/task-001 \(session aaaaaaaa…, until \d\d:\d\d UTC\)\.\nWhy: two sessions changing the same files conflict when their work merges\.\nWay through: ask that session through the harness's message tool, or pick other work\. This gate only warns for now\.$/,
    );
    assert.equal(
      decide(other, { tool: "Write", paths: [join(repo, "docs/x/y.md")], cwd: repo }).fired.length > 0,
      true,
    );
    assert.equal(
      decide(other, { tool: "Write", paths: [join(repo, "src/b.ts")], cwd: repo }).fired.some(
        (each) => each.rule === "claimed by another session",
      ),
      false,
    );
    // Past its time a claim warns no one.
    assert.equal(
      decide(other, {
        tool: "Write",
        paths: [join(repo, "src/a.ts")],
        cwd: repo,
        now: Date.now() + 3 * 3_600_000,
      }).fired.some((each) => each.rule === "claimed by another session"),
      false,
    );
    // The session's own claims never warn it.
    ok(cli(["session", "status"], { cwd: repo }));
    assert.equal((await gates(home, COORDINATOR)).claims.length, 0);

    // Renewal: at a sync, a claim with less than half its time left is extended by its own length.
    const file = join(taskDir, "..", "..", "claims.jsonl");
    const [claim] = liveClaims(readClaimLines(file));
    const later = new Date(Date.parse(claim.until) - 30 * 60_000);
    const renewed = await renewClaims({ home, identity: { id: COORDINATOR }, now: later });
    assert.equal(renewed.length, 1);
    assert.equal(Date.parse(renewed[0].until), later.getTime() + 2 * 3_600_000);
    assert.equal((await renewClaims({ home, identity: { id: COORDINATOR }, now: later })).length, 0);
    assert.equal(liveClaims(readClaimLines(file), later.getTime() + 60 * 60_000).length, 1);
    assert.equal(liveClaims(readClaimLines(file), later.getTime() + 3 * 3_600_000).length, 0);

    // Release: by path, then all; the session's end releases the rest with its hold.
    assert.match(ok(cli(["release", "--paths", "src/a.ts"], { cwd: repo })), /^Released 1 claim\(s\)\.$/m);
    assert.equal(liveClaims(readClaimLines(file)).length, 0);
    ok(cli(["claim", "--paths", "src/c.ts"], { cwd: repo }));
    assert.equal(JSON.parse(ok(cli(["session", "status"]))).claims, 1);
    assert.match(ok(cli(["task", "release", "--ended"])), /Released this session's 1 claim\(s\)\./);
    assert.equal(liveClaims(readClaimLines(file)).length, 0);
  });
});

test("a worker session's end releases its claims and logs that it ended; delegate status shows it", async () => {
  await withTask(async ({ repo, taskDir, cli }) => {
    openSession(cli, repo);
    assert.match(
      ok(cli(["delegate", "status", "--record", "widget/task-001"])),
      /· a separate session, not joined yet ·/,
    );
    ok(cli(["delegate", "join", "--record", "widget/task-001", "--id", "D-001"], { session: WORKER }));
    ok(cli(["claim", "--paths", "src/x.ts"], { session: WORKER, cwd: repo }));
    assert.match(ok(cli(["delegate", "status", "--record", "widget/task-001"])), /· session bbbbbbbb-2222, joined ·/);
    assert.match(
      ok(cli(["release", "--ended"], { session: WORKER })),
      /^Released 1 claim\(s\)\. Logged that this session, D-001's worker, ended\.$/m,
    );
    assert.match(
      ok(cli(["delegate", "status", "--record", "widget/task-001"])),
      /· session bbbbbbbb-2222, ended \S+ \S+ UTC: reassign it with a new session that joins it ·/,
    );
    assert.equal(readChannel(taskDir).lines.at(-1).body, `session ${WORKER} ended`);
  });
});

test("two stores' claims files merge by keeping both sides' lines", async () => {
  await withTask(async ({ folder, remote, home, repo, taskDir, cli }) => {
    const second = join(folder, "second");
    ok(
      cli(["store", "init", "--remote", remote, "--git-name", "Test User", "--git-email", "t@example.com"], {
        home: second,
        session: OTHER,
      }),
    );
    ok(
      cli(
        [
          "task",
          "create",
          "--title",
          "Other",
          "--goal",
          "g",
          "--cue",
          "read when other",
          "--project",
          "widget",
          "--cwd",
          repo,
        ],
        { home: second, session: OTHER },
      ),
    );
    ok(cli(["claim", "--paths", "src/one.ts"], { cwd: repo }));
    ok(cli(["claim", "--paths", "src/two.ts"], { home: second, session: OTHER, cwd: repo }));
    ok(cli(["store", "sync"]));
    ok(cli(["store", "sync"], { home: second, session: OTHER }));
    ok(cli(["store", "sync"]));
    for (const each of [home, second]) {
      const claims = liveClaims(readClaimLines(join(each, "projects", "widget", "claims.jsonl")));
      assert.deepEqual(claims.map((claim) => claim.paths[0]).sort(), ["src/one.ts", "src/two.ts"]);
    }
    assert.match(await readFile(join(home, ".gitattributes"), "utf8"), /^claims\.jsonl merge=union$/m);
    assert.ok(taskDir);
  });
});
