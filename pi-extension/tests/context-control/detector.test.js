import assert from "node:assert/strict";
import test from "node:test";

import {
  detectExplicitEvidenceNeed,
  isHistoricalEvidencePrompt,
} from "../../dist/context-control/recovery/detector.js";

function source(overrides = {}) {
  return {
    ref: "ctx:tool-1",
    identity: { sessionId: "session-1", entryId: "tool-1", toolCallId: "call-1", toolName: "read" },
    content: "export const VALUE = 1;",
    contentHash: "a".repeat(64),
    characters: 23,
    toolName: "read",
    path: "src/a.ts",
    commandKind: "other",
    cwd: "/repo",
    branchId: "branch-1",
    sequence: 1,
    turn: 1,
    coverage: { kind: "full" },
    consumed: true,
    metadataComplete: true,
    metadataIssues: [],
    activeContext: false,
    ...overrides,
  };
}

test("explicit detector recognizes a source-specific historical exact need", () => {
  assert.equal(isHistoricalEvidencePrompt("What exact value did we find earlier in src/a.ts?"), true);
  const result = detectExplicitEvidenceNeed("What exact value did we find earlier in src/a.ts?", [source()]);
  assert.equal(result.status, "candidate");
  assert.equal(result.need.exactRequired, true);
  assert.equal(result.need.temporal, "historical");
});

test("explicit detector abstains on vague, current-only, unconsumed, and incomplete sources", () => {
  assert.equal(detectExplicitEvidenceNeed("What did we find earlier?", [source()]).status, "none");
  assert.equal(detectExplicitEvidenceNeed("Read the current src/a.ts and update it.", [source()]).status, "none");
  assert.equal(
    detectExplicitEvidenceNeed("What exact value did we find earlier in src/a.ts?", [source({ consumed: false })])
      .status,
    "none",
  );
  assert.equal(
    detectExplicitEvidenceNeed("What exact value did we find earlier in src/a.ts?", [
      source({ metadataComplete: false }),
    ]).status,
    "none",
  );
});
