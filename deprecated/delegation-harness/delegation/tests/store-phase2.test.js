import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import test from "node:test";

import {
  createDelegationStore,
  parseProtocolText,
  priorityForParentAlert,
  resolveAssignmentAttemptIdentity,
} from "../dist/index.js";

async function withTempStore(fn) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-delegation-store-phase2-"));
  try {
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const fixedNow = () => "2026-07-09T00:00:00.000Z";

function planningReportRaw({ status = "ready", identityRows = ["PLAN_ARTIFACT_PATH|docs/plans/canonical.md", "ARTIFACT_PATHS|docs/plans/canonical.md"] } = {}) {
  return [
    "PLANNING_REPORT",
    `STATUS|${status}`,
    "GOAL|Publish one canonical planning report.",
    ...identityRows,
    "REVIEW_STATUS|passed",
    "SETTLED_DECISIONS|use semantic publication",
    "OPEN_QUESTIONS|none",
    "EXECUTION_AUTONOMY|bounded",
    "USER_CHECKPOINTS|authorization",
    "EXECUTION_GUIDANCE|follow the accepted plan",
    "RISKS|none",
    "EVIDENCE|tests",
    "END_PLANNING_REPORT",
  ].join("\n");
}

async function publishReadyEvent(store, taskId, planArtifactPath) {
  const publication = await store.publishPlanningReport(taskId, {
    rawText: planningReportRaw({
      identityRows: [`PLAN_ARTIFACT_PATH|${planArtifactPath}`, `ARTIFACT_PATHS|${planArtifactPath}`],
    }),
    source: { transport: "delegate_record_report" },
  });
  const events = (await readFile(store.pathsForTask(taskId).eventsJsonl, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  return events.find((event) => event.eventId === publication.planningReadyEventId);
}

function activeWorkerLease(overrides = {}) {
  return {
    leaseId: "lease-worker",
    taskId: "TASK-LEASE-STORE",
    agentId: "worker-1",
    role: "worker",
    state: "active",
    actions: ["read", "edit", "run_allowlisted"],
    writeScopes: ["delegation/src/**"],
    allowedCommands: ["npm run test:delegation"],
    expires: "on_assignment_terminal",
    ...overrides,
  };
}

async function replaceFileWithDirectory(path) {
  const bytes = await readFile(path, "utf8");
  await rm(path, { force: true });
  await mkdir(path, { recursive: true });
  return async () => {
    await rm(path, { recursive: true, force: true });
    await writeFile(path, bytes, "utf8");
  };
}

function terminalOutcomeInput(manifest, overrides = {}) {
  return {
    agentId: manifest.agentId,
    assignmentId: manifest.assignmentId,
    attemptId: manifest.attemptId,
    role: manifest.role,
    status: "completed",
    rawText: "",
    source: { transport: "delegate_finish" },
    evidence: {
      summary: "Verified the assigned outcome.",
      checks: [{ name: "focused", status: "pass", evidence: "node --test" }],
    },
    ...overrides,
  };
}

test("terminal publication rejects malformed role evidence without claiming the attempt and accepts a correction", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    const taskId = "TASK-TERMINAL-CORRECTION";
    const manifest = await store.registerAgent({
      taskId,
      agentId: "verifier-1",
      role: "verifier",
      profile: "verifier",
      state: "running",
    });

    const rejected = await store.publishTerminalOutcome(taskId, terminalOutcomeInput(manifest, {
      evidence: { summary: "Claimed verification without check evidence." },
    }));

    assert.equal(rejected.status, "rejected");
    assert.match(rejected.reason, /verifier checks/i);
    assert.equal(await readFile(rejected.rawPath, "utf8"), "");
    const rejectedRecord = JSON.parse(await readFile(rejected.jsonPath, "utf8"));
    assert.equal(rejectedRecord.disposition, "rejected");
    assert.equal(rejectedRecord.taskId, taskId);
    assert.equal(rejectedRecord.assignmentId, manifest.assignmentId);
    assert.equal(rejectedRecord.attemptId, manifest.attemptId);

    const terminalRoot = join(store.pathsForTask(taskId).terminalOutcomesDir, manifest.assignmentId, manifest.attemptId);
    await assert.rejects(() => readFile(join(terminalRoot, "claim.json"), "utf8"), { code: "ENOENT" });
    await assert.rejects(() => readFile(join(terminalRoot, "terminal.accepted.json"), "utf8"), { code: "ENOENT" });

    const accepted = await store.publishTerminalOutcome(taskId, terminalOutcomeInput(manifest));

    assert.equal(accepted.status, "accepted");
    assert.equal(accepted.taskId, taskId);
    assert.equal(accepted.assignmentId, manifest.assignmentId);
    assert.equal(accepted.attemptId, manifest.attemptId);
    assert.match(accepted.outcomeId, /^terminal-/);
    assert.equal(JSON.parse(await readFile(accepted.claimPath, "utf8")).contentHash, accepted.contentHash);
    const acceptedRecord = JSON.parse(await readFile(accepted.jsonPath, "utf8"));
    assert.equal(acceptedRecord.disposition, "accepted");
    assert.equal(acceptedRecord.outcomeId, accepted.outcomeId);
    assert.equal(acceptedRecord.role, "verifier");
    assert.equal(acceptedRecord.status, "completed");
    assert.deepEqual(acceptedRecord.evidence.checks, [{ name: "focused", status: "pass", evidence: "node --test" }]);
  });
});

test("planning-parent terminal acceptance binds the latest delegated planning publication", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    const taskId = "TASK-TERMINAL-PLANNING-PARENT";
    const manifest = await store.registerAgent({
      taskId,
      agentId: "planning-parent-1",
      role: "planning-parent",
      profile: "planning-parent",
      state: "running",
    });
    const publication = await store.publishPlanningReport(taskId, {
      rawText: planningReportRaw(),
      source: {
        transport: "delegate_finish",
        agentId: manifest.agentId,
        assignmentId: manifest.assignmentId,
        attemptId: manifest.attemptId,
      },
    });

    const accepted = await store.publishTerminalOutcome(taskId, terminalOutcomeInput(manifest, {
      evidence: {
        summary: "Planning report is ready for owner authorization.",
        reportName: "planning-report",
        reportStatus: publication.reportStatus,
        planningPublicationId: publication.publicationId,
      },
    }));
    assert.equal(accepted.status, "accepted");
    assert.equal(JSON.parse(await readFile(accepted.jsonPath, "utf8")).evidence.planningPublicationId, publication.publicationId);

    const otherTaskId = "TASK-TERMINAL-PLANNING-PARENT-INVALID";
    const otherManifest = await store.registerAgent({
      taskId: otherTaskId,
      agentId: "planning-parent-1",
      role: "planning-parent",
      profile: "planning-parent",
      state: "running",
    });
    const rejected = await store.publishTerminalOutcome(otherTaskId, terminalOutcomeInput(otherManifest, {
      evidence: {
        summary: "Unbound planning result.",
        reportName: "planning-report",
        reportStatus: "ready",
        planningPublicationId: publication.publicationId,
      },
    }));
    assert.equal(rejected.status, "rejected");
    assert.match(rejected.reason, /latest accepted planning publication/);
    const otherRoot = join(store.pathsForTask(otherTaskId).terminalOutcomesDir, otherManifest.assignmentId, otherManifest.attemptId);
    await assert.rejects(() => readFile(join(otherRoot, "claim.json"), "utf8"), { code: "ENOENT" });
  });
});

test("terminal publication stores malformed source envelopes as rejected diagnostics without a claim", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    const taskId = "TASK-TERMINAL-SOURCE-REJECTED";
    const manifest = await store.registerAgent({
      taskId,
      agentId: "worker-1",
      role: "worker",
      profile: "worker",
      state: "running",
    });

    const rejected = await store.publishTerminalOutcome(taskId, terminalOutcomeInput(manifest, {
      source: { transport: "assistant_guess" },
    }));

    assert.equal(rejected.status, "rejected");
    assert.match(rejected.reason, /unsupported terminal outcome source transport/);
    const record = JSON.parse(await readFile(rejected.jsonPath, "utf8"));
    assert.deepEqual(record.source, { transport: "assistant_guess" });
    const terminalRoot = join(store.pathsForTask(taskId).terminalOutcomesDir, manifest.assignmentId, manifest.attemptId);
    await assert.rejects(() => readFile(join(terminalRoot, "claim.json"), "utf8"), { code: "ENOENT" });
    await assert.rejects(() => readFile(join(terminalRoot, "terminal.accepted.json"), "utf8"), { code: "ENOENT" });
  });
});

test("terminal publication makes the first accepted outcome immutable across identical and conflicting retries", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    const taskId = "TASK-TERMINAL-IMMUTABLE";
    const manifest = await store.registerAgent({
      taskId,
      agentId: "worker-1",
      role: "worker",
      profile: "worker",
      state: "running",
    });
    const input = terminalOutcomeInput(manifest, {
      rawText: "FFRESULT\nSTATUS|completed\nSUMMARY|First accepted result.\nEND_FFRESULT",
      evidence: { summary: "First accepted result.", filesChanged: ["delegation/src/store.ts"] },
    });

    const accepted = await store.publishTerminalOutcome(taskId, input);
    const acceptedBytes = await readFile(accepted.jsonPath, "utf8");
    const acceptedRawBytes = await readFile(accepted.rawPath, "utf8");
    const claimBytes = await readFile(accepted.claimPath, "utf8");

    const identical = await store.publishTerminalOutcome(taskId, input);
    assert.equal(identical.status, "accepted");
    assert.equal(identical.outcomeId, accepted.outcomeId);
    assert.equal(await readFile(accepted.jsonPath, "utf8"), acceptedBytes);
    assert.equal(await readFile(accepted.rawPath, "utf8"), acceptedRawBytes);
    assert.equal(await readFile(accepted.claimPath, "utf8"), claimBytes);

    const conflicting = await store.publishTerminalOutcome(taskId, terminalOutcomeInput(manifest, {
      rawText: "FFRESULT\nSTATUS|failed\nSUMMARY|Conflicting later result.\nEND_FFRESULT",
      status: "failed",
      evidence: { summary: "Conflicting later result." },
      source: { transport: "runtime_parser" },
    }));
    assert.equal(conflicting.status, "rejected");
    assert.match(conflicting.reason, new RegExp(accepted.outcomeId));
    assert.equal(JSON.parse(await readFile(conflicting.jsonPath, "utf8")).disposition, "rejected");
    assert.equal(await readFile(accepted.jsonPath, "utf8"), acceptedBytes);
    assert.equal(await readFile(accepted.rawPath, "utf8"), acceptedRawBytes);
    assert.equal(await readFile(accepted.claimPath, "utf8"), claimBytes);
  });
});

test("terminal publication fails closed when accepted evidence no longer matches its immutable claim", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    const taskId = "TASK-TERMINAL-TAMPER";
    const manifest = await store.registerAgent({
      taskId,
      agentId: "worker-1",
      role: "worker",
      profile: "worker",
      state: "running",
    });
    const input = terminalOutcomeInput(manifest, { evidence: { summary: "Original accepted result." } });
    const accepted = await store.publishTerminalOutcome(taskId, input);
    const acceptedRecord = JSON.parse(await readFile(accepted.jsonPath, "utf8"));
    acceptedRecord.evidence.summary = "Coherently modified accepted result.";
    const canonicalInput = {
      agentId: acceptedRecord.agentId,
      assignmentId: acceptedRecord.assignmentId,
      attemptId: acceptedRecord.attemptId,
      evidence: acceptedRecord.evidence,
      rawText: await readFile(accepted.rawPath, "utf8"),
      role: acceptedRecord.role,
      source: acceptedRecord.source,
      status: acceptedRecord.status,
      taskId: acceptedRecord.taskId,
    };
    const coherentlyModifiedHash = createHash("sha256").update(JSON.stringify(canonicalInput), "utf8").digest("hex");
    acceptedRecord.contentHash = coherentlyModifiedHash;
    acceptedRecord.outcomeId = `terminal-${coherentlyModifiedHash}`;
    await writeFile(accepted.jsonPath, `${JSON.stringify(acceptedRecord, null, 2)}\n`, "utf8");
    const modifiedBytes = await readFile(accepted.jsonPath, "utf8");

    await assert.rejects(() => store.publishTerminalOutcome(taskId, input), /does not match its immutable claim/);
    assert.equal(await readFile(accepted.jsonPath, "utf8"), modifiedBytes);
  });
});

