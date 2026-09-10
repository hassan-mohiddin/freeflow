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
import { COGNITIVE_ROUTING_DIAGNOSTIC_ENTRY } from "../../dist/cognitive-routing/diagnostics.js";
import { filterBootstrapMessage } from "../../dist/runtime/runtime-context.js";

const SOURCE_ENTRY = "freeflow-cognitive-routing-source";
const PROJECTION_ENTRY = "freeflow-cognitive-routing-projection";
const BASELINE_ENTRY = "freeflow-cognitive-routing-baseline";
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
  let contextMutationCount = 0;
  let unrelatedAssistantInjected = false;
  let diagnosticAppendAttempts = 0;
  const preflightContexts = [];
  let canonicalBeforeProjection;
  let abortedAssistant;
  let recoveredAssistant;
  let unrelatedAssistantEntry;

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
        ...(mode === "preflight-unmatched"
          ? [
              (pi) => {
                pi.on("context", (event) => {
                  if (requestIndex < 4) return undefined;
                  event.messages.push({
                    role: "custom",
                    customType: "unmatched-notification",
                    content: [{ type: "text", text: "UNMATCHED_PREFLIGHT_NOTIFICATION" }],
                  });
                  preflightContexts.push(structuredClone(event.messages));
                  return undefined;
                });
              },
            ]
          : []),
        ...(mode === "context-mutation" || mode === "abort-recovery" || mode.startsWith("diagnostic-persistence-")
          ? [
              (pi) => {
                pi.on("context", (event) => {
                  if (
                    (mode === "abort-recovery" && contextMutationCount > 0) ||
                    requestIndex < 5 ||
                    !JSON.stringify(event.messages).includes("CAPTURED_SELECTED")
                  ) {
                    return undefined;
                  }
                  if (mode === "abort-recovery") contextMutationCount += 1;
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
    if (mode === "unmatched-assistant-error") {
      sessionManager.appendMessage({ role: "user", content: [{ type: "text", text: "Seeded context." }] });
      unrelatedAssistantEntry = sessionManager.appendMessage({
        api: "openai-responses",
        content: [],
        errorMessage: "Provider failed",
        model: "gpt-4",
        provider: "openai",
        role: "assistant",
        stopReason: "error",
      });
      sessionManager.appendCustomEntry(BASELINE_ENTRY, {
        version: 1,
        kind: "baseline",
        sessionId: sessionManager.getSessionId(),
        entryIds: [],
      });
      unrelatedAssistantInjected = true;
    }
    if (mode.startsWith("diagnostic-persistence-")) {
      const appendCustomEntry = sessionManager.appendCustomEntry.bind(sessionManager);
      sessionManager.appendCustomEntry = (customType, data) => {
        if (customType === COGNITIVE_ROUTING_DIAGNOSTIC_ENTRY) {
          diagnosticAppendAttempts += 1;
          if (mode === "diagnostic-persistence-throw") {
            throw new Error("diagnostic persistence failed");
          }
          if (mode === "diagnostic-persistence-readback") return appendCustomEntry(customType, data);
          return undefined;
        }
        return appendCustomEntry(customType, data);
      };
      if (mode === "diagnostic-persistence-readback") {
        const getBranch = sessionManager.getBranch.bind(sessionManager);
        sessionManager.getBranch = () =>
          getBranch().filter(
            (entry) => !(entry.type === "custom" && entry.customType === COGNITIVE_ROUTING_DIAGNOSTIC_ENTRY),
          );
      }
    }
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
    let switchDefinitionExposesProjection;
    try {
      await session.bindExtensions({ mode: "print" });
      await session.prompt("start the projection negative case");
      await session.prompt("return the captured evidence");
      if (mode === "abort-recovery") {
        const abortedEntry = [...sessionManager.getBranch()]
          .reverse()
          .find((entry) => entry.type === "message" && entry.message?.role === "assistant" && entry.message.stopReason);
        assert.ok(abortedEntry, "the initial projection failure must persist an assistant result");
        abortedAssistant = { id: abortedEntry.id, message: structuredClone(abortedEntry.message) };
        await session.reload();
        await session.prompt("recover after the projection abort");
        const recoveredEntry = [...sessionManager.getBranch()]
          .reverse()
          .find(
            (entry) =>
              entry.type === "message" &&
              entry.message?.role === "assistant" &&
              entry.message.stopReason === "stop" &&
              entry.id !== abortedAssistant.id,
          );
        assert.ok(recoveredEntry, "the later projected turn must complete");
        recoveredAssistant = { id: recoveredEntry.id, message: structuredClone(recoveredEntry.message) };
      }
      const switchDefinition = session.getToolDefinition("freeflow_switch_profile");
      switchDefinitionExposesProjection = Boolean(switchDefinition?.parameters?.properties?.projection);
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
      contextMutationCount,
      unrelatedAssistantInjected,
      diagnosticAppendAttempts,
      preflightContexts,
      canonicalBeforeProjection,
      abortedAssistant,
      recoveredAssistant,
      unrelatedAssistantEntry,
      extensionErrors,
      switchDefinitionExposesProjection,
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
  const diagnostics = result.entries.filter(
    (entry) => entry.type === "custom" && entry.customType === "freeflow-cognitive-routing-diagnostic",
  );
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].data.code, "projection_ref_not_exposed:ctx:missing");
  assert.equal(diagnostics[0].data.stage, "selection_validation");
  assert.equal(result.extensionErrors.length, 0);
});

test("preserves exact unmatched custom-message identity through selection preflight", async () => {
  const result = await runProjectionMode("preflight-unmatched");
  assert.deepEqual(
    result.requests.map((body) => body.model),
    ["gpt-4o", "gpt-4", "gpt-4", "gpt-4", "gpt-4", "gpt-4"],
  );
  assert.equal(result.projectionRecords.length, 0);
  const diagnostics = result.entries.filter(
    (entry) => entry.type === "custom" && entry.customType === "freeflow-cognitive-routing-diagnostic",
  );
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].data.code, "projection_dependency_invalid:source_not_found:custom");
  assert.equal(diagnostics[0].data.role, "custom");
  assert.equal(diagnostics[0].data.customType, "unmatched-notification");
  const exactPosition = result.preflightContexts[0]
    .map(filterBootstrapMessage)
    .filter((message) => message !== undefined)
    .findIndex((message) => message?.customType === "unmatched-notification");
  assert.equal(exactPosition >= 0, true);
  assert.equal(diagnostics[0].data.position, exactPosition);
  assert.equal(diagnostics[0].data.ref, undefined);
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
  const diagnostics = result.entries.filter(
    (entry) => entry.type === "custom" && entry.customType === "freeflow-cognitive-routing-diagnostic",
  );
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].data.stage, "context_assembly");
  assert.match(diagnostics[0].data.code, /source_not_found|projection_ref_changed/);
  const failingPosition = result.observedContexts
    .at(-1)
    .findIndex((message) => JSON.stringify(message).includes("MUTATED_SELECTED"));
  assert.equal(diagnostics[0].data.position, failingPosition);
  assert.match(
    result.observedContexts.at(-1).find((message) => message?.customType === "freeflow-runtime-state")?.content ?? "",
    /Projection: `blocked`/,
  );
  assert.equal(result.switchDefinitionExposesProjection, false);
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

