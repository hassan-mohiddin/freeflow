import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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

function parseTextView(stdout, args) {
  const value = (label) => stdout.match(new RegExp(`^${label}: (.*)$`, "m"))?.[1] ?? null;
  const current = value("Current slice");
  const currentSlice =
    current && current !== "None"
      ? (() => {
          const [id, state, type] = current.split(" — ");
          return { id, state, type };
        })()
      : null;
  const recordOption = args.indexOf("--record");
  const path = recordOption >= 0 ? args[recordOption + 1] : null;
  const schema = value("Schema");
  return {
    status: "viewed",
    operation: "view",
    record: {
      path,
      confirmation: schema === "unavailable (legacy record)" ? "unavailable" : "confirmed",
      sha256: value("Record SHA-256"),
      schemaVersion: schema === "unavailable (legacy record)" ? null : Number(schema),
      taskState: value("Task state"),
      lastUpdated: value("Last updated"),
      currentSlice,
    },
    affectedIds: [],
    errors: [],
    warnings: [],
    view: { name: value("View") ?? args[args.indexOf("--view") + 1], content: stdout },
  };
}

async function runScript(root, ...args) {
  const envOverrides = typeof args.at(-1) === "object" && args.at(-1)?.__env ? args.pop().__env : {};
  const isView = args[0] === "view" || args[0] === "resume-view";
  try {
    const result = await execFileAsync(process.execPath, [scriptPath, ...args], {
      cwd: root,
      env: { ...process.env, ...envOverrides },
      maxBuffer: 1024 * 1024,
    });
    return {
      exitCode: 0,
      stdout: result.stdout,
      stderr: result.stderr,
      json: isView ? parseTextView(result.stdout, args) : JSON.parse(result.stdout),
    };
  } catch (error) {
    const stdout = error.stdout ?? "";
    let json = null;
    if (stdout) {
      try {
        if (isView && !stdout.trimStart().startsWith("{")) {
          const match = stdout.match(/failed \[([^\]]+)\]: (.*)$/s);
          json = {
            status: "failed",
            errors: [{ code: match?.[1] ?? "view-failed", message: match?.[2] ?? stdout.trim() }],
          };
        } else {
          json = JSON.parse(stdout);
        }
      } catch {
        json = isView ? { status: "failed", errors: [{ code: "view-failed", message: stdout.trim() }] } : null;
      }
    }
    return { exitCode: error.code, stdout, stderr: error.stderr ?? "", json };
  }
}

async function runScriptWithStdin(root, input, ...args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: root,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (exitCode) => {
      let json = null;
      try {
        json = stdout ? JSON.parse(stdout) : null;
      } catch (error) {
        stderr += `\n${error.message}`;
      }
      resolve({ exitCode, stdout, stderr, json });
    });
    child.stdin.end(JSON.stringify(input));
  });
}

