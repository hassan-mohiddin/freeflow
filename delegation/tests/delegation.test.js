import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  DELEGATION_TOOL_NAMES,
  PARENT_CONTROL_TOOL_NAMES,
  CHILD_LIFECYCLE_TOOL_NAMES,
  buildWorktreeBranchName,
  commitCheckpointApprovalFromDecision,
  compileTaskPacket,
  createDelegationStore,
  createWorktreeMetadata,
  escapeProtocolField,
  evaluatePolicy,
  formatProtocolRow,
  getProfileDefinition,
  isDelegationTool,
  listProfileDefinitions,
  parseModelText,
  parseProtocolRow,
  resolveProfileForRole,
  resolveUnderRoot,
  taskPaths,
  validateCommitCheckpoint,
  validateIntegrationOrder,
  validateSafeId,
  validateWorkPackageReady,
} from "../dist/index.js";

async function withTempStore(fn) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-delegation-store-"));
  try {
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

const fixedNow = () => "2026-07-02T00:00:00.000Z";

function packageMetadata(overrides = {}) {
  const packageId = overrides.packageId ?? "P5A";
  return {
    packageId,
    role: "worker",
    agentId: `${packageId}-worker`,
    dependencies: [],
    expectedWriteScopes: ["/repo/src"],
    checkoutPath: "/repo-worktrees/p5a",
    allowedCommands: ["npm run build"],
    state: "completed",
    review: { required: true, status: "passed", evidencePaths: [".freeflow/delegation/reviews/p5a.json"] },
    verification: { required: true, status: "passed", outputIds: ["ffout_checks"] },
    commitCheckpoints: [
      {
        checkpointId: "P5A-checkpoint",
        packageId,
        planned: true,
        status: "planned",
        intendedFiles: ["delegation/src/types.ts", "delegation/src/store.ts"],
        reviewRequired: true,
        verificationRequired: true,
      },
    ],
    ...overrides,
  };
}

test("safe ids reject empty, traversal, separators, absolute paths, and unsafe names", () => {
  for (const value of ["", " ", ".", "..", "../task", "task/child", "task\\child", "/abs", "task name", "task:1", ".hidden", "hidden.", "task|pipe", "task..id"]) {
    assert.throws(() => validateSafeId(value, "task id"), /task id/);
  }

  assert.equal(validateSafeId("TASK-123", "task id"), "TASK-123");
  assert.equal(validateSafeId("worker_1.alpha", "agent id"), "worker_1.alpha");
  assert.throws(() => resolveUnderRoot("/tmp/freeflow-root", "../escape"), /path segment/);
  assert.throws(() => resolveUnderRoot("/tmp/freeflow-root", "/tmp/freeflow-root/file"), /absolute/);
});

test("store creates deterministic repo-local task and agent paths", async () => {
  await withTempStore(async (repoRoot) => {
    const store = createDelegationStore({ repoRoot, now: fixedNow });

    await store.initTask({ taskId: "TASK-1", goal: "Implement P1" });
    const manifest = await store.registerAgent({ taskId: "TASK-1", agentId: "worker-1", role: "worker", cwd: "/repo" });

    assert.equal(store.root, join(repoRoot, ".freeflow", "delegation"));
    const paths = store.pathsForAgent("TASK-1", "worker-1");
    const task = await readJson(taskPaths(store.root, "TASK-1").taskJson);
    const registry = await store.readRegistry("TASK-1");
    const status = await readJson(paths.statusJson);

    assert.equal(task.taskId, "TASK-1");
    assert.equal(task.goal, "Implement P1");
    assert.equal(manifest.resultRawPath, paths.resultRaw);
    assert.equal(registry.agents.length, 1);
    assert.equal(registry.agents[0].agentId, "worker-1");
    assert.equal(status.state, "created");
  });
});

test("store appends task and agent events as JSONL", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    await store.initTask({ taskId: "TASK-2" });
    await store.registerAgent({ taskId: "TASK-2", agentId: "worker-2", role: "worker" });

    await store.appendTaskEvent("TASK-2", { type: "task-created", message: "ready" });
    await store.appendAgentEvent("TASK-2", "worker-2", { type: "agent-running", state: "running", data: { pane: "p7" } });

    const taskEvents = (await readFile(store.pathsForTask("TASK-2").eventsJsonl, "utf8")).trim().split("\n").map(JSON.parse);
    const agentEvents = (await readFile(store.pathsForAgent("TASK-2", "worker-2").eventsJsonl, "utf8")).trim().split("\n").map(JSON.parse);

    assert.equal(taskEvents.length, 1);
    assert.equal(taskEvents[0].scope, "task");
    assert.equal(taskEvents[0].message, "ready");
    assert.ok(taskEvents[0].eventId);
    assert.equal(agentEvents.length, 1);
    assert.equal(agentEvents[0].scope, "agent");
    assert.equal(agentEvents[0].state, "running");
    assert.ok(agentEvents[0].eventId);
    assert.deepEqual(agentEvents[0].data, { pane: "p7" });
  });
});

