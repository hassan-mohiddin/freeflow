import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runMetrics } from "../../../skills/evaluate-behavior/scripts/lib/hooks.mjs";
import {
  aggregateMetrics,
  aggregateMetricsLines,
  METRIC_NAMES,
  peakContext,
  runMetricsFor,
  runMetricsLines,
  skillReads,
  skillRoots,
} from "../../../skills/evaluate-behavior/scripts/lib/metrics.mjs";
import { aggregateGroups } from "../../../skills/evaluate-behavior/scripts/lib/trials.mjs";
import { renderResult } from "../../../skills/evaluate-behavior/scripts/lib/view.mjs";

const ARMS = ["baseline", "same", "changed"];

async function withTempDirectory(run) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "skill-eval-metrics-test-")));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function usage(input, output, cacheRead, cacheWrite, total) {
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total },
  };
}

const tool = (toolName, isError) => ({ toolCallId: toolName, toolName, args: {}, completed: true, isError });

test("a body run with turns gives exact metrics from its timestamps, turns, tool activity and usage", () => {
  const observation = {
    turns: [
      { turn: 1, toolActivity: [tool("read", false), tool("bash", true)] },
      { turn: 2, toolActivity: [tool("edit", false)] },
    ],
  };
  const run = {
    startedAt: "2026-10-12T10:00:00.000Z",
    completedAt: "2026-10-12T10:00:12.500Z",
    usage: usage(200, 50, 600, 200, 0.0125),
  };

  assert.deepEqual(runMetricsFor({ observation, run }), {
    durationMs: 12500,
    turns: 2,
    toolCalls: 3,
    toolErrors: 1,
    tokens: { input: 200, output: 50, cacheRead: 600, cacheWrite: 200 },
    cost: 0.0125,
    cacheHitRate: 0.6,
    peakContext: null,
    skillReads: null,
    skillReadTokens: null,
  });
  // Registered through the hook, the same fields land in run.metrics.
  assert.deepEqual(runMetrics({ observation, run }), runMetricsFor({ observation, run }));
});

test("a one-shot run counts one turn and its top-level tool activity", () => {
  const observation = { toolActivity: [tool("read", false), tool("read", false)] };
  const run = {
    startedAt: "2026-10-12T10:00:00.000Z",
    completedAt: "2026-10-12T10:00:01.000Z",
    usage: usage(100, 20, 0, 0, 0.001),
  };

  assert.deepEqual(runMetricsFor({ observation, run }), {
    durationMs: 1000,
    turns: 1,
    toolCalls: 2,
    toolErrors: 0,
    tokens: { input: 100, output: 20, cacheRead: 0, cacheWrite: 0 },
    cost: 0.001,
    cacheHitRate: 0,
    peakContext: null,
    skillReads: null,
    skillReadTokens: null,
  });
});

test("missing usage, timestamps or tool activity give null, never 0", () => {
  assert.deepEqual(runMetricsFor({ observation: {}, run: { startedAt: "2026-10-12T10:00:00.000Z", usage: null } }), {
    durationMs: null,
    turns: 1,
    toolCalls: null,
    toolErrors: null,
    tokens: { input: null, output: null, cacheRead: null, cacheWrite: null },
    cost: null,
    cacheHitRate: null,
    peakContext: null,
    skillReads: null,
    skillReadTokens: null,
  });
  // Usage with no prompt tokens at all has no hit rate; usage without a cost has a null cost.
  const empty = runMetricsFor({
    observation: { turns: [] },
    run: { usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
  });
  assert.equal(empty.turns, 0);
  assert.equal(empty.toolCalls, 0);
  assert.equal(empty.cacheHitRate, null);
  assert.equal(empty.cost, null);
  // A cost of 0 is a measure only when no token was used: tokens at no price are a missing price, not a free run.
  const priced = (usage) => runMetricsFor({ observation: { turns: [] }, run: { usage } }).cost;
  assert.equal(priced({ input: 120, output: 30, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } }), null);
  assert.equal(priced({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } }), 0);
  assert.equal(priced({ input: 120, output: 30, cacheRead: 0, cacheWrite: 0, cost: { total: 0.004 } }), 0.004);
});

/** Run metrics per trial and arm: [durationMs, input tokens, cost]; null leaves the run without metrics. */
const FIXTURE = [
  { baseline: [1000, 100, 0.01], same: [1100, 100, 0.01], changed: [500, 300, 0.03] },
  { baseline: [3000, 100, 0.02], same: [2900, 120, 0.02], changed: [1000, 300, 0.05] },
  { baseline: [2000, 200, 0.03], same: null, changed: [1500, 400, 0.04] },
];