async function runRawScript(root, ...args) {
  try {
    const result = await execFileAsync(process.execPath, [scriptPath, ...args], {
      cwd: root,
      env: process.env,
      maxBuffer: 1024 * 1024,
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return { exitCode: error.code, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
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

  for (const view of ["resume", "discuss", "execute", "recent", "full"]) {
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
  const invalid = await runRawScript(root, "view", "--root", root, "--record", recordPath, "--view", "resume");
  assert.equal(invalid.exitCode, 0);
  assert.match(invalid.stdout, /Schema: unavailable \(unsupported record\)/);

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

  await writeFile(record, original.replace("## History", "## History\n## History"));
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

test("stdin input is documented and works without a temporary JSON file", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));

  const help = await execFileAsync(process.execPath, [scriptPath, "--help"], { cwd: root });
  assert.match(help.stdout, /--input <json-file\|->/);

  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "stdin-input",
    "--input",
    await writeJson(root, "init.json", { taskName: "Stdin input" }),
  );
  const updated = await runScriptWithStdin(
    root,
    { currentContext: { goal: "Updated through stdin" } },
    "update",
    "--record",
    initialized.json.record.path,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    "-",
  );
  assert.equal(updated.exitCode, 0, updated.stderr);
  assert.equal(updated.json.status, "updated");
  const viewed = await runScript(root, "view", "--record", initialized.json.record.path, "--view", "resume");
  assert.match(viewed.json.view.content, /Updated through stdin/);
});

test("a completed slice can be explicitly reopened without consuming a new slice ID", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));

  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "reopen-slice",
    "--input",
    await writeJson(root, "init.json", { taskName: "Reopen slice" }),
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
      title: "Finish the bounded result",
      type: "Delivery",
      intendedResult: "The bounded result is complete",
      authoritySource: "User explicitly authorized the result",
      reasonAndScope: "Implement and verify the bounded result",
      expectedEvidence: "Focused tests and verification",
      stopCondition: "Stop before migration",
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
      sliceId: "S-001",
      finalState: "Completed",
      outcome: "The first part of the result is complete",
      evidence: ["initial verification"],
    }),
  );
  assert.equal(closed.exitCode, 0, closed.stderr);
  const closedText = await readFile(join(root, recordPath), "utf8");
  assert.doesNotMatch(closedText, /Reopen snapshot/);

  const reopened = await runScript(
    root,
    "reopen",
    "--record",
    recordPath,
    "--expected-sha",
    closed.json.record.sha256,
    "--input",
    await writeJson(root, "reopen.json", {
      sliceId: "S-001",
      authoritySource: "User explicitly authorized continuation of the original result",
      reopenReason: "The requested follow-up remains inside the original intended result",
      reasonAndScope: "Continue the original bounded result",
      expectedEvidence: "Continuation verification",
      stopCondition: "Stop after the original result is fully settled",
    }),
  );
  assert.equal(reopened.exitCode, 0, `${reopened.stderr}\n${reopened.stdout}`);
  assert.deepEqual(reopened.json.record.currentSlice, { id: "S-001", state: "In progress", type: "Delivery" });
  assert.equal(reopened.json.affectedIds[0], "S-001");

  const current = await runScript(root, "view", "--record", recordPath, "--view", "execute");
  assert.match(current.json.view.content, /Reopen history/);
  assert.match(current.json.view.content, /original intended result/);

  const closedAgain = await runScript(
    root,
    "close",
    "--record",
    recordPath,
    "--expected-sha",
    reopened.json.record.sha256,
    "--input",
    await writeJson(root, "close-again.json", {
      sliceId: "S-001",
      finalState: "Completed",
      outcome: "The original result is now fully settled",
      evidence: ["initial verification", "continuation verification"],
    }),
  );
  assert.equal(closedAgain.exitCode, 0, closedAgain.stderr);
  const full = await runScript(root, "view", "--record", recordPath, "--view", "full");
  assert.equal((full.json.view.content.match(/#### S-001 —/g) ?? []).length, 1);
  assert.match(full.json.view.content, /The original result is now fully settled/);
});

test("public views are direct text and storage-section aliases are rejected", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "text-views",
    "--input",
    await writeJson(root, "init.json", { taskName: "Text views", goal: "Use direct view text" }),
  );
  const recordPath = initialized.json.record.path;
  const viewed = await runRawScript(root, "view", "--record", recordPath, "--view", "resume");
  assert.equal(viewed.exitCode, 0, viewed.stderr);
  assert.match(viewed.stdout, /^Task: Text views\nTask state: Active\nSchema: 2/m);
  assert.doesNotMatch(viewed.stdout, /^\s*\{/);
  assert.match(viewed.stdout, /Record SHA-256:/);

  for (const removedView of ["current", "work"]) {
    const rejected = await runRawScript(root, "view", "--record", recordPath, "--view", removedView);
    assert.equal(rejected.exitCode, 1, `${removedView}: ${rejected.stderr}`);
    assert.match(rejected.stdout, /Unknown view: (current|work)/);
    assert.doesNotMatch(rejected.stdout, /^\s*\{/);
  }
});

test("precise update edits one proposal without replacing siblings", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "precise-edit",
    "--input",
    await writeJson(root, "init.json", { taskName: "Precise edit" }),
  );
  const recordPath = initialized.json.record.path;
  const added = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "proposals.json", {
      proposal: {
        operation: "add",
        title: "First proposal",
        type: "Delivery",
        intendedResult: "First",
        expectedEvidence: "First evidence",
      },
      proposals: [
        { title: "Second proposal", type: "Learning", intendedResult: "Second", expectedEvidence: "Second evidence" },
      ],
    }),
  );
  assert.equal(added.exitCode, 1, "legacy whole-collection update should not be accepted by the new contract");
  const first = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "first.json", {
      proposal: {
        operation: "add",
        title: "First proposal",
        type: "Delivery",
        intendedResult: "First",
        expectedEvidence: "First evidence",
      },
    }),
  );
  assert.equal(first.exitCode, 0, first.stderr);
  const seeded = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    first.json.record.sha256,
    "--input",
    await writeJson(root, "second.json", {
      proposal: {
        operation: "add",
        title: "Second proposal",
        type: "Learning",
        intendedResult: "Second",
        expectedEvidence: "Second evidence",
      },
    }),
  );
  assert.equal(seeded.exitCode, 0, seeded.stderr);
  const edited = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    seeded.json.record.sha256,
    "--input",
    await writeJson(root, "edit.json", {
      edits: [
        {
          target: { kind: "proposal", title: "First proposal" },
          set: { expectedEvidence: "Updated first evidence" },
          add: { dependencies: ["Second proposal"] },
        },
      ],
    }),
  );
  assert.equal(edited.exitCode, 0, edited.stderr);
  assert.deepEqual(edited.json.affectedIds, []);
  assert.match(JSON.stringify(edited.json.changedPaths), /First proposal/);
  const entity = await runRawScript(
    root,
    "view",
    "--record",
    recordPath,
    "--view",
    "entity",
    "--entity",
    "Second proposal",
  );
  assert.equal(entity.exitCode, 0, entity.stderr);
  assert.match(entity.stdout, /Second evidence/);
  assert.doesNotMatch(entity.stdout, /Updated first evidence/);
});

