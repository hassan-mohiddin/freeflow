import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import freeflowExtension from "../../dist/index.js";

const profiles = {
  standard: { provider: "faux", model: "standard", thinkingLevel: "high" },
  reasoning: { provider: "faux", model: "reasoning", thinkingLevel: "max" },
};

function createNormalPiHost({
  failInactivePersistence = false,
  failTargetThinking = false,
  emitNativeEvents = false,
} = {}) {
  let currentModel = {
    provider: "faux",
    id: "return",
    reasoning: true,
    thinkingLevelMap: { xhigh: "xhigh", max: "max" },
  };
  let currentThinkingLevel = "medium";
  let activeToolNames;
  const entries = [];
  const tools = [];
  const commands = [];
  const shortcuts = [];
  const handlers = new Map();
  const calls = [];
  const statuses = [];
  const models = new Map([
    ["faux/return", currentModel],
    ["faux/standard", { provider: "faux", id: "standard", reasoning: true, thinkingLevelMap: { max: "max" } }],
    ["faux/reasoning", { provider: "faux", id: "reasoning", reasoning: true, thinkingLevelMap: { max: "max" } }],
  ]);

  const appendNativeEntry = (entry) => entries.push({ type: entry.type, ...entry });
  const pi = {
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
      if (failInactivePersistence && customType === "freeflow-cognitive-routing-inactive") {
        throw new Error("simulated inactive persistence failure");
      }
      entries.push({ type: "custom", customType, data });
    },
    async setModel(model) {
      calls.push(["setModel", model.provider, model.id]);
      const previousModel = currentModel;
      currentModel = model;
      appendNativeEntry({ type: "model_change", provider: model.provider, modelId: model.id });
      if (emitNativeEvents) {
        await handlers.get("model_select")?.({ type: "model_select", model, previousModel, source: "set" }, ctx);
      }
      return true;
    },
    setThinkingLevel(level) {
      calls.push(["setThinkingLevel", level]);
      if (failTargetThinking && level === "max") throw new Error("simulated target thinking failure");
      currentThinkingLevel = level;
      appendNativeEntry({ type: "thinking_level_change", thinkingLevel: level });
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
    sendUserMessage() {},
  };

  const ctx = {
    cwd: undefined,
    mode: "print",
    hasUI: false,
    get model() {
      return currentModel;
    },
    get thinkingLevel() {
      return currentThinkingLevel;
    },
    modelRegistry: {
      find(provider, modelId) {
        return models.get(`${provider}/${modelId}`);
      },
      async getApiKeyAndHeaders() {
        return { ok: true };
      },
    },
    modelStateProvenance: {},
    isIdle: () => true,
    sessionManager: {
      getEntries: () => entries,
      getBranch: () => entries,
      buildContextEntries: () => entries,
      getLeafId: () => entries.at(-1)?.id ?? null,
    },
    ui: {
      notify() {},
      setStatus(_key, value) {
        statuses.push(value);
      },
    },
  };

  return { pi, ctx, entries, tools, commands, shortcuts, handlers, calls, statuses, models };
}

async function configure(cwd) {
  await mkdir(join(cwd, ".freeflow"));
  await writeFile(
    join(cwd, ".freeflow", "config.json"),
    JSON.stringify({ cognitiveRouting: { enabled: true, profiles } }),
    "utf8",
  );
}

async function start(host) {
  freeflowExtension(host.pi);
  await host.handlers.get("session_start")({ type: "session_start", reason: "startup" }, host.ctx);
  return host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);
}

function switchTool(host) {
  return host.tools.find((tool) => tool.name === "freeflow_switch_profile");
}

function runtimeMessages(host) {
  return host.entries.filter((entry) => entry.customType === "freeflow-cognitive-routing-model-state");
}

