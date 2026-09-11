import assert from "node:assert/strict";
import test from "node:test";
import { CognitiveRoutingProjectionCoordinator } from "../../dist/cognitive-routing/projection-coordinator.js";

function entry(id, message, parentId = null) {
  return { type: "message", id, parentId, timestamp: "2026-09-06T00:00:00.000Z", message };
}

function user(text = "Inspect the selected evidence") {
  return { role: "user", content: [{ type: "text", text }] };
}

function assistant(toolCallId, toolName = "capture_evidence") {
  return {
    role: "assistant",
    content: [
      { type: "text", text: "Completed the bounded step." },
      { type: "toolCall", id: toolCallId, name: toolName, arguments: {} },
    ],
  };
}

function toolResult(toolCallId, text = "CAPTURED_EVIDENCE", toolName = "capture_evidence") {
  return {
    role: "toolResult",
    toolCallId,
    toolName,
    content: [{ type: "text", text }],
    isError: false,
  };
}

function fixture({
  enabled = true,
  state = { effective: true, controlMode: "automatic", activeProfile: "standard" },
  appendEntry,
  onDiagnostic,
} = {}) {
  const messages = user();
  const entries = [entry("user-1", messages)];
  let routingState = state;
  const journals = [];
  const ctx = {
    sessionManager: {
      getSessionId: () => "session-1",
      getBranch: () => entries,
      buildContextEntries: () => entries.filter((entry) => entry.type === "message"),
    },
  };
  const coordinator = new CognitiveRoutingProjectionCoordinator({
    isEnabled: () => enabled,
    getRoutingState: () => routingState,
    appendEntry:
      appendEntry ??
      ((_customType, data) => {
        journals.push(data);
        entries.push({
          type: "custom",
          id: `journal-${journals.length}`,
          parentId: entries.at(-1)?.id ?? null,
          customType: _customType,
          data,
        });
      }),
    idFactory: () => `block-${journals.length + 1}`,
    onDiagnostic,
  });
  return {
    coordinator,
    ctx,
    entries,
    journals,
    setRoutingState(next) {
      routingState = next;
    },
  };
}

async function captureStandardTurn(fixtureValue, callId = "capture-call") {
  const { coordinator, ctx, entries } = fixtureValue;
  await coordinator.turnStart(ctx);
  const baseline = coordinator.context(ctx, [entries[0].message]);
  assert.equal(baseline.changed, true);
  const assistantMessage = assistant(callId);
  const resultMessage = toolResult(callId);
  entries.push(entry(`assistant-${callId}`, assistantMessage, entries.at(-1)?.id ?? null));
  entries.push(entry(`result-${callId}`, resultMessage, `assistant-${callId}`));
  return coordinator.turnEnd(ctx, { message: assistantMessage, toolResults: [resultMessage] });
}

async function nextStandardContext(fixtureValue, messages) {
  const { coordinator, ctx } = fixtureValue;
  await coordinator.turnStart(ctx);
  return coordinator.context(ctx, messages);
}

test("default-off and manual/inactive paths preserve marker-shaped source text exactly", async () => {
  const markerMessage = {
    role: "user",
    content: [
      { type: "text", text: "literal" },
      { type: "text", text: "[projection-ref: ctx:legitimate]" },
      { type: "text", text: "[context-ref: ctx:literal]" },
    ],
  };
  const disabled = fixture({ enabled: false });
  const disabledResult = disabled.coordinator.context(disabled.ctx, [markerMessage]);
  assert.equal(disabledResult.changed, false);
  assert.equal(disabledResult.messages[0], markerMessage);
  assert.equal(disabled.coordinator.exposure(), undefined);
  assert.deepEqual(disabled.journals, []);

  const manual = fixture({ state: { effective: true, controlMode: "manual-standard", activeProfile: "standard" } });
  await manual.coordinator.turnStart(manual.ctx);
  const manualResult = manual.coordinator.context(manual.ctx, [markerMessage]);
  assert.equal(manualResult.changed, false);
  assert.equal(manualResult.messages[0], markerMessage);
  assert.equal(manual.coordinator.exposure(), undefined);
  assert.equal(manual.journals.length, 1);
  assert.equal(manual.journals[0].kind, "baseline");
});

