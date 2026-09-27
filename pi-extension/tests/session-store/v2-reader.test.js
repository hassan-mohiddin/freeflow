import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import { resolveToolExecutionConfig } from "../../dist/tool-runtime/config.js";
import { ResultRuntime } from "../../dist/tool-runtime/results/runtime.js";
import {
  V2ArtifactReader,
  V2_ARTIFACT_ENTRY,
  anchorFor,
  isV2ArtifactAnchor,
  openLocalOrigin,
} from "../../dist/tool-runtime/results/v2.js";
import { createArtifactReadOperation } from "../../dist/tool-runtime/adapters/artifact.js";
import { OperationRegistry } from "../../dist/tool-runtime/registry.js";
import { OperationKernel } from "../../dist/tool-runtime/kernel.js";
import { AdmissionController } from "../../dist/tool-runtime/admission.js";
import { SessionStoreRuntime } from "../../dist/session-store/store.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const capability = resolveToolExecutionConfig({ toolExecution: { enabled: true } }, {}, true);
const limits = {
  perArtifactBytes: 5 * 1024 * 1024,
  perRunBytes: 8 * 1024 * 1024,
  perSessionBytes: 16 * 1024 * 1024,
  totalBytes: 32 * 1024 * 1024,
  maxReadBytes: 32_768,
};
const manifest = (id) => ({
  schemaVersion: 2,
  storeId: `store:${id}`,
  originSessionId: id,
  host: { id: "pi", contract: "0.87.x" },
  createdBy: { package: "@hassangameryt/freeflow", version: "0.7.2" },
  domains: { execution: { schema: 1 }, guidance: { schema: 1 } },
});
const descriptor = (content, encoding) => ({
  content: Buffer.from(content),
  descriptor: {
    version: 1,
    occurrenceId: `occurrence:${hash(content).slice(0, 16)}`,
    domain: "execution",
    mediaType: encoding ? "text/plain" : "application/octet-stream",
    ...(encoding ? { encoding } : {}),
    coverage: { capture: "complete-at-boundary", boundary: "fixture-store" },
    origin: { producer: "fixture", requestedByExecutionId: "run:fixture" },
    retention: { class: "session" },
  },
});
const assistantMessage = () => ({
  role: "assistant",
  content: [{ type: "text", text: "fixture" }],
  provider: "fixture",
  model: "fixture",
  api: "fixture",
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: {} },
  stopReason: "stop",
  timestamp: 1,
});

async function setup(root, content, encoding = "utf-8") {
  const manager = SessionManager.create(root, join(root, "sessions"));
  const userId = manager.appendMessage({ role: "user", content: "fixture", timestamp: 0 });
  const assistantId = manager.appendMessage(assistantMessage());
  const sessionId = manager.getSessionId();
  const file = manager.getSessionFile();
  const base = join(dirname(file), "freeflow-session-store", "v2");
  await mkdir(base, { recursive: true });
  const origin = join(base, hash(sessionId));
  const sourceManifest = manifest(sessionId);
  const store = new SessionStoreRuntime(origin, sourceManifest, limits);
  let fence = await store.open();
  fence = await store.refreshBranch(fence, assistantId);
  const published = await store.publishArtifact(descriptor(content, encoding), fence);
  const anchor = anchorFor(published.descriptor, sourceManifest);
  const nativeEntryId = manager.appendCustomEntry(V2_ARTIFACT_ENTRY, anchor);
  return { manager, store, fence, published, anchor, userId, nativeEntryId, file };
}

const reader = () => new V2ArtifactReader((anchor, ctx) => openLocalOrigin(anchor, ctx, limits));
const runtime = (access = () => ({ recovery: false })) =>
  new ResultRuntime(
    {},
    () => capability,
    () => ({ profile: "solo", control: "inactive" }),
    access,
    reader(),
  );
