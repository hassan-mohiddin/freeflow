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

/** A Measured line for a Slice that added `context` tokens in `minutes` of work for `usd`, run on `model`. */
const measured = (context, minutes, usd, partial = false, model = "claude-opus-5-5 high") =>
  `context ${n(context)} over 1 context cycle(s)${partial ? " (partly measured)" : ""}; working ${minutes} min, wall ${minutes + 10} min; ${model}: 0 in, 0 written, ${n(context * 5)} read, 1,000 out, $${usd.toFixed(2)}; as of 2026-10-01T10:00:00.000Z at ${n(context + 50_000)} tokens`;
const HAIKU = "claude-haiku-5-5 xhigh";
/** Five Slices: three on Haiku, two dearer ones on Opus. */
const MIXED = [
  ["S-001", { measure: measured(20_000, 10, 0.1, false, HAIKU) }],
  ["S-002", { measure: measured(40_000, 20, 0.2, false, HAIKU) }],
  ["S-003", { measure: measured(60_000, 30, 0.3, false, HAIKU) }],
  ["S-004", { measure: measured(80_000, 40, 3) }],
  ["S-005", { measure: measured(100_000, 50, 5) }],
];

function sliceEntry(id, { measure, predicted, files }) {
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
    ...(files ? [`- Files: ${files} changed (github.com/acme/demo a1b2c3d4..e5f6a7b8)`] : []),
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
      "- Measured: context 300,000 over 1 context cycle(s); working 9 min, wall 9 min; claude-haiku-5-5 xhigh: 80 in, 300,000 written, 6,000,000 read, 100,000 out, $0.70; as of 2026-10-01T10:00:00.000Z at 300,000 tokens",
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

test("a Slice's prediction: the median of the first pool with three measured Slices, corrected by the geometric mean of actual over predicted, pulled toward none (P16)", async () => {
  const { home, a, b, c } = await storeFixture();
  try {
    // B's own four Slices, and its own three predictions, actual over predicted 2, 2 and 1 for context and time and
    // 1.5, 3 and 1 for cost: with two on-target Slices added, (2 · 2 · 1 · 1 · 1)^(1/5) = 1.32 and
    // (1.5 · 3 · 1 · 1 · 1)^(1/5) = 1.35.
    const own = predictSlice(b);
    assert.equal(
      own.line,
      "context 59,378 (×1.32), working 33 min (×1.32), $1.76 (×1.35); median of 4 Slices of this task, cost measured mostly on claude-opus-5-5 high, corrected from 3 predictions of this task",
    );
    // A has two complete measurements (the partial and the unmeasured are left out): project demo's six stand.
    assert.equal(
      predictSlice(a).line,
      "context 59,378 (×1.32), working 33 min (×1.32), $1.76 (×1.35); median of 6 Slices of project demo, cost measured mostly on claude-opus-5-5 high, corrected from 3 predictions of project demo",
    );
    // C, in no project: the store's seven Slices, and the store's three predictions.
    assert.match(
      predictSlice(c).line,
      /^context 65,975 \(×1\.32\), .*; median of 7 Slices of the store, cost measured mostly on claude-opus-5-5 high, corrected from 3 predictions of the store$/,
    );
    // The line reads back to the figures and, within the factor's two decimals, the uncorrected median.
    const parsed = parsePredicted(own.line);
    assert.equal(parsed.context, 59_378);
    assert.ok(Math.abs(parsed.base.context - 45_000) < 100, `${parsed.base.context}`);
    assert.ok(Math.abs(parsed.base.usd - 1.3) < 0.01, `${parsed.base.usd}`);
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
      /\n- Predicted: context 40,000, working 20 min, \$2\.00; median of 3 Slices of this task, cost measured mostly on claude-opus-5-5 high\n- Measured: context 0 over 1 context cycle\(s\); working 0 min, wall 0 min; as of \S+ at 50,000 tokens\n/,
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
      /\n- Predicted: context 40,000, working 20 min, \$2\.00; median of 3 Slices of this task, cost measured mostly on claude-opus-5-5 high\n- Measured: context 45,000 over 1 context cycle\(s\); working 0 min, wall 0 min; as of \S+ at 95,000 tokens\n/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a Slice's cost comes from Slices run on its model and effort once three are measured, else from all, naming the model most of it was measured on; context and time from all (P8 of A-005)", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "track-work-model5-")));
  try {
    const record = await writeTask(join(root, "task-001-mixed"), "Mixed", MIXED);
    // On Haiku: the three Haiku Slices' median cost; the context and working time of all five.
    assert.equal(
      predictSlice(record, null, HAIKU).line,
      "context 60,000, working 30 min, $0.20; median of 5 Slices of this task, cost from the 3 run on claude-haiku-5-5 xhigh",
    );
    // On Opus, with two Opus Slices, or on a model none ran on, or none known: all five, measured mostly on Opus.
    const all =
      "context 60,000, working 30 min, $0.30; median of 5 Slices of this task, cost measured mostly on claude-opus-5-5 high";
    assert.equal(predictSlice(record, null, "claude-opus-5-5 high").line, all);
    assert.equal(predictSlice(record, null, "claude-sonnet-5-5 high").line, all);
    assert.equal(predictSlice(record).line, all);
    assert.equal(parsePredicted(all).costModel, "claude-opus-5-5 high");
    assert.equal(
      parsePredicted("context 60,000, working 30 min, $0.30; median of 5 Slices of this task").costModel,
      null,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a prediction whose cost was measured on another model than its Slice ran on corrects its context and time, not later costs", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "track-work-model-correction5-")));
  try {
    const record = await writeTask(join(root, "task-001-mixed"), "Mixed", [
      ...MIXED,
      // A Haiku Slice priced from Opus: actual over predicted 2 for context and time, 0.1 for a cost that cannot compare.
      [
        "S-006",
        {
          measure: measured(40_000, 20, 0.4, false, HAIKU),
          predicted:
            "context 20,000, working 10 min, $4.00; median of 5 Slices of this task, cost measured mostly on claude-opus-5-5 high",
        },
      ],
      // A Haiku Slice priced from Haiku: 1 for context and time, 2 for cost.
      [
        "S-007",
        {
          measure: measured(40_000, 20, 0.4, false, HAIKU),
          predicted:
            "context 40,000, working 20 min, $0.20; median of 6 Slices of this task, cost from the 4 run on claude-haiku-5-5 xhigh",
        },
      ],
    ]);
    // Context and time: (2 · 1 · 1 · 1)^(1/4) = 1.19 over the median of seven, 40,000 and 20 min; cost: S-007 alone,
    // (2 · 1 · 1)^(1/3) = 1.26 over the median of the five Haiku Slices, $0.30.
    assert.equal(
      predictSlice(record, null, HAIKU).line,
      "context 47,568 (×1.19), working 24 min (×1.19), $0.38 (×1.26); median of 7 Slices of this task, cost from the 5 run on claude-haiku-5-5 xhigh, corrected from 2 predictions of this task",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("slice start and estimate --plan price by the model and effort of the transcript's newest request", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "track-work-model-start5-")));
  try {
    execFileSync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: root });
    await writeFile(join(root, ".gitignore"), ".freeflow/\n");
    const record = await writeTask(join(root, ".freeflow/tasks/task-001-mixed"), "Mixed", MIXED, FUTURE);
    const now = Date.now();
    const entry = (minutesAgo, id, model, effort, extra = {}) =>
      JSON.stringify({
        type: "assistant",
        timestamp: new Date(now - minutesAgo * 60_000).toISOString(),
        effort,
        message: {
          id,
          model,
          usage: {
            input_tokens: 2,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 50_000,
            output_tokens: 10,
          },
        },
        ...extra,
      });
    const transcript = join(root, "session.jsonl");
    // The session moved from Opus to Haiku; a subagent's request and Claude Code's own synthetic entry come after.
    await writeFile(
      transcript,
      `${[
        entry(30, "m1", "claude-opus-5-5", "high"),
        entry(20, "m2", "claude-haiku-5-5", "xhigh"),
        entry(10, "s1", "claude-opus-5-5", "high", { isSidechain: true }),
        entry(5, "m3", "<synthetic>", null),
      ].join("\n")}\n`,
    );
    const opened = run(
      ["agreement", "open", "--record", record, "--title", "Mixed", "--input", "-"],
      {},
      '- Done when it runs. You: "go" (2026-11-03)\n',
    );
    assert.equal(opened.status, 0, opened.stderr);
    const started = run(
      [
        "slice",
        "start",
        "--record",
        record,
        "--title",
        "Parser",
        "--next-action",
        "Go on.",
        "--transcript",
        transcript,
        "--input",
        "-",
      ],
      {},
      "- Scope: the parser.\n- Done when: it parses.\n- Stop if: it breaks.\n- Started from: nothing.\n",
    );
    assert.equal(started.status, 0, started.stderr);
    assert.match(
      await readFile(record, "utf8"),
      /\n- Predicted: context 60,000, working 30 min, \$0\.20; median of 5 Slices of this task, cost from the 3 run on claude-haiku-5-5 xhigh\n/,
    );
    const plan = run(["estimate", "--plan", "--record", record, "--transcript", transcript, "--window", "1000000"]);
    assert.equal(plan.status, 0, plan.stderr);
    assert.match(
      plan.stdout,
      /\nA Slice with no size, expected: context about 60,000, working about 30 min, about \$0\.20 at list price, cost from the 3 run on claude-haiku-5-5 xhigh: the median of 5 measured Slices of this task \(context 20,000 to 100,000; working 10 to 50 min; \$0\.10 to \$0\.30\), /,
    );
    // Given --used, no transcript is read, so no model is known: all five, measured mostly on Opus.
    assert.match(
      run(["estimate", "--plan", "--record", record, "--used", "50000", "--window", "1000000"]).stdout,
      /, about \$0\.30 at list price, cost measured mostly on claude-opus-5-5 high: /,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("estimate --plan lays the Slices left across context cycles, with the totals, the oversized and the parallel", async () => {
  const { home, a } = await storeFixture();
  try {
    const plan = run(["estimate", "--plan", "--record", a, "--used", "100000", "--window", "200000"]);
    assert.equal(plan.status, 0, plan.stderr);
    assert.equal(
      plan.stdout,
      [
        "Plan: 3 Slices left, from Future Work.",
        "Expected in all: $2.03 to $12.16 at list price, most likely $5.27; context 118,756 to 316,682, most likely 178,134; working about 1 h 39 min. Resting on: from 6 measured Slices of project demo, none sized; 0 of 3 Slices left sized; corrected from 3 predictions of project demo.",
        "A Slice with no size, expected: context about 59,378, working about 33 min, about $1.76 at list price, cost measured mostly on claude-opus-5-5 high: the median of 6 measured Slices of project demo (context 30,000 to 80,000; working 10 to 40 min; $0.50 to $3.00), corrected by 1.32, from actual over predicted of 3 predictions of project demo (context 1.00 to 2.00).",
        "Context now: about 100,000 of 200,000 tokens; Freeflow's notice at about 150,000. Where a context cycle starts is unknown (no transcript read): taken as empty, so each later context cycle holds about 150,000.",
        "- Parser: this context cycle into the next; context about 59,378, about $1.76",
        "- CLI: the next context cycle; context about 59,378, about $1.76",
        "- Docs: the next context cycle; context about 59,378, about $1.76",
        "In all: about 178,134 tokens of context, reaching the next context cycle; working about 1 h 39 min; about $5.27 at list price ($2.03 to $12.16).",
        "No dependency between them, so they could run in parallel through delegation: Parser, Docs.",
        "Delegations measured (the store), the median of each:",
        "- gather, claude-haiku-5-5 xhigh: 1 delegation, context about 300,000, working 9 min, $0.70 each",
        "Delegations closed (the store), by kind, check and model, with how many were sent back:",
        "- gather, check not recorded, Haiku xhigh: 1 closed, none sent back",
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
    // Costs to the tenth of a cent: the correction's factors are not round numbers.
    const rounded = (value) =>
      JSON.parse(
        JSON.stringify(value, (_, each) => (typeof each === "number" ? Math.round(each * 1000) / 1000 : each)),
      );
    // The store's median Slice (context 50,000, 30 min, $1.50), corrected by 1.32 and, for cost, 1.35; its range runs
    // from the store's smallest Slice (30,000, $0.50) to its largest (100,000, $5.00).
    assert.deepEqual(
      rounded({
        cycles: planned.cycles,
        perSlice: planned.perSlice,
        perCycle: planned.perCycle,
        total: planned.total,
        parallel: planned.parallel,
      }),
      {
        cycles: 2,
        perSlice: {
          context: 65_975,
          workingMs: 2_375_114,
          usd: 2.026,
          model: "claude-opus-5-5 high",
          upperBound: false,
          source: "the median of 7 measured Slices of the store, corrected from 3 predictions",
        },
        perCycle: [
          { cycle: 0, context: 50_000, usd: 1.536 },
          { cycle: 1, context: 81_951, usd: 2.517 },
        ],
        total: {
          context: 131_951,
          contextLow: 79_170,
          contextHigh: 263_902,
          workingMs: 4_750_228,
          usd: 4.053,
          usdLow: 1.351,
          usdHigh: 13.51,
        },
        parallel: [["One", "Two"]],
      },
    );
    // A smaller window: each Slice outgrows a context cycle.
    assert.match(
      run(["estimate", "--plan", "--record", a, "--used", "10000", "--window", "60000"]).stdout,
      /\n- Parser: this context cycle into the next; context about 59,378, about \$1\.76; bigger than a context cycle \(about 45,000\): split it or delegate it\n/,
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

test("estimate --plan before three Slices are measured anywhere: this context cycle's rate, from --done", async () => {
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
      /\nEach Slice, expected: context at most about 40,000, at this context cycle's rate \(80,000 tokens over 2 parts done\), since fewer than 3 Slices are measured \(this task 1\); no cost or time until they are\.\n/,
    );
    assert.match(rated.stdout, /\nIn all: about 120,000 tokens of context, reaching the next context cycle\.\n/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Slices measured with --used carry context only: the prediction and the plan give no time or cost for them", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "track-work-used5-")));
  try {
    const used = (context) =>
      `context ${n(context)} over 1 context cycle(s); working 0 min, wall 3 min; as of 2026-10-01T10:00:00.000Z at ${n(context + 10_000)} tokens`;
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
      /\nA Slice with no size, expected: context about 40,000, no time or cost \(its Slices were measured from --used\): the median of 3 measured Slices of this task \(context 20,000 to 60,000\), not corrected: /,
    );
    assert.match(plan.stdout, /\nIn all: about 120,000 tokens of context, reaching the next context cycle\.\n/);
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
        "- demo/task-001 — A · 3 Slices measured (1 partly): context 190,000, working 1 h 35 min, $7.00 · 3 Slices proposed: about 178,134, about $5.27 (project demo's data)",
        "- demo/task-002 — B · 4 Slices measured: context 200,000, working 1 h 40 min, $6.10 · nothing proposed",
        "In all: 7 Slices measured, context 390,000, working 3 h 15 min, $13.10; proposed: about 178,134, about $5.27.",
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
        "Delegations closed, by kind, check and model, with how many were sent back:",
        "- gather, check not recorded, Haiku xhigh: 1 closed, none sent back",
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

test("estimate --spent adds up one task's History by model and effort, as text and as JSON for the pane (SPEC-015)", async () => {
  const { home } = await storeFixture();
  try {
    const text = run(["estimate", "--spent", "--record", "task-001"], { FREEFLOW_HOME: home });
    assert.equal(text.status, 0, text.stderr);
    assert.equal(
      text.stdout,
      [
        "Spent: 1 Slice measured, 1 delegation measured, $5.70 at API list price.",
        "- claude-opus-5-5 high: 1 Slice, $5.00",
        "- claude-haiku-5-5 xhigh: 1 delegation, $0.70",
        "",
      ].join("\n"),
    );
    const json = run(["estimate", "--spent", "--record", "demo/task-001", "--json"], { FREEFLOW_HOME: home });
    assert.equal(json.status, 0, json.stderr);
    assert.deepEqual(JSON.parse(json.stdout), {
      slices: 3,
      partial: 1,
      delegations: 0,
      usd: 7,
      byModel: [{ name: "claude-opus-5-5 high", slices: 3, delegations: 0, usd: 7 }],
    });
    const none = run(["estimate", "--spent"], { FREEFLOW_HOME: home });
    assert.equal(none.status, 1);
    assert.match(none.stderr, /estimate --spent adds up a task's History: pass --record <ID>\./);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("a sized Slice: its files times the median per-file rate, corrected only by sized predictions, and a zero reading is not measured (P13 to P18)", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "track-work-sized5-")));
  try {
    const record = await writeTask(
      join(root, "task-001-sized"),
      "Sized",
      [
        // Per file: context 4,000, 3,000, 4,000, 3,000 and 3,000; working 2, 1.5, 2, 1.5 and 1.5 min; cost $0.10, $0.15,
        // $0.10, $0.13 and $0.10.
        ["S-001", { measure: measured(40_000, 20, 1), files: 10 }],
        ["S-002", { measure: measured(60_000, 30, 3), files: 20 }],
        ["S-003", { measure: measured(20_000, 10, 0.5), files: 5 }],
        ["S-004", { measure: measured(90_000, 45, 4), files: 30 }],
        // A reading that found no requests measured nothing: left out of every count.
        [
          "S-005",
          {
            measure:
              "context 0 over 1 context cycle(s); working 0 min, wall 0 min; as of 2026-10-01T10:00:00.000Z at 50,000 tokens",
            files: 3,
          },
        ],
        // Predicted from its size, it came in at twice that: (2 · 1 · 1)^(1/3) = 1.26 for the next sized prediction.
        [
          "S-006",
          {
            measure: measured(60_000, 30, 2),
            files: 20,
            predicted:
              "context 30,000, working 15 min, $1.00; 10 files at the median rate of 4 sized Slices of this task",
          },
        ],
      ],
      [
        "",
        "### Slice — Parser",
        "",
        "- Result wanted: A parser.",
        "- Size: 12 files",
        "",
        "### Slice — Docs",
        "",
        "- Result wanted: The docs.",
        "",
      ].join("\n"),
    );
    // 12 files at 3,000 each, 1.5 min and $0.10, times 1.26.
    assert.equal(
      predictSlice(record, 12).line,
      "context 45,357 (×1.26), working 23 min (×1.26), $1.51 (×1.26); 12 files at the median rate of 5 sized Slices of this task, cost measured mostly on claude-opus-5-5 high, corrected from 1 prediction of this task",
    );
    // With no size, the median of the five measured Slices; no prediction of a Slice with no size has its actual.
    assert.equal(
      predictSlice(record).line,
      "context 60,000, working 30 min, $2.00; median of 5 Slices of this task, cost measured mostly on claude-opus-5-5 high",
    );
    const parsed = parsePredicted(predictSlice(record, 12).line);
    assert.equal(parsed.sized, true);
    assert.ok(Math.abs(parsed.base.context - 36_000) < 100, `${parsed.base.context}`);
    // The plan: Future Work's Size, each Slice with its own figures, and the range and its basis first.
    const plan = run(["estimate", "--plan", "--record", record, "--used", "10000", "--window", "1000000"]);
    assert.equal(plan.status, 0, plan.stderr);
    const lines = plan.stdout.split("\n");
    assert.equal(lines[0], "Plan: 2 Slices left, from Future Work.");
    assert.match(
      lines[1],
      /^Expected in all: \$\d+\.\d{2} to \$\d+\.\d{2} at list price, most likely \$3\.51; context [\d,]+ to [\d,]+, most likely 105,357; working about 53 min\. Resting on: from 5 measured Slices of this task, 5 of them sized; 1 of 2 Slices left sized; corrected from 1 prediction of this task\.$/,
    );
    assert.ok(lines.includes("- Parser (12 files): this context cycle; context about 45,357, about $1.51"));
    assert.ok(lines.includes("- Docs: this context cycle; context about 60,000, about $2.00"));
    assert.ok(
      lines.some((line) =>
        line.startsWith(
          "A sized Slice, expected: its files times the median per file of 5 sized Slices of this task: context 3,000 (3,000 to 4,000), working 1.5 min, $0.10 ($0.10 to $0.15), cost measured mostly on claude-opus-5-5 high, corrected by 1.26",
        ),
      ),
    );
    // A list given as input takes a size and what it waits for, in either order.
    const given = run(
      ["estimate", "--plan", "--record", record, "--used", "10000", "--window", "1000000", "--input", "-"],
      {},
      "- One · size: 12\n- Two · after: One · size: 4\n",
    );
    assert.equal(given.status, 0, given.stderr);
    assert.match(given.stdout, /\n- One \(12 files\): this context cycle; context about 45,357, about \$1\.51\n/);
    assert.match(given.stdout, /\n- Two \(4 files\): this context cycle; context about 15,119, about \$0\.50\n/);
    assert.doesNotMatch(given.stdout, /could run in parallel/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("slice start writes Size and Base, slice close writes Files from Base to HEAD, and slice size adds Files to an older Slice", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "track-work-files5-")));
  const inRoot = (args, input = "") =>
    spawnSync(process.execPath, [scriptPath, ...args], {
      cwd: root,
      encoding: "utf8",
      input,
      env: { ...process.env, FREEFLOW_CONTEXT_WINDOW: "", FREEFLOW_TRANSCRIPT: "", CLAUDE_CODE_SESSION_ID: "" },
    });
  const git = (...args) =>
    execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.com", ...args], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  try {
    git("init", "--quiet", "--initial-branch=main");
    await writeFile(join(root, ".gitignore"), ".freeflow/\n");
    await writeFile(join(root, "old.txt"), "old\n");
    await writeFile(join(root, "kept.txt"), "kept\n");
    git("add", ".");
    git("commit", "--quiet", "-m", "start");
    const init = inRoot(
      ["init", "--root", root, "--name", "Demo", "--cue", "read when the demo matters", "--input", "-"],
      "### Goal\n\n- A demo.\n\n### Next action\n\n- Build it.\n",
    );
    assert.equal(init.status, 0, init.stderr);
    const record = init.stdout.trim().split("\n")[0];
    const history = join(dirname(record), "history.md");
    await writeFile(
      history,
      `# History: Demo\n\n${[
        ["S-001", { measure: measured(20_000, 10, 1), files: 10 }],
        ["S-002", { measure: measured(40_000, 20, 2), files: 20 }],
        ["S-003", { measure: measured(60_000, 30, 3), files: 30 }],
        ["S-004", { measure: measured(30_000, 15, 1.5) }],
      ]
        .map(([id, figures]) => sliceEntry(id, figures))
        .join("\n\n")}\n`,
    );
    assert.equal(
      inRoot(
        ["agreement", "open", "--record", record, "--title", "Demo", "--input", "-"],
        '- Done when it runs. You: "go" (2026-10-30)\n',
      ).status,
      0,
    );
    const start = (size) =>
      inRoot(
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
        `- Result wanted: A demo.\n- Scope: demo.\n- Done when: it runs.\n- Stop if: it breaks.\n- Started from: main.\n- Size: ${size}\n`,
      );
    const refused = start("a few");
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /Size is "<n> files"/);
    const base = git("rev-parse", "--short=8", "HEAD");
    const started = start("2 files");
    assert.equal(started.status, 0, started.stderr);
    const text = await readFile(record, "utf8");
    assert.match(text, /\n- Size: 2 files\n- Base: \S+ [0-9a-f]{8}\n/);
    assert.ok(text.includes(`- Base: ${root} ${base}\n`), text);
    // 2 files at 2,000 each, 1 min and $0.10.
    assert.match(
      text,
      /\n- Predicted: context 4,000, working 2 min, \$0\.20; 2 files at the median rate of 3 sized Slices of this task, cost measured mostly on claude-opus-5-5 high\n/,
    );
    // Two files added and one changed count; the deleted one does not.
    await writeFile(join(root, "a.txt"), "a\n");
    await writeFile(join(root, "b.txt"), "b\n");
    await writeFile(join(root, "kept.txt"), "changed\n");
    await rm(join(root, "old.txt"));
    git("add", "-A");
    git("commit", "--quiet", "-m", "build");
    const head = git("rev-parse", "--short=8", "HEAD");
    const closed = inRoot(
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
        "60000",
        "--input",
        "-",
      ],
      "- Cue: read when the demo matters\n- Result: It runs.\n- Evidence: record.md\n- Task effect: A demo.\n",
    );
    assert.equal(closed.status, 0, closed.stderr);
    const after = await readFile(history, "utf8");
    assert.ok(after.includes(`\n- Size: 2 files\n- Files: 3 changed (${root} ${base}..${head})\n`), after);
    // An older Slice gets its Files once, dated, from a range or a number.
    const sized = inRoot(["slice", "size", "--record", record, "--id", "S-004", "--range", `${base}..${head}`]);
    assert.equal(sized.status, 0, sized.stderr);
    assert.match(sized.stdout, /^Sized S-004: 3 changed/);
    const today = new Date().toLocaleDateString("en-CA");
    assert.match(
      await readFile(history, "utf8"),
      new RegExp(`\\n- Files: 3 changed \\(\\S+ ${base}\\.\\.${head}; added ${today}\\)\\n`),
    );
    const again = inRoot(["slice", "size", "--record", record, "--id", "S-004", "--files", "7"]);
    assert.equal(again.status, 1);
    assert.match(again.stderr, /S-004 already has Files/);
    inRoot(["validate", "--record", record]);
    assert.equal(inRoot(["validate", "--record", record]).status, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
