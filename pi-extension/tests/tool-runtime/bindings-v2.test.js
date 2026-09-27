import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import { boundedProgramBinding, renderProgramBinding } from "../../dist/tool-runtime/bindings.js";
import { resolveToolExecutionConfig } from "../../dist/tool-runtime/config.js";
import { V2ExecutionRecorder } from "../../dist/tool-runtime/execution-record.js";
import { ToolRuntime } from "../../dist/tool-runtime/index.js";
import { ProgramHost } from "../../dist/tool-runtime/program/host.js";
import { SessionStoreRuntime } from "../../dist/session-store/store.js";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const limits = {
  perArtifactBytes: 65536,
  perRunBytes: 131072,
  perSessionBytes: 262144,
  totalBytes: 524288,
  maxReadBytes: 32768,
};
const key = { id: "project.readRanges", revision: "1" };
const state = (root, programs = false) =>
  resolveToolExecutionConfig(
    {
      toolExecution: {
        enabled: true,
        discovery: { enabled: true },
        workspace: { enabled: true, root },
        programs: { mode: programs ? "adapters" : "off", timeoutMs: 2000 },
      },
    },
    {},
    true,
  );
const routing = {
  scope: () => ({}),
  responsibility: () => ({ profile: "solo", control: "inactive" }),
  admit: () => ({ kind: "allowed" }),
  admitProgram: () => ({ kind: "allowed" }),
};

function toolsFor(root) {
  const tools = new ToolRuntime(
    () => state(root),
    routing,
    {
      read: async () => {
        throw new Error("unused legacy read");
      },
    },
    undefined,
    undefined,
    new V2ExecutionRecorder(() => {
      throw new Error("describe never executes");
    }, 64),
  );
  return tools;
}

test("describe includes complete exact-revision declarations without altering v1 descriptor identity", async () => {
  const tools = toolsFor(process.cwd());
  const legacy = tools.registry.describe({ id: "project.readText", revision: "1" });
  const oldFingerprint = legacy.fingerprint;
  const first = await tools.invokeTools(
    "describe",
    { operation: "describe", operations: [{ id: "project.readText", revision: "1" }, key] },
    undefined,
    {},
  );
  assert.equal(first.details.status, "described");
  assert.equal(first.details.operations.length, 2);
  assert.equal(first.details.operations[0].fingerprint, oldFingerprint);
  assert.equal(tools.registry.describe(legacy.key).fingerprint, oldFingerprint);
  for (const item of first.details.operations) {
    assert.equal(item.programBinding.state, "complete");
    assert.equal(item.programBinding.descriptorFingerprint, item.fingerprint);
    assert.equal(item.programBinding.bytes, Buffer.byteLength(item.programBinding.text));
    assert.equal(item.programBinding.text, renderProgramBinding(tools.registry.describe(item.key)));
    assert.match(item.programBinding.text, new RegExp(`revision: "${item.key.revision}"`));
    assert.match(item.programBinding.text, /Guest tools\.invoke returns only the validated canonical Value/);
    assert.doesNotMatch(item.programBinding.text, /Promise<\{\s*ok:/);
  }
  assert.match(first.details.operations[1].programBinding.text, /"expectedRevision"\?: string/);
  assert.match(first.details.operations[1].programBinding.text, /"served": ReadonlyArray/);
});

test("oversized or nonrepresentable long-tail declarations are unavailable, not truncated complete", async () => {
  const tools = toolsFor(process.cwd());
  const properties = Object.fromEntries(
    Array.from({ length: 125 }, (_, index) => [
      `long_field_${String(index).padStart(3, "0")}_${"x".repeat(130)}`,
      { type: "string" },
    ]),
  );
  const base = tools.registry.resolve(key).operation;
  tools.registry.register({
    ...base,
    key: { id: "fixture.largeBinding", revision: "1" },
    inputSchema: { type: "object", additionalProperties: false, properties: {}, required: [] },
    outputSchema: { type: "object", additionalProperties: false, properties, required: Object.keys(properties) },
  });
  const huge = tools.registry.describe({ id: "fixture.largeBinding", revision: "1" });
  assert.deepEqual(boundedProgramBinding(huge), {
    state: "unavailable",
    reason: "binding_limit",
    descriptorFingerprint: huge.fingerprint,
  });
  tools.registry.register({
    ...base,
    key: { id: "fixture.unsupportedBinding", revision: "1" },
    inputSchema: { type: "object", additionalProperties: false, properties: {}, required: [] },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        data: {
          type: "object",
          additionalProperties: false,
          properties: { x: { type: "integer" } },
          required: ["x"],
          const: { x: 1 },
        },
      },
      required: ["data"],
    },
  });
  const unsupported = tools.registry.describe({ id: "fixture.unsupportedBinding", revision: "1" });
  assert.equal(boundedProgramBinding(unsupported).state, "unavailable");
  assert.equal(boundedProgramBinding(unsupported).reason, "binding_unsupported");
  const described = await tools.invokeTools(
    "describe",
    { operation: "describe", operations: [huge.key, unsupported.key] },
    undefined,
    {},
  );
  assert.deepEqual(
    described.details.operations.map((item) => item.programBinding.state),
    ["unavailable", "unavailable"],
  );
  assert.equal(described.details.operations[0].programBinding.text, undefined);
});

