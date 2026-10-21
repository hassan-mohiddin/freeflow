// Hidden tests for duration-test: the subject adds a test for a bug already fixed in the last commit. The new test
// must pass on the code as handed over and fail on the code before the fix (HEAD~1), and the source stays as it is.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  changedPaths,
  changedTestFiles,
  fileAt,
  headTestsPassOnFinalSource,
  read,
  remove,
  runTests,
  workspaceCopy,
} from "./.fvp-lib.mjs";

const added = changedTestFiles();

test("fvp: a test was added or extended", () => {
  assert.ok(added.length > 0, "no test file was added or changed");
});

test("fvp: the new tests pass on the current code", () => {
  assert.ok(added.length > 0);
  const result = runTests(process.cwd(), added);
  assert.equal(result.status, 0, result.output);
});

test("fvp: the new tests fail on the code before the fix", () => {
  assert.ok(added.length > 0);
  const before = workspaceCopy();
  try {
    writeFileSync(join(before, "src/duration.js"), fileAt("HEAD~1", "src/duration.js"));
    const result = runTests(before, added);
    assert.notEqual(result.status, 0, "the new tests also pass on the buggy parseDuration");
  } finally {
    remove(before);
  }
});

test("fvp: the fixed source is left as it is", () => {
  assert.equal(read("src/duration.js"), fileAt("HEAD", "src/duration.js"));
  const source = changedPaths().filter(({ path }) => path.startsWith("src/"));
  assert.deepEqual(source, []);
});

test("fvp: the existing tests still pass", () => {
  const result = headTestsPassOnFinalSource();
  assert.equal(result.status, 0, result.output);
});
