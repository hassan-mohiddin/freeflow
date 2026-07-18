import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  CURRENT_DELEGATION_IDENTITY_SCHEMA_VERSION,
  CURRENT_DELEGATION_MANIFEST_SCHEMA_VERSION,
  CURRENT_DELEGATION_PROFILE_SCHEMA_VERSION,
  CURRENT_DELEGATION_PROTOCOL_VERSION,
  compileTaskPacket,
  createDelegationStore,
  deriveRoutedAttemptId,
  resolveAssignmentAttemptIdentity,
  validateTaskPacketIdentity,
} from "../dist/index.js";

const versionedManifest = {
  schemaVersion: CURRENT_DELEGATION_MANIFEST_SCHEMA_VERSION,
  identitySchemaVersion: CURRENT_DELEGATION_IDENTITY_SCHEMA_VERSION,
  profileSchemaVersion: CURRENT_DELEGATION_PROFILE_SCHEMA_VERSION,
  protocolVersion: CURRENT_DELEGATION_PROTOCOL_VERSION,
  taskId: "TASK-IDENTITY",
  agentId: "worker-1",
  assignmentId: "worker-1",
  attemptId: "attempt-route-1",
  attemptSource: "routed",
  role: "worker",
  profile: "worker",
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z",
  modelTaskPacketPath: ".freeflow/delegation/tasks/TASK-IDENTITY/agents/worker-1/model/task-packet.txt",
  resultRawPath: ".freeflow/delegation/tasks/TASK-IDENTITY/agents/worker-1/model/result.raw.txt",
  resultJsonPath: ".freeflow/delegation/tasks/TASK-IDENTITY/agents/worker-1/result.json",
};

const runningStatus = {
  taskId: "TASK-IDENTITY",
  agentId: "worker-1",
  state: "running",
  updatedAt: "2026-07-12T00:00:01.000Z",
};

test("routed attempt identity is deterministic and safe", () => {
  assert.equal(deriveRoutedAttemptId("route-1"), "attempt-route-1");
  assert.equal(deriveRoutedAttemptId("route-1"), deriveRoutedAttemptId("route-1"));
});

test("versioned assignment identity binds manifest, status, and lifecycle environment", () => {
  const resolved = resolveAssignmentAttemptIdentity({
    manifest: versionedManifest,
    status: runningStatus,
    environmentAttemptId: "attempt-route-1",
  });

  assert.deepEqual(resolved, {
    assignmentId: "worker-1",
    attemptId: "attempt-route-1",
    kind: "versioned",
    finishOnly: false,
    schemaVersion: 1,
    protocolVersion: 1,
    profileSchemaVersion: 1,
  });

  assert.throws(
    () =>
      resolveAssignmentAttemptIdentity({
        manifest: versionedManifest,
        status: runningStatus,
        environmentAttemptId: "attempt-old",
      }),
    /environment attempt.*does not match manifest attempt/i,
  );
  assert.throws(
    () =>
      resolveAssignmentAttemptIdentity({
        manifest: { ...versionedManifest, protocolVersion: 2 },
        status: runningStatus,
      }),
    /protocol version 2 is not supported/i,
  );
  assert.throws(
    () =>
      resolveAssignmentAttemptIdentity({
        manifest: { ...versionedManifest, profileSchemaVersion: 2 },
        status: runningStatus,
      }),
    /profile schema version 2 is not supported/i,
  );
  assert.throws(
    () =>
      resolveAssignmentAttemptIdentity({
        manifest: { ...versionedManifest, attemptId: undefined },
        status: runningStatus,
      }),
    /partial assignment attempt identity/i,
  );
});

