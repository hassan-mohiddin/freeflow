// Hidden tests for dedupe-contacts-py (Python, run through python3): keep the first contact per email, keep the
// original order, and match emails regardless of case. Contacts without an email, and whether the kept email's
// case changes, are not specified and not tested.
import assert from "node:assert/strict";
import test from "node:test";

import { headTestsPassOnFinalSource, python } from "./.fvp-lib.mjs";

const dedupe = (contacts) =>
  python(
    `from dedupe import dedupe_contacts\nprint(json.dumps(dedupe_contacts(json.loads(${JSON.stringify(JSON.stringify(contacts))}))))`,
  );
const names = (contacts) => dedupe(contacts).map((contact) => contact.name);

test("fvp: the first contact with an email is kept", () => {
  assert.deepEqual(
    names([
      { name: "Ann (first)", email: "ann@example.com" },
      { name: "Ann (second)", email: "ann@example.com" },
    ]),
    ["Ann (first)"],
  );
});

test("fvp: contacts keep their original order", () => {
  assert.deepEqual(
    names([
      { name: "Raj", email: "raj@example.com" },
      { name: "Ann", email: "ann@example.com" },
      { name: "Raj again", email: "raj@example.com" },
      { name: "Zoe", email: "zoe@example.com" },
      { name: "Ann again", email: "ann@example.com" },
    ]),
    ["Raj", "Ann", "Zoe"],
  );
});

test("fvp: emails match regardless of case", () => {
  assert.deepEqual(
    names([
      { name: "Bob", email: "Bob@Example.com" },
      { name: "bob", email: "bob@example.com" },
      { name: "BOB", email: "BOB@EXAMPLE.COM" },
      { name: "Bea", email: "bea@example.com" },
    ]),
    ["Bob", "Bea"],
  );
});

test("fvp: contacts with different emails are all kept", () => {
  const contacts = ["a", "b", "c", "d"].map((name) => ({ name, email: `${name}@example.com`, phone: "1" }));
  assert.deepEqual(dedupe(contacts), contacts);
});

test("fvp: the existing tests still pass", () => {
  const result = headTestsPassOnFinalSource();
  assert.equal(result.status, 0, result.output);
});
