import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import freeflowExtension from "../../dist/index.js";

function createHarness(cwd, contextEntries) {
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
      tools.push(tool);
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
      buildContextEntries: () => entries.filter((entry) => entry.type === "message"),
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

async function writeConfig(cwd, contextVirtualization) {
  await mkdir(join(cwd, ".freeflow"));
  await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({ contextVirtualization }, null, 2), "utf8");
}

test("enabled Context Virtualization registers, projects, archives, restores, and reports through commands", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-context-extension-"));
  try {
    await writeConfig(cwd, true);
    const harness = createHarness(cwd, [toolResultEntry()]);
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

    const archivedContext = await harness.handlers.get("context")(
      { messages: [harness.entries[0].message] },
      harness.ctx,
    );
    assert.match(archivedContext.messages[0].content[0].text, /context archived: ctx:tool-1/);
    assert.match(archivedContext.messages[0].content[0].text, /failure summary/);

    await harness.commands
      .find((command) => command.name === "freeflow")
      .definition.handler("context list", harness.ctx);
    assert.match(harness.notifications.at(-1).message, /ctx:tool-1/);

    const restored = await contextTool.execute(
      "context-restore",
      { operation: "restore", refs: ["ctx:tool-1"] },
      undefined,
      undefined,
      harness.ctx,
    );
    assert.equal(restored.details.result.status, "ok");
    const restoredContext = await harness.handlers.get("context")(
      { messages: [harness.entries[0].message] },
      harness.ctx,
    );
    assert.match(restoredContext.messages[0].content.at(-1).text, /ctx:tool-1/);
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