function fixtureRun(arm, values) {
  if (values === null) return { variant: arm, state: "infrastructure-failed" };
  const [durationMs, input, cost] = values;
  return {
    variant: arm,
    state: "complete",
    metrics: {
      durationMs,
      turns: 1,
      toolCalls: 2,
      toolErrors: 0,
      tokens: { input, output: 10, cacheRead: input, cacheWrite: 0 },
      cost,
      cacheHitRate: 0.5,
    },
  };
}

async function writeTrials(root) {
  const trials = [];
  for (const [index, runs] of FIXTURE.entries()) {
    const trial = path.join(root, `trial-${index + 1}`);
    const groupDirectory = path.join(trial, "groups/three-arms");
    await writeJson(path.join(groupDirectory, "definition.json"), { id: "three-arms", expectations: [] });
    await writeJson(path.join(groupDirectory, "deterministic-grade.json"), {
      state: "complete",
      checks: [],
      comparisons: [],
    });
    for (const arm of ARMS) await writeJson(path.join(groupDirectory, arm, "run.json"), fixtureRun(arm, runs[arm]));
    trials.push({
      id: `t${index + 1}`,
      path: trial,
      summary: {
        groups: [
          {
            id: "three-arms",
            state: "complete",
            variants: {
              baseline: "complete",
              same: runs.same === null ? "infrastructure-failed" : "complete",
              changed: "complete",
            },
            artifacts: { grade: "deterministic-grade.json" },
          },
        ],
      },
    });
  }
  return trials;
}

test("the metrics aggregator gives each arm's median and mean and each arm's paired difference against the reference", async () => {
  await withTempDirectory(async (root) => {
    const [group] = await aggregateGroups(await writeTrials(root));
    const { metrics } = group;

    assert.equal(metrics.reference, "baseline");
    assert.deepEqual(Object.keys(metrics.arms), ARMS);
    assert.deepEqual(metrics.arms.baseline.durationMs, { count: 3, median: 2000, mean: 2000, min: 1000, max: 3000 });
    // The failed trial recorded no metrics, so `same` has two measured trials.
    assert.deepEqual(metrics.arms.same.durationMs, { count: 2, median: 2000, mean: 2000, min: 1100, max: 2900 });
    assert.deepEqual(metrics.arms.changed.durationMs, { count: 3, median: 1000, mean: 1000, min: 500, max: 1500 });
    assert.deepEqual(metrics.arms.changed["tokens.input"], {
      count: 3,
      median: 300,
      mean: 1000 / 3,
      min: 300,
      max: 400,
    });

    assert.deepEqual(Object.keys(metrics.differences), ["same", "changed"]);
    // Paired within trials: same - baseline over trials 1 and 2 only.
    assert.deepEqual(metrics.differences.same.durationMs, { pairs: 2, mean: 0, median: 0 });
    assert.deepEqual(metrics.differences.same["tokens.input"], { pairs: 2, mean: 10, median: 10 });
    // changed - baseline: -500, -2000, -500.
    assert.deepEqual(metrics.differences.changed.durationMs, { pairs: 3, mean: -1000, median: -500 });
    assert.deepEqual(metrics.differences.changed["tokens.input"], { pairs: 3, mean: 200, median: 200 });
  });
});

test("perTrial holds one entry per trial and arm with every metric, null where unmeasured", async () => {
  await withTempDirectory(async (root) => {
    const [group] = await aggregateGroups(await writeTrials(root));
    const { perTrial } = group.metrics;

    assert.equal(perTrial.length, 9);
    assert.deepEqual(
      perTrial.map(({ trial, arm }) => `${trial}:${arm}`),
      ["t1", "t2", "t3"].flatMap((trial) => ARMS.map((arm) => `${trial}:${arm}`)),
    );
    for (const entry of perTrial) {
      assert.deepEqual(Object.keys(entry), ["trial", "arm", "values"]);
      assert.deepEqual(Object.keys(entry.values), METRIC_NAMES);
    }
    assert.deepEqual(perTrial[0].values, {
      durationMs: 1000,
      turns: 1,
      toolCalls: 2,
      toolErrors: 0,
      "tokens.input": 100,
      "tokens.output": 10,
      "tokens.cacheRead": 100,
      "tokens.cacheWrite": 0,
      cost: 0.01,
      cacheHitRate: 0.5,
      peakContext: null,
      skillReads: null,
      skillReadTokens: null,
    });
    const failed = perTrial.find((entry) => entry.trial === "t3" && entry.arm === "same");
    assert.ok(Object.values(failed.values).every((value) => value === null));
  });
});