test("requires actual session identity and getBranch without writing source state", async () => {
  const missingSession = fixture();
  missingSession.ctx.sessionManager.getSessionId = undefined;
  await missingSession.coordinator.turnStart(missingSession.ctx);
  const missingSessionMessage = { role: "user", content: [{ type: "text", text: "unchanged" }] };
  const missingSessionResult = missingSession.coordinator.context(missingSession.ctx, [missingSessionMessage]);
  assert.equal(missingSessionResult.changed, false);
  assert.equal(missingSessionResult.messages[0], missingSessionMessage);
  assert.equal(missingSession.coordinator.failureReason(), "session_identity_unavailable");
  assert.deepEqual(missingSession.journals, []);

  const missingBranch = fixture();
  missingBranch.ctx.sessionManager.getBranch = undefined;
  await missingBranch.coordinator.turnStart(missingBranch.ctx);
  const missingBranchMessage = { role: "user", content: [{ type: "text", text: "unchanged" }] };
  const missingBranchResult = missingBranch.coordinator.context(missingBranch.ctx, [missingBranchMessage]);
  assert.equal(missingBranchResult.changed, false);
  assert.equal(missingBranchResult.messages[0], missingBranchMessage);
  assert.equal(missingBranch.coordinator.failureReason(), "branch_entries_unavailable");
  assert.deepEqual(missingBranch.journals, []);
});

test("rejects duplicate visible source reuse and transformed source content", async () => {
  const duplicate = fixture();
  assert.equal((await captureStandardTurn(duplicate)).status, "captured");
  const resultEntry = duplicate.entries.find((candidate) => candidate.id === "result-capture-call");
  assert.ok(resultEntry);
  const duplicateMessages = [duplicate.entries[0].message, resultEntry.message, structuredClone(resultEntry.message)];
  const duplicateContext = await nextStandardContext(duplicate, duplicateMessages);
  assert.equal(duplicateContext.changed, false);
  assert.deepEqual(duplicateContext.messages, duplicateMessages);
  assert.equal(duplicate.coordinator.failureReason(), "visible_source_reused");
  assert.equal(duplicate.coordinator.exposure(), undefined);

  const transformed = fixture();
  assert.equal((await captureStandardTurn(transformed)).status, "captured");
  const transformedResult = structuredClone(
    transformed.entries.find((candidate) => candidate.id === "result-capture-call").message,
  );
  transformedResult.content[0].text = "changed before exposure";
  const transformedContext = await nextStandardContext(transformed, [
    transformed.entries[0].message,
    transformedResult,
  ]);
  assert.equal(transformedContext.changed, true);
  assert.doesNotMatch(JSON.stringify(transformedContext.messages[1]), /ctx:result-capture-call/);
  assert.ok(transformed.coordinator.exposure());
  assert.equal(
    transformed.coordinator.exposure().sources.some((source) => source.source.entryId === "result-capture-call"),
    false,
  );
});

test("keeps separate selection failures distinct while deduplicating repeats", async () => {
  const reports = [];
  const value = fixture({
    onDiagnostic: (diagnostic) => {
      reports.push(diagnostic);
      return { persisted: true, notificationAvailable: false, notificationAttempted: false };
    },
  });
  const input = (toolCallId) => ({
    toolCallId,
    target: "invalid",
    reason: "Invalid target.",
    signal: undefined,
    ctx: value.ctx,
    controller: { state: () => ({ effective: true, controlMode: "automatic" }) },
  });

  assert.equal((await value.coordinator.switchProfile(input("call-a"))).reason, "target_invalid");
  assert.equal((await value.coordinator.switchProfile(input("call-b"))).reason, "target_invalid");
  assert.equal((await value.coordinator.switchProfile(input("call-b"))).reason, "target_invalid");
  assert.deepEqual(
    reports.map((report) => report.operationId),
    ["call-a", "call-b"],
  );
});

test("deduplicates a persistent context failure across later turns", async () => {
  const reports = [];
  const value = fixture({
    onDiagnostic: (diagnostic) => {
      reports.push(diagnostic);
      return { persisted: true, notificationAvailable: false, notificationAttempted: false };
    },
  });
  value.ctx.sessionManager.getSessionId = undefined;

  await value.coordinator.turnStart(value.ctx);
  const first = value.coordinator.context(value.ctx, [value.entries[0].message]);
  await value.coordinator.turnStart(value.ctx);
  const second = value.coordinator.context(value.ctx, [value.entries[0].message]);

  assert.equal(first.changed, false);
  assert.equal(second.changed, false);
  assert.equal(value.coordinator.failureReason(), "session_identity_unavailable");
  assert.equal(reports.length, 1);
});

