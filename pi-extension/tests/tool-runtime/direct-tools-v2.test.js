import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveToolExecutionConfig } from "../../dist/tool-runtime/config.js";
import {
  DIRECT_TOOL_NAMES,
  directToolSchemas,
  registerDirectToolRuntimeTools,
  setDirectToolVisibility,
} from "../../dist/tool-runtime/direct-tools.js";
import { V2ExecutionRecorder } from "../../dist/tool-runtime/execution-record.js";
import { ToolRuntime } from "../../dist/tool-runtime/index.js";
import { toolRuntimeCallText, toolRuntimeResultText } from "../../dist/tool-runtime/renderers.js";
import { resolveRgBackend } from "../../dist/tool-runtime/adapters/rg-backend.js";
import { SessionStoreRuntime } from "../../dist/session-store/store.js";
import { syntheticNativeAncestry } from "../fixtures/v2-sidecar.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const limits = {
  perArtifactBytes: 65536,
  perRunBytes: 262144,
  perSessionBytes: 524288,
  totalBytes: 1048576,
  maxReadBytes: 32768,
};
const manifest = {
  schemaVersion: 2,
  storeId: "store:direct",
  originSessionId: "session:direct",
  host: { id: "pi", contract: "0.87.x" },
  createdBy: { package: "fixture", version: "1" },
  domains: { execution: { schema: 1 }, guidance: { schema: 1 } },
};
const key = {
  read: { id: "project.readRanges", revision: "1" },
  paths: { id: "project.findPaths", revision: "1" },
  text: { id: "project.searchText", revision: "2" },
  patch: { id: "project.applyPatch", revision: "1" },
};
const mockPi = () => {
  const tools = [];
  let active;
  return {
    tools,
    registerTool: (definition) => {
      tools.push(definition);
    },
    getActiveTools: () => active ?? tools.map((definition) => definition.name),
    setActiveTools: (names) => {
      active = [...names];
    },
  };
};

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-direct-v2-"));
  let state = resolveToolExecutionConfig(
    {
      toolExecution: {
        enabled: true,
        discovery: { enabled: true },
        workspace: { enabled: true, write: true, root },
      },
    },
    {},
    true,
  );
  const store = new SessionStoreRuntime(join(root, "store"), manifest, limits);
  const fence = await store.open();
  let sequence = 0;
  const recorder = new V2ExecutionRecorder(
    () => ({ store, fence, occurrenceId: () => `occurrence:direct-${++sequence}` }),
    65536,
  );
  const effects = [];
  const effectPort = {
    admit: () => ({ kind: "allowed" }),
    recheck: () => ({ kind: "allowed" }),
    start: async (_scope, operation, effect) => {
      if (effect !== "mutation") return undefined;
      effects.push({ phase: "started", operation });
      return { effectId: "effect:direct", sessionId: "session:direct", generation: 0 };
    },
    settle: async (ticket, outcome) => {
      if (ticket) effects.push({ phase: "settled", status: outcome.status, effectState: outcome.effectState });
    },
  };
  const runtime = new ToolRuntime(
    () => state,
    {
      scope: () => ({}),
      responsibility: () => ({ profile: "solo", control: "inactive" }),
      admit: () => ({ kind: "allowed" }),
    },
    {
      read: async () => {
        throw new Error("legacy result unused");
      },
    },
    effectPort,
    undefined,
    recorder,
    { maxBytes: 2048 },
  );
  const pi = mockPi();
  pi.registerTool({ name: "freeflow_tools" });
  registerDirectToolRuntimeTools(pi, () => state, runtime);
  setDirectToolVisibility(pi, () => state, false); // Simulate the post-load session visibility gate.
  const ctx = { cwd: root, sessionManager: { getSessionId: () => "session:direct" } };
  const direct = (name, input, signal) =>
    pi.tools.find((tool) => tool.name === name).execute(`call:${name}`, input, signal, undefined, ctx);
  const generic = (operationKey, input) =>
    runtime.invokeTools("call:generic", { operation: "call", operationKey, input }, undefined, ctx);
  const program = (operationKey, input) =>
    runtime.executeProgrammatic(operationKey, input, runtime.createProgramScope("call:program", ctx), undefined, ctx);
  const recorded = async (occurrenceId) =>
    (await store.replay("execution", syntheticNativeAncestry(store, "session:direct"))).find(
      (event) => event.kind === "operation-outcome" && event.payload.occurrenceId === occurrenceId,
    )?.payload.value;
  try {
    await run({
      root,
      runtime,
      pi,
      ctx,
      direct,
      generic,
      program,
      recorded,
      effects,
      setState: (next) => {
        state = next;
      },
      getState: () => state,
    });
  } finally {
    await store.close(fence).catch(() => store.abandon());
    await rm(root, { recursive: true, force: true });
  }
}

