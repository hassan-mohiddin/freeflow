import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import freeflowExtension from "../../dist/index.js";

const profiles = {
  standard: { provider: "faux", model: "standard", thinkingLevel: "high" },
  reasoning: { provider: "faux", model: "reasoning", thinkingLevel: "max" },
};

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

async function createStockPiSession({ mode = "print", uiContext } = {}) {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-stock-lifecycle-"));
  const modelRuntime = await ModelRuntime.create({
    authPath: join(cwd, "auth.json"),
    modelsPath: join(cwd, "models.json"),
  });
  modelRuntime.registerProvider("faux", {
    baseUrl: "http://127.0.0.1:1/v1",
    api: "openai-completions",
    apiKey: "test-only",
    models: [
      {
        id: "return",
        reasoning: true,
        input: ["text"],
        contextWindow: 128000,
        maxTokens: 4096,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
      {
        id: "standard",
        reasoning: true,
        input: ["text"],
        contextWindow: 128000,
        maxTokens: 4096,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
      {
        id: "limited",
        reasoning: true,
        thinkingLevelMap: { xhigh: null, max: null },
        input: ["text"],
        contextWindow: 128000,
        maxTokens: 4096,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
      {
        id: "reasoning",
        reasoning: true,
        thinkingLevelMap: { xhigh: "xhigh", max: "max" },
        input: ["text"],
        contextWindow: 128000,
        maxTokens: 4096,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
    ],
  });
  const returnModel = modelRuntime.getModel("faux", "return");
  assert.ok(returnModel);

  await mkdir(join(cwd, ".freeflow"));
  await writeFile(
    join(cwd, ".freeflow", "config.json"),
    JSON.stringify({ defaultMode: "workflow", cognitiveRouting: { enabled: true, profiles } }),
    "utf8",
  );

  const settingsManager = SettingsManager.inMemory();
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: cwd,
    settingsManager,
    extensionFactories: [freeflowExtension],
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd,
    modelRuntime,
    model: returnModel,
    thinkingLevel: "medium",
    resourceLoader,
    sessionManager: SessionManager.inMemory(cwd),
    settingsManager,
  });
  await session.bindExtensions({ mode, ...(uiContext ? { uiContext } : {}) });
  return { cwd, session };
}

test("stock Pi keeps armed first-prompt activation active", async () => {
  const { cwd, session } = await createStockPiSession();
  try {
    const runner = session.extensionRunner;
    const ctx = runner.createContext();
    const before = await runner.emitBeforeAgentStart("first prompt", undefined, "base prompt", {});
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(session.model?.id, "standard");
    assert.equal(session.thinkingLevel, "high");
    assert.match(before?.systemPrompt ?? "", /## Cognitive Routing Cue/);
    assert.ok(runner.getActiveTools().includes("freeflow_switch_profile"));
    assert.equal(
      session.sessionManager
        .getEntries()
        .some((entry) => entry.type === "custom" && entry.customType === "freeflow-cognitive-routing-inactive"),
      false,
    );
  } finally {
    await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
    session.dispose();
    await rm(cwd, { recursive: true, force: true });
  }
});

test("stock Pi settings offer only model-supported thinking levels", async () => {
  let settingsText = "";
  const uiContext = {
    setStatus() {},
    notify() {},
    custom: async (factory) => {
      const component = factory({ requestRender() {} }, testTheme, {}, () => {});
      for (let index = 0; index < 5; index += 1) component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      for (let index = 0; index < 10; index += 1) {
        if (component.render(120).join("\n").includes("→ faux/limited")) break;
        component.handleInput("\u001b[B");
      }
      component.handleInput("\r");
      settingsText = component.render(120).join("\n");
      component.handleInput("\u001b");
      component.handleInput("\u001b");
      return undefined;
    },
  };
  const { cwd, session } = await createStockPiSession({ mode: "tui", uiContext });
  try {
    const registry = session.extensionRunner.createContext().modelRegistry;
    assert.equal(typeof registry.clampThinkingLevel, "undefined");

    await session.extensionRunner
      .getCommand("freeflow")
      .handler("settings", session.extensionRunner.createCommandContext());

    assert.match(settingsText, /Choose effort · faux\/limited/);
    assert.doesNotMatch(settingsText, /\bmax\b/);
    assert.doesNotMatch(settingsText, /\bxhigh\b/);
  } finally {
    await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
    session.dispose();
    await rm(cwd, { recursive: true, force: true });
  }
});

function flushPiEvents() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function assertStockPiActivated(session) {
  const runner = session.extensionRunner;
  const before = await runner.emitBeforeAgentStart("first prompt", undefined, "base prompt", {});
  await flushPiEvents();
  assert.equal(session.model?.id, "standard");
  assert.equal(session.thinkingLevel, "high");
  assert.match(before?.systemPrompt ?? "", /## Cognitive Routing Cue/);
  assert.ok(runner.getActiveTools().includes("freeflow_switch_profile"));
}

test("stock Pi keeps profile switching internal and restores it across reload", async () => {
  const uiContext = { setStatus() {}, notify() {} };
  const { cwd, session } = await createStockPiSession({ mode: "tui", uiContext });
  try {
    await assertStockPiActivated(session);
    const switchTool = session.extensionRunner.getToolDefinition("freeflow_switch_profile");
    assert.ok(switchTool);

    const switched = await switchTool.execute(
      "stock-pi-switch",
      { target: "reasoning", reason: "Need deeper analysis." },
      undefined,
      undefined,
      session.extensionRunner.createContext(),
    );
    await flushPiEvents();

    assert.deepEqual(switched.details.result, {
      status: "active",
      changed: true,
      from: "standard",
      to: "reasoning",
      profile: "reasoning",
    });
    assert.equal(session.model?.id, "reasoning");
    assert.equal(session.thinkingLevel, "max");
    assert.ok(session.extensionRunner.getActiveTools().includes("freeflow_switch_profile"));

    await session.reload();

    assert.equal(session.model?.id, "reasoning");
    assert.equal(session.thinkingLevel, "max");
    assert.ok(session.extensionRunner.getActiveTools().includes("freeflow_switch_profile"));
  } finally {
    await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
    session.dispose();
    await rm(cwd, { recursive: true, force: true });
  }
});

test("stock Pi deactivates on a native model change and reactivates explicitly", async () => {
  const { cwd, session } = await createStockPiSession();
  try {
    await assertStockPiActivated(session);
    const runner = session.extensionRunner;
    const ctx = runner.createContext();
    const reasoningModel = ctx.modelRegistry.find("faux", "reasoning");
    assert.ok(reasoningModel);

    await session.setModel(reasoningModel);
    await flushPiEvents();

    assert.equal(session.model?.id, "reasoning");
    assert.equal(session.thinkingLevel, "high");
    assert.equal(runner.getActiveTools().includes("freeflow_switch_profile"), false);
    assert.ok(
      session.sessionManager
        .getEntries()
        .some((entry) => entry.type === "custom" && entry.customType === "freeflow-cognitive-routing-inactive"),
    );

    session.setThinkingLevel("max");
    await flushPiEvents();
    assert.equal(session.thinkingLevel, "max");

    await runner.getCommand("freeflow").handler("profile auto", runner.createCommandContext());
    await flushPiEvents();

    assert.equal(session.model?.id, "reasoning");
    assert.equal(session.thinkingLevel, "max");
    assert.ok(session.extensionRunner.getActiveTools().includes("freeflow_switch_profile"));
  } finally {
    await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
    session.dispose();
    await rm(cwd, { recursive: true, force: true });
  }
});
