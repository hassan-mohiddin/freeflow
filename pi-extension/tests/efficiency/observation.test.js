import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import { EfficiencyLedger } from "../../dist/efficiency/ledger.js";
import { EfficiencyObserver } from "../../dist/efficiency/observation.js";
import { efficiencyReport } from "../../dist/efficiency/report.js";

function harness() {
  const manager = SessionManager.inMemory("/tmp/freeflow-efficiency");
  const pi = { appendEntry: (type, data) => manager.appendCustomEntry(type, data) };
  const ctx = {
    model: { provider: "openai", api: "openai-responses", id: "fixture-model" },
    thinkingLevel: "high",
    sessionManager: manager,
  };
  let responsibility = {
    profile: "helper",
    control: "automatic",
    assignmentId: "assignment-1",
    executionId: "execution-1",
    provider: "openai",
    modelId: "fixture-model",
    thinking: "high",
  };
  const observer = new EfficiencyObserver(
    pi,
    () => responsibility,
    () => true,
  );
  observer.reset(ctx);
  return {
    manager,
    ctx,
    observer,
    setResponsibility(next) {
      responsibility = next;
    },
  };
}

function assistant({ stopReason = "stop", input = 10, output = 20, reasoning = 5 } = {}) {
  return {
    role: "assistant",
    content: [{ type: "text", text: stopReason }],
    api: "openai-responses",
    provider: "openai",
    model: "fixture-model",
    responseId: `response-${stopReason}`,
    usage: {
      input,
      output,
      reasoning,
      cacheRead: 3,
      cacheWrite: 2,
      totalTokens: input + output,
      cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, total: 3 },
    },
    stopReason,
    timestamp: 1,
  };
}

function complete(observer, manager, ctx, message, toolResults = []) {
  observer.messageEnd(message, ctx);
  manager.appendMessage(message);
  for (const result of toolResults) manager.appendMessage(result);
  observer.turnEnd({ message, toolResults }, ctx);
}

test("prepared, response, and persisted completion observations retain distinct boundaries without prompt bodies", () => {
  const { manager, ctx, observer, setResponsibility } = harness();
  const payload = {
    model: "fixture-model",
    instructions: "private instruction",
    input: [{ role: "user", content: "private prompt" }],
    tools: [{ name: "read", description: "read a file", parameters: { type: "object" } }],
    reasoning: { effort: "high" },
    store: false,
  };
  observer.observePrepared(payload, ctx);
  observer.observeResponse(200, { "x-request-id": "secret-request-identity", "set-cookie": "secret-cookie" }, ctx);
  setResponsibility({ profile: "executor", control: "automatic", assignmentId: "assignment-2" });
  complete(observer, manager, ctx, assistant());

  const observations = observer.observations();
  assert.equal(observations.length, 3);
  assert.deepEqual(
    observations.map((observation) => observation.kind),
    ["prepared-request", "response-headers", "assistant-complete"],
  );
  const prepared = observations[0];
  assert.equal(prepared.payloadHash, createHash("sha256").update(JSON.stringify(payload)).digest("hex"));
  assert.equal(prepared.payloadBytes, Buffer.byteLength(JSON.stringify(payload)));
  assert.equal(prepared.responsibility.assignmentId, "assignment-1");
  assert.equal(observations[1].attemptId, prepared.attemptId);
  assert.equal(observations[2].attemptId, prepared.attemptId);
  assert.equal(observations[2].responsibility.assignmentId, "assignment-1");
  assert.equal(observations[2].responsibility.profile, "helper");
  assert.ok(observations[2].assistantEntryId);
  assert.equal(observations[2].coverage, "complete-at-boundary");
  const persisted = JSON.stringify(manager.getEntries());
  assert.doesNotMatch(persisted, /private prompt|private instruction|secret-request-identity|secret-cookie/);
  assert.equal(
    manager.getEntries().filter((entry) => entry.customType === "freeflow-efficiency-observation-v1").length,
    3,
  );
});

test("failed and successful retry attempts remain distinct and reasoning is not added to output", () => {
  const { manager, ctx, observer } = harness();
  const payload = { model: "fixture-model", input: [], reasoning: { effort: "high" }, tools: [] };

  observer.observePrepared(payload, ctx);
  observer.observeResponse(500, {}, ctx);
  complete(observer, manager, ctx, assistant({ stopReason: "error", input: 0, output: 0, reasoning: 0 }));

  observer.observePrepared(payload, ctx);
  observer.observeResponse(200, {}, ctx);
  complete(observer, manager, ctx, assistant({ stopReason: "stop", input: 10, output: 20, reasoning: 5 }));

  const report = observer.report();
  assert.equal(report.attempts, 2);
  assert.equal(report.preparedRequests, 2);
  assert.equal(report.responses, 2);
  assert.equal(report.assistantCompletions, 2);
  assert.equal(report.failedAssistants, 1);
  assert.equal(report.successfulAssistants, 1);
  assert.equal(report.usage.output, 20);
  assert.equal(report.usage.reasoning, 5);
  assert.equal(report.usage.totalTokens, 30);
  assert.equal(report.cost.total, 6);
  assert.equal(report.cost.observedRecords, 2);
  assert.equal(report.measurement.providerCacheHits, "not inferred");
  assert.match(report.measurement.cost, /no price-table estimates/);
  assert.equal(report.persistenceFailures, 0);
});

