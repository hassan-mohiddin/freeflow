import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import freeflowExtension from "../../dist/index.js";
import { PIFLOW_HOST } from "./host-fixture.js";

function createExtensionHost({ rejectReturnRestore = false } = {}) {
  const handlers = new Map();
  const tools = [];
  const commands = [];
  const shortcuts = [];
  const entries = [];
  const operations = [];
  let activeToolNames;
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
  freeflowExtension(pi);
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

test("registered shortcuts cycle manual control and release it to automatic mode", async () => {
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
    assert.deepEqual(host.operations, ["prepare", "acquire", "setState", "prepare", "setState", "prepare"]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("freeflow_status reports the active manual runtime state", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-cognitive-routing-status-runtime-"));
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
    const statusTool = host.tools.find(({ name }) => name === "freeflow_status");
    const result = await statusTool.execute("status", { action: "status" }, undefined, undefined, ctx);
    const cognitiveRouting = result.details.result.effectiveConfig.cognitiveRouting;
    assert.equal(cognitiveRouting.effective, true);
    assert.equal(cognitiveRouting.runtimeStatus, "active");
    assert.equal(cognitiveRouting.runtime.activeProfile, "reasoning");
    assert.equal(cognitiveRouting.runtime.controlMode, "manual-reasoning");
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
  } finally {
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
    assert.deepEqual(switchResult.details.result, { status: "active", profile: "standard" });
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
    const statusTool = host.tools.find(({ name }) => name === "freeflow_status");
    const result = await statusTool.execute("status", { action: "status" }, undefined, undefined, ctx);
    const runtime = result.details.result.effectiveConfig.cognitiveRouting.runtime;
    assert.equal(runtime.activeProfile, "reasoning");
    assert.equal(runtime.controlMode, "manual-reasoning");

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

test("tree navigation reconciles to the target branch profile", async () => {
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

    assert.deepEqual(host.state, { model: { provider: "faux", id: "standard" }, thinkingLevel: "high" });
    assert.ok(host.activeToolNames().includes("freeflow_switch_profile"));
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

test("Pi delivers layered bootstrap once and the routing kernel on every turn", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-cognitive-routing-layered-delivery-"));
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

    assert.equal(first.message.customType, "freeflow-bootstrap");
    assert.match(first.message.content, /^# Freeflow Bootstrap/);
    assert.match(first.message.content, /# Freeflow Workflow Bootstrap/);
    assert.match(first.message.content, /# Freeflow Cognitive Routing Bootstrap/);
    assert.doesNotMatch(first.systemPrompt, /^# Cognitive Routing$/m);
    assert.match(first.systemPrompt, /^# Automatic Routing Kernel$/m);
    assert.match(first.systemPrompt, /## Cognitive Routing Runtime State/);

    host.entries.push({
      type: "custom_message",
      customType: first.message.customType,
      content: first.message.content,
      display: first.message.display,
      details: first.message.details,
    });
    const second = await beforeAgentStart({ systemPrompt: "base prompt" }, ctx);
    assert.equal(second.message, undefined);
    assert.match(second.systemPrompt, /^# Automatic Routing Kernel$/m);
    assert.equal((second.systemPrompt.match(/^# Automatic Routing Kernel$/gm) ?? []).length, 1);

    await writeFile(join(cwd, ".freeflow", "config.json"), JSON.stringify({ defaultMode: "workflow" }));
    const filtered = await host.handlers.get("context")(
      {
        messages: [
          {
            role: "custom",
            customType: first.message.customType,
            content: first.message.content,
            details: first.message.details,
          },
        ],
      },
      ctx,
    );
    assert.equal(filtered.messages.length, 1);
    assert.match(filtered.messages[0].content, /# Freeflow Workflow Bootstrap/);
    assert.doesNotMatch(filtered.messages[0].content, /# Freeflow Cognitive Routing Bootstrap/);

    const disabled = await beforeAgentStart({ systemPrompt: "base prompt" }, ctx);
    assert.equal(disabled.message, undefined);
    assert.doesNotMatch(disabled.systemPrompt, /^# Automatic Routing Kernel$/m);
  } finally {
    await host.handlers.get("session_shutdown")({ type: "session_shutdown", reason: "test-cleanup" }, ctx);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi keeps Cognitive Routing bootstrap independent of Workflow", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-cognitive-routing-independent-bootstrap-"));
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
    assert.equal(result.message.customType, "freeflow-cognitive-routing-bootstrap");
    assert.match(result.message.content, /# Freeflow Cognitive Routing Bootstrap/);
    assert.doesNotMatch(result.message.content, /# Freeflow Workflow Bootstrap/);
    assert.match(result.systemPrompt, /^# Automatic Routing Kernel$/m);
    assert.doesNotMatch(result.systemPrompt, /# Workflow/);
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

    assert.deepEqual(host.operations.slice(0, 3), ["prepare", "acquire", "setState"]);
    assert.deepEqual(host.state, { model: { provider: "faux", id: "standard" }, thinkingLevel: "high" });
    assert.equal(host.entries[0].customType, "freeflow-cognitive-routing-intent");
    assert.ok(host.activeToolNames().includes("freeflow_switch_profile"));
    const beforeAgentStart = await host.handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.doesNotMatch(beforeAgentStart.systemPrompt, /^# Cognitive Routing$/m);
    assert.match(beforeAgentStart.systemPrompt, /^# Automatic Routing Kernel$/m);
    assert.match(beforeAgentStart.systemPrompt, /## Cognitive Routing Runtime State/);
    assert.equal((beforeAgentStart.systemPrompt.match(/^# Automatic Routing Kernel$/gm) ?? []).length, 1);
    assert.match(beforeAgentStart.message.content, /# Freeflow Cognitive Routing Bootstrap/);

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
