// Hidden test for touch-map-amount: parseAmount throws on text that is not an amount, and every place that used to
// skip or refuse a bad amount (the import, the add command, the budgets) still does.
import assert from "node:assert/strict";
import { test } from "node:test";

import { cli, projectTests, root } from "./.ftu-ledger-lib.mjs";

const { parseAmount, formatAmount } = await import(`${root}/src/amount.js`);
const { importCsv } = await import(`${root}/src/import.js`);
const { parseBudgets } = await import(`${root}/src/budget.js`);

test("ftu: parseAmount throws on text that is not an amount", () => {
  for (const text of ["twelve", "", "1.234", "12,50", undefined]) assert.throws(() => parseAmount(text), String(text));
});

test("ftu: good amounts read as before", () => {
  assert.equal(parseAmount("12"), 1200);
  assert.equal(parseAmount("12.5"), 1250);
  assert.equal(parseAmount(" -3.40 "), -340);
  assert.equal(formatAmount(1205), "12.05");
});

test("ftu: an import still skips rows with a bad amount and lists their lines", () => {
  const { entries, skipped } = importCsv(
    "date,category,description,amount\n2026-10-02,food,market,23.10\n2026-10-03,food,cafe,abc\n2026-10-04,rent,flat,900\n",
  );
  assert.deepEqual(
    entries.map((entry) => entry.cents),
    [2310, 90000],
  );
  assert.deepEqual(skipped, [3]);
});

test("ftu: add still refuses a bad amount with its message and exit code 1", () => {
  const result = cli(["add", "2026-10-02", "food", "abc", "market"]);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stderr.trim(), "not an amount: abc");
  assert.deepEqual(result.ledger, []);
  const good = cli(["add", "2026-10-02", "food", "4.5", "market"]);
  assert.equal(good.status, 0, good.stderr);
  assert.equal(good.ledger[0].cents, 450);
});

test("ftu: a budget with a bad limit is still left out", () => {
  assert.deepEqual(parseBudgets({ food: "400", travel: "lots" }), { food: 40000 });
});

test("ftu: the project's tests pass", () => {
  const { status, output } = projectTests();
  assert.equal(status, 0, output);
});
