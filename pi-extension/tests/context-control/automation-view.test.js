import assert from "node:assert/strict";
import test from "node:test";

import { ContextControlSourceRegistry } from "../../dist/context-control/core/source-registry.js";

function createAutomationEntries() {
  return [
    {
      type: "session",
      version: 3,
      id: "session-automation-view",
      timestamp: "2026-09-02T00:00:00.000Z",
      cwd: "/repo",
    },
    {
      type: "message",
      id: "automation-user",
      parentId: null,
      timestamp: "2026-09-02T00:00:01.000Z",
      message: { role: "user", content: "User context must not enter automation." },
    },
    {
      type: "message",
      id: "automation-assistant-call",
      parentId: "automation-user",
      timestamp: "2026-09-02T00:00:02.000Z",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", id: "automation-read-call", name: "read", arguments: { path: "src/a.ts" } }],
      },
    },
    {
      type: "message",
      id: "automation-ordinary",
      parentId: "automation-assistant-call",
      timestamp: "2026-09-02T00:00:03.000Z",
      message: {
        role: "toolResult",
        toolCallId: "automation-read-call",
        toolName: "read",
        content: [{ type: "text", text: "ordinary source output" }],
        isError: false,
      },
    },
    {
      type: "message",
      id: "automation-followup",
      parentId: "automation-ordinary",
      timestamp: "2026-09-02T00:00:04.000Z",
      message: { role: "assistant", content: [{ type: "text", text: "The ordinary result was consumed." }] },
    },
    {
      type: "message",
      id: "automation-control",
      parentId: "automation-followup",
      timestamp: "2026-09-02T00:00:05.000Z",
      message: {
        role: "toolResult",
        toolCallId: "automation-control-call",
        toolName: "context_control",
        content: [{ type: "text", text: "control output" }],
        isError: false,
      },
    },
    {
      type: "message",
      id: "automation-sensitive",
      parentId: "automation-control",
      timestamp: "2026-09-02T00:00:06.000Z",
      message: {
        role: "toolResult",
        toolCallId: "automation-sensitive-call",
        toolName: "thinking",
        content: [{ type: "text", text: "sensitive output" }],
        isError: false,
      },
    },
    {
      type: "message",
      id: "automation-partial",
      parentId: "automation-sensitive",
      timestamp: "2026-09-02T00:00:07.000Z",
      message: {
        role: "toolResult",
        toolCallId: "automation-partial-call",
        toolName: "read",
        content: [{ type: "text", text: "partial output" }],
        isError: false,
        details: { truncated: true },
      },
    },
    {
      type: "message",
      id: "automation-unconsumed",
      parentId: "automation-partial",
      timestamp: "2026-09-02T00:00:08.000Z",
      message: {
        role: "toolResult",
        toolCallId: "automation-unconsumed-call",
        toolName: "read",
        content: [{ type: "text", text: "unconsumed output" }],
        isError: false,
      },
    },
    {
      type: "branch_summary",
      id: "automation-summary",
      parentId: "automation-unconsumed",
      timestamp: "2026-09-02T00:00:09.000Z",
      summary: "Summary context must not enter automation.",
    },
  ];
}

test("Context Control exposes an explicit tool-result-only automation view", () => {
  const entries = createAutomationEntries();
  const ctx = {
    cwd: "/repo",
    sessionManager: {
      getSessionId: () => "session-automation-view",
      getLeafId: () => "automation-summary",
      getBranch: () => entries,
      getEntries: () => entries,
      buildContextEntries: () => entries.filter((entry) => entry.type === "message"),
    },
  };
  const registry = new ContextControlSourceRegistry(ctx);
  const snapshot = registry.snapshot(new Set(), 1);
  const view = registry.automationView(snapshot);

  assert.deepEqual(
    view.sources.map((source) => source.identity.entryId),
    ["automation-ordinary"],
  );
  assert.ok(view.sources.every((source) => source.category === "ordinary"));
  assert.ok(view.sources.every((source) => source.consumed && source.consumptionEvidence === "confirmed"));
  assert.ok(view.protected.some((item) => item.ref === "ctx:automation-unconsumed"));
  assert.ok(view.excluded.some((item) => item.ref === "ctx:automation-control"));
  assert.ok(view.excluded.some((item) => item.ref === "ctx:automation-sensitive"));
  assert.ok(view.protected.some((item) => item.ref === "ctx:automation-partial"));
  assert.equal(
    view.sources.some((source) => source.identity.entryId === "automation-user"),
    false,
  );
  assert.equal(
    view.sources.some((source) => source.identity.entryId === "automation-summary"),
    false,
  );
});

