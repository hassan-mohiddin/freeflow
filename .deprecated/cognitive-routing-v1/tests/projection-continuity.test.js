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

const CAPTURE_TOOL = "capture_evidence";
const PROJECTION_ENTRY = "freeflow-cognitive-routing-projection";

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

function exposedRefFor(contexts, marker) {
  const context = contexts.at(-1);
  assert.ok(context, "a captured context is required");
  const matches = context.filter(
    (message) =>
      message?.role === "toolResult" && message.content?.some((part) => part?.type === "text" && part.text === marker),
  );
  assert.equal(matches.length, 1, `expected one exposed result for ${marker}`);
  const refs = JSON.stringify(matches[0]).match(/\[projection-ref: (ctx:[^\]]+)\]/g) ?? [];
  assert.equal(refs.length, 1, `expected one exposed ref for ${marker}`);
  return refs[0].slice("[projection-ref: ".length, -1);
}

function messageEntries(sessionManager) {
  return sessionManager.getBranch().filter((entry) => entry.type === "message" && entry.message);
}

function withoutUndefined(value) {
  if (Array.isArray(value)) return value.map(withoutUndefined);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .map(([key, child]) => [key, withoutUndefined(child)]),
  );
}

async function writeOpenAIConfig(path) {
  await writeFile(path, `${JSON.stringify({ providers: { openai: { baseUrl: "https://api.openai.com/v1" } } })}\n`);
}

async function createRuntime(agentDir, modelsPath) {
  const modelRuntime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"),
    modelsPath,
    modelsStorePath: join(agentDir, "models-store.json"),
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  await modelRuntime.setRuntimeApiKey("openai", "offline-test-key");
  return modelRuntime;
}

function createSettings() {
  return SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false, maxRetries: 0, provider: { maxRetries: 0 } },
  });
}

