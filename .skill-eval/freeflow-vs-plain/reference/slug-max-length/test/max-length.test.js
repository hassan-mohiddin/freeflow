import assert from "node:assert/strict";
import test from "node:test";

import { slugify } from "../src/slugify.js";

test("maxLength cuts back to the last whole word", () => {
  assert.equal(slugify("The Quick Brown Fox Jumps", { maxLength: 15 }), "the-quick-brown");
  assert.equal(slugify("hello world again", { maxLength: 12 }), "hello-world");
});

test("a slug within maxLength is unchanged", () => {
  assert.equal(slugify("hello world", { maxLength: 11 }), "hello-world");
});
