import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(new URL("../../../skills/track-work/scripts/working-record.mjs", import.meta.url));

async function makeWorkspace() {
  return mkdtemp(join(tmpdir(), "freeflow-track-work-"));
}

async function writeJson(root, name, value) {
  const path = join(root, name);
  await writeFile(path, JSON.stringify(value));
  return path;
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function runScript(root, ...args) {
  const envOverrides = typeof args.at(-1) === "object" && args.at(-1)?.__env ? args.pop().__env : {};
  try {
    const result = await execFileAsync(process.execPath, [scriptPath, ...args], {
      cwd: root,
      env: { ...process.env, ...envOverrides },
      maxBuffer: 1024 * 1024,
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr, json: JSON.parse(result.stdout) };
  } catch (error) {
    return {
      exitCode: error.code,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
      json: error.stdout ? JSON.parse(error.stdout) : null,
    };
  }
}

test("init and resume expose a confirmed v2 task projection", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));

  const inputPath = join(root, "init.json");
  await writeFile(
    inputPath,
    JSON.stringify({
      taskName: "Example task",
      goal: "Preserve a useful goal",
      currentDirection: "Inspect the next safe action",
      nextAction: "Read the bounded resume view",
    }),
  );

  const initialized = await runScript(root, "init", "--root", root, "--name", "example-task", "--input", inputPath);
  assert.equal(initialized.exitCode, 0, initialized.stderr);
  assert.equal(initialized.json.status, "updated");
  assert.equal(initialized.json.record.confirmation, "confirmed");
  assert.equal(initialized.json.record.schemaVersion, 2);
  assert.equal(initialized.json.record.taskState, "Active");
  assert.equal(initialized.json.record.currentSlice, null);
  assert.match(initialized.json.record.path, /\.freeflow\/tasks\/task-001-example-task\/record\.md$/);

  const viewed = await runScript(root, "view", "--record", initialized.json.record.path, "--view", "resume");
  assert.equal(viewed.exitCode, 0, viewed.stderr);
  assert.equal(viewed.json.status, "viewed");
  assert.equal(viewed.json.record.confirmation, "confirmed");
  assert.equal(viewed.json.record.sha256, initialized.json.record.sha256);
  assert.match(viewed.json.view.content, new RegExp(`Record SHA-256: ${initialized.json.record.sha256}`));
  assert.match(viewed.json.view.content, /^Task: Example task\nTask state: Active\nSchema: 2/m);
  assert.match(viewed.json.view.content, /Current slice: None/);
  assert.match(viewed.json.view.content, /Read the bounded resume view/);
});

