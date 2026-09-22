import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import {
  publishCooperatingAdapterEndpoint,
  registerCooperatingAdapter,
} from "../../dist/tool-runtime/adapters/protocol.js";
import { resolveToolExecutionConfig } from "../../dist/tool-runtime/config.js";
import { ToolRuntime } from "../../dist/tool-runtime/index.js";
import { ProgramHost } from "../../dist/tool-runtime/program/host.js";

const objectSchema = (properties, required = Object.keys(properties)) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});

function operation(id, description = `Operation ${id}`) {
  return {
    key: { id, revision: "1" },
    description,
    keywords: ["fixture", "catalog", id.split(".").at(-1)],
    owner: { adapterId: "fixture.catalog", adapterRevision: "1", executionWorld: "fixture" },
    inputSchema: objectSchema({ value: { type: "integer", minimum: 0, maximum: 1000 } }),
    outputSchema: objectSchema({ value: { type: "integer", minimum: 0, maximum: 1000 } }),
    effects: ["live-read"],
    effect: () => "live-read",
    concurrency: () => "read-parallel",
    exposure: { discoverable: true, direct: true, programmatic: true },
    authorize: async () => ({ kind: "allowed" }),
    execute: async (input) => ({
      value: { value: input.value },
      coverage: { kind: "complete-at-boundary", boundary: "fixture-catalog" },
    }),
  };
}

function runtimeState(adapters = []) {
  return resolveToolExecutionConfig(
    {
      toolExecution: {
        enabled: true,
        discovery: { enabled: true },
        programs: { mode: "adapters", timeoutMs: 1000, maxParallelReads: 4 },
        adapters: { allow: adapters },
      },
    },
    {},
    true,
  );
}

function makeRuntime(state) {
  return new ToolRuntime(
    () => state.current,
    {
      scope: () => ({ fence: "current" }),
      responsibility: () => ({ profile: "solo", control: "inactive" }),
      admit: () => ({ kind: "allowed" }),
      admitProgram: () => ({ kind: "allowed" }),
    },
    {
      read: async (input) => ({
        id: input.id,
        text: "capture",
        range: { startBytes: 0, endBytes: 7 },
        totalBytes: 7,
        coverage: "unspecified",
        scope: "tool-result-hook",
      }),
    },
  );
}

const ctx = (cwd, manager = { getSessionId: () => "session" }) => ({ cwd, sessionManager: manager });

const direct = (tools, cwd, key, input, signal) =>
  tools.invokeTools("direct", { operation: "call", operationKey: key, input }, signal, ctx(cwd));

