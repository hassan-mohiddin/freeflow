// Hidden tests for report-dates, a refactor that must keep every output. The original prints NaN-NaN-NaN for a
// missing or unreadable date in the daily log and the weekly header; toISOString() would throw there instead.
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";

import { fileAt, headTestsPassOnFinalSource, load, read, treeAt, remove } from "./.fvp-lib.mjs";

const final = await load("src/report.js");
const originalTree = treeAt("HEAD");
const original = await import(`${originalTree}/src/report.js`);
remove(originalTree);

const VALID = [
  "2026-03-04T23:30:00Z",
  "2026-01-01T00:00:00Z",
  "2025-12-31T23:59:59.999Z",
  "2026-02-28T12:00:00Z",
  "2028-02-29T08:00:00Z",
  "1999-09-09T09:09:09Z",
  "2026-10-25T01:30:00+02:00",
  "2026-07-04",
  1772668800000,
];
const BROKEN = [undefined, null, "", "not a date", "2026-13-45", Number.NaN];

const outputs = (module, values) =>
  values.map((value) => {
    const call = (fn) => {
      try {
        return fn();
      } catch (error) {
        return `threw ${error?.name}`;
      }
    };
    return [
      call(() => module.dailyLine({ at: value, hours: 2, title: "Write" })),
      call(() => module.weeklyHeader(value)),
      call(() => module.dueLabel({ due: value })),
    ];
  });

test("fvp: valid dates print exactly as before", () => {
  assert.deepEqual(outputs(final, VALID), outputs(original, VALID));
});

test("fvp: missing or unreadable dates print exactly as before", () => {
  assert.deepEqual(outputs(final, BROKEN), outputs(original, BROKEN));
  assert.equal(final.dueLabel({}), "no due date");
});

test("fvp: the date is formatted in one place", () => {
  const sources = readdirSync("src", { recursive: true })
    .map(String)
    .filter((path) => /\.[cm]?js$/.test(path))
    .map((path) => read(`src/${path}`))
    .join("\n")
    // Comments may name a date method without calling it.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  const builders = (sources.match(/getUTCMonth\(|toISOString\(|toLocaleDateString\(|DateTimeFormat\(/g) ?? []).length;
  assert.ok(builders <= 1, `the day is still assembled in ${builders} places`);
  assert.ok(fileAt("HEAD", "src/report.js"), "HEAD has src/report.js");
});

test("fvp: the existing tests still pass", () => {
  const result = headTestsPassOnFinalSource();
  assert.equal(result.status, 0, result.output);
});
