import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import test from "node:test";

import freeflowExtension from "../../dist/index.js";
import {
  freeflowRuntimeStateMessage,
  getRuntimeContext,
  readCapabilityState,
  readFreeflowConfigLayers,
  runtimeContext,
  setSessionCoreOverride,
} from "../../dist/runtime/runtime-context.js";
import { PIFLOW_HOST } from "../cognitive-routing/host-fixture.js";

function context(cwd) {
  const notifications = [];
  return {
    cwd,
    notifications,
    ui: {
      setStatus() {},
      notify(message, level) {
        notifications.push({ message, level });
      },
    },
    sessionManager: {
      getBranch: () => [],
      getEntries: () => [],
    },
  };
}

function loadExtension(extension = freeflowExtension) {
  const handlers = new Map();
  const commands = [];
  const sentMessages = [];
  const tools = [];
  const pi = {
    host: PIFLOW_HOST,
    registerCommand(name, definition) {
      commands.push({ name, definition });
    },
    registerTool(tool) {
      tools.push(tool);
    },
    sendUserMessage(message) {
      sentMessages.push(message);
    },
    registerShortcut() {},
    on(name, handler) {
      handlers.set(name, handler);
    },
    getAllTools() {
      return tools.map((tool) => ({ name: tool.name }));
    },
    getActiveTools() {
      return tools.map((tool) => tool.name);
    },
    setActiveTools() {},
  };
  extension(pi);
  return { handlers, commands, sentMessages };
}

async function configuredRepo(config = {}) {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-mode-free-core-"));
  await mkdir(join(cwd, ".freeflow"));
  await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify(config), "utf8");
  return cwd;
}

test("obsolete mode and core-toggle configuration keys are rejected", async () => {
  for (const config of [{ defaultMode: "workflow" }, { interactionContract: false }, { skills: { enabled: false } }]) {
    const cwd = await configuredRepo(config);
    try {
      const layers = await readFreeflowConfigLayers(cwd);
      assert.equal(layers.configured, false);
      assert.equal(layers.repository.valid, false);
      assert.match(layers.parseError, /unsupported top-level config key/);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }
});

test("an empty valid config enables the single Freeflow core", async () => {
  const cwd = await configuredRepo();
  try {
    const state = await readCapabilityState(cwd, undefined, PIFLOW_HOST);
    assert.equal(state.configured, true);
    assert.equal(state.enabled, true);
    assert.deepEqual(state.configuredCoreConfig, {
      enabled: true,
      contextVirtualization: false,
      conversationHistory: false,
    });
    assert.equal("defaultMode" in state, false);
    assert.equal("interactionContract" in state, false);
    assert.equal("skills" in state, false);
    assert.equal("defaultMode" in state.configSources, false);
    assert.equal("interactionContract" in state.configSources, false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("core and the separately editable Interaction Contract are mandatory prompt fragments", async () => {
  const cwd = await configuredRepo();
  try {
    const state = await readCapabilityState(cwd, undefined, PIFLOW_HOST);
    const loaded = await getRuntimeContext(state);
    assert.match(loaded.corePrompt, /# Freeflow Stable Guidance/);
    assert.match(loaded.corePrompt, /## Recover After Context Loss/);
    assert.match(loaded.corePrompt, /## Shared Terms/);
    assert.match(loaded.corePrompt, /Report the outcome, evidence, limits, and current route\./);
    assert.equal(loaded.skillsPrompt, undefined);
    assert.match(loaded.interactionContractPrompt, /# Freeflow Interaction Contract/);
    assert.match(runtimeContext(loaded, state), /# Freeflow Stable Guidance/);
    assert.match(runtimeContext(loaded, state), /# Freeflow Interaction Contract/);
    assert.match(freeflowRuntimeStateMessage(state).content, /Freeflow: unavailable/);

    const missingContract = { ...loaded, interactionContractPrompt: null };
    assert.equal(runtimeContext(missingContract, state), "");
    assert.equal(runtimeContext({ ...loaded, interactionContractPrompt: " \n\t" }, state), "");
    assert.equal(runtimeContext({ ...loaded, corePrompt: " \n\t" }, state), "");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi exposes base skills without mode or Skills controls", async () => {
  const cwd = await configuredRepo();
  try {
    const { handlers, commands } = loadExtension();
    const ctx = context(cwd);
    const resources = await handlers.get("resources_discover")({ cwd }, ctx);
    assert.equal(resources.skillPaths.length, 25);
    assert.ok(resources.skillPaths.some((path) => path.endsWith("/skills/workflow/SKILL.md")));
    assert.ok(!resources.skillPaths.some((path) => path.endsWith("/skills/mode-contract/SKILL.md")));

    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);
    assert.ok(!freeflowCommand.definition.getArgumentCompletions("").some((item) => item.value === "mode"));
    assert.deepEqual(freeflowCommand.definition.getArgumentCompletions("mode "), []);

    const before = await handlers.get("before_agent_start")({ systemPrompt: "base" }, ctx);
    assert.match(before.systemPrompt, /# Freeflow Stable Guidance/);
    assert.match(before.systemPrompt, /# Freeflow Interaction Contract/);
    assert.match(before.systemPrompt, /## Shared Terms/);
    assert.doesNotMatch(before.systemPrompt, /## Mode\b|strict-workflow|conversation mode|workflow mode/);
    assert.doesNotMatch(before.systemPrompt, /Skills prompt/);

    const providerContext = await handlers.get("context")({ messages: [] }, ctx);
    const stateMessage = providerContext.messages.at(-1);
    assert.match(stateMessage.content, /Freeflow: active/);
    assert.doesNotMatch(stateMessage.content, /Default mode|Active mode|Interaction Contract|Skills/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("mandatory prompt readiness gates Runtime State, discovery, and direct skill dispatch", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-mandatory-prompt-readiness-"));
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
    const { handlers, commands, sentMessages } = loadExtension(extension);
    const ctx = context(cwd);
    const before = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.equal(before.systemPrompt, "base prompt");
    const resources = await handlers.get("resources_discover")({ cwd }, ctx);
    assert.deepEqual(resources.skillPaths, []);

    const discuss = commands.find((command) => command.name === "discuss");
    assert.ok(discuss);
    await discuss.definition.handler(undefined, ctx);
    assert.deepEqual(sentMessages, []);
    assert.match(ctx.notifications.at(-1).message, /Freeflow core prompts are unavailable/i);

    const providerContext = await handlers.get("context")({ messages: [] }, ctx);
    assert.match(providerContext.messages.at(-1).content, /Freeflow: unavailable/);
    assert.doesNotMatch(providerContext.messages.at(-1).content, /Freeflow: active/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("session overrides are limited to the remaining configurable core values", async () => {
  const cwd = await configuredRepo();
  try {
    const { commands } = loadExtension();
    const ctx = context(cwd);
    const pi = { appendEntry() {}, host: PIFLOW_HOST };
    const result = await setSessionCoreOverride("enabled", false, ctx, pi);
    assert.equal(result.changed, true);
    await assert.rejects(() => setSessionCoreOverride("interactionContract", false, ctx, pi), /Invalid Freeflow/);
    await assert.rejects(() => setSessionCoreOverride("skillsEnabled", false, ctx, pi), /Invalid Freeflow/);
    assert.ok(commands.some((command) => command.name === "freeflow"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

await readFile(join(process.cwd(), "runtime", "prompts", "interaction-contract.md"), "utf8");
