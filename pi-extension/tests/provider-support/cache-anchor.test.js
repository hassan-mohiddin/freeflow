import assert from "node:assert/strict";
import test from "node:test";
import { CacheAnchorAdapter, planAnchor } from "../../dist/provider-support/cache/index.js";

const anthropic = { provider: "anthropic", api: "anthropic-messages", id: "claude-opus-5-5" };
const ctxFor = (model = anthropic, session = "s1") => ({ model, sessionManager: { getSessionId: () => session } });
const cc = { type: "ephemeral", ttl: "1h" };
const tools = () =>
  ["read", "edit", "bash"].map((name, i, all) => ({
    name,
    description: name,
    input_schema: { type: "object" },
    ...(i === all.length - 1 ? { cache_control: cc } : {}),
  }));
const oauthSystem = () => [
  { type: "text", text: "You are Claude Code, Anthropic's official CLI for Claude.", cache_control: cc },
  { type: "text", text: "Pi system prompt", cache_control: cc },
];
const user = (text) => ({ role: "user", content: [{ type: "text", text }] });
const call = (id) => ({
  role: "assistant",
  content: [
    { type: "thinking", thinking: "", signature: "sig" },
    { type: "tool_use", id, name: "read", input: { path: id } },
  ],
});
const result = (id) => ({ role: "user", content: [{ type: "tool_result", tool_use_id: id, content: `body ${id}` }] });
// One worker turn as the coordinator view renders it: narration, a call, a result, and a provenance note.
const workerTurn = (id) => [
  {
    role: "assistant",
    content: [
      { type: "text", text: `**Reading ${id}**` },
      { type: "text", text: `**Checking ${id}**` },
      { type: "tool_use", id, name: "read", input: { path: id } },
    ],
  },
  result(id),
  user(`Source provenance for ${id}`),
];
function request(messages, { system = oauthSystem() } = {}) {
  const copy = structuredClone(messages);
  const last = copy.at(-1).content.at(-1);
  last.cache_control = cc;
  return { model: anthropic.id, tools: tools(), system, messages: copy, max_tokens: 1000, stream: true };
}
function breakpoints(payload) {
  const found = [];
  payload.tools?.forEach((t, i) => t.cache_control && found.push(`tools[${i}]`));
  payload.system?.forEach((b, i) => b.cache_control && found.push(`system[${i}]`));
  payload.messages.forEach(
    (m, i) =>
      Array.isArray(m.content) && m.content.forEach((b, j) => b.cache_control && found.push(`messages[${i}].${j}`)),
  );
  return found;
}
const coordinator = [user("task"), call("a"), result("a"), user("delegate")];
const afterWorker = (turns) => [
  ...coordinator,
  ...Array.from({ length: turns }, (_, i) => workerTurn(`w${i}`)).flat(),
  user("returned"),
];

test("a request that continues within the lookback window is sent unchanged", () => {
  const adapter = new CacheAnchorAdapter();
  adapter.adapt(request(coordinator), ctxFor());
  const next = request([...coordinator, call("b"), result("b")]);
  assert.equal(adapter.adapt(next, ctxFor()), next);
});

test("a request whose previous cache entry fell out of the lookback window is anchored there", () => {
  const adapter = new CacheAnchorAdapter();
  adapter.adapt(request(coordinator), ctxFor());
  const returned = request(afterWorker(8));
  const sent = adapter.adapt(returned, ctxFor());
  // The redundant tools breakpoint moves to where the previous request's final entry was written.
  assert.deepEqual(breakpoints(sent), [
    "system[0]",
    "system[1]",
    "messages[3].0",
    `messages[${sent.messages.length - 1}].0`,
  ]);
  assert.deepEqual(sent.messages[3].content[0].cache_control, cc);
  // The original payload object is not modified.
  assert.deepEqual(breakpoints(returned), [
    "tools[2]",
    "system[0]",
    "system[1]",
    `messages[${returned.messages.length - 1}].0`,
  ]);
});

