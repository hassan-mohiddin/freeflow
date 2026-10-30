import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const scriptPath = resolve("skills/track-work/scripts/working-record.mjs");
const choicesPath = resolve("skills/discuss-work/scripts/choices.mjs");
const choices = (cwd, args, input = "") => {
  const result = spawnSync(process.execPath, [choicesPath, ...args], { cwd, env: gitEnv, encoding: "utf8", input });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};
const gitEnv = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
  TRACK_WORK_TEST_MODE: "1",
};
const git = (cwd, ...args) =>
  execFileSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args],
    {
      cwd,
      env: gitEnv,
      encoding: "utf8",
    },
  ).trim();
const run = (cwd, args, input = "") => {
  const result = spawnSync(process.execPath, [scriptPath, ...args], { cwd, env: gitEnv, encoding: "utf8", input });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

const LIST = `# Decisions

- P1 [agreed] When jobs pile up, which runs first? -> oldest first (src/sched.ts:40). You: "go" (2026-10-20)
- P2 [new] Text when the queue is full -> "Queue full, try later"
- P3 [default] Retry count -> 3, because the client does
- P4 [dropped] Priority lanes -> none
- T1 [default] FIFO array in queue.ts -> serves P1
`;

test("choices validates a list and refuses a broken one", async () => {
  const ok = choices(process.cwd(), ["validate", "--list", "-"], LIST);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /Decision list valid: 5 item\(s\)/);
  const broken = choices(
    process.cwd(),
    ["validate", "--list", "-"],
    `- P1 [maybe] Order -> oldest\n- P1 [new] Text\n- T1 [default] Array -> serves P9\n- X2 [new] Odd -> yes\n- P3 [agreed] Count -> 3\n`,
  );
  assert.equal(broken.status, 1);
  for (const expected of [
    /line 1 P1: state "maybe"/,
    /line 2 P1: duplicate ID/,
    /line 2 P1: has no default/,
    /line 3 T1: serves P9, which is not in the list/,
    /line 4 X2: ID must be P<n> or T<n>/,
    /warning: line 5 P3: agreed without the user's words/,
  ])
    assert.match(broken.stdout, expected);
});

test("a list with no items yet, such as a new task's decisions.md, is valid (P98)", async () => {
  const empty = choices(
    process.cwd(),
    ["validate", "--list", "-"],
    "# Decisions\n\nThe build's decisions are in the Spec.\n",
  );
  assert.equal(empty.status, 0, empty.stdout);
  assert.match(empty.stdout, /Decision list valid: 0 item\(s\)/);
});

