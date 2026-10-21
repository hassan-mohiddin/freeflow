import assert from "node:assert/strict";
import test from "node:test";

import { dailyLine, dueLabel, weeklyHeader } from "../src/report.js";

test("a daily line shows the UTC day, hours and title", () => {
  assert.equal(dailyLine({ at: "2026-03-04T23:30:00Z", hours: 1.5, title: "Review" }), "2026-03-04  1.5h  Review");
});

test("the weekly header spans seven days", () => {
  assert.equal(weeklyHeader("2026-03-02T00:00:00Z"), "Week of 2026-03-02 to 2026-03-08");
});

test("a due label shows the day", () => {
  assert.equal(dueLabel({ due: "2026-12-01" }), "due 2026-12-01");
});

test("a task without a due date says so", () => {
  assert.equal(dueLabel({}), "no due date");
});
