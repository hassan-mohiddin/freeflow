import assert from "node:assert/strict";
import test from "node:test";

import { guestFrame, hostFrame } from "../../dist/tool-runtime/program/protocol.js";

const runId = "run:fixture";

test("program protocol accepts only closed, bounded, identity-bearing frames", () => {
  assert.deepEqual(guestFrame({ v: 1, type: "call", runId, seq: 1, operation: "result.read", inputJson: "{}" }), {
    v: 1,
    type: "call",
    runId,
    seq: 1,
    operation: "result.read",
    inputJson: "{}",
  });
  assert.deepEqual(hostFrame({ v: 1, type: "reply", runId, seq: 1, outcomeJson: '{"ok":true}' }), {
    v: 1,
    type: "reply",
    runId,
    seq: 1,
    outcomeJson: '{"ok":true}',
  });
  for (const frame of [
    { v: 1, type: "call", runId, seq: 1, operation: "result.read", inputJson: "{}", extra: true },
    { v: 1, type: "call", runId, seq: 0, operation: "result.read", inputJson: "{}" },
    { v: 1, type: "unknown", runId },
    { v: 2, type: "finished", runId, detached: false },
  ])
    assert.throws(
      () => guestFrame(frame),
      (error) => error.code === "invalid_frame",
    );
  assert.throws(
    () => hostFrame({ v: 1, type: "reply", runId, seq: 1, outcomeJson: "x".repeat(4 * 1024 * 1024 + 1) }),
    (error) => error.code === "invalid_frame",
  );
});
