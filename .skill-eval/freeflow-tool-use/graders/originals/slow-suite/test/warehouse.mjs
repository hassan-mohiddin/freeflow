// Test helper: a warehouse as the tests expect it after the day's opening replay, which is what makes them slow.
import { createStock } from "../src/inventory.js";

export async function openWarehouse() {
  await new Promise((resolve) => setTimeout(resolve, 24_000));
  return createStock({ "mug-blue": 10, "mug-red": 4, kettle: 2, teapot: 0 });
}
