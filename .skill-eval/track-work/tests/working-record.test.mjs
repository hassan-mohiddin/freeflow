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
  assert.equal(locked.json.errors[0].code, "lock-metadata-invalid");
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

  const displacedRoot = await makeWorkspace();
  t.after(() => rm(displacedRoot, { recursive: true, force: true }));
  const displacedTask = join(displacedRoot, ".freeflow", "tasks", "task-002-displaced");
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
  const entity = await runScript(root, "view", "--record", recordPath, "--view", "entity", "--entity", "S-001");
  assert.equal(entity.exitCode, 0, entity.stderr);
  assert.match(entity.json.view.content, /Reopen history/);
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

test("decision supersession is atomic and rejects malformed references", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "decision-supersession",
    "--input",
    await writeJson(root, "init.json", { taskName: "Decision supersession" }),
  );
  const recordPath = initialized.json.record.path;
  let sha = initialized.json.record.sha256;

  for (const title of ["Original decision", "Replacement decision"]) {
    const added = await runScript(
      root,
      "update",
      "--record",
      recordPath,
      "--expected-sha",
      sha,
      "--input",
      await writeJson(root, `${title}.json`, {
        decision: { operation: "add", title, decision: title },
      }),
    );
    assert.equal(added.exitCode, 0, added.stderr);
    sha = added.json.record.sha256;
  }

  const malformed = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    sha,
    "--input",
    await writeJson(root, "malformed.json", {
      decision: { operation: "add", title: "Malformed", supersedes: ["D-001"] },
    }),
  );
  assert.equal(malformed.exitCode, 1);
  assert.equal(malformed.json.errors[0].code, "invalid-decision-reference");
  assert.equal(malformed.json.record.sha256, sha);

  const directLink = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    sha,
    "--input",
    await writeJson(root, "direct-link.json", {
      edits: [{ target: { kind: "decision", id: "D-001" }, set: { supersededBy: "D-002" } }],
    }),
  );
  assert.equal(directLink.exitCode, 1);
  assert.equal(directLink.json.errors[0].code, "immutable-edit-field");
  assert.equal(directLink.json.record.sha256, sha);

  const superseded = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    sha,
    "--input",
    await writeJson(root, "supersede.json", {
      decision: { operation: "supersede", id: "D-001", supersededBy: "D-002" },
    }),
  );
  assert.equal(superseded.exitCode, 0, superseded.stderr);

  const original = await runRawScript(root, "view", "--record", recordPath, "--view", "entity", "--entity", "D-001");
  assert.equal(original.exitCode, 0, original.stderr);
  assert.match(original.stdout, /State: Superseded/);
  assert.match(original.stdout, /Superseded by: D-002/);

  const replacement = await runRawScript(root, "view", "--record", recordPath, "--view", "entity", "--entity", "D-002");
  assert.equal(replacement.exitCode, 0, replacement.stderr);
  assert.match(replacement.stdout, /Supersedes: D-001/);
});

test("precise decision removal requires the decision lifecycle operation", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "decision-removal",
    "--input",
    await writeJson(root, "init.json", { taskName: "Decision removal" }),
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
    await writeJson(root, "decision.json", {
      decision: { operation: "add", title: "Retain this decision", decision: "Retain" },
    }),
  );
  assert.equal(added.exitCode, 0, added.stderr);

  const removed = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    added.json.record.sha256,
    "--input",
    await writeJson(root, "remove.json", {
      edits: [{ target: { kind: "decisions" }, removeEntity: { title: "Retain this decision" } }],
    }),
  );
  assert.equal(removed.exitCode, 1);
  assert.equal(removed.json.errors[0].code, "decision-removal-requires-lifecycle");
  assert.equal(removed.json.record.sha256, added.json.record.sha256);
});

test("schema and help expose initialization, supersession, and scalar context edits", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initSchema = await runRawScript(root, "schema", "--command", "init");
  assert.equal(initSchema.exitCode, 0, initSchema.stderr);
  assert.match(initSchema.stdout, /taskName/);
  assert.match(initSchema.stdout, /whatDefinesTask/);
  assert.match(initSchema.stdout, /settled/);

  const updateSchema = await runRawScript(root, "schema", "--command", "update");
  assert.equal(updateSchema.exitCode, 0, updateSchema.stderr);
  assert.match(updateSchema.stdout, /supersede/);
  assert.match(updateSchema.stdout, /supersededBy/);
  assert.match(updateSchema.stdout, /scalar string/);

  const help = await runRawScript(root, "schema", "--help");
  assert.equal(help.exitCode, 0, help.stderr);
  assert.match(help.stdout, /Usage:/);
});

test("scalar context fields support direct replacement", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "scalar-context",
    "--input",
    await writeJson(root, "init.json", { taskName: "Scalar context", settled: "old settled" }),
  );
  const edited = await runScript(
    root,
    "update",
    "--record",
    initialized.json.record.path,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "edit.json", {
      edits: [{ target: "currentContext.settled", set: "new settled" }],
    }),
  );
  assert.equal(edited.exitCode, 0, edited.stderr);
  const full = await runRawScript(root, "view", "--record", initialized.json.record.path, "--view", "full");
  assert.equal(full.exitCode, 0, full.stderr);
  assert.match(full.stdout, /### Settled\nnew settled/);
});

test("schema exposes update input without implementation inspection", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const schema = await runRawScript(root, "schema", "--command", "all");
  assert.equal(schema.exitCode, 0, schema.stderr);
  assert.match(schema.stdout, /edits/);
  assert.match(schema.stdout, /replaceText/);
  assert.match(schema.stdout, /"old": "old text"/);
  assert.match(schema.stdout, /"new": "new text"/);
  assert.match(schema.stdout, /addEntity/);
  assert.match(schema.stdout, /Select pending checkpoint/);
  assert.match(schema.stdout, /Resolve pending checkpoint/);
  assert.match(schema.stdout, /selectedCheckpoints/);
  assert.match(schema.stdout, /upcomingCheckpoints/);
  assert.match(schema.stdout, /exact same title/);
  assert.match(schema.stdout, /moveBefore|moveAfter/);
  assert.match(schema.stdout, /candidateText/);
  assert.match(schema.stdout, /coverage/);
  assert.match(schema.stdout, /sourceUnits/);
  assert.match(schema.stdout, /kind.*content\|blank/);
  assert.match(schema.stdout, /preservation/);
  assert.doesNotMatch(schema.stdout, /"finalState": "Completed\\|Blocked\\|Abandoned"/);
  assert.doesNotMatch(schema.stdout, /^\s*\{/);
});

test("schema update examples are valid JSON and expose checkpoint mutation", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const schema = await runRawScript(root, "schema", "--command", "update");
  assert.equal(schema.exitCode, 0, schema.stderr);
  const examples = [...schema.stdout.matchAll(/```json\n([\s\S]*?)```/g)].map((match) => match[1]);
  assert.ok(examples.length >= 5);
  for (const example of examples) assert.doesNotThrow(() => JSON.parse(example));
  assert.match(schema.stdout, /Add checkpoint/);
  assert.match(schema.stdout, /"kind": "checkpoints"/);
  assert.match(schema.stdout, /"selectedBy"/);
  assert.match(schema.stdout, /"condition"/);
  assert.match(schema.stdout, /"result": "Completed"/);
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

test("round-trips current-slice list fields without changing their values", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "list-round-trip",
    "--input",
    await writeJson(root, "init.json", { taskName: "List round trip" }),
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
      title: "List-valued slice",
      type: "Delivery",
      authoritySource: "user",
      intendedResult: "Preserve list values",
      reasonAndScope: "Exercise list round-tripping",
      expectedEvidence: "The first dependency can be removed by its original value",
      stopCondition: "Stop after the focused edit",
      dependencies: ["dep-one", "dep-two"],
      selectedCheckpoints: ["review-one"],
    }),
  );
  assert.equal(started.exitCode, 0, started.stderr);

  const edited = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    started.json.record.sha256,
    "--input",
    await writeJson(root, "edit.json", {
      edits: [
        {
          target: { kind: "currentSlice" },
          remove: { dependencies: ["dep-one"] },
          add: { dependencies: ["dep-three"] },
        },
      ],
    }),
  );
  assert.equal(edited.exitCode, 0, edited.stderr);

  const view = await runRawScript(root, "view", "--record", recordPath, "--view", "execute");
  assert.equal(view.exitCode, 0, view.stderr);
  assert.doesNotMatch(view.stdout, /dep-one/);
  assert.match(view.stdout, /dep-two/);
  assert.match(view.stdout, /dep-three/);
  assert.match(view.stdout, /review-one/);
});

