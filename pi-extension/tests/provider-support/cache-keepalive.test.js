import assert from "node:assert/strict";
import test from "node:test";
import { CacheKeepAlive } from "../../dist/provider-support/cache/keepalive.js";

const HOUR = 3_600_000;
const claude = {
  provider: "anthropic",
  api: "anthropic-messages",
  id: "claude-opus-5-5",
  cost: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  promptCache: { short: 300, long: 3600 },
};
const gpt = {
  provider: "openai-codex",
  api: "openai-codex-responses",
  id: "gpt-6-luna",
  cost: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};
const gptWithLifetime = {
  ...gpt,
  provider: "openai",
  api: "openai-responses",
  promptCache: { short: 600, long: 1800 },
};
const cc = { type: "ephemeral", ttl: "1h" };
const claudePayload = () => ({
  model: claude.id,
  system: [{ type: "text", text: "prompt", cache_control: cc }],
  messages: [{ role: "user", content: [{ type: "text", text: "task", cache_control: cc }] }],
  max_tokens: 64000,
  stream: true,
});
const coordinator = { provider: "anthropic", modelId: "claude-opus-5-5" };

function harness({ hold = coordinator, idle = false, usage, model = claude, ...options } = {}) {
  let now = 0;
  const timers = [],
    sent = [];
  const state = { hold, idle };
  const keepAlive = new CacheKeepAlive({
    now: () => now,
    setTimer: (fn, ms) => {
      const timer = { at: now + ms, fn };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      const i = timers.indexOf(timer);
      if (i >= 0) timers.splice(i, 1);
    },
    send: async (m, payload) => {
      sent.push({ at: now, model: m.id, payload });
      return usage ? usage(payload) : { input: 4, output: 1, cacheRead: 120_000, cacheWrite: 0 };
    },
    ...options,
  });
  keepAlive.setHoldSource(() => state.hold);
  const ctx = (m = model) => ({ model: m, isIdle: () => state.idle, sessionManager: { getSessionId: () => "s1" } });
  const advance = async (ms) => {
    const until = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > until) break;
      timers.shift();
      now = next.at;
      await next.fn();
    }
    now = until;
  };
  return { keepAlive, state, ctx, advance, sent, timers, at: () => now };
}

function coordinatorRequest(h, prompt = 120_000, m = claude, payload = claudePayload()) {
  h.keepAlive.record(payload, h.ctx(m));
  h.keepAlive.observe(h.ctx(m), { input: 4, output: 500, cacheRead: prompt - 4, cacheWrite: 0 });
}

test("the waiting coordinator's last request is replayed with a one-token cap before its cache expires", async () => {
  const h = harness();
  coordinatorRequest(h);
  h.keepAlive.evaluate(h.ctx(gpt)); // the worker's first request: the coordinator is now waiting
  await h.advance(2.5 * HOUR);
  assert.deepEqual(
    h.sent.map((s) => s.at),
    [0.9 * HOUR, 1.8 * HOUR],
  );
  assert.equal(h.sent[0].model, claude.id);
  assert.equal(h.sent[0].payload.max_tokens, 1);
  assert.deepEqual(h.sent[0].payload.messages, claudePayload().messages);
});

test("each refresh is reported with its usage and cost for attribution", async () => {
  const records = [];
  const h = harness({ onRefresh: (record) => records.push(record) });
  coordinatorRequest(h);
  h.keepAlive.evaluate(h.ctx(gpt));
  await h.advance(HOUR);
  assert.equal(records.length, 1);
  assert.deepEqual(
    { provider: records[0].provider, model: records[0].model, cacheRead: records[0].usage.cacheRead },
    { provider: "anthropic", model: "claude-opus-5-5", cacheRead: 120_000 },
  );
  // 120k cache-read tokens at $0.20/M, 4 input at $4/M, 1 output at $20/M.
  assert.ok(Math.abs(records[0].cost - 0.024036) < 1e-9, String(records[0].cost));
  assert.match(h.keepAlive.status(), /claude-opus-5-5.*\$0\.024/);
});

test("warming stops when the worker returns, the run settles, or Freeflow is disabled", async () => {
  for (const release of [(h) => (h.state.hold = undefined), (h) => (h.state.idle = true)]) {
    const h = harness();
    coordinatorRequest(h);
    h.keepAlive.evaluate(h.ctx(gpt));
    release(h);
    await h.advance(2 * HOUR);
    assert.equal(h.sent.length, 0);
  }
  let enabled = true;
  const h = harness({ enabled: () => enabled });
  coordinatorRequest(h);
  h.keepAlive.evaluate(h.ctx(gpt));
  enabled = false;
  await h.advance(2 * HOUR);
  assert.equal(h.sent.length, 0);
});

