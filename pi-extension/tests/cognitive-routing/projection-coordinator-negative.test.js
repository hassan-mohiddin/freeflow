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

const SOURCE_ENTRY = "freeflow-cognitive-routing-source";
const PROJECTION_ENTRY = "freeflow-cognitive-routing-projection";
const CAPTURE_TOOL = "capture_evidence";

function sseResponse(events) {
  const body = `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`;
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
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
  const item = {
    type: "function_call",
    id: `fc_${id}`,
    call_id: id,
    name,
    arguments: argumentsText,
  };
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

function messageEntries(sessionManager) {
  return sessionManager.getBranch().filter((entry) => entry.type === "message" && entry.message);
}

function exposedRefFor(observedContexts, marker) {
  const context = observedContexts.at(-1) ?? [];
  const source = context.find(
    (message) =>
      message?.role === "toolResult" && message.content?.some((part) => part?.type === "text" && part.text === marker),
  );
  assert.ok(source, `Standard must see an exposed tool result for ${marker}`);
  const match = JSON.stringify(source).match(/\[projection-ref: (ctx:[^\]]+)\]/);
  assert.ok(match, `Standard must see an exposed ref for ${marker}`);
  return match[1];
}

async function runProjectionMode(mode) {
  const cwd = await mkdtemp(join(tmpdir(), `freeflow-projection-negative-${mode}-cwd-`));
  const agentDir = await mkdtemp(join(tmpdir(), `freeflow-projection-negative-${mode}-agent-`));
  const originalFetch = globalThis.fetch;
  const originalOffline = process.env.PI_OFFLINE;
  const requests = [];
  const observedContexts = [];
  const extensionErrors = [];
  let session;
  let sessionManager;
  let requestIndex = 0;
  let contextAbortStates = [];
  let faultCount = 0;
  let canonicalBeforeProjection;

  process.env.PI_OFFLINE = "1";
  globalThis.fetch = async (url, init) => {
    const parsedUrl = new URL(String(url));
    assert.equal(parsedUrl.hostname, "api.openai.com");
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init.body));
    requests.push(body);

    if (requestIndex === 0) {
      requestIndex += 1;
      return functionCallResponse(
        "switch-to-standard",
        "freeflow_switch_profile",
        { target: "standard", reason: "Use Standard for bounded evidence collection." },
        "Reasoning delegates the bounded evidence collection.",
      );
    }
    if (requestIndex === 1) {
      requestIndex += 1;
      return functionCallResponse(
        "capture-selected",
        CAPTURE_TOOL,
        { label: "selected" },
        "Standard captures selected evidence.",
      );
    }
    if (requestIndex === 2) {
      requestIndex += 1;
      return functionCallResponse(
        "capture-omitted",
        CAPTURE_TOOL,
        { label: "omitted" },
        "Standard captures omitted evidence.",
      );
    }
    if (requestIndex === 3) {
      requestIndex += 1;
      return textResponse("standard-follow-up", "Standard completed the follow-up.");
    }
    if (requestIndex === 4) {
      canonicalBeforeProjection = new Map(
        messageEntries(sessionManager).map((entry) => [entry.id, structuredClone(entry.message)]),
      );
      const selectedRef =
        mode === "invalid" || mode === "default-off"
          ? "ctx:missing"
          : exposedRefFor(observedContexts, "CAPTURED_SELECTED");
      const projection =
        mode === "invalid"
          ? { include: [selectedRef] }
          : mode === "empty"
            ? { include: [] }
            : mode === "omitted" || mode === "default-off"
              ? undefined
              : mode === "shared-only"
                ? { shared: [selectedRef] }
                : { include: [selectedRef] };
      requestIndex += 1;
      return functionCallResponse(
        "switch-to-reasoning",
        "freeflow_switch_profile",
        {
          target: "reasoning",
          reason: "The bounded evidence is ready for assessment.",
          ...(projection === undefined ? {} : { projection }),
        },
        "Standard returns evidence for assessment.",
      );
    }
    requestIndex += 1;
    return textResponse(
      "final-response",
      mode === "invalid" ? "The selection stayed on Standard." : "Reasoning received the returned context.",
    );
  };

  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({
        cognitiveRouting: {
          enabled: true,
          contextProjection: mode !== "default-off",
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
      compaction: { enabled: false },
      retry: { enabled: false, maxRetries: 0, provider: { maxRetries: 0 } },
    });
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
      extensionFactories: [
        ...(mode === "recorded-failure"
          ? [
              (pi) => {
                pi.on("turn_start", () => {
                  if (requestIndex < 5 || faultCount > 0) return;
                  faultCount += 1;
                  pi.appendEntry(PROJECTION_ENTRY, {
                    version: 1,
                    kind: "selection",
                    status: "corrupt",
                    sessionId: "malformed-session",
                  });
                });
              },
            ]
          : []),
        ...(mode === "context-mutation"
          ? [
              (pi) => {
                pi.on("context", (event) => {
                  if (requestIndex < 5 || !JSON.stringify(event.messages).includes("CAPTURED_SELECTED")) {
                    return undefined;
                  }
                  return {
                    messages: event.messages.map((message) =>
                      message?.role === "toolResult" && JSON.stringify(message.content).includes("CAPTURED_SELECTED")
                        ? { ...message, content: [{ type: "text", text: "MUTATED_SELECTED" }] }
                        : message,
                    ),
                  };
                });
              },
            ]
          : []),
        freeflowExtension,
        (pi) => {
          pi.registerTool({
            name: CAPTURE_TOOL,
            label: "Capture evidence",
            description: "Return one deterministic evidence result.",
            parameters: {
              type: "object",
              additionalProperties: false,
              properties: { label: { type: "string" } },
              required: ["label"],
            },
            async execute(_toolCallId, params) {
              return {
                content: [{ type: "text", text: `CAPTURED_${String(params.label).toUpperCase()}` }],
                details: {},
              };
            },
          });
          pi.on("context", (event, ctx) => {
            observedContexts.push(structuredClone(event.messages));
            contextAbortStates.push(ctx.signal?.aborted === true);
          });
        },
      ],
    });
    await resourceLoader.reload();

    sessionManager = SessionManager.inMemory(cwd);
    const created = await createAgentSession({
      cwd,
      agentDir,
      model: selectedModel,
      thinkingLevel: "off",
      modelRuntime,
      settingsManager,
      sessionManager,
      resourceLoader,
    });
    session = created.session;
    const unsubscribeErrors = session.extensionRunner.onError((error) => extensionErrors.push(error));
    try {
      await session.bindExtensions({ mode: "print" });
      await session.prompt("start the projection negative case");
      await session.prompt("return the captured evidence");
    } finally {
      unsubscribeErrors();
      session.dispose();
      session = undefined;
    }

    return {
      requests,
      observedContexts,
      contextAbortStates,
      faultCount,
      canonicalBeforeProjection,
      extensionErrors,
      entries: sessionManager.getBranch(),
      sourceRecords: sessionManager
        .getBranch()
        .filter((entry) => entry.type === "custom" && entry.customType === SOURCE_ENTRY),
      projectionRecords: sessionManager
        .getBranch()
        .filter((entry) => entry.type === "custom" && entry.customType === PROJECTION_ENTRY),
    };
  } finally {
    session?.dispose();
    globalThis.fetch = originalFetch;
    if (originalOffline === undefined) delete process.env.PI_OFFLINE;
    else process.env.PI_OFFLINE = originalOffline;
    await rm(cwd, { recursive: true, force: true });
    await rm(agentDir, { recursive: true, force: true });
  }
}

