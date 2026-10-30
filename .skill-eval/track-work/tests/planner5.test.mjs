import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { parsePredicted, predictSlice } from "../../../skills/track-work/scripts/lib/planner5.mjs";
import { skeleton5 } from "../../../skills/track-work/scripts/lib/record5.mjs";

const scriptPath = resolve("skills/track-work/scripts/working-record.mjs");
const n = (value) => value.toLocaleString("en-US");

/** A Measured line for a Slice that added `context` tokens in `minutes` of work for `usd`. */
const measured = (context, minutes, usd, partial = false) =>
  `context ${n(context)} over 1 compaction cycle(s)${partial ? " (partly measured)" : ""}; working ${minutes} min, wall ${minutes + 10} min; claude-opus-5-5 high: 0 in, 0 written, ${n(context * 5)} read, 1,000 out, $${usd.toFixed(2)}; as of 2026-10-01T10:00:00.000Z at ${n(context + 50_000)} tokens`;

function sliceEntry(id, { measure, predicted }) {
  return [
    `## ${id} — Slice ${id}`,
    "",
    "- State: completed",
    "- Dates: 2026-10-01",
    `- Cue: read when ${id} matters`,
    "- Under: A-001",
    "- Result wanted: A result.",
    "- Result: Done.",
    "- Evidence: record.md",
    "- Task effect: None.",
    ...(predicted ? [`- Predicted: ${predicted}`] : []),
    `- Measured: ${measure}`,
  ].join("\n");
}

async function writeTask(dir, name, entries, future = "") {
  await mkdir(dir, { recursive: true });
  const record = skeleton5({
    name,
    cue: `read when ${name} matters`,
    stateAsOf: "2026-10-01T10:00:00.000Z",
    sections: { Goal: ["- A goal."], "Next action": ["- Go on."] },
  });
  await writeFile(join(dir, "record.md"), `${record}${future}`);
  await writeFile(
    join(dir, "history.md"),
    `# History: ${name}\n\n${entries.map(([id, figures]) => sliceEntry(id, figures)).join("\n\n")}\n`,
  );
  await writeFile(join(dir, "decisions.md"), "# Decisions\n");
  return join(dir, "record.md");
}

const FUTURE = [
  "",
  "### Slice — Parser",
  "",
  "- Result wanted: A parser.",
  "",
  "### Slice — CLI",
  "",
  "- Result wanted: A CLI.",
  "- Dependencies: Parser closed.",
  "",
  "### Slice — Docs",
  "",
  "- Result wanted: The docs.",
  "",
].join("\n");

/**
 * A store with project demo (task A: two complete measurements, one partial, one not measured; task B: four, three
 * of them predicted) and one task in no project.
 */
async function storeFixture() {
  const home = await realpath(await mkdtemp(join(tmpdir(), "track-work-planner5-")));
  await writeFile(join(home, "store.json"), `${JSON.stringify({ kind: "freeflow-store", version: 1 })}\n`);
  const a = await writeTask(
    join(home, "projects/demo/tasks/task-001-a"),
    "A",
    [
      ["S-001", { measure: measured(40_000, 20, 1) }],
      ["S-002", { measure: "not measured" }],
      ["S-003", { measure: measured(90_000, 45, 4, true) }],
      ["S-004", { measure: measured(60_000, 30, 2) }],
    ],
    FUTURE,
  );
  const b = await writeTask(join(home, "projects/demo/tasks/task-002-b"), "B", [
    ["S-001", { measure: measured(30_000, 10, 0.5) }],
    // Actual over predicted: context 2, time 2, cost 1.5.
    [
      "S-002",
      {
        measure: measured(50_000, 20, 1.5),
        predicted: "context 25,000, working 10 min, $1.00; median of 3 Slices of the store",
      },
    ],
    // The figures it predicted were corrected; actual over the uncorrected median: context 2, time 2, cost 3.
    [
      "S-003",
      {
        measure: measured(80_000, 40, 3),
        predicted:
          "context 60,000 (×1.50), working 20 min, $2.00 (×2.00); median of 3 Slices of this task, corrected from 3 predictions of the store",
      },
    ],
    // Context 1, time 1, cost 1.
    [
      "S-004",
      {
        measure: measured(40_000, 30, 1.1),
        predicted: "context 40,000, working 30 min, $1.10; median of 3 Slices of this task",
      },
    ],
  ]);
  const c = await writeTask(join(home, "tasks/task-001-c"), "C", [["S-001", { measure: measured(100_000, 60, 5) }]]);
  // C also handed one gather to a worker, measured from the worker's own log.
  await writeFile(
    join(dirname(c), "history.md"),
    `${await readFile(join(dirname(c), "history.md"), "utf8")}\n${[
      "## D-001 — Read the callers",
      "",
      "- State: accepted",
      "- Dates: 2026-10-01",
      "- Cue: read when the callers matter",
      "- Under: A-001",
      "- Kind: gather",
      "- Agent: Haiku, xhigh",
      "- Measured: context 300,000 over 1 compaction cycle(s); working 9 min, wall 9 min; claude-haiku-5-5 xhigh: 80 in, 300,000 written, 6,000,000 read, 100,000 out, $0.70; as of 2026-10-01T10:00:00.000Z at 300,000 tokens",
      "- Result: The callers.",
      "- Task effect: Known.",
      "- Return: delegations/D-001-read-the-callers/return.md",
    ].join("\n")}\n`,
  );
  return { home, a, b, c };
}

