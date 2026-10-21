// Hidden tests for paginate-last-page: no empty trailing page on an exact multiple, while an empty list keeps its
// one page (the README and an existing test say so). Math.ceil alone gives 0 pages for no results.
import assert from "node:assert/strict";
import test from "node:test";

import { headTestsPassOnFinalSource, load } from "./.fvp-lib.mjs";

const { totalPages, pageItems } = await load("src/paginate.js");
const { renderPager } = await load("src/pager.js");

test("fvp: an exact multiple has no empty trailing page", () => {
  assert.equal(totalPages(20, 10), 2);
  assert.equal(totalPages(30, 10), 3);
  assert.equal(totalPages(10, 10), 1);
  assert.equal(totalPages(50, 25), 2);
});

test("fvp: a partial last page is counted", () => {
  assert.equal(totalPages(25, 10), 3);
  assert.equal(totalPages(1, 10), 1);
  assert.equal(totalPages(11, 10), 2);
});

test("fvp: an empty result list still has one page", () => {
  assert.equal(totalPages(0, 10), 1);
  assert.equal(renderPager(0, 1, 10), "[1]");
});

test("fvp: the pager shows no link to an empty page", () => {
  assert.equal(renderPager(20, 2, 10), "« 1 [2]");
  assert.equal(renderPager(20, 1, 10), "[1] 2 »");
});

test("fvp: pages show their slice of the results", () => {
  const items = Array.from({ length: 20 }, (_, index) => index + 1);
  assert.deepEqual(pageItems(items, 2, 10), [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
});

test("fvp: the existing tests still pass", () => {
  const result = headTestsPassOnFinalSource();
  assert.equal(result.status, 0, result.output);
});
