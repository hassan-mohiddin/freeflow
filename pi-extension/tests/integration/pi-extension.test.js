import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { promisify } from "node:util";

import freeflowExtension from "../../dist/index.js";
import {
  readCapabilityState,
  readFreeflowConfigLayers,
  resetSessionOverrides,
  restoreSessionOverrides,
  setFreeflowStatus,
  setSessionCoreOverride,
} from "../../dist/runtime/runtime-context.js";
import { PIFLOW_HOST } from "../cognitive-routing/host-fixture.js";

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
      { role: "toolResult", toolName: "freeflow_switch_profile", content: [] },
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
  assert.deepEqual(
    shortcuts.map(({ shortcut }) => shortcut),
    ["ctrl+shift+r", "ctrl+shift+a"],
  );
  assert.ok(tools.some((tool) => tool.name === "freeflow_context"));
  assert.ok(tools.some((tool) => tool.name === "freeflow_switch_profile"));
  assert.ok(freeflowCommand);
  assert.ok(!freeflowCommand.definition.getArgumentCompletions("").some((item) => item.value === "mode"));
  assert.deepEqual(freeflowCommand.definition.getArgumentCompletions("mode "), []);
  assert.ok(
    !toolNames.some((name) => ["freeflow_status", "freeflow_search", "freeflow_run", "freeflow_batch"].includes(name)),
  );
});

