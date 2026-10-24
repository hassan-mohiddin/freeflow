// Hidden test for self-review-report: every month is its own row, the tests pass, and the test the agent added would
// have caught the bug (it fails with the original src/report.js put back).
import assert from "node:assert/strict";
import { test } from "node:test";

import { projectTests, root, testsWithOriginals } from "./.ftu-ledger-lib.mjs";

const { monthlyTotals } = await import(`${root}/src/report.js`);

test("ftu: each month is its own row, labelled YYYY-MM", () => {
  const rows = monthlyTotals([
    { date: "2026-10-01", category: "food", cents: 300 },
    { date: "2026-01-05", category: "food", cents: 100 },
    { date: "2026-02-05", category: "rent", cents: 200 },
    { date: "2026-01-20", category: "rent", cents: 50 },
  ]);
  assert.deepEqual(
    rows.map((row) => [row.month, row.total]),
    [
      ["2026-01", "1.50"],
      ["2026-02", "2.00"],
      ["2026-10", "3.00"],
    ],
  );
});

test("ftu: the project's tests pass", () => {
  const { status, output } = projectTests();
  assert.equal(status, 0, output);
});

test("ftu: the project's tests fail on the original report code", () => {
  const { status } = testsWithOriginals(["src/report.js"]);
  assert.notEqual(status, 0, "no test fails when src/report.js is the original");
});
