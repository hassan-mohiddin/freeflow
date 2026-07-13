import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.mjs";

test("malformed input is rejected", () => {
  const store = createStore();
  assert.equal(store.publish("not-json").status, "rejected");
});
