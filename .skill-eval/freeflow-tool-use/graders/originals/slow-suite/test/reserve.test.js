import assert from "node:assert/strict";
import { test } from "node:test";

import { reserve } from "../src/inventory.js";
import { openWarehouse } from "./warehouse.mjs";

test("a reservation within stock succeeds", async () => {
  const stock = await openWarehouse();
  reserve(stock, "kettle", 2);
  assert.equal(stock.get("kettle").reserved, 2);
});

test("reserving more than is available is refused", async () => {
  const stock = await openWarehouse();
  reserve(stock, "mug-red", 3);
  assert.throws(() => reserve(stock, "mug-red", 2), /only 1 of mug-red available/);
});
