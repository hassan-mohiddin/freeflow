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

async function runBranchSummaryCase(transformNotification) {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-branch-summary-cwd-"));
  const agentDir = await mkdtemp(join(tmpdir(), "freeflow-branch-summary-agent-"));
  const sessionDir = await mkdtemp(join(tmpdir(), "freeflow-branch-summary-session-"));
  const originalFetch = globalThis.fetch;
  const originalOffline = process.env.PI_OFFLINE;
  const requests = [];
  const contexts = [];
  const extensionErrors = [];
  let producer;
  let notificationPending = false;
  let notificationResolve;
  let notificationDone;
  let notificationSent = false;
  let notificationTimedOut = false;
  let notificationAgentEnds = 0;
  let summarySignalAborted = false;
  let session;

  process.env.PI_OFFLINE = "1";
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init.body));
    const inputText = JSON.stringify(body.input);
    requests.push({ body, signal: init.signal });
    if (inputText.includes("Create a structured summary")) {
      if (!notificationSent) {
        notificationSent = true;
        notificationPending = true;
        notificationDone = new Promise((resolve) => {
          notificationResolve = resolve;
        });
        producer.sendMessage(
          {
            customType: "subagent-notification",
            content: [{ type: "text", text: "NOTIFICATION_DURING_BRANCH_SUMMARY" }],
            display: true,
            details: { notificationId: "branch-summary-notification", source: "registered-fixture" },
          },
          { deliverAs: "followUp", triggerTurn: true },
        );
      }
      let notificationTimer;
      const notificationTimeout = new Promise((resolve) => {
        notificationTimer = setTimeout(() => {
          notificationTimedOut = true;
          resolve();
        }, 5000);
      });
      await Promise.race([notificationDone, notificationTimeout]);
      clearTimeout(notificationTimer);
      summarySignalAborted = init.signal?.aborted === true;
      return textResponse("branch-summary", "The abandoned branch was summarized.");
    }
    return textResponse(`request-${requests.length}`, "The notification-triggered turn completed.");
  };

  try {
    await mkdir(join(cwd, ".freeflow"), { recursive: true });
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({
        cognitiveRouting: {
          enabled: true,
          contextProjection: true,
          sessionStart: { profile: "reasoning" },
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
      compaction: { enabled: false, keepRecentTokens: 1, reserveTokens: 1 },
      retry: { enabled: false, maxRetries: 0, provider: { maxRetries: 0 } },
    });
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
      extensionFactories: [
        (pi) => {
          pi.on("context", (event) => {
            if (!transformNotification) return undefined;
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
          producer = pi;
          pi.on("agent_end", () => {
            notificationAgentEnds += 1;
            if (!notificationPending) return;
            notificationPending = false;
            notificationResolve?.();
          });
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
    const unsubscribeErrors = session.extensionRunner.onError((error) => extensionErrors.push(error));
    try {
      await session.bindExtensions({ mode: "print" });
      await session.prompt("create content to summarize on a different branch");
      await session.waitForIdle();

      const userEntry = manager
        .getBranch()
        .findLast((entry) => entry.type === "message" && entry.message?.role === "user");
      assert.ok(userEntry);
      const navigation = await session.navigateTree(userEntry.id, { summarize: true });
      await session.waitForIdle();

      const summaryEntries = manager.getEntries().filter((entry) => entry.type === "branch_summary");
      const diagnosticEntries = manager
        .getEntries()
        .filter((entry) => entry.type === "custom" && entry.customType === "freeflow-cognitive-routing-diagnostic");
      return {
        navigation,
        summaryEntries,
        diagnosticEntries,
        summarySignalAborted,
        notificationTimedOut,
        notificationAgentEnds,
        notificationRequests: requests.filter((request) =>
          JSON.stringify(request.body.input).includes("NOTIFICATION_DURING_BRANCH_SUMMARY"),
        ),
        contexts,
        extensionErrors,
      };
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
}

test("notification-triggered projection rejection cancels an in-progress branch summary", async () => {
  const result = await runBranchSummaryCase(true);
  assert.equal(result.navigation.cancelled, true);
  assert.equal(result.navigation.aborted, true);
  assert.equal(result.summarySignalAborted, true);
  assert.equal(result.notificationTimedOut, false);
  assert.equal(result.summaryEntries.length, 0);
  assert.equal(result.notificationRequests.length, 0);
  assert.ok(result.diagnosticEntries.some((entry) => entry.data?.code === "source_not_found:custom"));
  assert.equal(result.extensionErrors.length, 0);
});

test("canonical notification retention lets branch summary finish", async () => {
  const result = await runBranchSummaryCase(false);
  assert.equal(result.navigation.cancelled, false);
  assert.equal(result.navigation.aborted, undefined);
  assert.equal(result.summarySignalAborted, false);
  assert.equal(result.notificationTimedOut, false);
  assert.equal(result.summaryEntries.length, 1);
  assert.equal(result.notificationRequests.length, 1);
  assert.equal(result.diagnosticEntries.length, 0);
  assert.equal(result.extensionErrors.length, 0);
  assert.ok(
    result.contexts.some((context) =>
      context.some((message) => message?.role === "custom" && message.customType === "subagent-notification"),
    ),
  );
});
