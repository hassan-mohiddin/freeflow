import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { AstraAdapter, requestKey } from "../../dist/provider-support/astra/adapter.js";
import { ENTRY_TYPE, assemble } from "../../dist/provider-support/astra/history.js";

const model = {
  id: "gpt-6-astra",
  provider: "openai-codex",
  api: "openai-codex-responses",
  baseUrl: "https://chatgpt.com/backend-api",
};
const u = (text) => ({ role: "user", content: text });
const a = (text) => ({ role: "assistant", content: text });
const request = (input, effort = "low") => ({
  model: model.id,
  store: false,
  input,
  instructions: "stable",
  reasoning: { effort, summary: "auto" },
  prompt_cache_key: "unchanged-key",
  tools: [],
});
function fixture(manager = SessionManager.inMemory("/tmp/astra-fixture")) {
  const status = [];
  const pi = { appendEntry: (type, data) => manager.appendCustomEntry(type, data) };
  const ctx = { model, sessionManager: manager, ui: { setStatus: (...args) => status.push(args) } };
  return { pi, ctx, manager, status, adapter: new AstraAdapter(pi) };
}
const updates = (p) =>
  p.input.flatMap((item, index) =>
    item.type === "configuration_update" ? [{ index, effort: item.reasoning.effort }] : [],
  );

test("native ancestry records replay Low High Low with original anchors and unchanged selected effort", async () => {
  const f = fixture(),
    h = [u("one")];
  await f.adapter.adapt(request(h), f.ctx);
  h.push(a("one"), u("two"));
  const high = await f.adapter.adapt(request(h, "high"), f.ctx);
  assert.equal(high.reasoning.effort, "low");
  assert.deepEqual(updates(high), [{ index: 2, effort: "high" }]);
  h.push(a("two"), u("three"));
  const low = await new AstraAdapter(f.pi).adapt(request(h), f.ctx);
  assert.deepEqual(low.input.slice(0, high.input.length), high.input);
  assert.deepEqual(updates(low), [
    { index: 2, effort: "high" },
    { index: 5, effort: "low" },
  ]);
  const count = f.manager.getEntries().length;
  assert.deepEqual(await f.adapter.adapt(request(h), f.ctx), low);
  assert.equal(f.manager.getEntries().length, count, "retry writes no duplicate record");
  assert.equal(low.prompt_cache_key, "unchanged-key");
  assert.ok(f.manager.getEntries().every((e) => !JSON.stringify(e.data).includes('"content"')));
});

test("first High is baseline; tool-loop switch occurs after completed results, not before an old user", async () => {
  const f = fixture(),
    h = [u("one")];
  await f.adapter.adapt(request(h, "high"), f.ctx);
  h.push(
    { type: "reasoning", encrypted_content: "opaque-signed-value", summary: [] },
    { type: "function_call", call_id: "call_1", name: "read", arguments: "{}" },
    { type: "function_call_output", call_id: "call_1", output: "body" },
  );
  const p = await f.adapter.adapt(request(h, "low"), f.ctx);
  assert.equal(p.reasoning.effort, "high");
  assert.deepEqual(updates(p), [{ index: 4, effort: "low" }]);
  assert.deepEqual(p.input.slice(0, 4), h);
});

test("changed/omitted/expanded input safely rebases; restored compatible branch recovers its own updates", async () => {
  const f = fixture();
  const h = [u("source")];
  await f.adapter.adapt(request(h), f.ctx);
  h.push(a("one"), u("two"));
  const high = await f.adapter.adapt(request(h, "high"), f.ctx);
  const changed = [u("different")];
  const p = await f.adapter.adapt(request(changed, "high"), f.ctx);
  assert.equal(p.reasoning.effort, "low");
  assert.deepEqual(updates(p), [{ index: 0, effort: "high" }]);
  const restored = await f.adapter.adapt(request([...h, a("two"), u("three")], "high"), f.ctx);
  assert.deepEqual(restored.input.slice(0, high.input.length), high.input);
});

test("same payload effort toggles never manufacture adjacent updates; fallback retains desired effort", async () => {
  const f = fixture(),
    h = [u("one")];
  await f.adapter.adapt(request(h), f.ctx);
  const high = await f.adapter.adapt(request(h, "high"), f.ctx);
  assert.deepEqual(updates(high), [{ index: 1, effort: "high" }]);
  const original = request(h, "low");
  assert.equal(await f.adapter.adapt(original, f.ctx), original);
  assert.equal(original.reasoning.effort, "low");
  assert.deepEqual(updates(original), []);
});

