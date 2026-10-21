import assert from "node:assert/strict";
import test from "node:test";

import { contactsToCsv } from "../src/contacts.js";
import { toCsvRow } from "../src/csv.js";

test("a company with a comma stays in its own column", () => {
  const csv = contactsToCsv([{ name: "Tom", email: "tom@example.com", company: "Acme, Inc.", notes: null }]);
  assert.equal(csv.split("\n")[1], 'Tom,tom@example.com,"Acme, Inc.",');
});

test("quotes are doubled inside a quoted cell", () => {
  assert.equal(toCsvRow(['say "hi"']), '"say ""hi"""');
});

test("a line break keeps the cell quoted", () => {
  assert.equal(toCsvRow(["a\nb"]), '"a\nb"');
});
