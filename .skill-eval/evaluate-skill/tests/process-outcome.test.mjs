import test from "node:test";
import assert from "node:assert/strict";
import { runPiProcessOutcome } from "../../../skills/evaluate-skill/scripts/lib/process-outcome.mjs";

function piResult({ code = 0, cost = 0.2, transportLimitExceeded = false } = {}) {
  return {
    process: {
      code,
      signal: null,
      timed_out: false,
      output_limit_exceeded: false,
      transport_limit_exceeded: transportLimitExceeded,
      stdout: "events",
      stderr: code ? "failed" : "",
    },
    parsed: {
      parse_errors: [],
      final_text: "answer",
      usage: { input: 4, output: 2, total_tokens: 6, cost: { total_usd: cost } },
      tool_events: [],
    },
    runtime_counters: { turns_started: 1, provider_requests: 1, tool_calls: 0, hard_turn_limit_reached: false },
  };
}

test("post-settlement persistence failure retains exact execution", async () => {
  const outcome = await runPiProcessOutcome({
    id: "subject-1",
    kind: "subject",
    role: "subject",
    run: async () => piResult(),
    persistSettled: async () => {
      throw new Error("evidence write failed");
    },
  });
  assert.equal(outcome.status, "incomplete");
  assert.equal(outcome.execution.id, "subject-1");
  assert.equal(outcome.execution.runtime_counters.provider_requests, 1);
  assert.equal(outcome.execution.usage.cost.total_usd, 0.2);
  assert.match(outcome.failure.primary, /evidence write failed/);
});

test("cleanup cannot replace a post-settlement primary failure", async () => {
  const outcome = await runPiProcessOutcome({
    id: "semantic-1",
    kind: "semantic",
    role: "subject",
    run: async () => piResult(),
    finish: async () => {
      throw new Error("protocol failed");
    },
    cleanup: async () => {
      throw new Error("cleanup failed");
    },
  });
  assert.equal(outcome.status, "incomplete");
  assert.match(outcome.failure.primary, /protocol failed/);
  assert.match(outcome.failure.secondary, /cleanup failed/);
  assert.equal(outcome.execution.runtime_counters.turns_started, 1);
});

test("failed Pi process still attempts evidence persistence and returns usage", async () => {
  let persisted = false;
  const outcome = await runPiProcessOutcome({
    id: "subject-1",
    kind: "subject",
    role: "candidate",
    run: async () => piResult({ code: 1, cost: 0.3 }),
    persistSettled: async () => {
      persisted = true;
    },
    finish: async () => {
      throw new Error("must not grade failed process");
    },
  });
  assert.equal(persisted, true);
  assert.equal(outcome.status, "incomplete");
  assert.match(outcome.failure.primary, /exited with 1/i);
  assert.equal(outcome.execution.usage.cost.total_usd, 0.3);
});

test("raw transport safeguard failure is incomplete without claiming retained output overflow", async () => {
  const outcome = await runPiProcessOutcome({
    id: "subject-transport",
    kind: "subject",
    role: "subject",
    run: async () => piResult({ transportLimitExceeded: true }),
  });
  assert.equal(outcome.status, "incomplete");
  assert.equal(outcome.execution.process.output_limit_exceeded, false);
  assert.equal(outcome.execution.process.transport_limit_exceeded, true);
  assert.match(outcome.failure.primary, /unusable evidence/i);
});

test("successful process returns completed value after persistence", async () => {
  const order = [];
  const outcome = await runPiProcessOutcome({
    id: "subject-1",
    kind: "subject",
    role: "subject",
    run: async () => {
      order.push("run");
      return piResult();
    },
    persistSettled: async () => {
      order.push("persist");
    },
    finish: async () => {
      order.push("finish");
      return { verdict: "pass" };
    },
    cleanup: async () => {
      order.push("cleanup");
    },
  });
  assert.equal(outcome.status, "complete");
  assert.deepEqual(outcome.value, { verdict: "pass" });
  assert.deepEqual(order, ["run", "persist", "finish", "cleanup"]);
});

test("pre-settlement failure has no fabricated execution", async () => {
  const outcome = await runPiProcessOutcome({
    id: "subject-1",
    kind: "subject",
    role: "subject",
    run: async () => {
      throw new Error("startup failed");
    },
  });
  assert.equal(outcome.status, "incomplete");
  assert.equal(outcome.execution, null);
  assert.match(outcome.failure.primary, /startup failed/);
});