const ctx = (manager) => ({ sessionManager: manager });

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-v2-reader-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("v2 range read resolves a persisted native anchor and a same-root fork without re-execution", async () =>
  fixture(async (root) => {
    const body = Buffer.from("exact v2 αβ body");
    const f = await setup(root, body);
    const id = f.published.descriptor.id;
    assert.equal(isV2ArtifactAnchor({ ...f.anchor, id: `artifact:${"-".repeat(36)}` }), false);
    const direct = await runtime().read({ id, offsetBytes: 0, maxBytes: 1024 }, undefined, ctx(f.manager));
    assert.match(direct.content[0].text, /Artifact: artifact:/);
    assert.match(direct.content[0].text, /exact v2 αβ body/);
    assert.equal(direct.details.capturedArtifact.encoding, "utf-8");
    const value = await runtime().readV2Value({ id, offsetBytes: 0, maxBytes: 32 }, undefined, ctx(f.manager));
    assert.equal(value.data, body.toString());
    assert.equal(value.totalBytes, body.length);
    assert.equal(value.sha256, hash(body));
    assert.deepEqual(await runtime().resolveGrant(id, ctx(f.manager)), { id, sha256: hash(body) });
    f.manager.appendCompaction(
      "Older output compacted; exact artifact remains recoverable.",
      f.manager.getLeafId(),
      100,
    );
    assert.equal((await runtime().readV2Value({ id, maxBytes: 32 }, undefined, ctx(f.manager))).data, body.toString());
    const forkFile = f.manager.createBranchedSession(f.manager.getLeafId());
    const fork = SessionManager.open(forkFile);
    assert.equal(
      (await runtime().readV2Value({ id, offsetBytes: 0, maxBytes: 32 }, undefined, ctx(fork))).data,
      body.toString(),
    );
    await f.store.close(f.fence);
  }));

test("binary and split UTF-8 ranges use exact base64 without changing legacy text representation", async () =>
  fixture(async (root) => {
    const f = await setup(root, Buffer.from([0, 255, 65, 66]), null);
    const id = f.published.descriptor.id;
    const bytes = await runtime().readV2Value({ id, offsetBytes: 1, maxBytes: 2 }, undefined, ctx(f.manager));
    assert.equal(bytes.encoding, "base64");
    assert.deepEqual(Buffer.from(bytes.data, "base64"), Buffer.from([255, 65]));
    const shown = await runtime().read({ id, offsetBytes: 0, maxBytes: 1024 }, undefined, ctx(f.manager));
    assert.match(shown.content[0].text, /encoding: base64/);
    await f.store.close(f.fence);
    const textFixture = await setup(root, "αβ");
    const split = await runtime().readV2Value(
      { id: textFixture.published.descriptor.id, offsetBytes: 1, maxBytes: 1 },
      undefined,
      ctx(textFixture.manager),
    );
    assert.equal(split.encoding, "base64");
    assert.deepEqual(Buffer.from(split.data, "base64"), Buffer.from("αβ").subarray(1, 2));
    await textFixture.store.close(textFixture.fence);
  }));

test("recovery grants, navigation and missing-origin export fail closed", async () =>
  fixture(async (root) => {
    const f = await setup(root, "recoverable");
    const id = f.published.descriptor.id;
    const denied = runtime(() => ({ recovery: true, sha256: hash("wrong") }));
    await assert.rejects(
      () => denied.readV2Value({ id, maxBytes: 16 }, undefined, ctx(f.manager)),
      /result_not_admitted/,
    );
    const admitted = runtime(() => ({ recovery: true, sha256: f.anchor.artifactSha256 }));
    assert.equal((await admitted.readV2Value({ id, maxBytes: 16 }, undefined, ctx(f.manager))).data, "recoverable");
    const exportRoot = join(root, "export");
    await mkdir(exportRoot);
    const exportedFile = join(exportRoot, "copied-session.jsonl");
    await cp(f.file, exportedFile);
    const exported = SessionManager.open(exportedFile);
    await assert.rejects(
      () => runtime().readV2Value({ id, maxBytes: 16 }, undefined, ctx(exported)),
      /origin_unavailable/,
    );
    const drifting = new V2ArtifactReader(async (anchor, host) => {
      f.manager.branch(f.userId);
      return openLocalOrigin(anchor, host, limits);
    });
    await assert.rejects(
      () => drifting.readValue({ id, maxBytes: 16 }, undefined, ctx(f.manager), { recovery: false }),
      /result_unavailable/,
    );
    await assert.rejects(
      () => runtime().readV2Value({ id, maxBytes: 16 }, undefined, ctx(f.manager)),
      /result_unavailable/,
    );
    await f.store.close(f.fence);
  }));

