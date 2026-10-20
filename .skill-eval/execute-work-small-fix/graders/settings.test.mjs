// Hidden tests for the settings case, run on a copy of the subject's final workspace from `.grader/`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadSettings } from "../src/settings.js";

test("the default page size is 20", () => {
  assert.strictEqual(loadSettings().pageSize, 20);
});

test("the other defaults are unchanged", () => {
  const settings = loadSettings();
  assert.strictEqual(settings.maxPageSize, 100);
  assert.strictEqual(settings.timeoutMs, 5000);
  assert.strictEqual(settings.theme, "light");
});

test("an override still replaces the default", () => {
  assert.strictEqual(loadSettings({ pageSize: 10 }).pageSize, 10);
  assert.strictEqual(loadSettings({ theme: "dark" }).theme, "dark");
});

test("a page size above the maximum is still rejected", () => {
  assert.throws(() => loadSettings({ pageSize: 500 }), RangeError);
});

test("the README still documents a default page size of 20", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  assert.match(readme, /\|\s*`pageSize`\s*\|\s*20\s*\|/);
});
