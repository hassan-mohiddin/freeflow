import assert from "node:assert/strict";
import test from "node:test";
import { CognitiveRoutingSourceRegistry } from "../../dist/cognitive-routing/source-registry.js";

function assistant(toolCallId = "call-a", toolName = "read") {
  return {
    role: "assistant",
    content: [
      { type: "text", text: "I inspected the result." },
      { type: "toolCall", id: toolCallId, name: toolName, arguments: { path: "src/a.ts" } },
    ],
  };
}

function toolResult(toolCallId = "call-a", text = "selected result", toolName = "read") {
  return {
    role: "toolResult",
    toolCallId,
    toolName,
    content: [{ type: "text", text }],
    isError: false,
  };
}

function entry(id, message, parentId = null) {
  return { type: "message", id, parentId, timestamp: "2026-09-06T00:00:00.000Z", message };
}

test("attributes a finalized turn to actual persisted entry ids", () => {
  const before = entry("user-1", { role: "user", content: "Inspect the file" });
  const assistantMessage = assistant();
  const resultMessage = toolResult();
  const after = [
    before,
    entry("assistant-1", assistantMessage, before.id),
    entry("result-1", resultMessage, "assistant-1"),
  ];
  const registry = new CognitiveRoutingSourceRegistry();

  registry.beginTurn({ sessionId: "session-1", profile: "standard", blockId: "block-1", branchEntries: [before] });
  const result = registry.reconcileTurn({
    sessionId: "session-1",
    branchEntries: after,
    assistantMessage,
    toolResults: [resultMessage],
  });

  assert.deepEqual(result, {
    status: "attributed",
    blockId: "block-1",
    profile: "standard",
    assistant: { sessionId: "session-1", entryId: "assistant-1" },
    toolResults: [{ sessionId: "session-1", entryId: "result-1", toolCallId: "call-a", toolName: "read" }],
  });
  assert.equal(registry.sourceForEntry("session-1", "result-1").entryId, "result-1");
});

test("rejects ambiguous duplicate message association without publishing partial refs", () => {
  const before = entry("user-1", { role: "user", content: "Repeat" });
  const first = assistant();
  const second = assistant();
  const branch = [
    before,
    entry("assistant-1", { ...first, content: structuredClone(first.content) }, before.id),
    entry("assistant-2", { ...second, content: structuredClone(second.content) }, "assistant-1"),
  ];
  const registry = new CognitiveRoutingSourceRegistry();
  registry.beginTurn({ sessionId: "session-1", profile: "standard", blockId: "block-1", branchEntries: [before] });

  const result = registry.reconcileTurn({
    sessionId: "session-1",
    branchEntries: branch,
    assistantMessage: first,
    toolResults: [toolResult()],
  });

  assert.deepEqual(result, { status: "unavailable", reason: "ambiguous_assistant_entry" });
  assert.equal(registry.sourceForEntry("session-1", "assistant-1"), undefined);
  assert.equal(registry.sourceForEntry("session-1", "assistant-2"), undefined);
});

test("resolves the synchronized switch assistant only when its call is present", () => {
  const assistantMessage = assistant("switch-call", "freeflow_switch_profile");
  const before = entry("user-1", { role: "user", content: "Switch when ready" });
  const branch = [before, entry("assistant-1", assistantMessage, before.id)];
  const registry = new CognitiveRoutingSourceRegistry();
  registry.beginTurn({ sessionId: "session-1", profile: "standard", blockId: "block-1", branchEntries: [before] });

  assert.deepEqual(
    registry.resolveSwitchHandoff({ sessionId: "session-1", branchEntries: branch, toolCallId: "switch-call" }),
    {
      status: "available",
      source: { sessionId: "session-1", entryId: "assistant-1", toolCallId: "switch-call" },
    },
  );
  assert.deepEqual(
    registry.resolveSwitchHandoff({ sessionId: "session-1", branchEntries: branch, toolCallId: "missing" }),
    {
      status: "unavailable",
      reason: "switch_assistant_not_found",
    },
  );
});