test("new manifests and task packets persist the same explicit versioned identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-delegation-identity-"));
  try {
    const store = createDelegationStore({ root, now: () => "2026-07-12T00:00:00.000Z" });
    const manifest = await store.registerAgent({
      taskId: "TASK-IDENTITY",
      agentId: "worker-1",
      role: "worker",
      attemptId: "attempt-route-1",
      attemptSource: "routed",
      cwd: "/repo",
    });
    const packet = compileTaskPacket({
      taskId: "TASK-IDENTITY",
      agentId: "worker-1",
      assignmentId: "worker-1",
      attemptId: "attempt-route-1",
      identitySchemaVersion: 1,
      profileSchemaVersion: 1,
      protocolVersion: 1,
      role: "worker",
      cwd: "/repo",
      objective: "Implement one bounded slice.",
      writeScope: "/repo/src",
      tracePath: ".freeflow/delegation/tasks/TASK-IDENTITY/agents/worker-1/transcript.log",
      resultPath: ".freeflow/delegation/tasks/TASK-IDENTITY/agents/worker-1/result.json",
    });

    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.identitySchemaVersion, 1);
    assert.equal(manifest.profileSchemaVersion, 1);
    assert.equal(manifest.protocolVersion, 1);
    assert.equal(manifest.assignmentId, packet.assignmentId);
    assert.equal(manifest.attemptId, packet.attemptId);
    assert.equal(manifest.attemptSource, "routed");
    const unchangedIdentity = await store.updateAgentManifest("TASK-IDENTITY", "worker-1", {
      attemptId: "attempt-tampered",
      modelTaskPacketPath: "/tmp/forged-packet.txt",
      resultJsonPath: "/tmp/forged-result.json",
    });
    assert.equal(unchangedIdentity.attemptId, "attempt-route-1");
    assert.equal(unchangedIdentity.modelTaskPacketPath, manifest.modelTaskPacketPath);
    assert.equal(unchangedIdentity.resultJsonPath, manifest.resultJsonPath);
    assert.match(packet.text, /- attempt: attempt-route-1/);
    assert.deepEqual(
      validateTaskPacketIdentity(packet.text, {
        taskId: manifest.taskId,
        agentId: manifest.agentId,
        assignmentId: manifest.assignmentId,
        attemptId: manifest.attemptId,
        role: manifest.role,
        profile: manifest.profile,
        identitySchemaVersion: manifest.identitySchemaVersion,
        profileSchemaVersion: manifest.profileSchemaVersion,
        protocolVersion: manifest.protocolVersion,
      }),
      {
        taskId: "TASK-IDENTITY",
        agentId: "worker-1",
        assignmentId: "worker-1",
        attemptId: "attempt-route-1",
        role: "worker",
        profile: "worker",
        identitySchemaVersion: 1,
        profileSchemaVersion: 1,
        protocolVersion: 1,
      },
    );
    assert.throws(
      () => validateTaskPacketIdentity(packet.text.replace("attempt-route-1", "attempt-old"), manifest),
      /packet attemptId.*does not match/i,
    );
    assert.throws(
      () => validateTaskPacketIdentity(packet.text.replace(/- attempt:.*\n/, ""), manifest),
      /packet identity is incomplete/i,
    );
    assert.throws(
      () =>
        compileTaskPacket({
          taskId: "TASK-IDENTITY",
          agentId: "worker-1",
          role: "worker",
          cwd: "/repo",
          objective: "Do not fabricate packet identity.",
          writeScope: "/repo/src",
          tracePath: "trace.log",
          resultPath: "result.json",
        }),
      /assignmentId.*attemptId.*identitySchemaVersion.*profileSchemaVersion.*protocolVersion/i,
    );
    assert.throws(
      () =>
        compileTaskPacket({
          taskId: "TASK-IDENTITY",
          agentId: "worker-1",
          assignmentId: "worker-1",
          attemptId: "attempt-route-1",
          identitySchemaVersion: 1,
          profileSchemaVersion: 1,
          protocolVersion: 2,
          role: "worker",
          cwd: "/repo",
          objective: "Reject a future protocol.",
          writeScope: "/repo/src",
          tracePath: "trace.log",
          resultPath: "result.json",
        }),
      /protocol version 2 is not supported/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("known unversioned visibly running assignment resolves to stable finish-only synthetic identity", () => {
  const legacyManifest = {
    taskId: "TASK-IDENTITY",
    agentId: "worker-1",
    role: "worker",
    profile: "worker",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:01.000Z",
    modelTaskPacketPath: ".freeflow/delegation/tasks/TASK-IDENTITY/agents/worker-1/model/task-packet.txt",
    resultRawPath: ".freeflow/delegation/tasks/TASK-IDENTITY/agents/worker-1/model/result.raw.txt",
    resultJsonPath: ".freeflow/delegation/tasks/TASK-IDENTITY/agents/worker-1/result.json",
    surfaceRef: "surface:legacy",
    launchCommand: "env FREEFLOW_DELEGATION_TASK_ID=TASK-IDENTITY pi legacy",
  };

  const first = resolveAssignmentAttemptIdentity({ manifest: legacyManifest, status: runningStatus });
  const second = resolveAssignmentAttemptIdentity({
    manifest: { ...legacyManifest, updatedAt: "2026-07-12T00:00:00.000Z" },
    status: runningStatus,
  });
  const afterMutableCorrections = [
    { ...legacyManifest, profile: "write-scoped" },
    { ...legacyManifest, surfaceRef: "surface:replacement" },
    { ...legacyManifest, launchCommand: "pi worker-1 --recovered" },
  ].map((manifest) => resolveAssignmentAttemptIdentity({ manifest, status: runningStatus }).attemptId);
  const differentImmutableCreation = resolveAssignmentAttemptIdentity({
    manifest: { ...legacyManifest, createdAt: "2026-07-02T00:00:00.000Z" },
    status: runningStatus,
  });

  assert.equal(first.kind, "legacy_synthetic");
  assert.equal(first.finishOnly, true);
  assert.equal(first.assignmentId, "worker-1");
  assert.match(first.attemptId, /^legacy-attempt-[a-f0-9]{20}$/);
  assert.equal(second.attemptId, first.attemptId);
  assert.deepEqual(afterMutableCorrections, [first.attemptId, first.attemptId, first.attemptId]);
  assert.notEqual(differentImmutableCreation.attemptId, first.attemptId);

  assert.throws(
    () =>
      resolveAssignmentAttemptIdentity({
        manifest: { ...legacyManifest, launchCommand: undefined },
        status: runningStatus,
      }),
    /visible running evidence/i,
  );
  assert.throws(
    () =>
      resolveAssignmentAttemptIdentity({ manifest: legacyManifest, status: { ...runningStatus, state: "completed" } }),
    /active legacy assignment/i,
  );
});
