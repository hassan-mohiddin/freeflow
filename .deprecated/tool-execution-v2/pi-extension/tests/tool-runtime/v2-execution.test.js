import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AdmissionController } from "../../dist/tool-runtime/admission.js";
import { resolveToolExecutionConfig } from "../../dist/tool-runtime/config.js";
import { V2ExecutionRecorder } from "../../dist/tool-runtime/execution-record.js";
import { EffectJournalError } from "../../dist/tool-runtime/effects.js";
import { OperationKernel } from "../../dist/tool-runtime/kernel.js";
import { OperationRegistry } from "../../dist/tool-runtime/registry.js";
import { SessionStoreRuntime } from "../../dist/tool-runtime/session-store/store.js";
import { JournalError } from "../../dist/tool-runtime/session-store/journal.js";
import { syntheticNativeAncestry } from "../fixtures/v2-sidecar.js";

const schema = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const state = resolveToolExecutionConfig({ toolExecution: { enabled: true } }, {}, true);
const limits = {
  perArtifactBytes: 4096,
  perRunBytes: 8192,
  perSessionBytes: 16384,
  totalBytes: 64 * 1024,
  maxReadBytes: 4096,
};
const manifest = {
  schemaVersion: 2,
  storeId: "store:one",
  originSessionId: "session:one",
  host: { id: "pi", contract: "0.87.x" },
  createdBy: { package: "fixture", version: "1" },
  domains: { execution: { schema: 1 }, guidance: { schema: 1 } },
};

function operation(overrides = {}) {
  let calls = 0;
  const value = {
    key: { id: "fixture.execute", revision: "2" },
    contractVersion: 2,
    category: "project",
    description: "Execute one v2 fixture.",
    guidance: { useWhen: "Fixture observation" },
    cancellation: "settles",
    presenter: {
      model: async () => ({
        text: "fixture",
        coverage: { kind: "complete-at-boundary", boundary: "fixture" },
        artifactRefs: [],
      }),
    },
    owner: { adapterId: "fixture", adapterRevision: "2", executionWorld: "fixture" },
    inputSchema: schema({ text: { type: "string", maxLength: 4096 } }),
    outputSchema: schema({ text: { type: "string", maxLength: 4096 } }),
    effects: ["live-read"],
    effect: () => "live-read",
    concurrency: () => "read-parallel",
    exposure: { discoverable: true, direct: true, programmatic: true },
    authorize: async () => ({ kind: "allowed" }),
    execute: async (input) => {
      calls += 1;
      return { value: { text: input.text }, coverage: { kind: "complete-at-boundary", boundary: "fixture" } };
    },
    ...overrides,
  };
  return { value, calls: () => calls };
}

async function fixture(run, setup = {}) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-v2-execution-"));
  const store = new SessionStoreRuntime(join(root, "store"), manifest, limits);
  const fence = await store.open();
  let sequence = 0;
  const recorder = new V2ExecutionRecorder(
    () => ({ store, fence, occurrenceId: () => `occurrence:${++sequence}` }),
    setup.inlineBytes ?? 128,
  );
  const op = operation(setup.operation ?? {});
  const registry = new OperationRegistry();
  registry.register(op.value);
  const scope = {
    sessionId: "session:one",
    cwd: root,
    parentCallId: "call:one",
    catalogGeneration: registry.snapshot().generation,
    responsibility: { profile: "solo", control: "inactive" },
    routing: {},
  };
  const admission = new AdmissionController(() => state, { admit: () => ({ kind: "allowed" }) });
  const kernel = new OperationKernel(registry, admission, setup.effects, recorder);
  try {
    await run({ root, store, fence, kernel, scope, op, registry });
  } finally {
    await store.close(fence).catch(() => store.abandon());
    await rm(root, { recursive: true, force: true });
  }
}

const outcomes = (events) => events.filter((event) => event.kind === "operation-outcome");
const fixtureAncestry = (store) => syntheticNativeAncestry(store, "session:one");
const replay = (store) => store.replay("execution", fixtureAncestry(store));

