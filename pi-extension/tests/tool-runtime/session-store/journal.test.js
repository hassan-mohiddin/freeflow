import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  truncate,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { JournalError } from "../../../dist/tool-runtime/session-store/journal.js";
import { JournalEventStore } from "../../../dist/tool-runtime/session-store/store.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const make = (root) => new JournalEventStore(join(root, "store"), "store:one", "session:one", "root");
const event = (id, branchAnchor = "root", domain = "execution", payload = { id }) => ({
  version: 1,
  id: `event:${id}`,
  domain,
  kind: "observation",
  operationId: `operation:${id}`,
  recordedSessionId: "session:one",
  branchAnchor,
  payload,
  artifactRefs: [],
  payloadHash: hash(JSON.stringify(payload)),
});
const expectCode = (code) => (error) => error instanceof JournalError && error.code === code;

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-v2-journal-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("committed head acknowledges one ordered journal, isolates domains and branches, and preserves idempotent identity", async () =>
  fixture(async (root) => {
    const store = make(root);
    const fence = await store.acquireWriter();
    assert.equal(JSON.parse(await readFile(join(root, "store", "head.json"), "utf8")).sequence, 0);
    assert.equal(store.status().state, "unavailable", "a lease alone does not establish recovered state");
    assert.equal((await store.recover()).entries.length, 0);
    assert.equal(store.status().state, "ready");
    const rootEvent = event("one");
    assert.equal((await store.appendEvent(rootEvent, fence)).sequence, 1);
    assert.equal((await store.appendEvent(rootEvent, fence)).sequence, 1);
    const branchA = await store.refreshBranch(fence, "entry:a");
    await assert.rejects(() => store.appendEvent(event("stale"), fence), expectCode("fence_changed"));
    assert.equal((await store.appendEvent(event("two", "entry:a"), branchA)).sequence, 2);
    assert.equal((await store.appendEvent(event("three", "entry:a", "guidance"), branchA)).sequence, 3);
    await assert.rejects(() => store.appendEvent(event("one", "entry:a"), branchA), expectCode("event_conflict"));
    await assert.rejects(
      () => store.appendEvent({ ...event("bad", "entry:a"), payloadHash: hash("wrong") }, branchA),
      expectCode("event_invalid"),
    );
    const recovered = await store.recover();
    assert.deepEqual(
      recovered.entries.map(({ sequence, event }) => [sequence, event.id]),
      [
        [1, "event:one"],
        [2, "event:two"],
        [3, "event:three"],
      ],
    );
    assert.equal(recovered.trailingBytes, 0);
    assert.deepEqual(
      (
        await store.replay("execution", {
          sessionId: "session:one",
          branchAnchor: "entry:a",
          nativeEntryIds: ["entry:a"],
        })
      ).map((item) => item.id),
      ["event:one", "event:two"],
    );
    assert.deepEqual(
      (
        await store.replay("guidance", {
          sessionId: "session:one",
          branchAnchor: "entry:b",
          nativeEntryIds: ["entry:b"],
        })
      ).map((item) => item.id),
      [],
    );
    await assert.rejects(
      () =>
        store.replay("execution", {
          sessionId: "session:other",
          branchAnchor: "entry:a",
          nativeEntryIds: ["entry:a"],
        }),
      expectCode("ancestry_invalid"),
    );
    await assert.rejects(
      () =>
        store.replay("execution", {
          sessionId: "session:one",
          branchAnchor: "entry:a",
          nativeEntryIds: ["entry:b"],
        }),
      expectCode("ancestry_invalid"),
    );
    await store.releaseWriter(branchA);
    const successor = make(root);
    const next = await successor.acquireWriter();
    assert.equal((await successor.recover()).entries.length, 3);
    await successor.releaseWriter(next);
  }));

