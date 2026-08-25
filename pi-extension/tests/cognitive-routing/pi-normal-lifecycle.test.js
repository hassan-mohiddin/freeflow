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

function createNormalPiHost() {
  let currentModel = { provider: "faux", id: "return", reasoning: true };
  let currentThinkingLevel = "medium";
  let activeToolNames;
  const entries = [];
  const tools = [];
  const commands = [];
  const shortcuts = [];
  const handlers = new Map();
  const calls = [];
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
      setStatus() {},
    },
  };

  return { pi, ctx, entries, tools, commands, shortcuts, handlers, calls };
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
