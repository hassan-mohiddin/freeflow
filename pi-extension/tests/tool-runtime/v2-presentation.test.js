import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveToolExecutionConfig } from "../../dist/tool-runtime/config.js";
import { V2ExecutionRecorder } from "../../dist/tool-runtime/execution-record.js";
import { ToolRuntime } from "../../dist/tool-runtime/index.js";
import { toolRuntimeResultText } from "../../dist/tool-runtime/renderers.js";
import { createArtifactReadOperation } from "../../dist/tool-runtime/adapters/artifact.js";
import { SessionStoreRuntime } from "../../dist/session-store/store.js";
import { syntheticNativeAncestry } from "../fixtures/v2-sidecar.js";

const schema = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const state = resolveToolExecutionConfig({ toolExecution: { enabled: true, discovery: { enabled: true } } }, {}, true);
const manifest = {
  schemaVersion: 2,
  storeId: "store:one",
  originSessionId: "session:one",
  host: { id: "pi", contract: "0.87.x" },
  createdBy: { package: "fixture", version: "1" },
  domains: { execution: { schema: 1 }, guidance: { schema: 1 } },
};
const limits = {
  perArtifactBytes: 8192,
  perRunBytes: 16_384,
  perSessionBytes: 32_768,
  totalBytes: 128 * 1024,
  maxReadBytes: 8192,
};
const id = "artifact:00000000-0000-0000-0000-000000000001";
const sha = "a".repeat(64);

function operation(
  presenter,
  execute = async (input) => ({
    value: { payload: input.payload },
    coverage: { kind: "complete-at-boundary", boundary: "fixture" },
  }),
) {
  return {
    key: { id: "fixture.present", revision: "2" },
    contractVersion: 2,
    category: "project",
    description: "Fixture model presentation.",
    guidance: { useWhen: "Test v2 presentation" },
    cancellation: "settles",
    owner: { adapterId: "fixture", adapterRevision: "2", executionWorld: "fixture" },
    inputSchema: schema({ payload: { type: "string", maxLength: 5000 } }),
    outputSchema: schema({ payload: { type: "string", maxLength: 5000 } }),
    effects: ["mutation"],
    effect: () => "mutation",
    concurrency: () => "exclusive",
    exposure: { discoverable: true, direct: true, programmatic: true },
    authorize: async () => ({ kind: "allowed" }),
    execute,
    presenter,
  };
}

async function fixture(run, modelBytes = 512) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-v2-presentation-"));
  const store = new SessionStoreRuntime(join(root, "store"), manifest, limits);
  const fence = await store.open();
  let n = 0;
  const recorder = new V2ExecutionRecorder(() => ({ store, fence, occurrenceId: () => `occurrence:${++n}` }), 64);
  const tools = new ToolRuntime(
    () => state,
    {
      scope: () => ({}),
      responsibility: () => ({ profile: "solo", control: "inactive" }),
      admit: () => ({ kind: "allowed" }),
    },
    {
      read: async () => ({
        id: "result:legacy",
        text: "old",
        range: { startBytes: 0, endBytes: 3 },
        totalBytes: 3,
        coverage: "unspecified",
        scope: "tool-result-hook",
      }),
    },
    undefined,
    undefined,
    recorder,
    { maxBytes: modelBytes },
  );
  const ctx = { cwd: root, sessionManager: { getSessionId: () => "session:one", getLeafId: () => null } };
  try {
    await run({ store, fence, tools, ctx });
  } finally {
    await store.close(fence).catch(() => store.abandon());
    await rm(root, { recursive: true, force: true });
  }
}

const call = (tools, ctx, key, input) =>
  tools.invokeTools("call:fixture", { operation: "call", operationKey: key, input }, undefined, ctx);

test("v2 generic result and UI use independent bounded views while canonical value stays in the store", async () =>
  fixture(async ({ store, tools, ctx }) => {
    const payload = "PRIVATE_CANONICAL_MARKER_".repeat(100);
    tools.registry.register(
      operation({
        model: async (_input, outcome) => ({
          text: "MODEL_ONLY_SUMMARY",
          coverage: outcome.coverage,
          artifactRefs: outcome.artifactRefs,
        }),
        ui: async () => ({ summary: "HUMAN_ONLY_SUMMARY", detail: "HUMAN_ONLY_DETAIL" }),
      }),
    );
    const result = await call(tools, ctx, { id: "fixture.present", revision: "2" }, { payload });
    assert.match(result.content[0].text, /MODEL_ONLY_SUMMARY/);
    assert.ok(Buffer.byteLength(result.content[0].text, "utf8") <= 512);
    assert.match(result.content[0].text, /effect completed/);
    assert.doesNotMatch(result.content[0].text, /PRIVATE_CANONICAL_MARKER/);
    assert.equal(JSON.stringify(result.details).includes("PRIVATE_CANONICAL_MARKER"), false);
    assert.equal("value" in result.details.outcome, false);
    assert.equal(result.details.outcome.effectState, "completed");
    assert.equal(result.details.freeflowV2.persistence.state, "sidecar-acknowledged");
    const collapsed = toolRuntimeResultText("freeflow_tools", result, {}, {});
    const expanded = toolRuntimeResultText("freeflow_tools", result, { expanded: true }, {});
    assert.match(collapsed, /succeeded.*effect completed.*HUMAN_ONLY_SUMMARY/);
    assert.match(expanded, /HUMAN_ONLY_DETAIL/);
    assert.equal(result.content[0].text.includes("HUMAN_ONLY_DETAIL"), false);
    const events = await store.replay("execution", syntheticNativeAncestry(store, "session:one"));
    const record = events.find((event) => event.kind === "operation-outcome");
    assert.ok(record.payload.valueArtifactId);
  }));