test("rejects duplicate switch calls and completed handoffs", () => {
  const before = entry("user-1", { role: "user", content: "Switch" });
  const switchMessage = assistant("switch-call", "freeflow_switch_profile");
  const duplicateCallMessage = {
    ...switchMessage,
    content: [...switchMessage.content, ...switchMessage.content.filter((part) => part.type === "toolCall")],
  };
  const duplicate = structuredClone(switchMessage);
  const branch = [
    before,
    entry("assistant-1", switchMessage, before.id),
    { type: "custom", id: "state-1", parentId: "assistant-1" },
    entry("assistant-2", duplicate, "state-1"),
  ];
  const registry = new CognitiveRoutingSourceRegistry();
  registry.beginTurn({ sessionId: "session-1", profile: "standard", blockId: "block-1", branchEntries: [before] });

  assert.deepEqual(
    registry.resolveSwitchHandoff({ sessionId: "session-1", branchEntries: branch, toolCallId: "switch-call" }),
    { status: "unavailable", reason: "switch_assistant_ambiguous" },
  );
  assert.deepEqual(
    registry.resolveSwitchHandoff({
      sessionId: "session-1",
      branchEntries: [before, entry("assistant-3", duplicateCallMessage, before.id)],
      toolCallId: "switch-call",
    }),
    { status: "unavailable", reason: "switch_call_ambiguous" },
  );

  const complete = [before, entry("assistant-1", switchMessage, before.id)];
  const switchResult = toolResult("switch-call", "switched", "freeflow_switch_profile");
  const completedBranch = [...complete, entry("result-1", switchResult, "assistant-1")];
  const completed = registry.reconcileTurn({
    sessionId: "session-1",
    branchEntries: completedBranch,
    assistantMessage: switchMessage,
    toolResults: [switchResult],
  });
  assert.equal(completed.status, "attributed");
  assert.deepEqual(
    registry.resolveSwitchHandoff({
      sessionId: "session-1",
      branchEntries: completedBranch,
      toolCallId: "switch-call",
    }),
    { status: "unavailable", reason: "turn_already_attributed" },
  );
});

test("does not overwrite an unresolved active turn", () => {
  const before = entry("user-1", { role: "user", content: "Inspect" });
  const registry = new CognitiveRoutingSourceRegistry();
  registry.beginTurn({ sessionId: "session-1", profile: "standard", blockId: "block-1", branchEntries: [before] });

  assert.throws(
    () =>
      registry.beginTurn({ sessionId: "session-1", profile: "reasoning", blockId: "block-2", branchEntries: [before] }),
    /active_turn_unresolved/,
  );
});

test("rejects mismatched tool-result linkage", () => {
  const before = entry("user-1", { role: "user", content: "Inspect" });
  const assistantMessage = assistant("call-a");
  const resultMessage = toolResult("call-b");
  const branch = [
    before,
    entry("assistant-1", assistantMessage, before.id),
    entry("result-1", resultMessage, "assistant-1"),
  ];
  const registry = new CognitiveRoutingSourceRegistry();
  registry.beginTurn({ sessionId: "session-1", profile: "standard", blockId: "block-1", branchEntries: [before] });

  assert.deepEqual(
    registry.reconcileTurn({
      sessionId: "session-1",
      branchEntries: branch,
      assistantMessage,
      toolResults: [resultMessage],
    }),
    { status: "unavailable", reason: "tool_result_not_linked:call-b" },
  );
});

test("requires the active turn branch and rejects an old ancestor handoff", () => {
  const oldUser = entry("user-old", { role: "user", content: "Old" });
  const oldAssistant = entry("assistant-old", assistant("switch-call", "freeflow_switch_profile"), oldUser.id);
  const currentUser = entry("user-current", { role: "user", content: "Current" }, oldAssistant.id);
  const registry = new CognitiveRoutingSourceRegistry();
  registry.beginTurn({
    sessionId: "session-1",
    profile: "standard",
    blockId: "block-2",
    branchEntries: [oldUser, oldAssistant, currentUser],
  });

  assert.deepEqual(
    registry.resolveSwitchHandoff({
      sessionId: "session-1",
      branchEntries: [oldUser, oldAssistant, currentUser],
      toolCallId: "switch-call",
    }),
    { status: "unavailable", reason: "switch_assistant_not_found" },
  );
  assert.deepEqual(
    registry.resolveSwitchHandoff({
      sessionId: "other-session",
      branchEntries: [oldUser, oldAssistant, currentUser],
      toolCallId: "switch-call",
    }),
    { status: "unavailable", reason: "turn_session_changed" },
  );
});

