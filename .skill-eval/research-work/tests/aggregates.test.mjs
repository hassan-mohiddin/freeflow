// Aggregates over several seeds (Agarwal et al. 2021): the interquartile mean, median, mean and optimality gap of a
// runs × tasks score matrix with stratified bootstrap intervals, the probability of improvement, and intervals for
// pass^k. Checked against hand-computed values and properties the definitions force.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  aggregateScores,
  passPowerKInterval,
  probabilityOfImprovement,
  suitePassPowerKInterval,
} from "../../../skills/research-work/scripts/lib/stats.mjs";

const SCRIPTS = fileURLToPath(new URL("../../../skills/research-work/scripts/", import.meta.url));
const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

test("the point estimates follow their definitions", () => {
  // Interquartile mean: all runs of all tasks pooled, the lowest and highest quarter dropped.
  close(
    aggregateScores(
      [
        [1, 2, 3, 4],
        [5, 6, 7, 8],
      ],
      { statistic: "iqm" },
    ).estimate,
    4.5,
  );
  close(
    aggregateScores(
      [
        [1, 2, 3, 4, 5],
        [6, 7, 8, 9, 100],
      ],
      { statistic: "iqm" },
    ).estimate,
    5.5,
  );
  // Median and mean of the per-task means.
  close(
    aggregateScores(
      [
        [1, 3],
        [2, 2],
        [10, 10],
      ],
      { statistic: "median" },
    ).estimate,
    2,
  );
  close(
    aggregateScores(
      [
        [1, 3],
        [2, 2],
        [10, 10],
      ],
      { statistic: "mean" },
    ).estimate,
    14 / 3,
  );
  // Optimality gap: how far scores fall short of the target, scores above it counting as the target.
  close(
    aggregateScores(
      [
        [0.5, 1.2],
        [0.8, 0.9],
      ],
      { statistic: "optimality-gap" },
    ).estimate,
    0.2,
  );
  close(
    aggregateScores(
      [
        [50, 120],
        [80, 90],
      ],
      { statistic: "optimality-gap", target: 100 },
    ).estimate,
    20,
  );
});

test("the stratified bootstrap resamples runs within each task, never across tasks", () => {
  // Each task's runs are identical, so every resample gives the same value: a pooled bootstrap would not.
  const fixed = aggregateScores(
    [
      [0, 0, 0, 0],
      [10, 10, 10, 10],
    ],
    { statistic: "mean", resamples: 2000 },
  );
  close(fixed.low, 5);
  close(fixed.high, 5);
  const spread = aggregateScores(
    [
      [0.1, 0.4, 0.3, 0.8, 0.5],
      [0.9, 0.7, 0.6, 0.95, 0.85],
      [0.2, 0.25, 0.3, 0.1, 0.15],
    ],
    { statistic: "iqm", resamples: 4000, seed: 7 },
  );
  assert.ok(spread.low <= spread.estimate && spread.estimate <= spread.high, JSON.stringify(spread));
  assert.ok(spread.low < spread.high);
  assert.equal(spread.method, "stratified-bootstrap-percentile");
  assert.deepEqual(
    aggregateScores(
      [
        [1, 2],
        [3, 4],
      ],
      { statistic: "iqm", seed: 3 },
    ),
    aggregateScores(
      [
        [1, 2],
        [3, 4],
      ],
      { statistic: "iqm", seed: 3 },
    ),
  );
  assert.throws(() => aggregateScores([[1, 2], []], { statistic: "mean" }), /every task needs at least one run/);
  assert.throws(() => aggregateScores([[1, 2]], { statistic: "mode" }), /statistic must be one of/);
});

test("the probability of improvement averages, over tasks, the chance a run of X beats a run of Y", () => {
  close(probabilityOfImprovement([[1, 2]], [[0, 3]]).estimate, 0.5);
  // A tie counts half.
  close(probabilityOfImprovement([[1]], [[1]]).estimate, 0.5);
  close(probabilityOfImprovement([[3], [0]], [[1], [1]]).estimate, 0.5);
  close(
    probabilityOfImprovement(
      [
        [5, 6],
        [7, 8],
      ],
      [
        [1, 2],
        [3, 4],
      ],
    ).estimate,
    1,
  );
  const certain = probabilityOfImprovement(
    [
      [5, 6],
      [7, 8],
    ],
    [
      [1, 2],
      [3, 4],
    ],
    { resamples: 1000 },
  );
  close(certain.low, 1);
  assert.throws(() => probabilityOfImprovement([[1]], [[1], [2]]), /the same tasks/);
});

