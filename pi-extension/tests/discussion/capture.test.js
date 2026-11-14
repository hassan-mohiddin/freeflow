import assert from "node:assert/strict";
import test from "node:test";
import { CAPTURE_IDLE_MS, DiscussionCapture } from "../../dist/discussion/capture.js";

// Freeflow's discussion capture on Pi (D-056): one `discussion capture` run per settled turn, after the session stays
// idle, cancelled by a run that starts first, and never throwing into Pi when the script fails.

/** A run that records its arguments and answers after `delay` milliseconds, or fails when `fail` is set. */
function recorder({ delay = 0, fail = false } = {}) {
  const calls = [];
  const run = async (args, options) => {
    calls.push({ args, timeoutMs: options?.timeoutMs });
    await new Promise((done) => setTimeout(done, delay));
    if (fail) throw new Error("the script is not there");
    return { code: 0, stdout: "", stderr: "" };
  };
  return { calls, run };
}

test("a capture runs the script's discussion capture once, with a timeout", async () => {
  const { calls, run } = recorder();
  await new DiscussionCapture(run).capture();
  assert.deepEqual(calls, [{ args: ["discussion", "capture"], timeoutMs: 30_000 }]);
});

test("a settled run captures once the session has stayed idle a moment", async () => {
  const { calls, run } = recorder();
  const capture = new DiscussionCapture(run);
  capture.settled();
  assert.equal(calls.length, 0, "not while the run is still settling");
  await new Promise((done) => setTimeout(done, CAPTURE_IDLE_MS + 300));
  assert.equal(calls.length, 1);
});

test("a run that starts before the idle time cancels the capture; the next settle captures", async () => {
  const { calls, run } = recorder();
  const capture = new DiscussionCapture(run);
  capture.settled();
  capture.runStarted();
  await new Promise((done) => setTimeout(done, CAPTURE_IDLE_MS + 300));
  assert.equal(calls.length, 0);
  capture.settled();
  await new Promise((done) => setTimeout(done, CAPTURE_IDLE_MS + 300));
  assert.equal(calls.length, 1);
});

test("captures run one after another, and a failed one does not reject the next or Pi", async () => {
  const { calls, run } = recorder({ delay: 20, fail: true });
  const capture = new DiscussionCapture(run);
  const first = capture.capture();
  const second = capture.capture();
  await Promise.all([first, second]);
  assert.equal(calls.length, 2);
});
