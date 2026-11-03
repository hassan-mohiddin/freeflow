import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import {
  classifyCommand,
  decide,
  DEFAULT_GATE_SETTINGS,
  gateEvent,
  gateText,
  matchesGlob,
} from "../../../skills/track-work/scripts/lib/gates5.mjs";
import { lineProblem } from "../../../skills/track-work/scripts/lib/events5.mjs";

const scriptPath = resolve("skills/track-work/scripts/working-record.mjs");

// ---------------------------------------------------------------------------------------------------------------------
// gates5.decide on fixture states and calls (SPEC-008 section 7, first item).

const STORE = "/home/u/.freeflow";
const TASK_DIR = `${STORE}/projects/demo/tasks/task-001-demo`;
const held = (extra = {}) => ({
  v: 1,
  task: "demo/task-001",
  taskDir: TASK_DIR,
  store: STORE,
  agreement: "A-001",
  session: null,
  exactSpec: null,
  slice: { id: "S-001", state: "in_progress" },
  delegations: {},
  updated: "2026-11-03T10:00:00.000Z",
  ...extra,
});
const noTask = (extra = {}) => held({ task: null, taskDir: null, agreement: null, slice: null, ...extra });
const edit = (path, extra = {}) => ({ tool: "Edit", paths: [path], cwd: "/work/app", ...extra });
const bash = (command, extra = {}) => ({ tool: "Bash", command, cwd: "/work/app", ...extra });
const gates = (result) => result.fired.map((each) => `${each.gate}:${each.decision}`).sort();
const block = { agreement: "block", slice: "block", delivery: "block", delegation: "block" };

test("decide: the agreement gate fires on a change outside the store until an agreement or an exact spec is recorded", () => {
  assert.deepEqual(gates(decide(noTask(), edit("/work/app/src/a.ts"))), ["agreement:warn"]);
  assert.deepEqual(gates(decide(noTask(), bash("npm install left-pad"))), ["agreement:warn"]);
  assert.deepEqual(gates(decide(noTask({ agreement: "session" }), edit("/work/app/src/a.ts"))), []);
  assert.deepEqual(gates(decide(noTask({ exactSpec: { reason: "the issue names every line" } }), edit("/x/a"))), []);
  // The store holds the task memory: writing it needs no agreement, and Track Work's commands are the way through.
  assert.deepEqual(gates(decide(noTask(), edit(`${STORE}/projects/demo/tasks/task-001-demo/notes.md`))), []);
  assert.deepEqual(
    gates(decide(noTask(), bash("node /opt/ff/skills/track-work/scripts/working-record.mjs agree --outcome x"))),
    [],
  );
  // Reads are not changes.
  for (const command of [
    "ls -la",
    "git status && git diff",
    "cat a | grep b",
    "npm test",
    "npm run check:docs",
    "node --test x.test.mjs",
    "rg -n foo src",
  ])
    assert.deepEqual(gates(decide(noTask(), bash(command))), [], command);
  assert.deepEqual(gates(decide(noTask(), { tool: "Read", paths: ["/work/app/a"] })), []);
  // A tool that says its input only reads is taken at its word.
  assert.deepEqual(gates(decide(noTask(), bash("make lint", { readOnly: true }))), []);
  const result = decide(noTask(), edit("/work/app/src/a.ts"));
  assert.equal(result.decision, "warn");
  assert.match(result.reason, /^Edit on src\/a\.ts before an agreement in this session\.\nWhy: /);
  assert.match(result.way, /agree --outcome/);
  assert.match(decide(held({ agreement: null }), edit("/w/a")).way, /agreement open/);
});