test("rejects unknown and mixed update input without changing the record", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "strict-update-input",
    "--input",
    await writeJson(root, "init.json", { taskName: "Strict update input", goal: "original" }),
  );
  const recordPath = initialized.json.record.path;
  const mixed = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "mixed.json", {
      edits: [{ target: "currentContext.goal", set: "changed" }],
      note: { operation: "add", title: "Must not be silently ignored", source: "user", body: "body" },
    }),
  );
  assert.equal(mixed.exitCode, 1);
  assert.equal(mixed.json.errors[0].code, "mixed-update-input");
  assert.equal(mixed.json.record.sha256, initialized.json.record.sha256);

  const unknown = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "unknown.json", { notAWorkingRecordField: "ignored" }),
  );
  assert.equal(unknown.exitCode, 1);
  assert.equal(unknown.json.errors[0].code, "unknown-input-field");
  assert.equal(unknown.json.record.sha256, initialized.json.record.sha256);
});

test("rejects incompatible direct update values without changing the record", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "strict-update-types",
    "--input",
    await writeJson(root, "init.json", { taskName: "Strict update types", goal: "original" }),
  );
  const recordPath = initialized.json.record.path;
  const invalidGoal = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "invalid-goal.json", { goal: { unexpected: true } }),
  );
  assert.equal(invalidGoal.exitCode, 1);
  assert.equal(invalidGoal.json.errors[0].code, "invalid-input-type");
  assert.equal(invalidGoal.json.record.sha256, initialized.json.record.sha256);

  const invalidBlockers = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "invalid-blockers.json", { blockers: "not-an-array" }),
  );
  assert.equal(invalidBlockers.exitCode, 1);
  assert.equal(invalidBlockers.json.errors[0].code, "invalid-input-type");
  assert.equal(invalidBlockers.json.record.sha256, initialized.json.record.sha256);
});

test("replaceText accepts equivalent CRLF text in normalized record fields", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "replace-line-endings",
    "--input",
    await writeJson(root, "init.json", { taskName: "Replace line endings", goal: "line one\nline two" }),
  );
  const replaced = await runScript(
    root,
    "update",
    "--record",
    initialized.json.record.path,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "replace.json", {
      edits: [
        {
          target: "currentContext.goal",
          replaceText: { old: "line one\r\nline two", new: "changed" },
        },
      ],
    }),
  );
  assert.equal(replaced.exitCode, 0, replaced.stderr);
  const view = await runRawScript(root, "view", "--record", initialized.json.record.path, "--view", "resume");
  assert.equal(view.exitCode, 0, view.stderr);
  assert.match(view.stdout, /### Goal\nchanged/);
});

test("no-op updates preserve existing record bytes and timestamp", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "noop-bytes",
    "--input",
    await writeJson(root, "init.json", { taskName: "No-op bytes" }),
  );
  const recordPath = initialized.json.record.path;
  const absolutePath = join(root, recordPath);
  const original = await readFile(absolutePath, "utf8");
  const crlf = original.replace(/\n/g, "\r\n");
  await writeFile(absolutePath, crlf);
  const crlfSha = sha256(crlf);

  const noOp = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    crlfSha,
    "--input",
    await writeJson(root, "noop.json", {}),
  );
  assert.equal(noOp.exitCode, 0, noOp.stderr);
  assert.equal(noOp.json.status, "no-change");
  assert.equal(noOp.json.beforeSha256, crlfSha);
  assert.equal(noOp.json.afterSha256, crlfSha);
  assert.equal(await readFile(absolutePath, "utf8"), crlf);
});

test("rejects entity titles that can change Markdown structure", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "safe-titles",
    "--input",
    await writeJson(root, "init.json", { taskName: "Safe titles" }),
  );
  const recordPath = initialized.json.record.path;

  const invalidNote = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "invalid-note.json", {
      note: { operation: "add", title: "Title\n### Injected", source: "user", body: "body" },
    }),
  );
  assert.equal(invalidNote.exitCode, 1);
  assert.equal(invalidNote.json.errors[0].code, "invalid-title");
  assert.equal(invalidNote.json.record.sha256, initialized.json.record.sha256);

  const invalidProposal = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "invalid-proposal.json", {
      edits: [
        {
          target: { kind: "proposals" },
          addEntity: {
            title: "Proposal\n### Injected",
            type: "Delivery",
            intendedResult: "result",
            expectedEvidence: "evidence",
          },
        },
      ],
    }),
  );
  assert.equal(invalidProposal.exitCode, 1);
  assert.equal(invalidProposal.json.errors[0].code, "invalid-title");
  assert.equal(invalidProposal.json.record.sha256, initialized.json.record.sha256);
});

test("adds and edits a historical checkpoint through precise updates", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "checkpoint-history",
    "--input",
    await writeJson(root, "init.json", { taskName: "Checkpoint history" }),
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
    await writeJson(root, "add-checkpoint.json", {
      edits: [
        {
          target: { kind: "checkpoints" },
          addEntity: {
            title: "Focused review",
            type: "Independent review",
            selectedBy: "User explicitly selected the review",
            condition: "Review the repaired boundary before continuation",
            result: "Completed",
            judgment: "Pass",
            evidence: "Focused regression suite",
            effect: "Continuation is allowed",
          },
        },
      ],
    }),
  );
  assert.equal(added.exitCode, 0, added.stderr);

  const edited = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    added.json.record.sha256,
    "--input",
    await writeJson(root, "edit-checkpoint.json", {
      edits: [{ target: { kind: "checkpoint", title: "Focused review" }, set: { effect: "Continue safely" } }],
    }),
  );
  assert.equal(edited.exitCode, 0, edited.stderr);

  const view = await runRawScript(
    root,
    "view",
    "--record",
    recordPath,
    "--view",
    "entity",
    "--entity",
    "Focused review",
  );
  assert.equal(view.exitCode, 0, view.stderr);
  assert.match(view.stdout, /#### Focused review/);
  assert.match(view.stdout, /Result: Completed/);
  assert.match(view.stdout, /Effect on the task: Continue safely/);
});

test("requires selected checkpoints to resolve before completing a slice", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "checkpoint-close",
    "--input",
    await writeJson(root, "init.json", { taskName: "Checkpoint close" }),
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
      title: "Checkpoint-bound slice",
      type: "Delivery",
      authoritySource: "user",
      intendedResult: "Require checkpoint settlement",
      reasonAndScope: "Exercise selected checkpoint closure",
      expectedEvidence: "Closure rejects unresolved checkpoint",
      stopCondition: "Stop after checkpoint result",
      selectedCheckpoints: ["Focused review"],
    }),
  );
  assert.equal(started.exitCode, 0, started.stderr);

  const unresolved = await runScript(
    root,
    "close",
    "--record",
    recordPath,
    "--expected-sha",
    started.json.record.sha256,
    "--input",
    await writeJson(root, "unresolved-close.json", {
      finalState: "Completed",
      outcome: "Must not close",
      evidence: ["focused probe"],
    }),
  );
  assert.equal(unresolved.exitCode, 1);
  assert.equal(unresolved.json.errors[0].code, "unresolved-settlement");
  assert.match(JSON.stringify(unresolved.json.errors[0]), /Focused review/);
  assert.equal(unresolved.json.record.sha256, started.json.record.sha256);

  const checkpoint = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    started.json.record.sha256,
    "--input",
    await writeJson(root, "checkpoint.json", {
      edits: [
        {
          target: { kind: "checkpoints" },
          addEntity: {
            title: "Focused review",
            type: "Independent review",
            selectedBy: "user",
            condition: "Review before close",
            result: "Completed",
            judgment: "Pass",
            evidence: "focused probe",
            effect: "Continue",
          },
        },
      ],
    }),
  );
  assert.equal(checkpoint.exitCode, 0, checkpoint.stderr);

  const closed = await runScript(
    root,
    "close",
    "--record",
    recordPath,
    "--expected-sha",
    checkpoint.json.record.sha256,
    "--input",
    await writeJson(root, "resolved-close.json", {
      finalState: "Completed",
      outcome: "Checkpoint resolved",
      evidence: ["focused probe"],
    }),
  );
  assert.equal(closed.exitCode, 0, closed.stderr);
});

test("validate rejects malformed checkpoint and Note entities", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "entity-validation",
    "--input",
    await writeJson(root, "init.json", { taskName: "Entity validation" }),
  );
  const recordPath = join(root, initialized.json.record.path);
  const original = await readFile(recordPath, "utf8");
  const malformed = original
    .replace(
      "## Proposed Slices\n",
      "## Proposed Slices\n### Incomplete proposal\n- Type: Delivery\n- Intended result:\n- Expected evidence:\n",
    )
    .replace(
      "### Checkpoints\n### Slices",
      "### Checkpoints\n#### Incomplete checkpoint\n- Type: Independent review\n### Slices",
    )
    .replace(
      "### Slices\n",
      "### Slices\n#### S-001 — Missing reason\n- State: Abandoned\n- Type: Learning\n- Intended result: Learn\n- Authority source: user\n- Outcome: Abandoned\n- Evidence:\n  - proof\n- Task effect: None\n",
    )
    .replace("## Notes\n", "## Notes\n### Empty note\nSource: user\n\n");
  await writeFile(recordPath, malformed);

  const validation = await runScript(root, "validate", "--record", initialized.json.record.path);
  assert.equal(validation.exitCode, 1);
  assert.equal(validation.json.status, "failed");
  assert.ok(validation.json.errors.some((error) => error.code === "missing-proposal-content"));
  assert.ok(validation.json.errors.some((error) => error.code === "missing-checkpoint-field"));
  assert.ok(validation.json.errors.some((error) => error.code === "missing-note-body"));
  assert.ok(validation.json.errors.some((error) => error.code === "missing-abandonment-reason"));
});

