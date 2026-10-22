import assert from "node:assert/strict";
import { test } from "node:test";

import { parseBudgets, remaining } from "../src/budget.js";

test("what is left of each budget in a month", () => {
  const budgets = parseBudgets({ food: "400.00", travel: "100" });
  const entries = [
    { date: "2026-10-02", category: "food", cents: 2310 },
    { date: "2026-09-20", category: "food", cents: 9999 },
    { date: "2026-10-15", category: "travel", cents: 12000 },
  ];
  assert.deepEqual(remaining(budgets, entries, "2026-10"), { food: 37690, travel: -2000 });
});
