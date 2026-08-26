import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import freeflowExtension from "../../dist/index.js";

const profiles = {
  standard: { provider: "faux", model: "standard", thinkingLevel: "high" },
  reasoning: { provider: "faux", model: "reasoning", thinkingLevel: "max" },
};

function createNormalPiHost({ failInactivePersistence = false } = {}) {
  let currentModel = { provider: "faux", id: "return", reasoning: true };
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
    ["faux/standard", { provider: "faux", id: "standard", reasoning: true }],
    ["faux/reasoning", { provider: "faux", id: "reasoning", reasoning: true }],
  ]);

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
      currentModel = model;
      return true;
    },
    setThinkingLevel(level) {
      calls.push(["setThinkingLevel", level]);
      currentThinkingLevel = level;
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
      clampThinkingLevel(_model, level) {
        return level;
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

test("activates and switches Cognitive Routing through official Pi APIs", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-lifecycle-"));
  const host = createNormalPiHost();
  host.ctx.cwd = cwd;
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ defaultMode: "workflow", cognitiveRouting: { enabled: true, profiles } }),
      "utf8",
    );

    freeflowExtension(host.pi);

    const switchTool = host.tools.find((tool) => tool.name === "freeflow_switch_profile");
    assert.ok(switchTool);
    assert.equal(switchTool.executionMode, "sequential");
    assert.deepEqual(
      host.shortcuts.map(({ shortcut }) => shortcut),
      ["ctrl+shift+r", "ctrl+shift+a"],
    );

    const beforeAgentStart = await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);
    assert.match(beforeAgentStart.systemPrompt, /Cognitive Routing/);
    assert.equal(host.ctx.model.id, "standard");
    assert.equal(host.ctx.thinkingLevel, "high");

    const result = await switchTool.execute(
      "tool-1",
      { target: "reasoning", reason: "Need deeper analysis." },
      undefined,
      undefined,
      host.ctx,
    );

    assert.deepEqual(result.details.result, {
      status: "active",
      changed: true,
      from: "standard",
      to: "reasoning",
      profile: "reasoning",
    });
    assert.deepEqual(host.calls, [
      ["setModel", "faux", "standard"],
      ["setThinkingLevel", "high"],
      ["setModel", "faux", "reasoning"],
      ["setThinkingLevel", "max"],
    ]);
    assert.equal(host.ctx.model.id, "reasoning");
    assert.equal(host.ctx.thinkingLevel, "max");
    assert.equal(host.entries.filter((entry) => entry.customType === "freeflow-cognitive-routing-intent").length, 2);
    assert.equal(host.entries.at(-1).customType, "freeflow-cognitive-routing-model-state");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("explicit Pi startup model or thinking selection keeps Cognitive Routing inactive", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-startup-override-"));
  const originalArgv = process.argv;
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ defaultMode: "workflow", cognitiveRouting: { enabled: true, profiles } }),
      "utf8",
    );

    for (const argv of [
      ["--model", "faux/return"],
      ["--thinking", "low"],
    ]) {
      const host = createNormalPiHost();
      host.ctx.cwd = cwd;
      process.argv = [originalArgv[0], originalArgv[1], ...argv];
      freeflowExtension(host.pi);
      await host.handlers.get("session_start")({ reason: "startup" }, host.ctx);
      await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);

      assert.equal(host.ctx.model.id, "return");
      assert.equal(host.ctx.thinkingLevel, "medium");
      assert.deepEqual(host.calls, []);
      assert.equal(host.pi.getActiveTools().includes("freeflow_switch_profile"), false);
      assert.match(host.statuses.at(-1), /cognitive inactive/);
    }
  } finally {
    process.argv = originalArgv;
    await rm(cwd, { recursive: true, force: true });
  }
});