test("schema exposes update input without implementation inspection", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const schema = await runRawScript(root, "schema", "--command", "all");
  assert.equal(schema.exitCode, 0, schema.stderr);
  assert.match(schema.stdout, /edits/);
  assert.match(schema.stdout, /replaceText/);
  assert.match(schema.stdout, /old.*exact.*new.*replacement/);
  assert.match(schema.stdout, /field.*old.*exact.*new.*replacement/);
  assert.match(schema.stdout, /moveBefore|moveAfter/);
  assert.match(schema.stdout, /candidateText/);
  assert.match(schema.stdout, /coverage/);
  assert.match(schema.stdout, /sourceUnits/);
  assert.match(schema.stdout, /kind.*content\|blank/);
  assert.match(schema.stdout, /preservation/);
  assert.doesNotMatch(schema.stdout, /^\s*\{/);
});

test("precise edits support text replacement, rename, reorder, and strict types", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "edit-operations",
    "--input",
    await writeJson(root, "init.json", { taskName: "Edit operations", goal: "old goal" }),
  );
  const recordPath = initialized.json.record.path;
  let sha = initialized.json.record.sha256;
  for (const [name, type] of [
    ["Alpha", "Delivery"],
    ["Beta", "Learning"],
    ["Gamma", "Deepening"],
  ]) {
    const added = await runScript(
      root,
      "update",
      "--record",
      recordPath,
      "--expected-sha",
      sha,
      "--input",
      await writeJson(root, `${name}.json`, {
        proposal: {
          operation: "add",
          title: name,
          type,
          intendedResult: `${name} result`,
          expectedEvidence: `${name} evidence`,
        },
      }),
    );
    assert.equal(added.exitCode, 0, added.stderr);
    sha = added.json.record.sha256;
  }
  const edited = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    sha,
    "--input",
    await writeJson(root, "precise.json", {
      edits: [
        { target: "currentContext.goal", replaceText: { old: "old", new: "new" } },
        { target: { kind: "proposal", title: "Alpha" }, rename: "Renamed Alpha", moveAfter: "Gamma" },
      ],
    }),
  );
  assert.equal(edited.exitCode, 0, edited.stderr);
  assert.match(JSON.stringify(edited.json.changedPaths), /currentContext\.goal/);
  const full = await runRawScript(root, "view", "--record", recordPath, "--view", "full");
  assert.equal(full.exitCode, 0, full.stderr);
  assert.match(full.stdout, /new goal/);
  assert.match(full.stdout, /Gamma[\s\S]*Renamed Alpha/);
  assert.doesNotMatch(full.stdout, /### Alpha\n/);

  const rejected = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    edited.json.record.sha256,
    "--input",
    await writeJson(root, "wrong-type.json", {
      edits: [{ target: { kind: "proposal", title: "Beta" }, set: { expectedEvidence: ["wrong"] } }],
    }),
  );
  assert.equal(rejected.exitCode, 1);
  assert.equal(rejected.json.errors[0].code, "invalid-edit-type");
  assert.equal(rejected.json.record.sha256, edited.json.record.sha256);
});

function migrationCoverage(sourceUnits, rules = {}) {
  return sourceUnits.map((unit) => {
    const rule = rules[unit.line] ?? { disposition: "formatting-normalized", targetPaths: ["currentContext"] };
    return { ...unit, ...rule };
  });
}

