import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import freeflow from "../../dist/index.js";
import { response } from "../fixtures/routing-native.js";

test(
  "native Freeflow settings retain the exact prefix; archive and restore change only real evidence",
  { timeout: 30000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "freeflow-settings-cache-")),
      agentDir = join(root, "agent");
    await mkdir(agentDir);
    await mkdir(join(root, ".freeflow"));
    const config = join(root, ".freeflow/config.json");
    await writeFile(config, JSON.stringify({ enabled: true }));
    await writeFile(join(root, "evidence.txt"), "PRIVATE_RAW_EVIDENCE_716");
    let session, action, ref;
    const requests = [],
      errors = [],
      prior = globalThis.fetch;
    const manager = SessionManager.create(root, join(root, "sessions"));
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), "https://api.openai.com/v1/responses");
      const body = JSON.parse(String(init.body));
      requests.push(body);
      assert.ok(requests.length <= 20);
      let calls = [];
      if (action === "read") {
        action = undefined;
        calls = [{ name: "read", args: { path: "evidence.txt" } }];
      }
      if (action === "archive") {
        action = undefined;
        calls = [
          {
            name: "freeflow_context",
            args: { operation: "archive", targets: [{ ref, retained: "The completed evidence was checked." }] },
          },
        ];
      }
      if (action === "restore") {
        action = undefined;
        calls = [{ name: "freeflow_context", args: { operation: "restore", refs: [ref] } }];
      }
      if (action === "denied") {
        action = undefined;
        calls = [
          { name: "freeflow_context", args: { operation: "search", query: "private" } },
          { name: "freeflow_delegate", args: { operation: "assign", contract: "Must not execute" } },
        ];
      }
      return response(requests.length, calls, "OK");
    };
    try {
      const runtime = await ModelRuntime.create({
        authPath: join(agentDir, "auth.json"),
        modelsPath: null,
        modelsStorePath: join(agentDir, "models.json"),
        allowModelNetwork: false,
      });
      await runtime.setRuntimeApiKey("openai", "fixture-key");
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
        systemPrompt: "Synthetic fixture.",
        extensionFactories: [freeflow],
      });
      await loader.reload();
      ({ session } = await createAgentSession({
        cwd: root,
        agentDir,
        modelRuntime: runtime,
        model: runtime.getModel("openai", "gpt-6-astra"),
        thinkingLevel: "high",
        settingsManager: settings,
        sessionManager: manager,
        resourceLoader: loader,
      }));
      await session.bindExtensions({ mode: "print", onError: (e) => errors.push(e) });
      const prompt = async () => {
        await session.prompt("Continue the synthetic fixture.");
        await session.waitForIdle();
        assert.equal(session.messages.at(-1).stopReason, "stop");
        assert.deepEqual(errors, []);
        return requests.at(-1);
      };
      action = "read";
      await prompt();
      const read = manager.getBranch().find((e) => e.message?.toolName === "read");
      ref = "ctx:" + read.id;
      const original = JSON.stringify(read);
      let previous = requests.at(-1);
      const stable = async () => {
        const body = await prompt();
        assert.deepEqual(body.tools, previous.tools);
        assert.deepEqual(body.input.slice(0, previous.input.length), previous.input);
        previous = body;
      };
      await session.prompt("/freeflow disable");
      await stable();
      action = "denied";
      await stable();
      assert.ok(
        manager
          .getBranch()
          .filter((e) => ["freeflow_context", "freeflow_delegate"].includes(e.message?.toolName))
          .every((e) => e.message.isError),
      );
      assert.ok(!manager.getBranch().some((e) => e.customType === "freeflow-routing-v2"));
      await session.prompt("/freeflow enable");
      await stable();
      await writeFile(config, JSON.stringify({ enabled: true, conversationHistory: true }));
      await session.reload();
      await stable();
      await writeFile(
        config,
        JSON.stringify({ enabled: true, conversationHistory: true, contextVirtualization: true }),
      );
      await session.reload();
      await stable();
      await writeFile(join(root, ".freeflow/local.json"), JSON.stringify({ enabled: true }));
      await session.reload();
      await stable();
      const routing = {
        enabled: true,
        projection: false,
        profiles: {
          coordinator: { provider: "openai", model: "gpt-6-astra", thinking: "high" },
          executor: { provider: "openai", model: "gpt-6-astra", thinking: "low" },
        },
      };
      await writeFile(
        config,
        JSON.stringify({
          enabled: true,
          conversationHistory: true,
          contextVirtualization: true,
          cognitiveRouting: routing,
        }),
      );
      await session.reload();
      await stable();
      await session.prompt("/freeflow profile executor");
      await stable();
      await session.prompt("/freeflow profile auto");
      await stable();
      routing.profiles.executor.thinking = "medium";
      await writeFile(
        config,
        JSON.stringify({
          enabled: true,
          conversationHistory: true,
          contextVirtualization: true,
          cognitiveRouting: routing,
        }),
      );
      await session.reload();
      await stable();
      routing.projection = true;
      await writeFile(config, JSON.stringify({ enabled: true, cognitiveRouting: routing }));
      await session.reload();
      await stable();
      routing.projection = false;
      await writeFile(
        config,
        JSON.stringify({
          enabled: true,
          conversationHistory: true,
          contextVirtualization: true,
          cognitiveRouting: routing,
        }),
      );
      await session.reload();
      await stable();
      action = "archive";
      const archived = await prompt();
      assert.ok(!JSON.stringify(archived).includes("PRIVATE_RAW_EVIDENCE_716"));
      assert.deepEqual(archived.tools, previous.tools);
      action = "restore";
      const restored = await prompt();
      assert.ok(JSON.stringify(restored).includes("PRIVATE_RAW_EVIDENCE_716"));
      assert.deepEqual(restored.tools, previous.tools);
      assert.equal(JSON.stringify(manager.getEntry(read.id)), original, "canonical evidence untouched");
    } finally {
      session?.dispose();
      globalThis.fetch = prior;
      await rm(root, { recursive: true, force: true });
    }
  },
);
