import assert from "node:assert/strict";
import test from "node:test";

import { contactsToCsv } from "../src/contacts.js";
import { toCsvRow } from "../src/csv.js";

test("cells are joined with commas", () => {
  assert.equal(toCsvRow(["a", "b", "c"]), "a,b,c");
});

test("contacts export with a header line", () => {
  const csv = contactsToCsv([{ name: "Ann", email: "ann@example.com", company: "Initech" }]);
  assert.equal(csv, "name,email,company\nAnn,ann@example.com,Initech\n");
});