test("direct and split programmatic calls yield distinct occurrences with the same canonical value and fixed effect truth", async () =>
  fixture(async ({ store, kernel, scope, op }) => {
    const direct = await kernel.execute(op.value.key, { text: "same" }, scope, "direct");
    const prepared = await kernel.prepare(op.value.key, { text: "same" }, scope, "programmatic");
    assert.equal(prepared.ok, true);
    const program = await kernel.executePrepared(prepared.call);
    assert.equal(op.calls(), 2);
    assert.equal(direct.status, "succeeded");
    assert.equal(program.status, "succeeded");
    assert.deepEqual(direct.value, program.value);
    assert.equal(direct.effectState, "completed");
    assert.equal(program.effectState, "completed");
    assert.notEqual(direct.occurrenceId, program.occurrenceId);
    assert.equal(direct.persistence.state, "sidecar-acknowledged");
    const records = outcomes(await replay(store));
    assert.equal(records.length, 2);
    assert.deepEqual(
      records.map((event) => event.payload.occurrenceId),
      [direct.occurrenceId, program.occurrenceId],
    );
    assert.equal(records[0].payload.inputSha256, records[1].payload.inputSha256);
    assert.deepEqual(
      records.map((event) => [event.payload.status, event.payload.effectState, event.payload.value.text]),
      [
        ["succeeded", "completed", "same"],
        ["succeeded", "completed", "same"],
      ],
    );
  }));

test("v2 split admission freezes request-time scope before later caller mutation", async () =>
  fixture(async ({ store, kernel, scope, op }) => {
    const mutable = { ...scope, responsibility: { ...scope.responsibility }, routing: { token: "before" } };
    const prepared = await kernel.prepare(op.value.key, { text: "frozen" }, mutable, "programmatic");
    assert.equal(prepared.ok, true);
    mutable.sessionId = "session:other";
    mutable.responsibility.profile = "helper";
    mutable.routing.token = "after";
    assert.equal(Object.isFrozen(prepared.call.scope), true);
    assert.equal(Object.isFrozen(prepared.call.scope.responsibility), true);
    assert.equal(Object.isFrozen(prepared.call.scope.routing), true);
    const outcome = await kernel.executePrepared(prepared.call);
    assert.equal(outcome.status, "succeeded");
    const [record] = outcomes(await replay(store));
    assert.equal(record.payload.responsibility.profile, "solo");
    assert.equal(record.payload.parentCallId, "call:one");
  }));

test("resolved invalid input records one bounded pre-body denial without starting the operation", async () =>
  fixture(async ({ store, kernel, scope, op }) => {
    const denied = await kernel.execute(op.value.key, { text: 4 }, scope, "direct");
    assert.equal(denied.status, "denied");
    assert.equal(denied.effectState, "none");
    assert.equal(denied.bodyStarted, false);
    assert.equal(denied.persistence.state, "sidecar-acknowledged");
    assert.equal(op.calls(), 0);
    const records = outcomes(await replay(store));
    assert.equal(records.length, 1);
    assert.equal(records[0].payload.status, "denied");
    assert.equal(records[0].payload.inputSha256, undefined);
    assert.equal(records[0].payload.bodyStarted, false);
  }));

test("pre-body policy denial and cancellation persist bounded no-effect outcomes", async () => {
  await fixture(
    async ({ store, kernel, scope, op }) => {
      const denied = await kernel.execute(op.value.key, { text: "blocked" }, scope, "direct");
      assert.equal(denied.status, "denied");
      assert.equal(denied.effectState, "none");
      assert.equal(denied.persistence.state, "sidecar-acknowledged");
      assert.equal(op.calls(), 0);
      assert.deepEqual(
        outcomes(await replay(store)).map((event) => event.payload.status),
        ["denied"],
      );
    },
    {
      effects: {
        admit: () => ({ kind: "denied", code: "policy_denied", message: "fixture" }),
        recheck: () => ({ kind: "allowed" }),
        start: async () => undefined,
        settle: async () => {},
      },
    },
  );
  await fixture(async ({ store, kernel, scope, op }) => {
    const cancelled = new AbortController();
    cancelled.abort();
    const outcome = await kernel.execute(op.value.key, { text: "cancelled" }, scope, "programmatic", cancelled.signal);
    assert.equal(outcome.status, "cancelled");
    assert.equal(outcome.effectState, "none");
    assert.equal(op.calls(), 0);
    assert.deepEqual(
      outcomes(await replay(store)).map((event) => event.payload.status),
      ["cancelled"],
    );
  });
});

