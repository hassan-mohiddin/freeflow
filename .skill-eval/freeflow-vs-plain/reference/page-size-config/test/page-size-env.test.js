import assert from "node:assert/strict";
import test from "node:test";

import { pageSize } from "../src/config.js";

test("PAGE_SIZE overrides the default", () => {
  assert.equal(pageSize({ PAGE_SIZE: "10" }), 10);
});

test("a PAGE_SIZE that is not a positive whole number falls back to the default", () => {
  for (const value of ["abc", "0", "-5", "2.5", ""]) assert.equal(pageSize({ PAGE_SIZE: value }), 50);
});
