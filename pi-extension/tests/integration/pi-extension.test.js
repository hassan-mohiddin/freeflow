import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { promisify } from "node:util";
import { SessionManager } from "@earendil-works/pi-coding-agent";

import freeflowExtension from "../../dist/index.js";
import { handleFreeflowCommand } from "../../dist/host/settings/freeflow-command.js";
import {
  readCapabilityState,
  readFreeflowConfigLayers,
  resetSessionOverrides,
  restoreSessionOverrides,
  setSessionCoreOverride,
} from "../../dist/host/config.js";
import { setFreeflowStatus } from "../../dist/host/status.js";
import { FREEFLOW_MODEL_SKILL_NAMES } from "../../dist/host/catalog.js";
import { matches } from "../../dist/cognitive-routing/schemas.js";
import { contextHandler, beforeAgentStartHandler } from "../fixtures/pi087-context.js";

const execFileAsync = promisify(execFile);

function loadExtension(extension = freeflowExtension, runtimeApi = {}) {
  const handlers = new Map();
  const tools = [];
  const commands = [];
  const shortcuts = [];
  const entries = [];
  const sentMessages = [];
  const sentMessageOptions = [];
  let activeToolNames;
  const pi = {
    registerTool(tool) {
      const index = tools.findIndex((existing) => existing.name === tool.name);
      if (index >= 0) tools[index] = tool;
      else tools.push(tool);
    },
    registerCommand(name, definition) {
      commands.push({ name, definition });
    },
    registerShortcut(shortcut, definition) {
      shortcuts.push({ shortcut, definition });
    },
    on(event, handler) {
      handlers.set(event, handler);
    },
    appendEntry(customType, data) {
      entries.push({ customType, data });
    },
    sendUserMessage(message, options) {
      sentMessages.push(message);
      sentMessageOptions.push(options);
    },
    getAllTools() {
      return tools.map((tool) => ({ name: tool.name, sourceInfo: { source: "extension" } }));
    },
    getActiveTools() {
      return activeToolNames ?? tools.map((tool) => tool.name);
    },
    setActiveTools(names) {
      activeToolNames = [...names];
    },
  };
  Object.assign(pi, runtimeApi);

  extension(pi);
  return {
    pi,
    handlers,
    tools,
    commands,
    shortcuts,
    entries,
    sentMessages,
    sentMessageOptions,
    activeToolNames: () => activeToolNames ?? tools.map((tool) => tool.name),
  };
}

function context(cwd = process.cwd(), sessionEntries = [], activeSessionEntries = sessionEntries) {
  const notifications = [];
  const reloads = [];
  const statuses = [];
  return {
    cwd,
    notifications,
    reloads,
    statuses,
    async reload() {
      reloads.push(true);
    },
    sessionManager: {
      getEntries() {
        return sessionEntries;
      },
      getBranch() {
        return activeSessionEntries;
      },
      buildContextEntries() {
        return activeSessionEntries;
      },
    },
    ui: {
      setStatus(name, value) {
        statuses.push({ name, value });
      },
      notify(message, level) {
        notifications.push({ message, level });
      },
    },
  };
}

const testTheme = {
  fg(_color, text) {
    return text;
  },
  bg(_color, text) {
    return text;
  },
  bold(text) {
    return text;
  },
};

const readyFreeflowContext = {
  corePrompt: "core",
  interactionContractPrompt: "interaction contract",
};

function renderText(component, width = 120) {
  return component.render(width).join("\n");
}

const KEY = { down: "\u001b[B", enter: "\r", tab: "\t", backtab: "\u001b[Z", escape: "\u001b" };

/** Move the settings cursor to the row with this label, inside this section when labels repeat across sections. */
function choose(component, label, section) {
  for (let i = 0; i < 60; i++) {
    const lines = renderText(component).split("\n");
    const at = lines.findIndex((line) => line.startsWith("  › "));
    if (at >= 0) {
      // A section's switch is the section's own row (Task 005); "Enabled" in a section names that row.
      const wanted = label === "Enabled" && section ? section : label;
      const row = lines[at].slice(4);
      const nested = row.startsWith("  ");
      const headerLine = nested
        ? lines
            .slice(0, at)
            .reverse()
            .find((line) => /^ {2}(› |  )?\S/.test(line))
        : lines[at];
      const header = headerLine?.replace(/^ {2}(› |  )?/, "");
      if (row.trim().startsWith(`${wanted} `) && (!section || header?.startsWith(section))) return;
    }
    component.handleInput(KEY.down);
  }
  throw new Error(`No settings row ${section ? `${section} › ` : ""}${label}`);
}

/**
 * Every row of a settings screen: it scrolls the list to the end, and opens each row named in `nested` (one that opens
 * a screen of its own) to read its rows as "Parent › Row". Moving and opening change nothing.
 */
function allSettingsRows(component, nested = new Set()) {
  const rows = new Set();
  const read = () => renderText(component, 200);
  const rowsOf = (text) => [...text.matchAll(/^ {2}(?:› | {2})\s*(\S.*?)\s{2,}\S/gm)].map((match) => match[1]);
  const count = Math.max(Number(/\((\d+)\/(\d+)\)/.exec(read())?.[2] ?? 0), rowsOf(read()).length);
  for (let i = 0; i < count; i++) {
    const text = read();
    for (const row of rowsOf(text)) rows.add(row);
    const selected = /^ {2}› \s*(\S.*?)\s{2,}\S/m.exec(text)?.[1];
    if (selected && nested.has(selected)) {
      component.handleInput(KEY.enter);
      for (const child of rowsOf(read())) rows.add(`${selected} › ${child}`);
      component.handleInput(KEY.escape);
    }
    component.handleInput(KEY.down);
  }
  return rows;
}

/** The rows plugin-docs/settings.md names as opening a screen of their own: "Auto-approve" from "Auto-approve › Attach". */
const nestedRows = (doc) => new Set([...doc.matchAll(/^\| ([^|›]+?) › [^|]+ \|/gm)].map((match) => match[1]));

/** Choose a row and press Enter, waiting for any write. */
async function press(component, label, section) {
  choose(component, label, section);
  component.handleInput(KEY.enter);
  await component.waitForWrites();
}

async function configuredRepo(config = {}) {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-integration-"));
  await mkdir(join(cwd, ".freeflow"));
  await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify(config, null, 2), "utf8");
  return cwd;
}

function lastRuntimeState(messages) {
  return messages.findLast((message) => message.customType === "freeflow-runtime-state");
}

