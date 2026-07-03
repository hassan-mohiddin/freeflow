import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  createDelegationStore,
  escapeProtocolField,
  formatProtocolRow,
  parseModelText,
  parseProtocolRow,
  resolveUnderRoot,
  taskPaths,
  validateSafeId,
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
    assert.equal(agentEvents.length, 1);
    assert.equal(agentEvents[0].scope, "agent");
    assert.equal(agentEvents[0].state, "running");
    assert.deepEqual(agentEvents[0].data, { pane: "p7" });
  });
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
