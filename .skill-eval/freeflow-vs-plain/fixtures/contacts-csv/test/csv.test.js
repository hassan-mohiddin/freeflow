import assert from "node:assert/strict";
import test from "node:test";

import { contactsToCsv } from "../src/contacts.js";
import { toCsvRow } from "../src/csv.js";

test("cells are joined with commas", () => {
  assert.equal(toCsvRow(["a", "b", "c"]), "a,b,c");
});

test("null and undefined become empty cells", () => {
  assert.equal(toCsvRow(["a", null, undefined, "d"]), "a,,,d");
});

test("contacts export with a header line", () => {
  const csv = contactsToCsv([{ name: "Ann", email: "ann@example.com", company: "Initech", notes: "" }]);
  assert.equal(csv, "name,email,company,notes\nAnn,ann@example.com,Initech,\n");
});
