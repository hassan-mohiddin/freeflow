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
const CAPTURE_TOOL = "capture_evidence";

function sseResponse(events) {
  const body = `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`;
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function functionCallResponse(id, name, args, text = "I completed the bounded step.") {
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
    {
      type: "response.output_item.added",
      output_index: 0,
      item: { ...message, content: [] },
    },
    { type: "response.output_text.delta", output_index: 0, content_index: 0, delta: text },
    { type: "response.output_item.done", output_index: 0, item: message },
    {
      type: "response.output_item.added",
      output_index: 1,
      item: { ...item, arguments: "" },
    },
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
    {
      type: "response.output_item.added",
      output_index: 0,
      item: { ...item, content: [] },
    },
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

function sourceEntries(sessionManager) {
  return sessionManager.getBranch().filter((entry) => entry.type === "custom" && entry.customType === SOURCE_ENTRY);
}

function toolCallTarget(entry, target) {
  return entry.message?.content?.some(
    (part) => part?.type === "toolCall" && part.name === "freeflow_switch_profile" && part.arguments?.target === target,
  );
}

function exposedRefFor(observedContexts, marker) {
  const context = observedContexts.at(-1);
  assert.ok(context, "an observed Standard context is required");
  const sources = context.filter(
    (message) =>
      message?.role === "toolResult" && message.content?.some((part) => part?.type === "text" && part.text === marker),
  );
  assert.equal(sources.length, 1, `Standard must expose exactly one tool result for ${marker}`);
  const matches = JSON.stringify(sources[0]).match(/\[projection-ref: (ctx:[^\]]+)\]/g) ?? [];
  assert.equal(matches.length, 1, `Standard must expose exactly one ref for ${marker}`);
  return matches[0].slice("[projection-ref: ".length, -1);
}

function exposedAssistantRefFor(observedContexts, marker) {
  const context = observedContexts.at(-1);
  assert.ok(context, "an observed Standard context is required");
  const sources = context.filter(
    (message) =>
      message?.role === "assistant" && message.content?.some((part) => part?.type === "text" && part.text === marker),
  );
  assert.equal(sources.length, 1, `Standard must expose exactly one assistant entry for ${marker}`);
  const matches = JSON.stringify(sources[0]).match(/\[projection-ref: (ctx:[^\]]+)\]/g) ?? [];
  assert.equal(matches.length, 1, `Standard must expose exactly one assistant ref for ${marker}`);
  return matches[0].slice("[projection-ref: ".length, -1);
}

function stripProjectionRefs(message) {
  if (!Array.isArray(message?.content)) return message;
  return {
    ...message,
    content: message.content.filter(
      (part) => !(part?.type === "text" && /^\[projection-ref: ctx:[^\]]+\]$/.test(part.text ?? "")),
    ),
  };
}

function assertObservedCanonicalSource(observedContexts, entry) {
  const expectedMarker = `[projection-ref: ctx:${entry.id}]`;
  const observed = observedContexts
    .flat()
    .find(
      (message) =>
        message?.role === entry.message.role &&
        message?.toolCallId === entry.message.toolCallId &&
        message?.toolName === entry.message.toolName &&
        JSON.stringify(message).includes(expectedMarker),
    );
  assert.ok(observed, `Standard context must expose ${entry.id}`);
  assert.deepEqual(stripProjectionRefs(observed), entry.message, `only the ref annotation may differ for ${entry.id}`);
}

