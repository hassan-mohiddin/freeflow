import assert from "node:assert/strict";
import { test } from "node:test";

import { isOpen } from "../src/greet.js";
import { screen } from "../src/screen.js";

test("the shop is open from nine to six", () => {
  assert.equal(isOpen(9), true);
  assert.equal(isOpen(18), false);
});

test("the closed screen says so", () => {
  assert.match(screen("Ada", 20), /Closed, see you tomorrow/);
});
