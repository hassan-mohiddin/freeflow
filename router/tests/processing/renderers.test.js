import assert from "node:assert/strict";
import test from "node:test";

import { classifyProcessingRecovery, renderProcessingResult } from "../../dist/processing/renderers.js";

const source = {
  kind: "repo-file",
  ref: { kind: "repo", path: "fixtures/access.log" },
  displayPath: "fixtures/access.log",
};

const stats = {
  bytes: 46_216,
  lines: 500,
  sha256: "0".repeat(64),
};

const reducer = {
  status: "selected",
  candidates: [{ name: "access-log", version: "1", confidence: 1, reason: "matched" }],
  selected: { name: "access-log", version: "1", confidence: 1, reason: "matched" },
  result: {
    name: "access-log",
    version: "1",
    confidence: 1,
    reason: "matched",
    facts: [],
    visibleText: "access-log summary\nrequests: 500\nerrors: 88\nsource recovery: Recover processing result with freeflow_search ...",
    details: {},
  },
  reason: "matched",
};

test("processing renderer puts facts first and keeps recovery compact", () => {
  const previousProse = `${reducer.result.visibleText}\nreducer: access-log@1 confidence=1.00\nsource: fixtures/access.log\nsource recovery: Recover processing result with freeflow_search action=retrieve outputId=ffout_example stream=raw.`;
  const rendered = renderProcessingResult({
    status: "ok",
    source,
    stats,
    facts: [
      { name: "requests", value: 500 },
      { name: "errors", value: 88 },
      { name: "errorRatePercent", value: 17.6 },
      { name: "averageLatencyMs", value: 300 },
      { name: "slow>=1000ms", value: 25 },
      { name: "status.200", value: 361 },
      { name: "status.500", value: 13 },
      { name: "source.sha256", value: stats.sha256 },
    ],
    reducer,
    recoveryClass: "exact-result",
    maxVisibleBytes: 4_096,
  });

  assert.equal(rendered.split("\n")[0], "requests: 500");
  assert.match(rendered, /errors: 88/);
  assert.match(rendered, /status: 200:361, 500:13/);
  assert.match(rendered, /source: repo fixtures\/access\.log \(45\.1KB, 500 lines\)/);
  assert.match(rendered, /recovery: exact-result/);
  assert.doesNotMatch(rendered, /Recover processing result/);
  assert.doesNotMatch(rendered, /source\.sha256/);
  assert.ok(Buffer.byteLength(rendered, "utf8") < Buffer.byteLength(previousProse, "utf8"));
});

test("processing renderer keeps blocked failure reason visible", () => {
  const rendered = renderProcessingResult({
    status: "blocked",
    source,
    facts: [],
    failure: { policy: "repo_containment", reason: "Resolved repo path escapes root: ../secret.txt" },
    maxVisibleBytes: 4_096,
  });

  assert.match(rendered, /^status: blocked/);
  assert.match(rendered, /policy: repo_containment/);
  assert.match(rendered, /reason: Resolved repo path escapes root/);
  assert.match(rendered, /recovery: none/);
});

test("processing recovery classification distinguishes result, source, metadata, and none", () => {
  assert.equal(classifyProcessingRecovery({ resultWillBePersisted: true }), "exact-result");
  assert.equal(classifyProcessingRecovery({ recovery: { how: "retrieve", outputId: "ffout_source" } }), "exact-source");
  assert.equal(classifyProcessingRecovery({ persistence: { status: "metadata_only", recoverability: "metadata_only" } }), "metadata-only");
  assert.equal(classifyProcessingRecovery({}), "none");
});