test("terminal publication rejects stale assignment-attempt evidence without accepted-state mutation", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    const taskId = "TASK-TERMINAL-STALE";
    const manifest = await store.registerAgent({
      taskId,
      agentId: "worker-1",
      role: "worker",
      profile: "worker",
      state: "running",
      attemptId: "attempt-current",
    });

    const stale = await store.publishTerminalOutcome(taskId, terminalOutcomeInput(manifest, {
      attemptId: "attempt-stale",
    }));

    assert.equal(stale.status, "rejected");
    assert.match(stale.reason, /attempt-stale.*attempt-current/);
    const terminalRoot = join(store.pathsForTask(taskId).terminalOutcomesDir, manifest.assignmentId, manifest.attemptId);
    await assert.rejects(() => readFile(join(terminalRoot, "claim.json"), "utf8"), { code: "ENOENT" });
    await assert.rejects(() => readFile(join(terminalRoot, "terminal.accepted.json"), "utf8"), { code: "ENOENT" });
    assert.equal(JSON.parse(await readFile(stale.jsonPath, "utf8")).submittedAttemptId, "attempt-stale");

    const crossAssignment = await store.publishTerminalOutcome(taskId, terminalOutcomeInput(manifest, {
      assignmentId: "worker-forged",
    }));
    assert.equal(crossAssignment.status, "rejected");
    assert.match(crossAssignment.reason, /worker-forged.*worker-1/);
    await assert.rejects(() => readFile(join(terminalRoot, "claim.json"), "utf8"), { code: "ENOENT" });
    await assert.rejects(() => readFile(join(terminalRoot, "terminal.accepted.json"), "utf8"), { code: "ENOENT" });
  });
});

test("concurrent terminal publications converge on one immutable accepted outcome", async () => {
  await withTempStore(async (root) => {
    const firstStore = createDelegationStore({ root, now: fixedNow });
    const secondStore = createDelegationStore({ root, now: fixedNow });
    const taskId = "TASK-TERMINAL-CONCURRENT";
    const manifest = await firstStore.registerAgent({
      taskId,
      agentId: "worker-1",
      role: "worker",
      profile: "worker",
      state: "running",
    });
    const equivalent = terminalOutcomeInput(manifest, { evidence: { summary: "Equivalent concurrent result." } });

    const equivalentResults = await Promise.all([
      firstStore.publishTerminalOutcome(taskId, equivalent),
      secondStore.publishTerminalOutcome(taskId, equivalent),
    ]);
    assert.deepEqual(equivalentResults.map((result) => result.status), ["accepted", "accepted"]);
    assert.equal(equivalentResults[0].outcomeId, equivalentResults[1].outcomeId);

    const conflictTaskId = "TASK-TERMINAL-CONCURRENT-CONFLICT";
    const conflictManifest = await firstStore.registerAgent({
      taskId: conflictTaskId,
      agentId: "worker-1",
      role: "worker",
      profile: "worker",
      state: "running",
    });
    const conflictResults = await Promise.all([
      firstStore.publishTerminalOutcome(conflictTaskId, terminalOutcomeInput(conflictManifest, {
        status: "completed",
        evidence: { summary: "Concurrent outcome A." },
      })),
      secondStore.publishTerminalOutcome(conflictTaskId, terminalOutcomeInput(conflictManifest, {
        status: "failed",
        evidence: { summary: "Concurrent outcome B." },
        source: { transport: "runtime_parser" },
      })),
    ]);

    assert.deepEqual(conflictResults.map((result) => result.status).sort(), ["accepted", "rejected"]);
    const accepted = conflictResults.find((result) => result.status === "accepted");
    const rejected = conflictResults.find((result) => result.status === "rejected");
    assert.match(rejected.reason, new RegExp(accepted.outcomeId));
    assert.equal(JSON.parse(await readFile(accepted.jsonPath, "utf8")).outcomeId, accepted.outcomeId);
    assert.equal(JSON.parse(await readFile(rejected.jsonPath, "utf8")).disposition, "rejected");
  });
});

test("terminal publication adopts an identical stale claim and abandons a dead conflicting owner with preserved diagnostics", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    const taskId = "TASK-TERMINAL-STALE-CLAIM";
    const manifest = await store.registerAgent({
      taskId,
      agentId: "worker-1",
      role: "worker",
      profile: "worker",
      state: "running",
    });
    const terminalRoot = join(store.pathsForTask(taskId).terminalOutcomesDir, manifest.assignmentId, manifest.attemptId);
    const acceptedRawPath = join(terminalRoot, "terminal.accepted.raw.txt");
    await mkdir(acceptedRawPath, { recursive: true });
    const firstInput = terminalOutcomeInput(manifest, {
      rawText: "first pre-commit evidence",
      evidence: { summary: "First pre-commit outcome." },
    });

    await assert.rejects(() => store.publishTerminalOutcome(taskId, firstInput), /directory|EISDIR|link/i);
    const firstClaim = JSON.parse(await readFile(join(terminalRoot, "claim.json"), "utf8"));
    await assert.rejects(() => readFile(join(terminalRoot, "terminal.accepted.json"), "utf8"), { code: "ENOENT" });

    await rm(acceptedRawPath, { recursive: true, force: true });
    const adopted = await store.publishTerminalOutcome(taskId, firstInput);
    assert.equal(adopted.status, "accepted");
    assert.equal(adopted.contentHash, firstClaim.contentHash);

    const secondTaskId = "TASK-TERMINAL-DEAD-CLAIM";
    const secondManifest = await store.registerAgent({
      taskId: secondTaskId,
      agentId: "worker-1",
      role: "worker",
      profile: "worker",
      state: "running",
    });
    const secondRoot = join(store.pathsForTask(secondTaskId).terminalOutcomesDir, secondManifest.assignmentId, secondManifest.attemptId);
    const secondAcceptedRaw = join(secondRoot, "terminal.accepted.raw.txt");
    await mkdir(secondAcceptedRaw, { recursive: true });
    const abandonedInput = terminalOutcomeInput(secondManifest, {
      rawText: "abandoned pre-commit evidence",
      evidence: { summary: "Abandoned pre-commit outcome." },
    });
    await assert.rejects(() => store.publishTerminalOutcome(secondTaskId, abandonedInput), /directory|EISDIR|link/i);
    const abandonedClaimPath = join(secondRoot, "claim.json");
    const abandonedClaim = JSON.parse(await readFile(abandonedClaimPath, "utf8"));
    abandonedClaim.ownerPid = 2147483647;
    await writeFile(abandonedClaimPath, `${JSON.stringify(abandonedClaim, null, 2)}\n`, "utf8");
    await rm(secondAcceptedRaw, { recursive: true, force: true });

    const replacement = await store.publishTerminalOutcome(secondTaskId, terminalOutcomeInput(secondManifest, {
      rawText: "replacement evidence",
      evidence: { summary: "Replacement after dead claim owner." },
    }));
    assert.equal(replacement.status, "accepted");
    assert.notEqual(replacement.contentHash, abandonedClaim.contentHash);
    const abandonmentPath = join(secondRoot, "abandoned", `${abandonedClaim.claimId}.json`);
    const abandonment = JSON.parse(await readFile(abandonmentPath, "utf8"));
    assert.equal(abandonment.claim.claimId, abandonedClaim.claimId);
    assert.equal(abandonment.replacementContentHash, replacement.contentHash);
    assert.equal(JSON.parse(await readFile(abandonedClaimPath, "utf8")).contentHash, replacement.contentHash);
  });
});

test("terminal publication reports post-acceptance projection failure and reconciles the same outcome on retry", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    const taskId = "TASK-TERMINAL-RECONCILE";
    const manifest = await store.registerAgent({
      taskId,
      agentId: "worker-1",
      role: "worker",
      profile: "worker",
      state: "running",
      parentAgentId: "execution-parent-1",
    });
    const agentPaths = store.pathsForAgent(taskId, manifest.agentId);
    await mkdir(agentPaths.resultRaw, { recursive: true });
    const input = terminalOutcomeInput(manifest, {
      rawText: "FFRESULT\nSTATUS|completed\nSUMMARY|Reconcile this result.\nEND_FFRESULT",
      evidence: { summary: "Reconcile this result.", filesChanged: ["delegation/src/store.ts"] },
    });

    const incomplete = await store.publishTerminalOutcome(taskId, input);

    assert.equal(incomplete.status, "accepted");
    assert.equal(incomplete.commitState, "committed_incomplete");
    assert.deepEqual(incomplete.pendingEffects, ["result_projection", "publication_status"]);
    assert.match(incomplete.recoveryReason, /directory|EISDIR|rename|link/i);
    assert.equal(JSON.parse(await readFile(incomplete.jsonPath, "utf8")).outcomeId, incomplete.outcomeId);
    assert.equal((await store.readAgentStatus(taskId, manifest.agentId)).state, "completed");
    const acceptedRead = await store.readAgentResult(taskId, manifest.agentId);
    assert.equal(acceptedRead.exists, true);
    assert.equal(acceptedRead.jsonPath, incomplete.jsonPath);
    assert.equal(acceptedRead.parsed.terminalOutcomeId, incomplete.outcomeId);
    assert.equal(acceptedRead.terminalOutcome.publicationStatus, "accepted_pending_reconciliation");
    assert.equal(acceptedRead.terminalOutcome.recoveryOperation, "publishTerminalOutcome");
    const acceptedBytes = await readFile(incomplete.jsonPath, "utf8");
    const repeatedFailure = await store.publishTerminalOutcome(taskId, input);
    assert.equal(repeatedFailure.status, "accepted");
    assert.equal(repeatedFailure.outcomeId, incomplete.outcomeId);
    assert.equal(repeatedFailure.commitState, "committed_incomplete");
    assert.equal(await readFile(incomplete.jsonPath, "utf8"), acceptedBytes);
    const invariantAlerts = (await store.readParentAlerts(taskId)).filter((alert) =>
      alert.eventType === "terminal-publication-incomplete" && alert.data?.terminalOutcomeId === incomplete.outcomeId);
    assert.equal(invariantAlerts.length, 1);
    assert.deepEqual(invariantAlerts[0].data.pendingEffects, ["result_projection", "publication_status"]);

    await rm(agentPaths.resultRaw, { recursive: true, force: true });
    const reconciled = await store.publishTerminalOutcome(taskId, input);

    assert.equal(reconciled.status, "accepted");
    assert.equal(reconciled.outcomeId, incomplete.outcomeId);
    assert.equal(reconciled.commitState, "committed_reconciled");
    assert.deepEqual(reconciled.pendingEffects, []);
    assert.equal(await readFile(agentPaths.resultRaw, "utf8"), input.rawText);
    const resultProjection = JSON.parse(await readFile(agentPaths.resultJson, "utf8"));
    assert.equal(resultProjection.terminalOutcomeId, incomplete.outcomeId);
    assert.equal((await store.readAgentStatus(taskId, manifest.agentId)).state, "completed");
    assert.equal((await store.readAgentStatus(taskId, manifest.agentId)).terminalOutcomeId, incomplete.outcomeId);
    const agentEvents = (await readFile(agentPaths.eventsJsonl, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    const taskEvents = (await readFile(store.pathsForTask(taskId).eventsJsonl, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(agentEvents.filter((event) => event.data?.terminalOutcomeId === incomplete.outcomeId).length, 1);
    assert.equal(taskEvents.filter((event) => event.data?.terminalOutcomeId === incomplete.outcomeId).length, 1);
    const alerts = await store.readParentAlerts(taskId);
    assert.equal(alerts.filter((alert) => alert.eventType === "agent-result" && alert.data?.terminalOutcomeId === incomplete.outcomeId).length, 1);
    assert.equal(alerts.filter((alert) => alert.eventType === "terminal-publication-incomplete" && alert.data?.terminalOutcomeId === incomplete.outcomeId).length, 1);
  });
});

test("terminal publication reconciles interruption at every materialized effect without duplicates", async (t) => {
  const effectNames = ["result_projection", "assignment_status", "lease_termination", "agent_event", "task_event", "parent_alert", "publication_status"];
  for (const [effectIndex, blockedEffect] of effectNames.entries()) {
    await t.test(blockedEffect, async () => {
      await withTempStore(async (root) => {
        const store = createDelegationStore({ root, now: fixedNow });
        const taskId = `TASK-TERMINAL-EFFECT-${effectIndex}`;
        const manifest = await store.registerAgent({
          taskId,
          agentId: "worker-1",
          role: "worker",
          profile: "worker",
          state: "running",
          parentAgentId: "execution-parent-1",
        });
        if (blockedEffect === "lease_termination") {
          await store.ensureLeaseActive(taskId, activeWorkerLease({
            taskId,
            agentId: manifest.agentId,
            assignmentId: manifest.assignmentId,
            attemptId: manifest.attemptId,
          }));
        }
        const agent = store.pathsForAgent(taskId, manifest.agentId);
        const task = store.pathsForTask(taskId);
        const blockerPath = {
          result_projection: agent.resultRaw,
          assignment_status: task.registryJson,
          lease_termination: task.leasesJsonl,
          agent_event: agent.eventsJsonl,
          task_event: task.eventsJsonl,
          parent_alert: task.parentAlertsJson,
          publication_status: join(task.terminalOutcomesDir, manifest.assignmentId, manifest.attemptId, "terminal.reconciled.json"),
        }[blockedEffect];
        const restore = blockedEffect === "result_projection" || blockedEffect === "publication_status"
          ? (await mkdir(blockerPath, { recursive: true }), async () => rm(blockerPath, { recursive: true, force: true }))
          : await replaceFileWithDirectory(blockerPath);
        const input = terminalOutcomeInput(manifest, { evidence: { summary: `Recover ${blockedEffect}.` } });

        const incomplete = await store.publishTerminalOutcome(taskId, input);
        assert.equal(incomplete.status, "accepted");
        assert.equal(incomplete.commitState, "committed_incomplete");
        assert.deepEqual(
          incomplete.pendingEffects,
          blockedEffect === "publication_status" ? ["publication_status"] : [blockedEffect, "publication_status"],
        );
        assert.match(incomplete.recoveryReason, new RegExp(`${blockedEffect}:`));

        await restore();
        const reconciled = await store.publishTerminalOutcome(taskId, input);
        assert.equal(reconciled.status, "accepted");
        assert.equal(reconciled.outcomeId, incomplete.outcomeId);
        assert.equal(reconciled.commitState, "committed_reconciled");
        assert.deepEqual(reconciled.pendingEffects, []);

        const agentEventsText = await readFile(agent.eventsJsonl, "utf8");
        const taskEventsText = await readFile(task.eventsJsonl, "utf8");
        const agentEvents = agentEventsText.trim() === "" ? [] : agentEventsText.trim().split("\n").map((line) => JSON.parse(line));
        const taskEvents = taskEventsText.trim() === "" ? [] : taskEventsText.trim().split("\n").map((line) => JSON.parse(line));
        assert.equal(agentEvents.filter((event) => event.data?.terminalOutcomeId === incomplete.outcomeId).length, 1);
        assert.equal(taskEvents.filter((event) => event.data?.terminalOutcomeId === incomplete.outcomeId).length, 1);
        assert.equal((await store.readParentAlerts(taskId)).filter((alert) => alert.data?.terminalOutcomeId === incomplete.outcomeId).length, 1);
        if (blockedEffect === "lease_termination") {
          const leaseEvents = await store.readLeaseEvents(taskId);
          assert.equal(leaseEvents.filter((event) => event.leaseId === "lease-worker" && event.state === "exhausted").length, 1);
        }
      });
    });
  }
});

test("a synthetic legacy terminal outcome remains retryable after its status becomes terminal", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    const taskId = "TASK-TERMINAL-LEGACY-RETRY";
    const versioned = await store.registerAgent({
      taskId,
      agentId: "worker-legacy",
      role: "worker",
      profile: "worker",
      state: "running",
      surfaceRef: "surface:legacy",
      launchCommand: "pi worker-legacy",
      parentAgentId: "execution-parent-1",
    });
    const { schemaVersion, identitySchemaVersion, profileSchemaVersion, protocolVersion, assignmentId, attemptId, attemptSource, ...legacyManifest } = versioned;
    await writeFile(store.pathsForAgent(taskId, versioned.agentId).manifestJson, `${JSON.stringify(legacyManifest, null, 2)}\n`, "utf8");
    const runningStatus = await store.readAgentStatus(taskId, versioned.agentId);
    const synthetic = resolveAssignmentAttemptIdentity({ manifest: legacyManifest, status: runningStatus });
    await store.ensureLeaseActive(taskId, activeWorkerLease({
      leaseId: "lease-worker-legacy",
      taskId,
      agentId: versioned.agentId,
      assignmentId: synthetic.assignmentId,
      attemptId: synthetic.attemptId,
    }));
    const input = terminalOutcomeInput({
      ...legacyManifest,
      assignmentId: synthetic.assignmentId,
      attemptId: synthetic.attemptId,
    }, { evidence: { summary: "Legacy result remains recoverable." } });

    const accepted = await store.publishTerminalOutcome(taskId, input);
    assert.equal(accepted.status, "accepted");
    assert.equal((await store.readAgentStatus(taskId, versioned.agentId)).state, "completed");

    const retry = await store.publishTerminalOutcome(taskId, input);
    assert.equal(retry.status, "accepted");
    assert.equal(retry.outcomeId, accepted.outcomeId);
    assert.equal(retry.commitState, "committed_reconciled");
  });
});

