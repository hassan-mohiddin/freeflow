import assert from "node:assert/strict";
import test from "node:test";

import { dailyLine, weeklyHeader } from "../src/report.js";

test("a daily line shows the UTC day, hours and title", () => {
  assert.equal(dailyLine({ at: "2026-03-04T23:30:00Z", hours: 1.5, title: "Review" }), "2026-03-04  1.5h  Review");
});

test("the weekly header spans seven days", () => {
  assert.equal(weeklyHeader("2026-03-02T00:00:00Z"), "Week of 2026-03-02 to 2026-03-08");
});
