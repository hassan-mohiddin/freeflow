// The freeflow-vs-plain standing suite: its two declared decisions (success, then cost) and the shape every group
// must keep for them to mean anything: the same task and model in both arms, Freeflow the only difference.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { decide } from "../../../skills/evaluate-behavior/scripts/lib/decision.mjs";
import { loadDefinition } from "../../../skills/evaluate-behavior/scripts/lib/definitions.mjs";
import { aggregateMetrics } from "../../../skills/evaluate-behavior/scripts/lib/metrics.mjs";
import { removeStub, stubSuiteRun } from "./helpers/suite-stub.mjs";

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

test("the v0.9.0 suites run the same tasks with three arms, and decide each Freeflow arm against plain Pi", async () => {
  const fixed = { method: "sign-test", alpha: 0.05, min_cases: 6, trials: { initial: 3, max: 3, step: 1 } };
  const decisions = {
    "suite-v090.json": [{ comparison: "hidden-tests" }, ["plain", "freeflow"], "higher"],
    "suite-v090-cost.json": [{ metric: "cost" }, ["plain", "freeflow"], "lower"],
    "suite-v090-te.json": [{ comparison: "hidden-tests" }, ["plain", "freeflow-te"], "higher"],
    "suite-v090-te-cost.json": [{ metric: "cost" }, ["plain", "freeflow-te"], "lower"],
  };
  const original = await load("suite.json");
  for (const [file, [measure, arms, direction]] of Object.entries(decisions)) {
    const suite = await load(file);
    assert.deepEqual(suite.decision, { measure, arms, direction, ...fixed }, file);
    // The same groups in every v0.9.0 suite, so --reuse takes every run of the first from the other three.
    assert.deepEqual(
      suite.groups.map((group) => group.id),
      original.groups.map((group) => group.id),
    );
  }
  const shared = JSON.parse(await readFile(path.join(suiteDirectory, "configuration.json"), "utf8")).configuration;
  const v090 = JSON.parse(await readFile(path.join(suiteDirectory, "configuration-v090.json"), "utf8")).configuration;
  // The 21 Oct configuration but the build.
  assert.deepEqual(v090.freeflow.source, { kind: "git", ref: "51b9682fb44a9a68defd29e2ce3db64cae51581b" });
  assert.deepEqual(
    { ...v090, freeflow: { ...v090.freeflow, source: null } },
    {
      ...shared,
      freeflow: { ...shared.freeflow, source: null },
    },
  );
  const { groups } = await load("suite-v090.json");
  for (const group of groups) {
    const before = original.groups.find((entry) => entry.id === group.id);
    // The 21 Oct task: prompt, fixture, image, user, hidden tests and markers; the tools add Tool Execution's.
    assert.deepEqual(group.input, before.input);
    assert.equal(group.fixture, before.fixture);
    assert.deepEqual(group.participants, before.participants);
    assert.equal(group.variants.freeflow.shell.container.image, before.variants.freeflow.shell.container.image);
    assert.deepEqual(group.tools, [...before.tools, "bash_background", "monitor", "stop_background", "apply_patch"]);
    assert.deepEqual(Object.keys(group.variants), ["plain", "freeflow", "freeflow-te"], group.id);
    assert.equal(group.reference, "plain");
    assert.deepEqual(group.component, ["freeflow"]);
    assert.equal(group.variants.plain.freeflow ?? null, null);
    assert.deepEqual(group.variants.freeflow.freeflow.repository, v090.freeflow.repository);
    assert.deepEqual(group.variants["freeflow-te"].freeflow.repository, {
      cognitiveRouting: { enabled: false },
      toolExecution: { enabled: true, guidanceNotices: true },
    });
    for (const arm of ["plain", "freeflow", "freeflow-te"]) {
      const hidden = group.expectations.find((expectation) => expectation.id === `${arm}-hidden-tests`);
      assert.deepEqual(
        hidden.pass,
        before.expectations.find((expectation) => expectation.id === "plain-hidden-tests").pass,
      );
    }
  }
});

test("a stub dry run of a v0.9.0 group runs all three arms, plain Pi with Tool Execution's tools declared", async () => {
  const stub = await stubSuiteRun({
    suite: "freeflow-vs-plain",
    suiteFile: "suite-v090.json",
    group: "contacts-csv",
    rpcTools: [{ toolName: "bash", input: { command: "echo checked" } }],
    // The fake Docker runs graders on the host, where the task's Git history is missing.
    args: ["--skip-reference-check"],
  });
  try {
    assert.equal(stub.result.status, 0, stub.result.stderr + stub.result.stdout);
    // A decision suite runs as trials: three, each with every arm.
    const runs = path.dirname(stub.resultDirectory);
    const trials = readdirSync(runs).filter((entry) => existsSync(path.join(runs, entry, "groups/contacts-csv")));
    assert.equal(trials.length, 3);
    for (const trial of trials) {
      for (const arm of ["plain", "freeflow", "freeflow-te"]) {
        const file = path.join(runs, trial, "groups/contacts-csv", arm, "run.json");
        const run = JSON.parse(readFileSync(file, "utf8"));
        assert.equal(run.state, "complete", `${arm}: ${JSON.stringify(run.error ?? run.process, null, 2)}`);
      }
    }
  } finally {
    await removeStub(stub.root);
  }
});
