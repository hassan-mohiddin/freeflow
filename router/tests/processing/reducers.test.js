import assert from "node:assert/strict";
import test from "node:test";

import { reduceAccessLog, selectProcessingReducer } from "../../dist/processing/reducers.js";

function syntheticAccessLogFixture() {
  const lines = [];
  const statuses = [
    [200, 361],
    [201, 38],
    [204, 13],
    [400, 13],
    [401, 25],
    [403, 24],
    [404, 13],
    [500, 13],
  ];
  let index = 0;
  for (const [status, count] of statuses) {
    for (let i = 0; i < count; i += 1) {
      index += 1;
      const method = index % 3 === 0 ? "POST" : "GET";
      const route = index % 25 === 0 ? "/api/uploads" : `/api/items/${index}`;
      const latency = index <= 25 ? 1_000 + index : 262;
      lines.push(`192.168.1.${index % 255} - - [23/Feb/2026:10:00:01 +0000] "${method} ${route} HTTP/1.1" ${status} 892 ${latency}ms`);
    }
  }
  return lines.join("\n");
}

test("access log reducer computes request, status, error, latency, and slow request facts", () => {
  const reduced = reduceAccessLog(syntheticAccessLogFixture());

  assert.ok(reduced.result);
  assert.equal(reduced.candidate.name, "access-log");
  assert.equal(reduced.candidate.confidence, 1);
  assert.equal(reduced.result.details.requestCount, 500);
  assert.equal(reduced.result.details.statusCounts["200"], 361);
  assert.equal(reduced.result.details.statusCounts["500"], 13);
  assert.equal(reduced.result.details.errorCount, 88);
  assert.equal(reduced.result.details.errorRatePercent, 17.6);
  assert.equal(reduced.result.details.slowRequestCount, 25);
  assert.equal(reduced.result.details.averageLatencyMs, 300);
  assert.match(reduced.result.visibleText, /requests: 500/);
  assert.match(reduced.result.visibleText, /errors: 88 \(17\.6%\)/);
  assert.match(reduced.result.visibleText, /status: 200:361/);
  assert.match(reduced.result.visibleText, /slow>=1000ms: 25/);
});

test("access log reducer does not select low-confidence prose", () => {
  const selected = selectProcessingReducer({ text: "hello\nnot an access log\n" });

  assert.equal(selected.status, "not_selected");
  assert.equal(selected.candidates[0].name, "access-log");
  assert.ok(selected.candidates[0].confidence < 0.8);
});
