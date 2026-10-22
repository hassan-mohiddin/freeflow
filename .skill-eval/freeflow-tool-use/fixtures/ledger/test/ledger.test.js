import assert from "node:assert/strict";
import { test } from "node:test";

import { addEntry, balance, inMonth } from "../src/ledger.js";

test("entries add up to the balance", () => {
  let entries = addEntry([], { date: "2026-10-02", category: "food", amount: "23.10" });
  entries = addEntry(entries, { date: "2026-10-03", category: "rent", amount: 90000 });
  assert.equal(balance(entries), 92310);
});

test("a month's entries", () => {
  const entries = [
    { date: "2026-09-30", category: "food", cents: 100 },
    { date: "2026-10-01", category: "food", cents: 200 },
  ];
  assert.deepEqual(
    inMonth(entries, "2026-10").map((entry) => entry.cents),
    [200],
  );
});
