import assert from "node:assert/strict";
import { test } from "node:test";

import { reserve, ship } from "../src/inventory.js";
import { openWarehouse } from "./warehouse.mjs";

test("shipping takes units off the shelf and the reservation", async () => {
  const stock = await openWarehouse();
  reserve(stock, "mug-blue", 4);
  ship(stock, "mug-blue", 4);
  assert.deepEqual(stock.get("mug-blue"), { onHand: 6, reserved: 0 });
});
