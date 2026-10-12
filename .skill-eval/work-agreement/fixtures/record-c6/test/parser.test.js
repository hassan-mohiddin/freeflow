import assert from "node:assert/strict";
import test from "node:test";
import { parseLine } from "../src/parser.js";

test("splits plain fields", () => {
  assert.deepEqual(parseLine("a,b,c"), ["a", "b", "c"]);
});

test("strips quotes around a field", () => {
  assert.deepEqual(parseLine('"a",b'), ["a", "b"]);
});

test("keeps a comma inside a quoted field", () => {
  assert.deepEqual(parseLine('"Smith, Jane",42'), ["Smith, Jane", "42"]);
});