test("normal Pi activates and switches Cognitive Routing through official APIs", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-lifecycle-"));
  const host = createNormalPiHost();
  host.ctx.cwd = cwd;
  try {
    await configure(cwd);
    const before = await start(host);

    assert.match(before.systemPrompt, /## Cognitive Routing Cue/);
    assert.equal(host.ctx.model.id, "reasoning");
    assert.equal(host.ctx.thinkingLevel, "max");
    assert.ok(host.pi.getActiveTools().includes("freeflow_switch_profile"));

    const tool = switchTool(host);
    assert.ok(tool);
    assert.equal(tool.executionMode, "sequential");
    const result = await tool.execute(
      "normal-pi-switch",
      { target: "standard", reason: "Use Standard for bounded execution." },
      undefined,
      undefined,
      host.ctx,
    );

    assert.deepEqual(result.details.result, {
      status: "active",
      changed: true,
      from: "reasoning",
      to: "standard",
      profile: "standard",
    });
    assert.equal(host.ctx.model.id, "standard");
    assert.equal(host.ctx.thinkingLevel, "high");
    assert.equal(runtimeMessages(host).at(-1).data.status, "applied");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("normal Pi ignores model events emitted by Freeflow-owned transitions", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-internal-events-"));
  const host = createNormalPiHost({ emitNativeEvents: true });
  host.ctx.cwd = cwd;
  try {
    await configure(cwd);
    const before = await start(host);

    assert.equal(
      host.entries.some((entry) => entry.customType === "freeflow-cognitive-routing-inactive"),
      false,
    );
    assert.match(before.systemPrompt, /## Cognitive Routing Cue/);
    assert.equal(host.ctx.model.id, "reasoning");
    assert.equal(host.ctx.thinkingLevel, "max");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("normal Pi no-op profile switches preserve one runtime-state message", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-no-op-"));
  const host = createNormalPiHost();
  host.ctx.cwd = cwd;
  try {
    await configure(cwd);
    await start(host);
    const contextHandler = host.handlers.get("context");
    const first = await contextHandler({ messages: [] }, host.ctx);
    const tool = switchTool(host);
    const result = await tool.execute(
      "normal-pi-no-op",
      { target: "reasoning", reason: "Remain on the current profile." },
      undefined,
      undefined,
      host.ctx,
    );
    assert.equal(result.details.result.changed, false);

    await host.handlers.get("tool_result")({ type: "tool_result", toolName: "freeflow_switch_profile" }, host.ctx);
    assert.equal(await contextHandler({ messages: first.messages }, host.ctx), undefined);
    assert.equal(first.messages.filter((message) => message.customType === "freeflow-runtime-state").length, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("normal Pi supports manual and automatic profile shortcuts", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-shortcuts-"));
  const host = createNormalPiHost();
  host.ctx.cwd = cwd;
  try {
    await configure(cwd);
    await start(host);
    const manual = host.shortcuts.find(({ shortcut }) => shortcut === "ctrl+shift+r");
    const automatic = host.shortcuts.find(({ shortcut }) => shortcut === "ctrl+shift+a");
    assert.ok(manual);
    assert.ok(automatic);

    await manual.definition.handler(host.ctx);
    assert.equal(host.ctx.model.id, "standard");
    assert.match(host.statuses.at(-1), /standard · manual hold/);

    await automatic.definition.handler(host.ctx);
    assert.equal(host.ctx.model.id, "reasoning");
    assert.equal(host.ctx.thinkingLevel, "max");
    assert.match(host.statuses.at(-1), /reasoning · automatic/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("normal Pi disables routing after a native model override and can reactivate explicitly", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-native-override-"));
  const host = createNormalPiHost();
  host.ctx.cwd = cwd;
  try {
    await configure(cwd);
    await start(host);
    const previousModel = host.ctx.model;
    const selectedModel = host.models.get("faux/standard");
    await host.pi.setModel(selectedModel);
    host.pi.setThinkingLevel("high");
    await host.handlers.get("model_select")(
      { type: "model_select", model: selectedModel, previousModel, source: "set" },
      host.ctx,
    );

    assert.equal(host.pi.getActiveTools().includes("freeflow_switch_profile"), false);
    assert.ok(host.entries.some((entry) => entry.customType === "freeflow-cognitive-routing-inactive"));
    assert.match(host.statuses.at(-1), /cognitive/);

    const automatic = host.shortcuts.find(({ shortcut }) => shortcut === "ctrl+shift+a");
    await automatic.definition.handler(host.ctx);
    assert.equal(host.ctx.model.id, "standard");
    assert.equal(host.ctx.thinkingLevel, "high");
    assert.equal(host.pi.getActiveTools().includes("freeflow_switch_profile"), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("normal Pi honors explicit startup selection and supports explicit reactivation", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-startup-override-"));
  const originalArgv = process.argv;
  const host = createNormalPiHost();
  host.ctx.cwd = cwd;
  try {
    await configure(cwd);
    process.argv = [originalArgv[0], originalArgv[1], "--model", "faux/return"];
    freeflowExtension(host.pi);
    await host.handlers.get("session_start")({ type: "session_start", reason: "startup" }, host.ctx);
    const before = await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);

    assert.equal(host.ctx.model.id, "return");
    assert.equal(host.ctx.thinkingLevel, "medium");
    assert.ok(host.entries.some((entry) => entry.customType === "freeflow-cognitive-routing-inactive"));
    assert.equal(host.pi.getActiveTools().includes("freeflow_switch_profile"), false);
    assert.doesNotMatch(before.systemPrompt, /## Cognitive Routing Cue/);

    const command = host.commands.find(({ name }) => name === "freeflow");
    await command.definition.handler("profile standard", host.ctx);
    assert.equal(host.ctx.model.id, "standard");
    assert.equal(host.ctx.thinkingLevel, "high");
  } finally {
    process.argv = originalArgv;
    await rm(cwd, { recursive: true, force: true });
  }
});

test("normal Pi uses documented startup arguments instead of host provenance", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-provenance-"));
  const originalArgv = process.argv;
  const host = createNormalPiHost();
  host.ctx.cwd = cwd;
  host.ctx.modelStateProvenance = { explicitModel: true, explicitThinking: true };
  try {
    await configure(cwd);
    process.argv = [originalArgv[0], originalArgv[1]];
    const before = await start(host);

    assert.equal(host.ctx.model.id, "reasoning");
    assert.equal(host.ctx.thinkingLevel, "max");
    assert.match(before.systemPrompt, /## Cognitive Routing Cue/);
  } finally {
    process.argv = originalArgv;
    await rm(cwd, { recursive: true, force: true });
  }
});

test("normal Pi disables routing after a native thinking-level override", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-native-thinking-"));
  const host = createNormalPiHost();
  host.ctx.cwd = cwd;
  try {
    await configure(cwd);
    await start(host);
    const previousLevel = host.ctx.thinkingLevel;
    host.pi.setThinkingLevel("low");
    await host.handlers.get("thinking_level_select")(
      { type: "thinking_level_select", level: "low", previousLevel },
      host.ctx,
    );

    assert.equal(host.ctx.model.id, "reasoning");
    assert.equal(host.ctx.thinkingLevel, "low");
    assert.equal(host.pi.getActiveTools().includes("freeflow_switch_profile"), false);
    assert.ok(host.entries.some((entry) => entry.customType === "freeflow-cognitive-routing-inactive"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("normal Pi fails closed when native inactivity cannot be persisted", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-inactive-persistence-"));
  const host = createNormalPiHost({ failInactivePersistence: true });
  host.ctx.cwd = cwd;
  try {
    await configure(cwd);
    await start(host);
    const previousModel = host.ctx.model;
    const selectedModel = host.models.get("faux/standard");
    await host.pi.setModel(selectedModel);
    host.pi.setThinkingLevel("high");
    await host.handlers.get("model_select")(
      { type: "model_select", model: selectedModel, previousModel, source: "set" },
      host.ctx,
    );

    assert.equal(host.pi.getActiveTools().includes("freeflow_switch_profile"), false);
    assert.equal(
      host.entries.some((entry) => entry.customType === "freeflow-cognitive-routing-inactive"),
      false,
    );
    assert.match(host.statuses.at(-1), /cognitive blocked/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("normal Pi reload restores the active semantic profile", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-reload-"));
  const host = createNormalPiHost();
  host.ctx.cwd = cwd;
  try {
    await configure(cwd);
    await start(host);
    const tool = switchTool(host);
    await tool.execute(
      "normal-pi-reload-switch",
      { target: "standard", reason: "Use Standard for bounded execution." },
      undefined,
      undefined,
      host.ctx,
    );
    await host.handlers.get("session_shutdown")({ type: "session_shutdown", reason: "reload" }, host.ctx);
    assert.equal(host.ctx.model.id, "return");
    assert.equal(host.ctx.thinkingLevel, "medium");

    freeflowExtension(host.pi);
    await host.handlers.get("session_start")({ type: "session_start", reason: "reload" }, host.ctx);
    await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);
    assert.equal(host.ctx.model.id, "standard");
    assert.equal(host.ctx.thinkingLevel, "high");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("normal Pi preserves Cognitive Routing skill and runtime surface without Conversation routing", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-surface-"));
  const host = createNormalPiHost();
  host.ctx.cwd = cwd;
  try {
    await configure(cwd);
    const before = await start(host);
    assert.match(before.systemPrompt, /## Cognitive Routing Cue/);
    assert.doesNotMatch(before.systemPrompt, /Conversation/);
    const resources = await host.handlers.get("resources_discover")({}, host.ctx);
    const routingSkillPath = resources.skillPaths.find((path) => path.endsWith("cognitive-routing/SKILL.md"));
    assert.ok(routingSkillPath);
    const state = await host.handlers.get("context")({ messages: [] }, host.ctx);
    assert.match(state.messages.at(-1).content, /Control: `automatic`/);
    assert.match(state.messages.at(-1).content, /Profile: `reasoning`/);
    assert.doesNotMatch(state.messages.at(-1).content, /Conversation:/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
