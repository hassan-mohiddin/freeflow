import assert from "node:assert/strict";
import { test } from "node:test";

import { exportCsv } from "../src/export.js";
import { importCsv } from "../src/import.js";

const entries = [
  { date: "2026-10-02", category: "food", description: "market, saturday", cents: 2310 },
  { date: "2026-10-03", category: "rent", description: "October", cents: 90000 },
];

test("the export has a header and one row per entry", () => {
  const lines = exportCsv(entries).trimEnd().split("\n");
  assert.equal(lines[0], "date,category,description,amount");
  assert.equal(lines.length, 3);
  assert.equal(lines[2], "2026-10-03,rent,October,900.00");
});

test("a description with a comma is quoted", () => {
  assert.equal(exportCsv(entries).split("\n")[1], '2026-10-02,food,"market, saturday",23.10');
});

test("an export of plain descriptions imports back", () => {
  const plain = [entries[1]];
  assert.deepEqual(importCsv(exportCsv(plain)).entries, plain);
});
