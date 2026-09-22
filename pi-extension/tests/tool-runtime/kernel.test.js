import assert from "node:assert/strict";
import test from "node:test";

import { AdmissionController } from "../../dist/tool-runtime/admission.js";
import { resolveToolExecutionConfig } from "../../dist/tool-runtime/config.js";
import { OperationKernel } from "../../dist/tool-runtime/kernel.js";
import { OperationRegistry } from "../../dist/tool-runtime/registry.js";
import { compileSchema, SchemaError } from "../../dist/tool-runtime/schema.js";

const objectSchema = (properties, required = Object.keys(properties)) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});
const activeState = resolveToolExecutionConfig({ toolExecution: { enabled: true } }, {}, true);

function operation(overrides = {}) {
  let calls = 0;
  const value = {
    key: { id: "fixture.echo", revision: "1" },
    description: "Echo one validated integer.",
    keywords: ["fixture", "echo"],
    owner: { adapterId: "fixture", adapterRevision: "1", executionWorld: "fixture" },
    inputSchema: objectSchema({ value: { type: "integer", minimum: 0, maximum: 10 } }),
    outputSchema: objectSchema({ echoed: { type: "integer", minimum: 0, maximum: 10 } }),
    effects: ["live-read"],
    effect: () => "live-read",
    concurrency: () => "read-parallel",
    exposure: { discoverable: true, direct: true, programmatic: true },
    authorize: async () => ({ kind: "allowed" }),
    execute: async (input) => {
      calls += 1;
      return {
        value: { echoed: input.value },
        coverage: { kind: "complete-at-boundary", boundary: "fixture" },
      };
    },
    ...overrides,
  };
  return { value, calls: () => calls };
}

function fixture({ routing = { kind: "allowed" }, op = operation() } = {}) {
  const registry = new OperationRegistry();
  registry.register(op.value);
  const admission = new AdmissionController(() => activeState, {
    admit: (...args) => (typeof routing === "function" ? routing(...args) : routing),
  });
  const kernel = new OperationKernel(registry, admission);
  const scope = {
    sessionId: "session",
    cwd: "/tmp",
    parentCallId: "parent",
    catalogGeneration: registry.snapshot().generation,
    responsibility: { profile: "solo", control: "inactive" },
    routing: { fence: "current" },
  };
  return { registry, kernel, scope, op };
}

test("bounded schema compiler rejects open/unsupported contracts and freezes accepted JSON", () => {
  assert.throws(
    () => compileSchema({ type: "object", properties: {}, required: [], additionalProperties: true }),
    (error) => error instanceof SchemaError && error.code === "schema_open",
  );
  assert.throws(
    () => compileSchema({ type: "string", $ref: "https://example.invalid/schema" }),
    (error) => error instanceof SchemaError && error.code === "schema_keyword",
  );
  const compiled = compileSchema(objectSchema({ value: { type: "array", items: { type: "integer" }, maxItems: 2 } }));
  const source = { value: [1, 2] };
  const parsed = compiled.parse(source);
  source.value[0] = 9;
  assert.deepEqual(parsed, { value: [1, 2] });
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.value), true);
  assert.equal(compiled.validate({ value: [1, 2, 3] }).ok, false);
  assert.equal(compiled.validate({ value: [1], extra: true }).ok, false);
});

test("registry preserves exact revision meaning and revoked descriptors never dispatch", async () => {
  const first = operation();
  const registry = new OperationRegistry();
  const registration = registry.register(first.value);
  const before = registry.snapshot().generation;
  first.value.description = "mutated after registration";
  first.value.inputSchema.properties.value.maximum = 0;
  first.value.execute = async () => ({
    value: { echoed: 999 },
    coverage: { kind: "complete-at-boundary", boundary: "mutated" },
  });
  const resolved = registry.resolve(first.value.key);
  assert.equal(resolved.descriptor.description, "Echo one validated integer.");
  assert.equal(resolved.input.validate({ value: 5 }).ok, true);
  assert.deepEqual((await resolved.operation.execute({ value: 2 }, { scope: {}, signal: undefined })).value, {
    echoed: 2,
  });
  assert.throws(
    () => registry.register({ ...operation().value, description: "Changed meaning under the same revision." }),
    (error) => error.code === "operation_conflict",
  );
  assert.throws(
    () => registry.register({ ...operation().value, key: { id: "fixture.echo", revision: "2" } }),
    (error) => error.code === "operation_revision_active",
  );
  registration.dispose();
  assert.notEqual(registry.snapshot().generation, before);
  assert.equal(registry.describe(first.value.key).available, false);
  assert.throws(
    () => registry.resolve(first.value.key),
    (error) => error.code === "operation_unavailable",
  );
  const reactivated = registry.register(resolved.operation);
  assert.equal(registry.describe(resolved.operation.key).available, true);
  reactivated.dispose();
  assert.throws(
    () =>
      registry.register({
        ...resolved.operation,
        execute: async () => ({
          value: { echoed: 1 },
          coverage: { kind: "complete-at-boundary", boundary: "changed" },
        }),
      }),
    (error) => error.code === "operation_conflict",
  );
  const second = operation();
  second.value.key = { id: "fixture.echo", revision: "2" };
  registry.register(second.value);
  assert.deepEqual(registry.current("fixture.echo").key, { id: "fixture.echo", revision: "2" });
  assert.equal(first.calls(), 1);
});