test("direct definitions are stable, fail closed on missing v2 registration, and remain hidden until enabled with a store", async () => {
  const pi = mockPi();
  assert.throws(
    () => registerDirectToolRuntimeTools(pi, () => undefined, { registry: { describe: () => undefined } }),
    /v2_direct_unavailable/,
  );
  assert.deepEqual(pi.tools, []);
  await fixture(async ({ pi, runtime, getState, setState, ctx }) => {
    assert.deepEqual(pi.getActiveTools(), ["freeflow_tools"]);
    assert.deepEqual(
      pi.tools.map((tool) => tool.name),
      ["freeflow_tools", ...DIRECT_TOOL_NAMES],
    );
    const before = JSON.stringify(directToolSchemas(runtime));
    const captured = pi.tools
      .filter((tool) => DIRECT_TOOL_NAMES.includes(tool.name))
      .map((tool) => JSON.stringify(tool.parameters));
    const schema = { type: "object", additionalProperties: false, properties: {}, required: [] };
    runtime.registry.register({
      key: { id: "fixture.extra", revision: "1" },
      description: "An unrelated catalog operation.",
      owner: { adapterId: "fixture", adapterRevision: "1", executionWorld: "fixture" },
      inputSchema: schema,
      outputSchema: schema,
      effects: ["captured-read"],
      effect: () => "captured-read",
      concurrency: () => "read-parallel",
      exposure: { discoverable: true, direct: true, programmatic: true },
      authorize: async () => ({ kind: "allowed" }),
      execute: async () => ({ value: {}, coverage: { kind: "complete-at-boundary", boundary: "fixture" } }),
    });
    assert.equal(JSON.stringify(directToolSchemas(runtime)), before);
    assert.deepEqual(
      pi.tools.filter((tool) => DIRECT_TOOL_NAMES.includes(tool.name)).map((tool) => JSON.stringify(tool.parameters)),
      captured,
    );
    setDirectToolVisibility(pi, getState, true);
    assert.deepEqual(pi.getActiveTools(), ["freeflow_tools", ...DIRECT_TOOL_NAMES]);
    const disabled = resolveToolExecutionConfig({ toolExecution: { enabled: false } }, {}, true);
    setState(disabled);
    setDirectToolVisibility(pi, getState, true);
    assert.deepEqual(pi.getActiveTools(), ["freeflow_tools"]);
    const directRead = pi.tools.find((tool) => tool.name === "freeflow_read");
    await assert.rejects(() => directRead.execute("disabled", { files: [] }, undefined, undefined, ctx), /disabled/);
  });
});