test("maintenance, dry-run, and outcome-level transitions preserve the canonical record", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));

  const initPath = await writeJson(root, "init.json", {
    taskName: "Lifecycle task",
    goal: "Keep multiline prose and Unicode: café / λ",
    currentDirection: "Discuss before execution",
    nextAction: "Add a proposal",
  });
  const initialized = await runScript(root, "init", "--root", root, "--name", "lifecycle", "--input", initPath);
  const recordPath = initialized.json.record.path;
  let sha = initialized.json.record.sha256;
  const updatePath = await writeJson(root, "update.json", {
    proposal: {
      operation: "add",
      title: "Deliver the bounded result",
      type: "Delivery",
      intendedResult: "A coherent result",
      expectedEvidence: "Focused tests",
    },
    decision: {
      operation: "add",
      title: "Use one slice",
      decision: "Reviews remain inside the outcome slice",
      establishedBy: "User discussion",
    },
    note: { operation: "add", title: "Useful note", source: "user", body: "Retain this note: ✓" },
  });
  const updated = await runScript(root, "update", "--record", recordPath, "--expected-sha", sha, "--input", updatePath);
  assert.equal(updated.exitCode, 0, updated.stderr);
  assert.equal(updated.json.status, "updated");
  sha = updated.json.record.sha256;
  const beforeDryRun = await readFile(join(root, recordPath), "utf8");

  const noOp = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    sha,
    "--input",
    await writeJson(root, "empty.json", {}),
  );
  assert.equal(noOp.exitCode, 0, noOp.stderr);
  assert.equal(noOp.json.status, "no-change");
  assert.equal(noOp.json.afterSha256, sha);
  assert.equal(noOp.json.record.lastUpdated, updated.json.record.lastUpdated);

  const dryRun = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    sha,
    "--input",
    await writeJson(root, "pause.json", { taskState: "Paused", taskStateAuthority: "user" }),
    "--dry-run",
  );
  assert.equal(dryRun.exitCode, 0, dryRun.stderr);
  assert.equal(dryRun.json.status, "dry-run");
  assert.equal(dryRun.json.record.taskState, "Active");
  assert.equal(dryRun.json.prospective.record.taskState, "Paused");
  assert.equal(await readFile(join(root, recordPath), "utf8"), beforeDryRun, "dry-run must not replace the record");

  const startInput = await writeJson(root, "start.json", {
    proposalTitle: "Deliver the bounded result",
    authoritySource: "User explicitly authorized implementation",
    reasonAndScope: "Implement the bounded Track Work package",
    expectedEvidence: "Focused tests and verification",
    stopCondition: "Stop before migration",
  });
  const started = await runScript(root, "start", "--record", recordPath, "--expected-sha", sha, "--input", startInput);
  assert.equal(started.exitCode, 0, started.stderr);
  assert.deepEqual(started.json.record.currentSlice, { id: "S-001", state: "In progress", type: "Delivery" });
  sha = started.json.record.sha256;

  for (const view of ["resume", "discuss", "execute", "current", "work", "recent", "full"]) {
    const viewed = await runScript(root, "view", "--record", recordPath, "--view", view);
    assert.equal(viewed.exitCode, 0, `${view}: ${viewed.stderr}`);
    assert.equal(viewed.json.status, "viewed");
    assert.equal(viewed.json.record.taskState, "Active");
  }
  const entity = await runScript(root, "view", "--record", recordPath, "--view", "entity", "--entity", "S-001");
  assert.equal(entity.exitCode, 0, entity.stderr);
  assert.match(entity.json.view.content, /S-001/);

  const blocked = await runScript(
    root,
    "block",
    "--record",
    recordPath,
    "--expected-sha",
    sha,
    "--input",
    await writeJson(root, "block.json", {
      sliceId: "S-001",
      blocker: { blocker: "A decision is missing", why: "Safe continuation is unavailable", required: "User decision" },
      resumeWhen: "The user decides",
    }),
  );
  assert.equal(blocked.exitCode, 0, blocked.stderr);
  assert.equal(blocked.json.record.currentSlice.state, "Blocked");
  sha = blocked.json.record.sha256;

  const resumed = await runScript(
    root,
    "resume",
    "--record",
    recordPath,
    "--expected-sha",
    sha,
    "--input",
    await writeJson(root, "resume.json", {
      sliceId: "S-001",
      resolutionSource: "User decision",
    }),
  );
  assert.equal(resumed.exitCode, 0, resumed.stderr);
  assert.equal(resumed.json.record.currentSlice.state, "In progress");
  sha = resumed.json.record.sha256;

  const closed = await runScript(
    root,
    "close",
    "--record",
    recordPath,
    "--expected-sha",
    sha,
    "--input",
    await writeJson(root, "close.json", {
      sliceId: "S-001",
      finalState: "Completed",
      outcome: "The bounded result is settled",
      evidence: ["node --test skills/track-work/tests/working-record.test.mjs"],
      nextAction: "Wait for the selected work review",
    }),
  );
  assert.equal(closed.exitCode, 0, closed.stderr);
  assert.equal(closed.json.record.currentSlice, null);
  const finalView = await runScript(root, "view", "--record", recordPath, "--view", "resume");
  assert.match(finalView.json.view.content, /Current slice: None/);
  const inspection = await runScript(root, "inspect", "--record", recordPath);
  assert.equal(inspection.exitCode, 0, inspection.stderr);
  assert.equal(inspection.json.status, "inspected");
});