test("invalid canonical output records failure without erasing a completed effect", async () =>
  fixture(
    async ({ store, kernel, scope, op }) => {
      const outcome = await kernel.execute(op.value.key, { text: "input" }, scope, "direct");
      assert.equal(outcome.status, "failed");
      assert.equal(outcome.error.code, "invalid_output");
      assert.equal(outcome.effectState, "completed");
      assert.equal(outcome.persistence.state, "sidecar-acknowledged");
      const records = outcomes(await replay(store));
      assert.deepEqual(
        records.map((event) => [event.payload.status, event.payload.effectState]),
        [["failed", "completed"]],
      );
    },
    {
      operation: {
        execute: async () => ({ value: { text: 42 }, coverage: { kind: "complete-at-boundary", boundary: "fixture" } }),
      },
    },
  ));

test("oversized validated canonical values stay in an exact artifact rather than the journal payload", async () =>
  fixture(
    async ({ store, kernel, scope, op }) => {
      const text = "x".repeat(240);
      const outcome = await kernel.execute(op.value.key, { text }, scope, "programmatic");
      assert.equal(outcome.status, "succeeded");
      assert.deepEqual(outcome.value, { text });
      assert.equal(outcome.artifactRefs.length, 1);
      const records = outcomes(await replay(store));
      assert.equal(records.length, 1);
      assert.equal("value" in records[0].payload, false);
      assert.equal(records[0].payload.valueArtifactId, outcome.artifactRefs[0]);
      const read = await store.readArtifact(
        outcome.artifactRefs[0],
        { startBytes: 0, endBytes: Buffer.byteLength(JSON.stringify({ text })) },
        {
          ancestry: fixtureAncestry(store),
          grantedArtifactIds: [outcome.artifactRefs[0]],
        },
      );
      assert.deepEqual(JSON.parse(Buffer.from(read.bytes).toString()), { text });
    },
    { inlineBytes: 16 },
  ));

test("large coverage continuation is recoverable without embedding it in the outcome event", async () =>
  fixture(
    async ({ store, kernel, scope, op }) => {
      const outcome = await kernel.execute(op.value.key, { text: "short" }, scope, "direct");
      assert.equal(outcome.status, "succeeded");
      assert.equal(outcome.coverage.continuation.length, 3000);
      const [record] = outcomes(await replay(store));
      assert.equal("continuation" in record.payload.coverage, false);
      assert.equal(record.payload.coverage.coverageArtifactId, outcome.artifactRefs[0]);
      const artifact = await store.readArtifact(
        outcome.artifactRefs[0],
        { startBytes: 0, endBytes: Buffer.byteLength(JSON.stringify(outcome.coverage)) },
        {
          ancestry: fixtureAncestry(store),
          grantedArtifactIds: [outcome.artifactRefs[0]],
        },
      );
      assert.equal(JSON.parse(Buffer.from(artifact.bytes).toString()).continuation.length, 3000);
    },
    {
      operation: {
        execute: async (input) => ({
          value: { text: input.text },
          coverage: { kind: "limited", boundary: "fixture", continuation: "x".repeat(3000) },
        }),
      },
    },
  ));

test("artifact failure leaves a bounded execution record and does not erase the live canonical value", async () =>
  fixture(
    async ({ store, kernel, scope, op }) => {
      store.publishArtifact = async () => {
        throw new JournalError("artifact_quota", "injected artifact exhaustion");
      };
      const outcome = await kernel.execute(op.value.key, { text: "x".repeat(240) }, scope, "direct");
      assert.equal(outcome.status, "succeeded");
      assert.equal(outcome.effectState, "completed");
      assert.equal(outcome.value.text.length, 240);
      assert.equal(outcome.persistence.state, "sidecar-acknowledged");
      assert.equal(outcome.persistence.code, "artifact_quota");
      assert.deepEqual(outcome.artifactRefs, []);
      assert.equal(op.calls(), 1);
      const records = outcomes(await replay(store));
      assert.equal(records.length, 1);
      assert.deepEqual(records[0].payload.valueUnavailable, { code: "artifact_quota" });
      assert.equal("value" in records[0].payload, false);
    },
    { inlineBytes: 16 },
  ));

