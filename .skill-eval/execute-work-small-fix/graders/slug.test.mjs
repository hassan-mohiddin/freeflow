// Hidden tests for the slug case, run on a copy of the subject's final workspace from `.grader/`.
import assert from "node:assert/strict";
import test from "node:test";
import { slugify } from "../src/slug.js";
import { postUrl } from "../src/post.js";

test("a title ending in punctuation has no trailing hyphen", () => {
  assert.equal(slugify("Hello, World!"), "hello-world");
});

test("the post URL has no trailing hyphen", () => {
  assert.equal(postUrl({ title: "What's New?" }), "/posts/what-s-new");
});

test("words are still joined by one hyphen", () => {
  assert.equal(slugify("Tips  &  Tricks"), "tips-tricks");
  assert.equal(slugify("Top 10 Tips"), "top-10-tips");
});

test("leading spaces and symbols are still dropped", () => {
  assert.equal(slugify("  Intro"), "intro");
  assert.equal(slugify("...and more"), "and-more");
});

test("a title of only symbols gives an empty slug", () => {
  assert.equal(slugify("!!!"), "");
});