test("rejects branch divergence and leaves the captured profile unchanged", () => {
  const before = entry("user-1", { role: "user", content: "Inspect" });
  const assistantMessage = assistant();
  const resultMessage = toolResult();
  const registry = new CognitiveRoutingSourceRegistry();
  registry.beginTurn({ sessionId: "session-1", profile: "standard", blockId: "block-1", branchEntries: [before] });

  const diverged = [
    entry("other-root", { role: "user", content: "Other branch" }),
    entry("assistant-2", assistantMessage),
    entry("result-2", resultMessage, "assistant-2"),
  ];
  assert.deepEqual(
    registry.reconcileTurn({
      sessionId: "session-1",
      branchEntries: diverged,
      assistantMessage,
      toolResults: [resultMessage],
    }),
    { status: "unavailable", reason: "turn_branch_changed" },
  );
  assert.equal(registry.sourceForEntry("session-1", "assistant-2"), undefined);
});

test("rejects incomplete finalized observations without publishing the assistant", () => {
  const before = entry("user-1", { role: "user", content: "Inspect" });
  const assistantMessage = assistant();
  const registry = new CognitiveRoutingSourceRegistry();
  registry.beginTurn({ sessionId: "session-1", profile: "standard", blockId: "block-1", branchEntries: [before] });

  assert.deepEqual(
    registry.reconcileTurn({
      sessionId: "session-1",
      branchEntries: [before, entry("assistant-1", assistantMessage, before.id)],
      assistantMessage,
      toolResults: [toolResult()],
    }),
    { status: "unavailable", reason: "finalized_entry_count_mismatch" },
  );
  assert.equal(registry.sourceForEntry("session-1", "assistant-1"), undefined);
});

test("uses actual SessionManager append ids in a positive reconciliation", async () => {
  const { SessionManager } = await import("@earendil-works/pi-coding-agent");
  const manager = SessionManager.inMemory("/tmp/source-registry");
  const userId = manager.appendMessage({ role: "user", content: "Inspect", timestamp: 1 });
  const assistantMessage = assistant();
  const assistantId = manager.appendMessage(assistantMessage);
  const resultMessage = toolResult();
  const resultId = manager.appendMessage(resultMessage);
  const registry = new CognitiveRoutingSourceRegistry();
  const branchBefore = manager.getBranch(userId);
  registry.beginTurn({
    sessionId: manager.getSessionId(),
    profile: "standard",
    blockId: "block-1",
    branchEntries: branchBefore,
  });

  const result = registry.reconcileTurn({
    sessionId: manager.getSessionId(),
    branchEntries: manager.getBranch(),
    assistantMessage,
    toolResults: [resultMessage],
  });

  assert.equal(assistantId.length, 8);
  assert.equal(resultId.length, 8);
  assert.equal(userId.length, 8);
  assert.equal(result.status, "attributed");
  assert.equal(result.assistant.entryId, assistantId);
  assert.equal(result.toolResults[0].entryId, resultId);
});

