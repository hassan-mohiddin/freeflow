import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import test from "node:test";

import freeflowExtension from "../../dist/index.js";
import { PIFLOW_HOST } from "../cognitive-routing/host-fixture.js";

function context(cwd) {
  return {
    cwd,
    sessionManager: {
      getEntries: () => [],
      getBranch: () => [],
      buildContextEntries: () => [],
    },
    ui: {
      setStatus() {},
      notify() {},
    },
  };
}

function loadExtension(extension = freeflowExtension, host = PIFLOW_HOST) {
  const handlers = new Map();
  const tools = [];
  let activeToolNames;
  const pi = {
    host,
    registerTool(tool) {
      const index = tools.findIndex((existing) => existing.name === tool.name);
      if (index >= 0) tools[index] = tool;
      else tools.push(tool);
    },
    registerCommand() {},
    registerShortcut() {},
    on(event, handler) {
      handlers.set(event, handler);
    },
    getAllTools() {
      return tools.map((tool) => ({ name: tool.name, sourceInfo: { source: "extension" } }));
    },
    getActiveTools() {
      return activeToolNames ?? tools.map((tool) => tool.name);
    },
    setActiveTools(names) {
      activeToolNames = [...names];
    },
  };
  extension(pi);
  return { handlers, activeToolNames: () => activeToolNames ?? tools.map((tool) => tool.name) };
}

async function configuredRepo(config) {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-prompt-architecture-"));
  await mkdir(join(cwd, ".freeflow"));
  await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify(config, null, 2), "utf8");
  return cwd;
}

function lastRuntimeState(messages) {
  return messages.findLast((message) => message.customType === "freeflow-runtime-state");
}

