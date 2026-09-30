import assert from "node:assert/strict";
import test from "node:test";

import { ToolProgressReporter } from "../../dist/tool-runtime/progress.js";
import { toolRuntimeCallText, toolRuntimeResultText } from "../../dist/tool-runtime/renderers.js";

const counts = {
  submitted: 1,
  started: 1,
  succeeded: 1,
  denied: 0,
  failed: 0,
  cancelled: 0,
  unknown: 0,
};

test("Tool Execution renderers provide distinct collapsed and expanded call views", () => {
  const args = {
    code: `emit({ secret: "EXPANDED_PROGRAM_BODY" })`,
    description: "summarize one capture",
    operations: [{ id: "result.read", revision: "1" }],
    captures: ["result:fixture"],
    input: { privateDetail: "EXPANDED_INPUT" },
  };
  const collapsed = toolRuntimeCallText("freeflow_run", args, false);
  const expanded = toolRuntimeCallText("freeflow_run", args, true);

  assert.match(collapsed, /summarize one capture/);
  assert.doesNotMatch(collapsed, /EXPANDED_PROGRAM_BODY|EXPANDED_INPUT/);
  assert.match(expanded, /EXPANDED_PROGRAM_BODY/);
  assert.match(expanded, /EXPANDED_INPUT/);
});

test("Tool Execution renderers distinguish partial, collapsed, and expanded results", () => {
  const partialResult = {
    details: {
      freeflowProgress: {
        version: 1,
        tool: "freeflow_run",
        phase: "settling",
        activity: "Settled project.replaceExact",
        runId: "run:fixture",
        counts,
        emittedCount: 1,
        current: {
          seq: 1,
          operation: { id: "project.replaceExact", revision: "1" },
          status: "succeeded",
          effect: "mutation",
          effectState: "completed",
        },
      },
    },
  };
  const partial = toolRuntimeResultText("freeflow_run", partialResult, { isPartial: true, expanded: false });
  const partialExpanded = toolRuntimeResultText("freeflow_run", partialResult, { isPartial: true, expanded: true });
  assert.match(partial, /1\/1 calls settled/);
  assert.match(partial, /project\.replaceExact@1 · succeeded/);
  assert.match(partial, /effect completed/);
  assert.doesNotMatch(partial, /run:fixture/);
  assert.match(partialExpanded, /"runId": "run:fixture"/);
  assert.match(partialExpanded, /"effectState": "completed"/);

  const result = {
    details: {
      freeflowRun: {
        runId: "run:fixture",
        programStatus: "completed",
        effectsSettled: true,
        calls: counts,
        emitted: [{ answer: 42 }],
        continuation: "none",
      },
    },
  };
  const collapsed = toolRuntimeResultText("freeflow_run", result, { expanded: false }, {});
  const expanded = toolRuntimeResultText("freeflow_run", result, { expanded: true }, {});
  assert.match(collapsed, /Program completed · 1\/1 calls settled · 1 emitted · effects settled/);
  assert.doesNotMatch(collapsed, /"answer"/);
  assert.match(expanded, /"answer": 42/);
  assert.match(expanded, /"runId": "run:fixture"/);
});

test("captured-result renderer keeps payload collapsed and exposes it only when expanded", () => {
  const result = {
    content: [{ type: "text", text: "Captured result: result:fixture\nPayload:\nEXACT_BODY" }],
    details: {
      capturedResult: {
        id: "result:fixture",
        range: { startBytes: 10, endBytes: 20 },
        totalBytes: 40,
        coverage: "unspecified",
      },
    },
  };
  const collapsed = toolRuntimeResultText("freeflow_result", result, { expanded: false }, {});
  const expanded = toolRuntimeResultText("freeflow_result", result, { expanded: true }, {});
  assert.match(collapsed, /result:fixture · \[10,20\) of 40 bytes/);
  assert.doesNotMatch(collapsed, /EXACT_BODY/);
  assert.match(expanded, /EXACT_BODY/);
});

test("progress reporter coalesces pending updates and never changes the canonical result", () => {
  const updates = [];
  const reporter = new ToolProgressReporter((update) => updates.push(update), 10_000);
  reporter.publish(
    {
      version: 1,
      tool: "freeflow_run",
      phase: "running",
      activity: "Starting program",
      counts: { ...counts, succeeded: 0 },
      emittedCount: 0,
    },
    true,
  );
  reporter.publish({
    version: 1,
    tool: "freeflow_run",
    phase: "running",
    activity: "Intermediate one",
    counts: { ...counts, succeeded: 0 },
    emittedCount: 0,
  });
  reporter.publish({
    version: 1,
    tool: "freeflow_run",
    phase: "settling",
    activity: "Final bounded progress",
    counts,
    emittedCount: 1,
  });
  reporter.flush();
  reporter.close();

  assert.equal(updates.length, 2);
  assert.match(updates[0].content[0].text, /Starting program/);
  assert.match(updates[1].content[0].text, /Final bounded progress/);
  assert.deepEqual(updates[1].details.freeflowProgress.counts, counts);
});
