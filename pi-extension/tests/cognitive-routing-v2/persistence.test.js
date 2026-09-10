import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, rename, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { EventStore } from "../../dist/session-sources/events.js";
import {
  parseReadOnlySessionText,
  readOnlySessionSnapshot,
  activeReadOnlySessionBranch,
} from "../../dist/session-sources/read-only-session.js";

const header = { type: "session", version: 3, id: "test-session", cwd: "/fixture" };
const entry = (id, parentId) => ({ type: "custom", id, parentId, customType: "test", data: {} });
const lines = (entries) => entries.map((e) => JSON.stringify(e)).join("\n") + "\n";

test("strict snapshot rejects corruption, duplicate identity, forward parents, cycles and unsupported headers", () => {
  for (const text of [
    "",
    JSON.stringify(header) + "\n{",
    lines([header, entry("a", null), entry("a", null)]),
    lines([header, entry("a", "b"), entry("b", "a")]),
    lines([{ ...header, version: 99 }]),
    lines([header, entry("a", "missing")]),
  ])
    assert.throws(() => parseReadOnlySessionText(text));
  const parsed = parseReadOnlySessionText(lines([header, entry("a", null), entry("b", "a"), entry("c", "a")]));
  const snapshot = { path: "/fixture", sessionId: header.id, version: 3, hash: "unused", entries: parsed };
  assert.deepEqual(
    activeReadOnlySessionBranch(snapshot, "b").map((e) => e.id),
    ["a", "b"],
  );
  assert.deepEqual(
    activeReadOnlySessionBranch(snapshot, "c").map((e) => e.id),
    ["a", "c"],
  );
  assert.throws(() => activeReadOnlySessionBranch(snapshot, "absent"));
});
test("fresh no-v2 baseline validates ancestry before allowing automatic effects", async () => {
  for (const branch of [[entry("child", "missing")], [entry("same", null), entry("same", "same")]]) {
    const store = new EventStore(
      {
        appendEntry() {
          assert.fail("must not append");
        },
      },
      {
        getSessionId: () => "fixture",
        getSessionFile: () => undefined,
        getBranch: () => branch,
        getEntries: () => branch,
        getLeafId: () => branch.at(-1).id,
      },
    );
    await assert.rejects(store.reconcile(), (e) => e.code === "invalid_native_ancestry");
    assert.ok(store.blocked);
  }
});

test("snapshot does not repair a missing newline and enforces its read limit", async () => {
  const dir = await mkdtemp(join(tmpdir(), "freeflow-snapshot-"));
  try {
    const path = join(dir, "session.jsonl");
    const text = lines([header, entry("a", null)]).trimEnd();
    await writeFile(path, text);
    const snapshot = await readOnlySessionSnapshot(path);
    assert.equal(snapshot.entries.length, 2);
    assert.equal(await readFile(path, "utf8"), text);
    await assert.rejects(readOnlySessionSnapshot(path, { maxBytes: 8 }), (e) => e.code === "read_limit");
    assert.equal(await readFile(path, "utf8"), text);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("real Pi append failure advances memory but cannot be acknowledged by duplicate lookup", async () => {
  const dir = await mkdtemp(join(tmpdir(), "freeflow-append-failure-"));
  try {
    const manager = SessionManager.create(dir, join(dir, "sessions"));
    manager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "seed" }],
      api: "fixture",
      provider: "fixture",
      model: "fixture",
      timestamp: 1,
      stopReason: "stop",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    });
    const path = manager.getSessionFile();
    const store = new EventStore({ appendEntry: (type, data) => manager.appendCustomEntry(type, data) }, manager);
    await store.reconcile();
    const event = store.make(
      { type: "control", control: "automatic", profile: "coordinator", reason: "fixture activation" },
      "activation",
      "control",
    );
    await rename(path, path + ".saved");
    await mkdir(path);
    assert.throws(
      () => store.append(event),
      (e) => e.code === "acknowledgment_uncertain",
    );
    assert.ok(
      manager.getBranch().some((e) => e.data?.eventId === event.eventId),
      "native memory advanced before persistence failed",
    );
    const count = manager.getEntries().length;
    assert.throws(
      () => store.append(event),
      (e) => e.code === "acknowledgment_uncertain",
    );
    assert.equal(manager.getEntries().length, count);
    await rm(path, { recursive: true });
    await rename(path + ".saved", path);
    await assert.rejects(store.reconcile());
    assert.ok(store.blocked, "missing disk event does not clear uncertainty");
    // Simulate the distinct case in which fresh disk reconstruction establishes the event.
    await writeFile(path, lines([manager.getHeader(), ...manager.getEntries()]));
    await store.reconcile();
    assert.equal(store.blocked, undefined);
    store.append(event);
    assert.equal(manager.getEntries().length, count, "confirmed duplicate has no new effect");
    const reloaded = new EventStore({ appendEntry: (type, data) => manager.appendCustomEntry(type, data) }, manager);
    assert.throws(
      () => reloaded.append(event),
      (e) => e.code === "acknowledgment_uncertain",
    );
    await reloaded.reconcile();
    reloaded.append(event);
    assert.equal(manager.getEntries().length, count);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("an acknowledgment from another native occurrence is not reused without reconciliation", async () => {
  const branch = [];
  const reader = {
    getSessionId: () => "fixture",
    getSessionFile: () => undefined,
    getBranch: () => branch,
    getEntries: () => branch,
    getLeafId: () => branch.at(-1)?.id ?? null,
  };
  const store = new EventStore(
    {
      appendEntry: (customType, data) =>
        branch.push({ type: "custom", id: "original", parentId: null, customType, data }),
    },
    reader,
  );
  await store.reconcile();
  const event = store.make({ type: "control", control: "automatic", profile: "coordinator", reason: "fixture" });
  store.append(event);
  branch[0] = { ...branch[0], id: "different-occurrence" };
  assert.throws(
    () => store.append(event),
    (error) => error.code === "acknowledgment_uncertain",
  );
  assert.equal(branch.length, 1);
});