test("exposes diagnostic persistence failure without claiming it was saved", async () => {
  const reports = [];
  const value = fixture({
    onDiagnostic: (diagnostic) => {
      reports.push(diagnostic);
      return {
        persisted: false,
        notificationAvailable: false,
        notificationAttempted: false,
        persistenceError: "diagnostic write failed",
      };
    },
  });
  assert.equal((await captureStandardTurn(value)).status, "captured");
  const result = await nextStandardContext(value, [
    value.entries[0].message,
    value.entries[2].message,
    value.entries[2].message,
  ]);

  assert.equal(result.changed, false);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].stage, "attribution");
  assert.equal(result.diagnostic?.delivery.persisted, false);
  assert.equal(result.diagnostic?.delivery.persistenceError, "diagnostic write failed");
});

test("rejects an unavailable legacy result even when an active same-id result exists", async () => {
  const value = fixture({
    state: { effective: true, controlMode: "automatic", activeProfile: "reasoning" },
  });
  const assistantMessage = assistant("legacy-call", "read");
  const activeResultMessage = toolResult("legacy-call", "ACTIVE_RESULT", "read");
  const compactedResultMessage = toolResult("legacy-call", "COMPACTED_RESULT", "read");
  value.entries.push(
    entry("assistant-legacy", assistantMessage, "user-1"),
    entry("result-active", activeResultMessage, "assistant-legacy"),
    entry("result-compacted", compactedResultMessage, "assistant-legacy"),
    {
      type: "custom",
      id: "baseline-legacy",
      parentId: "result-compacted",
      customType: "freeflow-cognitive-routing-baseline",
      data: {
        version: 1,
        kind: "baseline",
        sessionId: "session-1",
        entryIds: ["assistant-legacy", "result-active", "result-compacted"],
      },
    },
  );
  value.ctx.sessionManager.buildContextEntries = () =>
    value.entries.filter((candidate) => candidate.type === "message" && candidate.id !== "result-compacted");
  let aborts = 0;
  value.ctx.abort = () => {
    aborts += 1;
  };

  await value.coordinator.turnStart(value.ctx);
  const result = value.coordinator.context(value.ctx, [
    value.entries[0].message,
    assistantMessage,
    activeResultMessage,
  ]);

  assert.equal(result.changed, false);
  assert.equal(value.coordinator.failureReason(), "legacy_tool_result_unavailable:ctx:assistant-legacy");
  assert.equal(aborts, 1);
});

test("rejects an existing but unexposed include ref before transition", async () => {
  const value = fixture();
  assert.equal((await captureStandardTurn(value)).status, "captured");
  const oldRef = "ctx:result-capture-call";
  const context = await nextStandardContext(value, [value.entries[0].message]);
  assert.equal(context.changed, true);
  assert.equal(
    value.coordinator.exposure().sources.some((source) => source.ref === oldRef),
    false,
    "the canonical result exists but is not exposed in this context",
  );
  const switchMessage = assistant("switch-call", "freeflow_switch_profile");
  value.entries.push(entry("assistant-switch", switchMessage, value.entries.at(-1)?.id ?? null));
  let transitionCalls = 0;
  const result = await value.coordinator.switchProfile({
    toolCallId: "switch-call",
    target: "reasoning",
    reason: "Reject an unexposed evidence ref.",
    projection: { include: [oldRef], shared: [] },
    signal: undefined,
    ctx: value.ctx,
    controller: {
      state: () => ({ effective: true, controlMode: "automatic", activeProfile: "standard" }),
      switchAutomaticProfile: async () => {
        transitionCalls += 1;
        return { status: "active" };
      },
    },
  });
  assert.deepEqual(result, { status: "blocked", reason: `projection_ref_not_exposed:${oldRef}` });
  assert.equal(transitionCalls, 0, "unexposed selection must block before profile transition");
});