test("startup-inactive routing can be reactivated explicitly", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-startup-reactivate-"));
  const originalArgv = process.argv;
  const host = createNormalPiHost();
  host.ctx.cwd = cwd;
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ defaultMode: "workflow", cognitiveRouting: { enabled: true, profiles } }),
      "utf8",
    );
    process.argv = [originalArgv[0], originalArgv[1], "--model", "faux/return"];
    freeflowExtension(host.pi);
    await host.handlers.get("session_start")({ reason: "startup" }, host.ctx);
    await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);

    const automatic = host.shortcuts.find(({ shortcut }) => shortcut === "ctrl+shift+a");
    assert.ok(automatic);
    await automatic.definition.handler(host.ctx);
    const contextResult = await host.handlers.get("context")({ messages: [] }, host.ctx);

    assert.match(host.statuses.at(-1), /standard · automatic/);
    assert.equal(host.pi.getActiveTools().includes("freeflow_switch_profile"), true);
    assert.match(contextResult.messages.at(-1).content, /Cognitive Routing: active/);
    assert.match(contextResult.messages.at(-1).content, /Profile: `standard`/);
  } finally {
    process.argv = originalArgv;
    await rm(cwd, { recursive: true, force: true });
  }
});

test("startup inactive persistence failure remains blocked after reload", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-startup-persist-failure-reload-"));
  const originalArgv = process.argv;
  const host = createNormalPiHost({ failInactivePersistence: true });
  host.ctx.cwd = cwd;
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ defaultMode: "workflow", cognitiveRouting: { enabled: true, profiles } }),
      "utf8",
    );
    process.argv = [originalArgv[0], originalArgv[1], "--model", "faux/return"];
    host.entries.push(
      { type: "model_change", provider: "faux", modelId: "return" },
      { type: "thinking_level_change", thinkingLevel: "medium" },
    );
    freeflowExtension(host.pi);
    await host.handlers.get("session_start")({ reason: "startup" }, host.ctx);
    await host.handlers.get("session_shutdown")({ reason: "reload" }, host.ctx);
    freeflowExtension(host.pi);
    await host.handlers.get("session_start")({ reason: "reload" }, host.ctx);
    await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);

    assert.equal(host.ctx.model.id, "return");
    assert.equal(host.ctx.thinkingLevel, "medium");
    assert.match(host.statuses.at(-1), /cognitive blocked/);
  } finally {
    process.argv = originalArgv;
    await rm(cwd, { recursive: true, force: true });
  }
});

test("startup inactivity survives reload before the first prompt", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-startup-inactive-reload-"));
  const originalArgv = process.argv;
  const host = createNormalPiHost();
  host.ctx.cwd = cwd;
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ defaultMode: "workflow", cognitiveRouting: { enabled: true, profiles } }),
      "utf8",
    );
    process.argv = [originalArgv[0], originalArgv[1], "--model", "faux/return"];
    freeflowExtension(host.pi);
    await host.handlers.get("session_start")({ reason: "startup" }, host.ctx);
    assert.equal(host.entries.at(-1).customType, "freeflow-cognitive-routing-inactive");

    await host.handlers.get("session_shutdown")({ reason: "reload" }, host.ctx);
    freeflowExtension(host.pi);
    await host.handlers.get("session_start")({ reason: "reload" }, host.ctx);
    await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);

    assert.equal(host.ctx.model.id, "return");
    assert.equal(host.ctx.thinkingLevel, "medium");
    assert.match(host.statuses.at(-1), /cognitive inactive/);
  } finally {
    process.argv = originalArgv;
    await rm(cwd, { recursive: true, force: true });
  }
});

