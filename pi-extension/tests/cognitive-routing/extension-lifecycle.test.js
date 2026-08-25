import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import freeflowExtension from "../../dist/index.js";
import { PIFLOW_HOST } from "./host-fixture.js";

function createExtensionHost(
  { rejectReturnRestore = false, rejectAcquire = false } = {},
  extension = freeflowExtension,
) {
  const handlers = new Map();
  const tools = [];
  const commands = [];
  const shortcuts = [];
  const entries = [];
  const operations = [];
  let activeToolNames;
  let shouldRejectAcquire = rejectAcquire;
  const state = {
    model: { provider: "faux", id: "return" },
    thinkingLevel: "medium",
  };
  const pi = {
    host: PIFLOW_HOST,
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
    appendEntryDurable(customType, data) {
      operations.push("prepare");
      entries.push({ type: "custom", customType, data });
    },
    async acquireModelStateControl() {
      operations.push("acquire");
      if (shouldRejectAcquire) return { status: "busy" };
      return {
        status: "acquired",
        lease: {
          async setState(request) {
            operations.push("setState");
            if (rejectReturnRestore && request.modelId === "return") return { status: "rejected" };
            state.model = { provider: request.provider, id: request.modelId };
            state.thinkingLevel = request.thinkingLevel;
            entries.push({
              type: "model_state_change",
              provider: request.provider,
              modelId: request.modelId,
              thinkingLevel: request.thinkingLevel,
              correlationId: request.correlationId,
            });
            return { status: "applied" };
          },
          async release() {
            operations.push("release");
            return { status: "released" };
          },
        },
      };
    },
    getAllTools() {
      return tools.map((tool) => ({ name: tool.name }));
    },
    getActiveTools() {
      return tools.map((tool) => tool.name);
    },
    setActiveTools(names) {
      activeToolNames = [...names];
    },
    sendUserMessage() {},
  };
  extension(pi);
  return {
    commands,
    entries,
    handlers,
    operations,
    pi,
    shortcuts,
    state,
    tools,
    activeToolNames: () => activeToolNames ?? [],
    setRejectAcquire(value) {
      shouldRejectAcquire = value;
    },
  };
}

function createContext(cwd, host) {
  return {
    cwd,
    mode: "print",
    hasUI: false,
    model: host.state.model,
    thinkingLevel: host.state.thinkingLevel,
    modelRegistry: {
      find(provider, modelId) {
        if (provider !== "faux" || !["standard", "reasoning", "return"].includes(modelId)) return undefined;
        return { provider, id: modelId };
      },
      async getApiKeyAndHeaders() {
        return { ok: true };
      },
      clampThinkingLevel(_model, level) {
        return level;
      },
    },
    modelStateProvenance: {},
    sessionManager: {
      getEntries() {
        return host.entries;
      },
      getBranch() {
        return host.entries;
      },
      buildContextEntries() {
        return host.entries;
      },
    },
    ui: {
      notify() {},
      setStatus() {},
    },
  };
}

