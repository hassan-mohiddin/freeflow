import assert from "node:assert/strict";
import test from "node:test";
import {
  COGNITIVE_ROUTING_HISTORY_TOOL_NAME,
  COGNITIVE_ROUTING_SWITCH_TOOL_NAME,
  registerCognitiveRoutingHistoryTool,
  registerCognitiveRoutingTool,
} from "../../dist/cognitive-routing/tool.js";

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

function registerHistory(getHistory) {
  let tool;
  registerCognitiveRoutingHistoryTool(
    {
      registerTool(candidate) {
        tool = candidate;
      },
    },
    getHistory,
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

test("renders no-op results as already active", () => {
  const tool = register(() => undefined);
  const theme = {
    fg(_color, text) {
      return text;
    },
  };

  assert.equal(
    tool
      .renderResult(
        {
          details: {
            result: {
              status: "active",
              changed: false,
              from: "reasoning",
              to: "reasoning",
              profile: "reasoning",
            },
          },
        },
        {},
        theme,
      )
      .render(120)
      .join("\n"),
    "Cognitive Routing: reasoning (already active)",
  );
});

test("recovers a structured result from model-visible tool text", () => {
  const tool = register(() => undefined);
  const theme = {
    fg(_color, text) {
      return text;
    },
  };

  assert.equal(
    tool
      .renderResult(
        { content: [{ type: "text", text: "freeflow_switch_profile|active\\nprofile|reasoning" }], isError: false },
        {},
        theme,
      )
      .render(120)
      .join("\n"),
    "Cognitive Routing: active · reasoning",
  );
});

test("hides the duplicate pending line without reading mutable controller state", () => {
  const tool = register(() => {
    throw new Error("renderCall must not read live profile state");
  });
  const theme = {
    fg(_color, text) {
      return text;
    },
  };

  assert.deepEqual(tool.renderCall({ target: "reasoning" }, theme).render(120), []);
  assert.equal(
    tool
      .renderResult(
        {
          details: {
            result: {
              status: "active",
              changed: true,
              from: "standard",
              to: "reasoning",
              profile: "reasoning",
            },
          },
        },
        {},
        theme,
      )
      .render(120)
      .join("\n"),
    "Cognitive Routing: standard → reasoning",
  );
});

test("exposes the read-only Cognitive Routing history tool contract", async () => {
  const calls = [];
  const resultValue = {
    current: { control: "automatic", profile: "reasoning" },
    summary: { latestSemanticEventId: "intent-1", unresolvedCount: 0, anomalyCount: 0 },
    events: [],
  };
  const tool = registerHistory((options) => {
    calls.push(options);
    return resultValue;
  });

  assert.equal(tool.name, COGNITIVE_ROUTING_HISTORY_TOOL_NAME);
  assert.deepEqual(tool.parameters.required, []);
  assert.deepEqual(tool.parameters.properties.scope.enum, ["session", "active-branch"]);
  assert.equal(tool.parameters.properties.limit.minimum, 1);

  const result = await tool.execute(
    "history-1",
    { scope: "active-branch", anomaliesOnly: true, limit: 7 },
    undefined,
    undefined,
    {},
  );

  assert.deepEqual(calls, [{ scope: "active-branch", anomaliesOnly: true, limit: 7 }]);
  assert.deepEqual(result.details.result, resultValue);
  assert.match(result.content[0].text, /Cognitive Routing history/);
});

test("routes a valid automatic request through the controller", async () => {
  const calls = [];
  const controller = {
    state() {
      return { effective: true, controlMode: "automatic" };
    },
    async switchAutomaticProfile(target, reason) {
      calls.push([target, reason]);
      return { status: "active", changed: true, from: "standard", to: target, profile: target };
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
  assert.deepEqual(result.details.result, {
    status: "active",
    changed: true,
    from: "standard",
    to: "reasoning",
    profile: "reasoning",
  });
  assert.match(result.content[0].text, /profile\|reasoning/);
});