test("store queues sparse parent alerts and coalesces duplicate unread lifecycle events", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    await store.registerAgent({ taskId: "TASK-ALERT", agentId: "worker-1", role: "worker", parentAgentId: "parent-1" });

    const first = await store.queueParentAlert("TASK-ALERT", { agentId: "worker-1", outcome: "completed", state: "completed", eventType: "agent-result", sourceEventId: "evt-1", message: "done" });
    const duplicate = await store.queueParentAlert("TASK-ALERT", { agentId: "worker-1", outcome: "completed", state: "completed", eventType: "agent-result", sourceEventId: "evt-1", message: "done again" });
    const second = await store.queueParentAlert("TASK-ALERT", { agentId: "worker-1", outcome: "failed", state: "failed", eventType: "agent-result", sourceEventId: "evt-2", message: "failed" });

    assert.equal(first.queued, true);
    assert.equal(duplicate.queued, false);
    assert.equal(second.queued, true);
    const unread = await store.readParentAlerts("TASK-ALERT", { unreadOnly: true });
    assert.equal(unread.length, 2);
    assert.equal(unread[0].parentAgentId, "parent-1");
    assert.equal(unread[0].message, "done again");
    assert.deepEqual(unread.map((alert) => alert.outcome), ["completed", "failed"]);

    await store.markParentAlertsRead("TASK-ALERT", [unread[0].alertId]);
    const remaining = await store.readParentAlerts("TASK-ALERT", { unreadOnly: true });
    assert.deepEqual(remaining.map((alert) => alert.outcome), ["failed"]);
  });
});

test("store tracks consecutive bounded wait attempts per scope", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    await store.initTask({ taskId: "TASK-WAIT" });

    assert.equal((await store.incrementWaitScope("TASK-WAIT", "agent:TASK-WAIT:worker-1")).consecutiveWaits, 1);
    assert.equal((await store.incrementWaitScope("TASK-WAIT", "agent:TASK-WAIT:worker-1")).consecutiveWaits, 2);
    assert.equal((await store.incrementWaitScope("TASK-WAIT", "agent:TASK-WAIT:worker-1")).consecutiveWaits, 3);
    assert.equal((await store.incrementWaitScope("TASK-WAIT", "agent:TASK-WAIT:worker-1")).consecutiveWaits, 4);

    await store.resetWaitScope("TASK-WAIT", "agent:TASK-WAIT:worker-1", "completed");
    const waitState = await store.readWaitState("TASK-WAIT");
    assert.equal(waitState.scopes[0].consecutiveWaits, 0);
    assert.equal(waitState.scopes[0].lastStatus, "completed");
  });
});

test("store persists execution map work package metadata and blocks duplicate writer checkouts without side effects", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    await store.initTask({ taskId: "TASK-P5" });

    const first = await store.upsertWorkPackage("TASK-P5", packageMetadata());
    assert.equal(first.decision.allowed, true, first.decision.reason);
    assert.equal(first.package.packageId, "P5A");
    assert.equal(first.executionMap.packages.length, 1);
    assert.equal(first.executionMap.integrationOrder.length, 0);
    assert.match(store.pathsForTask("TASK-P5").executionMapJson, /execution-map\.json$/);

    const duplicate = await store.upsertWorkPackage("TASK-P5", packageMetadata({ packageId: "P5B", checkoutPath: "/repo-worktrees/p5a", expectedWriteScopes: ["/repo/other"] }));
    assert.equal(duplicate.decision.allowed, false);
    assert.equal(duplicate.decision.code, "one_writer_violation");

    const stored = await store.readExecutionMap("TASK-P5");
    assert.deepEqual(stored.packages.map((pkg) => pkg.packageId), ["P5A"]);
  });
});

test("store persists declared integration order instead of upsert insertion order", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    await store.initTask({ taskId: "TASK-P5-ORDER" });

    const second = await store.upsertWorkPackage("TASK-P5-ORDER", packageMetadata({ packageId: "P5B", checkoutPath: "/repo-worktrees/p5b", integrationOrder: 1 }));
    assert.equal(second.decision.allowed, true, second.decision.reason);
    assert.deepEqual((await store.readExecutionMap("TASK-P5-ORDER")).integrationOrder, ["P5B"]);

    const first = await store.upsertWorkPackage("TASK-P5-ORDER", packageMetadata({ packageId: "P5A", checkoutPath: "/repo-worktrees/p5a", integrationOrder: 0 }));
    assert.equal(first.decision.allowed, true, first.decision.reason);

    const stored = await store.readExecutionMap("TASK-P5-ORDER");
    assert.deepEqual(stored.integrationOrder, ["P5A", "P5B"]);
  });
});

test("worktree branch helpers validate safe ids and preserve branch metadata without git side effects", () => {
  assert.equal(buildWorktreeBranchName({ taskId: "TASK-P5", packageId: "P5A" }), "freeflow/TASK-P5/P5A");
  const metadata = createWorktreeMetadata({ taskId: "TASK-P5", packageId: "P5A", path: "/repo-worktrees/p5a", baseBranch: "main", baseCommit: "2fa33ea" });
  assert.deepEqual(metadata, {
    path: "/repo-worktrees/p5a",
    branchName: "freeflow/TASK-P5/P5A",
    baseBranch: "main",
    baseCommit: "2fa33ea",
  });
  assert.throws(() => buildWorktreeBranchName({ taskId: "../TASK", packageId: "P5A" }), /task id/);
  assert.throws(() => createWorktreeMetadata({ taskId: "TASK-P5", packageId: "P5A", path: "relative-worktree" }), /worktree path must be an absolute path/);
});

