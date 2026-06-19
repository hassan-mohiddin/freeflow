import assert from "node:assert/strict";
import test from "node:test";

import { buildBoundedEdgeChunks, buildBoundedExcerpt } from "../dist/bounded-evidence.js";

const testCaps = {
  queryExcerptMaxBytes: 220,
  linePreviewMaxBytes: 90,
  expandLines30MaxBytes: 400,
  expandLines30MaxLines: 8,
  expandLines80MaxBytes: 800,
  expandLines80MaxLines: 16,
  exactChunkMaxBytes: 180,
};

test("bounded evidence anchors an exact phrase spanning huge lines", () => {
  const lines = [
    "# Target",
    `${"filler ".repeat(120)}alpha`,
    `beta ${"filler ".repeat(120)}`,
    "tail",
  ];

  const result = buildBoundedExcerpt({
    lines,
    range: { start: 1, end: lines.length },
    window: "small",
    caps: testCaps,
    exactNormalizedPhrase: "alpha beta",
  });

  assert.equal(result.linesLabel, "1-4");
  assert.equal(result.truncatedByLineCap, false);
  assert.equal(result.truncatedByByteCap, true);
  assert.match(result.excerpt, /alpha\s+beta/);
  assert.ok(Buffer.byteLength(result.excerpt, "utf8") <= testCaps.queryExcerptMaxBytes);
});

test("bounded evidence builds head and tail chunks for a huge single line", () => {
  const lines = [`HEAD_MARKER ${"middle ".repeat(120)}TAIL_MARKER`];

  const chunks = buildBoundedEdgeChunks({
    lines,
    range: { start: 1, end: 1 },
    caps: testCaps,
  });

  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].edge, "head");
  assert.equal(chunks[0].linesLabel, "1-1");
  assert.match(chunks[0].excerpt, /HEAD_MARKER/);
  assert.doesNotMatch(chunks[0].excerpt, /TAIL_MARKER/);
  assert.equal(chunks[1].edge, "tail");
  assert.equal(chunks[1].linesLabel, "1-1");
  assert.match(chunks[1].excerpt, /TAIL_MARKER/);
  assert.ok(Buffer.byteLength(chunks[0].excerpt, "utf8") <= testCaps.exactChunkMaxBytes);
  assert.ok(Buffer.byteLength(chunks[1].excerpt, "utf8") <= testCaps.exactChunkMaxBytes);
});

test("bounded evidence reports line cap truncation for expanded windows", () => {
  const lines = Array.from({ length: 8 }, (_, index) => `line ${index + 1}`);

  const result = buildBoundedExcerpt({
    lines,
    range: { start: 1, end: 8 },
    window: "lines_30",
    caps: { ...testCaps, expandLines30MaxLines: 3 },
  });

  assert.equal(result.linesLabel, "1-3");
  assert.equal(result.truncatedByLineCap, true);
  assert.equal(result.truncatedByByteCap, false);
  assert.equal(result.excerpt, "line 1\nline 2\nline 3");
});
