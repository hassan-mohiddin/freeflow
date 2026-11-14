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
  GATE_STATE_VERSION,
  GATES,
  gateEvent,
  gateText,
  matchesGlob,
  validGateState,
} from "../../../skills/track-work/scripts/lib/gates5.mjs";
import { lineProblem } from "../../../skills/track-work/scripts/lib/events5.mjs";

const scriptPath = resolve("skills/track-work/scripts/working-record.mjs");

// ---------------------------------------------------------------------------------------------------------------------
// gates5.decide on fixture states and calls (SPEC-008 section 7, first item). One gate is left, the delegation gate:
// the agreement, Slice and delivery gates were removed (D-058), and the first tests hold that they never fire.

const STORE = "/home/u/.freeflow";
const TASK_DIR = `${STORE}/projects/demo/tasks/task-001-demo`;
const held = (extra = {}) => ({
  v: 1,
  task: "demo/task-001",
  taskDir: TASK_DIR,
  delegations: {},
  updated: "2026-11-03T10:00:00.000Z",
  ...extra,
});
const noTask = (extra = {}) => held({ task: null, taskDir: null, ...extra });
const edit = (path, extra = {}) => ({ tool: "Edit", paths: [path], cwd: "/work/app", ...extra });
const bash = (command, extra = {}) => ({ tool: "Bash", command, cwd: "/work/app", ...extra });
const gates = (result) => result.fired.map((each) => `${each.gate}:${each.decision}`).sort();
const block = { delegation: "block" };

test("only the delegation gate is left: the agreement, Slice and delivery gates never fire (D-058)", () => {
  assert.deepEqual(GATES, ["delegation"]);
  assert.deepEqual(DEFAULT_GATE_SETTINGS, { delegation: "warn" });
  // Calls the removed gates warned about, with a task held or not, now pass.
  assert.deepEqual(gates(decide(noTask(), edit("/work/app/src/a.ts"))), []);
  assert.deepEqual(gates(decide(held({ slice: null }), edit("/work/app/src/a.ts"))), []);
  assert.deepEqual(gates(decide(noTask(), bash("npm install left-pad"))), []);
  assert.deepEqual(gates(decide(null, bash("git push"))), []);
  assert.deepEqual(gates(decide(held(), bash("git commit -m 'x' && git push"))), []);
  for (const command of ["gh pr create --fill", "npm publish", "node scripts/release.mjs --version 1.0.0"])
    assert.deepEqual(gates(decide(held(), bash(command))), [], command);
  // Settings for the removed gates are not read: the delegation gate alone decides.
  assert.equal(decide(noTask(), bash("npm install"), { delegation: "warn", agreement: "block" }).decision, "allow");
});

