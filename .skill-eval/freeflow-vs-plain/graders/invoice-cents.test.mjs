// Hidden tests for invoice-cents. The symptom shows on the printed invoice, but the cause is the shared conversion
// from pounds to pence (src/money.js), which the till receipt uses too: a fix in the printer or the invoice alone
// leaves the receipt and the helper wrong.
import assert from "node:assert/strict";
import test from "node:test";

import { headTestsPassOnFinalSource, load, run } from "./.fvp-lib.mjs";

const money = await load("src/money.js");
const { buildInvoice } = await load("src/invoice.js");
const { printInvoice } = await load("src/printer.js");
const { receiptLines } = await load("src/receipt.js");

// Prices whose binary floating-point value falls just below the written pence.
const PRICES = [
  [4.35, 435],
  [0.29, 29],
  [1.15, 115],
  [8.2, 820],
  [19.99, 1999],
  [2.3, 230],
  [0.57, 57],
  [9.95, 995],
  [4.1, 410],
  [12.5, 1250],
  [0.07, 7],
  [3, 300],
];

test("fvp: prices convert to the pence written on the price list", () => {
  for (const [pounds, pence] of PRICES) assert.equal(money.toPence(pounds), pence, `toPence(${pounds})`);
});

test("fvp: the invoice shows each item at its listed price", () => {
  const invoice = buildInvoice({
    customer: "Harbour Books",
    items: PRICES.map(([price], index) => ({ description: `item ${index}`, price, qty: 1 })),
  });
  assert.deepEqual(
    invoice.lines.map((line) => line.unit),
    PRICES.map(([, pence]) => pence),
  );
  assert.equal(
    invoice.total,
    PRICES.reduce((sum, [, pence]) => sum + pence, 0),
  );
});

test("fvp: the printed example invoice shows the notebook at £4.35 and the right total", () => {
  const result = run("node", ["bin/invoice.js", "examples/order.json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /A5 notebook\s+1 x\s+£4\.35\s+£4\.35/);
  assert.match(result.stdout, /Total\s+£20\.45/);
});

test("fvp: the till receipt charges the listed prices", () => {
  const lines = receiptLines({
    items: [
      { description: "notebook", price: 4.35, qty: 2 },
      { description: "eraser", price: 0.29, qty: 1 },
    ],
  });
  assert.deepEqual(lines, ["2 notebook £8.70", "1 eraser £0.29", "TO PAY £8.99"]);
});

test("fvp: a printed invoice keeps its layout", () => {
  const text = printInvoice(buildInvoice({ customer: "Ann", items: [{ description: "Tray", price: 12.5, qty: 2 }] }));
  assert.equal(
    text,
    [
      "Invoice for Ann",
      "",
      `${"Tray".padEnd(24)}   2 x    £12.50     £25.00`,
      "",
      `${"Total".padEnd(42)}    £25.00`,
    ].join("\n"),
  );
});

test("fvp: the existing tests still pass", () => {
  const result = headTestsPassOnFinalSource();
  assert.equal(result.status, 0, result.output);
});
