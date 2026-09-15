import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "../fixtures/routing-native.js";
const profiles = Object.fromEntries(
  ["coordinator", "helper", "executor"].map((p) => [
    p,
    { provider: "openai", model: "gpt-6-astra", thinking: p === "coordinator" ? "high" : "low" },
  ]),
);
for (const projection of [false, true])
  test(`native routing preserves per-view prefixes with projection=${projection}`, { timeout: 30000 }, async () => {
    const last = new Map();
    let ref;
    const result = await fixture(
      (n, body, manager) => {
        const runtimeItems = body.input.filter((x) => JSON.stringify(x).includes("# Cognitive Routing Runtime State"));
        const current = JSON.stringify(runtimeItems.at(-1));
        const profile = current.includes("Profile: coordinator") ? "coordinator" : "worker";
        const view = projection ? profile : "ordinary";
        const previous = last.get(view);
        if (previous) {
          assert.deepEqual(body.tools, previous.tools, "fixed routing tool definitions");
          assert.deepEqual(
            body.input.slice(0, previous.input.length),
            previous.input,
            `prior ${view} prefix survives request ${n}`,
          );
        }
        last.set(view, body);
        if (n === 1)
          return [
            {
              name: "freeflow_delegate",
              args: { operation: "assign", worker: "helper", contract: "Read evidence.txt and select its result." },
            },
          ];
        if (n === 2) return [{ name: "read", args: { path: "evidence.txt" } }];
        if (n === 3) {
          ref = "ctx:" + manager.getBranch().find((e) => e.message?.toolName === "read").id;
          return [
            ...(projection ? [{ name: "freeflow_project", args: { operation: "add", refs: [ref] } }] : []),
            { name: "freeflow_return", args: { operation: "submit", report: "Evidence read.", outcome: "completed" } },
          ];
        }
        if (n === 4)
          return [
            {
              name: "freeflow_unit",
              args: { operation: "close", outcome: "accepted", assessment: "Exact evidence observed." },
            },
          ];
        if (n === 5)
          return [
            {
              name: "freeflow_delegate",
              args: { operation: "assign", worker: "executor", contract: "Read evidence.txt and return." },
            },
          ];
        if (n === 6) return [{ name: "read", args: { path: "evidence.txt" } }];
        if (n === 7) {
          const latest = manager
            .getBranch()
            .filter((e) => e.message?.toolName === "read")
            .at(-1);
          return [
            ...(projection
              ? [{ name: "freeflow_project", args: { operation: "add", refs: ["ctx:" + latest.id] } }]
              : []),
            {
              name: "freeflow_return",
              args: { operation: "submit", report: "Executor evidence read.", outcome: "completed" },
            },
          ];
        }
        if (n === 8)
          return [
            {
              name: "freeflow_unit",
              args: { operation: "close", outcome: "accepted", assessment: "Second exact result checked." },
            },
          ];
        return [];
      },
      projection,
      undefined,
      false,
      { cognitiveRouting: { enabled: true, projection, delegation: "both", profiles } },
    );
    assert.equal(result.requests.length, 9);
    assert.ok(result.entries.some((e) => e.customType === "freeflow-request-history-v1"));
  });
