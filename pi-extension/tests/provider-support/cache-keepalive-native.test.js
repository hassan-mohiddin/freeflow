import assert from "node:assert/strict";
import test from "node:test";
import { anthropicResponse, fixture, response } from "../fixtures/routing-native.js";

// The Coordinator's model declares a short cache lifetime and prices that make warming worthwhile.
const openaiProvider = {
  modelOverrides: {
    "gpt-4o": {
      cost: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
      promptCache: { short: 12, long: 12 },
    },
  },
};
const usage = { input_tokens: 2_000_000, input_tokens_details: { cached_tokens: 1_990_000 }, output_tokens: 10 };
const isKeepAlive = (body) => body.model === "gpt-4o" && body.max_output_tokens === 16;

test("the coordinator's cache is kept warm while its delegated worker runs", { timeout: 30000 }, async () => {
  const keepAlives = [];
  let coordinatorTurns = 0,
    workerTurns = 0;
  const { requests } = await fixture(
    async (_n, body) => {
      if (isKeepAlive(body)) {
        keepAlives.push(body);
        return [];
      }
      if (body.model === "gpt-4o") {
        coordinatorTurns++;
        if (coordinatorTurns === 1)
          return [{ name: "freeflow_delegate", args: { operation: "assign", contract: "Return a short result." } }];
        if (coordinatorTurns === 2)
          return [
            {
              name: "freeflow_unit",
              args: { operation: "close", outcome: "accepted", assessment: "The saved report is sufficient." },
            },
          ];
        return [];
      }
      workerTurns++;
      if (workerTurns > 1) return [];
      // The worker runs past the Coordinator's refresh point (90% of 12s is capped to 2s by the 10s margin).
      await new Promise((resolve) => setTimeout(resolve, 3500));
      return [{ name: "freeflow_return", args: { operation: "submit", report: "Done.", outcome: "completed" } }];
    },
    true,
    undefined,
    true,
    {
      openaiProvider,
      settings: { cacheWarming: "off" },
      response: (n, calls) => response(n, calls, "fixture response", usage),
    },
  );
  assert.ok(keepAlives.length >= 1, "at least one keep-alive while the worker ran");
  const coordinatorRequest = requests.find((body) => body.model === "gpt-4o" && !isKeepAlive(body));
  const strip = ({ max_output_tokens: _cap, ...rest }) => rest;
  // The replay is the Coordinator's own request, byte-for-byte apart from the output cap.
  assert.deepEqual(strip(keepAlives[0]), strip(coordinatorRequest));
  // Nothing is warmed after the worker returned and the Coordinator resumed.
  const lastKeepAlive = requests.lastIndexOf(keepAlives.at(-1));
  const resumed = requests.findIndex(
    (body, i) => i > 0 && body.model === "gpt-4o" && !isKeepAlive(body) && i > requests.indexOf(coordinatorRequest),
  );
  assert.ok(lastKeepAlive < resumed, "keep-alives stop once the coordinator resumes");
});

test(
  "a Claude Coordinator is kept warm through Pi's Anthropic transport while its worker runs",
  { timeout: 30000 },
  async () => {
    const anthropicProvider = {
      modelOverrides: {
        "claude-opus-5-5": { promptCache: { short: 12, long: 12 } },
      },
    };
    const claudeUsage = {
      input_tokens: 10,
      output_tokens: 10,
      cache_read_input_tokens: 1_990_000,
      cache_creation_input_tokens: 0,
    };
    const isClaudeKeepAlive = (body) => body.model === "claude-opus-5-5" && body.max_tokens === 1;
    const keepAlives = [];
    let coordinatorTurns = 0,
      workerTurns = 0;
    const { requests } = await fixture(
      async (_n, body) => {
        if (isClaudeKeepAlive(body)) {
          keepAlives.push(body);
          return [];
        }
        if (body.model === "claude-opus-5-5") {
          coordinatorTurns++;
          if (coordinatorTurns === 1)
            return [{ name: "freeflow_delegate", args: { operation: "assign", contract: "Return a short result." } }];
          if (coordinatorTurns === 2)
            return [
              { name: "freeflow_unit", args: { operation: "close", outcome: "accepted", assessment: "Enough." } },
            ];
          return [];
        }
        workerTurns++;
        if (workerTurns > 1) return [];
        await new Promise((resolve) => setTimeout(resolve, 3500));
        return [{ name: "freeflow_return", args: { operation: "submit", report: "Done.", outcome: "completed" } }];
      },
      true,
      undefined,
      true,
      {
        anthropicProvider,
        model: ["anthropic", "claude-opus-5-5"],
        thinkingLevel: "high",
        settings: { cacheWarming: "off" },
        freeflowConfig: { toolExecution: { enabled: false } },
        cognitiveRouting: {
          enabled: true,
          projection: true,
          profiles: {
            coordinator: { provider: "anthropic", model: "claude-opus-5-5", thinking: "high" },
            executor: { provider: "anthropic", model: "claude-haiku-4-5", thinking: "low" },
          },
        },
        response: (n, calls, body) => anthropicResponse(n, calls, { model: body.model, usage: claudeUsage }),
      },
    );
    assert.ok(keepAlives.length >= 1, "at least one keep-alive while the worker ran");
    const coordinatorRequest = requests.find((body) => body.model === "claude-opus-5-5" && !isClaudeKeepAlive(body));
    const strip = ({ max_tokens: _cap, ...rest }) => rest;
    // The replay is the Coordinator's own request, per-message effort and thinking binding included, apart from the cap.
    assert.deepEqual(strip(keepAlives[0]), strip(coordinatorRequest));
    assert.ok(keepAlives[0].thinking?.block_binding, "Pi's managed thinking survives the replay");
  },
);
