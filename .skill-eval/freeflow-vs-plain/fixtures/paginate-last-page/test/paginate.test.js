import assert from "node:assert/strict";
import test from "node:test";

import { pageItems, totalPages } from "../src/paginate.js";
import { renderPager } from "../src/pager.js";

test("a partial last page counts as a page", () => {
  assert.equal(totalPages(25, 10), 3);
});

test("an empty result list still has one page", () => {
  assert.equal(totalPages(0, 10), 1);
});

test("a page shows its slice of the results", () => {
  const items = Array.from({ length: 25 }, (_, index) => index + 1);
  assert.deepEqual(pageItems(items, 3, 10), [21, 22, 23, 24, 25]);
});

test("the pager brackets the current page", () => {
  assert.equal(renderPager(25, 2, 10), "« 1 [2] 3 »");
});