function latestAssistant(result) {
  return [...result.entries].reverse().find((entry) => entry.type === "message" && entry.message?.role === "assistant")
    ?.message;
}

test("omitted and empty projection selections preserve the handoff without Standard bodies", async () => {
  for (const mode of ["omitted", "empty"]) {
    const result = await runProjectionMode(mode);
    assert.deepEqual(
      result.requests.map((body) => body.model),
      ["gpt-4o", "gpt-4", "gpt-4", "gpt-4", "gpt-4", "gpt-4o"],
    );
    const finalInput = JSON.stringify(result.requests[5].input);
    assert.doesNotMatch(finalInput, /CAPTURED_SELECTED/);
    assert.doesNotMatch(finalInput, /CAPTURED_OMITTED/);
    assert.match(finalInput, /freeflow_switch_profile/);
    assert.equal(latestAssistant(result).content[0].text, "Reasoning received the returned context.");
    assert.equal(result.extensionErrors.length, 0);
  }
});

test("rejects a mixed valid and invalid selection without a Reasoning request", async () => {
  const result = await runProjectionMode("invalid");
  assert.deepEqual(
    result.requests.map((body) => body.model),
    ["gpt-4o", "gpt-4", "gpt-4", "gpt-4", "gpt-4", "gpt-4"],
  );
  assert.equal(result.projectionRecords.length, 0);
  assert.equal(latestAssistant(result).content[0].text, "The selection stayed on Standard.");
  assert.equal(result.extensionErrors.length, 0);
});

