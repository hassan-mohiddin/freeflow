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
  resetSessionOverrides,
  setModeStatus,
  restoreModeOverride,
  setSessionCoreOverride,
  setSessionMode,
} from "../../dist/runtime/runtime-context.js";
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

test("Pi registers Freeflow commands without retired router tools", () => {
  const { commands, shortcuts, tools } = loadExtension();
  const commandNames = commands.map((command) => command.name);
  const toolNames = tools.map((tool) => tool.name);

  assert.ok(commandNames.includes("freeflow"));
  assert.ok(!commandNames.includes("output-router"));
  for (const command of ["discuss", "discover", "track-work", "execute-work", "execute-plan"]) {
    assert.ok(commandNames.includes(command));
  }
  assert.ok(!commandNames.includes("workflow"));
  assert.deepEqual(
    shortcuts.map(({ shortcut }) => shortcut),
    ["ctrl+shift+r", "ctrl+shift+a"],
  );
  assert.ok(toolNames.includes("freeflow_context"));
  assert.deepEqual(tools.find((tool) => tool.name === "freeflow_context").parameters.oneOf, []);
  assert.ok(toolNames.includes("freeflow_switch_profile"));
  assert.ok(
    !toolNames.some((name) => ["freeflow_status", "freeflow_search", "freeflow_run", "freeflow_batch"].includes(name)),
  );
  assert.ok(!toolNames.includes("freeflow_retrieve"));
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
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\u001b[B");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      await component.waitForWrites();
      assert.doesNotMatch(renderText(component), /Cognitive Routing\s+enabled \(3\) configured · inactive/);
      for (let index = 0; index < 5; index += 1) component.handleInput("\u001b[B");
      component.handleInput("\r");
      const cognitiveText = renderText(component);
      assert.match(cognitiveText, /Freeflow Settings · Personal overrides › Cognitive Routing/);
      assert.match(cognitiveText, /Enabled\s+enabled \(local · inactive\)/);
      assert.match(cognitiveText, /Standard preset\s+test\/standard · high \(local · inactive\)/);
      assert.match(cognitiveText, /Reasoning preset\s+test\/reasoning · max \(local · inactive\)/);
      component.handleInput("\r");
      assert.match(renderText(component), /Freeflow Settings · Personal overrides › Cognitive Routing/);
      assert.doesNotMatch(renderText(component), /Inherit repository/);
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
      cognitiveRouting: { enabled: true, effective: true, blockingReason: { code: "disabled" } },
    },
    { effective: true, activeProfile: "reasoning", controlMode: "automatic" },
  );
  assert.equal(ctx.statuses.at(-1).value, "freeflow: interaction · workflow · reasoning · automatic");
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
      cognitiveRouting: { enabled: true, effective: true, blockingReason: null },
    },
    undefined,
    { cognitiveRoutingStartupPending: true },
  );
  assert.equal(ctx.statuses.at(-1).value, "freeflow: interaction · workflow · standard · pending");
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
      cognitiveRouting: { enabled: true, effective: true, blockingReason: null },
    },
    { effective: false, activeProfile: "standard", controlMode: "automatic" },
    { cognitiveRoutingStartupPending: true },
  );
  assert.equal(ctx.statuses.at(-1).value, "freeflow: interaction · workflow · cognitive blocked · runtime_inactive");
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
      cognitiveRouting: { enabled: true, effective: true, blockingReason: null },
    },
    undefined,
    { cognitiveRoutingStartupPending: true },
  );
  assert.equal(ctx.statuses.at(-1).value, "freeflow: interaction · workflow · cognitive blocked · runtime_inactive");
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
    assert.equal(ctx.statuses.at(-1).value, "freeflow: interaction · workflow · standard · pending");
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

