import assert from "node:assert/strict";
import test from "node:test";

import { isArtifactDescriptor, isSourceIdentity, isStoreEvent } from "../../dist/session-store/contracts.js";
import { OperationRegistry } from "../../dist/tool-runtime/registry.js";

const hash = (character) => character.repeat(64);
const objectSchema = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

function operation(overrides = {}) {
  return {
    key: { id: "fixture.read", revision: "1" },
    description: "Read a fixture.",
    keywords: ["fixture", "read"],
    owner: { adapterId: "fixture", adapterRevision: "1", executionWorld: "test" },
    inputSchema: objectSchema({ id: { type: "string" } }),
    outputSchema: objectSchema({ ok: { type: "boolean" } }),
    effects: ["live-read"],
    effect: () => "live-read",
    concurrency: () => "read-parallel",
    exposure: { discoverable: true, direct: true, programmatic: true },
    authorize: async () => ({ kind: "allowed" }),
    execute: async () => ({ value: { ok: true }, coverage: { kind: "complete-at-boundary", boundary: "fixture" } }),
    ...overrides,
  };
}

const source = () => ({
  occurrenceId: "occurrence:one",
  domain: "execution",
  sessionId: "session-1",
  branchAnchor: "root",
  contentHash: hash("a"),
});
const artifact = () => ({
  version: 1,
  id: "artifact:one",
  occurrenceId: "occurrence:one",
  domain: "execution",
  mediaType: "text/plain",
  encoding: "utf-8",
  bytes: 4,
  sha256: hash("b"),
  segment: { kind: "tail", sourceRange: { startBytes: 6, endBytes: 10, totalObservedBytes: 10 } },
  sourceObservation: { observedBytes: 10, observedSha256: hash("c") },
  coverage: { capture: "limited", boundary: "producer pipe" },
  origin: { producer: "fixture", source: source(), operation: { id: "project.readRanges", revision: "1" } },
  retention: { class: "session" },
});
const event = () => ({
  version: 1,
  id: "event:one",
  domain: "execution",
  kind: "artifact-published",
  operationId: "project.readRanges",
  recordedSessionId: "session-1",
  branchAnchor: "root",
  payload: { occurrenceId: "occurrence:one" },
  artifactRefs: ["artifact:one"],
  payloadHash: hash("d"),
});

test("v2 source, artifact, and event validators reject malformed identity, version, category, hash, and ranges", () => {
  assert.equal(isSourceIdentity(source()), true);
  assert.equal(isSourceIdentity({ ...source(), occurrenceId: "../escape" }), false);
  assert.equal(isSourceIdentity({ ...source(), domain: "tools" }), false);
  const cyclic = source();
  cyclic.origin = cyclic;
  assert.equal(isSourceIdentity(cyclic), false);

  assert.equal(isArtifactDescriptor(artifact()), true);
  assert.equal(isArtifactDescriptor({ ...artifact(), version: 2 }), false);
  assert.equal(isArtifactDescriptor({ ...artifact(), domain: "tools" }), false);
  assert.equal(isArtifactDescriptor({ ...artifact(), sha256: "not-a-hash" }), false);
  assert.equal(isArtifactDescriptor({ ...artifact(), encoding: undefined }), false);
  assert.equal(isArtifactDescriptor({ ...artifact(), occurrenceId: "../escape" }), false);
  assert.equal(isArtifactDescriptor({ ...artifact(), bytes: 5 }), false);
  assert.equal(
    isArtifactDescriptor({
      ...artifact(),
      segment: {
        kind: { toString: () => "tail" },
        sourceRange: { startBytes: 6, endBytes: 10, totalObservedBytes: 10 },
      },
    }),
    false,
  );
  assert.equal(
    isArtifactDescriptor({
      ...artifact(),
      segment: {
        kind: "tail",
        sourceRange: { startBytes: 8, endBytes: 6, totalObservedBytes: 10 },
      },
    }),
    false,
  );
  assert.equal(
    isArtifactDescriptor({
      ...artifact(),
      segment: {
        kind: "complete",
        sourceRange: { startBytes: 6, endBytes: 10, totalObservedBytes: 10 },
      },
    }),
    false,
  );
  assert.equal(
    isArtifactDescriptor({
      ...artifact(),
      sourceObservation: {
        observedBytes: 12,
        observedSha256: hash("c"),
      },
    }),
    false,
  );

  assert.equal(isStoreEvent(event()), true);
  assert.equal(isStoreEvent({ ...event(), version: 2 }), false);
  assert.equal(isStoreEvent({ ...event(), domain: "tools" }), false);
  assert.equal(isStoreEvent({ ...event(), payloadHash: hash("X") }), false);
  assert.equal(isStoreEvent({ ...event(), artifactRefs: ["artifact:one", "artifact:one"] }), false);
  assert.equal(isStoreEvent({ ...event(), nativeEntryId: "../escape" }), false);
  assert.equal(isStoreEvent({ ...event(), nativeEntryId: undefined }), false);
  assert.equal(isStoreEvent({ ...event(), artifactRefs: Array(1) }), false);
  const sparsePayload = Array(2);
  sparsePayload[1] = "valid";
  sparsePayload.extra = "invalid";
  assert.equal(isStoreEvent({ ...event(), payload: sparsePayload }), false);
  const badPayload = {};
  badPayload.self = badPayload;
  assert.equal(isStoreEvent({ ...event(), payload: badPayload }), false);
});

