import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TOOL_EXECUTION_CONFIG,
  resolveToolExecutionConfig,
  validateToolExecutionConfig,
} from "../../dist/tool-runtime/config.js";
import {
  TOOL_RUNTIME_SCHEMAS,
  TOOL_RUNTIME_TOOL_NAMES,
  registerToolRuntimeTools,
  validToolRuntimeInput,
} from "../../dist/tool-runtime/tools.js";

test("Tool Execution configuration is disabled by default and layered by explicit leaves", () => {
  const disabled = resolveToolExecutionConfig({}, {}, true);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.effective, false);
  assert.equal(disabled.accounting.effective, false);
  assert.equal(disabled.programs.mode, "off");
  assert.equal(disabled.capture.maxInlineBytes, DEFAULT_TOOL_EXECUTION_CONFIG.capture.maxInlineBytes);

  const configured = resolveToolExecutionConfig(
    {
      toolExecution: {
        enabled: true,
        capture: { enabled: true, maxInlineBytes: 4096 },
        programs: { mode: "reduction", timeoutMs: 5000 },
        adapters: { allow: ["fixture.records"] },
        accounting: { enabled: true },
      },
    },
    { toolExecution: { capture: { maxInlineBytes: 2048 }, programs: { mode: "off" } } },
    true,
  );
  assert.equal(configured.effective, true);
  assert.equal(configured.capture.effective, true);
  assert.equal(configured.capture.maxInlineBytes, 2048);
  assert.equal(configured.programs.mode, "off");
  assert.equal(configured.programs.effective, false);
  assert.deepEqual(configured.adapters.allow, ["fixture.records"]);
  assert.equal(configured.adapters.effective, true);
  assert.equal(configured.accounting.effective, true);

  const masterOff = resolveToolExecutionConfig(
    { toolExecution: { enabled: true, accounting: { enabled: true } } },
    {},
    false,
  );
  assert.equal(masterOff.enabled, true);
  assert.equal(masterOff.effective, false);
  assert.equal(masterOff.accounting.effective, false);
});

test("Tool Execution configuration rejects unknown and unsafe values", () => {
  assert.equal(
    validateToolExecutionConfig({ enabled: true, unknown: true }),
    "toolExecution has unsupported key: unknown",
  );
  assert.match(validateToolExecutionConfig({ programs: { mode: "node" } }), /mode must be one of/);
  assert.match(validateToolExecutionConfig({ programs: { timeoutMs: 120001 } }), /between 100 and 120000/);
  assert.match(validateToolExecutionConfig({ workspace: { denyPaths: [""] } }), /non-empty strings/);
  assert.match(validateToolExecutionConfig({ adapters: { allow: ["bad adapter"] } }), /adapter IDs/);
  assert.match(validateToolExecutionConfig({ adapters: { allow: ["same", "same"] } }), /adapter IDs/);
  assert.equal(
    validateToolExecutionConfig({
      enabled: true,
      capture: { enabled: true, maxInlineBytes: 8192, maxStoredBytes: 268435456 },
      programs: { mode: "adapters", timeoutMs: 30000, maxParallelReads: 4 },
      workspace: { enabled: false, write: false, denyPaths: [".git"] },
      discovery: { enabled: true },
      adapters: { allow: ["fixture.records"] },
      accounting: { enabled: true },
    }),
    null,
  );
});

test("stable facade schemas register once and reject invalid inputs before bounded unavailability", async () => {
  const tools = [];
  registerToolRuntimeTools({ registerTool: (tool) => tools.push(tool) }, () => ({
    ...resolveToolExecutionConfig({ toolExecution: { enabled: true } }, {}, true),
  }));
  assert.deepEqual(
    tools.map((tool) => tool.name),
    [...TOOL_RUNTIME_TOOL_NAMES],
  );
  assert.deepEqual(Object.keys(TOOL_RUNTIME_SCHEMAS).sort(), [...TOOL_RUNTIME_TOOL_NAMES].sort());
  assert.equal(
    tools.every((tool) => tool.executionMode === "sequential"),
    true,
  );
  assert.deepEqual(TOOL_RUNTIME_SCHEMAS.freeflow_tools.properties.operation.enum, ["search", "describe", "call"]);

  const facade = tools.find((tool) => tool.name === "freeflow_tools");
  assert.equal(validToolRuntimeInput("freeflow_tools", { operation: "search", query: "read", limit: 5 }), true);
  assert.equal(validToolRuntimeInput("freeflow_tools", { operation: "search", query: "read", extra: true }), false);
  await assert.rejects(() => facade.execute("call", { operation: "search", query: "read", extra: true }), /Invalid/);
  await assert.rejects(
    () => facade.execute("call", { operation: "search", query: "read" }),
    /not available in the current implementation phase/,
  );

  const run = tools.find((tool) => tool.name === "freeflow_run");
  assert.equal(
    validToolRuntimeInput("freeflow_run", {
      code: "emit(input)",
      description: "emit input",
      operations: [],
      input: { finite: true },
    }),
    true,
  );
  await assert.rejects(
    () => run.execute("call", { code: "emit(input)", description: "emit input", operations: [] }),
    /Programs are disabled/,
  );

  const result = tools.find((tool) => tool.name === "freeflow_result");
  await assert.rejects(
    () => result.execute("call", { id: "capture-1" }),
    /not available in the current implementation phase/,
  );
});