test("stale writers, locks, and pre-commit failures fail closed", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = await writeJson(root, "init.json", { taskName: "Safety task", goal: "Safety" });
  const initialized = await runScript(root, "init", "--root", root, "--name", "safety", "--input", input);
  const recordPath = initialized.json.record.path;
  const original = await readFile(join(root, recordPath), "utf8");
  const missingSha = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--input",
    await writeJson(root, "update.json", { goal: "changed" }),
  );
  assert.equal(missingSha.exitCode, 1);
  assert.equal(missingSha.json.status, "failed");
  assert.equal(missingSha.json.errors[0].code, "missing-expected-sha");

  const stale = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    "0".repeat(64),
    "--input",
    await writeJson(root, "stale.json", { goal: "changed" }),
  );
  assert.equal(stale.exitCode, 1);
  assert.equal(stale.json.errors[0].code, "stale-sha");
  assert.equal(await readFile(join(root, recordPath), "utf8"), original);

  await writeFile(join(root, ".freeflow", "tasks", "task-001-safety", ".working-record.lock"), "held");
  const locked = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "locked.json", { goal: "changed" }),
  );
  assert.equal(locked.exitCode, 1);
  assert.equal(locked.json.errors[0].code, "lock-conflict");
  await rm(join(root, ".freeflow", "tasks", "task-001-safety", ".working-record.lock"), { force: true });

  const failed = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "failure.json", { goal: "changed" }),
    { __env: { FREEFLOW_TEST_FAILURE: "temp-write" } },
  );
  assert.equal(failed.exitCode, 1);
  assert.equal(failed.json.errors[0].code, "temp-write-failure");
  assert.equal(await readFile(join(root, recordPath), "utf8"), original);
});

test("post-commit confirmation failure returns candidate metadata and forces recovery", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "recovery",
    "--input",
    await writeJson(root, "init.json", { taskName: "Recovery task" }),
  );
  const recordPath = initialized.json.record.path;
  const failed = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "update.json", { goal: "Committed candidate" }),
    { __env: { FREEFLOW_TEST_FAILURE: "confirmation" } },
  );
  assert.equal(failed.exitCode, 2);
  assert.equal(failed.json.status, "committed-unconfirmed");
  assert.equal(failed.json.record.confirmation, "candidate");
  assert.equal(failed.json.recovery.required, true);
  const viewed = await runScript(root, "view", "--record", recordPath, "--view", "resume");
  assert.equal(viewed.exitCode, 0, viewed.stderr);
  assert.equal(viewed.json.record.confirmation, "confirmed");
  assert.notEqual(viewed.json.record.sha256, initialized.json.record.sha256);
});

test("task-state invariants and state-specific closure are enforced", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "states",
    "--input",
    await writeJson(root, "init.json", { taskName: "State task" }),
  );
  const recordPath = initialized.json.record.path;
  let sha = initialized.json.record.sha256;
  const started = await runScript(
    root,
    "start",
    "--record",
    recordPath,
    "--expected-sha",
    sha,
    "--input",
    await writeJson(root, "start.json", {
      title: "State outcome",
      type: "Delivery",
      authoritySource: "user",
      intendedResult: "Exercise task-state transitions",
      reasonAndScope: "Only transition validation",
      expectedEvidence: "Rejected forbidden transition",
      stopCondition: "Stop after the transition check",
    }),
  );
  sha = started.json.record.sha256;

  const terminalWithSlice = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    sha,
    "--input",
    await writeJson(root, "terminal.json", { taskState: "Completed", taskStateAuthority: "user" }),
  );
  assert.equal(terminalWithSlice.exitCode, 1);
  assert.equal(terminalWithSlice.json.errors[0].code, "terminal-current-slice");

  const paused = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    sha,
    "--input",
    await writeJson(root, "pause.json", { taskState: "Paused", taskStateAuthority: "user" }),
  );
  assert.equal(paused.exitCode, 0, paused.stderr);
  sha = paused.json.record.sha256;
  const startWhilePaused = await runScript(
    root,
    "start",
    "--record",
    recordPath,
    "--expected-sha",
    sha,
    "--input",
    await writeJson(root, "start-paused.json", {
      title: "No",
      type: "Delivery",
      authoritySource: "user",
      intendedResult: "This must not start",
      reasonAndScope: "Only paused-state rejection",
      expectedEvidence: "Rejected start",
      stopCondition: "Stop on rejection",
    }),
  );
  assert.equal(startWhilePaused.exitCode, 1);
  assert.equal(startWhilePaused.json.errors[0].code, "invalid-transition");

  const reopened = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    sha,
    "--input",
    await writeJson(root, "reopen.json", { taskState: "Active", taskStateAuthority: "user" }),
  );
  assert.equal(reopened.exitCode, 0, reopened.stderr);
  sha = reopened.json.record.sha256;
  const blocked = await runScript(
    root,
    "block",
    "--record",
    recordPath,
    "--expected-sha",
    sha,
    "--input",
    await writeJson(root, "block.json", {
      blocker: { blocker: "dependency", why: "cannot continue", required: "dependency" },
    }),
  );
  assert.equal(blocked.exitCode, 0, blocked.stderr);
  sha = blocked.json.record.sha256;
  const parked = await runScript(
    root,
    "close",
    "--record",
    recordPath,
    "--expected-sha",
    sha,
    "--input",
    await writeJson(root, "park.json", {
      finalState: "Blocked",
      authoritySource: "user parks attempt",
      outcome: "Parked with blocker",
      evidence: ["blocker recorded"],
    }),
  );
  assert.equal(parked.exitCode, 0, parked.stderr);
  assert.equal(parked.json.record.currentSlice, null);
  assert.equal(parked.json.record.taskState, "Active");
});