test("migrate records complete source coverage and immutable recovery evidence", async (t) => {
  const root = await makeWorkspace();
  const candidateRoot = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  t.after(() => rm(candidateRoot, { recursive: true, force: true }));
  const recordDirectory = join(root, ".freeflow", "tasks", "task-001-legacy");
  await mkdir(recordDirectory, { recursive: true });
  const recordPath = join(recordDirectory, "record.md");
  const legacyText = [
    "# Working Record: Legacy task",
    "",
    "State: Active",
    "Last updated: 2026-08-15T00:00:00Z",
    "",
    "## Current Context",
    "Goal: Preserve the legacy source",
    "",
    "## Current Work",
    "### Current Slice",
    "None",
    "",
  ].join("\n");
  await writeFile(recordPath, legacyText);
  const candidateInit = await runScript(
    candidateRoot,
    "init",
    "--root",
    candidateRoot,
    "--name",
    "candidate",
    "--input",
    await writeJson(candidateRoot, "init.json", { taskName: "Candidate", goal: "Preserve the legacy source" }),
  );
  const candidateText = (await readFile(join(candidateRoot, candidateInit.json.record.path), "utf8")).replace(
    /^# Working Record:.*$/m,
    "# Working Record: Legacy task",
  );
  const inspection = await runScript(root, "inspect", "--root", root, "--record", recordPath);
  assert.equal(inspection.exitCode, 0, inspection.stderr);
  assert.equal(inspection.json.inspection.byteCount, Buffer.byteLength(legacyText, "utf8"));
  const sourceUnits = inspection.json.inspection.sourceUnits;
  assert.equal(sourceUnits.length, legacyText.split(/(?<=\n)/).length);
  const migrationInput = {
    authoritySource: "User authorized legacy conversion",
    reason: "Preserve representation while moving to schema v2",
    candidateText,
    coverage: migrationCoverage(sourceUnits, {
      1: { disposition: "verbatim", targetPaths: ["taskName"] },
      3: { disposition: "represented", targetPaths: ["taskState"] },
      4: { disposition: "represented", targetPaths: ["lastUpdated"] },
      6: { disposition: "projection-only", targetPaths: ["currentContext"] },
      7: { disposition: "projection-only", targetPaths: ["currentContext.goal"] },
      9: { disposition: "projection-only", targetPaths: ["currentWork"] },
      10: { disposition: "projection-only", targetPaths: ["currentWork.currentSlice"] },
      11: { disposition: "projection-only", targetPaths: ["currentWork.currentSlice"] },
    }),
  };
  const incomplete = await runScript(
    root,
    "migrate",
    "--root",
    root,
    "--record",
    recordPath,
    "--expected-sha",
    sha256(legacyText),
    "--input",
    await writeJson(root, "migrate-incomplete.json", { ...migrationInput, coverage: migrationInput.coverage.slice(1) }),
  );
  assert.equal(incomplete.exitCode, 1);
  assert.equal(incomplete.json.errors[0].code, "unmapped-source");
  const semanticCompression = await runScript(
    root,
    "migrate",
    "--root",
    root,
    "--record",
    recordPath,
    "--expected-sha",
    sha256(legacyText),
    "--input",
    await writeJson(root, "migrate-compression.json", {
      ...migrationInput,
      coverage: migrationInput.coverage.map((entry, index) =>
        index === 0 ? { ...entry, disposition: "summarized" } : entry,
      ),
    }),
  );
  assert.equal(semanticCompression.exitCode, 1);
  assert.equal(semanticCompression.json.errors[0].code, "invalid-migration-disposition");
  const falseVerbatim = await runScript(
    root,
    "migrate",
    "--root",
    root,
    "--record",
    recordPath,
    "--expected-sha",
    sha256(legacyText),
    "--input",
    await writeJson(root, "migrate-false-verbatim.json", {
      ...migrationInput,
      coverage: migrationInput.coverage.map((entry, index) =>
        index === 6 ? { ...entry, disposition: "verbatim" } : entry,
      ),
    }),
  );
  assert.equal(falseVerbatim.exitCode, 1);
  assert.equal(falseVerbatim.json.errors[0].code, "unrepresented-source");
  const invalidVerbatimTarget = await runScript(
    root,
    "migrate",
    "--root",
    root,
    "--record",
    recordPath,
    "--expected-sha",
    sha256(legacyText),
    "--input",
    await writeJson(root, "migrate-invalid-verbatim-target.json", {
      ...migrationInput,
      coverage: migrationInput.coverage.map((entry, index) =>
        index === 0 ? { ...entry, targetPaths: ["missing.path"] } : entry,
      ),
    }),
  );
  assert.equal(invalidVerbatimTarget.exitCode, 1);
  assert.equal(invalidVerbatimTarget.json.errors[0].code, "unmapped-source");
  const missingTarget = await runScript(
    root,
    "migrate",
    "--root",
    root,
    "--record",
    recordPath,
    "--expected-sha",
    sha256(legacyText),
    "--input",
    await writeJson(root, "migrate-missing-target.json", {
      ...migrationInput,
      coverage: migrationInput.coverage.map((entry, index) =>
        index === 1 ? { ...entry, targetPaths: ["missing.path"] } : entry,
      ),
    }),
  );
  assert.equal(missingTarget.exitCode, 1);
  assert.equal(missingTarget.json.errors[0].code, "unmapped-source");

  const migrated = await runScript(
    root,
    "migrate",
    "--root",
    root,
    "--record",
    recordPath,
    "--expected-sha",
    sha256(legacyText),
    "--input",
    await writeJson(root, "migrate.json", migrationInput),
  );
  assert.equal(migrated.exitCode, 0, `${migrated.stderr}\n${migrated.stdout}`);
  assert.equal(migrated.json.status, "updated");
  assert.equal(migrated.json.sourceKind, "legacy");
  assert.equal(migrated.json.coverage.length, sourceUnits.length);
  const snapshotRoot = join(recordDirectory, "snapshots", sha256(legacyText));
  assert.equal(await readFile(join(snapshotRoot, "record.md"), "utf8"), legacyText);
  assert.equal((await readFile(join(snapshotRoot, "source.json"), "utf8")).includes(sha256(legacyText)), true);
  const operationEntries = await readdir(join(snapshotRoot, "operations"));
  assert.equal(operationEntries.length, 1);
  const migratedView = await runRawScript(root, "view", "--root", root, "--record", recordPath, "--view", "full");
  assert.equal(migratedView.exitCode, 0, `${migratedView.stderr}\n${migratedView.stdout}`);
  assert.match(migratedView.stdout, /Schema: 2/);
});

