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
import { reviewStateLine, validateLocalConfig, validateRepositoryConfig } from "../../dist/host/config-validation.js";
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

test("removed context settings invalidate repository and local configuration with a migration message", async () => {
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
      assert.equal(layers.configured, false);
      assert.match(layers.parseError, /Removed Freeflow context setting/);
      assert.ok(layers.parseError.includes(key));
      assert.ok(layers.parseError.includes(`.freeflow/${file}`));
      const state = await readCapabilityState(cwd);
      assert.equal(state.enabled, false);
      assert.match(state.parseError, /Delete those keys before using Freeflow/);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }
});

test("review accepts a mode and a model in either file and refuses anything else", () => {
  for (const review of [{}, { mode: "auto" }, { mode: "off" }, { mode: "always", model: "anthropic/claude-opus" }])
    for (const validate of [validateRepositoryConfig, validateLocalConfig])
      assert.equal(validate({ review }), null, JSON.stringify(review));
  for (const [review, error] of [
    [true, "review must be an object"],
    [{ mode: "sometimes" }, "review.mode must be one of auto, off, always"],
    [{ mode: false }, "review.mode must be one of auto, off, always"],
    [{ model: "" }, "review.model must be a non-empty model name on one line"],
    [{ model: 5 }, "review.model must be a non-empty model name on one line"],
    [{ model: "opus\nReview: off" }, "review.model must be a non-empty model name on one line"],
    [{ effort: "high" }, "review has unsupported key: effort"],
  ])
    for (const validate of [validateRepositoryConfig, validateLocalConfig])
      assert.equal(validate({ review }), error, JSON.stringify(review));
});

test("the personal review setting overrides the shared one field by field, and only a choice shows in the Runtime State", async () => {
  const runtimeState = async (config, local) => {
    const cwd = await configuredRepo(config);
    try {
      if (local) await writeFile(join(cwd, ".freeflow/local.json"), JSON.stringify(local), "utf8");
      const state = await readCapabilityState(cwd);
      return {
        review: state.review,
        content: freeflowRuntimeStateMessage(state, undefined, await getRuntimeContext(state)).content,
      };
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  };
  const plain = await runtimeState({});
  assert.deepEqual(plain.review, { mode: "auto" });
  assert.match(plain.content, /Freeflow: active\n\nCapabilities:/);
  assert.doesNotMatch(plain.content, /Review:/);

  const off = await runtimeState({ review: { mode: "off" } });
  assert.match(off.content, /Freeflow: active\nReview: `off`\n\nCapabilities:/);

  const layered = await runtimeState(
    { review: { mode: "always", model: "shared-model" } },
    { review: { model: "my-model" } },
  );
  assert.deepEqual(layered.review, { mode: "always", model: "my-model" });
  assert.match(layered.content, /^Review: `always`, reviewer model `my-model`$/m);

  // `auto` in the personal file returns a shared choice to the default; a model alone still shows.
  assert.doesNotMatch(
    (await runtimeState({ review: { mode: "off" } }, { review: { mode: "auto" } })).content,
    /Review:/,
  );
  assert.match((await runtimeState({ review: { model: "m" } })).content, /^Review: `auto`, reviewer model `m`$/m);

  // An invalid file leaves Freeflow off, and no review line with it.
  const invalid = await runtimeState({ review: { mode: "always" } }, { review: { mode: "never" } });
  assert.match(invalid.content, /Freeflow: config error/);
  assert.doesNotMatch(invalid.content, /Review:/);
  assert.equal(reviewStateLine(undefined), null);
});

test("an empty valid config enables the single Freeflow core", async () => {
  const cwd = await configuredRepo();
  try {
    const state = await readCapabilityState(cwd);
    assert.equal(state.configured, true);
    assert.equal(state.enabled, true);
    assert.deepEqual(state.configuredCoreConfig, { enabled: true });
    assert.equal("contextVirtualization" in state, false);
    assert.equal("conversationHistory" in state, false);
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
    // The canonical base skills and Compaction's (on by default); a capability's skill is listed only while it is effective.
    assert.equal(resources.skillPaths.length, FREEFLOW_MODEL_SKILL_NAMES.length + 1);
    assert.ok(resources.skillPaths.some((path) => path.endsWith("/capabilities/compaction/SKILL.md")));
    assert.ok(!resources.skillPaths.some((path) => /capabilities\/(cognitive-routing|task-memory)\//.test(path)));
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
