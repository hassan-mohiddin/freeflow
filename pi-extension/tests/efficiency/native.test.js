import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { efficiencyReport } from "../../dist/efficiency/report.js";
import { fixture } from "../fixtures/routing-native.js";

const profiles = Object.fromEntries(
  ["coordinator", "helper", "executor"].map((profile) => [
    profile,
    { provider: "openai", model: "gpt-6-astra", thinking: profile === "coordinator" ? "high" : "low" },
  ]),
);

test("native provider lifecycle records adapted request, response headers, and persisted assistant identity", async () => {
  const result = await fixture(() => [], false, undefined, false, {
    cognitiveRouting: { enabled: true, projection: false, delegation: "both", profiles },
    freeflowConfig: { toolExecution: { enabled: true, accounting: { enabled: true } } },
  });
  assert.equal(result.requests.length, 1);
  const observations = result.entries
    .filter((entry) => entry.customType === "freeflow-efficiency-observation-v1")
    .map((entry) => entry.data);
  assert.deepEqual(
    observations.map((observation) => observation.kind),
    ["prepared-request", "response-headers", "assistant-complete"],
  );
  const prepared = observations[0];
  assert.equal(prepared.payloadHash, createHash("sha256").update(JSON.stringify(result.requests[0])).digest("hex"));
  assert.equal(prepared.model, "gpt-6-astra");
  assert.equal(prepared.requestedEffort, "high");
  assert.equal(prepared.responsibility.profile, "coordinator");
  assert.ok(prepared.responsibility.executionId);
  assert.equal(observations[1].attemptId, prepared.attemptId);
  assert.equal(observations[1].status, 200);
  assert.equal(observations[2].attemptId, prepared.attemptId);
  assert.ok(observations[2].assistantEntryId);
  assert.equal(observations[2].usage.source, "host-normalized");
  assert.equal(observations[2].usage.input, 10);
  assert.equal(observations[2].usage.output, 10);
  assert.equal(observations[2].coverage, "complete-at-boundary");
});

for (const projection of [false, true])
  test(`native routed program attribution remains factual with projection=${projection}`, async () => {
    const command = (name, args) => [{ name, args }];
    const resultFor = (manager, name) =>
      manager
        .getBranch()
        .filter((entry) => entry.message?.role === "toolResult" && entry.message.toolName === name)
        .at(-1)?.message;
    const result = await fixture(
      (request, _wire, manager) => {
        if (request === 1)
          return command("freeflow_delegate", {
            operation: "assign",
            worker: "helper",
            contract: "Run the bounded mechanical program and return its factual result.",
          });
        if (request === 2)
          return command("freeflow_run", {
            code: `emit({ value: input.value * 2 });`,
            description: "double fixture input",
            operations: [],
            input: { value: 21 },
            timeoutMs: 1000,
          });
        if (request === 3) {
          assert.deepEqual(resultFor(manager, "freeflow_run").details.freeflowRun.emitted, [{ value: 42 }]);
          return command("freeflow_return", {
            operation: "submit",
            outcome: "completed",
            report: "The bounded program emitted 42.",
          });
        }
        if (request === 4)
          return command("freeflow_unit", {
            operation: "close",
            outcome: "accepted",
            assessment: "Program result accepted.",
          });
        if (request === 5) return [];
        assert.fail(`unexpected request ${request}`);
      },
      projection,
      undefined,
      false,
      {
        cognitiveRouting: { enabled: true, projection, delegation: "both", profiles },
        freeflowConfig: {
          toolExecution: {
            enabled: true,
            programs: { mode: "reduction", timeoutMs: 1000, maxParallelReads: 4 },
            accounting: { enabled: true },
          },
        },
      },
    );
    const observations = result.entries
      .filter((entry) => entry.customType === "freeflow-efficiency-observation-v1")
      .map((entry) => entry.data);
    const run = observations.find(
      (observation) => observation.kind === "tool-complete" && observation.toolName === "freeflow_run",
    );
    assert.ok(run);
    assert.equal(run.responsibility.profile, "helper");
    assert.ok(run.responsibility.assignmentId);
    assert.equal(run.programSourceBytes, Buffer.byteLength(`emit({ value: input.value * 2 });`));
    assert.equal(run.programStatus, "completed");
    assert.ok(run.runId.startsWith("run:"));
    assert.ok(run.emittedBytes > 0);
    assert.ok(run.resultBytes > 0);

    const report = efficiencyReport(observations);
    assert.equal(report.attempts, 5);
    assert.equal(report.assistantCompletions, 5);
    assert.equal(report.toolCompletions, 4);
    assert.equal(report.usage.input, 50);
    assert.equal(report.usage.output, 50);
    assert.equal(report.runs.length, 1);
    assert.equal(report.runs[0].runId, run.runId);
    assert.ok(report.profiles.some((row) => row.profile === "coordinator"));
    assert.ok(report.profiles.some((row) => row.profile === "helper"));
    assert.equal(report.groupingCoverage, "complete-at-boundary");
  });