test("keeps Runtime State at a fixed prefix position across refreshes and new turns", async () => {
  const cwd = await configuredRepo();
  try {
    const { handlers } = loadExtension();
    const ctx = context(cwd);
    await handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);

    const conversation = [
      { role: "user", content: "release 0.6.1" },
      { role: "assistant", content: "delegating" },
      { role: "toolResult", toolName: "delegate_work", content: [] },
    ];
    const first = await contextHandler(handlers)({ messages: conversation }, ctx);
    const firstUserIndex = first.messages.findIndex((message) => message.role === "user");
    const firstRuntimeIndex = first.messages.findIndex((message) => message.customType === "freeflow-runtime-state");
    assert.equal(firstRuntimeIndex, firstUserIndex - 1);
    const cachedPrefix = first.messages.slice(0, firstUserIndex + 1);
    assert.equal(first.messages.at(-1).role, "toolResult");

    await handlers.get("session_compact")({ type: "session_compact", reason: "threshold" }, ctx);
    // Pi's context hook is request-time only, so the next call starts from the session transcript.
    const refreshed = await contextHandler(handlers)({ messages: conversation }, ctx);
    const refreshedUserIndex = refreshed.messages.findIndex((message) => message.role === "user");
    const refreshedRuntimeIndex = refreshed.messages.findIndex(
      (message) => message.customType === "freeflow-runtime-state",
    );
    assert.equal(refreshedRuntimeIndex, refreshedUserIndex - 1);
    assert.deepEqual(refreshed.messages.slice(0, refreshedUserIndex + 1), cachedPrefix);
    assert.equal(refreshed.messages.at(-1).role, "toolResult");

    const nextTurn = [...conversation, { role: "assistant", content: "finished" }, { role: "user", content: "stop" }];
    const interrupted = await contextHandler(handlers)({ messages: nextTurn }, ctx);
    const firstNextUserIndex = interrupted.messages.findIndex((message) => message.role === "user");
    const latestUserIndex = interrupted.messages.findLastIndex((message) => message.role === "user");
    const fixedRuntimeIndex = interrupted.messages.findIndex(
      (message) => message.customType === "freeflow-runtime-state",
    );
    assert.equal(fixedRuntimeIndex, firstNextUserIndex - 1);
    assert.deepEqual(interrupted.messages.slice(0, firstNextUserIndex + 1), cachedPrefix);
    assert.equal(interrupted.messages[latestUserIndex].content, "stop");
    assert.equal(interrupted.messages.at(-1).content, "stop");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("new routing tools and projection state follow the configured contract", async () => {
  const cases = [
    { projection: false, expectedMode: "disabled", exposesProjection: false },
    // Projection can be effective while the Coordinator correctly lacks Executor-only tools.
    { projection: true, expectedMode: "enabled", exposesProjection: false },
  ];

  for (const scenario of cases) {
    const cwd = await configuredRepo({
      cognitiveRouting: {
        enabled: true,
        projection: scenario.projection,
        profiles: {
          coordinator: { provider: "test", model: "model-a", thinking: "low" },
          executor: { provider: "test", model: "model-b", thinking: "high" },
        },
      },
    });
    try {
      let liveContext;
      const loaded = loadExtension(freeflowExtension, {
        appendEntry(customType, data) {
          liveContext.sessionManager.appendCustomEntry(customType, data);
        },
        async setModel(model) {
          liveContext.model = model;
          return true;
        },
        setThinkingLevel(level) {
          liveContext.thinkingLevel = level;
        },
      });
      const ctx = context(cwd);
      liveContext = ctx;
      ctx.model = { provider: "test", id: "return" };
      ctx.thinkingLevel = "medium";
      ctx.modelRegistry = cognitiveRoutingModelRegistry();
      ctx.isIdle = () => true;
      ctx.sessionManager = SessionManager.create(cwd, join(cwd, "sessions"));
      // Reconciliation needs genuine persisted ancestry, not a fake mutable branch array.
      ctx.sessionManager.appendMessage({
        role: "assistant",
        content: [{ type: "text", text: "fixture seed" }],
        timestamp: 1,
        stopReason: "stop",
      });
      await loaded.handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
      await beforeAgentStartHandler(loaded.handlers)({ systemPrompt: "base prompt" }, ctx);

      const toolNames = loaded.tools.map((tool) => tool.name);
      assert.deepEqual(
        toolNames.filter((name) => ["delegate_work", "return_work", "routing_unit", "select_evidence"].includes(name)),
        ["delegate_work", "return_work", "routing_unit", "select_evidence"],
      );
      const delegate = loaded.tools.find((tool) => tool.name === "delegate_work");
      const returning = loaded.tools.find((tool) => tool.name === "return_work");
      assert.deepEqual(
        delegate.parameters.oneOf.map((branch) => branch.properties.operation.enum[0]),
        ["assign", "replace"],
      );
      assert.deepEqual(delegate.parameters.properties.worker.enum, ["helper", "executor"]);
      assert.equal(
        delegate.parameters.oneOf.every((branch) => !branch.required.includes("worker")),
        true,
      );
      assert.deepEqual(
        returning.parameters.oneOf.map((branch) => branch.properties.operation.enum[0]),
        ["submit", "supplement", "retry"],
      );
      assert.equal(loaded.activeToolNames().includes("select_evidence"), true);

      const providerContext = await contextHandler(loaded.handlers)({ messages: [] }, ctx);
      assert.match(providerContext.messages[0].content, /Delegation: `executor`/);
      assert.match(providerContext.messages[0].content, new RegExp("Projection: `" + scenario.expectedMode + "`"));

      await loaded.commands.find((command) => command.name === "freeflow").definition.handler("profile executor", ctx);
      const manualContext = await contextHandler(loaded.handlers)({ messages: [] }, ctx);
      assert.match(
        manualContext.messages.findLast((message) => message.customType === "freeflow-runtime-state").content,
        new RegExp("Projection: `" + (scenario.projection ? "manual-bypass" : "disabled") + "`"),
      );
      assert.equal(loaded.activeToolNames().includes("select_evidence"), true);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }
});

test("Pi describes strict evidence-selection operation shapes", () => {
  const { tools } = loadExtension();
  const project = tools.find((tool) => tool.name === "select_evidence");
  assert.ok(project);
  assert.deepEqual(
    project.parameters.oneOf.map((branch) => branch.properties.operation.enum[0]),
    ["inspect", "add", "remove"],
  );
  assert.deepEqual(Object.keys(project.parameters.oneOf[1].properties), ["operation", "refs"]);
  assert.deepEqual(Object.keys(project.parameters.oneOf[2].properties), ["operation", "refs", "reason"]);
  assert.match(project.description, /reason is remove-only/i);
  assert.match(project.promptGuidelines.join(" "), /reason is required only for remove and invalid for add\/inspect/i);
  assert.match(
    project.promptGuidelines.join(" "),
    /for add.*never add refs marked not offered.*for remove.*currently selected or unresolved/i,
  );
  assert.match(project.promptGuidelines.join(" "), /add exact eligible visible refs directly/i);
  assert.doesNotMatch(project.promptGuidelines.join(" "), /inspect first/i);
  assert.match(project.parameters.properties.reason.description, /only for remove/i);
  assert.match(project.parameters.oneOf[1].properties.refs.description, /never add a ref marked not offered/i);
  assert.match(
    project.parameters.oneOf[2].properties.refs.description,
    /currently selected or unresolved.*non-selectable ref may be removed/i,
  );
  assert.match(
    project.parameters.properties.refs.description,
    /For add.*eligible.*For remove.*currently selected or unresolved/i,
  );

  assert.equal(
    matches({ operation: "add", refs: ["ctx:example"], reason: "selection explanation" }, project.parameters),
    false,
  );
  assert.equal(matches({ operation: "add", refs: ["ctx:example"] }, project.parameters), true);
  assert.equal(
    matches({ operation: "remove", refs: ["ctx:example"], reason: "selection explanation" }, project.parameters),
    true,
  );
});

test("Pi exposes additive captured-result recovery grants without changing path grants", () => {
  const { tools } = loadExtension();
  const unit = tools.find((tool) => tool.name === "routing_unit");
  const recover = unit.parameters.oneOf.find((candidate) => candidate.properties.operation.enum[0] === "recover");
  assert.deepEqual(Object.keys(recover.properties), ["operation", "request", "paths", "results"]);
  assert.equal(recover.properties.paths.maxItems, 32);
  assert.equal(recover.properties.results.maxItems, 32);
  assert.equal(recover.properties.results.uniqueItems, true);
  assert.equal(recover.required.includes("results"), false);
});

test("Pi registers the remaining Freeflow commands without mode controls or retired router tools", () => {
  const { commands, shortcuts, tools } = loadExtension();
  const commandNames = commands.map((command) => command.name);
  const toolNames = tools.map((tool) => tool.name);
  const freeflowCommand = commands.find((command) => command.name === "freeflow");

  assert.ok(commandNames.includes("freeflow"));
  assert.ok(!commandNames.includes("output-router"));
  for (const command of ["discuss-work", "track-work", "execute-work", "deliver-work"])
    assert.ok(commandNames.includes(command));
  assert.ok(!commandNames.includes("discover"));
  assert.ok(!commandNames.includes("execute-plan"));
  assert.ok(!commandNames.includes("workflow"));
  assert.deepEqual(shortcuts, []);
  assert.ok(!toolNames.includes("freeflow_context"));
  assert.deepEqual(
    toolNames.filter((name) =>
      ["delegate_work", "return_work", "routing_unit", "select_evidence", "compact_context"].includes(name),
    ),
    ["delegate_work", "return_work", "routing_unit", "select_evidence"],
  );
  // Freeflow compacts on the agent's checkpoint --compact, so compact_context is gone (P1).
  // No Freeflow tool keeps the freeflow_ prefix, which models confused with /freeflow commands.
  assert.deepEqual(
    toolNames.filter((name) => name.startsWith("freeflow_")),
    [],
  );
  // Task memory's tool is named apart from /freeflow task, which models confused it with (grok-4.7 runs).
  assert.ok(toolNames.includes("task_memory"));
  assert.ok(!toolNames.includes("freeflow_switch_profile"));
  assert.ok(!toolNames.includes("freeflow_cognitive_routing_history"));
  assert.ok(freeflowCommand);
  assert.doesNotMatch(freeflowCommand.definition.description, /context tools/i);
  assert.ok(!freeflowCommand.definition.getArgumentCompletions("").some((item) => item.value === "mode"));
  assert.deepEqual(freeflowCommand.definition.getArgumentCompletions("mode "), []);
  assert.ok(!toolNames.some((name) => ["freeflow_status", "freeflow_batch"].includes(name)));
});

test("normal Pi settings expose active Cognitive Routing configuration", async () => {
  const cwd = await configuredRepo({
    cognitiveRouting: {
      enabled: true,
      profiles: {
        coordinator: { provider: "test", model: "model-a", thinking: "low" },
        executor: { provider: "test", model: "model-b", thinking: "high" },
      },
    },
  });
  try {
    const { commands } = loadExtension(freeflowExtension, {
      appendEntry() {},
      async setModel() {
        return true;
      },
      setThinkingLevel() {},
    });
    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);
    const settingsCtx = context(cwd);
    settingsCtx.mode = "tui";
    settingsCtx.hasUI = true;
    settingsCtx.isIdle = () => true;
    settingsCtx.modelRegistry = cognitiveRoutingModelRegistry();
    settingsCtx.ui.custom = async (factory) => {
      const component = factory({ requestRender() {} }, testTheme, {}, () => {});
      const rootText = renderText(component);
      assert.match(rootText, /Cognitive Routing\s+on \(inherited\)\n/);
      assert.match(rootText, /Coordinator preset\s+test\/model-a · low \(inherited\)/);
      return undefined;
    };

    await freeflowCommand.definition.handler("settings", settingsCtx);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi settings show Tool Execution as one switch and status reports it", async () => {
  const cwd = await configuredRepo({
    // Settings of the retired v2 runtime keep loading and do nothing.
    toolExecution: { enabled: true, capture: { enabled: true }, programs: { mode: "adapters" } },
  });
  try {
    const { commands } = loadExtension(freeflowExtension, {
      appendEntry() {},
      async setModel() {
        return true;
      },
      setThinkingLevel() {},
    });
    const command = commands.find((candidate) => candidate.name === "freeflow");
    const settingsCtx = context(cwd);
    settingsCtx.ui.custom = async (factory) => {
      const component = factory({ requestRender() {} }, testTheme, {}, () => {});
      const text = renderText(component, 180);
      assert.match(text, /Tool Execution\s+on\n/);
      assert.doesNotMatch(text, /capture|programs|workspace|accounting/i);
      return undefined;
    };
    await command.definition.handler("settings repo", settingsCtx);

    const statusCtx = context(cwd);
    await command.definition.handler("status", statusCtx);
    assert.match(statusCtx.notifications.at(-1).message, /tool execution: enabled/);
    assert.doesNotMatch(statusCtx.notifications.at(-1).message, /capture|verified reader|adapters/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi settings show Compaction as one switch, on by default, and status reports it", async () => {
  const cwd = await configuredRepo({});
  try {
    const { commands, handlers } = loadExtension(freeflowExtension, {
      appendEntry() {},
      async setModel() {
        return true;
      },
      setThinkingLevel() {},
    });
    const command = commands.find((candidate) => candidate.name === "freeflow");
    const settingsCtx = context(cwd);
    settingsCtx.ui.custom = async (factory) => {
      const component = factory({ requestRender() {} }, testTheme, {}, () => {});
      assert.match(renderText(component, 180), /Compaction\s+on \(inherited\)\n\s+Context reuse\s+on \(inherited\)/);
      return undefined;
    };
    await command.definition.handler("settings repo", settingsCtx);

    // Detail comes from the live session state, loaded when the session starts.
    const statusCtx = context(cwd);
    await handlers.get("session_start")({ type: "session_start" }, statusCtx);
    await command.definition.handler("status", statusCtx);
    assert.match(statusCtx.notifications.at(-1).message, /compaction: enabled \(cycle 1/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
  const off = await configuredRepo({ compaction: { enabled: false } });
  try {
    const { commands } = loadExtension(freeflowExtension);
    const statusCtx = context(off);
    await commands.find((candidate) => candidate.name === "freeflow").definition.handler("status", statusCtx);
    assert.match(statusCtx.notifications.at(-1).message, /compaction: disabled/);
  } finally {
    await rm(off, { recursive: true, force: true });
  }
});

test("settings: a section's switch is its own row, sections run everyday to experimental, an off section's settings still change", async () => {
  // Task 005: no "Enabled" rows; values first with their source in brackets; on green, off red; a setting under an
  // off switch is grey, says it takes effect once the switch is on, and can still be set up beforehand.
  const cwd = await configuredRepo({});
  try {
    const { commands } = loadExtension(freeflowExtension);
    const command = commands.find((candidate) => candidate.name === "freeflow");
    const settingsCtx = context(cwd);
    const colored = { ...testTheme, fg: (color, text) => `<${color}>${text}</${color}>` };
    settingsCtx.ui.custom = async (factory) => {
      const component = factory({ requestRender() {} }, testTheme, {}, () => {});
      const text = renderText(component, 180);
      assert.doesNotMatch(text, /\bEnabled\b/);
      assert.match(
        text,
        /Freeflow\s+on \(inherited\)\n[\s\S]*Compaction\s+on \(inherited\)\n\s+Context reuse[\s\S]*Tool Execution\s+on \(inherited\)\n[\s\S]*Task Memory\s+off \(inherited\)[\s\S]*Messaging\s+off \(inherited\)/,
      );
      // Where an inherited value comes from is on the help line, not in the list (Task 005 D-002).
      assert.match(text, /Inherited: not set in \.freeflow\/config\.json, so Freeflow's default applies\./);
      choose(component, "Ask before delivering", "Messaging");
      assert.match(renderText(component, 180), /Takes effect when Messaging is on\./);
      component.handleInput(KEY.enter);
      await component.waitForWrites();
      assert.match(renderText(component, 180), /Ask before delivering\s+outside the project\n/);
      return undefined;
    };
    await command.definition.handler("settings repo", settingsCtx);
    assert.deepEqual(JSON.parse(await readFile(join(cwd, ".freeflow/config.json"), "utf8")).messaging, {
      inbound: "project",
    });
    // Auto-approve is one row that opens its five switches, as the routing presets open their picker.
    const nestedCtx = context(cwd);
    nestedCtx.ui.custom = async (factory) => {
      const component = factory({ requestRender() {} }, testTheme, {}, () => {});
      assert.match(renderText(component, 180), /Auto-approve\s+none\n/);
      assert.doesNotMatch(renderText(component, 180), /\bAttach\b/);
      choose(component, "Auto-approve", "Task Memory");
      component.handleInput(KEY.enter);
      const opened = renderText(component, 180);
      assert.match(opened, /Freeflow settings › Repository › Auto-approve/);
      assert.match(opened, /› Attach\s+off \(inherited\)\n\s+Create/);
      component.handleInput(KEY.enter);
      await component.waitForWrites();
      component.handleInput(KEY.escape);
      assert.match(renderText(component, 180), /Auto-approve\s+attach\n/);
      return undefined;
    };
    await command.definition.handler("settings repo", nestedCtx);
    assert.deepEqual(JSON.parse(await readFile(join(cwd, ".freeflow/config.json"), "utf8")).taskMemory, {
      autoApprove: { attach: true },
    });
    const colorCtx = context(cwd);
    colorCtx.ui.custom = async (factory) => {
      const text = renderText(
        factory({ requestRender() {} }, colored, {}, () => {}),
        180,
      );
      assert.match(text, /Compaction.*<success>on<\/success><dim> \(inherited\)<\/dim>/);
      assert.match(text, /Messaging.*<error>off<\/error>/);
      return undefined;
    };
    await command.definition.handler("settings repo", colorCtx);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("plugin-docs/settings.md documents every row the settings screen shows and every config key", async () => {
  // Task 005: the reference page cannot fall behind the screen or the configuration code.
  const doc = await readFile(new URL("../../../plugin-docs/settings.md", import.meta.url), "utf8");
  const { SESSION_OVERRIDE_KEYS } = await import("../../dist/host/config.js");
  const { REVIEW_MODES, RUNTIME_PROMPTS, validateRepositoryConfig } =
    await import("../../dist/host/config-validation.js");
  const { AUTO_APPROVE_GROUPS } = await import("../../dist/task-memory/config.js");
  const { INBOUND_POLICIES } = await import("../../dist/messaging/config.js");
  const { DELEGATION_MODES } = await import("../../dist/cognitive-routing/types.js");
  const keys = [
    ...SESSION_OVERRIDE_KEYS,
    ...Object.keys(AUTO_APPROVE_GROUPS).map((group) => `taskMemory.autoApprove.${group}`),
    "messaging.inbound",
    "cognitiveRouting.delegation",
    ...["coordinator", "helper", "executor"].map((profile) => `cognitiveRouting.profiles.${profile}`),
    ...RUNTIME_PROMPTS.map((prompt) => `prompts.${prompt}`),
    "review.mode",
    "review.model",
  ];
  for (const key of keys) assert.ok(doc.includes(`| \`${key}\` |`), `settings.md lists ${key}`);
  for (const value of [...INBOUND_POLICIES, ...DELEGATION_MODES, ...REVIEW_MODES])
    assert.ok(doc.includes(`\`${value}\``), `settings.md names the value ${value}`);
  // Every key the page lists is one Freeflow accepts.
  const values = {
    "messaging.inbound": "accept",
    "cognitiveRouting.delegation": "executor",
    "review.mode": "always",
    "review.model": "a-model",
  };
  for (const [, key] of doc.matchAll(/^\| [^|]+ \| `([a-zA-Z.-]+)` \|/gm)) {
    const config = {};
    let at = config;
    const parts = key.split(".");
    for (const part of parts.slice(0, -1)) at = at[part] = {};
    at[parts.at(-1)] = values[key] ?? true;
    if (!key.startsWith("cognitiveRouting.profiles")) assert.equal(validateRepositoryConfig(config), null, key);
  }
  // Every row the screen shows, in every tab, is in the page's table.
  const cwd = await configuredRepo({});
  try {
    const { commands } = loadExtension(freeflowExtension, {
      appendEntry() {},
      async setModel() {
        return true;
      },
      setThinkingLevel() {},
    });
    const command = commands.find((candidate) => candidate.name === "freeflow");
    for (const scope of ["session", "local", "repo"]) {
      const settingsCtx = context(cwd);
      settingsCtx.ui.custom = async (factory) => {
        const rows = [
          ...allSettingsRows(
            factory({ requestRender() {} }, testTheme, {}, () => {}),
            nestedRows(doc),
          ),
        ];
        assert.ok(rows.length > 5, `${scope} rows`);
        for (const row of rows) assert.ok(doc.includes(`| ${row} |`), `settings.md lists the ${scope} row ${row}`);
        return undefined;
      };
      await command.definition.handler(`settings ${scope}`, settingsCtx);
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("every config key Freeflow acts on has a /freeflow settings row, or a stated reason it has none", async () => {
  // A setting the user changes is changed on the screen (dev-docs/features/settings.md). A key with no row is listed
  // here with its reason, with the user's agreement, and its row in plugin-docs/settings.md names no screen row.
  // Every setting has a row in all three scopes: Session, Personal and Repository.
  const FILE_ONLY = {};
  const doc = await readFile(new URL("../../../plugin-docs/settings.md", import.meta.url), "utf8");
  const { CONFIG_SECTIONS, REVIEW_KEYS, PROMPTS_KEYS, SKILLS_KEYS } =
    await import("../../dist/host/config-validation.js");
  const { COGNITIVE_ROUTING_KEYS } = await import("../../dist/cognitive-routing/config.js");
  const { TOOL_EXECUTION_KEYS } = await import("../../dist/tool-execution/config.js");
  const { COMPACTION_KEYS } = await import("../../dist/compaction/config.js");
  const { AUTO_APPROVE_GROUPS, TASK_MEMORY_KEYS } = await import("../../dist/task-memory/config.js");
  const { MESSAGING_KEYS } = await import("../../dist/messaging/config.js");
  const sections = {
    cognitiveRouting: COGNITIVE_ROUTING_KEYS,
    toolExecution: TOOL_EXECUTION_KEYS,
    compaction: COMPACTION_KEYS,
    taskMemory: TASK_MEMORY_KEYS,
    messaging: MESSAGING_KEYS,
    prompts: PROMPTS_KEYS,
    review: REVIEW_KEYS,
    skills: SKILLS_KEYS,
  };
  const nested = {
    "taskMemory.autoApprove": Object.keys(AUTO_APPROVE_GROUPS),
    "cognitiveRouting.profiles": ["coordinator", "helper", "executor"],
  };
  const keys = ["enabled"];
  for (const section of CONFIG_SECTIONS.filter((name) => name !== "enabled")) {
    assert.ok(sections[section], `this test knows the keys of ${section}`);
    for (const key of sections[section]) {
      const path = `${section}.${key}`;
      keys.push(...(nested[path] ? nested[path].map((child) => `${path}.${child}`) : [path]));
    }
  }

  const screenRows = {};
  const cwd = await configuredRepo({});
  try {
    const { commands } = loadExtension(freeflowExtension, {
      appendEntry() {},
      async setModel() {
        return true;
      },
      setThinkingLevel() {},
    });
    const command = commands.find((candidate) => candidate.name === "freeflow");
    for (const scope of ["session", "local", "repo"]) {
      const settingsCtx = context(cwd);
      settingsCtx.ui.custom = async (factory) => {
        screenRows[scope] = allSettingsRows(
          factory({ requestRender() {} }, testTheme, {}, () => {}),
          nestedRows(doc),
        );
        return undefined;
      };
      await command.definition.handler(`settings ${scope}`, settingsCtx);
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }

  const docRow = new Map([...doc.matchAll(/^\| ([^|]+?) \| `([a-zA-Z.-]+)` \|/gm)].map(([, row, key]) => [key, row]));
  for (const key of keys) {
    const row = docRow.get(key);
    assert.ok(row, `plugin-docs/settings.md lists ${key}`);
    if (FILE_ONLY[key]) {
      assert.equal(row, "—", `${key} is file-only: ${FILE_ONLY[key]}`);
      continue;
    }
    assert.notEqual(row, "—", `${key} has a /freeflow settings row, or a reason in FILE_ONLY`);
    for (const scope of ["session", "local", "repo"])
      assert.ok(screenRows[scope].has(row), `the ${scope} settings screen shows ${row} for ${key}`);
  }
});

test("/freeflow trash lists removed items, and only /freeflow trash empty deletes them, after asking", async () => {
  // Task 006: the trash is emptied only by the user's command.
  const before = process.env.FREEFLOW_HOME;
  const home = await mkdtemp(join(tmpdir(), "freeflow-home-"));
  process.env.FREEFLOW_HOME = home;
  const cwd = await configuredRepo({});
  try {
    await mkdir(join(home, "trash", "2026-10-12T00-00-00-000Z-trial-task-001-try-it"), { recursive: true });
    const { commands } = loadExtension(freeflowExtension);
    const command = commands.find((candidate) => candidate.name === "freeflow");
    const run = async (args, answer) => {
      const ctx = context(cwd);
      ctx.hasUI = true;
      ctx.mode = "rpc";
      ctx.ui.confirm = async () => answer;
      await command.definition.handler(args, ctx);
      return ctx.notifications.at(-1).message;
    };
    assert.match(await run("trash", false), /^Trash \(.+\):\n- 2026-10-12T00-00-00-000Z-trial-task-001-try-it\n/);
    assert.equal(await run("trash empty", false), "The trash was not emptied.");
    assert.equal((await readdir(join(home, "trash"))).length, 1);
    assert.equal(await run("trash empty", true), "Deleted 1 item(s) from the trash.");
    assert.equal(await run("trash", false), "The trash is empty.");
  } finally {
    process.env.FREEFLOW_HOME = before;
    await rm(cwd, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});

test("Pi settings show Task Memory off by default, and status reports it when on", async () => {
  const cwd = await configuredRepo({});
  try {
    const { commands } = loadExtension(freeflowExtension);
    const command = commands.find((candidate) => candidate.name === "freeflow");
    const settingsCtx = context(cwd);
    settingsCtx.ui.custom = async (factory) => {
      const component = factory({ requestRender() {} }, testTheme, {}, () => {});
      assert.match(renderText(component, 180), /Task Memory\s+off \(inherited\)\n/);
      return undefined;
    };
    await command.definition.handler("settings repo", settingsCtx);
    const statusCtx = context(cwd);
    await command.definition.handler("status", statusCtx);
    assert.doesNotMatch(statusCtx.notifications.at(-1).message, /task memory/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
  const on = await configuredRepo({ taskMemory: { enabled: true } });
  try {
    const { commands } = loadExtension(freeflowExtension);
    const command = commands.find((candidate) => candidate.name === "freeflow");
    const settingsCtx = context(on);
    settingsCtx.ui.custom = async (factory) => {
      const component = factory({ requestRender() {} }, testTheme, {}, () => {});
      assert.match(renderText(component, 180), /Task Memory\s+on\n/);
      return undefined;
    };
    await command.definition.handler("settings repo", settingsCtx);
    const statusCtx = context(on);
    await command.definition.handler("status", statusCtx);
    assert.match(statusCtx.notifications.at(-1).message, /task memory: enabled/);
  } finally {
    await rm(on, { recursive: true, force: true });
  }
});

test("Pi settings persist delegation mode without rewriting complete presets", async () => {
  const initial = {
    cognitiveRouting: {
      enabled: true,
      profiles: {
        coordinator: { provider: "test", model: "model-a", thinking: "low" },
        helper: { provider: "test", model: "model-b", thinking: "high" },
        executor: { provider: "test", model: "model-b", thinking: "max" },
      },
    },
  };
  const cwd = await configuredRepo(initial);
  try {
    const { commands } = loadExtension(freeflowExtension, {
      appendEntry() {},
      async setModel() {
        return true;
      },
      setThinkingLevel() {},
    });
    const command = commands.find((candidate) => candidate.name === "freeflow");
    const settingsCtx = context(cwd);
    settingsCtx.isIdle = () => true;
    settingsCtx.modelRegistry = cognitiveRoutingModelRegistry();
    settingsCtx.ui.custom = async (factory) => {
      let result;
      const component = factory({ requestRender() {} }, testTheme, {}, (value) => {
        result = value;
      });
      // Delegation cycles in place: executor → helper → both.
      await press(component, "Delegation", "Cognitive Routing");
      await press(component, "Delegation", "Cognitive Routing");
      assert.match(renderText(component), /›\s+Delegation\s+Helper and Executor/);
      component.handleInput(KEY.escape);
      return result;
    };
    await command.definition.handler("settings repo", settingsCtx);
    const saved = JSON.parse(await readFile(join(cwd, ".freeflow/config.json"), "utf8"));
    assert.equal(saved.cognitiveRouting.delegation, "both");
    assert.deepEqual(saved.cognitiveRouting.profiles, initial.cognitiveRouting.profiles);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("personal delegation override and inherit preserve repository mode and other local presets", async () => {
  const repository = {
    cognitiveRouting: {
      enabled: true,
      delegation: "helper",
      profiles: {
        coordinator: { provider: "test", model: "model-a", thinking: "low" },
        helper: { provider: "test", model: "model-b", thinking: "high" },
        executor: { provider: "test", model: "model-b", thinking: "max" },
      },
    },
  };
  const local = {
    cognitiveRouting: {
      profiles: {
        helper: { provider: "test", model: "model-b", thinking: "medium" },
      },
    },
  };
  const cwd = await configuredRepo(repository);
  const repositoryPath = join(cwd, ".freeflow/config.json");
  const localPath = join(cwd, ".freeflow/local.json");
  await writeFile(localPath, JSON.stringify(local, null, 2), "utf8");
  try {
    const { commands, pi } = loadExtension(freeflowExtension, {
      appendEntry() {},
      async setModel() {
        return true;
      },
      setThinkingLevel() {},
    });
    const command = commands.find((candidate) => candidate.name === "freeflow");
    const settingsCtx = context(cwd);
    settingsCtx.isIdle = () => true;
    settingsCtx.modelRegistry = cognitiveRoutingModelRegistry();

    // Personal delegation cycles inherit → executor → helper → both → inherit, in place.
    const chooseDelegation = async (presses) => {
      settingsCtx.ui.custom = async (factory) => {
        let result;
        const component = factory({ requestRender() {} }, testTheme, {}, (value) => {
          result = value;
        });
        choose(component, "Delegation", "Cognitive Routing");
        for (let i = 0; i < presses; i++) await press(component, "Delegation", "Cognitive Routing");
        component.handleInput(KEY.escape);
        return result;
      };
      await command.definition.handler("settings", settingsCtx);
    };

    await chooseDelegation(1);
    let saved = JSON.parse(await readFile(localPath, "utf8"));
    assert.equal(saved.cognitiveRouting.delegation, "executor");
    assert.deepEqual(saved.cognitiveRouting.profiles, local.cognitiveRouting.profiles);
    assert.deepEqual(JSON.parse(await readFile(repositoryPath, "utf8")), repository);
    assert.equal((await readCapabilityState(cwd, settingsCtx)).cognitiveRouting.delegation, "executor");

    await chooseDelegation(3);
    saved = JSON.parse(await readFile(localPath, "utf8"));
    assert.equal(saved.cognitiveRouting.delegation, undefined);
    assert.deepEqual(saved.cognitiveRouting.profiles, local.cognitiveRouting.profiles);
    assert.equal((await readCapabilityState(cwd, settingsCtx)).cognitiveRouting.delegation, "helper");

    const beforeCancel = await readFile(localPath, "utf8");
    await chooseDelegation(0);
    assert.equal(await readFile(localPath, "utf8"), beforeCancel, "moving to a row without pressing changes nothing");
    assert.deepEqual(JSON.parse(await readFile(repositoryPath, "utf8")), repository);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("both mode session settings expose Helper and both existing profile presets", async () => {
  const cwd = await configuredRepo({
    cognitiveRouting: {
      enabled: true,
      delegation: "both",
      profiles: {
        coordinator: { provider: "test", model: "model-a", thinking: "low" },
        helper: { provider: "test", model: "model-b", thinking: "high" },
        executor: { provider: "test", model: "model-b", thinking: "max" },
      },
    },
  });
  try {
    const { commands } = loadExtension(freeflowExtension, {
      appendEntry() {},
      async setModel() {
        return true;
      },
      setThinkingLevel() {},
    });
    const command = commands.find((candidate) => candidate.name === "freeflow");
    const settingsCtx = context(cwd);
    settingsCtx.isIdle = () => true;
    settingsCtx.modelRegistry = cognitiveRoutingModelRegistry();
    settingsCtx.ui.custom = async (factory) => {
      let result;
      const component = factory({ requestRender() {} }, testTheme, {}, (value) => {
        result = value;
      });
      // The list scrolls; the presets are near its end.
      choose(component, "Helper preset", "Cognitive Routing");
      const presets = component.render(180).join("\n");
      assert.match(presets, /Coordinator preset/);
      assert.match(presets, /Helper preset/);
      assert.match(presets, /Executor preset/);
      result = { changed: false };
      return result;
    };
    await command.definition.handler("settings session", settingsCtx);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("session delegation setting enables Helper in the same panel without writing config", async () => {
  const cwd = await configuredRepo({
    cognitiveRouting: {
      enabled: true,
      delegation: "executor",
      profiles: {
        coordinator: { provider: "test", model: "model-a", thinking: "low" },
        helper: { provider: "test", model: "model-b", thinking: "high" },
        executor: { provider: "test", model: "model-b", thinking: "max" },
      },
    },
  });
  try {
    const configPath = join(cwd, ".freeflow/config.json");
    const original = await readFile(configPath, "utf8");
    let mode = "executor";
    let override;
    const controller = {
      state: () => ({ effective: true, controlMode: "automatic", activeProfile: "coordinator", delegation: mode }),
      sessionProfileOverrides: () => ({}),
      sessionDelegationOverride: () => override,
      setSessionDelegationOverride: async (choice) => {
        override = choice ?? undefined;
        mode = choice ?? "executor";
        return { status: "stored" };
      },
    };
    const ctx = context(cwd);
    ctx.isIdle = () => true;
    ctx.modelRegistry = cognitiveRoutingModelRegistry();
    const pi = {
      host: {},
      appendEntry() {},
      async setModel() {
        return true;
      },
      setThinkingLevel() {},
    };
    ctx.ui.custom = async (factory) => {
      const component = factory({ requestRender() {} }, testTheme, {}, () => {});
      // Session delegation cycles inherit → executor → helper → both, in place.
      for (let i = 0; i < 3; i++) await press(component, "Delegation", "Cognitive Routing");
      assert.equal(mode, "both");
      assert.match(component.render(180).join("\n"), /›\s+Delegation\s+Helper and Executor\n/);
      assert.match(component.render(180).join("\n"), /Helper preset/);
      return { changed: false };
    };
    await handleFreeflowCommand("settings session", ctx, async () => {}, pi, controller);
    assert.equal(await readFile(configPath, "utf8"), original);
    assert.equal(await readFile(join(cwd, ".freeflow/local.json"), "utf8").catch(() => undefined), undefined);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("session routing settings can be set while routing is not running, and the running status survives an edit", async () => {
  const cwd = await configuredRepo({ cognitiveRouting: { enabled: true, delegation: "executor" } });
  try {
    let effective = false;
    let override;
    const controller = {
      state: () => ({
        effective,
        controlMode: "automatic",
        activeProfile: "coordinator",
        delegation: override ?? "executor",
      }),
      sessionProfileOverrides: () => ({}),
      sessionDelegationOverride: () => override,
      setSessionDelegationOverride: async (choice) => {
        override = choice ?? undefined;
        return { status: "stored" };
      },
    };
    const ctx = context(cwd);
    ctx.isIdle = () => true;
    ctx.modelRegistry = cognitiveRoutingModelRegistry();
    const pi = {
      host: {},
      appendEntry() {},
      async setModel() {
        return true;
      },
      setThinkingLevel() {},
    };
    ctx.ui.custom = async (factory) => {
      const component = factory({ requestRender() {} }, testTheme, {}, () => {});
      // No Coordinator preset, so routing is on but not running: delegation still changes.
      await press(component, "Delegation", "Cognitive Routing");
      assert.equal(override, "executor");
      return { changed: false };
    };
    await handleFreeflowCommand("settings session", ctx, async () => {}, pi, controller);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("the footer shows routing's state, or that Freeflow is on and whether every capability is off", () => {
  // Task 005: only routing's state changes while you work, so it alone is in the footer.
  const statuses = [];
  const ctx = { ui: { setStatus: (name, value) => statuses.push(value) } };
  const base = { configured: true, enabled: true, configSources: { enabled: "builtin" } };
  setFreeflowStatus(ctx, base, undefined, readyFreeflowContext);
  setFreeflowStatus(
    ctx,
    {
      ...base,
      messaging: { effective: true },
      compaction: { effective: true },
      taskMemory: { effective: false },
      toolExecution: { effective: true },
    },
    undefined,
    readyFreeflowContext,
  );
  setFreeflowStatus(
    ctx,
    {
      ...base,
      compaction: { effective: true },
      cognitiveRouting: { enabled: true, effective: true, blockingReason: null },
    },
    { effective: true, activeProfile: "coordinator", controlMode: "automatic", delegation: "executor" },
    readyFreeflowContext,
  );
  assert.deepEqual(statuses, [
    "freeflow: on (all capabilities off)",
    "freeflow: on",
    "freeflow: coordinator · automatic · executor mode",
  ]);
});

test("Pi statusline reports Cognitive Routing without legacy context status", () => {
  const ctx = context();
  setFreeflowStatus(
    ctx,
    {
      configured: true,
      enabled: true,
      configSources: { enabled: "builtin" },
      cognitiveRouting: { enabled: true, effective: true, blockingReason: null },
    },
    { effective: true, activeProfile: "executor", controlMode: "automatic", delegation: "both" },
    readyFreeflowContext,
  );
  assert.equal(ctx.statuses.at(-1).value, "freeflow: executor · automatic · both mode");
  assert.doesNotMatch(ctx.statuses.at(-1).value, /interaction|workflow|skills/i);
});

test("Pi statusline defaults pending activation to the Coordinator profile", () => {
  const ctx = context();
  setFreeflowStatus(
    ctx,
    {
      configured: true,
      enabled: true,
      configSources: { enabled: "builtin" },
      cognitiveRouting: {
        enabled: true,
        effective: true,
        blockingReason: null,
      },
    },
    undefined,
    readyFreeflowContext,
    { cognitiveRoutingStartupPending: true },
  );
  assert.equal(ctx.statuses.at(-1).value, "freeflow: coordinator · pending");
});

test("Pi statusline keeps an inactive Cognitive Routing runtime blocked", () => {
  const ctx = context();
  setFreeflowStatus(
    ctx,
    {
      configured: true,
      enabled: true,
      configSources: { enabled: "builtin" },
      cognitiveRouting: { enabled: true, effective: true, blockingReason: null },
    },
    { effective: false, activeProfile: "coordinator", controlMode: "automatic" },
    readyFreeflowContext,
    { cognitiveRoutingStartupPending: true },
  );
  assert.equal(ctx.statuses.at(-1).value, "freeflow: routing blocked · runtime_inactive");
});

test("Pi registers each workflow skill under its own name, with no commands for removed or merged skills", () => {
  const { commands } = loadExtension();
  for (const name of ["discuss-work", "execute-work", "deliver-work"]) {
    const command = commands.find((candidate) => candidate.name === name);
    assert.ok(command, name);
    assert.equal(command.definition.description, `Run Freeflow ${name}`);
  }
  for (const removed of [
    "action-selection",
    "bypass",
    "discuss",
    "agree-work",
    "commit-work",
    "finish-branch",
    "release-work",
    "launch-work",
    "design-for-depth",
    "simplify-code",
    "diagnose-failure",
    "migration-work",
  ])
    assert.ok(!commands.some((command) => command.name === removed), removed);
});

test("Pi describes the mode-free Freeflow argument surface and manual profile controls", () => {
  const { commands } = loadExtension(freeflowExtension, {
    appendEntry() {},
    setModel() {},
    setThinkingLevel() {},
  });
  const freeflowCommand = commands.find((command) => command.name === "freeflow");
  assert.ok(freeflowCommand);
  assert.deepEqual(freeflowCommand.definition.getArgumentCompletions(""), [
    {
      value: "settings",
      label: "settings",
      description: "Open settings; Tab switches Session, Personal and Repository",
    },
    { value: "status", label: "status", description: "Show effective Freeflow state" },
    { value: "compact", label: "compact", description: "Prepare, compact and recover now" },
    {
      value: "task",
      label: "task",
      description: "Attach, focus, detach or confirm Working Records (task memory)",
    },
    { value: "project", label: "project", description: "Create or link a task-memory project" },
    { value: "trash", label: "trash", description: "Removed tasks and projects; trash empty deletes them for good" },
    { value: "profile", label: "profile", description: "Hold or release Cognitive Routing profile control" },
    { value: "resume", label: "resume", description: "Resume the current saved routing responsibility" },
    { value: "enable", label: "enable", description: "Enable Freeflow for this repository" },
    { value: "disable", label: "disable", description: "Disable Freeflow for this repository" },
  ]);
  assert.deepEqual(freeflowCommand.definition.getArgumentCompletions("profile "), [
    { value: "profile coordinator", label: "coordinator", description: "Hold Coordinator manually" },
    { value: "profile helper", label: "helper", description: "Hold Helper manually when enabled" },
    { value: "profile executor", label: "executor", description: "Hold Executor manually when enabled" },
    { value: "profile auto", label: "auto", description: "Return to automatic Coordinator reconciliation" },
    { value: "profile history", label: "history", description: "Read routing observations" },
  ]);
  assert.deepEqual(freeflowCommand.definition.getArgumentCompletions("efficiency "), []);
  assert.deepEqual(freeflowCommand.definition.getArgumentCompletions("mode "), []);
  assert.deepEqual(freeflowCommand.definition.getArgumentCompletions("context "), []);
});

test("Pi exposes the canonical base skills without TDD, a mode skill, or removed skills", async () => {
  const cwd = await configuredRepo();
  try {
    const { handlers, commands, sentMessages, sentMessageOptions } = loadExtension();
    const resources = await handlers.get("resources_discover")({ cwd }, context(cwd));
    const skillNames = resources.skillPaths
      .filter((path) => path.includes("/skills/"))
      .map((path) => {
        const match = path.match(/[\\/]skills[\\/]([^\\/]+)\/SKILL\.md$/);
        assert.ok(match, `unexpected skill path: ${path}`);
        return match[1];
      });
    assert.deepEqual([...skillNames].sort(), [...FREEFLOW_MODEL_SKILL_NAMES].sort());
    assert.ok(skillNames.includes("discuss-work"));
    assert.ok(!skillNames.includes("workflow"));
    assert.ok(!skillNames.includes("tdd"));
    assert.ok(!skillNames.includes("mode-contract"));
    assert.ok(!skillNames.includes("discover"));
    assert.ok(!skillNames.includes("execute-plan"));
    assert.ok(!skillNames.includes("action-selection"));
    assert.ok(!skillNames.includes("bypass"));
    assert.ok(skillNames.includes("deliver-work"));
    for (const removed of [
      "discuss",
      "agree-work",
      "commit-work",
      "finish-branch",
      "release-work",
      "launch-work",
      "design-for-depth",
      "simplify-code",
      "diagnose-failure",
      "migration-work",
    ])
      assert.ok(!skillNames.includes(removed), removed);

    for (const [commandName, expectedSkill] of [
      ["discuss-work", "discuss-work"],
      ["deliver-work", "deliver-work"],
      ["track-work", "track-work"],
      ["execute-work", "execute-work"],
    ]) {
      const command = commands.find((candidate) => candidate.name === commandName);
      assert.ok(command);
      await command.definition.handler(undefined, context(cwd));
      assert.equal(sentMessages.at(-1), `/skill:${expectedSkill}`);
      assert.deepEqual(sentMessageOptions.at(-1), { expandPromptTemplates: true, deliverAs: "followUp" });
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi expands setup-freeflow when dispatching its unconfigured skill command", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-setup-dispatch-"));
  try {
    const { commands, sentMessages, sentMessageOptions } = loadExtension();
    const setup = commands.find((command) => command.name === "setup-freeflow");
    assert.ok(setup);

    await setup.definition.handler(undefined, context(cwd));

    assert.equal(sentMessages.at(-1), "/skill:setup-freeflow");
    assert.deepEqual(sentMessageOptions.at(-1), { expandPromptTemplates: true, deliverAs: "followUp" });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi keeps Freeflow inactive until repository activation exists", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-missing-setup-"));
  try {
    const { handlers } = loadExtension();
    const resources = await handlers.get("resources_discover")({ cwd }, context(cwd));
    // Inactive Freeflow lists only Setup Freeflow (Task 003 D-002).
    assert.equal(resources.skillPaths.length, 1);
    assert.ok(resources.skillPaths.some((path) => path.endsWith("/skills/setup-freeflow/SKILL.md")));
    const result = await beforeAgentStartHandler(handlers)({ systemPrompt: "base prompt" }, context(cwd));
    assert.equal(result.systemPrompt, "base prompt");
    assert.equal(result.renderedGuidance ?? "", "", "no Freeflow guidance while inactive");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi leaves out a skill and a runtime prompt the user turned off, and tells the agent", async () => {
  const cwd = await configuredRepo({ skills: { "write-skill": false }, prompts: { workingMethod: false } });
  try {
    const { handlers, commands, sentMessages } = loadExtension();
    const ctx = context(cwd);
    await handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
    const resources = await handlers.get("resources_discover")({ cwd }, ctx);
    assert.ok(!resources.skillPaths.some((path) => path.includes("/skills/write-skill/")));
    assert.ok(resources.skillPaths.some((path) => path.includes("/skills/discuss-work/")));
    assert.ok(resources.skillPaths.some((path) => path.includes("/skills/setup-freeflow/")));
    const result = await beforeAgentStartHandler(handlers)({ systemPrompt: "base prompt" }, ctx);
    assert.match(result.renderedGuidance, /## Freeflow core/);
    assert.doesNotMatch(result.renderedGuidance, /## Working Method/);
    const providerContext = await contextHandler(handlers)({ messages: [] }, ctx);
    const state = lastRuntimeState(providerContext.messages).content;
    // Turned off is not missing: Freeflow stays active.
    assert.match(state, /Freeflow: active\nSkills off: `write-skill`; do not open or follow them\.\n/);
    const run = context(cwd);
    await commands.find((command) => command.name === "write-skill").definition.handler("", run);
    assert.match(run.notifications.at(-1).message, /write-skill is turned off in \/freeflow settings/);
    assert.equal(sentMessages.length, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi applies a session value over the files for a choice, a model name and a nested switch", async () => {
  const cwd = await configuredRepo({ review: { mode: "off" }, taskMemory: { autoApprove: { create: true } } });
  try {
    const { setSessionCoreOverride, resetSessionOverrides } = await import("../../dist/host/config.js");
    const ctx = context(cwd);
    const pi = { appendEntry() {} };
    await setSessionCoreOverride("review.mode", "always", ctx, pi);
    await setSessionCoreOverride("review.model", "test/model-b", ctx, pi);
    await setSessionCoreOverride("taskMemory.autoApprove.attach", true, ctx, pi);
    await setSessionCoreOverride("skills.write-docs", false, ctx, pi);
    const state = await readCapabilityState(cwd, ctx);
    assert.deepEqual(state.review, { mode: "always", model: "test/model-b" });
    assert.equal(state.taskMemory.autoApprove.attach, true);
    assert.equal(state.taskMemory.autoApprove.create, true, "the file's other switches stay");
    assert.deepEqual(state.skills.off, ["write-docs"]);
    await assert.rejects(
      setSessionCoreOverride("review.mode", "sometimes", ctx, pi),
      /Invalid Freeflow session override value/,
    );
    await resetSessionOverrides(ctx, pi);
    const after = await readCapabilityState(cwd, ctx);
    assert.deepEqual(after.review, { mode: "off" });
    assert.deepEqual(after.skills.off, []);
    // The master switch turns every skill but Setup Freeflow off.
    await setSessionCoreOverride("skills.enabled", false, ctx, pi);
    const off = await readCapabilityState(cwd, ctx);
    assert.equal(off.skills.enabled, false);
    assert.ok(off.skills.off.includes("discuss-work") && !off.skills.off.includes("setup-freeflow"));
    await resetSessionOverrides(ctx, pi);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi rejects obsolete modes and removed core toggles in configuration", async () => {
  // The removed top-level Interaction Contract switch; today `prompts.interactionContract` and `prompts.enabled`.
  for (const config of [{ defaultMode: "workflow" }, { interactionContract: false }]) {
    const cwd = await configuredRepo(config);
    try {
      const layers = await readFreeflowConfigLayers(cwd);
      assert.equal(layers.configured, false);
      assert.equal(layers.repository.valid, false);
      assert.match(layers.parseError, /unsupported top-level config key/);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }
});

test("Pi reports exactly which removed context keys must be deleted from each config layer", async () => {
  for (const [file, key] of [
    ["config.json", "contextVirtualization"],
    ["config.json", "conversationHistory"],
    ["local.json", "contextVirtualization"],
    ["local.json", "conversationHistory"],
  ]) {
    const cwd = await configuredRepo(file === "config.json" ? { [key]: true } : {});
    try {
      if (file === "local.json") {
        await writeFile(join(cwd, ".freeflow/local.json"), JSON.stringify({ [key]: true }), "utf8");
      }
      const layers = await readFreeflowConfigLayers(cwd);
      assert.equal(layers.configured, false);
      assert.match(layers.parseError, new RegExp(key));
      assert.match(layers.parseError, new RegExp(`\\.freeflow/${file.replace(".", "\\.")}`));
      const { commands } = loadExtension();
      const command = commands.find((candidate) => candidate.name === "freeflow");
      const status = context(cwd);
      await command.definition.handler("status", status);
      assert.match(status.notifications.at(-1).message, new RegExp(key));
      assert.match(status.notifications.at(-1).message, new RegExp(`\\.freeflow/${file.replace(".", "\\.")}`));
      assert.match(status.notifications.at(-1).message, /Delete those keys before using Freeflow/);
      assert.match(status.notifications.at(-1).message, new RegExp(`fix \\.freeflow/${file.replace(".", "\\.")}`));
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }
});

test("Pi treats invalid configuration as inactive", async () => {
  const cwd = await configuredRepo({ enabled: "false" });
  try {
    const { handlers, commands } = loadExtension();
    const resources = await handlers.get("resources_discover")({ cwd }, context(cwd));
    // Inactive Freeflow lists only Setup Freeflow (Task 003 D-002).
    assert.equal(resources.skillPaths.length, 1);
    assert.ok(resources.skillPaths.some((path) => path.endsWith("/skills/setup-freeflow/SKILL.md")));
    const result = await beforeAgentStartHandler(handlers)({ systemPrompt: "base prompt" }, context(cwd));
    assert.equal(result.systemPrompt, "base prompt");
    assert.equal(result.renderedGuidance ?? "", "", "no Freeflow guidance while inactive");
    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    const statusCtx = context(cwd);
    await freeflowCommand.definition.handler("status", statusCtx);
    assert.match(statusCtx.notifications.at(-1).message, /invalid config/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi resolves only the remaining layered core values", async () => {
  const cwd = await configuredRepo();
  try {
    await writeFile(join(cwd, ".freeflow/local.json"), JSON.stringify({ enabled: false }, null, 2), "utf8");
    const layers = await readFreeflowConfigLayers(cwd);
    assert.deepEqual(layers.coreConfig, { enabled: false });
    assert.deepEqual(layers.sources, { enabled: "local" });
    const state = await readCapabilityState(cwd);
    assert.equal(state.enabled, false);
    assert.deepEqual(state.skills, { enabled: true, off: [] });
    assert.equal("interactionContract" in state, false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi resolves Tool Execution as one capability and reports it in the Runtime State", async () => {
  const cwd = await configuredRepo({ toolExecution: { enabled: true, accounting: { enabled: true } } });
  try {
    const { handlers } = loadExtension(freeflowExtension, {});
    const ctx = context(cwd);
    await handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
    const state = await readCapabilityState(cwd, ctx, null);
    assert.deepEqual(
      { enabled: state.toolExecution.enabled, effective: state.toolExecution.effective },
      { enabled: true, effective: true },
    );
    assert.equal("accounting" in state.toolExecution, false);
    const providerContext = await contextHandler(handlers)({ messages: [] }, ctx);
    assert.match(lastRuntimeState(providerContext.messages).content, /Tool Execution: active\n/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi rejects invalid Tool Execution configuration", async () => {
  for (const [toolExecution, error] of [
    [{ enabled: "yes" }, /toolExecution\.enabled must be a boolean/],
    [{ sandbox: true }, /toolExecution has unsupported key: sandbox/],
  ]) {
    const cwd = await configuredRepo({ toolExecution });
    try {
      const layers = await readFreeflowConfigLayers(cwd);
      assert.equal(layers.configured, false);
      assert.match(layers.parseError, error);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }
});

test("Pi session enablement cannot bypass repository activation", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-session-activation-"));
  await mkdir(join(cwd, ".freeflow"));
  const { pi } = loadExtension();
  const ctx = context(cwd);
  try {
    await setSessionCoreOverride("enabled", true, ctx, pi);
    let state = await readCapabilityState(cwd);
    assert.equal(state.configured, false);
    assert.equal(state.enabled, false);

    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({ enabled: false }), "utf8");
    state = await readCapabilityState(cwd);
    assert.equal(state.configured, true);
    assert.equal(state.enabled, true);
    assert.equal(state.configSources.enabled, "session");
  } finally {
    await resetSessionOverrides(ctx, pi);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi restores remaining session overrides from the active branch and ignores old mode entries", async () => {
  const cwd = await configuredRepo();
  try {
    const activeBranchEntries = [
      { type: "custom", customType: "freeflow-mode", data: { currentMode: "conversation" } },
      {
        type: "custom",
        customType: "freeflow-session-overrides",
        data: { overrides: { enabled: false, contextVirtualization: true, conversationHistory: true } },
      },
    ];
    restoreSessionOverrides(context(cwd, activeBranchEntries, activeBranchEntries));
    const state = await readCapabilityState(cwd);
    assert.equal(state.enabled, false);
    assert.deepEqual(state.sessionOverrides, { enabled: false });
    assert.equal("currentMode" in state, false);
  } finally {
    await resetSessionOverrides(context(cwd), loadExtension().pi);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi fails closed when an existing local override is invalid", async () => {
  const cwd = await configuredRepo();
  try {
    await writeFile(join(cwd, ".freeflow/local.json"), "{ invalid\n", "utf8");
    const layers = await readFreeflowConfigLayers(cwd);
    assert.equal(layers.repositoryConfigured, true);
    assert.equal(layers.configured, false);
    assert.equal(layers.local.valid, false);
    const state = await readCapabilityState(cwd);
    assert.equal(state.configured, false);
    assert.equal(state.enabled, false);
    const { handlers } = loadExtension();
    const resources = await handlers.get("resources_discover")({ cwd }, context(cwd));
    // Inactive Freeflow lists only Setup Freeflow (Task 003 D-002).
    assert.equal(resources.skillPaths.length, 1);
    assert.ok(resources.skillPaths.some((path) => path.endsWith("/skills/setup-freeflow/SKILL.md")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("each tab shows the value it sets; a default written to the repository reads inherited; enable says what still wins", async () => {
  const cwd = await configuredRepo({ enabled: false });
  try {
    await writeFile(
      join(cwd, ".freeflow/local.json"),
      JSON.stringify({ cognitiveRouting: { enabled: true, delegation: "helper" } }, null, 2),
      "utf8",
    );
    const { commands } = loadExtension(freeflowExtension);
    const command = commands.find((candidate) => candidate.name === "freeflow");
    const personal = context(cwd);
    personal.ui.custom = async (factory) => {
      // Freeflow is off, but the personal file turns routing on: the Personal tab shows what it sets.
      assert.match(
        renderText(
          factory({ requestRender() {} }, testTheme, {}, () => {}),
          180,
        ),
        /Cognitive Routing\s+on/,
      );
      return undefined;
    };
    await command.definition.handler("settings local", personal);
    const repository = context(cwd);
    repository.ui.custom = async (factory) => {
      const component = factory({ requestRender() {} }, testTheme, {}, () => {});
      assert.match(renderText(component, 180), /Delegation\s+Executor only \(inherited · personal: Helper only\)/);
      choose(component, "Tool Execution");
      component.handleInput(KEY.enter);
      await component.waitForWrites();
      assert.match(renderText(component, 180), /Tool Execution\s+off\n/);
      component.handleInput(KEY.enter);
      await component.waitForWrites();
      // Back to the default, which the file leaves out: inherited again.
      assert.match(renderText(component, 180), /Tool Execution\s+on \(inherited · not active\)\n/);
      return undefined;
    };
    await command.definition.handler("settings repo", repository);
    assert.equal(JSON.parse(await readFile(join(cwd, ".freeflow/config.json"), "utf8")).toolExecution, undefined);

    await writeFile(join(cwd, ".freeflow/local.json"), JSON.stringify({ enabled: false }, null, 2), "utf8");
    const enable = context(cwd);
    await command.definition.handler("enable", enable);
    assert.match(enable.notifications.at(-1).message, /your \.freeflow\/local\.json still turns it off/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi local enablement overrides the repository master switch", async () => {
  const cwd = await configuredRepo({ enabled: true });
  try {
    await writeFile(join(cwd, ".freeflow/local.json"), JSON.stringify({ enabled: false }, null, 2), "utf8");
    const state = await readCapabilityState(cwd);
    assert.equal(state.configured, true);
    assert.equal(state.enabled, false);
    assert.equal(state.configSources.enabled, "local");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi master Freeflow toggle makes features inactive and sends only Setup Freeflow", async () => {
  const cwd = await configuredRepo({ enabled: false });
  try {
    const { handlers, activeToolNames } = loadExtension();
    const ctx = context(cwd);
    const resources = await handlers.get("resources_discover")({ cwd }, ctx);
    // Inactive Freeflow lists only Setup Freeflow (Task 003 D-002).
    assert.equal(resources.skillPaths.length, 1);
    const result = await beforeAgentStartHandler(handlers)({ systemPrompt: "base prompt" }, ctx);
    assert.equal(result.systemPrompt, "base prompt");
    assert.equal(result.renderedGuidance ?? "", "", "no Freeflow guidance while inactive");
    const providerContext = await contextHandler(handlers)({ messages: [] }, ctx);
    assert.match(lastRuntimeState(providerContext.messages).content, /Freeflow: inactive/);
    assert.doesNotMatch(
      lastRuntimeState(providerContext.messages).content,
      /Default mode|Active mode|Interaction Contract|Skills/,
    );
    assert.ok(!activeToolNames().includes("freeflow_context"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi settings expose no mode or removed context controls", async () => {
  const cwd = await configuredRepo({ enabled: false });
  try {
    const { commands } = loadExtension();
    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);
    const ctx = context(cwd);
    ctx.ui.custom = async (factory) => {
      let result;
      const component = factory({ requestRender() {} }, testTheme, {}, (value) => {
        result = value;
      });
      const text = renderText(component);
      assert.match(text, /Freeflow settings/);
      assert.doesNotMatch(text, /Freeflow Context|Context Virtualization|Conversation History/);
      assert.doesNotMatch(text, /Session mode|Default mode|Mode/);
      component.handleInput("\u001b");
      return result;
    };
    await freeflowCommand.definition.handler("settings", ctx);
    assert.equal(ctx.reloads.length, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi enable and disable commands mutate only the master switch", async () => {
  const cwd = await configuredRepo();
  try {
    const { commands } = loadExtension();
    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);
    const disableCtx = context(cwd);
    await freeflowCommand.definition.handler("disable", disableCtx);
    assert.deepEqual(JSON.parse(await readFile(join(cwd, ".freeflow/config.json"), "utf8")), { enabled: false });
    assert.equal(disableCtx.statuses.at(-1).value, "freeflow: off");
    assert.equal(disableCtx.reloads.length, 1);

    const enableCtx = context(cwd);
    await freeflowCommand.definition.handler("enable", enableCtx);
    assert.deepEqual(JSON.parse(await readFile(join(cwd, ".freeflow/config.json"), "utf8")), {});
    assert.equal(enableCtx.reloads.length, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi settings refuse to overwrite an invalid local override", async () => {
  const cwd = await configuredRepo();
  try {
    const localPath = join(cwd, ".freeflow/local.json");
    await writeFile(localPath, "{ invalid\n", "utf8");
    const { commands } = loadExtension();
    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);
    const ctx = context(cwd);
    ctx.ui.custom = async () => assert.fail("settings UI must not open for invalid local config");
    await freeflowCommand.definition.handler("settings", ctx);
    assert.equal(await readFile(localPath, "utf8"), "{ invalid\n");
    assert.match(ctx.notifications.at(-1).message, /local\.json is invalid; repair or remove it/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi personal settings refuse to write a tracked local override", async () => {
  const cwd = await configuredRepo();
  try {
    await writeFile(join(cwd, ".freeflow/local.json"), "{}\n", "utf8");
    await execFileAsync("git", ["init", "-q", cwd]);
    await execFileAsync("git", ["-C", cwd, "add", ".freeflow/local.json"]);
    const { commands } = loadExtension();
    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);
    const ctx = context(cwd);
    ctx.ui.custom = async (factory) => {
      let result;
      const component = factory({ requestRender() {} }, testTheme, {}, (value) => {
        result = value;
      });
      component.handleInput("\r");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\u001b");
      return result;
    };
    await freeflowCommand.definition.handler("settings", ctx);
    assert.deepEqual(JSON.parse(await readFile(join(cwd, ".freeflow/local.json"), "utf8")), {});
    assert.match(
      ctx.notifications.map((notification) => notification.message).join("\n"),
      /local\.json is tracked by git/,
    );
    assert.equal(ctx.reloads.length, 0);
    assert.doesNotMatch(
      ctx.notifications.map((notification) => notification.message).join("\n"),
      /personal overrides saved/,
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("a preset's effort choices are the levels Pi's model data allows, as for grok-4.7", async () => {
  // grok-4.7's thinkingLevelMap rules out off, minimal and max: the picker offers low, medium, high and xhigh only.
  const cwd = await configuredRepo({ cognitiveRouting: { enabled: true } });
  try {
    const { commands } = loadExtension(freeflowExtension, {
      appendEntry() {},
      async setModel() {
        return true;
      },
      setThinkingLevel() {},
    });
    const settingsCtx = context(cwd);
    settingsCtx.isIdle = () => true;
    const registry = cognitiveRoutingModelRegistry();
    registry.getAvailable().push({
      provider: "xai",
      id: "grok-4.7",
      name: "Grok 4.7",
      reasoning: true,
      contextWindow: 500000,
      thinkingLevelMap: {
        off: null,
        minimal: null,
        low: "low",
        medium: "medium",
        high: "high",
        xhigh: "xhigh",
        max: null,
      },
    });
    settingsCtx.modelRegistry = registry;
    settingsCtx.ui.custom = async (factory) => {
      const component = factory({ requestRender() {} }, testTheme, {}, () => {});
      choose(component, "Coordinator preset", "Cognitive Routing");
      component.handleInput(KEY.enter);
      const models = renderText(component, 200);
      assert.match(models, /xai\/grok-4\.7\s+Grok 4\.7 · low, medium, high, xhigh\n/);
      assert.match(models, /test\/model-a\s+Model A · off, low, medium, high\n/);
      while (!/› xai\/grok-4\.7|→ xai\/grok-4\.7/.test(renderText(component, 200))) component.handleInput(KEY.down);
      component.handleInput(KEY.enter);
      const efforts = renderText(component, 200);
      assert.match(efforts, /Choose effort · xai\/grok-4\.7/);
      assert.doesNotMatch(efforts, /\b(minimal|max)\b|\n\s*(→ )?off\s/);
      assert.match(efforts, /low[\s\S]*medium[\s\S]*high[\s\S]*xhigh/);
      return undefined;
    };
    await commands.find((command) => command.name === "freeflow").definition.handler("settings repo", settingsCtx);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi Cognitive Routing settings preserve complete presets", async () => {
  const cwd = await configuredRepo({
    cognitiveRouting: {
      enabled: true,
      profiles: {
        coordinator: { provider: "test", model: "model-a", thinking: "low" },
        executor: { provider: "test", model: "model-b", thinking: "high" },
      },
    },
  });
  try {
    const { commands } = loadExtension(freeflowExtension, {
      appendEntry() {},
      async setModel() {
        return true;
      },
      setThinkingLevel() {},
    });
    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);
    const settingsCtx = context(cwd);
    settingsCtx.isIdle = () => true;
    settingsCtx.modelRegistry = cognitiveRoutingModelRegistry();
    settingsCtx.ui.custom = async (factory) => {
      let result;
      const component = factory({ requestRender() {} }, testTheme, {}, (value) => {
        result = value;
      });
      // The preset opens its picker over the list: model, then effort, then confirm.
      choose(component, "Executor preset", "Cognitive Routing");
      component.handleInput(KEY.enter);
      component.handleInput(KEY.enter);
      component.handleInput(KEY.down);
      component.handleInput(KEY.enter);
      component.handleInput(KEY.enter);
      await component.waitForWrites();
      return result;
    };
    await freeflowCommand.definition.handler("settings repo", settingsCtx);
    const saved = JSON.parse(await readFile(join(cwd, ".freeflow/config.json"), "utf8"));
    assert.deepEqual(saved.cognitiveRouting.profiles.executor, {
      provider: "test",
      model: "model-b",
      thinking: "max",
    });
    assert.equal(settingsCtx.reloads.length, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi settings set Review Work's review mode and reviewer model in the files", async () => {
  const cwd = await configuredRepo({ review: { model: "claude-opus-4-5" } });
  try {
    const { commands } = loadExtension(freeflowExtension, {
      appendEntry() {},
      async setModel() {
        return true;
      },
      setThinkingLevel() {},
    });
    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    const settingsCtx = context(cwd);
    settingsCtx.isIdle = () => true;
    settingsCtx.modelRegistry = cognitiveRoutingModelRegistry();
    settingsCtx.ui.custom = async (factory) => {
      let result;
      const component = factory({ requestRender() {} }, testTheme, {}, (value) => {
        result = value;
      });
      choose(component, "Review");
      const text = renderText(component, 200);
      assert.match(text, /Review\s+auto \(inherited\)\n/);
      // The mode is the section's row: auto, off, always.
      await press(component, "Review");
      await press(component, "Review");
      // A name set in the file stays offered beside this host's models; the picker starts on it.
      choose(component, "Reviewer model", "Review");
      component.handleInput(KEY.enter);
      const picker = renderText(component, 200);
      assert.match(picker, /None\s+Review Work chooses/);
      assert.match(picker, /→ claude-opus-4-5\s+Set in the file; not an authenticated model here\./);
      assert.match(picker, /test\/model-a[\s\S]*test\/model-b/);
      component.handleInput(KEY.down);
      component.handleInput(KEY.down);
      component.handleInput(KEY.enter);
      await component.waitForWrites();
      return result;
    };
    await freeflowCommand.definition.handler("settings repo", settingsCtx);
    const saved = JSON.parse(await readFile(join(cwd, ".freeflow/config.json"), "utf8"));
    assert.deepEqual(saved.review, { mode: "always", model: "test/model-b" });
    assert.equal(settingsCtx.reloads.length, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi session settings expose both routing preset wizards without changing config files", async () => {
  const cwd = await configuredRepo({
    cognitiveRouting: {
      enabled: true,
      profiles: {
        coordinator: { provider: "test", model: "model-a", thinking: "low" },
        executor: { provider: "test", model: "model-b", thinking: "high" },
      },
    },
  });
  try {
    const configPath = join(cwd, ".freeflow/config.json");
    const localPath = join(cwd, ".freeflow/local.json");
    const originalConfig = await readFile(configPath, "utf8");
    const originalLocal = await readFile(localPath, "utf8").catch(() => undefined);
    const { commands } = loadExtension(freeflowExtension, {
      async setModel() {
        return true;
      },
      setThinkingLevel() {},
    });
    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);
    const settingsCtx = context(cwd);
    settingsCtx.isIdle = () => true;
    settingsCtx.modelRegistry = cognitiveRoutingModelRegistry();
    settingsCtx.ui.custom = async (factory) => {
      let result;
      const component = factory({ requestRender() {} }, testTheme, {}, (value) => {
        result = value;
      });
      // The session's presets are rows of the Cognitive Routing section, not a separate page; the list scrolls to them.
      choose(component, "Helper preset", "Cognitive Routing");
      const presetRendered = component.render(180).join("\n");
      assert.match(presetRendered, /Coordinator preset/);
      assert.match(presetRendered, /Helper preset/);
      assert.match(presetRendered, /Executor preset/);
      result = { changed: false };
      await component.waitForWrites();
      return result;
    };
    await freeflowCommand.definition.handler("settings session", settingsCtx);
    assert.equal(await readFile(configPath, "utf8"), originalConfig);
    assert.equal(await readFile(localPath, "utf8").catch(() => undefined), originalLocal);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi session preset wizard applies a complete pair without writing config", async () => {
  const cwd = await configuredRepo({
    cognitiveRouting: {
      enabled: true,
      profiles: {
        coordinator: { provider: "test", model: "model-a", thinking: "low" },
        executor: { provider: "test", model: "model-b", thinking: "high" },
      },
    },
  });
  try {
    const configPath = join(cwd, ".freeflow/config.json");
    const originalConfig = await readFile(configPath, "utf8");
    const calls = [];
    const controller = {
      state: () => ({ effective: true, controlMode: "automatic", activeProfile: "coordinator" }),
      sessionProfileOverrides: () => ({}),
      sessionDelegationOverride: () => undefined,
      setSessionDelegationOverride: async () => ({ status: "unchanged" }),
      setManualProfile: async () => ({ status: "active" }),
      setAutomaticControl: async () => ({ status: "automatic" }),
      setSessionProfileOverride: async (profile, override) => {
        calls.push({ profile, override });
        return { status: "active" };
      },
      resetSessionProfileOverrides: async () => ({ status: "unchanged" }),
    };
    const settingsCtx = context(cwd);
    settingsCtx.isIdle = () => true;
    settingsCtx.modelRegistry = cognitiveRoutingModelRegistry();
    const pi = {
      host: {},
      appendEntry() {},
      async setModel() {
        return true;
      },
      setThinkingLevel() {},
    };
    settingsCtx.ui.custom = async (factory) => {
      let finish;
      const component = factory({ requestRender() {} }, testTheme, {}, (value) => {
        finish = value;
      });
      choose(component, "Coordinator preset", "Cognitive Routing");
      component.handleInput("\r");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\r");
      await component.waitForWrites();
      finish?.({ changed: false });
      return { changed: false };
    };
    await handleFreeflowCommand("settings session", settingsCtx, async () => {}, pi, controller);
    assert.deepEqual(calls, [
      {
        profile: "coordinator",
        override: { provider: "test", modelId: "model-a", thinking: "low" },
      },
    ]);
    assert.equal(await readFile(configPath, "utf8"), originalConfig);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("both mode session wizard applies a Helper pair without writing config", async () => {
  const cwd = await configuredRepo({
    cognitiveRouting: {
      enabled: true,
      delegation: "both",
      profiles: {
        coordinator: { provider: "test", model: "model-a", thinking: "low" },
        helper: { provider: "test", model: "model-b", thinking: "high" },
        executor: { provider: "test", model: "model-b", thinking: "max" },
      },
    },
  });
  try {
    const configPath = join(cwd, ".freeflow/config.json");
    const originalConfig = await readFile(configPath, "utf8");
    const calls = [];
    const controller = {
      state: () => ({ effective: true, controlMode: "automatic", activeProfile: "coordinator" }),
      sessionProfileOverrides: () => ({}),
      sessionDelegationOverride: () => undefined,
      setSessionDelegationOverride: async () => ({ status: "unchanged" }),
      setManualProfile: async () => ({ status: "active" }),
      setAutomaticControl: async () => ({ status: "automatic" }),
      setSessionProfileOverride: async (profile, override) => {
        calls.push({ profile, override });
        return { status: "stored" };
      },
      resetSessionProfileOverrides: async () => ({ status: "unchanged" }),
    };
    const settingsCtx = context(cwd);
    settingsCtx.isIdle = () => true;
    settingsCtx.modelRegistry = cognitiveRoutingModelRegistry();
    const pi = {
      host: {},
      appendEntry() {},
      async setModel() {
        return true;
      },
      setThinkingLevel() {},
    };
    settingsCtx.ui.custom = async (factory) => {
      let finish;
      const component = factory({ requestRender() {} }, testTheme, {}, (value) => {
        finish = value;
      });
      choose(component, "Helper preset", "Cognitive Routing");
      component.handleInput("\r");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\r");
      await component.waitForWrites();
      finish?.({ changed: false });
      return { changed: false };
    };
    await handleFreeflowCommand("settings session", settingsCtx, async () => {}, pi, controller);
    assert.deepEqual(calls, [
      {
        profile: "helper",
        override: { provider: "test", modelId: "model-a", thinking: "low" },
      },
    ]);
    assert.equal(await readFile(configPath, "utf8"), originalConfig);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("session reset preserves core overrides when routing reset fails", async () => {
  const cwd = await configuredRepo({
    enabled: false,
    cognitiveRouting: {
      enabled: true,
      profiles: {
        coordinator: { provider: "test", model: "model-a", thinking: "low" },
        executor: { provider: "test", model: "model-b", thinking: "high" },
      },
    },
  });
  try {
    const configPath = join(cwd, ".freeflow/config.json");
    const originalConfig = await readFile(configPath, "utf8");
    const settingsCtx = context(cwd);
    settingsCtx.isIdle = () => true;
    settingsCtx.modelRegistry = cognitiveRoutingModelRegistry();
    const pi = {
      host: {},
      appendEntry() {},
      async setModel() {
        return true;
      },
      setThinkingLevel() {},
    };
    await setSessionCoreOverride("enabled", true, settingsCtx, pi);
    let mode = "both";
    const changes = [];
    const controller = {
      state: () => ({ effective: true, controlMode: "automatic", activeProfile: "coordinator", delegation: mode }),
      sessionProfileOverrides: () => ({}),
      sessionDelegationOverride: () => mode,
      setSessionDelegationOverride: async (choice) => {
        changes.push(choice);
        mode = choice ?? "executor";
        return { status: "stored" };
      },
      setManualProfile: async () => ({ status: "active" }),
      setAutomaticControl: async () => ({ status: "automatic" }),
      setSessionProfileOverride: async () => ({ status: "stored" }),
      resetSessionProfileOverrides: async () => ({ status: "blocked", reason: "fixture failure" }),
    };
    settingsCtx.ui.custom = async (factory) => {
      let finish;
      const component = factory({ requestRender() {} }, testTheme, {}, (value) => {
        finish = value;
      });
      choose(component, "Reset overrides", "Session");
      component.handleInput("\r");
      component.handleInput("\r");
      await component.waitForWrites();
      finish?.({ changed: false });
      return { changed: false };
    };
    await handleFreeflowCommand("settings session", settingsCtx, async () => {}, pi, controller);
    const state = await readCapabilityState(cwd, settingsCtx);
    assert.equal(state.enabled, true);
    assert.equal(state.sessionOverrides.enabled, true);
    assert.deepEqual(changes, [null, "both"]);
    assert.equal(mode, "both");
    assert.equal(await readFile(configPath, "utf8"), originalConfig);
    assert.match(settingsCtx.notifications.at(-1)?.message ?? "", /fixture failure/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi filters persisted Workflow and Cognitive Routing bootstrap entries without creating them", async () => {
  const cwd = await configuredRepo();
  try {
    const { handlers } = loadExtension();
    const userMessage = { role: "user", content: "hello", timestamp: Date.now() };
    const messages = [
      { role: "custom", customType: "freeflow-workflow-bootstrap", content: "old workflow", display: false },
      { role: "custom", customType: "freeflow-cognitive-routing-bootstrap", content: "old routing", display: false },
      userMessage,
    ];
    const result = await contextHandler(handlers)({ messages }, context(cwd));
    assert.deepEqual(
      result.messages.filter((message) => message.customType !== "freeflow-runtime-state"),
      [userMessage],
    );
    const runtimeStateIndex = result.messages.findIndex((message) => message.customType === "freeflow-runtime-state");
    assert.equal(runtimeStateIndex, result.messages.findIndex((message) => message.role === "user") - 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi preserves the host prompt and sends no Freeflow guidance when a mandatory file is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-pi-missing-prompt-"));
  const cwd = await configuredRepo();
  try {
    await mkdir(join(root, "pi-extension"), { recursive: true });
    await execFileAsync("cp", ["-R", join(process.cwd(), "pi-extension", "dist"), join(root, "pi-extension")]);
    await execFileAsync("cp", ["-R", join(process.cwd(), "runtime"), root]);
    await execFileAsync("ln", ["-s", join(process.cwd(), "node_modules"), join(root, "node_modules")]);
    await execFileAsync("rm", [join(root, "runtime", "prompts", "interaction-contract.md")]);
    const extension = (
      await import(`${new URL(`file://${join(root, "pi-extension", "dist", "index.js")}`).href}?missing=${Date.now()}`)
    ).default;
    const { handlers } = loadExtension(extension);
    const before = await beforeAgentStartHandler(handlers)({ systemPrompt: "base prompt" }, context(cwd));
    assert.equal(before.systemPrompt, "base prompt");
    assert.equal(before.renderedGuidance ?? "", "", "no Freeflow guidance while inactive");
    const resources = await handlers.get("resources_discover")({ cwd }, context(cwd));
    // Inactive Freeflow lists only Setup Freeflow (Task 003 D-002).
    assert.equal(resources.skillPaths.length, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

function cognitiveRoutingModelRegistry() {
  // Levels as Pi's model data states them: null rules a level out, and xhigh and max need a mapping.
  const models = [
    {
      provider: "test",
      id: "model-a",
      name: "Model A",
      reasoning: true,
      contextWindow: 128000,
      thinkingLevelMap: { minimal: null },
    },
    {
      provider: "test",
      id: "model-b",
      name: "Model B",
      reasoning: true,
      contextWindow: 128000,
      thinkingLevelMap: { minimal: null, max: "max" },
    },
  ];
  return {
    getAvailable() {
      return models;
    },
    find(provider, id) {
      return models.find((model) => model.provider === provider && model.id === id);
    },
    async getApiKeyAndHeaders() {
      return { ok: true };
    },
  };
}