test("read and patch direct calls share the exact P3 canonical outcomes with generic and programmatic calls", async () => {
  await fixture(async ({ root, direct, generic, program, recorded, effects, runtime }) => {
    const before = "one\r\ntwo\r\n";
    await writeFile(join(root, "source.txt"), before);
    const readInput = { files: [{ path: "source.txt", ranges: [{ startLine: 1, endLine: 2 }] }] };
    const fromDirect = await direct("freeflow_read", readInput);
    const fromGeneric = await generic(key.read, readInput);
    const fromProgram = await program(key.read, readInput);
    assert.equal(fromDirect.details.outcome.status, "succeeded");
    assert.deepEqual(await recorded(fromDirect.details.freeflowV2.occurrenceId), fromProgram.value);
    assert.deepEqual(await recorded(fromGeneric.details.freeflowV2.occurrenceId), fromProgram.value);
    assert.equal(fromProgram.value.files[0].revision, hash(Buffer.from(before)));
    assert.ok(Buffer.byteLength(fromDirect.content[0].text) <= 2048);
    assert.equal("value" in fromDirect.details.outcome, false);
    assert.equal(runtime.patchResult({ toolName: "freeflow_read", details: fromDirect.details }), undefined);

    const document = "*** Begin Patch\n*** Update File: source.txt\n@@\n one\n-two\n+changed\n*** End Patch\n";
    const patchInput = {
      patch: document,
      expectedRevisions: [{ path: "source.txt", sha256: hash(Buffer.from(before)) }],
    };
    const [planDirect, planGeneric, planProgram] = await Promise.all([
      direct("freeflow_patch", { ...patchInput, dryRun: true }),
      generic(key.patch, { ...patchInput, dryRun: true }),
      program(key.patch, { ...patchInput, dryRun: true }),
    ]);
    assert.deepEqual(await recorded(planDirect.details.freeflowV2.occurrenceId), planProgram.value);
    assert.deepEqual(await recorded(planGeneric.details.freeflowV2.occurrenceId), planProgram.value);
    assert.deepEqual(effects, []);
    const applied = await direct("freeflow_patch", patchInput);
    assert.equal(applied.details.outcome.status, "succeeded");
    assert.equal(applied.details.outcome.effectState, "completed");
    assert.equal((await readFile(join(root, "source.txt"))).toString(), "one\r\nchanged\r\n");
    assert.deepEqual(
      effects.map((event) => event.phase),
      ["started", "settled"],
    );
    assert.equal("value" in applied.details.outcome, false);
    assert.match(toolRuntimeCallText("freeflow_patch", patchInput), /Project patch · apply · 1 file/);
    assert.match(toolRuntimeResultText("freeflow_patch", applied), /effect completed/);
    assert.match(toolRuntimeResultText("freeflow_patch", applied, { expanded: true }), /effect completed/);
    const stale = await direct("freeflow_patch", patchInput);
    assert.equal(stale.details.outcome.status, "failed");
    assert.equal(stale.details.outcome.effectState, "none");
    assert.deepEqual(runtime.patchResult({ toolName: "freeflow_patch", details: stale.details }), { isError: true });
    assert.ok(Buffer.byteLength(stale.content[0].text) <= 2048);
  });
});

const qualified = await resolveRgBackend().then(
  () => true,
  () => false,
);
if (qualified) {
  test("search direct paths/text count use exact backend operations without discovery or v1 fallback", async () => {
    await fixture(async ({ root, direct, generic, program, recorded }) => {
      await writeFile(join(root, "source.txt"), "NEEDLE\nsecond NEEDLE\n");
      const pathInput = { query: "source.txt", paths: ["source.txt"] };
      const paths = await direct("freeflow_search", { kind: "paths", ...pathInput });
      const genericPaths = await generic(key.paths, pathInput);
      const programPaths = await program(key.paths, pathInput);
      assert.equal(paths.details.outcome.status, "succeeded");
      assert.deepEqual(await recorded(paths.details.freeflowV2.occurrenceId), programPaths.value);
      assert.deepEqual(await recorded(genericPaths.details.freeflowV2.occurrenceId), programPaths.value);
      const textInput = { query: "NEEDLE", mode: "count", paths: ["source.txt"] };
      const count = await direct("freeflow_search", { kind: "text", ...textInput });
      const genericCount = await generic(key.text, textInput);
      const programCount = await program(key.text, textInput);
      assert.deepEqual(await recorded(count.details.freeflowV2.occurrenceId), programCount.value);
      assert.deepEqual(await recorded(genericCount.details.freeflowV2.occurrenceId), programCount.value);
      assert.equal(programCount.value.count, 2);
      assert.match(count.content[0].text, /count: 2 reported matches/);
      assert.equal("value" in count.details.outcome, false);
      await assert.rejects(
        () => direct("freeflow_search", { kind: "unsupported", ...textInput }),
        /invalid_direct_input/,
      );
    });
  });
} else {
  test("unqualified ripgrep does not fall back to v1 for the direct search tool", async () => {
    await fixture(async ({ root, direct }) => {
      await writeFile(join(root, "source.txt"), "NEEDLE\n");
      const outcome = await direct("freeflow_search", {
        kind: "text",
        query: "NEEDLE",
        mode: "count",
        paths: ["source.txt"],
      });
      assert.equal(outcome.details.outcome.status, "failed");
      assert.match(outcome.content[0].text, /failed/);
      assert.doesNotMatch(outcome.content[0].text, /count: 0/);
    });
  });
}