test("reconstructs persisted projection state in a fresh Pi session", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-projection-continuity-cwd-"));
  const agentDir = await mkdtemp(join(tmpdir(), "freeflow-projection-continuity-agent-"));
  const sessionDir = await mkdtemp(join(tmpdir(), "freeflow-projection-continuity-session-"));
  const originalFetch = globalThis.fetch;
  const originalOffline = process.env.PI_OFFLINE;
  const requests = [];
  const firstContexts = [];
  const reloadContexts = [];
  const compactEvents = [];
  const treeEvents = [];
  let requestIndex = 0;
  let firstSession;
  let reloadedSession;
  let firstSessionManager;
  let reloadedSessionManager;
  let savedBeforeSecondReturnLeaf;
  let selectedRef;
  let dRef;
  let compactionKeepId;
  const compactionPreparations = [];

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
        { target: "standard", reason: "Collect the bounded evidence." },
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
      return functionCallResponse(
        "capture-shared",
        CAPTURE_TOOL,
        { label: "shared" },
        "Standard captures shared task evidence.",
      );
    }
    if (requestIndex === 4) {
      requestIndex += 1;
      return textResponse("standard-follow-up", "Standard completed the evidence block.");
    }
    if (requestIndex === 5) {
      selectedRef = exposedRefFor(firstContexts, "CAPTURED_SELECTED");
      const include = selectedRef;
      const shared = exposedRefFor(firstContexts, "CAPTURED_SHARED");
      requestIndex += 1;
      return functionCallResponse(
        "switch-to-reasoning",
        "freeflow_switch_profile",
        {
          target: "reasoning",
          reason: "The evidence is ready for assessment.",
          projection: { include: [include], shared: [shared] },
        },
        "Standard returns the selected evidence.",
      );
    }
    if (requestIndex === 6) {
      requestIndex += 1;
      return textResponse("reasoning-follow-up", "Reasoning completed the first assessment.");
    }
    if (requestIndex === 7) {
      requestIndex += 1;
      return functionCallResponse(
        "switch-to-standard-second",
        "freeflow_switch_profile",
        { target: "standard", reason: "Collect another bounded evidence block." },
        "Reasoning delegates the second bounded evidence block.",
      );
    }
    if (requestIndex === 8) {
      requestIndex += 1;
      return functionCallResponse("capture-c", CAPTURE_TOOL, { label: "c" }, "Standard captures C evidence.");
    }
    if (requestIndex === 9) {
      requestIndex += 1;
      return textResponse("standard-second-follow-up", "Standard completed the second evidence block.");
    }
    if (requestIndex === 10) {
      const include = exposedRefFor(firstContexts, "CAPTURED_C");
      requestIndex += 1;
      return functionCallResponse(
        "switch-to-reasoning-second",
        "freeflow_switch_profile",
        { target: "reasoning", reason: "The second evidence block is ready.", projection: { include: [include] } },
        "Standard returns the second selected evidence.",
      );
    }
    if (requestIndex === 11) {
      requestIndex += 1;
      return textResponse("reasoning-second-follow-up", "Reasoning completed the second assessment.");
    }
    if (requestIndex === 12) {
      requestIndex += 1;
      return textResponse("reasoning-after-reload", "Reasoning continued after reload.");
    }
    if (requestIndex === 13) {
      requestIndex += 1;
      return textResponse("reasoning-after-compaction", "Reasoning continued after compaction.");
    }
    if (requestIndex === 14) {
      requestIndex += 1;
      return functionCallResponse(
        "switch-to-standard-post-compaction",
        "freeflow_switch_profile",
        { target: "standard", reason: "Collect post-compaction evidence." },
        "Reasoning delegates after compaction.",
      );
    }
    if (requestIndex === 15) {
      requestIndex += 1;
      return functionCallResponse("capture-d", CAPTURE_TOOL, { label: "d" }, "Standard captures D evidence.");
    }
    if (requestIndex === 16) {
      requestIndex += 1;
      return textResponse("standard-post-compaction-follow-up", "Standard completed post-compaction evidence.");
    }
    if (requestIndex === 17) {
      dRef = exposedRefFor(reloadContexts, "CAPTURED_D");
      const include = dRef;
      requestIndex += 1;
      return functionCallResponse(
        "switch-to-reasoning-post-compaction",
        "freeflow_switch_profile",
        { target: "reasoning", reason: "The post-compaction evidence is ready.", projection: { include: [include] } },
        "Standard returns D.",
      );
    }
    if (requestIndex === 18) {
      requestIndex += 1;
      return textResponse("reasoning-post-compaction-follow-up", "Reasoning completed post-compaction assessment.");
    }
    if (requestIndex === 19) {
      requestIndex += 1;
      return functionCallResponse(
        "switch-to-standard-invalid-compaction",
        "freeflow_switch_profile",
        { target: "standard", reason: "Prepare a stale-selection rejection." },
        "Reasoning prepares a stale-selection check.",
      );
    }
    if (requestIndex === 20) {
      requestIndex += 1;
      return textResponse("standard-invalid-compaction-prep", "Standard is ready to return a stale selection.");
    }
    if (requestIndex === 21) {
      requestIndex += 1;
      return functionCallResponse(
        "switch-to-reasoning-invalid-compaction",
        "freeflow_switch_profile",
        {
          target: "reasoning",
          reason: "Return the formerly exposed compacted evidence.",
          projection: { include: [selectedRef], shared: [] },
        },
        "Standard requests retired evidence after compaction.",
      );
    }
    if (requestIndex === 22) {
      requestIndex += 1;
      return textResponse(
        "standard-invalid-compaction-result",
        "Standard reports the stale selection was unavailable.",
      );
    }
    if (requestIndex === 23) {
      requestIndex += 1;
      return functionCallResponse(
        "switch-to-reasoning-branch",
        "freeflow_switch_profile",
        {
          target: "reasoning",
          reason: "The earlier branch is ready for assessment.",
          projection: { include: [], shared: [] },
        },
        "Standard returns the earlier branch without C.",
      );
    }
    if (requestIndex === 24) {
      requestIndex += 1;
      return textResponse("reasoning-branch-follow-up", "Reasoning assessed the earlier branch.");
    }
    if (requestIndex === 25) {
      requestIndex += 1;
      return functionCallResponse(
        "switch-to-standard-invalid-branch",
        "freeflow_switch_profile",
        { target: "standard", reason: "Prepare a branch-local stale-selection rejection." },
        "Reasoning prepares a branch-local stale-selection check.",
      );
    }
    if (requestIndex === 26) {
      requestIndex += 1;
      return textResponse(
        "standard-invalid-branch-prep",
        "Standard is ready to return a branch-local stale selection.",
      );
    }
    if (requestIndex === 27) {
      requestIndex += 1;
      return functionCallResponse(
        "switch-to-reasoning-invalid-branch",
        "freeflow_switch_profile",
        {
          target: "reasoning",
          reason: "Return evidence from the later branch.",
          projection: { include: [dRef], shared: [] },
        },
        "Standard requests evidence that is not on this branch.",
      );
    }
    if (requestIndex === 28) {
      requestIndex += 1;
      return textResponse(
        "standard-invalid-branch-result",
        "Standard reports the branch-local selection was unavailable.",
      );
    }
    requestIndex += 1;
    return textResponse("reasoning-after-reload", "Reasoning continued after reload.");
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

    const firstSettings = createSettings();
    const firstRuntime = await createRuntime(agentDir, modelsPath);
    const firstModel = firstRuntime.getModel("openai", "gpt-4o");
    assert.ok(firstModel);
    const firstResources = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager: firstSettings,
      extensionFactories: [
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
          pi.on("context", (event) => firstContexts.push(structuredClone(event.messages)));
        },
      ],
    });
    await firstResources.reload();

    firstSessionManager = SessionManager.create(cwd, sessionDir);
    const firstCreated = await createAgentSession({
      cwd,
      agentDir,
      model: firstModel,
      thinkingLevel: "off",
      modelRuntime: firstRuntime,
      settingsManager: firstSettings,
      sessionManager: firstSessionManager,
      resourceLoader: firstResources,
    });
    firstSession = firstCreated.session;
    await firstSession.bindExtensions({ mode: "print" });
    await firstSession.prompt("start the persisted projection sequence");
    await firstSession.prompt("return the captured evidence for assessment");
    await firstSession.prompt("start the second evidence block");
    savedBeforeSecondReturnLeaf = firstSessionManager.getLeafId();
    assert.ok(savedBeforeSecondReturnLeaf);
    await firstSession.prompt("return the second captured evidence for assessment");
    const projectionRecords = firstSessionManager
      .getBranch()
      .filter((entry) => entry.type === "custom" && entry.customType === PROJECTION_ENTRY);
    assert.equal(projectionRecords.length, 2);
    const sessionPath = firstSessionManager.getSessionFile();
    assert.ok(sessionPath);
    const beforeReload = new Map(
      messageEntries(firstSessionManager).map((entry) => [entry.id, structuredClone(entry.message)]),
    );
    firstSession.dispose();
    firstSession = undefined;
    reloadedSessionManager = SessionManager.open(sessionPath, sessionDir, cwd);

    const reloadSettings = SettingsManager.inMemory({
      compaction: { enabled: true, reserveTokens: 1, keepRecentTokens: 1 },
      retry: { enabled: false, maxRetries: 0, provider: { maxRetries: 0 } },
    });
    const reloadRuntime = await createRuntime(agentDir, modelsPath);
    const reloadModel = reloadRuntime.getModel("openai", "gpt-4o");
    assert.ok(reloadModel);
    const reloadResources = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager: reloadSettings,
      extensionFactories: [
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
          pi.on("context", (event) => reloadContexts.push(structuredClone(event.messages)));
          pi.on("session_before_compact", (event) => {
            compactionPreparations.push(event.preparation);
            assert.ok(compactionKeepId);
            return {
              compaction: {
                summary: "DETERMINISTIC_COMPACTION_SUMMARY",
                firstKeptEntryId: compactionKeepId,
                tokensBefore: event.preparation.tokensBefore,
              },
            };
          });
          pi.on("session_compact", (event) => compactEvents.push(event));
          pi.on("session_tree", (event) => treeEvents.push(event));
        },
      ],
    });
    await reloadResources.reload();

    const reloadedCreated = await createAgentSession({
      cwd,
      agentDir,
      model: reloadModel,
      thinkingLevel: "off",
      modelRuntime: reloadRuntime,
      settingsManager: reloadSettings,
      sessionManager: reloadedSessionManager,
      resourceLoader: reloadResources,
    });
    reloadedSession = reloadedCreated.session;
    await reloadedSession.bindExtensions({ mode: "print" });
    await reloadedSession.prompt("continue after reload");

    const reloadedContext = reloadContexts.at(-1);
    assert.ok(reloadedContext);
    const reloadedText = JSON.stringify(reloadedContext);
    assert.match(reloadedText, /CAPTURED_SELECTED/);
    assert.match(reloadedText, /CAPTURED_SHARED/);
    assert.match(reloadedText, /CAPTURED_C/);
    assert.doesNotMatch(reloadedText, /CAPTURED_OMITTED/);

    const omittedAssistant = messageEntries(reloadedSessionManager).find(
      (entry) =>
        entry.message.role === "assistant" &&
        JSON.stringify(entry.message.content).includes("Standard captures omitted"),
    );
    assert.ok(omittedAssistant);
    compactionKeepId = omittedAssistant.id;
    const compactionResult = await reloadedSession.compact("deterministic continuity compaction");
    assert.equal(compactionResult.summary, "DETERMINISTIC_COMPACTION_SUMMARY");
    assert.equal(compactionPreparations.length, 1);
    assert.equal(compactEvents.length, 1);
    const compactionEntries = reloadedSessionManager.getBranch().filter((entry) => entry.type === "compaction");
    assert.equal(compactionEntries.length, 1);
    await reloadedSession.prompt("continue after compaction");
    const afterCompactionContext = JSON.stringify(reloadContexts.at(-1));
    assert.match(afterCompactionContext, /DETERMINISTIC_COMPACTION_SUMMARY/);
    assert.match(afterCompactionContext, /CAPTURED_SHARED/);
    assert.match(afterCompactionContext, /CAPTURED_C/);
    assert.doesNotMatch(afterCompactionContext, /CAPTURED_SELECTED/);
    assert.doesNotMatch(afterCompactionContext, /CAPTURED_OMITTED/);

    await reloadedSession.prompt("start post-compaction block");
    await reloadedSession.prompt("return post-compaction evidence");
    const postCompactionContext = JSON.stringify(reloadContexts.at(-1));
    assert.match(postCompactionContext, /CAPTURED_SHARED/);
    assert.match(postCompactionContext, /CAPTURED_C/);
    assert.match(postCompactionContext, /CAPTURED_D/);
    assert.doesNotMatch(postCompactionContext, /CAPTURED_SELECTED/);
    assert.doesNotMatch(postCompactionContext, /CAPTURED_OMITTED/);
    assert.ok(selectedRef);
    assert.ok(dRef);
    assert.doesNotMatch(JSON.stringify(reloadedSessionManager.buildContextEntries()), /CAPTURED_SELECTED/);

    const projectionRecordCount = () =>
      reloadedSessionManager
        .getBranch()
        .filter((entry) => entry.type === "custom" && entry.customType === PROJECTION_ENTRY).length;
    const recordsAfterD = projectionRecordCount();
    await reloadedSession.prompt("start invalid compacted-selection block");
    await reloadedSession.prompt("return the retired selected evidence");
    const compactedInvalidContext = JSON.stringify(reloadContexts.at(-1));
    assert.match(compactedInvalidContext, /projection_ref_not_exposed/);
    assert.equal(projectionRecordCount(), recordsAfterD);
    assert.equal(requests[21].model, "gpt-4");
    assert.equal(requests[22].model, "gpt-4");

    for (const [entryId, beforeMessage] of beforeReload) {
      const afterEntry = messageEntries(reloadedSessionManager).find((entry) => entry.id === entryId);
      assert.ok(afterEntry, `compaction path: canonical entry ${entryId} remains present`);
      assert.deepEqual(
        withoutUndefined(afterEntry.message),
        withoutUndefined(beforeMessage),
        `compaction path: canonical entry ${entryId} remains unchanged`,
      );
    }

    const navigation = await reloadedSession.navigateTree(savedBeforeSecondReturnLeaf, { summarize: false });
    assert.equal(navigation.cancelled, false);
    assert.equal(treeEvents.length >= 1, true);
    assert.match(JSON.stringify(reloadedSessionManager.buildContextEntries()), /CAPTURED_C/);
    assert.doesNotMatch(JSON.stringify(reloadedSessionManager.getBranch()), /CAPTURED_D/);
    await reloadedSession.prompt("return the earlier branch");
    const branchContext = JSON.stringify(reloadContexts.at(-1));
    assert.match(branchContext, /CAPTURED_SELECTED/);
    assert.match(branchContext, /CAPTURED_SHARED/);
    assert.doesNotMatch(branchContext, /CAPTURED_C/);
    assert.doesNotMatch(branchContext, /CAPTURED_OMITTED/);
    const recordsAfterEarlierBranchReturn = projectionRecordCount();
    await reloadedSession.prompt("start invalid branch-selection block");
    await reloadedSession.prompt("return evidence from the later branch");
    const branchInvalidContext = JSON.stringify(reloadContexts.at(-1));
    assert.match(branchInvalidContext, /projection_ref_not_exposed/);
    assert.equal(projectionRecordCount(), recordsAfterEarlierBranchReturn);
    assert.equal(requests[27].model, "gpt-4");
    assert.equal(requests[28].model, "gpt-4");
    assert.equal(requests.length, 29);
    const allEntriesAfterNavigation = reloadedSessionManager.getEntries();
    for (const [entryId, beforeMessage] of beforeReload) {
      const afterEntry = allEntriesAfterNavigation.find((entry) => entry.id === entryId);
      assert.ok(afterEntry, `all-entry history retains ${entryId}`);
      assert.deepEqual(
        withoutUndefined(afterEntry.message),
        withoutUndefined(beforeMessage),
        `all-entry history keeps ${entryId} unchanged`,
      );
    }
  } finally {
    firstSession?.dispose();
    reloadedSession?.dispose();
    globalThis.fetch = originalFetch;
    if (originalOffline === undefined) delete process.env.PI_OFFLINE;
    else process.env.PI_OFFLINE = originalOffline;
    await rm(cwd, { recursive: true, force: true });
    await rm(agentDir, { recursive: true, force: true });
    await rm(sessionDir, { recursive: true, force: true });
  }
});
