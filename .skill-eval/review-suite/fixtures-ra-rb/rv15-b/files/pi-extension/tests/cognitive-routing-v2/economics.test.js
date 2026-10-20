import assert from "node:assert/strict";
import test from "node:test";
import { presetWarnings } from "../../dist/cognitive-routing-v2/economics.js";
import { effortHistoryRoute } from "../../dist/provider-support/openai/adapter.js";

const codex = (id, input) => ({
  id,
  provider: "openai-codex",
  api: "openai-codex-responses",
  baseUrl: "https://chatgpt.com/backend-api",
  cost: { input },
});
const models = {
  "gpt-6-sol": codex("gpt-6-sol", 2),
  "gpt-6-luna": codex("gpt-6-luna", 0.1),
  "gpt-5.6-sol": codex("gpt-5.6-sol", 4),
  "gpt-5.6-luna": codex("gpt-5.6-luna", 0.2),
};
const find = (_provider, id) => models[id];
const pair = (modelId, thinking) => ({ provider: "openai-codex", modelId, thinking });
const check = (pairs, workers = ["executor"]) =>
  presetWarnings(pairs, workers, find, (model) => effortHistoryRoute(model) !== undefined);

test("a cheaper worker on another model raises no warning", () => {
  assert.deepEqual(check({ coordinator: pair("gpt-6-sol", "xhigh"), executor: pair("gpt-6-luna", "max") }), []);
});

test("a worker priced at or above Coordinator per input token is flagged", () => {
  const [warning] = check({ coordinator: pair("gpt-5.6-luna", "high"), executor: pair("gpt-6-sol", "low") });
  assert.match(warning, /Executor/);
  assert.match(warning, /input token/);
});

test("same model at different effort is flagged only where the cache does not survive effort changes", () => {
  const [warning] = check({ coordinator: pair("gpt-5.6-sol", "xhigh"), executor: pair("gpt-5.6-sol", "medium") });
  assert.match(warning, /rereads the whole context/);
  assert.deepEqual(check({ coordinator: pair("gpt-6-sol", "xhigh"), executor: pair("gpt-6-sol", "low") }), []);
});

test("only enabled workers are checked", () => {
  assert.deepEqual(
    check({ coordinator: pair("gpt-5.6-luna", "high"), helper: pair("gpt-6-sol", "low") }, ["executor"]),
    [],
  );
});

test("routing announces a costly preset once and reports it in its state", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { SessionManager } = await import("@earendil-works/pi-coding-agent");
  const { RoutingRuntime } = await import("../../dist/cognitive-routing-v2/runtime.js");
  const root = await mkdtemp(join(tmpdir(), "routing-economics-"));
  try {
    const fixtureModels = {
      cheap: { id: "cheap", provider: "fixture", api: "fixture", cost: { input: 1 } },
      pricey: { id: "pricey", provider: "fixture", api: "fixture", cost: { input: 3 } },
    };
    const manager = SessionManager.create(root, join(root, "s"));
    manager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "seed" }],
      model: "cheap",
      provider: "fixture",
      api: "fixture",
      stopReason: "stop",
      timestamp: 1,
    });
    const notices = [];
    const ctx = {
      sessionManager: manager,
      model: fixtureModels.cheap,
      thinkingLevel: "off",
      modelRegistry: { find: (_p, id) => fixtureModels[id], getApiKeyAndHeaders: async () => ({ ok: true }) },
      ui: { notify: (text) => notices.push(text) },
      getSystemPrompt: () => "",
      isIdle: () => true,
    };
    const pi = {
      appendEntry: (type, data) => manager.appendCustomEntry(type, data),
      setModel: async (model) => ((ctx.model = model), true),
      setThinkingLevel: (level) => (ctx.thinkingLevel = level),
      getAllTools: () => [],
      sendMessage() {},
    };
    const capability = {
      effective: true,
      enabled: true,
      projection: false,
      delegation: "executor",
      profiles: {
        coordinator: { provider: "fixture", model: "cheap", thinking: "off" },
        executor: { provider: "fixture", model: "pricey", thinking: "off" },
      },
      blockingReason: { code: "", message: "" },
    };
    const runtime = new RoutingRuntime(pi);
    await runtime.bind(ctx, capability);
    await runtime.refresh(ctx, capability);
    assert.equal(notices.filter((text) => /costs as much per input token/.test(text)).length, 1);
    assert.equal(runtime.state().presetWarnings.length, 1);
    runtime.unbind();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const claude = {
  id: "claude-opus-5-5",
  provider: "anthropic",
  api: "anthropic-messages",
  cost: { input: 4, cacheRead: 0.2, cacheWrite: 5 },
  promptCache: { short: 300, long: 3600 },
};
const mixed = { ...models, "claude-opus-5-5": claude };
const retentionCheck = (retention) =>
  presetWarnings(
    {
      coordinator: { provider: "anthropic", modelId: "claude-opus-5-5", thinking: "high" },
      executor: pair("gpt-6-luna", "max"),
    },
    ["executor"],
    (_provider, id) => mixed[id],
    () => false,
    retention,
  );

test("a Coordinator on the short cache tier of a model with a longer tier is advised", () => {
  const warnings = retentionCheck("short");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /claude-opus-5-5/);
  assert.match(warnings[0], /5 minutes/);
  assert.match(warnings[0], /PI_CACHE_RETENTION=long/);
  assert.match(warnings[0], /60 minutes/);
  assert.deepEqual(retentionCheck("long"), []);
  assert.deepEqual(retentionCheck(undefined), [], "no advice when the host retention is unknown");
});

test("a Coordinator without a declared longer cache tier gets no retention advice", () => {
  const warnings = presetWarnings(
    { coordinator: pair("gpt-6-sol", "xhigh"), executor: pair("gpt-6-luna", "max") },
    ["executor"],
    find,
    () => true,
    "short",
  );
  assert.deepEqual(warnings, []);
});
