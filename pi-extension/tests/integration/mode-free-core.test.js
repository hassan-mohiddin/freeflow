import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import test from "node:test";

import freeflowExtension from "../../dist/index.js";
import { readCapabilityState, readFreeflowConfigLayers, setSessionCoreOverride } from "../../dist/host/config.js";
import { getRuntimeContext, hasUsableMandatoryPrompts, stableRuntimeContext } from "../../dist/host/prompts.js";
import { freeflowRuntimeStateMessage } from "../../dist/host/runtime-state.js";
import { ignoredStateLine, validateLocalConfig, validateRepositoryConfig } from "../../dist/host/config-validation.js";
import { FREEFLOW_MODEL_SKILL_NAMES } from "../../dist/host/catalog.js";
import { contextHandler, beforeAgentStartHandler } from "../fixtures/pi087-context.js";

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

test("obsolete mode and core-toggle configuration keys are ignored and named, and Freeflow stays on", async () => {
  // `prompts.interactionContract` and `prompts.enabled` replaced the top-level switch.
  for (const config of [{ defaultMode: "workflow" }, { interactionContract: false }]) {
    const cwd = await configuredRepo(config);
    try {
      const layers = await readFreeflowConfigLayers(cwd);
      assert.equal(layers.ignored.length, 1);
      assert.equal(layers.ignored[0].file, ".freeflow/config.json");
      assert.match(layers.ignored[0].reason, /unsupported key/);
      const state = await readCapabilityState(cwd);
      assert.equal(state.enabled, true);
      assert.deepEqual(state.ignored, layers.ignored);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }
});

test("removed context settings are ignored and named in each file, and Freeflow stays on", async () => {
  for (const [file, key] of [
    ["config.json", "contextVirtualization"],
    ["config.json", "conversationHistory"],
    ["local.json", "contextVirtualization"],
    ["local.json", "conversationHistory"],
  ]) {
    const cwd = await configuredRepo(file === "config.json" ? { [key]: true } : {});
    try {
      if (file === "local.json") {
        await writeFile(join(cwd, ".freeflow/local.json"), JSON.stringify({ [key]: true }), "utf8");
      }
      const layers = await readFreeflowConfigLayers(cwd);
      assert.deepEqual(
        layers.ignored.map((item) => [item.file, item.key]),
        [[`.freeflow/${file}`, key]],
      );
      assert.match(layers.ignored[0].reason, /removed Freeflow context setting/);
      const state = await readCapabilityState(cwd);
      assert.equal(state.enabled, true);
      assert.match(ignoredStateLine(state.ignored), new RegExp(`\\.freeflow/${file.replace(".", "\\.")} ${key}: `));
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }
});

// Review has no settings: a file that still holds them is valid, so it never fails, and every key in the review block
// is ignored and named with the reason (#164); nothing reaches the capability state or a Runtime State review line.
test("the removed review settings never fail a config: each is ignored and named, and the Runtime State has no review line", async () => {
  for (const review of [{}, { unit: "manual", rounds: 1 }, { mode: "always" }, { depth: { default: "full" } }, true])
    for (const validate of [validateRepositoryConfig, validateLocalConfig])
      assert.equal(validate({ review }), null, JSON.stringify(review));
  const cwd = await configuredRepo({ review: { mode: "always", unit: "push", depth: { default: "deep" } } });
  try {
    await writeFile(join(cwd, ".freeflow/local.json"), JSON.stringify({ review: { model: "my-model" } }), "utf8");
    const state = await readCapabilityState(cwd);
    assert.equal(state.enabled, true);
    assert.equal("review" in state, false);
    assert.deepEqual(
      state.ignored.map((item) => `${item.file} ${item.key}`),
      [
        ".freeflow/config.json review.mode",
        ".freeflow/config.json review.unit",
        ".freeflow/config.json review.depth",
        ".freeflow/local.json review.model",
      ],
    );
    for (const item of state.ignored)
      assert.match(item.reason, /^removed: review has no settings \(a "Review at:" line/);
    const content = freeflowRuntimeStateMessage(state, await getRuntimeContext(state)).content;
    assert.match(content, /^Freeflow: active$/m);
    assert.doesNotMatch(content, /^Review:/m);
    assert.match(content, /^Settings ignored: \.freeflow\/config\.json review\.mode: removed: review has no settings/m);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("an empty valid config enables the single Freeflow core", async () => {
  const cwd = await configuredRepo();
  try {
    const state = await readCapabilityState(cwd);
    assert.equal(state.enabled, true);
    assert.deepEqual(state.ignored, []);
    assert.deepEqual(state.configuredCoreConfig, { enabled: true });
    assert.equal("contextVirtualization" in state, false);
    assert.equal("conversationHistory" in state, false);
    assert.equal("defaultMode" in state, false);
    assert.equal("interactionContract" in state, false);
    assert.deepEqual(state.skills, { enabled: true, off: [] });
    assert.deepEqual(state.prompts, { core: true, interactionContract: true, workingMethod: true });
    assert.equal("defaultMode" in state.configSources, false);
    assert.equal("interactionContract" in state.configSources, false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("core and the separately editable Interaction Contract are mandatory prompt fragments", async () => {
  const cwd = await configuredRepo();
  try {
    const state = await readCapabilityState(cwd);
    const loaded = await getRuntimeContext(state);
    assert.match(loaded.corePrompt, /# Freeflow Stable Guidance/);
    assert.match(loaded.corePrompt, /## Recover After Context Loss/);
    assert.match(loaded.corePrompt, /## Terms/);
    assert.match(loaded.corePrompt, /Then continue the covered work toward the agreed end/);
    assert.equal(loaded.skillsPrompt, undefined);
    assert.match(loaded.interactionContractPrompt, /# Freeflow Interaction Contract/);
    assert.match(stableRuntimeContext(loaded), /# Freeflow Stable Guidance/);
    assert.match(stableRuntimeContext(loaded), /# Freeflow Interaction Contract/);
    assert.equal(hasUsableMandatoryPrompts(loaded), true);
    assert.match(freeflowRuntimeStateMessage(state).content, /Freeflow: unavailable/);

    const missingContract = { ...loaded, interactionContractPrompt: null };
    // Freeflow runs only when both mandatory fragments are usable; otherwise it reports itself unavailable.
    assert.equal(hasUsableMandatoryPrompts(missingContract), false);
    assert.equal(hasUsableMandatoryPrompts({ ...loaded, interactionContractPrompt: " \n\t" }), false);
    assert.equal(hasUsableMandatoryPrompts({ ...loaded, corePrompt: " \n\t" }), false);
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
    // The canonical base skills; a capability's skill is listed only while it is effective, and compaction has none:
    // Track Work holds its method (P3).
    assert.equal(resources.skillPaths.length, FREEFLOW_MODEL_SKILL_NAMES.length);
    assert.ok(!resources.skillPaths.some((path) => path.includes("/capabilities/compaction/")));
    assert.ok(resources.skillPaths.some((path) => path.endsWith("/skills/discuss-work/SKILL.md")));
    assert.ok(
      !resources.skillPaths.some(
        (path) => path.includes("context-virtualization") || path.includes("conversation-history"),
      ),
    );
    assert.ok(!resources.skillPaths.some((path) => path.endsWith("/skills/tdd/SKILL.md")));
    assert.ok(!resources.skillPaths.some((path) => path.endsWith("/skills/mode-contract/SKILL.md")));

    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);
    assert.ok(!freeflowCommand.definition.getArgumentCompletions("").some((item) => item.value === "mode"));
    assert.deepEqual(freeflowCommand.definition.getArgumentCompletions("mode "), []);

    const before = await beforeAgentStartHandler(handlers)({ systemPrompt: "base" }, ctx);
    assert.match(before.renderedGuidance, /# Freeflow Stable Guidance/);
    assert.match(before.renderedGuidance, /# Freeflow Interaction Contract/);
    assert.match(before.renderedGuidance, /## Terms/);
    assert.doesNotMatch(before.renderedGuidance, /## Mode\b|strict-workflow|conversation mode|workflow mode/);
    assert.doesNotMatch(before.renderedGuidance, /Skills prompt/);

    const providerContext = await contextHandler(handlers)({ messages: [] }, ctx);
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
    const before = await beforeAgentStartHandler(handlers)({ systemPrompt: "base prompt" }, ctx);
    assert.equal(before.systemPrompt, "base prompt");
    // Without its mandatory prompts Freeflow sends no guidance section, and lists only Setup Freeflow.
    assert.equal(before.renderedGuidance ?? "", "");
    const resources = await handlers.get("resources_discover")({ cwd }, ctx);
    assert.equal(resources.skillPaths.length, 1);
    assert.ok(resources.skillPaths[0].endsWith("/skills/setup-freeflow/SKILL.md"));

    const discussWork = commands.find((command) => command.name === "discuss-work");
    assert.ok(discussWork);
    await discussWork.definition.handler(undefined, ctx);
    assert.deepEqual(sentMessages, []);
    assert.match(ctx.notifications.at(-1).message, /Freeflow core prompts are unavailable/i);

    const providerContext = await contextHandler(handlers)({ messages: [] }, ctx);
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
    const pi = { appendEntry() {} };
    const result = await setSessionCoreOverride("enabled", false, ctx, pi);
    assert.equal(result.changed, true);
    await assert.rejects(() => setSessionCoreOverride("interactionContract", false, ctx, pi), /Invalid Freeflow/);
    await assert.rejects(() => setSessionCoreOverride("skillsEnabled", false, ctx, pi), /Invalid Freeflow/);
    await assert.rejects(() => setSessionCoreOverride("contextVirtualization", true, ctx, pi), /Invalid Freeflow/);
    await assert.rejects(() => setSessionCoreOverride("conversationHistory", true, ctx, pi), /Invalid Freeflow/);
    assert.ok(commands.some((command) => command.name === "freeflow"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

await readFile(join(process.cwd(), "runtime", "prompts", "interaction-contract.md"), "utf8");
