import assert from "node:assert/strict";
import test from "node:test";

import { selectEvidenceRangeForChunk } from "../../dist/evidence/evidence-range-selector.js";

test("evidence range selector anchors exact phrase before high-frequency fallback lines", () => {
  const lines = [
    "# Target",
    `${"alpha ".repeat(400)}gamma beta separated high frequency line`,
    "alpha appears early",
    "filler 0",
    "filler 1",
    "filler 2",
    "filler 3",
    "filler 4",
    "filler 5",
    "alpha beta exact phrase lives here",
  ];

  const selection = selectEvidenceRangeForChunk({
    lines,
    chunkRange: { start: 1, end: lines.length },
    chunkKind: "section",
    queryTokens: ["alpha", "beta"],
    normalizedQueryPhrase: "alpha beta",
    chunkHasExactPhrase: true,
    defaultContextLines: 2,
    queryCoverageMaxLines: 80,
  });

  assert.equal(selection.matchKind, "exact-phrase");
  assert.equal(selection.anchorLine, 10);
  assert.deepEqual(selection.range, { start: 8, end: 10 });
});

test("evidence range selector anchors exact phrases even in short section chunks", () => {
  const lines = [
    "# Target",
    "alpha filler 1",
    "alpha filler 2",
    "alpha filler 3",
    "alpha filler 4",
    "alpha filler 5",
    "alpha filler 6",
    "omega beta exact phrase lives here",
  ];

  const selection = selectEvidenceRangeForChunk({
    lines,
    chunkRange: { start: 1, end: lines.length },
    chunkKind: "section",
    queryTokens: ["omega", "beta", "exact", "phrase"],
    normalizedQueryPhrase: "omega beta exact phrase",
    chunkHasExactPhrase: true,
    defaultContextLines: 2,
    queryCoverageMaxLines: 80,
  });

  assert.equal(selection.matchKind, "exact-phrase");
  assert.equal(selection.anchorLine, 8);
  assert.deepEqual(selection.range, { start: 6, end: 8 });
});

test("evidence range selector narrows long symbol exact phrase ranges around the phrase", () => {
  const lines = ["pub fn anchored_symbol() {"];
  for (let index = 0; index < 76; index += 1) {
    lines.push(`    let filler_${index} = \"${"alpha filler ".repeat(12)}\";`);
  }
  lines.push("    let marker = \"omega beta exact phrase lives here\";");
  lines.push("}");

  const selection = selectEvidenceRangeForChunk({
    lines,
    chunkRange: { start: 1, end: lines.length },
    chunkKind: "symbol",
    queryTokens: ["omega", "beta", "exact", "phrase"],
    normalizedQueryPhrase: "omega beta exact phrase",
    chunkHasExactPhrase: true,
    defaultContextLines: 2,
    queryCoverageMaxLines: 80,
  });

  assert.equal(selection.matchKind, "exact-phrase");
  assert.equal(selection.anchorLine, 78);
  assert.deepEqual(selection.range, { start: 76, end: 79 });
});

test("evidence range selector uses coverage when no exact phrase exists", () => {
  const lines = [
    "# Target",
    "alpha appears here",
    "filler 0",
    "filler 1",
    "filler 2",
    "filler 3",
    "filler 4",
    "filler 5",
    "beta appears here",
    "tail",
  ];

  const selection = selectEvidenceRangeForChunk({
    lines,
    chunkRange: { start: 1, end: lines.length },
    chunkKind: "section",
    queryTokens: ["alpha", "beta"],
    normalizedQueryPhrase: "alpha beta",
    chunkHasExactPhrase: false,
    defaultContextLines: 1,
    queryCoverageMaxLines: 80,
  });

  assert.equal(selection.matchKind, "coverage");
  assert.deepEqual(selection.range, { start: 1, end: 10 });
});

test("evidence range selector expands section coverage to include introduced fenced code", () => {
  const lines = [
    "### Fetch Data with Cleanup Function in React useEffect",
    "",
    "Demonstrates cleanup with an ignore flag for stale responses.",
    "",
    "```javascript",
    "useEffect(() => {",
    "  let ignore = false;",
    "  return () => {",
    "    ignore = true;",
    "  };",
    "}, [userId]);",
    "```",
  ];

  const selection = selectEvidenceRangeForChunk({
    lines,
    chunkRange: { start: 1, end: lines.length },
    chunkKind: "section",
    queryTokens: ["useeffect", "cleanup", "ignore", "stale", "responses"],
    normalizedQueryPhrase: "useeffect cleanup ignore stale responses",
    chunkHasExactPhrase: false,
    defaultContextLines: 2,
    queryCoverageMaxLines: 80,
  });

  assert.equal(selection.matchKind, "coverage");
  assert.deepEqual(selection.range, { start: 1, end: 12 });
});

test("evidence range selector returns capped coverage instead of tiny fallback when split terms exceed cap", () => {
  const lines = ["# alpha heading", ...Array.from({ length: 118 }, (_, index) => `filler ${index}`), "omega appears late"];

  const selection = selectEvidenceRangeForChunk({
    lines,
    chunkRange: { start: 1, end: lines.length },
    chunkKind: "section",
    queryTokens: ["alpha", "omega"],
    normalizedQueryPhrase: "alpha omega",
    chunkHasExactPhrase: false,
    defaultContextLines: 2,
    queryCoverageMaxLines: 80,
  });

  assert.equal(selection.matchKind, "coverage");
  assert.deepEqual(selection.range, { start: 1, end: 80 });
});

test("evidence range selector does not expand oversized fenced code blocks past cap", () => {
  const lines = ["# Target", "alpha beta", "```js", ...Array.from({ length: 20 }, (_, index) => `line ${index}`), "```"];

  const selection = selectEvidenceRangeForChunk({
    lines,
    chunkRange: { start: 1, end: lines.length },
    chunkKind: "section",
    queryTokens: ["alpha", "beta"],
    normalizedQueryPhrase: "alpha beta",
    chunkHasExactPhrase: false,
    defaultContextLines: 1,
    queryCoverageMaxLines: 6,
  });

  assert.equal(selection.matchKind, "coverage");
  assert.deepEqual(selection.range, { start: 1, end: 3 });
});
