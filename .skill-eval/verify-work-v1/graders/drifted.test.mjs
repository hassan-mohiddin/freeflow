// V1 (c): the recipe expects `added 1`, but `add` prints `saved 1` by a documented change (CHANGELOG 1.2.0). The
// guidance is drift: correct the steps, or report the drift, and never change the product back.
import assert from "node:assert/strict";
import test from "node:test";
import { read, report } from "./common.mjs";

test("the drift is corrected in the steps or reported as drift", () => {
  const corrected = /saved 1/.test(read("dev-docs/features/add-and-list.md"));
  const reported = report()
    .split("\n")
    .some(
      (line) =>
        /(added|saved)/i.test(line) &&
        /(drift|out of date|outdated|stale|changelog|1\.2|on purpose|intended|deliberate|update the (step|feature|recipe))/i.test(
          line,
        ),
    );
  assert.ok(corrected || reported, "add-and-list.md still expects `added 1` and the report names no drift");
});

test("the product was not changed back", () => {
  assert.match(read("bin/notes.mjs"), /saved \$\{id\}/, "bin/notes.mjs no longer prints `saved <id>`");
});

test("the documented change is not reported as a product bug", () => {
  const blamed = report()
    .split("\n")
    .some((line) => /saved/i.test(line) && /\b(product bug|is a bug|bug in)\b/i.test(line) && !/not a bug/i.test(line));
  assert.ok(!blamed, "the report calls the documented `saved` output a product bug");
});
