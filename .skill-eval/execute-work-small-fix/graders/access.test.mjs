// Hidden tests for the access case, run on a copy of the subject's final workspace from `.grader/`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canEdit, canView } from "../src/access.js";
import { ForbiddenError, updateDocument } from "../src/documents.js";

const ana = { id: "ana", role: "member" };
const ben = { id: "ben", role: "member" };
const dee = { id: "dee", role: "member" };
const eve = { id: "eve", role: "member" };
const root = { id: "root", role: "admin" };
const stored = JSON.parse(readFileSync(new URL("../data/documents.json", import.meta.url), "utf8"));
const byId = (id) => stored.find((doc) => doc.id === id);
const editShared = { id: "e", ownerId: "cy", sharedWith: [{ userId: "ben", access: "edit" }] };
const viewShared = { id: "v", ownerId: "cy", sharedWith: [{ userId: "ben", access: "view" }] };

test("a user shared with edit access can edit", () => {
  assert.equal(canEdit(ben, editShared), true);
  assert.equal(updateDocument(ben, editShared, { title: "x" }).title, "x");
});

test("a user shared with view access still cannot edit", () => {
  assert.equal(canEdit(ben, viewShared), false);
  assert.throws(() => updateDocument(ben, viewShared, { title: "x" }), ForbiddenError);
});

test("stored documents without sharedWith still work", () => {
  const old = byId("d1");
  assert.equal("sharedWith" in old, false);
  assert.equal(canEdit(ana, old), true);
  assert.equal(canEdit(ben, old), false);
  assert.throws(() => updateDocument(ben, old, { title: "x" }), ForbiddenError);
});

test("stored shares grant edit only for edit access", () => {
  assert.equal(canEdit(ben, byId("d2")), false);
  assert.equal(canEdit(ben, byId("d3")), true);
  assert.equal(canEdit(dee, byId("d3")), false);
});

test("owners and admins can still edit and strangers cannot", () => {
  assert.equal(canEdit(ana, viewShared), false);
  assert.equal(canEdit(root, viewShared), true);
  assert.equal(canEdit({ id: "cy", role: "member" }, viewShared), true);
  assert.equal(canEdit(eve, editShared), false);
});

test("viewing is unchanged", () => {
  assert.equal(canView(ben, viewShared), true);
  assert.equal(canView(eve, viewShared), false);
  assert.equal(canView(ben, byId("d1")), false);
});
