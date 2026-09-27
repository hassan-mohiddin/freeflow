import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { JournalError } from "../../dist/session-store/journal.js";
import { SessionStoreRuntime } from "../../dist/session-store/store.js";

const hash = (body) => createHash("sha256").update(body).digest("hex");
const manifest = (storeId = "store:one") => ({
  schemaVersion: 2,
  storeId,
  originSessionId: "session:one",
  host: { id: "pi", contract: "0.87.x" },
  createdBy: { package: "@hassangameryt/freeflow", version: "0.7.2" },
  domains: { execution: { schema: 1 }, guidance: { schema: 1 } },
});
const limits = (overrides = {}) => ({
  perArtifactBytes: 32,
  perRunBytes: 64,
  perSessionBytes: 128,
  totalBytes: 8192,
  maxReadBytes: 32,
  ...overrides,
});
const input = (content, occurrenceId = "occurrence:one", extra = {}) => ({
  content: Buffer.from(content),
  descriptor: {
    version: 1,
    occurrenceId,
    domain: "execution",
    mediaType: "text/plain",
    encoding: "utf-8",
    coverage: { capture: "complete-at-boundary", boundary: "fixture" },
    origin: { producer: "fixture", requestedByExecutionId: "run:one" },
    retention: { class: "session" },
    ...extra,
  },
});
// These physical-store fixtures stand in for already-verified native occurrence anchors.
const fixtureOwners = ["one", "two", "three", "tail", "late", "a", "b"].map((name) => ({
  occurrenceId: `occurrence:${name}`,
  entryId: "entry:fixture-anchor",
}));
const access = (ids) => ({
  ancestry: {
    sessionId: "session:one",
    branchAnchor: "entry:fixture-anchor",
    nativeEntryIds: ["entry:fixture-anchor"],
    nativeOccurrences: fixtureOwners,
  },
  grantedArtifactIds: ids,
});
const expectCode = (code) => (error) => error instanceof JournalError && error.code === code;
const pathFor = (root, id) => join(root, "store", "artifacts", `${id.slice("artifact:".length)}.bin`);

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-v2-artifacts-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function make(root, m = manifest(), quota = limits()) {
  return new SessionStoreRuntime(join(root, "store"), m, quota);
}

test("invalid manifest and injected limits reject before creating a store", async () =>
  fixture(async (root) => {
    assert.throws(
      () => make(root, { ...manifest(), host: { id: "other", contract: "0.87.x" } }),
      expectCode("manifest_invalid"),
    );
    assert.throws(() => make(root, manifest(), limits({ perArtifactBytes: 0 })), expectCode("artifact_limits"));
    assert.deepEqual(await readdir(root), []);
  }));

test("equal bytes have separate acknowledged occurrences, exact ranges, and explicit origin access", async () =>
  fixture(async (root) => {
    const store = make(root);
    const fence = await store.open();
    assert.equal(store.status().state, "ready");
    const first = await store.publishArtifact(input("alpha"), fence);
    const second = await store.publishArtifact(input("alpha", "occurrence:two"), fence);
    assert.notEqual(first.descriptor.id, second.descriptor.id);
    assert.equal(first.descriptor.sha256, second.descriptor.sha256);
    assert.notEqual(first.descriptor.occurrenceId, second.descriptor.occurrenceId);
    const descriptors = await store.replay("execution", access([]).ancestry);
    assert.deepEqual(
      descriptors.map((entry) => entry.kind),
      ["artifact-published", "artifact-published"],
    );
    const range = await store.readArtifact(
      first.descriptor.id,
      { startBytes: 1, endBytes: 4 },
      access([first.descriptor.id]),
    );
    assert.equal(Buffer.from(range.bytes).toString(), "lph");
    assert.equal(range.sha256, hash("lph"));
    assert.equal(range.descriptor.sha256, hash("alpha"));
    await assert.rejects(
      () => store.readArtifact(second.descriptor.id, { startBytes: 0, endBytes: 5 }, access([first.descriptor.id])),
      expectCode("artifact_denied"),
    );
    await assert.rejects(
      () =>
        store.readArtifact(
          first.descriptor.id,
          { startBytes: 0, endBytes: 5 },
          {
            ancestry: { sessionId: "session:fork", branchAnchor: "root", nativeEntryIds: [] },
            grantedArtifactIds: [first.descriptor.id],
          },
        ),
      expectCode("origin_unavailable"),
    );
    await assert.rejects(
      () => store.readArtifact(first.descriptor.id, { startBytes: 4, endBytes: 6 }, access([first.descriptor.id])),
      expectCode("artifact_range"),
    );
    await store.close(fence);
    const reopened = make(root);
    const next = await reopened.open();
    assert.equal(
      Buffer.from(
        (
          await reopened.readArtifact(
            second.descriptor.id,
            { startBytes: 0, endBytes: 5 },
            access([second.descriptor.id]),
          )
        ).bytes,
      ).toString(),
      "alpha",
    );
    await reopened.close(next);
    const narrower = make(root, manifest(), limits({ perArtifactBytes: 1, maxReadBytes: 3 }));
    const narrowFence = await narrower.open();
    assert.equal(
      Buffer.from(
        (
          await narrower.readArtifact(
            first.descriptor.id,
            { startBytes: 0, endBytes: 3 },
            access([first.descriptor.id]),
          )
        ).bytes,
      ).toString(),
      "alp",
    );
    await assert.rejects(
      () => narrower.publishArtifact(input("xx", "occurrence:new"), narrowFence),
      expectCode("artifact_invalid"),
    );
    await narrower.close(narrowFence);
  }));