test("v2 execution events require their owning native occurrence, not the write-time leaf", async () =>
  fixture(async (root) => {
    const store = make(root);
    const fence = await store.acquireWriter();
    await store.recover();
    const branch = await store.refreshBranch(fence, "entry:assistant");
    await store.appendEvent(
      {
        ...event("sidecar", "entry:assistant", "execution", { occurrenceId: "occurrence:one" }),
        kind: "operation-outcome",
      },
      branch,
    );
    const ancestry = {
      sessionId: "session:one",
      branchAnchor: "entry:sibling",
      nativeEntryIds: ["entry:assistant", "entry:sibling"],
    };
    assert.deepEqual(
      await store.replay("execution", ancestry),
      [],
      "a sibling retaining only the caller cannot inherit its result",
    );
    assert.deepEqual(
      await store.replay("execution", {
        sessionId: "session:one",
        branchAnchor: "entry:result",
        nativeEntryIds: ["entry:assistant", "entry:result"],
      }),
      [],
      "an unbound sidecar is pending even when a result entry exists",
    );
    const owned = await store.replay("execution", {
      sessionId: "session:one",
      branchAnchor: "entry:result",
      nativeEntryIds: ["entry:assistant", "entry:result"],
      nativeOccurrences: [{ occurrenceId: "occurrence:one", entryId: "entry:result" }],
    });
    assert.equal(owned.length, 1);
    assert.equal(owned[0].id, "event:sidecar");
    await assert.rejects(
      () =>
        store.replay("execution", {
          ...ancestry,
          nativeOccurrences: [{ occurrenceId: "occurrence:one", entryId: "entry:result" }],
        }),
      expectCode("ancestry_invalid"),
    );
    await store.appendEvent({ ...event("false-owner", "entry:assistant", "guidance"), nativeEntryId: "root" }, branch);
    assert.deepEqual(
      await store.replay("guidance", {
        sessionId: "session:one",
        branchAnchor: "entry:result",
        nativeEntryIds: ["entry:assistant", "entry:result"],
      }),
      [],
      "root is a write fence placeholder, never an owning native entry",
    );
    await store.releaseWriter(branch);
  }));

test("concurrent appends are serialized under one writer without duplicate sequence numbers", async () =>
  fixture(async (root) => {
    const store = make(root);
    const fence = await store.acquireWriter();
    const results = await Promise.all(["a", "b", "c"].map((id) => store.appendEvent(event(id), fence)));
    assert.deepEqual(
      results.map((entry) => entry.sequence),
      [1, 2, 3],
    );
    assert.deepEqual(
      (await store.recover()).entries.map((entry) => entry.sequence),
      [1, 2, 3],
    );
    const [last, nextFence] = await Promise.all([
      store.appendEvent(event("d"), fence),
      store.refreshBranch(fence, "entry:a"),
    ]);
    assert.equal(last.sequence, 4, "the queued append settles before the branch fence advances");
    await assert.rejects(() => store.appendEvent(event("stale"), fence), expectCode("fence_changed"));
    await store.releaseWriter(nextFence);
  }));

test("exclusive writer and abandoned lease fail closed without deleting another owner's file", async () =>
  fixture(async (root) => {
    const store = make(root);
    const fence = await store.acquireWriter();
    const competing = make(root);
    await assert.rejects(() => competing.acquireWriter(), expectCode("writer_busy"));
    await store.releaseWriter(fence);
    const path = join(root, "store", ".writer-lease");
    await writeFile(path, "stale-owner", { mode: 0o600 });
    await assert.rejects(() => competing.acquireWriter(), expectCode("writer_busy"));
    assert.equal(await readFile(path, "utf8"), "stale-owner");
    const empty = join(root, "existing-empty");
    await mkdir(empty);
    const unknown = new JournalEventStore(empty, "store:two", "session:one", "root");
    await assert.rejects(() => unknown.acquireWriter(), expectCode("head_missing"));
    assert.deepEqual(await readdir(empty), []);
  }));

test("uncommitted tail is excluded, blocks append, and requires explicit durable quarantine", async () =>
  fixture(async (root) => {
    const store = make(root);
    const fence = await store.acquireWriter();
    await store.appendEvent(event("one"), fence);
    await appendFile(join(root, "store", "events.log"), '{"partial"');
    const partial = await store.recover();
    assert.deepEqual(
      partial.entries.map(({ event }) => event.id),
      ["event:one"],
    );
    assert.equal(partial.trailingBytes, Buffer.byteLength('{"partial"'));
    assert.equal(store.status().state, "orphaned");
    await assert.rejects(() => store.appendEvent(event("two"), fence), expectCode("tail_repair_required"));
    const orphan = await store.quarantineTail(fence);
    assert.equal(orphan.bytes, Buffer.byteLength('{"partial"'));
    assert.equal(orphan.sha256, hash('{"partial"'));
    const names = await readdir(join(root, "store", "orphans"));
    assert.equal(names.length, 1);
    assert.equal(await readFile(join(root, "store", "orphans", names[0]), "utf8"), '{"partial"');
    assert.equal(store.status().state, "ready");
    assert.equal((await store.appendEvent(event("two"), fence)).sequence, 2);
    await appendFile(join(root, "store", "events.log"), "late-tail");
    assert.equal((await store.quarantineTail(fence)).sha256, hash("late-tail"));
    assert.equal((await readdir(join(root, "store", "orphans"))).length, 2);
    await store.releaseWriter(fence);
  }));

