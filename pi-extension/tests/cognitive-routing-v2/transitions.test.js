import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "../fixtures/routing-native.js";
import { replay } from "../../dist/cognitive-routing-v2/state.js";

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
        assert.equal(session.model.id, "gpt-4.1-mini");
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
