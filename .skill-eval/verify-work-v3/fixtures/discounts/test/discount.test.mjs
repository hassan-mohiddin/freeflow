import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyDiscount } from "../src/discount.mjs";

const orders = JSON.parse(readFileSync(new URL("./fixtures/orders.json", import.meta.url), "utf8"));

for (const { total, code, expected } of orders) {
  test(`${code} on ${total.toFixed(2)} gives ${expected.toFixed(2)}`, () => {
    assert.equal(applyDiscount(total, code), expected);
  });
}

test("no code leaves the total unchanged", () => {
  assert.equal(applyDiscount(42.5, ""), 42.5);
});

test("an unknown code is rejected", () => {
  assert.throws(() => applyDiscount(10, "FREE"), RangeError);
});