test("flushed frame without head stays unacknowledged and cannot be retried in the same writer", async () =>
  fixture(async (root) => {
    const store = make(root);
    const fence = await store.acquireWriter();
    await store.appendEvent(event("one"), fence);
    const head = await readFile(join(root, "store", "head.json"));
    const original = store.journal.publishHead;
    store.journal.publishHead = async () => {
      throw new Error("injected head failure");
    };
    await assert.rejects(() => store.appendEvent(event("two"), fence), /injected head failure/);
    store.journal.publishHead = original;
    assert.deepEqual(await readFile(join(root, "store", "head.json")), head);
    const partial = await store.recover();
    assert.deepEqual(
      partial.entries.map(({ event }) => event.id),
      ["event:one"],
    );
    assert.ok(partial.trailingBytes > 0);
    await assert.rejects(() => store.appendEvent(event("two"), fence), expectCode("append_uncertain"));
    await store.abandonWriter();
  }));

test("a head published before an error leaves an uncertain return, not an automatic replay", async () =>
  fixture(async (root) => {
    const store = make(root);
    const fence = await store.acquireWriter();
    await store.appendEvent(event("one"), fence);
    const publish = store.journal.publishHead.bind(store.journal);
    store.journal.publishHead = async (head) => {
      await publish(head);
      throw new Error("injected post-head failure");
    };
    await assert.rejects(() => store.appendEvent(event("two"), fence), /injected post-head failure/);
    assert.deepEqual(
      (await store.recover()).entries.map(({ event }) => event.id),
      ["event:one", "event:two"],
    );
    await assert.rejects(() => store.appendEvent(event("two"), fence), expectCode("append_uncertain"));
    await store.abandonWriter();
  }));

test("missing/corrupt committed data, missing head, and symlink namespace fail closed", async () =>
  fixture(async (root) => {
    const store = make(root);
    const fence = await store.acquireWriter();
    await store.appendEvent(event("one"), fence);
    const logPath = join(root, "store", "events.log");
    const headPath = join(root, "store", "head.json");
    const log = await readFile(logPath);
    const head = await readFile(headPath);
    await truncate(logPath, log.length - 1);
    await assert.rejects(() => store.recover(), expectCode("committed_prefix_missing"));
    assert.equal(store.status().state, "corrupt");
    await writeFile(logPath, log);
    const damaged = Buffer.from(log);
    damaged[10] ^= 1;
    await writeFile(logPath, damaged);
    await assert.rejects(() => store.recover(), expectCode("committed_prefix_corrupt"));
    await writeFile(logPath, log);
    await writeFile(
      headPath,
      JSON.stringify({ version: 1, sequence: 2, endOffset: log.length, lastFrameSha256: hash("wrong") }),
    );
    await assert.rejects(() => store.recover(), expectCode("head_mismatch"));
    await writeFile(headPath, head);
    await rename(headPath, join(root, "store", "saved-head"));
    await assert.rejects(() => store.recover(), expectCode("head_missing"));
    assert.equal(store.status().state, "corrupt");
    await rm(logPath);
    await assert.rejects(() => store.recover(), expectCode("head_missing"));
    await assert.rejects(() => make(root).acquireWriter(), expectCode("head_missing"));

    const outside = join(root, "outside");
    await symlink(join(root, "store"), outside);
    const linked = new JournalEventStore(outside, "store:two", "session:one", "root");
    await assert.rejects(() => linked.acquireWriter(), expectCode("namespace_invalid"));
    await store.abandonWriter();
  }));

test("loss of a previously bound namespace is not treated as a fresh empty store", async () =>
  fixture(async (root) => {
    const store = make(root);
    const fence = await store.acquireWriter();
    await store.appendEvent(event("one"), fence);
    await rm(join(root, "store"), { recursive: true, force: true });
    await assert.rejects(() => store.recover(), expectCode("namespace_missing"));
    assert.equal(store.status().state, "corrupt");
    await assert.rejects(() => store.appendEvent(event("two"), fence), expectCode("writer_uncertain"));
    await store.abandonWriter();
  }));