test("decide: the Slice gate fires while a task is held and no Slice is in progress", () => {
  assert.deepEqual(gates(decide(held(), edit("/work/app/src/a.ts"))), []);
  assert.deepEqual(gates(decide(held({ slice: null }), edit("/work/app/src/a.ts"))), ["slice:warn"]);
  const paused = decide(held({ slice: { id: "S-002", state: "paused" } }), edit("/work/app/src/a.ts"));
  assert.deepEqual(gates(paused), ["slice:warn"]);
  assert.match(paused.reason, /with no open Slice in demo\/task-001 \(S-002 is paused\)/);
  assert.match(paused.way, /^slice resume/);
  assert.equal(
    gateText(decide(held({ slice: null }), edit("/work/app/src/http/client.ts")).fired[0]),
    [
      "Freeflow gate (warn, slice): Edit on src/http/client.ts with no open Slice in demo/task-001.",
      "Why: an effect outside the record needs a Slice first, so a lost context can tell what was half done.",
      "Way through: slice start-direct (or slice start), then go on. This gate only warns for now.",
    ].join("\n"),
  );
  // No task held: no Slice gate, only the agreement's.
  assert.deepEqual(gates(decide(noTask({ agreement: "session" }), edit("/w/a"))), []);
});

test("decide: the delivery gate fires on every delivery command, in a chain too, and asks under block only where someone can answer", () => {
  const steps = {
    "git commit -m 'x'": "git commit",
    "git -C /repo push origin main": "git push",
    "git -c user.name=H tag v1.0.0": "git tag",
    "git merge feature": "git merge",
    "gh pr create --fill": "gh pr create",
    "gh pr merge 12 --squash": "gh pr merge",
    "npm publish": "npm publish",
    "npm version patch": "npm version",
    "node scripts/release.mjs --version 1.0.0": "node scripts/release.mjs",
    "env GIT_TRACE=1 git push": "git push",
    "npm test && git push": "git push",
    "cd /repo; git add -A && git commit -m done": "git commit",
  };
  for (const [command, step] of Object.entries(steps)) {
    const result = decide(held(), bash(command));
    assert.deepEqual(gates(result), ["delivery:warn"], command);
    assert.equal(result.rule, step, command);
  }
  for (const command of [
    "git log --oneline",
    "git tag -l",
    "git merge-base main HEAD",
    "echo 'git push'",
    "git commit-graph verify",
  ])
    assert.equal(decide(held(), bash(command)).fired.filter((each) => each.gate === "delivery").length, 0, command);
  assert.match(
    decide(held(), bash("git push")).reason,
    /^Bash `git push` is a delivery step\.|^git push is a delivery step\./,
  );
  assert.equal(decide(held(), bash("git push", { canAsk: true }), block).decision, "ask");
  assert.equal(decide(held(), bash("git push", { canAsk: false }), block).decision, "block");
  assert.equal(decide(held(), bash("git push"), { ...DEFAULT_GATE_SETTINGS, delivery: "off" }).decision, "allow");
});

