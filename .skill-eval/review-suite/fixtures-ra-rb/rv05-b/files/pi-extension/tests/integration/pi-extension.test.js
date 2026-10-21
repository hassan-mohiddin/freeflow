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
  readModeState,
  readOutputRouterConfig,
  resetSessionOverrides,
  setModeStatus,
  restoreModeOverride,
  setSessionCoreOverride,
  setSessionMode,
} from "../../dist/runtime/runtime-context.js";
import { createVault, storeTextOutput } from "../../../router/dist/index.js";
import { PIFLOW_HOST } from "../cognitive-routing/host-fixture.js";

const execFileAsync = promisify(execFile);

function loadExtension(host = PIFLOW_HOST) {
  const handlers = new Map();
  const tools = [];
  const commands = [];
  const shortcuts = [];
  const entries = [];
  const sentMessages = [];
  let activeToolNames;
  const pi = {
    host,
    registerTool(tool) {
      tools.push(tool);
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
    sendUserMessage(message) {
      sentMessages.push(message);
    },
    getAllTools() {
      return tools.map((tool) => ({
        name: tool.name,
        sourceInfo: { source: "extension" },
      }));
    },
    getActiveTools() {
      return activeToolNames ?? tools.map((tool) => tool.name);
    },
    setActiveTools(names) {
      activeToolNames = [...names];
    },
  };

  freeflowExtension(pi);
  return {
    pi,
    handlers,
    tools,
    commands,
    shortcuts,
    entries,
    sentMessages,
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

function renderText(component, width = 120) {
  return component.render(width).join("\n");
}

test("Pi registers capability commands and no public capture tool", () => {
  const { commands, shortcuts, tools } = loadExtension();
  const commandNames = commands.map((command) => command.name);
  const toolNames = tools.map((tool) => tool.name);

  assert.ok(commandNames.includes("freeflow"));
  assert.ok(commandNames.includes("output-router"));
  for (const command of ["discuss", "discover", "track-work", "execute-work", "execute-plan"]) {
    assert.ok(commandNames.includes(command));
  }
  assert.ok(!commandNames.includes("workflow"));
  assert.deepEqual(
    shortcuts.map(({ shortcut }) => shortcut),
    ["ctrl+shift+r", "ctrl+shift+a"],
  );
  assert.ok(toolNames.includes("freeflow_status"));
  assert.ok(toolNames.includes("freeflow_search"));
  assert.ok(toolNames.includes("freeflow_run"));
  assert.ok(toolNames.includes("freeflow_batch"));
  assert.ok(toolNames.includes("freeflow_switch_profile"));
  assert.ok(!toolNames.includes("freeflow_retrieve"));
  assert.ok(!toolNames.includes("freeflow_search action=transform"));
  assert.ok(!toolNames.includes("freeflow_capture"));
});

test("normal Pi keeps Cognitive Routing disabled while showing its configuration", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-runtime-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({ defaultMode: "workflow" }), "utf8");
    await writeFile(
      join(cwd, ".freeflow/local.json"),
      JSON.stringify({
        cognitiveRouting: {
          enabled: true,
          profiles: {
            standard: { provider: "test", model: "standard", thinkingLevel: "high" },
            reasoning: { provider: "test", model: "reasoning", thinkingLevel: "max" },
          },
        },
      }),
      "utf8",
    );
    const { commands, handlers, shortcuts, tools } = loadExtension(null);
    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);
    assert.deepEqual(shortcuts, []);
    assert.ok(!tools.some((tool) => tool.name === "freeflow_switch_profile"));
    assert.ok(!freeflowCommand.definition.getArgumentCompletions("").some((item) => item.value === "profile"));
    const capabilityState = await readCapabilityState(
      cwd,
      { modelRegistry: cognitiveRoutingModelRegistry() },
      undefined,
    );
    assert.equal(capabilityState.cognitiveRouting.enabled, true);
    assert.equal(capabilityState.cognitiveRouting.effective, false);
    assert.equal(capabilityState.cognitiveRouting.blockingReason.code, "runtime_disabled");

    const ctx = context(cwd);
    await freeflowCommand.definition.handler("status", ctx);
    assert.match(ctx.notifications.at(-1).message, /cognitive routing: disabled \(PiFlow only\)/i);
    await handlers.get("session_start")({ type: "session_start" }, ctx);
    assert.match(ctx.statuses.at(-1).value, /cognitive disabled · PiFlow only/);
    const beforeAgentStart = await handlers.get("before_agent_start")({ systemPrompt: "base" }, ctx);
    assert.doesNotMatch(
      `${beforeAgentStart?.systemPrompt ?? ""}\n${beforeAgentStart?.message ?? ""}`,
      /Cognitive Routing/i,
    );
    ctx.ui.custom = async (factory) => {
      let result;
      const component = factory({ requestRender() {} }, testTheme, {}, (value) => {
        result = value;
      });
      const rootText = renderText(component);
      assert.match(rootText, /Cognitive Routing/);
      assert.match(rootText, /PiFlow only/);
      for (let index = 0; index < 5; index += 1) component.handleInput("\u001b[B");
      component.handleInput("\r");
      const cognitiveText = renderText(component);
      assert.match(cognitiveText, /Freeflow Settings · Personal overrides › Cognitive Routing/);
      assert.match(cognitiveText, /Standard preset/);
      assert.match(cognitiveText, /Reasoning preset/);
      component.handleInput("\r");
      assert.doesNotMatch(renderText(component), /Choose model/);
      component.handleInput("\u001b");
      return result;
    };
    await freeflowCommand.definition.handler("settings", ctx);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("PiFlow statusline reports the current cognitive profile and control mode", () => {
  const ctx = context();
  setModeStatus(
    ctx,
    { effectiveMode: "workflow", currentMode: null },
    {
      configured: true,
      enabled: true,
      configSources: { interactionContract: "builtin", skillsEnabled: "builtin", enabled: "builtin" },
      interactionContract: { effective: true },
      skills: { effective: true },
      outputRouter: { enabled: true },
      cognitiveRouting: { enabled: true, effective: true, blockingReason: { code: "disabled" } },
    },
    { effective: true, activeProfile: "reasoning", controlMode: "automatic" },
  );
  assert.equal(
    ctx.statuses.at(-1).value,
    "freeflow: interaction · workflow · cognitive reasoning · automatic · router",
  );
});

test("PiFlow statusline shows the configured standard profile pending first prompt activation", () => {
  const ctx = context();
  setModeStatus(
    ctx,
    { effectiveMode: "workflow", currentMode: null },
    {
      configured: true,
      enabled: true,
      configSources: { interactionContract: "builtin", skillsEnabled: "builtin", enabled: "builtin" },
      interactionContract: { effective: true },
      skills: { effective: true },
      outputRouter: { enabled: true },
      cognitiveRouting: { enabled: true, effective: true, blockingReason: null },
    },
    undefined,
    { cognitiveRoutingStartupPending: true },
  );
  assert.equal(ctx.statuses.at(-1).value, "freeflow: interaction · workflow · cognitive standard · pending · router");
});

test("PiFlow statusline keeps an inactive runtime blocked instead of showing startup pending", () => {
  const ctx = context();
  setModeStatus(
    ctx,
    { effectiveMode: "workflow", currentMode: null },
    {
      configured: true,
      enabled: true,
      configSources: { interactionContract: "builtin", skillsEnabled: "builtin", enabled: "builtin" },
      interactionContract: { effective: true },
      skills: { effective: true },
      outputRouter: { enabled: true },
      cognitiveRouting: { enabled: true, effective: true, blockingReason: null },
    },
    { effective: false, activeProfile: "standard", controlMode: "automatic" },
    { cognitiveRoutingStartupPending: true },
  );
  assert.equal(
    ctx.statuses.at(-1).value,
    "freeflow: interaction · workflow · cognitive blocked · runtime_inactive · router",
  );
});

test("PiFlow statusline preserves startup suppression when the host selected a model", () => {
  const ctx = context();
  ctx.modelStateProvenance = { explicitModel: true };
  setModeStatus(
    ctx,
    { effectiveMode: "workflow", currentMode: null },
    {
      configured: true,
      enabled: true,
      configSources: { interactionContract: "builtin", skillsEnabled: "builtin", enabled: "builtin" },
      interactionContract: { effective: true },
      skills: { effective: true },
      outputRouter: { enabled: true },
      cognitiveRouting: { enabled: true, effective: true, blockingReason: null },
    },
    undefined,
    { cognitiveRoutingStartupPending: true },
  );
  assert.equal(
    ctx.statuses.at(-1).value,
    "freeflow: interaction · workflow · cognitive blocked · runtime_inactive · router",
  );
});

test("PiFlow empty configured sessions show standard pending before first prompt", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-pending-cognitive-status-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        cognitiveRouting: {
          enabled: true,
          profiles: {
            standard: { provider: "test", model: "model-a", thinkingLevel: "low" },
            reasoning: { provider: "test", model: "model-b", thinkingLevel: "high" },
          },
        },
      }),
      "utf8",
    );
    const { handlers } = loadExtension();
    const ctx = context(cwd);
    ctx.modelRegistry = cognitiveRoutingModelRegistry();

    await handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
    assert.equal(ctx.statuses.at(-1).value, "freeflow: interaction · workflow · cognitive standard · pending");
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
  assert.deepEqual(bypassCommand.definition.getArgumentCompletions("t"), [
    { value: "task", label: "task", description: "Reduce optional pressure for the current task" },
  ]);
  assert.deepEqual(bypassCommand.definition.getArgumentCompletions("unknown"), []);
});

test("Pi describes Freeflow and Output Router argument completions", () => {
  const { commands } = loadExtension();
  const freeflowCommand = commands.find((command) => command.name === "freeflow");
  const outputRouterCommand = commands.find((command) => command.name === "output-router");
  assert.ok(freeflowCommand);
  assert.ok(outputRouterCommand);

  assert.deepEqual(freeflowCommand.definition.getArgumentCompletions(""), [
    { value: "settings", label: "settings", description: "Open personal override settings" },
    { value: "status", label: "status", description: "Show effective Freeflow state" },
    { value: "context", label: "context", description: "Inspect Context Virtualization" },
    { value: "mode", label: "mode", description: "Select a temporary session mode" },
    { value: "profile", label: "profile", description: "Hold or release Cognitive Routing profile control" },
    { value: "enable", label: "enable", description: "Enable Freeflow for this repository" },
    { value: "disable", label: "disable", description: "Disable Freeflow for this repository" },
  ]);
  assert.deepEqual(freeflowCommand.definition.getArgumentCompletions("profile "), [
    {
      value: "profile standard",
      label: "standard",
      description: "Hold standard profile manually",
    },
    {
      value: "profile reasoning",
      label: "reasoning",
      description: "Hold reasoning profile manually",
    },
    {
      value: "profile auto",
      label: "auto",
      description: "Release the manual hold without changing the model",
    },
  ]);
  assert.deepEqual(freeflowCommand.definition.getArgumentCompletions("settings "), [
    { value: "settings session", label: "session", description: "Override Freeflow for this Pi session" },
    { value: "settings local", label: "local", description: "Edit personal overrides for this repository" },
    { value: "settings repo", label: "repo", description: "Edit shared repository settings" },
  ]);
  assert.deepEqual(freeflowCommand.definition.getArgumentCompletions("mode "), [
    { value: "mode conversation", label: "conversation", description: "Read-only discussion and inspection" },
    { value: "mode workflow", label: "workflow", description: "Adaptive workflow for consequential work" },
    {
      value: "mode strict-workflow",
      label: "strict-workflow",
      description: "Stronger pressure at high-risk boundaries",
    },
    {
      value: "mode reset",
      label: "reset",
      description: "Clear the session override and use the configured default",
    },
  ]);
  assert.deepEqual(freeflowCommand.definition.getArgumentCompletions("context "), [
    { value: "context status", label: "status", description: "Show Context Virtualization state" },
    { value: "context list", label: "list", description: "List archived context projections" },
    { value: "context restore", label: "restore", description: "Restore one or more context references" },
    { value: "context reset all", label: "reset all", description: "Reset projection decisions on the active branch" },
  ]);
  assert.deepEqual(outputRouterCommand.definition.getArgumentCompletions(""), [
    { value: "settings", label: "settings", description: "Open repository Output Router settings" },
    { value: "status", label: "status", description: "Show effective Output Router state" },
    { value: "enable", label: "enable", description: "Enable Output Router for this repository" },
    { value: "disable", label: "disable", description: "Disable Output Router for this repository" },
  ]);
});

test("Pi exposes canonical model skills and maps published command aliases", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-canonical-skills-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({ defaultMode: "workflow" }, null, 2), "utf8");

    const { handlers, commands, sentMessages } = loadExtension();
    const resources = await handlers.get("resources_discover")({ cwd }, context(cwd));
    const skillNames = resources.skillPaths.map((path) => {
      const match = path.match(/[\\/]skills[\\/]([^\\/]+)[\\/]SKILL\.md$/);
      assert.ok(match, `unexpected skill path: ${path}`);
      return match[1];
    });
    assert.equal(skillNames.length, 25);
    for (const skill of ["discuss", "execute-work", "track-work"]) {
      assert.ok(skillNames.includes(skill));
    }
    assert.ok(!skillNames.includes("output-router"));
    assert.ok(!skillNames.includes("discover"));
    assert.ok(!skillNames.includes("execute-plan"));
    await Promise.all(resources.skillPaths.map((path) => readFile(path, "utf8")));

    for (const [commandName, expectedSkill] of [
      ["discuss", "discuss"],
      ["discover", "discuss"],
      ["track-work", "track-work"],
      ["execute-work", "execute-work"],
      ["execute-plan", "execute-work"],
    ]) {
      const command = commands.find((candidate) => candidate.name === commandName);
      assert.ok(command);
      await command.definition.handler(undefined, context(cwd));
      assert.equal(sentMessages.at(-1), `/skill:${expectedSkill}`);
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi keeps Freeflow inactive until setup config exists", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-missing-setup-"));
  try {
    const { handlers, activeToolNames } = loadExtension();
    const resourcesDiscover = handlers.get("resources_discover");
    const beforeAgentStart = handlers.get("before_agent_start");
    assert.ok(resourcesDiscover);
    assert.ok(beforeAgentStart);

    const resources = await resourcesDiscover({ cwd }, context(cwd));
    assert.equal(resources.skillPaths.length, 1);
    assert.match(resources.skillPaths[0], /setup-freeflow\/SKILL\.md$/);

    const result = await beforeAgentStart({ systemPrompt: "base prompt" }, context(cwd));
    assert.equal(result.systemPrompt, "base prompt");
    assert.ok(!activeToolNames().includes("freeflow_status"));
    assert.ok(!activeToolNames().includes("freeflow_search"));
    assert.ok(!activeToolNames().includes("freeflow_run"));
    assert.ok(!activeToolNames().includes("freeflow_batch"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi treats invalid Freeflow setup config as inactive", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-invalid-setup-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify(
        {
          defaultMode: "workflow",
          enabled: "false",
          interactionContract: "on",
          skills: { enabled: "no" },
          outputRouter: { enabled: true },
        },
        null,
        2,
      ),
      "utf8",
    );

    const { handlers, commands, activeToolNames } = loadExtension();
    const resources = await handlers.get("resources_discover")({ cwd }, context(cwd));
    assert.equal(resources.skillPaths.length, 1);
    assert.match(resources.skillPaths[0], /setup-freeflow\/SKILL\.md$/);

    const result = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, context(cwd));
    assert.equal(result.systemPrompt, "base prompt");
    assert.ok(!activeToolNames().includes("freeflow_status"));
    assert.ok(!activeToolNames().includes("freeflow_search"));

    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    const statusCtx = context(cwd);
    await freeflowCommand.definition.handler("status", statusCtx);
    assert.match(statusCtx.notifications.at(-1).message, /invalid config/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi rejects unsupported nested skills keys in repository and local config", async () => {
  for (const configFile of ["config.json", "local.json"]) {
    const cwd = await mkdtemp(join(tmpdir(), `freeflow-pi-unsupported-skills-${configFile}-`));
    try {
      await mkdir(join(cwd, ".freeflow"));
      if (configFile === "local.json") {
        await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({ defaultMode: "workflow" }), "utf8");
      }
      await writeFile(join(cwd, `.freeflow/${configFile}`), JSON.stringify({ skills: { enable: false } }), "utf8");

      const layers = await readFreeflowConfigLayers(cwd);
      const invalidLayer = configFile === "config.json" ? layers.repository : layers.local;
      assert.equal(invalidLayer.valid, false, `${configFile} should reject unknown nested skills keys`);
      assert.equal(layers.configured, false);
      assert.equal(layers.parseError, "unsupported skills config key: enable");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }
});

