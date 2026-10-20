import assert from "node:assert/strict";
import test from "node:test";
import { loadSettings } from "../src/settings.js";

test("an override replaces the default", () => {
  assert.equal(loadSettings({ pageSize: 10 }).pageSize, 10);
  assert.equal(loadSettings({ theme: "dark" }).theme, "dark");
});

test("a page size above the maximum is rejected", () => {
  assert.throws(() => loadSettings({ pageSize: 500 }), RangeError);
});

test("the upstream timeout defaults to five seconds", () => {
  assert.equal(loadSettings().timeoutMs, 5000);
});
