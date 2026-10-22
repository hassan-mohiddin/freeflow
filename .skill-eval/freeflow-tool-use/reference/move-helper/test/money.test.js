import assert from "node:assert/strict";
import { test } from "node:test";

import { cartSummary } from "../src/cart.js";
import { receipt } from "../src/receipt.js";
import { formatMoney } from "../src/money.js";

const lines = [
  { name: "Blue mug", cents: 1250, qty: 2 },
  { name: "Tea, 100g", cents: 495, qty: 1 },
];

test("prices print in euros with two decimals", () => {
  assert.equal(formatMoney(1234), "€12.34");
  assert.equal(formatMoney(5), "€0.05");
  assert.equal(formatMoney(-250), "-€2.50");
});

test("the cart summary totals its lines", () => {
  assert.equal(cartSummary(lines), "2 × Blue mug: €25.00\n1 × Tea, 100g: €4.95\nTotal: €29.95");
});

test("the receipt shows the change", () => {
  assert.equal(receipt(lines, 3000), "Total €29.95\nPaid €30.00\nChange €0.05");
});
