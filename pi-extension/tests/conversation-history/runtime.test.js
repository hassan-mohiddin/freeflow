import assert from "node:assert/strict";
import test from "node:test";

import { ConversationHistoryRuntime } from "../../dist/conversation-history/runtime.js";

function sourceEntry() {
  return {
    type: "message",
    id: "hidden-source",
    parentId: null,
    message: {
      role: "toolResult",
      toolCallId: "call-hidden-source",
      toolName: "bash",
      content: [{ type: "text", text: "hidden evidence" }],
    },
  };
}

test("Conversation History becomes unavailable when the active visibility snapshot cannot be captured", async () => {
  const entry = sourceEntry();
  const ctx = {
    cwd: "/repo",
    sessionManager: {
      getSessionId: () => "session-1",
      getLeafId: () => entry.id,
      getBranch: () => [entry],
      buildContextEntries: () => {
        throw new Error("visibility snapshot failed");
      },
    },
  };
  const runtime = new ConversationHistoryRuntime(ctx);

  assert.equal(runtime.capture(false), false);
  const result = await runtime.search({ query: "hidden evidence" });
  assert.equal(result.status, "unavailable");
  assert.equal(result.operation, "search");
});