test("read-only same-root fork uses explicit origin identity without acquiring a second writer", async () =>
  fixture(async (root) => {
    const writer = make(root);
    const fence = await writer.open();
    const published = await writer.publishArtifact(input("forked"), fence);
    const reader = make(root);
    await reader.openReadOnly();
    const inherited = {
      ancestry: {
        sessionId: "session:fork",
        branchAnchor: "entry:fork",
        nativeEntryIds: ["entry:fork"],
        nativeOccurrences: [{ occurrenceId: "occurrence:one", entryId: "entry:fork" }],
      },
      originSessionId: "session:one",
      grantedArtifactIds: [published.descriptor.id],
    };
    assert.equal(
      Buffer.from(
        (await reader.readArtifact(published.descriptor.id, { startBytes: 0, endBytes: 6 }, inherited)).bytes,
      ).toString(),
      "forked",
    );
    await assert.rejects(
      () =>
        reader.readArtifact(
          published.descriptor.id,
          { startBytes: 0, endBytes: 6 },
          {
            ...inherited,
            originSessionId: "session:other",
          },
        ),
      expectCode("origin_unavailable"),
    );
    await writer.close(fence);
  }));

test("segment source observation remains distinct from stored bytes, and invalid retention/ranges publish nothing", async () =>
  fixture(async (root) => {
    const store = make(root);
    const fence = await store.open();
    const segment = { kind: "tail", sourceRange: { startBytes: 6, endBytes: 10, totalObservedBytes: 10 } };
    const published = await store.publishArtifact(
      input("tail", "occurrence:tail", {
        segment,
        sourceObservation: { observedBytes: 10, observedSha256: hash("full-source") },
        coverage: { capture: "limited", boundary: "producer pipe" },
      }),
      fence,
    );
    assert.equal(published.descriptor.sha256, hash("tail"));
    assert.equal(published.descriptor.sourceObservation.observedSha256, hash("full-source"));
    assert.equal(
      Buffer.from(
        (
          await store.readArtifact(
            published.descriptor.id,
            { startBytes: 0, endBytes: 4 },
            access([published.descriptor.id]),
          )
        ).bytes,
      ).toString(),
      "tail",
    );
    for (const value of [
      input("", "occurrence:empty"),
      input("wrong", "occurrence:range", { segment }),
      input("alpha", "occurrence:expiry", { retention: { class: "session", expiresAt: "2027-01-01" } }),
      input("alpha", "occurrence:domain", { domain: "routing" }),
      input("alpha", "occurrence:unattributed", { origin: { producer: "fixture" } }),
      input("alpha", "occurrence:version", { version: 2 }),
    ])
      await assert.rejects(() => store.publishArtifact(value, fence), expectCode("artifact_invalid"));
    assert.deepEqual(
      (await store.replay("execution", access([]).ancestry)).map((event) => event.kind),
      ["artifact-published"],
    );
    await store.close(fence);
  }));