test("retains immutable profile and block attribution across turns and branches", () => {
  const firstUser = entry("user-1", { role: "user", content: "Inspect the first result" });
  const firstAssistant = assistant("call-standard");
  const firstResult = toolResult("call-standard", "standard result");
  const firstBranch = [
    firstUser,
    entry("assistant-standard", firstAssistant, firstUser.id),
    entry("result-standard", firstResult, "assistant-standard"),
  ];
  const registry = new CognitiveRoutingSourceRegistry();

  registry.beginTurn({
    sessionId: "session-1",
    profile: "standard",
    blockId: "block-standard",
    branchEntries: [firstUser],
  });
  assert.equal(
    registry.reconcileTurn({
      sessionId: "session-1",
      branchEntries: firstBranch,
      assistantMessage: firstAssistant,
      toolResults: [firstResult],
    }).status,
    "attributed",
  );

  const stableFirstBranch = structuredClone(firstBranch);
  const secondStandardAssistant = assistant("call-standard-2");
  const secondStandardResult = toolResult("call-standard-2", "second standard result");
  const secondBranch = [
    ...firstBranch,
    entry("assistant-standard-2", secondStandardAssistant, "result-standard"),
    entry("result-standard-2", secondStandardResult, "assistant-standard-2"),
  ];
  registry.beginTurn({
    sessionId: "session-1",
    profile: "standard",
    blockId: "block-standard",
    branchEntries: firstBranch,
  });
  assert.equal(
    registry.reconcileTurn({
      sessionId: "session-1",
      branchEntries: secondBranch,
      assistantMessage: secondStandardAssistant,
      toolResults: [secondStandardResult],
    }).status,
    "attributed",
  );

  const reasoningAssistant = assistant("call-reasoning");
  const reasoningResult = toolResult("call-reasoning", "reasoning result");
  const reasoningBranch = [
    ...secondBranch,
    entry("assistant-reasoning", reasoningAssistant, "result-standard-2"),
    entry("result-reasoning", reasoningResult, "assistant-reasoning"),
  ];
  registry.beginTurn({
    sessionId: "session-1",
    profile: "reasoning",
    blockId: "block-reasoning",
    branchEntries: secondBranch,
  });
  assert.equal(
    registry.reconcileTurn({
      sessionId: "session-1",
      branchEntries: reasoningBranch,
      assistantMessage: reasoningAssistant,
      toolResults: [reasoningResult],
    }).status,
    "attributed",
  );

  const standardAttribution = registry.attributionForEntry("session-1", "result-standard");
  assert.deepEqual(standardAttribution, {
    source: { sessionId: "session-1", entryId: "result-standard", toolCallId: "call-standard", toolName: "read" },
    profile: "standard",
    blockId: "block-standard",
    kind: "toolResult",
    message: firstResult,
  });
  firstResult.content[0].text = "mutated after reconciliation";
  standardAttribution.message.content[0].text = "mutated returned snapshot";
  standardAttribution.source.entryId = "wrong-entry";
  assert.equal(registry.attributionForEntry("session-1", "result-standard").message.content[0].text, "standard result");
  assert.equal(registry.attributionForEntry("session-1", "result-standard").source.entryId, "result-standard");

  const branchLookup = registry.attributionsForBranch("session-1", stableFirstBranch);
  assert.deepEqual(branchLookup, {
    status: "available",
    attributions: [
      {
        source: { sessionId: "session-1", entryId: "assistant-standard" },
        profile: "standard",
        blockId: "block-standard",
        kind: "assistant",
        message: firstAssistant,
      },
      {
        source: {
          sessionId: "session-1",
          entryId: "result-standard",
          toolCallId: "call-standard",
          toolName: "read",
        },
        profile: "standard",
        blockId: "block-standard",
        kind: "toolResult",
        message: { ...firstResult, content: [{ type: "text", text: "standard result" }] },
      },
    ],
  });
  branchLookup.attributions[0].message.content[0].text = "mutated branch lookup";
  assert.equal(
    registry.attributionForEntry("session-1", "assistant-standard").message.content[0].text,
    "I inspected the result.",
  );
  assert.deepEqual(registry.attributionForEntry("session-1", "result-standard-2"), {
    source: {
      sessionId: "session-1",
      entryId: "result-standard-2",
      toolCallId: "call-standard-2",
      toolName: "read",
    },
    profile: "standard",
    blockId: "block-standard",
    kind: "toolResult",
    message: secondStandardResult,
  });
  assert.deepEqual(registry.attributionForEntry("session-1", "assistant-reasoning"), {
    source: { sessionId: "session-1", entryId: "assistant-reasoning" },
    profile: "reasoning",
    blockId: "block-reasoning",
    kind: "assistant",
    message: reasoningAssistant,
  });
});

