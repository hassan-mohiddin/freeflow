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

test("Conversation History returns a bounded unavailable result when search is aborted", async () => {
  const entry = sourceEntry();
  const ctx = {
    cwd: "/repo",
    sessionManager: {
      getSessionId: () => "session-1",
      getLeafId: () => entry.id,
      getBranch: () => [entry],
      buildContextEntries: () => [],
    },
  };
  const runtime = new ConversationHistoryRuntime(ctx);
  runtime.capture(false);
  const controller = new AbortController();
  controller.abort();

  const result = await runtime.search({ query: "hidden evidence" }, controller.signal);

  assert.equal(result.status, "unavailable");
  assert.equal(result.operation, "search");
  assert.equal(result.reason, "conversation_history_search_cancelled");
});

test("Conversation History cancels during a long scan without publishing hits", async () => {
  const entries = Array.from({ length: 80 }, (_, index) => ({
    ...sourceEntry(),
    id: `hidden-source-${index}`,
    message: {
      ...sourceEntry().message,
      toolCallId: `call-hidden-source-${index}`,
      content: [{ type: "text", text: `hidden evidence ${index} ${"noise ".repeat(80)}` }],
    },
  }));
  const ctx = {
    cwd: "/repo",
    sessionManager: {
      getSessionId: () => "session-1",
      getLeafId: () => entries.at(-1)?.id,
      getBranch: () => entries,
      buildContextEntries: () => [],
    },
  };
  const runtime = new ConversationHistoryRuntime(ctx);
  runtime.capture(false);
  let signalReads = 0;
  const signal = {
    get aborted() {
      signalReads += 1;
      return signalReads > 6;
    },
  };

  const result = await runtime.search({ query: "hidden evidence" }, signal);

  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "conversation_history_search_cancelled");
  assert.ok(signalReads > 6);
});