test("execution helpers block unsatisfied dependencies and integration order conflicts", () => {
  const executionMap = {
    version: 1,
    taskId: "TASK-P5",
    updatedAt: fixedNow(),
    integrationOrder: ["P5A", "P5B"],
    packages: [
      packageMetadata({ packageId: "P5A", state: "completed", checkoutPath: "/repo-worktrees/p5a" }),
      packageMetadata({ packageId: "P5B", dependencies: ["P5A"], state: "completed", checkoutPath: "/repo-worktrees/p5b" }),
    ],
  };

  const ready = validateWorkPackageReady({ executionMap, packageId: "P5B" });
  assert.equal(ready.allowed, true, ready.reason);

  const sequencing = validateIntegrationOrder({ executionMap, packageId: "P5B" });
  assert.equal(sequencing.allowed, false);
  assert.equal(sequencing.code, "sequencing_violation");

  executionMap.packages[0].state = "integrated";
  assert.equal(validateIntegrationOrder({ executionMap, packageId: "P5B" }).allowed, true);

  executionMap.packages[0].state = "running";
  const dependency = validateWorkPackageReady({ executionMap, packageId: "P5B" });
  assert.equal(dependency.allowed, false);
  assert.equal(dependency.code, "dependency_violation");
});

test("commit checkpoint validation allows only planned reviewed verified explicit intermediate commits", () => {
  const executionMap = {
    version: 1,
    taskId: "TASK-P5",
    updatedAt: fixedNow(),
    integrationOrder: ["P5A"],
    packages: [packageMetadata()],
  };

  const allowed = validateCommitCheckpoint({
    executionMap,
    packageId: "P5A",
    checkpointId: "P5A-checkpoint",
    role: "execution-parent",
    changedFiles: [{ path: "delegation/src/types.ts" }, { path: "delegation/src/store.ts" }],
    stagingCommand: "git add delegation/src/types.ts delegation/src/store.ts",
    commitCommand: "git commit -m 'P5 checkpoint'",
  });
  assert.equal(allowed.allowed, true, allowed.reason);
  assert.deepEqual(commitCheckpointApprovalFromDecision(allowed), {
    validatedBy: "validateCommitCheckpoint",
    packageId: "P5A",
    checkpointId: "P5A-checkpoint",
    reason: allowed.reason,
  });

  for (const status of ["blocked", "committed", "allowed"]) {
    const nonPlanned = structuredClone(executionMap);
    nonPlanned.packages[0].commitCheckpoints[0].status = status;
    const decision = validateCommitCheckpoint({ executionMap: nonPlanned, packageId: "P5A", checkpointId: "P5A-checkpoint", role: "execution-parent", changedFiles: [] });
    assert.equal(decision.allowed, false);
    assert.equal(decision.code, "checkpoint_status_not_planned");
  }

  assert.equal(validateCommitCheckpoint({ executionMap, packageId: "P5A", checkpointId: "missing", role: "execution-parent", changedFiles: [] }).code, "not_found");
  assert.equal(validateCommitCheckpoint({ executionMap, packageId: "P5A", checkpointId: "P5A-checkpoint", role: "worker", changedFiles: [] }).code, "worker_commit_blocked");
  assert.equal(validateCommitCheckpoint({ executionMap, packageId: "P5A", checkpointId: "P5A-checkpoint", role: "execution-parent", changedFiles: [], stagingCommand: "git add ." }).code, "broad_staging_denied");
  assert.equal(validateCommitCheckpoint({ executionMap, packageId: "P5A", checkpointId: "P5A-checkpoint", role: "execution-parent", changedFiles: [], commitCommand: "git push origin main" }).code, "push_denied");
  assert.equal(validateCommitCheckpoint({ executionMap, packageId: "P5A", checkpointId: "P5A-checkpoint", role: "execution-parent", changedFiles: [], stagingCommand: "git worktree add ../wt branch" }).code, "git_operation_unsupported");
  assert.equal(validateCommitCheckpoint({ executionMap, packageId: "P5A", checkpointId: "P5A-checkpoint", role: "execution-parent", changedFiles: [{ path: "delegation/dist/index.js", generated: true }] }).code, "unexpected_generated_file");
  assert.equal(validateCommitCheckpoint({ executionMap, packageId: "P5A", checkpointId: "P5A-checkpoint", role: "execution-parent", changedFiles: [{ path: "notes/private.md", userOwned: true }] }).code, "unexpected_user_owned_file");
  assert.equal(validateCommitCheckpoint({ executionMap, packageId: "P5A", checkpointId: "P5A-checkpoint", role: "execution-parent", changedFiles: [{ path: ".env", sensitive: true }] }).code, "unexpected_sensitive_file");

  const missingReview = structuredClone(executionMap);
  missingReview.packages[0].review = { required: true, status: "pending" };
  assert.equal(validateCommitCheckpoint({ executionMap: missingReview, packageId: "P5A", checkpointId: "P5A-checkpoint", role: "execution-parent", changedFiles: [] }).code, "review_missing");

  const missingVerification = structuredClone(executionMap);
  missingVerification.packages[0].verification = { required: true, status: "pending" };
  assert.equal(validateCommitCheckpoint({ executionMap: missingVerification, packageId: "P5A", checkpointId: "P5A-checkpoint", role: "execution-parent", changedFiles: [] }).code, "verification_missing");

  const noFiles = structuredClone(executionMap);
  noFiles.packages[0].commitCheckpoints[0].intendedFiles = [];
  assert.equal(validateCommitCheckpoint({ executionMap: noFiles, packageId: "P5A", checkpointId: "P5A-checkpoint", role: "execution-parent", changedFiles: [] }).code, "intended_files_missing");
});

