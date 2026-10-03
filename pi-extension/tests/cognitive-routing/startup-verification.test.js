import assert from "node:assert/strict";
import test from "node:test";
import { copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { fixture } from "../fixtures/routing-native.js";
import { EventStore } from "../../dist/cognitive-routing/event-store.js";
import { replay } from "../../dist/cognitive-routing/state.js";
import { readOnlySessionCounters, trustLoadedSession } from "../../dist/host/read-only-session.js";

// Routing verifies at startup that the session it replays is persisted. Pi parsed the file when it opened the
// session, so the bytes appended since then are enough; a whole-file snapshot is the fallback when that trust point
// is missing or anything differs (dev-docs/subsystems/cognitive-routing.md, Persistence and reconciliation).

// Coordinator delegates; the worker answers once without returning, so the session holds routing events.
const script = (n) =>
  n === 1 ? [{ name: "freeflow_delegate", args: { operation: "assign", contract: "Read evidence.txt." } }] : [];

/** Runs a routed fixture and hands its persisted session file to `check` before the fixture removes it. */
const withRoutedSession = (check) =>
  fixture(script, false, async ({ manager }) => check(manager.getSessionFile(), manager.getCwd()));

const open = (file, cwd) => SessionManager.open(file, dirname(file), cwd);
const store = (reader) => new EventStore({ appendEntry() {} }, reader);

test("a start Pi just loaded is verified by the file's tail, without a snapshot", { timeout: 30000 }, async () => {
  await withRoutedSession(async (file, cwd) => {
    const reader = open(file, cwd);
    trustLoadedSession(reader);
    const before = readOnlySessionCounters.snapshots;
    const events = store(reader);
    await events.reconcile();
    assert.equal(events.blocked, undefined);
    assert.equal(readOnlySessionCounters.snapshots, before, "no whole-file snapshot");
    assert.deepEqual(events.state().assignments, replay(reader.getBranch()).assignments);
  });
});

test("without a trust point the full snapshot decides", { timeout: 30000 }, async () => {
  await withRoutedSession(async (file, cwd) => {
    const copy = join(dirname(file), "untrusted.jsonl");
    await copyFile(file, copy);
    const before = readOnlySessionCounters.snapshots;
    const events = store(open(copy, cwd));
    await events.reconcile();
    assert.equal(events.blocked, undefined);
    assert.equal(readOnlySessionCounters.snapshots, before + 1);
  });
});

test("an entry Pi holds but never wrote blocks routing instead of being trusted", { timeout: 30000 }, async () => {
  await withRoutedSession(async (file, cwd) => {
    const reader = open(file, cwd);
    trustLoadedSession(reader);
    // A failed write leaves the entry in memory only; Pi then appends nothing to the file.
    reader.persist = false;
    reader.appendCustomEntry("test-unpersisted", { lost: true });
    reader.persist = true;
    const events = store(reader);
    await assert.rejects(events.reconcile());
    // The live leaf is not on disk, so the persisted ancestry cannot be established.
    assert.match(String(events.blocked), /ancestry/);
  });
});

test("a reload does not trust a file it did not re-read", { timeout: 30000 }, async () => {
  let checked = false;
  // The blocked prompt ends the run in an error, which the fixture's own completion check then reports.
  await assert.rejects(
    fixture(script, false, async ({ session, manager, requests }) => {
      manager.persist = false;
      manager.appendCustomEntry("test-unpersisted", { lost: true });
      manager.persist = true;
      await session.reload();
      const before = requests.length;
      await session.prompt("Continue.");
      await session.waitForIdle();
      assert.equal(requests.length, before, "routing blocks the request rather than trusting unverified history");
      checked = true;
    }),
    /fixture completes without provider failure/,
  );
  assert.ok(checked);
});
