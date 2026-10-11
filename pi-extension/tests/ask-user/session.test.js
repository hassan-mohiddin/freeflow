import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "../fixtures/routing-native.js";

// ask_user on a real Pi session with scripted model responses: declared with Freeflow, its guideline in the system
// prompt, the user's answer back to the model, and each request still starting with the previous one.
const text = (item) =>
  typeof item.content === "string"
    ? item.content
    : (item.content ?? []).map((part) => part.text ?? "").join("") + (item.output ?? "");
const ask = {
  name: "ask_user",
  args: {
    questions: [
      {
        question: "Ship it on or off by default?",
        header: "Default",
        options: [
          { label: "Off (Recommended)", description: "An opt-in preview." },
          { label: "On", description: "Everyone gets it." },
        ],
      },
    ],
  },
};

test("the model asks; the user's answer is the tool result; the prompt prefix holds", { timeout: 30000 }, async () => {
  const asked = [];
  await fixture(
    async (n) => (n === 1 ? [ask] : []),
    false,
    async ({ manager, requests }) => {
      const tools = (requests[0].tools ?? []).map((tool) => tool.name);
      assert.ok(tools.includes("ask_user"));
      assert.match(JSON.stringify(requests[0]), /Use ask_user for a choice that is the user's to make/);
      assert.deepEqual(asked, [
        [
          "Default · Ship it on or off by default?",
          ["Off (Recommended) — An opt-in preview.", "On — Everyone gets it.", "Type my own answer"],
        ],
      ]);
      const result = manager
        .getBranch()
        .map((entry) => entry.message)
        .find((message) => message?.role === "toolResult" && message.toolName === "ask_user");
      assert.notEqual(result.isError, true);
      assert.match(
        text(result),
        /The user answered in a dialog:\n- Default: Ship it on or off by default\?\n  Answer: Off \(Recommended\)/,
      );
      // The later request starts with the earlier one.
      assert.deepEqual(requests[1].input.slice(0, requests[0].input.length), requests[0].input);
      assert.deepEqual(requests[1].tools, requests[0].tools);
    },
    true,
    {
      cognitiveRouting: { enabled: false },
      ui: { select: async (title, options) => (asked.push([title, options]), options[0]) },
    },
  );
});

test("with Freeflow disabled the tool is not declared", { timeout: 30000 }, async () => {
  await fixture(
    async () => [],
    false,
    async ({ requests }) => {
      assert.ok(!(requests[0].tools ?? []).some((tool) => tool.name === "ask_user"));
    },
    true,
    { cognitiveRouting: { enabled: false }, freeflowConfig: { enabled: false } },
  );
});
