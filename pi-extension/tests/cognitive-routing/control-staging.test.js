import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "../fixtures/routing-native.js";
import { takeStage } from "../../dist/host/staging.js";
import { EventStore } from "../../dist/cognitive-routing/events.js";
import { replay } from "../../dist/cognitive-routing/state.js";
import {
  restoreSessionOverrides,
  setSessionCoreOverride,
  writeStagedSessionOverrides,
} from "../../dist/host/runtime-context.js";

const freeflowEntries = (manager) =>
  manager.getEntries().filter((e) => e.type === "custom" && e.customType.startsWith("freeflow-"));
const controls = (manager) =>
  manager
    .getBranch()
    .map((e, i) => ({ i, data: e.customType === "freeflow-routing-v2" ? e.data.data : undefined }))
    .filter((x) => x.data?.type === "control");
const hold = async (session, profile) => {
  await session.prompt(`/freeflow profile ${profile}`);
  await session.waitForIdle();
};

test("control changes before the first prompt write nothing, survive reload, and land as one net change", async () => {
  await fixture(
    () => [],
    false,
    async ({ manager }) => {
      const firstUser = manager.getBranch().findIndex((e) => e.type === "message" && e.message.role === "user");
      const written = controls(manager);
      assert.deepEqual(
        written.map((x) => [x.data.control, x.data.profile]),
        [["manual", "executor"]],
        "only the net change is written",
      );
      assert.ok(written[0].i < firstUser, "it is written ahead of the prompt");
      const models = manager
        .getBranch()
        .filter((e) => e.type === "model_change")
        .map((e) => e.modelId);
      assert.equal(models.at(-1), "gpt-4.1-mini", "the prompt applied the staged hold");
    },
    true,
    {
      beforePrompt: async ({ session, manager, notices }) => {
        assert.deepEqual(freeflowEntries(manager), [], "starting routing writes nothing");
        await hold(session, "executor");
        assert.equal(JSON.parse(notices.at(-1)[0]).status, "active");
        assert.equal(session.model.id, "gpt-4o", "the host model waits for the next prompt");
        await session.reload();
        assert.deepEqual(freeflowEntries(manager), [], "a hold and a reload before the first prompt write nothing");
        await hold(session, "executor");
        assert.equal(JSON.parse(notices.at(-1)[0]).status, "active", "the staged hold survived the reload");
        assert.deepEqual(freeflowEntries(manager), []);
      },
    },
  );
});

test("a burst of switches between prompts records only its net change", async () => {
  await fixture(
    () => [],
    false,
    async ({ session, manager }) => {
      const before = controls(manager).length;
      for (const profile of ["executor", "coordinator", "executor", "auto"]) await hold(session, profile);
      assert.equal(controls(manager).length, before, "switching between prompts writes nothing");
      await session.prompt("Next task.");
      await session.waitForIdle();
      assert.equal(controls(manager).length, before, "a burst that ends where it began records nothing");
      const modelChanges = () => manager.getBranch().filter((e) => e.type === "model_change").length;
      const changesBefore = modelChanges();
      for (const profile of ["executor", "coordinator", "executor"]) await hold(session, profile);
      assert.equal(modelChanges(), changesBefore, "switching between prompts leaves Pi's model alone");
      await session.prompt("Another task.");
      await session.waitForIdle();
      assert.equal(modelChanges(), changesBefore + 1, "the prompt applies one model change");
      assert.deepEqual(
        controls(manager)
          .slice(before)
          .map((x) => [x.data.control, x.data.profile]),
        [["manual", "executor"]],
      );
    },
    true,
  );
});

test("session setting overrides are staged until the next prompt and written only when they changed", async () => {
  const branch = [];
  const sessionManager = { getSessionId: () => "staged-overrides", getBranch: () => branch, getEntries: () => branch };
  const ctx = { cwd: process.cwd(), sessionManager };
  const appended = [];
  const pi = { appendEntry: (type, data) => appended.push({ type, data }) };
  restoreSessionOverrides(ctx);
  await setSessionCoreOverride("enabled", false, ctx, pi);
  assert.deepEqual(appended, [], "nothing is written between prompts");
  restoreSessionOverrides(ctx);
  let staged = takeStage(sessionManager);
  assert.deepEqual(staged.overrides, { enabled: false }, "the override survives the reload it requires");
  writeStagedSessionOverrides(staged.overrides, pi, sessionManager);
  assert.deepEqual(appended, [{ type: "freeflow-session-overrides", data: { overrides: { enabled: false } } }]);
  branch.push({ type: "custom", customType: "freeflow-session-overrides", data: { overrides: { enabled: false } } });
  await setSessionCoreOverride("enabled", null, ctx, pi);
  await setSessionCoreOverride("enabled", false, ctx, pi);
  staged = takeStage(sessionManager);
  writeStagedSessionOverrides(staged.overrides, pi, sessionManager);
  assert.equal(appended.length, 1, "changes that end where they began write nothing");
});

test("a staged control change is written before any later event, so replay keeps session order", async () => {
  const entries = [];
  const reader = {
    getSessionId: () => "staging-order",
    getSessionFile: () => undefined,
    getBranch: () => entries.slice(),
    getEntries: () => entries,
    getLeafId: () => entries.at(-1)?.id ?? null,
  };
  const store = new EventStore(
    {
      appendEntry: (customType, data) =>
        entries.push({ type: "custom", id: String(entries.length), parentId: reader.getLeafId(), customType, data }),
    },
    reader,
  );
  await store.reconcile();
  const control = (control, profile) => store.make({ type: "control", control, profile, reason: "fixture" });
  store.append(control("manual", "executor"));
  store.append(control("automatic", "coordinator"), true);
  assert.equal(replay(reader.getBranch()).control, "manual", "the release is staged");
  store.append(
    store.make({
      type: "execution-opened",
      execution: {
        id: "0f8e2a3c-5b6d-4e7f-8a9b-0c1d2e3f4a5b",
        profile: "coordinator",
        basisUserEntryId: null,
        pair: { provider: "openai", modelId: "gpt-4o", thinking: "off" },
        resultEntryIds: [],
      },
    }),
  );
  assert.deepEqual(
    reader.getBranch().map((e) => e.data.data.type + (e.data.data.control ? `:${e.data.data.control}` : "")),
    ["control:manual", "control:automatic", "execution-opened"],
  );
  assert.equal(replay(reader.getBranch()).control, store.state().control);
});