test("migrate consumes duplicate verbatim source units one-for-one", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const recordDirectory = join(root, ".freeflow", "tasks", "task-001-duplicate");
  await mkdir(recordDirectory, { recursive: true });
  const recordPath = join(recordDirectory, "record.md");
  const sourceText = [
    "# Working Record: Duplicate",
    "# Working Record: Duplicate",
    "",
    "State: Active",
    "Last updated: 2026-08-15T00:00:00Z",
    "",
    "## Current Context",
    "Goal: Duplicate source",
    "",
    "## Current Work",
    "### Current Slice",
    "None",
    "",
  ].join("\n");
  await writeFile(recordPath, sourceText);
  const candidateInit = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "duplicate-candidate",
    "--input",
    await writeJson(root, "duplicate-init.json", { taskName: "Duplicate", goal: "Duplicate source" }),
  );
  const candidateText = await readFile(join(root, candidateInit.json.record.path), "utf8");
  const inspection = await runScript(root, "inspect", "--root", root, "--record", recordPath);
  assert.equal(inspection.exitCode, 0, inspection.stderr);
  const coverage = migrationCoverage(inspection.json.inspection.sourceUnits, {
    1: { disposition: "verbatim", targetPaths: ["taskName"] },
    2: { disposition: "verbatim", targetPaths: ["taskName"] },
  });
  const dryRun = await runScript(
    root,
    "migrate",
    "--root",
    root,
    "--record",
    recordPath,
    "--expected-sha",
    sha256(sourceText),
    "--input",
    await writeJson(root, "duplicate-migrate.json", {
      authoritySource: "User authorized migration proof",
      reason: "Check duplicate source accounting",
      candidateText,
      coverage,
    }),
    "--dry-run",
  );
  assert.equal(dryRun.exitCode, 1);
  assert.equal(dryRun.json.errors[0].code, "unrepresented-source");
});

test("legacy inspect reports exact source bytes and unit boundaries", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const recordDirectory = join(root, ".freeflow", "tasks", "task-001-crlf");
  await mkdir(recordDirectory, { recursive: true });
  const recordPath = join(recordDirectory, "record.md");
  const sourceText = [
    "# Working Record: Café",
    "",
    "State: Active",
    "Last updated: 2026-08-15T00:00:00Z",
    "",
    "## Current Context",
    "Goal: naïve bytes",
    "",
    "## Current Work",
    "### Current Slice",
    "None",
    "",
  ].join("\r\n");
  await writeFile(recordPath, sourceText);
  const inspection = await runScript(root, "inspect", "--root", root, "--record", recordPath);
  assert.equal(inspection.exitCode, 0, inspection.stderr);
  const sourceUnits = inspection.json.inspection.sourceUnits;
  assert.equal(inspection.json.inspection.byteCount, Buffer.byteLength(sourceText, "utf8"));
  assert.equal(sourceUnits[0].sourceSha256, sha256("# Working Record: Café\r\n"));
  assert.equal(sourceUnits.at(-1).endByte, Buffer.byteLength(sourceText, "utf8"));
  assert.ok(sourceUnits.some((unit) => unit.kind === "blank"));
});

