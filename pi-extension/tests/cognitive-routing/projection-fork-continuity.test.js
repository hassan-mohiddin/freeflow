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

function sseResponse(events) {
  return new Response(`${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
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

function assistant(content, id) {
  return {
    role: "assistant",
    content,
    provider: "openai",
    model: "gpt-4o",
    api: "openai-responses",
    responseId: `response-${id}`,
    stopReason: "stop",
    usage: { input: 1, output: 1, totalTokens: 2 },
  };
}

function toolResult(toolCallId, toolName, text) {
  return { role: "toolResult", toolCallId, toolName, content: [{ type: "text", text }], isError: false };
}

function exposedRefFor(contexts, marker) {
  const context = contexts.at(-1)?.messages ?? contexts.at(-1);
  const matches = context.filter(
    (message) =>
      message?.role === "toolResult" && message.content?.some((part) => part?.type === "text" && part.text === marker),
  );
  assert.equal(matches.length, 1, `expected one exposed result for ${marker}`);
  const refs = JSON.stringify(matches[0]).match(/\[projection-ref: (ctx:[^\]]+)\]/g) ?? [];
  assert.equal(refs.length, 1, `expected one exposed ref for ${marker}`);
  return refs[0].slice("[projection-ref: ".length, -1);
}

function findToolResultEntry(manager, marker) {
  const entry = manager
    .getBranch()
    .find(
      (candidate) =>
        candidate.type === "message" &&
        candidate.message?.role === "toolResult" &&
        candidate.message.content?.some((part) => part?.type === "text" && part.text === marker),
    );
  assert.ok(entry, `expected emitted tool result for ${marker}`);
  return entry;
}

function snapshotRoutingEntries(manager, omittedEntryId, label) {
  const entries = manager
    .getBranch()
    .filter(
      (entry) =>
        entry.type === "custom" && (entry.customType === SOURCE_ENTRY || entry.customType === PROJECTION_ENTRY),
    );
  const snapshots = new Map(entries.map((entry) => [entry.id, structuredClone(entry.data)]));
  assert.ok(snapshots.size > 0, `${label} inherited routing entry snapshot must be nonempty`);
  assert.ok(
    entries.some((entry) => entry.customType === SOURCE_ENTRY),
    `${label} source snapshot is required`,
  );
  assert.ok(
    entries.some((entry) => entry.customType === PROJECTION_ENTRY),
    `${label} projection snapshot is required`,
  );
  assert.ok(manager.getEntry(omittedEntryId), `${label} must inherit the omitted canonical result`);
  assert.ok(
    entries.some((entry) => entry.customType === SOURCE_ENTRY && JSON.stringify(entry.data).includes(omittedEntryId)),
    `${label} source baseline must reference the omitted canonical result`,
  );
  return snapshots;
}

function assertRoutingEntriesUnchanged(manager, snapshots, label) {
  for (const [entryId, data] of snapshots) {
    const entry = manager.getEntry(entryId);
    assert.ok(entry, `${label} inherited routing entry missing: ${entryId}`);
    assert.deepEqual(entry.data, data, `${label} routing entry changed: ${entryId}`);
  }
}

function createSettings() {
  return SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false, maxRetries: 0, provider: { maxRetries: 0 } },
  });
}

async function setup(cwd, agentDir) {
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
  await writeFile(modelsPath, JSON.stringify({ providers: { openai: { baseUrl: "https://api.openai.com/v1" } } }));
  return modelsPath;
}

function captureFactory(marker = "MANUAL_CAPTURE") {
  return (pi) => {
    pi.registerTool({
      name: "capture_evidence",
      label: "Capture evidence",
      description: "Return deterministic evidence.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { label: { type: "string" } },
        required: ["label"],
      },
      async execute(_toolCallId, params) {
        return {
          content: [
            {
              type: "text",
              text: marker === "MANUAL_CAPTURE" ? marker : `${marker}_${String(params.label).toUpperCase()}`,
            },
          ],
          details: {},
        };
      },
    });
  };
}

async function openSession({
  cwd,
  agentDir,
  modelsPath,
  manager,
  contexts,
  fetchImpl,
  extraFactory,
  usePersistedModel = false,
}) {
  const settings = createSettings();
  const runtime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"),
    modelsPath,
    modelsStorePath: join(agentDir, "models-store.json"),
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  await runtime.setRuntimeApiKey("openai", "offline-test-key");
  const model = runtime.getModel("openai", "gpt-4o");
  assert.ok(model);
  const resources = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager: settings,
    extensionFactories: [
      freeflowExtension,
      (pi) =>
        pi.on("context", (event, ctx) =>
          contexts.push({ messages: structuredClone(event.messages), aborted: ctx.signal?.aborted === true }),
        ),
      ...(extraFactory ? [extraFactory] : []),
    ],
  });
  await resources.reload();
  const session = (
    await createAgentSession({
      cwd,
      agentDir,
      ...(usePersistedModel ? {} : { model, thinkingLevel: "off" }),
      modelRuntime: runtime,
      settingsManager: settings,
      sessionManager: manager,
      resourceLoader: resources,
    })
  ).session;
  const errors = [];
  const unsubscribeErrors = session.extensionRunner.onError((error) => errors.push(error));
  await session.bindExtensions({ mode: "print" });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  return {
    session,
    errors,
    restore: () => {
      unsubscribeErrors();
      globalThis.fetch = previousFetch;
    },
  };
}

function seedProjection(manager, malformed = false) {
  const sessionId = manager.getSessionId();
  manager.appendMessage({ role: "user", content: "Parent evidence" });
  const captureCall = "capture-parent";
  const captureAssistant = manager.appendMessage(
    assistant([{ type: "toolCall", id: captureCall, name: "capture_evidence", arguments: "{}" }], "capture-parent"),
  );
  const captureResult = manager.appendMessage(toolResult(captureCall, "capture_evidence", "PARENT_CAPTURE"));
  const switchCall = "switch-parent";
  const switchAssistant = manager.appendMessage(
    assistant(
      [{ type: "toolCall", id: switchCall, name: "freeflow_switch_profile", arguments: "{}" }],
      "switch-parent",
    ),
  );
  const switchResult = manager.appendMessage(toolResult(switchCall, "freeflow_switch_profile", "switched"));
  const blockId = "parent-block";
  manager.appendCustomEntry(SOURCE_ENTRY, {
    version: 1,
    sessionId,
    profile: "standard",
    blockId,
    assistant: { sessionId, entryId: captureAssistant },
    toolResults: [{ sessionId, entryId: captureResult, toolCallId: captureCall, toolName: "capture_evidence" }],
  });
  manager.appendCustomEntry(SOURCE_ENTRY, {
    version: 1,
    sessionId,
    profile: "standard",
    blockId,
    assistant: { sessionId, entryId: switchAssistant },
    toolResults: [{ sessionId, entryId: switchResult, toolCallId: switchCall, toolName: "freeflow_switch_profile" }],
  });
  manager.appendCustomEntry(PROJECTION_ENTRY, {
    version: 1,
    kind: "selection",
    status: "committed",
    sessionId,
    branchLeafId: manager.getLeafId(),
    blockId,
    handoff: { assistantEntryId: switchAssistant, toolCallId: switchCall, resultEntryId: switchResult },
    include: [malformed ? "ctx:missing" : `ctx:${captureResult}`],
    shared: [],
    required: [`ctx:${switchAssistant}`, `ctx:${switchResult}`],
  });
}

async function buildLineageSession(cwd, sessionDir, depth) {
  let manager = SessionManager.create(cwd, sessionDir);
  const modelId = "gpt-4o";
  manager.appendModelChange("openai", modelId);
  manager.appendThinkingLevelChange("off");
  manager.appendMessage({ role: "user", content: "Lineage control" });
  const assistantId = manager.appendMessage(assistant([{ type: "text", text: "Baseline" }], "lineage-baseline"));
  manager.appendCustomEntry(SOURCE_ENTRY, {
    version: 1,
    sessionId: manager.getSessionId(),
    profile: "reasoning",
    blockId: "lineage-baseline",
    assistant: { sessionId: manager.getSessionId(), entryId: assistantId },
    toolResults: [],
  });
  for (let index = 0; index < depth; index += 1) {
    const childPath = manager.createBranchedSession(manager.getLeafId());
    manager = SessionManager.open(childPath, sessionDir, cwd);
  }
  return manager;
}

test("cancels over-limit lineage and preserves the within-limit control", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-lineage-limit-cwd-"));
  const agentDir = await mkdtemp(join(tmpdir(), "freeflow-lineage-limit-agent-"));
  const sessionDir = await mkdtemp(join(tmpdir(), "freeflow-lineage-limit-session-"));
  const originalOffline = process.env.PI_OFFLINE;
  const originalFetch = globalThis.fetch;
  const resources = [];
  process.env.PI_OFFLINE = "1";
  try {
    const modelsPath = await setup(cwd, agentDir);
    const withinRequests = [];
    const withinContexts = [];
    const within = await openSession({
      cwd,
      agentDir,
      modelsPath,
      manager: await buildLineageSession(cwd, sessionDir, 64),
      contexts: withinContexts,
      fetchImpl: async (_url, init) => {
        withinRequests.push(init.body);
        return textResponse("within-limit", "Within limit.");
      },
    });
    resources.push(within);
    await within.session.prompt("Use the within-limit lineage.");
    assert.equal(withinRequests.length, 1);
    assert.equal(
      withinContexts.some((context) => context.aborted),
      false,
    );
    assert.equal(within.errors.length, 0);
    within.restore();
    within.session.dispose();
    resources.pop();

    const overRequests = [];
    const overContexts = [];
    const over = await openSession({
      cwd,
      agentDir,
      modelsPath,
      manager: await buildLineageSession(cwd, sessionDir, 65),
      contexts: overContexts,
      fetchImpl: async (_url, init) => {
        overRequests.push(init.body);
        return textResponse("over-limit", "Over limit should not dispatch.");
      },
    });
    resources.push(over);
    await over.session.prompt("Use the over-limit lineage.");
    assert.equal(overRequests.length, 0);
    assert.equal(
      overContexts.some((context) => context.aborted),
      true,
    );
    assert.equal(over.errors.length, 0);
  } finally {
    for (const current of resources) {
      current.restore();
      current.session.dispose();
    }
    globalThis.fetch = originalFetch;
    if (originalOffline === undefined) delete process.env.PI_OFFLINE;
    else process.env.PI_OFFLINE = originalOffline;
    await rm(cwd, { recursive: true, force: true });
    await rm(agentDir, { recursive: true, force: true });
    await rm(sessionDir, { recursive: true, force: true });
  }
});

test("requalifies a real projected handoff across fork and nested clone", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-fork-cwd-"));
  const agentDir = await mkdtemp(join(tmpdir(), "freeflow-fork-agent-"));
  const sessionDir = await mkdtemp(join(tmpdir(), "freeflow-fork-session-"));
  const originalOffline = process.env.PI_OFFLINE;
  const originalFetch = globalThis.fetch;
  const contexts = [];
  const resources = [];
  const parentRequests = [];
  let stage = 0;
  process.env.PI_OFFLINE = "1";
  try {
    const modelsPath = await setup(cwd, agentDir);
    const manager = SessionManager.create(cwd, sessionDir);
    const parent = await openSession({
      cwd,
      agentDir,
      modelsPath,
      manager,
      contexts,
      extraFactory: captureFactory("PARENT_CAPTURE"),
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init.body));
        parentRequests.push(body);
        const id = stage++;
        if (id === 0)
          return functionCallResponse(
            "switch-standard",
            "freeflow_switch_profile",
            { target: "standard", reason: "Collect evidence." },
            "Delegating.",
          );
        if (id === 1)
          return functionCallResponse("capture-selected", "capture_evidence", { label: "selected" }, "Selected.");
        if (id === 2)
          return functionCallResponse("capture-omitted", "capture_evidence", { label: "omitted" }, "Omitted.");
        if (id === 3) return functionCallResponse("capture-shared", "capture_evidence", { label: "shared" }, "Shared.");
        if (id === 4) {
          return functionCallResponse(
            "switch-reasoning",
            "freeflow_switch_profile",
            {
              target: "reasoning",
              reason: "Assess.",
              projection: {
                include: [exposedRefFor(contexts, "PARENT_CAPTURE_SELECTED")],
                shared: [exposedRefFor(contexts, "PARENT_CAPTURE_SHARED")],
              },
            },
            "Returning.",
          );
        }
        return textResponse(`parent-${id}`, "Assessed.");
      },
    });
    resources.push(parent);
    await parent.session.prompt("Run the projected handoff.");
    assert.equal(parentRequests.length, 6, "the parent handoff must complete in one native prompt");
    assert.deepEqual(
      parentRequests.map((request) => request.model),
      ["gpt-4o", "gpt-4", "gpt-4", "gpt-4", "gpt-4", "gpt-4o"],
    );
    assert.ok(manager.getBranch().some((entry) => entry.type === "custom" && entry.customType === PROJECTION_ENTRY));
    const omittedEntry = findToolResultEntry(manager, "PARENT_CAPTURE_OMITTED");
    const parentContext = JSON.stringify(contexts.at(-1)?.messages);
    assert.match(parentContext, /PARENT_CAPTURE_SELECTED/);
    assert.match(parentContext, /PARENT_CAPTURE_SHARED/);
    assert.doesNotMatch(parentContext, /PARENT_CAPTURE_OMITTED/);
    const parentLeaf = manager.getLeafId();
    const parentPath = manager.getSessionFile();
    assert.ok(parentLeaf && parentPath);
    parent.restore();
    parent.session.dispose();
    const childPath = manager.createBranchedSession(parentLeaf);
    const childManager = SessionManager.open(childPath, sessionDir, cwd);
    const childContexts = [];
    const childRequests = [];
    const child = await openSession({
      cwd,
      agentDir,
      modelsPath,
      manager: childManager,
      contexts: childContexts,
      extraFactory: captureFactory("PARENT_CAPTURE"),
      fetchImpl: async (_url, init) => {
        childRequests.push(JSON.parse(String(init.body)));
        return textResponse("child", "Child continued.");
      },
    });
    resources.push(child);
    const childCanonicalBefore = new Map(
      childManager
        .getBranch()
        .filter((entry) => entry.type === "message")
        .map((entry) => [entry.id, structuredClone(entry.message)]),
    );
    const childRoutingBefore = snapshotRoutingEntries(childManager, omittedEntry.id, "child");
    await child.session.prompt("Continue in fork.");
    assert.equal(childRequests.length, 1);
    assert.deepEqual(
      childRequests.map((request) => request.model),
      ["gpt-4o"],
    );
    assert.equal(
      childContexts.some((context) => context.aborted),
      false,
    );
    assert.equal(child.errors.length, 0);
    assertRoutingEntriesUnchanged(childManager, childRoutingBefore, "child");
    for (const [entryId, message] of childCanonicalBefore) {
      const entry = childManager.getEntry(entryId);
      assert.ok(entry);
      assert.deepEqual(entry.message, message, `child canonical message changed: ${entryId}`);
    }
    const childContext = JSON.stringify(childContexts.at(-1)?.messages);
    assert.match(childContext, /PARENT_CAPTURE_SELECTED/);
    assert.match(childContext, /PARENT_CAPTURE_SHARED/);
    assert.doesNotMatch(childContext, /PARENT_CAPTURE_OMITTED/);
    const childLeaf = childManager.getLeafId();
    child.restore();
    child.session.dispose();
    const nestedManager = SessionManager.open(childManager.createBranchedSession(childLeaf), sessionDir, cwd);
    const nestedContexts = [];
    const nestedRequests = [];
    const nested = await openSession({
      cwd,
      agentDir,
      modelsPath,
      manager: nestedManager,
      contexts: nestedContexts,
      extraFactory: captureFactory("PARENT_CAPTURE"),
      fetchImpl: async (_url, init) => {
        nestedRequests.push(JSON.parse(String(init.body)));
        return textResponse("nested", "Nested continued.");
      },
    });
    resources.push(nested);
    const nestedCanonicalBefore = new Map(
      nestedManager
        .getBranch()
        .filter((entry) => entry.type === "message")
        .map((entry) => [entry.id, structuredClone(entry.message)]),
    );
    const nestedRoutingBefore = snapshotRoutingEntries(nestedManager, omittedEntry.id, "nested child");
    await nested.session.prompt("Continue in nested clone.");
    assert.equal(nestedRequests.length, 1);
    assert.deepEqual(
      nestedRequests.map((request) => request.model),
      ["gpt-4o"],
    );
    assert.equal(
      nestedContexts.some((context) => context.aborted),
      false,
    );
    assert.equal(nested.errors.length, 0);
    assertRoutingEntriesUnchanged(nestedManager, nestedRoutingBefore, "nested child");
    for (const [entryId, message] of nestedCanonicalBefore) {
      const entry = nestedManager.getEntry(entryId);
      assert.ok(entry);
      assert.deepEqual(entry.message, message, `nested canonical message changed: ${entryId}`);
    }
    const nestedContext = JSON.stringify(nestedContexts.at(-1)?.messages);
    assert.match(nestedContext, /PARENT_CAPTURE_SELECTED/);
    assert.match(nestedContext, /PARENT_CAPTURE_SHARED/);
    assert.doesNotMatch(nestedContext, /PARENT_CAPTURE_OMITTED/);
  } finally {
    for (const current of resources) {
      current.restore();
      current.session.dispose();
    }
    globalThis.fetch = originalFetch;
    if (originalOffline === undefined) delete process.env.PI_OFFLINE;
    else process.env.PI_OFFLINE = originalOffline;
    await rm(cwd, { recursive: true, force: true });
    await rm(agentDir, { recursive: true, force: true });
    await rm(sessionDir, { recursive: true, force: true });
  }
});

test("rejects foreign and malformed inherited records", async () => {
  for (const malformed of ["foreign", "selection"]) {
    const cwd = await mkdtemp(join(tmpdir(), `freeflow-${malformed}-cwd-`));
    const agentDir = await mkdtemp(join(tmpdir(), `freeflow-${malformed}-agent-`));
    const sessionDir = await mkdtemp(join(tmpdir(), `freeflow-${malformed}-session-`));
    const originalOffline = process.env.PI_OFFLINE;
    const originalFetch = globalThis.fetch;
    let current;
    process.env.PI_OFFLINE = "1";
    try {
      const modelsPath = await setup(cwd, agentDir);
      const manager = SessionManager.create(cwd, sessionDir);
      if (malformed === "foreign") {
        seedProjection(manager);
        manager.appendCustomEntry(SOURCE_ENTRY, {
          version: 1,
          sessionId: "foreign",
          profile: "standard",
          blockId: "foreign",
          assistant: { sessionId: "foreign", entryId: "missing" },
          toolResults: [],
        });
      } else {
        seedProjection(manager, true);
      }
      const childPath = manager.createBranchedSession(manager.getLeafId());
      const contexts = [];
      const requests = [];
      current = await openSession({
        cwd,
        agentDir,
        modelsPath,
        manager: SessionManager.open(childPath, sessionDir, cwd),
        contexts,
        fetchImpl: async (_url, init) => {
          requests.push(init.body);
          return textResponse("unexpected", "Unexpected.");
        },
      });
      await current.session.prompt("Trigger invalid inherited metadata.");
      assert.equal(requests.length, 0);
      assert.equal(current.errors.length, 0);
      assert.equal(
        contexts.some((context) => context.aborted),
        true,
      );
    } finally {
      current?.restore();
      current?.session.dispose();
      globalThis.fetch = originalFetch;
      if (originalOffline === undefined) delete process.env.PI_OFFLINE;
      else process.env.PI_OFFLINE = originalOffline;
      await rm(cwd, { recursive: true, force: true });
      await rm(agentDir, { recursive: true, force: true });
      await rm(sessionDir, { recursive: true, force: true });
    }
  }
});

test("manual profiles bypass projection and re-enter Automatic control", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-manual-cwd-"));
  const agentDir = await mkdtemp(join(tmpdir(), "freeflow-manual-agent-"));
  const sessionDir = await mkdtemp(join(tmpdir(), "freeflow-manual-session-"));
  const originalOffline = process.env.PI_OFFLINE;
  const originalFetch = globalThis.fetch;
  const contexts = [];
  const resources = [];
  let index = 0;
  process.env.PI_OFFLINE = "1";
  try {
    const modelsPath = await setup(cwd, agentDir);
    const manager = SessionManager.create(cwd, sessionDir);
    seedProjection(manager);
    const current = await openSession({
      cwd,
      agentDir,
      modelsPath,
      manager,
      contexts,
      extraFactory: captureFactory(),
      fetchImpl: async (_url, init) => {
        JSON.parse(String(init.body));
        const id = index++;
        if (id === 0) return textResponse("before", "Before.");
        if (id === 1) return functionCallResponse("capture", "capture_evidence", { label: "manual" }, "Capture.");
        if (id === 2) return textResponse("manual", "Manual.");
        return textResponse(`after-${id}`, "After.");
      },
    });
    resources.push(current);
    await current.session.prompt("Before manual.");
    const command = current.session.extensionRunner.getCommand("freeflow");
    assert.ok(command);
    for (const profile of ["standard", "reasoning"]) {
      await command.handler(`profile ${profile}`, current.session.extensionRunner.createCommandContext());
      await current.session.prompt(`Manual ${profile}.`);
      assert.equal(contexts.at(-1).aborted, false);
      await command.handler("profile auto", current.session.extensionRunner.createCommandContext());
      await current.session.prompt(`Automatic after ${profile}.`);
      assert.equal(contexts.at(-1).aborted, false);
    }
    assert.equal(current.errors.length, 0);
  } finally {
    for (const current of resources) {
      current.restore();
      current.session.dispose();
    }
    globalThis.fetch = originalFetch;
    if (originalOffline === undefined) delete process.env.PI_OFFLINE;
    else process.env.PI_OFFLINE = originalOffline;
    await rm(cwd, { recursive: true, force: true });
    await rm(agentDir, { recursive: true, force: true });
    await rm(sessionDir, { recursive: true, force: true });
  }
});

for (const profile of ["standard", "reasoning"]) {
  test(`persists a Manual ${profile} hold through reload before Automatic re-entry`, async () => {
    const cwd = await mkdtemp(join(tmpdir(), `freeflow-manual-reload-${profile}-cwd-`));
    const agentDir = await mkdtemp(join(tmpdir(), `freeflow-manual-reload-${profile}-agent-`));
    const sessionDir = await mkdtemp(join(tmpdir(), `freeflow-manual-reload-${profile}-session-`));
    const originalOffline = process.env.PI_OFFLINE;
    const originalFetch = globalThis.fetch;
    const initialContexts = [];
    const reloadedContexts = [];
    const resources = [];
    const requests = [];
    const marker = `MANUAL_RELOAD_${profile.toUpperCase()}`;
    const beforeBody = `${marker}_BEFORE_${profile.toUpperCase()}`;
    const afterBody = `${marker}_AFTER_${profile.toUpperCase()}`;
    let index = 0;
    process.env.PI_OFFLINE = "1";
    try {
      const modelsPath = await setup(cwd, agentDir);
      const manager = SessionManager.create(cwd, sessionDir);
      seedProjection(manager);
      const fetchImpl = async (_url, init) => {
        requests.push(JSON.parse(String(init.body)));
        const id = index++;
        if (id === 0) return textResponse("before", "Before.");
        if (id === 1) {
          return functionCallResponse(
            `capture-before-${profile}`,
            "capture_evidence",
            { label: `before_${profile}` },
            "Capture before reload.",
          );
        }
        if (id === 2) return textResponse("manual-before", "Manual before reload.");
        if (id === 3) {
          return functionCallResponse(
            `capture-after-${profile}`,
            "capture_evidence",
            { label: `after_${profile}` },
            "Capture after reload.",
          );
        }
        if (id === 4) return textResponse("manual-after", "Manual after reload.");
        if (id === 5) return textResponse("automatic-after", "Automatic after reload.");
        throw new Error(`unexpected provider request ${id}`);
      };
      let current = await openSession({
        cwd,
        agentDir,
        modelsPath,
        manager,
        contexts: initialContexts,
        fetchImpl,
        extraFactory: captureFactory(marker),
      });
      resources.push(current);
      await current.session.prompt("Before reload.");
      const command = current.session.extensionRunner.getCommand("freeflow");
      assert.ok(command);
      await current.session.prompt(`/freeflow profile ${profile}`);
      const sourceCountBeforeManualTurn = manager
        .getBranch()
        .filter((entry) => entry.type === "custom" && entry.customType === SOURCE_ENTRY).length;
      await current.session.prompt(`Manual ${profile} before reload.`);
      const beforeEntry = findToolResultEntry(manager, beforeBody);
      assert.ok(
        manager
          .getBranch()
          .filter((entry) => entry.type === "custom" && entry.customType === SOURCE_ENTRY)
          .some(
            (entry) =>
              entry.data?.profile === profile &&
              entry.data.toolResults?.some((result) => result.entryId === beforeEntry.id),
          ),
        "Manual tool result must append a source journal before disposal",
      );
      assert.ok(
        manager.getBranch().filter((entry) => entry.type === "custom" && entry.customType === SOURCE_ENTRY).length >
          sourceCountBeforeManualTurn,
      );
      assert.equal(initialContexts.at(-1).aborted, false);
      assert.equal(current.errors.length, 0);
      const sessionPath = manager.getSessionFile();
      assert.ok(sessionPath);
      current.restore();
      current.session.dispose();
      resources.pop();
      current = undefined;

      const reopenedManager = SessionManager.open(sessionPath, sessionDir, cwd);
      const reopened = await openSession({
        cwd,
        agentDir,
        modelsPath,
        manager: reopenedManager,
        contexts: reloadedContexts,
        fetchImpl,
        extraFactory: captureFactory(marker),
        usePersistedModel: true,
      });
      resources.push(reopened);
      await reopened.session.prompt(`Manual ${profile} after reload.`);
      const afterEntry = findToolResultEntry(reopenedManager, afterBody);
      assert.ok(
        reopenedManager
          .getBranch()
          .filter((entry) => entry.type === "custom" && entry.customType === SOURCE_ENTRY)
          .some(
            (entry) =>
              entry.data?.profile === profile &&
              entry.data.toolResults?.some((result) => result.entryId === afterEntry.id),
          ),
        "reloaded Manual tool result must append a source journal",
      );
      assert.equal(reloadedContexts.at(-1).aborted, false);
      assert.equal(reopened.errors.length, 0);
      const restoredContext = JSON.stringify(reloadedContexts.at(-1)?.messages);
      assert.match(restoredContext, /Control: `manual`/);
      assert.match(restoredContext, new RegExp("Profile: `" + profile + "`"));
      const reopenedCommand = reopened.session.extensionRunner.getCommand("freeflow");
      assert.ok(reopenedCommand);

      const requestsBeforeRelease = requests.length;
      await reopened.session.prompt("/freeflow profile auto");
      assert.equal(requests.length, requestsBeforeRelease);
      const requestsBeforeAutomaticTurn = requests.length;
      await reopened.session.prompt("Automatic after reload.");
      assert.equal(requests.length, requestsBeforeAutomaticTurn + 1);
      assert.equal(
        reloadedContexts.some((context) => context.aborted),
        false,
      );
      assert.equal(reopened.errors.length, 0);
      const automaticContext = JSON.stringify(reloadedContexts.at(-1)?.messages);
      assert.match(automaticContext, /Control: `automatic`/);
      assert.match(automaticContext, /Profile: `reasoning`/);
      for (const body of [beforeBody, afterBody]) {
        assert.equal(
          automaticContext.includes(body),
          profile === "reasoning",
          `Automatic Reasoning projection visibility for ${body}`,
        );
      }
    } finally {
      for (const current of resources) {
        current.restore();
        current.session.dispose();
      }
      globalThis.fetch = originalFetch;
      if (originalOffline === undefined) delete process.env.PI_OFFLINE;
      else process.env.PI_OFFLINE = originalOffline;
      await rm(cwd, { recursive: true, force: true });
      await rm(agentDir, { recursive: true, force: true });
      await rm(sessionDir, { recursive: true, force: true });
    }
  });
}