test("store preserves raw model result text before writing parsed JSON", async () => {
  await withTempStore(async (root) => {
    const store = createDelegationStore({ root, now: fixedNow });
    await store.registerAgent({ taskId: "TASK-3", agentId: "worker-3", role: "worker" });
    const raw = [
      "Normal assistant prose before the block.",
      "FFRESULT",
      "STATUS|completed",
      "SUMMARY|Changed parser raw preservation.",
      "FILES_CHANGED|delegation/src/protocol.ts",
      "END_FFRESULT",
      "Normal assistant prose after the block.",
    ].join("\n");
    const parsed = parseModelText(raw, { requireResult: true });

    const resultPaths = await store.recordAgentResult("TASK-3", "worker-3", raw, parsed);
    const storedRaw = await readFile(resultPaths.rawPath, "utf8");
    const storedJson = await readJson(resultPaths.jsonPath);

    assert.equal(storedRaw, raw);
    assert.equal(storedJson.rawText, raw);
    assert.equal(storedJson.results[0].summary, "Changed parser raw preservation.");
  });
});

test("protocol parser accepts result, blocker, capability request, status, attention, and parent report blocks", () => {
  const raw = [
    "FFSTATUS|running|Inspecting files|step=1",
    "FFATTENTION|needs_parent|Scope question|route=parent",
    "FFRESULT",
    "STATUS|blocked",
    "SUMMARY|Need a check run.",
    "BLOCKER|capability_gap|Tests are outside current authority.|suggested_route=verifier",
    "REQUEST|run_check|npm test -- delegation-store",
    "EVIDENCE|src/file.ts|18|Contains escaped ¦ delimiter.",
    "FILES_READ|src/file.ts,docs/spec.md",
    "TOOLS_USED|read,freeflow_search",
    "UNCERTAINTY|None.",
    "RECOMMENDATION|Launch verifier with the allowed command.",
    "END_FFRESULT",
    "PLANNING_REPORT",
    "STATUS|ready",
    "GOAL|Implement the harness.",
    "ARTIFACT_PATHS|docs/specs/harness.md,docs/plans/harness.md",
    "REVIEW_STATUS|passed",
    "SETTLED_DECISIONS|Use cmux only.",
    "OPEN_QUESTIONS|none",
    "EXECUTION_AUTONOMY|medium",
    "USER_CHECKPOINTS|before final closeout",
    "EXECUTION_GUIDANCE|Execute P1 only.",
    "RISKS|cmux unavailable is out of scope for P1.",
    "EVIDENCE|docs/specs/harness.md|Parent report requirements.",
    "END_PLANNING_REPORT",
    "EXECUTION_KICKOFF",
    "TASK_GOAL|Execute approved P1 scope.",
    "SOURCE_TRUTH|docs/specs/harness.md,docs/plans/harness.md,planning-report.json",
    "APPROVED_SCOPE|P1 store and protocol only.",
    "OUT_OF_SCOPE|cmux adapter and Pi hooks.",
    "REPO_STATE|working tree assigned to worker.",
    "AUTONOMY|medium",
    "USER_CHECKPOINTS|blocking source-truth conflict",
    "COMMIT_POLICY|no commits from worker",
    "EXECUTION_RULES|stay inside P1",
    "STOP_CONDITIONS|spec conflict",
    "EXPECTED_EXECUTION_REPORT|.freeflow/delegation/tasks/TASK/execution-report.json",
    "END_EXECUTION_KICKOFF",
    "EXECUTION_REPORT",
    "STATUS|completed",
    "SUMMARY|P1 complete.",
    "SOURCE_REFERENCES|docs/specs/harness.md,docs/plans/harness.md",
    "WORK_PACKAGES|P1",
    "COMMITS|none",
    "REVIEWS|pending parent review",
    "CHECKS|npm run test:delegation passed",
    "FILES_CHANGED|delegation/src/protocol.ts",
    "PLAN_DEVIATIONS|none",
    "STOP_CONDITIONS_HIT|none",
    "OPEN_QUESTIONS|none",
    "RISKS|none",
    "FINAL_RECOMMENDATION|review checkpoint",
    "EVIDENCE|ffout_123|lines 1-5|tests passed",
    "END_EXECUTION_REPORT",
  ].join("\n");

  const parsed = parseModelText(raw, { requireResult: true });

  assert.equal(parsed.ok, true);
  assert.equal(parsed.statuses[0].state, "running");
  assert.equal(parsed.statuses[0].attributes.step, "1");
  assert.equal(parsed.attentions[0].state, "needs_parent");
  assert.equal(parsed.results[0].status, "blocked");
  assert.equal(parsed.results[0].blockers[0].kind, "capability_gap");
  assert.equal(parsed.results[0].blockers[0].attributes.suggested_route, "verifier");
  assert.equal(parsed.results[0].requests[0].action, "run_check");
  assert.equal(parsed.results[0].evidence[0].fields[2], "Contains escaped | delimiter.");
  assert.deepEqual(parsed.results[0].filesRead, ["src/file.ts", "docs/spec.md"]);
  assert.deepEqual(parsed.results[0].toolsUsed, ["read", "freeflow_search"]);
  assert.equal(parsed.planningReports[0].status, "ready");
  assert.equal(parsed.executionKickoffs[0].fields.TASK_GOAL[0][0], "Execute approved P1 scope.");
  assert.equal(parsed.executionReports[0].status, "completed");
});

