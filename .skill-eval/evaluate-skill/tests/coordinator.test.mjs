import test from "node:test";
import assert from "node:assert/strict";
import { coordinateEvaluation } from "../../../skills/evaluate-skill/scripts/lib/coordinator.mjs";
import { completeOperation, failedPublication, incompleteOperation, publishedPath } from "../../../skills/evaluate-skill/scripts/lib/outcome.mjs";

function execution(id, role, cost = 0.1) {
  return {
    id,
    kind: id.startsWith("semantic") ? "semantic" : "subject",
    role,
    process: { exit_code: 0, signal: null, timed_out: false, output_limit_exceeded: false },
    runtime_counters: { turns_started: 1, provider_requests: 1, tool_calls: 0, hard_turn_limit_reached: false },
    usage: { input: 4, output: 2, total_tokens: 6, cost: { total_usd: cost } },
  };
}

function plan({ kind = "single", maxUsd = null } = {}) {
  return {
    fingerprint: "plan-fingerprint",
    skill: "sample-skill",
    case_id: "SAMPLE-001",
    evaluation_kind: kind,
    model_driven: true,
    max_usd: maxUsd,
    evidence_support: { required: { "artifact-outcome": "supported" }, requested: {} },
    limitations: [],
    variants: kind === "single"
      ? [{ id: "candidate", role: "subject" }]
      : [{ id: "old", role: "reference" }, { id: "candidate", role: "candidate" }],
  };
}

function completeSubject(role, assertions, { semantic = [] , cost = 0.1 } = {}) {
  return completeOperation({
    execution: execution(`subject-${role}`, role, cost),
    value: { assertions, semantic_assertion_ids: semantic },
  });
}

function publishers(log, { diagnosticFailure = false } = {}) {
  return {
    publishResult: async (result) => { log.push(["result", result]); return publishedPath("runs/evaluations/one/result.json"); },
    publishDiagnostic: async (diagnostic) => {
      log.push(["diagnostic", diagnostic]);
      return diagnosticFailure ? failedPublication("diagnostic rename failed") : publishedPath("runs/diagnostics/one/diagnostic.json");
    },
  };
}

test("comparison executes serially and publishes one improved result", async () => {
  const calls = [];
  const publication = [];
  const outcome = await coordinateEvaluation(plan({ kind: "comparison" }), {
    runSubject: async (variant) => {
      calls.push(variant.role);
      return completeSubject(variant.role, [{ id: "quality", verdict: variant.role === "reference" ? "fail" : "pass" }]);
    },
    ...publishers(publication),
  });
  assert.deepEqual(calls, ["reference", "candidate"]);
  assert.equal(outcome.status, "complete");
  assert.equal(outcome.decision.comparison_verdict, "improved");
  assert.equal(outcome.result, "runs/evaluations/one/result.json");
  assert.equal(publication.filter(([kind]) => kind === "result").length, 1);
});

test("behavioral assertion failure remains a complete trustworthy result", async () => {
  const publication = [];
  const outcome = await coordinateEvaluation(plan(), {
    runSubject: async () => completeSubject("subject", [{ id: "quality", verdict: "fail" }]),
    ...publishers(publication),
  });
  assert.equal(outcome.status, "complete");
  assert.equal(outcome.decision.case_verdict, "fail");
  assert.equal(publication.some(([kind]) => kind === "diagnostic"), false);
});

test("semantic execution is recorded before final assertion assembly", async () => {
  const publication = [];
  const outcome = await coordinateEvaluation(plan(), {
    runSubject: async () => completeSubject("subject", [
      { id: "structure", verdict: "pass" },
      { id: "meaning", verdict: "inconclusive" },
    ], { semantic: ["meaning"] }),
    runSemantic: async (variant) => completeOperation({
      execution: execution(`semantic-${variant.role}`, variant.role, 0.2),
      value: { assertions: [{ id: "meaning", verdict: "pass" }], uncertainty: null },
    }),
    ...publishers(publication),
  });
  assert.equal(outcome.status, "complete");
  assert.equal(outcome.decision.case_verdict, "pass");
  assert.equal(outcome.usage.provider_requests, 2);
  assert.ok(Math.abs(outcome.usage.cost_usd - 0.3) < 1e-9);
});

test("incomplete subject publishes diagnostics with recorded usage and no result", async () => {
  const publication = [];
  const outcome = await coordinateEvaluation(plan(), {
    runSubject: async () => incompleteOperation({ execution: execution("subject-subject", "subject", 0.4), primary: "subject failed", secondary: "cleanup failed" }),
    ...publishers(publication),
  });
  assert.equal(outcome.status, "incomplete");
  assert.equal(outcome.usage.provider_requests, 1);
  assert.equal(outcome.usage.cost_usd, 0.4);
  assert.equal(outcome.failure.primary, "subject failed");
  assert.equal(outcome.failure.secondary, "cleanup failed");
  assert.equal(outcome.diagnostic, "runs/diagnostics/one/diagnostic.json");
  assert.equal(publication.some(([kind]) => kind === "result"), false);
});

test("diagnostic publication failure preserves truthful stdout and omits path", async () => {
  const publication = [];
  const outcome = await coordinateEvaluation(plan(), {
    runSubject: async () => incompleteOperation({ execution: execution("subject-subject", "subject", 0.4), primary: "subject failed" }),
    ...publishers(publication, { diagnosticFailure: true }),
  });
  assert.equal(outcome.status, "incomplete");
  assert.equal("diagnostic" in outcome, false);
  assert.equal(outcome.failure.primary, "subject failed");
  assert.equal(outcome.diagnostic_publication.failure.primary, "diagnostic rename failed");
  assert.equal(outcome.usage.cost_usd, 0.4);
});

test("soft ceiling prevents a later process at the exact observed boundary", async () => {
  const calls = [];
  const publication = [];
  const outcome = await coordinateEvaluation(plan({ kind: "comparison", maxUsd: 1 }), {
    runSubject: async (variant) => { calls.push(variant.role); return completeSubject(variant.role, [{ id: "quality", verdict: "pass" }], { cost: 1 }); },
    ...publishers(publication),
  });
  assert.deepEqual(calls, ["reference"]);
  assert.equal(outcome.status, "incomplete");
  assert.match(outcome.failure.primary, /spend ceiling/i);
  assert.equal(outcome.usage.cost_usd, 1);
});

test("final required process may cross the soft ceiling and still complete", async () => {
  const publication = [];
  const outcome = await coordinateEvaluation(plan({ maxUsd: 1 }), {
    runSubject: async () => completeSubject("subject", [{ id: "quality", verdict: "pass" }], { cost: 2 }),
    ...publishers(publication),
  });
  assert.equal(outcome.status, "complete");
  assert.equal(outcome.usage.cost_usd, 2);
});