test("keeps decision operations strict and supports four-digit IDs", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "decision-contract",
    "--input",
    await writeJson(root, "init.json", { taskName: "Decision contract" }),
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
    await writeJson(root, "decision.json", {
      decision: { operation: "add", title: "Original", decision: "Keep the original" },
    }),
  );
  assert.equal(added.exitCode, 0, added.stderr);

  const unknownOperation = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    added.json.record.sha256,
    "--input",
    await writeJson(root, "unknown-operation.json", {
      decision: { operation: "typo-operation", id: "D-001", decision: "Must reject" },
    }),
  );
  assert.equal(unknownOperation.exitCode, 1);
  assert.equal(unknownOperation.json.errors[0].code, "unsupported-decision-operation");
  assert.equal(unknownOperation.json.record.sha256, added.json.record.sha256);

  const callerId = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    added.json.record.sha256,
    "--input",
    await writeJson(root, "caller-id.json", {
      edits: [
        {
          target: { kind: "decisions" },
          addEntity: { id: "D-099", title: "Caller ID", decision: "Must reject" },
        },
      ],
    }),
  );
  assert.equal(callerId.exitCode, 1);
  assert.equal(callerId.json.errors[0].code, "caller-supplied-id");
  assert.equal(callerId.json.record.sha256, added.json.record.sha256);

  const callerState = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    added.json.record.sha256,
    "--input",
    await writeJson(root, "caller-state.json", {
      edits: [
        {
          target: { kind: "decisions" },
          addEntity: { title: "Caller state", state: "Retired", decision: "Must reject" },
        },
      ],
    }),
  );
  assert.equal(callerState.exitCode, 1);
  assert.equal(callerState.json.errors[0].code, "caller-controlled-decision-field");
  assert.equal(callerState.json.record.sha256, added.json.record.sha256);

  const emptyDecision = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    added.json.record.sha256,
    "--input",
    await writeJson(root, "empty-decision.json", {
      decision: { operation: "add", title: "Empty decision", decision: "" },
    }),
  );
  assert.equal(emptyDecision.exitCode, 1);
  assert.equal(emptyDecision.json.errors[0].code, "missing-decision-content");
  assert.equal(emptyDecision.json.record.sha256, added.json.record.sha256);

  const absolutePath = join(root, recordPath);
  const seeded = (await readFile(absolutePath, "utf8")).replace(
    "### Decisions\n",
    "### Decisions\n#### D-999 — Existing\n- State: Active\n- Decision: Existing\n",
  );
  await writeFile(absolutePath, seeded);
  const overflow = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    sha256(seeded),
    "--input",
    await writeJson(root, "overflow.json", {
      decision: { operation: "add", title: "After nine hundred ninety-nine", decision: "Must parse" },
    }),
  );
  assert.equal(overflow.exitCode, 0, overflow.stderr);
  const overflowView = await runRawScript(
    root,
    "view",
    "--record",
    recordPath,
    "--view",
    "entity",
    "--entity",
    "D-1000",
  );
  assert.equal(overflowView.exitCode, 0, overflowView.stderr);
  assert.match(overflowView.stdout, /After nine hundred ninety-nine/);
});

test("rejects unknown proposal and Note operations without mutation", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "strict-entity-operations",
    "--input",
    await writeJson(root, "init.json", { taskName: "Strict entity operations" }),
  );
  const recordPath = initialized.json.record.path;
  const proposal = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "proposal.json", {
      proposal: {
        operation: "add",
        title: "Proposal",
        type: "Delivery",
        intendedResult: "Result",
        expectedEvidence: "Evidence",
      },
    }),
  );
  assert.equal(proposal.exitCode, 0, proposal.stderr);
  const badProposal = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    proposal.json.record.sha256,
    "--input",
    await writeJson(root, "bad-proposal.json", { proposal: { operation: "typo", title: "Proposal" } }),
  );
  assert.equal(badProposal.exitCode, 1);
  assert.equal(badProposal.json.errors[0].code, "unsupported-proposal-operation");
  assert.equal(badProposal.json.record.sha256, proposal.json.record.sha256);

  const note = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    proposal.json.record.sha256,
    "--input",
    await writeJson(root, "note.json", { note: { operation: "add", title: "Note", source: "user", body: "Body" } }),
  );
  assert.equal(note.exitCode, 0, note.stderr);
  const badNote = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    note.json.record.sha256,
    "--input",
    await writeJson(root, "bad-note.json", { note: { operation: "typo", title: "Note", body: "Changed" } }),
  );
  assert.equal(badNote.exitCode, 1);
  assert.equal(badNote.json.errors[0].code, "unsupported-note-operation");
  assert.equal(badNote.json.record.sha256, note.json.record.sha256);

  const updatedNote = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    note.json.record.sha256,
    "--input",
    await writeJson(root, "updated-note.json", { note: { operation: "update", title: "Note", body: "Changed" } }),
  );
  assert.equal(updatedNote.exitCode, 0, updatedNote.stderr);
  const noteView = await runRawScript(root, "view", "--record", recordPath, "--view", "entity", "--entity", "Note");
  assert.equal(noteView.exitCode, 0, noteView.stderr);
  assert.match(noteView.stdout, /Changed/);
});

test("preserves abandonment reason in historical slice history", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "abandonment-reason",
    "--input",
    await writeJson(root, "init.json", { taskName: "Abandonment reason" }),
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
      reasonAndScope: "Scope",
      expectedEvidence: "Evidence",
      stopCondition: "Stop",
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
      authoritySource: "user",
      abandonmentReason: "The question was withdrawn",
      residualEffects: "No implementation was published",
      outcome: "Abandoned",
      evidence: ["user decision"],
    }),
  );
  assert.equal(closed.exitCode, 0, closed.stderr);
  const view = await runRawScript(root, "view", "--record", recordPath, "--view", "entity", "--entity", "S-001");
  assert.equal(view.exitCode, 0, view.stderr);
  assert.match(view.stdout, /Abandonment reason: The question was withdrawn/);
});

test("rejects invalid recent view limits", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "recent-limit",
    "--input",
    await writeJson(root, "init.json", { taskName: "Recent limit" }),
  );
  const invalid = await runScript(
    root,
    "view",
    "--record",
    initialized.json.record.path,
    "--view",
    "recent",
    "--limit",
    "not-a-number",
  );
  assert.equal(invalid.exitCode, 1);
  assert.equal(invalid.json.errors[0].code, "invalid-limit");
  const excessive = await runScript(
    root,
    "view",
    "--record",
    initialized.json.record.path,
    "--view",
    "recent",
    "--limit",
    "101",
  );
  assert.equal(excessive.exitCode, 1);
  assert.equal(excessive.json.errors[0].code, "invalid-limit");

  const unknownView = await runScript(
    root,
    "view",
    "--record",
    initialized.json.record.path,
    "--view",
    "recent",
    "--input",
    await writeJson(root, "unknown-view.json", { unknownViewField: true }),
  );
  assert.equal(unknownView.exitCode, 1);
  assert.equal(unknownView.json.errors[0].code, "unknown-input-field");

  const initRoot = await makeWorkspace();
  t.after(() => rm(initRoot, { recursive: true, force: true }));
  const unknownInit = await runScript(
    initRoot,
    "init",
    "--root",
    initRoot,
    "--name",
    "unknown-init",
    "--input",
    await writeJson(initRoot, "unknown-init.json", { taskName: "Unknown init", unknownInitField: true }),
  );
  assert.equal(unknownInit.exitCode, 1);
  assert.equal(unknownInit.json.errors[0].code, "unknown-input-field");
});