test("unsupported requests and existing native updates pass through without persistence", async () => {
  const f = fixture();
  for (const change of [
    (p) => (p.model = "gpt-5.6-luna"),
    (p) => (p.previous_response_id = "resp_x"),
    (p) => (p.conversation = "c"),
    (p) => (p.context_management = []),
    (p) => (p.truncation = "auto"),
    (p) => (p.reasoning.mode = "pro"),
    (p) => p.input.push({ type: "configuration_update", reasoning: { effort: "high" } }),
    (p) => (p.reasoning.effort = "off"),
    (p) => (p.store = true),
  ]) {
    const p = request([u("one")]);
    change(p);
    assert.equal(await f.adapter.adapt(p, f.ctx), p);
  }
  assert.equal(requestKey(request([]), { ...model, provider: "proxy" }), undefined);
  assert.equal(requestKey(request([]), { ...model, baseUrl: "https://example.com" }), undefined);
  assert.ok(
    requestKey(request([]), {
      ...model,
      provider: "openai",
      api: "openai-responses",
      baseUrl: "https://api.openai.com/v1",
    }),
  );
  assert.equal(f.manager.getEntries().length, 0);
});

test("append failure before or after mutation keeps original request and latches fallback", async () => {
  for (const after of [false, true]) {
    const f = fixture();
    await f.adapter.adapt(request([u("one")]), f.ctx);
    const real = f.pi.appendEntry;
    f.pi.appendEntry = (...args) => {
      if (after) real(...args);
      throw Error("disk fault");
    };
    const original = request([u("one"), a("one"), u("two")], "high");
    assert.equal(await f.adapter.adapt(original, f.ctx), original);
    f.pi.appendEntry = real;
    assert.equal(await f.adapter.adapt(original, f.ctx), original);
    assert.ok(f.status.some((x) => x[1]?.includes("native effort")));
  }
});

test("corrupt effective-effort metadata cannot silently pin the wrong effort", async () => {
  const f = fixture();
  await f.adapter.adapt(request([u("one")]), f.ctx);
  f.manager.getEntries().find((e) => e.customType === ENTRY_TYPE).data.effective = "high";
  const original = request([u("one"), a("one"), u("two")], "high");
  assert.equal(await f.adapter.adapt(original, f.ctx), original);
});

test("selected ancestry, new sessions, model changes and compaction isolate effort histories", async () => {
  const f = fixture();
  f.manager.appendModelChange(model.provider, model.id);
  await f.adapter.adapt(request([u("one")]), f.ctx);
  const baseLeaf = f.manager.getLeafId();
  await f.adapter.adapt(request([u("one"), a("one"), u("two")], "high"), f.ctx);
  f.manager.branch(baseLeaf);
  const branch = await f.adapter.adapt(request([u("one"), a("other"), u("sibling")], "medium"), f.ctx);
  assert.deepEqual(updates(branch), [{ index: 2, effort: "medium" }]);
  f.manager.appendModelChange("openai-codex", "gpt-5.6-luna");
  f.manager.appendModelChange(model.provider, model.id);
  const reset = await f.adapter.adapt(request([u("new")], "high"), f.ctx);
  assert.equal(reset.reasoning.effort, "low");
  assert.deepEqual(updates(reset), [{ index: 0, effort: "high" }]);
  assert.deepEqual(
    reset.input.filter((x) => x.type !== "configuration_update"),
    [u("new")],
  );
  f.adapter.setCompacting(true);
  const summary = request([u("summary")], "low");
  assert.equal(await f.adapter.adapt(summary, f.ctx), summary);
  f.adapter.setCompacting(false);
  const other = fixture();
  assert.equal((await f.adapter.adapt(request([u("new")], "medium"), other.ctx)).reasoning.effort, "medium");
});

