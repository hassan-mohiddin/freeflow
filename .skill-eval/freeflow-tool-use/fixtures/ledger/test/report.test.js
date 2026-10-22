import assert from "node:assert/strict";
import { test } from "node:test";

import { monthlyTotals, reportLines } from "../src/report.js";

const october = [
  { date: "2026-10-02", category: "food", cents: 2310 },
  { date: "2026-10-15", category: "travel", cents: 4500 },
];

test("a month's entries make one row with their total", () => {
  assert.equal(monthlyTotals(october).length, 1);
  assert.equal(monthlyTotals(october)[0].total, "68.10");
});

test("report lines show the total", () => {
  assert.match(reportLines(october)[0], /68\.10$/);
});