test("injected quotas reject new bytes without erasing an accepted artifact or disabling smaller work", async () =>
  fixture(async (root) => {
    const store = make(
      root,
      manifest(),
      limits({ perArtifactBytes: 6, perRunBytes: 8, perSessionBytes: 10, maxReadBytes: 3 }),
    );
    const fence = await store.open();
    const first = await store.publishArtifact(input("alpha"), fence);
    await assert.rejects(
      () => store.publishArtifact(input("alpha", "occurrence:two"), fence),
      expectCode("artifact_quota"),
    );
    assert.equal(store.status().state, "ready");
    assert.equal(store.status().reason, "artifact_quota");
    const second = await store.publishArtifact(
      input("beta", "occurrence:three", { origin: { producer: "fixture", requestedByExecutionId: "run:two" } }),
      fence,
    );
    assert.equal(store.status().reason, undefined);
    await assert.rejects(
      () =>
        store.publishArtifact(
          input("ab", "occurrence:four", { origin: { producer: "fixture", requestedByExecutionId: "run:three" } }),
          fence,
        ),
      expectCode("artifact_quota"),
    );
    await assert.rejects(
      () => store.readArtifact(first.descriptor.id, { startBytes: 0, endBytes: 5 }, access([first.descriptor.id])),
      expectCode("artifact_range"),
    );
    assert.equal(
      Buffer.from(
        (await store.readArtifact(first.descriptor.id, { startBytes: 0, endBytes: 3 }, access([first.descriptor.id])))
          .bytes,
      ).toString(),
      "alp",
    );
    assert.equal(
      Buffer.from(
        (await store.readArtifact(second.descriptor.id, { startBytes: 0, endBytes: 3 }, access([second.descriptor.id])))
          .bytes,
      ).toString(),
      "bet",
    );
    await store.close(fence);
  }));

