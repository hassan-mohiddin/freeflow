import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "../fixtures/routing-native.js";

// freeflow_compact called from a script, the way Pi's codemode calls tools (ctx.executeTool): agents that look for
// tools in codemode first must find it there, and the compaction still happens at the end of the turn.
function scriptTool(outcomes) {
  return (pi) => {
    pi.registerTool({
      name: "probe_script",
      label: "probe_script",
      description: "Calls freeflow_compact through ctx.executeTool.",
      parameters: { type: "object", properties: {} },
      async execute(_id, _params, signal, _update, ctx) {
        const outcome = await ctx.executeTool("freeflow_compact", { summary: "SCRIPT_SUMMARY" }, { signal });
        outcomes.push({ isError: outcome.isError, text: JSON.stringify(outcome.result?.content ?? outcome) });
        return { content: [{ type: "text", text: "script done" }] };
      },
    });
  };
}

test("freeflow_compact called from a script compacts at the end of the turn", { timeout: 30000 }, async () => {
  const outcomes = [];
  let api;
  await fixture(
    async (n) => (n === 1 ? [{ name: "probe_script", args: {} }] : []),
    false,
    async ({ requests, manager }) => {
      assert.equal(api.getAllTools().find((tool) => tool.name === "freeflow_compact").exposure, "direct");
      assert.equal(outcomes.length, 1);
      assert.equal(outcomes[0].isError, false, outcomes[0].text);
      const compaction = manager.getBranch().find((entry) => entry.type === "compaction");
      assert.ok(compaction, "the script's call compacted");
      assert.match(compaction.summary, /^SCRIPT_SUMMARY/);
      // The same run continues from the new cycle.
      assert.ok(requests.length >= 2);
      assert.match(JSON.stringify(requests[1].input), /SCRIPT_SUMMARY/);
      assert.ok(!requests[1].input.some((item) => item.type === "function_call"), "nothing raw is kept");
    },
    true,
    {
      cognitiveRouting: { enabled: false },
      extensions: [scriptTool(outcomes), (pi) => (api = pi)],
      beforePrompt: async ({ session, requests }) => {
        const before = requests.length;
        await session.prompt("/freeflow compact");
        for (let i = 0; i < 200 && requests.length === before; i++)
          await new Promise((resolve) => setTimeout(resolve, 10));
        await session.waitForIdle();
      },
    },
  );
});
