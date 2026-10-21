import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { addBookmark, listBookmarks, normalizeUrl, removeBookmark } from "../src/store.js";

let home;
beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), "shelf-test-"));
  process.env.SHELF_HOME = home;
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

test("an added bookmark is listed", () => {
  addBookmark({ url: "https://example.com/a", title: "A", tags: "web" });
  assert.deepEqual(
    listBookmarks().map((bookmark) => bookmark.title),
    ["A"],
  );
});

test("bookmarks are listed newest first", () => {
  addBookmark({ url: "https://example.com/old", title: "Old", added: "2026-01-02T10:00:00.000Z" });
  addBookmark({ url: "https://example.com/new", title: "New", added: "2026-03-04T10:00:00.000Z" });
  assert.deepEqual(
    listBookmarks().map((bookmark) => bookmark.title),
    ["New", "Old"],
  );
});

test("list filters by tag", () => {
  addBookmark({ url: "https://example.com/a", title: "A", tags: "web,reading" });
  addBookmark({ url: "https://example.com/b", title: "B", tags: "cooking" });
  assert.deepEqual(
    listBookmarks({ tag: "reading" }).map((bookmark) => bookmark.title),
    ["A"],
  );
});

test("remove matches the URL however it was written", () => {
  addBookmark({ url: "https://www.example.com/a/", title: "A" });
  removeBookmark("http://example.com/a");
  assert.deepEqual(listBookmarks(), []);
  assert.equal(normalizeUrl("HTTPS://www.Example.com/x/"), "example.com/x");
});
