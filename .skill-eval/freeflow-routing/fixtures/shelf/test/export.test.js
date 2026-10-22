import assert from "node:assert/strict";
import { test } from "node:test";

import { exportBookmarks } from "../src/export.js";

const shelf = [{ url: "https://example.com/a", title: "A", tags: "web", added: "2026-03-04" }];

test("csv has a header and one row per bookmark", () => {
  assert.equal(exportBookmarks(shelf, "csv"), "url,title,tags,added\nhttps://example.com/a,A,web,2026-03-04\n");
});

test("json is the bookmarks as stored", () => {
  assert.deepEqual(JSON.parse(exportBookmarks(shelf, "json")), shelf);
});

test("tsv separates columns with tabs and keeps tabs out of cells", () => {
  const text = exportBookmarks([{ ...shelf[0], title: "A\tB" }], "tsv");
  assert.equal(text, "url\ttitle\ttags\tadded\nhttps://example.com/a\tA B\tweb\t2026-03-04\n");
});