test("protocol parser reports parent report blocks with missing required fields deterministically", () => {
  const planningProbe = parseModelText("PLANNING_REPORT\nGOAL|g\nEND_PLANNING_REPORT");
  assert.equal(planningProbe.ok, false);
  assert.ok(planningProbe.errors.some((error) => error.message === "PLANNING_REPORT missing required row STATUS"));

  const kickoffProbe = parseModelText("EXECUTION_KICKOFF\nTASK_GOAL|g\nEND_EXECUTION_KICKOFF");
  assert.equal(kickoffProbe.ok, false);
  assert.ok(kickoffProbe.errors.some((error) => error.message === "EXECUTION_KICKOFF missing required row SOURCE_TRUTH"));

  const executionProbe = parseModelText("EXECUTION_REPORT\nSTATUS|completed\nSUMMARY|done\nEND_EXECUTION_REPORT");
  assert.equal(executionProbe.ok, false);
  assert.ok(executionProbe.errors.some((error) => error.message === "EXECUTION_REPORT missing required row SOURCE_REFERENCES"));
});

test("protocol parser reports invalid parent report statuses deterministically", () => {
  const planningProbe = parseModelText([
    "PLANNING_REPORT",
    "STATUS|done",
    "GOAL|g",
    "ARTIFACT_PATHS|docs/spec.md",
    "REVIEW_STATUS|passed",
    "SETTLED_DECISIONS|decision",
    "OPEN_QUESTIONS|none",
    "EXECUTION_AUTONOMY|medium",
    "USER_CHECKPOINTS|none",
    "EXECUTION_GUIDANCE|execute",
    "RISKS|none",
    "EVIDENCE|docs/spec.md|1|source",
    "END_PLANNING_REPORT",
  ].join("\n"));
  assert.equal(planningProbe.ok, false);
  assert.ok(planningProbe.errors.some((error) => error.message === "PLANNING_REPORT has unknown STATUS: done"));
});

test("protocol parser reports invalid required result blocks deterministically", () => {
  const missingEnd = parseModelText("FFRESULT\nSTATUS|completed\nSUMMARY|missing end", { requireResult: true });
  assert.equal(missingEnd.ok, false);
  assert.match(missingEnd.errors[0].message, /missing END_FFRESULT/);

  const unknownStatus = parseModelText("FFRESULT\nSTATUS|mystery\nEND_FFRESULT", { requireResult: true });
  assert.equal(unknownStatus.ok, false);
  assert.match(unknownStatus.errors[0].message, /unknown STATUS/);

  const missingRequired = parseModelText("No result here.", { requireResult: true });
  assert.equal(missingRequired.ok, false);
  assert.match(missingRequired.errors[0].message, /required FFRESULT/);
});

test("protocol row formatting escapes delimiters and parsing restores literal pipes", () => {
  const row = formatProtocolRow("SUMMARY", ["alpha|beta", "gamma"]);
  assert.equal(row, "SUMMARY|alpha¦beta|gamma");
  assert.deepEqual(parseProtocolRow(row).fields, ["alpha|beta", "gamma"]);
  assert.equal(escapeProtocolField("x|y"), "x¦y");
});

test("protocol row formatting collapses field newlines to spaces", () => {
  const row = formatProtocolRow("SUMMARY", ["alpha\nbeta\r\ngamma"]);
  assert.equal(row, "SUMMARY|alpha beta gamma");
  assert.deepEqual(parseProtocolRow(row).fields, ["alpha beta gamma"]);
});

test("profile registry gives parent-control tools only to orchestrator and parent profiles", () => {
  const definitions = listProfileDefinitions();
  const leafProfiles = definitions.filter((definition) => definition.kind === "leaf");
  const parentProfiles = ["orchestrator", "planning-parent", "execution-parent"];

  for (const definition of leafProfiles) {
    assert.equal(definition.activeTools.some((tool) => PARENT_CONTROL_TOOL_NAMES.includes(tool)), false, `${definition.profile} must not include parent-control delegation tools`);
    assert.equal(CHILD_LIFECYCLE_TOOL_NAMES.every((tool) => definition.activeTools.includes(tool)), true, `${definition.profile} should include scoped lifecycle tools`);
    assert.equal(definition.skills.hardGated, false);
  }

  for (const profile of parentProfiles) {
    const definition = getProfileDefinition(profile);
    assert.equal(DELEGATION_TOOL_NAMES.every((tool) => definition.activeTools.includes(tool)), true, `${profile} must include delegation tools`);
  }

  assert.equal(resolveProfileForRole("worker", "write-scoped").profile, "write-scoped");
  assert.throws(() => resolveProfileForRole("worker", "reviewer"), /cannot be used for role worker/);
});

