import test from "node:test";
import assert from "node:assert/strict";
import {
  completeOperation,
  createEvaluationLedger,
  failedPublication,
  incompleteOperation,
  publishedPath,
} from "../../../skills/evaluate-skill/scripts/lib/outcome.mjs";

function execution(id, { cost = 0.1, usage = true } = {}) {
  return {
    id,
    kind: id.startsWith("semantic") ? "semantic" : "subject",
    role: "subject",
    process: { exit_code: 0, signal: null, timed_out: false, output_limit_exceeded: false },
    runtime_counters: { turns_started: 1, provider_requests: 1, tool_calls: 2, hard_turn_limit_reached: false },
    usage: usage ? {
      input: 10,
      output: 5,
      cache_read: 2,
      cache_write: 1,
      total_tokens: 18,
      cost: cost === null ? null : { total_usd: cost },
    } : null,
  };
}

test("ledger records settled executions once in append order", () => {
  const ledger = createEvaluationLedger({ modelDriven: true });
  ledger.record(execution("subject-1"));
  ledger.record(execution("semantic-1"));
  assert.deepEqual(ledger.entries().map((item) => item.id), ["subject-1", "semantic-1"]);
  assert.throws(() => ledger.record(execution("subject-1")), /already recorded/i);
});

test("ledger snapshots records so later mutation cannot rewrite evidence", () => {
  const ledger = createEvaluationLedger({ modelDriven: true });
  const settled = execution("subject-1");
  ledger.record(settled);
  settled.runtime_counters.provider_requests = 99;
  settled.usage.cost.total_usd = 99;
  const [recorded] = ledger.entries();
  assert.equal(recorded.runtime_counters.provider_requests, 1);
  assert.equal(recorded.usage.cost.total_usd, 0.1);
  assert.throws(() => { recorded.runtime_counters.provider_requests = 5; }, TypeError);
});

test("public usage derives only from recorded executions", () => {
  const ledger = createEvaluationLedger({ modelDriven: true });
  ledger.record(execution("subject-1", { cost: 0.1 }));
  ledger.record(execution("semantic-1", { cost: 0.2 }));
  assert.deepEqual(ledger.publicUsage(), {
    turns: 2,
    provider_requests: 2,
    tool_calls: 4,
    tokens: { input: 20, output: 10, cache_read: 4, cache_write: 2, total: 36 },
    cost_usd: 0.30000000000000004,
  });
});

test("one unavailable Codex execution makes whole-case requests and cost unavailable", () => {
  const ledger = createEvaluationLedger({ modelDriven: true });
  const codex = execution("subject-codex", { cost: null });
  codex.runtime_counters.provider_requests = null;
  ledger.record(codex);
  ledger.record(execution("semantic-pi", { cost: 0.2 }));
  assert.deepEqual(ledger.publicUsage(), {
    turns: 2,
    provider_requests: null,
    tool_calls: 4,
    tokens: { input: 20, output: 10, cache_read: 4, cache_write: 2, total: 36 },
    cost_usd: null,
  });
  assert.equal(ledger.entries()[1].runtime_counters.provider_requests, 1);
  assert.equal(ledger.entries()[1].usage.cost.total_usd, 0.2);
});

test("missing model usage remains unavailable rather than zero", () => {
  const ledger = createEvaluationLedger({ modelDriven: true });
  ledger.record(execution("subject-1", { usage: false }));
  assert.deepEqual(ledger.publicUsage(), {
    turns: 1,
    provider_requests: 1,
    tool_calls: 2,
    tokens: null,
    cost_usd: null,
  });
});

test("host-free ledger reports no model usage as unavailable", () => {
  const ledger = createEvaluationLedger({ modelDriven: false });
  assert.deepEqual(ledger.publicUsage(), {
    turns: 0,
    provider_requests: 0,
    tool_calls: 0,
    tokens: null,
    cost_usd: null,
  });
});

test("operation outcomes preserve primary and secondary failures", () => {
  const settled = execution("subject-1");
  const failed = incompleteOperation({ execution: settled, primary: "evidence write failed", secondary: "cleanup failed" });
  assert.equal(failed.status, "incomplete");
  assert.equal(failed.execution.id, "subject-1");
  assert.deepEqual(failed.failure, { primary: "evidence write failed", secondary: "cleanup failed" });
  assert.equal("value" in failed, false);

  const complete = completeOperation({ execution: settled, value: { verdict: "pass" } });
  assert.equal(complete.status, "complete");
  assert.deepEqual(complete.value, { verdict: "pass" });
});

test("publication outcomes expose a path only after confirmed publication", () => {
  assert.deepEqual(publishedPath("runs/evaluations/one/result.json"), {
    status: "published",
    path: "runs/evaluations/one/result.json",
  });
  const failed = failedPublication("rename failed", "cleanup failed");
  assert.deepEqual(failed, {
    status: "publication-failed",
    failure: { primary: "rename failed", secondary: "cleanup failed" },
  });
  assert.equal("path" in failed, false);
  assert.throws(() => publishedPath(""), /path/i);
});
