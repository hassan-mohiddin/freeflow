import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ROUTER_THRESHOLDS,
  createDefaultObservedReducerRegistry,
  reduceObservedOutput,
} from "../dist/index.js";

const source = { kind: "native", tool: "fixture", outputId: "in_memory" };

function reducerInput(overrides = {}) {
  return {
    outputId: "ffout_reduce_fixture",
    source,
    preserve: "important",
    thresholds: DEFAULT_ROUTER_THRESHOLDS,
    text: "alpha\nbeta",
    normalized: { shape: "text", byteCount: 10, lineCount: 2 },
    ...overrides,
  };
}

test("observed reducer registry includes producer, JSON, and generic text reducers", () => {
  const registry = createDefaultObservedReducerRegistry();

  assert.equal(typeof registry.reduce, "function");
  assert.deepEqual(registry.names(), ["web-search", "fetch", "code-search", "mcp", "json", "generic-text"]);
});

test("generic text reducer passes small output through as exact evidence", () => {
  const result = reduceObservedOutput(reducerInput({ text: "one\ntwo" }));

  assert.equal(result.reducer, "generic-text");
  assert.equal(result.routingStatus, "routed");
  assert.equal(result.evidence[0].excerpt, "one\ntwo");
  assert.equal(result.evidence[0].window, "exact");
});

test("generic text reducer bounds large output with recovery pointers", () => {
  const text = Array.from({ length: 20 }, (_, index) => `line-${index + 1}`).join("\n");
  const result = reduceObservedOutput(reducerInput({
    text,
    thresholds: { largeOutputBytes: 80, largeOutputLines: 3 },
  }));

  assert.equal(result.reducer, "generic-text");
  assert.equal(result.routingStatus, "partial");
  assert.match(result.reason, /reduced from 20 line/);
  assert.equal(result.evidence[0].source, source);
  assert.equal(result.evidence[0].expandable, false);
});

test("JSON reducer returns compact rows and omitted count for arrays", () => {
  const rows = [
    { id: 1, title: "first", url: "https://example.test/1", noisy: "x".repeat(100) },
    { id: 2, title: "second", status: "open", path: "src/a.ts" },
    { id: 3, title: "third", error: "boom" },
    { id: 4, title: "fourth" },
  ];
  const result = reduceObservedOutput(reducerInput({
    text: JSON.stringify(rows, null, 2),
    rawValue: rows,
    normalized: { shape: "json", byteCount: 200, lineCount: 20 },
    thresholds: { largeOutputBytes: 1000, largeOutputLines: 100 },
  }));

  assert.equal(result.reducer, "json");
  assert.equal(result.routingStatus, "partial");
  assert.match(result.summary, /JSON array: 4 item/);
  assert.match(result.evidence[0].excerpt, /"id": 1/);
  assert.match(result.evidence[0].excerpt, /https:\/\/example\.test\/1/);
  assert.match(result.evidence[0].excerpt, /"omittedItems": 1/);
  assert.doesNotMatch(result.evidence[0].excerpt, /xxxxxxxxxxxxxxxxxxxxxxxx/);
});

test("JSON reducer preserves important scalar fields for objects", () => {
  const value = {
    id: "deploy-1",
    status: "READY",
    url: "https://deploy.example.test",
    nested: { error: "none", path: "apps/web" },
    noisy: "y".repeat(100),
  };
  const result = reduceObservedOutput(reducerInput({
    text: JSON.stringify(value, null, 2),
    rawValue: value,
    normalized: { shape: "json", byteCount: 200, lineCount: 12 },
  }));

  assert.equal(result.reducer, "json");
  assert.match(result.summary, /JSON object/);
  assert.match(result.evidence[0].excerpt, /"id": "deploy-1"/);
  assert.match(result.evidence[0].excerpt, /"status": "READY"/);
  assert.match(result.evidence[0].excerpt, /"url": "https:\/\/deploy\.example\.test"/);
  assert.match(result.evidence[0].excerpt, /"nested.error": "none"/);
  assert.match(result.evidence[0].excerpt, /"nested.path": "apps\/web"/);
});

test("reducer registry falls back to generic text when JSON reduction throws", () => {
  const result = reduceObservedOutput(reducerInput({
    text: '["1n"]',
    rawValue: [1n],
    normalized: { shape: "json", byteCount: 6, lineCount: 1 },
  }));

  assert.equal(result.reducer, "generic-text");
  assert.match(result.reason, /json reducer failed/i);
  assert.equal(result.evidence[0].excerpt, '["1n"]');
});