test("captures Standard source blocks through the registered Pi lifecycle", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-projection-coordinator-cwd-"));
  const agentDir = await mkdtemp(join(tmpdir(), "freeflow-projection-coordinator-agent-"));
  const originalFetch = globalThis.fetch;
  const originalOffline = process.env.PI_OFFLINE;
  const requests = [];
  const observedContexts = [];
  const extensionErrors = [];
  let session;
  let sessionManager;
  let requestIndex = 0;
  let prematureStandardRecordCount = 0;
  let selectedRefFromContext;
  let sharedRefFromContext;
  let omittedRefFromContext;
  let earlierAssistantRefFromContext;
  let laterRefFromContext;
  let contextOnlyBlockAssistantRefFromContext;
  let reassessedAssistantRefFromContext;
  let canonicalBeforeThirdReturn;

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
        {
          target: "standard",
          reason: "Use Standard for bounded evidence collection.",
        },
        "Reasoning delegates the bounded evidence collection.",
      );
    }
    if (requestIndex === 1) {
      prematureStandardRecordCount = sourceEntries(sessionManager).filter(
        (entry) => entry.data?.profile === "standard",
      ).length;
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
      return functionCallResponse(
        "capture-shared",
        CAPTURE_TOOL,
        { label: "shared" },
        "Standard captures shared task evidence.",
      );
    }
    if (requestIndex === 4) {
      requestIndex += 1;
      return textResponse("standard-follow-up", "Standard completed the follow-up.");
    }
    if (requestIndex === 5) {
      selectedRefFromContext = exposedRefFor(observedContexts, "CAPTURED_SELECTED");
      sharedRefFromContext = exposedRefFor(observedContexts, "CAPTURED_SHARED");
      omittedRefFromContext = exposedRefFor(observedContexts, "CAPTURED_OMITTED");
      earlierAssistantRefFromContext = exposedAssistantRefFor(observedContexts, "Standard completed the follow-up.");
      requestIndex += 1;
      return functionCallResponse(
        "switch-to-reasoning",
        "freeflow_switch_profile",
        {
          target: "reasoning",
          reason: "The bounded evidence is ready for assessment.",
          projection: { include: [selectedRefFromContext], shared: [sharedRefFromContext] },
        },
        "Standard returns selected evidence for assessment.",
      );
    }
    if (requestIndex === 6) {
      requestIndex += 1;
      return textResponse("reasoning-follow-up", "Reasoning received the returned context.");
    }
    if (requestIndex === 7) {
      requestIndex += 1;
      return functionCallResponse(
        "switch-to-standard-second",
        "freeflow_switch_profile",
        { target: "standard", reason: "Use Standard for another bounded evidence block." },
        "Reasoning delegates the second bounded evidence block.",
      );
    }
    if (requestIndex === 8) {
      requestIndex += 1;
      return functionCallResponse(
        "capture-later",
        CAPTURE_TOOL,
        { label: "later" },
        "Standard captures later evidence.",
      );
    }
    if (requestIndex === 9) {
      requestIndex += 1;
      return textResponse("standard-second-follow-up", "Standard completed the second follow-up.");
    }
    if (requestIndex === 10) {
      laterRefFromContext = exposedRefFor(observedContexts, "CAPTURED_LATER");
      requestIndex += 1;
      return functionCallResponse(
        "switch-to-reasoning-second",
        "freeflow_switch_profile",
        {
          target: "reasoning",
          reason: "The second bounded evidence block is ready for assessment.",
          projection: { include: [laterRefFromContext] },
        },
        "Standard returns the second selected evidence.",
      );
    }
    if (requestIndex === 11) {
      requestIndex += 1;
      return textResponse("reasoning-second-follow-up", "Reasoning received the second returned context.");
    }
    if (requestIndex === 12) {
      requestIndex += 1;
      return functionCallResponse(
        "switch-to-standard-context-only",
        "freeflow_switch_profile",
        { target: "standard", reason: "Reinspect the already exposed evidence without new reads." },
        "Reasoning requests a context-only follow-up.",
      );
    }
    if (requestIndex === 13) {
      requestIndex += 1;
      return textResponse("standard-context-only-follow-up", "Standard completed the context-only follow-up.");
    }
    if (requestIndex === 14) {
      canonicalBeforeThirdReturn = new Map(
        messageEntries(sessionManager).map((entry) => [entry.id, structuredClone(entry.message)]),
      );
      const contextOnlyOmittedRef = exposedRefFor(observedContexts, "CAPTURED_OMITTED");
      reassessedAssistantRefFromContext = exposedAssistantRefFor(observedContexts, "Standard completed the follow-up.");
      contextOnlyBlockAssistantRefFromContext = exposedAssistantRefFor(
        observedContexts,
        "Standard completed the context-only follow-up.",
      );
      assert.equal(contextOnlyOmittedRef, omittedRefFromContext);
      assert.equal(reassessedAssistantRefFromContext, earlierAssistantRefFromContext);
      requestIndex += 1;
      return functionCallResponse(
        "switch-to-reasoning-context-only",
        "freeflow_switch_profile",
        {
          target: "reasoning",
          reason: "The previously exposed evidence is ready for reassessment.",
          projection: { include: [contextOnlyOmittedRef, reassessedAssistantRefFromContext] },
        },
        "Standard returns previously exposed evidence without new reads.",
      );
    }
    requestIndex += 1;
    return textResponse("reasoning-context-only-follow-up", "Reasoning received the context-only follow-up.");
  };

  try {
    await mkdir(join(cwd, ".freeflow"));
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
          pi.registerTool({
            name: CAPTURE_TOOL,
            label: "Capture evidence",
            description: "Return one deterministic evidence result for the source-capture integration.",
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
          pi.on("context", (event) => {
            observedContexts.push(structuredClone(event.messages));
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
    let canonicalBeforeFirstReturn;
    let canonicalAfterFirstReturn;
    let canonicalBeforeSecondReturn;
    try {
      await session.bindExtensions({ mode: "print" });
      await session.prompt("start the source-capture vertical");
      canonicalBeforeFirstReturn = new Map(
        messageEntries(sessionManager).map((entry) => [entry.id, structuredClone(entry.message)]),
      );
      await session.prompt("return the captured evidence for assessment");
      canonicalAfterFirstReturn = new Map(
        messageEntries(sessionManager).map((entry) => [entry.id, structuredClone(entry.message)]),
      );
      for (const [entryId, beforeMessage] of canonicalBeforeFirstReturn) {
        const afterEntry = messageEntries(sessionManager).find((entry) => entry.id === entryId);
        assert.ok(afterEntry, `first return: canonical entry ${entryId} remains present`);
        assert.deepEqual(
          afterEntry.message,
          beforeMessage,
          `first return: canonical entry ${entryId} remains unchanged`,
        );
      }
      await session.prompt("start the second evidence block");
      canonicalBeforeSecondReturn = new Map(
        messageEntries(sessionManager).map((entry) => [entry.id, structuredClone(entry.message)]),
      );
      await session.prompt("return the second captured evidence for assessment");
      await session.prompt("start the context-only later block");
      await session.prompt("return previously exposed evidence for reassessment");
    } finally {
      unsubscribeErrors();
      session.dispose();
      session = undefined;
    }

    assert.ok(selectedRefFromContext, `selected ref missing; requests=${requests.length}`);
    assert.ok(sharedRefFromContext, `shared ref missing; requests=${requests.length}`);
    assert.ok(omittedRefFromContext, `omitted ref missing; requests=${requests.length}`);
    assert.ok(earlierAssistantRefFromContext, `earlier assistant ref missing; requests=${requests.length}`);
    assert.ok(laterRefFromContext, `later ref missing; requests=${requests.length}`);
    assert.ok(
      contextOnlyBlockAssistantRefFromContext,
      `context-only assistant ref missing; requests=${requests.length}`,
    );
    const entryForRef = (ref) => messageEntries(sessionManager).find((entry) => entry.id === ref.slice("ctx:".length));
    const captureEntry = entryForRef(selectedRefFromContext);
    const sharedEntry = entryForRef(sharedRefFromContext);
    const omittedEntry = entryForRef(omittedRefFromContext);
    const earlierAssistantEntry = entryForRef(earlierAssistantRefFromContext);
    const laterEntry = entryForRef(laterRefFromContext);
    const contextOnlyAssistantEntry = entryForRef(contextOnlyBlockAssistantRefFromContext);
    assert.ok(captureEntry);
    assert.ok(sharedEntry);
    assert.ok(omittedEntry);
    assert.ok(earlierAssistantEntry);
    assert.ok(laterEntry);
    assert.ok(contextOnlyAssistantEntry);
    assert.match(JSON.stringify(captureEntry.message.content), /CAPTURED_SELECTED/);
    assert.match(JSON.stringify(sharedEntry.message.content), /CAPTURED_SHARED/);
    assert.match(JSON.stringify(omittedEntry.message.content), /CAPTURED_OMITTED/);
    assert.match(JSON.stringify(earlierAssistantEntry.message.content), /Standard completed the follow-up/);
    assert.match(JSON.stringify(laterEntry.message.content), /CAPTURED_LATER/);
    assert.match(
      JSON.stringify(contextOnlyAssistantEntry.message.content),
      /Standard completed the context-only follow-up/,
    );
    const captureResults = messageEntries(sessionManager).filter(
      (entry) => entry.message.role === "toolResult" && entry.message.toolName === CAPTURE_TOOL,
    );
    assert.equal(captureResults.length, 4, "the context-only block must not invoke another evidence-producing tool");
    assert.equal(prematureStandardRecordCount, 0);
    const captureRef = `ctx:${captureEntry.id}`;
    const captureMarker = `[projection-ref: ${captureRef}]`;
    const requestInputs = requests.map((body) => JSON.stringify(body.input));
    assert.deepEqual(
      requests.map((body) => body.model),
      [
        "gpt-4o",
        "gpt-4",
        "gpt-4",
        "gpt-4",
        "gpt-4",
        "gpt-4",
        "gpt-4o",
        "gpt-4o",
        "gpt-4",
        "gpt-4",
        "gpt-4",
        "gpt-4o",
        "gpt-4o",
        "gpt-4",
        "gpt-4",
        "gpt-4o",
      ],
    );
    assert.equal(requestInputs[0].includes(captureMarker), false);
    assert.equal(requestInputs[1].includes(captureMarker), false);
    assert.equal(requestInputs[2].includes(captureMarker), true);
    assert.equal(requestInputs[3].includes(captureMarker), true);
    assert.equal(requestInputs[4].includes(captureMarker), true);
    assert.equal(requestInputs[5].includes(captureMarker), true);
    assert.match(requestInputs[10], /CAPTURED_OMITTED/);
    assert.match(requestInputs[10], /Standard completed the follow-up/);
    assert.match(requestInputs[14], /CAPTURED_OMITTED/);
    assert.match(requestInputs[14], /Standard completed the follow-up/);

    const sourceRecords = sourceEntries(sessionManager);
    const projectionRecords = sessionManager
      .getBranch()
      .filter((entry) => entry.type === "custom" && entry.customType === "freeflow-cognitive-routing-projection");
    const standardRecords = sourceRecords.filter((entry) => entry.data?.profile === "standard");
    assert.ok(standardRecords.length >= 10, "three Standard blocks and their follow-ups should be recorded");
    assert.equal(new Set(standardRecords.map((entry) => entry.data.blockId)).size, 3);

    const captureRecord = standardRecords.find((entry) =>
      entry.data.toolResults?.some((source) => source.entryId === captureEntry.id),
    );
    const omittedRecord = standardRecords.find((entry) =>
      entry.data.toolResults?.some((source) => source.entryId === omittedEntry.id),
    );
    const earlierAssistantRecord = standardRecords.find(
      (entry) => entry.data.assistant?.entryId === earlierAssistantEntry.id,
    );
    const laterRecord = standardRecords.find((entry) =>
      entry.data.toolResults?.some((source) => source.entryId === laterEntry.id),
    );
    const contextOnlyRecord = standardRecords.find(
      (entry) => entry.data.assistant?.entryId === contextOnlyAssistantEntry.id,
    );
    assert.ok(captureRecord);
    assert.ok(omittedRecord);
    assert.ok(earlierAssistantRecord);
    assert.ok(laterRecord);
    assert.ok(contextOnlyRecord);
    assert.equal(projectionRecords.length, 3);
    const thirdSelection = projectionRecords.find((entry) => entry.data?.blockId === contextOnlyRecord.data.blockId);
    assert.ok(thirdSelection);
    assert.deepEqual(
      new Set(thirdSelection.data.include),
      new Set([omittedRefFromContext, earlierAssistantRefFromContext]),
    );
    assert.equal(omittedRecord.data.blockId, captureRecord.data.blockId);
    assert.equal(earlierAssistantRecord.data.blockId, captureRecord.data.blockId);
    assert.notEqual(laterRecord.data.blockId, captureRecord.data.blockId);
    assert.notEqual(contextOnlyRecord.data.blockId, laterRecord.data.blockId);
    assert.notEqual(thirdSelection.data.blockId, omittedRecord.data.blockId);
    const switchAssistant = messageEntries(sessionManager).find((entry) => toolCallTarget(entry, "reasoning"));
    assert.ok(switchAssistant);
    const switchCall = switchAssistant.message.content.find(
      (part) => part?.type === "toolCall" && part.name === "freeflow_switch_profile",
    );
    assert.ok(switchCall);
    const switchResult = messageEntries(sessionManager).find(
      (entry) => entry.message.role === "toolResult" && entry.message.toolCallId === switchCall.id,
    );
    assert.ok(switchResult);
    const switchRecord = sourceRecords.find((entry) => entry.data.assistant?.entryId === switchAssistant.id);
    assert.equal(switchRecord?.data.profile, "standard");
    assert.equal(switchRecord?.data.blockId, captureRecord.data.blockId);
    assert.equal(switchRecord?.data.assistant?.entryId, switchAssistant.id);
    assert.equal(
      switchRecord?.data.toolResults?.some((source) => source.entryId === switchResult.id),
      true,
    );

    const finalReasoning = [...messageEntries(sessionManager)]
      .reverse()
      .find((entry) => JSON.stringify(entry.message.content).includes("Reasoning received the returned context."));
    assert.ok(finalReasoning);

    const firstUser = messageEntries(sessionManager).find(
      (entry) =>
        entry.message.role === "user" &&
        JSON.stringify(entry.message.content).includes("start the source-capture vertical"),
    );
    assert.ok(firstUser);
    assert.equal(
      sourceRecords.some((entry) => entry.data.assistant?.entryId === firstUser.id),
      false,
    );
    assert.equal(extensionErrors.length, 0);
    const firstReasoningRequest = JSON.stringify(requests[6].input);
    assert.match(firstReasoningRequest, /CAPTURED_SELECTED/);
    assert.match(firstReasoningRequest, /CAPTURED_SHARED/);
    assert.doesNotMatch(firstReasoningRequest, /CAPTURED_OMITTED/);
    assert.match(firstReasoningRequest, /freeflow_switch_profile/);
    const secondReasoningRequest = JSON.stringify(requests[11].input);
    assert.match(secondReasoningRequest, /CAPTURED_SELECTED/);
    assert.match(secondReasoningRequest, /CAPTURED_SHARED/);
    assert.match(secondReasoningRequest, /CAPTURED_LATER/);
    assert.doesNotMatch(secondReasoningRequest, /CAPTURED_OMITTED/);
    assert.doesNotMatch(secondReasoningRequest, /Standard completed the follow-up/);
    const thirdReasoningRequest = JSON.stringify(requests[15].input);
    assert.match(thirdReasoningRequest, /CAPTURED_SELECTED/);
    assert.match(thirdReasoningRequest, /CAPTURED_SHARED/);
    assert.match(thirdReasoningRequest, /CAPTURED_LATER/);
    assert.match(thirdReasoningRequest, /CAPTURED_OMITTED/);
    assert.match(thirdReasoningRequest, /capture-omitted/);
    assert.match(thirdReasoningRequest, /Standard completed the follow-up/);
    assert.equal(requests.length, 16);
    assert.equal(observedContexts.length >= 16, true);
    assert.match(JSON.stringify(observedContexts[6]), /CAPTURED_SELECTED/);
    assert.match(JSON.stringify(observedContexts[6]), /CAPTURED_SHARED/);
    assert.doesNotMatch(JSON.stringify(observedContexts[6]), /CAPTURED_OMITTED/);
    assert.match(JSON.stringify(observedContexts[11]), /CAPTURED_SELECTED/);
    assert.match(JSON.stringify(observedContexts[11]), /CAPTURED_SHARED/);
    assert.match(JSON.stringify(observedContexts[11]), /CAPTURED_LATER/);
    assert.doesNotMatch(JSON.stringify(observedContexts[11]), /CAPTURED_OMITTED/);
    assert.doesNotMatch(JSON.stringify(observedContexts[11]), /Standard completed the follow-up/);
    assert.match(JSON.stringify(observedContexts[15]), /CAPTURED_SELECTED/);
    assert.match(JSON.stringify(observedContexts[15]), /CAPTURED_SHARED/);
    assert.match(JSON.stringify(observedContexts[15]), /CAPTURED_LATER/);
    assert.match(JSON.stringify(observedContexts[15]), /CAPTURED_OMITTED/);
    assert.match(JSON.stringify(observedContexts[15]), /Standard completed the follow-up/);
    const assertCheckpoint = (checkpoint, label) => {
      for (const [entryId, beforeMessage] of checkpoint) {
        const afterEntry = messageEntries(sessionManager).find((entry) => entry.id === entryId);
        assert.ok(afterEntry, `${label}: canonical entry ${entryId} remains present`);
        assert.deepEqual(afterEntry.message, beforeMessage, `${label}: canonical entry ${entryId} remains unchanged`);
      }
    };
    assertCheckpoint(canonicalBeforeFirstReturn, "before first return");
    assertCheckpoint(canonicalAfterFirstReturn, "after first return");
    assertCheckpoint(canonicalBeforeSecondReturn, "before second return");
    assertCheckpoint(canonicalBeforeThirdReturn, "before third return");
    const thirdHandoff = observedContexts[15].find(
      (message) =>
        message?.role === "assistant" &&
        JSON.stringify(message.content).includes("Standard returns previously exposed evidence without new reads."),
    );
    assert.ok(thirdHandoff);
    const thirdHandoffCall = thirdHandoff.content.find(
      (part) => part?.type === "toolCall" && part.name === "freeflow_switch_profile",
    );
    assert.equal(thirdHandoffCall?.arguments?.target, "reasoning");
    assert.ok(
      observedContexts[15].some(
        (message) => message?.role === "toolResult" && message.toolCallId === thirdHandoffCall?.id,
      ),
    );
    assertObservedCanonicalSource(observedContexts, captureEntry);
    assertObservedCanonicalSource(observedContexts, omittedEntry);
    assertObservedCanonicalSource(observedContexts, sharedEntry);
    assertObservedCanonicalSource(observedContexts, laterEntry);
    for (const entry of messageEntries(sessionManager)) {
      assert.doesNotMatch(JSON.stringify(entry.message), /projection-ref/);
    }
  } finally {
    session?.dispose();
    globalThis.fetch = originalFetch;
    if (originalOffline === undefined) delete process.env.PI_OFFLINE;
    else process.env.PI_OFFLINE = originalOffline;
    await rm(cwd, { recursive: true, force: true });
    await rm(agentDir, { recursive: true, force: true });
  }
});