test("Abandoned closure preserves explicit reason, residual effects, and evidence", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "abandoned",
    "--input",
    await writeJson(root, "init.json", { taskName: "Abandoned task" }),
  );
  const recordPath = initialized.json.record.path;
  const started = await runScript(
    root,
    "start",
    "--record",
    recordPath,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "start.json", {
      title: "Abandoned outcome",
      type: "Learning",
      authoritySource: "user",
      intendedResult: "Learn",
      reasonAndScope: "Only the abandoned learning attempt",
      expectedEvidence: "Observation",
      stopCondition: "Stop when no longer relevant",
    }),
  );
  const closed = await runScript(
    root,
    "close",
    "--record",
    recordPath,
    "--expected-sha",
    started.json.record.sha256,
    "--input",
    await writeJson(root, "close.json", {
      finalState: "Abandoned",
      authoritySource: "user ended the attempt",
      abandonmentReason: "The question is no longer relevant",
      residualEffects: "No implementation was published",
      outcome: "The learning outcome is abandoned",
      evidence: ["user decision"],
    }),
  );
  assert.equal(closed.exitCode, 0, closed.stderr);
  assert.equal(closed.json.record.currentSlice, null);
  const full = await runScript(root, "view", "--record", recordPath, "--view", "full");
  assert.match(full.json.view.content, /State: Abandoned/);
  assert.match(full.json.view.content, /No implementation was published/);
});

test("Git preflight, dry-run init, malformed records, and symlink safety are explicit", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, ".gitignore"), ".freeflow/tasks/\n");
  await execFileAsync("git", ["init", "-q"], { cwd: root });
  const dry = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "git-task",
    "--input",
    await writeJson(root, "dry-init.json", { taskName: "Git task" }),
    "--dry-run",
  );
  assert.equal(dry.exitCode, 0, dry.stderr);
  assert.equal(dry.json.status, "dry-run");
  assert.equal(dry.json.prospective.versionControl.ignored, true);
  await assert.rejects(readFile(join(root, ".freeflow", "tasks", "task-001-git-task", "record.md")));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "git-task",
    "--input",
    await writeJson(root, "init.json", { taskName: "Git task" }),
  );
  assert.equal(initialized.exitCode, 0, initialized.stderr);
  assert.equal(initialized.json.warnings.length, 0);

  const recordPath = join(root, initialized.json.record.path);
  const original = await readFile(recordPath, "utf8");
  await writeFile(recordPath, original.replace("Schema: 2", "Schema: 99"));
  const invalid = await runScript(root, "view", "--root", root, "--record", recordPath, "--view", "resume");
  assert.equal(invalid.exitCode, 1);
  assert.equal(invalid.json.record.confirmation, "unavailable");
  assert.equal(invalid.json.errors[0].code, "unsupported-schema");

  const symlinkRoot = await makeWorkspace();
  t.after(() => rm(symlinkRoot, { recursive: true, force: true }));
  await mkdir(join(symlinkRoot, ".freeflow", "tasks"), { recursive: true });
  await symlink(root, join(symlinkRoot, ".freeflow", "tasks", "task-001-link"));
  const symlinkMutation = await runScript(
    symlinkRoot,
    "update",
    "--root",
    symlinkRoot,
    "--record",
    join(symlinkRoot, ".freeflow", "tasks", "task-001-link", "record.md"),
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(symlinkRoot, "update.json", { goal: "no" }),
  );
  assert.equal(symlinkMutation.exitCode, 1);
  assert.equal(symlinkMutation.json.errors[0].code, "unsafe-symlink");
});

