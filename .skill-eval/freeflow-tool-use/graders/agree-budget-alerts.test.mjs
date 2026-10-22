// Hidden test for agree-budget-alerts: `ledger report` alerts each category whose spending in a month reached its
// budget (100% or more), after the monthly totals, and nothing for a category under it. A line alerts a category when
// it names the category and speaks of its budget.
import assert from "node:assert/strict";
import { test } from "node:test";

import { cli, projectTests } from "./.ftu-ledger-lib.mjs";

const entries = [
  { date: "2026-09-12", category: "fun", description: "cinema", cents: 9000 },
  { date: "2026-10-02", category: "food", description: "market", cents: 25000 },
  { date: "2026-10-16", category: "food", description: "market", cents: 15000 },
  { date: "2026-10-05", category: "travel", description: "train", cents: 12000 },
  { date: "2026-10-20", category: "fun", description: "concert", cents: 9500 },
];
const budgets = { food: "400.00", travel: "100", fun: "100.00" };
const ALERT = /budget|over|exceed|limit|alert|warn|reached/i;

function report() {
  const result = cli(["report"], { entries, budgets });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.split("\n");
}

const alerts = (lines, category) =>
  lines.filter((line) => new RegExp(`\\b${category}\\b`, "i").test(line) && ALERT.test(line));

test("ftu: the report alerts a category that spent more than its budget", () => {
  assert.ok(alerts(report(), "travel").length > 0, report().join("\n"));
});

test("ftu: the report alerts a category that spent exactly its budget", () => {
  assert.ok(alerts(report(), "food").length > 0, report().join("\n"));
});

test("ftu: the report does not alert a category under its budget", () => {
  assert.deepEqual(alerts(report(), "fun"), []);
});

test("ftu: the report still prints the monthly totals first", () => {
  const lines = report();
  const october = lines.findIndex((line) => /615\.00/.test(line));
  const september = lines.findIndex((line) => /90\.00/.test(line));
  assert.ok(october >= 0 && september >= 0, lines.join("\n"));
  const firstAlert = lines.findIndex((line) => /\b(travel|food)\b/i.test(line) && ALERT.test(line));
  assert.ok(firstAlert > Math.max(october, september), lines.join("\n"));
});

test("ftu: the project's tests pass", () => {
  const { status, output } = projectTests();
  assert.equal(status, 0, output);
});