test("immutable-generation discovery is deterministic, bounded, complete, and dispatches selected large-catalog items", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-discovery-"));
  try {
    const state = { current: runtimeState() };
    const tools = makeRuntime(state);
    const operations = Array.from({ length: 500 }, (_, index) =>
      operation(
        `fixture.catalog.op${String(index).padStart(3, "0")}`,
        index === 237 ? "Inspect a unique nebula record." : `Catalog fixture operation ${index}.`,
      ),
    );
    const registration = tools.registry.registerMany(operations);
    const generation = tools.registry.snapshot().generation;

    const exact = await tools.invokeTools(
      "exact",
      { operation: "search", query: "fixture.catalog.op237", limit: 20 },
      undefined,
      ctx(root),
    );
    assert.deepEqual(
      exact.details.hits.map((hit) => hit.key.id),
      ["fixture.catalog.op237"],
    );
    assert.equal(JSON.stringify(exact.details).includes("inputSchema"), false);

    const lexical = await tools.invokeTools(
      "lexical",
      { operation: "search", query: "unique nebula record", limit: 5 },
      undefined,
      ctx(root),
    );
    assert.equal(lexical.details.hits[0].key.id, "fixture.catalog.op237");
    assert.deepEqual(
      lexical.details.hits,
      (
        await tools.invokeTools(
          "lexical-repeat",
          { operation: "search", query: "unique nebula record", limit: 5 },
          undefined,
          ctx(root),
        )
      ).details.hits,
    );

    const described = await tools.invokeTools(
      "describe",
      { operation: "describe", operations: [{ id: "fixture.catalog.op237", revision: "1" }] },
      undefined,
      ctx(root),
    );
    assert.equal(described.details.operations[0].inputSchema.additionalProperties, false);
    assert.equal(described.details.operations[0].outputSchema.properties.value.maximum, 1000);

    const called = await direct(tools, root, { id: "fixture.catalog.op237", revision: "1" }, { value: 237 });
    assert.equal(called.details.outcome.status, "succeeded");
    assert.deepEqual(called.details.outcome.value, { value: 237 });

    const status = tools.status().catalog;
    assert.equal(status.generation, generation);
    assert.equal(status.operations, 504);
    assert.ok(status.metadataBytes < 250_000, `bounded metadata bytes: ${status.metadataBytes}`);

    registration.dispose();
    const next = tools.status().catalog;
    assert.notEqual(next.generation, generation);
    assert.equal(next.operations, 4);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function recordBundle(disposed) {
  const read = {
    key: { id: "fixture.records.read", revision: "1" },
    description: "Read one controlled fixture record.",
    keywords: ["fixture", "records", "read"],
    owner: { adapterId: "fixture.records", adapterRevision: "1", executionWorld: "fixture-records" },
    inputSchema: objectSchema(
      {
        value: { type: "string", minLength: 1, maxLength: 100 },
        deny: { type: "boolean" },
        contextRequired: { type: "boolean" },
        delayMs: { type: "integer", minimum: 0, maximum: 1000 },
      },
      ["value"],
    ),
    outputSchema: objectSchema({ value: { type: "string", minLength: 1, maxLength: 100 } }),
    effects: ["live-read"],
    effect: () => "live-read",
    concurrency: () => "read-parallel",
    exposure: { discoverable: true, direct: true, programmatic: true },
    authorize: async (input) =>
      input.deny
        ? { kind: "denied", code: "fixture_denied", message: "Fixture policy denied the record." }
        : input.contextRequired
          ? { kind: "needs-model", context: { reason: "fixture context required" } }
          : { kind: "allowed" },
    execute: async (input, context) => {
      if (input.delayMs)
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, input.delayMs);
          context.signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new Error("fixture cancelled"));
            },
            { once: true },
          );
        });
      return {
        value: { value: input.value },
        coverage: { kind: "complete-at-boundary", boundary: "fixture-record" },
      };
    },
  };
  const invalid = {
    ...operation("fixture.records.invalid", "Return an invalid controlled record."),
    owner: { adapterId: "fixture.records", adapterRevision: "1", executionWorld: "fixture-records" },
    outputSchema: objectSchema({ value: { type: "string", minLength: 1, maxLength: 10 } }),
    execute: async () => ({
      value: { value: "x".repeat(20) },
      coverage: { kind: "complete-at-boundary", boundary: "fixture-record" },
    }),
  };
  return {
    protocol: 1,
    id: "fixture.records",
    revision: "1",
    executionWorld: "fixture-records",
    policy: { authorization: "per-call", cancellation: "abort-signal", settlement: "effect-aware" },
    operations: [read, invalid],
    dispose: () => {
      disposed.count += 1;
    },
  };
}

