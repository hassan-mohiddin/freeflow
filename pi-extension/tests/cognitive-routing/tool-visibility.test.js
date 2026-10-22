import assert from "node:assert/strict";
import test from "node:test";
import { applyRoutingToolVisibility } from "../../dist/cognitive-routing/tools.js";
import { fixture } from "../fixtures/routing-native.js";

// Routing's tools and cue reach the model only while routing is effective (Task 003 D-002); a toggle changes the
// tool list once, which costs one cache write (D-001).
const ROUTING = ["delegate_work", "return_work", "routing_unit", "select_evidence"];

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

test(
  "routing's tools are inactive until Freeflow turns them on, and a resumed session gets them back",
  { timeout: 30000 },
  async () => {
    // Pi 1.4.0 activates an extension tool the branch never added or removed unless it is registered with
    // defaultActive: false, so another extension at session start would otherwise see them with routing off.
    const seen = [];
    const watch = (pi) => pi.on("session_start", () => void seen.push(pi.getActiveTools()));
    await fixture(
      async () => [],
      false,
      async () => {
        for (const name of ROUTING) assert.ok(!seen[0].includes(name), name);
      },
      true,
      { cognitiveRouting: { enabled: false }, beforeExtensions: [watch] },
    );
    seen.length = 0;
    await fixture(
      async () => [],
      false,
      async ({ session, requests }) => {
        await session.reload();
        await session.prompt("Again.");
        await session.waitForIdle();
        for (const body of requests) {
          const names = (body.tools ?? []).map((tool) => tool.name);
          for (const name of ROUTING) assert.ok(names.includes(name), name);
        }
        // After the reload Pi restores the loadout the branch recorded (Pi 1.3.0), routing's tools among it.
        for (const name of ROUTING) assert.ok(seen.at(-1).includes(name), name);
      },
      true,
      { beforeExtensions: [watch] },
    );
  },
);
