import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { decide, signTest, validateDecision } from "../../../skills/evaluate-behavior/scripts/lib/decision.mjs";
import { loadDefinition } from "../../../skills/evaluate-behavior/scripts/lib/definitions.mjs";
import { registerAggregator } from "../../../skills/evaluate-behavior/scripts/lib/hooks.mjs";
import { aggregateGroups, rebuildAggregate, runTrials } from "../../../skills/evaluate-behavior/scripts/lib/trials.mjs";
import { renderResult } from "../../../skills/evaluate-behavior/scripts/lib/view.mjs";
import { toV2 } from "./helpers/to-v2.mjs";

const entrypoint = fileURLToPath(new URL("../../../skills/evaluate-behavior/scripts/skill-eval.mjs", import.meta.url));

async function withTempDirectory(run) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "skill-eval-decision-test-")));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(toV2(value), null, 2)}\n`);
  return file;
}

const RULE = {
  measure: { comparison: "target-read" },
  arms: ["baseline", "candidate"],
  direction: "higher",
  method: "sign-test",
  alpha: 0.05,
  min_cases: 10,
};

function failWith(message) {
  throw new Error(message);
}

/** An aggregate group whose classic comparison has these per-arm pass/fail/unavailable counts. */
function caseOf(id, baseline, candidate, trials = 3) {
  const counts = ([pass, fail, unavailable = 0]) => ({ pass, fail, unavailable });
  return {
    id,
    trials,
    comparisons: [{ id: "target-read", kind: "skill-read", baseline: counts(baseline), candidate: counts(candidate) }],
  };
}

function cases(count, baseline, candidate, prefix) {
  return Array.from({ length: count }, (_, index) => caseOf(`${prefix}-${index + 1}`, baseline, candidate));
}

test("validateDecision applies defaults and refuses unknown or malformed fields", () => {
  assert.deepEqual(
    validateDecision(
      { measure: { metric: "durationMs" }, arms: ["baseline", "candidate"], direction: "lower" },
      failWith,
    ),
    {
      measure: { metric: "durationMs" },
      arms: ["baseline", "candidate"],
      direction: "lower",
      method: "sign-test",
      alpha: 0.05,
      min_cases: 10,
    },
  );
  const base = { measure: { judged: "found-defect" }, arms: ["baseline", "candidate"], direction: "higher" };
  const refusals = [
    [{ ...base, extra: 1 }, /unsupported field extra/],
    [{ ...base, measure: { check: "x" } }, /exactly one of comparison, metric or judged/],
    [{ ...base, measure: { metric: "a", judged: "b" } }, /exactly one/],
    [{ ...base, arms: ["baseline"] }, /two arm names/],
    [{ ...base, arms: ["baseline", "baseline"] }, /two different arms/],
    [{ ...base, direction: "up" }, /higher or lower/],
    [{ ...base, method: "t-test" }, /sign-test/],
    [{ ...base, alpha: 1 }, /between 0 and 1/],
    [{ ...base, min_cases: 0 }, /positive integer/],
    [{ ...base, trials: { initial: 3, max: 2, step: 1 } }, /at least trials.initial/],
    [{ ...base, trials: { initial: 3, max: 9 } }, /trials.step must be a positive integer/],
    [{ ...base, trials: { initial: 3, max: 9, step: 3, extra: 1 } }, /unsupported field extra/],
    [{ arms: ["baseline", "candidate"], direction: "higher" }, /missing measure/],
  ];
  for (const [value, expected] of refusals) assert.throws(() => validateDecision(value, failWith), expected);
});

test("a suite loads its decision with defaults; a group cannot declare one", async () => {
  await withTempDirectory(async (root) => {
    await writeSkill(root);
    await writeJson(path.join(root, "groups/one.json"), group("one"));
    const suite = await writeJson(path.join(root, "suite.json"), {
      schema_version: 2,
      kind: "suite",
      id: "decided",
      groups: ["groups/one.json"],
      decision: { measure: { comparison: "target-read" }, arms: ["baseline", "candidate"], direction: "higher" },
    });
    const loaded = await loadDefinition(suite, { root });
    assert.deepEqual(loaded.decision, RULE);

    await writeJson(path.join(root, "bad.json"), {
      schema_version: 2,
      kind: "suite",
      id: "bad",
      groups: ["groups/one.json"],
      decision: { ...RULE, alpha: 2 },
    });
    await assert.rejects(loadDefinition(path.join(root, "bad.json"), { root }), /alpha must be between 0 and 1/);
    await writeJson(path.join(root, "direct.json"), { ...group("direct"), decision: RULE });
    await assert.rejects(loadDefinition(path.join(root, "direct.json"), { root }), /unsupported field decision/);
  });
});

test("the sign test is exact and two-sided", () => {
  assert.equal(signTest(0, 0), 1);
  assert.equal(signTest(5, 0), 0.0625);
  assert.equal(signTest(6, 0), 0.03125);
  assert.equal(signTest(0, 6), 0.03125);
  assert.equal(signTest(10, 0), 2 / 1024);
  assert.equal(signTest(3, 3), 1);
  // The measurement reference's example: 19 better and 5 worse gives p of about 0.007.
  assert.ok(Math.abs(signTest(19, 5) - 0.006610751152038574) < 1e-12);
});

test("beats: enough decided cases in the declared direction with p below alpha", () => {
  const decision = decide(RULE, [...cases(9, [0, 3], [3, 0], "up"), ...cases(1, [1, 2], [0, 3], "down")]);
  assert.equal(decision.verdict, "beats");
  assert.deepEqual(
    { better: decision.better, worse: decision.worse, ties: decision.ties, decided: decision.decided },
    { better: 9, worse: 1, ties: 0, decided: 10 },
  );
  assert.equal(decision.p, (2 * 11) / 1024);
  assert.match(decision.ruleSha256, /^[0-9a-f]{64}$/);
  // The hash ignores key order, so the same rule always has the same identity.
  const reordered = Object.fromEntries(Object.entries(RULE).reverse());
  assert.equal(decide(reordered, []).ruleSha256, decision.ruleSha256);
  assert.deepEqual(decision.cases[0], {
    id: "up-1",
    trials: 3,
    arms: { baseline: { n: 3, mean: 0, excluded: 0 }, candidate: { n: 3, mean: 1, excluded: 0 } },
    sign: "better",
  });
});

test("worse: the same evidence against the declared direction", () => {
  const decision = decide(RULE, cases(10, [3, 0], [1, 2], "down"));
  assert.equal(decision.verdict, "worse");
  assert.equal(decision.worse, 10);
  // Declaring lower as better turns the same split into a win.
  assert.equal(decide({ ...RULE, direction: "lower" }, cases(10, [3, 0], [1, 2], "down")).verdict, "beats");
});

test("too few cases: a significant split below min_cases shows no difference", () => {
  const decision = decide({ ...RULE, min_cases: 10 }, cases(6, [0, 3], [3, 0], "up"));
  assert.equal(decision.p, 0.03125);
  assert.equal(decision.decided, 6);
  assert.equal(decision.verdict, "no-difference-shown");
  assert.equal(decide({ ...RULE, min_cases: 6 }, cases(6, [0, 3], [3, 0], "up")).verdict, "beats");
});

test("ties and excluded cases are left out of the test and counted", () => {
  const groups = [
    ...cases(10, [0, 3], [3, 0], "up"),
    ...cases(3, [2, 1], [2, 1], "tie"),
    // Unavailable values are excluded from a case's rate, and counted.
    caseOf("partly", [0, 2, 1], [2, 0, 1]),
    // An arm with no usable value excludes the case.
    caseOf("unavailable", [0, 0, 3], [3, 0, 0]),
    // A case without the measured comparison is excluded too.
    { id: "absent", trials: 3, comparisons: [] },
  ];
  const decision = decide(RULE, groups);
  assert.deepEqual(
    {
      better: decision.better,
      worse: decision.worse,
      ties: decision.ties,
      decided: decision.decided,
      excluded: decision.excluded,
      excludedValues: decision.excludedValues,
    },
    { better: 11, worse: 0, ties: 3, decided: 11, excluded: 2, excludedValues: 5 },
  );
  assert.equal(decision.p, 2 / 2048);
  assert.equal(decision.verdict, "beats");
  assert.deepEqual(decision.cases.at(-1), {
    id: "absent",
    trials: 3,
    sign: "excluded",
    reason: "no comparison target-read",
  });
});

test("an arm-keyed comparison is read by arm name", () => {
  const armCase = (id) => ({
    id,
    trials: 2,
    comparisons: [
      {
        id: "target-read",
        reference: "same",
        arms: { same: { pass: 0, fail: 2, unavailable: 0 }, changed: { pass: 2, fail: 0, unavailable: 0 } },
        outcomes: {},
      },
    ],
  });
  const decision = decide(
    { ...RULE, arms: ["same", "changed"], min_cases: 6 },
    Array.from({ length: 6 }, (_, i) => armCase(`c${i}`)),
  );
  assert.equal(decision.verdict, "beats");
  assert.equal(decision.reference, "same");
  assert.equal(decision.arm, "changed");
});

/** Trial result directories whose runs carry `values` for a dummy section aggregator to report. */
async function sectionTrials(root, valuesFor) {
  const trials = [];
  for (let trial = 1; trial <= 2; trial += 1) {
    const directory = path.join(root, `trial-${trial}`);
    const groups = [];
    for (let index = 1; index <= 6; index += 1) {
      const id = `case-${index}`;
      const groupDirectory = path.join(directory, "groups", id);
      await writeJson(path.join(groupDirectory, "definition.json"), { id, expectations: [] });
      await writeJson(path.join(groupDirectory, "deterministic-grade.json"), {
        state: "complete",
        checks: [],
        comparisons: [],
      });
      for (const arm of ["baseline", "candidate"]) {
        await writeJson(path.join(groupDirectory, arm, "run.json"), {
          variant: arm,
          values: valuesFor(index, arm, trial),
        });
      }
      groups.push({
        id,
        state: "complete",
        variants: { baseline: "complete", candidate: "complete" },
        artifacts: { grade: "deterministic-grade.json" },
      });
    }
    trials.push({ id: `t${trial}`, path: directory, state: "complete", summary: { groups } });
  }
  return trials;
}

/** A stand-in for the metrics and judged aggregators: `perTrial` per the shared measures contract. */
function sectionAggregator({ trials, arms }) {
  return {
    perTrial: trials.flatMap((trial) => arms.map((arm) => ({ trial: trial.id, arm, values: trial.runs[arm].values }))),
  };
}

test("metric and judged measures are read from their aggregator sections' perTrial values", async () => {
  await withTempDirectory(async (root) => {
    const trials = await sectionTrials(root, (index, arm, trial) => ({
      // The candidate is faster in every case; a null duration is excluded and counted.
      durationMs: arm === "candidate" ? (index === 1 && trial === 2 ? null : 100) : 200 + index,
      // Judged yes/no: the candidate finds the defect in cases 1-5; case 6 ties.
      "found-defect": arm === "candidate" ? index <= 5 : index === 6,
    }));
    const unregister = [
      registerAggregator("metrics", sectionAggregator),
      registerAggregator("judged", sectionAggregator),
    ];
    let groups;
    try {
      groups = await aggregateGroups(trials);
    } finally {
      for (const remove of unregister) remove();
    }

    const faster = decide({ ...RULE, measure: { metric: "durationMs" }, direction: "lower", min_cases: 6 }, groups);
    assert.equal(faster.verdict, "beats");
    assert.equal(faster.better, 6);
    assert.equal(faster.excludedValues, 1);
    assert.deepEqual(faster.cases[0].arms.candidate, { n: 1, mean: 100, excluded: 1 });

    const found = decide({ ...RULE, measure: { judged: "found-defect" }, min_cases: 5 }, groups);
    // Case 6: the baseline found it and the candidate did not, so 5 to 1 is not enough.
    assert.deepEqual([found.better, found.worse, found.ties, found.verdict], [5, 1, 0, "no-difference-shown"]);
    assert.equal(found.cases[5].sign, "worse");
    assert.equal(found.p, 0.21875);

    // Without the section the measure is absent, and every case is excluded.
    const plain = await aggregateGroups(trials);
    const absent = decide({ ...RULE, measure: { metric: "durationMs" } }, plain);
    assert.equal(absent.excluded, 6);
    assert.equal(absent.cases[0].reason, "no metrics section");
  });
});

// ----- runTrials with a scripted evaluator -----

async function writeSkill(root) {
  const directory = path.join(root, "skills/release-route");
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "SKILL.md"),
    "---\nname: release-route\ndescription: Use when delivering a change.\n---\n\n# Release Route\n",
  );
}

function group(id) {
  return {
    schema_version: 1,
    kind: "group",
    id,
    type: "description",
    input: { prompt: "How should I ship this change?" },
    fixture: null,
    tools: ["read"],
    variants: {
      baseline: { source: { kind: "working-tree" }, skills: [], target: null, context: [] },
      candidate: { source: { kind: "working-tree" }, skills: ["skills/release-route"], target: 0, context: [] },
    },
    expectations: [
      {
        id: "baseline-read",
        kind: "skill-read",
        variant: "baseline",
        expect: "by-turn",
        turn: 1,
        comparison: "target-read",
      },
      {
        id: "candidate-read",
        kind: "skill-read",
        variant: "candidate",
        expect: "by-turn",
        turn: 1,
        comparison: "target-read",
      },
    ],
    review_questions: [],
    runtime: { host: "pi", session: false, extensions: [], environment: { literal: {}, inherit: [] } },
  };
}

async function writeSuite(root, ids, decision) {
  await writeSkill(root);
  for (const id of ids) await writeJson(path.join(root, "groups", `${id}.json`), group(id));
  return writeJson(path.join(root, "suite.json"), {
    schema_version: 2,
    kind: "suite",
    id: "adaptive",
    groups: ids.map((id) => `groups/${id}.json`),
    decision,
  });
}

/**
 * An evaluator that writes ordinary-looking results without starting a subject: `script(id, n)` gives the
 * classic comparison's [baseline, candidate] states for a group's n-th trial (1-based).
 */
function scriptedEvaluator(root, ids, script) {
  const seen = new Map();
  const calls = [];
  let counter = 0;
  const evaluate = async (_definition, selectors) => {
    calls.push(selectors.group ?? null);
    counter += 1;
    const id = `trial-${String(counter).padStart(3, "0")}`;
    const directory = path.join(root, ".skill-eval", "runs", id);
    const groups = [];
    for (const groupId of selectors.group === null || selectors.group === undefined ? ids : [selectors.group]) {
      const n = (seen.get(groupId) ?? 0) + 1;
      seen.set(groupId, n);
      const [baseline, candidate] = script(groupId, n);
      const groupDirectory = path.join(directory, "groups", groupId);
      await writeJson(path.join(groupDirectory, "definition.json"), { id: groupId, expectations: [] });
      await writeJson(path.join(groupDirectory, "deterministic-grade.json"), {
        state: "complete",
        checks: [],
        comparisons: [
          {
            id: "target-read",
            kind: "skill-read",
            baseline: { check: "baseline-read", state: baseline },
            candidate: { check: "candidate-read", state: candidate },
            transition: `${baseline}-to-${candidate}`,
          },
        ],
        errors: [],
      });
      groups.push({
        id: groupId,
        state: "complete",
        variants: { baseline: "complete", candidate: "complete" },
        artifacts: { grade: "deterministic-grade.json" },
      });
    }
    const summary = { schema_version: 1, id, state: "complete", definitionKind: "suite", dryRun: false, groups };
    await writeJson(path.join(directory, "summary.json"), summary);
    return { id, path: directory, state: "complete", summary };
  };
  return { evaluate, calls };
}

const SCHEDULE_RULE = {
  measure: { comparison: "target-read" },
  arms: ["baseline", "candidate"],
  direction: "higher",
  min_cases: 1,
  trials: { initial: 2, max: 6, step: 2 },
};

test("adaptive trials extend only undecided cases, by the declared step, and stop at max", async () => {
  await withTempDirectory(async (root) => {
    const ids = ["clear", "tied", "settles"];
    const suite = await writeSuite(root, ids, SCHEDULE_RULE);
    const { evaluate, calls } = scriptedEvaluator(root, ids, (id, n) => {
      if (id === "clear") return ["fail", "pass"];
      if (id === "tied") return ["pass", "pass"];
      // Tied over the first two trials, then the candidate pulls ahead.
      return n <= 2 ? ["pass", "pass"] : ["fail", "pass"];
    });

    const { aggregate } = await runTrials(suite, { group: null, variant: null }, { root, maxCost: null, evaluate });

    // Two full invocations, then round 1 adds two trials to each undecided case, then round 2 only to "tied".
    assert.deepEqual(calls, [null, null, "tied", "settles", "tied", "settles", "tied", "tied"]);
    assert.deepEqual(aggregate.schedule, {
      initial: 2,
      max: 6,
      step: 2,
      rounds: [
        { round: 1, groups: ["tied", "settles"], trials: 4 },
        { round: 2, groups: ["tied"], trials: 2 },
      ],
    });
    assert.equal(aggregate.requestedTrials, 8);
    assert.equal(aggregate.state, "complete");
    assert.deepEqual(aggregate.trials[2], { id: "trial-003", state: "complete", round: 1, group: "tied" });
    assert.deepEqual(Object.fromEntries(aggregate.groups.map((entry) => [entry.id, entry.trials])), {
      clear: 2,
      tied: 6,
      settles: 4,
    });
    assert.deepEqual(
      [aggregate.decision.better, aggregate.decision.ties, aggregate.decision.verdict],
      [2, 1, "no-difference-shown"],
    );
    assert.deepEqual(aggregate.claim, {
      class: "no-difference-shown",
      k: 2,
      ruleSha256: aggregate.decision.ruleSha256,
      better: 2,
      worse: 0,
      ties: 1,
      decided: 2,
      excluded: 0,
      p: 0.5,
    });
  });
});

test("an adaptive schedule stops early when every case is decided after the initial trials", async () => {
  await withTempDirectory(async (root) => {
    const ids = ["one", "two"];
    const suite = await writeSuite(root, ids, SCHEDULE_RULE);
    const { evaluate, calls } = scriptedEvaluator(root, ids, () => ["fail", "pass"]);
    const { aggregate } = await runTrials(suite, { group: null, variant: null }, { root, maxCost: null, evaluate });
    assert.deepEqual(calls, [null, null]);
    assert.deepEqual(aggregate.schedule.rounds, []);
    assert.equal(aggregate.requestedTrials, 2);
  });
});

test("a decision run refuses a different trial count, a single arm, or a group without a decision arm", async () => {
  await withTempDirectory(async (root) => {
    const suite = await writeSuite(root, ["one"], SCHEDULE_RULE);
    const { evaluate, calls } = scriptedEvaluator(root, ["one"], () => ["fail", "pass"]);
    const options = { root, maxCost: null, evaluate };
    await assert.rejects(
      runTrials(suite, { group: null, variant: null }, { ...options, trials: 3 }),
      /schedules 2 initial trials/,
    );
    await assert.rejects(
      runTrials(suite, { group: null, variant: "candidate" }, options),
      /--variant would run only one/,
    );
    const other = await writeSuite(root, ["one"], { ...SCHEDULE_RULE, arms: ["baseline", "other"] });
    await assert.rejects(
      runTrials(other, { group: null, variant: null }, options),
      /decision arm other is not an arm of group one/,
    );
    assert.deepEqual(calls, []);
  });
});

test("rebuildAggregate rereads every trial and reproduces aggregate.json exactly", async () => {
  await withTempDirectory(async (root) => {
    const ids = ["clear", "tied"];
    const suite = await writeSuite(root, ids, SCHEDULE_RULE);
    const { evaluate } = scriptedEvaluator(root, ids, (id) => (id === "clear" ? ["fail", "pass"] : ["pass", "pass"]));
    const { path: directory } = await runTrials(
      suite,
      { group: null, variant: null },
      { root, maxCost: null, evaluate },
    );
    const file = path.join(directory, "aggregate.json");
    const before = await readFile(file, "utf8");

    await rebuildAggregate(directory, { root });
    assert.equal(await readFile(file, "utf8"), before);

    // A section registered after the run (as judging adds one) appears on rebuild, and the claim is recomputed.
    // Named apart from the real `judged` and `metrics` aggregators, which register on import.
    const remove = registerAggregator("lateSection", ({ trials }) => ({ perTrial: [], trials: trials.length }));
    try {
      const rebuilt = await rebuildAggregate(file, { root });
      assert.deepEqual(
        rebuilt.groups.map((entry) => entry.lateSection),
        [
          { perTrial: [], trials: 2 },
          { perTrial: [], trials: 6 },
        ],
      );
    } finally {
      remove();
    }
    const changed = JSON.parse(await readFile(file, "utf8"));
    assert.equal(changed.id, JSON.parse(before).id);
    assert.equal(changed.completedAt, JSON.parse(before).completedAt);

    // A trial that can no longer be read is refused, never silently dropped.
    await rm(path.join(root, ".skill-eval/runs", JSON.parse(before).trials[0].id, "summary.json"));
    await assert.rejects(rebuildAggregate(directory, { root }), /has no readable summary.json/);
  });
});

test("the aggregate view shows the rule, split, p, adaptive rounds and verdict", async () => {
  await withTempDirectory(async (root) => {
    const ids = ["clear", "tied"];
    const suite = await writeSuite(root, ids, SCHEDULE_RULE);
    const { evaluate } = scriptedEvaluator(root, ids, (id) => (id === "clear" ? ["fail", "pass"] : ["pass", "pass"]));
    const { id, aggregate } = await runTrials(suite, { group: null, variant: null }, { root, maxCost: null, evaluate });
    const text = await renderResult(id, { group: null, variant: null }, { root });
    const lines = text.split("\n");
    assert.ok(
      lines.includes(
        "Claim: no difference shown; candidate against baseline on comparison target-read, higher is better",
      ),
      text,
    );
    assert.ok(
      lines.includes(
        `decision\trule=sha256:${aggregate.decision.ruleSha256}\tmethod=sign-test\talpha=0.05\tmin-cases=1\ttrials=2..6 step 2`,
      ),
      text,
    );
    assert.ok(
      lines.includes(
        "decision\tverdict=no difference shown\tbetter=1\tworse=0\tties=1\tdecided=1\texcluded=0\texcluded-values=0\tp=1",
      ),
      text,
    );
    assert.ok(lines.includes("adaptive\tround=1\ttrials=2\tcases=tied"), text);
    assert.ok(lines.includes("case\ttied\tequal\ttrials=6\tbaseline=1 (n=6)\tcandidate=1 (n=6)"), text);
  });
});

test("an aggregate without a decision keeps the rate claim and rebuilds unchanged", async () => {
  await withTempDirectory(async (root) => {
    const suite = await writeSuite(root, ["one"], undefined);
    const { evaluate } = scriptedEvaluator(root, ["one"], () => ["fail", "pass"]);
    const { path: directory, aggregate } = await runTrials(
      suite,
      { group: null, variant: null },
      { root, trials: 2, maxCost: null, evaluate },
    );
    assert.equal(Object.hasOwn(aggregate, "decision"), false);
    assert.equal(Object.hasOwn(aggregate, "schedule"), false);
    assert.deepEqual(aggregate.claim, {
      class: "rate-on-suite",
      k: 2,
      beats: "not supported: the suite declares no decision rule",
    });
    const before = await readFile(path.join(directory, "aggregate.json"), "utf8");
    await rebuildAggregate(directory, { root });
    assert.equal(await readFile(path.join(directory, "aggregate.json"), "utf8"), before);
  });
});

/** A subject that reads its first skill's SKILL.md when it is given one, and logs each start. */
async function installFakePi(root) {
  const bin = path.join(root, "bin");
  await mkdir(bin, { recursive: true });
  const executable = path.join(bin, "pi");
  await writeFile(
    executable,
    `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
