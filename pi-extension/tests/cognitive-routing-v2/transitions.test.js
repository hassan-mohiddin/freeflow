import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "../fixtures/routing-native.js";
import { replay } from "../../dist/cognitive-routing-v2/state.js";
import { RoutingRuntime } from "../../dist/cognitive-routing-v2/runtime.js";

// Delegate, then let the worker stop without returning so the assignment stays outstanding.
const unfinished = (n) =>
  n === 1
    ? [{ name: "freeflow_delegate", args: { operation: "assign", contract: "Read evidence.txt and report." } }]
    : [];
const routingEvents = (manager) =>
  manager
    .getBranch()
    .filter((e) => e.customType === "freeflow-routing-v2")
    .map((e) => e.data.data.type);

test("a resume whose worker model cannot be applied records no worker control", { timeout: 30000 }, async () => {
  await fixture(unfinished, false, async ({ session, manager, requests }) => {
    await session.prompt("What is the current state?");
    await session.waitForIdle();
    assert.equal(session.model.id, "gpt-4o");
    assert.equal(replay(manager.getBranch()).assignments.values().next().value.state, "outstanding");
    const registry = session.extensionRunner.modelRegistry,
      resolve = registry.getApiKeyAndHeaders.bind(registry);
    registry.getApiKeyAndHeaders = async (model) =>
      model.id === "gpt-4.1-mini" ? { ok: false, error: "fixture auth unavailable" } : resolve(model);
    const before = routingEvents(manager).length,
      sent = requests.length;
    await session.prompt("/freeflow resume");
    await session.waitForIdle();
    const after = replay(manager.getBranch());
    assert.deepEqual(routingEvents(manager).slice(before), [], "nothing is recorded for a switch that did not happen");
    assert.equal(after.control, "automatic");
    assert.equal(after.profile, "coordinator");
    assert.equal(session.model.id, "gpt-4o");
    assert.equal(requests.length, sent, "no worker turn starts on the wrong model");
  });
});

test(
  "a manual hold whose model was changed outside routing is reported, not overridden",
  { timeout: 30000 },
  async () => {
    await fixture(
      () => [],
      false,
      async ({ session, notices, requests }) => {
        await session.prompt("/freeflow profile executor");
        await session.waitForIdle();
        assert.equal(session.model.id, "gpt-4o", "an idle hold waits for the next prompt");
        await session.prompt("Apply the hold.");
        await session.waitForIdle();
        assert.equal(requests.at(-1).model, "gpt-4.1-mini", "the prompt applies the hold");
        await session.setModel(session.extensionRunner.modelRegistry.find("openai", "gpt-4o"));
        const before = notices.length;
        await session.prompt("Continue.");
        await session.waitForIdle();
        await session.prompt("Continue again.");
        await session.waitForIdle();
        const warnings = notices.slice(before).filter(([text]) => /Manual hold/.test(String(text)));
        assert.equal(warnings.length, 1, "the mismatch is reported once, not on every request");
        assert.match(String(warnings[0][0]), /executor/);
        assert.match(String(warnings[0][0]), /gpt-4o/);
        assert.equal(requests.at(-1).model, "gpt-4o", "the user's own model choice is honored");
      },
    );
  },
);

test(
  "picking another model in Pi cancels a profile switch still waiting for the next prompt",
  { timeout: 30000 },
  async () => {
    await fixture(
      () => [],
      false,
      async ({ session, requests }) => {
        await session.prompt("/freeflow profile executor");
        await session.waitForIdle();
        await session.setModel(session.extensionRunner.modelRegistry.find("openai", "gpt-4.1"));
        await session.prompt("Use my pick.");
        await session.waitForIdle();
        assert.equal(requests.at(-1).model, "gpt-4.1", "the user's own pick wins over the pending switch");
      },
    );
  },
);

test(
  "a routing failure at the first prompt still sends the fixed Freeflow system prompt",
  { timeout: 30000 },
  async () => {
    const firstInstructions = async (failing) => {
      const seen = [];
      const original = RoutingRuntime.prototype.beforeRun;
      try {
        const run = fixture(
          (_n, body) => {
            const system = JSON.stringify(
              body.input.find((item) => item.role === "system" || item.role === "developer"),
            );
            // Each fixture run has its own temporary working directory.
            seen.push(system.replace(/[^"\s]*freeflow-v2-native-[^/"\s]*/g, "<root>"));
            return [];
          },
          false,
          undefined,
          true,
          {
            beforePrompt: () => {
              if (failing)
                RoutingRuntime.prototype.beforeRun = async () => {
                  throw new Error("fixture reconciliation failure");
                };
            },
          },
        );
        // Pi reports the handler error, which the fixture rejects with, and still sends the prompt.
        if (failing) await assert.rejects(run, /extension lifecycle errors/);
        else await run;
      } finally {
        RoutingRuntime.prototype.beforeRun = original;
      }
      return seen[0];
    };
    const normal = await firstInstructions(false);
    assert.ok(normal, "the normal run sent a request");
    assert.equal(await firstInstructions(true), normal, "the cached prompt head is unchanged");
  },
);