test("rejects multiline list members before Markdown rendering", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "multiline-list",
    "--input",
    await writeJson(root, "init.json", { taskName: "Multiline list" }),
  );
  const started = await runScript(
    root,
    "start",
    "--record",
    initialized.json.record.path,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "start.json", {
      title: "List slice",
      type: "Delivery",
      authoritySource: "user",
      intendedResult: "Reject structural list text",
      reasonAndScope: "Scope",
      expectedEvidence: "Rejection",
      stopCondition: "Stop",
      dependencies: ["line one\nline two"],
    }),
  );
  assert.equal(started.exitCode, 1);
  assert.equal(started.json.errors[0].code, "invalid-list-member");
  assert.equal(started.json.record.sha256, initialized.json.record.sha256);

  const validStart = await runScript(
    root,
    "start",
    "--record",
    initialized.json.record.path,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "valid-start.json", {
      title: "Valid list slice",
      type: "Delivery",
      authoritySource: "user",
      intendedResult: "Reject later multiline edits",
      reasonAndScope: "Scope",
      expectedEvidence: "Rejection",
      stopCondition: "Stop",
    }),
  );
  assert.equal(validStart.exitCode, 0, validStart.stderr);
  const currentSlicePatch = await runScript(
    root,
    "update",
    "--record",
    initialized.json.record.path,
    "--expected-sha",
    validStart.json.record.sha256,
    "--input",
    await writeJson(root, "current-slice-patch.json", {
      currentSlice: { dependencies: ["line one\nline two"] },
    }),
  );
  assert.equal(currentSlicePatch.exitCode, 1);
  assert.equal(currentSlicePatch.json.errors[0].code, "invalid-list-member");
  assert.equal(currentSlicePatch.json.record.sha256, validStart.json.record.sha256);

  const proposal = await runScript(
    root,
    "update",
    "--record",
    initialized.json.record.path,
    "--expected-sha",
    validStart.json.record.sha256,
    "--input",
    await writeJson(root, "proposal.json", {
      proposal: {
        operation: "add",
        title: "Multiline proposal",
        type: "Delivery",
        intendedResult: "Result",
        expectedEvidence: "Evidence",
        dependencies: ["line one\nline two"],
      },
    }),
  );
  assert.equal(proposal.exitCode, 1);
  assert.equal(proposal.json.errors[0].code, "invalid-list-member");
  assert.equal(proposal.json.record.sha256, validStart.json.record.sha256);
});

test("rejects unknown close fields before settling a slice", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "strict-close",
    "--input",
    await writeJson(root, "init.json", { taskName: "Strict close" }),
  );
  const started = await runScript(
    root,
    "start",
    "--record",
    initialized.json.record.path,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "start.json", {
      title: "Close slice",
      type: "Delivery",
      authoritySource: "user",
      intendedResult: "Close strictly",
      reasonAndScope: "Scope",
      expectedEvidence: "Evidence",
      stopCondition: "Stop",
    }),
  );
  const closed = await runScript(
    root,
    "close",
    "--record",
    initialized.json.record.path,
    "--expected-sha",
    started.json.record.sha256,
    "--input",
    await writeJson(root, "close.json", {
      finalState: "Completed",
      outcome: "Closed",
      evidence: ["proof"],
      unknownCloseField: "must reject",
    }),
  );
  assert.equal(closed.exitCode, 1);
  assert.equal(closed.json.errors[0].code, "unknown-input-field");
  assert.equal(closed.json.record.sha256, started.json.record.sha256);
});

test("validates list fields at init, resume, and close boundaries", async (t) => {
  const initRoot = await makeWorkspace();
  t.after(() => rm(initRoot, { recursive: true, force: true }));
  const invalidInit = await runScript(
    initRoot,
    "init",
    "--root",
    initRoot,
    "--name",
    "init-list",
    "--input",
    await writeJson(initRoot, "init.json", { taskName: "Init list", blockers: ["one\ntwo"] }),
  );
  assert.equal(invalidInit.exitCode, 1);
  assert.equal(invalidInit.json.errors[0].code, "invalid-list-member");

  const closeRoot = await makeWorkspace();
  t.after(() => rm(closeRoot, { recursive: true, force: true }));
  const closeInit = await runScript(
    closeRoot,
    "init",
    "--root",
    closeRoot,
    "--name",
    "close-list",
    "--input",
    await writeJson(closeRoot, "init.json", { taskName: "Close list" }),
  );
  const closeStart = await runScript(
    closeRoot,
    "start",
    "--record",
    closeInit.json.record.path,
    "--expected-sha",
    closeInit.json.record.sha256,
    "--input",
    await writeJson(closeRoot, "start.json", {
      title: "Close list slice",
      type: "Delivery",
      authoritySource: "user",
      intendedResult: "Validate close evidence",
      reasonAndScope: "Scope",
      expectedEvidence: "Rejection",
      stopCondition: "Stop",
    }),
  );
  const invalidClose = await runScript(
    closeRoot,
    "close",
    "--record",
    closeInit.json.record.path,
    "--expected-sha",
    closeStart.json.record.sha256,
    "--input",
    await writeJson(closeRoot, "close.json", {
      finalState: "Completed",
      outcome: "Should reject",
      evidence: ["one\ntwo"],
    }),
  );
  assert.equal(invalidClose.exitCode, 1);
  assert.equal(invalidClose.json.errors[0].code, "invalid-list-member");
  assert.equal(invalidClose.json.record.sha256, closeStart.json.record.sha256);

  const resumeRoot = await makeWorkspace();
  t.after(() => rm(resumeRoot, { recursive: true, force: true }));
  const resumeInit = await runScript(
    resumeRoot,
    "init",
    "--root",
    resumeRoot,
    "--name",
    "resume-list",
    "--input",
    await writeJson(resumeRoot, "init.json", { taskName: "Resume list" }),
  );
  const resumeStart = await runScript(
    resumeRoot,
    "start",
    "--record",
    resumeInit.json.record.path,
    "--expected-sha",
    resumeInit.json.record.sha256,
    "--input",
    await writeJson(resumeRoot, "start.json", {
      title: "Resume list slice",
      type: "Delivery",
      authoritySource: "user",
      intendedResult: "Validate resume evidence",
      reasonAndScope: "Scope",
      expectedEvidence: "Rejection",
      stopCondition: "Stop",
    }),
  );
  const blocked = await runScript(
    resumeRoot,
    "block",
    "--record",
    resumeInit.json.record.path,
    "--expected-sha",
    resumeStart.json.record.sha256,
    "--input",
    await writeJson(resumeRoot, "block.json", {
      blocker: { blocker: "dependency", why: "wait", required: "dependency" },
      resumeWhen: "dependency resolves",
    }),
  );
  const invalidResume = await runScript(
    resumeRoot,
    "resume",
    "--record",
    resumeInit.json.record.path,
    "--expected-sha",
    blocked.json.record.sha256,
    "--input",
    await writeJson(resumeRoot, "resume.json", {
      resolutionSource: "user",
      evidence: ["one\ntwo"],
    }),
  );
  assert.equal(invalidResume.exitCode, 1);
  assert.equal(invalidResume.json.errors[0].code, "invalid-list-member");
  assert.equal(invalidResume.json.record.sha256, blocked.json.record.sha256);
});

test("rejects resume scope changes and validates legacy view limits", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "resume-scope",
    "--input",
    await writeJson(root, "init.json", { taskName: "Resume scope" }),
  );
  const started = await runScript(
    root,
    "start",
    "--record",
    initialized.json.record.path,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "start.json", {
      title: "Scope slice",
      type: "Delivery",
      authoritySource: "user",
      intendedResult: "Preserve scope",
      reasonAndScope: "Original scope",
      expectedEvidence: "Rejection",
      stopCondition: "Stop",
    }),
  );
  const blocked = await runScript(
    root,
    "block",
    "--record",
    initialized.json.record.path,
    "--expected-sha",
    started.json.record.sha256,
    "--input",
    await writeJson(root, "block.json", {
      blocker: { blocker: "dependency", why: "wait", required: "dependency" },
      resumeWhen: "dependency resolves",
    }),
  );
  const scopeChange = await runScript(
    root,
    "resume",
    "--record",
    initialized.json.record.path,
    "--expected-sha",
    blocked.json.record.sha256,
    "--input",
    await writeJson(root, "scope-change.json", { resolutionSource: "user", scopeChange: "New scope" }),
  );
  assert.equal(scopeChange.exitCode, 1);
  assert.equal(scopeChange.json.errors[0].code, "unknown-input-field");
  assert.equal(scopeChange.json.record.sha256, blocked.json.record.sha256);

  const legacyRoot = await makeWorkspace();
  t.after(() => rm(legacyRoot, { recursive: true, force: true }));
  const legacyDir = join(legacyRoot, ".freeflow", "tasks", "task-001-legacy");
  await mkdir(legacyDir, { recursive: true });
  const legacyPath = join(legacyDir, "record.md");
  await writeFile(
    legacyPath,
    "# Working Record: Legacy\n\nState: Active\nLast updated: 2026-01-01T00:00:00Z\n\n## Current Context\n\n## Current Work\n### Current Slice\nNone\n\n## History\n",
  );
  const legacyLimit = await runScript(
    legacyRoot,
    "view",
    "--record",
    legacyPath,
    "--view",
    "recent",
    "--limit",
    "not-a-number",
  );
  assert.equal(legacyLimit.exitCode, 1);
  assert.equal(legacyLimit.json.errors[0].code, "invalid-limit");
});

