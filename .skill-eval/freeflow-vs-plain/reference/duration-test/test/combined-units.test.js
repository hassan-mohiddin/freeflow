import assert from "node:assert/strict";
import test from "node:test";

import { parseDuration } from "../src/duration.js";

// Reported bug: "1h30m" came back as 30 minutes, because each unit replaced the total instead of adding to it.
test("combined units add up", () => {
  assert.equal(parseDuration("1h30m"), 5_400_000);
  assert.equal(parseDuration("2m30s"), 150_000);
  assert.equal(parseDuration("1h1m1s1ms"), 3_661_001);
});
