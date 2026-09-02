import assert from "node:assert/strict";
import test from "node:test";

import {
  archiveContent,
  projectResolvedMessage,
  projectToolResultMessage,
} from "../../dist/context-control/residency/projector.js";
import { contextRefForEntry } from "../../dist/context-control/sources/types.js";

function resolved(kind, entryId, message, extra = {}) {
  return {
    kind,
    entry: { type: kind === "summary" ? "branch_summary" : "message", id: entryId, ...extra },
    message,
    source: { sessionId: "session-1", entryId },
  };
}

const projections = [{ mode: "full" }, { mode: "archived" }, { mode: "archived", retained: "Keep the decision." }];

test("generic residency projection handles user, assistant, tool result, and summary sources", () => {
  const cases = [
    resolved("user", "user-1", { role: "user", content: [{ type: "text", text: "User request" }] }),
    resolved("assistant", "assistant-1", { role: "assistant", content: [{ type: "text", text: "Assistant answer" }] }),
    resolved("toolResult", "tool-1", {
      role: "toolResult",
      toolCallId: "call-1",
      toolName: "read",
      content: [{ type: "text", text: "Tool output" }],
      isError: false,
    }),
    resolved("summary", "summary-1", undefined, { summary: "Summary content" }),
  ];

  for (const source of cases) {
    const originalMessage = source.message && structuredClone(source.message);
    const originalEntry = structuredClone(source.entry);
    for (const projection of projections) {
      const message = source.message ?? source.entry;
      const projected = projectResolvedMessage(message, source, projection);
      assert.equal(projected.role, source.kind === "summary" ? undefined : source.message?.role);
      if (projection.mode === "full") {
        assert.match(JSON.stringify(projected), new RegExp(contextRefForEntry(source.source.entryId)));
      } else {
        assert.match(JSON.stringify(projected), /context archived/);
        if (projection.retained) assert.match(JSON.stringify(projected), /Keep the decision/);
      }
    }
    if (source.message) assert.deepEqual(source.message, originalMessage);
    assert.deepEqual(source.entry, originalEntry);
  }
});

test("archiving assistant prose preserves tool-call structure and tool-result pairing", () => {
  const source = resolved("assistant", "assistant-tools", {
    role: "assistant",
    content: [
      { type: "text", text: "I will inspect the file." },
      { type: "toolCall", id: "call-1", name: "read", arguments: { path: "src/a.ts" } },
    ],
  });
  const projected = projectResolvedMessage(source.message, source, {
    mode: "archived",
    retained: "Inspection complete.",
  });

  assert.deepEqual(projected.content[0], source.message.content[1]);
  assert.match(projected.content.at(-1).text, /context archived/);
  assert.match(projected.content.at(-1).text, /Inspection complete/);
  assert.equal(projected.role, "assistant");
});

test("tool-result compatibility projection keeps the established envelope", () => {
  const source = { sessionId: "session-1", entryId: "tool-compat", toolCallId: "call-compat", toolName: "read" };
  const message = {
    role: "toolResult",
    toolCallId: "call-compat",
    toolName: "read",
    content: [{ type: "text", text: "raw result" }],
    isError: false,
  };
  const projected = projectToolResultMessage(message, source, { mode: "archived" });
  assert.deepEqual(projected.content, [{ type: "text", text: archiveContent(source) }]);
  assert.equal(projected.toolCallId, "call-compat");
  assert.equal(projected.toolName, "read");
  assert.equal(projected.isError, false);
});