test("acknowledging a terminal alert cannot let an identical retry create another alert", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    const taskId = "TASK-TERMINAL-ALERT-ACK";
    const manifest = await store.registerAgent({
      taskId,
      agentId: "worker-1",
      role: "worker",
      profile: "worker",
      state: "running",
      parentAgentId: "execution-parent-1",
    });
    const input = terminalOutcomeInput(manifest, { evidence: { summary: "One terminal alert only." } });
    const accepted = await store.publishTerminalOutcome(taskId, input);
    const [alert] = (await store.readParentAlerts(taskId)).filter((candidate) => candidate.data?.terminalOutcomeId === accepted.outcomeId);
    assert.ok(alert);
    await store.markParentAlertsRead(taskId, [alert.alertId]);

    const retry = await store.publishTerminalOutcome(taskId, input);

    assert.equal(retry.status, "accepted");
    assert.equal(retry.outcomeId, accepted.outcomeId);
    const alerts = (await store.readParentAlerts(taskId)).filter((candidate) => candidate.data?.terminalOutcomeId === accepted.outcomeId);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].alertId, alert.alertId);
    assert.ok(alerts[0].readAt);
  });
});

test("bare planning readiness cannot create new authorization authority", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    const taskId = "TASK-BARE-READY";
    await store.initTask({ taskId });

    await assert.rejects(
      () => store.recordPlanningReportReady(taskId, { eventId: "evt.bare.ready", planArtifactPath: "docs/plans/bare.md" }),
      /publishPlanningReport/,
    );

    const eventsPath = store.pathsForTask(taskId).eventsJsonl;
    const events = await readFile(eventsPath, "utf8").catch(() => "");
    assert.equal(events.includes("planning_report.ready"), false);
    await assert.rejects(() => store.readExecutionApprovalRequest(taskId), /no valid planning-ready event/);
  });
});

test("planning report publication verifies delegated source role and current attempt", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    const taskId = "TASK-PLANNING-SOURCE";
    const planning = await store.registerAgent({
      taskId,
      agentId: "planning-parent-1",
      role: "planning-parent",
      profile: "planning-parent",
      state: "running",
    });
    const execution = await store.registerAgent({
      taskId,
      agentId: "execution-parent-1",
      role: "execution-parent",
      profile: "execution-parent",
      state: "running",
    });
    const rawText = planningReportRaw();
    const indexBeforeCrossTaskRejection = await readFile(join(root, "index.json"), "utf8");
    const crossTaskId = "TASK-PLANNING-SOURCE-FORGED-TARGET";

    await assert.rejects(
      () => store.publishPlanningReport(crossTaskId, {
        rawText,
        source: {
          transport: "delegate_finish",
          agentId: planning.agentId,
          assignmentId: planning.assignmentId,
          attemptId: planning.attemptId,
        },
      }),
      /ENOENT|no such file/i,
    );
    await assert.rejects(() => readFile(store.pathsForTask(crossTaskId).taskJson, "utf8"), { code: "ENOENT" });
    assert.equal(await readFile(join(root, "index.json"), "utf8"), indexBeforeCrossTaskRejection);

    await assert.rejects(
      () => store.publishPlanningReport(taskId, {
        rawText,
        source: { transport: "runtime_parser", agentId: planning.agentId, assignmentId: planning.assignmentId, attemptId: "attempt-stale" },
      }),
      /attempt.*does not match manifest attempt/i,
    );
    await assert.rejects(
      () => store.publishPlanningReport(taskId, {
        rawText,
        source: { transport: "delegate_finish", agentId: execution.agentId, assignmentId: execution.assignmentId, attemptId: execution.attemptId },
      }),
      /planning-parent role/,
    );
    const events = await readFile(store.pathsForTask(taskId).eventsJsonl, "utf8");
    assert.equal(events.includes("planning_report.accepted"), false);
  });
});

