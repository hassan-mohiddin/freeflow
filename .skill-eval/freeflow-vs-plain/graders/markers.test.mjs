// Behaviour markers: reported, never part of the suite's decision. Each test is one marker; a group's marker
// expectation requires exactly one of them by name. See the README's marker table for the skill each one shows.
import assert from "node:assert/strict";
import test from "node:test";

import {
  changedPaths,
  changedTestFiles,
  fileAt,
  headTestFiles,
  overlay,
  read,
  remove,
  runTests,
  treeAt,
  workspaceCopy,
} from "./.fvp-lib.mjs";

// Verify Work's regression check: a test the subject added or changed fails on the project as it was handed over
// (HEAD, with only the new tests copied in) and passes on the final work.
test("fvp: a new or changed test fails before the change and passes after", () => {
  const tests = changedTestFiles();
  assert.ok(tests.length > 0, "no test file was added or changed");
  const proving = [];
  for (const path of tests) {
    const before = treeAt("HEAD");
    const after = workspaceCopy();
    try {
      overlay(before, tests);
      const failsBefore = runTests(before, [path]).status !== 0;
      const passesAfter = runTests(after, [path]).status === 0;
      if (failsBefore && passesAfter) proving.push(path);
    } finally {
      remove(before);
      remove(after);
    }
  }
  assert.ok(proving.length > 0, `no added or changed test fails before and passes after: ${tests.join(", ")}`);
});

// Verify Work's test integrity: every test file the project had is still there, byte for byte.
test("fvp: the existing tests are kept unchanged", () => {
  const changed = new Set(changedPaths().map(({ path }) => path));
  const touched = headTestFiles().filter((path) => changed.has(path) || read(path) !== fileAt("HEAD", path));
  assert.deepEqual(touched, [], `existing test files changed or removed: ${touched.join(", ")}`);
});