test("Pi layers local core overrides over repository defaults with source evidence", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-layered-core-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify(
        {
          enabled: false,
          interactionContract: false,
          skills: { enabled: true },
          defaultMode: "workflow",
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(
      join(cwd, ".freeflow/local.json"),
      JSON.stringify(
        {
          enabled: true,
          skills: { enabled: false },
          defaultMode: "strict-workflow",
          processing: { unsafeUnsandboxed: { enabled: true } },
        },
        null,
        2,
      ),
      "utf8",
    );

    const layers = await readFreeflowConfigLayers(cwd);
    assert.equal(layers.configured, true);
    assert.equal(layers.repositoryConfigured, true);
    assert.deepEqual(layers.coreConfig, {
      enabled: true,
      interactionContract: false,
      contextVirtualization: false,
      skills: { enabled: false },
      defaultMode: "strict-workflow",
    });
    assert.deepEqual(layers.sources, {
      enabled: "local",
      interactionContract: "repository",
      contextVirtualization: "builtin",
      skillsEnabled: "local",
      defaultMode: "local",
    });
    assert.equal(layers.local.parsed.processing.unsafeUnsandboxed.enabled, true);
    const routerConfig = await readOutputRouterConfig(cwd);
    assert.equal(routerConfig.localConfig.processing.unsafeUnsandboxed.enabled, true);

    const capabilityState = await readCapabilityState(cwd, undefined, PIFLOW_HOST);
    assert.equal(capabilityState.enabled, true);
    assert.equal(capabilityState.interactionContract.effective, false);
    assert.equal(capabilityState.skills.effective, false);
    assert.deepEqual(capabilityState.configSources, layers.sources);

    const modeState = await readModeState(cwd);
    assert.equal(modeState.repositoryDefaultMode, "workflow");
    assert.equal(modeState.repositoryDefaultModeSource, "repository");
    assert.equal(modeState.personalDefaultMode, "strict-workflow");
    assert.equal(modeState.defaultMode, "strict-workflow");
    assert.equal(modeState.defaultModeSource, "local");
    assert.equal(modeState.sessionMode, null);
    assert.equal(modeState.resolvedMode, "strict-workflow");
    assert.equal(modeState.active, false);
    assert.equal(modeState.effectiveMode, null);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi layers branch-aware session core overrides above configured values", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-session-core-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    const configPath = join(cwd, ".freeflow/config.json");
    const configText = JSON.stringify({ defaultMode: "workflow" }, null, 2);
    await writeFile(configPath, configText, "utf8");

    const { pi, entries } = loadExtension();
    const ctx = context(cwd);

    let result = await setSessionCoreOverride("enabled", false, ctx, pi);
    assert.equal(result.changed, true);
    let capabilityState = await readCapabilityState(cwd, undefined, PIFLOW_HOST);
    assert.equal(capabilityState.enabled, false);
    assert.equal(capabilityState.configSources.enabled, "session");
    assert.deepEqual(capabilityState.sessionOverrides, { enabled: false });
    assert.deepEqual(entries.at(-1), {
      customType: "freeflow-session-overrides",
      data: { overrides: { enabled: false } },
    });

    result = await setSessionCoreOverride("enabled", false, ctx, pi);
    assert.equal(result.changed, false);
    assert.equal(entries.length, 1);

    await setSessionCoreOverride("enabled", null, ctx, pi);
    await setSessionCoreOverride("interactionContract", false, ctx, pi);
    await setSessionCoreOverride("skillsEnabled", false, ctx, pi);
    capabilityState = await readCapabilityState(cwd, undefined, PIFLOW_HOST);
    assert.equal(capabilityState.enabled, true);
    assert.equal(capabilityState.interactionContract.effective, false);
    assert.equal(capabilityState.skills.effective, false);
    assert.equal((await readModeState(cwd)).effectiveMode, null);

    await setSessionMode("conversation", ctx, pi);
    const reset = await resetSessionOverrides(ctx, pi);
    assert.equal(reset.changed, true);
    assert.equal(reset.reloadRequired, true);
    capabilityState = await readCapabilityState(cwd, undefined, PIFLOW_HOST);
    assert.deepEqual(capabilityState.sessionOverrides, {});
    assert.equal(capabilityState.interactionContract.effective, true);
    assert.equal(capabilityState.skills.effective, true);
    assert.equal((await readModeState(cwd)).sessionMode, null);
    assert.equal(await readFile(configPath, "utf8"), configText);
  } finally {
    restoreModeOverride(context(cwd));
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi session enablement can override configured off but cannot bypass activation", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-session-activation-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    const { pi } = loadExtension();
    const ctx = context(cwd);
    await setSessionCoreOverride("enabled", true, ctx, pi);

    let capabilityState = await readCapabilityState(cwd, undefined, PIFLOW_HOST);
    assert.equal(capabilityState.configured, false);
    assert.equal(capabilityState.enabled, false);

    await writeFile(join(cwd, ".freeflow/config.json"), "{ invalid", "utf8");
    capabilityState = await readCapabilityState(cwd, undefined, PIFLOW_HOST);
    assert.equal(capabilityState.configured, false);
    assert.equal(capabilityState.enabled, false);

    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({ enabled: false, defaultMode: "workflow" }),
      "utf8",
    );
    capabilityState = await readCapabilityState(cwd, undefined, PIFLOW_HOST);
    assert.equal(capabilityState.configured, true);
    assert.equal(capabilityState.enabled, true);
    assert.equal(capabilityState.configSources.enabled, "session");
  } finally {
    restoreModeOverride(context(cwd));
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi restores session core overrides from the active branch", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-session-core-branch-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({ defaultMode: "workflow" }), "utf8");
    const activeBranchEntries = [
      {
        type: "custom",
        customType: "freeflow-session-overrides",
        data: { overrides: { interactionContract: false } },
      },
    ];
    const allEntries = [
      ...activeBranchEntries,
      {
        type: "custom",
        customType: "freeflow-session-overrides",
        data: { overrides: { enabled: false } },
      },
    ];
    const { handlers } = loadExtension();
    await handlers.get("session_start")({ reason: "resume" }, context(cwd, allEntries, activeBranchEntries));

    let capabilityState = await readCapabilityState(cwd, undefined, PIFLOW_HOST);
    assert.equal(capabilityState.enabled, true);
    assert.equal(capabilityState.interactionContract.effective, false);
    assert.deepEqual(capabilityState.sessionOverrides, { interactionContract: false });

    const switchedBranchEntries = [
      {
        type: "custom",
        customType: "freeflow-session-overrides",
        data: { overrides: { enabled: false } },
      },
    ];
    await handlers.get("session_tree")({}, context(cwd, allEntries, switchedBranchEntries));
    capabilityState = await readCapabilityState(cwd, undefined, PIFLOW_HOST);
    assert.equal(capabilityState.enabled, false);
    assert.deepEqual(capabilityState.sessionOverrides, { enabled: false });
  } finally {
    restoreModeOverride(context(cwd));
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi compact mode context distinguishes layered defaults, session state, and effective mode", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-layered-mode-context-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({ defaultMode: "workflow" }, null, 2), "utf8");
    await writeFile(
      join(cwd, ".freeflow/local.json"),
      JSON.stringify({ defaultMode: "strict-workflow" }, null, 2),
      "utf8",
    );

    const { handlers, commands } = loadExtension();
    const beforeAgentStart = handlers.get("before_agent_start");
    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    assert.ok(beforeAgentStart);
    assert.ok(freeflowCommand);

    let result = await beforeAgentStart({ systemPrompt: "base prompt" }, context(cwd));
    assert.match(result.systemPrompt, /Repository default mode: `workflow` \(repository\)/);
    assert.match(result.systemPrompt, /Personal default override: `strict-workflow`/);
    assert.match(result.systemPrompt, /Configured default mode: `strict-workflow` \(personal override\)/);
    assert.match(result.systemPrompt, /Session mode override: `none`/);
    assert.match(result.systemPrompt, /Resolved mode: `strict-workflow`/);
    assert.match(result.systemPrompt, /Effective Freeflow mode: `strict-workflow`/);
    assert.match(result.systemPrompt, /direct skill calls do not change mode/);
    assert.match(result.systemPrompt, /## Strict Workflow Overlay/);
    assert.match(result.systemPrompt, /security, privacy, billing, data loss, migrations, public interfaces/);
    assert.doesNotMatch(result.systemPrompt, /## Conversation Mode Boundary/);

    await freeflowCommand.definition.handler("mode conversation", context(cwd));
    result = await beforeAgentStart({ systemPrompt: "base prompt" }, context(cwd));
    assert.match(result.systemPrompt, /Session mode override: `conversation`/);
    assert.match(result.systemPrompt, /Resolved mode: `conversation`/);
    assert.match(result.systemPrompt, /Effective Freeflow mode: `conversation`/);
    assert.match(result.systemPrompt, /## Conversation Mode Boundary/);
    assert.match(result.systemPrompt, /Do not call write, edit, or mutating tools/);
    assert.match(result.systemPrompt, /an execution skill does not override this boundary/);
    assert.doesNotMatch(result.systemPrompt, /## Strict Workflow Overlay/);

    await freeflowCommand.definition.handler("mode reset", context(cwd));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi restores layered session mode on resume and preserves it through compaction", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-mode-lifecycle-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({ defaultMode: "workflow" }, null, 2), "utf8");
    const localPath = join(cwd, ".freeflow/local.json");
    await writeFile(localPath, JSON.stringify({ defaultMode: "strict-workflow" }, null, 2), "utf8");

    const sessionEntries = [
      {
        type: "custom",
        customType: "freeflow-mode",
        data: { currentMode: "conversation" },
      },
    ];
    const { handlers } = loadExtension();
    const sessionStart = handlers.get("session_start");
    const sessionCompact = handlers.get("session_compact");
    const beforeAgentStart = handlers.get("before_agent_start");
    assert.ok(sessionStart);
    assert.ok(sessionCompact);
    assert.ok(beforeAgentStart);

    const ctx = context(cwd, sessionEntries);
    await sessionStart({ reason: "resume" }, ctx);
    let modeState = await readModeState(cwd);
    assert.equal(modeState.repositoryDefaultMode, "workflow");
    assert.equal(modeState.personalDefaultMode, "strict-workflow");
    assert.equal(modeState.sessionMode, "conversation");
    assert.equal(modeState.resolvedMode, "conversation");
    assert.equal(modeState.effectiveMode, "conversation");

    await sessionCompact({ reason: "manual" }, ctx);
    let result = await beforeAgentStart({ prompt: "continue", systemPrompt: "base prompt" }, ctx);
    assert.match(result.systemPrompt, /Session mode override: `conversation`/);
    assert.match(result.systemPrompt, /Resolved mode: `conversation`/);
    assert.match(result.systemPrompt, /Effective Freeflow mode: `conversation`/);

    await writeFile(
      localPath,
      JSON.stringify(
        {
          defaultMode: "strict-workflow",
          skills: { enabled: false },
        },
        null,
        2,
      ),
      "utf8",
    );
    await sessionCompact({ reason: "manual" }, ctx);
    modeState = await readModeState(cwd);
    assert.equal(modeState.sessionMode, "conversation");
    assert.equal(modeState.resolvedMode, "conversation");
    assert.equal(modeState.active, false);
    assert.equal(modeState.effectiveMode, null);
    result = await beforeAgentStart({ prompt: "continue", systemPrompt: "base prompt" }, ctx);
    assert.match(result.systemPrompt, /Session mode override: `conversation`/);
    assert.match(result.systemPrompt, /Resolved mode: `conversation` \(inactive because Skills are disabled\)/);
    assert.match(result.systemPrompt, /Effective Freeflow mode: `none`/);

    sessionEntries.push({
      type: "custom",
      customType: "freeflow-mode",
      data: { currentMode: null },
    });
    await sessionStart({ reason: "resume" }, ctx);
    modeState = await readModeState(cwd);
    assert.equal(modeState.sessionMode, null);
    assert.equal(modeState.resolvedMode, "strict-workflow");
    assert.equal(modeState.active, false);
    assert.equal(modeState.effectiveMode, null);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi restores session mode from the active branch on resume and tree navigation", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-mode-active-branch-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({ defaultMode: "workflow" }, null, 2), "utf8");

    const activeBranchEntries = [
      {
        type: "custom",
        customType: "freeflow-mode",
        data: { currentMode: "conversation" },
      },
    ];
    const allSessionEntries = [
      ...activeBranchEntries,
      {
        type: "custom",
        customType: "freeflow-mode",
        data: { currentMode: "strict-workflow" },
      },
    ];
    const { handlers } = loadExtension();
    const sessionStart = handlers.get("session_start");
    const sessionTree = handlers.get("session_tree");
    assert.ok(sessionStart);
    assert.ok(sessionTree);

    const ctx = context(cwd, allSessionEntries, activeBranchEntries);
    await sessionStart({ reason: "resume" }, ctx);

    let modeState = await readModeState(cwd);
    assert.equal(modeState.sessionMode, "conversation");
    assert.equal(modeState.effectiveMode, "conversation");

    activeBranchEntries.splice(0, activeBranchEntries.length, allSessionEntries.at(-1));
    await sessionTree({ newLeafId: "strict-branch" }, ctx);

    modeState = await readModeState(cwd);
    assert.equal(modeState.sessionMode, "strict-workflow");
    assert.equal(modeState.effectiveMode, "strict-workflow");
  } finally {
    restoreModeOverride(context(cwd));
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi ordinary prompts and direct skill calls do not change mode state", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-mode-boundaries-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({ defaultMode: "workflow" }, null, 2), "utf8");
    await writeFile(
      join(cwd, ".freeflow/local.json"),
      JSON.stringify({ defaultMode: "strict-workflow" }, null, 2),
      "utf8",
    );

    const { handlers, commands, entries, sentMessages } = loadExtension();
    const sessionStart = handlers.get("session_start");
    const beforeAgentStart = handlers.get("before_agent_start");
    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    const commitWorkCommand = commands.find((command) => command.name === "commit-work");
    assert.ok(sessionStart);
    assert.ok(beforeAgentStart);
    assert.ok(freeflowCommand);
    assert.ok(commitWorkCommand);

    await sessionStart({ reason: "startup" }, context(cwd));
    let result = await beforeAgentStart(
      {
        prompt: "Switch to conversation mode and implement this change.",
        systemPrompt: "base prompt",
      },
      context(cwd),
    );
    let modeState = await readModeState(cwd);
    assert.equal(modeState.sessionMode, null);
    assert.equal(modeState.resolvedMode, "strict-workflow");
    assert.equal(modeState.effectiveMode, "strict-workflow");
    assert.match(result.systemPrompt, /Task type, risk classification, and direct skill calls do not change mode/);
    assert.deepEqual(entries, []);

    await freeflowCommand.definition.handler("mode conversation", context(cwd));
    assert.equal(entries.length, 1);
    await commitWorkCommand.definition.handler("create a checkpoint", context(cwd));
    assert.deepEqual(sentMessages, ["/skill:commit-work\n\ncreate a checkpoint"]);
    assert.equal(entries.length, 1);

    modeState = await readModeState(cwd);
    assert.equal(modeState.sessionMode, "conversation");
    assert.equal(modeState.resolvedMode, "conversation");
    assert.equal(modeState.effectiveMode, "conversation");
    result = await beforeAgentStart({ prompt: "/commit-work", systemPrompt: "base prompt" }, context(cwd));
    assert.match(result.systemPrompt, /Session mode override: `conversation`/);
    assert.match(result.systemPrompt, /Effective Freeflow mode: `conversation`/);
  } finally {
    restoreModeOverride(context(cwd));
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi layered core config inherits omitted values and built-in defaults", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-layered-inherit-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({}, null, 2), "utf8");
    await writeFile(join(cwd, ".freeflow/local.json"), JSON.stringify({ interactionContract: false }, null, 2), "utf8");

    const layers = await readFreeflowConfigLayers(cwd);
    assert.deepEqual(layers.coreConfig, {
      enabled: true,
      interactionContract: false,
      contextVirtualization: false,
      skills: { enabled: true },
      defaultMode: "workflow",
    });
    assert.deepEqual(layers.sources, {
      enabled: "builtin",
      interactionContract: "local",
      contextVirtualization: "builtin",
      skillsEnabled: "builtin",
      defaultMode: "builtin",
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi requires repository activation even when local overrides exist", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-local-only-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/local.json"),
      JSON.stringify({ enabled: true, defaultMode: "strict-workflow" }, null, 2),
      "utf8",
    );

    const layers = await readFreeflowConfigLayers(cwd);
    assert.equal(layers.repositoryConfigured, false);
    assert.equal(layers.configured, false);
    const capabilityState = await readCapabilityState(cwd, undefined, PIFLOW_HOST);
    assert.equal(capabilityState.enabled, false);
    assert.equal(capabilityState.skills.effective, false);

    const { handlers } = loadExtension();
    const resources = await handlers.get("resources_discover")({ cwd }, context(cwd));
    assert.equal(resources.skillPaths.length, 1);
    assert.match(resources.skillPaths[0], /setup-freeflow\/SKILL\.md$/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi fails closed when an existing local override is invalid", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-invalid-local-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({ defaultMode: "workflow" }, null, 2), "utf8");
    await writeFile(join(cwd, ".freeflow/local.json"), "{ invalid\n", "utf8");

    const layers = await readFreeflowConfigLayers(cwd);
    assert.equal(layers.repositoryConfigured, true);
    assert.equal(layers.configured, false);
    assert.equal(layers.local.exists, true);
    assert.equal(layers.local.valid, false);
    assert.equal(layers.blockingConfigPath, layers.local.path);
    assert.match(layers.parseError, /JSON/);

    const capabilityState = await readCapabilityState(cwd, undefined, PIFLOW_HOST);
    assert.equal(capabilityState.configured, false);
    assert.equal(capabilityState.enabled, false);
    assert.equal(capabilityState.interactionContract.effective, false);
    assert.equal(capabilityState.skills.effective, false);
    assert.equal(capabilityState.localConfigValid, false);
    assert.match(capabilityState.localConfigParseError, /JSON/);

    const { handlers, activeToolNames } = loadExtension();
    const resources = await handlers.get("resources_discover")({ cwd }, context(cwd));
    assert.equal(resources.skillPaths.length, 1);
    assert.match(resources.skillPaths[0], /setup-freeflow\/SKILL\.md$/);
    const result = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, context(cwd));
    assert.equal(result.systemPrompt, "base prompt");
    assert.ok(!activeToolNames().includes("freeflow_status"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi fails closed when a local core override has an invalid type", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-invalid-local-shape-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({ defaultMode: "workflow" }, null, 2), "utf8");
    await writeFile(join(cwd, ".freeflow/local.json"), JSON.stringify({ skills: { enabled: "no" } }, null, 2), "utf8");

    const layers = await readFreeflowConfigLayers(cwd);
    assert.equal(layers.configured, false);
    assert.equal(layers.local.valid, false);
    assert.equal(layers.parseError, "skills.enabled must be a boolean");
    const state = await readCapabilityState(cwd, undefined, PIFLOW_HOST);
    assert.equal(state.enabled, false);
    assert.equal(state.skills.effective, false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi local enabled false overrides an enabled repository master switch", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-local-disabled-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify(
        {
          enabled: true,
          defaultMode: "workflow",
          outputRouter: { enabled: true },
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(join(cwd, ".freeflow/local.json"), JSON.stringify({ enabled: false }, null, 2), "utf8");

    const state = await readCapabilityState(cwd, undefined, PIFLOW_HOST);
    assert.equal(state.configured, true);
    assert.equal(state.enabled, false);
    assert.equal(state.configSources.enabled, "local");
    assert.equal(state.outputRouter.enabled, false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi master Freeflow toggle disables skills, capabilities, and routing", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-master-disabled-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify(
        {
          enabled: false,
          defaultMode: "workflow",
          skills: { enabled: true },
          outputRouter: { enabled: true, postToolRouting: "safety-net" },
        },
        null,
        2,
      ),
      "utf8",
    );

    const { handlers, activeToolNames } = loadExtension();
    const resources = await handlers.get("resources_discover")({ cwd }, context(cwd));
    assert.deepEqual(resources.skillPaths, []);

    const result = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, context(cwd));
    assert.match(result.systemPrompt, /# Freeflow Disabled/);
    assert.doesNotMatch(result.systemPrompt, /# Freeflow Interaction Contract/);
    assert.doesNotMatch(result.systemPrompt, /# Freeflow Runtime Kernel/);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Workflow Skill/);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Output Router Skill/);
    assert.ok(!activeToolNames().includes("freeflow_status"));
    assert.ok(!activeToolNames().includes("freeflow_search"));

    const routed = await handlers.get("tool_result")(
      {
        toolName: "read",
        input: { path: "large.txt" },
        content: [{ type: "text", text: "line 1\nline 2" }],
        isError: false,
      },
      context(cwd),
    );
    assert.equal(routed, undefined);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi skills toggle suppresses workflow skills while allowing enabled router tools", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-skills-disabled-router-on-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify(
        {
          defaultMode: "workflow",
          skills: { enabled: false },
          outputRouter: { enabled: true },
        },
        null,
        2,
      ),
      "utf8",
    );

    const { handlers, activeToolNames } = loadExtension();
    const resources = await handlers.get("resources_discover")({ cwd }, context(cwd));
    assert.deepEqual(resources.skillPaths, []);

    const ctx = context(cwd);
    const result = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.equal(result.message, undefined);
    assert.match(result.systemPrompt, /# Freeflow Interaction Contract/);
    assert.doesNotMatch(result.systemPrompt, /# Freeflow Runtime Kernel/);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Workflow Skill/);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Decision Gate Skill/);
    assert.doesNotMatch(result.systemPrompt, /## Discovery-light/);
    assert.match(result.systemPrompt, /Skills: disabled/);
    assert.match(result.systemPrompt, /Repository default mode: `workflow` \(repository\)/);
    assert.match(result.systemPrompt, /Personal default override: `none`/);
    assert.match(result.systemPrompt, /Configured default mode: `workflow` \(repository default\)/);
    assert.match(result.systemPrompt, /Resolved mode: `workflow` \(inactive because Skills are disabled\)/);
    assert.match(result.systemPrompt, /Effective Freeflow mode: `none`/);
    assert.match(result.systemPrompt, /## Loaded Output Router Skill/);
    assert.equal(ctx.statuses.at(-1).value, "freeflow: interaction · router");
    assert.ok(activeToolNames().includes("freeflow_status"));
    assert.ok(activeToolNames().includes("freeflow_search"));
    assert.ok(activeToolNames().includes("freeflow_run"));
    assert.ok(activeToolNames().includes("freeflow_batch"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi interaction contract can be disabled independently while Workflow stays enabled", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-interaction-disabled-skills-on-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({ defaultMode: "workflow", interactionContract: false }, null, 2),
      "utf8",
    );
    const { handlers } = loadExtension();
    const result = await handlers.get("before_agent_start")(
      { prompt: "hello", systemPrompt: "base prompt" },
      context(cwd),
    );
    assert.doesNotMatch(result.systemPrompt, /# Freeflow Interaction Contract/);
    assert.doesNotMatch(result.systemPrompt, /# Freeflow Runtime Kernel/);
    assert.equal(result.message.customType, "freeflow-workflow-bootstrap");
    assert.match(result.message.content, /# Workflow/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

// Regression for the "everything disabled except Freeflow control plane" state.
// The model should know Freeflow exists and can be reconfigured, but should not receive workflow/router/delegation behavior.
// `defaultMode` is dormant while Skills are off.
test("Pi all-disabled capability state injects only Freeflow control-plane status", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-all-capabilities-disabled-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify(
        {
          defaultMode: "workflow",
          interactionContract: false,
          skills: { enabled: false },
        },
        null,
        2,
      ),
      "utf8",
    );

    const { handlers, commands, activeToolNames } = loadExtension();
    const ctx = context(cwd);
    const result = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);

    assert.match(result.systemPrompt, /# Freeflow Control Plane/);
    assert.match(
      result.systemPrompt,
      /Freeflow is enabled for this repo, but no model-facing capabilities are enabled/,
    );
    assert.match(result.systemPrompt, /Repository default mode: `workflow` \(repository\)/);
    assert.match(result.systemPrompt, /Resolved mode: `workflow` \(inactive because Skills are disabled\)/);
    assert.match(result.systemPrompt, /Effective Freeflow mode: `none`/);
    assert.doesNotMatch(result.systemPrompt, /# Freeflow Runtime Context/);
    assert.doesNotMatch(result.systemPrompt, /# Freeflow Interaction Contract/);
    assert.doesNotMatch(result.systemPrompt, /# Freeflow Runtime Kernel/);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Mode Contract Skill/);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Workflow Skill/);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Decision Gate Skill/);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Output Router Skill/);
    assert.equal(ctx.statuses.at(-1).value, "freeflow: idle");
    assert.ok(activeToolNames().includes("freeflow_status"));
    assert.ok(!activeToolNames().includes("freeflow_search"));

    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);
    const modeCtx = context(cwd);
    await freeflowCommand.definition.handler("mode strict-workflow", modeCtx);
    assert.match(modeCtx.notifications.at(-1).message, /Freeflow modes are inactive because Skills are disabled/);
    assert.match(modeCtx.notifications.at(-1).message, /Configured default mode: workflow \(repository default\)/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi /freeflow mode is the only mode command and opens a dedicated selector", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-mode-command-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    const configPath = join(cwd, ".freeflow/config.json");
    const configText = JSON.stringify({ defaultMode: "workflow" }, null, 2);
    await writeFile(configPath, configText, "utf8");

    const { commands, entries } = loadExtension();
    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);
    assert.ok(!commands.some((command) => command.name === "workflow"));

    const alreadyDefaultCtx = context(cwd);
    await freeflowCommand.definition.handler("mode workflow", alreadyDefaultCtx);
    assert.equal(entries.length, 0);
    assert.match(
      alreadyDefaultCtx.notifications.at(-1).message,
      /already in workflow mode from the configured default.*No session override was created/,
    );

    const modeCtx = context(cwd);
    modeCtx.ui.custom = async (factory) => {
      let result;
      const component = factory({ requestRender() {} }, testTheme, {}, (value) => {
        result = value;
      });
      const text = renderText(component);
      assert.match(text, /Freeflow Mode/);
      assert.match(text, /Use configured default\s+workflow from repository/);
      assert.match(text, /conversation\s+Discussion and read-only inspection/);
      assert.match(text, /strict-workflow\s+Stronger decision and evidence pressure for high-risk work/);

      component.handleInput("\u001b[B");
      component.handleInput("\u001b[B");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      return result;
    };

    await freeflowCommand.definition.handler("mode", modeCtx);
    assert.deepEqual(entries.at(-1), {
      customType: "freeflow-mode",
      data: { currentMode: "strict-workflow" },
    });
    assert.equal(modeCtx.statuses.length, 1);
    assert.equal(modeCtx.statuses.at(-1).value, "freeflow: interaction · strict-workflow (session)");
    assert.match(modeCtx.notifications.at(-1).message, /Stored in Pi session history/);
    assert.match(
      modeCtx.notifications.at(-1).message,
      /\.freeflow\/local\.json and \.freeflow\/config\.json were not changed/,
    );
    assert.equal(await readFile(configPath, "utf8"), configText);
    assert.equal(modeCtx.reloads.length, 0);

    const alreadySessionCtx = context(cwd);
    await freeflowCommand.definition.handler("mode strict-workflow", alreadySessionCtx);
    assert.equal(entries.length, 1);
    assert.match(alreadySessionCtx.notifications.at(-1).message, /already in strict-workflow mode for this Pi session/);

    const resetCtx = context(cwd);
    await freeflowCommand.definition.handler("mode reset", resetCtx);
    assert.deepEqual(entries.at(-1), {
      customType: "freeflow-mode",
      data: { currentMode: null },
    });
    assert.equal(resetCtx.statuses.at(-1).value, "freeflow: interaction · workflow");
    assert.match(resetCtx.notifications.at(-1).message, /reset to configured default: workflow \(repository default\)/);
    assert.match(resetCtx.notifications.at(-1).message, /Session override cleared/);
    assert.match(
      resetCtx.notifications.at(-1).message,
      /\.freeflow\/local\.json and \.freeflow\/config\.json were not changed/,
    );
    assert.equal(entries.length, 2);

    const alreadyResetCtx = context(cwd);
    await freeflowCommand.definition.handler("mode reset", alreadyResetCtx);
    assert.equal(entries.length, 2);
    assert.match(alreadyResetCtx.notifications.at(-1).message, /already using the configured default: workflow/);

    const nonTuiCtx = context(cwd);
    await freeflowCommand.definition.handler("mode", nonTuiCtx);
    assert.match(
      nonTuiCtx.notifications.at(-1).message,
      /Freeflow mode is workflow \(configured default workflow \(repository default\)\)/,
    );
    assert.doesNotMatch(nonTuiCtx.notifications.at(-1).message, /requires Pi TUI/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi selector commands explain the TUI requirement in RPC mode without mutation", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-rpc-selector-guidance-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    const configPath = join(cwd, ".freeflow/config.json");
    const configText = JSON.stringify({ defaultMode: "workflow" }, null, 2);
    await writeFile(configPath, configText, "utf8");

    const { commands } = loadExtension();
    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);

    for (const args of ["settings", "mode"]) {
      const ctx = context(cwd);
      ctx.mode = "rpc";
      ctx.hasUI = true;
      let customCalls = 0;
      ctx.ui.custom = async () => {
        customCalls += 1;
      };

      await freeflowCommand.definition.handler(args, ctx);

      assert.equal(customCalls, 0);
      assert.match(ctx.notifications.at(-1).message, /requires? Pi TUI mode/);
    }

    assert.equal(await readFile(configPath, "utf8"), configText);
    assert.equal((await readModeState(cwd)).sessionMode, null);

    const explicitModeCtx = context(cwd);
    explicitModeCtx.mode = "rpc";
    explicitModeCtx.hasUI = true;
    await freeflowCommand.definition.handler("mode conversation", explicitModeCtx);
    assert.equal((await readModeState(cwd)).sessionMode, "conversation");
  } finally {
    restoreModeOverride(context(cwd));
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi selector commands fail explicitly when notifications are unavailable", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-print-selector-guidance-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    const configPath = join(cwd, ".freeflow/config.json");
    const configText = JSON.stringify({ defaultMode: "workflow" }, null, 2);
    await writeFile(configPath, configText, "utf8");

    const { commands } = loadExtension();
    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);

    for (const mode of ["json", "print"]) {
      for (const args of ["settings", "mode"]) {
        const ctx = context(cwd);
        ctx.mode = mode;
        ctx.hasUI = false;
        ctx.ui.custom = async () => undefined;
        await assert.rejects(freeflowCommand.definition.handler(args, ctx), /requires? Pi TUI mode/);
      }
    }

    assert.equal(await readFile(configPath, "utf8"), configText);
    assert.equal((await readModeState(cwd)).sessionMode, null);
  } finally {
    restoreModeOverride(context(cwd));
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi non-TUI selector guidance precedes inactive and invalid configuration state", async () => {
  const cases = [
    {
      name: "disabled",
      args: "mode",
      repository: JSON.stringify({ enabled: false, defaultMode: "workflow" }),
    },
    {
      name: "skills-off",
      args: "mode",
      repository: JSON.stringify({ defaultMode: "workflow", skills: { enabled: false } }),
    },
    {
      name: "invalid-repository",
      args: "settings",
      repository: "{ invalid\n",
    },
    {
      name: "invalid-local",
      args: "settings",
      repository: JSON.stringify({ defaultMode: "workflow" }),
      local: "{ invalid\n",
    },
  ];

  for (const [index, testCase] of cases.entries()) {
    const cwd = await mkdtemp(join(tmpdir(), `freeflow-pi-non-tui-${testCase.name}-`));
    try {
      await mkdir(join(cwd, ".freeflow"));
      const configPath = join(cwd, ".freeflow/config.json");
      const localPath = join(cwd, ".freeflow/local.json");
      await writeFile(configPath, testCase.repository, "utf8");
      if (testCase.local) await writeFile(localPath, testCase.local, "utf8");

      const { commands } = loadExtension();
      const freeflowCommand = commands.find((command) => command.name === "freeflow");
      assert.ok(freeflowCommand);

      const rpcCtx = context(cwd);
      rpcCtx.mode = "rpc";
      rpcCtx.hasUI = true;
      let customCalls = 0;
      rpcCtx.ui.custom = async () => {
        customCalls += 1;
      };
      await freeflowCommand.definition.handler(testCase.args, rpcCtx);
      assert.equal(customCalls, 0);
      assert.match(rpcCtx.notifications.at(-1).message, /requires? Pi TUI mode/);

      const nonUiCtx = context(cwd);
      nonUiCtx.mode = index % 2 === 0 ? "json" : "print";
      nonUiCtx.hasUI = false;
      nonUiCtx.ui.custom = async () => undefined;
      await assert.rejects(freeflowCommand.definition.handler(testCase.args, nonUiCtx), /requires? Pi TUI mode/);

      assert.equal(await readFile(configPath, "utf8"), testCase.repository);
      if (testCase.local) assert.equal(await readFile(localPath, "utf8"), testCase.local);
      assert.equal((await readModeState(cwd)).sessionMode, null);
    } finally {
      restoreModeOverride(context(cwd));
      await rm(cwd, { recursive: true, force: true });
    }
  }
});

test("Pi statusline reports only effective Freeflow runtime state", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-statusline-state-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    const configPath = join(cwd, ".freeflow/config.json");
    const { pi, handlers, commands } = loadExtension();
    const beforeAgentStart = handlers.get("before_agent_start");
    const sessionStart = handlers.get("session_start");
    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    assert.ok(beforeAgentStart);
    assert.ok(sessionStart);
    assert.ok(freeflowCommand);

    const statusFor = async (config) => {
      if (config === null) {
        await rm(configPath, { force: true });
      } else if (typeof config === "string") {
        await writeFile(configPath, config, "utf8");
      } else {
        await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
      }
      const ctx = context(cwd);
      await sessionStart({ reason: "reload" }, ctx);
      await beforeAgentStart({ systemPrompt: "base prompt" }, ctx);
      return ctx.statuses.at(-1).value;
    };

    assert.equal(await statusFor(null), "freeflow: setup needed");
    assert.equal(await statusFor("{ invalid"), "freeflow: config error");
    assert.equal(await statusFor({ enabled: false, defaultMode: "workflow" }), "freeflow: off");
    assert.equal(await statusFor({ defaultMode: "workflow", skills: { enabled: false } }), "freeflow: interaction");
    assert.equal(
      await statusFor({
        defaultMode: "workflow",
        skills: { enabled: false },
        outputRouter: { enabled: true },
      }),
      "freeflow: interaction · router",
    );
    assert.equal(
      await statusFor({
        defaultMode: "workflow",
        outputRouter: { enabled: true },
      }),
      "freeflow: interaction · workflow · router",
    );

    const masterOverrideCtx = context(cwd);
    await setSessionCoreOverride("enabled", false, masterOverrideCtx, pi);
    await beforeAgentStart({ systemPrompt: "base prompt" }, masterOverrideCtx);
    assert.equal(masterOverrideCtx.statuses.at(-1).value, "freeflow: off (session)");
    await resetSessionOverrides(masterOverrideCtx, pi);

    const interactionOverrideCtx = context(cwd);
    await setSessionCoreOverride("interactionContract", false, interactionOverrideCtx, pi);
    const interactionRuntime = await beforeAgentStart({ systemPrompt: "base prompt" }, interactionOverrideCtx);
    assert.match(interactionRuntime.systemPrompt, /Interaction contract: disabled \(session override\)/);
    assert.equal(
      interactionOverrideCtx.statuses.at(-1).value,
      "freeflow: interaction off (session) · workflow · router",
    );
    await resetSessionOverrides(interactionOverrideCtx, pi);

    const skillsOverrideCtx = context(cwd);
    await setSessionCoreOverride("skillsEnabled", false, skillsOverrideCtx, pi);
    await beforeAgentStart({ systemPrompt: "base prompt" }, skillsOverrideCtx);
    assert.equal(skillsOverrideCtx.statuses.at(-1).value, "freeflow: interaction · skills off (session) · router");
    await resetSessionOverrides(skillsOverrideCtx, pi);

    const modeCtx = context(cwd);
    await freeflowCommand.definition.handler("mode conversation", modeCtx);
    assert.equal(modeCtx.statuses.at(-1).value, "freeflow: interaction · conversation (session) · router");
    await freeflowCommand.definition.handler("mode reset", context(cwd));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi /freeflow command toggles master switch and blocks inactive settings rows", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-freeflow-settings-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify(
        {
          enabled: false,
          defaultMode: "workflow",
          outputRouter: { enabled: true },
        },
        null,
        2,
      ),
      "utf8",
    );

    const { commands } = loadExtension();
    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);

    const settingsCtx = context(cwd);
    settingsCtx.ui.custom = async (factory, options) => {
      assert.equal(options, undefined);
      let result;
      const dimTheme = {
        ...testTheme,
        fg(color, text) {
          return color === "dim" ? `[dim]${text}[/dim]` : text;
        },
      };
      const component = factory({ requestRender() {} }, dimTheme, {}, (value) => {
        result = value;
      });
      const rootText = renderText(component);
      assert.match(rootText, /^─+/);
      assert.match(rootText, /Freeflow Settings/);
      assert.match(rootText, /\[dim\]Output Router\[\/dim\]/);
      assert.match(rootText, /enabled \(22\) \(repository\) · inactive/);
      assert.match(rootText, /\[dim\]Interaction Contract/);
      assert.match(rootText, /\[dim\]Skills/);
      assert.match(rootText, /\[dim\].*Output Router/);
      assert.doesNotMatch(rootText, /Native safety net/);
      component.handleInput("\u001b[B"); // Interaction Contract row is inactive while Freeflow is off.
      component.handleInput("\r");
      component.handleInput("\u001b");
      return result;
    };

    await freeflowCommand.definition.handler("settings", settingsCtx);
    const afterInactiveEdit = JSON.parse(await readFile(join(cwd, ".freeflow/config.json"), "utf8"));
    assert.deepEqual(afterInactiveEdit, {
      enabled: false,
      defaultMode: "workflow",
      outputRouter: { enabled: true },
    });
    assert.equal(settingsCtx.reloads.length, 0);

    const enableCtx = context(cwd);
    await freeflowCommand.definition.handler("enable", enableCtx);
    const afterEnable = JSON.parse(await readFile(join(cwd, ".freeflow/config.json"), "utf8"));
    assert.equal(afterEnable.enabled, undefined);
    assert.equal(afterEnable.defaultMode, "workflow");
    assert.equal(afterEnable.outputRouter.enabled, true);
    assert.equal(enableCtx.reloads.length, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi /freeflow disable applies live gates before reload completes", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-disable-live-gates-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify(
        {
          defaultMode: "workflow",
          outputRouter: { enabled: true },
        },
        null,
        2,
      ),
      "utf8",
    );

    const { commands, activeToolNames } = loadExtension();
    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);
    assert.ok(activeToolNames().includes("freeflow_search"));

    const ctx = context(cwd);
    await freeflowCommand.definition.handler("disable", ctx);

    assert.equal(ctx.reloads.length, 1);
    assert.ok(!activeToolNames().includes("freeflow_status"));
    assert.ok(!activeToolNames().includes("freeflow_search"));
    assert.ok(!activeToolNames().includes("freeflow_run"));
    assert.ok(!activeToolNames().includes("freeflow_batch"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi /freeflow settings marks default mode dormant when Skills are disabled", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-settings-skills-off-mode-dormant-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({ defaultMode: "workflow", skills: { enabled: false } }, null, 2),
      "utf8",
    );

    const { commands } = loadExtension();
    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);

    const settingsCtx = context(cwd);
    settingsCtx.ui.custom = async (factory) => {
      let result;
      const component = factory({ requestRender() {} }, testTheme, {}, (value) => {
        result = value;
      });
      const rootText = renderText(component);
      assert.match(rootText, /Skills\s+disabled \(repository\)/);
      assert.match(rootText, /Session mode\s+default \(workflow · repository · inactive\)/);
      assert.match(rootText, /Default mode\s+workflow \(repository · inactive\)/);

      component.handleInput("\u001b[B");
      component.handleInput("\u001b[B");
      component.handleInput("\u001b[B");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      const choiceText = renderText(component);
      assert.match(choiceText, /Freeflow Settings · Personal overrides › Default mode/);
      assert.match(choiceText, /conversation\s+Discussion and read-only inspection/);
      assert.match(choiceText, /workflow\s+Adaptive workflow for consequential work/);
      assert.match(choiceText, /strict-workflow\s+Stronger decision and evidence pressure for high-risk work/);
      component.handleInput("\u001b[B");
      component.handleInput("\u001b[B");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\u001b");
      return result;
    };

    await freeflowCommand.definition.handler("settings", settingsCtx);
    const repositoryAfter = JSON.parse(await readFile(join(cwd, ".freeflow/config.json"), "utf8"));
    const localAfter = JSON.parse(await readFile(join(cwd, ".freeflow/local.json"), "utf8"));
    assert.equal(repositoryAfter.defaultMode, "workflow");
    assert.equal(repositoryAfter.skills.enabled, false);
    assert.equal(localAfter.defaultMode, "strict-workflow");
    assert.equal(settingsCtx.reloads.length, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi /freeflow settings toggles the interaction contract independently", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-settings-interaction-contract-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    const configPath = join(cwd, ".freeflow/config.json");
    await writeFile(configPath, JSON.stringify({ defaultMode: "workflow" }, null, 2), "utf8");
    await execFileAsync("git", ["init", "-q", cwd]);
    const { commands, handlers } = loadExtension();
    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);
    const settingsCtx = context(cwd);
    settingsCtx.ui.custom = async (factory) => {
      let result;
      const component = factory({ requestRender() {} }, testTheme, {}, (value) => {
        result = value;
      });
      assert.match(renderText(component), /Interaction Contract\s+enabled \(builtin\)/);
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\u001b[B");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\u001b");
      return result;
    };
    await freeflowCommand.definition.handler("settings", settingsCtx);
    const after = JSON.parse(await readFile(configPath, "utf8"));
    const localAfter = JSON.parse(await readFile(join(cwd, ".freeflow/local.json"), "utf8"));
    assert.equal(after.interactionContract, undefined);
    assert.equal(after.skills, undefined);
    assert.equal(localAfter.interactionContract, false);
    await execFileAsync("git", ["-C", cwd, "check-ignore", "-q", "--", ".freeflow/local.json"]);
    assert.equal(settingsCtx.reloads.length, 1);
    const runtime = await handlers.get("before_agent_start")(
      { prompt: "hello", systemPrompt: "base prompt" },
      context(cwd),
    );
    assert.doesNotMatch(runtime.systemPrompt, /# Freeflow Interaction Contract/);
    assert.equal(runtime.message.customType, "freeflow-workflow-bootstrap");
    const enableCtx = context(cwd);
    enableCtx.ui.custom = async (factory) => {
      let result;
      const component = factory({ requestRender() {} }, testTheme, {}, (value) => {
        result = value;
      });
      assert.match(renderText(component), /Interaction Contract\s+disabled \(local\)/);
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\u001b");
      return result;
    };
    await freeflowCommand.definition.handler("settings", enableCtx);
    const reenabled = JSON.parse(await readFile(configPath, "utf8"));
    assert.equal(reenabled.interactionContract, undefined);
    await assert.rejects(readFile(join(cwd, ".freeflow/local.json"), "utf8"), (error) => error?.code === "ENOENT");
    assert.equal(enableCtx.reloads.length, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi session settings override Freeflow without changing config", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-session-settings-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    const configPath = join(cwd, ".freeflow/config.json");
    const configText = JSON.stringify({ defaultMode: "workflow" }, null, 2);
    await writeFile(configPath, configText, "utf8");

    const { commands, entries } = loadExtension();
    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);
    const settingsCtx = context(cwd);
    settingsCtx.ui.custom = async (factory) => {
      let result;
      const component = factory({ requestRender() {} }, testTheme, {}, (value) => {
        result = value;
      });
      const rootText = renderText(component);
      assert.match(rootText, /Freeflow Settings · Session overrides/);
      assert.match(rootText, /Freeflow\s+enabled \(builtin\)/);
      assert.match(rootText, /Interaction Contract\s+enabled \(builtin\)/);
      assert.match(rootText, /Skills\s+enabled \(builtin\)/);
      assert.match(rootText, /Mode\s+default \(workflow · repository\)/);
      assert.match(rootText, /Cognitive Routing\s+auto unavailable · inactive/);
      assert.match(rootText, /Reset session overrides\s+available/);

      component.handleInput("\r");
      const choices = renderText(component);
      assert.match(choices, /Inherit configured value/);
      assert.match(choices, /Enabled for this session/);
      assert.match(choices, /Disabled for this session/);
      component.handleInput("\u001b[B");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\u001b");
      return result;
    };

    await freeflowCommand.definition.handler("settings session", settingsCtx);
    const capabilityState = await readCapabilityState(cwd, undefined, PIFLOW_HOST);
    assert.equal(capabilityState.enabled, false);
    assert.equal(capabilityState.configSources.enabled, "session");
    assert.equal(settingsCtx.reloads.length, 1);
    assert.deepEqual(entries.at(-1), {
      customType: "freeflow-session-overrides",
      data: { overrides: { enabled: false } },
    });
    assert.equal(await readFile(configPath, "utf8"), configText);
    await assert.rejects(readFile(join(cwd, ".freeflow/local.json"), "utf8"), (error) => error?.code === "ENOENT");

    const resetCtx = context(cwd);
    resetCtx.ui.custom = async (factory) => {
      let result;
      const component = factory({ requestRender() {} }, testTheme, {}, (value) => {
        result = value;
      });
      const rootText = renderText(component);
      assert.match(rootText, /Freeflow\s+disabled \(session\)/);
      assert.match(rootText, /Interaction Contract\s+enabled \(builtin\) · inactive/);
      for (let index = 0; index < 5; index += 1) component.handleInput("\u001b[B");
      component.handleInput("\r");
      assert.match(renderText(component), /Reset all session overrides/);
      component.handleInput("\r");
      component.handleInput("\u001b");
      return result;
    };
    await freeflowCommand.definition.handler("settings session", resetCtx);
    assert.equal((await readCapabilityState(cwd, undefined, PIFLOW_HOST)).enabled, true);
    assert.equal(resetCtx.reloads.length, 1);
    assert.deepEqual(entries.at(-1), {
      customType: "freeflow-session-overrides",
      data: { overrides: {} },
    });
    assert.equal(await readFile(configPath, "utf8"), configText);
  } finally {
    restoreModeOverride(context(cwd));
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi settings refuse to overwrite an invalid local override", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-invalid-local-settings-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({ defaultMode: "workflow" }, null, 2), "utf8");
    const localPath = join(cwd, ".freeflow/local.json");
    await writeFile(localPath, "{ invalid\n", "utf8");

    const { commands } = loadExtension();
    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);
    const ctx = context(cwd);
    ctx.ui.custom = async () => {
      assert.fail("settings UI must not open for invalid local config");
    };

    await freeflowCommand.definition.handler("settings", ctx);
    assert.equal(await readFile(localPath, "utf8"), "{ invalid\n");
    assert.match(ctx.notifications.at(-1).message, /local\.json is invalid; repair or remove it/);
    assert.equal(ctx.reloads.length, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi personal settings refuse to write a tracked local override", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-tracked-local-settings-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({ defaultMode: "workflow" }, null, 2), "utf8");
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
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\u001b[B");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\u001b");
      return result;
    };

    await freeflowCommand.definition.handler("settings", ctx);
    assert.deepEqual(JSON.parse(await readFile(join(cwd, ".freeflow/local.json"), "utf8")), {});
    assert.match(ctx.notifications.at(-1).message, /local\.json is tracked by git/);
    assert.equal(ctx.reloads.length, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi settings do not report save or reload success after a mixed write failure", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-mixed-settings-write-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({ defaultMode: "workflow" }), "utf8");
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

      for (let index = 0; index < 3; index++) component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\u001b[B");
      component.handleInput("\r"); // Session mode succeeds.
      await component.waitForWrites();

      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\u001b[B");
      component.handleInput("\u001b[B");
      component.handleInput("\r"); // Tracked local config write fails.
      await component.waitForWrites();
      component.handleInput("\u001b");
      return result;
    };

    await freeflowCommand.definition.handler("settings", ctx);
    assert.equal((await readModeState(cwd)).sessionMode, "conversation");
    assert.equal(ctx.reloads.length, 0);
    assert.match(ctx.notifications.map((notification) => notification.message).join("\n"), /Write failed:/);
    assert.doesNotMatch(
      ctx.notifications.map((notification) => notification.message).join("\n"),
      /personal overrides saved/,
    );
    assert.deepEqual(JSON.parse(await readFile(join(cwd, ".freeflow/local.json"), "utf8")), {});
  } finally {
    restoreModeOverride(context(cwd));
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi /freeflow settings repo edits shared defaults and shows local effective sources", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-repository-settings-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    const repositoryPath = join(cwd, ".freeflow/config.json");
    const localPath = join(cwd, ".freeflow/local.json");
    await writeFile(repositoryPath, JSON.stringify({ defaultMode: "workflow" }, null, 2), "utf8");
    await writeFile(
      localPath,
      JSON.stringify(
        {
          defaultMode: "conversation",
          processing: { unsafeUnsandboxed: { enabled: true } },
        },
        null,
        2,
      ),
      "utf8",
    );

    const { commands } = loadExtension();
    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);
    const ctx = context(cwd);
    ctx.ui.custom = async (factory) => {
      let result;
      const component = factory({ requestRender() {} }, testTheme, {}, (value) => {
        result = value;
      });
      const rootText = renderText(component);
      assert.match(rootText, /Freeflow Repository Settings · modifies \.freeflow\/config\.json/);
      assert.match(rootText, /Default mode\s+workflow \(effective conversation · local\)/);
      for (let index = 0; index < 4; index++) {
        component.handleInput("\u001b[B");
      }
      component.handleInput("\r");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\u001b");
      return result;
    };

    await freeflowCommand.definition.handler("settings repo", ctx);
    const repositoryAfter = JSON.parse(await readFile(repositoryPath, "utf8"));
    const localAfter = JSON.parse(await readFile(localPath, "utf8"));
    assert.equal(repositoryAfter.defaultMode, "strict-workflow");
    assert.equal(localAfter.defaultMode, "conversation");
    assert.equal(localAfter.processing.unsafeUnsandboxed.enabled, true);
    assert.equal(ctx.reloads.length, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi /freeflow settings groups capability settings", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-freeflow-grouped-settings-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({ defaultMode: "workflow", outputRouter: { enabled: true } }, null, 2),
      "utf8",
    );

    const { commands } = loadExtension();
    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);

    const settingsCtx = context(cwd);
    settingsCtx.ui.custom = async (factory) => {
      let result;
      const component = factory({ requestRender() {} }, testTheme, {}, (value) => {
        result = value;
      });
      const rootText = renderText(component);
      assert.match(rootText, /^─+/);
      assert.ok(rootText.indexOf("Context Virtualization") < rootText.indexOf("Output Router"));
      assert.match(rootText, /Output Router\s+enabled \(22\) \(repository\)/);
      assert.doesNotMatch(rootText, /Native safety net/);

      for (let index = 0; index < 7; index++) {
        component.handleInput("\u001b[B");
      }
      component.handleInput("\r");
      const routerText = renderText(component);
      assert.match(routerText, /Freeflow Settings · Personal overrides › Output Router/);
      assert.match(routerText, /Native safety net/);
      component.handleInput("\u001b");
      component.handleInput("\u001b");
      return result;
    };

    await freeflowCommand.definition.handler("settings", settingsCtx);
    assert.equal(settingsCtx.reloads.length, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("PiFlow shows unset Cognitive Routing presets as not configured and edits them while disabled", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-piflow-cognitive-not-configured-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({ defaultMode: "workflow" }), "utf8");
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
      const rootText = renderText(component);
      assert.ok(rootText.indexOf("Cognitive Routing") < rootText.indexOf("Output Router"));
      assert.match(rootText, /Cognitive Routing\s+disabled \(3\) disabled/);
      for (let index = 0; index < 5; index += 1) component.handleInput("\u001b[B");
      component.handleInput("\r");
      assert.match(renderText(component), /Enabled\s+disabled/);
      assert.match(renderText(component), /Standard preset\s+not configured/);
      assert.match(renderText(component), /Reasoning preset\s+not configured/);

      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\r");
      component.handleInput("\r");
      await component.waitForWrites();
      return result;
    };

    await freeflowCommand.definition.handler("settings", settingsCtx);
    const saved = JSON.parse(await readFile(join(cwd, ".freeflow/local.json"), "utf8"));
    assert.deepEqual(saved.cognitiveRouting.profiles.standard, {
      provider: "test",
      model: "model-a",
      thinkingLevel: "off",
    });
    assert.equal(saved.cognitiveRouting.enabled, undefined);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("PiFlow settings refresh the Cognitive Routing group after enabling it", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-piflow-cognitive-hot-reload-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        cognitiveRouting: {
          enabled: false,
          profiles: {
            standard: { provider: "test", model: "model-a", thinkingLevel: "low" },
            reasoning: { provider: "test", model: "model-b", thinkingLevel: "high" },
          },
        },
      }),
      "utf8",
    );
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
      assert.match(renderText(component), /Cognitive Routing\s+disabled \(3\) disabled/);
      for (let index = 0; index < 5; index += 1) component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\r");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      await component.waitForWrites();
      component.handleInput("\u001b");
      component.handleInput("\u001b");
      assert.match(renderText(component), /Cognitive Routing\s+enabled \(3\) configured/);
      component.handleInput("\u001b");
      return result;
    };

    await freeflowCommand.definition.handler("settings", settingsCtx);
    const saved = JSON.parse(await readFile(join(cwd, ".freeflow/local.json"), "utf8"));
    assert.equal(saved.cognitiveRouting.enabled, true);
    assert.equal(settingsCtx.reloads.length, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
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

test("Pi Cognitive Routing settings save a complete authenticated model and effort preset atomically", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-cognitive-settings-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify(
        {
          defaultMode: "workflow",
          cognitiveRouting: {
            enabled: true,
            profiles: {
              standard: { provider: "test", model: "model-a", thinkingLevel: "low" },
              reasoning: { provider: "test", model: "model-b", thinkingLevel: "high" },
            },
          },
        },
        null,
        2,
      ),
    );

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
      for (let index = 0; index < 5; index++) component.handleInput("\u001b[B");
      component.handleInput("\r"); // Cognitive Routing group.
      component.handleInput("\u001b[B");
      component.handleInput("\r"); // Standard preset wizard.
      component.handleInput("\u001b[B");
      component.handleInput("\r"); // model-b.
      for (let index = 0; index < 4; index++) component.handleInput("\u001b[B");
      component.handleInput("\r"); // max.
      component.handleInput("\r"); // confirm save.
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
    assert.equal(saved.cognitiveRouting.profiles.reasoning.thinkingLevel, "high");
    assert.equal(settingsCtx.reloads.length, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi Cognitive Routing preset cancel leaves the previous preset unchanged", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-cognitive-cancel-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    const original = {
      defaultMode: "workflow",
      cognitiveRouting: {
        enabled: true,
        profiles: {
          standard: { provider: "test", model: "model-a", thinkingLevel: "low" },
          reasoning: { provider: "test", model: "model-b", thinkingLevel: "high" },
        },
      },
    };
    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify(original, null, 2));

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
      for (let index = 0; index < 5; index++) component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\u001b"); // Cancel at the effort step.
      component.handleInput("\u001b");
      component.handleInput("\u001b");
      return result;
    };

    await freeflowCommand.definition.handler("settings repo", settingsCtx);
    assert.deepEqual(JSON.parse(await readFile(join(cwd, ".freeflow/config.json"), "utf8")), original);
    assert.equal(settingsCtx.reloads.length, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi Cognitive Routing settings refuse mid-run mutation", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-cognitive-busy-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    const original = JSON.stringify({ defaultMode: "workflow" }, null, 2);
    await writeFile(join(cwd, ".freeflow/config.json"), original);
    const { commands } = loadExtension();
    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);
    const settingsCtx = context(cwd);
    settingsCtx.isIdle = () => false;
    settingsCtx.ui.custom = async () => {
      throw new Error("settings UI must not open while Pi is running");
    };

    await freeflowCommand.definition.handler("settings repo", settingsCtx);
    assert.match(settingsCtx.notifications.at(-1).message, /only while Pi is idle/);
    assert.equal(await readFile(join(cwd, ".freeflow/config.json"), "utf8"), original);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi settings recheck idle state before committing a selection", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-settings-busy-commit-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    const original = JSON.stringify({ defaultMode: "workflow" }, null, 2);
    await writeFile(join(cwd, ".freeflow/config.json"), original);
    const { commands } = loadExtension();
    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);
    const settingsCtx = context(cwd);
    let idle = true;
    settingsCtx.isIdle = () => idle;
    settingsCtx.ui.custom = async (factory) => {
      let result;
      const component = factory({ requestRender() {} }, testTheme, {}, (value) => {
        result = value;
      });
      idle = false;
      for (let index = 0; index < 4; index++) component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      await component.waitForWrites();
      component.handleInput("\u001b");
      return result;
    };

    await freeflowCommand.definition.handler("settings repo", settingsCtx);
    assert.match(settingsCtx.notifications.at(-1).message, /only while Pi is idle/);
    assert.equal(await readFile(join(cwd, ".freeflow/config.json"), "utf8"), original);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi before_agent_start keeps output-router disabled by default", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-router-default-disabled-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({ defaultMode: "workflow" }, null, 2), "utf8");

    const { handlers, activeToolNames } = loadExtension();
    const beforeAgentStart = handlers.get("before_agent_start");
    assert.ok(beforeAgentStart);

    const result = await beforeAgentStart({ systemPrompt: "base prompt" }, context(cwd));

    assert.match(result.systemPrompt, /# Freeflow Interaction Contract/);
    assert.doesNotMatch(result.systemPrompt, /# Freeflow Runtime Kernel/);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Mode Contract Skill/);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Workflow Skill/);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Decision Gate Skill/);
    assert.doesNotMatch(result.systemPrompt, /## Discovery-light/);
    assert.match(result.systemPrompt, /Output router: disabled/);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Output Router Skill/);
    assert.doesNotMatch(result.systemPrompt, /freeflow_search/);

    assert.doesNotMatch(result.systemPrompt, /Legacy `FFRESULT`/);
    assert.doesNotMatch(result.systemPrompt, /# Context Locality/);
    assert.doesNotMatch(result.systemPrompt, /freeflow_run/);
    assert.doesNotMatch(result.systemPrompt, /freeflow_capture/);
    assert.doesNotMatch(result.systemPrompt, /freeflow_search action=transform/);
    assert.doesNotMatch(result.systemPrompt, /Native tools stay direct/);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Workflow Map/);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Output Router Safety Policy/);
    assert.doesNotMatch(result.systemPrompt, /Do not silently summarize or compress exactness-sensitive output/);
    assert.doesNotMatch(result.systemPrompt, /large native read\/bash outputs may be vaulted/);
    assert.doesNotMatch(result.systemPrompt, /Output-router config note/);
    assert.ok(!activeToolNames().includes("freeflow_search"));
    assert.ok(!activeToolNames().includes("freeflow_run"));
    assert.ok(!activeToolNames().includes("freeflow_batch"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi before_agent_start keeps the per-turn system context to the compact interaction contract", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-interaction-contract-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({ defaultMode: "workflow" }, null, 2), "utf8");

    const { handlers } = loadExtension();
    const beforeAgentStart = handlers.get("before_agent_start");
    assert.ok(beforeAgentStart);

    const result = await beforeAgentStart({ systemPrompt: "base prompt" }, context(cwd));

    assert.match(result.systemPrompt, /# Freeflow Interaction Contract/);
    assert.doesNotMatch(result.systemPrompt, /# Freeflow Runtime Kernel/);
    assert.match(result.systemPrompt, /Runtime delivery: confirmed for this Pi `before_agent_start` invocation/);
    assert.doesNotMatch(result.systemPrompt, /## Conversation Mode Boundary/);
    assert.doesNotMatch(result.systemPrompt, /## Strict Workflow Overlay/);
    assert.match(result.systemPrompt, /Answer questions without inferring action/);
    assert.match(result.systemPrompt, /outcome, effects, evidence boundary, and stop condition/);
    assert.doesNotMatch(result.systemPrompt, /self-review|final assurance|standing authorization/i);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Mode Contract Skill/);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Workflow Skill/);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Decision Gate Skill/);
    assert.doesNotMatch(result.systemPrompt, /## Discovery-light/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi loads the full Workflow skill as one persistent first-turn message", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-workflow-bootstrap-"));
  try {
    const workflowSource = await readFile(new URL("../../../skills/workflow/SKILL.md", import.meta.url), "utf8");
    const workflowLines = workflowSource.split(/\r?\n/);
    const workflowOwnerLine = workflowLines.find((line) => line.startsWith("The active agent owns "));
    const workflowSelfReviewLine = workflowLines.find((line) => line.startsWith("Self-review is silent "));
    assert.ok(workflowOwnerLine, "canonical Workflow owner sentinel missing");
    assert.ok(workflowSelfReviewLine, "canonical Workflow self-review sentinel missing");

    await mkdir(join(cwd, ".freeflow"));
    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({ defaultMode: "workflow" }, null, 2), "utf8");

    const { handlers } = loadExtension();
    const beforeAgentStart = handlers.get("before_agent_start");
    assert.ok(beforeAgentStart);

    const sessionEntries = [];
    const ctx = context(cwd, sessionEntries);
    const first = await beforeAgentStart({ prompt: "hi", systemPrompt: "base prompt" }, ctx);

    assert.equal(first.message.customType, "freeflow-workflow-bootstrap");
    assert.equal(first.message.display, false);
    assert.match(first.message.content, /^# Freeflow Workflow Bootstrap/);
    assert.match(first.message.content, /# Workflow/);
    assert.ok(first.message.content.includes(workflowOwnerLine));
    assert.ok(first.message.content.includes(workflowSelfReviewLine));
    assert.match(first.message.content, /evidence/i);
    assert.doesNotMatch(first.systemPrompt, /# Freeflow Workflow Bootstrap/);

    sessionEntries.push({
      type: "custom_message",
      id: "workflow-bootstrap-entry",
      parentId: null,
      timestamp: new Date().toISOString(),
      customType: first.message.customType,
      content: first.message.content,
      display: first.message.display,
      details: first.message.details,
    });
    const later = await beforeAgentStart({ prompt: "implement the feature", systemPrompt: "base prompt" }, ctx);

    assert.equal(later.message, undefined);
    assert.match(later.systemPrompt, /# Freeflow Interaction Contract/);
    assert.doesNotMatch(later.systemPrompt, /# Freeflow Runtime Kernel/);

    const compactedContext = context(cwd, sessionEntries, []);
    const afterCompaction = await beforeAgentStart(
      { prompt: "continue", systemPrompt: "base prompt" },
      compactedContext,
    );
    assert.equal(afterCompaction.message.customType, "freeflow-workflow-bootstrap");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi suppresses persisted Workflow context while Skills are disabled", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-workflow-bootstrap-disabled-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    const configPath = join(cwd, ".freeflow/config.json");
    await writeFile(
      configPath,
      JSON.stringify({ defaultMode: "workflow", skills: { enabled: false } }, null, 2),
      "utf8",
    );

    const { handlers } = loadExtension();
    const contextHandler = handlers.get("context");
    assert.ok(contextHandler);

    const workflowMessage = {
      role: "custom",
      customType: "freeflow-workflow-bootstrap",
      content: "# Freeflow Workflow Bootstrap",
      display: false,
      timestamp: Date.now(),
    };
    const userMessage = {
      role: "user",
      content: "hello",
      timestamp: Date.now(),
    };
    const disabled = await contextHandler({ messages: [workflowMessage, userMessage] }, context(cwd));
    assert.deepEqual(disabled.messages, [userMessage]);

    await writeFile(configPath, JSON.stringify({ defaultMode: "workflow" }, null, 2), "utf8");
    const enabled = await contextHandler({ messages: [workflowMessage, userMessage] }, context(cwd));
    assert.equal(enabled, undefined);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi suppresses persisted Cognitive Routing bootstrap context when routing is disabled", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-cognitive-bootstrap-disabled-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({ defaultMode: "workflow" }, null, 2), "utf8");

    const { handlers } = loadExtension();
    const contextHandler = handlers.get("context");
    assert.ok(contextHandler);

    const cognitiveMessage = {
      role: "custom",
      customType: "freeflow-cognitive-routing-bootstrap",
      content: "# Freeflow Cognitive Routing Bootstrap",
      display: false,
      timestamp: Date.now(),
    };
    const userMessage = {
      role: "user",
      content: "hello",
      timestamp: Date.now(),
    };
    const disabled = await contextHandler({ messages: [cognitiveMessage, userMessage] }, context(cwd));
    assert.deepEqual(disabled.messages, [userMessage]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi before_agent_start injects the Freeflow interaction contract on every turn", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-core-context-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({ defaultMode: "workflow" }, null, 2), "utf8");

    const { handlers } = loadExtension();
    const beforeAgentStart = handlers.get("before_agent_start");
    assert.ok(beforeAgentStart);

    const first = await beforeAgentStart({ systemPrompt: "base prompt" }, context(cwd));
    const second = await beforeAgentStart({ systemPrompt: "base prompt" }, context(cwd));

    for (const result of [first, second]) {
      assert.match(result.systemPrompt, /# Freeflow Runtime Context/);
      assert.match(result.systemPrompt, /# Freeflow Interaction Contract/);
      assert.doesNotMatch(result.systemPrompt, /# Freeflow Runtime Kernel/);
      assert.match(result.systemPrompt, /Answer questions without inferring action/);
      assert.doesNotMatch(result.systemPrompt, /## Freeflow Runtime Priority/);
      assert.doesNotMatch(result.systemPrompt, /## Loaded Mode Contract Skill/);
      assert.doesNotMatch(result.systemPrompt, /## Loaded Workflow Skill/);
      assert.doesNotMatch(result.systemPrompt, /## Loaded Decision Gate Skill/);
      assert.doesNotMatch(result.systemPrompt, /## Discovery-light/);
      assert.match(result.systemPrompt, /Output router: disabled/);
      assert.doesNotMatch(result.systemPrompt, /## Loaded Output Router Skill/);
      assert.doesNotMatch(result.systemPrompt, /freeflow_search action=transform/);
      assert.doesNotMatch(result.systemPrompt, /## Freeflow Output Router Reminder/);
      assert.doesNotMatch(result.systemPrompt, /## Loaded Workflow Map/);
      assert.doesNotMatch(result.systemPrompt, /## Loaded Output Router Safety Policy/);
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi session_start and session_compact keep the interaction contract on later turns", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-session-cache-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({ defaultMode: "workflow" }, null, 2), "utf8");

    const { handlers } = loadExtension();
    const beforeAgentStart = handlers.get("before_agent_start");
    const sessionStart = handlers.get("session_start");
    const sessionCompact = handlers.get("session_compact");
    assert.ok(beforeAgentStart);
    assert.ok(sessionStart);
    assert.ok(sessionCompact);

    await beforeAgentStart({ systemPrompt: "base prompt" }, context(cwd));
    const afterFirst = await beforeAgentStart({ systemPrompt: "base prompt" }, context(cwd));
    assert.match(afterFirst.systemPrompt, /# Freeflow Interaction Contract/);

    await sessionCompact({ reason: "manual" }, context(cwd));
    const afterCompact = await beforeAgentStart({ systemPrompt: "base prompt" }, context(cwd));
    assert.match(afterCompact.systemPrompt, /# Freeflow Interaction Contract/);
    assert.doesNotMatch(afterCompact.systemPrompt, /## Loaded Workflow Skill/);
    assert.doesNotMatch(afterCompact.systemPrompt, /## Loaded Output Router Skill/);

    await sessionStart({ reason: "resume" }, context(cwd));
    const afterResume = await beforeAgentStart({ systemPrompt: "base prompt" }, context(cwd));
    assert.match(afterResume.systemPrompt, /# Freeflow Interaction Contract/);
    assert.doesNotMatch(afterResume.systemPrompt, /## Loaded Workflow Skill/);
    assert.doesNotMatch(afterResume.systemPrompt, /## Loaded Output Router Skill/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi capability config disables output-router context, active tools, and execution", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-output-router-disabled-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({ defaultMode: "workflow", outputRouter: { enabled: false } }, null, 2),
      "utf8",
    );

    const { handlers, tools, activeToolNames } = loadExtension();
    const beforeAgentStart = handlers.get("before_agent_start");
    assert.ok(beforeAgentStart);

    const result = await beforeAgentStart({ systemPrompt: "base prompt" }, context(cwd));
    assert.match(result.systemPrompt, /Output router: disabled/);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Output Router Skill/);
    assert.ok(!activeToolNames().includes("freeflow_search"));
    assert.ok(!activeToolNames().includes("freeflow_run"));
    assert.ok(!activeToolNames().includes("freeflow_batch"));

    const searchTool = tools.find((tool) => tool.name === "freeflow_search");
    assert.ok(searchTool);
    const disabled = await searchTool.execute(
      "search-disabled",
      { action: "locate", query: "x" },
      undefined,
      undefined,
      context(cwd),
    );
    assert.match(disabled.content[0].text, /freeflow_search\|disabled_by_config/);

    const guard = handlers.get("tool_call");
    const blocked = await guard({ toolName: "freeflow_search" }, context(cwd));
    assert.equal(blocked.block, true);
    assert.match(blocked.reason, /disabled by Freeflow config/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi output-router command updates config and reloads", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-capability-command-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({}, null, 2), "utf8");

    const { commands } = loadExtension();
    const outputRouterCommand = commands.find((command) => command.name === "output-router");
    assert.ok(outputRouterCommand);

    const outputCtx = context(cwd);
    await outputRouterCommand.definition.handler("enable", outputCtx);
    const afterOutput = JSON.parse(await readFile(join(cwd, ".freeflow/config.json"), "utf8"));
    assert.equal(afterOutput.outputRouter.enabled, true);
    assert.equal(outputCtx.reloads.length, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi output-router settings UI toggles multiple config values and reloads once", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-output-router-settings-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify(
        {
          defaultMode: "workflow",
          outputRouter: { generatedPaths: ["graphify-out/**"] },
        },
        null,
        2,
      ),
      "utf8",
    );

    const { commands } = loadExtension();
    const outputRouterCommand = commands.find((command) => command.name === "output-router");
    assert.ok(outputRouterCommand);

    const ctx = context(cwd);
    ctx.ui.custom = async (factory) => {
      let result;
      const component = factory({ requestRender() {} }, testTheme, {}, (value) => {
        result = value;
      });
      assert.match(renderText(component), /Output Router Settings/);
      component.handleInput("\r");
      component.handleInput("\u001b[A");
      component.handleInput("\r"); // Output Router enabled
      await component.waitForWrites();
      for (let index = 0; index < 9; index++) {
        component.handleInput("\u001b[B");
      }
      component.handleInput("\r");
      component.handleInput("\u001b[A");
      component.handleInput("\r"); // Script transform enabled
      await component.waitForWrites();
      component.handleInput("\u001b");
      return result;
    };

    await outputRouterCommand.definition.handler("", ctx);

    const after = JSON.parse(await readFile(join(cwd, ".freeflow/config.json"), "utf8"));
    assert.equal(after.outputRouter.enabled, true);
    assert.deepEqual(after.outputRouter.hints.generatedPathGlobs, ["graphify-out/**"]);
    assert.equal(after.outputRouter.generatedPaths, undefined);
    assert.equal(after.outputRouter.scriptTransform.enabled, true);
    assert.equal(ctx.reloads.length, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi output-router status summarizes master and subfeature state", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-output-router-status-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify(
        {
          defaultMode: "workflow",
          outputRouter: {
            enabled: true,
            postToolRouting: "safety-net",
            scriptTransform: { enabled: true },
            observedRouting: { enabled: true },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const { commands } = loadExtension();
    const outputRouterCommand = commands.find((command) => command.name === "output-router");
    assert.ok(outputRouterCommand);

    const ctx = context(cwd);
    await outputRouterCommand.definition.handler("status", ctx);

    assert.equal(ctx.notifications.length, 1);
    assert.match(ctx.notifications[0].message, /Output Router: enabled/);
    assert.match(ctx.notifications[0].message, /script transform: enabled/);
    assert.match(ctx.notifications[0].message, /observed routing: enabled/);
    assert.match(ctx.notifications[0].message, /native safety net: safety-net/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_status reports effective defaults without writing config", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-status-minimal-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    const configPath = join(cwd, ".freeflow/config.json");
    const configText = JSON.stringify({ defaultMode: "workflow" }, null, 2);
    await writeFile(configPath, configText, "utf8");

    const { tools } = loadExtension();
    const statusTool = tools.find((tool) => tool.name === "freeflow_status");
    assert.ok(statusTool);

    const result = await statusTool.execute("status-minimal", { action: "doctor" }, undefined, undefined, context(cwd));
    const report = JSON.parse(result.content[0].text);

    assert.equal(report.toolStatus, "ok");
    assert.equal(report.action, "doctor");
    assert.equal(report.mode.defaultMode, "workflow");
    assert.deepEqual(report.effectiveConfig.interactionContract, {
      enabled: true,
      effective: true,
    });
    assert.equal(report.effectiveDefaults.interactionContract, true);
    assert.equal(report.effectiveConfig.outputRouter.enabled, false);
    assert.equal(report.effectiveConfig.outputRouter.profile, "standard");
    assert.equal(report.effectiveConfig.outputRouter.postToolRouting, "off");
    assert.equal("capture" in report.effectiveConfig, false);
    assert.equal("providers" in report.effectiveConfig, false);
    assert.equal(report.effectiveConfig.outputRouter.observedRouting.enabled, false);
    assert.deepEqual(report.effectiveConfig.outputRouter.observedRouting.mcp.servers, {});
    assert.equal(report.effectiveConfig.outputRouter.scriptTransform.enabled, false);
    assert.equal(report.effectiveLocalConfig.processing.unsafeUnsandboxed.enabled, false);
    assert.equal(report.processing.unsafeUnsandboxed.enabled, false);
    assert.equal(report.processing.unsafeUnsandboxed.status, "disabled");
    assert.equal(report.localConfigExists, false);
    assert.deepEqual(report.localConfigWarnings, []);
    assert.equal(report.scriptTransform.enabled, false);
    assert.equal(report.scriptTransform.executionStatus, "disabled");
    assert.ok(["available", "unavailable"].includes(report.scriptTransform.adapterStatus));
    assert.equal(report.scriptTransform.adapterContractVersion, 1);
    assert.deepEqual(report.scriptTransform.configuredLanguages, ["javascript", "python", "jq"]);
    const reportedLanguages = [
      ...report.scriptTransform.availableLanguages,
      ...report.scriptTransform.unavailableLanguages.map((entry) => entry.language),
    ].sort();
    assert.deepEqual(reportedLanguages, ["javascript", "jq", "python"]);
    assert.ok(report.scriptTransform.requiredProofs.includes("network_access_denied"));
    assert.ok(
      report.scriptTransform.candidateMechanisms.some(
        (candidate) => candidate.id === "node-vm" && candidate.status === "rejected",
      ),
    );
    assert.ok(
      report.scriptTransform.candidateMechanisms.some(
        (candidate) => candidate.id === "os-sandbox-adapter" && candidate.status === "candidate_unproven",
      ),
    );
    assert.equal(report.scriptTransform.network, "off");
    assert.equal(report.scriptTransform.rawScriptPersistence, "disabled");
    assert.equal(report.observedRouting.host.name, "pi");
    assert.equal(report.observedRouting.host.outputReplacement, "available");
    assert.equal(report.vaultIndex.engine, "local-json-sidecar");
    assert.equal(typeof report.vaultIndex.available, "boolean");
    assert.equal(report.vaultIndex.degraded, false);
    assert.equal(report.vaultIndex.stale, false);
    assert.equal(report.vaultIndex.rebuildRecommended, false);
    assert.equal(typeof report.vaultIndex.entryCount, "number");
    assert.ok(report.vaultIndex.entryCount >= 0);
    assert.equal(report.observedRouting.unsupportedPersistenceModes.includes("redacted"), true);
    assert.deepEqual(report.configWarnings, []);
    assert.match(report.vault.root, /freeflow-router\/vault$/);
    assert.ok(
      [
        "writable",
        "missing_ancestor_writable",
        "missing_ancestor_unavailable",
        "not_directory",
        "not_writable",
        "unknown",
      ].includes(report.vault.writability.status),
    );
    assert.equal(await readFile(configPath, "utf8"), configText);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_status reports layered core sources and dormant mode", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-status-layered-core-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        enabled: true,
        interactionContract: true,
        defaultMode: "workflow",
        skills: { enabled: true },
      }),
      "utf8",
    );
    await writeFile(
      join(cwd, ".freeflow/local.json"),
      JSON.stringify({
        interactionContract: false,
        defaultMode: "strict-workflow",
        skills: { enabled: false },
      }),
      "utf8",
    );

    const { tools } = loadExtension();
    const statusTool = tools.find((tool) => tool.name === "freeflow_status");
    assert.ok(statusTool);
    const result = await statusTool.execute(
      "status-layered-core",
      { action: "status" },
      undefined,
      undefined,
      context(cwd),
    );
    const report = JSON.parse(result.content[0].text);

    assert.equal(report.configValid, true);
    assert.equal(report.localConfigValid, true);
    assert.deepEqual(report.configuration.sources, {
      enabled: "repository",
      interactionContract: "local",
      contextVirtualization: "builtin",
      skillsEnabled: "local",
      defaultMode: "local",
    });
    assert.equal(report.effectiveConfig.enabled, true);
    assert.equal(report.effectiveConfig.defaultMode, "strict-workflow");
    assert.deepEqual(report.effectiveConfig.interactionContract, {
      enabled: false,
      effective: false,
    });
    assert.deepEqual(report.effectiveConfig.skills, {
      enabled: false,
      effective: false,
    });
    assert.equal(report.mode.repositoryDefaultMode, "workflow");
    assert.equal(report.mode.repositoryDefaultModeSource, "repository");
    assert.equal(report.mode.personalDefaultMode, "strict-workflow");
    assert.equal(report.mode.defaultMode, "strict-workflow");
    assert.equal(report.mode.defaultModeSource, "local");
    assert.equal(report.mode.sessionMode, null);
    assert.equal(report.mode.active, false);
    assert.equal(report.mode.resolvedMode, "strict-workflow");
    assert.equal(report.mode.effectiveMode, null);

    const expanded = renderText(statusTool.renderResult(result, { expanded: true }, testTheme));
    assert.match(expanded, /repository:\s+valid/);
    assert.match(expanded, /personal:\s+valid/);
    assert.match(expanded, /interactionContract:\s+false\s+\(local\)/);
    assert.match(expanded, /skills:\s+false\s+\(local\)/);
    assert.match(expanded, /active:\s+false/);
    assert.match(expanded, /effective:\s+none/);
    assert.match(expanded, /resolved:\s+strict-workflow/);
    assert.match(expanded, /repository default:\s+workflow\s+\(repository\)/);
    assert.match(expanded, /personal default override:\s+strict-workflow/);
    assert.match(expanded, /configured default:\s+strict-workflow\s+\(local\)/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_status fails closed and explains invalid local core config", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-status-invalid-local-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({ defaultMode: "workflow" }), "utf8");
    await writeFile(join(cwd, ".freeflow/local.json"), JSON.stringify({ skills: { enabled: "no" } }), "utf8");

    const { tools } = loadExtension();
    const statusTool = tools.find((tool) => tool.name === "freeflow_status");
    assert.ok(statusTool);
    const result = await statusTool.execute(
      "status-invalid-local",
      { action: "doctor" },
      undefined,
      undefined,
      context(cwd),
    );
    const report = JSON.parse(result.content[0].text);

    assert.equal(report.configValid, false);
    assert.equal(report.repositoryConfigValid, true);
    assert.equal(report.localConfigValid, false);
    assert.equal(report.effectiveConfig.configured, false);
    assert.equal(report.effectiveConfig.enabled, false);
    assert.equal(report.mode.active, false);
    assert.match(report.configuration.personal.error, /skills\.enabled/);
    assert.ok(
      report.localConfigWarnings.some(
        (warning) => warning.includes(".freeflow/local.json is invalid") && warning.includes("runtime is inactive"),
      ),
    );

    const collapsed = renderText(statusTool.renderResult(result, { expanded: false }, testTheme));
    assert.match(collapsed, /freeflow off/);
    assert.match(collapsed, /mode dormant \(workflow\)/);
    assert.match(collapsed, /warnings=1/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_status reports vault writability without creating directories", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-status-vault-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    const nestedVault = join(cwd, "missing", "nested", "vault");
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: { vaultRoot: nestedVault },
      }),
      "utf8",
    );

    const { tools } = loadExtension();
    const statusTool = tools.find((tool) => tool.name === "freeflow_status");
    const missingResult = await statusTool.execute(
      "status-vault-missing",
      { action: "doctor" },
      undefined,
      undefined,
      context(cwd),
    );
    const missingReport = JSON.parse(missingResult.content[0].text);

    assert.equal(missingReport.vault.writability.status, "missing_ancestor_writable");
    await assert.rejects(readFile(nestedVault, "utf8"));

    const fileVault = join(cwd, "vault-file");
    await writeFile(fileVault, "not a directory", "utf8");
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: { enabled: true, vaultRoot: fileVault },
      }),
      "utf8",
    );
    const fileResult = await statusTool.execute(
      "status-vault-file",
      { action: "doctor" },
      undefined,
      undefined,
      context(cwd),
    );
    const fileReport = JSON.parse(fileResult.content[0].text);
    assert.equal(fileReport.vault.writability.status, "not_directory");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_status reports local unsafe processing opt-in without shared config", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-status-local-processing-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({ defaultMode: "workflow" }), "utf8");
    await writeFile(
      join(cwd, ".freeflow/local.json"),
      JSON.stringify({ processing: { unsafeUnsandboxed: { enabled: true } } }),
      "utf8",
    );

    const { tools } = loadExtension();
    const statusTool = tools.find((tool) => tool.name === "freeflow_status");
    const result = await statusTool.execute(
      "status-local-processing",
      { action: "doctor" },
      undefined,
      undefined,
      context(cwd),
    );
    const report = JSON.parse(result.content[0].text);

    assert.equal(report.localConfigExists, true);
    assert.equal(report.effectiveLocalConfig.processing.unsafeUnsandboxed.enabled, true);
    assert.equal(report.processing.unsafeUnsandboxed.enabled, true);
    assert.equal(report.processing.unsafeUnsandboxed.status, "enabled_unsafe");
    assert.deepEqual(report.configWarnings, []);
    assert.deepEqual(report.localConfigWarnings, []);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_status warns that shared config cannot enable unsafe processing", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-status-shared-processing-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        processing: { unsafeUnsandboxed: { enabled: true } },
      }),
      "utf8",
    );

    const { tools } = loadExtension();
    const statusTool = tools.find((tool) => tool.name === "freeflow_status");
    const result = await statusTool.execute(
      "status-shared-processing",
      { action: "doctor" },
      undefined,
      undefined,
      context(cwd),
    );
    const report = JSON.parse(result.content[0].text);

    assert.equal(report.effectiveLocalConfig.processing.unsafeUnsandboxed.enabled, false);
    assert.equal(report.processing.unsafeUnsandboxed.enabled, false);
    assert.ok(report.configWarnings.some((warning) => warning.includes("processing config is ignored")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_status reports configured observed routing", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-status-observed-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: {
          enabled: true,
          observedRouting: {
            enabled: true,
            onRoutingFailure: "fail-open",
            mcp: {
              servers: {
                github: { enabled: true, persistence: "exact" },
                gmail: { enabled: true, persistence: "metadata-only" },
              },
            },
            web: { enabled: true, persistence: "exact" },
            fetch: { enabled: false },
            codeSearch: { enabled: true, persistence: "none" },
          },
          scriptTransform: {
            enabled: true,
            languages: ["python"],
            limits: {
              timeoutMs: 1000,
              maxInputBytes: 2048,
              maxOutputBytes: 4096,
            },
          },
        },
      }),
      "utf8",
    );

    const { tools } = loadExtension();
    const statusTool = tools.find((tool) => tool.name === "freeflow_status");
    const result = await statusTool.execute(
      "status-observed",
      { action: "doctor" },
      undefined,
      undefined,
      context(cwd),
    );
    const report = JSON.parse(result.content[0].text);

    assert.equal(report.effectiveConfig.outputRouter.observedRouting.enabled, true);
    assert.equal(report.effectiveConfig.outputRouter.observedRouting.onRoutingFailure, "fail-open");
    assert.deepEqual(report.effectiveConfig.outputRouter.observedRouting.mcp.servers.github, {
      enabled: true,
      persistence: "exact",
    });
    assert.deepEqual(report.effectiveConfig.outputRouter.observedRouting.mcp.servers.gmail, {
      enabled: true,
      persistence: "metadata-only",
    });
    assert.deepEqual(report.effectiveConfig.outputRouter.observedRouting.web, {
      enabled: true,
      persistence: "exact",
    });
    assert.deepEqual(report.effectiveConfig.outputRouter.observedRouting.fetch, {
      enabled: false,
      persistence: "none",
    });
    assert.deepEqual(report.effectiveConfig.outputRouter.observedRouting.codeSearch, {
      enabled: true,
      persistence: "none",
    });
    assert.equal(report.observedRouting.enabled, true);
    assert.equal(report.observedRouting.mcp.configuredServerCount, 2);
    assert.equal(report.effectiveConfig.outputRouter.scriptTransform.enabled, true);
    assert.deepEqual(report.effectiveConfig.outputRouter.scriptTransform.languages, ["python"]);
    assert.equal(report.scriptTransform.enabled, true);
    assert.ok(["available", "adapter_unavailable"].includes(report.scriptTransform.executionStatus));
    assert.equal(typeof report.scriptTransform.adapterAvailable, "boolean");
    if (report.scriptTransform.adapterAvailable) {
      assert.ok(report.scriptTransform.availableLanguages.includes("python"));
    }
    assert.deepEqual(report.observedRouting.persistenceModes, ["exact", "metadata-only", "none"]);
    assert.deepEqual(report.configWarnings, []);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_status reports invalid config warnings and safe fallbacks", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-status-invalid-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: {
          enabled: "yes",
          profile: "future",
          scriptTransform: {
            enabled: "yes",
            sandbox: "none",
            languages: ["ruby"],
            network: "on",
          },
          observedRouting: {
            enabled: "yes",
            mcp: {
              servers: { github: { enabled: true, persistence: "redacted" } },
            },
            web: { enabled: true },
          },
        },
        capture: { freeflowMediated: "metadata-only", directHostTools: "raw" },
        providers: { enabled: [{ id: "serena", mode: "write" }] },
      }),
      "utf8",
    );

    const { tools } = loadExtension();
    const statusTool = tools.find((tool) => tool.name === "freeflow_status");
    const result = await statusTool.execute("status-invalid", { action: "doctor" }, undefined, undefined, context(cwd));
    const report = JSON.parse(result.content[0].text);

    assert.equal(report.effectiveConfig.outputRouter.enabled, false);
    assert.equal(report.effectiveConfig.outputRouter.profile, "standard");
    assert.equal("capture" in report.effectiveConfig, false);
    assert.equal("providers" in report.effectiveConfig, false);
    assert.equal(report.effectiveConfig.outputRouter.observedRouting.enabled, false);
    assert.equal(report.effectiveConfig.outputRouter.scriptTransform.enabled, false);
    assert.deepEqual(report.effectiveConfig.outputRouter.scriptTransform.languages, ["javascript", "python", "jq"]);
    assert.equal(report.effectiveConfig.outputRouter.observedRouting.mcp.servers.github.persistence, "metadata-only");
    assert.equal(report.effectiveConfig.outputRouter.observedRouting.web.persistence, "metadata-only");
    assert.ok(report.configWarnings.some((warning) => warning.includes("outputRouter.enabled")));
    assert.ok(report.configWarnings.some((warning) => warning.includes("outputRouter.profile")));
    assert.ok(report.configWarnings.some((warning) => warning.includes("outputRouter.scriptTransform.enabled")));
    assert.ok(report.configWarnings.some((warning) => warning.includes("outputRouter.scriptTransform.sandbox")));
    assert.ok(report.configWarnings.some((warning) => warning.includes("outputRouter.scriptTransform.languages")));
    assert.ok(report.configWarnings.some((warning) => warning.includes("outputRouter.scriptTransform.network")));
    assert.ok(report.configWarnings.some((warning) => warning.includes("outputRouter.observedRouting.enabled")));
    assert.ok(
      report.configWarnings.some(
        (warning) =>
          warning.includes("outputRouter.observedRouting.mcp.servers.github.persistence") &&
          warning.includes("redacted"),
      ),
    );
    assert.ok(
      report.configWarnings.some((warning) => warning.includes("outputRouter.observedRouting.web.persistence")),
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_status migration recommendations are non-destructive", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-status-migration-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    const configPath = join(cwd, ".freeflow/config.json");
    const configText = JSON.stringify(
      {
        defaultMode: "workflow",
        outputRouter: {
          enabled: true,
          profile: "standard",
          postToolRouting: "off",
          largeOutputBytes: 64000,
          largeOutputLines: 1000,
          vaultRoot: "~/.cache/freeflow-router/vault",
          vaultRetentionDays: 7,
        },
        capture: { freeflowMediated: "raw", directHostTools: "off" },
        providers: { enabled: [] },
      },
      null,
      2,
    );
    await writeFile(configPath, configText, "utf8");

    const { tools } = loadExtension();
    const statusTool = tools.find((tool) => tool.name === "freeflow_status");
    const result = await statusTool.execute(
      "status-migration",
      { action: "migration" },
      undefined,
      undefined,
      context(cwd),
    );
    const report = JSON.parse(result.content[0].text);

    assert.equal(report.action, "migration");
    assert.equal(report.migration.applied, false);
    assert.equal(report.migration.requiresConfirmation, true);
    assert.ok(
      report.migration.recommendations.some((recommendation) => recommendation.path === "outputRouter.postToolRouting"),
    );
    assert.ok(report.migration.recommendations.some((recommendation) => recommendation.path === "capture"));
    assert.ok(report.migration.recommendations.some((recommendation) => recommendation.path === "providers"));
    assert.equal(await readFile(configPath, "utf8"), configText);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi outputRouter.enabled=false suppresses router context and native safety net", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-router-disabled-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: {
          enabled: false,
          postToolRouting: "safety-net",
          largeOutputLines: 1,
          largeOutputBytes: 1,
        },
      }),
      "utf8",
    );

    const { handlers } = loadExtension();
    const beforeAgentStart = handlers.get("before_agent_start");
    const result = await beforeAgentStart({ systemPrompt: "base prompt" }, context(cwd));
    assert.doesNotMatch(result.systemPrompt, /## Loaded Output Router Skill/);

    const toolResult = await handlers.get("tool_result")(
      {
        type: "tool_result",
        toolName: "read",
        toolCallId: "read-router-disabled",
        input: { path: "large.txt" },
        content: [{ type: "text", text: "line 1\nline 2" }],
        details: undefined,
        isError: false,
      },
      context(cwd),
    );
    assert.equal(toolResult, undefined);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi output-router context mentions native safety net only when config enables it", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-config-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: { enabled: true, postToolRouting: "safety-net" },
      }),
      "utf8",
    );

    const { handlers } = loadExtension();
    const beforeAgentStart = handlers.get("before_agent_start");
    const result = await beforeAgentStart({ systemPrompt: "base prompt" }, context(cwd));

    assert.match(result.systemPrompt, /large native read\/bash outputs may be vaulted/);
    assert.match(result.systemPrompt, /## Loaded Output Router Skill/);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Output Router Safety Policy/);
    assert.match(result.systemPrompt, /freeflow_search/);
    assert.match(result.systemPrompt, /freeflow_search action=transform/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_search renders compact and expanded routed evidence UI", () => {
  const { tools } = loadExtension();
  const searchTool = tools.find((tool) => tool.name === "freeflow_search");
  assert.ok(searchTool);
  assert.ok(searchTool.parameters.properties.action.enum.includes("get"));

  const call = renderText(
    searchTool.renderCall(
      {
        action: "query",
        source: {
          kind: "repo",
          path: "docs/codex-cli-agent-harness/passes/2026-06-12-pass-3-sandboxing-and-permissions.md",
        },
        query: "SandboxPermissions Plain-language meaning",
      },
      testTheme,
    ),
    200,
  );
  assert.match(call, /freeflow_search query repo/);
  assert.match(call, /SandboxPermissions/);

  const toolResult = {
    content: [{ type: "text", text: "raw json should not be the visible UI" }],
    details: {
      result: {
        toolStatus: "ok",
        decisionId: "ffdec_test",
        preserve: "important",
        source: { kind: "repo", path: "docs/example.md" },
        routing: {
          status: "routed",
          route: "search",
          reason: "Deterministic test route.",
        },
        evidence: [
          {
            id: "ev_test",
            source: { kind: "repo", path: "docs/example.md" },
            path: "docs/example.md",
            lines: "523-527",
            excerpt: "### Sandbox Permissions\n\n`SandboxPermissions` is a per-command request shape.",
            why: "Matched exact heading and identifier.",
            window: "small",
            expandable: true,
          },
        ],
        recovery: {
          how: "Use freeflow_search action=expand with evidenceId=ev_test.",
          evidenceId: "ev_test",
        },
      },
    },
  };

  const collapsed = renderText(searchTool.renderResult(toolResult, { expanded: false }, testTheme));
  assert.match(collapsed, /1 evidence packet/);
  assert.match(collapsed, /docs\/example\.md:523-527/);
  assert.match(collapsed, /ctrl\+o to expand/);
  assert.doesNotMatch(collapsed, /raw json/);

  const expanded = renderText(searchTool.renderResult(toolResult, { expanded: true }, testTheme));
  assert.match(expanded, /Source/);
  assert.match(expanded, /preserve: important/);
  assert.match(expanded, /Storage/);
  assert.match(expanded, /decisionId: ffdec_test/);
  assert.match(expanded, /Evidence/);
  assert.match(expanded, /evidenceId: ev_test/);
  assert.match(expanded, /source: repo docs\/example\.md/);
  assert.match(expanded, /expandable: true/);
  assert.match(expanded, /exact search: action=retrieve source.kind=repo lineRange=523-527 path=docs\/example\.md/);
  assert.match(expanded, /### Sandbox Permissions/);
  assert.match(expanded, /Recovery/);
  assert.match(expanded, /expand hint: freeflow_search action=expand evidenceId=ev_test/);
});

test("Pi freeflow_run exposes declarative filter schema", () => {
  const { tools } = loadExtension();
  const runTool = tools.find((tool) => tool.name === "freeflow_run");
  assert.ok(runTool);

  assert.deepEqual(runTool.parameters.oneOf, [{ required: ["command"] }, { required: ["script"] }]);

  const script = runTool.parameters.properties.script;
  assert.equal(script.type, "object");
  assert.equal(script.additionalProperties, false);
  assert.deepEqual(script.properties.language.enum, ["javascript", "python", "jq"]);
  assert.equal(script.properties.code.minLength, 1);
  assert.equal(script.properties.limits.properties.timeoutMs.maximum, 30000);
  assert.deepEqual(script.required, ["language", "code"]);

  const filters = runTool.parameters.properties.filters;
  assert.equal(filters.type, "object");
  assert.equal(filters.additionalProperties, false);
  assert.deepEqual(filters.properties.stream.enum, ["stdout", "stderr", "combined"]);
  assert.equal(filters.properties.include.items.minLength, 1);
  assert.equal(filters.properties.exclude.items.minLength, 1);
  assert.match(filters.properties.flags.pattern, /gimsu/);
  assert.equal(filters.properties.head.minimum, 1);
  assert.equal(filters.properties.tail.minimum, 1);
  assert.equal(filters.properties.maxLines.minimum, 1);
  assert.equal(filters.properties.maxBytes.minimum, 1);

  const scriptFilter = runTool.parameters.properties.scriptFilter;
  assert.equal(scriptFilter.type, "object");
  assert.equal(scriptFilter.additionalProperties, false);
  assert.deepEqual(scriptFilter.properties.language.enum, ["javascript", "python", "jq"]);
  assert.equal(scriptFilter.properties.code.minLength, 1);
  assert.equal(scriptFilter.properties.limits.properties.timeoutMs.maximum, 30000);
  assert.deepEqual(scriptFilter.required, ["language", "code"]);
});

test("Pi freeflow_run renders compact and expanded status, evidence, and vault UI", () => {
  const { tools } = loadExtension();
  const runTool = tools.find((tool) => tool.name === "freeflow_run");
  assert.ok(runTool);

  const call = renderText(runTool.renderCall({ command: "npm test -- --runInBand", preserve: "important" }, testTheme));
  assert.match(call, /freeflow_run \$ npm test/);
  assert.match(call, /preserve=important/);

  const toolResult = {
    content: [{ type: "text", text: "raw json should not be the visible UI" }],
    details: {
      result: {
        toolStatus: "ok",
        decisionId: "ffdec_run_test",
        preserve: "important",
        outputId: "ffout_test123",
        recordId: "ffrec_test123",
        execution: { status: "failed", exitCode: 1, durationMs: 842 },
        routing: {
          status: "routed",
          route: "run",
          reason: "Command failed; exact failure evidence was returned and raw output was vaulted before routing.",
        },
        summary: "Command failed with exitCode=1.",
        parser: {
          name: "test-runner",
          confidence: 0.92,
          fidelity: "exact",
          compressed: true,
          counts: { testsFailed: 1 },
        },
        persistence: {
          status: "vaulted",
          recoverability: "exact",
          recoveryOutputId: "ffout_test123",
        },
        filters: {
          stream: "stderr",
          include: ["AssertionError"],
          sourceLines: 2,
          selectedLines: 1,
        },
        scriptFilter: {
          status: "success",
          language: "javascript",
          label: "failures-only",
          rawOutputId: "ffout_test123",
          sourceAliases: ["stdout", "stderr", "combined"],
          outputId: "ffout_script123",
          operation: {
            kind: "script",
            language: "javascript",
            codeSha256: "sha256_abc",
          },
        },
        importantLines: [
          {
            stream: "stderr",
            lines: "14-16",
            excerpt: "AssertionError: expected false to equal true\nSTACK_BENCH_MARKER exact failure line",
          },
        ],
        recovery: {
          how: "Use freeflow_search with source.kind=vault and outputId=ffout_test123 to recover exact command output.",
          outputId: "ffout_test123",
        },
      },
    },
  };

  const collapsed = renderText(runTool.renderResult(toolResult, { expanded: false }, testTheme));
  assert.match(collapsed, /execution: failed/);
  assert.match(collapsed, /routing: routed/);
  assert.match(collapsed, /ffout_test123/);
  assert.match(collapsed, /ffout_script123/);
  assert.match(collapsed, /parser test-runner 0\.92/);
  assert.match(collapsed, /raw and script output recoverable from vault/);
  assert.match(collapsed, /ctrl\+o to expand/);
  assert.doesNotMatch(collapsed, /raw json/);

  const expanded = renderText(
    runTool.renderResult(toolResult, { expanded: true }, testTheme, {
      args: { command: "npm test -- --runInBand" },
    }),
  );
  assert.match(expanded, /Status/);
  assert.match(expanded, /execution.status: failed/);
  assert.match(expanded, /Storage/);
  assert.match(expanded, /decisionId: ffdec_run_test/);
  assert.match(expanded, /recordId: ffrec_test123/);
  assert.match(expanded, /persistence: vaulted \/ exact/);
  assert.match(expanded, /Filters/);
  assert.match(expanded, /stream=stderr/);
  assert.match(expanded, /include=AssertionError/);
  assert.match(expanded, /selected=1\/2/);
  assert.match(expanded, /Script filter/);
  assert.match(expanded, /javascript:success/);
  assert.match(expanded, /rawOutputId: ffout_test123/);
  assert.match(expanded, /sources: stdout, stderr, combined/);
  assert.match(expanded, /sha256_abc/);
  assert.match(expanded, /Parser/);
  assert.match(expanded, /confidence: 0\.92/);
  assert.match(expanded, /counts:.*testsFailed/);
  assert.match(expanded, /Evidence/);
  assert.match(expanded, /AssertionError/);
  assert.match(expanded, /Vault recovery/);
  assert.match(expanded, /source.kind=vault/);
  assert.match(
    expanded,
    /exact search: action=retrieve source.kind=vault lineRange=14-16 stream=raw outputId=ffout_script123/,
  );
  assert.match(expanded, /raw command starting point: freeflow_search source.kind=vault outputId=ffout_test123/);
  assert.match(expanded, /details\.result/);
});

test("Pi freeflow_run returns compact model-visible text with full structured details", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-run-compact-text-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: { enabled: true },
      }),
      "utf8",
    );
    const tools = [];
    const pi = {
      registerTool(tool) {
        tools.push(tool);
      },
      registerCommand() {},
      on() {},
      appendEntry() {},
      sendUserMessage() {},
      async exec() {
        return {
          stdout: "Tests:       1 failed, 24 passed, 25 total\n",
          stderr: "AssertionError: expected false to equal true\nSTACK_BENCH_MARKER exact failure line\n",
          code: 1,
          killed: false,
        };
      },
    };
    freeflowExtension(pi);
    const runTool = tools.find((tool) => tool.name === "freeflow_run");
    assert.ok(runTool);

    const result = await runTool.execute(
      "tool-call",
      { command: "npm test", goal: "verification" },
      undefined,
      undefined,
      context(cwd),
    );

    const visibleText = result.content[0].text;
    const detailsText = JSON.stringify(result.details.result, null, 2);

    assert.match(visibleText, /freeflow_run\|failed/);
    assert.match(visibleText, /exit=1/);
    assert.match(visibleText, /raw=ffout_/);
    assert.match(visibleText, /STACK_BENCH_MARKER exact failure line/);
    assert.match(visibleText, /rec\|vault\|ffout_[^|]+\|stderr\|1-3/);
    assert.match(visibleText, /details\.result/);
    assert.doesNotMatch(visibleText, /^\s*\{/);
    assert.ok(Buffer.byteLength(visibleText, "utf8") < Buffer.byteLength(detailsText, "utf8"));
    assert.ok(Buffer.byteLength(visibleText, "utf8") < 900);

    assert.equal(result.details.result.toolStatus, "ok");
    assert.equal(result.details.result.execution.status, "failed");
    assert.equal(result.details.result.execution.exitCode, 1);
    assert.ok(result.details.result.recovery.outputId.startsWith("ffout_"));
    assert.ok(Array.isArray(result.details.result.importantLines));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_run forwards script producer and does not call host exec when sandbox is disabled", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-run-script-producer-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: { enabled: true },
      }),
      "utf8",
    );
    let execCalls = 0;
    const tools = [];
    const pi = {
      registerTool(tool) {
        tools.push(tool);
      },
      registerCommand() {},
      on() {},
      appendEntry() {},
      sendUserMessage() {},
      async exec() {
        execCalls += 1;
        throw new Error("host exec should not be called for sandboxed script producers");
      },
    };
    freeflowExtension(pi);
    const runTool = tools.find((tool) => tool.name === "freeflow_run");
    assert.ok(runTool);

    const result = await runTool.execute(
      "tool-call-script-producer",
      {
        script: {
          language: "javascript",
          code: "RAW_PI_SCRIPT",
          label: "pi-script",
        },
      },
      undefined,
      undefined,
      context(cwd),
    );

    assert.equal(execCalls, 0);
    assert.match(result.content[0].text, /freeflow_run\|failed/);
    assert.equal(result.details.result.toolStatus, "error");
    assert.equal(result.details.result.producer.kind, "script");
    assert.equal(result.details.result.producer.name, "pi-script");
    assert.equal(result.details.result.failure.kind, "script_transform_disabled");
    assert.equal(result.details.result.scriptProducer.status, "unavailable");
    assert.doesNotMatch(JSON.stringify(result), /RAW_PI_SCRIPT/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_batch returns compact summary and preserves child details", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-batch-compact-text-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: { enabled: true, vaultRoot: join(cwd, "vault") },
      }),
      "utf8",
    );

    const tools = [];
    const pi = {
      registerTool(tool) {
        tools.push(tool);
      },
      registerCommand() {},
      on() {},
      appendEntry() {},
      sendUserMessage() {},
      async exec(_bin, args) {
        const command = args?.[1] ?? "unknown";
        const prefix = command.includes("one") ? "ONE" : "TWO";
        return {
          stdout:
            Array.from({ length: 20 }, (_, index) => `${prefix}_VISIBLE_BATCH_SENTINEL_${index + 1}`).join("\n") + "\n",
          stderr: "",
          code: 0,
          killed: false,
        };
      },
    };
    freeflowExtension(pi);
    const runTool = tools.find((tool) => tool.name === "freeflow_run");
    const batchTool = tools.find((tool) => tool.name === "freeflow_batch");
    assert.ok(runTool);
    assert.ok(batchTool);

    const batchCtx = context(cwd);
    batchCtx.sessionManager.getSessionId = () => "batch-compact";
    const batch = await batchTool.execute(
      "batch-call",
      {
        steps: [
          { id: "one", kind: "run", input: { command: "fixture one" } },
          { id: "two", kind: "run", input: { command: "fixture two" } },
        ],
      },
      undefined,
      undefined,
      batchCtx,
    );

    const separateCtx = context(cwd);
    separateCtx.sessionManager.getSessionId = () => "batch-separate";
    const separateOne = await runTool.execute("run-one", { command: "fixture one" }, undefined, undefined, separateCtx);
    const separateTwo = await runTool.execute("run-two", { command: "fixture two" }, undefined, undefined, separateCtx);
    const separateVisible = `${separateOne.content[0].text}\n${separateTwo.content[0].text}`;
    const visibleText = batch.content[0].text;

    assert.match(visibleText, /freeflow_batch\|routed/);
    assert.match(visibleText, /steps=2/);
    assert.match(visibleText, /details\.result\.steps/);
    assert.doesNotMatch(visibleText, /^\s*\{/);
    assert.doesNotMatch(visibleText, /VISIBLE_BATCH_SENTINEL/);
    assert.ok(Buffer.byteLength(visibleText, "utf8") < Buffer.byteLength(separateVisible, "utf8"));

    const payload = batch.details.result;
    assert.equal(payload.stepCount, 2);
    assert.equal(payload.okCount, 2);
    assert.equal(payload.failedCount, 0);
    assert.equal(payload.steps[0].result.importantLines[0].excerpt.includes("ONE_VISIBLE_BATCH_SENTINEL_1"), true);
    assert.equal(payload.steps[1].result.importantLines[0].excerpt.includes("TWO_VISIBLE_BATCH_SENTINEL_1"), true);

    const expanded = renderText(batchTool.renderResult(batch, { expanded: true }, testTheme));
    assert.match(expanded, /Steps/);
    assert.match(expanded, /#1 one/);
    assert.match(expanded, /#2 two/);
    assert.match(expanded, /details\.result\.steps/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_batch accepts queries and renders compact answers", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-batch-query-text-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: { enabled: true, vaultRoot: join(cwd, "vault") },
      }),
      "utf8",
    );

    const tools = [];
    const pi = {
      registerTool(tool) {
        tools.push(tool);
      },
      registerCommand() {},
      on() {},
      appendEntry() {},
      sendUserMessage() {},
      async exec() {
        return {
          stdout: "query answer source\nBATCH_QUERY_VISIBLE_FACT_99\n",
          stderr: "",
          code: 0,
          killed: false,
        };
      },
    };
    freeflowExtension(pi);
    const batchTool = tools.find((tool) => tool.name === "freeflow_batch");
    assert.ok(batchTool);
    assert.ok(batchTool.parameters.properties.queries);

    const batchCtx = context(cwd);
    batchCtx.sessionManager.getSessionId = () => "batch-query-render";
    const batch = await batchTool.execute(
      "batch-query-call",
      {
        queries: ["BATCH_QUERY_VISIBLE_FACT_99"],
        steps: [
          {
            id: "fact",
            kind: "run",
            input: { command: "fixture fact", preserve: "full" },
          },
        ],
      },
      undefined,
      undefined,
      batchCtx,
    );

    const visibleText = batch.content[0].text;
    assert.match(visibleText, /q\|answered\|BATCH_QUERY_VISIBLE_FACT_99/);
    assert.match(visibleText, /BATCH_QUERY_VISIBLE_FACT_99/);
    assert.equal(batch.details.result.queries[0].status, "answered");

    const expanded = renderText(batchTool.renderResult(batch, { expanded: true }, testTheme));
    assert.match(expanded, /Query answers/);
    assert.match(expanded, /BATCH_QUERY_VISIBLE_FACT_99/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_run uses outputRouter thresholds and vault root from repo config", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-run-config-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: {
          enabled: true,
          largeOutputLines: 1,
          largeOutputBytes: 10_000,
          vaultRoot: join(cwd, "vault"),
        },
      }),
      "utf8",
    );

    const tools = [];
    const pi = {
      registerTool(tool) {
        tools.push(tool);
      },
      registerCommand() {},
      on() {},
      appendEntry() {},
      sendUserMessage() {},
      async exec() {
        return { stdout: "one\ntwo\n", stderr: "", code: 0, killed: false };
      },
    };
    freeflowExtension(pi);
    const runTool = tools.find((tool) => tool.name === "freeflow_run");
    assert.ok(runTool);

    const result = await runTool.execute("tool-call", { command: "fixture" }, undefined, undefined, context(cwd));
    const visibleText = result.content[0].text;
    const payload = result.details.result;

    assert.match(visibleText, /freeflow_run\|success/);
    assert.match(visibleText, /route=partial/);
    assert.match(visibleText, /raw=ffout_/);
    assert.doesNotMatch(visibleText, /^\s*\{/);
    assert.equal(payload.toolStatus, "ok");
    assert.equal(payload.routing.status, "partial");
    assert.ok(payload.recovery.outputId.startsWith("ffout_"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_search applies configured generated path hints", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-generated-path-hints-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await mkdir(join(cwd, "custom-generated"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: {
          enabled: true,
          generatedPaths: ["custom-generated/**"],
        },
      }),
      "utf8",
    );
    await writeFile(join(cwd, "target.md"), "PI_GENERATED_HINT_MARKER source truth", "utf8");
    await writeFile(
      join(cwd, "custom-generated", "decoy.md"),
      `${"PI_GENERATED_HINT_MARKER source truth ".repeat(1000)}pihintsentinel`,
      "utf8",
    );

    const { tools } = loadExtension();
    const searchTool = tools.find((tool) => tool.name === "freeflow_search");
    assert.ok(searchTool);

    const broad = await searchTool.execute(
      "search-generated-hints",
      {
        action: "query",
        source: { kind: "repo" },
        query: "PI_GENERATED_HINT_MARKER source truth",
      },
      undefined,
      undefined,
      context(cwd),
    );
    const broadVisible = broad.content[0].text;
    const broadPayload = broad.details.result;
    assert.match(broadVisible, /freeflow_search\|routed/);
    assert.doesNotMatch(broadVisible, /^\s*\{/);
    assert.ok(
      Buffer.byteLength(broadVisible, "utf8") < Buffer.byteLength(JSON.stringify(broadPayload, null, 2), "utf8"),
    );
    assert.equal(broadPayload.evidence[0].path, "target.md");
    assert.doesNotMatch(broadPayload.evidence[0].excerpt, /pihintsentinel/);

    const explicit = await searchTool.execute(
      "search-generated-explicit",
      {
        action: "query",
        source: { kind: "repo", path: "custom-generated/decoy.md" },
        query: "pihintsentinel",
      },
      undefined,
      undefined,
      context(cwd),
    );
    const explicitPayload = explicit.details.result;
    assert.equal(explicitPayload.evidence[0].path, "custom-generated/decoy.md");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_search supports vault-wide query without outputId", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-vault-wide-query-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    const vaultRoot = join(cwd, "vault");
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: { enabled: true, vaultRoot },
      }),
      "utf8",
    );

    const sessionId = "pi-vault-wide-query-session";
    const stored = await storeTextOutput(createVault({ root: vaultRoot }), {
      sessionId,
      sourceKind: "mcp",
      raw: "PI_VAULT_WIDE_TARGET through registered Pi tool",
      producer: { kind: "mcp", server: "github", tool: "search_issues" },
      createdAt: "2026-06-16T00:00:00.000Z",
    });

    const { tools } = loadExtension();
    const searchTool = tools.find((tool) => tool.name === "freeflow_search");
    assert.ok(searchTool);
    const ctx = context(cwd);
    ctx.sessionManager.getSessionId = () => sessionId;

    const result = await searchTool.execute(
      "search-vault-wide-query",
      {
        action: "query",
        source: { kind: "vault" },
        query: "PI_VAULT_WIDE_TARGET",
        filters: { producerKind: "mcp", server: "github" },
      },
      undefined,
      undefined,
      ctx,
    );
    const visibleText = result.content[0].text;
    const payload = result.details.result;
    assert.match(visibleText, /freeflow_search\|routed/);
    assert.match(visibleText, /PI_VAULT_WIDE_TARGET/);
    assert.doesNotMatch(visibleText, /^\s*\{/);
    assert.equal(payload.toolStatus, "ok");
    assert.equal(payload.evidence[0].source.outputId, stored.outputId);
    assert.equal(payload.evidence[0].source.stream, "raw");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi reports invalid outputRouter config warnings", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-invalid-config-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: { postToolRouting: "always" },
      }),
      "utf8",
    );

    const { handlers } = loadExtension();
    const notifications = [];
    const ctx = context(cwd);
    ctx.ui.notify = (message, level) => notifications.push({ message, level });
    await handlers.get("session_start")({}, ctx);

    assert.equal(notifications[0].level, "warning");
    assert.match(notifications[0].message, /postToolRouting/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi observed routing vaults and labels configured MCP output before native safety net", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-observed-mcp-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: {
          enabled: true,
          vaultRoot: join(cwd, "vault"),
          observedRouting: {
            enabled: true,
            mcp: {
              servers: { github: { enabled: true, persistence: "exact" } },
            },
          },
        },
      }),
      "utf8",
    );

    const { handlers } = loadExtension();
    const toolResult = handlers.get("tool_result");
    const result = await toolResult(
      {
        type: "tool_result",
        toolName: "mcp",
        toolCallId: "mcp-1",
        input: { server: "github", tool: "search_issues" },
        content: [
          {
            type: "text",
            text: JSON.stringify({
              items: [
                {
                  id: 1,
                  title: "Alpha",
                  html_url: "https://github.com/acme/repo/issues/1",
                  body: "x".repeat(500),
                },
                {
                  id: 2,
                  title: "Beta",
                  html_url: "https://github.com/acme/repo/issues/2",
                  body: "y".repeat(500),
                },
                {
                  id: 3,
                  title: "Gamma",
                  html_url: "https://github.com/acme/repo/issues/3",
                  body: "z".repeat(500),
                },
                {
                  id: 4,
                  title: "Delta",
                  html_url: "https://github.com/acme/repo/issues/4",
                  body: "w".repeat(500),
                },
              ],
            }),
          },
        ],
        details: undefined,
        isError: false,
      },
      context(cwd),
    );

    assert.ok(result);
    assert.match(result.content[0].text, /Freeflow routed this observed mcp result/);
    assert.match(result.content[0].text, /outputId=ffout_/);
    assert.match(result.content[0].text, /Alpha/);
    assert.match(result.content[0].text, /https:\/\/github\.com\/acme\/repo\/issues\/1/);
    assert.doesNotMatch(result.content[0].text, /xxxxxxxxxxxxxxxx/);
    assert.equal(result.details.freeflowObservedRouting.route, "observed");
    assert.equal(result.details.freeflowObservedRouting.producer.server, "github");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi observed routing leaves disabled MCP producer result unchanged", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-observed-disabled-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: {
          enabled: true,
          observedRouting: {
            enabled: true,
            mcp: { servers: { github: { enabled: false } } },
          },
        },
      }),
      "utf8",
    );

    const { handlers } = loadExtension();
    const result = await handlers.get("tool_result")(
      {
        type: "tool_result",
        toolName: "mcp",
        toolCallId: "mcp-disabled",
        input: { server: "github", tool: "search_issues" },
        content: [{ type: "text", text: "unchanged" }],
        details: undefined,
        isError: false,
      },
      context(cwd),
    );

    assert.equal(result, undefined);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi observed routing fails open without losing MCP output", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-observed-fail-open-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    const fileVault = join(cwd, "vault-file");
    await writeFile(fileVault, "not a directory", "utf8");
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: {
          enabled: true,
          vaultRoot: fileVault,
          observedRouting: {
            enabled: true,
            mcp: {
              servers: { github: { enabled: true, persistence: "exact" } },
            },
          },
        },
      }),
      "utf8",
    );

    const { handlers } = loadExtension();
    const result = await handlers.get("tool_result")(
      {
        type: "tool_result",
        toolName: "mcp",
        toolCallId: "mcp-fail-open",
        input: { server: "github", tool: "search_issues" },
        content: [{ type: "text", text: "original mcp output survives" }],
        details: undefined,
        isError: false,
      },
      context(cwd),
    );

    assert.ok(result);
    assert.match(result.content[0].text, /Freeflow observed-routing warning/);
    assert.match(result.content[0].text, /original mcp output survives/);
    assert.equal(result.details.freeflowObservedRouting.routingStatus, "failed");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi post-tool safety net passes native output unchanged when config is off", async () => {
  const { handlers } = loadExtension();
  const toolResult = handlers.get("tool_result");
  assert.ok(toolResult);

  const raw = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join("\n");
  const result = await toolResult(
    {
      type: "tool_result",
      toolName: "read",
      toolCallId: "read-1",
      input: { path: "large.txt" },
      content: [{ type: "text", text: raw }],
      details: undefined,
      isError: false,
    },
    context(),
  );

  assert.equal(result, undefined);
});