test("native Pi model selection before the first prompt cancels the armed state", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-preprompt-native-model-"));
  const host = createNormalPiHost();
  host.ctx.cwd = cwd;
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ defaultMode: "workflow", cognitiveRouting: { enabled: true, profiles } }),
      "utf8",
    );
    freeflowExtension(host.pi);
    await host.handlers.get("session_start")({ reason: "startup" }, host.ctx);
    const previousModel = host.ctx.model;
    const nextModel = host.models.get("faux/reasoning");
    host.pi.setModel(nextModel);
    host.pi.setThinkingLevel("max");
    await host.handlers.get("model_select")(
      { type: "model_select", model: nextModel, previousModel, source: "set" },
      host.ctx,
    );
    await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);

    assert.equal(host.ctx.model.id, "reasoning");
    assert.equal(host.ctx.thinkingLevel, "max");
    assert.equal(host.pi.getActiveTools().includes("freeflow_switch_profile"), false);
    assert.match(host.statuses.at(-1), /cognitive inactive/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("native Pi model selection makes Cognitive Routing inactive without overwriting the live pair", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-native-model-"));
  const host = createNormalPiHost();
  host.ctx.cwd = cwd;
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ defaultMode: "workflow", cognitiveRouting: { enabled: true, profiles } }),
      "utf8",
    );
    freeflowExtension(host.pi);
    await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);
    const switchTool = host.tools.find((tool) => tool.name === "freeflow_switch_profile");
    assert.ok(switchTool);
    assert.ok(host.pi.getActiveTools().includes("freeflow_switch_profile"));

    const previousModel = host.ctx.model;
    const nextModel = host.models.get("faux/reasoning");
    host.pi.setModel(nextModel);
    host.pi.setThinkingLevel("max");
    await host.handlers.get("model_select")(
      { type: "model_select", model: nextModel, previousModel, source: "set" },
      host.ctx,
    );

    assert.equal(host.ctx.model.id, "reasoning");
    assert.equal(host.ctx.thinkingLevel, "max");
    assert.equal(host.pi.getActiveTools().includes("freeflow_switch_profile"), false);
    assert.match(host.statuses.at(-1), /cognitive inactive/);

    const contextResult = await host.handlers.get("context")({ messages: [] }, host.ctx);
    assert.match(contextResult.messages.at(-1).content, /Cognitive Routing: inactive/);
    assert.match(contextResult.messages.at(-1).content, /Control: `unavailable`/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("native Pi selecting the current configured model still makes routing inactive", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-native-same-model-"));
  const host = createNormalPiHost();
  host.ctx.cwd = cwd;
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ defaultMode: "workflow", cognitiveRouting: { enabled: true, profiles } }),
      "utf8",
    );
    freeflowExtension(host.pi);
    await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);

    const previousModel = host.ctx.model;
    const selectedModel = host.models.get("faux/standard");
    host.pi.setModel(selectedModel);
    host.pi.setThinkingLevel("high");
    await host.handlers.get("model_select")(
      { type: "model_select", model: selectedModel, previousModel, source: "set" },
      host.ctx,
    );

    assert.equal(host.ctx.model.id, "standard");
    assert.equal(host.ctx.thinkingLevel, "high");
    assert.equal(host.pi.getActiveTools().includes("freeflow_switch_profile"), false);
    assert.match(host.statuses.at(-1), /cognitive inactive/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Ctrl+Shift+A reactivates automatic routing on an inactive configured pair", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-reactivate-automatic-"));
  const host = createNormalPiHost();
  host.ctx.cwd = cwd;
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ defaultMode: "workflow", cognitiveRouting: { enabled: true, profiles } }),
      "utf8",
    );
    freeflowExtension(host.pi);
    await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);

    const previousModel = host.ctx.model;
    const nextModel = host.models.get("faux/reasoning");
    host.pi.setModel(nextModel);
    host.pi.setThinkingLevel("max");
    await host.handlers.get("model_select")(
      { type: "model_select", model: nextModel, previousModel, source: "set" },
      host.ctx,
    );

    const automatic = host.shortcuts.find(({ shortcut }) => shortcut === "ctrl+shift+a");
    assert.ok(automatic);
    await automatic.definition.handler(host.ctx);

    assert.equal(host.ctx.model.id, "reasoning");
    assert.equal(host.ctx.thinkingLevel, "max");
    assert.equal(host.pi.getActiveTools().includes("freeflow_switch_profile"), true);
    assert.match(host.statuses.at(-1), /reasoning · automatic/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pre-prompt inactive persistence failure remains blocked after reload", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-preprompt-persist-failure-reload-"));
  const host = createNormalPiHost({ failInactivePersistence: true });
  host.ctx.cwd = cwd;
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ defaultMode: "workflow", cognitiveRouting: { enabled: true, profiles } }),
      "utf8",
    );
    host.entries.push(
      { type: "model_change", provider: "faux", modelId: "return" },
      { type: "thinking_level_change", thinkingLevel: "medium" },
    );
    freeflowExtension(host.pi);
    await host.handlers.get("session_start")({ reason: "startup" }, host.ctx);
    const previousModel = host.ctx.model;
    const nextModel = host.models.get("faux/reasoning");
    host.pi.setModel(nextModel);
    host.pi.setThinkingLevel("max");
    host.entries.push(
      { type: "model_change", provider: "faux", modelId: "reasoning" },
      { type: "thinking_level_change", thinkingLevel: "max" },
    );
    await host.handlers.get("model_select")(
      { type: "model_select", model: nextModel, previousModel, source: "set" },
      host.ctx,
    );
    await host.handlers.get("session_shutdown")({ reason: "reload" }, host.ctx);
    freeflowExtension(host.pi);
    await host.handlers.get("session_start")({ reason: "reload" }, host.ctx);
    await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);

    assert.equal(host.ctx.model.id, "reasoning");
    assert.equal(host.ctx.thinkingLevel, "max");
    assert.match(host.statuses.at(-1), /cognitive blocked/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("blocked routing can be explicitly reactivated when transition persistence is available", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-blocked-reactivate-"));
  const host = createNormalPiHost({ failInactivePersistence: true });
  host.ctx.cwd = cwd;
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ defaultMode: "workflow", cognitiveRouting: { enabled: true, profiles } }),
      "utf8",
    );
    freeflowExtension(host.pi);
    await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);

    const previousModel = host.ctx.model;
    const nextModel = host.models.get("faux/reasoning");
    host.pi.setModel(nextModel);
    host.pi.setThinkingLevel("max");
    await host.handlers.get("model_select")(
      { type: "model_select", model: nextModel, previousModel, source: "set" },
      host.ctx,
    );
    const automatic = host.shortcuts.find(({ shortcut }) => shortcut === "ctrl+shift+a");
    assert.ok(automatic);
    await automatic.definition.handler(host.ctx);

    assert.equal(host.ctx.model.id, "reasoning");
    assert.equal(host.ctx.thinkingLevel, "max");
    assert.equal(host.pi.getActiveTools().includes("freeflow_switch_profile"), true);
    assert.match(host.statuses.at(-1), /reasoning · automatic/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("native Pi inactivity persistence failure blocks routing without overwriting the live pair", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-inactive-persist-failure-"));
  const host = createNormalPiHost({ failInactivePersistence: true });
  host.ctx.cwd = cwd;
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ defaultMode: "workflow", cognitiveRouting: { enabled: true, profiles } }),
      "utf8",
    );
    freeflowExtension(host.pi);
    await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);

    const previousModel = host.ctx.model;
    const nextModel = host.models.get("faux/reasoning");
    host.pi.setModel(nextModel);
    host.pi.setThinkingLevel("max");
    await host.handlers.get("model_select")(
      { type: "model_select", model: nextModel, previousModel, source: "set" },
      host.ctx,
    );

    assert.equal(host.ctx.model.id, "reasoning");
    assert.equal(host.ctx.thinkingLevel, "max");
    assert.equal(host.pi.getActiveTools().includes("freeflow_switch_profile"), false);
    assert.match(host.statuses.at(-1), /cognitive blocked/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("live divergence remains blocked after inactive-marker persistence failure and reload", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-divergence-reload-"));
  const host = createNormalPiHost({ failInactivePersistence: true });
  host.ctx.cwd = cwd;
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ defaultMode: "workflow", cognitiveRouting: { enabled: true, profiles } }),
      "utf8",
    );
    freeflowExtension(host.pi);
    await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);

    const previousModel = host.ctx.model;
    const nextModel = host.models.get("faux/reasoning");
    host.pi.setModel(nextModel);
    host.pi.setThinkingLevel("max");
    await host.handlers.get("model_select")(
      { type: "model_select", model: nextModel, previousModel, source: "set" },
      host.ctx,
    );
    assert.equal(host.ctx.model.id, "reasoning");

    await host.handlers.get("session_shutdown")({ reason: "reload" }, host.ctx);
    freeflowExtension(host.pi);
    await host.handlers.get("session_start")({ reason: "reload" }, host.ctx);

    assert.equal(host.ctx.model.id, "reasoning");
    assert.equal(host.ctx.thinkingLevel, "max");
    assert.match(host.statuses.at(-1), /cognitive blocked/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("a new explicit startup selection wins over an older inactive marker and later commit", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-new-startup-after-marker-"));
  const originalArgv = process.argv;
  const host = createNormalPiHost();
  host.ctx.cwd = cwd;
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ defaultMode: "workflow", cognitiveRouting: { enabled: true, profiles } }),
      "utf8",
    );
    process.argv = [originalArgv[0], originalArgv[1]];
    freeflowExtension(host.pi);
    await host.handlers.get("session_start")({ reason: "startup" }, host.ctx);
    await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);

    const previousModel = host.ctx.model;
    const nextModel = host.models.get("faux/reasoning");
    host.pi.setModel(nextModel);
    host.pi.setThinkingLevel("max");
    await host.handlers.get("model_select")(
      { type: "model_select", model: nextModel, previousModel, source: "set" },
      host.ctx,
    );
    const automatic = host.shortcuts.find(({ shortcut }) => shortcut === "ctrl+shift+a");
    assert.ok(automatic);
    await automatic.definition.handler(host.ctx);

    process.argv = [originalArgv[0], originalArgv[1], "--model", "faux/reasoning"];
    await host.handlers.get("session_shutdown")({ reason: "reload" }, host.ctx);
    freeflowExtension(host.pi);
    await host.handlers.get("session_start")({ reason: "startup" }, host.ctx);
    await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);

    assert.equal(host.ctx.model.id, "reasoning");
    assert.equal(host.ctx.thinkingLevel, "max");
    assert.match(host.statuses.at(-1), /cognitive inactive/);
  } finally {
    process.argv = originalArgv;
    await rm(cwd, { recursive: true, force: true });
  }
});