test("legacy records are inspectable but mutation refuses them", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const taskDir = join(root, ".freeflow", "tasks", "task-001-legacy");
  await mkdir(taskDir, { recursive: true });
  const recordPath = join(taskDir, "record.md");
  await writeFile(
    recordPath,
    `# Working Record: Legacy\n\nState: Active\nLast updated: 2026-01-01T00:00:00Z\n\n## Current Context\n\n## Current Work\n\n### Current Slice\nNone\n`,
  );
  const viewed = await runScript(root, "view", "--root", root, "--record", recordPath, "--view", "resume");
  assert.equal(viewed.exitCode, 0, viewed.stderr);
  assert.equal(viewed.json.record.confirmation, "unavailable");
  const validation = await runScript(root, "validate", "--root", root, "--record", recordPath);
  assert.equal(validation.exitCode, 1, validation.stderr);
  assert.equal(validation.json.status, "failed");
  assert.equal(validation.json.errors[0].code, "legacy-read-only");
  const mutation = await runScript(
    root,
    "update",
    "--root",
    root,
    "--record",
    recordPath,
    "--expected-sha",
    viewed.json.record.sha256,
    "--input",
    await writeJson(root, "update.json", { goal: "no" }),
  );
  assert.equal(mutation.exitCode, 1);
  assert.equal(mutation.json.errors[0].code, "legacy-read-only");
});

test("update cannot bypass slice transitions or user-owned task-state authority", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "authority",
    "--input",
    await writeJson(root, "init.json", { taskName: "Authority task" }),
  );
  const recordPath = initialized.json.record.path;
  const withId = await runScript(
    root,
    "start",
    "--record",
    recordPath,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "bad-id.json", {
      id: "S-099",
      title: "Bad id",
      type: "Delivery",
      authoritySource: "user",
      intendedResult: "x",
      expectedEvidence: "y",
    }),
  );
  assert.equal(withId.exitCode, 1);
  assert.equal(withId.json.errors[0].code, "caller-supplied-id");

  const started = await runScript(
    root,
    "start",
    "--record",
    recordPath,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "start.json", {
      title: "Authorized slice",
      type: "Delivery",
      authoritySource: "user",
      intendedResult: "x",
      reasonAndScope: "Only the authorized slice",
      expectedEvidence: "y",
      stopCondition: "Stop after the focused check",
    }),
  );
  assert.equal(started.exitCode, 0, started.stderr);
  const record = join(root, recordPath);

  for (const input of [
    { currentWork: { currentSlice: null } },
    { currentSlice: { id: "S-099", state: "In progress" } },
  ]) {
    const bypass = await runScript(
      root,
      "update",
      "--record",
      recordPath,
      "--expected-sha",
      started.json.record.sha256,
      "--input",
      await writeJson(root, "bypass.json", input),
    );
    assert.equal(bypass.exitCode, 1);
    assert.equal(bypass.json.errors[0].code, input.currentSlice ? "caller-supplied-id" : "invalid-operation");
    assert.equal((await readFile(record, "utf8")).includes("S-001"), true);
  }

  const pause = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    started.json.record.sha256,
    "--input",
    await writeJson(root, "pause.json", { taskState: "Paused" }),
  );
  assert.equal(pause.exitCode, 1);
  assert.equal(pause.json.errors[0].code, "missing-authority");

  const decision = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    started.json.record.sha256,
    "--input",
    await writeJson(root, "decision.json", {
      decision: { operation: "add", id: "D-099", title: "Bad id", decision: "x" },
    }),
  );
  assert.equal(decision.exitCode, 1);
  assert.equal(decision.json.errors[0].code, "caller-supplied-id");

  const incomplete = await runScript(
    root,
    "close",
    "--record",
    recordPath,
    "--expected-sha",
    started.json.record.sha256,
    "--input",
    await writeJson(root, "incomplete.json", { finalState: "Completed" }),
  );
  assert.equal(incomplete.exitCode, 1);
  assert.equal(incomplete.json.errors[0].code, "missing-outcome");

  const abandoned = await runScript(
    root,
    "close",
    "--record",
    recordPath,
    "--expected-sha",
    started.json.record.sha256,
    "--input",
    await writeJson(root, "abandoned.json", { finalState: "Abandoned", outcome: "Stopped", authoritySource: "user" }),
  );
  assert.equal(abandoned.exitCode, 1);
  assert.equal(abandoned.json.errors[0].code, "missing-abandonment-reason");
});