test("detects stale locks and requires explicit recovery", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "stale-lock",
    "--input",
    await writeJson(root, "init.json", { taskName: "Stale lock" }),
  );
  const recordPath = initialized.json.record.path;
  const taskDir = join(root, ".freeflow", "tasks", "task-001-stale-lock");
  const lockPath = join(taskDir, ".working-record.lock");
  const staleLock = { pid: 999999, createdAt: "2000-01-01T00:00:00.000Z", path: recordPath };
  await writeFile(lockPath, JSON.stringify(staleLock));

  const blocked = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "blocked.json", { goal: "must wait" }),
  );
  assert.equal(blocked.exitCode, 1);
  assert.equal(blocked.json.errors[0].code, "stale-lock");
  assert.equal(blocked.json.errors[0].recoverable, true);
  assert.equal(blocked.json.record.sha256, initialized.json.record.sha256);

  const recovered = await runScript(
    root,
    "unlock",
    "--record",
    recordPath,
    "--input",
    await writeJson(root, "unlock.json", {
      authoritySource: "User explicitly authorized stale lock recovery",
      lockPid: staleLock.pid,
      lockCreatedAt: staleLock.createdAt,
    }),
  );
  assert.equal(recovered.exitCode, 0, recovered.stderr);
  assert.equal(recovered.json.status, "unlocked");
  assert.equal(recovered.json.lock.scope, "record");
  assert.equal(recovered.json.lock.ownerPath, recordPath);
  assert.equal(recovered.json.lock.authoritySource, "User explicitly authorized stale lock recovery");
  assert.notEqual(recovered.json.lock.lockPath, recovered.json.lock.ownerPath);

  const changedLock = { pid: 999999, createdAt: "2000-01-01T00:00:00.000Z", path: recordPath };
  await writeFile(lockPath, JSON.stringify(changedLock));
  const changed = await runScript(
    root,
    "unlock",
    "--record",
    recordPath,
    "--input",
    await writeJson(root, "changed.json", {
      authoritySource: "User explicitly authorized stale lock recovery",
      lockPid: changedLock.pid,
      lockCreatedAt: changedLock.createdAt,
    }),
    { __env: { FREEFLOW_TEST_FAILURE: "stale-lock-recheck" } },
  );
  assert.equal(changed.exitCode, 1);
  assert.equal(changed.json.errors[0].code, "stale-lock-changed");
  assert.equal(
    await readFile(lockPath, "utf8"),
    JSON.stringify({ ...changedLock, createdAt: "2000-01-01T00:00:01.000Z" }),
  );
  await writeFile(lockPath, JSON.stringify(changedLock));
  const recoveredAgain = await runScript(
    root,
    "unlock",
    "--record",
    recordPath,
    "--input",
    await writeJson(root, "recover-again.json", {
      authoritySource: "User explicitly authorized stale lock recovery",
      lockPid: changedLock.pid,
      lockCreatedAt: changedLock.createdAt,
    }),
  );
  assert.equal(recoveredAgain.exitCode, 0, recoveredAgain.stderr);

  const updated = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "after-unlock.json", { goal: "updated" }),
  );
  assert.equal(updated.exitCode, 0, updated.stderr);

  const mismatchedLock = {
    pid: 999999,
    createdAt: "2000-01-01T00:00:00.000Z",
    path: join(root, ".freeflow", "tasks", "task-001-other", "record.md"),
  };
  await writeFile(lockPath, JSON.stringify(mismatchedLock));
  const mismatch = await runScript(
    root,
    "unlock",
    "--record",
    recordPath,
    "--input",
    await writeJson(root, "mismatch.json", {
      authoritySource: "User explicitly authorized stale lock recovery",
      lockPid: mismatchedLock.pid,
      lockCreatedAt: mismatchedLock.createdAt,
    }),
  );
  assert.equal(mismatch.exitCode, 1);
  assert.equal(mismatch.json.errors[0].code, "stale-lock-owner-mismatch");

  const liveLock = { pid: process.pid, createdAt: new Date().toISOString(), path: recordPath };
  await writeFile(lockPath, JSON.stringify(liveLock));
  const liveBlocked = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    updated.json.record.sha256,
    "--input",
    await writeJson(root, "live-blocked.json", { goal: "must not update" }),
  );
  assert.equal(liveBlocked.exitCode, 1);
  assert.equal(liveBlocked.json.errors[0].code, "lock-conflict");
});

test("recovers a stale repository init lock explicitly", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const tasks = join(root, ".freeflow", "tasks");
  await mkdir(tasks, { recursive: true });
  const initOwner = join(tasks, ".init");
  const staleLock = { pid: 999999, createdAt: "2000-01-01T00:00:00.000Z", path: initOwner };
  await writeFile(join(tasks, ".working-record.lock"), JSON.stringify(staleLock));

  const blocked = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "init-lock",
    "--input",
    await writeJson(root, "blocked-init.json", { taskName: "Init lock" }),
  );
  assert.equal(blocked.exitCode, 1);
  assert.equal(blocked.json.errors[0].code, "stale-lock");

  const recovered = await runScript(
    root,
    "unlock",
    "--root",
    root,
    "--input",
    await writeJson(root, "unlock-init.json", {
      scope: "init",
      authoritySource: "User explicitly authorized stale init-lock recovery",
      lockPid: staleLock.pid,
      lockCreatedAt: staleLock.createdAt,
    }),
  );
  assert.equal(recovered.exitCode, 0, recovered.stderr);
  assert.equal(recovered.json.status, "unlocked");

  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "init-lock",
    "--input",
    await writeJson(root, "after-init-unlock.json", { taskName: "Init lock" }),
  );
  assert.equal(initialized.exitCode, 0, initialized.stderr);
});

test("fails closed on malformed locks and failed lock publication", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "malformed-lock",
    "--input",
    await writeJson(root, "init.json", { taskName: "Malformed lock" }),
  );
  const recordPath = initialized.json.record.path;
  const lockPath = join(root, ".freeflow", "tasks", "task-001-malformed-lock", ".working-record.lock");
  const malformed = '{"pid":"not-a-pid","createdAt":"2000-01-01T00:00:00.000Z"}';
  await writeFile(lockPath, malformed);

  const blocked = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "blocked.json", { goal: "must wait" }),
  );
  assert.equal(blocked.exitCode, 1);
  assert.equal(blocked.json.errors[0].code, "lock-metadata-invalid");
  assert.equal(await readFile(lockPath, "utf8"), malformed);

  const missingSelectors = await runScript(
    root,
    "unlock",
    "--record",
    recordPath,
    "--input",
    await writeJson(root, "missing-selectors.json", { authoritySource: "user" }),
  );
  assert.equal(missingSelectors.exitCode, 1);
  assert.equal(missingSelectors.json.errors[0].code, "invalid-lock-selector");
  assert.equal(await readFile(lockPath, "utf8"), malformed);
  await rm(lockPath);

  const failedPublication = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "failed-lock-write.json", { goal: "retry" }),
    { __env: { FREEFLOW_TEST_FAILURE: "lock-write" } },
  );
  assert.equal(failedPublication.exitCode, 1);
  assert.equal(failedPublication.json.errors[0].code, "lock-write-failure");
  await assert.rejects(readFile(lockPath));

  const retried = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "retry-update.json", { goal: "retry" }),
  );
  assert.equal(retried.exitCode, 0, retried.stderr);
});

test("concurrent stale-lock recovery has one winner", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "concurrent-lock",
    "--input",
    await writeJson(root, "init.json", { taskName: "Concurrent lock" }),
  );
  const recordPath = initialized.json.record.path;
  const lockPath = join(root, ".freeflow", "tasks", "task-001-concurrent-lock", ".working-record.lock");
  const lock = { pid: 999999, createdAt: "2000-01-01T00:00:00.000Z", path: recordPath };
  await writeFile(lockPath, JSON.stringify(lock));
  const inputPath = await writeJson(root, "unlock.json", {
    authoritySource: "User explicitly authorized stale lock recovery",
    lockPid: lock.pid,
    lockCreatedAt: lock.createdAt,
  });
  const results = await Promise.all([
    runScript(root, "unlock", "--record", recordPath, "--input", inputPath),
    runScript(root, "unlock", "--record", recordPath, "--input", inputPath),
  ]);
  assert.equal(results.filter((result) => result.exitCode === 0).length, 1);
  const failed = results.find((result) => result.exitCode !== 0);
  assert.equal(failed?.json.errors[0].code, "stale-lock-changed");
  await assert.rejects(readFile(lockPath));
});

