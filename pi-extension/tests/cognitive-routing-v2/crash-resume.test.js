import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { fixture } from "../fixtures/routing-native.js";
import { replay } from "../../dist/cognitive-routing-v2/state.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Coordinator delegates; the Executor answers once without returning, leaving the assignment outstanding.
const script = (n) =>
  n === 1
    ? [{ name: "freeflow_delegate", args: { operation: "assign", contract: "Read evidence.txt and report." } }]
    : [];

// A process that dies mid-run leaves the worker's execution opened but never bound.
function simulateCrash(manager) {
  const state = replay(manager.getBranch());
  const [assignment] = state.assignments.values();
  manager.appendCustomEntry("freeflow-routing-v2", {
    version: 2,
    eventId: randomUUID(),
    operationId: randomUUID(),
    stepId: "execution-opened",
    recordedSessionId: manager.getSessionId(),
    data: {
      type: "execution-opened",
      execution: {
        id: randomUUID(),
        profile: "executor",
        assignmentId: assignment.id,
        basisUserEntryId: assignment.basisUserEntryId,
        pair: { provider: "openai", modelId: "gpt-4.1-mini", thinking: "off" },
        resultEntryIds: [],
      },
    },
  });
}

test("a worker run interrupted by a crash resumes automatically after reload", { timeout: 30000 }, async () => {
  await fixture(script, false, async ({ session, manager, requests }) => {
    assert.equal(replay(manager.getBranch()).assignments.values().next().value.state, "outstanding");
    simulateCrash(manager);
    const before = requests.length;
    await session.reload();
    for (let i = 0; i < 50 && requests.length === before; i++) await sleep(20);
    await session.waitForIdle();
    assert.equal(requests.length, before + 1, "the interrupted worker run continues without user input");
    assert.equal(requests.at(-1).model, "gpt-4.1-mini");
    assert.ok(manager.getBranch().some((e) => e.customType === "freeflow-routing-v2-resume"));
  });
});

test("an idle reopen does not start work but says the assignment can be resumed", { timeout: 30000 }, async () => {
  await fixture(script, false, async ({ session, requests, notices }) => {
    const before = requests.length;
    await session.reload();
    await sleep(300);
    await session.waitForIdle();
    assert.equal(requests.length, before, "reopening an idle session spends nothing");
    assert.ok(
      notices.some(([text]) => /\/freeflow resume/.test(String(text))),
      "a resume notice is shown",
    );
  });
});