test("Pi post-tool safety net vaults and labels large native bash output when enabled", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-safety-net-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: {
          enabled: true,
          postToolRouting: "safety-net",
          largeOutputLines: 3,
          largeOutputBytes: 100_000,
          vaultRoot: join(cwd, "vault"),
        },
      }),
      "utf8",
    );

    const { handlers, tools } = loadExtension();
    const toolResult = handlers.get("tool_result");
    const raw = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join("\n");
    const result = await toolResult(
      {
        type: "tool_result",
        toolName: "bash",
        toolCallId: "bash-1",
        input: { command: "npm test" },
        content: [{ type: "text", text: raw }],
        details: undefined,
        isError: false,
      },
      context(cwd),
    );

    assert.ok(result);
    const routedText = result.content[0].text;
    assert.match(routedText, /Freeflow routed this native bash result/);
    assert.match(routedText, /outputId=ffout_/);
    assert.doesNotMatch(routedText, /line 20/);

    const outputId = routedText.match(/outputId=(ffout_[a-f0-9]+)/)?.[1];
    assert.ok(outputId);
    const searchTool = tools.find((tool) => tool.name === "freeflow_search");
    const searched = await searchTool.execute(
      "search-1",
      {
        action: "retrieve",
        source: { kind: "vault", outputId, stream: "raw" },
        lineRange: { start: 18, end: 20 },
      },
      undefined,
      undefined,
      context(cwd),
    );
    const payload = searched.details.result;
    assert.doesNotMatch(searched.content[0].text, /^\s*\{/);
    assert.equal(payload.evidence[0].excerpt, "line 18\nline 19\nline 20");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi post-tool safety net notes exact duplicate native output", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-safety-net-duplicate-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: {
          enabled: true,
          postToolRouting: "safety-net",
          largeOutputLines: 3,
          largeOutputBytes: 100_000,
          vaultRoot: join(cwd, "vault"),
        },
      }),
      "utf8",
    );

    const { handlers } = loadExtension();
    const toolResult = handlers.get("tool_result");
    const raw = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join("\n");
    const first = await toolResult(
      {
        type: "tool_result",
        toolName: "bash",
        toolCallId: "bash-duplicate-1",
        input: { command: "npm test" },
        content: [{ type: "text", text: raw }],
        details: undefined,
        isError: false,
      },
      context(cwd),
    );
    const firstOutputId = first.content[0].text.match(/outputId=(ffout_[a-f0-9]+)/)?.[1];
    assert.ok(firstOutputId);

    const second = await toolResult(
      {
        type: "tool_result",
        toolName: "bash",
        toolCallId: "bash-duplicate-2",
        input: { command: "npm test" },
        content: [{ type: "text", text: raw }],
        details: undefined,
        isError: false,
      },
      context(cwd),
    );

    assert.match(
      second.content[0].text,
      new RegExp(`Duplicate: exact native output matches previous outputId=${firstOutputId}`),
    );
    assert.equal(second.details.freeflowOutputRouter.duplicateOfOutputId, firstOutputId);
    assert.match(second.content[0].text, /current raw output was vaulted as outputId=ffout_/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi post-tool safety net leaves small native output alone when enabled", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-small-output-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: {
          enabled: true,
          postToolRouting: "safety-net",
          largeOutputLines: 100,
          largeOutputBytes: 10_000,
        },
      }),
      "utf8",
    );

    const { handlers } = loadExtension();
    const result = await handlers.get("tool_result")(
      {
        type: "tool_result",
        toolName: "bash",
        toolCallId: "bash-small",
        input: { command: "pwd" },
        content: [{ type: "text", text: "small output" }],
        details: undefined,
        isError: false,
      },
      context(cwd),
    );

    assert.equal(result, undefined);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi post-tool safety net fails open without losing native output", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-safety-fail-open-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    const blockedVaultPath = join(cwd, "vault-file");
    await writeFile(blockedVaultPath, "not a directory", "utf8");
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: {
          enabled: true,
          postToolRouting: "safety-net",
          largeOutputLines: 1,
          largeOutputBytes: 1,
          vaultRoot: blockedVaultPath,
        },
      }),
      "utf8",
    );

    const { handlers } = loadExtension();
    const raw = "line 1\nline 2";
    const result = await handlers.get("tool_result")(
      {
        type: "tool_result",
        toolName: "read",
        toolCallId: "read-fail-open",
        input: { path: "large.txt" },
        content: [{ type: "text", text: raw }],
        details: undefined,
        isError: false,
      },
      context(cwd),
    );

    assert.ok(result);
    assert.deepEqual(result.content[0], { type: "text", text: raw });
    assert.match(result.content.at(-1).text, /Freeflow safety-net warning/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi appends the interaction contract after existing project context", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-already-core-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: { enabled: true },
      }),
      "utf8",
    );
    const { handlers } = loadExtension();
    const beforeAgentStart = handlers.get("before_agent_start");

    const existingPrompt = "# Project Instructions\n\nKeep existing repo guidance.";
    const result = await beforeAgentStart({ systemPrompt: existingPrompt }, context(cwd));

    assert.match(result.systemPrompt, /^# Project Instructions/);
    assert.match(result.systemPrompt, /# Freeflow Interaction Contract/);
    assert.doesNotMatch(result.systemPrompt, /# Freeflow Runtime Kernel/);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Workflow Skill/);
    assert.doesNotMatch(result.systemPrompt, /## Discovery-light/);
    assert.match(result.systemPrompt, /## Loaded Output Router Skill/);
    assert.match(result.systemPrompt, /freeflow_search/);
    assert.match(result.systemPrompt, /freeflow_run/);
    assert.match(result.systemPrompt, /freeflow_search action=transform/);
    assert.doesNotMatch(result.systemPrompt, /## Freeflow Output Router Reminder/);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Output Router Safety Policy/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi keeps enabled capability context alongside the interaction contract", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-already-full-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: { enabled: true },
      }),
      "utf8",
    );
    const { handlers } = loadExtension();
    const beforeAgentStart = handlers.get("before_agent_start");

    const result = await beforeAgentStart({ systemPrompt: "base prompt" }, context(cwd));

    assert.match(result.systemPrompt, /# Freeflow Interaction Contract/);
    assert.doesNotMatch(result.systemPrompt, /# Freeflow Runtime Kernel/);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Workflow Skill/);
    assert.doesNotMatch(result.systemPrompt, /## Discovery-light/);
    assert.match(result.systemPrompt, /## Loaded Output Router Skill/);
    assert.match(result.systemPrompt, /Choose how evidence moves into context\./);
    assert.doesNotMatch(result.systemPrompt, /## Freeflow Output Router Reminder/);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Output Router Safety Policy/);
    assert.doesNotMatch(result.systemPrompt, /Capture raw evidence before transformation/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
