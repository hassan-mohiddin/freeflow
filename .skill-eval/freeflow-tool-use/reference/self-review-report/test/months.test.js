import assert from "node:assert/strict";
import { test } from "node:test";

import { monthlyTotals } from "../src/report.js";

test("months of one year are separate rows", () => {
  const months = monthlyTotals([
    { date: "2026-03-01", category: "food", cents: 500 },
    { date: "2026-07-09", category: "food", cents: 700 },
  ]).map((row) => row.month);
  assert.deepEqual(months, ["2026-03", "2026-07"]);
});