test("migrate accepts unsupported schema sources without ordinary mutation", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const recordDirectory = join(root, ".freeflow", "tasks", "task-001-unsupported");
  await mkdir(recordDirectory, { recursive: true });
  const recordPath = join(recordDirectory, "record.md");
  const sourceText = [
    "# Working Record: Unsupported task",
    "",
    "Schema: 1",
    "State: Active",
    "Last updated: 2026-08-15T00:00:00Z",
    "",
    "## Current Context",
    "Goal: Preserve unsupported source",
    "",
    "## Current Work",
    "### Current Slice",
    "None",
    "## Proposed Slices",
    "## History",
    "### Decisions",
    "### Checkpoints",
    "### Slices",
    "## Notes",
    "",
  ].join("\n");
  await writeFile(recordPath, sourceText);
  const candidateInit = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "candidate",
    "--input",
    await writeJson(root, "unsupported-init.json", {
      taskName: "Unsupported task",
      goal: "Preserve unsupported source",
    }),
  );
  const candidateText = (await readFile(join(root, candidateInit.json.record.path), "utf8")).replace(
    /^# Working Record:.*$/m,
    "# Working Record: Unsupported task",
  );
  const inspection = await runScript(root, "inspect", "--root", root, "--record", recordPath);
  assert.equal(inspection.exitCode, 0, inspection.stderr);
  assert.equal(inspection.json.inspection.byteCount, Buffer.byteLength(sourceText, "utf8"));
  const sourceUnits = inspection.json.inspection.sourceUnits;
  const migrated = await runScript(
    root,
    "migrate",
    "--root",
    root,
    "--record",
    recordPath,
    "--expected-sha",
    sha256(sourceText),
    "--input",
    await writeJson(root, "unsupported-migrate.json", {
      authoritySource: "User authorized unsupported-schema conversion",
      reason: "Preserve the unsupported source as schema v2",
      candidateText,
      coverage: migrationCoverage(sourceUnits, {
        1: { disposition: "represented", targetPaths: ["taskName"] },
        3: { disposition: "represented", targetPaths: ["schemaVersion"] },
        4: { disposition: "represented", targetPaths: ["taskState"] },
        5: { disposition: "represented", targetPaths: ["lastUpdated"] },
        7: { disposition: "projection-only", targetPaths: ["currentContext"] },
        8: { disposition: "projection-only", targetPaths: ["currentContext.goal"] },
        10: { disposition: "projection-only", targetPaths: ["currentWork"] },
        11: { disposition: "projection-only", targetPaths: ["currentWork.currentSlice"] },
        12: { disposition: "projection-only", targetPaths: ["currentWork.currentSlice"] },
        13: { disposition: "formatting-normalized", targetPaths: ["proposals"] },
        14: { disposition: "formatting-normalized", targetPaths: ["history"] },
        15: { disposition: "formatting-normalized", targetPaths: ["history.decisions"] },
        16: { disposition: "formatting-normalized", targetPaths: ["history.checkpoints"] },
        17: { disposition: "formatting-normalized", targetPaths: ["history.slices"] },
        18: { disposition: "formatting-normalized", targetPaths: ["notes"] },
      }),
    }),
  );
  assert.equal(migrated.exitCode, 0, `${migrated.stderr}\n${migrated.stdout}`);
  assert.equal(migrated.json.sourceKind, "unsupported");
  const snapshotRoot = join(recordDirectory, "snapshots", sha256(sourceText));
  const sourceMetadata = JSON.parse(await readFile(join(snapshotRoot, "source.json"), "utf8"));
  assert.equal(sourceMetadata.schemaVersion, 1);
});