test("migration rejects dropping a recognized legacy decision", async (t) => {
  const root = await makeWorkspace();
  const candidateRoot = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  t.after(() => rm(candidateRoot, { recursive: true, force: true }));
  const recordDirectory = join(root, ".freeflow", "tasks", "task-001-legacy-loss");
  await mkdir(recordDirectory, { recursive: true });
  const recordPath = join(recordDirectory, "record.md");
  const legacyText = [
    "# Working Record: Legacy loss",
    "",
    "State: Active",
    "Last updated: 2026-08-01T00:00:00Z",
    "",
    "## Current Context",
    "Goal: Preserve a critical decision",
    "",
    "## Current Work",
    "### Current Slice",
    "None",
    "",
    "## History",
    "### Decisions",
    "#### D-001 — Never delete production data",
    "State: Active",
    "Decision: Production deletion requires user approval",
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
    await writeJson(candidateRoot, "init.json", { taskName: "Legacy loss", goal: "Preserve a critical decision" }),
  );
  const candidateText = await readFile(join(candidateRoot, candidateInit.json.record.path), "utf8");
  const inspection = await runScript(root, "inspect", "--root", root, "--record", recordPath);
  assert.equal(inspection.exitCode, 0, inspection.stderr);
  const coverage = inspection.json.inspection.sourceUnits.map((unit) => ({
    ...unit,
    disposition: "formatting-normalized",
    targetPaths: ["currentContext"],
  }));
  const migration = await runScript(
    root,
    "migrate",
    "--root",
    root,
    "--record",
    recordPath,
    "--expected-sha",
    sha256(legacyText),
    "--input",
    await writeJson(root, "migration.json", {
      authoritySource: "User authorized lossless migration",
      reason: "Preserve all legacy decisions",
      candidateText,
      coverage,
    }),
    "--dry-run",
  );
  assert.equal(migration.exitCode, 1);
  assert.equal(migration.json.errors[0].code, "protected-invariant");
  assert.equal(await readFile(recordPath, "utf8"), legacyText);
});

test("compression protects selected checkpoints and decision content", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "compression-protection",
    "--input",
    await writeJson(root, "init.json", { taskName: "Compression protection" }),
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
      title: "Protected slice",
      type: "Delivery",
      authoritySource: "user",
      intendedResult: "Protect selected state",
      reasonAndScope: "Scope",
      expectedEvidence: "Evidence",
      stopCondition: "Stop",
      dependencies: ["dependency"],
      selectedCheckpoints: ["review"],
    }),
  );
  const sourceText = await readFile(join(root, recordPath), "utf8");
  const candidateText = sourceText.replace("  - review", "  - changed-review");
  const compression = await runScript(
    root,
    "compress",
    "--record",
    recordPath,
    "--expected-sha",
    started.json.record.sha256,
    "--input",
    await writeJson(root, "compress.json", {
      authoritySource: "User authorized bounded compaction",
      reason: "Test protected state",
      preservation: "Selected checkpoints remain unchanged",
      scope: ["currentWork.currentSlice"],
      candidateText,
    }),
    "--dry-run",
  );
  assert.equal(compression.exitCode, 1);
  assert.equal(compression.json.errors[0].code, "protected-invariant");
});

test("migration rejects semantic formatting and wrong-owner mappings", async (t) => {
  const root = await makeWorkspace();
  const candidateRoot = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  t.after(() => rm(candidateRoot, { recursive: true, force: true }));
  const recordDirectory = join(root, ".freeflow", "tasks", "task-001-owner");
  await mkdir(recordDirectory, { recursive: true });
  const recordPath = join(recordDirectory, "record.md");
  const legacyText = [
    "# Working Record: Owner task",
    "",
    "State: Active",
    "Last updated: 2026-08-01T00:00:00Z",
    "",
    "## Current Context",
    "Goal: Preserve the goal",
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
    await writeJson(candidateRoot, "init.json", { taskName: "Owner task", goal: "Preserve the goal" }),
  );
  const candidateText = await readFile(join(candidateRoot, candidateInit.json.record.path), "utf8");
  const inspection = await runScript(root, "inspect", "--root", root, "--record", recordPath);
  assert.equal(inspection.exitCode, 0, inspection.stderr);
  const sourceUnits = inspection.json.inspection.sourceUnits;
  const sourceContent = (unit) => (legacyText.split(/(?<=\n)/)[unit.line - 1] ?? "").replace(/\n$/, "").trim();
  const rules = Object.fromEntries(
    sourceUnits.map((unit) => {
      const content = sourceContent(unit);
      if (!content) return [unit.line, { disposition: "formatting-normalized", targetPaths: ["currentContext"] }];
      if (content.startsWith("# Working Record:"))
        return [unit.line, { disposition: "represented", targetPaths: ["taskName"] }];
      if (content.startsWith("State:")) return [unit.line, { disposition: "represented", targetPaths: ["taskState"] }];
      if (content.startsWith("Last updated:"))
        return [unit.line, { disposition: "represented", targetPaths: ["lastUpdated"] }];
      if (content.startsWith("Goal:"))
        return [unit.line, { disposition: "represented", targetPaths: ["currentContext.goal"] }];
      if (content === "## Current Context")
        return [unit.line, { disposition: "formatting-normalized", targetPaths: ["currentContext"] }];
      if (content === "## Current Work")
        return [unit.line, { disposition: "formatting-normalized", targetPaths: ["currentWork"] }];
      if (content === "### Current Slice" || content === "None")
        return [unit.line, { disposition: "projection-only", targetPaths: ["currentWork.currentSlice"] }];
      return [unit.line, { disposition: "formatting-normalized", targetPaths: ["currentContext"] }];
    }),
  );
  const mismatchedCandidate = candidateText.replace("Preserve the goal", "Different goal");
  const mismatched = await runScript(
    root,
    "migrate",
    "--root",
    root,
    "--record",
    recordPath,
    "--expected-sha",
    sha256(legacyText),
    "--input",
    await writeJson(root, "mismatched.json", {
      authoritySource: "User authorized migration proof",
      reason: "Reject same-owner content substitution",
      candidateText: mismatchedCandidate,
      coverage: sourceUnits.map((unit) => ({ ...unit, ...(rules[unit.line] ?? {}) })),
    }),
    "--dry-run",
  );
  assert.equal(mismatched.exitCode, 1);
  assert.equal(mismatched.json.errors[0].code, "invalid-migration-representation");

  const formattingRules = {
    ...rules,
    [sourceUnits.find((unit) => sourceContent(unit).startsWith("Goal:"))?.line]: {
      disposition: "formatting-normalized",
      targetPaths: ["currentContext"],
    },
  };
  const formatting = await runScript(
    root,
    "migrate",
    "--root",
    root,
    "--record",
    recordPath,
    "--expected-sha",
    sha256(legacyText),
    "--input",
    await writeJson(root, "formatting.json", {
      authoritySource: "User authorized migration proof",
      reason: "Reject semantic formatting normalization",
      candidateText,
      coverage: sourceUnits.map((unit) => ({ ...unit, ...(formattingRules[unit.line] ?? {}) })),
    }),
    "--dry-run",
  );
  assert.equal(formatting.exitCode, 1);
  assert.equal(formatting.json.errors[0].code, "invalid-formatting-normalization");

  const goalLine = sourceUnits.find((unit) => sourceContent(unit).startsWith("Goal:"));
  const wrongOwner = await runScript(
    root,
    "migrate",
    "--root",
    root,
    "--record",
    recordPath,
    "--expected-sha",
    sha256(legacyText),
    "--input",
    await writeJson(root, "wrong-owner.json", {
      authoritySource: "User authorized migration proof",
      reason: "Reject wrong target ownership",
      candidateText,
      coverage: sourceUnits.map((unit) => ({
        ...unit,
        ...(unit.line === goalLine.line
          ? { disposition: "represented", targetPaths: ["currentWork.nextAction"] }
          : rules[unit.line]),
      })),
    }),
    "--dry-run",
  );
  assert.equal(wrongOwner.exitCode, 1);
  assert.equal(wrongOwner.json.errors[0].code, "invalid-migration-target");
});

test("compression protects historical boundary lists", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "historical-boundaries",
    "--input",
    await writeJson(root, "init.json", { taskName: "Historical boundaries" }),
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
      title: "Boundary slice",
      type: "Delivery",
      authoritySource: "user",
      intendedResult: "Preserve historical boundaries",
      reasonAndScope: "Scope",
      expectedEvidence: "Evidence",
      stopCondition: "Stop",
      dependencies: ["original-dependency"],
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
      finalState: "Completed",
      outcome: "Closed",
      evidence: ["proof"],
    }),
  );
  assert.equal(closed.exitCode, 0, closed.stderr);
  const sourceText = await readFile(join(root, recordPath), "utf8");
  const candidateText = sourceText.replace("original-dependency", "changed-dependency");
  const compression = await runScript(
    root,
    "compress",
    "--record",
    recordPath,
    "--expected-sha",
    closed.json.record.sha256,
    "--input",
    await writeJson(root, "compress-history.json", {
      authoritySource: "User authorized bounded compaction",
      reason: "Protect historical boundary lists",
      preservation: "Historical dependencies remain unchanged",
      scope: ["history.slices"],
      candidateText,
    }),
    "--dry-run",
  );
  assert.equal(compression.exitCode, 1);
  assert.equal(compression.json.errors[0].code, "protected-invariant");
});

