import assert from "node:assert/strict";
import test from "node:test";

import { toPence } from "../src/money.js";
import { receiptLines } from "../src/receipt.js";

test("prices just below a whole penny in floating point convert to the written pence", () => {
  for (const [pounds, pence] of [
    [4.35, 435],
    [0.29, 29],
    [1.15, 115],
    [19.99, 1999],
  ]) {
    assert.equal(toPence(pounds), pence);
  }
});

test("the receipt charges the listed price", () => {
  assert.deepEqual(receiptLines({ items: [{ description: "notebook", price: 4.35, qty: 1 }] }), [
    "1 notebook £4.35",
    "TO PAY £4.35",
  ]);
});