test("compress requires explicit scope, protects invariants, and snapshots the source", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "compress-scope",
    "--input",
    await writeJson(root, "init.json", { taskName: "Compress scope", goal: "A long goal that can be shortened" }),
  );
  const recordPath = join(root, initialized.json.record.path);
  const sourceText = await readFile(recordPath, "utf8");
  const candidateText = sourceText.replace("A long goal that can be shortened", "A shorter goal");
  const rewriteInput = {
    authoritySource: "User authorized bounded compaction",
    reason: "Remove redundant goal wording",
    preservation: "The goal remains semantically equivalent; no protected lifecycle or evidence facts changed.",
    scope: ["currentContext.goal"],
    candidateText,
  };
  const dryRun = await runScript(
    root,
    "compress",
    "--root",
    root,
    "--record",
    recordPath,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "compress-dry-run.json", rewriteInput),
    "--dry-run",
  );
  assert.equal(dryRun.exitCode, 0, `${dryRun.stderr}\n${dryRun.stdout}`);
  assert.equal(dryRun.json.status, "dry-run");
  await assert.rejects(readdir(join(dirname(recordPath), "snapshots")));
  assert.equal(await readFile(recordPath, "utf8"), sourceText);

  const snapshotFailure = await runScript(
    root,
    "compress",
    "--root",
    root,
    "--record",
    recordPath,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "compress-snapshot-failure.json", rewriteInput),
    { __env: { FREEFLOW_TEST_FAILURE: "snapshot-write" } },
  );
  assert.equal(snapshotFailure.exitCode, 1);
  assert.equal(snapshotFailure.json.errors[0].code, "snapshot-write-failure");
  assert.equal(await readFile(recordPath, "utf8"), sourceText);
  const renameFailure = await runScript(
    root,
    "compress",
    "--root",
    root,
    "--record",
    recordPath,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "compress-rename-failure.json", rewriteInput),
    { __env: { FREEFLOW_TEST_FAILURE: "rename" } },
  );
  assert.equal(renameFailure.exitCode, 1);
  assert.equal(renameFailure.json.errors[0].code, "rename-failure");
  assert.equal(await readFile(recordPath, "utf8"), sourceText);

  const compressed = await runScript(
    root,
    "compress",
    "--root",
    root,
    "--record",
    recordPath,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "compress.json", rewriteInput),
  );
  assert.equal(compressed.exitCode, 0, `${compressed.stderr}\n${compressed.stdout}`);
  assert.equal(compressed.json.status, "updated");
  assert.match(JSON.stringify(compressed.json.changedPaths), /currentContext\.goal/);
  const snapshotRoot = join(dirname(recordPath), "snapshots", initialized.json.record.sha256);
  assert.equal(await readFile(join(snapshotRoot, "record.md"), "utf8"), sourceText);
  const manifestName = (await readdir(join(snapshotRoot, "operations")))[0];
  const manifest = JSON.parse(await readFile(join(snapshotRoot, "operations", manifestName), "utf8"));
  assert.equal(manifest.operation, "compress");
  assert.deepEqual(manifest.scope, ["currentContext.goal"]);

  const rejected = await runScript(
    root,
    "compress",
    "--root",
    root,
    "--record",
    recordPath,
    "--expected-sha",
    compressed.json.record.sha256,
    "--input",
    await writeJson(root, "out-of-scope.json", {
      authoritySource: "User authorized bounded compaction",
      reason: "Attempt an unscoped rewrite",
      preservation: "Protected state is unchanged.",
      scope: ["currentContext.goal"],
      candidateText: (await readFile(recordPath, "utf8"))
        .replace("A shorter goal", "Another goal")
        .replace("## Current Context", "## Current Context\n### Settled\nUnexpected change"),
    }),
  );
  assert.equal(rejected.exitCode, 1);
  assert.equal(rejected.json.errors[0].code, "rewrite-out-of-scope", JSON.stringify(rejected.json));
  const protectedChange = await runScript(
    root,
    "compress",
    "--root",
    root,
    "--record",
    recordPath,
    "--expected-sha",
    compressed.json.record.sha256,
    "--input",
    await writeJson(root, "protected-change.json", {
      authoritySource: "User authorized bounded compaction",
      reason: "Attempt to change protected task state",
      preservation: "This declaration is intentionally false for the rejection test.",
      scope: ["taskState"],
      candidateText: (await readFile(recordPath, "utf8")).replace("State: Active", "State: Paused"),
    }),
  );
  assert.equal(protectedChange.exitCode, 1);
  assert.equal(protectedChange.json.errors[0].code, "protected-invariant");

  const confirmationCandidate = (await readFile(recordPath, "utf8")).replace("A shorter goal", "Final goal");
  const confirmationFailure = await runScript(
    root,
    "compress",
    "--root",
    root,
    "--record",
    recordPath,
    "--expected-sha",
    compressed.json.record.sha256,
    "--input",
    await writeJson(root, "compress-confirmation-failure.json", {
      ...rewriteInput,
      candidateText: confirmationCandidate,
    }),
    { __env: { FREEFLOW_TEST_FAILURE: "confirmation" } },
  );
  assert.equal(confirmationFailure.exitCode, 2);
  assert.equal(confirmationFailure.json.status, "committed-unconfirmed");
  assert.equal(confirmationFailure.json.recovery.required, true);
  assert.notEqual(sha256(await readFile(recordPath, "utf8")), compressed.json.record.sha256);
});

