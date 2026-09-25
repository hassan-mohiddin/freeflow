import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const scriptPath = resolve("skills/track-work/scripts/working-record.mjs");

const DIRECT_SLICE = [
  "Intended result:\n- Work is complete.",
  "Authority source:\n- User request.",
  "Scope:\n- Do the work.",
  "Expected evidence:\n- Focused check.",
  "Stop condition:\n- Stop if scope changes.",
  "Starting state:\n- Initial.",
].join("\n");

async function withWorkspace(run) {
  const workspace = await mkdtemp(join(tmpdir(), "track-work-updates-"));
  try {
    await run(workspace);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

function runScript(workspace, args, input = "") {
  return new Promise((resolveResult) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: workspace,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (exitCode) => resolveResult({ exitCode, stdout, stderr }));
    child.stdin.end(input);
  });
}

async function init(workspace, name, input = "### Goal\n- Test task.\n\n### Next useful action\n- Continue.\n") {
  const result = await runScript(workspace, ["init", "--root", workspace, "--name", name, "--input", "-"], input);
  assert.equal(result.exitCode, 0, result.stderr);
  return result.stdout.trim();
}

async function startDirect(workspace, recordPath, title = "Do work") {
  const result = await runScript(
    workspace,
    ["slice", "start-direct", "--record", recordPath, "--title", title, "--next-action", "Continue.", "--input", "-"],
    DIRECT_SLICE,
  );
  assert.equal(result.exitCode, 0, result.stderr);
}

async function editRecord(recordPath, transform) {
  await writeFile(recordPath, transform(await readFile(recordPath, "utf8")));
}

function validate(workspace, recordPath) {
  return runScript(workspace, ["validate", "--record", recordPath]);
}

const SOURCES = "### Recovery sources\n\n- docs/api.md — the accepted response shape.\n\n### Next useful action";

test("init places Recovery sources between the Current Slice and the Next useful action", async () => {
  await withWorkspace(async (workspace) => {
    const record = await readFile(await init(workspace, "skeleton"), "utf8");
    const slice = record.indexOf("### Current Slice");
    const sources = record.indexOf("### Recovery sources");
    const next = record.indexOf("### Next useful action");
    assert.ok(slice > 0 && slice < sources && sources < next, record);
  });
});

test("init accepts Recovery sources input and rejects text outside a known heading", async () => {
  await withWorkspace(async (workspace) => {
    const recordPath = await init(
      workspace,
      "with-sources",
      "### Goal\n- Test task.\n\n### Recovery sources\n- docs/api.md — the accepted response shape.\n\n### Next useful action\n- Continue.\n",
    );
    assert.match(
      await readFile(recordPath, "utf8"),
      /### Recovery sources\n\n- docs\/api\.md — the accepted response shape\.\n\n### Next useful action/,
    );

    const stray = await runScript(
      workspace,
      ["init", "--root", workspace, "--name", "stray", "--input", "-"],
      "This goal has no heading.\n\n### Goal\n- Real goal.\n\n### Next useful action\n- Continue.\n",
    );
    assert.notEqual(stray.exitCode, 0);
    assert.match(stray.stderr, /outside a heading/);
    assert.deepEqual(
      (await readdir(join(workspace, ".freeflow/tasks"))).filter((name) => name.includes("stray")),
      [],
    );
  });
});

test("init always creates an active record", async () => {
  await withWorkspace(async (workspace) => {
    const result = await runScript(
      workspace,
      ["init", "--root", workspace, "--name", "finished", "--state", "completed", "--input", "-"],
      "### Goal\n- g\n\n### Next useful action\n- n\n",
    );
    assert.notEqual(result.exitCode, 0);
    assert.match(result.stderr, /Unknown option --state/);
  });
});

test("records without the Recovery sources heading stay valid and usable", async () => {
  await withWorkspace(async (workspace) => {
    const recordPath = await init(workspace, "legacy");
    await editRecord(recordPath, (text) => text.replace("### Recovery sources\n\n", ""));
    assert.equal((await validate(workspace, recordPath)).exitCode, 0);
    await startDirect(workspace, recordPath);
    assert.equal((await validate(workspace, recordPath)).exitCode, 0);
  });
});

