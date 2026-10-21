// The freeflow-vs-plain standing suite: its two declared decisions (success, then cost) and the shape every group
// must keep for them to mean anything: the same task and model in both arms, Freeflow the only difference.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { decide } from "../../../skills/evaluate-behavior/scripts/lib/decision.mjs";
import { loadDefinition } from "../../../skills/evaluate-behavior/scripts/lib/definitions.mjs";
import { aggregateMetrics } from "../../../skills/evaluate-behavior/scripts/lib/metrics.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const suiteDirectory = path.join(root, ".skill-eval/freeflow-vs-plain");
const load = (file) => loadDefinition(path.join(suiteDirectory, file), { root });

/** An aggregate group whose hidden-tests comparison passed this many of three trials per arm. */
function successCase(id, plainPasses, freeflowPasses) {
  const counts = (pass) => ({ pass, fail: 3 - pass, unavailable: 0 });
  return {
    id,
    trials: 3,
    comparisons: [
      {
        id: "hidden-tests",
        reference: "plain",
        arms: { plain: counts(plainPasses), freeflow: counts(freeflowPasses) },
        outcomes: {},
      },
    ],
  };
}

/** An aggregate group whose runs cost these amounts per trial, through the real metrics aggregator. */
function costCase(id, plainCosts, freeflowCosts) {
  const run = (arm, cost) => ({ variant: arm, state: "complete", metrics: { cost } });
  const trials = plainCosts.map((cost, index) => ({
    id: `t${index + 1}`,
    runs: { plain: run("plain", cost), freeflow: run("freeflow", freeflowCosts[index]) },
  }));
  return { id, trials: 3, metrics: aggregateMetrics({ arms: ["plain", "freeflow"], reference: "plain", trials }) };
}

test("the suite decides on hidden-test success and the cost suite on cost, plain Pi as the reference", async () => {
  const success = await load("suite.json");
  const cost = await load("suite-cost.json");
  const fixed = { method: "sign-test", alpha: 0.05, min_cases: 6, trials: { initial: 3, max: 3, step: 1 } };
  assert.deepEqual(success.decision, {
    measure: { comparison: "hidden-tests" },
    arms: ["plain", "freeflow"],
    direction: "higher",
    ...fixed,
  });
  assert.deepEqual(cost.decision, {
    measure: { metric: "cost" },
    arms: ["plain", "freeflow"],
    direction: "lower",
    ...fixed,
  });
  // The cost suite reruns nothing: it lists the same groups, so --reuse takes every run from the success suite.
  assert.deepEqual(
    cost.groups.map((group) => group.id),
    success.groups.map((group) => group.id),
  );
  assert.equal(success.groups.length, 10);
});

test("every group differs between its arms only in Freeflow, on one shared model, sealed in a pinned image", async () => {
  const { groups } = await load("suite.json");
  const shared = JSON.parse(await readFile(path.join(suiteDirectory, "configuration.json"), "utf8")).configuration;
  // Routing off by Hassan's direction; Tool Execution off because its bash_background would run on the host,
  // outside the sealed container, and its tools could not be declared without unsealing the arm.
  assert.deepEqual(shared.freeflow.repository, {
    cognitiveRouting: { enabled: false },
    toolExecution: { enabled: false },
  });
  for (const group of groups) {
    assert.deepEqual(Object.keys(group.variants), ["plain", "freeflow"], group.id);
    assert.equal(group.reference, "plain");
    assert.deepEqual(group.component, ["freeflow"]);
    assert.equal(group.variants.plain.freeflow ?? null, null, group.id);
    assert.deepEqual(group.variants.freeflow.freeflow.repository, shared.freeflow.repository);
    for (const arm of ["plain", "freeflow"]) {
      const variant = group.variants[arm];
      assert.deepEqual(variant.model, shared.model, `${group.id} ${arm} model comes from configuration.json`);
      assert.equal(group.configurations[arm].network, "none");
      assert.match(variant.shell.container.image, /^freeflow-vs-plain-[a-z0-9-]+@sha256:[0-9a-f]{64}$/);
      const hidden = group.expectations.find((expectation) => expectation.id === `${arm}-hidden-tests`);
      assert.equal(hidden.comparison, "hidden-tests", group.id);
      assert.ok(hidden.pass.tests.required.length >= 4, group.id);
    }
    assert.ok(group.reference_solution.files.endsWith(`/reference/${group.id}`));
  }
});

test("success: equal cases show no difference, and six cases lost or won decide either way", async () => {
  const { decision } = await load("suite.json");
  const ties = Array.from({ length: 10 }, (_, index) => successCase(`t${index}`, 3, 3));
  assert.equal(decide(decision, ties).verdict, "no-difference-shown");
  assert.equal(decide(decision, ties).ties, 10);

  const lost = [...Array.from({ length: 6 }, (_, index) => successCase(`l${index}`, 3, 1)), ...ties.slice(6)];
  assert.equal(decide(decision, lost).verdict, "worse");
  const won = [...Array.from({ length: 6 }, (_, index) => successCase(`w${index}`, 1, 3)), ...ties.slice(6)];
  assert.equal(decide(decision, won).verdict, "beats");
  // Five lost cases out of ten are below min_cases: the sign test cannot reach p < 0.05 with five (p = 0.0625).
  const five = [...Array.from({ length: 5 }, (_, index) => successCase(`f${index}`, 3, 0)), ...ties.slice(5)];
  assert.equal(decide(decision, five).verdict, "no-difference-shown");
});

test("cost: Freeflow costing more on nine of ten cases is worse; on six of ten it shows no difference", async () => {
  const { decision } = await load("suite-cost.json");
  const dearer = Array.from({ length: 9 }, (_, index) => costCase(`d${index}`, [0.2, 0.3, 0.25], [0.4, 0.5, 0.45]));
  const cheaper = costCase("c", [0.4, 0.4, 0.4], [0.3, 0.3, 0.3]);
  const nine = decide(decision, [...dearer, cheaper]);
  assert.equal(nine.verdict, "worse");
  assert.deepEqual([nine.better, nine.worse], [1, 9]);

  const six = [
    ...dearer.slice(0, 6),
    ...Array.from({ length: 4 }, (_, index) => costCase(`e${index}`, [0.4, 0.4, 0.4], [0.3, 0.3, 0.3])),
  ];
  const mixed = decide(decision, six);
  assert.equal(mixed.verdict, "no-difference-shown");
  assert.deepEqual([mixed.better, mixed.worse], [4, 6]);
});
