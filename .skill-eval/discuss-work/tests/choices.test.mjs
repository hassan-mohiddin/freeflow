import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
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

test("a decision moved to changed carries a one-line reason, or the list does not validate", async () => {
  const bare = choices(process.cwd(), ["validate", "--list", "-"], "- P1 [changed] Retry count -> 5\n");
  assert.equal(bare.status, 1, bare.stdout);
  assert.match(bare.stdout, /error: line 1 P1: changed without saying why/);
  const reasoned = choices(
    process.cwd(),
    ["validate", "--list", "-"],
    "- P1 [changed] Retry count -> 5, because the server now rate-limits at 3\n",
  );
  assert.equal(reasoned.status, 0, reasoned.stdout);
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
        "Size:           3 context cycles (this one and 2 more), about $5.85 at API list price",
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
          "                - Parser: this context cycle into the next",
          "                - CLI: the next",
          "                - Docs: the next into +2",
          "                by context cycle: this one about 50,000 tokens, $1.08; the next about 150,000, $3.25; +2 about 70,000, $1.52",
          "                in all: about 270,000 tokens of context, working about 2 h 30 min, about $5.85",
          "                could run in parallel: Parser, Docs",
          "                prices: API list price as of 2026-10-30, from the Claude API reference bundled with Claude Code 2.1.311",
          "Size:           3 context cycles (this one and 2 more), about $5.85 at API list price",
          "",
        ].join("\n"),
      ),
      technical.stdout,
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("a sized plan: the Size line gives the range, the most likely cost and what it rests on, and each Slice its own figures (P18)", async () => {
  const folder = await realpath(await mkdtemp(join(tmpdir(), "choices-sized-")));
  try {
    const plan = join(folder, "plan.json");
    await writeFile(
      plan,
      JSON.stringify({
        from: "the list given",
        slices: 2,
        perSlice: {
          context: 60_000,
          workingMs: 30 * 60_000,
          usd: 2,
          model: "claude-opus-5-5 high",
          source: "the median of 5 measured Slices of this task",
        },
        sureness: "from 5 measured Slices of this task, 5 of them sized; 2 of 2 Slices left sized; not corrected yet",
        landings: [
          { title: "One", first: 0, last: 0, oversized: false, files: 12, context: 36_000, usd: 1.2 },
          { title: "Two", first: 0, last: 1, oversized: false, files: 40, context: 120_000, usd: 4 },
        ],
        perCycle: [
          { cycle: 0, context: 100_000, usd: 3.33 },
          { cycle: 1, context: 56_000, usd: 1.87 },
        ],
        cycles: 2,
        total: {
          context: 156_000,
          contextLow: 120_000,
          contextHigh: 208_000,
          workingMs: 78 * 60_000,
          usd: 5.2,
          usdLow: 4.1,
          usdHigh: 7.8,
        },
        parallel: [],
        prices: { date: "2026-10-30", source: "the Claude API reference bundled with Claude Code 2.1.311" },
      }),
    );
    const args = ["agreement", "--list", "-", "--do", "Add a queue", "--stop", "the queue works", "--plan", plan];
    const technical = choices(process.cwd(), [...args, "--show-technical"], LIST);
    assert.equal(technical.status, 0, technical.stderr);
    const lines = technical.stdout.split("\n");
    assert.ok(
      lines.includes(
        "Size:           2 context cycles (this one and 1 more), $4.10 to $7.80 at API list price, most likely $5.20 (from 5 measured Slices of this task, 5 of them sized; 2 of 2 Slices left sized; not corrected yet)",
      ),
      technical.stdout,
    );
    assert.ok(
      lines.includes(
        "Plan:           each Slice from its files at the measured rate per file (from 5 measured Slices of this task, 5 of them sized; 2 of 2 Slices left sized; not corrected yet)",
      ),
      technical.stdout,
    );
    assert.ok(
      lines.includes("                - One (12 files): this context cycle, about 36,000 tokens, $1.20"),
      technical.stdout,
    );
    assert.ok(
      lines.includes("                - Two (40 files): this context cycle into the next, about 120,000 tokens, $4.00"),
      technical.stdout,
    );
    // A plan from Slices measured with --used has no cost: the Size line says so instead of a range.
    const unpriced = JSON.parse(await readFile(plan, "utf8"));
    unpriced.total = { ...unpriced.total, usd: null, usdLow: null, usdHigh: null, workingMs: null };
    unpriced.landings = unpriced.landings.map((item) => ({ ...item, usd: null }));
    await writeFile(plan, JSON.stringify(unpriced));
    const brief = choices(process.cwd(), args, LIST);
    assert.equal(brief.status, 0, brief.stderr);
    assert.match(
      brief.stdout,
      /\nSize: {11}2 context cycles \(this one and 1 more\); no cost measured yet \(from 5 measured Slices of this task, .*\)\n$/,
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("choices renders the agreement and the Return filter, and refuses a Schema 4 record", async () => {
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
  // The workers above the cheap tier the user's answer grants come before Size, after Technical.
  const granted = choices(
    process.cwd(),
    ["agreement", "--list", "-", "--do", "Add a queue", "--stop", "the queue works", "--workers", "Opus at high"],
    LIST,
  );
  assert.equal(granted.status, 0, granted.stderr);
  assert.match(granted.stdout, /see them\.\nWorkers: {8}Opus at high\n$/);
  assert.equal(choices(process.cwd(), ["validate", "--list", "-", "--workers", "Opus"], LIST).status, 2);
  const handover = choices(process.cwd(), ["return", "--list", "-", "--json"], LIST);
  assert.deepEqual(JSON.parse(handover.stdout).shown, ["P2", "P3", "T1"]);
  // Its former name still works.
  const former = choices(process.cwd(), ["handover", "--list", "-", "--json"], LIST);
  assert.deepEqual(JSON.parse(former.stdout).shown, ["P2", "P3", "T1"]);
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

const driftPath = resolve("skills/discuss-work/scripts/drift.mjs");
const drift = (cwd, args, input = "", env = {}) => {
  const result = spawnSync(process.execPath, [driftPath, ...args], {
    cwd,
    env: { ...gitEnv, ...env },
    encoding: "utf8",
    input,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

test("drift lists the hunks no decision item shows at, those a feature file covers first, and the return counts them", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "discuss-work-drift-")));
  const lines = (count, word) => Array.from({ length: count }, (_, index) => `${word} ${index + 1}`).join("\n") + "\n";
  const put = async (files) => {
    for (const [path, text] of Object.entries(files)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), text);
    }
  };
  try {
    git(root, "init", "--quiet", "--initial-branch=main");
    await put({
      "src/queue.ts": lines(60, "queue"),
      "src/util.ts": lines(10, "util"),
      "README.md": lines(5, "readme"),
      "dev-docs/README.md": "# Docs\n",
      "dev-docs/features/queue.md":
        "# Queue\n\n> **Covers:** `src/queue.ts`\n> **Verified at:** `0000000` (2026-11-03)\n\n## Driving it\n\n- Run it.\n",
    });
    git(root, "add", "--all");
    git(root, "commit", "--quiet", "-m", "base");
    const change = lines(60, "queue")
      .replace("queue 12\n", "oldest first\n")
      .replace("queue 30\n", "Queue full, try later\n")
      .replace("queue 50\n", "retry forever\n");
    await put({
      "src/queue.ts": change,
      "src/util.ts": lines(10, "util").replace("util 3\n", "util three\n"),
      "README.md": lines(5, "readme").replace("readme 2\n", "the queue\n"),
      "src/lanes.ts": "export const lanes = 2;\n",
    });
    const list = [
      '- P1 [agreed] Which job runs first? -> oldest first. You: "go" (2026-10-20). Shows at: src/queue.ts:12',
      '- P2 [new] Text when the queue is full -> "Queue full, try later". Shows at: src/queue.ts:28-31, README.md',
      "- P3 [dropped] Retry count -> 3. Shows at: src/queue.ts:50",
      "- T1 [default] Helper rename -> serves P1. Shows at: src/util.ts:9",
      "",
    ].join("\n");
    const result = drift(root, ["--base", "HEAD", "--list", "-", "--json"], list);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.hunks, 6);
    assert.equal(report.covered, 3);
    assert.deepEqual(
      report.uncovered.map((each) => [each.file, each.start, each.end, each.userVisible, each.first]),
      [
        // A dropped item covers nothing; a feature file covers src/queue.ts, so it comes first.
        ["src/queue.ts", 50, 50, true, "retry forever"],
        ["src/lanes.ts", 1, 1, false, "export const lanes = 2;"],
        // T1 shows at line 9, not line 3.
        ["src/util.ts", 3, 3, false, "util three"],
      ],
    );
    const text = drift(root, ["--base", "HEAD", "--list", "-"], list);
    assert.match(text.stdout, /^Drift against HEAD: 3 of 6 hunk\(s\) shown at by no decision item/);
    assert.match(text.stdout, /^- src\/queue\.ts:50 \(a feature file covers it\): retry forever$/m);

    // The return counts them; the record's decisions.md is the list, by path or by the task's ID in the store.
    const home = join(root, ".store");
    const taskDir = join(home, "projects", "widget", "tasks", "task-001-queue");
    await mkdir(taskDir, { recursive: true });
    await writeFile(join(taskDir, "record.md"), "# Queue\n\nSchema: 5\n");
    await writeFile(join(taskDir, "decisions.md"), list);
    await writeFile(join(root, ".git", "info", "exclude"), ".store/\n");
    const byId = drift(root, ["--base", "HEAD", "--record", "widget/task-001", "--json"], "", { FREEFLOW_HOME: home });
    assert.equal(byId.status, 0, byId.stderr);
    assert.equal(JSON.parse(byId.stdout).uncovered.length, 3);
    const counted = choices(root, ["return", "--record", join(taskDir, "record.md"), "--base", "HEAD"]);
    assert.equal(counted.status, 0, counted.stderr);
    assert.match(
      counted.stdout,
      /^Drift: 3 of 6 hunk\(s\) against HEAD shown at by no decision item; drift\.mjs --base HEAD lists them\.$/m,
    );
    const json = JSON.parse(choices(root, ["handover", "--list", "-", "--base", "HEAD", "--json"], list).stdout);
    assert.deepEqual(json.drift, { base: "HEAD", uncovered: 3, hunks: 6 });
    assert.equal(choices(root, ["validate", "--list", "-", "--base", "HEAD"], list).status, 2);
    assert.equal(drift(root, ["--base", "nope", "--list", "-"], list).status, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
