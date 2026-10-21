import assert from "node:assert/strict";
import test from "node:test";

import { buildInvoice } from "../src/invoice.js";
import { formatPence, sumPence } from "../src/money.js";
import { printInvoice } from "../src/printer.js";

test("pence print as pounds", () => {
  assert.equal(formatPence(1250), "£12.50");
  assert.equal(formatPence(5), "£0.05");
  assert.equal(formatPence(-120), "-£1.20");
});

test("sums whole pence", () => {
  assert.equal(sumPence([100, 250, 5]), 355);
});

test("an invoice totals its lines", () => {
  const invoice = buildInvoice({ customer: "Ann", items: [{ description: "Tray", price: 12.5, qty: 2 }] });
  assert.equal(invoice.total, 2500);
  assert.match(printInvoice(invoice), /Total\s+£25\.00$/);
});