test("unsupported Pi hosts keep Cognitive Routing unavailable while exposing its configuration", async () => {
  const cwd = await configuredRepo({
    cognitiveRouting: {
      enabled: true,
      profiles: {
        standard: { provider: "test", model: "standard", thinkingLevel: "high" },
        reasoning: { provider: "test", model: "reasoning", thinkingLevel: "max" },
      },
    },
  });
  try {
    const { commands, handlers, shortcuts, tools } = loadExtension(freeflowExtension, null);
    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);
    assert.deepEqual(shortcuts, []);
    assert.ok(!tools.some((tool) => tool.name === "freeflow_switch_profile"));
    assert.ok(!freeflowCommand.definition.getArgumentCompletions("").some((item) => item.value === "profile"));
    const capabilityState = await readCapabilityState(cwd, undefined, undefined);
    assert.equal(capabilityState.cognitiveRouting.enabled, true);
    assert.equal(capabilityState.cognitiveRouting.effective, false);
    assert.equal(capabilityState.cognitiveRouting.blockingReason.code, "host_unsupported");

    const ctx = context(cwd);
    await handlers.get("session_start")({ type: "session_start" }, ctx);
    assert.match(ctx.statuses.at(-1).value, /cognitive blocked · host_unsupported/);
    const before = await handlers.get("before_agent_start")({ systemPrompt: "base" }, ctx);
    assert.doesNotMatch(before.systemPrompt, /Cognitive Routing/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("normal Pi settings expose active Cognitive Routing configuration", async () => {
  const cwd = await configuredRepo({
    cognitiveRouting: {
      enabled: true,
      profiles: {
        standard: { provider: "test", model: "model-a", thinkingLevel: "low" },
        reasoning: { provider: "test", model: "model-b", thinkingLevel: "high" },
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
      assert.match(rootText, /Cognitive Routing\s+enabled \(5\) active/);
      assert.doesNotMatch(rootText, /PiFlow only/);
      return undefined;
    };

    await freeflowCommand.definition.handler("settings", settingsCtx);
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
    { effective: true, activeProfile: "reasoning", controlMode: "automatic" },
    readyFreeflowContext,
  );
  assert.equal(ctx.statuses.at(-1).value, "freeflow: reasoning · automatic · context");
  assert.doesNotMatch(ctx.statuses.at(-1).value, /interaction|workflow|mode|skills/i);
});

test("Pi statusline shows the configured Cognitive Routing profile while activation is pending", () => {
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
        sessionStart: { profile: "reasoning" },
        blockingReason: null,
      },
    },
    undefined,
    readyFreeflowContext,
    { cognitiveRoutingStartupPending: true },
  );
  assert.equal(ctx.statuses.at(-1).value, "freeflow: reasoning · pending");
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
    { effective: false, activeProfile: "standard", controlMode: "automatic" },
    readyFreeflowContext,
    { cognitiveRoutingStartupPending: true },
  );
  assert.equal(ctx.statuses.at(-1).value, "freeflow: cognitive blocked · runtime_inactive");
});

test("PiFlow empty configured sessions show a pending profile before first prompt", async () => {
  const cwd = await configuredRepo({
    cognitiveRouting: {
      enabled: true,
      profiles: {
        standard: { provider: "test", model: "model-a", thinkingLevel: "low" },
        reasoning: { provider: "test", model: "model-b", thinkingLevel: "high" },
      },
    },
  });
  try {
    const { handlers } = loadExtension();
    const ctx = context(cwd);
    ctx.modelRegistry = cognitiveRoutingModelRegistry();
    await handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
    assert.equal(ctx.statuses.at(-1).value, "freeflow: reasoning · automatic");
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

test("Pi describes the mode-free Freeflow argument surface", () => {
  const { commands } = loadExtension();
  const freeflowCommand = commands.find((command) => command.name === "freeflow");
  assert.ok(freeflowCommand);
  assert.deepEqual(freeflowCommand.definition.getArgumentCompletions(""), [
    { value: "settings", label: "settings", description: "Open personal override settings" },
    { value: "status", label: "status", description: "Show effective Freeflow state" },
    { value: "context", label: "context", description: "Inspect Freeflow Context" },
    { value: "profile", label: "profile", description: "Hold or release Cognitive Routing profile control" },
    { value: "enable", label: "enable", description: "Enable Freeflow for this repository" },
    { value: "disable", label: "disable", description: "Disable Freeflow for this repository" },
  ]);
  assert.deepEqual(freeflowCommand.definition.getArgumentCompletions("mode "), []);
  assert.deepEqual(freeflowCommand.definition.getArgumentCompletions("context "), [
    { value: "context status", label: "status", description: "Show Freeflow Context state" },
    { value: "context list", label: "list", description: "List archived context projections" },
    { value: "context restore", label: "restore", description: "Restore one or more context references" },
    { value: "context reset all", label: "reset all", description: "Reset projection decisions on the active branch" },
  ]);
});

test("Pi exposes 25 base skills without a mode skill or compatibility aliases", async () => {
  const cwd = await configuredRepo();
  try {
    const { handlers, commands, sentMessages, sentMessageOptions } = loadExtension();
    const resources = await handlers.get("resources_discover")({ cwd }, context(cwd));
    const skillNames = resources.skillPaths.map((path) => {
      const match = path.match(/[\\/]skills[\\/]([^\\/]+)\/SKILL\.md$/);
      assert.ok(match, `unexpected skill path: ${path}`);
      return match[1];
    });
    assert.equal(skillNames.length, 25);
    assert.ok(skillNames.includes("workflow"));
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
    assert.equal(resources.skillPaths.length, 1);
    assert.match(resources.skillPaths[0], /setup-freeflow\/SKILL\.md$/);
    const result = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, context(cwd));
    assert.equal(result.systemPrompt, "base prompt");
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
    assert.equal(resources.skillPaths.length, 1);
    assert.match(resources.skillPaths[0], /setup-freeflow\/SKILL\.md$/);
    const result = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, context(cwd));
    assert.equal(result.systemPrompt, "base prompt");
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
    assert.equal(resources.skillPaths.length, 1);
    assert.match(resources.skillPaths[0], /setup-freeflow\/SKILL\.md$/);
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

test("Pi master Freeflow toggle suppresses core prompts, skills, and capabilities", async () => {
  const cwd = await configuredRepo({ enabled: false });
  try {
    const { handlers, activeToolNames } = loadExtension();
    const ctx = context(cwd);
    const resources = await handlers.get("resources_discover")({ cwd }, ctx);
    assert.deepEqual(resources.skillPaths, []);
    const result = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.equal(result.systemPrompt, "base prompt");
    const providerContext = await handlers.get("context")({ messages: [] }, ctx);
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
        standard: { provider: "test", model: "model-a", thinkingLevel: "low" },
        reasoning: { provider: "test", model: "model-b", thinkingLevel: "high" },
      },
    },
  });
  try {
    const { commands } = loadExtension();
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
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      for (let index = 0; index < 4; index++) component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\r");
      await component.waitForWrites();
      return result;
    };
    await freeflowCommand.definition.handler("settings repo", settingsCtx);
    const saved = JSON.parse(await readFile(join(cwd, ".freeflow/config.json"), "utf8"));
    assert.deepEqual(saved.cognitiveRouting.profiles.standard, {
      provider: "test",
      model: "model-b",
      thinkingLevel: "max",
    });
    assert.equal(settingsCtx.reloads.length, 1);
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

test("Pi preserves the host prompt when a mandatory prompt file is missing", async () => {
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
    assert.equal(before.systemPrompt, "base prompt");
    const resources = await handlers.get("resources_discover")({ cwd }, context(cwd));
    assert.deepEqual(resources.skillPaths, []);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

function cognitiveRoutingModelRegistry() {
  const models = [
    { provider: "test", id: "model-a", name: "Model A", reasoning: true },
    { provider: "test", id: "model-b", name: "Model B", reasoning: true },
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
