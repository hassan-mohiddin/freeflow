import assert from "node:assert/strict";
import test from "node:test";
import { applyRoutingToolVisibility } from "../../dist/cognitive-routing/tools.js";
import { fixture } from "../fixtures/routing-native.js";

// Routing's tools and cue reach the model only while routing is effective (Task 003 D-002); a toggle changes the
// tool list once, which costs one cache write (D-001).
const ROUTING = ["freeflow_delegate", "freeflow_return", "freeflow_unit", "freeflow_project"];

test("routing tools are added while routing is effective and removed when it is not, other tools in place", () => {
  let active = ["read", "bash", "tool_search"];
  const pi = { getActiveTools: () => active, setActiveTools: (next) => (active = next) };
  applyRoutingToolVisibility(pi, undefined, true);
  assert.deepEqual(active, ["read", "bash", "tool_search", ...ROUTING]);
  active = [...active, "apply_patch"];
  applyRoutingToolVisibility(pi, undefined, false);
  assert.deepEqual(active, ["read", "bash", "tool_search", "apply_patch"]);
  let calls = 0;
  const steady = { getActiveTools: () => active, setActiveTools: () => calls++ };
  applyRoutingToolVisibility(steady, undefined, false);
  assert.equal(calls, 0, "no change, no new tool list");
});

test("with routing off a request carries neither routing's tools nor its cue", { timeout: 30000 }, async () => {
  await fixture(
    async () => [],
    false,
    async ({ requests }) => {
      const names = (requests[0].tools ?? []).map((tool) => tool.name);
      for (const name of ROUTING) assert.ok(!names.includes(name), name);
      const text = JSON.stringify(requests[0]);
      assert.doesNotMatch(text, /Cognitive Routing Cue/);
      assert.doesNotMatch(text, /availability contract/);
      assert.match(text, /# Freeflow Stable Guidance/);
    },
    true,
    { cognitiveRouting: { enabled: false } },
  );
});