test("scoped automation catalog preserves eligible counts and excludes unsafe sources", () => {
  const entries = createAutomationEntries();
  const ctx = {
    cwd: "/repo",
    sessionManager: {
      getSessionId: () => "session-automation-view",
      getLeafId: () => "automation-summary",
      getBranch: () => entries,
      getEntries: () => entries,
      buildContextEntries: () => entries.filter((entry) => entry.type === "message"),
    },
  };
  const registry = new ContextControlSourceRegistry(ctx);
  const catalog = registry.automationCatalog("active-branch", new Set(), 1);

  assert.deepEqual(
    catalog.sources.map((source) => source.identity.entryId),
    ["automation-ordinary"],
  );
  assert.equal(catalog.sessions[0].sourceCount, 1);
  assert.equal(catalog.sessions[0].current, true);
  assert.ok(catalog.protected.some((item) => item.ref === "ctx:automation-unconsumed"));
  assert.ok(catalog.protected.some((item) => item.ref === "ctx:automation-partial"));
  assert.ok(catalog.excluded.some((item) => item.ref === "ctx:automation-control"));
  assert.ok(catalog.excluded.some((item) => item.ref === "ctx:automation-sensitive"));
  for (const item of [...catalog.protected, ...catalog.excluded]) {
    assert.deepEqual(Object.keys(item).sort(), ["reason", "ref"]);
  }
});

test("automation view protects every unsafe ordinary source state without payload metadata", () => {
  const source = (ref, overrides = {}) => ({
    ref,
    identity: { sessionId: "session-matrix", entryId: ref.slice(4), toolCallId: `call-${ref.slice(4)}` },
    content: "ordinary output",
    contentHash: "content-hash",
    characters: 16,
    toolName: "read",
    commandKind: "other",
    cwd: "/repo",
    branchId: "branch:matrix",
    sequence: 1,
    turn: 1,
    coverage: { kind: "full" },
    completeness: "complete",
    consumed: true,
    consumptionEvidence: "confirmed",
    metadataComplete: true,
    metadataIssues: [],
    activeContext: false,
    scope: "active-branch",
    category: "ordinary",
    privacy: "allowed",
    integrity: "valid",
    freshness: "current",
    ...overrides,
  });
  const sources = [
    source("ctx:automation-safe"),
    source("ctx:automation-failed", { isError: true }),
    source("ctx:automation-base64", { content: "data:image/png;base64,AAAA" }),
    source("ctx:automation-category", { category: "tool-details" }),
    source("ctx:automation-missing-call", {
      identity: { sessionId: "session-matrix", entryId: "automation-missing-call" },
    }),
    source("ctx:automation-unconsumed", { consumed: false }),
    source("ctx:automation-inferred", { consumptionEvidence: "inferred" }),
    source("ctx:automation-metadata", { metadataComplete: false }),
    source("ctx:automation-issues", { metadataIssues: ["unmatched-tool-call"] }),
    source("ctx:automation-partial", { completeness: "partial" }),
    source("ctx:automation-unknown-completeness", { completeness: "unknown" }),
    source("ctx:automation-stale", { freshness: "stale" }),
    source("ctx:automation-denied", { privacy: "denied" }),
    source("ctx:automation-unknown-privacy", { privacy: "unknown" }),
    source("ctx:automation-invalid", { integrity: "invalid" }),
    source("ctx:automation-unknown-integrity", { integrity: "unknown" }),
    source("ctx:automation-wrong-scope", { scope: "current-session" }),
  ];
  const registry = new ContextControlSourceRegistry({});
  const view = registry.automationView({
    sessionId: "session-matrix",
    branchId: "branch:matrix",
    generation: 2,
    sources,
    byRef: new Map(sources.map((item) => [item.ref, item])),
    byToolCallId: new Map(),
  });

  assert.deepEqual(
    view.sources.map((item) => item.ref),
    ["ctx:automation-safe", "ctx:automation-failed"],
  );
  const expectedProtected = new Map([
    ["ctx:automation-missing-call", "tool-call-identity-incomplete"],
    ["ctx:automation-unconsumed", "unconsumed-result"],
    ["ctx:automation-inferred", "consumption-unconfirmed"],
    ["ctx:automation-metadata", "incomplete-source-metadata"],
    ["ctx:automation-issues", "incomplete-source-metadata"],
    ["ctx:automation-partial", "incomplete-source-content"],
    ["ctx:automation-unknown-completeness", "incomplete-source-content"],
    ["ctx:automation-stale", "stale-source"],
    ["ctx:automation-denied", "source-privacy-not-allowed"],
    ["ctx:automation-unknown-privacy", "source-privacy-not-allowed"],
    ["ctx:automation-invalid", "source-integrity-invalid"],
    ["ctx:automation-unknown-integrity", "source-integrity-invalid"],
    ["ctx:automation-wrong-scope", "automation-scope-invalid"],
  ]);
  assert.deepEqual(new Map(view.protected.map((item) => [item.ref, item.reason])), expectedProtected);
  assert.deepEqual(
    new Map(view.excluded.map((item) => [item.ref, item.reason])),
    new Map([
      ["ctx:automation-base64", "sensitive-source"],
      ["ctx:automation-category", "source-category-tool-details"],
    ]),
  );
  assert.ok(Object.isFrozen(view.sources));
  assert.ok(Object.isFrozen(view.protected));
  assert.ok(Object.isFrozen(view.excluded));
  for (const item of [...view.protected, ...view.excluded]) {
    assert.deepEqual(Object.keys(item).sort(), ["reason", "ref"]);
  }
});
