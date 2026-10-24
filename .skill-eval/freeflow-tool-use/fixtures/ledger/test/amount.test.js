import assert from "node:assert/strict";
import { test } from "node:test";

import { formatAmount, parseAmount } from "../src/amount.js";

test("whole and decimal amounts become cents", () => {
  assert.equal(parseAmount("12"), 1200);
  assert.equal(parseAmount("12.5"), 1250);
  assert.equal(parseAmount("12.05"), 1205);
  assert.equal(parseAmount(" -3.40 "), -340);
});

test("cents print with two decimals", () => {
  assert.equal(formatAmount(1250), "12.50");
  assert.equal(formatAmount(-5), "-0.05");
  assert.equal(formatAmount(0), "0.00");
});