test("decide: the delegation gate keeps a worker to its scope and off the task's record", () => {
  const state = held({
    delegations: {
      "D-004": {
        writes: ["/wt/d-004/skills/review-work/**"],
        line: true,
        worktree: "/wt/d-004",
        folder: `${TASK_DIR}/delegations/D-004-x`,
      },
      "D-005": { writes: [], line: false, worktree: null, folder: `${TASK_DIR}/delegations/D-005-y` },
      "D-006": {
        writes: ["/wt/d-006/**"],
        line: false,
        worktree: "/wt/d-006",
        folder: `${TASK_DIR}/delegations/D-006-z`,
      },
    },
  });
  const worker = (call, id = "D-004") => decide(state, { ...call, delegation: id });
  assert.deepEqual(gates(worker(edit("/wt/d-004/skills/review-work/SKILL.md"))), []);
  assert.deepEqual(gates(worker(edit(`${TASK_DIR}/delegations/D-004-x/progress.md`))), []);
  assert.deepEqual(gates(worker(edit("/wt/d-004/hooks/claude/freeflow.mjs"))), ["delegation:warn"]);
  assert.match(
    worker(edit("/wt/d-004/hooks/claude/freeflow.mjs")).reason,
    /\(May write: \/wt\/d-004\/skills\/review-work\/\*\*\)\./,
  );
  assert.deepEqual(gates(worker(edit(`${TASK_DIR}/record.md`))), ["delegation:warn"]);
  assert.match(worker(edit(`${TASK_DIR}/decisions.md`)).reason, /on the task's decisions\.md/);
  assert.deepEqual(gates(worker(bash(`echo x >> ${TASK_DIR}/history.md`))), ["delegation:warn"]);
  assert.deepEqual(gates(worker(bash("node /ff/working-record.mjs slice close --record x"))), ["delegation:warn"]);
  assert.deepEqual(gates(worker(bash("node /ff/working-record.mjs view recover --record x --delegation D-004"))), []);
  // A reader writes only its own folder; a brief with no May write line and a worktree is scoped to the worktree.
  assert.deepEqual(gates(worker(edit("/work/app/a.ts"), "D-005")), ["delegation:warn"]);
  assert.match(worker(edit("/work/app/a.ts"), "D-005").reason, /no May write, no worktree: a reader/);
  assert.match(
    worker(edit("/work/app/a.ts"), "D-006").reason,
    /no May write line; its worktree is its scope: \/wt\/d-006\/\*\*/,
  );
  assert.deepEqual(gates(worker(edit("/wt/d-006/x.md"), "D-006")), []);
  // The main loop is not a worker; a worker inside its scope is allowed; a block refuses.
  assert.deepEqual(gates(decide(state, edit("/wt/d-004/hooks/claude/freeflow.mjs"))), []);
  assert.deepEqual(gates(worker(edit("/wt/d-004/skills/review-work/x"), "D-004")), []);
  assert.equal(decide(state, { ...edit("/wt/d-004/hooks/x"), delegation: "D-004" }, block).decision, "block");
});

test("decide: a missing gate state is quiet under warn, and closed under block for a worker", () => {
  assert.equal(decide(null, edit("/work/app/a.ts")).decision, "allow");
  assert.equal(decide({ v: 2 }, edit("/work/app/a.ts")).decision, "allow");
  // Without a worker there is no scope to read: a missing state is no refusal.
  assert.equal(decide(null, edit("/work/app/a.ts"), block).decision, "allow");
  const worker = edit("/work/app/a.ts", { delegation: "D-004" });
  assert.equal(decide(null, worker).decision, "allow");
  const closed = decide(null, worker, block);
  assert.equal(closed.decision, "block");
  assert.match(gateText(closed.fired[0]), /Freeflow cannot read its gate state; run `task here`, then go on\./);
  // Off is off.
  assert.equal(decide(null, worker, { delegation: "off" }).decision, "allow");
});

test("decide: the strongest decision leads, and every gate that fired is listed for the log", () => {
  const state = held({
    delegations: {
      "D-004": {
        writes: ["/wt/d-004/**"],
        line: true,
        worktree: "/wt/d-004",
        folder: `${TASK_DIR}/delegations/D-004-x`,
      },
    },
    claims: [
      {
        writes: ["/work/app/src/**"],
        until: "2026-11-03T12:00:00.000Z",
        task: "other/task-002",
        delegation: "D-009",
        session: "cccccccc-3333",
      },
    ],
  });
  // The worker writes its record (block refuses) and a file another session claims (a warning in the same list).
  const result = decide(
    state,
    { ...edit(`${TASK_DIR}/record.md`, { delegation: "D-004" }), now: Date.parse("2026-11-03T10:30:00.000Z") },
    block,
  );
  assert.equal(result.decision, "block");
  assert.equal(result.gate, "delegation");
  const claimed = decide(state, { ...edit("/work/app/src/a.ts"), now: Date.parse("2026-11-03T10:30:00.000Z") });
  assert.deepEqual(gates(claimed), ["delegation:warn"]);
  assert.match(claimed.reason, /is claimed by other\/task-002 D-009 \(session cccccccc…, until 12:00 UTC\)/);
  for (const fired of [...result.fired, ...claimed.fired])
    assert.equal(
      lineProblem({
        v: 1,
        ts: "2026-11-03T10:00:00.000Z",
        session: "s-1",
        harness: "pi",
        agent: "main",
        kind: "gate",
        ...gateEvent(fired, "Edit"),
      }),
      null,
    );
});

test("gates.json: a version-1 file holding an older run's agreement and Slice fields is still read", () => {
  assert.equal(GATE_STATE_VERSION, 1);
  assert.equal(validGateState({ v: 1, agreement: "A-001", slice: { id: "S-001", state: "in_progress" } }), true);
  assert.equal(validGateState({ v: 2 }), false);
  assert.equal(validGateState(null), false);
});

test("classifyCommand: chains, quotes, redirections and here-documents, and Track Work's writes", () => {
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
  assert.equal(read("cat <<'EOF' > notes.md\ngit push\nEOF\n"), true);
  assert.deepEqual(classifyCommand("cat <<'EOF' > notes.md\ngit push\nEOF\n").writes, ["notes.md"]);
  assert.equal(read('git commit -m "a && git push"'), true);
  assert.equal(classifyCommand("node /x/working-record.mjs view recover --record y").trackWorkWrites, false);
  assert.equal(classifyCommand("node /x/working-record.mjs slice close --record y").trackWorkWrites, true);
  assert.equal(classifyCommand("node /x/working-record.mjs view recover && rm -rf y").changing, true);
  assert.equal(classifyCommand("node /x/working-record.mjs view recover && rm -rf y").trackWorkWrites, false);
  // A syntax check reads the script (D-058: the coordinator's warning on this exact check).
  assert.equal(classifyCommand("node --check /x/working-record.mjs && echo syntax-ok").changing, false);
  assert.equal(classifyCommand("node --check /x/working-record.mjs").trackWorkWrites, false);
  // node's own options only: a `--check` after the script is the script's, so a command naming the record is still changing.
  assert.equal(classifyCommand("node -c /x/working-record.mjs").changing, false);
  assert.equal(classifyCommand(`node tool.mjs --check ${TASK_DIR}/record.md`).changing, true);
  assert.deepEqual(
    gates(
      decide(
        held({
          delegations: {
            "D-004": {
              writes: ["/wt/d-004/**"],
              line: true,
              worktree: "/wt/d-004",
              folder: `${TASK_DIR}/delegations/D-004-x`,
            },
          },
        }),
        bash(`node tool.mjs --check ${TASK_DIR}/record.md`, { delegation: "D-004" }),
      ),
    ),
    ["delegation:warn"],
  );
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

test("each lifecycle command writes the session's gate state for the delegation gate (D-058: no agreement or Slice)", async () => {
  await withStore(async ({ home, repo, cli, state }) => {
    // Session status at session start writes a state where none is, so the gate reads what holds.
    ok(cli(["session", "status"]));
    assert.deepEqual(
      { task: (await state()).task, delegations: (await state()).delegations },
      { task: null, delegations: {} },
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
    assert.equal("agreement" in now, false);
    assert.equal("slice" in now, false);
    ok(
      cli(["agreement", "open", "--record", "widget/task-001", "--title", "Demo", "--input", "-"], {
        input: "- Build the demo.\n",
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
          "Build",
          "--next-action",
          "Build.",
          "--input",
          "-",
        ],
        { input: SLICE },
      ),
    );

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
    assert.equal(now.delegations["D-001"].line, true);
    assert.equal(now.delegations["D-001"].worktree, worktree);
    // Without --writes, a reader: nothing but its own folder, and no May write line.
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
        { input: "## Result wanted\nr\n## Scope\nRead.\n## Done when\nd\n" },
      ),
    );
    assert.deepEqual((await state()).delegations["D-002"].writes, []);
    assert.equal((await state()).delegations["D-002"].line, false);
    ok(
      cli(
        ["delegate", "close", "--record", "widget/task-001", "--id", "D-002", "--outcome", "stopped", "--input", "-"],
        {
          input: "- Cue: read when gathering matters\n- Result: none.\n- Task effect: none.\n",
        },
      ),
    );
    assert.deepEqual(Object.keys((await state()).delegations), ["D-001"]);

    // The record's Slice and agreement close as before; the state no longer holds either.
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
    assert.equal("agreement" in (await state()), false);

    // A stale agreement field left in the state by an older version is not a drift any more: validate says nothing.
    const path = join(home, "sessions", "aaaaaaaa-1111", "gates.json");
    await writeFile(path, JSON.stringify({ ...(await state()), agreement: "A-009" }));
    assert.doesNotMatch(ok(cli(["validate", "--record", "widget/task-001"])), /gate state differs/);

    ok(cli(["task", "release"]));
    now = await state();
    assert.equal(now.task, null);
    assert.deepEqual(now.delegations, {});
    ok(cli(["task", "take", "--id", "widget/task-001"]));
    assert.equal((await state()).task, "widget/task-001");
    // Another session's state is its own.
    assert.equal(existsSync(join(home, "sessions", "bbbbbbbb-2222", "gates.json")), false);
  });
});

test("events summary counts the delegation gate's lines; an older log's removed-gate lines still read and are not counted", async () => {
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
        input: [line("delegation", "warn", 1), line("slice", "warn", 2), line("delivery", "block", 3)]
          .map((each) => JSON.stringify(each))
          .join("\n"),
      }),
    );
    const printed = ok(cli(["events", "summary"]));
    assert.match(printed, /\nGates: delegation 1 would-fire\n/);
    const summary = JSON.parse(ok(cli(["events", "summary", "--json"])));
    assert.deepEqual(summary.gates, { delegation: 1, blocked: 0 });
    assert.ok(existsSync(join(home, "events", "aaaaaaaa-1111.jsonl")));
  });
});

test("estimate --store totals the delegation gate's would-fire counts across the task folders' event summaries", async () => {
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
    // A summary with the delegation gate only: its refusals count. The removed gates' summaries above do not (D-058).
    await writeFile(join(events, "s-3.json"), summary({ delegation: 2, blocked: 1 }));
    await writeFile(join(events, "s-4.json"), JSON.stringify({ v: 1, session: "old" }));
    assert.match(
      ok(cli(["estimate", "--store"])),
      /\nGates, would-fire in the sessions' summaries: delegation 3; 1 refused\n$/,
    );
  });
});

test("task switch and task here's take-back write the gate state too", async () => {
  await withStore(async ({ cli, state }) => {
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
    ok(cli(["task", "switch", "--id", "widget/task-002"]));
    const switched = await state();
    assert.equal(switched.task, "widget/task-002");
    assert.deepEqual(switched.delegations, {});
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