test("native Pi inactivity survives reload without overwriting the live pair", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-inactive-reload-"));
  const host = createNormalPiHost();
  host.ctx.cwd = cwd;
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ defaultMode: "workflow", cognitiveRouting: { enabled: true, profiles } }),
      "utf8",
    );
    freeflowExtension(host.pi);
    await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);

    const previousModel = host.ctx.model;
    const nextModel = host.models.get("faux/reasoning");
    host.pi.setModel(nextModel);
    host.pi.setThinkingLevel("max");
    await host.handlers.get("model_select")(
      { type: "model_select", model: nextModel, previousModel, source: "set" },
      host.ctx,
    );
    assert.equal(host.ctx.model.id, "reasoning");

    await host.handlers.get("session_shutdown")({ reason: "reload" }, host.ctx);
    freeflowExtension(host.pi);
    await host.handlers.get("session_start")({ reason: "reload" }, host.ctx);

    assert.equal(host.ctx.model.id, "reasoning");
    assert.equal(host.ctx.thinkingLevel, "max");
    assert.match(host.statuses.at(-1), /cognitive inactive/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("normal Pi settled reconciliation detects live model drift without a native event", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-live-drift-"));
  const host = createNormalPiHost();
  host.ctx.cwd = cwd;
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ defaultMode: "workflow", cognitiveRouting: { enabled: true, profiles } }),
      "utf8",
    );
    freeflowExtension(host.pi);
    await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);

    host.pi.setModel(host.models.get("faux/reasoning"));
    host.pi.setThinkingLevel("max");
    await host.handlers.get("agent_settled")({}, host.ctx);

    assert.equal(host.ctx.model.id, "reasoning");
    assert.equal(host.ctx.thinkingLevel, "max");
    assert.equal(host.pi.getActiveTools().includes("freeflow_switch_profile"), false);
    assert.match(host.statuses.at(-1), /cognitive inactive/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Ctrl+Shift+R reactivates a manual hold on an inactive configured pair", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-reactivate-manual-"));
  const host = createNormalPiHost();
  host.ctx.cwd = cwd;
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ defaultMode: "workflow", cognitiveRouting: { enabled: true, profiles } }),
      "utf8",
    );
    freeflowExtension(host.pi);
    await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);

    const previousModel = host.ctx.model;
    const nextModel = host.models.get("faux/reasoning");
    host.pi.setModel(nextModel);
    host.pi.setThinkingLevel("max");
    await host.handlers.get("model_select")(
      { type: "model_select", model: nextModel, previousModel, source: "set" },
      host.ctx,
    );

    const manual = host.shortcuts.find(({ shortcut }) => shortcut === "ctrl+shift+r");
    assert.ok(manual);
    await manual.definition.handler(host.ctx);

    assert.equal(host.ctx.model.id, "reasoning");
    assert.equal(host.ctx.thinkingLevel, "max");
    assert.equal(host.pi.getActiveTools().includes("freeflow_switch_profile"), false);
    assert.match(host.statuses.at(-1), /reasoning · manual hold/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("native Pi thinking selection makes Cognitive Routing inactive without overwriting the live pair", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-native-thinking-"));
  const host = createNormalPiHost();
  host.ctx.cwd = cwd;
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ defaultMode: "workflow", cognitiveRouting: { enabled: true, profiles } }),
      "utf8",
    );
    freeflowExtension(host.pi);
    await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);
    assert.ok(host.pi.getActiveTools().includes("freeflow_switch_profile"));

    const previousLevel = host.ctx.thinkingLevel;
    host.pi.setThinkingLevel("low");
    await host.handlers.get("thinking_level_select")(
      { type: "thinking_level_select", level: "low", previousLevel },
      host.ctx,
    );

    assert.equal(host.ctx.model.id, "standard");
    assert.equal(host.ctx.thinkingLevel, "low");
    assert.equal(host.pi.getActiveTools().includes("freeflow_switch_profile"), false);
    assert.match(host.statuses.at(-1), /cognitive inactive/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pre-prompt profile commands materialize and persist the current manual hold", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-preprompt-profile-"));
  const host = createNormalPiHost();
  host.ctx.cwd = cwd;
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ defaultMode: "workflow", cognitiveRouting: { enabled: true, profiles } }),
      "utf8",
    );
    freeflowExtension(host.pi);
    await host.handlers.get("session_start")({ reason: "startup" }, host.ctx);
    const freeflowCommand = host.commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);

    await freeflowCommand.definition.handler("profile reasoning", host.ctx);

    assert.equal(host.ctx.model.id, "reasoning");
    assert.equal(host.ctx.thinkingLevel, "max");
    assert.ok(host.entries.some((entry) => entry.customType === "freeflow-cognitive-routing-intent"));
    assert.equal(host.entries.at(-1).customType, "freeflow-cognitive-routing-model-state");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("normal Pi tree reconciliation preserves the current committed profile", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-tree-"));
  const host = createNormalPiHost();
  host.ctx.cwd = cwd;
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ defaultMode: "workflow", cognitiveRouting: { enabled: true, profiles } }),
      "utf8",
    );
    freeflowExtension(host.pi);
    await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);
    const switchTool = host.tools.find((tool) => tool.name === "freeflow_switch_profile");
    await switchTool.execute(
      "tool-1",
      { target: "reasoning", reason: "Need deeper analysis." },
      undefined,
      undefined,
      host.ctx,
    );

    await host.handlers.get("session_tree")({ newLeafId: "current" }, host.ctx);

    assert.equal(host.ctx.model.id, "reasoning");
    assert.equal(host.ctx.thinkingLevel, "max");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("normal Pi reload restores the semantic profile after rotating ownership", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-reload-"));
  const host = createNormalPiHost();
  host.ctx.cwd = cwd;
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ defaultMode: "workflow", cognitiveRouting: { enabled: true, profiles } }),
      "utf8",
    );
    freeflowExtension(host.pi);
    await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);
    const switchTool = host.tools.find((tool) => tool.name === "freeflow_switch_profile");
    await switchTool.execute(
      "tool-1",
      { target: "reasoning", reason: "Need deeper analysis." },
      undefined,
      undefined,
      host.ctx,
    );

    await host.handlers.get("session_shutdown")({ reason: "reload" }, host.ctx);
    assert.equal(host.ctx.model.id, "return");
    assert.equal(host.ctx.thinkingLevel, "medium");

    freeflowExtension(host.pi);
    await host.handlers.get("session_start")({ reason: "reload" }, host.ctx);

    assert.equal(host.ctx.model.id, "reasoning");
    assert.equal(host.ctx.thinkingLevel, "max");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("normal Pi session replacement restores the captured return pair", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-resume-"));
  const host = createNormalPiHost();
  host.ctx.cwd = cwd;
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ defaultMode: "workflow", cognitiveRouting: { enabled: true, profiles } }),
      "utf8",
    );
    freeflowExtension(host.pi);
    await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);
    const switchTool = host.tools.find((tool) => tool.name === "freeflow_switch_profile");
    await switchTool.execute(
      "tool-1",
      { target: "reasoning", reason: "Need deeper analysis." },
      undefined,
      undefined,
      host.ctx,
    );

    await host.handlers.get("session_shutdown")({ reason: "resume" }, host.ctx);

    assert.equal(host.ctx.model.id, "return");
    assert.equal(host.ctx.thinkingLevel, "medium");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("profile command reactivates startup-inactive routing with a manual profile", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-profile-command-reactivate-"));
  const originalArgv = process.argv;
  const host = createNormalPiHost();
  host.ctx.cwd = cwd;
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ defaultMode: "workflow", cognitiveRouting: { enabled: true, profiles } }),
      "utf8",
    );
    process.argv = [originalArgv[0], originalArgv[1], "--model", "faux/return"];
    freeflowExtension(host.pi);
    await host.handlers.get("session_start")({ reason: "startup" }, host.ctx);
    await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);

    const freeflowCommand = host.commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);
    await freeflowCommand.definition.handler("profile standard", host.ctx);

    assert.equal(host.ctx.model.id, "standard");
    assert.equal(host.ctx.thinkingLevel, "high");
    assert.match(host.statuses.at(-1), /standard · manual/);
  } finally {
    process.argv = originalArgv;
    await rm(cwd, { recursive: true, force: true });
  }
});

