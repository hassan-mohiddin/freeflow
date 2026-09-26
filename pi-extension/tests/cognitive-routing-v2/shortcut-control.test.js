import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "../fixtures/routing-native.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const profileFor = { "gpt-4o": "coordinator", "gpt-4.1-mini": "executor" };

test("rapid manual-hold shortcuts never record a profile whose model was not applied", { timeout: 30000 }, async () => {
  await fixture(
    () => [],
    false,
    async ({ session }) => {
      const runner = session.extensionRunner;
      const registry = runner.modelRegistry,
        resolve = registry.getApiKeyAndHeaders.bind(registry);
      // Real OAuth resolution takes time; a press that arrives meanwhile supersedes the one in flight.
      registry.getApiKeyAndHeaders = async (model) => {
        await sleep(120);
        return resolve(model);
      };
      const cycle = [...runner.getShortcuts({}).values()].find((s) => /Cycle enabled/.test(s.description ?? ""));
      const base = runner.createContext();
      const ctx = new Proxy(base, {
        get: (target, key) => (key === "ui" ? { ...target.ui, notify() {}, setStatus() {} } : Reflect.get(target, key)),
      });
      const presses = [];
      for (let i = 0; i < 5; i++) {
        presses.push(cycle.handler(ctx));
        await sleep(70);
      }
      await Promise.allSettled(presses);
      await sleep(400);
      let model = "gpt-4o";
      for (const entry of session.sessionManager.getBranch()) {
        if (entry.type === "model_change") model = entry.modelId;
        const data = entry.customType === "freeflow-routing-v2" ? entry.data.data : undefined;
        if (data?.type === "control" && data.control === "manual")
          assert.equal(profileFor[model], data.profile, `manual ${data.profile} recorded while ${model} was active`);
      }
      const last = session.sessionManager
        .getBranch()
        .filter((e) => e.customType === "freeflow-routing-v2" && e.data.data.type === "control")
        .at(-1).data.data;
      assert.equal(profileFor[session.model.id], last.profile, "final profile matches the active model");
      const release = [...runner.getShortcuts({}).values()].find((s) =>
        /Release manual hold/.test(s.description ?? ""),
      );
      const racing = [cycle.handler(ctx)];
      await sleep(30);
      racing.push(release.handler(ctx));
      await Promise.allSettled(racing);
      await sleep(400);
      const released = session.sessionManager
        .getBranch()
        .filter((e) => e.customType === "freeflow-routing-v2" && e.data.data.type === "control")
        .at(-1).data.data;
      assert.deepEqual([released.control, released.profile], ["automatic", "coordinator"]);
      assert.equal(session.model.id, "gpt-4o", "automatic release applies the Coordinator model");
    },
    true,
    {
      cognitiveRouting: {
        enabled: true,
        projection: false,
        delegation: "executor",
        profiles: {
          coordinator: { provider: "openai", model: "gpt-4o", thinking: "off" },
          executor: { provider: "openai", model: "gpt-4.1-mini", thinking: "off" },
        },
      },
    },
  );
});
