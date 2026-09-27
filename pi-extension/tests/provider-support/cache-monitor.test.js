import assert from "node:assert/strict";
import test from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { registerProviderSupport } from "../../dist/provider-support/index.js";
import { CacheMonitor } from "../../dist/efficiency/cache-monitor.js";
import { RequestHistory } from "../../dist/runtime/request-history.js";

const claude = {
  provider: "anthropic",
  api: "anthropic-messages",
  id: "claude-opus-5-5",
  cost: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  promptCache: { short: 300, long: 3600 },
};
const gpt = { provider: "openai-codex", api: "openai-codex-responses", id: "gpt-6-luna" };

function host() {
  const handlers = new Map(),
    footer = [];
  const pi = {
    on: (event, handler) => handlers.set(event, [...(handlers.get(event) ?? []), handler]),
    appendEntry() {},
  };
  const ctx = (model) => ({
    model,
    isIdle: () => false,
    sessionManager: { getSessionId: () => "s1" },
    ui: { setStatus: (...args) => footer.push(args) },
  });
  const emit = async (event, payload, context) => {
    let result;
    for (const handler of handlers.get(event) ?? []) result = await handler(payload, context);
    return result;
  };
  return { pi, ctx, emit, footer };
}

test("cache diagnostics go to the monitor, never to the footer", async () => {
  const h = host(),
    monitor = new CacheMonitor();
  const support = registerProviderSupport(h.pi, undefined, monitor);
  support.keepAlive.setHoldSource(() => ({ provider: "anthropic", modelId: "claude-opus-5-5" }));
  const payload = {
    model: claude.id,
    system: [{ type: "text", text: "prompt", cache_control: { type: "ephemeral", ttl: "1h" } }],
    messages: [{ role: "user", content: [{ type: "text", text: "task" }] }],
  };
  await h.emit("before_provider_request", { payload }, h.ctx(claude));
  await h.emit(
    "message_end",
    {
      message: {
        role: "assistant",
        provider: "anthropic",
        model: claude.id,
        usage: { input: 4, output: 1, cacheRead: 120_000, cacheWrite: 0 },
      },
    },
    h.ctx(claude),
  );
  // The worker's first request: the Coordinator is now held warm.
  await h.emit("before_provider_request", { payload: { model: gpt.id, input: [] } }, h.ctx(gpt));
  assert.match(monitor.lines().join("\n"), /Keeping claude-opus-5-5 cache warm/);
  support.keepAlive.reset();

  const manager = SessionManager.inMemory("/tmp/cache-monitor");
  const history = new RequestHistory(
    {
      appendEntry: () => {
        throw new Error("disk");
      },
    },
    monitor,
  );
  const ctx = { sessionManager: manager, ui: { setStatus: (...args) => h.footer.push(args) } };
  const messages = [{ role: "user", content: [{ type: "text", text: "one" }], timestamp: 1 }];
  assert.equal(await history.assemble(messages, "ordinary", ctx), messages);
  assert.match(monitor.lines().join("\n"), /context replay unavailable/);
  assert.deepEqual(h.footer, [], "no footer writes");
});
