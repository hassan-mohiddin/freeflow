import assert from "node:assert/strict";
import { test } from "node:test";

import { available, reserve } from "../src/inventory.js";
import { openWarehouse } from "./warehouse.mjs";

test("everything on hand is available at the start", async () => {
  const stock = await openWarehouse();
  assert.equal(available(stock, "mug-blue"), 10);
});

test("reserved units are no longer available", async () => {
  const stock = await openWarehouse();
  reserve(stock, "mug-blue", 3);
  assert.equal(available(stock, "mug-blue"), 7);
});