test("ambiguous request correlation remains partial instead of assigning a guessed attempt", () => {
  const { manager, ctx, observer } = harness();
  const payload = { model: "fixture-model", input: [], reasoning: { effort: "high" }, tools: [] };
  observer.observePrepared(payload, ctx);
  observer.observePrepared(payload, ctx);
  observer.observeResponse(200, {}, ctx);
  complete(observer, manager, ctx, assistant());

  const response = observer.observations().find((observation) => observation.kind === "response-headers");
  const completion = observer.observations().find((observation) => observation.kind === "assistant-complete");
  assert.equal(response.attemptId, undefined);
  assert.equal(response.coverage, "unknown");
  assert.equal(completion.attemptId, undefined);
  assert.equal(completion.coverage, "partial");
});

test("tool and run observations attribute bounded bytes, profiles, assignments, operations and emitted values", () => {
  const { manager, ctx, observer } = harness();
  const message = {
    ...assistant(),
    content: [
      {
        type: "toolCall",
        id: "run-call",
        name: "freeflow_run",
        arguments: {
          code: `emit({ answer: 42 })`,
          description: "emit answer",
          operations: [],
          input: null,
        },
      },
      {
        type: "toolCall",
        id: "direct-call",
        name: "freeflow_tools",
        arguments: {
          operation: "call",
          operationKey: { id: "project.readText", revision: "1" },
          input: { path: "a.txt" },
        },
      },
    ],
  };
  const run = {
    role: "toolResult",
    toolCallId: "run-call",
    toolName: "freeflow_run",
    isError: false,
    content: [{ type: "text", text: "run result" }],
    details: {
      freeflowRun: {
        runId: "run:fixture",
        programStatus: "completed",
        emitted: [{ answer: 42 }],
      },
    },
  };
  const directResult = {
    role: "toolResult",
    toolCallId: "direct-call",
    toolName: "freeflow_tools",
    isError: false,
    content: [{ type: "text", text: "direct result" }],
    usage: {
      input: 7,
      output: 8,
      reasoning: 2,
      totalTokens: 15,
      cost: { total: 4 },
    },
    details: {
      status: "called",
      outcome: {
        operation: { id: "project.readText", revision: "1" },
        effectState: "completed",
        coverage: { boundary: "whole-file-snapshot" },
      },
    },
  };
  observer.messageEnd(message, ctx);
  manager.appendMessage(message);
  manager.appendCustomEntry("freeflow-tool-run-v1", {
    runId: "run:fixture",
    outcomes: [
      {
        operation: { id: "result.read", revision: "1" },
        status: "succeeded",
        effectState: "completed",
      },
    ],
  });
  manager.appendMessage(run);
  manager.appendMessage(directResult);
  observer.turnEnd({ message, toolResults: [run, directResult] }, ctx);

  const tools = observer.observations().filter((observation) => observation.kind === "tool-complete");
  assert.equal(tools.length, 2);
  assert.equal(tools[0].programSourceBytes, Buffer.byteLength(`emit({ answer: 42 })`));
  assert.equal(tools[0].runId, "run:fixture");
  assert.equal(tools[0].programStatus, "completed");
  assert.ok(tools[0].emittedBytes > 0);
  assert.deepEqual(tools[0].childOperations, [
    { operation: "result.read@1", status: "succeeded", effectState: "completed" },
  ]);
  assert.equal(tools[1].operation, "project.readText@1");
  assert.equal(tools[1].effectState, "completed");
  assert.equal(tools[1].coverageBoundary, "whole-file-snapshot");

  const report = observer.report();
  assert.equal(report.toolCompletions, 2);
  assert.equal(report.tooling.failed, 0);
  assert.equal(report.tooling.programSourceBytes, Buffer.byteLength(`emit({ answer: 42 })`));
  assert.equal(report.usage.input, 10);
  assert.equal(report.usage.output, 20);
  assert.equal(report.toolUsage.input, 7);
  assert.equal(report.toolUsage.output, 8);
  assert.equal(report.cost.total, 3);
  assert.equal(report.toolCost.total, 4);
  assert.deepEqual(report.profiles, [{ profile: "helper", observations: 3, usageRecords: 2 }]);
  assert.deepEqual(report.assignments, [{ assignmentId: "assignment-1", observations: 3 }]);
  assert.equal(report.runs[0].runId, "run:fixture");
  assert.equal(report.operations.find((row) => row.operation === "project.readText@1").calls, 1);
  assert.equal(report.operations.find((row) => row.operation === "result.read@1").calls, 1);
  assert.equal(report.groupingCoverage, "complete-at-boundary");
  const exported = observer.exportData();
  assert.equal(exported.coverage, "complete-at-boundary");
  assert.doesNotMatch(JSON.stringify(exported), /private prompt|private instruction/);
});

