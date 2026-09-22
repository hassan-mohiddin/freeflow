import assert from "node:assert/strict";
import test from "node:test";

import {
  runLiveEvaluation,
  runOfflineEvaluation,
  validateLiveEvaluationRequest,
} from "../../dist/efficiency/evaluation.js";

const metrics = (overrides = {}) => ({
  requests: 1,
  providerInputBytes: 1000,
  toolSchemaBytes: 400,
  toolArgumentBytes: 100,
  resultBytes: 800,
  programSourceBytes: 0,
  emittedBytes: 0,
  recoveryBytes: 0,
  failures: 0,
  ...overrides,
});

test("offline evaluation reports fixed byte/request deltas without cache, billing, or quality claims", () => {
  const report = runOfflineEvaluation([
    {
      id: "captured-reduction",
      accepted: true,
      baseline: metrics({ requests: 3, providerInputBytes: 5000, resultBytes: 4000 }),
      candidate: metrics({
        requests: 2,
        providerInputBytes: 2200,
        resultBytes: 900,
        programSourceBytes: 300,
        emittedBytes: 120,
      }),
    },
    {
      id: "recovery-overhead",
      accepted: false,
      baseline: metrics({ requests: 1, recoveryBytes: 0 }),
      candidate: metrics({ requests: 2, recoveryBytes: 600, failures: 1 }),
    },
  ]);
  assert.equal(report.mode, "offline");
  assert.equal(report.acceptedScenarios, 1);
  assert.equal(report.rejectedScenarios, 1);
  assert.equal(report.totals.requests.delta, 0);
  assert.equal(report.scenarios[0].delta.providerInputBytes, -2800);
  assert.equal(report.claims.providerCacheHits, "not observed");
  assert.equal(report.claims.billing, "not observed");
  assert.equal(report.claims.modelQuality, "not observed");
});

test("offline comparison uses a competent batched/capped native baseline and explicit acceptance", () => {
  const bytes = (value) => Buffer.byteLength(JSON.stringify(value), "utf8");
  const nativeTools = [
    {
      name: "bash",
      description: "Execute one bounded shell command",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
    },
  ];
  const stableTools = [
    { name: "freeflow_tools", description: "Stable operation facade" },
    { name: "freeflow_run", description: "Bounded program facade" },
    { name: "freeflow_result", description: "Exact result reader" },
  ];
  const nativeArguments = { command: "rg -n 'FAIL' logs | head -100" };
  const candidateArguments = {
    code: `const rows = (await results.read(input.id, { maxBytes: 32768 })).text.split("\\n").filter(x => x.includes("FAIL")); emit(rows.slice(0, 100));`,
    description: "select bounded failure rows",
    operations: [],
    captures: ["result:fixture"],
    input: { id: "result:fixture" },
  };
  const expected = ["FAIL first", "FAIL second"];
  const baselineObserved = ["FAIL first", "FAIL second"];
  const candidateObserved = ["FAIL first", "FAIL second"];
  const report = runOfflineEvaluation([
    {
      id: "bounded-failure-selection",
      accepted:
        JSON.stringify(baselineObserved) === JSON.stringify(expected) &&
        JSON.stringify(candidateObserved) === JSON.stringify(expected),
      baseline: metrics({
        requests: 1,
        providerInputBytes: bytes({ tools: nativeTools, arguments: nativeArguments }),
        toolSchemaBytes: bytes(nativeTools),
        toolArgumentBytes: bytes(nativeArguments),
        resultBytes: bytes(baselineObserved),
      }),
      candidate: metrics({
        requests: 1,
        providerInputBytes: bytes({ tools: stableTools, arguments: candidateArguments }),
        toolSchemaBytes: bytes(stableTools),
        toolArgumentBytes: bytes(candidateArguments),
        resultBytes: bytes(candidateObserved),
        programSourceBytes: Buffer.byteLength(candidateArguments.code),
        emittedBytes: bytes(candidateObserved),
        recoveryBytes: 32768,
      }),
    },
  ]);
  assert.equal(report.acceptedScenarios, 1);
  assert.equal(report.totals.requests.delta, 0);
  assert.equal(report.claims.modelQuality, "not observed");
});

test("live runner requires explicit tasks, acceptance, credential source, tolerance and total budget", async () => {
  for (const invalid of [
    {},
    { approved: false },
    {
      approved: true,
      tasks: [{ id: "task", acceptance: "tests pass" }],
      provider: "fixture",
      model: "fixture-model",
      credentialSource: "raw-key",
      qualityTolerance: 0,
      budget: { currency: "USD", maximumCost: 1, maximumRuns: 1 },
    },
    {
      approved: true,
      tasks: [{ id: "task", acceptance: "tests pass" }],
      provider: "fixture",
      model: "fixture-model",
      credentialSource: "environment",
      qualityTolerance: 0,
      budget: { currency: "USD", maximumCost: 1, maximumRuns: 1 },
      apiKey: "must-not-be-accepted",
    },
  ])
    assert.throws(() => validateLiveEvaluationRequest(invalid), /live_evaluation_not_authorized/);

  const request = {
    approved: true,
    tasks: [
      { id: "one", acceptance: "fixture accepted" },
      { id: "two", acceptance: "fixture accepted" },
    ],
    provider: "fixture",
    model: "fixture-model",
    credentialSource: "environment",
    qualityTolerance: 0.05,
    budget: { currency: "USD", maximumCost: 0.5, maximumRuns: 1 },
  };
  let calls = 0;
  const report = await runLiveEvaluation(request, async (task, _request, remaining) => {
    calls += 1;
    assert.deepEqual(remaining, { cost: 0.5, runs: 1 });
    return { accepted: task.id === "one", cost: 0.25, usage: { input: 10, output: 5 }, failures: [] };
  });
  assert.equal(calls, 1);
  assert.equal(report.attemptedTasks, 1);
  assert.equal(report.acceptedTasks, 1);
  assert.equal(report.observedCost, 0.25);
  assert.equal(report.qualityTolerance, 0.05);
  assert.deepEqual(report.budget, request.budget);
  assert.equal(report.costCoverage, "complete-at-boundary");
  assert.equal(report.stoppedByBudget, true);
});