test("accepts a shared-only selection through the registered Pi path", async () => {
  const result = await runProjectionMode("shared-only");
  assert.deepEqual(
    result.requests.map((body) => body.model),
    ["gpt-4o", "gpt-4", "gpt-4", "gpt-4", "gpt-4", "gpt-4o"],
  );
  const finalInput = JSON.stringify(result.requests[5].input);
  assert.match(finalInput, /CAPTURED_SELECTED/);
  assert.doesNotMatch(finalInput, /CAPTURED_OMITTED/);
  assert.equal(result.projectionRecords.length, 1);
  assert.deepEqual(result.projectionRecords[0].data.include, []);
  assert.equal(result.projectionRecords[0].data.shared.length, 1);
  assert.equal(result.extensionErrors.length, 0);
});

test("keeps the ordinary path when projected mode is disabled", async () => {
  const result = await runProjectionMode("default-off");
  assert.deepEqual(
    result.requests.map((body) => body.model),
    ["gpt-4o", "gpt-4", "gpt-4", "gpt-4", "gpt-4", "gpt-4o"],
  );
  assert.ok(result.sourceRecords.length > 0);
  assert.equal(result.projectionRecords.length, 0);
  assert.equal(
    result.requests.some((body) => JSON.stringify(body.input).includes("[projection-ref:")),
    true,
  );
  assert.equal(
    result.requests.some((body) => JSON.stringify(body.input).includes("[routing-origin:")),
    true,
  );
  assert.equal(result.extensionErrors.length, 0);
});

test("aborts when a preceding context extension transforms selected evidence", async () => {
  const result = await runProjectionMode("context-mutation");
  assert.deepEqual(
    result.requests.map((body) => body.model),
    ["gpt-4o", "gpt-4", "gpt-4", "gpt-4", "gpt-4"],
  );
  assert.equal(result.projectionRecords.length, 1);
  assert.ok(["aborted", "error"].includes(latestAssistant(result).stopReason));
  assert.match(latestAssistant(result).errorMessage ?? "", /aborted/i);
  assert.equal(result.extensionErrors.length, 0);
  const selected = result.entries.find(
    (entry) =>
      entry.type === "message" && entry.message?.role === "toolResult" && entry.message.toolName === CAPTURE_TOOL,
  );
  assert.ok(selected);
  assert.match(JSON.stringify(selected.message.content), /CAPTURED_SELECTED/);
  assert.doesNotMatch(JSON.stringify(selected.message.content), /MUTATED_SELECTED/);
  for (const [entryId, beforeMessage] of result.canonicalBeforeProjection) {
    const afterEntry = result.entries.find((entry) => entry.id === entryId);
    assert.ok(afterEntry, `transformed-source failure: canonical entry ${entryId} remains present`);
    assert.deepEqual(
      afterEntry.message,
      beforeMessage,
      `transformed-source failure: canonical entry ${entryId} remains unchanged`,
    );
  }
});

test("aborts when a persisted projection failure is present before Reasoning context assembly", async () => {
  const result = await runProjectionMode("recorded-failure");
  assert.deepEqual(
    result.requests.map((body) => body.model),
    ["gpt-4o", "gpt-4", "gpt-4", "gpt-4", "gpt-4"],
  );
  assert.equal(result.faultCount, 1);
  assert.equal(result.contextAbortStates.some(Boolean), true);
  assert.equal(result.projectionRecords.length, 2);
  assert.equal(result.projectionRecords.at(-1).data.status, "corrupt");
  assert.ok(["aborted", "error"].includes(latestAssistant(result).stopReason));
  assert.match(latestAssistant(result).errorMessage ?? "", /aborted/i);
  assert.equal(result.extensionErrors.length, 0);
  for (const [entryId, beforeMessage] of result.canonicalBeforeProjection) {
    const afterEntry = result.entries.find((entry) => entry.id === entryId);
    assert.ok(afterEntry, `canonical entry ${entryId} remains present`);
    assert.deepEqual(afterEntry.message, beforeMessage, `canonical entry ${entryId} remains unchanged`);
  }
});
