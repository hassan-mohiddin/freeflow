import assert from "node:assert/strict";
import test from "node:test";
import { CacheHealth } from "../../dist/efficiency/cache-health.js";

const MIN = 60_000;
function feeder() {
  const health = new CacheHealth();
  let at = 0,
    prompt = 50_000;
  const send = (reused, { model = "gpt-6-luna", thinking = "max", gap = 10_000 } = {}) => {
    at += gap;
    const cacheRead = Math.round(prompt * reused);
    const warning = health.observe({
      provider: "openai-codex",
      model,
      thinking,
      at,
      input: prompt + 500 - cacheRead,
      cacheRead,
    });
    prompt += 500;
    return warning;
  };
  return { health, send };
}

test("healthy back-to-back requests raise no warning", () => {
  const { health, send } = feeder();
  for (let i = 0; i < 30; i++) assert.equal(send(0.98), undefined);
  assert.deepEqual(health.status(), []);
});

test("repeated unexplained misses warn once, with the model and re-read volume", () => {
  const { health, send } = feeder();
  const warnings = [];
  for (let i = 0; i < 12; i++) {
    const warning = send(i % 2 ? 0 : 0.98);
    if (warning) warnings.push(warning);
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /gpt-6-luna/);
  assert.match(warnings[0], /re-read/);
  assert.equal(health.status().length, 1);
});

test("misses after compaction, navigation, model changes, or idle gaps are not counted", () => {
  const { health, send } = feeder();
  for (let i = 0; i < 12; i++) {
    send(0.98);
    health.noteBreak();
    assert.equal(send(0), undefined);
  }
  for (let i = 0; i < 12; i++) assert.equal(send(0, { gap: 6 * MIN }), undefined);
  for (let i = 0; i < 12; i++) assert.equal(send(0, { thinking: i % 2 ? "low" : "max" }), undefined);
  assert.deepEqual(health.status(), []);
});

test("recovery clears the warning so a later regression is reported again", () => {
  const { health, send } = feeder();
  const warnings = [];
  const run = (reuse, n) => {
    for (let i = 0; i < n; i++) {
      const warning = send(reuse(i));
      if (warning) warnings.push(warning);
    }
  };
  run((i) => (i % 2 ? 0 : 0.98), 12);
  run(() => 0.98, 10);
  assert.deepEqual(health.status(), []);
  run((i) => (i % 2 ? 0 : 0.98), 12);
  assert.equal(warnings.length, 2);
});

function responseWithUsage(n, input, cached) {
  const item = {
    type: "message",
    id: `msg-${n}`,
    role: "assistant",
    status: "completed",
    content: [{ type: "output_text", text: "ok", annotations: [] }],
  };
  const usage = {
    input_tokens: input,
    input_tokens_details: { cached_tokens: cached },
    output_tokens: 5,
    total_tokens: input + 5,
  };
  const events = [
    { type: "response.created", response: { id: `r-${n}`, status: "in_progress", output: [] } },
    { type: "response.output_item.added", output_index: 0, item: { ...item, content: [] } },
    { type: "response.output_text.delta", output_index: 0, content_index: 0, delta: "ok" },
    { type: "response.output_item.done", output_index: 0, item },
    { type: "response.completed", response: { id: `r-${n}`, status: "completed", output: [item], usage } },
  ];
  return new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n", {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

for (const [label, cachedShare, expected] of [
  ["a session whose prompt cache keeps missing gets one warning", 0, 1],
  ["a healthy session gets none", 0.97, 0],
]) {
  test(label, { timeout: 30000 }, async () => {
    const { fixture } = await import("../fixtures/routing-native.js");
    await fixture(
      () => [],
      false,
      async ({ session, notices }) => {
        for (let i = 0; i < 10; i++) {
          await session.prompt(`message ${i}`);
          await session.waitForIdle();
        }
        const warnings = notices.filter(([text]) => /prompt cache for/.test(String(text)));
        assert.equal(warnings.length, expected);
      },
      true,
      {
        maxRequests: 20,
        response: (n) => responseWithUsage(n, 60_000, Math.round(60_000 * cachedShare)),
        cognitiveRouting: { enabled: false },
      },
    );
  });
}