test("configured cooperating adapter registration, policy, cancellation, program dispatch, disposal, and reactivation conform", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-adapter-"));
  let published;
  let registration;
  let reactivated;
  let upgraded;
  try {
    const manager = SessionManager.create(root, join(root, "sessions"));
    manager.appendMessage({ role: "user", content: "adapter", timestamp: 1 });
    const state = { current: runtimeState() };
    const tools = makeRuntime(state);
    published = publishCooperatingAdapterEndpoint(tools.adapters);
    const disposed = { count: 0 };
    const bundle = recordBundle(disposed);
    registration = registerCooperatingAdapter(bundle);
    assert.equal(registration.accepted, true);
    assert.equal(registration.active, false);
    assert.equal(tools.registry.current("fixture.records.read"), undefined);
    assert.equal(registerCooperatingAdapter(bundle).code, "adapter_duplicate");

    state.current = runtimeState(["fixture.records"]);
    tools.refreshAdapters();
    assert.equal(tools.status().adapters.announced[0].active, true);
    assert.equal(tools.registry.current("fixture.records.read").owner.executionWorld, "fixture-records");

    const allowed = await direct(tools, root, { id: "fixture.records.read", revision: "1" }, { value: "record" });
    assert.equal(allowed.details.outcome.status, "succeeded");
    assert.deepEqual(allowed.details.outcome.value, { value: "record" });

    const denied = await direct(
      tools,
      root,
      { id: "fixture.records.read", revision: "1" },
      { value: "record", deny: true },
    );
    assert.equal(denied.details.outcome.status, "denied");
    assert.equal(denied.details.outcome.bodyStarted, false);
    assert.equal(denied.details.outcome.error.code, "fixture_denied");

    const contextRequired = await direct(
      tools,
      root,
      { id: "fixture.records.read", revision: "1" },
      { value: "record", contextRequired: true },
    );
    assert.equal(contextRequired.details.outcome.status, "needs-model");
    assert.equal(contextRequired.details.outcome.bodyStarted, false);
    assert.deepEqual(contextRequired.details.outcome.context, { reason: "fixture context required" });

    const controller = new AbortController();
    const cancelling = direct(
      tools,
      root,
      { id: "fixture.records.read", revision: "1" },
      { value: "record", delayMs: 1000 },
      controller.signal,
    );
    setTimeout(() => controller.abort(), 10);
    const cancelled = await cancelling;
    assert.equal(cancelled.details.outcome.status, "cancelled");
    assert.equal(cancelled.details.outcome.effectState, "none");

    const invalid = await direct(tools, root, { id: "fixture.records.invalid", revision: "1" }, { value: 1 });
    assert.equal(invalid.details.outcome.status, "failed");
    assert.equal(invalid.details.outcome.error.code, "invalid_output");

    const host = new ProgramHost(
      { appendEntry: (type, data) => manager.appendCustomEntry(type, data) },
      tools,
      () => state.current,
    );
    const run = await host.run(
      "adapter-program",
      {
        code: `emit(await tools.invoke("fixture.records.read", { value: "program" }));`,
        description: "invoke configured fixture adapter",
        operations: [{ id: "fixture.records.read", revision: "1" }],
        input: null,
        timeoutMs: 1000,
      },
      undefined,
      ctx(root, manager),
    );
    assert.equal(run.details.freeflowRun.programStatus, "completed");
    assert.deepEqual(run.details.freeflowRun.emitted, [{ value: "program" }]);

    state.current = runtimeState();
    tools.refreshAdapters();
    assert.equal(tools.registry.describe({ id: "fixture.records.read", revision: "1" }).available, false);
    state.current = runtimeState(["fixture.records"]);
    tools.refreshAdapters();
    assert.equal(tools.registry.describe({ id: "fixture.records.read", revision: "1" }).available, true);

    registration.dispose();
    assert.equal(disposed.count, 1);
    assert.equal(tools.registry.describe({ id: "fixture.records.read", revision: "1" }).available, false);
    reactivated = registerCooperatingAdapter(bundle);
    assert.equal(reactivated.accepted, true);
    assert.equal(reactivated.active, true);
    reactivated.dispose();

    const revisionTwo = recordBundle(disposed);
    revisionTwo.revision = "2";
    revisionTwo.operations = revisionTwo.operations.map((operation) => ({
      ...operation,
      key: { ...operation.key, revision: "2" },
      owner: { ...operation.owner, adapterRevision: "2" },
    }));
    upgraded = registerCooperatingAdapter(revisionTwo);
    assert.equal(upgraded.accepted, true);
    assert.equal(upgraded.active, true);
    assert.equal(tools.registry.current("fixture.records.read").key.revision, "2");
    assert.equal(tools.registry.describe({ id: "fixture.records.read", revision: "1" }).available, false);
    upgraded.dispose();
    published.dispose();
  } finally {
    upgraded?.dispose();
    reactivated?.dispose();
    registration?.dispose();
    published?.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("non-conforming and unbounded cooperating adapters are rejected atomically", () => {
  const state = { current: runtimeState(["fixture.records"]) };
  const tools = makeRuntime(state);
  const disposed = { count: 0 };
  const bundle = recordBundle(disposed);
  const malformed = {
    ...bundle,
    id: "fixture.invalid",
    operations: [
      {
        ...bundle.operations[0],
        owner: { adapterId: "fixture.invalid", adapterRevision: "1", executionWorld: "fixture-records" },
        outputSchema: objectSchema({ value: { type: "string" } }),
      },
    ],
  };
  const rejected = tools.registerAdapter(malformed);
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.code, "adapter_conformance");
  assert.equal(tools.registry.current("fixture.records.read"), undefined);
});
