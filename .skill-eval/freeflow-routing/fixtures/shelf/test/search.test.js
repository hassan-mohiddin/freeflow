import assert from "node:assert/strict";
import { test } from "node:test";

import { search } from "../src/search.js";

const shelf = [
  { url: "https://example.com/node-streams", title: "Node Streams Explained", tags: "node", added: "2026-01-01" },
  { url: "https://blog.example.org/tea", title: "A History of Tea", tags: "food", added: "2026-01-02" },
];

test("search matches titles regardless of case", () => {
  assert.deepEqual(
    search(shelf, "STREAMS").map((bookmark) => bookmark.title),
    ["Node Streams Explained"],
  );
});

test("search matches URLs", () => {
  assert.deepEqual(
    search(shelf, "blog.example").map((bookmark) => bookmark.title),
    ["A History of Tea"],
  );
});

test("every word must match", () => {
  assert.deepEqual(search(shelf, "tea streams"), []);
});
