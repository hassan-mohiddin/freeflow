import assert from "node:assert/strict";
import test from "node:test";

import { pageSize } from "../src/config.js";
import { listPage } from "../src/list.js";

test("the default page size is 20", () => {
  assert.equal(pageSize(), 20);
});

test("a page shows its issues and a footer", () => {
  const issues = [1, 2, 3].map((id) => ({ id, title: `issue ${id}` }));
  assert.deepEqual(listPage(issues, 2, 2), ["#3  issue 3", "page 2 of 2 (3 issues)"]);
});
