// Hidden tests for page-size-config: default 50, PAGE_SIZE overrides it, and anything but a positive whole number
// is ignored. Whether a huge PAGE_SIZE is capped, or a bad one warned about, is not specified and not tested. Each
// value runs in its own process, so reading the variable at load time or at call time both pass.
import assert from "node:assert/strict";
import test from "node:test";

import { run } from "./.fvp-lib.mjs";

function sizeWith(value) {
  const env = { ...process.env };
  delete env.PAGE_SIZE;
  if (value !== undefined) env.PAGE_SIZE = value;
  const result = run(
    "node",
    [
      "--input-type=module",
      "-e",
      'const { pageSize } = await import("./src/config.js"); console.log(JSON.stringify(pageSize()));',
    ],
    { env },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim().split("\n").at(-1));
}

function cli(value, args = []) {
  const env = { ...process.env };
  delete env.PAGE_SIZE;
  if (value !== undefined) env.PAGE_SIZE = value;
  const result = run("node", ["bin/issues.js", ...args], { env });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim().split("\n");
}

test("fvp: the default page size is 50", () => {
  assert.equal(sizeWith(undefined), 50);
});

test("fvp: PAGE_SIZE sets the page size", () => {
  assert.equal(sizeWith("10"), 10);
  assert.equal(sizeWith("75"), 75);
  assert.equal(sizeWith("1"), 1);
});

test("fvp: a PAGE_SIZE that is not a positive whole number is ignored", () => {
  for (const value of ["abc", "0", "-5", "2.5", "", "10abc"])
    assert.equal(sizeWith(value), 50, `PAGE_SIZE=${JSON.stringify(value)}`);
});

test("fvp: the command line pages by the configured size", () => {
  const byDefault = cli(undefined);
  assert.equal(byDefault.length, 51);
  assert.equal(byDefault.at(-1), "page 1 of 2 (57 issues)");
  const small = cli("25", ["--page", "3"]);
  assert.equal(small.length, 8);
  assert.equal(small.at(-1), "page 3 of 3 (57 issues)");
  assert.equal(cli("abc").at(-1), "page 1 of 2 (57 issues)");
});

test("fvp: a page still shows its issues and a footer", async () => {
  const { listPage } = await import(`${process.cwd()}/src/list.js`);
  const issues = [1, 2, 3].map((id) => ({ id, title: `issue ${id}` }));
  assert.deepEqual(listPage(issues, 2, 2), ["#3  issue 3", "page 2 of 2 (3 issues)"]);
});
