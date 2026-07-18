import test from "node:test";
import assert from "node:assert/strict";
import { decideComparison, decideSingle } from "../../../skills/evaluate-skill/scripts/lib/decision.mjs";

const assertions = (entries) => entries.map(([id, verdict]) => ({ id, verdict }));

test("single decision orders fail before inconclusive before pass", () => {
  assert.equal(decideSingle(assertions([["a", "pass"]])).case_verdict, "pass");
  assert.equal(decideSingle(assertions([["a", "inconclusive"]])).case_verdict, "inconclusive");
  assert.equal(
    decideSingle(
      assertions([
        ["a", "inconclusive"],
        ["b", "fail"],
      ]),
    ).case_verdict,
    "fail",
  );
});

test("comparison decision aggregates paired assertion changes", () => {
  assert.equal(
    decideComparison(assertions([["a", "fail"]]), assertions([["a", "pass"]])).comparison_verdict,
    "improved",
  );
  assert.equal(
    decideComparison(assertions([["a", "pass"]]), assertions([["a", "fail"]])).comparison_verdict,
    "regressed",
  );
  assert.equal(
    decideComparison(
      assertions([
        ["a", "pass"],
        ["b", "fail"],
      ]),
      assertions([
        ["a", "pass"],
        ["b", "fail"],
      ]),
    ).comparison_verdict,
    "same",
  );
  assert.equal(
    decideComparison(
      assertions([
        ["a", "fail"],
        ["b", "pass"],
      ]),
      assertions([
        ["a", "pass"],
        ["b", "fail"],
      ]),
    ).comparison_verdict,
    "inconclusive",
  );
  assert.equal(
    decideComparison(assertions([["a", "inconclusive"]]), assertions([["a", "pass"]])).comparison_verdict,
    "inconclusive",
  );
});

test("comparison requires identical assertion IDs", () => {
  assert.throws(() => decideComparison(assertions([["a", "pass"]]), assertions([["b", "pass"]])), /assertion IDs/i);
});
