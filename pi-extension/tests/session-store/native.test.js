import assert from "node:assert/strict";
import { mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import { NativeSessionStore } from "../../dist/session-store/native.js";

const ceiling = 268_435_456;

test("one native session keeps its writer across branch movement and releases it on shutdown", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-native-store-"));
  const manager = SessionManager.create(root, join(root, "sessions"));
  const ctx = { sessionManager: manager };
  const first = new NativeSessionStore();
  try {
    await first.open(ctx, ceiling);
    assert.deepEqual(first.status(), { state: "ready" });
    const initial = first.binding();
    assert.equal(initial.fence.branchAnchor, "root");
    manager.appendMessage({ role: "user", content: "first", timestamp: 1 });
    const storeRoot = initial.store.root;
    const hidden = `${storeRoot}-temporarily-hidden`;
    let moved;
    await rename(storeRoot, hidden);
    try {
      moved = await first.ensureCurrent(ctx);
      assert.equal(moved.fence.branchAnchor, manager.getLeafId(), "branch movement reads native ancestry only");
    } finally {
      await rename(hidden, storeRoot);
    }
    assert.equal(moved.manifest.storeId, initial.manifest.storeId);
    assert.equal(moved.fence.leaseId, initial.fence.leaseId);

    const competitor = new NativeSessionStore();
    await competitor.open(ctx, ceiling);
    assert.equal(competitor.status().state, "unavailable");
    assert.equal(competitor.status().reason, "writer_busy");
    await first.close();
    assert.equal(first.status().state, "unavailable");
    const reopened = new NativeSessionStore();
    await reopened.open(ctx, ceiling);
    assert.deepEqual(reopened.status(), { state: "ready" });
    assert.equal(reopened.binding().manifest.storeId, initial.manifest.storeId);
    assert.equal(reopened.binding().fence.branchAnchor, manager.getLeafId());
    await reopened.close();
  } finally {
    await first.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("an unpersisted or replaced native session cannot admit v2 effects", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-native-store-unavailable-"));
  const manager = SessionManager.create(root, join(root, "sessions"));
  const store = new NativeSessionStore();
  try {
    await store.open(
      { sessionManager: { getSessionId: () => manager.getSessionId(), getSessionFile: () => undefined } },
      ceiling,
    );
    assert.equal(store.status().reason, "store_identity_unavailable");
    assert.equal(store.binding(), undefined);

    const ctx = { sessionManager: manager };
    await store.open(ctx, ceiling);
    assert.equal(store.status().state, "ready");
    await assert.rejects(
      () =>
        store.ensureCurrent({
          sessionManager: { ...manager, getSessionId: () => "foreign", getSessionFile: () => manager.getSessionFile() },
        }),
      (error) => error.code === "store_unavailable",
    );
    assert.equal(store.status().state, "unavailable");
  } finally {
    await store.close();
    await rm(root, { recursive: true, force: true });
  }
});
