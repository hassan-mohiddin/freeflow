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
      include: ["ctx:result-a", "ctx:result-a"],
    }),
    { status: "rejected", reason: "requested_ref_duplicate:ctx:result-a" },
  );
});

test("include accepts earlier Standard evidence but rejects ineligible or unavailable refs", () => {
  const { messages, sources } = fixture();
  const earlier = projectReasoningContext({
    sessionId: "session-1",
    messages,
    sources,
    include: ["ctx:result-a", "ctx:assistant-2"],
  });
  assert.equal(earlier.status, "projected");
  assert.deepEqual(earlier.selectedRefs, ["ctx:result-a", "ctx:assistant-2"]);

  const nonStandard = structuredClone(sources);
  nonStandard[2].profile = "shared";
  assert.deepEqual(
    projectReasoningContext({
      sessionId: "session-1",
      messages,
      sources: nonStandard,
      include: ["ctx:result-a"],
    }),
    { status: "rejected", reason: "include_ref_not_standard:ctx:result-a" },
  );

  for (const mutate of [
    (candidate) => delete candidate[2].blockId,
    (candidate) => {
      candidate[2].blockId = "";
    },
    (candidate) => {
      candidate[2].blockId = 42;
    },
  ]) {
    const missingBlock = structuredClone(sources);
    mutate(missingBlock);
    assert.deepEqual(
      projectReasoningContext({
        sessionId: "session-1",
        messages,
        sources: missingBlock,
        include: ["ctx:result-a"],
      }),
      { status: "rejected", reason: "include_ref_block_unavailable:ctx:result-a" },
    );
  }

  assert.deepEqual(
    projectReasoningContext({
      sessionId: "session-1",
      messages,
      sources: sources.filter((source) => source.source.entryId !== "result-a"),
      include: ["ctx:result-a"],
    }),
    { status: "rejected", reason: "requested_ref_not_found:ctx:result-a" },
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

test("drops Pi's empty aborted assistant artifact without accepting other errors", () => {
  const { messages, sources } = fixture();
  const aborted = {
    role: "assistant",
    content: [],
    stopReason: "error",
    errorMessage: "This operation was aborted",
  };
  const before = structuredClone(aborted);
  const result = projectReasoningContext({
    sessionId: "session-1",
    messages: [messages[0], aborted],
    sources,
  });

  assert.equal(result.status, "projected");
  assert.deepEqual(result.messages, [messages[0]]);
  assert.deepEqual(result.visibleRefs, ["ctx:user-1"]);
  assert.deepEqual(result.selectedRefs, []);
  assert.deepEqual(aborted, before);

  for (const assistant of [
    { ...aborted, errorMessage: "Provider failed" },
    { ...aborted, content: [{ type: "text", text: "partial response" }] },
  ]) {
    assert.deepEqual(projectReasoningContext({ sessionId: "session-1", messages: [messages[0], assistant], sources }), {
      status: "rejected",
      reason: "source_not_found:assistant",
      position: 1,
      role: "assistant",
    });
  }
});

test("unknown, changed, and reused messages reject without a partial view", () => {
  const { messages, sources } = fixture();
  const changed = structuredClone(messages);
  changed[2].content[0].text = "rewritten before projection";
  assert.deepEqual(projectReasoningContext({ sessionId: "session-1", messages: changed, sources }), {
    status: "rejected",
    reason: "source_not_found:toolResult",
    position: 2,
    role: "toolResult",
  });
  assert.deepEqual(projectReasoningContext({ sessionId: "session-1", messages: [...messages, messages[0]], sources }), {
    status: "rejected",
    reason: "source_reused:ctx:user-1",
    position: 5,
    role: "user",
  });
  assert.deepEqual(
    projectReasoningContext({
      sessionId: "session-1",
      messages: messages.filter((message) => message !== messages[2]),
      sources,
      include: ["ctx:result-a"],
    }),
    { status: "rejected", reason: "requested_ref_not_visible:ctx:result-a", ref: "ctx:result-a" },
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
      include: ["ctx:result-a"],
    }),
    {
      status: "rejected",
      reason: "ambiguous_source:toolResult",
      position: 2,
      role: "toolResult",
    },
  );

  const incompleteMessages = messages.filter((message) => message !== messages[3]);
  const incompleteSources = sources.filter((candidate) => candidate.source.entryId !== "result-b");
  assert.deepEqual(
    projectReasoningContext({
      sessionId: "session-1",
      messages: incompleteMessages,
      sources: incompleteSources,
      include: ["ctx:result-a"],
    }),
    {
      status: "rejected",
      reason: "selected_tool_group_incomplete:ctx:assistant-1",
      ref: "ctx:assistant-1",
      position: 1,
      role: "assistant",
    },
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
    {
      status: "rejected",
      reason: "source_not_found:custom",
      position: 5,
      role: "custom",
      customType: "freeflow-runtime-state",
    },
  );
  assert.deepEqual(
    projectReasoningContext({
      sessionId: "other-session",
      messages,
      sources,
    }),
    { status: "rejected", reason: "source_session_mismatch:ctx:user-1" },
  );
});

test("repairs an unselected unknown baseline group with request-only error results", () => {
  const user = { role: "user", content: "Inspect legacy files" };
  const assistant = {
    role: "assistant",
    content: [
      { type: "text", text: "Legacy inspection" },
      { type: "toolCall", id: "legacy-known", name: "read", arguments: {} },
      { type: "toolCall", id: "legacy-missing", name: "read", arguments: {} },
    ],
  };
  const known = toolResult("legacy-known", "KNOWN");
  const messages = [user, assistant, known];
  const sources = [
    source("user-legacy", user, "user", undefined, "user"),
    {
      ...source("assistant-legacy", assistant, "unknown", undefined, "assistant"),
      legacyBaseline: true,
      legacyRepairableCallIds: ["legacy-missing"],
    },
    {
      ...source("known-legacy", known, "unknown", undefined, "toolResult"),
      legacyBaseline: true,
    },
  ];
  const result = projectReasoningContext({
    sessionId: "session-1",
    messages,
    sources,
    required: ["ctx:assistant-legacy", "ctx:known-legacy"],
    legacyBaselineRefs: ["ctx:assistant-legacy", "ctx:known-legacy"],
  });

  assert.equal(result.status, "projected");
  assert.equal(result.messages.length, 4);
  assert.deepEqual(result.messages[0], user);
  assert.deepEqual(result.messages[1], assistant);
  assert.deepEqual(result.messages[2], known);
  assert.deepEqual(result.messages[3], {
    role: "toolResult",
    toolCallId: "legacy-missing",
    toolName: "read",
    content: [
      {
        type: "text",
        text: "No recorded result is available for this historical tool call; execution outcome is unknown.",
      },
    ],
    isError: true,
  });
  assert.deepEqual(result.visibleRefs, ["ctx:user-legacy", "ctx:assistant-legacy", "ctx:known-legacy"]);
});

test("preserves call order when the first legacy call is missing", () => {
  const assistant = {
    role: "assistant",
    content: [
      { type: "toolCall", id: "legacy-missing", name: "read", arguments: {} },
      { type: "toolCall", id: "legacy-known", name: "read", arguments: {} },
    ],
  };
  const known = toolResult("legacy-known", "KNOWN");
  const result = projectReasoningContext({
    sessionId: "session-1",
    messages: [assistant, known],
    sources: [
      {
        ...source("assistant-legacy", assistant, "unknown", undefined, "assistant"),
        legacyBaseline: true,
        legacyRepairableCallIds: ["legacy-missing"],
      },
      { ...source("known-legacy", known, "unknown", undefined, "toolResult"), legacyBaseline: true },
    ],
    required: ["ctx:assistant-legacy", "ctx:known-legacy"],
    legacyBaselineRefs: ["ctx:assistant-legacy", "ctx:known-legacy"],
  });

  assert.equal(result.status, "projected");
  assert.equal(result.messages[1].toolCallId, "legacy-missing");
  assert.equal(result.messages[1].isError, true);
  assert.equal(result.messages[2].toolCallId, "legacy-known");
  assert.match(JSON.stringify(result.messages[2].content), /KNOWN/);
});

test("does not repair an explicitly selected incomplete baseline group", () => {
  const assistant = {
    role: "assistant",
    content: [{ type: "toolCall", id: "legacy-missing", name: "read", arguments: {} }],
  };
  const result = projectReasoningContext({
    sessionId: "session-1",
    messages: [assistant],
    sources: [
      {
        ...source("assistant-legacy", assistant, "unknown", undefined, "assistant"),
        legacyBaseline: true,
        legacyRepairableCallIds: ["legacy-missing"],
      },
    ],
    shared: ["ctx:assistant-legacy"],
    legacyBaselineRefs: ["ctx:assistant-legacy"],
  });

  assert.deepEqual(result, {
    status: "rejected",
    reason: "selected_tool_group_incomplete:ctx:assistant-legacy",
    ref: "ctx:assistant-legacy",
    position: 0,
    role: "assistant",
  });
});

test("does not trust a reused request-only legacy placeholder", () => {
  const assistant = {
    role: "assistant",
    content: [{ type: "toolCall", id: "legacy-missing", name: "read", arguments: {} }],
  };
  const first = projectReasoningContext({
    sessionId: "session-1",
    messages: [assistant],
    sources: [
      {
        ...source("assistant-legacy", assistant, "unknown", undefined, "assistant"),
        legacyBaseline: true,
        legacyRepairableCallIds: ["legacy-missing"],
      },
    ],
    required: ["ctx:assistant-legacy"],
    legacyBaselineRefs: ["ctx:assistant-legacy"],
  });
  assert.equal(first.status, "projected");
  assert.deepEqual(
    projectReasoningContext({
      sessionId: "session-1",
      messages: first.messages,
      sources: [
        {
          ...source("assistant-legacy", assistant, "unknown", undefined, "assistant"),
          legacyBaseline: true,
          legacyRepairableCallIds: ["legacy-missing"],
        },
      ],
      required: ["ctx:assistant-legacy"],
      legacyBaselineRefs: ["ctx:assistant-legacy"],
    }),
    { status: "rejected", reason: "source_not_found:toolResult", position: 1, role: "toolResult" },
  );
});

test("retains canonical custom messages across timestamp conversion and rejects duplicates", () => {
  const user = { role: "user", content: "Review the notification" };
  const delivered = {
    role: "custom",
    customType: "subagent-notification",
    content: [{ type: "text", text: "Background work completed." }],
    display: true,
    details: { agentId: "agent-1", status: "completed" },
    timestamp: 2000,
  };
  const persisted = { ...delivered, timestamp: 1000 };
  const result = projectReasoningContext({
    sessionId: "session-1",
    messages: [user, delivered],
    sources: [
      source("user-1", user, "user", undefined, "user"),
      source("notification-1", persisted, "shared", undefined, "custom"),
    ],
  });

  assert.equal(result.status, "projected");
  assert.deepEqual(result.messages, [user, delivered]);
  assert.deepEqual(result.selectedRefs, []);

  assert.deepEqual(
    projectReasoningContext({
      sessionId: "session-1",
      messages: [user, delivered],
      sources: [
        source("user-1", user, "user", undefined, "user"),
        source("notification-1", persisted, "shared", undefined, "custom"),
        source("notification-2", persisted, "shared", undefined, "custom"),
      ],
    }),
    {
      status: "rejected",
      reason: "ambiguous_source:custom",
      position: 1,
      role: "custom",
      customType: "subagent-notification",
    },
  );

  const altered = { ...persisted, details: { ...persisted.details, altered: true } };
  assert.deepEqual(
    projectReasoningContext({
      sessionId: "session-1",
      messages: [user, delivered],
      sources: [
        source("user-1", user, "user", undefined, "user"),
        source("notification-1", altered, "shared", undefined, "custom"),
      ],
    }),
    {
      status: "rejected",
      reason: "source_not_found:custom",
      position: 1,
      role: "custom",
      customType: "subagent-notification",
    },
  );
});

test("rejects a recorded but unavailable legacy result instead of claiming it is missing", () => {
  const assistant = {
    role: "assistant",
    content: [{ type: "toolCall", id: "legacy-missing", name: "read", arguments: {} }],
  };
  assert.deepEqual(
    projectReasoningContext({
      sessionId: "session-1",
      messages: [assistant],
      sources: [
        {
          ...source("assistant-legacy", assistant, "unknown", undefined, "assistant"),
          legacyBaseline: true,
          legacyOutcomeUnavailableCallIds: ["legacy-missing"],
        },
      ],
      required: ["ctx:assistant-legacy"],
      legacyBaselineRefs: ["ctx:assistant-legacy"],
    }),
    {
      status: "rejected",
      reason: "legacy_tool_result_unavailable:ctx:assistant-legacy",
      position: 0,
      role: "assistant",
      ref: "ctx:assistant-legacy",
    },
  );
});
