// Hidden test for one-line-fix: the greeting is spelled right and nothing else on the screen changed.
import assert from "node:assert/strict";
import { test } from "node:test";

const { greet, hoursLine, isOpen } = await import(`${process.cwd()}/src/greet.js`);
const { screen } = await import(`${process.cwd()}/src/screen.js`);

test("ftu: the greeting says Hello", () => {
  assert.equal(greet("Ada"), "Hello, Ada!");
});

test("ftu: the rest of the screen is unchanged", () => {
  assert.equal(hoursLine(), "Open 9:00 to 18:00");
  assert.equal(isOpen(12), true);
  assert.equal(screen("Ada", 20), "Hello, Ada!\nClosed, see you tomorrow");
});
