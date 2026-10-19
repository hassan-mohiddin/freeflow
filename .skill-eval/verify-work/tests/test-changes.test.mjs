import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const scriptPath = resolve("skills/verify-work/scripts/test-changes.mjs");

// Isolate Git from the machine's configuration so a global hook, signing or colour setting cannot change a result.
const gitEnv = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
};
const git = (cwd, ...args) =>
  execFileSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args],
    {
      cwd,
      env: gitEnv,
      encoding: "utf8",
    },
  ).trim();

async function write(root, files) {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
}

async function repository(files) {
  const root = await mkdtemp(join(tmpdir(), "test-changes-"));
  git(root, "init", "--quiet", "--initial-branch=main");
  await write(root, files);
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "base");
  return root;
}

function run(cwd, ...args) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], { cwd, env: gitEnv, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function listed(cwd, ...args) {
  const result = run(cwd, ...args, "--json");
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

const byPath = (report) => Object.fromEntries(report.changes.map((change) => [change.path, change]));

test("lists changed, deleted and moved existing tests, fixtures, snapshots and setup, and nothing else", async () => {
  const root = await repository({
    "src/math.js": "export const add = (a, b) => a + b;\n",
    "src/math.test.js": 'test("adds", () => expect(add(1, 2)).toBe(3));\n',
    "tests/fixtures/users.json": '[{ "name": "Ada" }]\n',
    "tests/helpers/db.js": "export const db = {};\n",
    "tests/__snapshots__/view.test.js.snap": "exports[`view 1`] = `<p>Ada</p>`;\n",
    "py/conftest.py": "import pytest\n",
    "py/test_parse.py": "def test_parse():\n    assert parse('1') == 1\n",
    "vitest.config.ts": "export default {};\n",
    "e2e/old-name.spec.ts": 'test("loads", async () => {});\n',
    "README.md": "# Project\n",
  });
  try {
    await write(root, {
      "src/math.js": "export const add = (a, b) => a - b;\n",
      "src/math.test.js": 'test("adds", () => expect(add(1, 2)).toBeDefined());\n',
      "tests/__snapshots__/view.test.js.snap": "exports[`view 1`] = `<p></p>`;\n",
      "py/conftest.py": "import pytest\n\n@pytest.fixture(autouse=True)\ndef quiet():\n    pass\n",
      "vitest.config.ts": "export default { test: { passWithNoTests: true } };\n",
      "README.md": "# Project\n\nMore.\n",
      // New test files: not existing tests, so not listed.
      "src/new.test.js": 'test("new", () => {});\n',
      "py/test_new.py": "def test_new():\n    pass\n",
    });
    // Staged, so Git reports them as added rather than leaving them untracked.
    git(root, "add", "src/new.test.js", "py/test_new.py");
    await rm(join(root, "tests/fixtures/users.json"));
    git(root, "mv", "e2e/old-name.spec.ts", "e2e/new-name.spec.ts");

    const report = listed(root, "--base", "main");
    const changes = byPath(report);
    assert.deepEqual(Object.keys(changes).sort(), [
      "e2e/old-name.spec.ts",
      "py/conftest.py",
      "src/math.test.js",
      "tests/__snapshots__/view.test.js.snap",
      "tests/fixtures/users.json",
      "vitest.config.ts",
    ]);
    assert.equal(report.head.ref, "working tree");
    assert.equal(report.head.commit, null);
    assert.equal(report.base.commit, git(root, "rev-parse", "main"));

    assert.deepEqual(Object.fromEntries(report.changes.map((change) => [change.path, [change.status, change.kind]])), {
      "src/math.test.js": ["modified", "test"],
      "tests/__snapshots__/view.test.js.snap": ["modified", "snapshot"],
      "tests/fixtures/users.json": ["deleted", "fixture"],
      "py/conftest.py": ["modified", "setup"],
      "vitest.config.ts": ["modified", "setup"],
      "e2e/old-name.spec.ts": ["renamed", "test"],
    });
    const moved = changes["e2e/old-name.spec.ts"];
    assert.equal(moved.to, "e2e/new-name.spec.ts");
    assert.deepEqual([moved.added, moved.removed, moved.hunks], [0, 0, ""]);

    const weakened = changes["src/math.test.js"];
    assert.match(weakened.hunks, /^-.*toBe\(3\)/m);
    assert.match(weakened.hunks, /^\+.*toBeDefined\(\)/m);
    assert.deepEqual([weakened.added, weakened.removed], [1, 1]);

    const deleted = changes["tests/fixtures/users.json"];
    assert.equal(deleted.hunks, null);
    assert.deepEqual([deleted.added, deleted.removed], [0, 1]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("default patterns cover common test layouts beyond JavaScript and Python", async () => {
  const files = {
    "pkg/parse.go": "package pkg\n",
    "pkg/parse_test.go": "package pkg\n",
    "lib/user_spec.rb": "describe User do\nend\n",
    "spec/spec_helper.rb": "require 'rspec'\n",
    "src/Shop.Tests/CartTests.cs": "class CartTests {}\n",
    "Sources/App/Cart.swift": "struct Cart {}\n",
    "Tests/AppTests/CartTests.swift": "final class CartTests {}\n",
    "src/parse_unittest.cc": "TEST(Parse, Empty) {}\n",
    "app/src/androidTest/kotlin/CartTest.kt": "class CartTest\n",
    "phpunit.xml": "<phpunit/>\n",
    "test/test_helper.exs": "ExUnit.start()\n",
  };
  const root = await repository(files);
  try {
    await write(
      root,
      Object.fromEntries(Object.entries(files).map(([path, content]) => [path, `${content}// changed\n`])),
    );
    const kinds = Object.fromEntries(
      listed(root, "--base", "main").changes.map((change) => [change.path, change.kind]),
    );
    assert.deepEqual(kinds, {
      "pkg/parse_test.go": "test",
      "lib/user_spec.rb": "test",
      "spec/spec_helper.rb": "setup",
      "src/Shop.Tests/CartTests.cs": "test",
      "Tests/AppTests/CartTests.swift": "test",
      "src/parse_unittest.cc": "test",
      "app/src/androidTest/kotlin/CartTest.kt": "test",
      "phpunit.xml": "setup",
      "test/test_helper.exs": "setup",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("lists a shared fixture change that makes a broken function's tests pass", async () => {
  // The shape of a fixture edit that hides a bug: the function stops normalizing case, and instead of fixing it the
  // shared fixture is changed to the value the broken code returns, so every test using it passes again.
  const root = await repository({
    "lib/normalize.js": "export const normalize = (email) => email.trim().toLowerCase();\n",
    "test/fixtures/accounts.js": 'export const account = { input: " Ada@Example.com ", email: "ada@example.com" };\n',
    "test/normalize.test.js":
      'import { account } from "./fixtures/accounts.js";\ntest("normalizes", () => expect(normalize(account.input)).toBe(account.email));\n',
  });
  try {
    await write(root, { "lib/normalize.js": "export const normalize = (email) => email.trim();\n" });
    git(root, "commit", "--quiet", "-am", "break normalize");
    await write(root, {
      "test/fixtures/accounts.js": 'export const account = { input: " Ada@Example.com ", email: "Ada@Example.com" };\n',
    });
    git(root, "commit", "--quiet", "-am", "Fixed");

    const text = run(root, "--base", "main~2", "--head", "main");
    assert.equal(text.status, 0, text.stderr);
    assert.match(text.stdout, /^1 existing test, fixture, snapshot or test setup file changed between main~2/m);
    assert.match(text.stdout, /^modified fixture test\/fixtures\/accounts\.js \(\+1 -1\)$/m);
    assert.match(text.stdout, /^-.*email: "ada@example\.com"/m);
    assert.match(text.stdout, /^\+.*email: "Ada@Example\.com"/m);
    assert.doesNotMatch(text.stdout, /normalize\.js/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a head ref compares two commits and ignores the working tree", async () => {
  const root = await repository({ "tests/a.test.js": "one\n", "tests/b.test.js": "one\n" });
  try {
    await write(root, { "tests/a.test.js": "two\n" });
    git(root, "commit", "--quiet", "-am", "change a");
    await write(root, { "tests/b.test.js": "uncommitted\n" });

    const committed = listed(root, "--base", "main~1", "--head", "main");
    assert.deepEqual(Object.keys(byPath(committed)), ["tests/a.test.js"]);
    assert.equal(committed.head.commit, git(root, "rev-parse", "main"));

    const working = listed(root, "--base", "main~1");
    assert.deepEqual(Object.keys(byPath(working)).sort(), ["tests/a.test.js", "tests/b.test.js"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("patterns can be added, replaced and excluded", async () => {
  const root = await repository({
    "checks/smoke.js": "one\n",
    "tests/unit.test.js": "one\n",
    "tests/vendor/lib.test.js": "one\n",
  });
  try {
    await write(root, {
      "checks/smoke.js": "two\n",
      "tests/unit.test.js": "two\n",
      "tests/vendor/lib.test.js": "two\n",
    });

    assert.deepEqual(Object.keys(byPath(listed(root, "--base", "main"))).sort(), [
      "tests/unit.test.js",
      "tests/vendor/lib.test.js",
    ]);
    assert.deepEqual(Object.keys(byPath(listed(root, "--base", "main", "--pattern", "checks/**"))).sort(), [
      "checks/smoke.js",
      "tests/unit.test.js",
      "tests/vendor/lib.test.js",
    ]);
    assert.deepEqual(Object.keys(byPath(listed(root, "--base", "main", "--pattern", "checks/*.js", "--only"))), [
      "checks/smoke.js",
    ]);
    assert.deepEqual(Object.keys(byPath(listed(root, "--base", "main", "--exclude", "tests/vendor/**"))), [
      "tests/unit.test.js",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("handles paths with spaces and reports when nothing changed", async () => {
  const root = await repository({ "my tests/case one.test.js": "one\n", "src/a.js": "one\n" });
  try {
    const empty = run(root, "--base", "main");
    assert.equal(empty.status, 0, empty.stderr);
    assert.match(empty.stdout, /^No existing test, fixture, snapshot or test setup file changed/);

    await write(root, { "my tests/case one.test.js": "two\n", "src/a.js": "two\n" });
    assert.deepEqual(Object.keys(byPath(listed(root, "--base", "main"))), ["my tests/case one.test.js"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("usage and Git errors exit 2 without listing", async () => {
  const root = await repository({ "tests/a.test.js": "one\n" });
  const outside = await mkdtemp(join(tmpdir(), "test-changes-outside-"));
  try {
    const noBase = run(root);
    assert.equal(noBase.status, 2);
    assert.match(noBase.stderr, /^Usage: test-changes\.mjs --base <ref>/);

    const badBase = run(root, "--base", "no-such-ref");
    assert.equal(badBase.status, 2);
    assert.match(badBase.stderr, /no such commit: no-such-ref/);

    const onlyWithoutPattern = run(root, "--base", "main", "--only");
    assert.equal(onlyWithoutPattern.status, 2);
    assert.match(onlyWithoutPattern.stderr, /--only needs at least one --pattern/);

    const notRepository = run(outside, "--base", "main");
    assert.equal(notRepository.status, 2);
    assert.match(notRepository.stderr, /not inside a Git repository/);
    assert.equal(notRepository.stdout, "");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
