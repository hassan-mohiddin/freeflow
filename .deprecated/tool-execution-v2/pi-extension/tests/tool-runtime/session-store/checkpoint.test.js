import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFile, mkdtemp, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { JournalError } from "../../../dist/tool-runtime/session-store/journal.js";
import { JournalEventStore } from "../../../dist/tool-runtime/session-store/store.js";

const hash = (body) => createHash("sha256").update(body).digest("hex");
const make = (root) => new JournalEventStore(join(root, "store"), "store:one", "session:one", "root");
const event = (number) => {
  const payload = { number };
  return {
    version: 1,
    id: `event:${number}`,
    domain: "execution",
    kind: "observation",
    operationId: `operation:${number}`,
    recordedSessionId: "session:one",
    branchAnchor: "root",
    payload,
    artifactRefs: [],
    payloadHash: hash(JSON.stringify(payload)),
  };
};
const code = (expected) => (error) => error instanceof JournalError && error.code === expected;

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-v2-checkpoint-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function acceptedCheckpoint(root) {
  const store = make(root);
  const fence = await store.acquireWriter();
  for (let number = 1; number <= 128; number++)
    assert.equal((await store.appendEvent(event(number), fence)).sequence, number);
  const head = JSON.parse(await readFile(join(root, "store", "head.json"), "utf8"));
  assert.equal(head.version, 2, "the first checkpoint is referenced only after durable publication");
  assert.equal(head.checkpoint.sequence, 128);
  assert.equal(store.status().state, "ready");
  return { store, fence, head };
}

test("checkpoint is authoritative for current recovery; old log bytes remain but active tail damage fails closed", async () =>
  fixture(async (root) => {
    const { store, fence, head } = await acceptedCheckpoint(root);
    const logPath = join(root, "store", "events.log");
    const original = await readFile(logPath);
    const archivedDamage = Buffer.from(original);
    archivedDamage[10] ^= 1;
    await writeFile(logPath, archivedDamage);
    assert.equal(
      (await store.recover()).entries.length,
      128,
      "old frames are retained but no longer active recovery input",
    );
    assert.equal((await store.appendEvent(event(129), fence)).sequence, 129);
    assert.equal((await store.recover()).entries.length, 129);
    const tailDamage = await readFile(logPath);
    tailDamage[head.checkpoint.endOffset + 10] ^= 1;
    await writeFile(logPath, tailDamage);
    await assert.rejects(() => store.recover(), code("committed_prefix_corrupt"));
    assert.equal(store.status().state, "corrupt");
    await store.abandonWriter();
  }));

test("checkpoint rotation references only the new verified slot and retains all journal bytes", async () =>
  fixture(async (root) => {
    const { store, fence, head: first } = await acceptedCheckpoint(root);
    const logPath = join(root, "store", "events.log");
    for (let number = 129; number <= 256; number++)
      assert.equal((await store.appendEvent(event(number), fence)).sequence, number);
    const latest = JSON.parse(await readFile(join(root, "store", "head.json"), "utf8"));
    assert.equal(latest.checkpoint.sequence, 256);
    assert.notEqual(latest.checkpoint.slot, first.checkpoint.slot);
    assert.ok((await readFile(logPath)).length > first.checkpoint.endOffset);
    const inactivePath = join(root, "store", `.checkpoint-${first.checkpoint.slot}.json`);
    const inactive = await readFile(inactivePath);
    inactive[15] ^= 1;
    await writeFile(inactivePath, inactive);
    assert.equal((await store.recover()).entries.length, 256, "superseded cache cannot poison the active checkpoint");
    assert.equal((await store.appendEvent(event(257), fence)).sequence, 257);
    await store.releaseWriter(fence);
  }));

test("explicit tail quarantine reads only the tail of a checkpointed log past the old replay limit", async () =>
  fixture(async (root) => {
    const { store, fence, head } = await acceptedCheckpoint(root);
    const logPath = join(root, "store", "events.log");
    const log = await readFile(logPath);
    const checkpoint = await readFile(join(root, "store", `.checkpoint-${head.checkpoint.slot}.json`));
    assert.ok(log.length > checkpoint.length + 1, "fixture must distinguish full log from checkpoint size");
    store.journal.maxReplayBytes = log.length - 1;
    await appendFile(logPath, "unacknowledged-tail");
    assert.ok((await store.recover()).trailingBytes > 0);
    const quarantined = await store.quarantineTail(fence);
    assert.equal(quarantined.bytes, Buffer.byteLength("unacknowledged-tail"));
    assert.equal((await readdir(join(root, "store", "orphans"))).length, 1);
    assert.equal((await store.recover()).trailingBytes, 0);
    await store.releaseWriter(fence);
  }));

test("damaged selected checkpoint fails closed rather than replaying the entire old journal", async () =>
  fixture(async (root) => {
    const { store, head } = await acceptedCheckpoint(root);
    const path = join(root, "store", `.checkpoint-${head.checkpoint.slot}.json`);
    const bytes = await readFile(path);
    bytes[20] ^= 1;
    await writeFile(path, bytes);
    await assert.rejects(() => store.recover(), code("checkpoint_corrupt"));
    assert.equal(store.status().state, "corrupt");
    await store.abandonWriter();
  }));

test("checkpoint publication failure preserves the acknowledged event but fences later appends", async () =>
  fixture(async (root) => {
    const store = make(root);
    const fence = await store.acquireWriter();
    for (let number = 1; number < 128; number++) await store.appendEvent(event(number), fence);
    const publishHead = store.journal.publishHead.bind(store.journal);
    store.journal.publishHead = async (head) => {
      if (head.version === 2) throw new Error("injected checkpoint-head failure");
      return publishHead(head);
    };
    assert.equal((await store.appendEvent(event(128), fence)).sequence, 128);
    assert.deepEqual(store.status(), { state: "unavailable", reason: "checkpoint_uncertain" });
    assert.equal(JSON.parse(await readFile(join(root, "store", "head.json"), "utf8")).version, 1);
    assert.ok((await readdir(join(root, "store"))).includes(".checkpoint-0.json"));
    await assert.rejects(() => store.appendEvent(event(129), fence), code("checkpoint_uncertain"));
    await store.abandonWriter();
    // Explicit fixture operator action only: an ambiguous lease is never reclaimed by normal startup.
    await unlink(join(root, "store", ".writer-lease"));
    const successor = make(root);
    const next = await successor.acquireWriter();
    const recovered = await successor.recover();
    assert.equal(recovered.entries.length, 128);
    assert.equal(recovered.head.version, 1, "the unreferenced checkpoint cannot replace the old head");
    await successor.releaseWriter(next);
  }));
