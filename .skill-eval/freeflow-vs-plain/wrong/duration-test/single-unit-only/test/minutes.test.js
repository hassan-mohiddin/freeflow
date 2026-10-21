import assert from "node:assert/strict";
import test from "node:test";

import { parseDuration } from "../src/duration.js";

// Wrong on purpose: a test that never combines units, so the buggy version passes it too.
test("thirty minutes", () => {
  assert.equal(parseDuration("30m"), 1_800_000);
});
