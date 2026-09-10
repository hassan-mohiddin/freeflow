import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { fixture } from "../fixtures/routing-native.js";
import { EventStore } from "../../dist/session-sources/events.js";

test("unchanged native history reuses state, while deltas and ancestry changes invalidate it", async () => {
  const entries = [];
  const reader = {
    getSessionId: () => "fixture",
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
  store.append(store.make({ type: "control", control: "automatic", profile: "coordinator", reason: "fixture" }));
  const first = store.state();
  for (let n = 0; n < 100; n++) assert.equal(store.state(), first);
  store.append(store.make({ type: "control", control: "manual", profile: "executor", reason: "fixture" }));
  const second = store.state();
  assert.notEqual(first, second);
  assert.equal(first.control, "automatic");
  assert.equal(second.control, "manual");
  entries.pop();
  assert.equal(store.state().control, "automatic");
});

test(
  "ordinary native chat records minimal automatic authorship without exposure telemetry",
  { timeout: 30000 },
  async (t) => {
    await fixture(
      () => [],
      false,
      async ({ session, manager }) => {
        const count = () => manager.getEntries().filter((e) => e.customType === "freeflow-routing-v2").length;
        const original = count();
        const samples = [];
        for (let n = 0; n < 24; n++) {
          const start = performance.now();
          await session.prompt(`hello ${n}`);
          await session.waitForIdle();
          samples.push(performance.now() - start);
          assert.equal(
            count(),
            original + 2 * (n + 1),
            "one open/bind pair preserves Coordinator authorship without exposure telemetry",
          );
          const latest = manager
            .getEntries()
            .filter((e) => e.data?.data?.type === "execution-bound")
            .at(-1);
          assert.equal(manager.getEntry(latest.data.data.assistantEntryId).message.role, "assistant");
        }
        const controls = [];
        for (const profile of ["executor", "coordinator", "auto"]) {
          const start = performance.now();
          await session.prompt(`/freeflow profile ${profile}`);
          await session.waitForIdle();
          controls.push({ profile, ms: performance.now() - start });
        }
        const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
        t.diagnostic(
          JSON.stringify({
            observer: "native SDK, immediate scripted transport",
            samples,
            firstFiveMedianMs: median(samples.slice(0, 5)),
            lastFiveMedianMs: median(samples.slice(-5)),
            controls,
            entries: manager.getEntries().length,
            routingEntries: count(),
          }),
        );
      },
      true,
      { maxRequests: 30 },
    );
  },
);