test("QuickJS code uses only declared canonical fields and guest errors expose the documented fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-binding-guest-"));
  const manager = SessionManager.create(root, join(root, "sessions"));
  manager.appendMessage({ role: "user", content: "binding fixture", timestamp: 1 });
  const sessionId = manager.getSessionId();
  const store = new SessionStoreRuntime(
    join(root, "store"),
    {
      schemaVersion: 2,
      storeId: "store:bindings",
      originSessionId: sessionId,
      host: { id: "pi", contract: "0.87.x" },
      createdBy: { package: "fixture", version: "1" },
      domains: { execution: { schema: 1 }, guidance: { schema: 1 } },
    },
    limits,
  );
  const fence = await store.open();
  let sequence = 0;
  const current = state(root, true);
  const recorder = new V2ExecutionRecorder(
    () => ({ store, fence, occurrenceId: () => `occurrence:binding-${++sequence}` }),
    4096,
  );
  const tools = new ToolRuntime(
    () => current,
    routing,
    {
      read: async () => {
        throw new Error("unused legacy read");
      },
    },
    undefined,
    undefined,
    recorder,
  );
  const host = new ProgramHost(
    { appendEntry: (type, data) => manager.appendCustomEntry(type, data) },
    tools,
    () => current,
  );
  // The pre-P5 source-built store fixture does not claim native leaf/branch refresh.
  const ctx = { cwd: root, sessionManager: { getSessionId: () => sessionId, getBranch: () => manager.getBranch() } };
  try {
    const body = "first\r\nsecond\r\n";
    await writeFile(join(root, "source.txt"), body);
    const run = (code) =>
      host.run(
        "program:binding",
        {
          code,
          description: "exercise declared readRanges value",
          operations: [key],
          captures: [],
          input: null,
          timeoutMs: 2000,
        },
        undefined,
        ctx,
      );
    const success = await run(
      `const value = await tools.invoke("project.readRanges", { files: [{ path: "source.txt", ranges: [{ startLine: 1, endLine: 1 }] }] }); emit({ revision: value.files[0].revision, text: value.files[0].served[0].text, coverage: value.coverage });`,
    );
    assert.equal(success.details.freeflowRun.programStatus, "completed");
    assert.deepEqual(success.details.freeflowRun.emitted, [
      { revision: sha(Buffer.from(body)), text: "first\r\n", coverage: "complete-at-boundary" },
    ]);
    const failure = await run(
      `try { await tools.invoke("project.readRanges", { files: [{ path: "missing.txt", ranges: [{ startLine: 1, endLine: 1 }] }] }); } catch (error) { emit({ code: error.code, effectState: error.effectState }); }`,
    );
    assert.equal(failure.details.freeflowRun.programStatus, "completed");
    assert.deepEqual(failure.details.freeflowRun.emitted, [{ code: "path_unavailable", effectState: "none" }]);
  } finally {
    await store.close(fence).catch(() => store.abandon());
    await rm(root, { recursive: true, force: true });
  }
});
