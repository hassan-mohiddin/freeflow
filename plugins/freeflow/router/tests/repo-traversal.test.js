import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { collectRepoTextFileRefs, matchesGeneratedPathGlob } from "../dist/repo-traversal.js";

test("repo traversal generated path glob subset matches documented semantics", () => {
  assert.equal(matchesGeneratedPathGlob("foo", "foo/**"), true);
  assert.equal(matchesGeneratedPathGlob("foo/a.txt", "foo/**"), true);
  assert.equal(matchesGeneratedPathGlob("foo/nested/a.txt", "foo/**"), true);
  assert.equal(matchesGeneratedPathGlob("bar/foo/a.txt", "foo/**"), false);

  assert.equal(matchesGeneratedPathGlob("foo/a.txt", "**/foo/**"), true);
  assert.equal(matchesGeneratedPathGlob("bar/foo/a.txt", "**/foo/**"), true);
  assert.equal(matchesGeneratedPathGlob("bar/baz/foo/a.txt", "**/foo/**"), true);
  assert.equal(matchesGeneratedPathGlob("foobar/a.txt", "**/foo/**"), false);

  assert.equal(matchesGeneratedPathGlob("README.md", "*.md"), true);
  assert.equal(matchesGeneratedPathGlob("docs/README.md", "*.md"), false);

  assert.equal(matchesGeneratedPathGlob("foo/a.md", "foo/*.md"), true);
  assert.equal(matchesGeneratedPathGlob("foo/nested/a.md", "foo/*.md"), false);

  assert.equal(matchesGeneratedPathGlob("foo/a.md", "foo/**/*.md"), true);
  assert.equal(matchesGeneratedPathGlob("foo/nested/a.md", "foo/**/*.md"), true);
  assert.equal(matchesGeneratedPathGlob("foo/nested/deeper/a.md", "foo/**/*.md"), true);
  assert.equal(matchesGeneratedPathGlob("bar/foo/a.md", "foo/**/*.md"), false);
});

test("repo traversal unsupported generated path glob syntax matches nothing", () => {
  const unsupportedPatterns = ["{foo,bar}/**", "!(foo)/**", "foo/[ab].md", "foo/**bar/*.md"];
  for (const pattern of unsupportedPatterns) {
    assert.equal(matchesGeneratedPathGlob("foo/a.md", pattern), false, pattern);
    assert.equal(matchesGeneratedPathGlob("bar/a.md", pattern), false, pattern);
  }
});

test("repo traversal skips configured generated glob broadly but allows explicit generated directories", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-repo-traversal-"));
  try {
    await mkdir(join(root, "custom-generated", "nested", "deeper"), { recursive: true });
    await writeFile(join(root, "target.md"), "source truth", "utf8");
    await writeFile(join(root, "custom-generated", "nested", "deeper", "decoy.md"), "generated markdown decoy", "utf8");
    await writeFile(join(root, "custom-generated", "nested", "keep.txt"), "generated text file", "utf8");

    const broad = await collectRepoTextFileRefs({
      root,
      generatedPathGlobs: ["custom-generated/**/*.md"],
    });
    const broadPaths = broad.map((file) => file.path).sort();

    assert.ok(broadPaths.includes("target.md"));
    assert.ok(broadPaths.includes("custom-generated/nested/keep.txt"));
    assert.ok(!broadPaths.includes("custom-generated/nested/deeper/decoy.md"));

    const explicit = await collectRepoTextFileRefs({
      root,
      requestedPath: "custom-generated",
      generatedPathGlobs: ["custom-generated/**/*.md"],
    });
    const explicitPaths = explicit.map((file) => file.path).sort();

    assert.deepEqual(explicitPaths, [
      "custom-generated/nested/deeper/decoy.md",
      "custom-generated/nested/keep.txt",
    ]);
    assert.equal(explicit.find((file) => file.path === "custom-generated/nested/deeper/decoy.md")?.sizeBytes, Buffer.byteLength("generated markdown decoy", "utf8"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