function run(args, env = {}, input = "") {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: "utf8",
    input,
    env: {
      ...process.env,
      FREEFLOW_CONTEXT_WINDOW: "",
      FREEFLOW_TRANSCRIPT: "",
      CLAUDE_CODE_SESSION_ID: "",
      ...env,
    },
  });
}

test("a Slice's prediction: the median of the first pool with three measured Slices, corrected by actual over predicted", async () => {
  const { home, a, b, c } = await storeFixture();
  try {
    // B's own four Slices, and its own three predictions: context ×2, time ×2, cost ×1.5.
    const own = predictSlice(b);
    assert.equal(
      own.line,
      "context 90,000 (×2.00), working 50 min (×2.00), $1.95 (×1.50); median of 4 Slices of this task, corrected from 3 predictions of this task",
    );
    // A has two complete measurements (the partial and the unmeasured are left out): project demo's six stand.
    assert.equal(
      predictSlice(a).line,
      "context 90,000 (×2.00), working 50 min (×2.00), $1.95 (×1.50); median of 6 Slices of project demo, corrected from 3 predictions of project demo",
    );
    // C, in no project: the store's seven Slices, and the store's three predictions.
    assert.match(
      predictSlice(c).line,
      /^context 100,000 \(×2\.00\), .*; median of 7 Slices of the store, corrected from 3 predictions of the store$/,
    );
    // The line reads back to the figures and the uncorrected median.
    const parsed = parsePredicted(own.line);
    assert.equal(parsed.context, 90_000);
    assert.equal(parsed.base.context, 45_000);
    assert.equal(parsed.base.usd, 1.3);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("slice start records the prediction beside the first reading, and slice close keeps it beside the actual", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "track-work-predicted5-")));
  try {
    execFileSync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: root });
    await writeFile(join(root, ".gitignore"), ".freeflow/\n");
    const init = run(
      ["init", "--root", root, "--name", "Demo", "--cue", "read when the demo matters", "--input", "-"],
      {},
      "### Goal\n\n- A demo.\n\n### Next action\n\n- Build it.\n",
    );
    assert.equal(init.status, 0, init.stderr);
    const record = init.stdout.trim().split("\n")[0];
    const history = join(dirname(record), "history.md");
    await writeFile(
      history,
      `# History: Demo\n\n${[
        ["S-001", { measure: measured(20_000, 10, 1) }],
        ["S-002", { measure: measured(40_000, 20, 2) }],
        ["S-003", { measure: measured(60_000, 30, 3) }],
      ]
        .map(([id, figures]) => sliceEntry(id, figures))
        .join("\n\n")}\n`,
    );
    assert.equal(
      run(
        ["agreement", "open", "--record", record, "--title", "Demo", "--input", "-"],
        {},
        '- Done when it runs. You: "go" (2026-10-30)\n',
      ).status,
      0,
    );
    const started = run(
      [
        "slice",
        "start-direct",
        "--record",
        record,
        "--title",
        "Build",
        "--next-action",
        "Build it.",
        "--used",
        "50000",
        "--input",
        "-",
      ],
      {},
      "- Result wanted: A demo.\n- Scope: demo.\n- Done when: it runs.\n- Stop if: it breaks.\n- Started from: nothing.\n",
    );
    assert.equal(started.status, 0, started.stderr);
    assert.match(
      await readFile(record, "utf8"),
      /\n- Predicted: context 40,000, working 20 min, \$2\.00; median of 3 Slices of this task\n- Measured: context 0 over 1 compaction cycle\(s\); working 0 min, wall 0 min; as of \S+ at 50,000 tokens\n/,
    );
    const closed = run(
      [
        "slice",
        "close",
        "--record",
        record,
        "--state",
        "completed",
        "--next-action",
        "Done.",
        "--used",
        "95000",
        "--input",
        "-",
      ],
      {},
      "- Cue: read when the demo matters\n- Result: It runs.\n- Evidence: record.md\n- Task effect: A demo.\n",
    );
    assert.equal(closed.status, 0, closed.stderr);
    assert.match(
      await readFile(history, "utf8"),
      /\n- Predicted: context 40,000, working 20 min, \$2\.00; median of 3 Slices of this task\n- Measured: context 45,000 over 1 compaction cycle\(s\); working 0 min, wall 0 min; as of \S+ at 95,000 tokens\n/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("estimate --plan lays the Slices left across compaction cycles, with the totals, the oversized and the parallel", async () => {
  const { home, a } = await storeFixture();
  try {
    const plan = run(["estimate", "--plan", "--record", a, "--used", "100000", "--window", "200000"]);
    assert.equal(plan.status, 0, plan.stderr);
    assert.equal(
      plan.stdout,
      [
        "Plan: 3 Slices left, from Future Work.",
        "Each Slice, expected: context about 90,000, working about 50 min, about $1.95 at list price, mostly claude-opus-5-5 high: the median of 6 measured Slices of project demo (context 30,000 to 80,000; working 10 to 40 min; $0.50 to $3.00), corrected by the median of actual over predicted of 3 predictions of project demo (context 1.00 to 2.00).",
        "Context now: about 100,000 of 200,000 tokens; Freeflow's notice at about 150,000. Where a compaction cycle starts is unknown (no transcript read): taken as empty, so each later compaction cycle holds about 150,000.",
        "- Parser: this compaction cycle into the next",
        "- CLI: the next compaction cycle",
        "- Docs: the next compaction cycle into compaction cycle +2",
        "In all: about 270,000 tokens of context, reaching compaction cycle +2; working about 2 h 30 min; about $5.85 at list price.",
        "No dependency between them, so they could run in parallel through delegation: Parser, Docs.",
        "Delegations measured (the store), the median of each:",
        "- gather, claude-haiku-5-5 xhigh: 1 delegation, context about 300,000, working 9 min, $0.70 each",
        "Prices: API list price as of 2026-10-30, from the Claude API reference bundled with Claude Code 2.1.311; on a subscription, what the work would cost through the API. This prints costs; Execute Work's delegation reference chooses models.",
        "",
      ].join("\n"),
    );
    // A fan-out of 4 workers of the kind measured, priced in all.
    assert.match(
      run(["estimate", "--plan", "--record", a, "--used", "100000", "--window", "200000", "--fan-out", "4"]).stdout,
      /\n- gather, claude-haiku-5-5 xhigh: 1 delegation, context about 300,000, working 9 min, \$0\.70 each; a fan-out of 4: about \$2\.80\n/,
    );
    // Before a task exists: a list given, the store's Slices, and the plan as data for the agreement (P87).
    const data = run(
      ["estimate", "--plan", "--json", "--used", "100000", "--window", "200000", "--input", "-"],
      { FREEFLOW_HOME: home },
      "- One\n- Two\n",
    );
    assert.equal(data.status, 0, data.stderr);
    const planned = JSON.parse(data.stdout);
    assert.deepEqual(
      {
        cycles: planned.cycles,
        perSlice: planned.perSlice,
        perCycle: planned.perCycle,
        total: planned.total,
        parallel: planned.parallel,
      },
      {
        cycles: 2,
        perSlice: {
          context: 100_000,
          workingMs: 60 * 60_000,
          usd: 1.5 * 1.5,
          model: "claude-opus-5-5 high",
          upperBound: false,
          source: "the median of 7 measured Slices of the store, corrected from 3 predictions",
        },
        perCycle: [
          { cycle: 0, context: 50_000, usd: 1.125 },
          { cycle: 1, context: 150_000, usd: 3.375 },
        ],
        total: { context: 200_000, workingMs: 120 * 60_000, usd: 4.5 },
        parallel: [["One", "Two"]],
      },
    );
    // A smaller window: each Slice outgrows a compaction cycle.
    assert.match(
      run(["estimate", "--plan", "--record", a, "--used", "10000", "--window", "100000"]).stdout,
      /\n- Parser: this compaction cycle into the next; bigger than a compaction cycle \(about 75,000\): split it or delegate it\n/,
    );
    // A list given as input instead of Future Work, one Slice a line, "after" naming what it waits for.
    const given = run(
      ["estimate", "--plan", "--record", a, "--used", "100000", "--window", "200000", "--input", "-"],
      {},
      "- Phase 8.1 — our setup\n- Phase 8.2 — convert this task · after: Phase 8.1\n",
    );
    assert.equal(given.status, 0, given.stderr);
    assert.match(given.stdout, /^Plan: 2 Slices left, from the list given\.\n/);
    assert.doesNotMatch(given.stdout, /could run in parallel/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("estimate --plan before three Slices are measured anywhere: this compaction cycle's rate, from --done", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "track-work-rate5-")));
  try {
    const record = await writeTask(
      join(root, "task-001-new"),
      "New",
      [["S-001", { measure: measured(10_000, 5, 1) }]],
      FUTURE,
    );
    const refused = run(["estimate", "--plan", "--record", record, "--used", "60000", "--window", "200000"]);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /fewer than 3 measured Slices \(this task 1\).*--done <n>/);
    const rated = run([
      "estimate",
      "--plan",
      "--record",
      record,
      "--used",
      "80000",
      "--window",
      "200000",
      "--done",
      "2",
    ]);
    assert.equal(rated.status, 0, rated.stderr);
    assert.match(
      rated.stdout,
      /\nEach Slice, expected: context at most about 40,000, at this compaction cycle's rate \(80,000 tokens over 2 parts done\), since fewer than 3 Slices are measured \(this task 1\); no cost or time until they are\.\n/,
    );
    assert.match(rated.stdout, /\nIn all: about 120,000 tokens of context, reaching the next compaction cycle\.\n/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Slices measured with --used carry context only: the prediction and the plan give no time or cost for them", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "track-work-used5-")));
  try {
    const used = (context) =>
      `context ${n(context)} over 1 compaction cycle(s); working 0 min, wall 3 min; as of 2026-10-01T10:00:00.000Z at ${n(context + 10_000)} tokens`;
    const record = await writeTask(
      join(root, "task-001-used"),
      "Used",
      [
        ["S-001", { measure: used(20_000) }],
        ["S-002", { measure: used(40_000) }],
        ["S-003", { measure: used(60_000) }],
      ],
      FUTURE,
    );
    assert.equal(predictSlice(record).line, "context 40,000; median of 3 Slices of this task");
    assert.deepEqual(parsePredicted("context 40,000; median of 3 Slices of this task").base, {
      context: 40_000,
      workingMs: null,
      usd: null,
    });
    const plan = run(["estimate", "--plan", "--record", record, "--used", "100000", "--window", "200000"]);
    assert.equal(plan.status, 0, plan.stderr);
    assert.match(
      plan.stdout,
      /\nEach Slice, expected: context about 40,000, no time or cost \(its Slices were measured from --used\): the median of 3 measured Slices of this task \(context 20,000 to 60,000\), not corrected: /,
    );
    assert.match(plan.stdout, /\nIn all: about 120,000 tokens of context, reaching the next compaction cycle\.\n/);
    assert.doesNotMatch(plan.stdout, /\$|Prices:/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("estimate --project and --store add up what was measured, and size a task with nothing measured from others' data", async () => {
  const { home } = await storeFixture();
  try {
    const project = run(["estimate", "--project", "demo"], { FREEFLOW_HOME: home });
    assert.equal(project.status, 0, project.stderr);
    assert.equal(
      project.stdout,
      [
        "Project demo: 2 tasks; costs at API list price.",
        "- demo/task-001 — A · 3 Slices measured (1 partly): context 190,000, working 1 h 35 min, $7.00 · 3 Slices proposed: about 270,000, about $5.85 (project demo's data)",
        "- demo/task-002 — B · 4 Slices measured: context 200,000, working 1 h 40 min, $6.10 · nothing proposed",
        "In all: 7 Slices measured, context 390,000, working 3 h 15 min, $13.10; proposed: about 270,000, about $5.85.",
        "",
      ].join("\n"),
    );
    const store = run(["estimate", "--store"], { FREEFLOW_HOME: home });
    assert.equal(store.status, 0, store.stderr);
    assert.equal(
      store.stdout,
      [
        "The store: 1 project and 1 task in none; 3 tasks, 8 Slices measured, 1 delegation measured; costs at API list price.",
        "Slices by model and effort:",
        "- claude-opus-5-5 high: 8 Slices, 0 in, 0 written, 2,450,000 read, 8,000 out, $18.10",
        "Delegations by kind, model and effort:",
        "- gather, claude-haiku-5-5 xhigh: 1 delegation, 80 in, 300,000 written, 6,000,000 read, 100,000 out, $0.70",
        "By project:",
        "- demo: 2 tasks, 7 Slices, $13.10",
        "- no project: 1 task, 1 Slice, 1 delegation, $5.70",
        "",
      ].join("\n"),
    );
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
