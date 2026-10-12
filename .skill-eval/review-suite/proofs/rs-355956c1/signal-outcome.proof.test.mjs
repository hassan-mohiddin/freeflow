// Proof for rs-355956c1: a Pi process ended by a signal (code null) must not be a complete run.
// Run with EXPORT_ROOT=<export root>; the module is loaded from that export only.
import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const exportRoot = process.env.EXPORT_ROOT;
const { runPiProcessOutcome } = await import(
  pathToFileURL(join(exportRoot, "skills/evaluate-skill/scripts/lib/process-outcome.mjs")).href
);

function piResult({ code = 0, signal = null } = {}) {
  return {
    process: { code, signal, timed_out: false, output_limit_exceeded: false, stdout: "events", stderr: "" },
    parsed: {
      parse_errors: [],
      final_text: "answer",
      usage: { input: 4, output: 2, total_tokens: 6, cost: { total_usd: 0.1 } },
      tool_events: [],
    },
    runtime_counters: { turns_started: 1, provider_requests: 1, tool_calls: 0, hard_turn_limit_reached: false },
  };
}

test("clean exit with code 0 completes (control)", async () => {
  const outcome = await runPiProcessOutcome({
    id: "subject-1",
    kind: "subject",
    role: "subject",
    run: async () => piResult({ code: 0 }),
    finish: async () => ({ verdict: "pass" }),
  });
  assert.equal(outcome.status, "complete");
});

test("process ended by SIGTERM (no exit code) is not a complete run", async () => {
  let graded = false;
  const outcome = await runPiProcessOutcome({
    id: "subject-1",
    kind: "subject",
    role: "subject",
    run: async () => piResult({ code: null, signal: "SIGTERM" }),
    finish: async () => {
      graded = true;
      return { verdict: "pass" };
    },
  });
  assert.equal(outcome.status, "incomplete");
  assert.equal(graded, false);
  assert.match(outcome.failure.primary, /exited with null|unusable evidence/);
});
