// A run held for transcript flags no one has cleared counts toward nothing: no check, comparison, pair or
// transition, no metric, score or judged answer, and so no decision. Each part is checked on its own, so undoing any
// one of them fails here.

import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { decide } from "../../../skills/evaluate-behavior/scripts/lib/decision.mjs";
import "../../../skills/evaluate-behavior/scripts/lib/grade-command.mjs";
import "../../../skills/evaluate-behavior/scripts/lib/judge.mjs";
import "../../../skills/evaluate-behavior/scripts/lib/metrics.mjs";
import { aggregateGroups } from "../../../skills/evaluate-behavior/scripts/lib/trials.mjs";

async function withTempDirectory(run) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "skill-eval-held-test-")));
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

const ARMS = ["baseline", "candidate"];

/**
 * Two trials of one group in which both arms pass everything, cost 1 (baseline) or 2 (candidate), score 1 on the
 * hidden tests and are judged "yes". In the first trial the candidate's run has a transcript flag no one cleared.
 */
async function storedTrials(root) {
  const trials = [];
  for (const index of [1, 2]) {
    const trialPath = path.join(root, `trial-${index}`);
    const groupDirectory = path.join(trialPath, "groups/case");
    await writeJson(path.join(groupDirectory, "definition.json"), {
      id: "case",
      expectations: ARMS.map((arm) => ({ id: `${arm}-tests`, kind: "command", variant: arm })),
      rubric: [{ id: "sound", question: "Is the change sound?" }],
    });
    await writeJson(path.join(groupDirectory, "deterministic-grade.json"), {
      state: "complete",
      checks: ARMS.map((arm) => ({
        id: `${arm}-tests`,
        variant: arm,
        kind: "command",
        state: "pass",
        expected: { pass: { tests: { required: ["works"] } } },
        observed: { score: 1 },
      })),
      comparisons: [
        {
          id: "tests",
          kind: "command",
          baseline: { check: "baseline-tests", state: "pass" },
          candidate: { check: "candidate-tests", state: "pass" },
          transition: "pass-to-pass",
        },
      ],
      errors: [],
    });
    for (const arm of ARMS) {
      const held = index === 1 && arm === "candidate";
      await writeJson(path.join(groupDirectory, arm, "run.json"), {
        variant: arm,
        state: "complete",
        metrics: { cost: arm === "baseline" ? 1 : 2, turns: 3 },
        postRun: {
          scan: { flags: held ? [{ id: "network-1", kind: "network", detail: "curl", evidence: {} }] : [] },
        },
      });
      await writeJson(path.join(groupDirectory, arm, "judged-grade.json"), {
        state: "complete",
        judges: [],
        answers: [{ dimension: "sound", answer: "yes", votes: ["yes"] }],
      });
    }
    trials.push({
      id: `t${index}`,
      path: trialPath,
      state: "complete",
      summary: {
        groups: [
          {
            id: "case",
            state: "complete",
            variants: { baseline: "complete", candidate: "complete" },
            artifacts: { grade: "deterministic-grade.json" },
          },
        ],
      },
    });
  }
  return trials;
}

test("a held run's check and comparison count as unavailable and held, and its pairs and transitions as held", async () => {
  await withTempDirectory(async (root) => {
    const [group] = await aggregateGroups(await storedTrials(root));

    assert.deepEqual(group.held, [{ trial: "t1", arm: "candidate", flags: ["network-1"] }]);
    const check = group.checks.find((entry) => entry.id === "candidate-tests");
    assert.deepEqual([check.pass, check.unavailable, check.held, check.passAll], [1, 1, 1, false]);
    const [comparison] = group.comparisons;
    assert.deepEqual(comparison.baseline, { pass: 2, fail: 0, unavailable: 0 });
    assert.deepEqual(comparison.candidate, { pass: 1, fail: 0, unavailable: 1, held: 1 });
    assert.deepEqual(comparison.transitions, { held: 1, "pass-to-pass": 1 });
    assert.deepEqual(comparison.pairs, {
      "both-pass": 1,
      "both-fail": 0,
      "baseline-only": 0,
      "candidate-only": 0,
      incomplete: 1,
    });
  });
});

test("a held run adds no metric, score or judged answer", async () => {
  await withTempDirectory(async (root) => {
    const [group] = await aggregateGroups(await storedTrials(root));
    const heldEntry = (section) => section.perTrial.find((entry) => entry.trial === "t1" && entry.arm === "candidate");

    assert.equal(heldEntry(group.metrics).values.cost, null);
    assert.deepEqual([group.metrics.arms.candidate.cost.count, group.metrics.arms.baseline.cost.count], [1, 2]);
    assert.equal(group.metrics.differences.candidate.cost.pairs, 1);

    assert.equal(heldEntry(group.scores).values["score.candidate-tests"], null);
    assert.deepEqual(group.scores.arms.candidate["candidate-tests"], {
      count: 1,
      unavailable: 1,
      mean: 1,
      median: 1,
    });

    assert.equal(heldEntry(group.judged), undefined);
    assert.deepEqual([group.judged.arms.candidate.sound.yes, group.judged.arms.candidate.sound.notJudged], [1, 1]);
    assert.equal(group.judged.arms.candidate.sound.passAll, false);
  });
});

test("a decision counts nothing from a held run, whatever its measure", async () => {
  await withTempDirectory(async (root) => {
    const groups = await aggregateGroups(await storedTrials(root));
    const rule = (measure) => ({
      measure,
      arms: ARMS,
      direction: "higher",
      method: "sign-test",
      alpha: 0.05,
      min_cases: 1,
    });
    const candidate = (measure) => decide(rule(measure), groups).cases[0].arms.candidate;

    // One trial of two counts for the candidate on every measure; the held one adds no value.
    for (const measure of [
      { comparison: "tests" },
      { metric: "cost" },
      { score: "candidate-tests" },
      { judged: "sound" },
    ]) {
      assert.equal(candidate(measure).n, 1, JSON.stringify(measure));
    }
  });
});
