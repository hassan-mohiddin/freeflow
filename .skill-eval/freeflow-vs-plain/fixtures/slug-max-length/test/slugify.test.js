import assert from "node:assert/strict";
import test from "node:test";

import { slugify } from "../src/slugify.js";

test("lowercases and joins words with hyphens", () => {
  assert.equal(slugify("Hello World"), "hello-world");
});

test("strips accents and punctuation", () => {
  assert.equal(slugify("Crème Brûlée: A Recipe!"), "creme-brulee-a-recipe");
});

test("uses a custom separator", () => {
  assert.equal(slugify("Hello World", { separator: "_" }), "hello_world");
});

test("collapses runs of spaces and symbols", () => {
  assert.equal(slugify("  a -- b  "), "a-b");
});