const skills = args.flatMap((arg, index) => arg === "--skill" ? [args[index + 1]] : []);
appendFileSync(path.join(${JSON.stringify(root)}, "fake.jsonl"), "start\\n");
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
emit({ type: "agent_start" });
if (skills[0]) {
  emit({ type: "tool_execution_start", toolCallId: "r", toolName: "read", args: { path: skills[0] + "/SKILL.md" } });
  emit({ type: "tool_execution_end", toolCallId: "r", toolName: "read", isError: false });
}
const message = {
  role: "assistant",
  content: [{ type: "text", text: "done" }],
  provider: "fake",
  model: "fake-model",
  usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } },
  stopReason: "stop",
};
emit({ type: "message_end", message });
emit({ type: "agent_settled" });
`,
  );
  await chmod(executable, 0o755);
  return bin;
}

test("the CLI runs a suite's decision through the real runner with the fake provider", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installFakePi(root);
    const suite = await writeSuite(root, ["one", "two"], { ...SCHEDULE_RULE, trials: { initial: 2, max: 4, step: 2 } });
    const result = spawnSync(process.execPath, [entrypoint, "run", suite, "--trials", "2", "--dry-run", "--yes"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        SKILL_EVAL_CREDENTIALS_DIR: path.join(root, "no-credentials"),
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    // The candidate reads its skill and the baseline has none, so both cases are decided after two trials.
    const starts = (await readFile(path.join(root, "fake.jsonl"), "utf8")).split("\n").filter(Boolean);
    assert.equal(starts.length, 8);
    const aggregateId = result.stdout.match(/^Aggregate: (.+)$/m)?.[1];
    const aggregate = JSON.parse(
      await readFile(path.join(root, ".skill-eval/runs", aggregateId, "aggregate.json"), "utf8"),
    );
    assert.deepEqual(aggregate.schedule.rounds, []);
    assert.deepEqual([aggregate.decision.better, aggregate.decision.verdict], [2, "no-difference-shown"]);
    // A dry run supports no claim, whatever the split.
    assert.equal(aggregate.claim.class, "none");
    assert.equal(aggregate.claim.reason, "dry run");
  });
});
