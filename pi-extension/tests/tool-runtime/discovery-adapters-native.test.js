import assert from "node:assert/strict";
import test from "node:test";

import { registerCooperatingAdapter } from "../../dist/tool-runtime/adapters/protocol.js";
import { fixture } from "../fixtures/routing-native.js";

const call = (name, args) => [{ name, args }];
const resultFor = (manager, name) =>
  manager
    .getBranch()
    .filter((entry) => entry.message?.role === "toolResult" && entry.message.toolName === name)
    .at(-1)?.message;

function bundle() {
  const lookup = {
    key: { id: "fixture.native.lookup", revision: "1" },
    description: "Look up one configured native fixture record.",
    keywords: ["fixture", "native", "lookup", "record"],
    owner: {
      adapterId: "fixture.native",
      adapterRevision: "1",
      executionWorld: "fixture-native-records",
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { id: { type: "string", minLength: 1, maxLength: 64 } },
      required: ["id"],
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string", minLength: 1, maxLength: 64 },
        value: { type: "string", minLength: 1, maxLength: 128 },
      },
      required: ["id", "value"],
    },
    effects: ["live-read"],
    effect: () => "live-read",
    concurrency: () => "read-parallel",
    exposure: { discoverable: true, direct: true, programmatic: true },
    authorize: async () => ({ kind: "allowed" }),
    execute: async (input) => ({
      value: { id: input.id, value: `record:${input.id}` },
      coverage: { kind: "complete-at-boundary", boundary: "fixture-native-record" },
    }),
  };
  const catalog = Array.from({ length: 300 }, (_, index) => ({
    ...lookup,
    key: { id: `fixture.native.catalog${String(index).padStart(3, "0")}`, revision: "1" },
    description: `Configured native catalog fixture ${index}.`,
    keywords: ["fixture", "native", "catalog", String(index)],
  }));
  return {
    protocol: 1,
    id: "fixture.native",
    revision: "1",
    executionWorld: "fixture-native-records",
    policy: { authorization: "per-call", cancellation: "abort-signal", settlement: "effect-aware" },
    operations: [lookup, ...catalog],
    dispose() {},
  };
}

test("native stable facade discovers and invokes a configured adapter without adding native tool schemas", async (t) => {
  let registration;
  t.after(() => registration?.dispose());
  const toolBytes = [];
  const observed = await fixture(
    (request, wire, manager) => {
      toolBytes.push(Buffer.byteLength(JSON.stringify(wire.tools), "utf8"));
      assert.equal(
        wire.tools.some((tool) => tool.name === "fixture.native.lookup"),
        false,
      );
      assert.equal(JSON.stringify(wire.tools).includes("fixture.native.lookup"), false);
      assert.equal(JSON.stringify(wire.tools).includes("fixture.native.catalog"), false);
      if (request === 1) {
        assert.equal(JSON.stringify(wire).includes("catalog 305"), true);
        return call("freeflow_tools", { operation: "search", query: "fixture.native.lookup", limit: 5 });
      }
      if (request === 2) {
        const search = resultFor(manager, "freeflow_tools").details;
        assert.deepEqual(
          search.hits.map((hit) => hit.key.id),
          ["fixture.native.lookup"],
        );
        return call("freeflow_tools", {
          operation: "describe",
          operations: [{ id: "fixture.native.lookup", revision: "1" }],
        });
      }
      if (request === 3) {
        const descriptor = resultFor(manager, "freeflow_tools").details.operations[0];
        assert.equal(descriptor.available, true);
        assert.equal(descriptor.outputSchema.properties.value.maxLength, 128);
        return call("freeflow_tools", {
          operation: "call",
          operationKey: { id: "fixture.native.lookup", revision: "1" },
          input: { id: "direct" },
        });
      }
      if (request === 4) {
        const outcome = resultFor(manager, "freeflow_tools").details.outcome;
        assert.equal(outcome.status, "succeeded");
        assert.deepEqual(outcome.value, { id: "direct", value: "record:direct" });
        return call("freeflow_run", {
          code: `emit(await tools.invoke("fixture.native.lookup", { id: "program" }));`,
          description: "invoke configured native fixture adapter",
          operations: [{ id: "fixture.native.lookup", revision: "1" }],
          input: null,
          timeoutMs: 1000,
        });
      }
      if (request === 5) {
        const run = resultFor(manager, "freeflow_run");
        assert.equal(run.isError, false);
        assert.deepEqual(run.details.freeflowRun.emitted, [{ id: "program", value: "record:program" }]);
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    undefined,
    false,
    {
      cognitiveRouting: { enabled: false },
      freeflowConfig: {
        toolExecution: {
          enabled: true,
          discovery: { enabled: true },
          programs: { mode: "adapters", timeoutMs: 1000, maxParallelReads: 4 },
          adapters: { allow: ["fixture.native"] },
        },
      },
      extensions: [
        () => {
          registration = registerCooperatingAdapter(bundle());
          assert.equal(registration.accepted, true);
        },
      ],
    },
  );
  assert.equal(observed.requests.length, 5);
  assert.equal(new Set(toolBytes).size, 1, "large operation catalog never changes stable native tool schema bytes");
  assert.ok(toolBytes[0] < 20_000, `stable native tool schema bytes: ${toolBytes[0]}`);
});
