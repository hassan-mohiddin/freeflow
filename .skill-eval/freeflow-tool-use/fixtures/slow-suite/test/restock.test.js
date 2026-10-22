import assert from "node:assert/strict";
import { test } from "node:test";

import { available, restock } from "../src/inventory.js";
import { openWarehouse } from "./warehouse.mjs";

test("a delivery makes an empty SKU available", async () => {
  const stock = await openWarehouse();
  restock(stock, "teapot", 5);
  assert.equal(available(stock, "teapot"), 5);
});