test("rejects non-Standard and unattributed include refs before transition", async () => {
  const assertBlocked = async (value, ref, reason) => {
    const context = await nextStandardContext(value, [value.entries[0].message]);
    assert.equal(context.changed, true);
    assert.equal(
      value.coordinator.exposure().sources.some((source) => source.ref === ref),
      ref === "ctx:user-1",
    );
    const switchMessage = assistant("switch-call", "freeflow_switch_profile");
    value.entries.push(entry("assistant-switch", switchMessage, value.entries.at(-1)?.id ?? null));
    let transitionCalls = 0;
    const result = await value.coordinator.switchProfile({
      toolCallId: "switch-call",
      target: "reasoning",
      reason: "Reject an ineligible evidence ref.",
      projection: { include: [ref], shared: [] },
      signal: undefined,
      ctx: value.ctx,
      controller: {
        state: () => ({ effective: true, controlMode: "automatic", activeProfile: "standard" }),
        switchAutomaticProfile: async () => {
          transitionCalls += 1;
          return { status: "active" };
        },
      },
    });
    assert.deepEqual(result, { status: "blocked", reason });
    assert.equal(transitionCalls, 0);
  };

  await assertBlocked(fixture(), "ctx:user-1", "include_ref_not_standard:ctx:user-1");

  const unattributed = fixture();
  const unattributedAssistant = assistant("unattributed-call");
  const unattributedResult = toolResult("unattributed-call", "UNATTRIBUTED_EVIDENCE");
  unattributed.entries.push(
    entry("assistant-unattributed", unattributedAssistant, unattributed.entries.at(-1)?.id ?? null),
    entry("result-unattributed", unattributedResult, "assistant-unattributed"),
  );
  await assertBlocked(unattributed, "ctx:result-unattributed", "projection_ref_not_exposed:ctx:result-unattributed");
});

test("rejects malformed and out-of-order baseline metadata before context assembly", async () => {
  const malformed = fixture();
  malformed.entries.push({
    type: "custom",
    id: "baseline-invalid",
    parentId: "user-1",
    customType: "freeflow-cognitive-routing-baseline",
    data: { version: 1, kind: "baseline", sessionId: "session-1", entryIds: "not-an-array" },
  });
  await malformed.coordinator.turnStart(malformed.ctx);
  const malformedContext = malformed.coordinator.context(malformed.ctx, [malformed.entries[0].message]);
  assert.equal(malformedContext.changed, false);
  assert.equal(malformed.coordinator.failureReason(), "baseline_entry_invalid");

  const outOfOrder = fixture();
  outOfOrder.entries.push({
    type: "custom",
    id: "baseline-order",
    parentId: "user-1",
    customType: "freeflow-cognitive-routing-baseline",
    data: { version: 1, kind: "baseline", sessionId: "session-1", entryIds: ["assistant-later"] },
  });
  outOfOrder.entries.push(
    entry("assistant-later", assistant("later-call"), "baseline-order"),
    entry("result-later", toolResult("later-call"), "assistant-later"),
  );
  await outOfOrder.coordinator.turnStart(outOfOrder.ctx);
  const outOfOrderContext = outOfOrder.coordinator.context(outOfOrder.ctx, [outOfOrder.entries[0].message]);
  assert.equal(outOfOrderContext.changed, false);
  assert.equal(outOfOrder.coordinator.failureReason(), "baseline_entry_ref_unavailable:assistant-later");
});

test("baseline no-op persistence is rejected before first context", async () => {
  const noOp = fixture({ appendEntry: () => undefined });
  await noOp.coordinator.turnStart(noOp.ctx);
  const context = noOp.coordinator.context(noOp.ctx, [noOp.entries[0].message]);
  assert.equal(context.changed, false);
  assert.equal(noOp.coordinator.failureReason(), "baseline_persistence_unconfirmed");
});

test("baseline persistence failure blocks first context without publishing metadata", async () => {
  const failing = fixture({
    appendEntry: () => {
      throw new Error("baseline persistence failed");
    },
  });
  await failing.coordinator.turnStart(failing.ctx);
  const context = failing.coordinator.context(failing.ctx, [failing.entries[0].message]);
  assert.equal(context.changed, false);
  assert.equal(failing.coordinator.failureReason(), "baseline persistence failed");
  assert.deepEqual(failing.journals, []);
});

test("keeps source persistence failure explicit without publishing exposure", async () => {
  const writes = [];
  let entries;
  const failing = fixture({
    appendEntry: (customType, data) => {
      writes.push({ customType, data });
      if (customType === "freeflow-cognitive-routing-source") throw new Error("source journal write failed");
      entries.push({
        type: "custom",
        id: `journal-${writes.length}`,
        parentId: entries.at(-1)?.id ?? null,
        customType,
        data,
      });
    },
  });
  entries = failing.entries;
  const result = await captureStandardTurn(failing);
  assert.deepEqual(result, { status: "unavailable", reason: "source journal write failed" });
  assert.equal(failing.coordinator.exposure(), undefined);
  assert.equal(failing.coordinator.failureReason(), "source journal write failed");
  assert.equal(writes.length, 2);
  assert.equal(writes[0].customType, "freeflow-cognitive-routing-baseline");
  assert.equal(writes[1].customType, "freeflow-cognitive-routing-source");
});
