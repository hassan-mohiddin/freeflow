import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { resolveCognitiveRoutingConfig } from "../../dist/cognitive-routing/config.js";
import { resolveCognitiveRoutingState } from "../../dist/cognitive-routing/runtime.js";
import { readCapabilityState } from "../../dist/runtime/runtime-context.js";
import { PIFLOW_HOST } from "./host-fixture.js";

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

function createHost({ models = [], unauthenticated = [], clamps = {}, authModels = [] } = {}) {
  const modelMap = new Map(models.map((model) => [`${model.provider}/${model.id}`, model]));
  const unauthenticatedSet = new Set(unauthenticated);
  return {
    authModels,
    modelRegistry: {
      find(provider, modelId) {
        return modelMap.get(`${provider}/${modelId}`);
      },
      async getApiKeyAndHeaders(model) {
        authModels.push(model);
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

test("defaults new-session Cognitive Routing to automatic standard control", () => {
  const result = resolveCognitiveRoutingConfig(configuredRepository(), {});

  assert.deepEqual(result.sessionStart, { control: "automatic", profile: "standard" });
  assert.deepEqual(result.sessionStartSources, { control: "default", profile: "default" });
});

test("layers session-start control and profile independently", () => {
  const result = resolveCognitiveRoutingConfig(
    configuredRepository({ sessionStart: { control: "automatic", profile: "standard" } }),
    { cognitiveRouting: { sessionStart: { control: "manual", profile: "reasoning" } } },
  );

  assert.deepEqual(result.sessionStart, { control: "manual", profile: "reasoning" });
  assert.deepEqual(result.sessionStartSources, { control: "personal", profile: "personal" });

  const inheritedProfile = resolveCognitiveRoutingConfig(
    configuredRepository({ sessionStart: { control: "manual" } }),
    { cognitiveRouting: { sessionStart: { profile: "reasoning" } } },
  );
  assert.deepEqual(inheritedProfile.sessionStart, { control: "manual", profile: "reasoning" });
  assert.deepEqual(inheritedProfile.sessionStartSources, { control: "repository", profile: "personal" });
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

test("normal Pi model-registry context enables Cognitive Routing preflight", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-cognitive-routing-normal-pi-"));
  const host = createHost({ models: [standardModel, reasoningModel] });
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ defaultMode: "workflow", cognitiveRouting: configuredRepository().cognitiveRouting }),
    );

    const state = await readCapabilityState(cwd, host);

    assert.equal(state.hostSupportsCognitiveRouting, true);
    assert.equal(state.cognitiveRouting.effective, true);
    assert.deepEqual(state.cognitiveRouting.resolvedProfiles.standard, {
      ...standard,
      effectiveThinkingLevel: "high",
    });
    assert.deepEqual(state.cognitiveRouting.resolvedProfiles.reasoning, {
      ...reasoning,
      effectiveThinkingLevel: "max",
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("preserves the complete official model descriptor for auth preflight", async () => {
  const modelA = {
    provider: "faux",
    id: "standard",
    reasoning: true,
    headers: { "x-model": "standard" },
    metadata: "preserve-me",
  };
  const modelB = {
    provider: "faux",
    id: "reasoning",
    reasoning: true,
    headers: { "x-model": "reasoning" },
    metadata: "also-preserve-me",
  };
  const host = createHost({ models: [modelA, modelB] });
  const result = await resolveCognitiveRoutingState(
    configuredRepository({
      profiles: {
        standard: { provider: "faux", model: "standard", thinkingLevel: "high" },
        reasoning: { provider: "faux", model: "reasoning", thinkingLevel: "max" },
      },
    }),
    {},
    host,
  );

  assert.equal(result.effective, true);
  assert.equal(host.authModels[0].metadata, "preserve-me");
  assert.deepEqual(host.authModels[0].headers, { "x-model": "standard" });
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

test("packed preflight clamps thinking levels from model metadata without runtime peer imports", async () => {
  const packageDir = await mkdtemp(join(tmpdir(), "freeflow-packed-host-"));
  const packedHostPath = join(packageDir, "host.js");
  await copyFile(new URL("../../dist/cognitive-routing/host.js", import.meta.url), packedHostPath);
  await copyFile(new URL("../../dist/cognitive-routing/types.js", import.meta.url), join(packageDir, "types.js"));

  try {
    const { preflightCognitiveRoutingProfiles } = await import(
      `${pathToFileURL(packedHostPath).href}?packed=${Date.now()}`
    );
    const models = [
      {
        provider: standard.provider,
        id: standard.model,
        reasoning: true,
        thinkingLevelMap: { minimal: "low", xhigh: "xhigh", max: "max" },
      },
      {
        provider: reasoning.provider,
        id: reasoning.model,
        reasoning: true,
        thinkingLevelMap: { minimal: "low", xhigh: "xhigh", max: "max" },
      },
    ];
    const modelMap = new Map(models.map((model) => [`${model.provider}/${model.id}`, model]));
    const host = {
      modelRegistry: {
        find(provider, modelId) {
          return modelMap.get(`${provider}/${modelId}`);
        },
        async getApiKeyAndHeaders() {
          return { ok: true };
        },
      },
    };

    const result = await preflightCognitiveRoutingProfiles(
      resolveCognitiveRoutingConfig(configuredRepository(), {}),
      host,
    );

    assert.equal(result.effective, true);
    assert.equal(result.resolvedProfiles.standard.effectiveThinkingLevel, "high");
    assert.equal(result.resolvedProfiles.reasoning.effectiveThinkingLevel, "max");
  } finally {
    await rm(packageDir, { recursive: true, force: true });
  }
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
    let state = await readCapabilityState(cwd, host, PIFLOW_HOST);
    assert.equal(state.configured, true);
    assert.equal(state.enabled, true);
    assert.equal(state.cognitiveRouting.effective, true);

    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({ enabled: false, cognitiveRouting: configuredRepository().cognitiveRouting }),
    );
    state = await readCapabilityState(cwd, host, PIFLOW_HOST);
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
    state = await readCapabilityState(cwd, host, PIFLOW_HOST);
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
