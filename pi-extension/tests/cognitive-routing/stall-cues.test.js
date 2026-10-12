import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "../fixtures/routing-native.js";

const runtimeState = (body) => JSON.stringify(body).split("# Cognitive Routing Runtime State").at(-1);

// Live run (Task 008 S-005): after a compaction, a Haiku 5.5 Executor answered as Coordinator and ended its run
// without return_work; Coordinator then saw only "outstanding" and kept waiting.
test("the worker is told to return, and Coordinator is told when a worker's run ended without returning", async () => {
  const seen = {};
  await fixture(
    (n, body) => {
      if (n === 1) return [{ name: "delegate_work", args: { operation: "assign", contract: "Add the test." } }];
      if (n === 2) {
        seen.worker = runtimeState(body);
        return [];
      }
      if (n === 3) seen.coordinator = runtimeState(body);
      return [];
    },
    true,
    async ({ session }) => {
      await session.prompt("Is the test added?");
      await session.waitForIdle();
    },
  );
  assert.match(seen.worker, /Profile: executor/);
  assert.match(seen.worker, /You are Executor: carry out A1 from its delegate_work contract, then hand it back/);
  assert.doesNotMatch(seen.worker, /ended without return_work/);
  assert.match(seen.coordinator, /Profile: coordinator/);
  assert.match(seen.coordinator, /Executor's run on A1 ended without return_work/);
  assert.doesNotMatch(seen.coordinator, /You are Executor/);
});

// Live run (Task 008 S-005): assessing a recovery supplement, a Haiku 5.5 Coordinator took the worker's calls in
// its view for its own and reported a role violation it had not committed.
test("an assessing Coordinator is told that the worker's turns in its view are the worker's", async () => {
  const seen = {};
  await fixture((n, body) => {
    if (n === 1) return [{ name: "delegate_work", args: { operation: "assign", contract: "Report." } }];
    if (n === 2) {
      seen.worker = runtimeState(body);
      return [{ name: "return_work", args: { operation: "submit", report: "Done.", outcome: "completed" } }];
    }
    if (n === 3) seen.coordinator = runtimeState(body);
    return [];
  });
  assert.match(seen.coordinator, /Assessment: /);
  assert.match(seen.coordinator, /those calls are the worker's, as the source provenance after the run says/);
  assert.doesNotMatch(seen.worker, /those calls are the worker's/);
});