test("round trips reserved prose and rejects duplicate or unknown schema fields", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "round-trip",
    "--input",
    await writeJson(root, "init.json", {
      taskName: "Round trip",
      goal: "first line\n### literal heading\nreserved: [value] ✓",
      currentDirection: "Keep title: with colon",
    }),
  );
  const recordPath = initialized.json.record.path;
  const updated = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "update.json", {
      decision: {
        operation: "add",
        title: "Decision: colon title",
        decision: "Summary: preserve colon\nsecond decision line",
      },
      note: { operation: "add", title: "Note: title", source: "user", body: "line one\n### literal note heading\n✓" },
    }),
  );
  assert.equal(updated.exitCode, 0, updated.stderr);
  const full = await runScript(root, "view", "--record", recordPath, "--view", "full");
  assert.equal(full.exitCode, 0, full.stderr);
  assert.match(full.json.view.content, /### literal heading/);
  assert.match(full.json.view.content, /Decision: colon title/);
  assert.match(full.json.view.content, /Summary: preserve colon/);
  assert.match(full.json.view.content, /second decision line/);
  assert.match(full.json.view.content, /### literal note heading/);

  const noOp = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    updated.json.record.sha256,
    "--input",
    await writeJson(root, "noop.json", {}),
  );
  assert.equal(noOp.exitCode, 0, noOp.stderr);
  assert.equal(noOp.json.status, "no-change");

  const record = join(root, recordPath);
  const original = await readFile(record, "utf8");
  await writeFile(record, original.replace("### Current Slice\nNone", "### Current Slice\n- Unknown: must reject"));
  const unknown = await runScript(root, "view", "--record", recordPath, "--view", "full");
  assert.equal(unknown.exitCode, 1);
  assert.equal(unknown.json.errors[0].code, "unknown-field");

  await writeFile(record, original.replace("### Blockers", "### Blockers\n- Extra: duplicate\n### Blockers"));
  const duplicateSection = await runScript(root, "view", "--record", recordPath, "--view", "full");
  assert.equal(duplicateSection.exitCode, 1);
  assert.equal(duplicateSection.json.errors[0].code, "duplicate-section");
});

test("invalid validation, dry-run no-op, and init confirmation use the declared exits", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "exits",
    "--input",
    await writeJson(root, "init.json", { taskName: "Exit task" }),
  );
  const recordPath = initialized.json.record.path;
  const dryNoOp = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "noop.json", {}),
    "--dry-run",
  );
  assert.equal(dryNoOp.exitCode, 0, dryNoOp.stderr);
  assert.equal(dryNoOp.json.status, "dry-run");
  assert.equal(dryNoOp.json.prospective.wouldChange, false);

  const invalidRecord = join(root, recordPath);
  await writeFile(invalidRecord, (await readFile(invalidRecord, "utf8")).replace("State: Active", "State: Invalid"));
  const validation = await runScript(root, "validate", "--record", recordPath);
  assert.equal(validation.exitCode, 1);
  assert.equal(validation.json.status, "failed");
  assert.equal(validation.json.errors[0].code, "invalid-task-state");

  const confirmationRoot = await makeWorkspace();
  t.after(() => rm(confirmationRoot, { recursive: true, force: true }));
  const confirmation = await runScript(
    confirmationRoot,
    "init",
    "--root",
    confirmationRoot,
    "--name",
    "init-confirmation",
    "--input",
    await writeJson(confirmationRoot, "init.json", { taskName: "Init confirmation" }),
    { __env: { FREEFLOW_TEST_FAILURE: "confirmation" } },
  );
  assert.equal(confirmation.exitCode, 2);
  assert.equal(confirmation.json.status, "committed-unconfirmed");
  assert.equal(confirmation.json.record.confirmation, "candidate");

  const readFailureRoot = await makeWorkspace();
  t.after(() => rm(readFailureRoot, { recursive: true, force: true }));
  const readFailure = await runScript(
    readFailureRoot,
    "init",
    "--root",
    readFailureRoot,
    "--name",
    "init-read-failure",
    "--input",
    await writeJson(readFailureRoot, "init.json", { taskName: "Init read failure" }),
    { __env: { FREEFLOW_TEST_FAILURE: "confirmation-read" } },
  );
  assert.equal(readFailure.exitCode, 2);
  assert.equal(readFailure.json.status, "committed-unconfirmed");
  assert.equal(readFailure.json.record.confirmation, "candidate");
});