test("malformed input, routing denial, and adapter denial never enter execute", async () => {
  for (const scenario of [
    { input: { value: 2, extra: true }, routing: { kind: "allowed" }, authorize: undefined, code: "invalid_input" },
    {
      input: { value: 2 },
      routing: { kind: "denied", code: "routing_denied", message: "fixture denial" },
      authorize: undefined,
      code: "routing_denied",
    },
    {
      input: { value: 2 },
      routing: { kind: "allowed" },
      authorize: async () => ({ kind: "denied", code: "adapter_denied", message: "fixture denial" }),
      code: "adapter_denied",
    },
    {
      input: { value: 2 },
      routing: { kind: "allowed" },
      authorize: async () => ({ kind: "allowed", extra: true }),
      code: "adapter_authorization",
    },
    {
      input: { value: 2 },
      routing: { kind: "allowed" },
      authorize: async () => ({ kind: "needs-model", context: { detail: "x".repeat(40 * 1024) } }),
      code: "adapter_authorization",
    },
  ]) {
    const op = operation(scenario.authorize ? { authorize: scenario.authorize } : {});
    const f = fixture({ routing: scenario.routing, op });
    const outcome = await f.kernel.execute(op.value.key, scenario.input, f.scope, "direct");
    assert.equal(outcome.status, "denied");
    assert.equal(outcome.bodyStarted, false);
    assert.equal(outcome.error.code, scenario.code);
    assert.equal(op.calls(), 0);
  }
});

test("direct and programmatic calls share one policy path and output failures retain effect facts", async () => {
  const valid = operation();
  const f = fixture({ op: valid });
  const direct = await f.kernel.execute(valid.value.key, { value: 3 }, f.scope, "direct");
  const programmatic = await f.kernel.execute(valid.value.key, { value: 3 }, f.scope, "programmatic");
  assert.deepEqual({ ...direct, catalogGeneration: undefined }, { ...programmatic, catalogGeneration: undefined });
  assert.equal(valid.calls(), 2);

  const invalid = operation({
    execute: async () => ({
      value: { echoed: 999 },
      coverage: { kind: "complete-at-boundary", boundary: "fixture" },
    }),
  });
  const broken = fixture({ op: invalid });
  const outcome = await broken.kernel.execute(invalid.value.key, { value: 1 }, broken.scope, "direct");
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.error.code, "invalid_output");
  assert.equal(outcome.bodyStarted, true);
  assert.equal(outcome.effectState, "completed");
});

test("routing scope is rechecked immediately before execute", async () => {
  let checks = 0;
  const op = operation();
  const f = fixture({
    op,
    routing: () =>
      ++checks === 1
        ? { kind: "allowed" }
        : { kind: "denied", code: "routing_scope_changed", message: "fixture changed" },
  });
  const outcome = await f.kernel.execute(op.value.key, { value: 1 }, f.scope, "direct");
  assert.equal(outcome.status, "denied");
  assert.equal(outcome.error.code, "routing_scope_changed");
  assert.equal(outcome.bodyStarted, false);
  assert.equal(op.calls(), 0);
});

test("catalog generation fences stale calls before execution", async () => {
  const op = operation();
  const f = fixture({ op });
  const stale = { ...f.scope, catalogGeneration: "0".repeat(64) };
  const outcome = await f.kernel.execute(op.value.key, { value: 1 }, stale, "direct");
  assert.equal(outcome.status, "denied");
  assert.equal(outcome.error.code, "catalog_changed");
  assert.equal(op.calls(), 0);
});