test("profile auto command reactivates startup-inactive routing with automatic control", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-profile-auto-reactivate-"));
  const originalArgv = process.argv;
  const host = createNormalPiHost();
  host.ctx.cwd = cwd;
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ defaultMode: "workflow", cognitiveRouting: { enabled: true, profiles } }),
      "utf8",
    );
    process.argv = [originalArgv[0], originalArgv[1], "--model", "faux/return"];
    freeflowExtension(host.pi);
    await host.handlers.get("session_start")({ reason: "startup" }, host.ctx);
    await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);

    const freeflowCommand = host.commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);
    await freeflowCommand.definition.handler("profile auto", host.ctx);

    assert.equal(host.ctx.model.id, "standard");
    assert.equal(host.ctx.thinkingLevel, "high");
    assert.match(host.statuses.at(-1), /standard · automatic/);
  } finally {
    process.argv = originalArgv;
    await rm(cwd, { recursive: true, force: true });
  }
});

test("invalid profile command does not create pending reactivation", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-profile-invalid-"));
  const originalArgv = process.argv;
  const host = createNormalPiHost();
  host.ctx.cwd = cwd;
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ defaultMode: "workflow", cognitiveRouting: { enabled: true, profiles } }),
      "utf8",
    );
    process.argv = [originalArgv[0], originalArgv[1], "--model", "faux/return"];
    freeflowExtension(host.pi);
    await host.handlers.get("session_start")({ reason: "startup" }, host.ctx);
    await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);

    const freeflowCommand = host.commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);
    await freeflowCommand.definition.handler("profile unknown", host.ctx);
    await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);

    assert.equal(host.ctx.model.id, "return");
    assert.equal(host.ctx.thinkingLevel, "medium");
    assert.match(host.statuses.at(-1), /cognitive inactive/);
  } finally {
    process.argv = originalArgv;
    await rm(cwd, { recursive: true, force: true });
  }
});