test("the aggregate and run views render tracked metrics", async () => {
  await withTempDirectory(async (root) => {
    const section = aggregateMetrics({
      arms: ["baseline", "candidate"],
      reference: "baseline",
      trials: [
        {
          id: "t1",
          runs: {
            baseline: fixtureRun("baseline", [1000, 100, 0.01]),
            candidate: fixtureRun("candidate", [400, 100, 0.01]),
          },
        },
      ],
    });
    const lines = aggregateMetricsLines(section);
    assert.ok(
      lines.includes(
        "metric\tdurationMs\tbaseline=median:1000 mean:1000 n=1\tcandidate=median:400 mean:400 n=1\tcandidate-baseline=mean:-600 pairs=1",
      ),
      lines.join("\n"),
    );
    assert.deepEqual(aggregateMetricsLines({ error: "boom" }), ["metrics\terror\tboom"]);
    assert.deepEqual(runMetricsLines(fixtureRun("baseline", [1000, 100, 0.01])), [
      "  metrics\tduration-ms=1000\tturns=1\ttool-calls=2\ttool-errors=0\tcache-hit-rate=0.5\tcost=0.01",
    ]);
    assert.deepEqual(runMetricsLines({ state: "complete" }), []);

    const resultDirectory = path.join(root, "aggregate");
    await writeJson(path.join(resultDirectory, "aggregate.json"), {
      id: "agg",
      state: "complete",
      requestedTrials: 1,
      trials: [{ id: "t1", state: "complete" }],
      groups: [{ id: "g", trials: 1, runStates: {}, comparisons: [], checks: [], metrics: section }],
    });
    const view = await renderResult(resultDirectory, undefined, { root });
    assert.match(view, /^metric\tcacheHitRate\tbaseline=median:0\.5 mean:0\.5 n=1\t/m);
  });
});

// A Pi transcript: one model request per assistant message, each with the usage of the prompt it carried.
const assistant = (usage, ...calls) => ({
  role: "assistant",
  content: calls.map(([id, name, args]) => ({ type: "toolCall", id, name, arguments: args })),
  usage,
});
const result = (toolCallId, text, isError = false) => ({
  role: "toolResult",
  toolCallId,
  content: [{ type: "text", text }],
  isError,
});

test("peak context is the largest single request's input plus cache reads plus cache writes", () => {
  const transcript = [
    { role: "user", content: "fix it" },
    assistant({ input: 3000, output: 100, cacheRead: 0, cacheWrite: 1000 }),
    assistant({ input: 500, output: 900, cacheRead: 4000, cacheWrite: 200 }),
    // The last request is not the largest: a compaction or a shorter branch can shrink a later prompt.
    assistant({ input: 2000, output: 50, cacheRead: 1000, cacheWrite: 0 }),
  ];
  // Requests carried 4000, 4700 and 3000 tokens; output is not part of what a request sent.
  assert.equal(peakContext(transcript), 4700);
  // A message without complete usage is skipped; with none at all the metric is unmeasured, never 0.
  assert.equal(
    peakContext([assistant({ input: 10, output: 1 }), assistant({ input: 7, cacheRead: 3, cacheWrite: 0 })]),
    10,
  );
  assert.equal(
    peakContext([
      { role: "user", content: "hi" },
      { role: "assistant", content: [] },
    ]),
    null,
  );
});

