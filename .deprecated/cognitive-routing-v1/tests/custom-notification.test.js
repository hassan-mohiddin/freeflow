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

function sseResponse(events) {
  const body = `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`;
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function functionCallResponse(id, name, args, text) {
  const argumentsText = JSON.stringify(args);
  const message = {
    type: "message",
    id: `message-${id}`,
    role: "assistant",
    status: "completed",
    phase: "commentary",
    content: [{ type: "output_text", text, annotations: [] }],
  };
  const item = { type: "function_call", id: `fc_${id}`, call_id: id, name, arguments: argumentsText };
  return sseResponse([
    { type: "response.created", response: { id: `response-${id}`, status: "in_progress", output: [] } },
    { type: "response.output_item.added", output_index: 0, item: { ...message, content: [] } },
    { type: "response.output_text.delta", output_index: 0, content_index: 0, delta: text },
    { type: "response.output_item.done", output_index: 0, item: message },
    { type: "response.output_item.added", output_index: 1, item: { ...item, arguments: "" } },
    { type: "response.function_call_arguments.delta", output_index: 1, delta: argumentsText },
    { type: "response.function_call_arguments.done", output_index: 1, arguments: argumentsText },
    { type: "response.output_item.done", output_index: 1, item },
    {
      type: "response.completed",
      response: {
        id: `response-${id}`,
        status: "completed",
        output: [message, item],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      },
    },
  ]);
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

async function writeOpenAIConfig(path) {
  await writeFile(path, `${JSON.stringify({ providers: { openai: { baseUrl: "https://api.openai.com/v1" } } })}\n`);
}

function messageEntries(manager) {
  return manager.getBranch().filter((entry) => entry.type === "message" && entry.message);
}

function customNotificationEntries(manager) {
  return manager.getBranch().filter((entry) => entry.type === "custom_message");
}

test("retains registered custom notifications through projection and native lifecycle boundaries", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-custom-notification-cwd-"));
  const agentDir = await mkdtemp(join(tmpdir(), "freeflow-custom-notification-agent-"));
  const sessionDir = await mkdtemp(join(tmpdir(), "freeflow-custom-notification-session-"));
  const originalFetch = globalThis.fetch;
  const originalOffline = process.env.PI_OFFLINE;
  const requests = [];
  const contexts = [];
  const extensionErrors = [];
  let notificationsSent = 0;
  let keepNotificationId;
  let branchPointId;
  let transformNotifications = false;
  let session;

  process.env.PI_OFFLINE = "1";
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init.body));
    requests.push(body);
    const index = requests.length - 1;
    if (index === 0) {
      return functionCallResponse(
        "switch-to-standard",
        "freeflow_switch_profile",
        { target: "standard", reason: "Use Standard for bounded evidence." },
        "Reasoning delegates the bounded evidence step.",
      );
    }
    if (index === 1) return textResponse("standard-finished", "Standard completed the bounded evidence step.");
    if (index === 2) {
      return functionCallResponse(
        "switch-to-reasoning",
        "freeflow_switch_profile",
        { target: "reasoning", reason: "Return after processing the notification." },
        "Standard returns after processing the notification.",
      );
    }
    if (index === 3) return textResponse("reasoning-first", "Reasoning processed the first notification.");
    return textResponse(`follow-up-${index}`, "Reasoning retained the canonical notification context.");
  };

  try {
    await mkdir(join(cwd, ".freeflow"), { recursive: true });
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({
        cognitiveRouting: {
          enabled: true,
          contextProjection: true,
          profiles: {
            standard: { provider: "openai", model: "gpt-4", thinkingLevel: "off" },
            reasoning: { provider: "openai", model: "gpt-4o", thinkingLevel: "off" },
          },
        },
      }),
    );
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
    const selectedModel = modelRuntime.getModel("openai", "gpt-4o");
    assert.ok(selectedModel);

    const settingsManager = SettingsManager.inMemory({
      compaction: { enabled: true, keepRecentTokens: 1, reserveTokens: 1 },
      retry: { enabled: false, maxRetries: 0, provider: { maxRetries: 0 } },
    });
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
      extensionFactories: [
        (pi) => {
          pi.on("context", (event) => {
            if (!transformNotifications) return undefined;
            return {
              messages: event.messages.map((message) =>
                message?.role === "custom" && message.customType === "subagent-notification"
                  ? { ...message, details: { ...message.details, transformed: true } }
                  : message,
              ),
            };
          });
        },
        freeflowExtension,
        (pi) => {
          pi.on("agent_end", (_event, ctx) => {
            if (notificationsSent >= 2) return;
            if (notificationsSent === 1) branchPointId = ctx?.sessionManager?.getLeafId?.();
            notificationsSent += 1;
            const notificationId = `notification-${notificationsSent}`;
            pi.sendMessage(
              {
                customType: "subagent-notification",
                content: [{ type: "text", text: `NOTIFICATION_${notificationsSent}` }],
                display: true,
                details: { notificationId, source: "registered-fixture" },
              },
              { deliverAs: "followUp", triggerTurn: true },
            );
          });
          pi.on("context", (event) => contexts.push(structuredClone(event.messages)));
          pi.on("session_before_compact", () =>
            keepNotificationId
              ? {
                  compaction: {
                    summary: "The preceding notification context was retained.",
                    firstKeptEntryId: keepNotificationId,
                    tokensBefore: 1,
                  },
                }
              : undefined,
          );
        },
      ],
    });
    await resourceLoader.reload();

    const manager = SessionManager.create(cwd, sessionDir);
    const created = await createAgentSession({
      cwd,
      agentDir,
      model: selectedModel,
      thinkingLevel: "off",
      modelRuntime,
      settingsManager,
      sessionManager: manager,
      resourceLoader,
    });
    session = created.session;
    const unsubscribeErrors = session.extensionRunner.onError((error) => extensionErrors.push(error));
    try {
      await session.bindExtensions({ mode: "print" });
      await session.prompt("start the notification compatibility case");
      await session.waitForIdle();
      assert.equal(notificationsSent, 2);
      assert.ok(branchPointId);

      const notifications = customNotificationEntries(manager);
      assert.equal(notifications.length, 2);
      assert.deepEqual(
        notifications.map((entry) => ({
          type: entry.type,
          customType: entry.customType,
          content: entry.content,
          display: entry.display,
          details: entry.details,
        })),
        [
          {
            type: "custom_message",
            customType: "subagent-notification",
            content: [{ type: "text", text: "NOTIFICATION_1" }],
            display: true,
            details: { notificationId: "notification-1", source: "registered-fixture" },
          },
          {
            type: "custom_message",
            customType: "subagent-notification",
            content: [{ type: "text", text: "NOTIFICATION_2" }],
            display: true,
            details: { notificationId: "notification-2", source: "registered-fixture" },
          },
        ],
      );
      keepNotificationId = notifications[0].id;

      const firstNotificationStandard = requests.findIndex(
        (body) => body.model === "gpt-4" && JSON.stringify(body.input).includes("NOTIFICATION_1"),
      );
      const firstNotificationReasoning = requests.findIndex(
        (body) => body.model === "gpt-4o" && JSON.stringify(body.input).includes("NOTIFICATION_1"),
      );
      assert.ok(firstNotificationStandard >= 0);
      assert.ok(firstNotificationReasoning > firstNotificationStandard);
      assert.ok(requests.some((body) => JSON.stringify(body.input).includes("NOTIFICATION_2")));
      assert.ok(
        contexts.some(
          (context) =>
            context.some((message) => message?.role === "custom" && message.customType === "subagent-notification") &&
            context.some((message) => message?.role === "toolResult" && message.toolName === "freeflow_switch_profile"),
        ),
      );
      const customContextMessages = contexts
        .flat()
        .filter((message) => message?.role === "custom" && message.customType === "subagent-notification");
      assert.ok(customContextMessages.length > 0);
      assert.ok(customContextMessages.every((message) => !JSON.stringify(message).includes("projection-ref")));
      assert.ok(customContextMessages.every((message) => !JSON.stringify(message).includes("routing-origin")));
      const sourceRecords = manager
        .getBranch()
        .filter((entry) => entry.type === "custom" && entry.customType === "freeflow-cognitive-routing-source");
      assert.equal(
        sourceRecords.some((entry) => JSON.stringify(entry.data).includes("notification-")),
        false,
      );

      const canonicalBeforeCompaction = new Map(
        messageEntries(manager).map((entry) => [entry.id, structuredClone(entry.message)]),
      );
      const canonicalCustomBefore = notifications.map((entry) => structuredClone(entry));
      const compactionResult = await session.compact("retain notification context");
      assert.notEqual(compactionResult?.cancelled, true);
      assert.ok(manager.buildContextEntries().some((entry) => entry.id === keepNotificationId));
      await session.prompt("continue after notification compaction");
      await session.waitForIdle();
      assert.match(JSON.stringify(requests.at(-1).input), /NOTIFICATION_1/);

      await session.reload();
      await session.prompt("continue after notification reload");
      await session.waitForIdle();
      assert.match(JSON.stringify(requests.at(-1).input), /NOTIFICATION_1/);

      await session.navigateTree(branchPointId, { summarize: false });
      await session.prompt("continue on the pre-second-notification branch");
      await session.waitForIdle();
      assert.match(JSON.stringify(requests.at(-1).input), /NOTIFICATION_1/);
      assert.doesNotMatch(JSON.stringify(requests.at(-1).input), /NOTIFICATION_2/);

      const requestsBeforeTransform = requests.length;
      transformNotifications = true;
      await session.prompt("reject transformed notification context");
      await session.waitForIdle();
      assert.equal(requests.length, requestsBeforeTransform);
      assert.ok(extensionErrors.length === 0);

      const currentNotifications = manager.getEntries().filter((entry) => entry.type === "custom_message");
      assert.deepEqual(currentNotifications.slice(0, 2), canonicalCustomBefore);
      for (const [entryId, beforeMessage] of canonicalBeforeCompaction) {
        const afterEntry = manager.getEntries().find((entry) => entry.id === entryId);
        assert.ok(afterEntry, `canonical message ${entryId} remains present`);
        assert.deepEqual(afterEntry.message, beforeMessage, `canonical message ${entryId} remains unchanged`);
      }
      assert.equal(extensionErrors.length, 0);
    } finally {
      unsubscribeErrors();
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
