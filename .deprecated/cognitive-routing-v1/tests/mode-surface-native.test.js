import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import freeflowExtension from "../../dist/index.js";

const SWITCH_TOOL = "freeflow_switch_profile";

function sseResponse(events) {
  const body = `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`;
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function textResponse(id, text) {
  const item = {
    type: "message",
    id: `message-${id}`,
    role: "assistant",
    status: "completed",
    phase: "final_answer",
    content: [{ type: "output_text", text, annotations: [] }],
  };
  return sseResponse([
    { type: "response.created", response: { id: `response-${id}`, status: "in_progress", output: [] } },
    { type: "response.output_item.added", output_index: 0, item: { ...item, content: [] } },
    { type: "response.output_text.delta", output_index: 0, content_index: 0, delta: text },
    { type: "response.output_item.done", output_index: 0, item },
    {
      type: "response.completed",
      response: {
        id: `response-${id}`,
        status: "completed",
        output: [item],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      },
    },
  ]);
}

function requestTool(body) {
  return (body.tools ?? []).find((tool) => tool?.name === SWITCH_TOOL || tool?.function?.name === SWITCH_TOOL);
}

function requestExposesProjection(body) {
  const tool = requestTool(body);
  const parameters = tool?.parameters ?? tool?.function?.parameters;
  return Boolean(parameters?.properties?.projection);
}

function definitionExposesProjection(session) {
  const definition = session.getToolDefinition(SWITCH_TOOL);
  return Boolean(definition?.parameters?.properties?.projection);
}

async function writeConfig(cwd, contextProjection) {
  await writeFile(
    join(cwd, ".freeflow", "config.json"),
    JSON.stringify({
      cognitiveRouting: {
        enabled: true,
        contextProjection,
        sessionStart: { profile: "reasoning" },
        profiles: {
          standard: { provider: "openai", model: "gpt-4", thinkingLevel: "off" },
          reasoning: { provider: "openai", model: "gpt-4o", thinkingLevel: "off" },
        },
      },
    }),
  );
}

test("native switch schema follows projection mode across prompts and reload", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-native-mode-cwd-"));
  const agentDir = await mkdtemp(join(tmpdir(), "freeflow-native-mode-agent-"));
  const sessionDir = await mkdtemp(join(tmpdir(), "freeflow-native-mode-session-"));
  const originalFetch = globalThis.fetch;
  const originalOffline = process.env.PI_OFFLINE;
  const requests = [];
  const contexts = [];
  let session;

  process.env.PI_OFFLINE = "1";
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init.body));
    requests.push({ body, exposesProjection: requestExposesProjection(body) });
    return textResponse(`mode-${requests.length}`, "The mode surface probe completed.");
  };

  try {
    await mkdir(join(cwd, ".freeflow"), { recursive: true });
    await writeConfig(cwd, false);
    const modelsPath = join(agentDir, "models.json");
    await writeFile(
      modelsPath,
      `${JSON.stringify({ providers: { openai: { baseUrl: "https://api.openai.com/v1" } } })}\n`,
    );
    const modelRuntime = await ModelRuntime.create({
      authPath: join(agentDir, "auth.json"),
      modelsPath,
      modelsStorePath: join(agentDir, "models-store.json"),
      allowModelNetwork: false,
      refreshOnCreate: false,
    });
    await modelRuntime.setRuntimeApiKey("openai", "offline-test-key");
    const selectedModel = modelRuntime.getModel("openai", "gpt-4o");
    assert.ok(selectedModel);

    const settingsManager = SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: false, maxRetries: 0, provider: { maxRetries: 0 } },
    });
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
      extensionFactories: [
        freeflowExtension,
        (pi) => {
          pi.on("context", (event) => contexts.push(structuredClone(event.messages)));
        },
      ],
    });
    await resourceLoader.reload();

    const manager = SessionManager.create(cwd, sessionDir);
    session = (
      await createAgentSession({
        cwd,
        agentDir,
        model: selectedModel,
        thinkingLevel: "off",
        modelRuntime,
        settingsManager,
        sessionManager: manager,
        resourceLoader,
      })
    ).session;
    const extensionErrors = [];
    try {
      await session.bindExtensions({
        mode: "print",
        commandContextActions: { waitForIdle: () => session.waitForIdle() },
        onError: (error) => extensionErrors.push(error),
      });

      await session.prompt("probe disabled projection");
      await session.waitForIdle();
      assert.equal(requests.at(-1).exposesProjection, false);
      assert.equal(definitionExposesProjection(session), false);
      assert.equal(session.getActiveToolNames().includes(SWITCH_TOOL), true);
      assert.match(
        contexts.at(-1).find((message) => message?.customType === "freeflow-runtime-state")?.content ?? "",
        /Projection: `disabled`/,
      );

      const staleDefinition = session.getToolDefinition(SWITCH_TOOL);
      assert.ok(staleDefinition);
      const staleResult = await staleDefinition.execute(
        "stale-projection-call",
        { target: "reasoning", reason: "Stale projection payload.", projection: { include: [], shared: [] } },
        undefined,
        undefined,
        session.extensionRunner.createContext(),
      );
      assert.equal(staleResult.details.result.status, "blocked");
      assert.equal(staleResult.details.result.reason, "projection_unavailable");

      await writeConfig(cwd, true);
      await session.prompt("probe enabled projection");
      await session.waitForIdle();
      assert.equal(requests.at(-1).exposesProjection, true);
      assert.equal(definitionExposesProjection(session), true);
      assert.match(
        contexts.at(-1).find((message) => message?.customType === "freeflow-runtime-state")?.content ?? "",
        /Projection: `enabled`/,
      );

      await writeConfig(cwd, false);
      await session.prompt("probe disabled projection again");
      await session.waitForIdle();
      assert.equal(requests.at(-1).exposesProjection, false);
      assert.equal(definitionExposesProjection(session), false);
      assert.match(
        contexts.at(-1).find((message) => message?.customType === "freeflow-runtime-state")?.content ?? "",
        /Projection: `disabled`/,
      );

      await writeConfig(cwd, true);
      await session.reload();
      assert.equal(definitionExposesProjection(session), true);
      await session.prompt("probe enabled projection after reload");
      await session.waitForIdle();
      assert.equal(requests.at(-1).exposesProjection, true);

      await writeConfig(cwd, false);
      await session.reload();
      assert.equal(definitionExposesProjection(session), false);
      await session.prompt("probe disabled projection after reload");
      await session.waitForIdle();
      assert.equal(requests.at(-1).exposesProjection, false);
      assert.equal(extensionErrors.length, 0);
    } finally {
      session.dispose();
      session = undefined;
    }
  } finally {
    session?.dispose();
    globalThis.fetch = originalFetch;
    if (originalOffline === undefined) delete process.env.PI_OFFLINE;
    else process.env.PI_OFFLINE = originalOffline;
    await rm(cwd, { recursive: true, force: true });
    await rm(agentDir, { recursive: true, force: true });
    await rm(sessionDir, { recursive: true, force: true });
  }
});
