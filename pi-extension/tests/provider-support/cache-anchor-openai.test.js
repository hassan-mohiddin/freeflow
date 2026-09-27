import assert from "node:assert/strict";
import test from "node:test";
import { CacheAnchorAdapter } from "../../dist/provider-support/cache/index.js";

// GPT-5.6+ on the Responses API: implicit breakpoint at the latest eligible message, and lookup
// through at most 20 earlier eligible message endings plus explicit breakpoints.
const gpt = {
  provider: "openai",
  api: "openai-responses",
  id: "gpt-6-luna",
  compat: { supportsExplicitPromptCacheMode: true },
};
const ctxFor = (model = gpt) => ({ model, sessionManager: { getSessionId: () => "s1" } });
const user = (text) => ({ role: "user", content: [{ type: "input_text", text }] });
const call = (id) => ({ type: "function_call", call_id: id, name: "read", arguments: "{}" });
const output = (id) => ({ type: "function_call_output", call_id: id, output: `body ${id}` });
const narration = (text) => ({
  type: "message",
  role: "assistant",
  status: "completed",
  content: [{ type: "output_text", text }],
});
const request = (input) => ({ model: gpt.id, instructions: "stable", input: structuredClone(input), store: false });
const marked = (payload) =>
  payload.input.flatMap((item, i) =>
    Array.isArray(item.content)
      ? item.content.flatMap((b, j) => (b.prompt_cache_breakpoint ? [`input[${i}].${j}`] : []))
      : [],
  );
const coordinator = [user("task"), call("a"), output("a"), user("delegate")];
// Each worker exchange adds two eligible endings: a tool output group and a provenance note.
const afterWorker = (turns) => [
  ...coordinator,
  ...Array.from({ length: turns }, (_, i) => [
    narration(`step ${i}`),
    call(`w${i}`),
    output(`w${i}`),
    user(`note ${i}`),
  ]).flat(),
  user("returned"),
];

test("a GPT request whose previous endpoint is past 20 message endings gets an explicit breakpoint there", () => {
  const adapter = new CacheAnchorAdapter();
  adapter.adapt(request(coordinator), ctxFor());
  const returned = request(afterWorker(10));
  const sent = adapter.adapt(returned, ctxFor());
  assert.deepEqual(marked(sent), ["input[3].0"]);
  assert.deepEqual(sent.input[3].content[0].prompt_cache_breakpoint, { mode: "explicit" });
  assert.deepEqual(marked(returned), [], "the host payload is not modified");
});

test("a GPT request within 20 message endings is sent unchanged", () => {
  const adapter = new CacheAnchorAdapter();
  adapter.adapt(request(coordinator), ctxFor());
  const next = request(afterWorker(3));
  assert.equal(adapter.adapt(next, ctxFor()), next);
});

test("GPT routes without documented explicit breakpoints are untouched", () => {
  for (const model of [
    { ...gpt, compat: {} },
    { ...gpt, provider: "openai-codex", api: "openai-codex-responses" },
  ]) {
    const adapter = new CacheAnchorAdapter();
    adapter.adapt(request(coordinator), ctxFor(model));
    const next = request(afterWorker(10));
    assert.equal(adapter.adapt(next, ctxFor(model)), next);
  }
});

test("an endpoint that ends on a tool output group cannot be marked and is left alone", () => {
  const adapter = new CacheAnchorAdapter();
  const ending = [user("task"), call("a"), output("a")];
  adapter.adapt(request(ending), ctxFor());
  const next = request([
    ...ending,
    ...Array.from({ length: 12 }, (_, i) => [call(`w${i}`), output(`w${i}`), user(`note ${i}`)]).flat(),
  ]);
  assert.equal(adapter.adapt(next, ctxFor()), next);
});