test("lifecycle commands preserve Recovery sources and resume shows them", async () => {
  await withWorkspace(async (workspace) => {
    const recordPath = await init(workspace, "sources");
    await editRecord(recordPath, (text) => text.replace("### Recovery sources\n\n### Next useful action", SOURCES));
    await startDirect(workspace, recordPath);
    const pause = await runScript(workspace, [
      "slice",
      "pause",
      "--record",
      recordPath,
      "--reason",
      "waiting",
      "--resume-when",
      "answer arrives",
      "--next-action",
      "Wait for the answer.",
    ]);
    assert.equal(pause.exitCode, 0, pause.stderr);

    const record = await readFile(recordPath, "utf8");
    assert.match(
      record,
      /- State: paused[\s\S]*### Recovery sources\n\n- docs\/api\.md — the accepted response shape\.\n\n### Next useful action\n\n- Wait for the answer\./,
    );

    const close = await runScript(
      workspace,
      ["slice", "close", "--record", recordPath, "--state", "blocked", "--next-action", "Ask again.", "--input", "-"],
      "Result:\n- Stopped.\nEvidence and limits:\n- None.\nTask effect:\n- Waiting.\nResume when:\n- Answer arrives.\n",
    );
    assert.equal(close.exitCode, 0, close.stderr);
    const closed = await readFile(recordPath, "utf8");
    assert.match(closed, /### Current Slice\n\nNone\n\n### Recovery sources\n\n- docs\/api\.md/);

    const resume = await runScript(workspace, ["view", "resume", "--record", recordPath]);
    assert.equal(resume.exitCode, 0, resume.stderr);
    assert.match(resume.stdout, /### Recovery sources\n\n- docs\/api\.md — the accepted response shape\./);
  });
});

test("Recovery sources hold content only and reject nested headings", async () => {
  await withWorkspace(async (workspace) => {
    const recordPath = await init(workspace, "nested");
    await editRecord(recordPath, (text) =>
      text.replace("### Recovery sources\n\n", "### Recovery sources\n\n#### Hidden entity\n- State: in_progress\n\n"),
    );
    assert.notEqual((await validate(workspace, recordPath)).exitCode, 0);
  });
});

test("Checkpoints accept the general types and still read the earlier names", async () => {
  await withWorkspace(async (workspace) => {
    const recordPath = await init(workspace, "types");
    await startDirect(workspace, recordPath);
    for (const [index, type] of ["preserve", "publish", "review", "decision", "continuity"].entries()) {
      const result = await runScript(
        workspace,
        ["checkpoint", "propose", "--record", recordPath, "--title", `Boundary ${index}`, "--input", "-"],
        `Type: ${type}\nCondition:\n- Boundary happens.\nApplies to: S-001\n`,
      );
      assert.equal(result.exitCode, 0, `${type}: ${result.stderr}`);
    }
    const unknown = await runScript(
      workspace,
      ["checkpoint", "propose", "--record", recordPath, "--title", "Unknown", "--input", "-"],
      "Type: commit\nCondition:\n- Boundary happens.\nApplies to: S-001\n",
    );
    assert.notEqual(unknown.exitCode, 0);
    const legacyProposal = await runScript(
      workspace,
      ["checkpoint", "propose", "--record", recordPath, "--title", "Legacy", "--input", "-"],
      "Type: local_commit\nCondition:\n- Boundary happens.\nApplies to: S-001\n",
    );
    assert.notEqual(legacyProposal.exitCode, 0);
    assert.match(legacyProposal.stderr, /must be one of preserve, publish, review, decision, continuity/);

    await editRecord(recordPath, (text) =>
      text
        .replace("- Type: preserve", "- Type: local_commit")
        .replace("- Type: review", "- Type: independent_review")
        .replace("- Type: decision", "- Type: user_decision"),
    );
    assert.equal((await validate(workspace, recordPath)).exitCode, 0);
  });
});

test("task numbers continue after the highest existing task and support more than three digits", async () => {
  await withWorkspace(async (workspace) => {
    const first = await init(workspace, "first");
    await init(workspace, "second");
    await rm(join(first, ".."), { recursive: true });
    assert.match(await init(workspace, "third"), /task-003-third\/record\.md$/);

    await mkdir(join(workspace, ".freeflow/tasks/task-1000-large"));
    const large = await init(workspace, "after-large");
    assert.match(large, /task-1001-after-large\/record\.md$/);
    assert.equal((await validate(workspace, large)).exitCode, 0);
  });
});

test("empty field labels are invalid", async () => {
  await withWorkspace(async (workspace) => {
    const recordPath = await init(workspace, "empty-label");
    await startDirect(workspace, recordPath);
    await editRecord(recordPath, (text) => text.replace("- State: in_progress", "- State: in_progress\n- Type:"));
    const result = await validate(workspace, recordPath);
    assert.notEqual(result.exitCode, 0);
    assert.match(result.stderr, /empty field Type/i);
  });
});

test("a Checkpoint can be replaced only by one that is still pending or deferred", async () => {
  await withWorkspace(async (workspace) => {
    const recordPath = await init(workspace, "replacement");
    await startDirect(workspace, recordPath);
    for (const title of ["First review", "Second review"]) {
      await runScript(
        workspace,
        ["checkpoint", "propose", "--record", recordPath, "--title", title, "--input", "-"],
        "Type: review\nCondition:\n- Review happens.\nApplies to: S-001\n",
      );
      const activated = await runScript(workspace, [
        "checkpoint",
        "activate",
        "--record",
        recordPath,
        "--title",
        title,
      ]);
      assert.equal(activated.exitCode, 0, activated.stderr);
    }
    const completed = await runScript(
      workspace,
      ["checkpoint", "close", "--record", recordPath, "--id", "C-001", "--state", "completed", "--input", "-"],
      "Result:\n- Done.\nTask effect:\n- None.\n",
    );
    assert.equal(completed.exitCode, 0, completed.stderr);
    const before = await readFile(recordPath, "utf8");

    const replaced = await runScript(
      workspace,
      ["checkpoint", "close", "--record", recordPath, "--id", "C-002", "--state", "replaced", "--input", "-"],
      "Result:\n- Replaced.\nTask effect:\n- None.\nReason:\n- Superseded.\nReplaced by: C-001\n",
    );
    assert.notEqual(replaced.exitCode, 0);
    assert.match(replaced.stderr, /pending or deferred/);
    assert.equal(await readFile(recordPath, "utf8"), before);
  });
});
