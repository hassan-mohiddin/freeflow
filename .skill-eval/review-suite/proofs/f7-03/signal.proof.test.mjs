// Proof for f7-03: a Pi process that ends by signal (exit code null) must not be recorded as complete.
// Run with EXPORT_ROOT=<export root>; the module is loaded from that export only.
import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const lib = join(process.env.EXPORT_ROOT, "skills/evaluate-skill/scripts/lib");
const { runPiProcessOutcome } = await import(pathToFileURL(join(lib, "process-outcome.mjs")).href);

test("a process killed by a signal is an incomplete operation", async () => {
  const outcome = await runPiProcessOutcome({
    id: "subject-1",
    kind: "subject",
    role: "subject",
    run: async () => ({
      process: {
        code: null,
        signal: "SIGKILL",
        timed_out: false,
        output_limit_exceeded: false,
        stdout: "partial",
        stderr: "",
      },
      parsed: {
        parse_errors: [],
        final_text: "partial answer",
        usage: { input: 1, output: 1, total_tokens: 2, cost: { total_usd: 0 } },
        tool_events: [],
      },
      runtime_counters: { turns_started: 1, provider_requests: 1, tool_calls: 0, hard_turn_limit_reached: false },
    }),
  });
  console.log(`signal-killed process: ${outcome.status}`);
  assert.equal(outcome.status, "incomplete");
});
