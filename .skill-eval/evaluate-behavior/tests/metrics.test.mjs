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
  runMetricsFor,
  runMetricsLines,
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