test("decide: the delegation gate keeps a worker to its scope and off the task's record", () => {
  const state = held({
    delegations: {
      "D-004": {
        writes: ["/wt/d-004/skills/review-work/**"],
        worktree: "/wt/d-004",
        folder: `${TASK_DIR}/delegations/D-004-x`,
      },
      "D-005": { writes: [], worktree: null, folder: `${TASK_DIR}/delegations/D-005-y` },
    },
  });
  const worker = (call, id = "D-004") => decide(state, { ...call, delegation: id });
  assert.deepEqual(gates(worker(edit("/wt/d-004/skills/review-work/SKILL.md"))), []);
  assert.deepEqual(gates(worker(edit(`${TASK_DIR}/delegations/D-004-x/progress.md`))), []);
  assert.deepEqual(gates(worker(edit("/wt/d-004/hooks/claude/freeflow.mjs"))), ["delegation:warn"]);
  assert.deepEqual(gates(worker(edit(`${TASK_DIR}/record.md`))), ["delegation:warn"]);
  assert.match(worker(edit(`${TASK_DIR}/decisions.md`)).reason, /on the task's decisions\.md/);
  assert.deepEqual(gates(worker(bash(`echo x >> ${TASK_DIR}/history.md`))), ["delegation:warn"]);
  assert.deepEqual(gates(worker(bash("node /ff/working-record.mjs slice close --record x"))), ["delegation:warn"]);
  assert.deepEqual(gates(worker(bash("node /ff/working-record.mjs view recover --record x --delegation D-004"))), []);
  // A reader writes only its own folder.
  assert.deepEqual(gates(worker(edit("/work/app/a.ts"), "D-005")), ["delegation:warn"]);
  assert.match(worker(edit("/work/app/a.ts"), "D-005").reason, /May write: nothing; a reader/);
  // The main loop is not a worker, and a worker has no Slice gate of its own.
  assert.deepEqual(gates(decide(state, edit("/wt/d-004/hooks/claude/freeflow.mjs"))), []);
  assert.deepEqual(gates(worker(edit("/wt/d-004/skills/review-work/x"), "D-004")), []);
  assert.equal(decide(state, { ...edit("/wt/d-004/hooks/x"), delegation: "D-004" }, block).decision, "block");
});

test("decide: a missing gate state is quiet under warn and closed under block for the gates that need it", () => {
  assert.equal(decide(null, edit("/work/app/a.ts")).decision, "allow");
  assert.equal(decide({ v: 2 }, edit("/work/app/a.ts")).decision, "allow");
  const closed = decide(null, edit("/work/app/a.ts"), block);
  assert.equal(closed.decision, "block");
  assert.match(gateText(closed.fired[0]), /Freeflow cannot read its gate state; run `task here` or `agree`/);
  // The delivery gate needs no state: it still reminds.
  assert.deepEqual(gates(decide(null, bash("git push"))), ["delivery:warn"]);
  // Off is off.
  const off = Object.fromEntries(Object.keys(block).map((gate) => [gate, "off"]));
  assert.equal(decide(null, edit("/work/app/a.ts"), off).decision, "allow");
  assert.equal(decide(noTask(), bash("git push"), off).decision, "allow");
});

test("decide: the strongest decision leads, and every gate that fired is listed for the log", () => {
  const result = decide(held({ agreement: null, slice: null }), bash("git commit -am x"), {
    ...DEFAULT_GATE_SETTINGS,
    delivery: "block",
  });
  assert.deepEqual(gates(result), ["agreement:warn", "delivery:block", "slice:warn"]);
  assert.equal(result.decision, "block");
  assert.equal(result.gate, "delivery");
  for (const fired of result.fired)
    assert.equal(
      lineProblem({
        v: 1,
        ts: "2026-11-03T10:00:00.000Z",
        session: "s-1",
        harness: "pi",
        agent: "main",
        kind: "gate",
        ...gateEvent(fired, "bash"),
      }),
      null,
    );
});

test("classifyCommand: chains, quotes, redirections and here-documents", () => {
  const read = (command) => classifyCommand(command).changing;
  assert.equal(read("ls && git status | head -3"), false);
  assert.equal(read("cat a > b"), true);
  assert.deepEqual(classifyCommand("cat a > b 2>&1").writes, ["b"]);
  assert.equal(read("ls 2>/dev/null"), false);
  assert.equal(read("grep -n 'a && b' file"), false);
  assert.equal(read("sed -n 1,5p f"), false);
  assert.equal(read("sed -i s/a/b/ f"), true);
  assert.equal(read("find . -name x -delete"), true);
  assert.equal(read("grep x $(ls)"), true);
  assert.equal(read("bash -c 'ls'"), true);
  assert.deepEqual(classifyCommand("bash -c 'git push origin'").delivery, ["git push"]);
  assert.deepEqual(classifyCommand("cat <<'EOF' > notes.md\ngit push\nEOF\n").delivery, []);
  assert.deepEqual(classifyCommand('git commit -m "a && git push"').delivery, ["git commit"]);
  assert.equal(classifyCommand("node /x/working-record.mjs view recover --record y").trackWork, true);
  assert.equal(classifyCommand("node /x/working-record.mjs view recover && rm -rf y").trackWork, false);
});

test("matchesGlob: ** across folders, * within one, a bare path as a folder", () => {
  assert.equal(matchesGlob("/w/skills/a/b.md", "/w/skills/**"), true);
  assert.equal(matchesGlob("/w/skills", "/w/skills/**"), true);
  assert.equal(matchesGlob("/w/skillset/a", "/w/skills/**"), false);
  assert.equal(matchesGlob("/w/src/a.ts", "/w/src/*.ts"), true);
  assert.equal(matchesGlob("/w/src/x/a.ts", "/w/src/*.ts"), false);
  assert.equal(matchesGlob("/w/src/x/a.ts", "/w/**/a.ts"), true);
  assert.equal(matchesGlob("/w/CHANGELOG.md", "/w/CHANGELOG.md"), true);
  assert.equal(matchesGlob("/w/docs/a.md", "/w/docs"), true);
});

// ---------------------------------------------------------------------------------------------------------------------
// The state file, written by Track Work's lifecycle commands (section 7, second item).

async function withStore(run) {
  const folder = realpathSync(await mkdtemp(join(tmpdir(), "track-work-gates5-")));
  try {
    await writeFile(join(folder, "gitconfig"), "");
    const remote = join(folder, "store.git");
    execFileSync("git", ["init", "--quiet", "--bare", remote]);
    const home = join(folder, "home");
    const repo = join(folder, "widget");
    execFileSync("git", ["init", "--quiet", "-b", "main", repo]);
    execFileSync("git", [
      "-C",
      repo,
      "-c",
      "user.name=T",
      "-c",
      "user.email=t@example.com",
      "commit",
      "--quiet",
      "--allow-empty",
      "-m",
      "start",
    ]);
    const cli = (args, { input = "", session = "aaaaaaaa-1111", harness = "Claude Code" } = {}) =>
      spawnSync(process.execPath, [scriptPath, ...args], {
        cwd: folder,
        input,
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_CONFIG_GLOBAL: join(folder, "gitconfig"),
          GIT_CONFIG_NOSYSTEM: "1",
          FREEFLOW_HOME: home,
          FREEFLOW_SESSION: session,
          FREEFLOW_HARNESS: harness,
          FREEFLOW_RESUME: `resume ${session}`,
          FREEFLOW_TRANSCRIPT: "",
          CLAUDECODE: "",
          CLAUDE_CODE_SESSION_ID: "",
          CLAUDE_CODE_REMOTE: "",
          CLAUDE_CODE_REMOTE_SESSION_ID: "",
        },
      });
    ok(cli(["store", "init", "--remote", remote, "--git-name", "Test User", "--git-email", "test@example.com"]));
    const state = async (session = "aaaaaaaa-1111") =>
      JSON.parse(await readFile(join(home, "sessions", session, "gates.json"), "utf8"));
    await run({ folder, home, repo, cli, state });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

function ok(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

const SLICE = "- Result wanted: r.\n- Under: A-001.\n- Scope: s.\n- Done when: d.\n- Stop if: x.\n- Started from: y.\n";

test("each lifecycle command writes the session's gate state, derived from the record it changed", async () => {
  await withStore(async ({ home, repo, cli, state }) => {
    // Session status at session start writes a state where none is, so the gates read what holds.
    ok(cli(["session", "status"]));
    assert.deepEqual(
      { task: (await state()).task, agreement: (await state()).agreement, store: (await state()).store },
      { task: null, agreement: null, store: realpathSync(home) },
    );
    ok(cli(["project", "new", "--name", "widget"]));
    ok(
      cli([
        "task",
        "create",
        "--project",
        "widget",
        "--title",
        "Demo",
        "--goal",
        "A demo.",
        "--cue",
        "read when the demo matters",
      ]),
    );
    let now = await state();
    assert.equal(now.task, "widget/task-001");
    assert.match(now.taskDir, /\/projects\/widget\/tasks\/task-001-demo$/);
    assert.equal(now.agreement, null);
    assert.equal(now.slice, null);
    ok(
      cli(["agreement", "open", "--record", "widget/task-001", "--title", "Demo", "--input", "-"], {
        input: "- Build the demo.\n",
      }),
    );
    assert.equal((await state()).agreement, "A-001");
    ok(
      cli(
        [
          "slice",
          "start-direct",
          "--record",
          "widget/task-001",
          "--title",
          "Build",
          "--next-action",
          "Build.",
          "--input",
          "-",
        ],
        { input: SLICE },
      ),
    );
    assert.deepEqual((await state()).slice, { id: "S-001", state: "in_progress" });
    ok(
      cli([
        "slice",
        "pause",
        "--record",
        "widget/task-001",
        "--reason",
        "waiting",
        "--resume-when",
        "later",
        "--next-action",
        "Wait.",
      ]),
    );
    assert.deepEqual((await state()).slice, { id: "S-001", state: "paused" });
    ok(cli(["slice", "resume", "--record", "widget/task-001", "--resolution", "ready", "--next-action", "Go."]));
    assert.deepEqual((await state()).slice, { id: "S-001", state: "in_progress" });

    // A worker's scope: --writes puts a May write line in the brief, and the state reads it back, resolved.
    const worktree = join(dirname(repo), "wt-review");
    const opened = ok(
      cli(
        [
          "delegate",
          "open",
          "--record",
          "widget/task-001",
          "--title",
          "Review skills",
          "--kind",
          "build",
          "--agent",
          "Opus, high",
          "--repo",
          repo,
          "--worktree",
          worktree,
          "--writes",
          "skills/review-work/**",
          "--writes",
          "CHANGELOG.md",
          "--input",
          "-",
        ],
        { input: "## Result wanted\nr\n## Scope\nThe review skill.\n## Done when\nd\n" },
      ),
    );
    const brief = await readFile(join(now.taskDir, opened.split("\n")[1]), "utf8");
    assert.match(brief, /## Scope\nMay write: `skills\/review-work\/\*\*`, `CHANGELOG\.md`\nThe review skill\.\n/);
    now = await state();
    assert.deepEqual(now.delegations["D-001"].writes, [
      `${worktree}/skills/review-work/**`,
      `${worktree}/CHANGELOG.md`,
    ]);
    assert.equal(now.delegations["D-001"].worktree, worktree);
    // Without --writes, a reader: nothing but its own folder.
    ok(
      cli(
        [
          "delegate",
          "open",
          "--record",
          "widget/task-001",
          "--title",
          "Gather",
          "--kind",
          "gather",
          "--agent",
          "Haiku, xhigh",
          "--input",
          "-",
        ],
        {
          input: "## Result wanted\nr\n## Scope\nRead.\n## Done when\nd\n",
        },
      ),
    );
    assert.deepEqual((await state()).delegations["D-002"].writes, []);
    ok(
      cli(
        ["delegate", "close", "--record", "widget/task-001", "--id", "D-002", "--outcome", "stopped", "--input", "-"],
        {
          input: "- Cue: read when gathering matters\n- Result: none.\n- Task effect: none.\n",
        },
      ),
    );
    assert.deepEqual(Object.keys((await state()).delegations), ["D-001"]);

    ok(
      cli(
        [
          "slice",
          "close",
          "--record",
          "widget/task-001",
          "--state",
          "completed",
          "--next-action",
          "Done.",
          "--input",
          "-",
        ],
        {
          input: "- Cue: read when the demo matters\n- Result: built.\n- Evidence: record.md\n- Task effect: A demo.\n",
        },
      ),
    );
    assert.equal((await state()).slice, null);
    ok(
      cli(
        [
          "agreement",
          "close",
          "--record",
          "widget/task-001",
          "--state",
          "completed",
          "--next-action",
          "Rest.",
          "--input",
          "-",
        ],
        { input: "- Cue: read when the demo matters\n- Result: done.\n- Task effect: A demo.\n" },
      ),
    );
    assert.equal((await state()).agreement, null);

    // A stale state (a change made by hand) is named by validate and set right by the next command.
    const path = join(home, "sessions", "aaaaaaaa-1111", "gates.json");
    await writeFile(path, JSON.stringify({ ...(await state()), agreement: "A-009" }));
    assert.match(
      ok(cli(["validate", "--record", "widget/task-001"])),
      /gate state differs from the record \(agreement A-009 in gates\.json, none in the record\)/,
    );

    ok(cli(["task", "release"]));
    now = await state();
    assert.equal(now.task, null);
    assert.equal(now.agreement, null);
    assert.deepEqual(now.delegations, {});
    ok(cli(["task", "take", "--id", "widget/task-001"]));
    assert.equal((await state()).task, "widget/task-001");
    // Another session's state is its own.
    assert.equal(existsSync(join(home, "sessions", "bbbbbbbb-2222", "gates.json")), false);
  });
});

test("agree records a session's agreement and an exact spec in the state and as an agreement line; refused while a task is held", async () => {
  await withStore(async ({ home, cli, state }) => {
    const agreed = ok(
      cli(["agree", "--outcome", "Fix the README typo.", "--exact-spec", "the issue names the line and the fix"]),
    );
    assert.match(
      agreed,
      /^Agreed for this session: Fix the README typo\.\nExact spec declared: the issue names the line and the fix; a reviewer audits it\n/,
    );
    const now = await state();
    assert.equal(now.agreement, "session");
    assert.equal(now.session.outcome, "Fix the README typo.");
    assert.equal(now.exactSpec.reason, "the issue names the line and the fix");
    const lines = (await readFile(join(home, "events", "aaaaaaaa-1111.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(
      lines.map(({ kind, harness, outcome, exactSpec }) => ({ kind, harness, outcome, exactSpec })),
      [
        {
          kind: "agreement",
          harness: "claude-code",
          outcome: "Fix the README typo.",
          exactSpec: "the issue names the line and the fix",
        },
      ],
    );
    // An exact spec lasts the session; a session agreement gives way to a task's.
    ok(cli(["project", "new", "--name", "widget"]));
    ok(
      cli([
        "task",
        "create",
        "--project",
        "widget",
        "--title",
        "Demo",
        "--goal",
        "A demo.",
        "--cue",
        "read when the demo matters",
      ]),
    );
    assert.equal((await state()).agreement, null);
    assert.equal((await state()).exactSpec.reason, "the issue names the line and the fix");
    assert.match(
      cli(["agree", "--outcome", "x"]).stderr,
      /This session holds widget\/task-001: record the agreement in its record with agreement open/,
    );
    // No session, nothing to record.
    const none = spawnSync(process.execPath, [scriptPath, "agree", "--outcome", "x"], {
      encoding: "utf8",
      env: { ...process.env, FREEFLOW_HOME: home, FREEFLOW_SESSION: "", CLAUDE_CODE_SESSION_ID: "" },
    });
    assert.match(none.stderr, /No session ID/);
  });
});

test("events summary counts the gate lines by gate, and the ones asked or refused", async () => {
  await withStore(async ({ home, cli }) => {
    const line = (gate, decision, ms) => ({
      v: 1,
      ts: `2026-11-03T10:00:0${ms}.000Z`,
      session: "aaaaaaaa-1111",
      harness: "pi",
      agent: "main",
      kind: "gate",
      gate,
      decision,
      tool: "bash",
      rule: "r",
    });
    ok(
      cli(["events", "append", "--input", "-"], {
        input: [line("slice", "warn", 1), line("slice", "warn", 2), line("delivery", "block", 3)]
          .map((each) => JSON.stringify(each))
          .join("\n"),
      }),
    );
    const printed = ok(cli(["events", "summary"]));
    assert.match(
      printed,
      /\nGates: agreement 0, slice 2, delivery 1, delegation 0 would-fire, 1 of them asked or refused\n/,
    );
    const summary = JSON.parse(ok(cli(["events", "summary", "--json"])));
    assert.deepEqual(summary.gates, { agreement: 0, slice: 2, delivery: 1, delegation: 0, blocked: 1 });
    assert.ok(existsSync(join(home, "events", "aaaaaaaa-1111.jsonl")));
  });
});

test("estimate --store totals the gates' would-fire counts across the task folders' event summaries", async () => {
  await withStore(async ({ home, cli }) => {
    ok(cli(["project", "new", "--name", "widget"]));
    ok(
      cli([
        "task",
        "create",
        "--project",
        "widget",
        "--title",
        "Demo",
        "--goal",
        "A demo.",
        "--cue",
        "read when the demo matters",
      ]),
    );
    const taskDir = readdirSync(join(home, "projects", "widget", "tasks")).find((name) => name.startsWith("task-001"));
    const events = join(home, "projects", "widget", "tasks", taskDir, "events");
    await mkdir(events, { recursive: true });
    const summary = (gates) => JSON.stringify({ v: 1, session: "s", gates });
    await writeFile(
      join(events, "s-1.json"),
      summary({ agreement: 1, slice: 2, delivery: 0, delegation: 0, blocked: 0 }),
    );
    await writeFile(
      join(events, "s-2.json"),
      summary({ agreement: 0, slice: 1, delivery: 3, delegation: 1, blocked: 2 }),
    );
    await writeFile(join(events, "s-3.json"), JSON.stringify({ v: 1, session: "old" }));
    assert.match(
      ok(cli(["estimate", "--store"])),
      /\nGates, would-fire in the sessions' summaries: agreement 1, slice 3, delivery 3, delegation 1; 2 asked or refused\n$/,
    );
  });
});

test("slice start from a proposal, task switch and task here's take-back write the gate state too", async () => {
  await withStore(async ({ home, cli, state }) => {
    ok(cli(["project", "new", "--name", "widget"]));
    for (const title of ["One", "Two"])
      ok(
        cli(
          [
            "task",
            "create",
            "--project",
            "widget",
            "--title",
            title,
            "--goal",
            "A demo.",
            "--cue",
            "read when the demo matters",
          ],
          { session: title === "One" ? "aaaaaaaa-1111" : "cccccccc-3333" },
        ),
      );
    ok(cli(["task", "release"], { session: "cccccccc-3333" }));
    ok(
      cli(["agreement", "open", "--record", "widget/task-001", "--title", "One", "--input", "-"], {
        input: "- Build one.\n",
      }),
    );
    ok(
      cli(["slice", "propose", "--record", "widget/task-001", "--title", "Proposed", "--input", "-"], {
        input: "- Result wanted: r.\n- Size: 1 files\n- Done when: d.\n",
      }),
    );
    ok(
      cli(
        [
          "slice",
          "start",
          "--record",
          "widget/task-001",
          "--title",
          "Proposed",
          "--next-action",
          "Go.",
          "--input",
          "-",
        ],
        {
          input: "- Under: A-001.\n- Scope: s.\n- Stop if: x.\n- Started from: y.\n",
        },
      ),
    );
    assert.deepEqual((await state()).slice, { id: "S-001", state: "in_progress" });
    ok(cli(["task", "switch", "--id", "widget/task-002"]));
    const switched = await state();
    assert.equal(switched.task, "widget/task-002");
    assert.equal(switched.agreement, null);
    assert.equal(switched.slice, null);
    // A session's end closes its hold as ended; its resume takes the task back, and the state follows.
    const d = { session: "dddddddd-4444" };
    ok(
      cli(
        [
          "task",
          "create",
          "--project",
          "widget",
          "--title",
          "Three",
          "--goal",
          "A demo.",
          "--cue",
          "read when the demo matters",
        ],
        d,
      ),
    );
    ok(cli(["task", "release", "--ended"], d));
    assert.equal((await state("dddddddd-4444")).task, null);
    assert.match(ok(cli(["task", "here", "--take-back"], d)), /Took widget\/task-003 back/);
    assert.equal((await state("dddddddd-4444")).task, "widget/task-003");
  });
});