test("planning artifact integrity gates approval, authorization write, and reconstruction", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });

    const missingTask = "TASK-PLANNING-EVIDENCE-MISSING";
    const missing = await store.publishPlanningReport(missingTask, {
      rawText: planningReportRaw({ identityRows: ["PLAN_ARTIFACT_PATH|docs/plans/missing.md", "ARTIFACT_PATHS|docs/plans/missing.md"] }),
      source: { transport: "delegate_record_report" },
    });
    await rm(missing.rawPath, { force: true });
    await assert.rejects(() => store.readExecutionApprovalRequest(missingTask), /accepted planning publication evidence/i);

    const writeTask = "TASK-PLANNING-EVIDENCE-WRITE";
    const beforeWrite = await store.publishPlanningReport(writeTask, {
      rawText: planningReportRaw({ identityRows: ["PLAN_ARTIFACT_PATH|docs/plans/write.md", "ARTIFACT_PATHS|docs/plans/write.md"] }),
      source: { transport: "delegate_record_report" },
    });
    const writePreview = await store.readExecutionApprovalRequest(writeTask);
    const tamperedRecord = JSON.parse(await readFile(beforeWrite.jsonPath, "utf8"));
    tamperedRecord.contentHash = "0".repeat(64);
    await writeFile(beforeWrite.jsonPath, `${JSON.stringify(tamperedRecord, null, 2)}\n`, "utf8");
    await assert.rejects(() => store.readTaskReport(writeTask, "planning-report"), /accepted planning publication evidence/i);
    await assert.rejects(
      () => store.recordPlanApproved(writeTask, {
        planningReportReadyEventId: writePreview.planningReportReadyEventId,
        planArtifactPath: writePreview.planArtifactPath,
        approvedBy: "user",
      }),
      /accepted planning publication evidence/i,
    );

    const authorizationWriteTask = "TASK-PLANNING-EVIDENCE-AUTH-WRITE";
    const beforeAuthorizationWrite = await store.publishPlanningReport(authorizationWriteTask, {
      rawText: planningReportRaw({ identityRows: ["PLAN_ARTIFACT_PATH|docs/plans/auth-write.md", "ARTIFACT_PATHS|docs/plans/auth-write.md"] }),
      source: { transport: "delegate_record_report" },
    });
    const authorizationWritePreview = await store.readExecutionApprovalRequest(authorizationWriteTask);
    const authorizationWriteApproval = await store.recordPlanApproved(authorizationWriteTask, {
      planningReportReadyEventId: authorizationWritePreview.planningReportReadyEventId,
      planArtifactPath: authorizationWritePreview.planArtifactPath,
      approvedBy: "user",
    });
    await writeFile(beforeAuthorizationWrite.rawPath, "tampered before authorization write", "utf8");
    await assert.rejects(
      () => store.recordExecutionAuthorized(authorizationWriteTask, {
        planningReportReadyEventId: authorizationWritePreview.planningReportReadyEventId,
        planApprovedEventId: authorizationWriteApproval.eventId,
        planArtifactPath: authorizationWritePreview.planArtifactPath,
      }),
      /accepted planning publication evidence/i,
    );

    const reconstructionTask = "TASK-PLANNING-EVIDENCE-RECONSTRUCT";
    const beforeReconstruction = await store.publishPlanningReport(reconstructionTask, {
      rawText: planningReportRaw({ identityRows: ["PLAN_ARTIFACT_PATH|docs/plans/reconstruct.md", "ARTIFACT_PATHS|docs/plans/reconstruct.md"] }),
      source: { transport: "delegate_record_report" },
    });
    const reconstructionPreview = await store.readExecutionApprovalRequest(reconstructionTask);
    await store.approveAndAuthorizeExecution(reconstructionTask, reconstructionPreview);
    await writeFile(beforeReconstruction.rawPath, "tampered planning evidence", "utf8");
    assert.equal(await store.readExecutionAuthorization(reconstructionTask), undefined);

    const coherentTask = "TASK-PLANNING-EVIDENCE-COHERENT-TAMPER";
    const beforeCoherentTamper = await store.publishPlanningReport(coherentTask, {
      rawText: planningReportRaw({ identityRows: ["PLAN_ARTIFACT_PATH|docs/plans/coherent.md", "ARTIFACT_PATHS|docs/plans/coherent.md"] }),
      source: { transport: "delegate_record_report" },
    });
    const coherentPreview = await store.readExecutionApprovalRequest(coherentTask);
    await store.approveAndAuthorizeExecution(coherentTask, coherentPreview);
    const coherentlyTamperedRaw = (await readFile(beforeCoherentTamper.rawPath, "utf8"))
      .replace("GOAL|Publish one canonical planning report.", "GOAL|Coherently altered planning report.");
    const coherentlyTamperedReport = parseProtocolText(coherentlyTamperedRaw).planningReports[0];
    assert.ok(coherentlyTamperedReport);
    const coherentlyTamperedHash = createHash("sha256").update(coherentlyTamperedRaw, "utf8").digest("hex");
    const coherentlyTamperedRecord = JSON.parse(await readFile(beforeCoherentTamper.jsonPath, "utf8"));
    coherentlyTamperedRecord.contentHash = coherentlyTamperedHash;
    coherentlyTamperedRecord.report = coherentlyTamperedReport;
    await writeFile(beforeCoherentTamper.rawPath, coherentlyTamperedRaw, "utf8");
    await writeFile(beforeCoherentTamper.jsonPath, `${JSON.stringify(coherentlyTamperedRecord, null, 2)}\n`, "utf8");
    const coherentEventsPath = store.pathsForTask(coherentTask).eventsJsonl;
    const coherentlyTamperedEvents = (await readFile(coherentEventsPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    const coherentAcceptedEvent = coherentlyTamperedEvents.find((event) => event.type === "planning_report.accepted");
    coherentAcceptedEvent.data.contentHash = coherentlyTamperedHash;
    await writeFile(coherentEventsPath, `${coherentlyTamperedEvents.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");

    await assert.rejects(() => store.readExecutionApprovalRequest(coherentTask), /accepted planning publication evidence/i);
    await assert.rejects(() => store.readTaskReport(coherentTask, "planning-report"), /accepted planning publication evidence/i);
    await assert.rejects(
      () => store.recordPlanApproved(coherentTask, {
        planningReportReadyEventId: coherentPreview.planningReportReadyEventId,
        planArtifactPath: coherentPreview.planArtifactPath,
        approvedBy: "user",
      }),
      /accepted planning publication evidence/i,
    );
    assert.equal(await store.readExecutionAuthorization(coherentTask), undefined);
  });
});

test("planning report publication keeps rejected evidence diagnostic and preserves accepted state", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    const taskId = "TASK-PLANNING-PUBLICATION";
    const conflicting = planningReportRaw({
      identityRows: [
        "PLAN_ARTIFACT_PATH|docs/plans/first.md",
        "PLAN_ARTIFACT_PATH|docs/plans/second.md",
        "ARTIFACT_PATHS|docs/plans/first.md,docs/plans/second.md",
      ],
    });

    const rejectedFresh = await store.publishPlanningReport(taskId, {
      rawText: conflicting,
      source: { transport: "delegate_record_report" },
    });

    assert.equal(rejectedFresh.status, "rejected");
    assert.equal((await store.readTaskReport(taskId, "planning-report")).exists, false);
    assert.notEqual(rejectedFresh.rawPath, store.pathsForTask(taskId).planningReportRaw);
    assert.notEqual(rejectedFresh.jsonPath, store.pathsForTask(taskId).planningReportJson);
    assert.equal(await readFile(rejectedFresh.rawPath, "utf8"), conflicting);
    assert.equal((await readFile(store.pathsForTask(taskId).eventsJsonl, "utf8")).includes("planning_report.ready"), false);

    const accepted = await store.publishPlanningReport(taskId, {
      rawText: planningReportRaw(),
      source: { transport: "delegate_record_report" },
    });
    assert.equal(accepted.status, "accepted");
    const acceptedBefore = await store.readTaskReport(taskId, "planning-report");
    const acceptedRawBefore = await readFile(acceptedBefore.rawPath, "utf8");
    const acceptedJsonBefore = await readFile(acceptedBefore.jsonPath, "utf8");

    const rejectedAfterAccepted = await store.publishPlanningReport(taskId, {
      rawText: conflicting,
      source: { transport: "delegate_record_report" },
    });

    assert.equal(rejectedAfterAccepted.status, "rejected");
    const acceptedAfter = await store.readTaskReport(taskId, "planning-report");
    assert.equal(acceptedAfter.rawPath, acceptedBefore.rawPath);
    assert.equal(acceptedAfter.jsonPath, acceptedBefore.jsonPath);
    assert.equal(await readFile(acceptedAfter.rawPath, "utf8"), acceptedRawBefore);
    assert.equal(await readFile(acceptedAfter.jsonPath, "utf8"), acceptedJsonBefore);
  });
});

test("blocked planning publication supersedes ready state and invalidates earlier authorization", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    const taskId = "TASK-PLANNING-BLOCKED";
    const ready = await store.publishPlanningReport(taskId, {
      rawText: planningReportRaw({ identityRows: ["PLAN_ARTIFACT_PATH|docs/plans/ready-a.md", "ARTIFACT_PATHS|docs/plans/ready-a.md"] }),
      source: { transport: "delegate_record_report" },
    });
    const preview = await store.readExecutionApprovalRequest(taskId);
    const authorized = await store.approveAndAuthorizeExecution(taskId, preview);
    assert.equal((await store.readExecutionAuthorization(taskId)).executionAuthorizedEventId, authorized.authorization.eventId);

    const blockedRaw = planningReportRaw({ status: "blocked", identityRows: ["ARTIFACT_PATHS|docs/notes/planning-blocker.md"] });
    const blocked = await store.publishPlanningReport(taskId, {
      rawText: blockedRaw,
      source: { transport: "delegate_record_report" },
    });

    assert.equal(blocked.status, "accepted");
    assert.equal(blocked.reportStatus, "blocked");
    assert.equal(blocked.planningReadyEventId, undefined);
    assert.equal((await store.readTaskReport(taskId, "planning-report")).parsed.status, "blocked");
    assert.equal(await store.readExecutionAuthorization(taskId), undefined);
    await assert.rejects(() => store.readExecutionApprovalRequest(taskId), /current planning publication is blocked/);
    const blockedRetry = await store.publishPlanningReport(taskId, {
      rawText: blockedRaw,
      source: { transport: "delegate_record_report" },
    });
    assert.equal(blockedRetry.publicationId, blocked.publicationId);

    const corrected = await store.publishPlanningReport(taskId, {
      rawText: planningReportRaw({ identityRows: ["PLAN_ARTIFACT_PATH|docs/plans/ready-b.md", "ARTIFACT_PATHS|docs/plans/ready-b.md"] }),
      source: { transport: "delegate_record_report" },
    });
    assert.notEqual(corrected.planningReadyEventId, ready.planningReadyEventId);
    const correctedPreview = await store.readExecutionApprovalRequest(taskId);
    assert.equal(correctedPreview.planningReportReadyEventId, corrected.planningReadyEventId);
    assert.equal(correctedPreview.planArtifactPath, "docs/plans/ready-b.md");
    const reauthorized = await store.approveAndAuthorizeExecution(taskId, correctedPreview);
    assert.equal(reauthorized.evidence.planArtifactPath, "docs/plans/ready-b.md");
  });
});

test("planning report publication reports committed projection failure and reconciles retry", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    const taskId = "TASK-PLANNING-RECOVERY";
    await store.initTask({ taskId });
    const paths = store.pathsForTask(taskId);
    await mkdir(paths.planningReportRaw, { recursive: true });

    const committed = await store.publishPlanningReport(taskId, {
      rawText: planningReportRaw({ identityRows: ["PLAN_ARTIFACT_PATH|docs/plans/recovery.md", "ARTIFACT_PATHS|docs/plans/recovery.md"] }),
      source: { transport: "delegate_record_report" },
    });

    assert.equal(committed.status, "accepted");
    assert.equal(committed.commitState, "committed_incomplete");
    assert.match(committed.recoveryReason, /directory|EISDIR|rename/i);
    assert.equal((await store.readTaskReport(taskId, "planning-report")).exists, true);
    assert.equal((await store.readExecutionApprovalRequest(taskId)).planningReportReadyEventId, committed.planningReadyEventId);

    await rm(paths.planningReportRaw, { recursive: true, force: true });
    const reconciled = await store.publishPlanningReport(taskId, {
      rawText: planningReportRaw({ identityRows: ["PLAN_ARTIFACT_PATH|docs/plans/recovery.md", "ARTIFACT_PATHS|docs/plans/recovery.md"] }),
      source: { transport: "delegate_record_report" },
    });
    assert.equal(reconciled.publicationId, committed.publicationId);
    assert.equal(reconciled.commitState, "committed_reconciled");
    assert.match(await readFile(paths.planningReportRaw, "utf8"), /PLAN_ARTIFACT_PATH\|docs\/plans\/recovery\.md/);
  });
});

test("store appends route decisions and records route applications idempotently", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    await store.initTask({ taskId: "TASK-ROUTE-STORE" });

    const storedRoute = await store.appendRouteDecision("TASK-ROUTE-STORE", {
      kind: "route_required",
      routeId: "route-planning-1",
      targetRole: "planning-parent",
      reasonCodes: ["broad_implementation", "missing_execution_authorization"],
    });

    assert.equal(storedRoute.taskId, "TASK-ROUTE-STORE");
    assert.equal(storedRoute.decision.kind, "route_required");
    assert.match(store.pathsForTask("TASK-ROUTE-STORE").routesJsonl, /routes\.jsonl$/);
    const legacyRouteRecords = await store.readRouteDecisions("TASK-ROUTE-STORE");
    assert.deepEqual(legacyRouteRecords.map((record) => record.routeId), ["route-planning-1"]);
    assert.equal(legacyRouteRecords[0].request, undefined);

    const firstApply = await store.recordRouteApplication({
      applicationId: "apply-route-planning-1",
      routeId: "route-planning-1",
      taskId: "TASK-ROUTE-STORE",
      state: "pending",
      decisionKind: "route_required",
      layoutAllocationId: "layout-planning-1",
      leaseIds: ["lease-planning-1"],
      waitingFor: "PLANNING_REPORT",
    });
    const duplicateApply = await store.recordRouteApplication({
      applicationId: "apply-route-planning-duplicate",
      routeId: "route-planning-1",
      taskId: "TASK-ROUTE-STORE",
      state: "applied",
      decisionKind: "route_required",
      layoutAllocationId: "layout-duplicate",
      leaseIds: ["lease-duplicate"],
      spawned: ["planning-parent-duplicate"],
      waitingFor: "PLANNING_REPORT",
    });

    assert.equal(firstApply.recorded, true);
    assert.equal(duplicateApply.recorded, false);
    assert.equal(duplicateApply.application.state, "pending");
    assert.equal(duplicateApply.application.applicationId, "apply-route-planning-1");
    assert.equal(duplicateApply.application.spawned, undefined);
    assert.deepEqual((await store.readRouteApplications("TASK-ROUTE-STORE")).map((application) => application.applicationId), ["apply-route-planning-1"]);
  });
});

test("store writes and reads normalized route request evidence", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    await store.initTask({ taskId: "TASK-ROUTE-REQUEST" });

    const storedRoute = await store.appendRouteDecision("TASK-ROUTE-REQUEST", {
      kind: "route_required",
      routeId: "route-request-evidence",
      targetRole: "worker",
      reasonCodes: ["execution_parent_implementation_routes_worker"],
    }, {
      request: {
        taskId: "TASK-ROUTE-REQUEST",
        agentId: "execution-parent-1",
        role: "execution-parent",
        action: { kind: "implement", breadth: "multi_file", description: "Implement stored route evidence." },
        targetFiles: ["delegation/src/store.ts", "delegation/src/types.ts", "delegation/src/store.ts"],
        writeScopes: ["delegation/src/**", "delegation/tests/**", "delegation/src/**"],
        riskFlags: ["unknown", "security", "unknown"],
        routeId: "route-request-evidence",
      },
    });

    assert.deepEqual(storedRoute.request, {
      taskId: "TASK-ROUTE-REQUEST",
      agentId: "execution-parent-1",
      role: "execution-parent",
      action: { kind: "implement", breadth: "multi_file", description: "Implement stored route evidence." },
      targetFiles: ["delegation/src/store.ts", "delegation/src/types.ts"],
      writeScopes: ["delegation/src/**", "delegation/tests/**"],
      riskFlags: ["unknown", "security"],
      routeId: "route-request-evidence",
    });

    const [readRoute] = await store.readRouteDecisions("TASK-ROUTE-REQUEST");
    assert.deepEqual(readRoute.request, storedRoute.request);
  });
});

test("store fails closed for conflicting stored route request evidence", async () => {
  async function assertRejectsRecord(record, pattern) {
    await withTempStore(async (root) => {
      const store = createDelegationStore({ root, now: fixedNow });
      await store.initTask({ taskId: "TASK-ROUTE-CONFLICT" });
      await writeFile(store.pathsForTask("TASK-ROUTE-CONFLICT").routesJsonl, `${JSON.stringify(record)}\n`, "utf8");
      await assert.rejects(() => store.readRouteDecisions("TASK-ROUTE-CONFLICT"), pattern);
    });
  }

  const baseRecord = {
    taskId: "TASK-ROUTE-CONFLICT",
    routeId: "route-conflict",
    recordedAt: fixedNow(),
    decision: {
      kind: "route_required",
      routeId: "route-conflict",
      targetRole: "worker",
      reasonCodes: ["execution_parent_implementation_routes_worker"],
    },
    request: {
      taskId: "TASK-ROUTE-CONFLICT",
      agentId: "execution-parent-1",
      role: "execution-parent",
      action: { kind: "implement", breadth: "multi_file" },
      routeId: "route-conflict",
    },
  };

  await assertRejectsRecord({ ...baseRecord, request: { ...baseRecord.request, taskId: "TASK-OTHER" } }, /route request task id TASK-OTHER does not match task TASK-ROUTE-CONFLICT/);
  await assertRejectsRecord({ ...baseRecord, request: { ...baseRecord.request, routeId: "route-other" } }, /route request route id route-other does not match route route-conflict/);
  await assertRejectsRecord({ ...baseRecord, decision: { ...baseRecord.decision, routeId: "route-other" } }, /route decision route id route-other does not match record route route-conflict/);
});

test("store authorizes one immutable execution identity only from its ordered predecessor chain", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    const taskId = "TASK-AUTH-STORE";
    const planArtifactPath = "docs/plans/delegation/approved-plan.md";
    await store.initTask({ taskId });
    await store.initTask({ taskId: "TASK-AUTH-OTHER" });

    const ready = await publishReadyEvent(store, taskId, planArtifactPath);
    const readyRetry = await publishReadyEvent(store, taskId, planArtifactPath);
    assert.equal(readyRetry.eventId, ready.eventId);
    const otherReady = await publishReadyEvent(store, "TASK-AUTH-OTHER", planArtifactPath);
    const otherApproval = await store.recordPlanApproved("TASK-AUTH-OTHER", {
      eventId: "evt.other.plan.approved",
      planningReportReadyEventId: otherReady.eventId,
      planArtifactPath,
      approvedBy: "user",
    });

    await assert.rejects(
      () => store.recordExecutionAuthorized(taskId, {
        eventId: "evt.execution.before-approval",
        planningReportReadyEventId: ready.eventId,
        planApprovedEventId: "evt.plan.missing",
        planArtifactPath,
      }),
      /plan-approved predecessor event .* does not exist/,
    );
    await assert.rejects(
      () => store.recordPlanApproved(taskId, {
        eventId: "evt.plan.cross-task",
        planningReportReadyEventId: otherReady.eventId,
        planArtifactPath,
        approvedBy: "user",
      }),
      /planning-ready predecessor event .* does not exist/,
    );

    const approvalInput = {
      eventId: "evt.plan.approved",
      planningReportReadyEventId: ready.eventId,
      planArtifactPath,
      approvedBy: "user",
      constraints: ["R1 core authorization only"],
    };
    const approval = await store.recordPlanApproved(taskId, approvalInput);
    const approvalRetry = await store.recordPlanApproved(taskId, approvalInput);
    assert.equal(approvalRetry.eventId, approval.eventId);
    await assert.rejects(
      () => store.recordPlanApproved(taskId, { ...approvalInput, constraints: ["conflicting constraint"] }),
      /plan-approved event id conflict/,
    );
    assert.equal(await store.hasExecutionAuthorization(taskId), false);

    const eventsBeforeRejectedAuthorization = await readFile(store.pathsForTask(taskId).eventsJsonl, "utf8");
    const taskBeforeRejectedAuthorization = await readFile(store.pathsForTask(taskId).taskJson, "utf8");
    const invalidAuthorizations = [
      {
        name: "missing planning predecessor",
        input: { planningReportReadyEventId: "evt.plan.missing", planApprovedEventId: approval.eventId, planArtifactPath },
        pattern: /planning-ready predecessor event .* does not exist/,
      },
      {
        name: "cross-task approval predecessor",
        input: { planningReportReadyEventId: ready.eventId, planApprovedEventId: otherApproval.eventId, planArtifactPath },
        pattern: /plan-approved predecessor event .* does not exist/,
      },
      {
        name: "changed bound plan identity",
        input: { planningReportReadyEventId: ready.eventId, planApprovedEventId: approval.eventId, planArtifactPath: "docs/plans/delegation/other-plan.md" },
        pattern: /plan artifact identity does not match predecessor chain/,
      },
      {
        name: "wrong execution id",
        input: { planningReportReadyEventId: ready.eventId, planApprovedEventId: approval.eventId, planArtifactPath, executionId: "execution-wrong" },
        pattern: /execution id does not match canonical envelope/,
      },
      {
        name: "wrong execution map path",
        input: { planningReportReadyEventId: ready.eventId, planApprovedEventId: approval.eventId, planArtifactPath, executionMapPath: ".freeflow/delegation/tasks/OTHER/execution-map.json" },
        pattern: /execution map path does not match canonical task path/,
      },
      {
        name: "wrong execution schema version",
        input: { planningReportReadyEventId: ready.eventId, planApprovedEventId: approval.eventId, planArtifactPath, schemaVersion: 2 },
        pattern: /unsupported execution envelope schema version/,
      },
    ];
    for (const invalid of invalidAuthorizations) {
      await assert.rejects(
        () => store.recordExecutionAuthorized(taskId, { eventId: `evt.execution.invalid-${invalid.name.replaceAll(" ", "-")}`, ...invalid.input }),
        invalid.pattern,
        invalid.name,
      );
    }
    assert.equal(await readFile(store.pathsForTask(taskId).eventsJsonl, "utf8"), eventsBeforeRejectedAuthorization);
    assert.equal(await readFile(store.pathsForTask(taskId).taskJson, "utf8"), taskBeforeRejectedAuthorization);

    const [authorization, authorizationRetry] = await Promise.all([
      store.recordExecutionAuthorized(taskId, {
        eventId: "evt.execution.authorized",
        planningReportReadyEventId: ready.eventId,
        planApprovedEventId: approval.eventId,
        planArtifactPath,
      }),
      store.recordExecutionAuthorized(taskId, {
        eventId: "evt.execution.authorized",
        planningReportReadyEventId: ready.eventId,
        planApprovedEventId: approval.eventId,
        planArtifactPath,
      }),
    ]);
    assert.equal(authorizationRetry.eventId, authorization.eventId);
    const authorizationEvents = (await readFile(store.pathsForTask(taskId).eventsJsonl, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
      .filter((event) => event.type === "execution.authorized");
    assert.equal(authorizationEvents.length, 1);
    const paths = store.pathsForTask(taskId);
    const canonicalMapPath = paths.executionMapJson;
    const envelopePath = join(paths.executionEnvelopesDir, `${authorization.data.executionId}.json`);
    const envelope = JSON.parse(await readFile(envelopePath, "utf8"));
    assert.deepEqual(envelope, {
      schemaVersion: 1,
      executionId: authorization.data.executionId,
      taskId,
      executionMapPath: canonicalMapPath,
      planArtifactPath,
      planningReportReadyEventId: ready.eventId,
      planApprovedEventId: approval.eventId,
      createdAt: fixedNow(),
    });
    const causalEvents = (await readFile(paths.eventsJsonl, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    const envelopeEventIndex = causalEvents.findIndex((event) => event.type === "execution.envelope.created" && event.data?.executionId === envelope.executionId);
    const authorizationEventIndex = causalEvents.findIndex((event) => event.eventId === authorization.eventId);
    assert.ok(envelopeEventIndex > causalEvents.findIndex((event) => event.eventId === approval.eventId));
    assert.ok(authorizationEventIndex > envelopeEventIndex);
    const evidence = await store.readExecutionAuthorization(taskId);
    assert.deepEqual(evidence, {
      schemaVersion: 1,
      executionId: authorization.data.executionId,
      planningReportReadyEventId: ready.eventId,
      planApprovedEventId: approval.eventId,
      executionAuthorizedEventId: authorization.eventId,
      taskState: "ready_for_execution",
      taskId,
      executionMapPath: canonicalMapPath,
      planArtifactPath,
      approvedBy: "user",
    });
    assert.match(evidence.executionId, /^execution_/);

    await store.writeExecutionMap(taskId, {
      version: 1,
      taskId,
      packages: [{
        packageId: "review-package",
        role: "reviewer",
        dependencies: [],
        expectedWriteScopes: [],
        checkoutPath: root,
        allowedCommands: [],
        state: "planned",
        review: { status: "pending" },
        verification: { status: "pending" },
        commitCheckpoints: [],
      }],
      integrationOrder: [],
      updatedAt: "2026-07-09T01:00:00.000Z",
    });
    assert.deepEqual(await store.readExecutionAuthorization(taskId), evidence);
    assert.equal(await store.hasExecutionAuthorization(taskId), true);

    for (const state of ["executing", "completed"]) {
      await store.writeTask({ ...(await store.readTask(taskId)), state });
      await store.recordExecutionAuthorized(taskId, {
        eventId: "evt.execution.authorized",
        planningReportReadyEventId: ready.eventId,
        planApprovedEventId: approval.eventId,
        planArtifactPath,
      });
      assert.equal((await store.readTask(taskId)).state, state);
      assert.deepEqual(await store.readExecutionAuthorization(taskId), evidence);
    }
    await store.writeTask({ ...(await store.readTask(taskId)), state: "awaiting_user_approval" });
    await store.recordExecutionAuthorized(taskId, {
      eventId: "evt.execution.authorized",
      planningReportReadyEventId: ready.eventId,
      planApprovedEventId: approval.eventId,
      planArtifactPath,
    });
    assert.equal((await store.readTask(taskId)).state, "ready_for_execution");
  });
});

test("store reconstruction rejects malformed authorization chains and envelopes", async () => {
  const cases = [
    {
      name: "authorization state",
      mutate: async ({ store, taskId, events, authorization }) => {
        await store.appendTaskEvent(taskId, {
          eventId: "evt.execution.poisoned-state",
          type: "execution.authorized",
          state: "failed",
          data: { ...authorization.data },
        });
      },
    },
    {
      name: "authorization constraints",
      mutate: async ({ store, taskId, authorization }) => {
        await store.appendTaskEvent(taskId, {
          eventId: "evt.execution.poisoned-constraints",
          type: "execution.authorized",
          state: "ready_for_execution",
          data: { ...authorization.data, constraints: [42] },
        });
      },
    },
    {
      name: "predecessor task identity",
      mutate: async ({ store, taskId, events }) => {
        events[0].taskId = "TASK-OTHER";
        await writeFile(store.pathsForTask(taskId).eventsJsonl, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");
      },
    },
    {
      name: "durable envelope identity",
      mutate: async ({ store, taskId, authorization }) => {
        const path = join(store.pathsForTask(taskId).executionEnvelopesDir, `${authorization.data.executionId}.json`);
        const envelope = JSON.parse(await readFile(path, "utf8"));
        await writeFile(path, `${JSON.stringify({ ...envelope, planArtifactPath: "docs/plans/tampered.md" }, null, 2)}\n`, "utf8");
      },
    },
  ];

  for (const testCase of cases) {
    await withTempStore(async (root) => {
      const store = createDelegationStore({ root, now: fixedNow });
      const taskId = `TASK-AUTH-MALFORMED-${testCase.name.replaceAll(" ", "-").toUpperCase()}`;
      const planArtifactPath = "docs/plans/delegation/approved-plan.md";
      const ready = await publishReadyEvent(store, taskId, planArtifactPath);
      const approval = await store.recordPlanApproved(taskId, { eventId: "evt.plan.approved", planningReportReadyEventId: ready.eventId, planArtifactPath, approvedBy: "user" });
      const authorization = await store.recordExecutionAuthorized(taskId, { eventId: "evt.execution.authorized", planningReportReadyEventId: ready.eventId, planApprovedEventId: approval.eventId, planArtifactPath });
      const events = (await readFile(store.pathsForTask(taskId).eventsJsonl, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
      await testCase.mutate({ store, taskId, events, authorization });
      assert.equal(await store.readExecutionAuthorization(taskId), undefined, testCase.name);
    });
  }
});

test("store owner transition authorizes only the confirmed latest planning predecessor", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    const taskId = "TASK-OWNER-AUTH";
    const firstReady = await publishReadyEvent(store, taskId, "docs/plans/first.md");
    const stalePreview = await store.readExecutionApprovalRequest(taskId);
    assert.deepEqual(stalePreview, {
      taskId,
      planningReportReadyEventId: firstReady.eventId,
      planArtifactPath: "docs/plans/first.md",
      executionMapPath: store.pathsForTask(taskId).executionMapJson,
    });

    const latestReady = await publishReadyEvent(store, taskId, "docs/plans/latest.md");
    const eventsBeforeStaleConfirmation = await readFile(store.pathsForTask(taskId).eventsJsonl, "utf8");
    await assert.rejects(
      () => store.approveAndAuthorizeExecution(taskId, stalePreview),
      /execution approval preview is stale/,
    );
    assert.equal(await readFile(store.pathsForTask(taskId).eventsJsonl, "utf8"), eventsBeforeStaleConfirmation);
    assert.equal(await store.readExecutionAuthorization(taskId), undefined);

    const preview = await store.readExecutionApprovalRequest(taskId);
    assert.equal(preview.planningReportReadyEventId, latestReady.eventId);
    const [first, retry] = await Promise.all([
      store.approveAndAuthorizeExecution(taskId, preview),
      store.approveAndAuthorizeExecution(taskId, preview),
    ]);
    assert.equal(retry.approval.eventId, first.approval.eventId);
    assert.equal(retry.authorization.eventId, first.authorization.eventId);
    assert.equal(first.evidence.approvedBy, "user");
    assert.equal(first.evidence.planArtifactPath, "docs/plans/latest.md");
    assert.equal((await store.readTask(taskId)).state, "ready_for_execution");

    const events = (await readFile(store.pathsForTask(taskId).eventsJsonl, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(events.filter((event) => event.type === "plan.approved" && event.data?.planningReportReadyEventId === latestReady.eventId).length, 1);
    assert.equal(events.filter((event) => event.type === "execution.authorized" && event.data?.planApprovedEventId === first.approval.eventId).length, 1);

    await publishReadyEvent(store, taskId, "docs/plans/after-authorization.md");
    assert.equal(await store.readExecutionAuthorization(taskId), undefined);
  });
});

test("store owner transition reconciles authorization committed before task projection failure", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    const taskId = "TASK-OWNER-AUTH-RECOVERY";
    await publishReadyEvent(store, taskId, "docs/plans/recovery.md");
    const preview = await store.readExecutionApprovalRequest(taskId);
    const originalWriteTask = store.writeTask.bind(store);
    store.writeTask = async (task) => {
      if (task.state === "ready_for_execution") throw new Error("injected task projection failure");
      return originalWriteTask(task);
    };

    const result = await store.approveAndAuthorizeExecution(taskId, preview);

    assert.equal(result.commitState, "committed_reconciled");
    assert.match(result.recoveryReason, /injected task projection failure/);
    assert.equal(result.evidence.approvedBy, "user");
    assert.equal((await store.readTask(taskId)).state, "created");
    assert.equal((await store.readExecutionAuthorization(taskId)).executionAuthorizedEventId, result.authorization.eventId);
  });
});

test("store owner transition marks post-commit recovery failure indeterminate", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    const taskId = "TASK-OWNER-AUTH-INDETERMINATE";
    await publishReadyEvent(store, taskId, "docs/plans/indeterminate.md");
    const preview = await store.readExecutionApprovalRequest(taskId);
    const originalWriteTask = store.writeTask.bind(store);
    store.writeTask = async (task) => {
      if (task.state === "ready_for_execution") throw new Error("injected task projection failure");
      return originalWriteTask(task);
    };
    store.readExecutionAuthorization = async () => { throw new Error("injected reconciliation read failure"); };

    await assert.rejects(
      () => store.approveAndAuthorizeExecution(taskId, preview),
      (error) => error.commitState === "indeterminate" && /may have committed/.test(error.message),
    );
    const events = (await readFile(store.pathsForTask(taskId).eventsJsonl, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(events.some((event) => event.type === "execution.authorized"), true);
  });
});

test("store owner transition marks missing post-commit reconciliation evidence indeterminate", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    const taskId = "TASK-OWNER-AUTH-INDETERMINATE-MISSING";
    await publishReadyEvent(store, taskId, "docs/plans/indeterminate-missing.md");
    const preview = await store.readExecutionApprovalRequest(taskId);
    const originalWriteTask = store.writeTask.bind(store);
    store.writeTask = async (task) => {
      if (task.state === "ready_for_execution") throw new Error("injected task projection failure");
      return originalWriteTask(task);
    };
    store.readExecutionAuthorization = async () => undefined;

    await assert.rejects(
      () => store.approveAndAuthorizeExecution(taskId, preview),
      (error) => error.commitState === "indeterminate" && /may have committed/.test(error.message),
    );
    const events = (await readFile(store.pathsForTask(taskId).eventsJsonl, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(events.some((event) => event.type === "execution.authorized"), true);
  });
});

test("store rebuilds active leases from lease events and fails closed on stale or corrupt views", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    await store.initTask({ taskId: "TASK-LEASE-STORE" });

    await store.appendLeaseEvent("TASK-LEASE-STORE", {
      eventId: "lease_evt_001",
      lease: activeWorkerLease({ state: "issued" }),
    });
    await store.appendLeaseEvent("TASK-LEASE-STORE", {
      eventId: "lease_evt_002",
      lease: activeWorkerLease({ state: "active" }),
    });
    await store.appendLeaseEvent("TASK-LEASE-STORE", {
      eventId: "lease_evt_003",
      lease: activeWorkerLease({ leaseId: "lease-reviewer", agentId: "reviewer-1", role: "reviewer", state: "issued", actions: ["read", "review"], writeScopes: [], allowedCommands: [] }),
    });
    await store.appendLeaseEvent("TASK-LEASE-STORE", {
      eventId: "lease_evt_004",
      lease: activeWorkerLease({ leaseId: "lease-reviewer", agentId: "reviewer-1", role: "reviewer", state: "active", actions: ["read", "review"], writeScopes: [], allowedCommands: [] }),
    });
    await store.transitionLease("TASK-LEASE-STORE", "lease-reviewer", "revoked", { eventId: "lease_evt_005" });

    const rebuilt = await store.rebuildActiveLeaseView("TASK-LEASE-STORE");
    assert.equal(rebuilt.rebuiltFrom.eventCount, 5);
    assert.equal(rebuilt.rebuiltFrom.lastEventId, "lease_evt_005");
    assert.deepEqual(rebuilt.activeLeaseIdsByAgent, { "worker-1": ["lease-worker"] });
    assert.deepEqual((await store.readActiveLeaseView("TASK-LEASE-STORE")).activeLeaseIdsByAgent, { "worker-1": ["lease-worker"] });

    const paths = store.pathsForTask("TASK-LEASE-STORE");
    const corruptView = structuredClone(rebuilt);
    corruptView.activeLeaseIdsByAgent = { "reviewer-1": ["lease-reviewer"] };
    await writeFile(paths.activeLeasesJson, `${JSON.stringify(corruptView, null, 2)}\n`, "utf8");
    await assert.rejects(() => store.readActiveLeaseView("TASK-LEASE-STORE"), /active lease id is not active/);

    await store.rebuildActiveLeaseView("TASK-LEASE-STORE");
    await store.appendLeaseEvent("TASK-LEASE-STORE", {
      eventId: "lease_evt_006",
      lease: activeWorkerLease({ leaseId: "lease-worker-2", agentId: "worker-2", state: "issued" }),
    });
    await assert.rejects(() => store.readActiveLeaseView("TASK-LEASE-STORE"), /stale active lease view/);
  });
});

test("store activates deterministic leases idempotently and ends assignment authority", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    const lease = activeWorkerLease({
      taskId: "TASK-LEASE-LIFECYCLE",
      state: "issued",
      assignmentId: "worker-1",
      attemptId: "attempt-current",
    });

    const first = await store.ensureLeaseActive("TASK-LEASE-LIFECYCLE", lease, "test assignment starting");
    const second = await store.ensureLeaseActive("TASK-LEASE-LIFECYCLE", lease, "duplicate apply");
    assert.equal(first.changed, true);
    assert.equal(second.changed, false);
    await assert.rejects(
      () => store.ensureLeaseActive("TASK-LEASE-LIFECYCLE", { ...lease, attemptId: "attempt-replacement" }, "replacement must use new lease id"),
      /lease authority conflict/,
    );
    assert.equal((await store.readLeaseEvents("TASK-LEASE-LIFECYCLE")).length, 2);
    assert.deepEqual((await store.readActiveLeaseView("TASK-LEASE-LIFECYCLE")).activeLeaseIdsByAgent, { "worker-1": ["lease-worker"] });
    await assert.rejects(
      () => store.transitionLease("TASK-LEASE-LIFECYCLE", lease.leaseId, "active", { eventId: "lease-active-not-an-identical-observation" }),
      /non-monotonic lease transition/i,
    );
    await assert.rejects(
      () => store.appendLeaseEvent("TASK-LEASE-LIFECYCLE", {
        eventId: "lease-cannot-begin-active",
        lease: { ...lease, leaseId: "lease-unissued", state: "active" },
      }),
      /must begin in issued state/i,
    );
    assert.equal((await store.readLeaseEvents("TASK-LEASE-LIFECYCLE")).length, 2);

    const ended = await store.endActiveAssignmentLeases("TASK-LEASE-LIFECYCLE", "worker-1", "exhausted", "terminal result");
    const duplicateEnd = await store.endActiveAssignmentLeases("TASK-LEASE-LIFECYCLE", "worker-1", "exhausted", "terminal retry");
    assert.deepEqual(ended.leaseIds, ["lease-worker"]);
    assert.equal(duplicateEnd.changed, false);
    const exhaustedEvents = await store.readLeaseEvents("TASK-LEASE-LIFECYCLE");
    assert.equal(exhaustedEvents.length, 3);
    assert.deepEqual((await store.readActiveLeaseView("TASK-LEASE-LIFECYCLE")).activeLeaseIdsByAgent, {});

    await assert.rejects(
      () => store.ensureLeaseActive("TASK-LEASE-LIFECYCLE", lease, "terminal lease id cannot reactivate"),
      /terminal lease.*cannot transition|non-monotonic lease transition/i,
    );
    await assert.rejects(
      () => store.transitionLease("TASK-LEASE-LIFECYCLE", lease.leaseId, "issued", { eventId: "lease-terminal-to-issued" }),
      /terminal lease.*cannot transition|non-monotonic lease transition/i,
    );
    await assert.rejects(
      () => store.transitionLease("TASK-LEASE-LIFECYCLE", lease.leaseId, "active", { eventId: "lease-terminal-to-active" }),
      /terminal lease.*cannot transition|non-monotonic lease transition/i,
    );
    assert.deepEqual(await store.readLeaseEvents("TASK-LEASE-LIFECYCLE"), exhaustedEvents);

    for (const terminalState of ["expired", "revoked"]) {
      const terminalLease = {
        ...lease,
        leaseId: `lease-worker-${terminalState}`,
        attemptId: `attempt-${terminalState}`,
      };
      await store.ensureLeaseActive("TASK-LEASE-LIFECYCLE", terminalLease, `${terminalState} lease starting`);
      await store.transitionLease("TASK-LEASE-LIFECYCLE", terminalLease.leaseId, terminalState, {
        eventId: `lease-worker-${terminalState}-terminal`,
      });
      const beforeRejectedReactivation = await store.readLeaseEvents("TASK-LEASE-LIFECYCLE");
      await assert.rejects(
        () => store.ensureLeaseActive("TASK-LEASE-LIFECYCLE", terminalLease, `${terminalState} lease cannot reactivate`),
        /terminal lease.*cannot transition|non-monotonic lease transition/i,
      );
      assert.deepEqual(await store.readLeaseEvents("TASK-LEASE-LIFECYCLE"), beforeRejectedReactivation);
    }

    const replacement = await store.ensureLeaseActive("TASK-LEASE-LIFECYCLE", {
      ...lease,
      leaseId: "lease-worker-replacement",
      attemptId: "attempt-replacement",
    }, "new attempt uses a new lease id");
    assert.equal(replacement.lease.state, "active");
    assert.equal(replacement.changed, true);
    assert.deepEqual(replacement.view.activeLeaseIdsByAgent, { "worker-1": ["lease-worker-replacement"] });
  });
});

test("concurrent first initialization cannot truncate accepted terminal lease history", async () => {
  await withTempStore(async (root) => {
    const taskId = "TASK-LEASE-FIRST-INIT-RACE";
    const store = createDelegationStore({ root, now: fixedNow });
    const leasesPath = store.pathsForTask(taskId).leasesJsonl;
    const lease = activeWorkerLease({ taskId, state: "issued" });
    const acceptedHistory = [
      { eventId: "lease-race-issued", timestamp: fixedNow(), taskId, leaseId: lease.leaseId, state: "issued", lease },
      { eventId: "lease-race-active", timestamp: fixedNow(), taskId, leaseId: lease.leaseId, state: "active", lease: { ...lease, state: "active" } },
      { eventId: "lease-race-revoked", timestamp: fixedNow(), taskId, leaseId: lease.leaseId, state: "revoked", lease: { ...lease, state: "revoked" } },
    ];
    const acceptedBytes = `${acceptedHistory.map((event) => JSON.stringify(event)).join("\n")}\n`;
    const childScript = String.raw`
      import fs from "node:fs";
      import { syncBuiltinESMExports } from "node:module";
      const [moduleUrl, root, taskId, leasesPath] = process.argv.slice(1);
      const originalAccess = fs.promises.access.bind(fs.promises);
      const originalOpen = fs.promises.open.bind(fs.promises);
      let gated = false;
      async function gate(label) {
        if (gated) return;
        gated = true;
        process.stdout.write("GATE:" + label + "\\n");
        await new Promise((resolve) => process.stdin.once("data", resolve));
      }
      fs.promises.access = async (path, ...args) => {
        if (String(path) === leasesPath && !gated) {
          try {
            return await originalAccess(path, ...args);
          } catch (error) {
            await gate("access");
            throw error;
          }
        }
        return originalAccess(path, ...args);
      };
      fs.promises.open = async (path, flags, ...args) => {
        if (String(path) === leasesPath && flags === "wx" && !gated) {
          await gate("open");
        }
        return originalOpen(path, flags, ...args);
      };
      syncBuiltinESMExports();
      const { createDelegationStore } = await import(moduleUrl);
      const store = createDelegationStore({ root, now: () => "2026-07-09T00:00:00.000Z" });
      await store.initTask({ taskId });
      process.stdout.write("DONE\\n");
    `;
    const child = spawn(process.execPath, [
      "--input-type=module",
      "--eval",
      childScript,
      new URL("../dist/index.js", import.meta.url).href,
      root,
      taskId,
      leasesPath,
    ], { stdio: ["pipe", "pipe", "pipe"] });
    const childExit = new Promise((resolve) => child.once("exit", resolve));
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`initializer child did not reach file-creation gate; stdout=${stdout}; stderr=${stderr}`)), 10_000);
      const observe = (chunk) => {
        if (!String(chunk).includes("GATE:")) return;
        clearTimeout(timeout);
        child.stdout.off("data", observe);
        resolve();
      };
      child.stdout.on("data", observe);
      child.once("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`initializer child exited before gate with code ${code}; stdout=${stdout}; stderr=${stderr}`));
      });
    });

    await writeFile(leasesPath, acceptedBytes, "utf8");
    child.stdin.end("continue\n");
    const exitCode = await childExit;
    assert.equal(exitCode, 0, `stdout=${stdout}; stderr=${stderr}`);
    assert.equal(await readFile(leasesPath, "utf8"), acceptedBytes);
    await assert.rejects(
      () => store.ensureLeaseActive(taskId, lease, "terminal history must survive initialization"),
      /terminal lease.*cannot transition/i,
    );
  });
});

test("store rejects persisted non-monotonic lease history without replacing the last valid active view", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    const taskId = "TASK-NON-MONOTONIC-LEASE-LOG";
    const lease = activeWorkerLease({ taskId, state: "issued" });
    await store.ensureLeaseActive(taskId, lease, "lease starting");
    await store.transitionLease(taskId, lease.leaseId, "revoked", { eventId: "lease-worker-revoked" });
    const validView = await store.rebuildActiveLeaseView(taskId);
    const validViewBytes = await readFile(store.pathsForTask(taskId).activeLeasesJson, "utf8");
    const terminal = (await store.readLeaseEvents(taskId)).at(-1);
    const forgedReactivation = {
      ...terminal,
      eventId: "lease-worker-forged-reactivation",
      state: "active",
      lease: { ...terminal.lease, state: "active" },
    };
    await writeFile(
      store.pathsForTask(taskId).leasesJsonl,
      `${JSON.stringify(forgedReactivation)}\n`,
      { encoding: "utf8", flag: "a" },
    );

    await assert.rejects(() => store.readLeaseEvents(taskId), /terminal lease.*cannot transition/i);
    await assert.rejects(() => store.rebuildActiveLeaseView(taskId), /terminal lease.*cannot transition/i);
    assert.deepEqual(validView.activeLeaseIdsByAgent, {});
    assert.equal(await readFile(store.pathsForTask(taskId).activeLeasesJson, "utf8"), validViewBytes);
  });
});

test("store replay rejects repeated physical lease event ids and preserves the last valid active view", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    const taskId = "TASK-DUPLICATE-LEASE-EVENT-IDS";
    const firstLease = activeWorkerLease({ taskId, state: "issued" });
    await store.ensureLeaseActive(taskId, firstLease, "first lease starting");
    const validView = await store.rebuildActiveLeaseView(taskId);
    const validViewBytes = await readFile(store.pathsForTask(taskId).activeLeasesJson, "utf8");
    const firstEvents = await store.readLeaseEvents(taskId);
    const secondLease = activeWorkerLease({
      taskId,
      leaseId: "lease-worker-second",
      agentId: "worker-2",
      state: "issued",
    });
    const conflictingDuplicateIds = [
      {
        ...firstEvents[0],
        leaseId: secondLease.leaseId,
        state: "issued",
        lease: secondLease,
      },
      {
        ...firstEvents[1],
        leaseId: secondLease.leaseId,
        state: "active",
        lease: { ...secondLease, state: "active" },
      },
    ];
    await writeFile(
      store.pathsForTask(taskId).leasesJsonl,
      `${conflictingDuplicateIds.map((event) => JSON.stringify(event)).join("\n")}\n`,
      { encoding: "utf8", flag: "a" },
    );

    await assert.rejects(() => store.readLeaseEvents(taskId), /duplicate lease event id/i);
    await assert.rejects(() => store.rebuildActiveLeaseView(taskId), /duplicate lease event id/i);
    assert.deepEqual(validView.activeLeaseIdsByAgent, { "worker-1": [firstLease.leaseId] });
    assert.equal(await readFile(store.pathsForTask(taskId).activeLeasesJson, "utf8"), validViewBytes);

    const exactTaskId = "TASK-EXACT-DUPLICATE-LEASE-EVENT-ID";
    const exactLease = activeWorkerLease({ taskId: exactTaskId, state: "issued" });
    await store.ensureLeaseActive(exactTaskId, exactLease, "exact duplicate fixture");
    const exactViewBytes = await readFile(store.pathsForTask(exactTaskId).activeLeasesJson, "utf8");
    const exactEvents = await store.readLeaseEvents(exactTaskId);
    await writeFile(
      store.pathsForTask(exactTaskId).leasesJsonl,
      `${JSON.stringify(exactEvents[1])}\n`,
      { encoding: "utf8", flag: "a" },
    );
    await assert.rejects(() => store.readLeaseEvents(exactTaskId), /duplicate lease event id/i);
    await assert.rejects(() => store.rebuildActiveLeaseView(exactTaskId), /duplicate lease event id/i);
    assert.equal(await readFile(store.pathsForTask(exactTaskId).activeLeasesJson, "utf8"), exactViewBytes);

    const retryTaskId = "TASK-ONLINE-LEASE-EVENT-RETRY";
    const retryInput = {
      eventId: "lease-event-exact-online-retry",
      timestamp: fixedNow(),
      lease: activeWorkerLease({ taskId: retryTaskId, state: "issued" }),
    };
    const first = await store.appendLeaseEvent(retryTaskId, retryInput);
    const retry = await store.appendLeaseEvent(retryTaskId, retryInput);
    assert.deepEqual(retry, first);
    assert.equal((await store.readLeaseEvents(retryTaskId)).length, 1);
  });
});

test("store rejects forged active lease views even when rebuild metadata matches", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    await store.initTask({ taskId: "TASK-FORGED-LEASE" });

    await store.appendLeaseEvent("TASK-FORGED-LEASE", {
      eventId: "lease_evt_001",
      lease: activeWorkerLease({ taskId: "TASK-FORGED-LEASE", leaseId: "lease-worker", agentId: "worker-1", state: "issued" }),
    });
    await store.appendLeaseEvent("TASK-FORGED-LEASE", {
      eventId: "lease_evt_002",
      lease: activeWorkerLease({ taskId: "TASK-FORGED-LEASE", leaseId: "lease-worker", agentId: "worker-1", state: "active" }),
    });

    const rebuilt = await store.rebuildActiveLeaseView("TASK-FORGED-LEASE");
    const paths = store.pathsForTask("TASK-FORGED-LEASE");

    const broadenedView = structuredClone(rebuilt);
    broadenedView.leasesById["lease-forged"] = activeWorkerLease({
      taskId: "TASK-FORGED-LEASE",
      leaseId: "lease-forged",
      agentId: "worker-evil",
      state: "active",
      actions: ["read", "edit", "run_allowlisted"],
      writeScopes: ["**"],
      allowedCommands: ["npm run test:delegation", "npm run build"],
    });
    broadenedView.activeLeaseIdsByAgent["worker-evil"] = ["lease-forged"];
    await writeFile(paths.activeLeasesJson, `${JSON.stringify(broadenedView, null, 2)}\n`, "utf8");
    await assert.rejects(() => store.readActiveLeaseView("TASK-FORGED-LEASE"), /active lease view does not match lease log/);

    const crossAgentView = structuredClone(rebuilt);
    crossAgentView.activeLeaseIdsByAgent = { "worker-2": ["lease-worker"] };
    await writeFile(paths.activeLeasesJson, `${JSON.stringify(crossAgentView, null, 2)}\n`, "utf8");
    await assert.rejects(() => store.readActiveLeaseView("TASK-FORGED-LEASE"), /active lease agent mismatch/);
  });
});

test("store records layout allocations and wake attempts without acknowledging alerts", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    await store.registerAgent({ taskId: "TASK-WAKE-STORE", agentId: "worker-1", role: "worker", parentAgentId: "parent-1" });

    await store.recordLayoutAllocation({
      allocationId: "layout-worker-1",
      taskId: "TASK-WAKE-STORE",
      assignmentId: "worker-1",
      role: "worker",
      preset: "default-v1",
      slot: "right-bottom",
      workspaceRef: "workspace:main",
      paneRef: "pane:worker",
      surfaceRef: "surface:worker",
      created: true,
      reused: false,
      preserveFocus: true,
      promptPath: ".freeflow/delegation/tasks/TASK-WAKE-STORE/agents/worker-1/model/task-packet.txt",
      reportPath: ".freeflow/delegation/tasks/TASK-WAKE-STORE/agents/worker-1/result.json",
      reasonCodes: ["route_worker"],
    });

    const layout = await store.readLayoutState("TASK-WAKE-STORE");
    assert.deepEqual(layout.allocations.map((allocation) => allocation.allocationId), ["layout-worker-1"]);

    const queued = await store.queueParentAlert("TASK-WAKE-STORE", {
      agentId: "worker-1",
      outcome: "attention",
      message: "worker blocked",
    });
    assert.equal(priorityForParentAlert(queued.alert), "P1");
    assert.equal(queued.alert.priority, "P1");

    for (const outcome of ["sent", "failed", "skipped"]) {
      await store.recordWakeAttempt("TASK-WAKE-STORE", {
        attemptId: `wake-${outcome}`,
        alertIds: [queued.alert.alertId],
        priority: "P1",
        parentAgentId: "parent-1",
        outcome,
        transport: "next-turn-context",
        message: `${outcome} wake evidence`,
      });
    }
    assert.deepEqual(
      (await store.readWakeAttempts("TASK-WAKE-STORE")).map((attempt) => attempt.outcome),
      ["queued", "sent", "failed", "skipped"],
    );

    const unread = await store.readParentAlerts("TASK-WAKE-STORE", { unreadOnly: true });
    assert.equal(unread.length, 1);
    assert.equal(unread[0].readAt, undefined);
    assert.equal(unread[0].alertState, "queued");
  });
});

test("parent alert priority persists P0-P3 without trusting arbitrary child text", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    await store.initTask({ taskId: "TASK-PRIORITY" });
    const p0 = await store.queueParentAlert("TASK-PRIORITY", { parentAgentId: "orchestrator", outcome: "user_attention", eventType: "user-attention", sourceEventId: "evt-p0", message: "user decision" });
    const p1 = await store.queueParentAlert("TASK-PRIORITY", { parentAgentId: "orchestrator", outcome: "attention", eventType: "agent-attention", sourceEventId: "evt-p1", message: "parent action" });
    const p2 = await store.queueParentAlert("TASK-PRIORITY", { parentAgentId: "orchestrator", outcome: "completed", eventType: "agent-result", sourceEventId: "evt-p2", message: "P0 SAFETY in arbitrary child text", data: { claimedPriority: "P0" } });
    const p3 = await store.queueParentAlert("TASK-PRIORITY", { parentAgentId: "orchestrator", outcome: "info", eventType: "agent-info", sourceEventId: "evt-p3", message: "progress" });

    assert.deepEqual([p0.alert.priority, p1.alert.priority, p2.alert.priority, p3.alert.priority], ["P0", "P1", "P2", "P3"]);
    assert.deepEqual((await store.readWakeAttempts("TASK-PRIORITY")).map((attempt) => attempt.priority), ["P0", "P1", "P2"]);
  });
});

test("reviewer findings verifier checks and completion support derive evidence-aware priority", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    await store.initTask({ taskId: "TASK-EVIDENCE-PRIORITY" });
    const cases = [
      ["review-clean", { role: "reviewer", findings: [] }, "P2"],
      ["review-nonblocking", { role: "reviewer", findings: [{ severity: "non_blocking", problem: "minor" }] }, "P2"],
      ["review-blocking", { role: "reviewer", findings: [{ severity: "blocking", problem: "must fix" }] }, "P1"],
      ["verify-pass", { role: "verifier", checks: [{ name: "test", status: "pass" }] }, "P2"],
      ["verify-fail", { role: "verifier", checks: [{ name: "test", status: "fail" }] }, "P1"],
      ["unsupported", { role: "worker", completionClaimSupported: false }, "P1"],
    ];
    for (const [eventId, data, expected] of cases) {
      const queued = await store.queueParentAlert("TASK-EVIDENCE-PRIORITY", {
        parentAgentId: "orchestrator",
        outcome: "completed",
        state: "completed",
        status: "completed",
        eventType: "agent-result",
        sourceEventId: eventId,
        message: eventId,
        data,
      });
      assert.equal(queued.alert.priority, expected, eventId);
    }
  });
});

test("stronger duplicate evidence promotes one unread alert and ack persists acked", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    await store.initTask({ taskId: "TASK-PROMOTE" });
    const first = await store.queueParentAlert("TASK-PROMOTE", {
      parentAgentId: "orchestrator",
      outcome: "completed",
      eventType: "agent-result",
      sourceEventId: "evt-promote",
      message: "review initially clean",
      data: { role: "reviewer", findings: [{ severity: "non_blocking", problem: "minor" }] },
    });
    const promoted = await store.queueParentAlert("TASK-PROMOTE", {
      parentAgentId: "orchestrator",
      outcome: "completed",
      eventType: "agent-result",
      sourceEventId: "evt-promote",
      message: "blocking finding arrived",
      data: { role: "reviewer", findings: [{ severity: "blocking", problem: "must fix" }] },
    });

    assert.equal(promoted.queued, false);
    assert.equal(promoted.alert.alertId, first.alert.alertId);
    assert.equal(promoted.alert.priority, "P1");
    const repeated = await store.queueParentAlert("TASK-PROMOTE", {
      parentAgentId: "orchestrator",
      outcome: "completed",
      eventType: "agent-result",
      sourceEventId: "evt-promote",
      message: "same blocking evidence repeated",
      data: { role: "reviewer", findings: [{ severity: "blocking", problem: "must fix" }] },
    });
    assert.equal((await store.readParentAlerts("TASK-PROMOTE", { unreadOnly: true })).length, 1);
    assert.deepEqual(
      (await store.readWakeAttempts("TASK-PROMOTE")).filter((attempt) => attempt.outcome === "queued").map((attempt) => attempt.priority),
      ["P2", "P1"],
    );
    assert.equal(repeated.alert.readAt, undefined);
    assert.equal(repeated.alert.alertState, "queued");

    const acked = await store.markParentAlertsRead("TASK-PROMOTE", [first.alert.alertId]);
    assert.equal(acked[0].alertState, "acked");
    assert.ok(acked[0].readAt);
    assert.equal((await store.readParentAlerts("TASK-PROMOTE", { unreadOnly: true })).length, 0);
    assert.equal((await store.readParentAlerts("TASK-PROMOTE"))[0].alertState, "acked");
  });
});

test("wake attempt write failure degrades without acknowledging or dropping the queued alert", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    await store.initTask({ taskId: "TASK-WAKE-DEGRADED" });
    await rm(store.pathsForTask("TASK-WAKE-DEGRADED").wakeAttemptsJsonl, { force: true });
    await mkdir(store.pathsForTask("TASK-WAKE-DEGRADED").wakeAttemptsJsonl);

    const queued = await store.queueParentAlert("TASK-WAKE-DEGRADED", { parentAgentId: "orchestrator", outcome: "attention", message: "wake evidence path broken" });
    assert.equal(queued.queued, true);
    assert.match(queued.wakeAttemptError, /EISDIR|illegal operation on a directory/i);
    const unread = await store.readParentAlerts("TASK-WAKE-DEGRADED", { unreadOnly: true });
    assert.equal(unread.length, 1);
    assert.equal(unread[0].alertState, "queued");
    assert.equal(unread[0].readAt, undefined);
  });
});

test("task-local lock ignores a crashed unique owner generation without deleting it", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    await store.initTask({ taskId: "TASK-STALE-LOCK" });
    const lockPath = `${store.pathsForTask("TASK-STALE-LOCK").parentAlertsJson}.lock`;
    const staleOwnerPath = await writeLockOwner(lockPath, { pid: 2147483647, token: "dead-owner", choosing: false, ticket: 1 });

    const queued = await store.queueParentAlert("TASK-STALE-LOCK", { parentAgentId: "orchestrator", outcome: "info", sourceEventId: "evt-stale", message: "survived stale lock" });
    assert.equal(queued.queued, true);
    assert.equal((await store.readParentAlerts("TASK-STALE-LOCK", { unreadOnly: true })).length, 1);
    assert.equal(JSON.parse(await readFile(staleOwnerPath, "utf8")).token, "dead-owner");
  });
});

test("first task initialization races cannot overwrite a concurrently published alert", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root });
    for (let index = 0; index < 12; index += 1) {
      const taskId = `TASK-FIRST-INIT-${index}`;
      await Promise.all([
        store.initTask({ taskId }),
        queueAlertInChild(root, taskId, {
          parentAgentId: "orchestrator",
          outcome: "info",
          eventType: "agent-info",
          sourceEventId: `evt-first-init-${index}`,
          message: `first init ${index}`,
        }),
      ]);
      const unread = await store.readParentAlerts(taskId, { unreadOnly: true });
      assert.equal(unread.length, 1, taskId);
      assert.equal(unread[0].message, `first init ${index}`);
    }
  });
});

test("concurrent first-init actionable alerts preserve every queued wake attempt", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root });
    const taskId = "TASK-FIRST-WAKE-INIT";
    await Promise.all(Array.from({ length: 12 }, (_, index) => queueAlertInChild(root, taskId, {
      parentAgentId: "orchestrator",
      outcome: index % 2 === 0 ? "attention" : "completed",
      state: index % 2 === 0 ? "attention" : "completed",
      eventType: index % 2 === 0 ? "agent-attention" : "agent-result",
      sourceEventId: `evt-first-wake-${index}`,
      message: `first wake ${index}`,
    })));

    const unread = await store.readParentAlerts(taskId, { unreadOnly: true });
    const attempts = (await store.readWakeAttempts(taskId)).filter((attempt) => attempt.outcome === "queued");
    assert.equal(unread.length, 12);
    assert.equal(attempts.length, 12);
    assert.equal(new Set(attempts.flatMap((attempt) => attempt.alertIds)).size, 12);
    assert.deepEqual(attempts.map((attempt) => attempt.priority).sort(), ["P1", "P1", "P1", "P1", "P1", "P1", "P2", "P2", "P2", "P2", "P2", "P2"]);
  });
});

test("multi-process stale-owner replacement race never steals the live generation", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    await store.initTask({ taskId: "TASK-OWNER-RACE" });
    const lockPath = `${store.pathsForTask("TASK-OWNER-RACE").parentAlertsJson}.lock`;
    const staleOwnerPath = await writeLockOwner(lockPath, { pid: 2147483647, token: "stale-generation", choosing: false, ticket: 1 });
    const liveOwnerPath = await writeLockOwner(lockPath, { pid: process.pid, token: "live-replacement", choosing: false, ticket: 1 });
    const waiters = Array.from({ length: 8 }, (_, index) => queueAlertInChild(root, "TASK-OWNER-RACE", {
      parentAgentId: "orchestrator",
      outcome: "info",
      eventType: "agent-info",
      sourceEventId: `evt-owner-race-${index}`,
      message: `owner race ${index}`,
    }));

    await sleep(100);
    assert.equal(JSON.parse(await readFile(liveOwnerPath, "utf8")).token, "live-replacement");
    assert.equal(JSON.parse(await readFile(staleOwnerPath, "utf8")).token, "stale-generation");
    assert.equal((await store.readParentAlerts("TASK-OWNER-RACE", { unreadOnly: true })).length, 0);
    await rm(liveOwnerPath);
    await Promise.all(waiters);
    assert.equal((await store.readParentAlerts("TASK-OWNER-RACE", { unreadOnly: true })).length, 8);
    assert.equal(JSON.parse(await readFile(staleOwnerPath, "utf8")).token, "stale-generation");
  });
});

test("closed-parent escalation coalesces distinct source alerts per proof epoch", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    await store.registerAgent({ taskId: "TASK-ESCALATION-DEDUPE", agentId: "grandparent-1", role: "execution-parent", profile: "execution-parent", state: "running", parentAgentId: "orchestrator" });
    await store.registerAgent({ taskId: "TASK-ESCALATION-DEDUPE", agentId: "parent-1", role: "execution-parent", profile: "execution-parent", state: "closed", parentAgentId: "grandparent-1" });

    const first = await store.queueParentAlert("TASK-ESCALATION-DEDUPE", { agentId: "worker-1", parentAgentId: "parent-1", outcome: "completed", eventType: "agent-result", sourceEventId: "evt-source-1", message: "first source" });
    const second = await store.queueParentAlert("TASK-ESCALATION-DEDUPE", { agentId: "worker-2", parentAgentId: "parent-1", outcome: "attention", eventType: "agent-attention", sourceEventId: "evt-source-2", message: "second source" });

    const unread = await store.readParentAlerts("TASK-ESCALATION-DEDUPE", { unreadOnly: true });
    const escalations = unread.filter((alert) => alert.eventType === "parent-unavailable-escalation");
    assert.equal(escalations.length, 1);
    assert.equal(escalations[0].priority, "P0");
    assert.equal(escalations[0].parentAgentId, "grandparent-1");
    assert.deepEqual(escalations[0].data.sourceAlerts.map((source) => source.alertId).sort(), [first.alert.alertId, second.alert.alertId].sort());
    assert.equal(escalations[0].data.sourceAlerts.length, 2);
    assert.equal(escalations[0].escalationProof.proofEpoch, fixedNow());
    assert.ok(unread.find((alert) => alert.alertId === first.alert.alertId && alert.readAt === undefined));
    assert.ok(unread.find((alert) => alert.alertId === second.alert.alertId && alert.readAt === undefined));
    const escalationWakeAttempts = (await store.readWakeAttempts("TASK-ESCALATION-DEDUPE"))
      .filter((attempt) => attempt.priority === "P0" && attempt.alertIds.includes(escalations[0].alertId));
    assert.equal(escalationWakeAttempts.length, 1);
  });
});

test("concurrent child processes preserve distinct alerts and coalesce one duplicate", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root });
    await store.initTask({ taskId: "TASK-CONCURRENT-DISTINCT" });
    await Promise.all(Array.from({ length: 10 }, (_, index) => queueAlertInChild(root, "TASK-CONCURRENT-DISTINCT", {
      parentAgentId: "orchestrator",
      outcome: "info",
      eventType: "agent-info",
      sourceEventId: `evt-distinct-${index}`,
      message: `distinct ${index}`,
    })));
    assert.equal((await store.readParentAlerts("TASK-CONCURRENT-DISTINCT", { unreadOnly: true })).length, 10);

    await store.initTask({ taskId: "TASK-CONCURRENT-DUPLICATE" });
    await Promise.all(Array.from({ length: 10 }, () => queueAlertInChild(root, "TASK-CONCURRENT-DUPLICATE", {
      parentAgentId: "orchestrator",
      outcome: "attention",
      eventType: "agent-attention",
      sourceEventId: "evt-duplicate",
      message: "same event",
    })));
    const duplicateAlerts = await store.readParentAlerts("TASK-CONCURRENT-DUPLICATE", { unreadOnly: true });
    assert.equal(duplicateAlerts.length, 1);
    assert.equal((await store.readWakeAttempts("TASK-CONCURRENT-DUPLICATE")).filter((attempt) => attempt.outcome === "queued").length, 1);
  });
});

async function writeLockOwner(lockPath, overrides) {
  const ownersDir = `${lockPath}.owners`;
  await mkdir(ownersDir, { recursive: true });
  const record = {
    pid: overrides.pid,
    token: overrides.token,
    createdAt: overrides.createdAt ?? "2026-07-10T00:00:00.000Z",
    choosing: overrides.choosing,
    ticket: overrides.ticket,
  };
  const path = join(ownersDir, `${record.token}.json`);
  await writeFile(path, `${JSON.stringify(record)}\n`, "utf8");
  return path;
}

async function queueAlertInChild(root, taskId, input) {
  const moduleUrl = new URL("../dist/index.js", import.meta.url).href;
  const source = `import { createDelegationStore } from ${JSON.stringify(moduleUrl)};\nconst [root, taskId, raw] = process.argv.slice(1);\nawait createDelegationStore({ root }).queueParentAlert(taskId, JSON.parse(raw));`;
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, ["--input-type=module", "--eval", source, root, taskId, JSON.stringify(input)], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`queue child exited ${code}: ${stderr}`));
    });
  });
}
