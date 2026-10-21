// Hidden test for slow-suite: the inventory rules the slow suite checks, without its slow start, and the suite's own
// tests left as they were (the fix belongs in the code).
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

const { available, createStock, reserve, restock, ship } = await import(`${process.cwd()}/src/inventory.js`);
const open = () => createStock({ "mug-blue": 10, "mug-red": 4, kettle: 2, teapot: 0 });

test("ftu: reserved units are no longer available", () => {
  const stock = open();
  reserve(stock, "mug-blue", 3);
  assert.equal(available(stock, "mug-blue"), 7);
});

test("ftu: reserving more than is available is refused", () => {
  const stock = open();
  reserve(stock, "mug-red", 3);
  assert.throws(() => reserve(stock, "mug-red", 2), /only 1 of mug-red available/);
  reserve(stock, "mug-red", 1);
  assert.equal(available(stock, "mug-red"), 0);
});

test("ftu: shipping, restocking and validation still work", () => {
  const stock = open();
  reserve(stock, "mug-blue", 4);
  ship(stock, "mug-blue", 4);
  assert.deepEqual(stock.get("mug-blue"), { onHand: 6, reserved: 0 });
  restock(stock, "teapot", 5);
  assert.equal(available(stock, "teapot"), 5);
  assert.throws(() => reserve(stock, "spoon", 1), /unknown SKU spoon/);
  assert.throws(() => reserve(stock, "kettle", 0), /positive whole number/);
});

test("ftu: the suite's tests are unchanged", () => {
  const original = readdirSync(".ftu-original/test").sort();
  assert.deepEqual(readdirSync("test").sort(), original);
  for (const file of original) {
    assert.equal(readFileSync(`test/${file}`, "utf8"), readFileSync(`.ftu-original/test/${file}`, "utf8"), file);
  }
});