test("capture and exact recovery observations retain byte facts without captured bodies", () => {
  const { manager, ctx, observer } = harness();
  const message = {
    ...assistant(),
    content: [
      { type: "toolCall", id: "bash-call", name: "bash", arguments: { command: "fixture command" } },
      {
        type: "toolCall",
        id: "recovery-call",
        name: "freeflow_result",
        arguments: { id: "result:fixture", offsetBytes: 10, maxBytes: 100 },
      },
    ],
  };
  const bash = {
    role: "toolResult",
    toolCallId: "bash-call",
    toolName: "bash",
    isError: false,
    content: [{ type: "text", text: "bounded preview" }],
  };
  const recovered = {
    role: "toolResult",
    toolCallId: "recovery-call",
    toolName: "freeflow_result",
    isError: false,
    content: [{ type: "text", text: "bounded exact range" }],
    details: {
      capturedResult: {
        id: "result:fixture",
        range: { startBytes: 10, endBytes: 110 },
        totalBytes: 1000,
        coverage: "unspecified",
        scope: "tool-result-hook",
      },
    },
  };
  observer.messageEnd(message, ctx);
  manager.appendMessage(message);
  manager.appendCustomEntry("freeflow-tool-capture-v1", {
    id: "result:fixture",
    toolCallId: "bash-call",
    capture: { bytes: 1000 },
  });
  manager.appendMessage(bash);
  manager.appendMessage(recovered);
  observer.turnEnd({ message, toolResults: [bash, recovered] }, ctx);

  const tools = observer.observations().filter((observation) => observation.kind === "tool-complete");
  assert.equal(tools[0].capturedBytes, 1000);
  assert.equal(tools[1].recoveredBytes, 100);
  assert.equal(tools[1].coverageBoundary, "tool-result-hook");
  assert.equal(observer.report().tooling.capturedBytes, 1000);
  assert.equal(observer.report().tooling.recoveredBytes, 100);
  assert.doesNotMatch(JSON.stringify(observer.exportData()), /fixture command|bounded exact range/);
});

test("efficiency JSON export remains bounded and reports omitted observations", () => {
  const { ctx, observer } = harness();
  for (let index = 0; index < 300; index += 1)
    observer.observePrepared(
      { model: "fixture-model", input: [{ role: "user", content: `fixture-${index}` }], tools: [] },
      ctx,
    );
  const exported = observer.exportData();
  assert.equal(exported.coverage, "limited");
  assert.ok(exported.omittedObservations > 0);
  assert.ok(Buffer.byteLength(JSON.stringify(exported), "utf8") <= 512 * 1024);
});

test("fresh observer recovery rebuilds bounded factual reports and ignores malformed persisted observations", () => {
  const { manager, ctx, observer } = harness();
  observer.observePrepared({ model: "fixture-model", input: [], tools: [] }, ctx);
  observer.observeResponse(200, {}, ctx);
  complete(observer, manager, ctx, assistant());
  manager.appendCustomEntry("freeflow-efficiency-observation-v1", {
    version: 1,
    id: "malformed",
    kind: "tool-complete",
    responsibility: { profile: "helper", control: "automatic" },
    coverage: "complete-at-boundary",
    toolCallId: "call",
    toolName: "bash",
    isError: false,
    secret: "must not recover",
  });
  const recovered = new EfficiencyObserver(
    { appendEntry: (type, data) => manager.appendCustomEntry(type, data) },
    () => ({ profile: "helper", control: "automatic" }),
    () => true,
  );
  recovered.reset(ctx);
  assert.equal(recovered.observations().length, 3);
  assert.equal(recovered.report().assistantCompletions, 1);
  assert.doesNotMatch(JSON.stringify(recovered.exportData()), /must not recover/);
});

test("ledger deduplicates persisted native occurrences by identity, never by equal usage or body", () => {
  const base = {
    version: 1,
    kind: "assistant-complete",
    sessionId: "session",
    responsibility: { profile: "solo", control: "inactive" },
    coverage: "complete-at-boundary",
    assistantEntryId: "assistant-entry",
    provider: "openai",
    model: "fixture-model",
    stopReason: "stop",
    usage: { input: 1, output: 1, source: "host-normalized" },
  };
  const ledger = new EfficiencyLedger();
  assert.equal(ledger.append({ ...base, id: "event-1" }), true);
  assert.equal(ledger.append({ ...base, id: "event-2" }), false);
  assert.equal(ledger.append({ ...base, id: "event-3", assistantEntryId: "assistant-entry-2" }), true);
  assert.equal(
    ledger.append({ ...base, id: "event-4", assistantEntryId: "assistant-entry-3", secret: "must not persist" }),
    false,
  );
  const report = efficiencyReport(ledger.all());
  assert.equal(report.assistantCompletions, 2);
  assert.equal(report.usage.input, 2);
  assert.equal(report.usage.output, 2);
});
