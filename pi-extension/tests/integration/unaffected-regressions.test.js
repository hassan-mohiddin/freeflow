import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { promisify } from "node:util";

import freeflowExtension from "../../dist/index.js";
import { resetSessionOverrides, setSessionCoreOverride } from "../../dist/host/config.js";
import { beforeAgentStartHandler } from "../fixtures/pi087-context.js";

const execFileAsync = promisify(execFile);

const theme = {
  fg(_color, text) {
    return text;
  },
  bold(text) {
    return text;
  },
};

function context(cwd, options = {}) {
  const notifications = [];
  const reloads = [];
  const statuses = [];
  return {
    cwd,
    notifications,
    reloads,
    statuses,
    mode: options.mode,
    hasUI: options.hasUI,
    isIdle: options.isIdle,
    async reload() {
      reloads.push(true);
    },
    sessionManager: {
      getBranch: () => options.entries ?? [],
      getEntries: () => options.entries ?? [],
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

function loadExtension(runtimeApi = {}) {
  const handlers = new Map();
  const commands = [];
  const tools = [];
  const pi = {
    registerTool(tool) {
      tools.push(tool);
    },
    registerCommand(name, definition) {
      commands.push({ name, definition });
    },
    registerShortcut() {},
    on(name, handler) {
      handlers.set(name, handler);
    },
    appendEntry() {},
    sendUserMessage() {},
    getAllTools() {
      return tools.map((tool) => ({ name: tool.name }));
    },
    getActiveTools() {
      return tools.map((tool) => tool.name);
    },
    setActiveTools() {},
  };
  Object.assign(pi, runtimeApi);
  freeflowExtension(pi);
  return { handlers, commands, pi };
}

async function configuredRepo(config = {}) {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-unaffected-regressions-"));
  await mkdir(join(cwd, ".freeflow"));
  await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify(config, null, 2), "utf8");
  return cwd;
}

const KEY = { down: "\u001b[B", enter: "\r", escape: "\u001b" };

/** Move the settings cursor to the row with this label inside this section. */
function choose(component, label, section) {
  for (let i = 0; i < 60; i++) {
    const lines = component.render(120);
    const at = lines.findIndex((line) => line.startsWith("  › "));
    const header = lines
      .slice(0, at)
      .reverse()
      .find((line) => /^ {2}\S/.test(line));
    if (at >= 0 && lines[at].startsWith(`  › ${label} `) && header?.trim().startsWith(section)) return;
    component.handleInput(KEY.down);
  }
  throw new Error(`No settings row ${section} › ${label}`);
}

function freeflowCommand(commands) {
  const command = commands.find((candidate) => candidate.name === "freeflow");
  assert.ok(command);
  return command;
}

test("non-TUI settings selectors provide guidance without mutation", async () => {
  const cwd = await configuredRepo();
  const configPath = join(cwd, ".freeflow/config.json");
  const original = await readFile(configPath, "utf8");
  try {
    const { commands } = loadExtension();
    const command = freeflowCommand(commands);
    const rpc = context(cwd, { mode: "rpc" });
    rpc.ui.custom = async () => assert.fail("RPC settings must not open the TUI");
    await command.definition.handler("settings", rpc);
    assert.match(rpc.notifications.at(-1).message, /require Pi TUI/);
    assert.equal(await readFile(configPath, "utf8"), original);

    const print = context(cwd, { mode: "json", hasUI: false });
    await assert.rejects(() => command.definition.handler("settings", print), /require Pi TUI/);
    assert.equal(await readFile(configPath, "utf8"), original);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("settings refuse a mid-run mutation before opening the TUI", async () => {
  const cwd = await configuredRepo();
  const configPath = join(cwd, ".freeflow/config.json");
  const original = await readFile(configPath, "utf8");
  try {
    const { commands } = loadExtension();
    const command = freeflowCommand(commands);
    const settings = context(cwd, { isIdle: () => false });
    settings.ui.custom = async () => assert.fail("settings UI must not open while Pi is running");
    await command.definition.handler("settings repo", settings);
    assert.match(settings.notifications.at(-1).message, /only while Pi is idle/);
    assert.equal(await readFile(configPath, "utf8"), original);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("settings recheck idle state before committing a master-switch selection", async () => {
  const cwd = await configuredRepo({ enabled: false });
  const configPath = join(cwd, ".freeflow/config.json");
  const original = await readFile(configPath, "utf8");
  let idle = true;
  try {
    const { commands } = loadExtension();
    const command = freeflowCommand(commands);
    const settings = context(cwd, { isIdle: () => idle });
    settings.ui.custom = async (factory) => {
      let result;
      const component = factory({ requestRender() {} }, theme, {}, (value) => {
        result = value;
      });
      idle = false;
      component.handleInput("\r");
      component.handleInput("\u001b[A");
      component.handleInput("\r");
      await component.waitForWrites();
      component.handleInput("\u001b");
      return result;
    };
    await command.definition.handler("settings repo", settings);
    assert.match(settings.notifications.at(-1).message, /only while Pi is idle/);
    assert.equal(await readFile(configPath, "utf8"), original);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Cognitive Routing preset cancellation preserves the previous repository value", async () => {
  const cwd = await configuredRepo({
    cognitiveRouting: {
      enabled: true,
      profiles: {
        coordinator: { provider: "test", model: "model-a", thinking: "low" },
        executor: { provider: "test", model: "model-b", thinking: "high" },
      },
    },
  });
  const original = await readFile(join(cwd, ".freeflow/config.json"), "utf8");
  try {
    const { commands } = loadExtension({
      setModel() {
        return true;
      },
      setThinkingLevel() {},
    });
    const command = freeflowCommand(commands);
    const settings = context(cwd, { isIdle: () => true });
    settings.modelRegistry = cognitiveRoutingModelRegistry();
    settings.ui.custom = async (factory) => {
      let result;
      const component = factory({ requestRender() {} }, theme, {}, (value) => {
        result = value;
      });
      // Opening the preset picker and leaving it changes nothing.
      choose(component, "Executor preset", "Cognitive Routing");
      component.handleInput("\r");
      component.handleInput("\u001b");
      component.handleInput("\u001b");
      return result;
    };
    await command.definition.handler("settings repo", settings);
    assert.equal(await readFile(join(cwd, ".freeflow/config.json"), "utf8"), original);
    assert.equal(settings.reloads.length, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Cognitive Routing settings refresh after enabling the capability", async () => {
  const cwd = await configuredRepo({
    cognitiveRouting: {
      enabled: false,
      profiles: {
        coordinator: { provider: "test", model: "model-a", thinking: "low" },
        executor: { provider: "test", model: "model-b", thinking: "high" },
      },
    },
  });
  try {
    const { commands } = loadExtension({
      setModel() {
        return true;
      },
      setThinkingLevel() {},
    });
    const command = freeflowCommand(commands);
    const settings = context(cwd, { isIdle: () => true });
    settings.modelRegistry = cognitiveRoutingModelRegistry();
    settings.ui.custom = async (factory) => {
      let result;
      const component = factory({ requestRender() {} }, theme, {}, (value) => {
        result = value;
      });
      // Enabled toggles in place, and the section's status follows.
      choose(component, "Enabled", "Cognitive Routing");
      component.handleInput("\r");
      await component.waitForWrites();
      assert.match(component.render(120).join("\n"), /Cognitive Routing\s+configured\n\s+› Enabled\s+enabled\n/);
      component.handleInput("\u001b");
      return result;
    };
    await command.definition.handler("settings repo", settings);
    const saved = JSON.parse(await readFile(join(cwd, ".freeflow/config.json"), "utf8"));
    assert.equal(saved.cognitiveRouting.enabled, true);
    assert.equal(settings.reloads.length, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Cognitive Routing settings can disable projection without disabling routing", async () => {
  const cwd = await configuredRepo({
    cognitiveRouting: {
      enabled: true,
      projection: true,
      profiles: {
        coordinator: { provider: "test", model: "model-a", thinking: "low" },
        executor: { provider: "test", model: "model-b", thinking: "high" },
      },
    },
  });
  try {
    const { commands } = loadExtension({
      setModel() {
        return true;
      },
      setThinkingLevel() {},
    });
    const command = freeflowCommand(commands);
    const settings = context(cwd, { isIdle: () => true });
    settings.modelRegistry = cognitiveRoutingModelRegistry();
    settings.ui.custom = async (factory) => {
      let result;
      const component = factory({ requestRender() {} }, theme, {}, (value) => {
        result = value;
      });
      choose(component, "Context projection", "Cognitive Routing");
      component.handleInput("\r");
      await component.waitForWrites();
      component.handleInput("\u001b");
      component.handleInput("\u001b");
      return result;
    };
    await command.definition.handler("settings repo", settings);
    const saved = JSON.parse(await readFile(join(cwd, ".freeflow/config.json"), "utf8"));
    assert.equal(saved.cognitiveRouting.enabled, true);
    assert.equal(saved.cognitiveRouting.projection ?? false, false);
    assert.equal(settings.reloads.length, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("session settings preserve mandatory prompts through compaction and resume", async () => {
  const cwd = await configuredRepo();
  try {
    const { handlers } = loadExtension();
    const ctx = context(cwd);
    const before = await beforeAgentStartHandler(handlers)({ systemPrompt: "base prompt" }, ctx);
    assert.match(before.renderedGuidance, /# Freeflow Interaction Contract/);
    await handlers.get("session_compact")({ reason: "manual" }, ctx);
    const afterCompact = await beforeAgentStartHandler(handlers)({ systemPrompt: "base prompt" }, ctx);
    assert.match(afterCompact.renderedGuidance, /# Freeflow Interaction Contract/);
    await handlers.get("session_start")({ reason: "resume" }, ctx);
    const afterResume = await beforeAgentStartHandler(handlers)({ systemPrompt: "base prompt" }, ctx);
    assert.match(afterResume.renderedGuidance, /# Freeflow Interaction Contract/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("retired router-shaped configuration remains inert while core activation works", async () => {
  const cwd = await configuredRepo({ outputRouter: { postToolRouting: "always" } });
  try {
    const { handlers } = loadExtension();
    const ctx = context(cwd);
    const before = await beforeAgentStartHandler(handlers)({ systemPrompt: "base prompt" }, ctx);
    assert.match(before.renderedGuidance, /# Freeflow Interaction Contract/);
    assert.doesNotMatch(before.renderedGuidance, /Output Router|freeflow_(search|run|batch)/i);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("remaining session overrides apply without changing repository configuration", async () => {
  const cwd = await configuredRepo();
  try {
    const configPath = join(cwd, ".freeflow/config.json");
    const original = await readFile(configPath, "utf8");
    const { pi } = loadExtension();
    const ctx = context(cwd);
    await setSessionCoreOverride("enabled", false, ctx, pi);
    const state = await import("../../dist/host/config.js").then(({ readCapabilityState }) => readCapabilityState(cwd));
    assert.equal(state.enabled, false);
    assert.equal(await readFile(configPath, "utf8"), original);
    await resetSessionOverrides(ctx, pi);
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

test("a session can switch each capability without changing either config file", async () => {
  const cwd = await configuredRepo({
    toolExecution: { enabled: true },
    cognitiveRouting: {
      enabled: true,
      projection: true,
      profiles: {
        coordinator: { provider: "test", model: "model-a", thinking: "low" },
        executor: { provider: "test", model: "model-b", thinking: "high" },
      },
    },
  });
  try {
    const configPath = join(cwd, ".freeflow/config.json");
    const original = await readFile(configPath, "utf8");
    const { pi } = loadExtension();
    const ctx = context(cwd);
    const { readCapabilityState } = await import("../../dist/host/config.js");
    for (const key of [
      "toolExecution.enabled",
      "compaction.enabled",
      "compaction.carry",
      "cognitiveRouting.projection",
    ])
      assert.equal((await setSessionCoreOverride(key, false, ctx, pi)).reloadRequired, true);
    const state = await readCapabilityState(cwd);
    assert.equal(state.toolExecution.enabled, false);
    assert.equal(state.compaction.enabled, false);
    assert.equal(state.compaction.carry, false);
    assert.equal(state.cognitiveRouting.projection, false);
    assert.equal(state.cognitiveRouting.projectionSource, "session");
    assert.equal(state.cognitiveRouting.enabled, true, "an override of one switch leaves the others configured");
    assert.equal(await readFile(configPath, "utf8"), original);
    assert.equal(await readFile(join(cwd, ".freeflow/local.json"), "utf8").catch(() => undefined), undefined);

    await resetSessionOverrides(ctx, pi);
    const reset = await readCapabilityState(cwd);
    assert.equal(reset.toolExecution.enabled, true);
    assert.equal(reset.compaction.carry, true);
    assert.equal(reset.cognitiveRouting.projection, true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("session settings list every capability switch and change one in place", async () => {
  const cwd = await configuredRepo({ toolExecution: { enabled: true } });
  try {
    const { commands } = loadExtension({ appendEntry() {}, setModel: () => true, setThinkingLevel() {} });
    const command = freeflowCommand(commands);
    const settings = context(cwd, { isIdle: () => true });
    let rendered;
    settings.ui.custom = async (factory) => {
      const component = factory({ requestRender() {} }, theme, {}, () => {});
      choose(component, "Context reuse", "Compaction");
      component.handleInput(KEY.enter);
      await component.waitForWrites();
      rendered = component.render(120).join("\n");
      component.handleInput(KEY.escape);
    };
    await command.definition.handler("settings session", settings);
    assert.match(rendered, /\[Session\]/);
    assert.match(rendered, /Tool Execution\s+active\n\s+Enabled\s+inherit → enabled \(repository\)/);
    assert.match(
      rendered,
      /Compaction\s+active\n\s+Enabled\s+inherit → enabled \(default\)\n\s+› Context reuse\s+enabled · session/,
    );
    assert.match(rendered, /Reset overrides\s+1 active/, "the reset row counts the override just made");
    const { readCapabilityState } = await import("../../dist/host/config.js");
    assert.equal((await readCapabilityState(cwd)).compaction.carry, true);
    await resetSessionOverrides(settings, {});
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
