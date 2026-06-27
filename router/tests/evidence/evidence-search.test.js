import assert from "node:assert/strict";
import test from "node:test";

import { searchRepoEvidenceCandidates } from "../../dist/evidence/evidence-search.js";

function file(path, text) {
  return {
    path,
    lines: text.split("\n"),
  };
}

test("evidence search prefers exact phrase evidence over high-frequency fallback", () => {
  const candidates = searchRepoEvidenceCandidates({
    files: [
      file("decoy.md", "Sandbox Permissions ".repeat(200)),
      file("docs/target.md", ["# Sandboxing", "", "The Sandbox Permissions flow is source truth."].join("\n")),
    ],
    query: "Sandbox Permissions flow",
    topK: 1,
    defaultContextLines: 2,
    queryCoverageMaxLines: 80,
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].file.path, "docs/target.md");
  assert.equal(candidates[0].lineIndex, 2);
  assert.deepEqual(candidates[0].range, { start: 1, end: 3 });
  assert.equal(candidates[0].reason, "matched exact normalized query phrase in section chunk");
  assert.equal(candidates[0].exactNormalizedPhrase, "sandbox permissions flow");
});

test("evidence search prefers symbol definitions over repeated usage decoys", () => {
  const candidates = searchRepoEvidenceCandidates({
    files: [
      file("src/evidence-search.ts", [
        "function EvidenceSearchCandidate() {",
        "  return buildCandidateFromSymbolDefinition();",
        "}",
      ].join("\n")),
      file("tests/evidence-search.test.ts", "EvidenceSearchCandidate ".repeat(80)),
    ],
    query: "EvidenceSearchCandidate implementation",
    topK: 1,
  });

  assert.equal(candidates[0].file.path, "src/evidence-search.ts");
  assert.deepEqual(candidates[0].range, { start: 1, end: 3 });
});

test("evidence search source and test priors follow query intent", () => {
  const files = [
    file("src/parser.ts", ["# Parser", "", "Parser facts emitted by source implementation."].join("\n")),
    file("tests/parser.test.ts", ["# Parser test", "", "Parser facts emitted should match expected output."].join("\n")),
  ];

  const sourceCandidates = searchRepoEvidenceCandidates({ files, query: "Parser facts emitted implementation", topK: 1 });
  assert.equal(sourceCandidates[0].file.path, "src/parser.ts");

  const testCandidates = searchRepoEvidenceCandidates({ files, query: "Parser facts emitted test should expected", topK: 1 });
  assert.equal(testCandidates[0].file.path, "tests/parser.test.ts");
});

test("evidence search prefers implementation modules over thin re-exports for compound symbol queries", () => {
  const candidates = searchRepoEvidenceCandidates({
    files: [
      file("src/index.ts", "export { searchRepoEvidenceCandidates } from './evidence-search';"),
      file("src/evidence-search.ts", [
        "function searchRepoEvidenceCandidates() {",
        "  return implementationCandidateSearch();",
        "}",
      ].join("\n")),
    ],
    query: "searchRepoEvidenceCandidates implementation module",
    topK: 1,
  });

  assert.equal(candidates[0].file.path, "src/evidence-search.ts");
});

test("evidence search de-dupes topK results by path", () => {
  const candidates = searchRepoEvidenceCandidates({
    files: [
      file("docs/target.md", ["# First", "alpha beta gamma", "# Second", "alpha beta gamma"].join("\n")),
      file("docs/other.md", ["# Other", "alpha beta gamma"].join("\n")),
    ],
    query: "alpha beta gamma",
    topK: 2,
  });

  assert.deepEqual(candidates.map((candidate) => candidate.file.path), ["docs/target.md", "docs/other.md"]);
});
