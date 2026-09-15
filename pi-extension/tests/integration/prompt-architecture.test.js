import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import test from "node:test";

import freeflowExtension from "../../dist/index.js";
import { PIFLOW_HOST } from "../fixtures/pi-host.js";

function context(cwd, systemPrompt = "") {
  return {
    cwd,
    getSystemPrompt: () => systemPrompt,
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

async function configuredRepo(config = {}) {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-prompt-architecture-"));
  await mkdir(join(cwd, ".freeflow"));
  await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify(config, null, 2), "utf8");
  return cwd;
}

function lastRuntimeState(messages) {
  return messages.findLast((message) => message.customType === "freeflow-runtime-state");
}

test("re-entry recovery is stable and capability-neutral", async () => {
  const [core, cognitiveRouting, conversationHistory, routingSkill] = await Promise.all([
    readFile(join(process.cwd(), "runtime", "prompts", "core.md"), "utf8"),
    readFile(join(process.cwd(), "runtime", "prompts", "cognitive-routing.md"), "utf8"),
    readFile(join(process.cwd(), "runtime", "prompts", "conversation-history.md"), "utf8"),
    readFile(join(process.cwd(), "capabilities", "cognitive-routing", "SKILL.md"), "utf8"),
  ]);

  assert.match(core, /## Load The Selected Method/);
  assert.match(core, /Before applying a selected skill, read its current body/);
  assert.match(core, /## Recover After Context Loss/);
  assert.match(core, /latest Freeflow Runtime State/);
  assert.match(core, /recovery is not a bypass/);
  assert.match(core, /evidence of prior approval; check that the approval still applies/);
  assert.match(core, /choose or retain the current owner/);
  assert.match(core, /apply its method and gather or produce evidence/);
  assert.match(core, /read the complete `full` record/);
  assert.match(core, /Make material gaps, contradictions, deferrals, and user-owned decisions explicit/);
  assert.match(cognitiveRouting, /Before relying on Automatic routing, read the complete cognitive-routing skill/);
  assert.match(cognitiveRouting, /This bootstrap read is the only environment call/);
  assert.match(cognitiveRouting, /If unavailable, stop and report the missing method/);
  // The approved compact cue keeps bootstrap/control boundaries; the loaded
  // method owns detailed role and handoff policy. Keep both obligations checked.
  assert.match(
    cognitiveRouting,
    /Under Manual control, the held Coordinator, Helper, or Executor follows ordinary unsplit Workflow/,
  );
  assert.match(cognitiveRouting, /When routing is inactive, stop applying this split/);
  assert.match(
    cognitiveRouting,
    /Use the latest Runtime State for control, profile, delegation mode, and current responsibility/,
  );
  assert.match(cognitiveRouting, /configured profiles in one agent\/session/);
  assert.match(routingSkill, /Automatic role restrictions, delegation, and projection do not apply/);
  assert.match(routingSkill, /Put the actual contract in `freeflow_delegate/);
  assert.match(routingSkill, /A worker return ends its ordinary task work/);
  assert.match(cognitiveRouting, /project every completed skill and instructional-reference read/);
  assert.match(
    routingSkill,
    /For the current returned assessment, Coordinator uses `freeflow_unit\(operation: "recover"\)`/,
  );
  assert.match(routingSkill, /freeflow_unit\(operation: "recover"\)/);
  assert.match(
    routingSkill,
    /Preserve the unit, assignment, original report, outcome, revision, selections, and assessment/,
  );
  assert.match(routingSkill, /read only exact admitted task paths/);
  assert.match(routingSkill, /freeflow_return\(operation: "supplement"\)/);
  assert.match(routingSkill, /Deliver the supplement or cancel recovery before `assess`/);
  assert.match(routingSkill, /Do not simulate recovery by replacing an assignment\/report or opening a new unit/);
  assert.doesNotMatch(
    conversationHistory,
    /Current user direction, live source truth, and present runtime state remain authoritative/,
  );
});

test("composes the mandatory core fragments, optional capabilities, discovery, and runtime state", async () => {
  const cwd = await configuredRepo({ contextVirtualization: true, conversationHistory: true });
  try {
    const { handlers, activeToolNames } = loadExtension();
    const ctx = context(cwd);
    await handlers.get("session_start")({ type: "session_start" }, ctx);

    const before = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.equal(before.message, undefined);
    const prompt = before.systemPrompt;
    const order = [
      "# Freeflow Stable Guidance",
      "## Shared Terms",
      "## Load The Selected Method",
      "## Recover After Context Loss",
      "## Three Nested Loops",
      "## Evidence And Judgment",
      "## Workflow Cue",
      "## Action Selection Cue",
      "## Supported Exit",
      "# Freeflow Interaction Contract",
      "## Context Virtualization Cue",
      "## Conversation History Cue",
    ].map((marker) => prompt.indexOf(marker));
    assert.ok(order.every((index) => index >= 0));
    assert.deepEqual(
      order,
      [...order].sort((a, b) => a - b),
    );
    assert.match(
      prompt,
      /Before applying a selected skill, read its current body when its exact method is absent from context/,
    );
    assert.match(prompt, /Verification establishes what direct evidence proves at the observed boundary/);
    assert.match(
      prompt,
      /Review judges whether work or an artifact is aligned, correct, suitable, and sufficiently evidenced/,
    );
    assert.match(prompt, /Interpret requested intent, not sentence form/);
    assert.match(prompt, /answer the question before any action that depends on it/);
    assert.match(prompt, /An unresolved question does not automatically suspend independent, clearly authorized work/);
    assert.doesNotMatch(prompt, /## Mode\b|strict-workflow|conversation mode|workflow mode/);
    assert.doesNotMatch(prompt, /Skills prompt/);
    assert.doesNotMatch(prompt, /# Workflow\n/);
    assert.doesNotMatch(prompt, /# Cognitive Routing\n/);

    const providerContext = await handlers.get("context")({ messages: [] }, ctx);
    const runtimeState = lastRuntimeState(providerContext.messages);
    assert.ok(runtimeState);
    assert.match(runtimeState.content, /Freeflow: active/);
    assert.match(runtimeState.content, /Context Virtualization: active/);
    assert.match(runtimeState.content, /Conversation History: active/);
    assert.match(runtimeState.content, /Cognitive Routing: inactive/);
    assert.match(runtimeState.content, /Control: `unavailable`/);
    assert.match(runtimeState.content, /Projection: `disabled`/);
    assert.doesNotMatch(runtimeState.content, /Default mode|Active mode|Interaction Contract|Skills/);

    const resources = await handlers.get("resources_discover")({ cwd }, ctx);
    assert.ok(resources.skillPaths.some((path) => path.endsWith("/skills/action-selection/SKILL.md")));
    assert.ok(resources.skillPaths.some((path) => path.endsWith("/capabilities/context-virtualization/SKILL.md")));
    assert.ok(resources.skillPaths.some((path) => path.endsWith("/capabilities/conversation-history/SKILL.md")));
    assert.ok(!resources.skillPaths.some((path) => path.endsWith("/skills/mode-contract/SKILL.md")));
    assert.ok(activeToolNames().includes("freeflow_context"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("subagents retain reference definitions while optional capabilities stay inactive", async () => {
  const cwd = await configuredRepo({
    contextVirtualization: true,
    conversationHistory: true,
    cognitiveRouting: {
      enabled: true,
      profiles: {
        coordinator: { provider: "test", model: "coordinator", thinking: "high" },
        executor: { provider: "test", model: "executor", thinking: "max" },
      },
    },
  });
  try {
    const { handlers, activeToolNames } = loadExtension(freeflowExtension, null);
    const ctx = context(cwd, "<!-- freeflow-subagent-capabilities: disabled -->");
    await handlers.get("session_start")({ type: "session_start" }, ctx);

    const before = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.match(before.systemPrompt, /# Freeflow Stable Guidance/);
    assert.match(before.systemPrompt, /# Freeflow Interaction Contract/);
    assert.match(before.systemPrompt, /## Cognitive Routing Cue/);
    assert.match(before.systemPrompt, /## Context Virtualization Cue/);
    assert.match(before.systemPrompt, /## Conversation History Cue/);

    const resources = await handlers.get("resources_discover")({ cwd }, ctx);
    assert.ok(resources.skillPaths.some((path) => path.endsWith("/skills/action-selection/SKILL.md")));
    assert.equal(resources.skillPaths.filter((path) => path.includes("/capabilities/")).length, 3);

    const providerContext = await handlers.get("context")({ messages: [] }, ctx);
    const runtimeState = lastRuntimeState(providerContext.messages);
    assert.match(runtimeState.content, /Freeflow: active/);
    assert.match(runtimeState.content, /Context Virtualization: inactive/);
    assert.match(runtimeState.content, /Conversation History: inactive/);
    assert.match(runtimeState.content, /Cognitive Routing: inactive/);
    assert.ok(activeToolNames().includes("freeflow_context"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("provider context reuses the before-agent surface until the next provider turn", async () => {
  const cwd = await configuredRepo({ contextVirtualization: true });
  try {
    const { handlers } = loadExtension();
    const ctx = context(cwd);
    await handlers.get("session_start")({ type: "session_start" }, ctx);

    const before = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.match(before.systemPrompt, /## Context Virtualization Cue/);

    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({}), "utf8");
    const sameTurn = await handlers.get("context")({ messages: [] }, ctx);
    assert.match(lastRuntimeState(sameTurn.messages).content, /Context Virtualization: active/);

    const next = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.equal(next.systemPrompt, before.systemPrompt, "settings preserve the complete reference surface");
    assert.match(next.systemPrompt, /# Freeflow Interaction Contract/);
    assert.match(next.systemPrompt, /## Shared Terms/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("missing optional prompt fragments preserve the mandatory core surface", async () => {
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
    assert.match(
      runtime.runtimeContext(loaded, { ...state, cognitiveRouting: { effective: false } }),
      /# Freeflow Interaction Contract/,
    );
    assert.doesNotMatch(
      runtime.runtimeContext(loaded, { ...state, cognitiveRouting: { effective: false } }),
      /## Cognitive Routing Cue/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("missing child prompt marks that capability unavailable while retaining its definitions", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-child-prompt-failure-"));
  const cwd = await configuredRepo({ contextVirtualization: true });
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
    assert.match(before.systemPrompt, /# Freeflow Interaction Contract/);
    const resources = await handlers.get("resources_discover")({ cwd }, ctx);
    assert.ok(resources.skillPaths.some((path) => path.endsWith("/capabilities/context-virtualization/SKILL.md")));
    assert.ok(activeToolNames().includes("freeflow_context"));

    await handlers.get("session_tree")({}, ctx);
    assert.ok(activeToolNames().includes("freeflow_context"));
    await handlers.get("session_compact")({}, ctx);
    assert.ok(activeToolNames().includes("freeflow_context"));

    const providerContext = await handlers.get("context")({ messages: [] }, ctx);
    assert.match(providerContext.messages.at(-1).content, /Context Virtualization: unavailable/);

    await writeFile(join(root, "runtime", "prompts", "context-virtualization.md"), " \n\t", "utf8");
    const whitespaceBefore = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.doesNotMatch(whitespaceBefore.systemPrompt, /## Context Virtualization Cue/);
    const whitespaceResources = await handlers.get("resources_discover")({ cwd }, ctx);
    assert.ok(
      whitespaceResources.skillPaths.some((path) => path.endsWith("/capabilities/context-virtualization/SKILL.md")),
    );
    assert.ok(activeToolNames().includes("freeflow_context"));
    const whitespaceContext = await handlers.get("context")({ messages: [] }, ctx);
    assert.match(whitespaceContext.messages.at(-1).content, /Context Virtualization: unavailable/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("missing mandatory Interaction Contract retains a dormant surface with unavailable state", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-interaction-contract-failure-"));
  const cwd = await configuredRepo();
  try {
    await cp(join(process.cwd(), "pi-extension", "dist"), join(root, "pi-extension", "dist"), { recursive: true });
    await cp(join(process.cwd(), "runtime", "prompts"), join(root, "runtime", "prompts"), { recursive: true });
    await symlink(join(process.cwd(), "node_modules"), join(root, "node_modules"), "dir");
    await rm(join(root, "runtime", "prompts", "interaction-contract.md"));

    const extension = (
      await import(
        `${pathToFileURL(join(root, "pi-extension", "dist", "index.js")).href}?missing-contract=${Date.now()}`
      )
    ).default;
    const { handlers, activeToolNames } = loadExtension(extension);
    const ctx = context(cwd);
    await handlers.get("session_start")({}, ctx);
    assert.ok(activeToolNames().includes("freeflow_context"));
    const before = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.ok(before.systemPrompt.startsWith("base prompt\n\n"));
    assert.match(before.systemPrompt, /guidance is dormant/);
    const resources = await handlers.get("resources_discover")({ cwd }, ctx);
    assert.equal(resources.skillPaths.length, 27);
    await handlers.get("session_tree")({}, ctx);
    assert.ok(activeToolNames().includes("freeflow_context"));

    await writeFile(join(root, "runtime", "prompts", "interaction-contract.md"), " \n\t", "utf8");
    const whitespaceBefore = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.ok(whitespaceBefore.systemPrompt.startsWith("base prompt\n\n"));
    assert.match(whitespaceBefore.systemPrompt, /guidance is dormant/);
    const whitespaceResources = await handlers.get("resources_discover")({ cwd }, ctx);
    assert.equal(whitespaceResources.skillPaths.length, 27);
    const whitespaceContext = await handlers.get("context")({ messages: [] }, ctx);
    assert.match(whitespaceContext.messages.at(-1).content, /Freeflow: unavailable/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("missing mandatory core prompt retains a dormant surface with unavailable state", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-core-prompt-failure-"));
  const cwd = await configuredRepo({ contextVirtualization: true });
  try {
    await cp(join(process.cwd(), "pi-extension", "dist"), join(root, "pi-extension", "dist"), { recursive: true });
    await cp(join(process.cwd(), "runtime", "prompts"), join(root, "runtime", "prompts"), { recursive: true });
    await symlink(join(process.cwd(), "node_modules"), join(root, "node_modules"), "dir");
    await rm(join(root, "runtime", "prompts", "core.md"));

    const extension = (
      await import(`${pathToFileURL(join(root, "pi-extension", "dist", "index.js")).href}?missing-core=${Date.now()}`)
    ).default;
    const { handlers, activeToolNames } = loadExtension(extension);
    const ctx = context(cwd);
    await handlers.get("session_start")({ type: "session_start" }, ctx);

    const before = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.ok(before.systemPrompt.startsWith("base prompt\n\n"));
    assert.match(before.systemPrompt, /guidance is dormant/);
    const resources = await handlers.get("resources_discover")({ cwd }, ctx);
    assert.equal(resources.skillPaths.length, 27);
    const providerContext = await handlers.get("context")({ messages: [] }, ctx);
    assert.match(providerContext.messages.at(-1).content, /Freeflow: unavailable/);
    assert.doesNotMatch(
      providerContext.messages.at(-1).content,
      /Default mode|Active mode|Interaction Contract|Skills/,
    );

    await handlers.get("session_tree")({}, ctx);
    assert.ok(activeToolNames().includes("freeflow_context"));
    await handlers.get("session_compact")({}, ctx);
    assert.ok(activeToolNames().includes("freeflow_context"));

    await writeFile(join(root, "runtime", "prompts", "core.md"), " \n\t", "utf8");
    const whitespaceBefore = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.ok(whitespaceBefore.systemPrompt.startsWith("base prompt\n\n"));
    assert.match(whitespaceBefore.systemPrompt, /guidance is dormant/);
    const whitespaceResources = await handlers.get("resources_discover")({ cwd }, ctx);
    assert.equal(whitespaceResources.skillPaths.length, 27);
    const whitespaceContext = await handlers.get("context")({ messages: [] }, ctx);
    assert.match(whitespaceContext.messages.at(-1).content, /Freeflow: unavailable/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("Runtime State remains present while Freeflow is disabled without optional core labels", async () => {
  const cwd = await configuredRepo({ enabled: false });
  try {
    const { handlers } = loadExtension();
    const ctx = context(cwd);
    const before = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.ok(before.systemPrompt.startsWith("base prompt\n\n"));
    assert.match(before.systemPrompt, /guidance is dormant/);
    assert.equal(before.message, undefined);

    const providerContext = await handlers.get("context")({ messages: [] }, ctx);
    const runtimeState = lastRuntimeState(providerContext.messages);
    assert.ok(runtimeState);
    assert.match(runtimeState.content, /Freeflow: inactive/);
    assert.doesNotMatch(runtimeState.content, /Default mode|Active mode|Interaction Contract|Skills/);

    const resources = await handlers.get("resources_discover")({ cwd }, ctx);
    assert.equal(resources.skillPaths.length, 27);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