test("presenter failure preserves completed mutation truth and never exposes canonical payload", async () =>
  fixture(async ({ tools, ctx }) => {
    tools.registry.register(
      operation({
        model: async () => {
          throw new Error("presenter failed");
        },
        ui: async () => {
          throw new Error("display failed");
        },
      }),
    );
    const result = await call(tools, ctx, { id: "fixture.present", revision: "2" }, { payload: "SECRET_MODEL_BODY" });
    assert.match(result.content[0].text, /succeeded; effect completed/);
    assert.match(result.content[0].text, /presentation unavailable; sidecar occurrence acknowledged/);
    assert.doesNotMatch(JSON.stringify(result), /SECRET_MODEL_BODY/);
    assert.equal(result.details.freeflowV2.presentationFailure, "model_presentation_unavailable");
    assert.equal(result.details.outcome.effectState, "completed");
  }));

test("result.read@2 presents exact text/base64 bytes and truthful limited continuation, not pointer-only", async () =>
  fixture(async ({ tools, ctx }) => {
    let data = "EXACT_PAYLOAD";
    const port = {
      readV2Value: async () => ({
        id,
        data,
        encoding: "utf-8",
        mediaType: "text/plain",
        range: { startBytes: 0, endBytes: Buffer.byteLength(data) },
        totalBytes: Buffer.byteLength(data),
        sha256: sha,
        artifactSha256: sha,
        coverage: { capture: "complete-at-boundary", boundary: "fixture" },
      }),
    };
    tools.registry.registerCompatibleRevision(createArtifactReadOperation(port));
    const text = await call(tools, ctx, { id: "result.read", revision: "2" }, { id, maxBytes: 128 });
    assert.match(text.content[0].text, /EXACT_PAYLOAD/);
    assert.equal("data" in text.details.outcome, false);
    assert.equal(text.details.freeflowV2.modelCoverage.kind, "complete-at-boundary");
    data = "X".repeat(1800);
    port.readV2Value = async () => ({
      id,
      data,
      encoding: "utf-8",
      mediaType: "text/plain",
      range: { startBytes: 0, endBytes: data.length },
      totalBytes: data.length,
      sha256: sha,
      artifactSha256: sha,
      coverage: { capture: "complete-at-boundary", boundary: "fixture" },
    });
    const limited = await call(tools, ctx, { id: "result.read", revision: "2" }, { id, maxBytes: 2000 });
    assert.match(limited.content[0].text, /Payload:\nX+/);
    assert.ok(Buffer.byteLength(limited.content[0].text, "utf8") <= 512);
    assert.match(limited.content[0].text, /Next offset:/);
    assert.equal(limited.details.freeflowV2.modelCoverage.kind, "limited");
    assert.ok(limited.details.freeflowV2.modelCoverage.continuation.offsetBytes < 1800);
    data = Buffer.from([0, 255, 65, 66]).toString("base64");
    port.readV2Value = async () => ({
      id,
      data,
      encoding: "base64",
      mediaType: "application/octet-stream",
      range: { startBytes: 0, endBytes: 4 },
      totalBytes: 4,
      sha256: sha,
      artifactSha256: sha,
      coverage: { capture: "complete-at-boundary", boundary: "fixture" },
    });
    const binary = await call(tools, ctx, { id: "result.read", revision: "2" }, { id, maxBytes: 4 });
    assert.match(binary.content[0].text, /encoding: base64/);
    assert.ok(Buffer.byteLength(binary.content[0].text, "utf8") <= 512);
    assert.match(binary.content[0].text, new RegExp(data));
  }, 512));

test("v2 renderer keeps unknown effect truth ahead of an optimistic UI summary", () => {
  const displayed = toolRuntimeResultText(
    "freeflow_tools",
    {
      content: [{ type: "text", text: "bounded" }],
      details: {
        status: "called",
        outcome: { operation: { id: "fixture.present", revision: "2" }, status: "unknown", effectState: "unknown" },
        freeflowV2: { ui: { summary: "Updated file" } },
      },
    },
    {},
    {},
  );
  assert.match(displayed, /unknown.*effect unknown.*Updated file/);
});

test("legacy result.read@1 retains its prior JSON outcome without v2 presentation metadata", async () =>
  fixture(async ({ tools, ctx }) => {
    const result = await call(tools, ctx, { id: "result.read", revision: "1" }, { id: "result:legacy" });
    assert.equal(result.content[0].text, JSON.stringify(result.details));
    assert.equal(result.details.status, "called");
    assert.equal(result.details.outcome.value.text, "old");
    assert.equal("freeflowV2" in result.details, false);
  }));
