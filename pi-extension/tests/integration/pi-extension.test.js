import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { promisify } from "node:util";
import { SessionManager } from "@earendil-works/pi-coding-agent";

import freeflowExtension from "../../dist/index.js";
import { handleFreeflowCommand } from "../../dist/settings/settings-ui.js";
import {
  readCapabilityState,
  readFreeflowConfigLayers,
  resetSessionOverrides,
  restoreSessionOverrides,
  setFreeflowStatus,
  setSessionCoreOverride,
} from "../../dist/runtime/runtime-context.js";
import { PIFLOW_HOST } from "../fixtures/pi-host.js";
import { matches } from "../../dist/cognitive-routing-v2/schemas.js";

const execFileAsync = promisify(execFile);

function loadExtension(extension = freeflowExtension, host = PIFLOW_HOST, runtimeApi = {}) {
  const handlers = new Map();
  const tools = [];
  const commands = [];
  const shortcuts = [];
  const entries = [];
  const sentMessages = [];
  const sentMessageOptions = [];
  let activeToolNames;
  const pi = {
    host,
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

async function configuredRepo(config = {}) {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-integration-"));
  await mkdir(join(cwd, ".freeflow"));
  await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify(config, null, 2), "utf8");
  return cwd;
}

function lastRuntimeState(messages) {
  return messages.findLast((message) => message.customType === "freeflow-runtime-state");
}

test("keeps Runtime State before the latest user message during context refreshes", async () => {
  const cwd = await configuredRepo();
  try {
    const { handlers } = loadExtension();
    const ctx = context(cwd);
    await handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);

    const conversation = [
      { role: "user", content: "release 0.6.1" },
      { role: "assistant", content: "delegating" },
      { role: "toolResult", toolName: "freeflow_delegate", content: [] },
    ];
    const first = await handlers.get("context")({ messages: conversation }, ctx);
    const firstUserIndex = first.messages.findIndex((message) => message.role === "user");
    const firstRuntimeIndex = first.messages.findIndex((message) => message.customType === "freeflow-runtime-state");
    assert.equal(firstRuntimeIndex, firstUserIndex - 1);
    assert.equal(first.messages.at(-1).role, "toolResult");

    await handlers.get("session_compact")({ type: "session_compact", reason: "threshold" }, ctx);
    const refreshed = await handlers.get("context")({ messages: first.messages }, ctx);
    const refreshedUserIndex = refreshed.messages.findIndex((message) => message.role === "user");
    const refreshedRuntimeIndex = refreshed.messages.findIndex(
      (message) => message.customType === "freeflow-runtime-state",
    );
    assert.equal(refreshedRuntimeIndex, refreshedUserIndex - 1);
    assert.equal(refreshed.messages.at(-1).role, "toolResult");

    const interrupted = await handlers.get("context")(
      {
        messages: [...refreshed.messages, { role: "user", content: "stop" }],
      },
      ctx,
    );
    const latestUserIndex = interrupted.messages.findLastIndex((message) => message.role === "user");
    const latestRuntimeIndex = interrupted.messages.findIndex(
      (message) => message.customType === "freeflow-runtime-state",
    );
    assert.equal(latestRuntimeIndex, latestUserIndex - 1);
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
      const loaded = loadExtension(freeflowExtension, null, {
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
      await loaded.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);

      const toolNames = loaded.tools.map((tool) => tool.name);
      assert.deepEqual(
        toolNames.filter((name) =>
          ["freeflow_delegate", "freeflow_return", "freeflow_unit", "freeflow_project"].includes(name),
        ),
        ["freeflow_delegate", "freeflow_return", "freeflow_unit", "freeflow_project"],
      );
      const delegate = loaded.tools.find((tool) => tool.name === "freeflow_delegate");
      const returning = loaded.tools.find((tool) => tool.name === "freeflow_return");
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
      assert.equal(loaded.activeToolNames().includes("freeflow_project"), true);

      const providerContext = await loaded.handlers.get("context")({ messages: [] }, ctx);
      assert.match(providerContext.messages[0].content, /Delegation: `executor`/);
      assert.match(providerContext.messages[0].content, new RegExp("Projection: `" + scenario.expectedMode + "`"));

      await loaded.commands.find((command) => command.name === "freeflow").definition.handler("profile executor", ctx);
      const manualContext = await loaded.handlers.get("context")({ messages: [] }, ctx);
      assert.match(
        manualContext.messages.findLast((message) => message.customType === "freeflow-runtime-state").content,
        new RegExp("Projection: `" + (scenario.projection ? "manual-bypass" : "disabled") + "`"),
      );
      assert.equal(loaded.activeToolNames().includes("freeflow_project"), true);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }
});

test("Pi describes strict evidence-selection operation shapes", () => {
  const { tools } = loadExtension();
  const project = tools.find((tool) => tool.name === "freeflow_project");
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
  const unit = tools.find((tool) => tool.name === "freeflow_unit");
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
  for (const command of ["discuss", "track-work", "execute-work"]) assert.ok(commandNames.includes(command));
  assert.ok(!commandNames.includes("discover"));
  assert.ok(!commandNames.includes("execute-plan"));
  assert.ok(!commandNames.includes("workflow"));
  assert.deepEqual(shortcuts, []);
  assert.ok(tools.some((tool) => tool.name === "freeflow_context"));
  assert.deepEqual(
    toolNames.filter((name) => name.startsWith("freeflow_")),
    [
      "freeflow_delegate",
      "freeflow_return",
      "freeflow_unit",
      "freeflow_project",
      "freeflow_context",
      "freeflow_tools",
      "freeflow_run",
      "freeflow_result",
    ],
  );
  assert.ok(!toolNames.includes("freeflow_switch_profile"));
  assert.ok(!toolNames.includes("freeflow_cognitive_routing_history"));
  assert.ok(freeflowCommand);
  assert.ok(!freeflowCommand.definition.getArgumentCompletions("").some((item) => item.value === "mode"));
  assert.deepEqual(freeflowCommand.definition.getArgumentCompletions("mode "), []);
  assert.ok(!toolNames.some((name) => ["freeflow_status", "freeflow_search", "freeflow_batch"].includes(name)));
});

test("PiFlow keeps Cognitive Routing unavailable while exposing its configuration", async () => {
  const cwd = await configuredRepo({
    toolExecution: { enabled: true, programs: { mode: "reduction" } },
    cognitiveRouting: {
      enabled: true,
      profiles: {
        coordinator: { provider: "test", model: "coordinator", thinking: "high" },
        executor: { provider: "test", model: "executor", thinking: "max" },
      },
    },
  });
  try {
    const { commands, handlers, shortcuts, tools, activeToolNames } = loadExtension(freeflowExtension, PIFLOW_HOST);
    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);
    assert.deepEqual(shortcuts, []);
    assert.deepEqual(
      tools.filter((tool) => tool.name.startsWith("freeflow_")).map((tool) => tool.name),
      [
        "freeflow_delegate",
        "freeflow_return",
        "freeflow_unit",
        "freeflow_project",
        "freeflow_context",
        "freeflow_tools",
        "freeflow_run",
        "freeflow_result",
      ],
    );
    assert.ok(!tools.some((tool) => tool.name === "freeflow_switch_profile"));
    assert.ok(!tools.some((tool) => tool.name === "freeflow_cognitive_routing_history"));
    assert.ok(!freeflowCommand.definition.getArgumentCompletions("").some((item) => item.value === "profile"));
    const capabilityState = await readCapabilityState(cwd, undefined, undefined);
    assert.equal(capabilityState.cognitiveRouting.enabled, true);
    assert.equal(capabilityState.cognitiveRouting.effective, false);
    assert.equal(capabilityState.cognitiveRouting.blockingReason.code, "host_unsupported");

    const ctx = context(cwd);
    await handlers.get("session_start")({ type: "session_start" }, ctx);
    assert.match(ctx.statuses.at(-1).value, /cognitive blocked ·/);
    const run = tools.find((tool) => tool.name === "freeflow_run");
    await assert.rejects(
      () =>
        run.execute(
          "piflow-run",
          { code: `emit("unreachable")`, description: "unavailable", operations: [] },
          undefined,
          undefined,
          ctx,
        ),
      /programs_disabled/,
    );
    assert.ok(activeToolNames().includes("freeflow_delegate"));
    const before = await handlers.get("before_agent_start")({ systemPrompt: "base" }, ctx);
    assert.match(before.systemPrompt, /guidance is dormant/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
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
    const { commands } = loadExtension(freeflowExtension, null, {
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
      assert.match(rootText, /Cognitive Routing\s+enabled \(6\) active/);
      assert.doesNotMatch(rootText, /PiFlow only/);
      return undefined;
    };

    await freeflowCommand.definition.handler("settings", settingsCtx);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi settings and status disclose capture retention and verified reader availability", async () => {
  const cwd = await configuredRepo({
    toolExecution: {
      enabled: true,
      capture: { enabled: true },
      accounting: { enabled: true },
    },
  });
  try {
    const { commands } = loadExtension(freeflowExtension, null, {
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
      assert.match(
        renderText(component),
        /Tool Execution\s+enabled \(5\) capture active · workspace inactive · discovery inactive · accounting active/,
      );
      component.handleInput("\u001b[B");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\u001b[B");
      const detail = renderText(component);
      assert.match(detail, /Capture new Bash text results/);
      assert.match(detail, /Disabling new capture retains sidecar files/);
      return undefined;
    };
    await command.definition.handler("settings repo", settingsCtx);

    const statusCtx = context(cwd);
    await command.definition.handler("status", statusCtx);
    assert.match(statusCtx.notifications.at(-1).message, /verified reader enabled/);
    assert.match(statusCtx.notifications.at(-1).message, /native Bash is built in, custom tools require adapters/);
    assert.match(statusCtx.notifications.at(-1).message, /captured files are retained until explicit deletion/);

    const issueCtx = context(cwd);
    await handleFreeflowCommand("status", issueCtx, async () => {}, {}, undefined, {
      status: () => ({
        queued: 0,
        failures: [
          {
            code: "storage_busy",
            message: "Native output retained; remove stale .capture-reservation only when no process is active.",
          },
        ],
      }),
    });
    assert.match(issueCtx.notifications.at(-1).message, /latest capture issue storage_busy/);
    assert.match(issueCtx.notifications.at(-1).message, /remove stale \.capture-reservation/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
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
    const { commands } = loadExtension(freeflowExtension, null, {
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
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\u001b[B");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      await component.waitForWrites();
      component.handleInput("\u001b");
      component.handleInput("\u001b");
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
    contextVirtualization: true,
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
    const { commands, pi } = loadExtension(freeflowExtension, null, {
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

    const chooseDelegation = async (direction, commit = true) => {
      settingsCtx.ui.custom = async (factory) => {
        let result;
        const component = factory({ requestRender() {} }, testTheme, {}, (value) => {
          result = value;
        });
        component.handleInput("\u001b[B");
        component.handleInput("\r");
        component.handleInput("\u001b[B");
        component.handleInput("\r");
        component.handleInput(direction);
        component.handleInput(commit ? "\r" : "\u001b");
        if (commit) await component.waitForWrites();
        component.handleInput("\u001b");
        component.handleInput("\u001b");
        return result;
      };
      await command.definition.handler("settings", settingsCtx);
    };

    await chooseDelegation("\u001b[B");
    let saved = JSON.parse(await readFile(localPath, "utf8"));
    assert.equal(saved.cognitiveRouting.delegation, "executor");
    assert.deepEqual(saved.cognitiveRouting.profiles, local.cognitiveRouting.profiles);
    assert.deepEqual(JSON.parse(await readFile(repositoryPath, "utf8")), repository);
    assert.equal((await readCapabilityState(cwd, settingsCtx, pi.host)).cognitiveRouting.delegation, "executor");

    await chooseDelegation("\u001b[A");
    saved = JSON.parse(await readFile(localPath, "utf8"));
    assert.equal(saved.cognitiveRouting.delegation, undefined);
    assert.deepEqual(saved.cognitiveRouting.profiles, local.cognitiveRouting.profiles);
    assert.equal((await readCapabilityState(cwd, settingsCtx, pi.host)).cognitiveRouting.delegation, "helper");

    const beforeCancel = await readFile(localPath, "utf8");
    await chooseDelegation("\u001b[B", false);
    assert.equal(await readFile(localPath, "utf8"), beforeCancel);
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
    const { commands } = loadExtension(freeflowExtension, null, {
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
      component.handleInput("\u001b[B");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
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

test("Pi statusline reports only dynamic Cognitive Routing and context state", () => {
  const ctx = context();
  setFreeflowStatus(
    ctx,
    {
      configured: true,
      enabled: true,
      configSources: { enabled: "builtin" },
      contextVirtualization: { effective: true },
      conversationHistory: { effective: false },
      cognitiveRouting: { enabled: true, effective: true, blockingReason: null },
    },
    { effective: true, activeProfile: "executor", controlMode: "automatic" },
    readyFreeflowContext,
  );
  assert.equal(ctx.statuses.at(-1).value, "freeflow: executor · automatic · context");
  assert.doesNotMatch(ctx.statuses.at(-1).value, /interaction|workflow|mode|skills/i);
});

test("Pi statusline defaults pending activation to the Coordinator profile", () => {
  const ctx = context();
  setFreeflowStatus(
    ctx,
    {
      configured: true,
      enabled: true,
      configSources: { enabled: "builtin" },
      contextVirtualization: { effective: false },
      conversationHistory: { effective: false },
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
      contextVirtualization: { effective: false },
      conversationHistory: { effective: false },
      cognitiveRouting: { enabled: true, effective: true, blockingReason: null },
    },
    { effective: false, activeProfile: "coordinator", controlMode: "automatic" },
    readyFreeflowContext,
    { cognitiveRoutingStartupPending: true },
  );
  assert.equal(ctx.statuses.at(-1).value, "freeflow: cognitive blocked · runtime_inactive");
});

test("PiFlow keeps configured routing unavailable before the first prompt", async () => {
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
    const { handlers } = loadExtension();
    const ctx = context(cwd);
    ctx.modelRegistry = cognitiveRoutingModelRegistry();
    await handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
    assert.match(ctx.statuses.at(-1).value, /cognitive blocked ·/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi exposes bypass scope argument completions", () => {
  const { commands } = loadExtension();
  const bypassCommand = commands.find((command) => command.name === "bypass");
  assert.ok(bypassCommand);
  assert.deepEqual(bypassCommand.definition.getArgumentCompletions(""), [
    { value: "next", label: "next", description: "Skip one optional step" },
    { value: "task", label: "task", description: "Reduce optional pressure for the current task" },
  ]);
});

test("Pi describes the mode-free Freeflow argument surface and manual profile controls", () => {
  const { commands } = loadExtension(
    freeflowExtension,
    {},
    {
      appendEntry() {},
      setModel() {},
      setThinkingLevel() {},
    },
  );
  const freeflowCommand = commands.find((command) => command.name === "freeflow");
  assert.ok(freeflowCommand);
  assert.deepEqual(freeflowCommand.definition.getArgumentCompletions(""), [
    { value: "settings", label: "settings", description: "Open personal override settings" },
    { value: "status", label: "status", description: "Show effective Freeflow state" },
    { value: "context", label: "context", description: "Inspect Freeflow Context" },
    {
      value: "efficiency",
      label: "efficiency",
      description: "Show factual Tool Execution and provider observations",
    },
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
  assert.deepEqual(freeflowCommand.definition.getArgumentCompletions("efficiency "), [
    { value: "efficiency export", label: "export", description: "Export bounded factual efficiency JSON" },
  ]);
  assert.deepEqual(freeflowCommand.definition.getArgumentCompletions("mode "), []);
  assert.deepEqual(freeflowCommand.definition.getArgumentCompletions("context "), [
    { value: "context status", label: "status", description: "Show Freeflow Context state" },
    { value: "context list", label: "list", description: "List archived context projections" },
    { value: "context restore", label: "restore", description: "Restore one or more context references" },
    { value: "context reset all", label: "reset all", description: "Reset projection decisions on the active branch" },
  ]);
});

test("Pi exposes 24 base skills without TDD, a mode skill, or compatibility aliases", async () => {
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
    assert.equal(skillNames.length, 24);
    assert.ok(skillNames.includes("workflow"));
    assert.ok(!skillNames.includes("tdd"));
    assert.ok(!skillNames.includes("mode-contract"));
    assert.ok(!skillNames.includes("discover"));
    assert.ok(!skillNames.includes("execute-plan"));

    for (const [commandName, expectedSkill] of [
      ["action-selection", "action-selection"],
      ["discuss", "discuss"],
      ["track-work", "track-work"],
      ["execute-work", "execute-work"],
    ]) {
      const command = commands.find((candidate) => candidate.name === commandName);
      assert.ok(command);
      await command.definition.handler(undefined, context(cwd));
      assert.equal(sentMessages.at(-1), `/skill:${expectedSkill}`);
      assert.deepEqual(sentMessageOptions.at(-1), { expandPromptTemplates: true });
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
    assert.deepEqual(sentMessageOptions.at(-1), { expandPromptTemplates: true });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi keeps Freeflow inactive until repository activation exists", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-missing-setup-"));
  try {
    const { handlers } = loadExtension();
    const resources = await handlers.get("resources_discover")({ cwd }, context(cwd));
    assert.equal(resources.skillPaths.length, 27);
    assert.ok(resources.skillPaths.some((path) => path.endsWith("/skills/setup-freeflow/SKILL.md")));
    const result = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, context(cwd));
    assert.ok(result.systemPrompt.startsWith("base prompt\n\n"));
    assert.match(result.systemPrompt, /guidance is dormant/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi rejects obsolete modes and removed core toggles in configuration", async () => {
  for (const config of [{ defaultMode: "workflow" }, { interactionContract: false }, { skills: { enabled: false } }]) {
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

test("Pi treats invalid configuration as inactive", async () => {
  const cwd = await configuredRepo({ enabled: "false" });
  try {
    const { handlers, commands } = loadExtension();
    const resources = await handlers.get("resources_discover")({ cwd }, context(cwd));
    assert.equal(resources.skillPaths.length, 27);
    assert.ok(resources.skillPaths.some((path) => path.endsWith("/skills/setup-freeflow/SKILL.md")));
    const result = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, context(cwd));
    assert.ok(result.systemPrompt.startsWith("base prompt\n\n"));
    assert.match(result.systemPrompt, /guidance is dormant/);
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
    await writeFile(
      join(cwd, ".freeflow/local.json"),
      JSON.stringify({ enabled: false, contextVirtualization: true }, null, 2),
      "utf8",
    );
    const layers = await readFreeflowConfigLayers(cwd);
    assert.deepEqual(layers.coreConfig, {
      enabled: false,
      contextVirtualization: true,
      conversationHistory: false,
    });
    assert.deepEqual(layers.sources, {
      enabled: "local",
      contextVirtualization: "local",
      conversationHistory: "builtin",
    });
    const state = await readCapabilityState(cwd, undefined, PIFLOW_HOST);
    assert.equal(state.enabled, false);
    assert.equal("skills" in state, false);
    assert.equal("interactionContract" in state, false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi resolves Tool Execution sub-capabilities and exposes bounded runtime status", async () => {
  const cwd = await configuredRepo({
    toolExecution: {
      enabled: true,
      accounting: { enabled: true },
      capture: { enabled: true, maxInlineBytes: 4096 },
      workspace: { enabled: true },
      discovery: { enabled: true },
    },
  });
  try {
    const { handlers } = loadExtension(freeflowExtension, {});
    const ctx = context(cwd);
    await handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
    const state = await readCapabilityState(cwd, ctx, null);
    assert.equal(state.toolExecution.effective, true);
    assert.equal(state.toolExecution.accounting.effective, true);
    assert.equal(state.toolExecution.workspace.effective, true);
    assert.equal(state.toolExecution.discovery.effective, true);
    assert.equal(state.toolExecution.capture.maxInlineBytes, 4096);
    const providerContext = await handlers.get("context")({ messages: [] }, ctx);
    assert.match(
      lastRuntimeState(providerContext.messages).content,
      /Tool Execution: active · capture active · reader enabled · workspace active · discovery active · accounting active · programs pending/,
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi rejects invalid Tool Execution configuration", async () => {
  const cwd = await configuredRepo({ toolExecution: { programs: { mode: "node" } } });
  try {
    const layers = await readFreeflowConfigLayers(cwd);
    assert.equal(layers.configured, false);
    assert.match(layers.parseError, /programs\.mode must be one of/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi session enablement cannot bypass repository activation", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-session-activation-"));
  await mkdir(join(cwd, ".freeflow"));
  const { pi } = loadExtension();
  const ctx = context(cwd);
  try {
    await setSessionCoreOverride("enabled", true, ctx, pi);
    let state = await readCapabilityState(cwd, undefined, PIFLOW_HOST);
    assert.equal(state.configured, false);
    assert.equal(state.enabled, false);

    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({ enabled: false }), "utf8");
    state = await readCapabilityState(cwd, undefined, PIFLOW_HOST);
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
        data: { overrides: { enabled: false, contextVirtualization: true } },
      },
    ];
    restoreSessionOverrides(context(cwd, activeBranchEntries, activeBranchEntries));
    const state = await readCapabilityState(cwd, undefined, PIFLOW_HOST);
    assert.equal(state.enabled, false);
    assert.deepEqual(state.sessionOverrides, { enabled: false, contextVirtualization: true });
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
    const state = await readCapabilityState(cwd, undefined, PIFLOW_HOST);
    assert.equal(state.configured, false);
    assert.equal(state.enabled, false);
    const { handlers } = loadExtension();
    const resources = await handlers.get("resources_discover")({ cwd }, context(cwd));
    assert.equal(resources.skillPaths.length, 27);
    assert.ok(resources.skillPaths.some((path) => path.endsWith("/skills/setup-freeflow/SKILL.md")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi local enablement overrides the repository master switch", async () => {
  const cwd = await configuredRepo({ enabled: true });
  try {
    await writeFile(join(cwd, ".freeflow/local.json"), JSON.stringify({ enabled: false }, null, 2), "utf8");
    const state = await readCapabilityState(cwd, undefined, PIFLOW_HOST);
    assert.equal(state.configured, true);
    assert.equal(state.enabled, false);
    assert.equal(state.configSources.enabled, "local");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi master Freeflow toggle makes features inactive while preserving their reference surface", async () => {
  const cwd = await configuredRepo({ enabled: false });
  try {
    const { handlers, activeToolNames } = loadExtension();
    const ctx = context(cwd);
    const resources = await handlers.get("resources_discover")({ cwd }, ctx);
    assert.equal(resources.skillPaths.length, 27);
    const result = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.ok(result.systemPrompt.startsWith("base prompt\n\n"));
    assert.match(result.systemPrompt, /guidance is dormant/);
    const providerContext = await handlers.get("context")({ messages: [] }, ctx);
    assert.match(lastRuntimeState(providerContext.messages).content, /Freeflow: inactive/);
    assert.doesNotMatch(
      lastRuntimeState(providerContext.messages).content,
      /Default mode|Active mode|Interaction Contract|Skills/,
    );
    assert.ok(activeToolNames().includes("freeflow_context"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi settings expose no mode, Skills, or Interaction Contract controls", async () => {
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
      assert.match(text, /Freeflow Settings/);
      assert.match(text, /Freeflow Context/);
      assert.doesNotMatch(text, /Interaction Contract|Skills|Session mode|Default mode|Mode/);
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

test("Pi statusline uses one umbrella context label for either enabled context feature", async () => {
  const cwd = await configuredRepo({ contextVirtualization: true, conversationHistory: true });
  try {
    const { handlers } = loadExtension();
    const ctx = context(cwd);
    await handlers.get("session_start")({ reason: "startup" }, ctx);
    assert.equal(ctx.statuses.at(-1).value, "freeflow: context");
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
    const { commands } = loadExtension(
      freeflowExtension,
      {},
      {
        appendEntry() {},
        async setModel() {
          return true;
        },
        setThinkingLevel() {},
      },
    );
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
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      for (let index = 0; index < 4; index++) component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\r");
      for (let index = 0; index < 1; index++) component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\r");
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
    const { commands } = loadExtension(
      freeflowExtension,
      {},
      {
        async setModel() {
          return true;
        },
        setThinkingLevel() {},
      },
    );
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
      const rendered = component.render(180).join("\\n");
      assert.match(rendered, /Cognitive Routing presets/);
      component.handleInput("\u001b[B");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      const presetRendered = component.render(180).join("\\n");
      assert.match(presetRendered, /Coordinator preset/);
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
      component.handleInput("\u001b[B");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
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
      component.handleInput("\u001b[B");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\u001b[B");
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
    await setSessionCoreOverride("contextVirtualization", true, settingsCtx, pi);
    const controller = {
      state: () => ({ effective: true, controlMode: "automatic", activeProfile: "coordinator" }),
      sessionProfileOverrides: () => ({}),
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
      component.handleInput("\u001b[B");
      component.handleInput("\u001b[B");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\r");
      await component.waitForWrites();
      finish?.({ changed: false });
      return { changed: false };
    };
    await handleFreeflowCommand("settings session", settingsCtx, async () => {}, pi, controller);
    const state = await readCapabilityState(cwd, settingsCtx, pi.host);
    assert.equal(state.contextVirtualization.effective, true);
    assert.equal(state.sessionOverrides.contextVirtualization, true);
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
    const result = await handlers.get("context")({ messages }, context(cwd));
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

test("Pi preserves the host prompt prefix and dormant contract when a mandatory file is missing", async () => {
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
    const before = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, context(cwd));
    assert.ok(before.systemPrompt.startsWith("base prompt\n\n"));
    assert.match(before.systemPrompt, /guidance is dormant/);
    const resources = await handlers.get("resources_discover")({ cwd }, context(cwd));
    assert.equal(resources.skillPaths.length, 27);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

function cognitiveRoutingModelRegistry() {
  const models = [
    { provider: "test", id: "model-a", name: "Model A", reasoning: true, contextWindow: 128000 },
    { provider: "test", id: "model-b", name: "Model B", reasoning: true, contextWindow: 128000 },
  ];
  const supported = new Map([
    ["model-a", new Set(["off", "low", "medium", "high"])],
    ["model-b", new Set(["off", "low", "medium", "high", "max"])],
  ]);
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
    clampThinkingLevel(model, level) {
      return supported.get(model.id)?.has(level) ? level : "off";
    },
  };
}
