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
  // `prompts.interactionContract` and `prompts.enabled` replaced the top-level switch.
  for (const config of [{ defaultMode: "workflow" }, { interactionContract: false }]) {
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

test("review accepts a unit, a model and rounds in either file, depth only in the repository's, and refuses anything else", () => {
  for (const review of [
    {},
    { unit: "pr" },
    { unit: "manual", rounds: 1 },
    { unit: "agreement", model: "anthropic/claude-opus", rounds: 3 },
    { model: "auto" },
  ])
    for (const validate of [validateRepositoryConfig, validateLocalConfig])
      assert.equal(validate({ review }), null, JSON.stringify(review));
  const depth = {
    default: "standard",
    rules: [
      { paths: ["src/payments/**"], depth: "deep", tier: "security", humans: 1 },
      { linesOver: 1000, depth: "standard" },
      { trigger: "data", depth: "deep" },
    ],
    builtins: { data: "standard", "public interface": "off" },
  };
  assert.equal(validateRepositoryConfig({ review: { depth } }), null);
  assert.match(validateLocalConfig({ review: { depth } }), /^review\.depth is Repository scope only/);
  for (const [review, error] of [
    [true, "review must be an object"],
    [
      { mode: "always" },
      'review.mode is replaced by review.unit (pr, push, commit, agreement, manual): a review runs at every unit, and "manual" proposes it and waits for a yes',
    ],
    [{ unit: "sometimes" }, "review.unit must be one of pr, push, commit, agreement, manual"],
    [{ rounds: 4 }, "review.rounds must be one of 1, 2, 3"],
    [{ rounds: "2" }, "review.rounds must be one of 1, 2, 3"],
    [{ model: "" }, "review.model must be auto or a non-empty model name on one line"],
    [{ model: 5 }, "review.model must be auto or a non-empty model name on one line"],
    [{ model: "opus\nReview: off" }, "review.model must be auto or a non-empty model name on one line"],
    [{ effort: "high" }, "review has unsupported key: effort"],
  ])
    for (const validate of [validateRepositoryConfig, validateLocalConfig])
      assert.equal(validate({ review }), error, JSON.stringify(review));
  for (const [value, error] of [
    [[], "review.depth must be an object"],
    [{ default: "full" }, "review.depth.default must be one of quick, standard, deep"],
    [{ rules: {} }, "review.depth.rules must be a list"],
    [{ rules: [{ depth: "deep" }] }, "review.depth.rules[0] must match by exactly one of paths, linesOver or trigger"],
    [
      { rules: [{ paths: ["a"], linesOver: 3, depth: "deep" }] },
      "review.depth.rules[0] must match by exactly one of paths, linesOver or trigger",
    ],
    [{ rules: [{ paths: [], depth: "deep" }] }, "review.depth.rules[0].paths must be a non-empty list of path globs"],
    [{ rules: [{ paths: ["a"] }] }, "review.depth.rules[0].depth must be one of quick, standard, deep"],
    [
      { rules: [{ paths: ["a"], depth: "deep", tier: "high" }] },
      "review.depth.rules[0].tier must be one of standard, security",
    ],
    [{ rules: [{ paths: ["a"], depth: "deep", humans: -1 }] }, "review.depth.rules[0].humans must be a whole number"],
    [
      { rules: [{ trigger: "docs", depth: "deep" }] },
      "review.depth.rules[0].trigger must be one of security, data, ci, public interface",
    ],
    [{ rules: [{ paths: ["a"], depth: "deep", when: 1 }] }, "review.depth.rules[0] has unsupported key: when"],
    [
      { builtins: { docs: "quick" } },
      "review.depth.builtins has unknown trigger: docs; the built-ins are security, data, ci, public interface",
    ],
    [{ builtins: { ci: "light" } }, "review.depth.builtins.ci must be one of quick, standard, deep, off"],
    [{ tiers: {} }, "review.depth has unsupported key: tiers"],
  ])
    assert.equal(validateRepositoryConfig({ review: { depth: value } }), error, JSON.stringify(value));
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
  assert.deepEqual(plain.review, { unit: "pr", model: "auto", rounds: 3 });
  assert.match(plain.content, /Freeflow: active\n\nCapabilities:/);
  assert.doesNotMatch(plain.content, /Review:/);

  const manual = await runtimeState({ review: { unit: "manual" } });
  assert.match(manual.content, /Freeflow: active\nReview: unit `manual`, model `auto`\n\nCapabilities:/);

  const layered = await runtimeState(
    { review: { unit: "push", model: "shared-model", rounds: 2 } },
    { review: { model: "my-model" } },
  );
  assert.deepEqual(layered.review, { unit: "push", model: "my-model", rounds: 2 });
  assert.match(layered.content, /^Review: unit `push`, model `my-model`, up to Review 2$/m);

  // `pr` in the personal file returns a shared choice to the default; a model alone still shows.
  assert.doesNotMatch(
    (await runtimeState({ review: { unit: "manual" } }, { review: { unit: "pr" } })).content,
    /Review:/,
  );
  assert.match((await runtimeState({ review: { model: "m" } })).content, /^Review: unit `pr`, model `m`$/m);
  // The repository's depth rules are the plan's, not the Runtime State's.
  assert.doesNotMatch((await runtimeState({ review: { depth: { default: "deep" } } })).content, /Review:/);

  // An invalid file leaves Freeflow off, and no review line with it.
  const invalid = await runtimeState({ review: { unit: "manual" } }, { review: { unit: "never" } });
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
    assert.ok(!resources.skillPaths.some((path) => /capabilities\/cognitive-routing\//.test(path)));
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
