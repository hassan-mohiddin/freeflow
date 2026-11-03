import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { WAIT_BATCH_MS, WaitWatch, stillWaiting } from "../../dist/store/waits.js";

const state = (returned, at = returned ? "2026-11-03T20:00:00.000Z" : null) => ({
  home: "/s",
  store: true,
  session: "c",
  task: { id: "p/task-001", record: "/s/r.md", stateAsOf: null },
  waits: { slice: "S-057", channel: "/s/channel.jsonl", delegations: [{ id: "D-031", returned, at }] },
});

function host(initial, { wake = true } = {}) {
  const h = {
    now: initial,
    last: initial,
    refreshed: 0,
    delivered: [],
    refresh: async () => {
      h.refreshed += 1;
      h.last = h.now;
      return h.now;
    },
    current: () => h.last,
    deliver: (text, woke) => h.delivered.push([text, woke]),
    wakeOnReturn: () => wake,
  };
  return h;
}

test("a Waits on return gives one row at a run's end, once, with a wake where wakeOnReturn is on (SPEC-009 4.4)", async () => {
  const h = host(state(null));
  const watch = new WaitWatch(h);
  await watch.runEnded();
  assert.deepEqual(h.delivered, []);
  assert.equal(h.refreshed, 1);
  watch.stop();
  h.now = state("done");
  await watch.runEnded();
  assert.deepEqual(h.delivered, [["Freeflow: D-031 returned (done). S-057 waits on it: check it and close it.", true]]);
  await watch.runEnded();
  assert.equal(h.delivered.length, 1);
  // Nothing waits any more, so the state is not read again.
  assert.equal(h.refreshed, 2);
  assert.equal(stillWaiting(h.now), false);

  const off = host(state("blocked"), { wake: false });
  await new WaitWatch(off).runEnded();
  assert.deepEqual(off.delivered, [
    ["Freeflow: D-031 returned (blocked). S-057 waits on it: check it and close it.", false],
  ]);
});

test("while idle and waiting, the state is read once a minute until the return comes; a run's start stops the watch", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const h = host(state(null));
    const watch = new WaitWatch(h);
    await watch.runEnded();
    assert.equal(h.refreshed, 1);
    mock.timers.tick(WAIT_BATCH_MS);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(h.refreshed, 2);
    h.now = state("done");
    mock.timers.tick(WAIT_BATCH_MS);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(h.delivered.length, 1);
    // Back: no more watching.
    mock.timers.tick(WAIT_BATCH_MS * 3);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(h.refreshed, 3);

    const other = host(state(null));
    const busy = new WaitWatch(other);
    await busy.runEnded();
    busy.runStarted();
    mock.timers.tick(WAIT_BATCH_MS * 2);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(other.refreshed, 1);
  } finally {
    mock.timers.reset();
  }
});
