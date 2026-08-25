import assert from "node:assert/strict";
import test from "node:test";
import { CognitiveRoutingController, COGNITIVE_ROUTING_INTENT_ENTRY } from "../../dist/cognitive-routing/controller.js";
import {
  createPiSessionControllerHost,
  PI_SESSION_MODEL_STATE_ENTRY,
} from "../../dist/cognitive-routing/pi-session-control.js";

const capabilityState = {
  configured: true,
  configValid: true,
  enabled: true,
  effective: true,
  enabledSource: "repository",
  profiles: {},
  profileSources: { standard: "repository", reasoning: "repository" },
  resolvedProfiles: {
    standard: { provider: "faux", model: "standard", thinkingLevel: "high", effectiveThinkingLevel: "high" },
    reasoning: { provider: "faux", model: "reasoning", thinkingLevel: "max", effectiveThinkingLevel: "max" },
  },
  blockingReason: { code: "disabled", message: "not blocked" },
};

function createOfficialPiHost() {
  let currentModel = { provider: "faux", id: "return" };
  let currentThinkingLevel = "medium";
  const entries = [];
  const calls = [];
  const models = new Map([
    ["faux/return", currentModel],
    ["faux/standard", { provider: "faux", id: "standard" }],
    ["faux/reasoning", { provider: "faux", id: "reasoning" }],
  ]);

  const pi = {
    async setModel(model) {
      calls.push(["setModel", model.provider, model.id]);
      currentModel = model;
      return true;
    },
    setThinkingLevel(level) {
      calls.push(["setThinkingLevel", level]);
      currentThinkingLevel = level;
    },
    appendEntry(customType, data) {
      calls.push(["appendEntry", customType]);
      entries.push({ type: "custom", customType, data });
    },
  };
  const ctx = {
    get model() {
      return currentModel;
    },
    get thinkingLevel() {
      return currentThinkingLevel;
    },
    modelRegistry: {
      find(provider, modelId) {
        return models.get(`${provider}/${modelId}`);
      },
    },
    sessionManager: {
      getEntries: () => entries,
      getBranch: () => entries,
      getLeafId: () => entries.at(-1)?.id ?? null,
    },
  };

  return { pi, ctx, entries, calls };
}

test("activates the controller through the official Pi session facade", async () => {
  const host = createOfficialPiHost();
  const controller = new CognitiveRoutingController({
    capabilityState,
    pi: createPiSessionControllerHost(host),
    ctx: host.ctx,
    idFactory: (() => {
      const ids = ["epoch-1", "correlation-1"];
      return () => ids.shift();
    })(),
  });

  const result = await controller.activate();

  assert.deepEqual(result, { status: "active", profile: "standard" });
  assert.deepEqual(host.calls, [
    ["appendEntry", COGNITIVE_ROUTING_INTENT_ENTRY],
    ["appendEntry", PI_SESSION_MODEL_STATE_ENTRY],
    ["setModel", "faux", "standard"],
    ["setThinkingLevel", "high"],
    ["appendEntry", PI_SESSION_MODEL_STATE_ENTRY],
  ]);
  assert.deepEqual(
    { provider: host.ctx.model.provider, modelId: host.ctx.model.id, thinkingLevel: host.ctx.thinkingLevel },
    { provider: "faux", modelId: "standard", thinkingLevel: "high" },
  );
  assert.equal(controller.state().activeProfile, "standard");
  assert.equal(controller.state().effective, true);
});