test("rejects attribution conflicts without reclassifying or partially publishing", () => {
  const before = entry("user-1", { role: "user", content: "Inspect" });
  const firstAssistant = assistant("call-conflict");
  const firstResult = toolResult("call-conflict", "stable result");
  const firstBranch = [
    before,
    entry("assistant-conflict", firstAssistant, before.id),
    entry("result-conflict", firstResult, "assistant-conflict"),
  ];
  const registry = new CognitiveRoutingSourceRegistry();
  registry.beginTurn({
    sessionId: "session-1",
    profile: "standard",
    blockId: "block-standard",
    branchEntries: [before],
  });
  registry.reconcileTurn({
    sessionId: "session-1",
    branchEntries: firstBranch,
    assistantMessage: firstAssistant,
    toolResults: [firstResult],
  });

  const sameAssistant = structuredClone(firstAssistant);
  const sameResult = structuredClone(firstResult);
  registry.beginTurn({
    sessionId: "session-1",
    profile: "reasoning",
    blockId: "block-reasoning",
    branchEntries: [before],
  });
  assert.deepEqual(
    registry.reconcileTurn({
      sessionId: "session-1",
      branchEntries: [
        before,
        entry("assistant-conflict", sameAssistant, before.id),
        entry("result-new", sameResult, "assistant-conflict"),
      ],
      assistantMessage: sameAssistant,
      toolResults: [sameResult],
    }),
    { status: "unavailable", reason: "attributed_entry_conflict:assistant-conflict" },
  );
  assert.equal(registry.attributionForEntry("session-1", "assistant-conflict").profile, "standard");
  assert.equal(registry.attributionForEntry("session-1", "assistant-conflict").blockId, "block-standard");
  assert.equal(registry.attributionForEntry("session-1", "result-new"), undefined);
});

test("retains a Standard switch handoff and result after a later Reasoning turn", () => {
  const before = entry("user-1", { role: "user", content: "Switch after the work" });
  const switchAssistant = assistant("switch-call", "freeflow_switch_profile");
  const switchResult = toolResult("switch-call", "switched", "freeflow_switch_profile");
  const standardBranch = [
    before,
    entry("assistant-switch", switchAssistant, before.id),
    entry("result-switch", switchResult, "assistant-switch"),
  ];
  const registry = new CognitiveRoutingSourceRegistry();
  registry.beginTurn({
    sessionId: "session-1",
    profile: "standard",
    blockId: "block-standard",
    branchEntries: [before],
  });
  registry.reconcileTurn({
    sessionId: "session-1",
    branchEntries: standardBranch,
    assistantMessage: switchAssistant,
    toolResults: [switchResult],
  });

  const reasoningAssistant = assistant("reasoning-call");
  const reasoningResult = toolResult("reasoning-call", "assessment");
  registry.beginTurn({
    sessionId: "session-1",
    profile: "reasoning",
    blockId: "block-reasoning",
    branchEntries: standardBranch,
  });
  registry.reconcileTurn({
    sessionId: "session-1",
    branchEntries: [
      ...standardBranch,
      entry("assistant-reasoning", reasoningAssistant, "result-switch"),
      entry("result-reasoning", reasoningResult, "assistant-reasoning"),
    ],
    assistantMessage: reasoningAssistant,
    toolResults: [reasoningResult],
  });

  assert.equal(registry.attributionForEntry("session-1", "assistant-switch").profile, "standard");
  assert.equal(registry.attributionForEntry("session-1", "assistant-switch").blockId, "block-standard");
  assert.equal(registry.attributionForEntry("session-1", "result-switch").profile, "standard");
  assert.equal(registry.attributionForEntry("session-1", "result-switch").blockId, "block-standard");
});

test("does not publish attribution when finalized message snapshots cannot be cloned", () => {
  const before = entry("user-1", { role: "user", content: "Inspect" });
  const assistantMessage = {
    role: "assistant",
    content: [{ type: "text", text: "unserializable" }],
    metadata: { callback: () => {} },
  };
  const branch = [before, entry("assistant-1", assistantMessage, before.id)];
  const registry = new CognitiveRoutingSourceRegistry();
  registry.beginTurn({ sessionId: "session-1", profile: "standard", blockId: "block-1", branchEntries: [before] });

  assert.deepEqual(
    registry.reconcileTurn({
      sessionId: "session-1",
      branchEntries: branch,
      assistantMessage,
      toolResults: [],
    }),
    { status: "unavailable", reason: "attributed_snapshot_failed" },
  );
  assert.equal(registry.sourceForEntry("session-1", "assistant-1"), undefined);
  assert.equal(registry.attributionForEntry("session-1", "assistant-1"), undefined);
  assert.throws(
    () =>
      registry.beginTurn({ sessionId: "session-1", profile: "reasoning", blockId: "block-2", branchEntries: branch }),
    /active_turn_unresolved/,
  );
});