test("sidecar append failure preserves a completed effect and never retries the body", async () =>
  fixture(async ({ store, kernel, scope, op }) => {
    const append = store.appendEvent.bind(store);
    store.appendEvent = async (event, fence) => {
      if (event.kind === "operation-outcome") throw new Error("injected sidecar failure");
      return append(event, fence);
    };
    const outcome = await kernel.execute(op.value.key, { text: "effect" }, scope, "direct");
    assert.equal(outcome.status, "succeeded");
    assert.equal(outcome.effectState, "completed");
    assert.equal(outcome.persistence.state, "unavailable");
    assert.equal(op.calls(), 1);
    assert.deepEqual(outcomes(await replay(store)), []);
  }));

test("an uncertain effect settlement remains unknown in the recorded execution occurrence", async () =>
  fixture(
    async ({ store, kernel, scope, op }) => {
      const outcome = await kernel.execute(op.value.key, { text: "uncertain" }, scope, "direct");
      assert.equal(outcome.status, "unknown");
      assert.equal(outcome.effectState, "unknown");
      assert.equal(outcome.persistence.state, "sidecar-acknowledged");
      const records = outcomes(await replay(store));
      assert.deepEqual(
        records.map((event) => [event.payload.status, event.payload.effectState]),
        [["unknown", "unknown"]],
      );
    },
    {
      operation: { effects: ["mutation"], effect: () => "mutation", concurrency: () => "exclusive" },
      effects: {
        admit: () => ({ kind: "allowed" }),
        recheck: () => ({ kind: "allowed" }),
        start: async () => ({ effectId: "effect:fixture", sessionId: "session:one", generation: 1 }),
        settle: async () => {
          throw new EffectJournalError("injected", "settlement unavailable");
        },
      },
    },
  ));

test("a changed native branch fence denies v2 work before effects", async () =>
  fixture(async ({ store, kernel, scope, op }) => {
    const outcome = await kernel.execute(op.value.key, { text: "denied" }, scope, "direct", undefined, {
      sessionManager: { getLeafId: () => "entry:other" },
    });
    assert.equal(outcome.status, "denied");
    assert.equal(outcome.effectState, "none");
    assert.equal(outcome.error.code, "v2_store_unavailable");
    assert.equal(op.calls(), 0);
    assert.deepEqual(outcomes(await replay(store)), []);
  }));

test("an ancestry change during the store preflight never starts a v2 body", async () => {
  let leaf = "root";
  await fixture(async ({ store, kernel, scope, op }) => {
    store.assertWritable = async () => {
      leaf = "entry:other";
    };
    const host = { sessionManager: { getSessionId: () => "session:one", getLeafId: () => leaf } };
    const outcome = await kernel.execute(op.value.key, { text: "denied" }, scope, "direct", undefined, host);
    assert.equal(outcome.status, "denied");
    assert.equal(outcome.effectState, "none");
    assert.equal(op.calls(), 0);
    assert.deepEqual(outcomes(await replay(store)), []);
  });
});

test("a branch change after the body preserves its completed effect but refuses a stale sidecar occurrence", async () => {
  let leaf = "root";
  let calls = 0;
  await fixture(
    async ({ store, kernel, scope, op }) => {
      const host = { sessionManager: { getSessionId: () => "session:one", getLeafId: () => leaf } };
      const outcome = await kernel.execute(op.value.key, { text: "done" }, scope, "direct", undefined, host);
      assert.equal(calls, 1);
      assert.equal(outcome.status, "succeeded");
      assert.equal(outcome.effectState, "completed");
      assert.equal(outcome.persistence.state, "unavailable");
      assert.equal(outcome.persistence.code, "v2_branch_changed");
      assert.deepEqual(outcomes(await replay(store)), []);
    },
    {
      operation: {
        execute: async (input) => {
          calls += 1;
          leaf = "entry:other";
          return { value: { text: input.text }, coverage: { kind: "complete-at-boundary", boundary: "fixture" } };
        },
      },
    },
  );
});

test("an unavailable v2 store denies before the operation body or any new effect", async () =>
  fixture(async ({ store, fence, kernel, scope, op }) => {
    await store.close(fence);
    const outcome = await kernel.execute(op.value.key, { text: "denied" }, scope, "direct");
    assert.equal(outcome.status, "denied");
    assert.equal(outcome.effectState, "none");
    assert.equal(outcome.error.code, "v2_store_unavailable");
    assert.equal(op.calls(), 0);
  }));
