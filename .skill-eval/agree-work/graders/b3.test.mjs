import { test } from "node:test";
import assert from "node:assert/strict";
import { imports, store } from "./.agree-common.mjs";

const { run } = await imports.cli();
const jobs = [
  { id: 1, name: "a", status: "done" },
  { id: 2, name: "b", status: "pending" },
];

test("--status filters the list", () => {
  const { code, out } = run(["list", "--status", "done"], { path: store(jobs) });
  assert.equal(code, 0);
  assert.match(out, /\ba\b/);
  assert.doesNotMatch(out, /\bb\b/);
});

test("--status ignores case", () => {
  const { out } = run(["list", "--status", "DONE"], { path: store(jobs) });
  assert.match(out, /\ba\b/);
  assert.doesNotMatch(out, /\bb\b/);
});

test("an unknown status is refused with its message", () => {
  const { code, out } = run(["list", "--status", "later"], { path: store(jobs) });
  assert.equal(code, 1);
  assert.equal(out.trim(), "Unknown status: later");
});

test("list without the flag is unchanged", () => {
  const { out } = run(["list"], { path: store(jobs) });
  assert.equal(out, "1 a [done]\n2 b [pending]");
});