test("result.read@2 is a separate descriptor/kernel path; the normal registry retains v1 alone", async () =>
  fixture(async (root) => {
    const f = await setup(root, "operation");
    const id = f.published.descriptor.id;
    const registry = new OperationRegistry();
    const legacy = await import("../../dist/tool-runtime/adapters/captured.js");
    registry.register(
      legacy.createCapturedReadOperation({
        read: async () => ({
          id: "result:legacy",
          text: "old",
          range: { startBytes: 0, endBytes: 3 },
          totalBytes: 3,
          coverage: "unspecified",
          scope: "tool-result-hook",
        }),
      }),
    );
    const baseline = registry.snapshot().descriptors[0];
    assert.equal(baseline.key.revision, "1");
    assert.equal(baseline.contractVersion, undefined);
    const v2 = createArtifactReadOperation({
      readV2Value: (input, signal, host) => runtime().readV2Value(input, signal, host),
    });
    assert.throws(
      () => registry.register(v2),
      (error) => error.code === "operation_revision_active",
    );
    registry.registerCompatibleRevision(v2);
    assert.throws(
      () => registry.registerCompatibleRevision(v2),
      (error) => error.code === "operation_duplicate",
    );
    assert.equal(registry.describe({ id: "result.read", revision: "2" }).contractVersion, 2);
    const v2Output = registry.resolve({ id: "result.read", revision: "2" }).output;
    assert.equal(
      v2Output.validate({
        id,
        data: "eA==",
        encoding: "base64",
        mediaType: "application/octet-stream",
        range: { startBytes: 0, endBytes: 1 },
        totalBytes: 5 * 1024 * 1024,
        sha256: hash("x"),
        artifactSha256: hash("large-artifact"),
        coverage: { capture: "limited", boundary: "fixture" },
      }).ok,
      true,
    );
    assert.equal(
      registry.resolve({ id: "result.read", revision: "1" }).output.validate({
        id,
        data: "eA==",
        encoding: "base64",
        mediaType: "application/octet-stream",
        range: { startBytes: 0, endBytes: 1 },
        totalBytes: 5 * 1024 * 1024,
        sha256: hash("x"),
        artifactSha256: hash("large-artifact"),
        coverage: { capture: "limited", boundary: "fixture" },
      }).ok,
      false,
    );
    assert.deepEqual(registry.describe({ id: "result.read", revision: "1" }).key, baseline.key);
    const kernel = new OperationKernel(
      registry,
      new AdmissionController(() => capability, { admit: () => ({ kind: "allowed" }) }),
    );
    const scope = {
      sessionId: f.manager.getSessionId(),
      cwd: root,
      parentCallId: "fixture",
      catalogGeneration: registry.snapshot().generation,
      responsibility: { profile: "solo", control: "inactive" },
      routing: {},
    };
    const outcome = await kernel.execute(
      { id: "result.read", revision: "2" },
      { id, offsetBytes: 0, maxBytes: 16 },
      scope,
      "direct",
      undefined,
      ctx(f.manager),
    );
    assert.equal(outcome.status, "succeeded");
    assert.equal(outcome.value.data, "operation");
    assert.equal(outcome.value.coverage.capture, "complete-at-boundary");
    await f.store.close(f.fence);
  }));