test("the agreement shows the plan's size last (P101), and its Technical part the plan from estimate --plan --json (P87)", async () => {
  const folder = await realpath(await mkdtemp(join(tmpdir(), "choices-plan-")));
  try {
    const plan = join(folder, "plan.json");
    await writeFile(
      plan,
      JSON.stringify({
        from: "Future Work",
        slices: 3,
        perSlice: {
          context: 90_000,
          workingMs: 50 * 60_000,
          usd: 1.95,
          model: "claude-opus-5-5 high",
          source: "the median of 6 measured Slices of project demo, corrected from 3 predictions",
        },
        landings: [
          { title: "Parser", first: 0, last: 1, oversized: false },
          { title: "CLI", first: 1, last: 1, oversized: false },
          { title: "Docs", first: 1, last: 2, oversized: false },
        ],
        perCycle: [
          { cycle: 0, context: 50_000, usd: 1.0833 },
          { cycle: 1, context: 150_000, usd: 3.25 },
          { cycle: 2, context: 70_000, usd: 1.5167 },
        ],
        cycles: 3,
        total: { context: 270_000, workingMs: 150 * 60_000, usd: 5.85 },
        parallel: [["Parser", "Docs"]],
        prices: { date: "2026-10-30", source: "the Claude API reference bundled with Claude Code 2.1.311" },
      }),
    );
    const args = ["agreement", "--list", "-", "--do", "Add a queue", "--stop", "the queue works", "--plan", plan];
    const brief = choices(process.cwd(), args, LIST);
    assert.equal(brief.status, 0, brief.stderr);
    assert.equal(
      brief.stdout,
      [
        "What I'll do:   Add a queue",
        "Where I stop:   the queue works",
        'Your decisions: 1. Text when the queue is full? I\'d go with "Queue full, try later"',
        "                2. Retry count? I'd go with 3, because the client does",
        'Technical:      1 more choice and the plan; say "show technical" to see them.',
        "Size:           3 compaction cycles (this one and 2 more), about $5.85 at API list price",
        "",
      ].join("\n"),
    );
    const technical = choices(process.cwd(), [...args, "--show-technical"], LIST);
    assert.equal(technical.status, 0, technical.stderr);
    assert.ok(
      technical.stdout.endsWith(
        [
          "Technical:      T1 FIFO array in queue.ts (serves P1)",
          "Plan:           each Slice about 90,000 tokens of context, working about 50 min, about $1.95, mostly claude-opus-5-5 high (the median of 6 measured Slices of project demo, corrected from 3 predictions)",
          "                - Parser: this compaction cycle into the next",
          "                - CLI: the next",
          "                - Docs: the next into +2",
          "                by compaction cycle: this one about 50,000 tokens, $1.08; the next about 150,000, $3.25; +2 about 70,000, $1.52",
          "                in all: about 270,000 tokens of context, working about 2 h 30 min, about $5.85",
          "                could run in parallel: Parser, Docs",
          "                prices: API list price as of 2026-10-30, from the Claude API reference bundled with Claude Code 2.1.311",
          "Size:           3 compaction cycles (this one and 2 more), about $5.85 at API list price",
          "",
        ].join("\n"),
      ),
      technical.stdout,
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("choices renders the agreement and the hand-over filter, and refuses a Schema 4 record", async () => {
  const agreement = choices(
    process.cwd(),
    ["agreement", "--list", "-", "--do", "Add a queue", "--stop", "the queue works"],
    LIST,
  );
  assert.equal(agreement.status, 0, agreement.stderr);
  assert.equal(
    agreement.stdout,
    [
      "What I'll do:   Add a queue",
      "Where I stop:   the queue works",
      'Your decisions: 1. Text when the queue is full? I\'d go with "Queue full, try later"',
      "                2. Retry count? I'd go with 3, because the client does",
      'Technical:      1 more choice; say "show technical" to see them.',
      "",
    ].join("\n"),
  );
  const handover = choices(process.cwd(), ["handover", "--list", "-", "--json"], LIST);
  assert.deepEqual(JSON.parse(handover.stdout).shown, ["P2", "P3", "T1"]);
  assert.equal(choices(process.cwd(), ["agreement", "--list", "-"], LIST).status, 2);

  // A Schema 4 record is refused, naming migrate: only Track Work's migrate reads one now.
  const root = await realpath(await mkdtemp(join(tmpdir(), "discuss-work-choices4-")));
  try {
    const recordPath = join(root, "record.md");
    await writeFile(
      recordPath,
      await readFile(resolve(".skill-eval/track-work/fixtures/schema4-full/task-001-full-record/record.md"), "utf8"),
    );
    await writeFile(join(root, "decisions.md"), LIST);
    const refused = choices(root, ["catch-up", "--record", recordPath]);
    assert.equal(refused.status, 2);
    assert.match(refused.stderr, /is a Schema 4 record: convert it with Track Work's migrate first/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("with a Schema 5 record, the list is decisions.md beside it and the catch-up reads the current Slice's update lines", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "discuss-work-choices5-")));
  try {
    git(root, "init", "--quiet", "--initial-branch=main");
    await writeFile(join(root, ".gitignore"), ".freeflow/\n");
    const init = run(
      root,
      ["init", "--root", root, "--name", "Queue", "--cue", "read when the queue matters", "--input", "-"],
      "### Goal\n\n- Add a queue.\n\n### Next action\n\n- Build it.\n",
    );
    assert.equal(init.status, 0, init.stderr);
    const recordPath = resolve(root, init.stdout.trim().split("\n")[0]);
    const opened = run(
      root,
      ["agreement", "open", "--record", recordPath, "--title", "Queue", "--input", "-"],
      '- Done when the queue drains. You: "go" (2026-10-30)\n',
    );
    assert.equal(opened.status, 0, opened.stderr);
    const started = run(
      root,
      [
        "slice",
        "start-direct",
        "--record",
        recordPath,
        "--title",
        "Build the queue",
        "--next-action",
        "Test it.",
        "--input",
        "-",
      ],
      "- Result wanted: A queue.\n- Scope: src/queue.ts.\n- Done when: it drains.\n- Stop if: it drops jobs.\n- Started from: none.\n",
    );
    assert.equal(started.status, 0, started.stderr);
    const text = await readFile(recordPath, "utf8");
    await writeFile(
      recordPath,
      text.replace(
        "- Started from: none.\n",
        () =>
          "- Started from: none.\n- Evidence (observed): the queue drains — scratch/run.txt\n- Result: commit abc1234\n",
      ),
    );
    // init writes decisions.md; without it, the message names where Track Work keeps it.
    await rm(join(dirname(recordPath), "decisions.md"));
    const missing = choices(root, ["validate", "--record", recordPath]);
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /no decision list at .*\/task-001-queue\/decisions\.md/);
    await writeFile(join(dirname(recordPath), "decisions.md"), `# Decisions\n\n${LIST}`);
    const catchUp = choices(root, ["catch-up", "--record", recordPath]);
    assert.equal(catchUp.status, 0, catchUp.stderr);
    assert.match(catchUp.stdout, /Choices waiting for you \(1\):\n- P2 \[new\]/);
    assert.match(
      catchUp.stdout,
      /What ran \(S-001 — Build the queue, updates: 2\):\n- Evidence \(observed\): the queue drains — scratch\/run\.txt\n- Result: commit abc1234\n/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