test("policy evaluator allows safe representative reads and scoped writes", () => {
  const readDecision = evaluatePolicy({
    role: "worker",
    intent: { kind: "read", path: "/repo/src/index.ts" },
    taskPolicy: { cwd: "/repo", writeScopes: ["/repo/src"] },
  });
  assertAllowed(readDecision);

  const writeDecision = evaluatePolicy({
    role: "worker",
    intent: { kind: "write", path: "/repo/src/index.ts", toolName: "edit" },
    taskPolicy: { cwd: "/repo", writeScopes: ["/repo/src"] },
  });
  assertAllowed(writeDecision);
});

test("policy evaluator blocks secret paths, writes outside scope, and capability gaps", () => {
  assertBlocked(
    evaluatePolicy({ role: "researcher", intent: { kind: "read", path: "/repo/.env" } }),
    "secret_path",
  );

  assertBlocked(
    evaluatePolicy({
      role: "worker",
      intent: { kind: "write", path: "/repo/docs/spec.md" },
      taskPolicy: { cwd: "/repo", writeScopes: ["/repo/src"] },
    }),
    "write_scope_violation",
  );

  const reviewerWrite = evaluatePolicy({ role: "reviewer", intent: { kind: "write", path: "/repo/src/index.ts" } });
  assertBlocked(reviewerWrite, "capability_gap");
  assert.equal(reviewerWrite.suggestedReroute, "verifier");

  assertBlocked(
    evaluatePolicy({ role: "worker", intent: { kind: "tool", toolName: "delegate_spawn" } }),
    "delegation_tool_for_leaf",
  );
});

test("policy evaluator blocks forbidden commands and allows explicit safe exceptions", () => {
  assertAllowed(
    evaluatePolicy({
      role: "verifier",
      intent: { kind: "command", command: "npm run test:delegation" },
      taskPolicy: { allowedCommands: ["npm run test:delegation"] },
    }),
  );

  assertBlocked(
    evaluatePolicy({
      role: "verifier",
      intent: { kind: "command", command: "npm run build" },
      taskPolicy: { allowedCommands: ["npm run test:delegation"] },
    }),
    "command_not_allowed",
  );

  assertBlocked(
    evaluatePolicy({ role: "worker", intent: { kind: "command", command: "git push origin main" }, taskPolicy: { allowedCommands: ["git push origin main"] } }),
    "git_push_denied",
  );
  assertBlocked(
    evaluatePolicy({ role: "worker", intent: { kind: "command", command: "bash -lc \"git push origin main\"" }, taskPolicy: { allowedCommands: ["bash -lc \"git push origin main\""] } }),
    "git_push_denied",
  );

  assertBlocked(
    evaluatePolicy({ role: "execution-parent", intent: { kind: "command", command: "git commit -m checkpoint" } }),
    "unplanned_commit",
  );
  assertBlocked(
    evaluatePolicy({ role: "execution-parent", intent: { kind: "command", command: "git commit -m checkpoint" }, taskPolicy: { plannedCommit: true } }),
    "unplanned_commit",
  );
  assertBlocked(
    evaluatePolicy({ role: "execution-parent", intent: { kind: "command", command: "git commit -m checkpoint" }, taskPolicy: { allowCommits: true } }),
    "unplanned_commit",
  );
  assertBlocked(
    evaluatePolicy({ role: "integrator", intent: { kind: "command", command: "git commit -m checkpoint" }, taskPolicy: { plannedCommit: true, allowedCommands: ["git commit -m checkpoint"] } }),
    "unplanned_commit",
  );
  assertAllowed(
    evaluatePolicy({
      role: "execution-parent",
      intent: { kind: "command", command: "git commit -m checkpoint" },
      taskPolicy: {
        commitCheckpointApproval: commitCheckpointApprovalFromDecision({ allowed: true, status: "allowed", code: "allowed", reason: "validated checkpoint", packageId: "P5A", checkpointId: "P5A-checkpoint" }),
      },
    }),
  );
  assertBlocked(
    evaluatePolicy({ role: "worker", intent: { kind: "command", command: "git commit -m checkpoint" }, taskPolicy: { commitCheckpointApproval: commitCheckpointApprovalFromDecision({ allowed: true, status: "allowed", code: "allowed", reason: "validated checkpoint", packageId: "P5A", checkpointId: "P5A-checkpoint" }) } }),
    "unplanned_commit",
  );
  assertBlocked(
    evaluatePolicy({ role: "execution-parent", intent: { kind: "command", command: "git add ." }, taskPolicy: { plannedCommit: true } }),
    "broad_staging_denied",
  );
  assertBlocked(
    evaluatePolicy({ role: "execution-parent", intent: { kind: "command", command: "git worktree add ../worker branch" }, taskPolicy: { allowedCommands: ["git worktree add ../worker branch"] } }),
    "git_operation_unsupported",
  );
  assertBlocked(
    evaluatePolicy({ role: "execution-parent", intent: { kind: "command", command: "git worktree lock ../worker" }, taskPolicy: { allowedCommands: ["git worktree lock ../worker"] } }),
    "git_operation_unsupported",
  );
  assertBlocked(
    evaluatePolicy({ role: "execution-parent", intent: { kind: "command", command: "git worktree unlock ../worker" }, taskPolicy: { allowedCommands: ["git worktree unlock ../worker"] } }),
    "git_operation_unsupported",
  );

  assertBlocked(
    evaluatePolicy({ role: "worker", intent: { kind: "command", command: "rm -rf ." }, taskPolicy: { allowedCommands: ["rm -rf ."] } }),
    "destructive_command",
  );
  assertBlocked(
    evaluatePolicy({ role: "worker", intent: { kind: "command", command: "rm -fr ." }, taskPolicy: { allowedCommands: ["rm -fr ."] } }),
    "destructive_command",
  );
  assertBlocked(
    evaluatePolicy({ role: "worker", intent: { kind: "command", command: "rm -Rf ." }, taskPolicy: { allowedCommands: ["rm -Rf ."] } }),
    "destructive_command",
  );
  assertBlocked(
    evaluatePolicy({ role: "worker", intent: { kind: "command", command: "sh -c 'rm -fr .'" }, taskPolicy: { allowedCommands: ["sh -c 'rm -fr .'"] } }),
    "destructive_command",
  );
  assertBlocked(
    evaluatePolicy({ role: "worker", intent: { kind: "command", command: "env | sort" }, taskPolicy: { allowedCommands: ["env | sort"] } }),
    "credential_env_dump",
  );
  assertBlocked(
    evaluatePolicy({ role: "worker", intent: { kind: "command", command: "bash -lc \"printenv\"" }, taskPolicy: { allowedCommands: ["bash -lc \"printenv\""] } }),
    "credential_env_dump",
  );
  assertBlocked(
    evaluatePolicy({ role: "execution-parent", intent: { kind: "command", command: "npm publish" } }),
    "publish_deploy_denied",
  );
  assertBlocked(
    evaluatePolicy({ role: "execution-parent", intent: { kind: "command", command: "bash -lc \"npm publish\"" } }),
    "publish_deploy_denied",
  );
  assertAllowed(
    evaluatePolicy({ role: "execution-parent", intent: { kind: "command", command: "npm publish" }, taskPolicy: { allowPublishDeploy: true } }),
  );
  assertAllowed(
    evaluatePolicy({ role: "orchestrator", intent: { kind: "command", command: "git push origin main" }, taskPolicy: { allowGitPush: true, explicitUserConfirmation: true } }),
  );
});

