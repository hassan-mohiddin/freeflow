import { test } from "node:test";
import assert from "node:assert/strict";
import { imports, store } from "./.agree-common.mjs";

const { run } = await imports.cli();

test("list --json prints one line of JSON with id, name, status in order", () => {
  const { code, out } = run(["list", "--json"], { path: store([{ id: 1, name: "a", status: "done" }]) });
  assert.equal(code, 0);
  assert.equal(out.trim(), '[{"id":1,"name":"a","status":"done"}]');
});

test("list --json with no jobs prints []", () => {
  const { out } = run(["list", "--json"], { path: store([]) });
  assert.equal(out.trim(), "[]");
});

test("list without the flag is unchanged", () => {
  const { out } = run(["list"], { path: store([{ id: 1, name: "a", status: "done" }]) });
  assert.equal(out, "1 a [done]");
});