test("concurrent publications cannot both pass one remaining quota reservation", async () =>
  fixture(async (root) => {
    const store = make(root, manifest(), limits({ perSessionBytes: 5 }));
    const fence = await store.open();
    const outcomes = await Promise.allSettled([
      store.publishArtifact(input("four", "occurrence:a"), fence),
      store.publishArtifact(input("four", "occurrence:b"), fence),
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
    assert.equal(outcomes.filter((outcome) => outcome.status === "rejected").length, 1);
    assert.equal(outcomes.find((outcome) => outcome.status === "rejected").reason.code, "artifact_quota");
    assert.equal((await readdir(join(root, "store", "artifacts"))).length, 1);
    await store.close(fence);
  }));

test("branch refresh waits for an in-flight artifact publication and rejects stale fences", async () =>
  fixture(async (root) => {
    const store = make(root);
    const fence = await store.open();
    const [published, next] = await Promise.all([
      store.publishArtifact(input("alpha"), fence),
      store.refreshBranch(fence, "entry:a"),
    ]);
    assert.equal(published.descriptor.id.startsWith("artifact:"), true);
    await assert.rejects(
      () => store.publishArtifact(input("late", "occurrence:late"), fence),
      expectCode("fence_changed"),
    );
    assert.equal(
      Buffer.from(
        (
          await store.readArtifact(
            published.descriptor.id,
            { startBytes: 0, endBytes: 5 },
            {
              ancestry: {
                sessionId: "session:one",
                branchAnchor: "entry:a",
                nativeEntryIds: ["entry:a"],
                nativeOccurrences: [{ occurrenceId: "occurrence:one", entryId: "entry:a" }],
              },
              grantedArtifactIds: [published.descriptor.id],
            },
          )
        ).bytes,
      ).toString(),
      "alpha",
    );
    await store.close(next);
  }));

test("total-store high-water includes journal, manifest, artifacts, and pending publication", async () =>
  fixture(async (root) => {
    const store = make(root, manifest(), limits({ totalBytes: 512 }));
    const fence = await store.open();
    await assert.rejects(() => store.publishArtifact(input("a"), fence), expectCode("store_quota"));
    const observation = {
      version: 1,
      id: "event:quota",
      domain: "execution",
      kind: "observation",
      operationId: "project.readText",
      recordedSessionId: "session:one",
      branchAnchor: "root",
      payload: {},
      artifactRefs: [],
      payloadHash: hash("{}"),
    };
    await assert.rejects(() => store.appendEvent(observation, fence), expectCode("store_quota"));
    assert.equal(store.status().reason, "store_quota");
    assert.deepEqual(await readdir(join(root, "store", "artifacts")), []);
    assert.deepEqual(await store.replay("execution", access([]).ancestry), []);
    await store.close(fence);
  }));

test("missing, changed, and symlinked artifact files are unavailable, not empty results", async () =>
  fixture(async (root) => {
    const store = make(root);
    const fence = await store.open();
    const first = await store.publishArtifact(input("alpha"), fence);
    const path = pathFor(root, first.descriptor.id);
    await writeFile(path, "bravo");
    await assert.rejects(
      () => store.readArtifact(first.descriptor.id, { startBytes: 0, endBytes: 3 }, access([first.descriptor.id])),
      expectCode("artifact_changed"),
    );
    assert.equal(store.status().state, "corrupt");
    await unlink(path);
    await assert.rejects(
      () => store.readArtifact(first.descriptor.id, { startBytes: 0, endBytes: 3 }, access([first.descriptor.id])),
      expectCode("artifact_missing"),
    );
    const outside = join(root, "outside");
    await writeFile(outside, "alpha");
    await symlink(outside, path);
    await assert.rejects(
      () => store.readArtifact(first.descriptor.id, { startBytes: 0, endBytes: 3 }, access([first.descriptor.id])),
      expectCode("artifact_invalid"),
    );
    await unlink(path);
    await store.close(fence);
    const reopened = make(root);
    const next = await reopened.open();
    assert.equal(reopened.status().state, "corrupt", "an acknowledged missing artifact remains visible after restart");
    await reopened.close(next);
  }));

test("descriptor event failure leaves an unaccepted orphan and references cannot invent recovery", async () =>
  fixture(async (root) => {
    const store = make(root, manifest(), limits({ perSessionBytes: 6 }));
    const fence = await store.open();
    const original = store.events.appendEvent.bind(store.events);
    store.events.appendEvent = async () => {
      throw new Error("injected descriptor failure");
    };
    await assert.rejects(() => store.publishArtifact(input("orphan"), fence), /injected descriptor failure/);
    store.events.appendEvent = original;
    assert.deepEqual(await store.replay("execution", access([]).ancestry), []);
    assert.equal((await readdir(join(root, "store", "artifacts"))).length, 1);
    assert.equal(store.status().state, "orphaned");
    await assert.rejects(
      () => store.publishArtifact(input("x", "occurrence:next"), fence),
      expectCode("artifact_quota"),
    );
    const missingRef = {
      version: 1,
      id: "event:missing",
      domain: "execution",
      kind: "occurrence",
      operationId: "project.readText",
      recordedSessionId: "session:one",
      branchAnchor: "root",
      payload: {},
      artifactRefs: ["artifact:00000000-0000-0000-0000-000000000000"],
      payloadHash: hash("{}"),
    };
    await assert.rejects(() => store.appendEvent(missingRef, fence), expectCode("artifact_unavailable"));
    assert.deepEqual(await store.replay("execution", access([]).ancestry), []);
    await store.close(fence);
    const reopened = make(root);
    const next = await reopened.open();
    assert.equal(reopened.status().state, "orphaned", "unacknowledged bytes remain visible after restart");
    await reopened.close(next);
  }));

test("manifest mismatch, missing committed manifest, and unsupported schema fail closed without replacing identity", async () =>
  fixture(async (root) => {
    const store = make(root);
    const fence = await store.open();
    const first = await store.publishArtifact(input("alpha"), fence);
    await store.close(fence);
    const path = join(root, "store", "manifest.json");
    const before = await readFile(path, "utf8");
    await assert.rejects(() => make(root, manifest("store:other")).open(), expectCode("manifest_identity"));
    assert.equal(await readFile(path, "utf8"), before);
    await writeFile(
      path,
      JSON.stringify({ ...manifest(), domains: { execution: { schema: 2 }, guidance: { schema: 1 } } }),
    );
    await assert.rejects(() => make(root).open(), expectCode("manifest_version"));
    await unlink(path);
    await assert.rejects(() => make(root).open(), expectCode("manifest_missing"));
    assert.equal(await readFile(pathFor(root, first.descriptor.id), "utf8"), "alpha");
  }));
