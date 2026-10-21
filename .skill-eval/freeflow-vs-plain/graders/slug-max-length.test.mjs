// Hidden tests for slug-max-length: the README's maxLength option and --max-length flag. What happens when the
// first word alone is longer than maxLength is not specified, so no test depends on it.
import assert from "node:assert/strict";
import test from "node:test";

import { headTestsPassOnFinalSource, load, run } from "./.fvp-lib.mjs";

const { slugify } = await load("src/slugify.js");

test("fvp: the README example cuts at the last whole word", () => {
  assert.equal(slugify("The Quick Brown Fox Jumps", { maxLength: 15 }), "the-quick-brown");
});

test("fvp: a word is never cut in half", () => {
  assert.equal(slugify("hello world again", { maxLength: 13 }), "hello-world");
  assert.equal(slugify("hello world again", { maxLength: 7 }), "hello");
});

test("fvp: a cut slug never ends with a separator", () => {
  assert.equal(slugify("hello world again", { maxLength: 12 }), "hello-world");
  assert.equal(slugify("hello world again", { maxLength: 6 }), "hello");
});

test("fvp: a slug that fits is unchanged", () => {
  assert.equal(slugify("hello world", { maxLength: 11 }), "hello-world");
  assert.equal(slugify("hello world", { maxLength: 50 }), "hello-world");
});

test("fvp: maxLength counts a custom separator", () => {
  assert.equal(slugify("one two three", { maxLength: 9, separator: "--" }), "one--two");
  assert.equal(slugify("one two three", { maxLength: 7, separator: "--" }), "one");
});

test("fvp: without maxLength nothing is cut", () => {
  const long = "a ".repeat(200).trim();
  assert.equal(slugify(long), "a-".repeat(199) + "a");
});

test("fvp: the command line takes --max-length", () => {
  const result = run("node", ["bin/slugify.js", "--max-length", "15", "The Quick Brown Fox Jumps"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "the-quick-brown\n");
  const both = run("node", ["bin/slugify.js", "--separator", "_", "--max-length", "11", "Hello Big World"]);
  assert.equal(both.stdout, "hello_big\n");
});

test("fvp: the existing tests still pass", () => {
  const result = headTestsPassOnFinalSource();
  assert.equal(result.status, 0, result.output);
});
