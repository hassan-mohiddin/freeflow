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
import { CognitiveRoutingProjectionCoordinator } from "../../dist/cognitive-routing/projection-coordinator.js";

const BASELINE_ENTRY = "freeflow-cognitive-routing-baseline";
const SOURCE_ENTRY = "freeflow-cognitive-routing-source";

function sseResponse(events) {
  const body = `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`;
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function textResponse(id, text) {
  const message = {
    type: "message",
    id: `message-${id}`,
    role: "assistant",
    status: "completed",
    phase: "final_answer",
    content: [{ type: "output_text", text, annotations: [] }],
  };
  return sseResponse([
    { type: "response.created", response: { id: `response-${id}`, status: "in_progress", output: [] } },
    { type: "response.output_item.added", output_index: 0, item: { ...message, content: [] } },
    { type: "response.output_text.delta", output_index: 0, content_index: 0, delta: text },
    { type: "response.output_item.done", output_index: 0, item: message },
    {
      type: "response.completed",
      response: {
        id: `response-${id}`,
        status: "completed",
        output: [message],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      },
    },
  ]);
}

async function writeConfig(path, contextProjection, enabled = true) {
  await writeFile(
    path,
    `${JSON.stringify(
      {
        cognitiveRouting: {
          enabled,
          contextProjection,
          profiles: {
            standard: { provider: "openai", model: "gpt-4", thinkingLevel: "off" },
            reasoning: { provider: "openai", model: "gpt-4o", thinkingLevel: "off" },
          },
        },
      },
      null,
      2,
    )}\n`,
  );
}

async function writeOpenAIConfig(path) {
  await writeFile(path, `${JSON.stringify({ providers: { openai: { baseUrl: "https://api.openai.com/v1" } } })}\n`);
}

function messageEntries(manager) {
  return manager.getBranch().filter((entry) => entry.type === "message" && entry.message);
}

test("reconstructs legacy history, labels origins, and survives native reload and off/on", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-projection-activation-cwd-"));
  const agentDir = await mkdtemp(join(tmpdir(), "freeflow-projection-activation-agent-"));
  const sessionDir = await mkdtemp(join(tmpdir(), "freeflow-projection-activation-session-"));
  const originalFetch = globalThis.fetch;
  const originalOffline = process.env.PI_OFFLINE;
  const requests = [];
  const contexts = [];
  const errors = [];
  const failureReasons = [];
  const originalContext = CognitiveRoutingProjectionCoordinator.prototype.context;
  CognitiveRoutingProjectionCoordinator.prototype.context = function observedContext(ctx, messages) {
    const result = originalContext.call(this, ctx, messages);
    const failure = this.failureReason();
    if (failure) failureReasons.push(failure);
    return result;
  };
  let session;
  try {
    process.env.PI_OFFLINE = "1";
    await mkdir(join(cwd, ".freeflow"), { recursive: true });
    const configPath = join(cwd, ".freeflow", "config.json");
    await writeConfig(configPath, true);
    const modelsPath = join(agentDir, "models.json");
    await writeOpenAIConfig(modelsPath);

    const modelRuntime = await ModelRuntime.create({
      authPath: join(agentDir, "auth.json"),
      modelsPath,
      modelsStorePath: join(agentDir, "models-store.json"),
      allowModelNetwork: false,
      refreshOnCreate: false,
    });
    await modelRuntime.setRuntimeApiKey("openai", "offline-test-key");
    const model = modelRuntime.getModel("openai", "gpt-4o");
    assert.ok(model);
    const settingsManager = SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: false, maxRetries: 0, provider: { maxRetries: 0 } },
    });

    const manager = SessionManager.create(cwd, sessionDir);
    const legacyUserId = manager.appendMessage({ role: "user", content: [{ type: "text", text: "Legacy task." }] });
    const legacyAssistantId = manager.appendMessage({
      role: "assistant",
      content: [{ type: "toolCall", id: "legacy-call", name: "read", arguments: { path: "src/legacy.ts" } }],
    });
    const legacyToolId = manager.appendMessage({
      role: "toolResult",
      toolCallId: "legacy-call",
      toolName: "read",
      content: [{ type: "text", text: "LEGACY_TOOL_RESULT" }],
      isError: false,
    });
    const legacyBefore = new Map(
      messageEntries(manager)
        .filter((entry) => [legacyUserId, legacyAssistantId, legacyToolId].includes(entry.id))
        .map((entry) => [entry.id, structuredClone(entry.message)]),
    );

    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init.body));
      requests.push(body);
      return textResponse(`activation-${requests.length}`, `Activation response ${requests.length}`);
    };

    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
      extensionFactories: [
        freeflowExtension,
        (pi) => {
          pi.on("context", (event, ctx) =>
            contexts.push({
              messages: structuredClone(event.messages),
              aborted: ctx?.signal?.aborted === true,
              baseline: manager
                .getBranch()
                .some((entry) => entry.type === "custom" && entry.customType === BASELINE_ENTRY),
            }),
          );
        },
      ],
    });
    await resourceLoader.reload();
    const created = await createAgentSession({
      cwd,
      agentDir,
      model,
      thinkingLevel: "off",
      modelRuntime,
      settingsManager,
      sessionManager: manager,
      resourceLoader,
    });
    session = created.session;
    const unsubscribe = session.extensionRunner.onError((error) => errors.push(String(error?.error ?? error)));
    await session.bindExtensions({ mode: "print" });

    await session.prompt("continue the legacy session");
    const firstContext = JSON.stringify(contexts.at(-1)?.messages);
    assert.match(firstContext, /LEGACY_TOOL_RESULT/);
    assert.match(firstContext, /\[routing-origin: unknown;/);
    assert.equal(contexts[0].baseline, true, "baseline must be persisted before the first provider context");
    assert.equal(contexts.at(-1).aborted, false);
    assert.ok(manager.getBranch().some((entry) => entry.type === "custom" && entry.customType === BASELINE_ENTRY));
    assert.ok(manager.getBranch().some((entry) => entry.type === "custom" && entry.customType === SOURCE_ENTRY));

    await session.reload();
    await session.prompt("continue after native reload");
    assert.equal(contexts.at(-1).aborted, false);
    assert.match(JSON.stringify(contexts.at(-1).messages), /LEGACY_TOOL_RESULT/);
    assert.match(JSON.stringify(contexts.at(-1).messages), /\[routing-origin: unknown;/);

    await writeConfig(configPath, false);
    await session.reload();
    await session.prompt("continue while projection is disabled");
    assert.equal(contexts.at(-1).aborted, false);
    assert.match(JSON.stringify(contexts.at(-1).messages), /\[routing-origin:/);

    await writeConfig(configPath, true);
    await session.reload();
    await session.prompt("continue after projection is re-enabled");
    assert.equal(contexts.at(-1).aborted, false);
    assert.match(JSON.stringify(contexts.at(-1).messages), /LEGACY_TOOL_RESULT/);
    assert.equal(errors.length, 0);
    assert.equal(requests.length, 4);

    const baselineCountBeforeLateHistory = manager
      .getBranch()
      .filter((entry) => entry.type === "custom" && entry.customType === BASELINE_ENTRY).length;
    await writeConfig(configPath, true, false);
    await session.reload();
    await session.prompt("continue while Cognitive Routing is disabled");
    assert.equal(contexts.at(-1).aborted, false);
    assert.equal(requests.length, 5);
    await writeConfig(configPath, true, true);
    await session.reload();
    await session.prompt("continue after later unattributed history");
    assert.equal(requests.length, 5, "later unattributed history must abort before transport");
    assert.equal(contexts.at(-1).aborted, true);
    assert.ok(failureReasons.includes("source_not_found:assistant"));
    assert.equal(
      manager.getBranch().filter((entry) => entry.type === "custom" && entry.customType === BASELINE_ENTRY).length,
      baselineCountBeforeLateHistory,
    );

    for (const [entryId, beforeMessage] of legacyBefore) {
      const after = messageEntries(manager).find((entry) => entry.id === entryId);
      assert.ok(after);
      assert.deepEqual(after.message, beforeMessage, `legacy canonical entry ${entryId} changed`);
    }
    unsubscribe();
  } finally {
    session?.dispose();
    CognitiveRoutingProjectionCoordinator.prototype.context = originalContext;
    globalThis.fetch = originalFetch;
    if (originalOffline === undefined) delete process.env.PI_OFFLINE;
    else process.env.PI_OFFLINE = originalOffline;
    await rm(cwd, { recursive: true, force: true });
    await rm(agentDir, { recursive: true, force: true });
    await rm(sessionDir, { recursive: true, force: true });
  }
});
