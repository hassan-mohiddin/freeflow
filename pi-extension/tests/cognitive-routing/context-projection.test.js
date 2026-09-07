import assert from "node:assert/strict";
import test from "node:test";
import { projectReasoningContext } from "../../dist/cognitive-routing/context-projection.js";

function source(entryId, message, profile, blockId = undefined, kind = message.role) {
  return {
    source: { sessionId: "session-1", entryId },
    message,
    profile,
    ...(blockId ? { blockId } : {}),
    kind,
  };
}

function toolCall(id, name) {
  return { type: "toolCall", id, name, arguments: { path: `src/${id}.ts` } };
}

function toolResult(toolCallId, text) {
  return {
    role: "toolResult",
    toolCallId,
    toolName: "read",
    content: [{ type: "text", text }],
    isError: false,
  };
}

function fixture() {
  const user = { role: "user", content: "Inspect the selected file" };
  const assistant = {
    role: "assistant",
    content: [
      { type: "text", text: "I inspected both files." },
      toolCall("call-a", "read"),
      toolCall("call-b", "read"),
    ],
  };
  const resultA = toolResult("call-a", "SELECTED_RESULT");
  const resultB = toolResult("call-b", "SECRET_SIBLING_RESULT");
  const unrelatedAssistant = { role: "assistant", content: [{ type: "text", text: "Unrelated Standard block" }] };
  const messages = [user, assistant, resultA, resultB, unrelatedAssistant];
  const sources = [
    source("user-1", user, "user", undefined, "user"),
    source("assistant-1", assistant, "standard", "block-1", "assistant"),
    source("result-a", resultA, "standard", "block-1", "toolResult"),
    source("result-b", resultB, "standard", "block-1", "toolResult"),
    source("assistant-2", unrelatedAssistant, "standard", "block-2", "assistant"),
  ];
  return { messages, sources };
}

test("projects one selected result while preserving native dependencies and dropping unrelated Standard work", () => {
  const { messages, sources } = fixture();
  const before = structuredClone(messages);
  const result = projectReasoningContext({
    sessionId: "session-1",
    messages,
    sources,
    currentBlockId: "block-1",
    include: ["ctx:result-a"],
  });

  assert.equal(result.status, "projected");
  assert.deepEqual(result.visibleRefs, ["ctx:user-1", "ctx:assistant-1", "ctx:result-a"]);
  assert.deepEqual(result.selectedRefs, ["ctx:result-a"]);
  assert.equal(result.messages[0], messages[0]);
  assert.equal(result.messages[1], messages[1]);
  assert.equal(result.messages[2], messages[2]);
  assert.notEqual(result.messages[3], messages[3]);
  assert.deepEqual(result.messages[3], {
    ...messages[3],
    content: [{ type: "text", text: "[context omitted]" }],
  });
  assert.equal(result.messages.length, 4);
  assert.deepEqual(messages, before);
});

test("omitted and empty selections add no current Standard evidence", () => {
  for (const include of [undefined, []]) {
    const { messages, sources } = fixture();
    const result = projectReasoningContext({
      sessionId: "session-1",
      messages,
      sources,
      currentBlockId: "block-1",
      ...(include === undefined ? {} : { include }),
    });
    assert.equal(result.status, "projected");
    assert.deepEqual(result.selectedRefs, []);
    assert.deepEqual(
      result.messages.map((message) => message.role),
      ["user"],
    );
  }
});

test("a required shared result retains its call group without losing its body", () => {
  const { messages, sources } = fixture();
  sources[2].profile = "shared";
  messages[2].isError = true;
  messages[2].content.push({ type: "image", mimeType: "image/png", data: "captured-image" });
  const before = structuredClone({ messages, sources });
  const result = projectReasoningContext({ sessionId: "session-1", messages: structuredClone(messages), sources });
  assert.equal(result.status, "projected");
  assert.deepEqual(result.messages, [
    messages[0],
    messages[1],
    messages[2],
    { ...messages[3], content: [{ type: "text", text: "[context omitted]" }] },
  ]);
  assert.deepEqual(result.visibleRefs, ["ctx:user-1", "ctx:assistant-1", "ctx:result-a"]);
  assert.deepEqual({ messages, sources }, before);
});

test("Reasoning tool history stays full without discretionary selection", () => {
  const { messages, sources } = fixture();
  for (const item of sources.slice(1, 4)) item.profile = "reasoning";
  const result = projectReasoningContext({ sessionId: "session-1", messages, sources });
  assert.equal(result.status, "projected");
  assert.deepEqual(result.messages, messages.slice(0, 4));
});

test("retains previous and shared refs while rejecting an unknown request ref", () => {
  const { messages, sources } = fixture();
  const retained = projectReasoningContext({
    sessionId: "session-1",
    messages,
    sources,
    currentBlockId: "block-1",
    previous: ["ctx:result-b"],
    shared: ["ctx:user-1"],
  });
  assert.equal(retained.status, "projected");
  assert.deepEqual(retained.selectedRefs, ["ctx:result-b", "ctx:user-1"]);
  assert.deepEqual(
    retained.messages.map((message) => message.role),
    ["user", "assistant", "toolResult", "toolResult"],
  );

  assert.deepEqual(
    projectReasoningContext({
      sessionId: "session-1",
      messages,
      sources,
      currentBlockId: "block-1",
      include: ["ctx:missing"],
    }),
    { status: "rejected", reason: "requested_ref_not_found:ctx:missing" },
  );
});