test("does not let a persisted projection abort poison a later projected turn", async () => {
  const result = await runProjectionMode("abort-recovery");

  assert.equal(result.contextMutationCount, 1);
  assert.ok(result.abortedAssistant);
  assert.equal(result.abortedAssistant.message.stopReason, "error");
  assert.equal(result.abortedAssistant.message.errorMessage, "This operation was aborted");
  assert.ok(result.recoveredAssistant);
  assert.equal(result.recoveredAssistant.message.stopReason, "stop");
  assert.equal(result.requests.at(-1).model, "gpt-4o");
  assert.equal(result.contextAbortStates.some(Boolean), true);
  assert.equal(result.contextAbortStates.at(-1), false);
  assert.match(
    result.observedContexts.at(-1).find((message) => message?.customType === "freeflow-runtime-state")?.content ?? "",
    /Projection: `enabled`/,
  );
  assert.equal(result.projectionRecords.length, 1);
  assert.equal(result.extensionErrors.length, 0);

  const diagnostics = result.entries.filter(
    (entry) => entry.type === "custom" && entry.customType === "freeflow-cognitive-routing-diagnostic",
  );
  assert.equal(diagnostics.length, 1);
  const retainedAbort = result.entries.find((entry) => entry.id === result.abortedAssistant.id);
  assert.ok(retainedAbort);
  assert.deepEqual(retainedAbort.message, result.abortedAssistant.message);
});

test("rejects an unrelated unattributed assistant error", async () => {
  const result = await runProjectionMode("unmatched-assistant-error");

  assert.equal(result.unrelatedAssistantInjected, true);
  assert.equal(result.requests.length, 0);
  assert.equal(result.contextAbortStates.some(Boolean), true);
  assert.ok(["aborted", "error"].includes(latestAssistant(result).stopReason));
  const diagnostics = result.entries.filter(
    (entry) => entry.type === "custom" && entry.customType === "freeflow-cognitive-routing-diagnostic",
  );
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].data.code, "source_not_found:assistant");
  assert.equal(diagnostics[0].data.stage, "context_assembly");
  assert.equal(diagnostics[0].data.role, "assistant");
  const retainedUnrelatedError = result.entries.find((entry) => entry.id === result.unrelatedAssistantEntry);
  assert.ok(retainedUnrelatedError);
  assert.equal(retainedUnrelatedError.message.errorMessage, "Provider failed");
  assert.equal(result.extensionErrors.length, 0);
});

test("registered diagnostic persistence failures stay truthful and fail-closed", async () => {
  for (const mode of [
    "diagnostic-persistence-failure",
    "diagnostic-persistence-throw",
    "diagnostic-persistence-readback",
  ]) {
    const result = await runProjectionMode(mode);
    assert.deepEqual(
      result.requests.map((body) => body.model),
      ["gpt-4o", "gpt-4", "gpt-4", "gpt-4", "gpt-4"],
      mode,
    );
    assert.equal(result.diagnosticAppendAttempts, 1, mode);
    assert.equal(
      result.entries.some(
        (entry) => entry.type === "custom" && entry.customType === "freeflow-cognitive-routing-diagnostic",
      ),
      false,
      mode,
    );
    assert.equal(result.contextAbortStates.some(Boolean), true, mode);
    assert.ok(["aborted", "error"].includes(latestAssistant(result).stopReason), mode);
    assert.match(latestAssistant(result).errorMessage ?? "", /aborted/i, mode);
    assert.equal(result.extensionErrors.length, 0, mode);
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
  const diagnostics = result.entries.filter(
    (entry) => entry.type === "custom" && entry.customType === "freeflow-cognitive-routing-diagnostic",
  );
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].data.stage, "selection_validation");
  assert.equal(diagnostics[0].data.code, "projection_record_unrecognized");
  assert.equal(result.extensionErrors.length, 0);
  for (const [entryId, beforeMessage] of result.canonicalBeforeProjection) {
    const afterEntry = result.entries.find((entry) => entry.id === entryId);
    assert.ok(afterEntry, `canonical entry ${entryId} remains present`);
    assert.deepEqual(afterEntry.message, beforeMessage, `canonical entry ${entryId} remains unchanged`);
  }
});
