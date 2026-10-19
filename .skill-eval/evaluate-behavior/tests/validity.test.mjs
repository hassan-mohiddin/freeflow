import assert from "node:assert/strict";
import test from "node:test";

import { applyValidityGate, validityProblems } from "../../../skills/evaluate-behavior/scripts/lib/validity.mjs";

const USAGE = { input: 120, output: 30, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } };

function run(changes = {}) {
  return {
    state: "complete",
    transcript: [
      { role: "user", content: "Do the task." },
      { role: "assistant", content: [{ type: "text", text: "Done." }] },
    ],
    response: "Done.",
    usage: USAGE,
    ...changes,
  };
}

test("a complete run with a model turn, tokens and an answer is valid, even at zero cost", () => {
  // Zero cost is real work on a model with no configured price; tokens show the model ran.
  assert.deepEqual(validityProblems(run()), []);
});

test("one answer without any tool use is behavior, not a hollow run", () => {
  // Such as a description run whose target skill did not activate, or a subject that declines the task.
  assert.deepEqual(validityProblems(run({ toolActivity: [] })), []);
});

test("an empty answer is valid when the run wrote in its workspace", () => {
  const wrote = run({ response: "", effects: { changes: { created: ["report.md"], modified: [], deleted: [] } } });
  assert.deepEqual(validityProblems(wrote), []);
  const multiTurn = run({ response: "", turns: [{ response: "First answer." }, { response: "" }] });
  assert.deepEqual(validityProblems(multiTurn), []);
});

test("a run with no model turn, no tokens, or nothing to grade is invalid with each reason", () => {
  const hollow = run({ transcript: [{ role: "user", content: "Do the task." }], response: "", usage: null });
  assert.deepEqual(
    validityProblems(hollow).map((reason) => reason.split(":")[0]),
    ["no model turn", "no tokens", "no answer and nothing written in the workspace"],
  );
  const zeroTokens = run({ usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } } });
  assert.deepEqual(
    validityProblems(zeroTokens).map((reason) => reason.split(":")[0]),
    ["no tokens"],
  );
  const silent = run({ response: "  ", effects: { changes: { created: [], modified: [], deleted: [] } } });
  assert.deepEqual(validityProblems(silent), ["no answer and nothing written in the workspace"]);
});

test("only a complete run is checked, and the gate keeps everything the run recorded", () => {
  assert.deepEqual(validityProblems(run({ state: "infrastructure-failed", usage: null })), []);
  const hollow = run({ response: "", usage: null });
  const transcript = hollow.transcript;
  assert.equal(applyValidityGate(hollow), true);
  assert.equal(hollow.state, "invalid");
  assert.equal(hollow.error.kind, "validity");
  assert.equal(hollow.transcript, transcript);
  assert.equal(applyValidityGate(run()), false);
});