test("policy evaluator fails closed for unknown role/profile and role/profile mismatch", () => {
  assertBlocked(
    evaluatePolicy({ role: "ghost", intent: { kind: "read", path: "/repo/src/index.ts" } }),
    "unknown_role",
  );
  assertBlocked(
    evaluatePolicy({ role: "worker", profile: "ghost", intent: { kind: "read", path: "/repo/src/index.ts" } }),
    "unknown_profile",
  );
  assertBlocked(
    evaluatePolicy({ role: "worker", profile: "reviewer", intent: { kind: "read", path: "/repo/src/index.ts" } }),
    "role_profile_mismatch",
  );
});

test("task packet compiler renders readable Markdown with scoped lifecycle return guidance", () => {
  const packet = compileTaskPacket({
    taskId: "TASK-9",
    agentId: "worker-9",
    parentAgentId: "execution-parent-1",
    role: "worker",
    cwd: "/repo",
    objective: "Implement P2|P3\ncore interface foundation.",
    sourcePointers: [
      { kind: "spec", path: "docs/specs/delegation/freeflow-pi-pane-delegation-harness-spec.md", note: "Task packet requirements" },
      { kind: "plan", path: "docs/plans/delegation/2026-07-01-freeflow-pi-pane-delegation-harness-implementation-plan.md" },
    ],
    inScope: ["profiles|policy", "packet compiler"],
    outOfScope: ["cmux\nadapter", "Pi runtime"],
    writeScope: ["/repo/delegation/src", "/repo/delegation/tests"],
    allowedCommands: ["npm run test:delegation", "npm run build"],
    evidence: [
      { label: "handoff", path: "docs/handoffs/delegation/2026-07-02-manual-cmux-delegation-harness-dogfood.md", note: "Manual P2|P3 lessons\nonly" },
      { label: "prior-check", outputId: "ffout_123", lines: "1-5", note: "prior verification pointer" },
    ],
    stopConditions: ["Spec conflict", "Need out-of-scope cmux work"],
    tracePath: ".freeflow/delegation/tasks/TASK-9/agents/worker-9/transcript.log",
    resultPath: ".freeflow/delegation/tasks/TASK-9/agents/worker-9/result.json",
  });

  assert.equal(packet.role, "worker");
  assert.equal(packet.profile, "worker");
  assert.equal(packet.tools.some((tool) => PARENT_CONTROL_TOOL_NAMES.includes(tool)), false);
  assert.equal(packet.tools.includes("delegate_finish"), true);
  assert.match(packet.text, /^# Delegated task: worker-9\n/);
  assert.doesNotMatch(packet.text, /^FREEFLOW_TASK_PACKET/m);
  assert.ok(packet.text.includes("- task: TASK-9"));
  assert.ok(packet.text.includes("- role/profile: worker / worker"));
  assert.ok(packet.text.includes("Implement P2|P3\ncore interface foundation."));
  assert.ok(packet.text.includes("- spec: docs/specs/delegation/freeflow-pi-pane-delegation-harness-spec.md — Task packet requirements"));
  assert.ok(packet.text.includes("- profiles|policy"));
  assert.ok(packet.text.includes("- cmux\nadapter"));
  assert.ok(packet.text.includes("- delegate_finish"));
  assert.ok(packet.text.includes("- commands_require_ALLOWED_COMMAND_rows"));
  assert.ok(packet.text.includes("- /repo/delegation/src"));
  assert.ok(packet.text.includes("- npm run test:delegation"));
  assert.ok(packet.text.includes("- handoff: path=docs/handoffs/delegation/2026-07-02-manual-cmux-delegation-harness-dogfood.md — Manual P2|P3 lessons\nonly"));
  assert.ok(packet.text.includes("- prior-check: outputId=ffout_123 — lines=1-5 — prior verification pointer"));
  assert.ok(packet.text.includes("- Spec conflict"));
  assert.ok(packet.text.includes("- DELEGATE_FINISH_REQUIRED"));
  assert.ok(packet.text.includes("Use `delegate_finish` when complete."));
  assert.ok(packet.text.includes("- transcript: .freeflow/delegation/tasks/TASK-9/agents/worker-9/transcript.log"));
  assert.ok(packet.text.includes("- result: .freeflow/delegation/tasks/TASK-9/agents/worker-9/result.json"));
});

test("task packet compiler falls back to legacy return instructions when lifecycle tools are unavailable", () => {
  const packet = compileTaskPacket({
    taskId: "TASK-10A",
    agentId: "worker-10A",
    role: "worker",
    cwd: "/repo",
    objective: "Implement bounded slice.",
    tools: ["read", "edit", "write", "freeflow_run"],
    writeScope: "/repo/delegation",
    tracePath: ".freeflow/delegation/tasks/TASK-10A/agents/worker-10A/transcript.log",
    resultPath: ".freeflow/delegation/tasks/TASK-10A/agents/worker-10A/result.json",
  });

  assert.equal(packet.tools.includes("delegate_finish"), false);
  assert.ok(packet.text.includes("- FFRESULT_REQUIRED"));
  assert.doesNotMatch(packet.text, /Use `delegate_finish` when complete/);
});

test("task packet compiler rejects malformed required input without side effects", () => {
  const base = {
    taskId: "TASK-10",
    agentId: "worker-10",
    role: "worker",
    cwd: "/repo",
    objective: "Implement bounded slice.",
    writeScope: "/repo/delegation",
    tracePath: ".freeflow/delegation/tasks/TASK-10/agents/worker-10/transcript.log",
    resultPath: ".freeflow/delegation/tasks/TASK-10/agents/worker-10/result.json",
  };

  assert.throws(() => compileTaskPacket({ ...base, taskId: "" }), /task id/);
  assert.throws(() => compileTaskPacket({ ...base, objective: "" }), /objective/);
  assert.throws(() => compileTaskPacket({ ...base, cwd: "repo" }), /cwd must be an absolute path/);
  assert.throws(() => compileTaskPacket({ ...base, profile: "reviewer" }), /cannot be used for role worker/);
  assert.throws(() => compileTaskPacket({ ...base, writeScope: undefined }), /requires at least one write scope/);
  assert.throws(() => compileTaskPacket({ ...base, writeScope: "may touch delegation\/\*\*, pi-extension\/\*\*" }), /path or glob scope only/);
  assert.throws(() => compileTaskPacket({ ...base, writeScope: "delegation\/\*\*,pi-extension\/\*\*" }), /path or glob scope only/);
  assert.throws(() => compileTaskPacket({ ...base, tools: ["read", "edit", "write"], returnProtocol: ["DELEGATE_FINISH_REQUIRED"] }), /delegate_finish.*active/);
  assert.throws(() => compileTaskPacket({ ...base, tracePath: undefined }), /trace path is required/);
  assert.throws(() => compileTaskPacket({ ...base, resultPath: undefined }), /result path is required/);
  assert.throws(() => compileTaskPacket({ ...base, allowedCommands: ["npm run build\nnpm test"] }), /allowed command 1 must not contain newlines/);
  assert.throws(() => compileTaskPacket({ ...base, evidence: [{ label: "raw dump" }] }), /must reference a path or outputId/);
  assert.throws(() => compileTaskPacket({ ...base, tools: ["read", "delegate_spawn"] }), /not active for profile worker|cannot receive delegation/);
});

function assertAllowed(decision) {
  assert.equal(decision.allowed, true, decision.reason);
  assert.equal(decision.status, "allowed");
}

function assertBlocked(decision, code) {
  assert.equal(decision.allowed, false, decision.reason);
  assert.equal(decision.status, "blocked");
  assert.equal(decision.code, code);
}