test("rejects missing, changed, and ambiguous branch attributions without reclassification", () => {
  const before = entry("user-1", { role: "user", content: "Inspect" });
  const assistantMessage = assistant();
  const resultMessage = toolResult();
  const branch = [
    before,
    entry("assistant-1", assistantMessage, before.id),
    entry("result-1", resultMessage, "assistant-1"),
  ];
  const registry = new CognitiveRoutingSourceRegistry();
  registry.beginTurn({ sessionId: "session-1", profile: "standard", blockId: "block-1", branchEntries: [before] });
  registry.reconcileTurn({
    sessionId: "session-1",
    branchEntries: branch,
    assistantMessage,
    toolResults: [resultMessage],
  });

  assert.deepEqual(registry.attributionsForBranch("session-1", [before], ["result-1"]), {
    status: "unavailable",
    reason: "attributed_entry_missing:result-1",
  });
  assert.deepEqual(
    registry.attributionsForBranch("session-1", [
      before,
      entry("assistant-1", { ...assistantMessage, content: [{ type: "text", text: "changed" }] }),
    ]),
    { status: "unavailable", reason: "attributed_entry_changed:assistant-1" },
  );
  assert.deepEqual(registry.attributionsForBranch("session-1", [...branch, entry("assistant-1", assistantMessage)]), {
    status: "unavailable",
    reason: "attributed_entry_ambiguous:assistant-1",
  });
  assert.deepEqual(
    registry.attributionsForBranch("session-1", [before, { type: "custom", id: "assistant-1" }], ["assistant-1"]),
    { status: "unavailable", reason: "attributed_entry_changed:assistant-1" },
  );
  assert.deepEqual(registry.attributionsForBranch("session-1", [...branch, { type: "custom", id: "assistant-1" }]), {
    status: "unavailable",
    reason: "attributed_entry_ambiguous:assistant-1",
  });
  assert.deepEqual(registry.attributionForEntry("other-session", "result-1"), undefined);
});

test("rejects changed contents when a completed entry keeps the same id", () => {
  const before = entry("user-1", { role: "user", content: "Inspect" });
  const assistantMessage = assistant();
  const resultMessage = toolResult();
  const branch = [
    before,
    entry("assistant-1", assistantMessage, before.id),
    entry("result-1", resultMessage, "assistant-1"),
  ];
  const registry = new CognitiveRoutingSourceRegistry();
  registry.beginTurn({ sessionId: "session-1", profile: "standard", blockId: "block-1", branchEntries: [before] });
  registry.reconcileTurn({
    sessionId: "session-1",
    branchEntries: branch,
    assistantMessage,
    toolResults: [resultMessage],
  });

  const changedAssistant = structuredClone(assistantMessage);
  changedAssistant.content[0].text = "changed after attribution";
  const changedBranch = [
    before,
    entry("assistant-1", changedAssistant, before.id),
    entry("result-1", resultMessage, "assistant-1"),
  ];
  assert.deepEqual(
    registry.reconcileTurn({
      sessionId: "session-1",
      branchEntries: changedBranch,
      assistantMessage: changedAssistant,
      toolResults: [resultMessage],
    }),
    { status: "unavailable", reason: "completed_observation_changed" },
  );
});

test("does not republish a completed turn or lose its captured profile", () => {
  const before = entry("user-1", { role: "user", content: "Inspect" });
  const assistantMessage = assistant();
  const resultMessage = toolResult();
  const branch = [
    before,
    entry("assistant-1", assistantMessage, before.id),
    entry("result-1", resultMessage, "assistant-1"),
  ];
  const registry = new CognitiveRoutingSourceRegistry();
  registry.beginTurn({ sessionId: "session-1", profile: "standard", blockId: "block-1", branchEntries: [before] });
  const first = registry.reconcileTurn({
    sessionId: "session-1",
    branchEntries: branch,
    assistantMessage,
    toolResults: [resultMessage],
  });
  const second = registry.reconcileTurn({
    sessionId: "session-1",
    branchEntries: branch,
    assistantMessage,
    toolResults: [resultMessage],
  });

  assert.equal(first.status, "attributed");
  assert.deepEqual(second, { status: "already_attributed", blockId: "block-1", profile: "standard" });
  assert.deepEqual(registry.sourceForEntry("session-1", "result-1"), {
    sessionId: "session-1",
    entryId: "result-1",
    toolCallId: "call-a",
    toolName: "read",
  });
});