test("shared and previous membership is additive, while duplicates within a request are invalid", () => {
  const { messages, sources } = fixture();
  const result = projectReasoningContext({
    sessionId: "session-1",
    messages,
    sources,
    previous: ["ctx:result-a"],
    shared: ["ctx:result-a"],
  });
  assert.equal(result.status, "projected");
  assert.deepEqual(result.selectedRefs, ["ctx:result-a"]);
  assert.deepEqual(
    projectReasoningContext({
      sessionId: "session-1",
      messages,
      sources,
      currentBlockId: "block-1",
      include: ["ctx:result-a", "ctx:result-a"],
    }),
    { status: "rejected", reason: "requested_ref_duplicate:ctx:result-a" },
  );
});

test("current selection cannot claim another block or an absent block boundary", () => {
  const { messages, sources } = fixture();
  for (const currentBlockId of ["block-2", undefined]) {
    assert.deepEqual(
      projectReasoningContext({
        sessionId: "session-1",
        messages,
        sources,
        currentBlockId,
        include: ["ctx:result-a"],
      }),
      { status: "rejected", reason: "include_ref_not_current_block:ctx:result-a" },
    );
  }
  delete sources[2].blockId;
  assert.deepEqual(
    projectReasoningContext({
      sessionId: "session-1",
      messages,
      sources,
      include: ["ctx:result-a"],
    }),
    { status: "rejected", reason: "include_ref_not_current_block:ctx:result-a" },
  );
});

test("required handoffs survive empty discretionary selection", () => {
  const { messages, sources } = fixture();
  const result = projectReasoningContext({
    sessionId: "session-1",
    messages,
    sources,
    include: [],
    required: ["ctx:assistant-2"],
  });
  assert.equal(result.status, "projected");
  assert.deepEqual(result.messages, [messages[0], messages[4]]);
  assert.deepEqual(result.visibleRefs, ["ctx:user-1", "ctx:assistant-2"]);
});

test("unknown, changed, and reused messages reject without a partial view", () => {
  const { messages, sources } = fixture();
  const changed = structuredClone(messages);
  changed[2].content[0].text = "rewritten before projection";
  assert.deepEqual(projectReasoningContext({ sessionId: "session-1", messages: changed, sources }), {
    status: "rejected",
    reason: "source_not_found:toolResult",
  });
  assert.deepEqual(projectReasoningContext({ sessionId: "session-1", messages: [...messages, messages[0]], sources }), {
    status: "rejected",
    reason: "source_reused:ctx:user-1",
  });
  assert.deepEqual(
    projectReasoningContext({
      sessionId: "session-1",
      messages: messages.filter((message) => message !== messages[2]),
      sources,
      currentBlockId: "block-1",
      include: ["ctx:result-a"],
    }),
    { status: "rejected", reason: "requested_ref_not_visible:ctx:result-a" },
  );
});

test("retained tool groups reject duplicate, misnamed, orphaned, and interrupted results", () => {
  for (const mutation of ["duplicate", "tool-name", "orphan", "interrupt"]) {
    const { messages, sources } = fixture();
    if (mutation === "duplicate") messages[3].toolCallId = "call-a";
    if (mutation === "tool-name") messages[3].toolName = "bash";
    if (mutation === "orphan") {
      messages.splice(1, 1);
      sources.splice(1, 1);
    }
    if (mutation === "interrupt") {
      const user = { role: "user", content: "interruption" };
      messages.splice(2, 0, user);
      sources.push(source("user-2", user, "user"));
    }
    const result = projectReasoningContext({
      sessionId: "session-1",
      messages,
      sources,
      currentBlockId: "block-1",
      include: ["ctx:result-a"],
    });
    assert.equal(result.status, "rejected", mutation);
    assert.equal(result.messages, undefined, mutation);
  }
});

test("rejects ambiguous source association and dangling selected tool groups", () => {
  const { messages, sources } = fixture();
  const duplicateSources = [
    ...sources,
    source("duplicate-result-a", sources[2].message, "standard", "block-1", "toolResult"),
  ];
  assert.deepEqual(
    projectReasoningContext({
      sessionId: "session-1",
      messages,
      sources: duplicateSources,
      currentBlockId: "block-1",
      include: ["ctx:result-a"],
    }),
    { status: "rejected", reason: "ambiguous_source:toolResult" },
  );

  const incompleteMessages = messages.filter((message) => message !== messages[3]);
  const incompleteSources = sources.filter((candidate) => candidate.source.entryId !== "result-b");
  assert.deepEqual(
    projectReasoningContext({
      sessionId: "session-1",
      messages: incompleteMessages,
      sources: incompleteSources,
      currentBlockId: "block-1",
      include: ["ctx:result-a"],
    }),
    { status: "rejected", reason: "selected_tool_group_incomplete:ctx:assistant-1" },
  );
});

test("rejects session divergence and preserves transient owned context", () => {
  const { messages, sources } = fixture();
  const transient = { role: "custom", customType: "freeflow-runtime-state", content: "runtime state" };
  const withTransient = [...messages, transient];
  const result = projectReasoningContext({
    sessionId: "session-1",
    messages: withTransient,
    sources,
    ownedTransientMessages: [transient],
    currentBlockId: "block-1",
  });
  assert.equal(result.status, "projected");
  assert.equal(result.messages.at(-1), transient);
  assert.deepEqual(result.visibleRefs, ["ctx:user-1"]);
  assert.deepEqual(
    projectReasoningContext({
      sessionId: "session-1",
      messages: [...messages, structuredClone(transient)],
      sources,
      ownedTransientMessages: [transient],
    }),
    { status: "rejected", reason: "source_not_found:custom" },
  );
  assert.deepEqual(
    projectReasoningContext({
      sessionId: "other-session",
      messages,
      sources,
      currentBlockId: "block-1",
    }),
    { status: "rejected", reason: "source_session_mismatch:ctx:user-1" },
  );
});
