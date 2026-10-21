import assert from "node:assert/strict";
import test from "node:test";

import { parseDuration } from "../src/duration.js";

test("parses a single unit", () => {
  assert.equal(parseDuration("90s"), 90_000);
  assert.equal(parseDuration("15m"), 900_000);
  assert.equal(parseDuration("2h"), 7_200_000);
  assert.equal(parseDuration("250ms"), 250);
});

test("rejects text that is not a duration", () => {
  assert.throws(() => parseDuration("soon"), RangeError);
  assert.throws(() => parseDuration("10 minutes"), RangeError);
  assert.throws(() => parseDuration(""), RangeError);
});
