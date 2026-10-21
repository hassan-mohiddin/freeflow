import assert from "node:assert/strict";
import { test } from "node:test";

import { reserve } from "../src/inventory.js";
import { openWarehouse } from "./warehouse.mjs";

test("unknown SKUs and odd quantities are refused", async () => {
  const stock = await openWarehouse();
  assert.throws(() => reserve(stock, "spoon", 1), /unknown SKU spoon/);
  assert.throws(() => reserve(stock, "kettle", 0), /positive whole number/);
  assert.throws(() => reserve(stock, "kettle", 1.5), /positive whole number/);
});