test("a request with a free breakpoint slot keeps every existing breakpoint", () => {
  const adapter = new CacheAnchorAdapter();
  const apiKeySystem = [{ type: "text", text: "Pi system prompt", cache_control: cc }];
  adapter.adapt(request(coordinator, { system: apiKeySystem }), ctxFor());
  const sent = adapter.adapt(request(afterWorker(8), { system: apiKeySystem }), ctxFor());
  assert.deepEqual(breakpoints(sent), [
    "tools[2]",
    "system[0]",
    "messages[3].0",
    `messages[${sent.messages.length - 1}].0`,
  ]);
});

test("a changed earlier prefix is not anchored because no cache entry can match it", () => {
  const adapter = new CacheAnchorAdapter();
  adapter.adapt(request(coordinator), ctxFor());
  const changed = afterWorker(8);
  changed[0] = user("rewritten task");
  const next = request(changed);
  assert.equal(adapter.adapt(next, ctxFor()), next);
});

test("the anchor targets the requester's own earlier entry when another view used the model in between", () => {
  const adapter = new CacheAnchorAdapter();
  adapter.adapt(request(coordinator), ctxFor());
  // A worker on the same model shares only the first message with the coordinator's view.
  adapter.adapt(request([user("task"), user("worker brief"), call("x"), result("x")]), ctxFor());
  const sent = adapter.adapt(request(afterWorker(8)), ctxFor());
  assert.ok(breakpoints(sent).includes("messages[3].0"));
});

test("parallel tool calls count as one lookback position", () => {
  const adapter = new CacheAnchorAdapter();
  adapter.adapt(request(coordinator), ctxFor());
  const ids = Array.from({ length: 30 }, (_, i) => `p${i}`);
  const parallel = [
    ...coordinator,
    { role: "assistant", content: ids.map((id) => ({ type: "tool_use", id, name: "read", input: { path: id } })) },
    { role: "user", content: ids.map((id) => ({ type: "tool_result", tool_use_id: id, content: id })) },
    user("next"),
  ];
  const next = request(parallel);
  assert.equal(adapter.adapt(next, ctxFor()), next);
});

test("requests are remembered per session", () => {
  const adapter = new CacheAnchorAdapter();
  adapter.adapt(request(coordinator), ctxFor(anthropic, "one"));
  const next = request(afterWorker(8));
  assert.equal(adapter.adapt(next, ctxFor(anthropic, "two")), next);
});

test("requests for APIs without an explicit-breakpoint adapter, and disabled Freeflow, are untouched", () => {
  const openai = { provider: "openai", api: "openai-responses", id: "gpt-6-luna" };
  const adapter = new CacheAnchorAdapter();
  const responses = { model: openai.id, input: [{ role: "user", content: "task" }], prompt_cache_key: "s1" };
  assert.equal(adapter.adapt(responses, ctxFor(openai)), responses);
  const disabled = new CacheAnchorAdapter(() => false);
  disabled.adapt(request(coordinator), ctxFor());
  const next = request(afterWorker(8));
  assert.equal(disabled.adapt(next, ctxFor()), next);
});

test("the planner works on provider-neutral layouts", () => {
  const chain = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
  const limits = { maxBreakpoints: 4, lookback: 20, margin: 5 };
  const prior = { chain: chain("x", 12), breakpoints: [0, 1, 2, 11], yieldable: [0, 1] };
  const current = { chain: chain("x", 40), breakpoints: [0, 1, 2, 39], yieldable: [0, 1] };
  assert.deepEqual(planAnchor([prior], current, limits), { add: 11, remove: 0 });
  // Within lookback minus margin: the existing final breakpoint already reaches the entry.
  assert.equal(
    planAnchor([prior], { ...current, chain: chain("x", 26), breakpoints: [0, 1, 2, 25] }, limits),
    undefined,
  );
  // A free slot adds without removing.
  assert.deepEqual(planAnchor([prior], { ...current, breakpoints: [1, 2, 39] }, limits), { add: 11 });
  // Nothing to give up and no free slot: leave the request alone.
  assert.equal(planAnchor([prior], { ...current, yieldable: [] }, limits), undefined);
  // Divergence before the prior entry: nothing can match.
  const diverged = { ...current, chain: [...chain("x", 5), ...chain("y", 35)] };
  assert.equal(planAnchor([prior], diverged, limits), undefined);
});
