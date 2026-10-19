import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatReceipt } from "../src/receipt.mjs";

const orders = JSON.parse(readFileSync(new URL("./fixtures/orders.json", import.meta.url), "utf8"));

for (const order of orders) {
  test(`receipt for ${order.code} on ${order.total.toFixed(2)}`, () => {
    assert.equal(
      formatReceipt(order),
      `Subtotal ${order.total.toFixed(2)}, ${order.code}, total ${order.expected.toFixed(2)}`,
    );
  });
}

test("receipt without a code", () => {
  assert.equal(formatReceipt({ total: 8, code: "" }), "Subtotal 8.00, no code, total 8.00");
});
