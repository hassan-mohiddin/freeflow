import assert from "node:assert/strict";
import test from "node:test";

import { totalPages } from "../src/paginate.js";
import { renderPager } from "../src/pager.js";

test("an exact multiple of the page size has no empty last page", () => {
  assert.equal(totalPages(20, 10), 2);
  assert.equal(renderPager(20, 2, 10), "« 1 [2]");
});