test("persisted labeled fork and reload preserve an anchored effort transition", async () => {
  const root = await mkdtemp(join(tmpdir(), "astra-persist-"));
  try {
    const manager = SessionManager.create(root, root),
      f = fixture(manager);
    manager.appendMessage({ role: "user", content: "one", timestamp: 1 });
    await f.adapter.adapt(request([u("one")]), f.ctx);
    manager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "one" }],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: {
        input: 1,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 2,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: 2,
    });
    manager.appendLabelChange(manager.getLeafId(), "before effort change");
    const h = [u("one"), a("one"), u("two")];
    const high = await f.adapter.adapt(request(h, "high"), f.ctx);
    assert.ok((await readFile(manager.getSessionFile(), "utf8")).includes(ENTRY_TYPE));
    const forkFile = manager.createBranchedSession(manager.getLeafId());
    assert.ok(forkFile, "native fork file created");
    const reloaded = fixture(SessionManager.open(forkFile));
    const p = await reloaded.adapter.adapt(request([...h, a("two"), u("three")], "low"), reloaded.ctx);
    assert.deepEqual(p.input.slice(0, high.input.length), high.input);
    assert.equal(p.reasoning.effort, "low");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("queued request from a replaced session passes through without a native append", async () => {
  const f = fixture(),
    p = request([u("old")], "high");
  const pending = f.adapter.adapt(p, f.ctx);
  f.adapter.reset();
  assert.equal(await pending, p);
  assert.equal(f.manager.getEntries().length, 0);
});

for (const returnEffort of ["high", "low"]) {
  test(`model round trip preserves original Low anchor through ${returnEffort} return and reload`, async () => {
    const f = fixture();
    f.manager.appendModelChange(model.provider, model.id);
    const h = [u("start")];
    await f.adapter.adapt(request(h, "high"), f.ctx);
    h.push(a("first"), u("low"));
    const low = await f.adapter.adapt(request(h), f.ctx);
    f.manager.appendModelChange(model.provider, "gpt-5.6-luna");
    const luna = request(h);
    luna.model = "gpt-5.6-luna";
    assert.equal(await f.adapter.adapt(luna, { ...f.ctx, model: { ...model, id: luna.model } }), luna);
    f.manager.appendModelChange(model.provider, model.id);
    h.push(a("second"), u("return"));
    const resumed = await new AstraAdapter(f.pi).adapt(request(h, returnEffort), f.ctx);
    assert.equal(resumed.reasoning.effort, "high");
    assert.deepEqual(resumed.input.slice(0, low.input.length), low.input);
    h.push(a("third"), u("low again"));
    const again = await f.adapter.adapt(request(h), f.ctx);
    assert.deepEqual(again.input.slice(0, resumed.input.length), resumed.input);
    assert.equal(updates(again)[0].index, 2);
  });
}

test("legacy model-generation records survive a round trip without rewriting persisted metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "astra-legacy-"));
  try {
    const f = fixture(SessionManager.create(root, root));
    f.manager.appendMessage({ role: "user", content: "legacy", timestamp: 1 });
    f.manager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "legacy" }],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: {
        input: 1,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 2,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: 2,
    });
    const oldGeneration = f.manager.appendModelChange(model.provider, model.id);
    const key = requestKey(request([]), model);
    const h = [u("legacy")];
    const first = assemble(request(h, "high"), key, oldGeneration, f.manager.getLeafId(), []);
    f.manager.appendCustomEntry(ENTRY_TYPE, first.record);
    h.push(a("one"), u("two"));
    const second = assemble(request(h), key, oldGeneration, f.manager.getLeafId(), [first.record]);
    f.manager.appendCustomEntry(ENTRY_TYPE, second.record);
    const saved = JSON.stringify(f.manager.getEntries());
    f.manager.appendModelChange(model.provider, "gpt-5.6-luna");
    f.manager.appendModelChange(model.provider, model.id);
    const loaded = fixture(SessionManager.open(f.manager.getSessionFile()));
    const resumed = await loaded.adapter.adapt(request([...h, a("two"), u("three")]), loaded.ctx);
    assert.equal(resumed.reasoning.effort, "high");
    assert.deepEqual(resumed.input.slice(0, second.payload.input.length), second.payload.input);
    assert.equal(JSON.stringify(f.manager.getEntries().slice(0, JSON.parse(saved).length)), saved);
    const again = fixture(SessionManager.open(loaded.manager.getSessionFile()));
    const reloaded = await again.adapter.adapt(request([...h, a("two"), u("three"), a("three"), u("four")]), again.ctx);
    assert.deepEqual(reloaded.input.slice(0, resumed.input.length), resumed.input);
    assert.equal(JSON.stringify(again.manager.getEntries().slice(0, JSON.parse(saved).length)), saved);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("session reset clears adapter status without changing the next requested effort", async () => {
  const f = fixture();
  await f.adapter.adapt(request([u("one")]), f.ctx);
  f.adapter.reset(f.ctx);
  assert.deepEqual(f.status.at(-1), ["freeflow-astra-effort", undefined]);
});
