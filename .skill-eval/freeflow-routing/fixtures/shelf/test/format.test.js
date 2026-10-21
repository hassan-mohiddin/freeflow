import assert from "node:assert/strict";
import { test } from "node:test";

import { fmtDate, formatList, padTitle } from "../src/format.js";

test("dates print as YYYY-MM-DD", () => {
  assert.equal(fmtDate("2026-03-04T10:00:00.000Z"), "2026-03-04");
});

test("long titles are cut with an ellipsis", () => {
  assert.equal(padTitle("abcdef", 4), "abc…");
  assert.equal(padTitle("ab", 4), "ab  ");
});

test("list prints one line per bookmark", () => {
  const text = formatList([{ url: "https://example.com", title: "Example", added: "2026-03-04T10:00:00.000Z" }], {});
  assert.equal(text, `2026-03-04  ${"Example".padEnd(40)}  https://example.com\n`);
});

test("an empty shelf says so", () => {
  assert.equal(formatList([], {}), "Your shelf is empty.\n");
});
