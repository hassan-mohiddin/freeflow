import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveCognitiveRoutingConfig } from "../../dist/cognitive-routing/config.js";
import { resolveCognitiveRoutingState } from "../../dist/cognitive-routing/runtime.js";
import { readCapabilityState } from "../../dist/runtime/runtime-context.js";

const standard = {
  provider: "openai-codex",
  model: "gpt-5.6-luna",
  thinkingLevel: "high",
};
const reasoning = {
  provider: "openai-codex",
  model: "gpt-5.6-sol",
  thinkingLevel: "max",
};

function configuredRepository(overrides = {}) {
  return {
    cognitiveRouting: {
      enabled: true,
      profiles: { standard, reasoning },
      ...overrides,
    },
  };
}

function createHost({ models = [], unauthenticated = [], clamps = {} } = {}) {
  const modelMap = new Map(models.map((model) => [`${model.provider}/${model.id}`, model]));
  const unauthenticatedSet = new Set(unauthenticated);
  return {
    modelRegistry: {
      find(provider, modelId) {
        return modelMap.get(`${provider}/${modelId}`);
      },
      async getApiKeyAndHeaders(model) {
        return unauthenticatedSet.has(model.provider) ? { ok: false, error: "missing credentials" } : { ok: true };
      },
      clampThinkingLevel(model, level) {
        return clamps[`${model.provider}/${model.id}`]?.[level] ?? level;
      },
    },
  };
}

const standardModel = { provider: standard.provider, id: standard.model };
const reasoningModel = { provider: reasoning.provider, id: reasoning.model };

test("resolves two complete repository profiles", () => {
  const result = resolveCognitiveRoutingConfig(configuredRepository(), {});

  assert.equal(result.valid, true);
  assert.equal(result.enabled, true);
  assert.equal(result.enabledSource, "repository");
  assert.deepEqual(result.profiles, { standard, reasoning });
  assert.deepEqual(result.profileSources, { standard: "repository", reasoning: "repository" });
});

test("replaces a profile atomically from the personal layer", () => {
  const personalStandard = {
    provider: "openai-codex",
    model: "gpt-5.6-luna-personal",
    thinkingLevel: "medium",
  };
  const result = resolveCognitiveRoutingConfig(configuredRepository(), {
    cognitiveRouting: { profiles: { standard: personalStandard } },
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.profiles.standard, personalStandard);
  assert.deepEqual(result.profiles.reasoning, reasoning);
  assert.deepEqual(result.profileSources, { standard: "personal", reasoning: "repository" });
});

test("rejects a partial personal profile instead of merging fields", () => {
  const result = resolveCognitiveRoutingConfig(configuredRepository(), {
    cognitiveRouting: { profiles: { standard: { model: "personal-only" } } },
  });

  assert.equal(result.valid, false);
  assert.equal(result.error.code, "invalid_profile");
  assert.equal(result.error.profile, "standard");
});

test("keeps Cognitive Routing disabled by default without a config block", async () => {
  const result = await resolveCognitiveRoutingState({}, {}, createHost({ models: [standardModel, reasoningModel] }));

  assert.equal(result.configured, false);
  assert.equal(result.enabled, false);
  assert.equal(result.effective, false);
  assert.equal(result.blockingReason.code, "disabled");
});

test("fails only Cognitive Routing closed when its config is invalid", async () => {
  const result = await resolveCognitiveRoutingState(
    { cognitiveRouting: { enabled: true, profiles: { standard: { provider: "only-provider" } } } },
    {},
    createHost({ models: [standardModel, reasoningModel] }),
  );

  assert.equal(result.configured, true);
  assert.equal(result.configValid, false);
  assert.equal(result.effective, false);
  assert.equal(result.blockingReason.code, "config_invalid");
});

test("reports an unsupported host without weakening core capability state", async () => {
  const result = await resolveCognitiveRoutingState(configuredRepository(), {}, undefined);

  assert.equal(result.enabled, true);
  assert.equal(result.effective, false);
  assert.equal(result.blockingReason.code, "host_unsupported");
});

test("preflights exact identities, authentication, and effective thinking levels", async () => {
  const host = createHost({
    models: [standardModel, reasoningModel],
    clamps: { "openai-codex/gpt-5.6-luna": { high: "high" }, "openai-codex/gpt-5.6-sol": { max: "max" } },
  });
  const result = await resolveCognitiveRoutingState(configuredRepository(), {}, host);

  assert.equal(result.effective, true);
  assert.deepEqual(result.resolvedProfiles.standard, {
    ...standard,
    effectiveThinkingLevel: "high",
  });
  assert.deepEqual(result.resolvedProfiles.reasoning, {
    ...reasoning,
    effectiveThinkingLevel: "max",
  });
});

test("runtime context isolates invalid Cognitive Routing from core Freeflow state", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-cognitive-routing-"));
  await mkdir(join(cwd, ".freeflow"));
  const host = createHost({ models: [standardModel, reasoningModel] });
  try {
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ defaultMode: "workflow", cognitiveRouting: configuredRepository().cognitiveRouting }),
    );
    let state = await readCapabilityState(cwd, host);
    assert.equal(state.configured, true);
    assert.equal(state.enabled, true);
    assert.equal(state.cognitiveRouting.effective, true);

    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ enabled: false, cognitiveRouting: configuredRepository().cognitiveRouting }),
    );
    state = await readCapabilityState(cwd, host);
    assert.equal(state.enabled, false);
    assert.equal(state.cognitiveRouting.enabled, false);
    assert.equal(state.cognitiveRouting.effective, false);
    assert.equal(state.cognitiveRouting.blockingReason.code, "disabled");

    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        cognitiveRouting: { enabled: true, profiles: { standard: { provider: "only-provider" } } },
      }),
    );
    state = await readCapabilityState(cwd, host);
    assert.equal(state.configured, true);
    assert.equal(state.enabled, true);
    assert.equal(state.cognitiveRouting.configValid, false);
    assert.equal(state.cognitiveRouting.effective, false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("rejects unavailable, unauthenticated, weakened, and identical profile pairs", async () => {
  const unavailable = await resolveCognitiveRoutingState(
    configuredRepository(),
    {},
    createHost({ models: [standardModel] }),
  );
  assert.equal(unavailable.blockingReason.code, "profile_unavailable");
  assert.equal(unavailable.blockingReason.profile, "reasoning");

  const unauthenticated = await resolveCognitiveRoutingState(
    configuredRepository(),
    {},
    createHost({ models: [standardModel, reasoningModel], unauthenticated: ["openai-codex"] }),
  );
  assert.equal(unauthenticated.blockingReason.code, "profile_unauthenticated");
  assert.equal(unauthenticated.blockingReason.profile, "standard");

  const weakened = await resolveCognitiveRoutingState(
    configuredRepository(),
    {},
    createHost({
      models: [standardModel, reasoningModel],
      clamps: { "openai-codex/gpt-5.6-luna": { high: "medium" } },
    }),
  );
  assert.equal(weakened.blockingReason.code, "profile_clamped");
  assert.equal(weakened.blockingReason.profile, "standard");

  const identical = await resolveCognitiveRoutingState(
    configuredRepository({ profiles: { standard, reasoning: { ...standard } } }),
    {},
    createHost({ models: [standardModel] }),
  );
  assert.equal(identical.blockingReason.code, "profiles_identical");
});
