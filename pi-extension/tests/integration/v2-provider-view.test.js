import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import test from "node:test";

import { fixture } from "../fixtures/routing-native.js";
import { resolveToolExecutionConfig } from "../../dist/tool-runtime/config.js";
import { V2ExecutionRecorder } from "../../dist/tool-runtime/execution-record.js";
import { ToolRuntime } from "../../dist/tool-runtime/index.js";
import { registerToolRuntimeTools } from "../../dist/tool-runtime/tools.js";
import { SessionStoreRuntime } from "../../dist/session-store/store.js";
import { activeReadOnlySessionBranch, readOnlySessionSnapshot } from "../../dist/session-sources/read-only-session.js";

const marker = "PRIVATE_CANONICAL_PAYLOAD_".repeat(80);
const schema = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const limits = {
  perArtifactBytes: 8192,
  perRunBytes: 16_384,
  perSessionBytes: 32_768,
  totalBytes: 128 * 1024,
  maxReadBytes: 8192,
};

function isolatedV2(pi) {
  const state = resolveToolExecutionConfig(
    { toolExecution: { enabled: true, discovery: { enabled: true } } },
    {},
    true,
  );
  let store;
  let fence;
  let sequence = 0;
  const recorder = new V2ExecutionRecorder(
    () => ({ store, fence, occurrenceId: () => `occurrence:${++sequence}` }),
    64,
  );
  const tools = new ToolRuntime(
    () => state,
    {
      scope: () => ({}),
      responsibility: () => ({ profile: "solo", control: "inactive" }),
      admit: () => ({ kind: "allowed" }),
    },
    {
      read: async () => {
        throw new Error("unused legacy reader");
      },
    },
    undefined,
    undefined,
    recorder,
    { maxBytes: 512 },
  );
  tools.registry.register({
    key: { id: "fixture.present", revision: "2" },
    contractVersion: 2,
    category: "project",
    description: "Fixture model presentation.",
    guidance: { useWhen: "Fixture" },
    cancellation: "settles",
    owner: { adapterId: "fixture", adapterRevision: "2", executionWorld: "fixture" },
    inputSchema: schema({ payload: { type: "string", maxLength: 4096 } }),
    outputSchema: schema({ payload: { type: "string", maxLength: 4096 } }),
    effects: ["live-read"],
    effect: () => "live-read",
    concurrency: () => "read-parallel",
    exposure: { discoverable: true, direct: true, programmatic: true },
    authorize: async () => ({ kind: "allowed" }),
    execute: async (input) => ({
      value: { payload: input.payload },
      coverage: { kind: "complete-at-boundary", boundary: "fixture" },
    }),
    presenter: {
      model: async (_input, outcome) => ({
        text: "MODEL_ONLY_SUMMARY",
        coverage: outcome.coverage,
        artifactRefs: outcome.artifactRefs,
      }),
      ui: async () => ({ summary: "HUMAN_ONLY_SUMMARY", detail: "HUMAN_ONLY_DETAIL" }),
    },
  });
  registerToolRuntimeTools(pi, () => state, {
    invokeTools: async (callId, input, signal, ctx, progress) => {
      if (!store) {
        const file = ctx.sessionManager.getSessionFile();
        const sessionId = ctx.sessionManager.getSessionId();
        const root = join(
          dirname(file),
          "freeflow-session-store",
          "v2",
          createHash("sha256").update(sessionId).digest("hex"),
        );
        const manifest = {
          schemaVersion: 2,
          storeId: `store:${randomUUID()}`,
          originSessionId: sessionId,
          host: { id: "pi", contract: "0.87.x" },
          createdBy: { package: "fixture", version: "1" },
          domains: { execution: { schema: 1 }, guidance: { schema: 1 } },
        };
        store = new SessionStoreRuntime(root, manifest, limits);
        fence = await store.open();
        fence = await store.refreshBranch(fence, ctx.sessionManager.getLeafId() ?? "root");
      }
      return tools.invokeTools(callId, input, signal, ctx, progress);
    },
  });
  pi.on("session_shutdown", async () => {
    if (store) await store.close(fence);
  });
}

test("Pi 0.87 provider request and native JSONL persist the bounded model view, not the v2 canonical value", async () => {
  const observed = await fixture(
    async (request, wire, manager) => {
      if (request === 1)
        return [
          {
            name: "freeflow_tools",
            args: {
              operation: "call",
              operationKey: { id: "fixture.present", revision: "2" },
              input: { payload: marker },
            },
          },
        ];
      if (request === 2) {
        const outputs = wire.input.filter((item) => item.type === "function_call_output");
        assert.equal(outputs.length, 1);
        const result = manager
          .getBranch()
          .findLast(
            (entry) =>
              entry.type === "message" &&
              entry.message?.role === "toolResult" &&
              entry.message.toolName === "freeflow_tools",
          );
        assert.ok(result);
        assert.match(JSON.stringify(outputs[0]), /MODEL_ONLY_SUMMARY/, JSON.stringify(result.message.details));
        assert.doesNotMatch(JSON.stringify(outputs[0]), /PRIVATE_CANONICAL_PAYLOAD/);
        assert.doesNotMatch(JSON.stringify(outputs[0]), /HUMAN_ONLY_DETAIL/);
        assert.match(JSON.stringify(result.message.content), /MODEL_ONLY_SUMMARY/);
        assert.equal(JSON.stringify(result.message.details).includes("PRIVATE_CANONICAL_PAYLOAD"), false);
        assert.equal("value" in result.message.details.outcome, false);
        assert.equal(result.message.details.outcome.effectState, "completed");
        const persisted = activeReadOnlySessionBranch(
          await readOnlySessionSnapshot(manager.getSessionFile()),
          manager.getLeafId(),
        );
        const onDisk = persisted.findLast(
          (entry) =>
            entry.type === "message" &&
            entry.message?.role === "toolResult" &&
            entry.message.toolName === "freeflow_tools",
        );
        assert.ok(onDisk, "bounded v2 result must be persisted in native JSONL");
        assert.match(JSON.stringify(onDisk.message.content), /MODEL_ONLY_SUMMARY/);
        assert.equal(JSON.stringify(onDisk.message.details).includes("PRIVATE_CANONICAL_PAYLOAD"), false);
        assert.equal("value" in onDisk.message.details.outcome, false);
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    undefined,
    false,
    { skipFreeflow: true, extensions: [isolatedV2], maxRequests: 2 },
  );
  assert.equal(observed.requests.length, 2);
});