test("registered shortcuts cycle manual holds and automatic profiles", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-cognitive-routing-shortcuts-"));
  await mkdir(join(cwd, ".freeflow"));
  await writeFile(
    join(cwd, ".freeflow", "config.json"),
    JSON.stringify({
      cognitiveRouting: {
        enabled: true,
        profiles: {
          standard: { provider: "faux", model: "standard", thinkingLevel: "high" },
          reasoning: { provider: "faux", model: "reasoning", thinkingLevel: "max" },
        },
      },
    }),
  );
  const host = createExtensionHost();
  const ctx = createContext(cwd, host);
  ctx.isIdle = () => true;
  try {
    await host.handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
    const cycle = host.shortcuts.find(({ shortcut }) => shortcut === "ctrl+shift+r");
    const automatic = host.shortcuts.find(({ shortcut }) => shortcut === "ctrl+shift+a");
    assert.ok(cycle);
    assert.ok(automatic);

    await cycle.definition.handler(ctx);
    assert.equal(host.entries.at(-1).modelId, "reasoning");
    await automatic.definition.handler(ctx);
    assert.equal(host.entries.at(-1).customType, "freeflow-cognitive-routing-control");
    assert.equal(host.entries.filter((entry) => entry.modelId).at(-1).modelId, "reasoning");
    await automatic.definition.handler(ctx);
    assert.equal(host.entries.at(-1).modelId, "standard");
    await automatic.definition.handler(ctx);
    assert.equal(host.entries.at(-1).modelId, "reasoning");
    const automaticIntent = host.entries
      .filter((entry) => entry.customType === "freeflow-cognitive-routing-intent")
      .at(-1);
    assert.equal(automaticIntent.data.source, "user");
    assert.equal(automaticIntent.data.mechanism, "profile-shortcut");
    assert.equal(automaticIntent.data.reason, "Cycle automatic profile to reasoning.");
    assert.deepEqual(host.operations, [
      "prepare",
      "acquire",
      "setState",
      "prepare",
      "setState",
      "prepare",
      "prepare",
      "setState",
      "prepare",
      "setState",
    ]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("explicit startup model provenance suppresses lifecycle activation", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-cognitive-routing-suppressed-"));
  await mkdir(join(cwd, ".freeflow"));
  await writeFile(
    join(cwd, ".freeflow", "config.json"),
    JSON.stringify({
      cognitiveRouting: {
        enabled: true,
        profiles: {
          standard: { provider: "faux", model: "standard", thinkingLevel: "high" },
          reasoning: { provider: "faux", model: "reasoning", thinkingLevel: "max" },
        },
      },
    }),
  );
  const host = createExtensionHost();
  const ctx = createContext(cwd, host);
  ctx.modelStateProvenance = { explicitModel: true };
  try {
    await host.handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
    assert.deepEqual(host.operations, []);
    assert.deepEqual(host.entries, []);
    assert.deepEqual(host.state, { model: { provider: "faux", id: "return" }, thinkingLevel: "medium" });

    const before = await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.equal(before.message, undefined);
    assert.doesNotMatch(before.systemPrompt, /## Cognitive Routing Cue/);
    const resources = await host.handlers.get("resources_discover")({ cwd }, ctx);
    assert.ok(!resources.skillPaths.some((path) => path.endsWith("/capabilities/cognitive-routing/SKILL.md")));
    assert.ok(!host.activeToolNames().includes("freeflow_switch_profile"));
    const providerContext = await host.handlers.get("context")({ messages: [] }, ctx);
    assert.match(providerContext.messages.at(-1).content, /Cognitive Routing: unavailable/);
    assert.match(providerContext.messages.at(-1).content, /Control: `unavailable`/);
    assert.match(providerContext.messages.at(-1).content, /Profile: `unavailable`/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Cognitive Routing activation failure hides model-facing routing surfaces", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-cognitive-routing-activation-failure-"));
  await mkdir(join(cwd, ".freeflow"));
  await writeFile(
    join(cwd, ".freeflow", "config.json"),
    JSON.stringify({
      cognitiveRouting: {
        enabled: true,
        profiles: {
          standard: { provider: "faux", model: "standard", thinkingLevel: "high" },
          reasoning: { provider: "faux", model: "reasoning", thinkingLevel: "max" },
        },
      },
    }),
  );
  const host = createExtensionHost({ rejectAcquire: true });
  const ctx = createContext(cwd, host);
  try {
    await host.handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
    const before = await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.equal(before.message, undefined);
    assert.doesNotMatch(before.systemPrompt, /## Cognitive Routing Cue/);
    const resources = await host.handlers.get("resources_discover")({ cwd }, ctx);
    assert.ok(!resources.skillPaths.some((path) => path.endsWith("/capabilities/cognitive-routing/SKILL.md")));
    assert.ok(!host.activeToolNames().includes("freeflow_switch_profile"));
    const providerContext = await host.handlers.get("context")({ messages: [] }, ctx);
    assert.match(providerContext.messages.at(-1).content, /Cognitive Routing: unavailable/);
    assert.match(providerContext.messages.at(-1).content, /Control: `unavailable`/);
    assert.match(providerContext.messages.at(-1).content, /Profile: `unavailable`/);
  } finally {
    await host.handlers.get("session_shutdown")({ type: "session_shutdown", reason: "test-cleanup" }, ctx);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Cognitive Routing retries activation after a transient failure", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-cognitive-routing-activation-retry-"));
  await mkdir(join(cwd, ".freeflow"));
  await writeFile(
    join(cwd, ".freeflow", "config.json"),
    JSON.stringify({
      cognitiveRouting: {
        enabled: true,
        profiles: {
          standard: { provider: "faux", model: "standard", thinkingLevel: "high" },
          reasoning: { provider: "faux", model: "reasoning", thinkingLevel: "max" },
        },
      },
    }),
  );
  const host = createExtensionHost({ rejectAcquire: true });
  const ctx = createContext(cwd, host);
  try {
    await host.handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
    const first = await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.doesNotMatch(first.systemPrompt, /## Cognitive Routing Cue/);
    host.setRejectAcquire(false);
    const second = await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.match(second.systemPrompt, /## Cognitive Routing Cue/);
    const providerContext = await host.handlers.get("context")({ messages: [] }, ctx);
    assert.match(providerContext.messages.at(-1).content, /Cognitive Routing: active/);
    assert.match(providerContext.messages.at(-1).content, /Control: `automatic`/);
    assert.match(providerContext.messages.at(-1).content, /Profile: `standard`/);
    assert.ok(host.operations.includes("setState"));
  } finally {
    await host.handlers.get("session_shutdown")({ type: "session_shutdown", reason: "test-cleanup" }, ctx);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("missing Cognitive Routing prompt prevents lifecycle activation", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-cognitive-routing-prompt-missing-"));
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-cognitive-routing-prompt-missing-repo-"));
  await mkdir(join(cwd, ".freeflow"));
  await writeFile(
    join(cwd, ".freeflow", "config.json"),
    JSON.stringify({
      cognitiveRouting: {
        enabled: true,
        profiles: {
          standard: { provider: "faux", model: "standard", thinkingLevel: "high" },
          reasoning: { provider: "faux", model: "reasoning", thinkingLevel: "max" },
        },
      },
    }),
  );
  try {
    await cp(join(process.cwd(), "pi-extension", "dist"), join(root, "pi-extension", "dist"), { recursive: true });
    await cp(join(process.cwd(), "runtime", "prompts"), join(root, "runtime", "prompts"), { recursive: true });
    await symlink(join(process.cwd(), "node_modules"), join(root, "node_modules"), "dir");
    await rm(join(root, "runtime", "prompts", "cognitive-routing.md"));
    const extension = (
      await import(
        `${pathToFileURL(join(root, "pi-extension", "dist", "index.js")).href}?missing-routing=${Date.now()}`
      )
    ).default;
    const host = createExtensionHost({}, extension);
    const ctx = createContext(cwd, host);
    await host.handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
    const before = await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);

    assert.deepEqual(host.operations, []);
    assert.doesNotMatch(before.systemPrompt, /## Cognitive Routing Cue/);
    assert.ok(!host.activeToolNames().includes("freeflow_switch_profile"));
    const providerContext = await host.handlers.get("context")({ messages: [] }, ctx);
    assert.match(providerContext.messages.at(-1).content, /Cognitive Routing: unavailable/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  }
});

test("new empty sessions do not persist Cognitive Routing state until the first prompt", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-cognitive-routing-lazy-start-"));
  await mkdir(join(cwd, ".freeflow"));
  await writeFile(
    join(cwd, ".freeflow", "config.json"),
    JSON.stringify({
      cognitiveRouting: {
        enabled: true,
        profiles: {
          standard: { provider: "faux", model: "standard", thinkingLevel: "high" },
          reasoning: { provider: "faux", model: "reasoning", thinkingLevel: "max" },
        },
      },
    }),
  );
  const host = createExtensionHost();
  const ctx = createContext(cwd, host);
  try {
    await host.handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);

    assert.deepEqual(host.operations, []);
    assert.deepEqual(host.entries, []);

    const beforeAgentStart = await host.handlers.get("before_agent_start")(
      { prompt: "hello", systemPrompt: "base prompt" },
      ctx,
    );
    assert.deepEqual(host.operations.slice(0, 3), ["prepare", "acquire", "setState"]);
    assert.equal(host.entries[0].customType, "freeflow-cognitive-routing-intent");
    assert.match(beforeAgentStart.systemPrompt, /## Cognitive Routing Cue/);
    assert.doesNotMatch(beforeAgentStart.systemPrompt, /^# Automatic Routing Kernel$/m);
    assert.equal(beforeAgentStart.message, undefined);
  } finally {
    await host.handlers.get("session_shutdown")({ type: "session_shutdown", reason: "test-cleanup" }, ctx);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("new sessions honor each configured Cognitive Routing startup combination", async () => {
  const combinations = [
    ["automatic", "standard"],
    ["automatic", "reasoning"],
    ["manual", "standard"],
    ["manual", "reasoning"],
  ];

  for (const [control, profile] of combinations) {
    const cwd = await mkdtemp(join(tmpdir(), `freeflow-cognitive-routing-start-${control}-${profile}-`));
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({
        cognitiveRouting: {
          enabled: true,
          sessionStart: { control, profile },
          profiles: {
            standard: { provider: "faux", model: "standard", thinkingLevel: "high" },
            reasoning: { provider: "faux", model: "reasoning", thinkingLevel: "max" },
          },
        },
      }),
    );

    const host = createExtensionHost();
    const ctx = createContext(cwd, host);
    try {
      await host.handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
      await host.handlers.get("before_agent_start")({ prompt: "hello", systemPrompt: "base prompt" }, ctx);

      assert.equal(host.entries.filter((entry) => entry.modelId).at(-1).modelId, profile);
      const activation = host.entries.find(
        (entry) => entry.customType === "freeflow-cognitive-routing-intent" && entry.data.kind === "activation",
      );
      assert.equal(activation.data.profile, profile);
      assert.equal(activation.data.control, control);
    } finally {
      await host.handlers.get("session_shutdown")({ type: "session_shutdown", reason: "test-cleanup" }, ctx);
      await rm(cwd, { recursive: true, force: true });
    }
  }
});

test("editing session-start settings does not activate the current empty session", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-cognitive-routing-session-start-current-session-"));
  await mkdir(join(cwd, ".freeflow"));
  await writeFile(
    join(cwd, ".freeflow", "config.json"),
    JSON.stringify({
      cognitiveRouting: {
        enabled: true,
        profiles: {
          standard: { provider: "faux", model: "standard", thinkingLevel: "high" },
          reasoning: { provider: "faux", model: "reasoning", thinkingLevel: "max" },
        },
      },
    }),
  );

  const host = createExtensionHost();
  const ctx = createContext(cwd, host);
  ctx.mode = "tui";
  ctx.hasUI = true;
  ctx.isIdle = () => true;
  ctx.ui.custom = async (factory) => {
    let result;
    const theme = {
      fg(_color, text) {
        return text;
      },
      bold(text) {
        return text;
      },
    };
    const component = factory({ requestRender() {} }, theme, {}, (value) => {
      result = value;
    });
    for (let index = 0; index < 5; index += 1) component.handleInput("\u001b[B");
    component.handleInput("\r");
    for (let index = 0; index < 3; index += 1) component.handleInput("\u001b[B");
    component.handleInput("\r");
    component.handleInput("\u001b[B");
    component.handleInput("\u001b[B");
    component.handleInput("\r");
    await component.waitForWrites();
    component.handleInput("\u001b");
    component.handleInput("\u001b");
    return result;
  };

  try {
    await host.handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
    host.operations.length = 0;
    await host.commands.find((command) => command.name === "freeflow").definition.handler("settings", ctx);

    assert.deepEqual(host.operations, []);
    assert.deepEqual(host.state, { model: { provider: "faux", id: "return" }, thinkingLevel: "medium" });
    assert.equal(host.entries.filter((entry) => entry.modelId).length, 0);
    const saved = JSON.parse(await readFile(join(cwd, ".freeflow", "local.json"), "utf8"));
    assert.equal(saved.cognitiveRouting.sessionStart.control, "manual");
  } finally {
    await host.handlers.get("session_shutdown")({ type: "session_shutdown", reason: "test-cleanup" }, ctx);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("child extension activation does not deactivate the parent routing controller", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-cognitive-routing-child-activation-"));
  await mkdir(join(cwd, ".freeflow"));
  await writeFile(
    join(cwd, ".freeflow", "config.json"),
    JSON.stringify({
      cognitiveRouting: {
        enabled: true,
        profiles: {
          standard: { provider: "faux", model: "standard", thinkingLevel: "high" },
          reasoning: { provider: "faux", model: "reasoning", thinkingLevel: "max" },
        },
      },
    }),
  );
  const parent = createExtensionHost();
  const parentContext = createContext(cwd, parent);
  const child = createExtensionHost();
  const childContext = createContext(cwd, child);
  childContext.modelStateProvenance = { explicitModel: true, explicitThinking: true };
  try {
    await parent.handlers.get("session_start")({ type: "session_start", reason: "startup" }, parentContext);
    await parent.handlers.get("before_agent_start")({ prompt: "hello", systemPrompt: "base prompt" }, parentContext);
    assert.deepEqual(parent.state, { model: { provider: "faux", id: "standard" }, thinkingLevel: "high" });

    await child.handlers.get("session_start")({ type: "session_start", reason: "startup" }, childContext);

    assert.deepEqual(parent.state, { model: { provider: "faux", id: "standard" }, thinkingLevel: "high" });
    assert.equal(
      parent.entries.some((entry) => entry.kind === "closing"),
      false,
    );
  } finally {
    await child.handlers.get("session_shutdown")({ type: "session_shutdown", reason: "test-cleanup" }, childContext);
    await parent.handlers.get("session_shutdown")({ type: "session_shutdown", reason: "test-cleanup" }, parentContext);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("registered profile commands create manual holds and release them without a model entry", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-cognitive-routing-command-"));
  await mkdir(join(cwd, ".freeflow"));
  await writeFile(
    join(cwd, ".freeflow", "config.json"),
    JSON.stringify({
      cognitiveRouting: {
        enabled: true,
        profiles: {
          standard: { provider: "faux", model: "standard", thinkingLevel: "high" },
          reasoning: { provider: "faux", model: "reasoning", thinkingLevel: "max" },
        },
      },
    }),
  );
  const host = createExtensionHost();
  const ctx = createContext(cwd, host);
  try {
    await host.handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
    const command = host.commands.find(({ name }) => name === "freeflow");
    assert.ok(command);
    assert.deepEqual(
      command.definition.getArgumentCompletions("profile r").map(({ value }) => value),
      ["profile reasoning"],
    );

    await command.definition.handler("profile reasoning", ctx);
    assert.deepEqual(host.state, { model: { provider: "faux", id: "reasoning" }, thinkingLevel: "max" });
    assert.deepEqual(host.operations, ["prepare", "acquire", "setState", "prepare", "setState"]);
    assert.ok(!host.activeToolNames().includes("freeflow_switch_profile"));

    await command.definition.handler("profile auto", ctx);
    assert.deepEqual(host.state, { model: { provider: "faux", id: "reasoning" }, thinkingLevel: "max" });
    assert.deepEqual(host.operations, ["prepare", "acquire", "setState", "prepare", "setState", "prepare"]);
    assert.equal(host.entries.at(-1).customType, "freeflow-cognitive-routing-control");
    assert.ok(host.activeToolNames().includes("freeflow_switch_profile"));

    const switchTool = host.tools.find((tool) => tool.name === "freeflow_switch_profile");
    const switchResult = await switchTool.execute(
      "call-1",
      { target: "standard", reason: "Return to the standard profile." },
      undefined,
      undefined,
      ctx,
    );
    assert.deepEqual(switchResult.details.result, {
      status: "active",
      changed: true,
      from: "reasoning",
      to: "standard",
      profile: "standard",
    });
    assert.deepEqual(host.state, { model: { provider: "faux", id: "standard" }, thinkingLevel: "high" });
    assert.deepEqual(host.operations, [
      "prepare",
      "acquire",
      "setState",
      "prepare",
      "setState",
      "prepare",
      "prepare",
      "setState",
    ]);
  } finally {
    await host.handlers.get("session_shutdown")({ type: "session_shutdown", reason: "test-cleanup" }, ctx);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("settled runs preserve automatic reasoning and manual holds", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-cognitive-routing-settled-"));
  await mkdir(join(cwd, ".freeflow"));
  await writeFile(
    join(cwd, ".freeflow", "config.json"),
    JSON.stringify({
      cognitiveRouting: {
        enabled: true,
        profiles: {
          standard: { provider: "faux", model: "standard", thinkingLevel: "high" },
          reasoning: { provider: "faux", model: "reasoning", thinkingLevel: "max" },
        },
      },
    }),
  );
  const host = createExtensionHost();
  const ctx = createContext(cwd, host);
  try {
    await host.handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
    await host.handlers.get("before_agent_start")({ prompt: "hello", systemPrompt: "base prompt" }, ctx);
    const switchTool = host.tools.find((tool) => tool.name === "freeflow_switch_profile");
    await switchTool.execute(
      "call-1",
      { target: "reasoning", reason: "Need a deeper analysis." },
      undefined,
      undefined,
      ctx,
    );
    assert.deepEqual(host.state, { model: { provider: "faux", id: "reasoning" }, thinkingLevel: "max" });

    const callsBeforeSettledAutomatic = host.operations.length;
    await host.handlers.get("agent_settled")({ type: "agent_settled" }, ctx);
    assert.equal(host.operations.length, callsBeforeSettledAutomatic);
    assert.deepEqual(host.state, { model: { provider: "faux", id: "reasoning" }, thinkingLevel: "max" });

    const command = host.commands.find(({ name }) => name === "freeflow");
    await command.definition.handler("profile reasoning", ctx);
    const callsBeforeSettledManual = host.operations.length;
    await host.handlers.get("agent_settled")({ type: "agent_settled" }, ctx);
    assert.equal(host.operations.length, callsBeforeSettledManual);
    assert.deepEqual(host.state, { model: { provider: "faux", id: "reasoning" }, thinkingLevel: "max" });
  } finally {
    await host.handlers.get("session_shutdown")({ type: "session_shutdown", reason: "test-cleanup" }, ctx);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("reload preserves a manual reasoning hold after lease rotation", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-cognitive-routing-reload-manual-"));
  await mkdir(join(cwd, ".freeflow"));
  await writeFile(
    join(cwd, ".freeflow", "config.json"),
    JSON.stringify({
      cognitiveRouting: {
        enabled: true,
        profiles: {
          standard: { provider: "faux", model: "standard", thinkingLevel: "high" },
          reasoning: { provider: "faux", model: "reasoning", thinkingLevel: "max" },
        },
      },
    }),
  );
  const host = createExtensionHost();
  const ctx = createContext(cwd, host);
  ctx.isIdle = () => true;
  try {
    await host.handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
    await host.commands.find(({ name }) => name === "freeflow").definition.handler("profile reasoning", ctx);
    await host.handlers.get("session_shutdown")({ type: "session_shutdown", reason: "reload" }, ctx);

    assert.deepEqual(host.state, { model: { provider: "faux", id: "return" }, thinkingLevel: "medium" });
    await host.handlers.get("session_start")({ type: "session_start", reason: "reload" }, ctx);

    assert.deepEqual(host.state, { model: { provider: "faux", id: "reasoning" }, thinkingLevel: "max" });
    assert.ok(!host.activeToolNames().includes("freeflow_switch_profile"));
    assert.deepEqual(host.state, { model: { provider: "faux", id: "reasoning" }, thinkingLevel: "max" });

    const operationsBeforeCompaction = [...host.operations];
    await host.handlers.get("session_compact")({ type: "session_compact" }, ctx);
    assert.deepEqual(host.operations, operationsBeforeCompaction);
    assert.deepEqual(host.state, { model: { provider: "faux", id: "reasoning" }, thinkingLevel: "max" });
    assert.ok(!host.activeToolNames().includes("freeflow_switch_profile"));
  } finally {
    await host.handlers.get("session_shutdown")({ type: "session_shutdown", reason: "test-cleanup" }, ctx);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("tree navigation retains the current profile without a supported branch choice", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-cognitive-routing-tree-"));
  await mkdir(join(cwd, ".freeflow"));
  await writeFile(
    join(cwd, ".freeflow", "config.json"),
    JSON.stringify({
      cognitiveRouting: {
        enabled: true,
        profiles: {
          standard: { provider: "faux", model: "standard", thinkingLevel: "high" },
          reasoning: { provider: "faux", model: "reasoning", thinkingLevel: "max" },
        },
      },
    }),
  );
  const host = createExtensionHost();
  const ctx = createContext(cwd, host);
  try {
    await host.handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
    const standardBranch = [...host.entries];
    const command = host.commands.find(({ name }) => name === "freeflow");
    await command.definition.handler("profile reasoning", ctx);
    assert.deepEqual(host.state, { model: { provider: "faux", id: "reasoning" }, thinkingLevel: "max" });

    ctx.sessionManager.getBranch = () => standardBranch;
    await host.handlers.get("session_tree")(
      { type: "session_tree", newLeafId: "standard", oldLeafId: "reasoning" },
      ctx,
    );

    assert.deepEqual(host.state, { model: { provider: "faux", id: "reasoning" }, thinkingLevel: "max" });
    assert.ok(!host.activeToolNames().includes("freeflow_switch_profile"));
  } finally {
    await host.handlers.get("session_shutdown")({ type: "session_shutdown", reason: "test-cleanup" }, ctx);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("compaction reconciles without changing an active routing pair", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-cognitive-routing-compact-"));
  await mkdir(join(cwd, ".freeflow"));
  await writeFile(
    join(cwd, ".freeflow", "config.json"),
    JSON.stringify({
      cognitiveRouting: {
        enabled: true,
        profiles: {
          standard: { provider: "faux", model: "standard", thinkingLevel: "high" },
          reasoning: { provider: "faux", model: "reasoning", thinkingLevel: "max" },
        },
      },
    }),
  );
  const host = createExtensionHost();
  const ctx = createContext(cwd, host);
  try {
    await host.handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
    await host.handlers.get("before_agent_start")({ prompt: "hello", systemPrompt: "base prompt" }, ctx);
    const operationsBeforeCompaction = [...host.operations];
    await host.handlers.get("session_compact")({ type: "session_compact" }, ctx);

    assert.deepEqual(host.operations, operationsBeforeCompaction);
    assert.deepEqual(host.state, { model: { provider: "faux", id: "standard" }, thinkingLevel: "high" });
    assert.ok(host.activeToolNames().includes("freeflow_switch_profile"));
  } finally {
    await host.handlers.get("session_shutdown")({ type: "session_shutdown", reason: "test-cleanup" }, ctx);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("reload with disabled configuration stays inactive after successful cleanup", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-cognitive-routing-reload-disabled-"));
  await mkdir(join(cwd, ".freeflow"));
  const configPath = join(cwd, ".freeflow", "config.json");
  await writeFile(
    configPath,
    JSON.stringify({
      cognitiveRouting: {
        enabled: true,
        profiles: {
          standard: { provider: "faux", model: "standard", thinkingLevel: "high" },
          reasoning: { provider: "faux", model: "reasoning", thinkingLevel: "max" },
        },
      },
    }),
  );
  const host = createExtensionHost();
  const ctx = createContext(cwd, host);
  try {
    await host.handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
    await host.handlers.get("session_shutdown")({ type: "session_shutdown", reason: "reload" }, ctx);
    await writeFile(configPath, JSON.stringify({ cognitiveRouting: { enabled: false } }));
    const operationsBeforeDisabledStart = [...host.operations];

    await host.handlers.get("session_start")({ type: "session_start", reason: "reload" }, ctx);

    assert.deepEqual(host.operations, operationsBeforeDisabledStart);
    assert.deepEqual(host.state, { model: { provider: "faux", id: "return" }, thinkingLevel: "medium" });
    assert.ok(!host.activeToolNames().includes("freeflow_switch_profile"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("session replacement restores the pair before releasing routing ownership", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-cognitive-routing-replacement-"));
  await mkdir(join(cwd, ".freeflow"));
  await writeFile(
    join(cwd, ".freeflow", "config.json"),
    JSON.stringify({
      cognitiveRouting: {
        enabled: true,
        profiles: {
          standard: { provider: "faux", model: "standard", thinkingLevel: "high" },
          reasoning: { provider: "faux", model: "reasoning", thinkingLevel: "max" },
        },
      },
    }),
  );
  const host = createExtensionHost();
  const ctx = createContext(cwd, host);
  try {
    await host.handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
    await host.handlers.get("before_agent_start")({ prompt: "hello", systemPrompt: "base prompt" }, ctx);
    await host.handlers.get("session_shutdown")({ type: "session_shutdown", reason: "new" }, ctx);

    assert.deepEqual(host.operations, ["prepare", "acquire", "setState", "prepare", "setState", "release"]);
    assert.deepEqual(host.state, { model: { provider: "faux", id: "return" }, thinkingLevel: "medium" });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("reload recovery stays inactive after an unmatched closing intent", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-cognitive-routing-reload-failure-"));
  await mkdir(join(cwd, ".freeflow"));
  await writeFile(
    join(cwd, ".freeflow", "config.json"),
    JSON.stringify({
      cognitiveRouting: {
        enabled: true,
        profiles: {
          standard: { provider: "faux", model: "standard", thinkingLevel: "high" },
          reasoning: { provider: "faux", model: "reasoning", thinkingLevel: "max" },
        },
      },
    }),
  );
  const host = createExtensionHost({ rejectReturnRestore: true });
  const ctx = createContext(cwd, host);
  try {
    await host.handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
    await host.handlers.get("before_agent_start")({ prompt: "hello", systemPrompt: "base prompt" }, ctx);
    await host.handlers.get("session_shutdown")({ type: "session_shutdown", reason: "reload" }, ctx);
    assert.deepEqual(host.operations, ["prepare", "acquire", "setState", "prepare", "setState", "release"]);
    assert.equal(host.entries.at(-1).customType, "freeflow-cognitive-routing-intent");
    assert.equal(host.entries.at(-1).data.kind, "closing");

    await host.handlers.get("session_start")({ type: "session_start", reason: "reload" }, ctx);
    assert.deepEqual(host.operations, [
      "prepare",
      "acquire",
      "setState",
      "prepare",
      "setState",
      "release",
      "prepare",
      "acquire",
      "setState",
      "release",
    ]);
    assert.equal(host.entries.at(-1).data.phase, "prepared");
    assert.ok(!host.activeToolNames().includes("freeflow_switch_profile"));
  } finally {
    await host.handlers.get("session_shutdown")({ type: "session_shutdown", reason: "test-cleanup" }, ctx);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi delivers a compact Cognitive Routing cue and volatile state per turn", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-cognitive-routing-compact-delivery-"));
  await mkdir(join(cwd, ".freeflow"));
  await writeFile(
    join(cwd, ".freeflow", "config.json"),
    JSON.stringify({
      cognitiveRouting: {
        enabled: true,
        profiles: {
          standard: { provider: "faux", model: "standard", thinkingLevel: "high" },
          reasoning: { provider: "faux", model: "reasoning", thinkingLevel: "max" },
        },
      },
    }),
  );
  const host = createExtensionHost();
  const ctx = createContext(cwd, host);
  try {
    await host.handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
    const beforeAgentStart = host.handlers.get("before_agent_start");
    const first = await beforeAgentStart({ systemPrompt: "base prompt" }, ctx);

    assert.equal(first.message, undefined);
    assert.match(first.systemPrompt, /## Cognitive Routing Cue/);
    assert.match(
      first.systemPrompt,
      /governs compute placement across Freeflow methods.*skill has not been read in the current context.*read it before applying another Freeflow skill or taking task Act/s,
    );
    assert.match(
      first.systemPrompt,
      /every authorized execution-bearing bounded activity is Reasoning-led.*Standard takes task Act only inside delegation/s,
    );
    assert.ok(
      first.systemPrompt.indexOf("## Action Selection Cue") < first.systemPrompt.indexOf("## Cognitive Routing Cue"),
    );
    assert.doesNotMatch(first.systemPrompt, /^# Cognitive Routing$/m);
    assert.doesNotMatch(first.systemPrompt, /^# Automatic Routing Kernel$/m);

    const contextHandler = host.handlers.get("context");
    const firstContext = await contextHandler({ messages: [] }, ctx);
    assert.equal(firstContext.messages.length, 1);
    assert.equal(firstContext.messages[0].customType, "freeflow-runtime-state");
    assert.match(firstContext.messages[0].content, /Cognitive Routing: active/);
    assert.match(firstContext.messages[0].content, /Control: `automatic`/);
    assert.match(firstContext.messages[0].content, /Profile: `standard`/);

    const second = await beforeAgentStart({ systemPrompt: "base prompt" }, ctx);
    assert.equal(second.message, undefined);
    assert.equal((second.systemPrompt.match(/## Cognitive Routing Cue/g) ?? []).length, 1);
  } finally {
    await host.handlers.get("session_shutdown")({ type: "session_shutdown", reason: "test-cleanup" }, ctx);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi refreshes volatile Cognitive Routing state after a profile switch", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-cognitive-routing-volatile-state-"));
  await mkdir(join(cwd, ".freeflow"));
  await writeFile(
    join(cwd, ".freeflow", "config.json"),
    JSON.stringify({
      cognitiveRouting: {
        enabled: true,
        profiles: {
          standard: { provider: "faux", model: "standard", thinkingLevel: "high" },
          reasoning: { provider: "faux", model: "reasoning", thinkingLevel: "max" },
        },
      },
    }),
  );
  const host = createExtensionHost();
  const ctx = createContext(cwd, host);
  try {
    await host.handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
    await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);

    const contextHandler = host.handlers.get("context");
    const standardContext = await contextHandler({ messages: [] }, ctx);
    assert.match(standardContext.messages[0].content, /Profile: `standard`/);

    const switchTool = host.tools.find((tool) => tool.name === "freeflow_switch_profile");
    const result = await switchTool.execute(
      "call-volatile-state",
      { target: "reasoning", reason: "Need a deeper analysis." },
      undefined,
      undefined,
      ctx,
    );
    assert.equal(result.details.result.to, "reasoning");

    const reasoningContext = await contextHandler({ messages: standardContext.messages }, ctx);
    assert.equal(reasoningContext.messages.length, 1);
    assert.match(reasoningContext.messages[0].content, /Control: `automatic`/);
    assert.match(reasoningContext.messages[0].content, /Profile: `reasoning`/);
    assert.doesNotMatch(reasoningContext.messages[0].content, /Profile: `standard`/);
  } finally {
    await host.handlers.get("session_shutdown")({ type: "session_shutdown", reason: "test-cleanup" }, ctx);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi keeps Cognitive Routing behind the Skills parent gate", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-cognitive-routing-skills-gate-"));
  await mkdir(join(cwd, ".freeflow"));
  await writeFile(
    join(cwd, ".freeflow", "config.json"),
    JSON.stringify({
      skills: { enabled: false },
      cognitiveRouting: {
        enabled: true,
        profiles: {
          standard: { provider: "faux", model: "standard", thinkingLevel: "high" },
          reasoning: { provider: "faux", model: "reasoning", thinkingLevel: "max" },
        },
      },
    }),
  );
  const host = createExtensionHost();
  const ctx = createContext(cwd, host);
  try {
    await host.handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
    const result = await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.equal(result.message, undefined);
    assert.doesNotMatch(result.systemPrompt, /## Cognitive Routing Cue/);
    assert.doesNotMatch(result.systemPrompt, /^# Cognitive Routing$/m);
    assert.ok(!host.activeToolNames().includes("freeflow_switch_profile"));
    const providerContext = await host.handlers.get("context")({ messages: [] }, ctx);
    assert.match(providerContext.messages[0].content, /Skills: inactive/);
    assert.match(providerContext.messages[0].content, /Cognitive Routing: inactive/);
  } finally {
    await host.handlers.get("session_shutdown")({ type: "session_shutdown", reason: "test-cleanup" }, ctx);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi lifecycle prepares, activates, restores, and releases Cognitive Routing ownership", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-cognitive-routing-extension-"));
  await mkdir(join(cwd, ".freeflow"));
  await writeFile(
    join(cwd, ".freeflow", "config.json"),
    JSON.stringify({
      cognitiveRouting: {
        enabled: true,
        profiles: {
          standard: { provider: "faux", model: "standard", thinkingLevel: "high" },
          reasoning: { provider: "faux", model: "reasoning", thinkingLevel: "max" },
        },
      },
    }),
  );
  const host = createExtensionHost();
  const ctx = createContext(cwd, host);
  try {
    await host.handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
    assert.deepEqual(host.operations, []);

    const beforeAgentStart = await host.handlers.get("before_agent_start")(
      { prompt: "hello", systemPrompt: "base prompt" },
      ctx,
    );
    assert.deepEqual(host.operations.slice(0, 3), ["prepare", "acquire", "setState"]);
    assert.deepEqual(host.state, { model: { provider: "faux", id: "standard" }, thinkingLevel: "high" });
    assert.equal(host.entries[0].customType, "freeflow-cognitive-routing-intent");
    assert.ok(host.activeToolNames().includes("freeflow_switch_profile"));
    assert.match(beforeAgentStart.systemPrompt, /## Cognitive Routing Cue/);
    assert.doesNotMatch(beforeAgentStart.systemPrompt, /^# Cognitive Routing$/m);
    assert.doesNotMatch(beforeAgentStart.systemPrompt, /^# Automatic Routing Kernel$/m);
    assert.equal(beforeAgentStart.message, undefined);

    const switchTool = host.tools.find((tool) => tool.name === "freeflow_switch_profile");
    await switchTool.execute(
      "call-1",
      { target: "reasoning", reason: "Continue the unresolved architecture decision." },
      undefined,
      undefined,
      ctx,
    );
    assert.deepEqual(host.state, { model: { provider: "faux", id: "reasoning" }, thinkingLevel: "max" });

    await host.handlers.get("session_shutdown")({ type: "session_shutdown", reason: "reload" }, ctx);

    assert.deepEqual(host.operations, [
      "prepare",
      "acquire",
      "setState",
      "prepare",
      "setState",
      "prepare",
      "setState",
      "release",
    ]);
    assert.deepEqual(host.state, { model: { provider: "faux", id: "return" }, thinkingLevel: "medium" });
    assert.equal(host.entries.at(-1).type, "model_state_change");
    assert.equal(host.entries.at(-1).modelId, "return");

    await host.handlers.get("session_start")({ type: "session_start", reason: "reload" }, ctx);
    assert.deepEqual(host.operations.slice(-3), ["prepare", "acquire", "setState"]);
    assert.deepEqual(host.state, { model: { provider: "faux", id: "reasoning" }, thinkingLevel: "max" });
    assert.ok(host.activeToolNames().includes("freeflow_switch_profile"));
    await host.handlers.get("session_shutdown")({ type: "session_shutdown", reason: "test-cleanup" }, ctx);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
