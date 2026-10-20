import assert from "node:assert/strict";
import test from "node:test";
import { slugify } from "../src/slug.js";
import { postUrl } from "../src/post.js";

test("lowercases and joins words with a hyphen", () => {
  assert.equal(slugify("Getting Started"), "getting-started");
});

test("collapses runs of spaces and symbols", () => {
  assert.equal(slugify("Tips  &  Tricks"), "tips-tricks");
});

test("drops leading spaces", () => {
  assert.equal(slugify("  Intro"), "intro");
});

test("builds the post URL from the title", () => {
  assert.equal(postUrl({ title: "Release Notes" }), "/posts/release-notes");
});