test("skill reads count every read of a skill or Freeflow instruction file, re-reads included, from what entered the context", async () => {
  await withTempDirectory(async (root) => {
    const freeflowRoot = path.join(root, "freeflow");
    const declared = path.join(root, "skills/target");
    const workspace = path.join(root, "workspace");
    const roots = skillRoots({ freeflowRoot, environment: { skills: [{ path: declared }] } });
    assert.deepEqual(roots, [
      declared,
      path.join(freeflowRoot, "skills"),
      path.join(freeflowRoot, "capabilities"),
      path.join(freeflowRoot, "runtime"),
    ]);
    const skill = path.join(freeflowRoot, "skills/verify-work/SKILL.md");
    const transcript = [
      assistant(
        { input: 1, cacheRead: 0, cacheWrite: 0 },
        ["a", "read", { path: skill }],
        ["b", "read", { path: "src/app.js" }],
        ["c", "read", { path: path.join(freeflowRoot, "pi-extension/freeflow/index.js") }],
      ),
      result("a", "x".repeat(4001)),
      result("b", "y".repeat(800)),
      result("c", "z".repeat(800)),
      // The same skill read again later, a reference through bash, a declared skill read relatively, and a failed read.
      assistant(
        { input: 1, cacheRead: 0, cacheWrite: 0 },
        ["d", "read", { path: `@${skill}` }],
        ["e", "bash", { command: `cat ${path.join(freeflowRoot, "skills/verify-work/references/x.md")} | head` }],
        ["f", "read", { path: path.relative(workspace, path.join(declared, "SKILL.md")) }],
        ["g", "read", { path: path.join(freeflowRoot, "capabilities/compaction/SKILL.md") }],
        ["h", "bash", { command: "node --test" }],
      ),
      result("d", "x".repeat(4001)),
      result("e", "é".repeat(10)),
      result("f", "s".repeat(3)),
      result("g", "missing", true),
      result("h", "ok"),
    ];
    // a and d: 4001 bytes each, 1001 tokens each; e: 20 UTF-8 bytes, 5 tokens; f: 3 bytes, 1 token.
    assert.deepEqual(skillReads(transcript, { roots, cwd: workspace }), { reads: 4, tokens: 2008, bytes: 8025 });
    // An arm with no skills and no Freeflow, such as plain Pi, reads none: a measured 0, not a missing value.
    assert.deepEqual(skillReads(transcript, { roots: [], cwd: workspace }), { reads: 0, tokens: 0, bytes: 0 });

    // Through the run-metrics hook: measured for a Pi run with a transcript, null for another host or none.
    const run = { workspace, transcript, usage: null };
    const pi = runMetricsFor({ run, subject: { host: { name: "pi" }, freeflowRoot, environment: { skills: [] } } });
    assert.deepEqual([pi.peakContext, pi.skillReads, pi.skillReadTokens], [1, 3, 2007]);
    const plain = runMetricsFor({
      run,
      subject: { host: { name: "pi" }, freeflowRoot: null, environment: { skills: [] } },
    });
    assert.deepEqual([plain.peakContext, plain.skillReads, plain.skillReadTokens], [1, 0, 0]);
    const claude = runMetricsFor({ run, subject: { host: { name: "claude-code" }, freeflowRoot } });
    assert.deepEqual([claude.peakContext, claude.skillReads, claude.skillReadTokens], [null, null, null]);
    assert.equal(runMetricsFor({ run: { workspace }, subject: { host: { name: "pi" } } }).peakContext, null);
  });
});

test("peak context and skill-read tokens aggregate per arm with paired differences, and the run view shows them", () => {
  const measured = (arm, peak, tokens) => ({
    variant: arm,
    state: "complete",
    metrics: { peakContext: peak, skillReads: tokens === 0 ? 0 : 2, skillReadTokens: tokens },
  });
  const section = aggregateMetrics({
    arms: ["plain", "freeflow"],
    reference: "plain",
    trials: [
      { id: "t1", runs: { plain: measured("plain", 10000, 0), freeflow: measured("freeflow", 25000, 6000) } },
      { id: "t2", runs: { plain: measured("plain", 14000, 0), freeflow: measured("freeflow", 20000, 9000) } },
    ],
  });
  assert.deepEqual(section.arms.freeflow.peakContext, { count: 2, median: 22500, mean: 22500, min: 20000, max: 25000 });
  assert.deepEqual(section.arms.plain.skillReadTokens, { count: 2, median: 0, mean: 0, min: 0, max: 0 });
  assert.deepEqual(section.differences.freeflow.peakContext, { pairs: 2, mean: 10500, median: 10500 });
  assert.deepEqual(section.differences.freeflow.skillReadTokens, { pairs: 2, mean: 7500, median: 7500 });
  assert.deepEqual(section.perTrial[1].values.peakContext, 25000);
  assert.ok(
    aggregateMetricsLines(section).includes(
      "metric\tpeakContext\tplain=median:12000 mean:12000 n=2\tfreeflow=median:22500 mean:22500 n=2\tfreeflow-plain=mean:+10500 pairs=2",
    ),
  );
  assert.deepEqual(
    runMetricsLines(measured("freeflow", 25000, 6000)).at(-1),
    "  context\tpeak-context=25000\tskill-reads=2\tskill-read-tokens~=6000",
  );
});
