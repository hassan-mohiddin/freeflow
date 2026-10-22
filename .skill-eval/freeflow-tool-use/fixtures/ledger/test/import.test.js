import assert from "node:assert/strict";
import { test } from "node:test";

import { importCsv } from "../src/import.js";

test("rows become entries in cents", () => {
  const { entries, skipped } = importCsv("date,category,description,amount\n2026-10-02,food,market,23.10\n");
  assert.deepEqual(entries, [{ date: "2026-10-02", category: "food", description: "market", cents: 2310 }]);
  assert.deepEqual(skipped, []);
});