test("all read and validation commands reject symlinked mutable topology", async (t) => {
  const realRoot = await makeWorkspace();
  const aliasRoot = await makeWorkspace();
  t.after(() => rm(realRoot, { recursive: true, force: true }));
  t.after(() => rm(aliasRoot, { recursive: true, force: true }));
  const initialized = await runScript(
    realRoot,
    "init",
    "--root",
    realRoot,
    "--name",
    "topology",
    "--input",
    await writeJson(realRoot, "init.json", { taskName: "Topology" }),
  );
  await symlink(join(realRoot, ".freeflow"), join(aliasRoot, ".freeflow"));
  const aliasRecord = join(aliasRoot, ".freeflow", "tasks", "task-001-topology", "record.md");
  for (const command of ["view", "validate", "inspect"]) {
    const result = await runScript(
      aliasRoot,
      command,
      "--root",
      aliasRoot,
      "--record",
      aliasRecord,
      ...(command === "view" ? ["--view", "resume"] : []),
    );
    assert.equal(result.exitCode, 1, `${command}: ${result.stderr}`);
    assert.equal(result.json.errors[0].code, "unsafe-symlink");
  }
  assert.equal(initialized.json.record.taskState, "Active");
});

test("legacy entity views are exact when unambiguous and validation is not v2-valid", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const taskDir = join(root, ".freeflow", "tasks", "task-001-legacy-entities");
  await mkdir(taskDir, { recursive: true });
  const recordPath = join(taskDir, "record.md");
  await writeFile(
    recordPath,
    `# Working Record: Legacy entities\n\nState: Active\nLast updated: 2026-01-01T00:00:00Z\n\n## History\n### Slices\n#### S-001 — First\nState: Completed\n\n#### S-002 — Second\nState: Blocked\n`,
  );
  const entity = await runScript(
    root,
    "view",
    "--root",
    root,
    "--record",
    recordPath,
    "--view",
    "entity",
    "--entity",
    "S-002",
  );
  assert.equal(entity.exitCode, 0, entity.stderr);
  assert.match(entity.json.view.content, /S-002 — Second/);
  assert.doesNotMatch(entity.json.view.content, /S-001 — First/);
  const missing = await runScript(
    root,
    "view",
    "--root",
    root,
    "--record",
    recordPath,
    "--view",
    "entity",
    "--entity",
    "S-099",
  );
  assert.equal(missing.exitCode, 1);
  assert.equal(missing.json.errors[0].code, "legacy-view-unavailable");
  const validation = await runScript(root, "validate", "--root", root, "--record", recordPath);
  assert.equal(validation.exitCode, 1);
  assert.equal(validation.json.status, "failed");
  const inspection = await runScript(root, "inspect", "--root", root, "--record", recordPath);
  assert.equal(inspection.exitCode, 0);
  assert.equal(inspection.json.inspection.parserConfidence, "best-effort");
});