test("pass^k has an exact interval for one task and a bootstrap interval over tasks", () => {
  // All 10 trials pass: the exact lower bound for p is 0.025^(1/10), so for pass^3 it is 0.025^(3/10).
  const all = passPowerKInterval(10, 10, 3);
  close(all.estimate, 1);
  close(all.low, 0.025 ** 0.3, 1e-6);
  close(all.high, 1);
  const some = passPowerKInterval(10, 7, 3);
  // The unbiased estimate C(7, 3) / C(10, 3) = 35 / 120.
  close(some.estimate, 35 / 120);
  assert.ok(some.low < some.estimate && some.estimate < some.high);
  const same = suitePassPowerKInterval(
    [
      { n: 10, c: 7 },
      { n: 10, c: 7 },
      { n: 10, c: 7 },
    ],
    3,
  );
  close(same.estimate, 35 / 120);
  // Its interval resamples trials as well as tasks, so it is not zero width (tested below).
  const mixed = suitePassPowerKInterval(
    [
      { n: 5, c: 5 },
      { n: 5, c: 2 },
      { n: 5, c: 4 },
      { n: 5, c: 0 },
    ],
    2,
    { seed: 5 },
  );
  assert.ok(mixed.low <= mixed.estimate && mixed.estimate <= mixed.high);
});

test("the command line runs the aggregate family and the pass^k intervals", () => {
  const run = (family, input) =>
    JSON.parse(
      spawnSync(process.execPath, [join(SCRIPTS, "stats.mjs"), family], {
        input: JSON.stringify(input),
        encoding: "utf8",
      }).stdout,
    );
  close(
    run("aggregate", {
      method: "iqm",
      scores: [
        [1, 2, 3, 4],
        [5, 6, 7, 8],
      ],
      resamples: 200,
    }).estimate,
    4.5,
  );
  close(run("aggregate", { method: "improvement", x: [[1, 2]], y: [[0, 3]], resamples: 200 }).estimate, 0.5);
  close(run("passk", { method: "task-interval", n: 10, c: 10, k: 3 }).low, 0.025 ** 0.3, 1e-6);
  close(run("passk", { method: "suite-interval", tasks: [{ n: 10, c: 7 }], k: 3, resamples: 200 }).estimate, 35 / 120);
});

test("the bootstrap intervals match exact enumeration of every resample on small designs", () => {
  // [[1, 3], [2, 4]]: each task's resampled mean is one of three values, so the 95% interval of the mean is [1.5, 3.5].
  for (const statistic of ["mean", "iqm", "median"]) {
    const result = aggregateScores(
      [
        [1, 3],
        [2, 4],
      ],
      { statistic, resamples: 20000, seed: 11 },
    );
    close(result.low, 1.5);
    close(result.high, 3.5);
  }
  // 256 equally likely resamples give the exact interval [0.125, 0.625].
  const exact = probabilityOfImprovement(
    [
      [3, 4],
      [3, 3],
    ],
    [
      [4, 3],
      [4, 3],
    ],
    { resamples: 20000, seed: 11 },
  );
  close(exact.low, 0.125);
  close(exact.high, 0.625);
  // An asymmetric matrix pins the quarter cut: 10 runs, 2 dropped from each end, leaving 1, 1, 1, 2, 3, 4.
  close(
    aggregateScores(
      [
        [1, 1, 1, 1, 1],
        [2, 3, 4, 50, 60],
      ],
      { statistic: "iqm" },
    ).estimate,
    2,
  );
});

test("a suite's pass^k interval resamples trials within tasks too, and warns when tasks are few", () => {
  // Identical tasks still vary by their trials, so the interval is not zero width.
  const same = suitePassPowerKInterval(
    Array.from({ length: 5 }, () => ({ n: 10, c: 7 })),
    3,
    { seed: 2 },
  );
  assert.ok(same.high - same.low > 0.1, JSON.stringify(same));
  assert.match(same.warning, /fewer than 10 tasks/);
  const many = suitePassPowerKInterval(
    Array.from({ length: 12 }, (_, i) => ({ n: 10, c: 5 + (i % 5) })),
    2,
    { seed: 2 },
  );
  assert.equal(many.warning, undefined);
  assert.equal(many.method, "suite-pass-power-k-two-stage-bootstrap");
});

test("degenerate designs and odd inputs are named, never silently wrong", () => {
  assert.match(aggregateScores([[0.2], [0.5], [0.9]], { statistic: "iqm" }).warning, /one run/);
  assert.match(
    aggregateScores(
      [
        [1, 2],
        [3, 4],
      ],
      { statistic: "iqm" },
    ).warning,
    /fewer than 5 runs/,
  );
  for (const resamples of [0, 2.5, -1])
    assert.throws(() => aggregateScores([[1, 2]], { statistic: "mean", resamples }), /resamples/);
  assert.throws(() => aggregateScores([[1, 2]], { statistic: "optimality-gap", target: "x" }), /target/);
  // The estimate is the unbiased one, which can lie below the exact interval for p^k; the result says so.
  assert.match(passPowerKInterval(5, 1, 2).note, /below the interval/);
  const run = (input) =>
    spawnSync(process.execPath, [join(SCRIPTS, "stats.mjs"), "aggregate"], {
      input: JSON.stringify(input),
      encoding: "utf8",
    });
  // null means the default, as an omitted field does.
  close(
    JSON.parse(
      run({
        method: "optimality-gap",
        scores: [
          [0.5, 1.2],
          [0.8, 0.9],
        ],
        target: null,
        resamples: 100,
      }).stdout,
    ).estimate,
    0.2,
  );
  assert.equal(run({ method: "constructor", scores: [[1]] }).status, 2);
});
