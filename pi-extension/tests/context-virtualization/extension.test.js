import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import freeflowExtension from "../../dist/index.js";

function createHarness(cwd, contextEntries, activeContextEntries = contextEntries) {
  const handlers = new Map();
  const tools = [];
  const commands = [];
  const entries = contextEntries;
  let activeToolNames;
  let nextId = 1;
  const notifications = [];
  const statuses = [];
  const pi = {
    registerTool(tool) {
      const index = tools.findIndex((existing) => existing.name === tool.name);
      if (index >= 0) tools[index] = tool;
      else tools.push(tool);
    },
    registerCommand(name, definition) {
      commands.push({ name, definition });
    },
    on(event, handler) {
      handlers.set(event, handler);
    },
    appendEntry(customType, data) {
      entries.push({
        type: "custom",
        id: `journal-${nextId++}`,
        parentId: entries.at(-1)?.id ?? null,
        customType,
        data,
      });
    },
    getAllTools() {
      return tools.map((tool) => ({ name: tool.name }));
    },
    getActiveTools() {
      return activeToolNames ?? tools.map((tool) => tool.name);
    },
    setActiveTools(names) {
      activeToolNames = [...names];
    },
  };
  const ctx = {
    cwd,
    mode: "tui",
    hasUI: true,
    isIdle: () => true,
    sessionManager: {
      getSessionId: () => "session-1",
      getLeafId: () => entries.at(-1)?.id ?? null,
      getBranch: () => entries,
      buildContextEntries: () => activeContextEntries,
    },
    ui: {
      notify(message, level) {
        notifications.push({ message, level });
      },
      setStatus(name, value) {
        statuses.push({ name, value });
      },
    },
    async reload() {},
  };
  freeflowExtension(pi);
  return {
    handlers,
    tools,
    commands,
    entries,
    pi,
    ctx,
    notifications,
    statuses,
    activeToolNames: () => activeToolNames,
  };
}

function toolResultEntry() {
  return {
    type: "message",
    id: "tool-1",
    parentId: null,
    message: {
      role: "toolResult",
      toolCallId: "call-1",
      toolName: "read",
      content: [{ type: "text", text: "raw result" }],
      isError: false,
    },
  };
}

function untouchedToolResultEntry() {
  return {
    type: "message",
    id: "tool-2",
    parentId: "tool-1",
    message: {
      role: "toolResult",
      toolCallId: "call-2",
      toolName: "bash",
      content: [{ type: "text", text: "untouched result" }],
      isError: false,
    },
  };
}

function userEntry(id, text, parentId = null) {
  return {
    type: "message",
    id,
    parentId,
    message: { role: "user", content: [{ type: "text", text }] },
  };
}

function historyToolResultEntry(id, text, toolName = "bash", parentId = null) {
  return {
    type: "message",
    id,
    parentId,
    message: {
      role: "toolResult",
      toolCallId: `call-${id}`,
      toolName,
      content: [{ type: "text", text }],
      isError: true,
    },
  };
}

function assistantEntry(id, content, parentId = null) {
  return {
    type: "message",
    id,
    parentId,
    message: { role: "assistant", content },
  };
}

async function writeConfig(cwd, config) {
  await mkdir(join(cwd, ".freeflow"), { recursive: true });
  const value = typeof config === "boolean" ? { contextVirtualization: config } : config;
  await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify(value, null, 2), "utf8");
}

const testTheme = {
  fg(_color, text) {
    return text;
  },
  bold(text) {
    return text;
  },
  dim(text) {
    return text;
  },
  italic(text) {
    return text;
  },
};

function renderComponent(component) {
  return component.render(120).join("\\n");
}