test("enforces complete lifecycle declarations and exact schema headers", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));

  const incompleteInit = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "incomplete-init",
    "--input",
    await writeJson(root, "incomplete-init.json", {
      taskName: "Incomplete init",
      authoritySource: "user",
      currentSlice: { title: "Missing declarations", type: "Delivery" },
    }),
  );
  assert.equal(incompleteInit.exitCode, 1);

  const startRoot = await makeWorkspace();
  t.after(() => rm(startRoot, { recursive: true, force: true }));
  const startedBase = await runScript(
    startRoot,
    "init",
    "--root",
    startRoot,
    "--name",
    "incomplete-start",
    "--input",
    await writeJson(startRoot, "init.json", { taskName: "Incomplete start" }),
  );
  const incompleteStart = await runScript(
    startRoot,
    "start",
    "--record",
    startedBase.json.record.path,
    "--expected-sha",
    startedBase.json.record.sha256,
    "--input",
    await writeJson(startRoot, "start.json", {
      title: "Missing declarations",
      type: "Delivery",
      authoritySource: "user",
    }),
  );
  assert.equal(incompleteStart.exitCode, 1);

  const stateRoot = await makeWorkspace();
  t.after(() => rm(stateRoot, { recursive: true, force: true }));
  const stateInit = await runScript(
    stateRoot,
    "init",
    "--root",
    stateRoot,
    "--name",
    "invalid-state-transition",
    "--input",
    await writeJson(stateRoot, "init.json", { taskName: "Invalid transition" }),
  );
  const completed = await runScript(
    stateRoot,
    "update",
    "--record",
    stateInit.json.record.path,
    "--expected-sha",
    stateInit.json.record.sha256,
    "--input",
    await writeJson(stateRoot, "completed.json", { taskState: "Completed", taskStateAuthority: "user" }),
  );
  const paused = await runScript(
    stateRoot,
    "update",
    "--record",
    stateInit.json.record.path,
    "--expected-sha",
    completed.json.record.sha256,
    "--input",
    await writeJson(stateRoot, "paused.json", { taskState: "Paused", taskStateAuthority: "user" }),
  );
  assert.equal(paused.exitCode, 1);
  assert.equal(paused.json.record.taskState, "Completed");

  const malformedRoot = await makeWorkspace();
  t.after(() => rm(malformedRoot, { recursive: true, force: true }));
  const malformedInit = await runScript(
    malformedRoot,
    "init",
    "--root",
    malformedRoot,
    "--name",
    "ambiguous-header",
    "--input",
    await writeJson(malformedRoot, "init.json", { taskName: "Ambiguous header" }),
  );
  const malformedPath = join(malformedRoot, malformedInit.json.record.path);
  const malformedText = await readFile(malformedPath, "utf8");
  await writeFile(
    malformedPath,
    malformedText.replace("Last updated:", "Unknown header: do not ignore\nState: Abandoned\nLast updated:"),
  );
  const malformedView = await runScript(
    malformedRoot,
    "view",
    "--record",
    malformedInit.json.record.path,
    "--view",
    "full",
  );
  assert.equal(malformedView.exitCode, 1);

  const proseRoot = await makeWorkspace();
  t.after(() => rm(proseRoot, { recursive: true, force: true }));
  const proseInit = await runScript(
    proseRoot,
    "init",
    "--root",
    proseRoot,
    "--name",
    "exact-prose",
    "--input",
    await writeJson(proseRoot, "init.json", { taskName: "Exact prose", goal: "alpha\n\n\nbeta" }),
  );
  const prosePath = join(proseRoot, proseInit.json.record.path);
  const proseRaw = await readFile(prosePath, "utf8");
  assert.match(proseRaw, /alpha\n\n\nbeta/);

  const unownedText = proseRaw.replace("## History\n", "## History\nUNOWNED CONTENT MUST SURVIVE\n");
  await writeFile(prosePath, unownedText);
  const unownedUpdate = await runScript(
    proseRoot,
    "update",
    "--record",
    proseInit.json.record.path,
    "--expected-sha",
    sha256(unownedText),
    "--input",
    await writeJson(proseRoot, "unowned-update.json", { goal: "must not publish" }),
  );
  assert.equal(unownedUpdate.exitCode, 1);
  assert.match(await readFile(prosePath, "utf8"), /UNOWNED CONTENT MUST SURVIVE/);

  await writeFile(prosePath, proseRaw.replace("### Decisions\n", "### Unknown history group\n\n### Decisions\n"));
  const unknownHistory = await runScript(proseRoot, "view", "--record", proseInit.json.record.path, "--view", "full");
  assert.equal(unknownHistory.exitCode, 1);

  const displacedTask = join(proseRoot, ".freeflow", "tasks", "task-002-displaced");
  await mkdir(displacedTask, { recursive: true });
  const displacedPath = join(displacedTask, "record.md");
  await writeFile(
    displacedPath,
    "# Working Record: Displaced\\n\\n## Current Context\\nSchema: 2\\n\\n## Current Work\\n",
  );
  const displaced = await runScript(proseRoot, "view", "--record", displacedPath, "--view", "full");
  assert.equal(displaced.exitCode, 1);
  assert.notEqual(displaced.json.errors[0].code, "legacy-read-only");
});
