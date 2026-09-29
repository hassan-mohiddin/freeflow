import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "../fixtures/routing-native.js";
import { routingState } from "../fixtures/routing-state.js";

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
      // Holds made between prompts are staged; the effective hold must match the model the host runs.
      assert.equal(
        profileFor[session.model.id],
        routingState(session.sessionManager).profile,
        "final profile matches the active model",
      );
      // When the next prompt writes the net change, it names the model that was active then.
      await session.prompt("Next task.");
      await session.waitForIdle();
      let model = "gpt-4o";
      for (const entry of session.sessionManager.getBranch()) {
        if (entry.type === "model_change") model = entry.modelId;
        const data = entry.customType === "freeflow-routing-v2" ? entry.data.data : undefined;
        if (data?.type === "control" && data.control === "manual")
          assert.equal(profileFor[model], data.profile, `manual ${data.profile} recorded while ${model} was active`);
      }
      const release = [...runner.getShortcuts({}).values()].find((s) =>
        /Release manual hold/.test(s.description ?? ""),
      );
      const racing = [cycle.handler(ctx)];
      await sleep(30);
      racing.push(release.handler(ctx));
      await Promise.allSettled(racing);
      await sleep(400);
      const released = routingState(session.sessionManager);
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

test(
  "one shortcut press switches the profile when the TUI hands a context copied at the key press",
  { timeout: 30000 },
  async () => {
    await fixture(() => [], false, undefined, true, {
      cognitiveRouting: {
        enabled: true,
        projection: true,
        delegation: "executor",
        profiles: {
          coordinator: { provider: "openai", model: "gpt-4o", thinking: "off" },
          executor: { provider: "openai", model: "gpt-4.1-mini", thinking: "off" },
        },
      },
      beforePrompt: async ({ session }) => {
        const runner = session.extensionRunner;
        const shortcuts = [...runner.getShortcuts({}).values()];
        const press = async (pattern) => {
          const live = runner.createContext();
          // Pi 0.87.1's interactive mode builds shortcut contexts this way: model and thinking level are
          // values read at the key press, not getters.
          const ctx = {
            ui: { ...live.ui, notify() {}, setStatus() {} },
            cwd: live.cwd,
            sessionManager: live.sessionManager,
            modelRegistry: live.modelRegistry,
            model: session.model,
            thinkingLevel: session.thinkingLevel,
            isIdle: () => session.isIdle,
            getSystemPrompt: () => session.systemPrompt,
          };
          await shortcuts.find((s) => pattern.test(s.description ?? "")).handler(ctx);
          return session.model.id;
        };
        const cycled = [];
        for (let i = 0; i < 4; i++) cycled.push(await press(/Cycle enabled/));
        assert.deepEqual(cycled, ["gpt-4.1-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4o"], "every press switches");
        await press(/Cycle enabled/);
        assert.equal(await press(/Release manual hold/), "gpt-4o", "one release returns to the Coordinator");
      },
    });
  },
);
