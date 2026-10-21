// Hidden tests for contacts-csv: cells holding a comma, a quote or a line break are quoted (RFC 4180), and the
// export reads back as the same contacts.
import assert from "node:assert/strict";
import test from "node:test";

import { headTestsPassOnFinalSource, load, run } from "./.fvp-lib.mjs";

const { toCsvRow } = await load("src/csv.js");
const { contactsToCsv } = await load("src/contacts.js");

// A strict RFC 4180 reader: quoted cells may hold commas, doubled quotes and line breaks.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || (char === "\r" && text[index + 1] === "\n")) {
      if (char === "\r") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell !== "" || row.length > 0) rows.push([...row, cell]);
  return rows;
}

test("fvp: a cell with a comma is quoted", () => {
  assert.equal(toCsvRow(["Tom", "Acme, Inc."]), 'Tom,"Acme, Inc."');
});

test("fvp: a quote inside a cell is doubled and the cell quoted", () => {
  assert.equal(toCsvRow(['prefers "Dr. Fischer"']), '"prefers ""Dr. Fischer"""');
});

test("fvp: a cell with a line break is quoted", () => {
  assert.equal(toCsvRow(["line one\nline two", "x"]), '"line one\nline two",x');
});

test("fvp: plain cells stay unquoted", () => {
  assert.equal(toCsvRow(["Ann", "ann@example.com", "", null]), "Ann,ann@example.com,,");
});

test("fvp: the export reads back as the same contacts", () => {
  const contacts = [
    { name: "Tom Okafor", email: "tom@example.com", company: "Acme, Inc.", notes: "call after 3pm, not before" },
    { name: "Lena Fischer", email: "lena@example.com", company: "Fischer & Sons", notes: 'said "maybe"\nfollow up' },
    { name: "Ann", email: "ann@example.com", company: "Initech", notes: null },
  ];
  const rows = parseCsv(contactsToCsv(contacts));
  assert.deepEqual(rows[0], ["name", "email", "company", "notes"]);
  assert.deepEqual(
    rows.slice(1),
    contacts.map((contact) => [contact.name, contact.email, contact.company, contact.notes ?? ""]),
  );
});

test("fvp: the command line export of the example has four cells on every line", () => {
  const result = run("node", ["bin/export.js", "examples/contacts.json"]);
  assert.equal(result.status, 0, result.stderr);
  const rows = parseCsv(result.stdout);
  assert.equal(rows.length, 4);
  for (const row of rows) assert.equal(row.length, 4, JSON.stringify(row));
  assert.equal(rows[2][2], "Acme, Inc.");
});

test("fvp: the existing tests still pass", () => {
  const result = headTestsPassOnFinalSource();
  assert.equal(result.status, 0, result.output);
});