test("Pi describes Freeflow argument completions", () => {
  const { commands } = loadExtension();
  const freeflowCommand = commands.find((command) => command.name === "freeflow");
  assert.ok(freeflowCommand);

  assert.deepEqual(freeflowCommand.definition.getArgumentCompletions(""), [
    { value: "settings", label: "settings", description: "Open personal override settings" },
    { value: "status", label: "status", description: "Show effective Freeflow state" },
    { value: "context", label: "context", description: "Inspect Freeflow Context" },
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
    {
      value: "profile history",
      label: "history",
      description: "Show Cognitive Routing transition history",
    },
    {
      value: "profile history active",
      label: "history active",
      description: "Show current-branch Cognitive Routing history",
    },
    {
      value: "profile history anomalies",
      label: "history anomalies",
      description: "Show Cognitive Routing history anomalies",
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
    { value: "context status", label: "status", description: "Show Freeflow Context state" },
    { value: "context list", label: "list", description: "List archived context projections" },
    { value: "context restore", label: "restore", description: "Restore one or more context references" },
    { value: "context reset all", label: "reset all", description: "Reset projection decisions on the active branch" },
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
    assert.equal(skillNames.length, 26);
    for (const skill of ["action-selection", "discuss", "execute-work", "track-work"]) {
      assert.ok(skillNames.includes(skill));
    }
    assert.ok(!skillNames.includes("output-router"));
    assert.ok(!skillNames.includes("discover"));
    assert.ok(!skillNames.includes("execute-plan"));
    await Promise.all(resources.skillPaths.map((path) => readFile(path, "utf8")));

    for (const [commandName, expectedSkill] of [
      ["action-selection", "action-selection"],
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
    const { handlers } = loadExtension();
    const resourcesDiscover = handlers.get("resources_discover");
    const beforeAgentStart = handlers.get("before_agent_start");
    assert.ok(resourcesDiscover);
    assert.ok(beforeAgentStart);

    const resources = await resourcesDiscover({ cwd }, context(cwd));
    assert.equal(resources.skillPaths.length, 1);
    assert.match(resources.skillPaths[0], /setup-freeflow\/SKILL\.md$/);

    const result = await beforeAgentStart({ systemPrompt: "base prompt" }, context(cwd));
    assert.equal(result.systemPrompt, "base prompt");
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
        },
        null,
        2,
      ),
      "utf8",
    );

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
      conversationHistory: false,
      skills: { enabled: false },
      defaultMode: "strict-workflow",
    });
    assert.deepEqual(layers.sources, {
      enabled: "local",
      interactionContract: "repository",
      contextVirtualization: "builtin",
      conversationHistory: "builtin",
      skillsEnabled: "local",
      defaultMode: "local",
    });
    assert.equal(layers.local.parsed.processing.unsafeUnsandboxed.enabled, true);

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
    assert.match(result.systemPrompt, /Use the latest extension-generated Freeflow Runtime State/);
    assert.doesNotMatch(result.systemPrompt, /Repository default mode:/);
    assert.doesNotMatch(result.systemPrompt, /Configured default mode:/);
    assert.doesNotMatch(result.systemPrompt, /Effective Freeflow mode:/);
    assert.match(
      result.systemPrompt,
      /Task type, skill selection, direct skill calls, usefulness, or new evidence does not change it/,
    );
    assert.doesNotMatch(result.systemPrompt, /## Strict Workflow Overlay/);
    assert.doesNotMatch(result.systemPrompt, /security, privacy, billing, data loss, migrations, public interfaces/);
    assert.doesNotMatch(result.systemPrompt, /## Conversation Mode Boundary/);
    const providerContext = await handlers.get("context")({ messages: [] }, context(cwd));
    assert.match(providerContext.messages.at(-1).content, /Default mode: `strict-workflow`/);
    assert.match(providerContext.messages.at(-1).content, /Active mode: `strict-workflow`/);

    await freeflowCommand.definition.handler("mode conversation", context(cwd));
    result = await beforeAgentStart({ systemPrompt: "base prompt" }, context(cwd));
    assert.doesNotMatch(result.systemPrompt, /Session mode override:/);
    assert.doesNotMatch(result.systemPrompt, /Resolved mode:/);
    assert.doesNotMatch(result.systemPrompt, /Effective Freeflow mode:/);
    assert.doesNotMatch(result.systemPrompt, /## Conversation Mode Boundary/);
    assert.doesNotMatch(result.systemPrompt, /Do not call write, edit, or mutating tools/);
    assert.doesNotMatch(result.systemPrompt, /an execution skill does not override this boundary/);
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
    assert.doesNotMatch(result.systemPrompt, /## Conversation Mode Boundary/);
    assert.doesNotMatch(result.systemPrompt, /Session mode override:/);
    assert.doesNotMatch(result.systemPrompt, /Resolved mode:/);
    assert.doesNotMatch(result.systemPrompt, /Effective Freeflow mode:/);
    let providerContext = await handlers.get("context")({ messages: [] }, ctx);
    assert.match(providerContext.messages.at(-1).content, /Default mode: `strict-workflow`/);
    assert.match(providerContext.messages.at(-1).content, /Active mode: `conversation`/);

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
    assert.doesNotMatch(result.systemPrompt, /Session mode override:/);
    assert.doesNotMatch(result.systemPrompt, /Resolved mode:/);
    assert.doesNotMatch(result.systemPrompt, /Effective Freeflow mode:/);
    providerContext = await handlers.get("context")({ messages: [] }, ctx);
    assert.match(providerContext.messages.at(-1).content, /Default mode: `strict-workflow`/);
    assert.match(providerContext.messages.at(-1).content, /Active mode: `inactive`/);
    assert.match(providerContext.messages.at(-1).content, /Skills: inactive/);

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
    assert.match(
      result.systemPrompt,
      /Task type, skill selection, direct skill calls, usefulness, or new evidence does not change it/,
    );
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
    assert.doesNotMatch(result.systemPrompt, /Session mode override:/);
    assert.doesNotMatch(result.systemPrompt, /Effective Freeflow mode:/);
    const providerContext = await handlers.get("context")({ messages: [] }, context(cwd));
    assert.match(providerContext.messages.at(-1).content, /Default mode: `strict-workflow`/);
    assert.match(providerContext.messages.at(-1).content, /Active mode: `conversation`/);
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
      conversationHistory: false,
      skills: { enabled: true },
      defaultMode: "workflow",
    });
    assert.deepEqual(layers.sources, {
      enabled: "builtin",
      interactionContract: "local",
      contextVirtualization: "builtin",
      conversationHistory: "builtin",
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
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi master Freeflow toggle disables skills and capabilities", async () => {
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
        },
        null,
        2,
      ),
      "utf8",
    );

    const { handlers } = loadExtension();
    const resources = await handlers.get("resources_discover")({ cwd }, context(cwd));
    assert.deepEqual(resources.skillPaths, []);

    const result = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, context(cwd));
    assert.equal(result.systemPrompt, "base prompt");
    assert.equal(result.message, undefined);

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

test("Pi skills toggle suppresses workflow skills without enabling retired router tools", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-skills-disabled-router-on-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify(
        {
          defaultMode: "workflow",
          skills: { enabled: false },
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
    assert.doesNotMatch(result.systemPrompt, /Repository default mode:/);
    assert.doesNotMatch(result.systemPrompt, /Personal default override:/);
    assert.doesNotMatch(result.systemPrompt, /Configured default mode:/);
    assert.doesNotMatch(result.systemPrompt, /Resolved mode:/);
    assert.doesNotMatch(result.systemPrompt, /Effective Freeflow mode:/);
    const providerContext = await handlers.get("context")({ messages: [] }, ctx);
    assert.match(providerContext.messages.at(-1).content, /Default mode: `workflow`/);
    assert.match(providerContext.messages.at(-1).content, /Active mode: `inactive`/);
    assert.match(providerContext.messages.at(-1).content, /Skills: inactive/);
    assert.doesNotMatch(result.systemPrompt, /Output Router|freeflow_(search|run|batch)/i);
    assert.equal(ctx.statuses.at(-1).value, "freeflow: interaction");
    assert.ok(!activeToolNames().includes("freeflow_context"));
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
    assert.equal(result.message, undefined);
    assert.match(result.systemPrompt, /# Freeflow Stable Guidance/);
    assert.match(result.systemPrompt, /## Shared Terms/);
    assert.doesNotMatch(result.systemPrompt, /# Freeflow Interaction Contract/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

// Regression for the "everything disabled except Freeflow control plane" state.
// The model should know Freeflow exists and can be reconfigured, but should not receive workflow behavior.
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

    assert.match(result.systemPrompt, /# Freeflow Stable Guidance/);
    assert.match(result.systemPrompt, /## Mode/);
    assert.doesNotMatch(result.systemPrompt, /## Shared Terms/);
    assert.doesNotMatch(result.systemPrompt, /# Freeflow Interaction Contract/);
    const providerContext = await handlers.get("context")({ messages: [] }, ctx);
    assert.match(providerContext.messages.at(-1).content, /Default mode: `workflow`/);
    assert.match(providerContext.messages.at(-1).content, /Active mode: `inactive`/);
    assert.match(providerContext.messages.at(-1).content, /Interaction Contract: inactive/);
    assert.match(providerContext.messages.at(-1).content, /Skills: inactive/);
    assert.doesNotMatch(result.systemPrompt, /# Freeflow Runtime Kernel/);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Mode Contract Skill/);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Workflow Skill/);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Decision Gate Skill/);
    assert.doesNotMatch(result.systemPrompt, /Output Router|freeflow_(search|run|batch)/i);
    assert.equal(ctx.statuses.at(-1).value, "freeflow: idle");
    assert.ok(!activeToolNames().includes("freeflow_context"));

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
      }),
      "freeflow: interaction",
    );
    assert.equal(
      await statusFor({
        defaultMode: "workflow",
      }),
      "freeflow: interaction · workflow",
    );

    const masterOverrideCtx = context(cwd);
    await setSessionCoreOverride("enabled", false, masterOverrideCtx, pi);
    await beforeAgentStart({ systemPrompt: "base prompt" }, masterOverrideCtx);
    assert.equal(masterOverrideCtx.statuses.at(-1).value, "freeflow: off (session)");
    await resetSessionOverrides(masterOverrideCtx, pi);

    const interactionOverrideCtx = context(cwd);
    await setSessionCoreOverride("interactionContract", false, interactionOverrideCtx, pi);
    const interactionRuntime = await beforeAgentStart({ systemPrompt: "base prompt" }, interactionOverrideCtx);
    assert.doesNotMatch(interactionRuntime.systemPrompt, /Interaction contract:/);
    const interactionProviderContext = await handlers.get("context")({ messages: [] }, interactionOverrideCtx);
    assert.match(interactionProviderContext.messages.at(-1).content, /Interaction Contract: inactive/);
    assert.equal(interactionOverrideCtx.statuses.at(-1).value, "freeflow: interaction off (session) · workflow");
    await resetSessionOverrides(interactionOverrideCtx, pi);

    const skillsOverrideCtx = context(cwd);
    await setSessionCoreOverride("skillsEnabled", false, skillsOverrideCtx, pi);
    await beforeAgentStart({ systemPrompt: "base prompt" }, skillsOverrideCtx);
    assert.equal(skillsOverrideCtx.statuses.at(-1).value, "freeflow: interaction · skills off (session)");
    await resetSessionOverrides(skillsOverrideCtx, pi);

    const modeCtx = context(cwd);
    await freeflowCommand.definition.handler("mode conversation", modeCtx);
    assert.equal(modeCtx.statuses.at(-1).value, "freeflow: interaction · conversation (session)");
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
      assert.doesNotMatch(rootText, /Output Router|Native safety net/);
      assert.match(rootText, /\[dim\]Interaction Contract/);
      assert.match(rootText, /\[dim\]Skills/);
      assert.match(rootText, /Freeflow Context/);
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
    });
    assert.equal(settingsCtx.reloads.length, 0);

    const enableCtx = context(cwd);
    await freeflowCommand.definition.handler("enable", enableCtx);
    const afterEnable = JSON.parse(await readFile(join(cwd, ".freeflow/config.json"), "utf8"));
    assert.equal(afterEnable.enabled, undefined);
    assert.equal(afterEnable.defaultMode, "workflow");
    assert.equal(afterEnable.outputRouter, undefined);
    assert.equal(enableCtx.reloads.length, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi statusline uses one umbrella context label for either enabled context feature", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-context-status-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({ contextVirtualization: true, conversationHistory: true }, null, 2),
      "utf8",
    );
    const { handlers } = loadExtension();
    const ctx = context(cwd);
    await handlers.get("session_start")({ reason: "startup" }, ctx);
    const status = ctx.statuses.at(-1).value;
    assert.match(status, /context/);
    assert.doesNotMatch(status, /context virtualization|conversation history/);
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
    await freeflowCommand.definition.handler("disable", ctx);

    assert.equal(ctx.reloads.length, 1);
    assert.equal(ctx.statuses.at(-1).value, "freeflow: off");
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
      assert.match(rootText, /Cognitive Routing\s+disabled \(3\) disabled · inactive/);
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
    assert.equal(runtime.message, undefined);
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
      assert.match(rootText, /Cognitive Routing\s+disabled \(3\) disabled/);
      assert.doesNotMatch(rootText, /Output Router/);
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

test("Pi before_agent_start does not inject retired Output Router context", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-router-default-disabled-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({ defaultMode: "workflow" }, null, 2), "utf8");

    const { handlers } = loadExtension();
    const beforeAgentStart = handlers.get("before_agent_start");
    assert.ok(beforeAgentStart);

    const result = await beforeAgentStart({ systemPrompt: "base prompt" }, context(cwd));

    assert.match(result.systemPrompt, /# Freeflow Interaction Contract/);
    assert.doesNotMatch(result.systemPrompt, /# Freeflow Runtime Kernel/);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Mode Contract Skill/);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Workflow Skill/);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Decision Gate Skill/);
    assert.doesNotMatch(result.systemPrompt, /## Discovery-light/);
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

    assert.match(result.systemPrompt, /# Freeflow Stable Guidance/);
    assert.match(result.systemPrompt, /# Freeflow Interaction Contract/);
    assert.match(result.systemPrompt, /## Shared Terms/);
    assert.match(result.systemPrompt, /## Workflow Cue/);
    assert.doesNotMatch(result.systemPrompt, /# Freeflow Runtime Kernel/);
    assert.doesNotMatch(result.systemPrompt, /## Conversation Mode Boundary/);
    assert.doesNotMatch(result.systemPrompt, /## Strict Workflow Overlay/);
    assert.match(result.systemPrompt, /Treat questions, criticism, examples, hypotheses, and tentative ideas as/);
    assert.match(result.systemPrompt, /When a turn mixes a direct question with a request or approval to/);
    assert.match(result.systemPrompt, /With a clear action request, recommend brief discussion/);
    assert.match(result.systemPrompt, /self-review/);
    assert.doesNotMatch(result.systemPrompt, /final assurance|standing authorization/i);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Mode Contract Skill/);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Workflow Skill/);
    assert.doesNotMatch(result.systemPrompt, /## Loaded Decision Gate Skill/);
    assert.doesNotMatch(result.systemPrompt, /## Discovery-light/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi exposes Workflow through discovery rather than a persistent bootstrap", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-workflow-discovery-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({ defaultMode: "workflow" }), "utf8");

    const { handlers } = loadExtension();
    const ctx = context(cwd);
    const resources = await handlers.get("resources_discover")({ cwd }, ctx);
    assert.ok(resources.skillPaths.some((path) => path.endsWith("/skills/workflow/SKILL.md")));

    const result = await handlers.get("before_agent_start")({ prompt: "hi", systemPrompt: "base prompt" }, ctx);
    assert.equal(result.message, undefined);
    assert.match(result.systemPrompt, /## Workflow Cue/);
    assert.doesNotMatch(result.systemPrompt, /^# Workflow$/m);
    assert.doesNotMatch(result.systemPrompt, /freeflow-workflow-bootstrap|Freeflow Workflow Bootstrap/);
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
    assert.deepEqual(
      disabled.messages.filter((message) => message.customType !== "freeflow-runtime-state"),
      [userMessage],
    );
    assert.equal(disabled.messages.at(-1).customType, "freeflow-runtime-state");

    await writeFile(configPath, JSON.stringify({ defaultMode: "workflow" }, null, 2), "utf8");
    const enabled = await contextHandler({ messages: [workflowMessage, userMessage] }, context(cwd));
    assert.ok(enabled);
    assert.deepEqual(
      enabled.messages.filter((message) => message.customType !== "freeflow-runtime-state"),
      [userMessage],
    );
    assert.equal(enabled.messages.at(-1).customType, "freeflow-runtime-state");
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
    assert.deepEqual(
      disabled.messages.filter((message) => message.customType !== "freeflow-runtime-state"),
      [userMessage],
    );
    assert.equal(disabled.messages.at(-1).customType, "freeflow-runtime-state");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi before_agent_start injects the Freeflow interaction contract on every turn", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-core-context-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({ defaultMode: "workflow", contextVirtualization: true, conversationHistory: true }, null, 2),
      "utf8",
    );

    const { handlers } = loadExtension();
    const beforeAgentStart = handlers.get("before_agent_start");
    assert.ok(beforeAgentStart);

    const first = await beforeAgentStart({ systemPrompt: "base prompt" }, context(cwd));
    const second = await beforeAgentStart({ systemPrompt: "base prompt" }, context(cwd));

    for (const result of [first, second]) {
      assert.match(result.systemPrompt, /# Freeflow Stable Guidance/);
      assert.match(result.systemPrompt, /## Shared Terms/);
      assert.match(result.systemPrompt, /## Context Virtualization Cue/);
      assert.match(result.systemPrompt, /## Conversation History Cue/);
      assert.match(result.systemPrompt, /# Freeflow Interaction Contract/);
      assert.doesNotMatch(result.systemPrompt, /# Freeflow Runtime Kernel/);
      assert.match(result.systemPrompt, /Treat questions, criticism, examples, hypotheses, and tentative ideas as/);
      assert.doesNotMatch(result.systemPrompt, /## Freeflow Runtime Priority/);
      assert.doesNotMatch(result.systemPrompt, /## Loaded Mode Contract Skill/);
      assert.doesNotMatch(result.systemPrompt, /## Loaded Workflow Skill/);
      assert.doesNotMatch(result.systemPrompt, /## Loaded Decision Gate Skill/);
      assert.doesNotMatch(result.systemPrompt, /## Discovery-light/);
      assert.doesNotMatch(result.systemPrompt, /Output Router|freeflow_(search|run|batch)/i);
      assert.doesNotMatch(result.systemPrompt, /## Loaded Workflow Map/);
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi separates stable Freeflow guidance from volatile provider runtime state", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-runtime-state-layering-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify(
        {
          defaultMode: "workflow",
          contextVirtualization: true,
          conversationHistory: true,
        },
        null,
        2,
      ),
      "utf8",
    );

    const { handlers } = loadExtension();
    const beforeAgentStart = handlers.get("before_agent_start");
    const contextHandler = handlers.get("context");
    const ctx = context(cwd);
    const before = await beforeAgentStart({ systemPrompt: "base prompt" }, ctx);

    assert.match(before.systemPrompt, /## Mode/);
    assert.match(before.systemPrompt, /Use the latest extension-generated Freeflow Runtime State/);
    assert.match(before.systemPrompt, /## Context Virtualization Cue/);
    assert.match(before.systemPrompt, /## Conversation History Cue/);
    assert.doesNotMatch(before.systemPrompt, /# Automatic Routing Kernel/);
    assert.doesNotMatch(before.systemPrompt, /Repository default mode:/);
    assert.doesNotMatch(before.systemPrompt, /Configured default mode:/);
    assert.doesNotMatch(before.systemPrompt, /Effective Freeflow mode:/);
    assert.doesNotMatch(before.systemPrompt, /- Interaction contract: enabled/);

    assert.equal(before.message, undefined);

    const firstContext = await contextHandler({ messages: [] }, ctx);
    assert.equal(firstContext.messages.length, 1);
    assert.equal(firstContext.messages[0].customType, "freeflow-runtime-state");
    assert.equal(
      firstContext.messages[0].content,
      [
        "# Freeflow Runtime State",
        "",
        "This is extension-generated runtime state. Use it to interpret the stable Freeflow guidance.",
        "",
        "Default mode: `workflow`",
        "Active mode: `workflow`",
        "",
        "Capabilities:",
        "- Interaction Contract: active",
        "- Skills: active",
        "- Context Virtualization: active",
        "- Conversation History: active",
        "- Cognitive Routing: inactive",
        "",
        "Cognitive Routing:",
        "- Control: `unavailable`",
        "- Profile: `unavailable`",
      ].join("\n"),
    );

    const repeatedContext = await contextHandler({ messages: firstContext.messages }, ctx);
    assert.equal(repeatedContext.messages.length, 1);
    assert.equal(repeatedContext.messages[0].customType, "freeflow-runtime-state");
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
    assert.doesNotMatch(afterCompact.systemPrompt, /Output Router|freeflow_(search|run|batch)/i);

    await sessionStart({ reason: "resume" }, context(cwd));
    const afterResume = await beforeAgentStart({ systemPrompt: "base prompt" }, context(cwd));
    assert.match(afterResume.systemPrompt, /# Freeflow Interaction Contract/);
    assert.doesNotMatch(afterResume.systemPrompt, /## Loaded Workflow Skill/);
    assert.doesNotMatch(afterResume.systemPrompt, /Output Router|freeflow_(search|run|batch)/i);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi ignores retired router config without affecting core activation", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-retired-router-config-"));
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
    const result = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);

    assert.equal(notifications.length, 0);
    assert.match(result.systemPrompt, /# Freeflow Interaction Contract/);
    assert.doesNotMatch(result.systemPrompt, /Output Router|freeflow_(search|run|batch)/i);
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
    assert.doesNotMatch(result.systemPrompt, /Output Router|freeflow_(search|run|batch)/i);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi keeps core capability context alongside the interaction contract", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-already-full-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
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
    assert.doesNotMatch(result.systemPrompt, /Output Router|freeflow_(search|run|batch)/i);
    assert.doesNotMatch(result.systemPrompt, /Capture raw evidence before transformation/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