test("existing v1 descriptor serialization, fingerprint, and catalog generation stay byte-identical", () => {
  const registry = new OperationRegistry();
  registry.register(operation());
  const snapshot = registry.snapshot();
  assert.equal(snapshot.generation, "4196993af812fbc81a9133b047d7191434d0d8b1a9c08a824817474933927cd0");
  assert.equal(snapshot.descriptors[0].fingerprint, "4c6eac52897fcb1a4b1b27dea728229d4c365e7f93c650847f7f8fec010a2df5");
  assert.equal(
    JSON.stringify(snapshot.descriptors[0]),
    JSON.stringify({
      key: { id: "fixture.read", revision: "1" },
      description: "Read a fixture.",
      keywords: ["fixture", "read"],
      owner: { adapterId: "fixture", adapterRevision: "1", executionWorld: "test" },
      inputSchema: objectSchema({ id: { type: "string" } }),
      outputSchema: objectSchema({ ok: { type: "boolean" } }),
      effects: ["live-read"],
      exposure: { discoverable: true, direct: true, programmatic: true },
      fingerprint: "4c6eac52897fcb1a4b1b27dea728229d4c365e7f93c650847f7f8fec010a2df5",
    }),
  );
});

test("explicit v2 metadata is validated, frozen, and part of its own descriptor meaning", () => {
  const presenter = {
    model: async () => ({
      text: "ok",
      coverage: { kind: "complete-at-boundary", boundary: "fixture" },
      artifactRefs: [],
    }),
  };
  const guidance = { useWhen: "Read a fixture", example: { id: "one" } };
  const v2 = operation({ contractVersion: 2, category: "project", guidance, cancellation: "settles", presenter });
  for (const overrides of [
    { contractVersion: 3 },
    { category: "invalid" },
    { guidance: { useWhen: "" } },
    { guidance: { useWhen: "Read a fixture", unexpected: true } },
    { cancellation: "retry" },
    { presenter: {} },
  ]) {
    const registry = new OperationRegistry();
    assert.throws(
      () => registry.register({ ...v2, ...overrides }),
      (error) => error.code === "operation_descriptor",
    );
  }
  const registry = new OperationRegistry();
  const registration = registry.register(v2);
  guidance.example.id = "changed";
  const descriptor = registry.resolve(v2.key).descriptor;
  assert.equal(descriptor.contractVersion, 2);
  assert.equal(descriptor.category, "project");
  assert.deepEqual(descriptor.guidance.example, { id: "one" });
  assert.equal(Object.isFrozen(descriptor.guidance.example), true);
  assert.notEqual(descriptor.fingerprint, "4c6eac52897fcb1a4b1b27dea728229d4c365e7f93c650847f7f8fec010a2df5");
  registration.dispose();
  assert.throws(
    () => registry.register(operation()),
    (error) => error.code === "operation_conflict",
  );
  assert.throws(
    () => registry.register({ ...v2, presenter: { ...presenter } }),
    (error) => error.code === "operation_conflict",
  );
});
