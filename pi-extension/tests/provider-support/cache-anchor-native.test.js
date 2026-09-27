import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { registerProviderSupport } from "../../dist/provider-support/index.js";
import { response as openaiResponse } from "../fixtures/routing-native.js";

function anthropicResponse(n) {
  const events = [
    [
      "message_start",
      {
        type: "message_start",
        message: {
          id: `msg_${n}`,
          type: "message",
          role: "assistant",
          model: "claude-opus-5-5",
          content: [],
          stop_reason: null,
          usage: { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        },
      },
    ],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "OK" } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } }],
    ["message_stop", { type: "message_stop" }],
  ];
  return new Response(events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join(""), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

const marked = (body) =>
  body.messages.flatMap((m, i) =>
    Array.isArray(m.content) ? m.content.flatMap((b, j) => (b.cache_control ? [`messages[${i}].${j}`] : [])) : [],
  );

test(
  "a real Pi request returning to Claude after another model's turns carries the anchor",
  { timeout: 30000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "cache-anchor-native-")),
      agentDir = join(root, "agent");
    await mkdir(agentDir);
    const previousFetch = globalThis.fetch,
      anthropic = [],
      errors = [];
    let session,
      calls = 0;
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.ok(calls <= 20);
      if (/^https:\/\/api\.anthropic\.com\/v1\/messages/.test(String(url))) {
        anthropic.push(JSON.parse(String(init.body)));
        return anthropicResponse(calls);
      }
      assert.match(String(url), /^https:\/\/api\.openai\.com\/v1\/responses$/);
      return openaiResponse(calls, [], "OK");
    };
    try {
      const runtime = await ModelRuntime.create({
        authPath: join(agentDir, "auth.json"),
        modelsPath: null,
        modelsStorePath: join(agentDir, "models.json"),
        allowModelNetwork: false,
      });
      await runtime.setRuntimeApiKey("anthropic", "fixture-only-key");
      await runtime.setRuntimeApiKey("openai", "fixture-only-key");
      const settings = SettingsManager.inMemory({
        transport: "sse",
        compaction: { enabled: false },
        retry: { enabled: false, maxRetries: 0, provider: { maxRetries: 0 } },
      });
      const loader = new DefaultResourceLoader({
        cwd: root,
        agentDir,
        settingsManager: settings,
        noExtensions: true,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
        systemPrompt: "Reply OK.",
        extensionFactories: [registerProviderSupport],
      });
      await loader.reload();
      assert.deepEqual(loader.getExtensions().errors, []);
      const claude = runtime.getModel("anthropic", "claude-opus-5-5"),
        gpt = runtime.getModel("openai", "gpt-4.1-mini");
      ({ session } = await createAgentSession({
        cwd: root,
        agentDir,
        modelRuntime: runtime,
        model: claude,
        thinkingLevel: "low",
        settingsManager: settings,
        sessionManager: SessionManager.create(root, join(root, "sessions")),
        resourceLoader: loader,
        tools: [],
      }));
      await session.bindExtensions({ mode: "print", onError: (e) => errors.push(e) });
      const prompt = async (text) => {
        await session.prompt(text);
        await session.waitForIdle();
        assert.equal(session.messages.at(-1)?.stopReason, "stop");
        assert.deepEqual(errors, []);
      };
      await prompt("claude first");
      const first = anthropic.at(-1);
      const entry = marked(first).at(-1);
      await session.setModel(gpt);
      for (let i = 0; i < 10; i++) await prompt(`other model ${i}`);
      await session.setModel(claude);
      await prompt("claude again");
      const back = anthropic.at(-1);
      assert.equal(anthropic.length, 2);
      // The earlier final breakpoint is marked again, and the new final breakpoint is kept.
      assert.ok(marked(back).includes(entry), `${entry} not in ${marked(back)}`);
      const latest = back.messages.findLastIndex((m) => m.content?.some?.((b) => b.text === "claude again"));
      assert.equal(marked(back).at(-1), `messages[${latest}].0`);
      const total = JSON.stringify(back).split('"cache_control"').length - 1;
      assert.ok(total <= 4, `${total} breakpoints`);
    } finally {
      session?.dispose();
      globalThis.fetch = previousFetch;
      await rm(root, { recursive: true, force: true });
    }
  },
);
