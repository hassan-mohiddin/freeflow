import assert from "node:assert/strict";
import test from "node:test";
import { COGNITIVE_ROUTING_SWITCH_TOOL_NAME, registerCognitiveRoutingTool } from "../../dist/cognitive-routing/tool.js";

function register(getController) {
  let tool;
  registerCognitiveRoutingTool(
    {
      registerTool(candidate) {
        tool = candidate;
      },
    },
    getController,
  );
  return tool;
}

test("exposes exactly the bounded profile switch schema", () => {
  const tool = register(() => undefined);

  assert.equal(tool.name, COGNITIVE_ROUTING_SWITCH_TOOL_NAME);
  assert.deepEqual(tool.parameters.required, ["target", "reason"]);
  assert.deepEqual(tool.parameters.properties.target.enum, ["standard", "reasoning"]);
  assert.equal(tool.parameters.properties.reason.maxLength, 160);
});

test("validates reason before any controller call", async () => {
  const tool = register(() => undefined);

  const result = await tool.execute(
    "call-1",
    { target: "reasoning", reason: "line one\nline two" },
    undefined,
    undefined,
    {},
  );

  assert.deepEqual(result.details.result, { status: "blocked", reason: "reason_must_be_single_line" });
});

test("blocks stale or manually held execution without host mutation", async () => {
  let calls = 0;
  const controller = {
    state() {
      return { effective: true, controlMode: "manual-reasoning" };
    },
    async switchAutomaticProfile() {
      calls += 1;
      return { status: "active", profile: "standard" };
    },
  };
  const tool = register(() => controller);

  const result = await tool.execute(
    "call-2",
    { target: "standard", reason: "Need a simpler pass." },
    undefined,
    undefined,
    {},
  );

  assert.deepEqual(result.details.result, { status: "blocked", reason: "manual_hold" });
  assert.equal(calls, 0);
});

test("routes a valid automatic request through the controller", async () => {
  const calls = [];
  const controller = {
    state() {
      return { effective: true, controlMode: "automatic" };
    },
    async switchAutomaticProfile(target, reason) {
      calls.push([target, reason]);
      return { status: "active", profile: target };
    },
  };
  const tool = register(() => controller);

  const result = await tool.execute(
    "call-3",
    { target: "reasoning", reason: "Need a deeper analysis. " },
    undefined,
    undefined,
    {},
  );

  assert.deepEqual(calls, [["reasoning", "Need a deeper analysis."]]);
  assert.deepEqual(result.details.result, { status: "active", profile: "reasoning" });
  assert.match(result.content[0].text, /profile\|reasoning/);
});