test("composes conditional prompt fragments, discoverable capabilities, and runtime state", async () => {
  const cwd = await configuredRepo({
    defaultMode: "workflow",
    contextVirtualization: true,
    conversationHistory: true,
  });
  try {
    const { handlers, activeToolNames } = loadExtension();
    const ctx = context(cwd);
    await handlers.get("session_start")({ type: "session_start" }, ctx);

    const before = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.equal(before.message, undefined);
    const prompt = before.systemPrompt;
    const order = [
      "# Freeflow Stable Guidance",
      "# Freeflow Interaction Contract",
      "## Shared Terms",
      "## Three Nested Loops",
      "## Workflow Cue",
      "## Action Selection Cue",
      "## Supported Exit",
      "## Context Virtualization Cue",
      "## Conversation History Cue",
    ].map((marker) => prompt.indexOf(marker));
    assert.ok(order.every((index) => index >= 0));
    assert.match(
      prompt,
      /\*\*Slice:\*\* one coherent outcome that can be executed and checked as a unit.*Track Work gives it durable identity/s,
    );
    assert.match(
      prompt,
      /After context compaction, clear, session resume or navigation, or ownership transfer.*reconstruct the current decision surface.*recover bounded task memory when it exists.*compare remembered state with live repository or environment evidence.*re-establish authority/s,
    );
    assert.deepEqual(
      order,
      [...order].sort((a, b) => a - b),
    );
    assert.doesNotMatch(prompt, /# Workflow\n/);
    assert.doesNotMatch(prompt, /# Cognitive Routing\n/);
    assert.doesNotMatch(prompt, /# Conversation History\n/);

    const providerContext = await handlers.get("context")({ messages: [] }, ctx);
    const runtimeState = lastRuntimeState(providerContext.messages);
    assert.ok(runtimeState);
    assert.match(runtimeState.content, /Skills: active/);
    assert.match(runtimeState.content, /Context Virtualization: active/);
    assert.match(runtimeState.content, /Conversation History: active/);
    assert.match(runtimeState.content, /Cognitive Routing: inactive/);

    const resources = await handlers.get("resources_discover")({ cwd }, ctx);
    assert.ok(resources.skillPaths.some((path) => path.endsWith("/skills/action-selection/SKILL.md")));
    assert.ok(resources.skillPaths.some((path) => path.endsWith("/capabilities/context-virtualization/SKILL.md")));
    assert.ok(resources.skillPaths.some((path) => path.endsWith("/capabilities/conversation-history/SKILL.md")));
    assert.ok(!resources.skillPaths.some((path) => path.endsWith("/capabilities/cognitive-routing/SKILL.md")));
    assert.ok(activeToolNames().includes("freeflow_context"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("provider context reuses the before-agent surface until the next provider turn", async () => {
  const cwd = await configuredRepo({ defaultMode: "workflow", contextVirtualization: true });
  try {
    const { handlers } = loadExtension();
    const ctx = context(cwd);
    await handlers.get("session_start")({ type: "session_start" }, ctx);

    const before = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.match(before.systemPrompt, /## Context Virtualization Cue/);

    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({ defaultMode: "workflow", skills: { enabled: false }, contextVirtualization: true }),
      "utf8",
    );
    const sameTurn = await handlers.get("context")({ messages: [] }, ctx);
    assert.match(lastRuntimeState(sameTurn.messages).content, /Skills: active/);
    assert.match(lastRuntimeState(sameTurn.messages).content, /Context Virtualization: active/);

    const next = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.doesNotMatch(next.systemPrompt, /## Shared Terms/);
    assert.doesNotMatch(next.systemPrompt, /## Context Virtualization Cue/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Skills is the parent gate for capability prompt, discovery, and tools", async () => {
  const cwd = await configuredRepo({
    defaultMode: "workflow",
    skills: { enabled: false },
    contextVirtualization: true,
    conversationHistory: true,
  });
  try {
    const { handlers, activeToolNames } = loadExtension();
    const ctx = context(cwd);
    await handlers.get("session_start")({ type: "session_start" }, ctx);

    const before = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.match(before.systemPrompt, /# Freeflow Stable Guidance/);
    assert.match(before.systemPrompt, /## Mode/);
    assert.match(before.systemPrompt, /# Freeflow Interaction Contract/);
    assert.doesNotMatch(before.systemPrompt, /## Shared Terms/);
    assert.doesNotMatch(before.systemPrompt, /## Three Nested Loops/);
    assert.doesNotMatch(before.systemPrompt, /## Context Virtualization Cue/);
    assert.doesNotMatch(before.systemPrompt, /## Conversation History Cue/);

    const providerContext = await handlers.get("context")({ messages: [] }, ctx);
    const runtimeState = lastRuntimeState(providerContext.messages);
    assert.match(runtimeState.content, /Skills: inactive/);
    assert.match(runtimeState.content, /Context Virtualization: inactive/);
    assert.match(runtimeState.content, /Conversation History: inactive/);

    const resources = await handlers.get("resources_discover")({ cwd }, ctx);
    assert.deepEqual(resources.skillPaths, []);
    assert.ok(!activeToolNames().includes("freeflow_context"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("missing optional prompt fragments preserve runtime context loading", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-prompt-fragment-failure-"));
  try {
    await cp(join(process.cwd(), "pi-extension", "dist"), join(root, "pi-extension", "dist"), { recursive: true });
    await cp(join(process.cwd(), "runtime", "prompts"), join(root, "runtime", "prompts"), { recursive: true });
    await rm(join(root, "runtime", "prompts", "cognitive-routing.md"));

    const runtime = await import(
      `${pathToFileURL(join(root, "pi-extension", "dist", "runtime", "runtime-context.js")).href}?missing-prompt=${Date.now()}`
    );
    const state = {
      configured: true,
      enabled: true,
      interactionContract: { effective: true },
      skills: { effective: true },
      cognitiveRouting: { effective: true },
      contextVirtualization: { effective: false },
      conversationHistory: { effective: false },
    };

    const loaded = await runtime.getRuntimeContext(state);
    assert.equal(loaded.cognitiveRoutingPrompt, null);
    assert.match(
      runtime.runtimeContext(loaded, { ...state, cognitiveRouting: { effective: false } }),
      /# Freeflow Stable Guidance/,
    );
    assert.doesNotMatch(
      runtime.runtimeContext(loaded, { ...state, cognitiveRouting: { effective: false } }),
      /## Cognitive Routing Cue/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("missing child prompt removes that capability from every model-facing surface", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-child-prompt-failure-"));
  const cwd = await configuredRepo({ defaultMode: "workflow", contextVirtualization: true });
  try {
    await cp(join(process.cwd(), "pi-extension", "dist"), join(root, "pi-extension", "dist"), { recursive: true });
    await cp(join(process.cwd(), "runtime", "prompts"), join(root, "runtime", "prompts"), { recursive: true });
    await symlink(join(process.cwd(), "node_modules"), join(root, "node_modules"), "dir");
    await rm(join(root, "runtime", "prompts", "context-virtualization.md"));

    const extension = (
      await import(`${pathToFileURL(join(root, "pi-extension", "dist", "index.js")).href}?missing-child=${Date.now()}`)
    ).default;
    const { handlers, activeToolNames } = loadExtension(extension);
    const ctx = context(cwd);
    await handlers.get("session_start")({ type: "session_start" }, ctx);

    const before = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.doesNotMatch(before.systemPrompt, /## Context Virtualization Cue/);
    const resources = await handlers.get("resources_discover")({ cwd }, ctx);
    assert.ok(!resources.skillPaths.some((path) => path.endsWith("/capabilities/context-virtualization/SKILL.md")));
    assert.ok(!activeToolNames().includes("freeflow_context"));
    const providerContext = await handlers.get("context")({ messages: [] }, ctx);
    assert.match(providerContext.messages.at(-1).content, /Context Virtualization: unavailable/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("missing core prompt preserves the host prompt and marks Freeflow unavailable", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-core-prompt-failure-"));
  const cwd = await configuredRepo({ defaultMode: "workflow" });
  try {
    await cp(join(process.cwd(), "pi-extension", "dist"), join(root, "pi-extension", "dist"), { recursive: true });
    await cp(join(process.cwd(), "runtime", "prompts"), join(root, "runtime", "prompts"), { recursive: true });
    await symlink(join(process.cwd(), "node_modules"), join(root, "node_modules"), "dir");
    await rm(join(root, "runtime", "prompts", "core.md"));

    const extension = (
      await import(`${pathToFileURL(join(root, "pi-extension", "dist", "index.js")).href}?missing-core=${Date.now()}`)
    ).default;
    const { handlers } = loadExtension(extension);
    const ctx = context(cwd);
    await handlers.get("session_start")({ type: "session_start" }, ctx);

    const before = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.equal(before.systemPrompt, "base prompt");
    const resources = await handlers.get("resources_discover")({ cwd }, ctx);
    assert.deepEqual(resources.skillPaths, []);
    const providerContext = await handlers.get("context")({ messages: [] }, ctx);
    assert.match(providerContext.messages.at(-1).content, /Interaction Contract: unavailable/);
    assert.match(providerContext.messages.at(-1).content, /Skills: unavailable/);
    assert.match(providerContext.messages.at(-1).content, /Active mode: `inactive`/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("Runtime State remains present while Freeflow is disabled and prompt surfaces disappear", async () => {
  const cwd = await configuredRepo({ enabled: false, skills: { enabled: true } });
  try {
    const { handlers } = loadExtension();
    const ctx = context(cwd);
    const before = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.equal(before.systemPrompt, "base prompt");
    assert.equal(before.message, undefined);

    const providerContext = await handlers.get("context")({ messages: [] }, ctx);
    const runtimeState = lastRuntimeState(providerContext.messages);
    assert.ok(runtimeState);
    assert.match(runtimeState.content, /Active mode: `inactive`/);
    assert.match(runtimeState.content, /Skills: inactive/);
    assert.match(runtimeState.content, /Interaction Contract: inactive/);

    const resources = await handlers.get("resources_discover")({ cwd }, ctx);
    assert.deepEqual(resources.skillPaths, []);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
