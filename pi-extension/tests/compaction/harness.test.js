import assert from "node:assert/strict";
import test from "node:test";
import { harnessPart } from "../../dist/compaction/harness.js";

const facts = { cycle: 3, background: [], files: { readFiles: [], modifiedFiles: [] } };

test("the harness part names the Freeflow skills read in the cycle it ends, and nothing when there are none", () => {
  assert.match(
    harnessPart({ ...facts, skills: ["track-work", "execute-work"] }),
    /\nFreeflow skills read in cycle 2: track-work, execute-work\.(\n|$)/,
  );
  assert.doesNotMatch(harnessPart({ ...facts, skills: [] }), /Freeflow skills read/);
  assert.doesNotMatch(harnessPart(facts), /Freeflow skills read/);
});