test("compression protects decision content", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "decision-compression",
    "--input",
    await writeJson(root, "init.json", { taskName: "Decision compression" }),
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
    await writeJson(root, "decision.json", {
      decision: { operation: "add", title: "Stable decision", decision: "Original decision content" },
    }),
  );
  assert.equal(added.exitCode, 0, added.stderr);
  const sourceText = await readFile(join(root, recordPath), "utf8");
  const candidateText = sourceText.replace("Original decision content", "Changed decision content");
  const compression = await runScript(
    root,
    "compress",
    "--record",
    recordPath,
    "--expected-sha",
    added.json.record.sha256,
    "--input",
    await writeJson(root, "compress-decision.json", {
      authoritySource: "User authorized bounded compaction",
      reason: "Test protected decision content",
      preservation: "The decision meaning remains unchanged",
      scope: ["history.decisions"],
      candidateText,
    }),
    "--dry-run",
  );
  assert.equal(compression.exitCode, 1);
  assert.equal(compression.json.errors[0].code, "protected-invariant");
});

test("compression protects proposal boundaries and checkpoint identity", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "compression-identities",
    "--input",
    await writeJson(root, "init.json", { taskName: "Compression identities" }),
  );
  const recordPath = initialized.json.record.path;
  const proposal = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "proposal.json", {
      proposal: {
        operation: "add",
        title: "Boundary proposal",
        type: "Delivery",
        intendedResult: "Result",
        expectedEvidence: "Evidence",
        dependencies: ["original-dependency"],
        selectedCheckpoints: ["Original checkpoint"],
      },
    }),
  );
  const checkpoint = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    proposal.json.record.sha256,
    "--input",
    await writeJson(root, "checkpoint.json", {
      edits: [
        {
          target: { kind: "checkpoints" },
          addEntity: {
            title: "Original checkpoint",
            type: "Continuity",
            selectedBy: "user",
            condition: "Before continuation",
            result: "Completed",
          },
        },
      ],
    }),
  );
  const sourceText = await readFile(join(root, recordPath), "utf8");
  const proposalCandidate = sourceText.replace("original-dependency", "changed-dependency");
  const proposalCompression = await runScript(
    root,
    "compress",
    "--record",
    recordPath,
    "--expected-sha",
    checkpoint.json.record.sha256,
    "--input",
    await writeJson(root, "proposal-compress.json", {
      authoritySource: "User authorized bounded compaction",
      reason: "Protect proposal boundaries",
      preservation: "Dependency remains unchanged",
      scope: ["proposals"],
      candidateText: proposalCandidate,
    }),
    "--dry-run",
  );
  assert.equal(proposalCompression.exitCode, 1);
  assert.equal(proposalCompression.json.errors[0].code, "protected-invariant");

  const checkpointCandidate = sourceText.replace("#### Original checkpoint", "#### Changed checkpoint");
  const checkpointCompression = await runScript(
    root,
    "compress",
    "--record",
    recordPath,
    "--expected-sha",
    checkpoint.json.record.sha256,
    "--input",
    await writeJson(root, "checkpoint-compress.json", {
      authoritySource: "User authorized bounded compaction",
      reason: "Protect checkpoint identity",
      preservation: "Checkpoint title remains unchanged",
      scope: ["history.checkpoints"],
      candidateText: checkpointCandidate,
    }),
    "--dry-run",
  );
  assert.equal(checkpointCompression.exitCode, 1);
  assert.equal(checkpointCompression.json.errors[0].code, "protected-invariant");
});

test("compression protects checkpoint lifecycle fields", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "checkpoint-result",
    "--input",
    await writeJson(root, "init.json", { taskName: "Checkpoint result" }),
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
    await writeJson(root, "checkpoint.json", {
      edits: [
        {
          target: { kind: "checkpoints" },
          addEntity: {
            title: "Lifecycle checkpoint",
            type: "Continuity",
            selectedBy: "user",
            condition: "Before continuation",
            result: "Completed",
            effect: "Continue",
          },
        },
      ],
    }),
  );
  assert.equal(added.exitCode, 0, added.stderr);
  const sourceText = await readFile(join(root, recordPath), "utf8");
  const candidateText = sourceText.replace("Result: Completed", "Result: Deferred");
  const compression = await runScript(
    root,
    "compress",
    "--record",
    recordPath,
    "--expected-sha",
    added.json.record.sha256,
    "--input",
    await writeJson(root, "compress-result.json", {
      authoritySource: "User authorized bounded compaction",
      reason: "Protect checkpoint lifecycle",
      preservation: "Checkpoint result remains unchanged",
      scope: ["history.checkpoints"],
      candidateText,
    }),
    "--dry-run",
  );
  assert.equal(compression.exitCode, 1);
  assert.equal(compression.json.errors[0].code, "protected-invariant");
});

test("migration cannot drop an unknown semantic heading", async (t) => {
  const root = await makeWorkspace();
  const candidateRoot = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  t.after(() => rm(candidateRoot, { recursive: true, force: true }));
  const recordDirectory = join(root, ".freeflow", "tasks", "task-001-heading-loss");
  await mkdir(recordDirectory, { recursive: true });
  const recordPath = join(recordDirectory, "record.md");
  const legacyText = [
    "# Working Record: Heading loss",
    "",
    "State: Active",
    "Last updated: 2026-08-01T00:00:00Z",
    "",
    "## Current Context",
    "Goal: Original goal",
    "##### Hidden semantic heading",
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
    await writeJson(candidateRoot, "init.json", { taskName: "Heading loss", goal: "Original goal" }),
  );
  const candidateText = await readFile(join(candidateRoot, candidateInit.json.record.path), "utf8");
  const inspection = await runScript(root, "inspect", "--root", root, "--record", recordPath);
  assert.equal(inspection.exitCode, 0, inspection.stderr);
  const sourceUnits = inspection.json.inspection.sourceUnits;
  const lines = legacyText.split(/(?<=\n)/);
  const coverage = sourceUnits.map((unit) => {
    const content = (lines[unit.line - 1] ?? "").replace(/\n$/, "").trim();
    let rule = { disposition: "formatting-normalized", targetPaths: ["currentContext"] };
    if (content.startsWith("# Working Record:")) rule = { disposition: "represented", targetPaths: ["taskName"] };
    else if (content.startsWith("State:")) rule = { disposition: "represented", targetPaths: ["taskState"] };
    else if (content.startsWith("Last updated:")) rule = { disposition: "represented", targetPaths: ["lastUpdated"] };
    else if (content.startsWith("Goal:")) rule = { disposition: "represented", targetPaths: ["currentContext.goal"] };
    else if (content.startsWith("#####")) rule = { disposition: "represented", targetPaths: ["currentContext"] };
    else if (content === "## Current Work")
      rule = { disposition: "formatting-normalized", targetPaths: ["currentWork"] };
    else if (content === "### Current Slice" || content === "None")
      rule = { disposition: "projection-only", targetPaths: ["currentWork.currentSlice"] };
    else if (content === "## Current Context")
      rule = { disposition: "formatting-normalized", targetPaths: ["currentContext"] };
    return { ...unit, ...rule };
  });
  const migration = await runScript(
    root,
    "migrate",
    "--root",
    root,
    "--record",
    recordPath,
    "--expected-sha",
    sha256(legacyText),
    "--input",
    await writeJson(root, "migration.json", {
      authoritySource: "User authorized migration proof",
      reason: "Reject unknown semantic heading loss",
      candidateText,
      coverage,
    }),
    "--dry-run",
  );
  assert.equal(migration.exitCode, 1);
  assert.equal(migration.json.errors[0].code, "invalid-migration-representation");
});

