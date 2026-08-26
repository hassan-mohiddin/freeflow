import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { promisify } from "node:util";

import freeflowExtension from "../../dist/index.js";
import { resetSessionOverrides, setSessionCoreOverride } from "../../dist/runtime/runtime-context.js";
import { PIFLOW_HOST } from "../cognitive-routing/host-fixture.js";

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

function loadExtension() {
  const handlers = new Map();
  const commands = [];
  const tools = [];
  const pi = {
    host: PIFLOW_HOST,
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
  freeflowExtension(pi);
  return { handlers, commands, pi };
}

async function configuredRepo(config = {}) {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-unaffected-regressions-"));
  await mkdir(join(cwd, ".freeflow"));
  await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify(config, null, 2), "utf8");
  return cwd;
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

test("personal settings keep repository state unchanged while editing context", async () => {
  const cwd = await configuredRepo();
  const configPath = join(cwd, ".freeflow/config.json");
  const original = await readFile(configPath, "utf8");
  try {
    const { commands } = loadExtension();
    const command = freeflowCommand(commands);
    const settings = context(cwd);
    settings.ui.custom = async (factory) => {
      let result;
      const component = factory({ requestRender() {} }, theme, {}, (value) => {
        result = value;
      });
      component.handleInput("\u001b[B");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\r");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      await component.waitForWrites();
      component.handleInput("\u001b");
      component.handleInput("\u001b");
      return result;
    };
    await command.definition.handler("settings", settings);
    assert.equal(await readFile(configPath, "utf8"), original);
    assert.equal(JSON.parse(await readFile(join(cwd, ".freeflow/local.json"), "utf8")).contextVirtualization, true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("context settings refresh their parent summary after a child changes", async () => {
  const cwd = await configuredRepo({ contextVirtualization: true });
  try {
    const { commands } = loadExtension();
    const command = freeflowCommand(commands);
    const settings = context(cwd);
    settings.ui.custom = async (factory) => {
      let result;
      const component = factory({ requestRender() {} }, theme, {}, (value) => {
        result = value;
      });
      assert.match(component.render(120).join("\n"), /Freeflow Context\s+enabled \(2\) 1\/2 enabled/);
      component.handleInput("\u001b[B");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\r");
      component.handleInput("\u001b[B");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      await component.waitForWrites();
      component.handleInput("\u001b");
      assert.match(component.render(120).join("\n"), /Freeflow Context\s+disabled \(2\) 0\/2 enabled/);
      component.handleInput("\u001b");
      return result;
    };
    await command.definition.handler("settings", settings);
    const local = JSON.parse(await readFile(join(cwd, ".freeflow/local.json"), "utf8"));
    assert.equal(local.contextVirtualization, false);
    assert.equal(settings.reloads.length, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("repository settings show personal effective sources without changing shared state", async () => {
  const cwd = await configuredRepo({ contextVirtualization: false });
  const repositoryPath = join(cwd, ".freeflow/config.json");
  const localPath = join(cwd, ".freeflow/local.json");
  try {
    await writeFile(localPath, JSON.stringify({ contextVirtualization: true }, null, 2), "utf8");
    const { commands } = loadExtension();
    const command = freeflowCommand(commands);
    const settings = context(cwd, { isIdle: () => true });
    settings.ui.custom = async (factory) => {
      let result;
      const component = factory({ requestRender() {} }, theme, {}, (value) => {
        result = value;
      });
      component.handleInput("\u001b[B");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      assert.match(component.render(120).join("\n"), /Context Virtualization\s+disabled \(effective enabled · local\)/);
      component.handleInput("\u001b");
      return result;
    };
    await command.definition.handler("settings repo", settings);
    assert.deepEqual(JSON.parse(await readFile(repositoryPath, "utf8")), { contextVirtualization: false });
    assert.deepEqual(JSON.parse(await readFile(localPath, "utf8")), { contextVirtualization: true });
    assert.equal(settings.reloads.length, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Cognitive Routing preset cancellation preserves the previous repository value", async () => {
  const cwd = await configuredRepo({
    cognitiveRouting: {
      enabled: true,
      profiles: {
        standard: { provider: "test", model: "model-a", thinkingLevel: "low" },
        reasoning: { provider: "test", model: "model-b", thinkingLevel: "high" },
      },
    },
  });
  const original = await readFile(join(cwd, ".freeflow/config.json"), "utf8");
  try {
    const { commands } = loadExtension();
    const command = freeflowCommand(commands);
    const settings = context(cwd, { isIdle: () => true });
    settings.modelRegistry = cognitiveRoutingModelRegistry();
    settings.ui.custom = async (factory) => {
      let result;
      const component = factory({ requestRender() {} }, theme, {}, (value) => {
        result = value;
      });
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\u001b[B");
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
        standard: { provider: "test", model: "model-a", thinkingLevel: "low" },
        reasoning: { provider: "test", model: "model-b", thinkingLevel: "high" },
      },
    },
  });
  try {
    const { commands } = loadExtension();
    const command = freeflowCommand(commands);
    const settings = context(cwd, { isIdle: () => true });
    settings.modelRegistry = cognitiveRoutingModelRegistry();
    settings.ui.custom = async (factory) => {
      let result;
      const component = factory({ requestRender() {} }, theme, {}, (value) => {
        result = value;
      });
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\r");
      component.handleInput("\u001b[A");
      component.handleInput("\r");
      await component.waitForWrites();
      component.handleInput("\u001b");
      assert.match(component.render(120).join("\n"), /Cognitive Routing\s+enabled \(5\) configured/);
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

test("session settings preserve mandatory prompts through compaction and resume", async () => {
  const cwd = await configuredRepo();
  try {
    const { handlers } = loadExtension();
    const ctx = context(cwd);
    const before = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.match(before.systemPrompt, /# Freeflow Interaction Contract/);
    await handlers.get("session_compact")({ reason: "manual" }, ctx);
    const afterCompact = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.match(afterCompact.systemPrompt, /# Freeflow Interaction Contract/);
    await handlers.get("session_start")({ reason: "resume" }, ctx);
    const afterResume = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.match(afterResume.systemPrompt, /# Freeflow Interaction Contract/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("retired router-shaped configuration remains inert while core activation works", async () => {
  const cwd = await configuredRepo({ outputRouter: { postToolRouting: "always" } });
  try {
    const { handlers } = loadExtension();
    const ctx = context(cwd);
    const before = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.match(before.systemPrompt, /# Freeflow Interaction Contract/);
    assert.doesNotMatch(before.systemPrompt, /Output Router|freeflow_(search|run|batch)/i);
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
    await setSessionCoreOverride("contextVirtualization", true, ctx, pi);
    const state = await import("../../dist/runtime/runtime-context.js").then(({ readCapabilityState }) =>
      readCapabilityState(cwd, undefined, PIFLOW_HOST),
    );
    assert.equal(state.contextVirtualization.effective, true);
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
