import assert from "node:assert/strict";
import test from "node:test";

import { ContextSourceRuntime } from "../../dist/context-control/sources/runtime.js";

function entries() {
  return [
    {
      type: "message",
      id: "user-1",
      parentId: null,
      timestamp: "2026-09-02T00:00:01.000Z",
      message: { role: "user", content: [{ type: "text", text: "Inspect the project." }] },
    },
    {
      type: "message",
      id: "assistant-1",
      parentId: "user-1",
      timestamp: "2026-09-02T00:00:02.000Z",
      message: { role: "assistant", content: [{ type: "text", text: "I will inspect it." }] },
    },
    {
      type: "message",
      id: "tool-1",
      parentId: "assistant-1",
      timestamp: "2026-09-02T00:00:03.000Z",
      message: {
        role: "toolResult",
        toolCallId: "call-1",
        toolName: "read",
        content: [{ type: "text", text: "source result" }],
      },
    },
    {
      type: "branch_summary",
      id: "summary-1",
      parentId: "tool-1",
      timestamp: "2026-09-02T00:00:04.000Z",
      summary: "The inspection established the source layout.",
    },
    {
      type: "custom",
      id: "custom-1",
      parentId: "summary-1",
      customType: "internal-state",
      data: { value: "not projected" },
    },
  ];
}

function context(activeEntries) {
  return {
    cwd: "/repo",
    sessionManager: {
      getSessionId: () => "session-1",
      getLeafId: () => "summary-1",
      getBranch: () => activeEntries,
      getEntries: () => activeEntries,
      buildContextEntries: () => activeEntries,
    },
  };
}

test("Context Control captures generic request visibility for every source kind", () => {
  const branch = entries();
  const runtime = new ContextSourceRuntime(context(branch));
  const snapshot = runtime.captureSnapshot({
    contextControlEnabled: true,
    isSourceFullyProjected: (entryId) => entryId !== "assistant-1",
  });

  assert.equal(snapshot.sessionId, "session-1");
  assert.deepEqual(
    [...snapshot.entries.values()].map((source) => source.kind),
    ["user", "assistant", "toolResult", "summary"],
  );
  assert.ok(snapshot.visibleEntryIds.has("user-1"));
  assert.ok(!snapshot.visibleEntryIds.has("assistant-1"));
  assert.ok(snapshot.visibleSourceIds.has("tool-1"));
  assert.ok(!snapshot.visibleSourceIds.has("assistant-1"));
  assert.ok(!snapshot.visibleSourceIds.has("custom-1"));
  assert.equal(snapshot.skippedEntries, 0);
});

test("Context Control matches provider messages to one canonical source or abstains", () => {
  const branch = entries();
  const runtime = new ContextSourceRuntime(context(branch));
  const snapshot = runtime.captureSnapshot({
    contextControlEnabled: true,
    includeContextControlResults: true,
  });

  const messages = [
    { role: "user", content: [{ type: "text", text: "Inspect the project." }] },
    { role: "assistant", content: [{ type: "text", text: "I will inspect it." }] },
    { role: "toolResult", toolCallId: "call-1", toolName: "read", content: [{ type: "text", text: "source result" }] },
    { summary: "The inspection established the source layout." },
  ];
  assert.deepEqual(
    messages.map((message) => runtime.sourceForProviderMessage(message, snapshot)?.ref),
    ["ctx:user-1", "ctx:assistant-1", "ctx:tool-1", "ctx:summary-1"],
  );

  const ambiguous = structuredClone(branch);
  ambiguous.splice(2, 0, {
    type: "message",
    id: "user-duplicate",
    parentId: "user-1",
    timestamp: "2026-09-02T00:00:01.500Z",
    message: { role: "user", content: [{ type: "text", text: "Inspect the project." }] },
  });
  const ambiguousRuntime = new ContextSourceRuntime(context(ambiguous));
  const ambiguousSnapshot = ambiguousRuntime.captureSnapshot({
    contextControlEnabled: true,
  });
  assert.equal(ambiguousRuntime.sourceForProviderMessage(messages[0], ambiguousSnapshot), undefined);
});
