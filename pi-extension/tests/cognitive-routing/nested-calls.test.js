import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "../fixtures/routing-native.js";
import { routingState } from "../fixtures/routing-state.js";

// A tool that calls other tools the way Pi's codemode does (ctx.executeTool), recording each nested outcome.
function nestingTool(calls, outcomes) {
  return (pi) => {
    pi.registerTool({
      name: "probe_nested",
      label: "probe_nested",
      description: "Calls other tools through ctx.executeTool.",
      parameters: { type: "object", properties: {} },
      async execute(_id, _params, signal, _update, ctx) {
        for (const [name, args] of calls) {
          const outcome = await ctx.executeTool(name, args, { signal });
          outcomes.push({ name, isError: outcome.isError, text: JSON.stringify(outcome.result?.content ?? outcome) });
        }
        return { content: [{ type: "text", text: "nested calls done" }] };
      },
    });
  };
}

test("routing tools are declared to the model but not callable from scripts", { timeout: 30000 }, async () => {
  let api;
  await fixture(
    async () => [],
    false,
    async () => {
      const routing = api.getAllTools().filter((tool) => tool.name.startsWith("freeflow_"));
      const exposures = Object.fromEntries(routing.map((tool) => [tool.name, tool.exposure]));
      for (const name of ["freeflow_delegate", "freeflow_return", "freeflow_unit", "freeflow_project"])
        assert.equal(exposures[name], "model-only", name);
    },
    true,
    { extensions: [(pi) => (api = pi)] },
  );
});

test("under automatic routing a nested call is admitted with its issuing call", { timeout: 30000 }, async () => {
  const outcomes = [];
  await fixture(
    async (n) => (n === 1 ? [{ name: "probe_nested", args: {} }] : []),
    false,
    async ({ manager }) => {
      assert.equal(routingState(manager).control, "automatic");
      const [read, unit] = outcomes;
      assert.equal(read.isError, false, read.text);
      assert.match(read.text, /EXACT_EVIDENCE_BODY_81/);
      // model-only exposure makes Pi refuse it before Freeflow's gate, which refuses nested routing calls as well.
      assert.equal(unit.isError, true);
      assert.match(unit.text, /Tool freeflow_unit not found|Call freeflow_unit directly, not from a script\./);
    },
    true,
    {
      extensions: [
        nestingTool(
          [
            ["read", { path: "evidence.txt" }],
            ["freeflow_unit", { operation: "inspect" }],
          ],
          outcomes,
        ),
      ],
    },
  );
});

test("a worker's nested read is admitted while its assignment is outstanding", { timeout: 30000 }, async () => {
  const outcomes = [];
  await fixture(
    async (n, _body, manager) => {
      if (n === 1)
        return [
          { name: "freeflow_delegate", args: { operation: "assign", contract: "Read evidence.txt through a script." } },
        ];
      if (n === 2) {
        const state = routingState(manager);
        assert.equal(state.assignments.get(state.assignmentId).state, "outstanding");
        return [{ name: "probe_nested", args: {} }];
      }
      return [];
    },
    false,
    async () => {
      assert.equal(outcomes.length, 1);
      assert.equal(outcomes[0].isError, false, outcomes[0].text);
      assert.match(outcomes[0].text, /EXACT_EVIDENCE_BODY_81/);
    },
    true,
    { extensions: [nestingTool([["read", { path: "evidence.txt" }]], outcomes)] },
  );
});