test("resume stays bounded when settled history grows", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "scale-history",
    "--input",
    await writeJson(root, "init.json", { taskName: "Scale history", goal: "Keep resume bounded" }),
  );
  const recordPath = initialized.json.record.path;
  let sha = initialized.json.record.sha256;
  for (let index = 1; index <= 100; index += 1) {
    const started = await runScript(
      root,
      "start",
      "--record",
      recordPath,
      "--expected-sha",
      sha,
      "--input",
      await writeJson(root, `start-${index}.json`, {
        title: `Outcome ${index}`,
        type: "Delivery",
        intendedResult: `Settle outcome ${index}`,
        authoritySource: "User authorized scale fixture",
        reasonAndScope: "Measure bounded resume output",
        expectedEvidence: "Scale fixture evidence",
        stopCondition: "Stop after one outcome",
      }),
    );
    assert.equal(started.exitCode, 0, started.stderr);
    const closed = await runScript(
      root,
      "close",
      "--record",
      recordPath,
      "--expected-sha",
      started.json.record.sha256,
      "--input",
      await writeJson(root, `close-${index}.json`, {
        sliceId: `S-${String(index).padStart(3, "0")}`,
        finalState: "Completed",
        outcome: `Outcome ${index} settled`,
        evidence: ["scale fixture"],
      }),
    );
    assert.equal(closed.exitCode, 0, closed.stderr);
    sha = closed.json.record.sha256;
  }
  const resumed = await runRawScript(root, "view", "--record", recordPath, "--view", "resume");
  assert.equal(resumed.exitCode, 0, resumed.stderr);
  assert.match(resumed.stdout, /Current slice: None/);
  assert.doesNotMatch(resumed.stdout, /Outcome 1 settled/);
  assert.ok(Buffer.byteLength(resumed.stdout, "utf8") < 2500, "resume should not scale with settled history");
  const full = await runRawScript(root, "view", "--record", recordPath, "--view", "full");
  assert.equal(full.exitCode, 0, full.stderr);
  assert.equal((full.stdout.match(/#### S-\d{3} —/g) ?? []).length, 100);
  assert.doesNotMatch(full.stdout, /Reopen snapshot/);
});

test("blocked and abandoned historical slices can be explicitly reopened", async (t) => {
  for (const finalState of ["Blocked", "Abandoned"]) {
    const root = await makeWorkspace();
    t.after(() => rm(root, { recursive: true, force: true }));
    const type = finalState === "Blocked" ? "Learning" : "Deepening";
    const initialized = await runScript(
      root,
      "init",
      "--root",
      root,
      "--name",
      `${finalState.toLowerCase()}-reopen`,
      "--input",
      await writeJson(root, "init.json", { taskName: `${finalState} reopen` }),
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
        title: `${finalState} outcome`,
        type,
        intendedResult: `Continue the ${finalState.toLowerCase()} outcome`,
        authoritySource: "User explicitly authorized the outcome",
        reasonAndScope: "Exercise historical reopening",
        expectedEvidence: "Reopen transition evidence",
        stopCondition: "Stop after reopening is verified",
      }),
    );
    let sha = started.json.record.sha256;
    if (finalState === "Blocked") {
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
          blocker: {
            blocker: "A required decision is missing",
            why: "Safe continuation is unavailable",
            required: "User decision",
          },
          resumeWhen: "The user decides",
        }),
      );
      sha = blocked.json.record.sha256;
    }
    const closeInput =
      finalState === "Blocked"
        ? {
            sliceId: "S-001",
            finalState,
            authoritySource: "User explicitly parked the outcome",
            outcome: "The outcome was parked with its blocker",
            evidence: ["blocked-state evidence"],
          }
        : {
            sliceId: "S-001",
            finalState,
            authoritySource: "User explicitly abandoned the outcome",
            abandonmentReason: "The original route was no longer pursued",
            residualEffects: "No implementation was published",
            outcome: "The outcome was abandoned with residual effects recorded",
            evidence: ["abandonment evidence"],
          };
    const closed = await runScript(
      root,
      "close",
      "--record",
      recordPath,
      "--expected-sha",
      sha,
      "--input",
      await writeJson(root, "close.json", closeInput),
    );
    assert.equal(closed.exitCode, 0, closed.stderr);
    const reopened = await runScript(
      root,
      "reopen",
      "--record",
      recordPath,
      "--expected-sha",
      closed.json.record.sha256,
      "--input",
      await writeJson(root, "reopen.json", {
        sliceId: "S-001",
        authoritySource: `User explicitly authorized reopening the ${finalState.toLowerCase()} outcome`,
        reopenReason: `The ${finalState.toLowerCase()} outcome remains the intended result`,
        reasonAndScope: `Continue the ${finalState.toLowerCase()} outcome within its original boundary`,
        expectedEvidence: "Fresh continuation verification",
        stopCondition: "Stop after continuation is settled",
      }),
    );
    assert.equal(reopened.exitCode, 0, reopened.stderr);
    assert.deepEqual(reopened.json.record.currentSlice, { id: "S-001", state: "In progress", type });
    const view = await runScript(root, "view", "--record", recordPath, "--view", "execute");
    assert.match(view.json.view.content, /Reopen history/);
    assert.match(view.json.view.content, new RegExp(`priorState\\":\\"${finalState}`));
    assert.match(
      view.json.view.content,
      new RegExp(finalState === "Blocked" ? "A required decision is missing" : "No implementation was published"),
    );
  }
});
