import assert from "node:assert/strict";
import test from "node:test";

import { ContextSourceResolver } from "../../dist/context-control/sources/resolver.js";
import { projectContextSource } from "../../dist/context-control/sources/source-projector.js";
import { contextRefForEntry } from "../../dist/context-control/sources/types.js";

function createEntries() {
  return [
    {
      type: "session",
      version: 3,
      id: "session-1",
      timestamp: "2026-09-02T00:00:00.000Z",
      cwd: "/repo",
    },
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
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "I will inspect it." },
          { type: "toolCall", id: "call-1", name: "read", arguments: { path: "src/a.ts" } },
          { type: "toolCall", id: "call-control", name: "context_control", arguments: { operation: "status" } },
        ],
      },
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
        content: [
          { type: "text", text: "export const VALUE = 1;" },
          { type: "image", mimeType: "image/png", data: "must-not-be-projected" },
        ],
        isError: false,
      },
    },
    {
      type: "compaction",
      id: "summary-1",
      parentId: "tool-1",
      timestamp: "2026-09-02T00:00:04.000Z",
      summary: "The project inspection established the source layout.",
    },
    {
      type: "custom",
      id: "custom-1",
      parentId: "summary-1",
      timestamp: "2026-09-02T00:00:05.000Z",
      customType: "internal-state",
      data: { secret: "not source content" },
    },
  ];
}

test("Context Control source resolver represents generic canonical source kinds", () => {
  const entries = createEntries();
  const resolver = new ContextSourceResolver({
    cwd: "/repo",
    sessionManager: {
      getSessionId: () => "session-1",
      getLeafId: () => "summary-1",
      getBranch: () => entries,
      getEntries: () => entries,
      buildContextEntries: () => entries,
    },
  });

  const resolved = resolver.resolvedEntriesById();
  assert.deepEqual(
    ["user-1", "assistant-1", "tool-1", "summary-1", "custom-1"].map((id) => resolved.get(id)?.kind),
    ["user", "assistant", "toolResult", "summary", "custom"],
  );
  assert.equal(resolver.resolveCurrent(contextRefForEntry("user-1"))?.kind, "user");
  assert.equal(resolver.resolveCurrent(contextRefForEntry("tool-1"))?.source.toolCallId, "call-1");
  assert.equal(resolver.resolveCurrent("ctx:missing"), undefined);
});

test("Context Control source projector preserves safe generic content and excludes recursion", () => {
  const entries = createEntries();
  const resolver = new ContextSourceResolver({
    sessionManager: { getSessionId: () => "session-1", getBranch: () => entries },
  });
  const resolved = resolver.resolvedEntriesById();
  const original = structuredClone(entries);

  const user = projectContextSource(resolved.get("user-1"));
  assert.equal(user.status, "eligible");
  assert.equal(user.source.kind, "user");
  assert.equal(user.source.text, "Inspect the project.");

  const assistant = projectContextSource(resolved.get("assistant-1"));
  assert.equal(assistant.status, "eligible");
  assert.match(assistant.source.text, /I will inspect it/);
  assert.match(assistant.source.text, /Tool call: read/);
  assert.doesNotMatch(assistant.source.text, /context_control/);

  const tool = projectContextSource(resolved.get("tool-1"));
  assert.equal(tool.status, "eligible");
  assert.match(tool.source.text, /export const VALUE = 1/);
  assert.match(tool.source.text, /\[image:image\/png\]/);
  assert.doesNotMatch(tool.source.text, /must-not-be-projected/);

  const summary = projectContextSource(resolved.get("summary-1"));
  assert.equal(summary.status, "eligible");
  assert.equal(summary.source.kind, "summary");

  const custom = projectContextSource(resolved.get("custom-1"));
  assert.deepEqual(custom, { status: "excluded", reason: "custom_source" });
  assert.deepEqual(entries, original);
});
