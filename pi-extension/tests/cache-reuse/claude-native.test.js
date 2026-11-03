import assert from "node:assert/strict";
import test from "node:test";
import { anthropicResponse, fixture } from "../fixtures/pi-native.js";
import { anthropicLayout } from "../../dist/provider-support/cache/anthropic.js";

// Claude Sonnet 5.5 reaches Pi 0.87.1 through its remote catalog; this is that catalog entry as published.
const SONNET_5_5 = {
  id: "claude-sonnet-5-5",
  name: "Claude Sonnet 5.5",
  api: "anthropic-messages",
  provider: "anthropic",
  baseUrl: "https://api.anthropic.com",
  reasoning: true,
  input: ["text", "image"],
  cost: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  contextWindow: 1000000,
  maxTokens: 128000,
  thinkingLevelMap: {
    off: null,
    minimal: null,
    low: "low",
    medium: "medium",
    high: "high",
    xhigh: "xhigh",
    max: "max",
  },
  compat: {
    supportsMidConvoEffort: true,
    supportsMidConvoSystemMessages: true,
    supportsMidConvoToolChanges: true,
    forceAdaptiveThinking: true,
    supportsTemperature: false,
    supportsStrictTools: true,
  },
  promptCache: { short: 300, long: 3600 },
  type: "chat",
};
const modelsStore = { anthropic: { models: [SONNET_5_5], checkedAt: Date.now(), lastModified: 4102444800000 } };

// Freeflow changes the active tools mid-session (Tool Execution, compact_context), as other extensions may. On Claude
// models with native tool changes, Pi 1.0.1 and later define a later tool inside the conversation and keep the
// request's tool list fixed (Pi 1.0.0 appended it to the list, which changed every later request's prefix and left
// Freeflow's cache anchor nothing to find).
test("a tool activated mid-session on Claude keeps the earlier request a prefix", { timeout: 30000 }, async () => {
  const bodies = [];
  await fixture(
    async () => [],
    false,
    async ({ session }) => {
      session.setActiveToolsByName([...session.getActiveToolNames(), "grep"]);
      await session.prompt("Second prompt.");
      await session.waitForIdle();
    },
    false,
    {
      model: ["anthropic", "claude-sonnet-5-5"],
      thinkingLevel: "low",
      modelsStore,
      response: (n, calls, body) => {
        bodies.push(body);
        return anthropicResponse(n, calls, { model: body.model });
      },
    },
  );
  const [before, after] = bodies.slice(-2);
  const strip = (value) => JSON.parse(JSON.stringify(value, (key, v) => (key === "cache_control" ? undefined : v)));
  assert.deepEqual(strip(after.tools), strip(before.tools), "the request's tool list does not change");
  assert.deepEqual(strip(after.messages.slice(0, before.messages.length)), strip(before.messages));
  assert.ok(
    after.messages.some((m) =>
      m.content?.some?.((b) => b.type === "tool_addition" && b.tool?.definition?.name === "grep"),
    ),
    "the new tool is defined inside the conversation",
  );
  // Freeflow's anchor looks for the earlier request's last breakpoint in the later request's layout.
  const earlier = anthropicLayout(before).layout,
    later = anthropicLayout(after).layout;
  const entry = earlier.breakpoints.at(-1);
  assert.ok(entry !== undefined);
  assert.equal(later.chain[entry], earlier.chain[entry], "the earlier cache entry is findable in the later request");
});