test("migration preserves title-only checkpoints and decision titles", async (t) => {
  const root = await makeWorkspace();
  const candidateRoot = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  t.after(() => rm(candidateRoot, { recursive: true, force: true }));
  const recordDirectory = join(root, ".freeflow", "tasks", "task-001-identity");
  await mkdir(recordDirectory, { recursive: true });
  const recordPath = join(recordDirectory, "record.md");
  const legacyText = [
    "# Working Record: Identity task",
    "",
    "State: Active",
    "Last updated: 2026-08-01T00:00:00Z",
    "",
    "## Current Context",
    "Goal: Preserve identity",
    "",
    "## Current Work",
    "### Current Slice",
    "None",
    "",
    "## History",
    "### Decisions",
    "#### D-001 — Original decision",
    "State: Active",
    "Decision: Keep the decision",
    "",
    "### Checkpoints",
    "#### Continuity boundary",
    "Type: Continuity",
    "Selected by: user",
    "Condition: Before continuation",
    "Result: Completed",
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
    await writeJson(candidateRoot, "init.json", { taskName: "Identity task", goal: "Preserve identity" }),
  );
  const candidatePath = candidateInit.json.record.path;
  const addedDecision = await runScript(
    candidateRoot,
    "update",
    "--record",
    candidatePath,
    "--expected-sha",
    candidateInit.json.record.sha256,
    "--input",
    await writeJson(candidateRoot, "decision.json", {
      decision: { operation: "add", title: "Original decision", decision: "Keep the decision" },
    }),
  );
  await runScript(
    candidateRoot,
    "update",
    "--record",
    candidatePath,
    "--expected-sha",
    addedDecision.json.record.sha256,
    "--input",
    await writeJson(candidateRoot, "checkpoint.json", {
      edits: [
        {
          target: { kind: "checkpoints" },
          addEntity: {
            title: "Continuity boundary",
            type: "Continuity",
            selectedBy: "user",
            condition: "Before continuation",
            result: "Completed",
          },
        },
      ],
    }),
  );
  const candidateText = await readFile(join(candidateRoot, candidatePath), "utf8");
  const inspection = await runScript(root, "inspect", "--root", root, "--record", recordPath);
  assert.equal(inspection.exitCode, 0, inspection.stderr);
  const sourceUnits = inspection.json.inspection.sourceUnits;
  const rulesByLine = {
    1: { disposition: "represented", targetPaths: ["taskName"] },
    3: { disposition: "represented", targetPaths: ["taskState"] },
    4: { disposition: "represented", targetPaths: ["lastUpdated"] },
    6: { disposition: "formatting-normalized", targetPaths: ["currentContext"] },
    7: { disposition: "represented", targetPaths: ["currentContext.goal"] },
    9: { disposition: "formatting-normalized", targetPaths: ["currentWork"] },
    10: { disposition: "projection-only", targetPaths: ["currentWork.currentSlice"] },
    11: { disposition: "projection-only", targetPaths: ["currentWork.currentSlice"] },
    13: { disposition: "formatting-normalized", targetPaths: ["history"] },
    14: { disposition: "formatting-normalized", targetPaths: ["history.decisions"] },
    15: { disposition: "formatting-normalized", targetPaths: ["history.decisions"] },
    16: { disposition: "represented", targetPaths: ['history.decisions[id="D-001"].state'] },
    17: { disposition: "represented", targetPaths: ['history.decisions[id="D-001"].decision'] },
    19: { disposition: "formatting-normalized", targetPaths: ["history"] },
    20: { disposition: "formatting-normalized", targetPaths: ["history.checkpoints"] },
    21: { disposition: "represented", targetPaths: ['history.checkpoints[title="Continuity boundary"].type'] },
    22: { disposition: "represented", targetPaths: ['history.checkpoints[title="Continuity boundary"].selectedBy'] },
    23: { disposition: "represented", targetPaths: ['history.checkpoints[title="Continuity boundary"].condition'] },
    24: { disposition: "represented", targetPaths: ['history.checkpoints[title="Continuity boundary"].result'] },
  };
  const coverage = sourceUnits.map((unit) => ({
    ...unit,
    ...(rulesByLine[unit.line] ?? { disposition: "formatting-normalized", targetPaths: ["currentContext"] }),
  }));
  const migration = await runScript(
    root,
    "migrate",
    "--root",
    root,
    "--record",
    recordPath,
    "--expected-sha",
    sha256(legacyText),
    "--input",
    await writeJson(root, "identity-migration.json", {
      authoritySource: "User authorized identity-preserving migration",
      reason: "Preserve decision and checkpoint identities",
      candidateText,
      coverage,
    }),
    "--dry-run",
  );
  assert.equal(migration.exitCode, 0, `${migration.stderr}\n${migration.stdout}`);

  const changedTitle = candidateText.replace("D-001 — Original decision", "D-001 — Changed decision");
  const changed = await runScript(
    root,
    "migrate",
    "--root",
    root,
    "--record",
    recordPath,
    "--expected-sha",
    sha256(legacyText),
    "--input",
    await writeJson(root, "changed-identity.json", {
      authoritySource: "User authorized identity-preserving migration",
      reason: "Reject changed decision title",
      candidateText: changedTitle,
      coverage,
    }),
    "--dry-run",
  );
  assert.equal(changed.exitCode, 1);
  assert.equal(changed.json.errors[0].code, "protected-invariant");
});

test("rejects malformed precise edit combinations and Current Slice fields", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "precise-boundary",
    "--input",
    await writeJson(root, "init.json", { taskName: "Precise boundary", goal: "original" }),
  );
  const recordPath = initialized.json.record.path;
  const invalidClear = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "invalid-clear.json", {
      edits: [{ target: "currentContext.goal", clear: "yes" }],
    }),
  );
  assert.equal(invalidClear.exitCode, 1);
  assert.equal(invalidClear.json.errors[0].code, "invalid-edit-type");
  assert.equal(invalidClear.json.record.sha256, initialized.json.record.sha256);

  const started = await runScript(
    root,
    "start",
    "--record",
    recordPath,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "start.json", {
      title: "Precise slice",
      type: "Delivery",
      authoritySource: "user",
      intendedResult: "Reject unknown fields",
      reasonAndScope: "Scope",
      expectedEvidence: "Rejection",
      stopCondition: "Stop",
    }),
  );
  const unknownSliceField = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    started.json.record.sha256,
    "--input",
    await writeJson(root, "unknown-slice-field.json", { currentSlice: { notAField: "ignored" } }),
  );
  assert.equal(unknownSliceField.exitCode, 1);
  assert.equal(unknownSliceField.json.errors[0].code, "unknown-edit-field");
  assert.equal(unknownSliceField.json.record.sha256, started.json.record.sha256);

  const compound = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    started.json.record.sha256,
    "--input",
    await writeJson(root, "compound.json", {
      edits: [{ target: "currentContext.goal", set: "new", replaceText: { old: "new", new: "newer" } }],
    }),
  );
  assert.equal(compound.exitCode, 1);
  assert.equal(compound.json.errors[0].code, "multiple-edit-operations");
  assert.equal(compound.json.record.sha256, started.json.record.sha256);

  const entityClear = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    started.json.record.sha256,
    "--input",
    await writeJson(root, "entity-clear.json", {
      edits: [{ target: { kind: "currentSlice" }, clear: "yes" }],
    }),
  );
  assert.equal(entityClear.exitCode, 1);
  assert.equal(entityClear.json.errors[0].code, "invalid-edit-type");
  assert.equal(entityClear.json.record.sha256, started.json.record.sha256);

  const compoundCollection = await runScript(
    root,
    "update",
    "--record",
    recordPath,
    "--expected-sha",
    started.json.record.sha256,
    "--input",
    await writeJson(root, "compound-collection.json", {
      edits: [
        {
          target: { kind: "notes" },
          addEntity: { title: "Added", body: "body" },
          removeEntity: { title: "Missing" },
        },
      ],
    }),
  );
  assert.equal(compoundCollection.exitCode, 1);
  assert.equal(compoundCollection.json.errors[0].code, "multiple-edit-operations");
  assert.equal(compoundCollection.json.record.sha256, started.json.record.sha256);
});

test("bounds legacy recent history views", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const taskDir = join(root, ".freeflow", "tasks", "task-001-legacy-recent");
  await mkdir(taskDir, { recursive: true });
  const recordPath = join(taskDir, "record.md");
  await writeFile(
    recordPath,
    [
      "# Working Record: Legacy recent",
      "",
      "State: Active",
      "Last updated: 2026-01-01T00:00:00Z",
      "",
      "## Current Context",
      "",
      "## Current Work",
      "### Current Slice",
      "None",
      "",
      "## History",
      "### Slices",
      "#### S-001 — First",
      "State: Completed",
      "",
      "#### S-002 — Second",
      "State: Completed",
      "",
      "#### S-003 — Third",
      "State: Completed",
      "",
    ].join("\n"),
  );
  const recent = await runScript(
    root,
    "view",
    "--root",
    root,
    "--record",
    recordPath,
    "--view",
    "recent",
    "--limit",
    "1",
  );
  assert.equal(recent.exitCode, 0, recent.stderr);
  assert.match(recent.stdout, /S-003 — Third/);
  assert.doesNotMatch(recent.stdout, /S-001 — First/);
  assert.doesNotMatch(recent.stdout, /S-002 — Second/);
});

test("precise decision insertion reports its assigned ID", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const initialized = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "decision-affected-id",
    "--input",
    await writeJson(root, "init.json", { taskName: "Decision affected ID" }),
  );
  const added = await runScript(
    root,
    "update",
    "--record",
    initialized.json.record.path,
    "--expected-sha",
    initialized.json.record.sha256,
    "--input",
    await writeJson(root, "decision.json", {
      edits: [{ target: { kind: "decisions" }, addEntity: { title: "Precise decision", decision: "Content" } }],
    }),
  );
  assert.equal(added.exitCode, 0, added.stderr);
  assert.deepEqual(added.json.affectedIds, ["D-001"]);
  assert.ok(added.json.changedPaths.some((path) => path.includes('history.decisions[id="D-001"]')));
  assert.ok(added.json.changedPaths.every((path) => !path.includes('[title="D-001"]')));
});

test("init dry-run validates candidate structure", async (t) => {
  const root = await makeWorkspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const dryRun = await runScript(
    root,
    "init",
    "--root",
    root,
    "--name",
    "dry-run-invalid",
    "--input",
    await writeJson(root, "init.json", { taskName: "Bad\n## Injected" }),
    "--dry-run",
  );
  assert.equal(dryRun.exitCode, 1);
  assert.ok(["malformed-header", "candidate-validation-failure"].includes(dryRun.json.errors[0].code));
  await assert.rejects(readdir(join(root, ".freeflow", "tasks")));
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
