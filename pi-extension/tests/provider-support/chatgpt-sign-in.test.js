import assert from "node:assert/strict";
import test from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { CacheAnchorAdapter } from "../../dist/provider-support/cache/index.js";
import { OpenAIEffortAdapter } from "../../dist/provider-support/openai/adapter.js";
import { isChatGPTSignIn } from "../../dist/provider-support/routes.js";

// Pi 0.99's Sign in with ChatGPT shares the openai provider, its Responses API and base URL with API keys; only the
// credential differs. Until each adaptation is qualified on it, its requests go out as Pi built them.
const luna = {
  provider: "openai",
  api: "openai-responses",
  id: "gpt-6-luna",
  baseUrl: "https://api.openai.com/v1",
  compat: { supportsExplicitPromptCacheMode: true },
};
const registry = (oauth) => ({ isUsingOAuth: () => oauth });

test("the sign-in route is the openai Responses API at api.openai.com with a ChatGPT credential", () => {
  assert.equal(isChatGPTSignIn(luna, { modelRegistry: registry(true) }), true);
  assert.equal(isChatGPTSignIn({ ...luna, baseUrl: undefined }, { modelRegistry: registry(true) }), true);
  assert.equal(isChatGPTSignIn(luna, { modelRegistry: registry(false) }), false, "an API key");
  assert.equal(
    isChatGPTSignIn({ ...luna, baseUrl: "https://proxy.example/v1" }, { modelRegistry: registry(true) }),
    false,
  );
  assert.equal(
    isChatGPTSignIn(
      { ...luna, provider: "openai-codex", api: "openai-codex-responses" },
      { modelRegistry: registry(true) },
    ),
    false,
  );
  assert.equal(isChatGPTSignIn(luna, {}), false, "a host without the registry method");
  assert.equal(
    isChatGPTSignIn(luna, {
      modelRegistry: {
        isUsingOAuth: () => {
          throw new Error("unavailable");
        },
      },
    }),
    false,
  );
});

const user = (text) => ({ role: "user", content: [{ type: "input_text", text }] });
const call = (id) => ({ type: "function_call", call_id: id, name: "read", arguments: "{}" });
const output = (id) => ({ type: "function_call_output", call_id: id, output: `body ${id}` });
const turns = (n) => Array.from({ length: n }, (_, i) => [call(`w${i}`), output(`w${i}`), user(`note ${i}`)]).flat();
const marked = (payload) =>
  payload.input.some((item) => Array.isArray(item.content) && item.content.some((b) => b.prompt_cache_breakpoint));

test("no explicit cache breakpoint is added for Sign in with ChatGPT; API keys still get one", () => {
  for (const [oauth, expected] of [
    [true, false],
    [false, true],
  ]) {
    const adapter = new CacheAnchorAdapter();
    const ctx = { model: luna, modelRegistry: registry(oauth), sessionManager: { getSessionId: () => "s1" } };
    const first = { model: luna.id, instructions: "stable", input: [user("task")], store: false };
    adapter.adapt(first, ctx);
    const later = { ...first, input: [user("task"), ...turns(12), user("returned")] };
    const sent = adapter.adapt(later, ctx);
    assert.equal(marked(sent), expected, `oauth=${oauth}`);
    if (oauth) assert.equal(sent, later, "the payload is Pi's own object");
  }
});

test("effort history leaves Sign in with ChatGPT requests unchanged; API keys are still adapted", async () => {
  for (const [oauth, adapted] of [
    [true, false],
    [false, true],
  ]) {
    const manager = SessionManager.inMemory("/tmp/openai-sign-in-fixture");
    const pi = { appendEntry: (type, data) => manager.appendCustomEntry(type, data) };
    const ctx = { model: luna, modelRegistry: registry(oauth), sessionManager: manager };
    const adapter = new OpenAIEffortAdapter(pi);
    const request = (input, effort) => ({
      model: luna.id,
      store: false,
      input,
      instructions: "stable",
      reasoning: { effort, summary: "auto" },
      tools: [],
    });
    const history = [{ role: "user", content: "one" }];
    await adapter.adapt(request(history, "low"), ctx);
    history.push({ role: "assistant", content: "one" }, { role: "user", content: "two" });
    const high = request(history, "high");
    const sent = await adapter.adapt(high, ctx);
    assert.equal(
      sent.input.some((item) => item.type === "configuration_update"),
      adapted,
      `oauth=${oauth}`,
    );
    if (!adapted) {
      assert.equal(sent, high);
      assert.equal(manager.getEntries().length, 0, "nothing is recorded for the sign-in route");
    }
  }
});