test("enabled Context Virtualization registers, projects, archives, restores, and reports through commands", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-context-extension-"));
  try {
    await writeConfig(cwd, true);
    const harness = createHarness(cwd, [toolResultEntry(), untouchedToolResultEntry()]);
    await harness.handlers.get("session_start")({ reason: "startup" }, harness.ctx);

    assert.ok(harness.activeToolNames().includes("freeflow_context"));
    const before = await harness.handlers.get("before_agent_start")({ systemPrompt: "base" }, harness.ctx);
    assert.match(before.systemPrompt, /Loaded Context Virtualization Skill/);

    const contextResult = await harness.handlers.get("context")(
      { messages: [harness.entries[0].message] },
      harness.ctx,
    );
    assert.match(contextResult.messages[0].content.at(-1).text, /ctx:tool-1/);

    const contextTool = harness.tools.find((tool) => tool.name === "freeflow_context");
    assert.ok(contextTool);
    assert.doesNotMatch(contextTool.description, /conversation history/i);
    const staleSearch = await contextTool.execute(
      "context-stale-search",
      { operation: "search", query: "not enabled" },
      undefined,
      undefined,
      harness.ctx,
    );
    assert.equal(staleSearch.details.result.status, "rejected");
    assert.equal(staleSearch.details.result.reason, "operation_disabled");
    assert.equal(staleSearch.details.result.message, undefined);
    const staleCompact = contextTool.renderResult(staleSearch, { expanded: false, isPartial: false }, testTheme, {
      args: { operation: "search", query: "not enabled" },
    });
    assert.match(renderComponent(staleCompact), /operation_disabled/);
    const archived = await contextTool.execute(
      "context-archive",
      {
        operation: "archive",
        targets: [{ ref: "ctx:tool-1", retained: "The result is needed only as a failure summary." }],
      },
      undefined,
      undefined,
      harness.ctx,
    );
    assert.equal(archived.details.result.status, "ok");
    const archiveCompact = contextTool.renderResult(archived, { expanded: false, isPartial: false }, testTheme, {
      args: { operation: "archive", targets: [{ ref: "ctx:tool-1" }] },
    });
    assert.match(renderComponent(archiveCompact), /archive · ok · 1 changed/);
    assert.match(renderComponent(archiveCompact), /Archived 1 tool result/);
    assert.deepEqual(archived.details.result.retained, {
      "ctx:tool-1": "The result is needed only as a failure summary.",
    });
    assert.equal(
      archived.content[0].text,
      [
        "Context Virtualization: archive",
        "Status: ok",
        "Changed: ctx:tool-1",
        "Message: Archived 1 tool result from future context projections.",
        "Retained meaning:",
        "  ctx:tool-1: The result is needed only as a failure summary.",
      ].join("\n"),
    );

    const archivedContext = await harness.handlers.get("context")(
      { messages: [harness.entries[0].message] },
      harness.ctx,
    );
    assert.match(archivedContext.messages[0].content[0].text, /context archived: ctx:tool-1/);
    assert.match(archivedContext.messages[0].content[0].text, /failure summary/);

    await harness.commands
      .find((command) => command.name === "freeflow")
      .definition.handler("context list", harness.ctx);
    const listMessage = harness.notifications.at(-1).message;
    assert.match(listMessage, /^Context Virtualization: archived projections/);
    assert.match(listMessage, /Ref: ctx:tool-1/);
    assert.match(listMessage, /Tool: read/);
    assert.match(listMessage, /State: retained/);
    assert.doesNotMatch(listMessage, /ctx:tool-2/);
    assert.doesNotMatch(listMessage, /\|/);

    await harness.commands
      .find((command) => command.name === "freeflow")
      .definition.handler("context restore ctx:tool-1", harness.ctx);
    assert.equal(harness.notifications.at(-1).message, "Restored 1 projection to full content.");
    const restoredContext = await harness.handlers.get("context")(
      { messages: [harness.entries[0].message] },
      harness.ctx,
    );
    assert.match(restoredContext.messages[0].content.at(-1).text, /ctx:tool-1/);

    await harness.commands
      .find((command) => command.name === "freeflow")
      .definition.handler("context list", harness.ctx);
    assert.equal(
      harness.notifications.at(-1).message,
      "Context Virtualization: no archived projections in the active session branch.",
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("enabled Conversation History exposes only search and retrieve operations", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-conversation-history-extension-"));
  try {
    await writeConfig(cwd, { conversationHistory: true });
    const harness = createHarness(cwd, [toolResultEntry()]);
    await harness.handlers.get("session_start")({ reason: "startup" }, harness.ctx);

    assert.ok(harness.activeToolNames().includes("freeflow_context"));
    const contextTool = harness.tools.find((tool) => tool.name === "freeflow_context");
    assert.ok(contextTool);
    assert.deepEqual(
      contextTool.parameters.oneOf.map((variant) => variant.properties.operation.const),
      ["search", "retrieve"],
    );
    assert.equal(typeof contextTool.renderCall, "function");
    assert.equal(typeof contextTool.renderResult, "function");
    const renderContext = {
      args: { operation: "search", query: "database timeout" },
      state: {},
      toolCallId: "render-test",
      cwd,
      executionStarted: true,
      argsComplete: true,
      isPartial: false,
      expanded: false,
      showImages: false,
      isError: false,
      invalidate() {},
      lastComponent: undefined,
    };
    const compactCall = contextTool.renderCall(renderContext.args, testTheme, renderContext);
    assert.match(renderComponent(compactCall), /search/i);
    assert.match(renderComponent(compactCall), /database timeout/i);
    const renderResult = {
      content: [{ type: "text", text: "raw full result" }],
      details: {
        result: {
          status: "ok",
          operation: "search",
          query: "database timeout",
          coverage: "complete",
          returned: 1,
          truncated: false,
          hits: [
            {
              ref: "ctx:render-source",
              kind: "toolResult",
              timestamp: "2026-01-01T00:00:00.000Z",
              snippet: "The database timeout was recovered.",
              match: { type: "exact-phrase", matchedTerms: ["database", "timeout"], queryTermCount: 2 },
            },
          ],
        },
      },
    };
    const compactResult = contextTool.renderResult(
      renderResult,
      { expanded: false, isPartial: false },
      testTheme,
      renderContext,
    );
    assert.match(renderComponent(compactResult), /1/);
    assert.match(renderComponent(compactResult), /top exact-phrase/);
    assert.doesNotMatch(
      renderComponent(compactResult),
      /database timeout|raw full result|database timeout was recovered/i,
    );
    const expandedResult = contextTool.renderResult(renderResult, { expanded: true, isPartial: false }, testTheme, {
      ...renderContext,
      expanded: true,
    });
    assert.match(renderComponent(expandedResult), /ctx:render-source/);
    assert.match(renderComponent(expandedResult), /database timeout was recovered/);
    assert.match(contextTool.description, /hidden conversation history/i);
    assert.doesNotMatch(contextTool.description, /future context projections/i);
    const before = await harness.handlers.get("before_agent_start")({ systemPrompt: "base" }, harness.ctx);
    assert.match(before.systemPrompt, /Loaded Conversation History Skill/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Freeflow Context exposes both operation families when both features are enabled", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-context-both-features-"));
  try {
    await writeConfig(cwd, { contextVirtualization: true, conversationHistory: true });
    const harness = createHarness(cwd, [toolResultEntry()]);
    await harness.handlers.get("session_start")({ reason: "startup" }, harness.ctx);
    const contextTool = harness.tools.find((tool) => tool.name === "freeflow_context");
    assert.deepEqual(
      contextTool.parameters.oneOf.map((variant) => variant.properties.operation.const),
      ["archive", "restore", "search", "retrieve"],
    );
    assert.ok(harness.activeToolNames().includes("freeflow_context"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Conversation History searches hidden active-branch entries and retrieves selected content", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-conversation-history-runtime-"));
  try {
    await writeConfig(cwd, { conversationHistory: true });
    const visible = userEntry("visible", "Current visible question");
    const hidden = historyToolResultEntry(
      "hidden",
      "Authentication failed because the database timeout expired.",
      "bash",
      "visible",
    );
    const excluded = historyToolResultEntry(
      "freeflow-result",
      "Authentication failed because the database timeout expired.",
      " freeflow_context ",
      "hidden",
    );
    const harness = createHarness(cwd, [visible, hidden, excluded], [visible]);
    await harness.handlers.get("session_start")({ reason: "startup" }, harness.ctx);
    await harness.handlers.get("context")({ messages: [visible.message] }, harness.ctx);
    await harness.commands
      .find((command) => command.name === "freeflow")
      .definition.handler("context status", harness.ctx);
    assert.match(harness.notifications.at(-1).message, /^Freeflow Context: available/);
    assert.match(harness.notifications.at(-1).message, /Conversation History: enabled/);

    const contextTool = harness.tools.find((tool) => tool.name === "freeflow_context");
    const search = await contextTool.execute(
      "context-search",
      { operation: "search", query: "database timeout", limit: 8 },
      undefined,
      undefined,
      harness.ctx,
    );
    assert.equal(search.details.result.status, "ok");
    assert.deepEqual(
      search.details.result.hits.map((hit) => hit.ref),
      ["ctx:hidden"],
    );
    assert.match(search.content[0].text, /^Conversation History: search/);
    assert.match(search.content[0].text, /Query: database timeout/);
    assert.match(search.content[0].text, /Match: exact-phrase/);
    assert.match(search.content[0].text, /Term coverage: 2\/2/);
    assert.match(search.content[0].text, /Tools: bash/);
    assert.match(search.content[0].text, /Error: yes/);
    assert.doesNotMatch(search.content[0].text, /ctx:visible|ctx:freeflow-result/);

    const filteredSearch = await contextTool.execute(
      "context-search-trimmed-tool-filter",
      { operation: "search", query: "database timeout", toolNames: [" BASH "] },
      undefined,
      undefined,
      harness.ctx,
    );
    assert.equal(filteredSearch.details.result.status, "ok");
    assert.deepEqual(
      filteredSearch.details.result.hits.map((hit) => hit.ref),
      ["ctx:hidden"],
    );

    const retrieve = await contextTool.execute(
      "context-retrieve",
      { operation: "retrieve", refs: ["ctx:hidden"] },
      undefined,
      undefined,
      harness.ctx,
    );
    assert.equal(retrieve.details.result.status, "ok");
    assert.equal(retrieve.details.result.items[0].ref, "ctx:hidden");
    assert.match(retrieve.content[0].text, /Source characters:/);
    assert.match(retrieve.content[0].text, /Returned characters:/);
    assert.match(retrieve.details.result.items[0].content, /database timeout/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("mixed assistant sources retain ordinary content and exclude Freeflow tool calls", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-conversation-history-mixed-assistant-"));
  try {
    await writeConfig(cwd, { conversationHistory: true });
    const assistant = assistantEntry("mixed-assistant", [
      { type: "text", text: "The ordinary answer explains the database timeout." },
      { type: "toolCall", name: "freeflow_context", arguments: { secret: "administrative detail" } },
      { type: "toolCall", name: "bash", arguments: { command: "printf database" } },
    ]);
    assistant.timestamp = "not-a-timestamp";
    const harness = createHarness(cwd, [assistant], []);
    await harness.handlers.get("session_start")({ reason: "startup" }, harness.ctx);
    await harness.handlers.get("context")({ messages: [] }, harness.ctx);
    const contextTool = harness.tools.find((tool) => tool.name === "freeflow_context");

    const search = await contextTool.execute(
      "context-search-mixed-assistant",
      { operation: "search", query: "ordinary answer" },
      undefined,
      undefined,
      harness.ctx,
    );
    assert.equal(search.details.result.status, "ok");
    assert.deepEqual(
      search.details.result.hits.map((hit) => hit.ref),
      ["ctx:mixed-assistant"],
    );
    assert.deepEqual(search.details.result.hits[0].toolNames, ["bash"]);

    const retrieve = await contextTool.execute(
      "context-retrieve-mixed-assistant",
      { operation: "retrieve", refs: ["ctx:mixed-assistant"] },
      undefined,
      undefined,
      harness.ctx,
    );
    assert.equal(retrieve.details.result.status, "ok");
    assert.equal(retrieve.details.result.items[0].timestamp, "1970-01-01T00:00:00.000Z");
    assert.match(retrieve.details.result.items[0].content, /ordinary answer/);
    assert.match(retrieve.details.result.items[0].content, /printf database/);
    assert.doesNotMatch(retrieve.details.result.items[0].content, /administrative detail/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("archived Context Virtualization sources return to hidden Conversation History", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-conversation-history-archived-source-"));
  try {
    await writeConfig(cwd, { contextVirtualization: true, conversationHistory: true });
    const source = historyToolResultEntry("archived-source", "The archived database timeout is recoverable.");
    const harness = createHarness(cwd, [source], [source]);
    await harness.handlers.get("session_start")({ reason: "startup" }, harness.ctx);
    await harness.handlers.get("context")({ messages: [source.message] }, harness.ctx);

    const contextTool = harness.tools.find((tool) => tool.name === "freeflow_context");
    const archived = await contextTool.execute(
      "context-archive-source",
      { operation: "archive", targets: [{ ref: "ctx:archived-source" }] },
      undefined,
      undefined,
      harness.ctx,
    );
    assert.equal(archived.details.result.status, "ok");

    await harness.handlers.get("context")({ messages: [source.message] }, harness.ctx);
    const search = await contextTool.execute(
      "context-search-archived-source",
      { operation: "search", query: "database timeout" },
      undefined,
      undefined,
      harness.ctx,
    );
    assert.equal(search.details.result.status, "ok");
    assert.deepEqual(
      search.details.result.hits.map((hit) => hit.ref),
      ["ctx:archived-source"],
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("visible retrieved sources are excluded until the retrieval result is archived", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-conversation-history-materialization-"));
  try {
    await writeConfig(cwd, { conversationHistory: true, contextVirtualization: true });
    const source = historyToolResultEntry("materialized-source", "The original database timeout evidence.");
    const retrievalResult = historyToolResultEntry(
      "retrieval-result",
      "Ref ctx:materialized-source\nThe original database timeout evidence.",
      "freeflow_context",
    );
    retrievalResult.message.details = {
      result: {
        status: "ok",
        operation: "retrieve",
        items: [{ ref: "ctx:materialized-source", kind: "toolResult", content: source.message.content[0].text }],
      },
    };
    const harness = createHarness(cwd, [source, retrievalResult], [retrievalResult]);
    await harness.handlers.get("session_start")({ reason: "startup" }, harness.ctx);
    await harness.handlers.get("context")({ messages: [retrievalResult.message] }, harness.ctx);
    const contextTool = harness.tools.find((tool) => tool.name === "freeflow_context");

    const hiddenSearch = await contextTool.execute(
      "context-search-materialized-source",
      { operation: "search", query: "database timeout" },
      undefined,
      undefined,
      harness.ctx,
    );
    assert.equal(hiddenSearch.details.result.status, "rejected");
    assert.equal(hiddenSearch.details.result.reason, "no_hidden_conversation_history");

    const archive = await contextTool.execute(
      "context-archive-retrieval-result",
      { operation: "archive", targets: [{ ref: "ctx:retrieval-result" }] },
      undefined,
      undefined,
      harness.ctx,
    );
    assert.equal(archive.details.result.status, "ok");

    await writeConfig(cwd, { conversationHistory: true });
    await harness.handlers.get("session_tree")({}, harness.ctx);
    await harness.handlers.get("context")({ messages: [retrievalResult.message] }, harness.ctx);
    const stillMaterialized = await contextTool.execute(
      "context-search-while-virtualization-disabled",
      { operation: "search", query: "database timeout" },
      undefined,
      undefined,
      harness.ctx,
    );
    assert.equal(stillMaterialized.details.result.status, "rejected");
    assert.equal(stillMaterialized.details.result.reason, "no_hidden_conversation_history");

    await writeConfig(cwd, { conversationHistory: true, contextVirtualization: true });
    await harness.handlers.get("session_tree")({}, harness.ctx);
    await harness.handlers.get("context")({ messages: [retrievalResult.message] }, harness.ctx);

    const searchableAgain = await contextTool.execute(
      "context-search-after-archive",
      { operation: "search", query: "database timeout" },
      undefined,
      undefined,
      harness.ctx,
    );
    assert.equal(searchableAgain.details.result.status, "ok");
    assert.deepEqual(
      searchableAgain.details.result.hits.map((hit) => hit.ref),
      ["ctx:materialized-source"],
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Conversation History rejects visible-only searches and bounds oversized retrieval", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-conversation-history-bounds-"));
  try {
    await writeConfig(cwd, { conversationHistory: true });
    const visible = userEntry("visible", "Everything needed is visible now");
    const visibleHarness = createHarness(cwd, [visible], [visible]);
    await visibleHarness.handlers.get("session_start")({ reason: "startup" }, visibleHarness.ctx);
    await visibleHarness.handlers.get("context")({ messages: [visible.message] }, visibleHarness.ctx);
    const visibleTool = visibleHarness.tools.find((tool) => tool.name === "freeflow_context");
    const emptySearch = await visibleTool.execute(
      "context-empty-search",
      { operation: "search", query: "anything hidden" },
      undefined,
      undefined,
      visibleHarness.ctx,
    );
    assert.equal(emptySearch.details.result.status, "rejected");
    assert.equal(emptySearch.details.result.reason, "no_hidden_conversation_history");
    assert.match(emptySearch.content[0].text, /Reason: no_hidden_conversation_history/);

    const oversizedText = `${"database context\n".repeat(700)}${"unrelated output\n".repeat(100)}${"database timeout\n".repeat(10)}${"more output\n".repeat(700)}`;
    const oversized = historyToolResultEntry("oversized", oversizedText);
    const hiddenHarness = createHarness(cwd, [oversized], []);
    await hiddenHarness.handlers.get("session_start")({ reason: "startup" }, hiddenHarness.ctx);
    await hiddenHarness.handlers.get("context")({ messages: [] }, hiddenHarness.ctx);
    const hiddenTool = hiddenHarness.tools.find((tool) => tool.name === "freeflow_context");
    const zeroSearch = await hiddenTool.execute(
      "context-zero-search",
      { operation: "search", query: "term that is absent" },
      undefined,
      undefined,
      hiddenHarness.ctx,
    );
    assert.equal(zeroSearch.details.result.status, "ok");
    assert.equal(zeroSearch.details.result.returned, 0);
    assert.match(zeroSearch.content[0].text, /No lexical matches were found in hidden active-branch history/);

    const duplicateRef = await hiddenTool.execute(
      "context-duplicate-normalized-ref",
      { operation: "retrieve", refs: ["ctx:oversized", "ctx:oversized "], focus: "database timeout" },
      undefined,
      undefined,
      hiddenHarness.ctx,
    );
    assert.equal(duplicateRef.details.result.status, "rejected");
    assert.equal(duplicateRef.details.result.reason, "duplicate_ref");

    const retrieve = await hiddenTool.execute(
      "context-oversized-retrieve",
      { operation: "retrieve", refs: ["ctx:oversized"], focus: "database timeout" },
      undefined,
      undefined,
      hiddenHarness.ctx,
    );
    assert.equal(retrieve.details.result.status, "ok");
    assert.equal(retrieve.details.result.items[0].completeness, "partial");
    assert.ok(retrieve.details.result.items[0].returnedCharacters <= 8000);
    const focusedContent = retrieve.details.result.items[0].content;
    const focusedStart = oversizedText.indexOf(focusedContent);
    assert.ok(focusedStart === 0 || oversizedText[focusedStart - 1] === "\n");
    assert.ok(focusedStart + focusedContent.length >= oversizedText.length || focusedContent.endsWith("\n"));
    assert.match(focusedContent, /database timeout/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Conversation History reports partial coverage for invalid eligible sources", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-conversation-history-partial-coverage-"));
  try {
    await writeConfig(cwd, { conversationHistory: true });
    const invalid = historyToolResultEntry("invalid-source", "An invalid tool name should not become searchable.");
    invalid.message.toolName = "x".repeat(129);
    const harness = createHarness(cwd, [invalid], []);
    await harness.handlers.get("session_start")({ reason: "startup" }, harness.ctx);
    await harness.handlers.get("context")({ messages: [] }, harness.ctx);
    const contextTool = harness.tools.find((tool) => tool.name === "freeflow_context");
    const search = await contextTool.execute(
      "context-partial-coverage",
      { operation: "search", query: "invalid tool" },
      undefined,
      undefined,
      harness.ctx,
    );
    assert.equal(search.details.result.status, "ok");
    assert.equal(search.details.result.coverage, "partial");
    assert.equal(search.details.result.skippedEntries, 1);
    assert.equal(search.details.result.returned, 0);
    assert.match(search.content[0].text, /Skipped entries: 1/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("visible invalid sources do not make an empty hidden corpus partial", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-conversation-history-visible-invalid-"));
  try {
    await writeConfig(cwd, { conversationHistory: true });
    const invalid = historyToolResultEntry("visible-invalid", "This visible source has an invalid tool name.");
    invalid.message.toolName = "x".repeat(129);
    const harness = createHarness(cwd, [invalid], [invalid]);
    await harness.handlers.get("session_start")({ reason: "startup" }, harness.ctx);
    await harness.handlers.get("context")({ messages: [invalid.message] }, harness.ctx);
    const contextTool = harness.tools.find((tool) => tool.name === "freeflow_context");
    const search = await contextTool.execute(
      "context-visible-invalid",
      { operation: "search", query: "invalid source" },
      undefined,
      undefined,
      harness.ctx,
    );
    assert.equal(search.details.result.status, "rejected");
    assert.equal(search.details.result.reason, "no_hidden_conversation_history");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("disabled Context Virtualization hides the tool and leaves context unchanged", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-context-disabled-"));
  try {
    await writeConfig(cwd, false);
    const harness = createHarness(cwd, [toolResultEntry()]);
    await harness.handlers.get("session_start")({ reason: "startup" }, harness.ctx);

    assert.ok(!harness.activeToolNames().includes("freeflow_context"));
    const contextResult = await harness.handlers.get("context")(
      { messages: [harness.entries[0].message] },
      harness.ctx,
    );
    assert.equal(contextResult, undefined);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
