import assert from "node:assert/strict";
import test from "node:test";
import { fixture, response } from "../fixtures/routing-native.js";

// The warning reaching a worker in the middle of its own assignment, under projection: the worker gets the worker's
// notice, compacts, continues its contract, and returns. The fixture's gpt-4o has a 128,000-token window and Pi's
// reserve is 1 token, so the warning comes at 89,600 (70%).
const WARNING = "Compaction is due soon:";
const count = (body, text) => JSON.stringify(body.input).split(text).length - 1;

test("a worker warned mid-assignment compacts, continues its contract, and returns", { timeout: 30000 }, async () => {
  const delegate = { name: "freeflow_delegate", args: { operation: "assign", contract: "Read evidence.txt twice." } };
  const read = { name: "read", args: { path: "evidence.txt" } };
  const submit = { name: "freeflow_return", args: { operation: "submit", report: "Done.", outcome: "completed" } };
  const close = { name: "freeflow_unit", args: { operation: "close", outcome: "accepted", assessment: "Enough." } };
  // Request 3 is the worker's second request: its usage crosses the warning, and the notice joins request 4.
  const usage = [5_000, 50_000, 100_000, 100_000, 2_000, 2_000, 2_000, 2_000];
  await fixture(
    async (n) =>
      [
        [delegate],
        [read],
        [read],
        [{ name: "freeflow_compact", args: { summary: "WORKER_SUMMARY" } }],
        [read],
        [submit],
        [close],
      ][n - 1] ?? [],
    true,
    async ({ requests, manager }) => {
      assert.deepEqual(
        requests.map((body) => body.model),
        ["gpt-4o", "gpt-4.1-mini", "gpt-4.1-mini", "gpt-4.1-mini", "gpt-4.1-mini", "gpt-4.1-mini", "gpt-4o", "gpt-4o"],
        "the worker keeps its run through the notice and the compaction",
      );
      assert.equal(count(requests[2], WARNING), 0);
      assert.equal(count(requests[3], WARNING), 1, "the worker's next request carries the warning");
      const notice = JSON.stringify(requests[3].input);
      assert.match(notice, /Keep working until a safe point/, "the worker's notice, not the Coordinator's");
      assert.doesNotMatch(notice, /do not compact yourself/);

      const compactions = manager.getBranch().filter((entry) => entry.type === "compaction");
      assert.equal(compactions.length, 1);
      assert.equal(compactions[0].details.freeflow.requestedBy, "notice");
      assert.equal(compactions[0].details.freeflow.profile, "executor");
      // After compaction the contract returns, followed by the fact that this assignment's compaction happened.
      const after = JSON.stringify(requests[4].input);
      assert.match(after, /It completes the compaction Freeflow's context notice asked for\./);
      assert.match(after, /Read evidence\.txt twice\.\\n\\nCompaction: you compacted during this assignment/);
      assert.equal(count(requests[4], WARNING), 0, "a new cycle starts with no notice");
      assert.ok(JSON.stringify(requests[6].input).includes("began when the Executor compacted"));
    },
    true,
    {
      freeflowConfig: { toolExecution: { enabled: true } },
      response: (n, calls) =>
        response(n, calls, "fixture response", {
          input_tokens: usage[n - 1] ?? 2_000,
          output_tokens: 10,
          total_tokens: (usage[n - 1] ?? 2_000) + 10,
        }),
    },
  );
});
