import assert from "node:assert/strict";
import test from "node:test";
import { canEdit, canView } from "../src/access.js";
import { share } from "../src/share.js";
import { ForbiddenError, updateDocument } from "../src/documents.js";

const ana = { id: "ana", role: "member" };
const ben = { id: "ben", role: "member" };
const root = { id: "root", role: "admin" };
const doc = { id: "d", ownerId: "ana", title: "Plan", sharedWith: [] };

test("the owner and admins can edit", () => {
  assert.equal(canEdit(ana, doc), true);
  assert.equal(canEdit(root, doc), true);
});

test("a user the document is not shared with cannot edit", () => {
  assert.equal(canEdit(ben, doc), false);
  assert.throws(() => updateDocument(ben, doc, { title: "x" }), ForbiddenError);
});

test("a user the document is shared with can view it", () => {
  assert.equal(canView(ben, share(doc, "ben", "view")), true);
  assert.equal(canView(ben, doc), false);
});

test("the owner's changes are saved", () => {
  assert.equal(updateDocument(ana, doc, { title: "Plan v2" }).title, "Plan v2");
});
