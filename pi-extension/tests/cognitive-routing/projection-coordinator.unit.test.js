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
    content: [{ type: "toolCall", id: toolCallId, name: toolName, arguments: {} }],
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
        entries.push({ type: "custom", id: `journal-${journals.length}`, parentId: entries.at(-1)?.id ?? null, data });
      }),
    idFactory: () => `block-${journals.length + 1}`,
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

function captureStandardTurn(fixtureValue, callId = "capture-call") {
  const { coordinator, ctx, entries } = fixtureValue;
  coordinator.turnStart(ctx);
  const baseline = coordinator.context(ctx, [entries[0].message]);
  assert.equal(baseline.changed, true);
  const assistantMessage = assistant(callId);
  const resultMessage = toolResult(callId);
  entries.push(entry(`assistant-${callId}`, assistantMessage, entries.at(-1)?.id ?? null));
  entries.push(entry(`result-${callId}`, resultMessage, `assistant-${callId}`));
  return coordinator.turnEnd(ctx, { message: assistantMessage, toolResults: [resultMessage] });
}

function nextStandardContext(fixtureValue, messages) {
  const { coordinator, ctx } = fixtureValue;
  coordinator.turnStart(ctx);
  return coordinator.context(ctx, messages);
}

test("default-off and manual/inactive paths preserve marker-shaped source text exactly", () => {
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
  manual.coordinator.turnStart(manual.ctx);
  const manualResult = manual.coordinator.context(manual.ctx, [markerMessage]);
  assert.equal(manualResult.changed, false);
  assert.equal(manualResult.messages[0], markerMessage);
  assert.equal(manual.coordinator.exposure(), undefined);
  assert.deepEqual(manual.journals, []);
});

test("requires actual session identity and getBranch without writing source state", () => {
  const missingSession = fixture();
  missingSession.ctx.sessionManager.getSessionId = undefined;
  missingSession.coordinator.turnStart(missingSession.ctx);
  const missingSessionMessage = { role: "user", content: [{ type: "text", text: "unchanged" }] };
  const missingSessionResult = missingSession.coordinator.context(missingSession.ctx, [missingSessionMessage]);
  assert.equal(missingSessionResult.changed, false);
  assert.equal(missingSessionResult.messages[0], missingSessionMessage);
  assert.equal(missingSession.coordinator.failureReason(), "session_identity_unavailable");
  assert.deepEqual(missingSession.journals, []);

  const missingBranch = fixture();
  missingBranch.ctx.sessionManager.getBranch = undefined;
  missingBranch.coordinator.turnStart(missingBranch.ctx);
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
  const duplicateContext = nextStandardContext(duplicate, duplicateMessages);
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
  const transformedContext = nextStandardContext(transformed, [transformed.entries[0].message, transformedResult]);
  assert.equal(transformedContext.changed, true);
  assert.doesNotMatch(JSON.stringify(transformedContext.messages[1]), /ctx:result-capture-call/);
  assert.ok(transformed.coordinator.exposure());
  assert.equal(
    transformed.coordinator.exposure().sources.some((source) => source.source.entryId === "result-capture-call"),
    false,
  );
});

test("keeps source persistence failure explicit without publishing exposure", async () => {
  const writes = [];
  const failing = fixture({
    appendEntry: (_customType, data) => {
      writes.push(data);
      throw new Error("source journal write failed");
    },
  });
  const result = await captureStandardTurn(failing);
  assert.deepEqual(result, { status: "unavailable", reason: "source journal write failed" });
  assert.equal(failing.coordinator.exposure(), undefined);
  assert.equal(failing.coordinator.failureReason(), "source journal write failed");
  assert.equal(writes.length, 1);
});