test("a fresh coordinator request restarts the schedule from its own send time", async () => {
  const h = harness();
  coordinatorRequest(h);
  h.keepAlive.evaluate(h.ctx(gpt));
  await h.advance(0.5 * HOUR);
  coordinatorRequest(h);
  await h.advance(HOUR);
  assert.deepEqual(
    h.sent.map((s) => s.at),
    [1.4 * HOUR],
  );
});

test("models without a declared cache lifetime are never warmed", async () => {
  const h = harness({ hold: { provider: gpt.provider, modelId: gpt.id }, model: gpt });
  h.keepAlive.record({ model: gpt.id, input: [], max_output_tokens: 1000 }, h.ctx(gpt));
  h.keepAlive.observe(h.ctx(gpt), { input: 100_000, output: 10, cacheRead: 0, cacheWrite: 0 });
  h.keepAlive.evaluate(h.ctx(claude));
  await h.advance(3 * HOUR);
  assert.equal(h.sent.length, 0);
});

test("the ChatGPT Codex backend is never replayed, even with a declared lifetime", async () => {
  // Codex rejects max_output_tokens and prompt_cache_options, so a replay could not be capped.
  const codex = { ...gpt, promptCache: { short: 1800, long: 1800 } };
  const h = harness({ hold: { provider: codex.provider, modelId: codex.id }, model: codex });
  h.keepAlive.record({ model: codex.id, input: [], prompt_cache_key: "s1" }, h.ctx(codex));
  h.keepAlive.observe(h.ctx(codex), { input: 4, output: 10, cacheRead: 2_000_000, cacheWrite: 0 });
  h.keepAlive.evaluate(h.ctx(claude));
  await h.advance(3 * HOUR);
  assert.equal(h.sent.length, 0);
});

test("any provider that declares a lifetime and cache prices is warmed through its own output cap", async () => {
  const hold = { provider: gptWithLifetime.provider, modelId: gptWithLifetime.id };
  const h = harness({
    hold,
    model: gptWithLifetime,
    usage: () => ({ input: 4, output: 16, cacheRead: 2_000_000, cacheWrite: 0 }),
  });
  const payload = { model: gpt.id, input: [], prompt_cache_retention: "24h", max_output_tokens: 8000 };
  h.keepAlive.record(payload, h.ctx(gptWithLifetime));
  h.keepAlive.observe(h.ctx(gptWithLifetime), { input: 4, output: 10, cacheRead: 2_000_000, cacheWrite: 0 });
  h.keepAlive.evaluate(h.ctx(claude));
  await h.advance(HOUR);
  // A 30-minute lifetime is refreshed at 90% of it.
  assert.deepEqual(
    h.sent.map((s) => s.at),
    [0.45 * HOUR, 0.9 * HOUR],
  );
  assert.equal(h.sent[0].payload.max_output_tokens, 16);
});

test("small prompts are not worth warming", async () => {
  const h = harness();
  coordinatorRequest(h, 2_000);
  h.keepAlive.evaluate(h.ctx(gpt));
  await h.advance(2 * HOUR);
  assert.equal(h.sent.length, 0);
});

test("a timer that fires after the entry expired does not pay for a rewrite", async () => {
  const h = harness();
  coordinatorRequest(h);
  h.keepAlive.evaluate(h.ctx(gpt));
  // Simulate the machine sleeping through the refresh: the timer runs an hour late.
  h.timers[0].at += HOUR;
  await h.advance(3 * HOUR);
  assert.equal(h.sent.length, 0);
});

test("warming stops when a refresh writes instead of reading", async () => {
  const h = harness({ usage: () => ({ input: 4, output: 1, cacheRead: 0, cacheWrite: 120_000 }) });
  coordinatorRequest(h);
  h.keepAlive.evaluate(h.ctx(gpt));
  await h.advance(4 * HOUR);
  assert.equal(h.sent.length, 1);
});

test("a hold is capped in duration and in spend", async () => {
  const long = harness({ maxHoldMs: 2 * HOUR });
  coordinatorRequest(long);
  long.keepAlive.evaluate(long.ctx(gpt));
  await long.advance(10 * HOUR);
  assert.equal(long.sent.length, 2);
  // Each refresh of 120k tokens costs about $0.024; a $0.05 cap allows two.
  const cheap = harness({ maxHoldCost: 0.05 });
  coordinatorRequest(cheap);
  cheap.keepAlive.evaluate(cheap.ctx(gpt));
  await cheap.advance(10 * HOUR);
  assert.equal(cheap.sent.length, 2);
});