test("profile command can recover blocked startup routing when activation persistence is available", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-profile-blocked-recover-"));
  const originalArgv = process.argv;
  const host = createNormalPiHost({ failInactivePersistence: true });
  host.ctx.cwd = cwd;
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ defaultMode: "workflow", cognitiveRouting: { enabled: true, profiles } }),
      "utf8",
    );
    process.argv = [originalArgv[0], originalArgv[1], "--model", "faux/return"];
    freeflowExtension(host.pi);
    await host.handlers.get("session_start")({ reason: "startup" }, host.ctx);
    await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);

    const freeflowCommand = host.commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);
    await freeflowCommand.definition.handler("profile standard", host.ctx);

    assert.equal(host.ctx.model.id, "standard");
    assert.equal(host.ctx.thinkingLevel, "high");
    assert.match(host.statuses.at(-1), /standard · manual/);
  } finally {
    process.argv = originalArgv;
    await rm(cwd, { recursive: true, force: true });
  }
});

test("failed profile reactivation does not leave an automatic retry pending", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-profile-command-failure-"));
  const originalArgv = process.argv;
  const host = createNormalPiHost();
  host.ctx.cwd = cwd;
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ defaultMode: "workflow", cognitiveRouting: { enabled: true, profiles } }),
      "utf8",
    );
    process.argv = [originalArgv[0], originalArgv[1], "--model", "faux/return"];
    freeflowExtension(host.pi);
    await host.handlers.get("session_start")({ reason: "startup" }, host.ctx);
    await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);

    const originalSetModel = host.pi.setModel;
    host.pi.setModel = async (model) => {
      if (model.id === "standard") return false;
      return originalSetModel.call(host.pi, model);
    };
    const freeflowCommand = host.commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);
    await freeflowCommand.definition.handler("profile standard", host.ctx);

    host.pi.setModel = originalSetModel;
    await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);

    assert.equal(host.ctx.model.id, "return");
    assert.equal(host.ctx.thinkingLevel, "medium");
    assert.match(host.statuses.at(-1), /cognitive inactive|cognitive unavailable/);
  } finally {
    process.argv = originalArgv;
    await rm(cwd, { recursive: true, force: true });
  }
});

test("normal Pi exposes profile commands and manual profile control", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-normal-profile-command-"));
  const host = createNormalPiHost();
  host.ctx.cwd = cwd;
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ defaultMode: "workflow", cognitiveRouting: { enabled: true, profiles } }),
      "utf8",
    );
    freeflowExtension(host.pi);
    const freeflowCommand = host.commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);
    assert.ok(
      freeflowCommand.definition.getArgumentCompletions("profile ").some((item) => item.value === "profile reasoning"),
    );

    await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, host.ctx);
    await freeflowCommand.definition.handler("profile reasoning", host.ctx);

    assert.equal(host.ctx.model.id, "reasoning");
    assert.equal(host.ctx.thinkingLevel, "max");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
