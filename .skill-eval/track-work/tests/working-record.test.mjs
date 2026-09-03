import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { writeAtomically } from "../../../skills/track-work/scripts/lib/store.mjs";

const scriptPath = resolve("skills/track-work/scripts/working-record.mjs");

async function makeWorkspace() {
  return mkdtemp(join(tmpdir(), "track-work-v4-"));
}

async function runScript(workspace, args, input = "") {
  return new Promise((resolveResult) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: workspace,
      env: { ...process.env, TRACK_WORK_TEST_MODE: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (exitCode) => resolveResult({ exitCode, stdout, stderr }));
    child.stdin.end(input);
  });
}

async function cleanup(workspace) {
  await rm(workspace, { recursive: true, force: true });
}

async function initRecord(workspace, name) {
  return runScript(
    workspace,
    ["init", "--root", workspace, "--name", name, "--input", "-"],
    "### Goal\n- Test task.\n\n### Next useful action\n- Continue the focused test.\n",
  );
}

test("initialization and state boundaries fail closed without changing the record", async () => {
  const workspace = await makeWorkspace();
  try {
    const empty = await runScript(workspace, ["init", "--root", workspace, "--name", "empty"]);
    assert.notEqual(empty.exitCode, 0);
    const duplicate = await runScript(
      workspace,
      ["init", "--root", workspace, "--name", "duplicate", "--input", "-"],
      "### Goal\n- First.\n### Goal\n- Second.\n### Next useful action\n- Continue.\n",
    );
    assert.notEqual(duplicate.exitCode, 0);
    const unknown = await runScript(
      workspace,
      ["init", "--root", workspace, "--name", "unknown", "--input", "-"],
      "### Goal\n- First.\n### Unknown\n- Not allowed.\n### Next useful action\n- Continue.\n",
    );
    assert.notEqual(unknown.exitCode, 0);

    const initialized = await initRecord(workspace, "state-boundaries");
    assert.equal(initialized.exitCode, 0, initialized.stderr);
    const recordPath = initialized.stdout.trim();
    assert.equal(
      (
        await runScript(
          workspace,
          ["slice", "propose", "--record", recordPath, "--title", "Do work", "--input", "-"],
          "Intended result:\n- Work is complete.\n",
        )
      ).exitCode,
      0,
    );
    assert.equal(
      (
        await runScript(
          workspace,
          [
            "slice",
            "start",
            "--record",
            recordPath,
            "--title",
            "Do work",
            "--input",
            "-",
            "--next-action",
            "Continue the focused test.",
          ],
          "Authority source:\n- User request.\nScope:\n- Do the work.\nExpected evidence:\n- Focused check.\nStop condition:\n- Stop if scope changes.\nStarting state:\n- Initial.\n",
        )
      ).exitCode,
      0,
    );
    const beforePause = await readFile(recordPath, "utf8");
    const missingResumeCondition = await runScript(workspace, [
      "slice",
      "pause",
      "--record",
      recordPath,
      "--reason",
      "waiting",
      "--next-action",
      "Continue the focused test.",
    ]);
    assert.notEqual(missingResumeCondition.exitCode, 0);
    assert.equal(await readFile(recordPath, "utf8"), beforePause);

    assert.equal(
      (
        await runScript(workspace, [
          "slice",
          "pause",
          "--record",
          recordPath,
          "--reason",
          "waiting",
          "--resume-when",
          "the dependency returns",
          "--next-action",
          "Continue the focused test.",
        ])
      ).exitCode,
      0,
    );
    const paused = await runScript(workspace, [
      "task",
      "set-state",
      "--record",
      recordPath,
      "--state",
      "paused",
      "--next-action",
      "Continue the focused test.",
    ]);
    assert.equal(paused.exitCode, 0, paused.stderr);
    const proposedCheckpoint = await runScript(
      workspace,
      ["checkpoint", "propose", "--record", recordPath, "--title", "Review paused work", "--input", "-"],
      "Type: continuity\nCondition:\n- Review before continuing.\nApplies to: S-001\n",
    );
    assert.equal(proposedCheckpoint.exitCode, 0, proposedCheckpoint.stderr);
    const beforeInactiveActivation = await readFile(recordPath, "utf8");
    const inactiveActivation = await runScript(workspace, [
      "checkpoint",
      "activate",
      "--record",
      recordPath,
      "--title",
      "Review paused work",
    ]);
    assert.notEqual(inactiveActivation.exitCode, 0);
    assert.equal(await readFile(recordPath, "utf8"), beforeInactiveActivation);

    const beforeInactiveResume = await readFile(recordPath, "utf8");
    const inactiveResume = await runScript(workspace, [
      "slice",
      "resume",
      "--record",
      recordPath,
      "--resolution",
      "the dependency returned",
      "--next-action",
      "Continue the focused test.",
    ]);
    assert.notEqual(inactiveResume.exitCode, 0);
    assert.equal(await readFile(recordPath, "utf8"), beforeInactiveResume);

    const activeAgain = await runScript(workspace, [
      "task",
      "set-state",
      "--record",
      recordPath,
      "--state",
      "active",
      "--next-action",
      "Continue the focused test.",
    ]);
    assert.equal(activeAgain.exitCode, 0, activeAgain.stderr);
    assert.equal(
      (
        await runScript(workspace, [
          "slice",
          "resume",
          "--record",
          recordPath,
          "--resolution",
          "dependency returned",
          "--next-action",
          "Continue the focused test.",
        ])
      ).exitCode,
      0,
    );
    assert.equal(
      (
        await runScript(
          workspace,
          [
            "slice",
            "close",
            "--record",
            recordPath,
            "--state",
            "completed",
            "--input",
            "-",
            "--next-action",
            "Continue the focused test.",
          ],
          "Result:\n- Complete.\nEvidence and limits:\n- Check passed.\nTask effect:\n- Done.\n",
        )
      ).exitCode,
      0,
    );
    assert.equal(
      (
        await runScript(workspace, [
          "task",
          "set-state",
          "--record",
          recordPath,
          "--state",
          "completed",
          "--next-action",
          "Continue the focused test.",
        ])
      ).exitCode,
      0,
    );
    const completedRecord = await readFile(recordPath, "utf8");
    const illegalRepause = await runScript(workspace, [
      "task",
      "set-state",
      "--record",
      recordPath,
      "--state",
      "paused",
      "--next-action",
      "Continue the focused test.",
    ]);
    assert.notEqual(illegalRepause.exitCode, 0);
    assert.equal(await readFile(recordPath, "utf8"), completedRecord);
  } finally {
    await cleanup(workspace);
  }
});

test("paused tasks reject Slice start and historical reopen transitions", async () => {
  const workspace = await makeWorkspace();
  try {
    const initialized = await initRecord(workspace, "paused-task-boundaries");
    assert.equal(initialized.exitCode, 0, initialized.stderr);
    const recordPath = initialized.stdout.trim();
    assert.equal(
      (
        await runScript(
          workspace,
          ["slice", "propose", "--record", recordPath, "--title", "Deferred work", "--input", "-"],
          "Intended result:\n- Work is done.\n",
        )
      ).exitCode,
      0,
    );
    assert.equal(
      (
        await runScript(workspace, [
          "task",
          "set-state",
          "--record",
          recordPath,
          "--state",
          "paused",
          "--next-action",
          "Continue the focused test.",
        ])
      ).exitCode,
      0,
    );
    const beforeStart = await readFile(recordPath, "utf8");
    const rejectedStart = await runScript(
      workspace,
      [
        "slice",
        "start",
        "--record",
        recordPath,
        "--title",
        "Deferred work",
        "--input",
        "-",
        "--next-action",
        "Continue the focused test.",
      ],
      "Authority source:\n- User request.\nScope:\n- Work.\nExpected evidence:\n- Check.\nStop condition:\n- Stop.\nStarting state:\n- Initial.\n",
    );
    assert.notEqual(rejectedStart.exitCode, 0);
    assert.equal(await readFile(recordPath, "utf8"), beforeStart);
    assert.equal(
      (
        await runScript(workspace, [
          "task",
          "set-state",
          "--record",
          recordPath,
          "--state",
          "active",
          "--next-action",
          "Continue the focused test.",
        ])
      ).exitCode,
      0,
    );
    assert.equal(
      (
        await runScript(
          workspace,
          [
            "slice",
            "start",
            "--record",
            recordPath,
            "--title",
            "Deferred work",
            "--input",
            "-",
            "--next-action",
            "Continue the focused test.",
          ],
          "Authority source:\n- User request.\nScope:\n- Work.\nExpected evidence:\n- Check.\nStop condition:\n- Stop.\nStarting state:\n- Initial.\n",
        )
      ).exitCode,
      0,
    );
    assert.equal(
      (
        await runScript(workspace, [
          "slice",
          "pause",
          "--record",
          recordPath,
          "--reason",
          "waiting",
          "--resume-when",
          "later",
          "--next-action",
          "Continue the focused test.",
        ])
      ).exitCode,
      0,
    );
    assert.equal(
      (
        await runScript(
          workspace,
          [
            "slice",
            "close",
            "--record",
            recordPath,
            "--state",
            "blocked",
            "--input",
            "-",
            "--next-action",
            "Continue the focused test.",
          ],
          "Result:\n- Work is paused.\nEvidence and limits:\n- No check yet.\nTask effect:\n- Resume later.\nResume when:\n- The dependency returns.\n",
        )
      ).exitCode,
      0,
    );
    assert.equal(
      (
        await runScript(workspace, [
          "task",
          "set-state",
          "--record",
          recordPath,
          "--state",
          "paused",
          "--next-action",
          "Continue the focused test.",
        ])
      ).exitCode,
      0,
    );
    const beforeReopen = await readFile(recordPath, "utf8");
    const rejectedReopen = await runScript(
      workspace,
      [
        "slice",
        "reopen",
        "--record",
        recordPath,
        "--id",
        "S-001",
        "--input",
        "-",
        "--next-action",
        "Continue the focused test.",
      ],
      "Authority source:\n- User request.\nScope:\n- Work.\nExpected evidence:\n- Check.\nStop condition:\n- Stop.\nStarting state:\n- Initial.\n",
    );
    assert.notEqual(rejectedReopen.exitCode, 0);
    assert.equal(await readFile(recordPath, "utf8"), beforeReopen);
  } finally {
    await cleanup(workspace);
  }
});

test("Last updated is script-maintained but unchanged by views, validation, failures, and direct edits", async () => {
  const workspace = await makeWorkspace();
  try {
    const initialized = await initRecord(workspace, "timestamp-boundary");
    assert.equal(initialized.exitCode, 0, initialized.stderr);
    const recordPath = initialized.stdout.trim();
    const initial = await readFile(recordPath, "utf8");
    const initialTimestamp = initial.match(/^Last updated: (.+)$/m)?.[1];
    assert.ok(initialTimestamp);

    const viewed = await runScript(workspace, ["view", "full", "--record", recordPath]);
    assert.equal(viewed.exitCode, 0, viewed.stderr);
    const validated = await runScript(workspace, ["validate", "--record", recordPath]);
    assert.equal(validated.exitCode, 0, validated.stderr);
    assert.equal((await readFile(recordPath, "utf8")).match(/^Last updated: (.+)$/m)?.[1], initialTimestamp);

    await writeFile(
      recordPath,
      initial.replace("### Settled\n", "### Settled\n\n- Direct edit does not touch the script timestamp.\n"),
      "utf8",
    );
    const afterDirectEdit = await readFile(recordPath, "utf8");
    assert.equal(afterDirectEdit.match(/^Last updated: (.+)$/m)?.[1], initialTimestamp);

    const proposed = await runScript(
      workspace,
      ["slice", "propose", "--record", recordPath, "--title", "Timestamped proposal", "--input", "-"],
      "Intended result:\n- Exercise a scripted update.\n",
    );
    assert.equal(proposed.exitCode, 0, proposed.stderr);
    const afterScript = await readFile(recordPath, "utf8");
    const scriptTimestamp = afterScript.match(/^Last updated: (.+)$/m)?.[1];
    assert.ok(scriptTimestamp);
    assert.notEqual(scriptTimestamp, initialTimestamp);

    const failed = await runScript(
      workspace,
      ["slice", "propose", "--record", recordPath, "--title", "Timestamped proposal", "--input", "-"],
      "Intended result:\n- Duplicate and rejected.\n",
    );
    assert.notEqual(failed.exitCode, 0);
    assert.equal((await readFile(recordPath, "utf8")).match(/^Last updated: (.+)$/m)?.[1], scriptTimestamp);
  } finally {
    await cleanup(workspace);
  }
});

test("validate rejects direct edits that remove Goal or Next useful action", async () => {
  const workspace = await makeWorkspace();
  try {
    const initialized = await initRecord(workspace, "required-current-state");
    assert.equal(initialized.exitCode, 0, initialized.stderr);
    const recordPath = initialized.stdout.trim();
    const original = await readFile(recordPath, "utf8");

    await writeFile(recordPath, original.replace("### Goal\n\n- Test task.\n", "### Goal\n"), "utf8");
    const missingGoal = await runScript(workspace, ["validate", "--record", recordPath]);
    assert.notEqual(missingGoal.exitCode, 0);

    await writeFile(
      recordPath,
      original.replace("### Next useful action\n\n- Continue the focused test.\n", "### Next useful action\n"),
      "utf8",
    );
    const missingNextAction = await runScript(workspace, ["validate", "--record", recordPath]);
    assert.notEqual(missingNextAction.exitCode, 0);
  } finally {
    await cleanup(workspace);
  }
});

test("same-state task commands are no-ops and do not refresh Last updated", async () => {
  const workspace = await makeWorkspace();
  try {
    const initialized = await initRecord(workspace, "same-state-noop");
    assert.equal(initialized.exitCode, 0, initialized.stderr);
    const recordPath = initialized.stdout.trim();
    const before = await readFile(recordPath, "utf8");
    const result = await runScript(workspace, [
      "task",
      "set-state",
      "--record",
      recordPath,
      "--state",
      "active",
      "--next-action",
      "This must not be applied.",
    ]);
    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(await readFile(recordPath, "utf8"), before);
  } finally {
    await cleanup(workspace);
  }
});

test("lifecycle transitions preserve unrelated Context and free-form Notes", async () => {
  const workspace = await makeWorkspace();
  try {
    const initialized = await initRecord(workspace, "source-preservation");
    assert.equal(initialized.exitCode, 0, initialized.stderr);
    const recordPath = initialized.stdout.trim();
    let record = await readFile(recordPath, "utf8");
    record = record.replace("### Goal\n", "### Goal\n\n- Preserve this context bullet.\n");
    record = record.replace(
      "## Notes\n",
      "## Notes\n\nA free-form note with **Markdown** and a custom heading:\n\n## Note detail\n\n- Keep this text.\n",
    );
    await writeFile(recordPath, record, "utf8");

    const proposed = await runScript(
      workspace,
      ["slice", "propose", "--record", recordPath, "--title", "Preserve source", "--input", "-"],
      "Intended result:\n- The transition preserves unrelated source.\n",
    );
    assert.equal(proposed.exitCode, 0, proposed.stderr);
    const started = await runScript(
      workspace,
      [
        "slice",
        "start",
        "--record",
        recordPath,
        "--title",
        "Preserve source",
        "--input",
        "-",
        "--next-action",
        "Continue the focused test.",
      ],
      "Authority source:\n- User request.\nScope:\n- Test source preservation.\nExpected evidence:\n- Record inspection.\nStop condition:\n- Stop if source changes unexpectedly.\nStarting state:\n- Initial.\n",
    );
    assert.equal(started.exitCode, 0, started.stderr);
    record = await readFile(recordPath, "utf8");
    assert.match(record, /Preserve this context bullet/);
    assert.match(record, /A free-form note with \*\*Markdown\*\*/);
    assert.match(record, /## Note detail/);
    assert.equal((await runScript(workspace, ["validate", "--record", recordPath])).exitCode, 0);
  } finally {
    await cleanup(workspace);
  }
});

test("command help is local and unknown options fail before reading a record", async () => {
  const workspace = await makeWorkspace();
  try {
    const help = await runScript(workspace, ["slice", "start", "--help"]);
    assert.equal(help.exitCode, 0, help.stderr);
    assert.match(help.stdout, /slice start/);
    assert.match(help.stdout, /Authority source/);

    const unknown = await runScript(workspace, ["slice", "start", "--not-an-option", "value"]);
    assert.notEqual(unknown.exitCode, 0);
    assert.match(unknown.stderr, /Unknown option/);
  } finally {
    await cleanup(workspace);
  }
});

test("resume projects active Decisions without loading terminal History", async () => {
  const workspace = await makeWorkspace();
  try {
    const initialized = await initRecord(workspace, "projection");
    assert.equal(initialized.exitCode, 0, initialized.stderr);
    const recordPath = initialized.stdout.trim();
    let record = await readFile(recordPath, "utf8");
    record = record.replace(
      "### Decisions\n\n### Checkpoints",
      [
        "### Decisions",
        "",
        "#### D-001 — Preserve compatibility",
        "",
        "State: active",
        "Decision:",
        "- Preserve the existing response shape.",
        "Established by:",
        "- User instruction.",
        "Rationale:",
        "- Existing clients depend on it.",
        "Consequences:",
        "- The adapter remains backward compatible.",
        "Revisit when:",
        "- The public contract changes.",
        "",
        "### Checkpoints",
      ].join("\n"),
    );
    await writeFile(recordPath, record, "utf8");

    const resume = await runScript(workspace, ["view", "resume", "--record", recordPath]);
    assert.equal(resume.exitCode, 0, resume.stderr);
    assert.match(resume.stdout, /## Active Decisions/);
    assert.match(resume.stdout, /D-001 — Preserve compatibility/);
    assert.doesNotMatch(resume.stdout, /## History/);

    const full = await runScript(workspace, ["view", "full", "--record", recordPath]);
    assert.equal(full.exitCode, 0, full.stderr);
    assert.match(full.stdout, /## History/);
    assert.match(full.stdout, /D-001 — Preserve compatibility/);
  } finally {
    await cleanup(workspace);
  }
});

test("slice propose and start move one block and allocate a durable ID", async () => {
  const workspace = await makeWorkspace();
  try {
    const initialized = await initRecord(workspace, "slice-lifecycle");
    assert.equal(initialized.exitCode, 0, initialized.stderr);
    const recordPath = initialized.stdout.trim();

    const proposed = await runScript(
      workspace,
      ["slice", "propose", "--record", recordPath, "--title", "Implement adapter", "--input", "-"],
      "Type: delivery\nIntended result:\n- Existing clients remain compatible.\nExpected evidence:\n- Focused integration test.\n",
    );
    assert.equal(proposed.exitCode, 0, proposed.stderr);

    const afterProposal = await readFile(recordPath, "utf8");
    assert.match(afterProposal, /### Slice — Implement adapter/);
    assert.match(afterProposal, /State: proposed/);
    assert.match(afterProposal, /## Current Work[\s\S]*### Current Slice[\s\S]*None/);
    const beforeMissingStartingState = await readFile(recordPath, "utf8");
    const missingStartingState = await runScript(
      workspace,
      [
        "slice",
        "start",
        "--record",
        recordPath,
        "--title",
        "Implement adapter",
        "--input",
        "-",
        "--next-action",
        "Continue the focused test.",
      ],
      "Authority source:\n- User request.\nScope:\n- Update the adapter.\nExpected evidence:\n- Focused integration test.\nStop condition:\n- Stop if the contract is unclear.\n",
    );
    assert.notEqual(missingStartingState.exitCode, 0);
    assert.equal(await readFile(recordPath, "utf8"), beforeMissingStartingState);

    const started = await runScript(
      workspace,
      [
        "slice",
        "start",
        "--record",
        recordPath,
        "--title",
        "Implement adapter",
        "--input",
        "-",
        "--next-action",
        "Continue the focused test.",
      ],
      "Authority source:\n- User request.\nScope:\n- Update the adapter.\nStop condition:\n- Stop if the contract is unclear.\nStarting state:\n- Existing repository.\n",
    );
    assert.equal(started.exitCode, 0, started.stderr);

    const afterStart = await readFile(recordPath, "utf8");
    assert.doesNotMatch(afterStart, /### Slice — Implement adapter/);
    assert.match(afterStart, /#### S-001 — Implement adapter/);
    assert.match(afterStart, /State: in_progress/);
    assert.match(afterStart, /Authority source:/);
    assert.match(afterStart, /### Next useful action\n\n- Continue the focused test\./);
    assert.match(afterStart, /## Future Work[\s\S]*## History/);
    assert.doesNotMatch(afterStart, /## Current Work[\s\S]*None/);

    const validated = await runScript(workspace, ["validate", "--record", recordPath]);
    assert.equal(validated.exitCode, 0, validated.stderr);
  } finally {
    await cleanup(workspace);
  }
});

test("direct Slice start creates current work without consuming Future Work", async () => {
  const workspace = await makeWorkspace();
  try {
    const initialized = await initRecord(workspace, "direct-start");
    assert.equal(initialized.exitCode, 0, initialized.stderr);
    const recordPath = initialized.stdout.trim();
    const proposed = await runScript(
      workspace,
      ["slice", "propose", "--record", recordPath, "--title", "Keep this proposal", "--input", "-"],
      "Intended result:\n- The proposal remains for later.\n",
    );
    assert.equal(proposed.exitCode, 0, proposed.stderr);
    const before = await readFile(recordPath, "utf8");

    const direct = await runScript(
      workspace,
      [
        "slice",
        "start-direct",
        "--record",
        recordPath,
        "--title",
        "Immediate result",
        "--input",
        "-",
        "--next-action",
        "Verify the immediate result.",
      ],
      "Type: delivery\nIntended result:\n- Deliver the immediate result.\nAuthority source:\n- User request.\nScope:\n- Implement only the immediate result.\nExpected evidence:\n- Focused verification.\nStop condition:\n- Stop if the contract changes.\nStarting state:\n- Existing repository.\n",
    );
    assert.equal(direct.exitCode, 0, direct.stderr);
    const after = await readFile(recordPath, "utf8");
    assert.match(after, /#### S-001 — Immediate result/);
    assert.match(after, /### Next useful action\n\n- Verify the immediate result\./);
    assert.match(after, /### Slice — Keep this proposal/);
    assert.equal(
      after.slice(after.indexOf("## Future Work"), after.indexOf("## History")),
      before.slice(before.indexOf("## Future Work"), before.indexOf("## History")),
    );
    assert.equal((await runScript(workspace, ["validate", "--record", recordPath])).exitCode, 0);
  } finally {
    await cleanup(workspace);
  }
});

test("direct Slice start rejects a title that would consume Future Work", async () => {
  const workspace = await makeWorkspace();
  try {
    const initialized = await initRecord(workspace, "direct-start-conflict");
    assert.equal(initialized.exitCode, 0, initialized.stderr);
    const recordPath = initialized.stdout.trim();
    assert.equal(
      (
        await runScript(
          workspace,
          ["slice", "propose", "--record", recordPath, "--title", "Existing proposal", "--input", "-"],
          "Intended result:\n- Keep this outcome queued.\n",
        )
      ).exitCode,
      0,
    );
    const before = await readFile(recordPath, "utf8");
    const rejected = await runScript(
      workspace,
      [
        "slice",
        "start-direct",
        "--record",
        recordPath,
        "--title",
        "Existing proposal",
        "--input",
        "-",
        "--next-action",
        "Continue.",
      ],
      "Intended result:\n- Consume it directly.\nAuthority source:\n- User request.\nScope:\n- Work.\nExpected evidence:\n- Check.\nStop condition:\n- Stop.\nStarting state:\n- Initial.\n",
    );
    assert.notEqual(rejected.exitCode, 0);
    assert.equal(await readFile(recordPath, "utf8"), before);
  } finally {
    await cleanup(workspace);
  }
});

test("Slice pause, resume, close, and reopen preserve material lifecycle state", async () => {
  const workspace = await makeWorkspace();
  try {
    const initialized = await initRecord(workspace, "slice-history");
    assert.equal(initialized.exitCode, 0, initialized.stderr);
    const recordPath = initialized.stdout.trim();
    const proposed = await runScript(
      workspace,
      ["slice", "propose", "--record", recordPath, "--title", "Deliver result", "--input", "-"],
      "Type: delivery\nIntended result:\n- The accepted result is delivered.\nExpected evidence:\n- Focused verification.\n",
    );
    assert.equal(proposed.exitCode, 0, proposed.stderr);
    const started = await runScript(
      workspace,
      [
        "slice",
        "start",
        "--record",
        recordPath,
        "--title",
        "Deliver result",
        "--input",
        "-",
        "--next-action",
        "Continue the focused test.",
      ],
      "Authority source:\n- User request.\nScope:\n- Implement the accepted result.\nExpected evidence:\n- Focused verification.\nStop condition:\n- Stop if the contract changes.\nStarting state:\n- Initial repository.\n",
    );
    assert.equal(started.exitCode, 0, started.stderr);

    const paused = await runScript(workspace, [
      "slice",
      "pause",
      "--record",
      recordPath,
      "--reason",
      "waiting for a user decision",
      "--resume-when",
      "the user decides",
      "--next-action",
      "Continue the focused test.",
    ]);
    assert.equal(paused.exitCode, 0, paused.stderr);
    let record = await readFile(recordPath, "utf8");
    assert.match(record, /State: paused/);
    assert.match(record, /Paused — reason: waiting for a user decision; resume when: the user decides/);

    const resumed = await runScript(workspace, [
      "slice",
      "resume",
      "--record",
      recordPath,
      "--resolution",
      "the user selected the compatible policy",
      "--next-action",
      "Continue the focused test.",
    ]);
    assert.equal(resumed.exitCode, 0, resumed.stderr);
    record = await readFile(recordPath, "utf8");
    assert.match(record, /State: in_progress/);
    assert.match(record, /Resumed — resolution source: the user selected the compatible policy/);

    const closed = await runScript(
      workspace,
      [
        "slice",
        "close",
        "--record",
        recordPath,
        "--state",
        "completed",
        "--input",
        "-",
        "--next-action",
        "Continue the focused test.",
      ],
      "Result:\n- The result is delivered.\nEvidence and limits:\n- Focused verification passed; production remains unobserved.\nTask effect:\n- The task can proceed to integration.\n",
    );
    assert.equal(closed.exitCode, 0, closed.stderr);
    record = await readFile(recordPath, "utf8");
    assert.match(record, /### Current Slice[\s\S]*None/);
    assert.match(record, /#### S-001 — Deliver result/);
    assert.match(record, /State: completed/);
    assert.match(record, /Evidence and limits:/);
    assert.doesNotMatch(record, /##### Material updates/);

    const reopened = await runScript(
      workspace,
      [
        "slice",
        "reopen",
        "--record",
        recordPath,
        "--id",
        "S-001",
        "--input",
        "-",
        "--next-action",
        "Continue the focused test.",
      ],
      "Authority source:\n- User request to continue.\nScope:\n- Verify the remaining boundary.\nExpected evidence:\n- Production check.\nStop condition:\n- Stop if access is unavailable.\nStarting state:\n- Local result from S-001.\n",
    );
    assert.equal(reopened.exitCode, 0, reopened.stderr);
    record = await readFile(recordPath, "utf8");
    assert.match(record, /#### S-002 — Deliver result/);
    assert.match(record, /Reopened from: S-001/);
    assert.match(record, /#### S-001 — Deliver result[\s\S]*State: completed/);

    const reopenedClosed = await runScript(
      workspace,
      [
        "slice",
        "close",
        "--record",
        recordPath,
        "--state",
        "completed",
        "--input",
        "-",
        "--next-action",
        "Continue the focused test.",
      ],
      "Result:\n- The reopened work is complete.\nEvidence and limits:\n- The linked Slice was validated.\nTask effect:\n- The demo is settled.\n",
    );
    assert.equal(reopenedClosed.exitCode, 0, reopenedClosed.stderr);
    record = await readFile(recordPath, "utf8");
    assert.match(record, /#### S-002 — Deliver result[\s\S]*Reopened from: S-001/);
    assert.match(record, /### Current Slice\n\nNone/);

    const validated = await runScript(workspace, ["validate", "--record", recordPath]);
    assert.equal(validated.exitCode, 0, validated.stderr);
  } finally {
    await cleanup(workspace);
  }
});

test("Checkpoint lifecycle assigns identity, follows its Slice, and blocks closure until resolved", async () => {
  const workspace = await makeWorkspace();
  try {
    const initialized = await initRecord(workspace, "checkpoint-lifecycle");
    assert.equal(initialized.exitCode, 0, initialized.stderr);
    const recordPath = initialized.stdout.trim();
    assert.equal(
      (
        await runScript(
          workspace,
          ["slice", "propose", "--record", recordPath, "--title", "Deliver result", "--input", "-"],
          "Intended result:\n- The result is delivered.\n",
        )
      ).exitCode,
      0,
    );
    assert.equal(
      (
        await runScript(
          workspace,
          ["checkpoint", "propose", "--record", recordPath, "--title", "Review result", "--input", "-"],
          "Type: independent_review\nCondition:\n- Review before closure.\nApplies to: Deliver result\n",
        )
      ).exitCode,
      0,
    );
    const activated = await runScript(workspace, [
      "checkpoint",
      "activate",
      "--record",
      recordPath,
      "--title",
      "Review result",
      "--next-action",
      "Review the pending boundary.",
    ]);
    assert.equal(activated.exitCode, 0, activated.stderr);
    let record = await readFile(recordPath, "utf8");
    assert.match(record, /### Checkpoint C-001 — Review result/);
    assert.match(record, /State: pending/);
    assert.match(record, /### Next useful action\n\n- Review the pending boundary\./);

    const started = await runScript(
      workspace,
      [
        "slice",
        "start",
        "--record",
        recordPath,
        "--title",
        "Deliver result",
        "--input",
        "-",
        "--next-action",
        "Continue the focused test.",
      ],
      "Authority source:\n- User request.\nScope:\n- Deliver the result.\nExpected evidence:\n- Focused check.\nStop condition:\n- Stop if the contract changes.\nStarting state:\n- Initial repository.\n",
    );
    assert.equal(started.exitCode, 0, started.stderr);
    record = await readFile(recordPath, "utf8");
    assert.match(record, /### Checkpoint C-001 — Review result[\s\S]*Applies to: S-001/);

    const beforeFailedClose = record;
    const rejectedClose = await runScript(
      workspace,
      [
        "slice",
        "close",
        "--record",
        recordPath,
        "--state",
        "completed",
        "--input",
        "-",
        "--next-action",
        "Continue the focused test.",
      ],
      "Result:\n- Done.\nEvidence and limits:\n- Local check passed.\nTask effect:\n- Continue.\n",
    );
    assert.notEqual(rejectedClose.exitCode, 0);
    assert.equal(await readFile(recordPath, "utf8"), beforeFailedClose);

    const deferred = await runScript(workspace, [
      "checkpoint",
      "defer",
      "--record",
      recordPath,
      "--id",
      "C-001",
      "--next-action",
      "Wait for the deferred boundary.",
    ]);
    assert.equal(deferred.exitCode, 0, deferred.stderr);
    record = await readFile(recordPath, "utf8");
    assert.match(record, /State: deferred/);
    assert.match(record, /### Next useful action\n\n- Wait for the deferred boundary\./);
    const resumed = await runScript(workspace, ["checkpoint", "resume", "--record", recordPath, "--id", "C-001"]);
    assert.equal(resumed.exitCode, 0, resumed.stderr);

    const checkpointClosed = await runScript(
      workspace,
      ["checkpoint", "close", "--record", recordPath, "--id", "C-001", "--state", "completed", "--input", "-"],
      "Result:\n- Review completed.\nEvidence:\n- review:compatibility\nTask effect:\n- The Slice may close.\n",
    );
    assert.equal(checkpointClosed.exitCode, 0, checkpointClosed.stderr);
    record = await readFile(recordPath, "utf8");
    assert.match(record, /### Checkpoints[\s\S]*#### C-001 — Review result/);
    assert.doesNotMatch(record, /### Checkpoint C-001 — Review result/);

    const closed = await runScript(
      workspace,
      [
        "slice",
        "close",
        "--record",
        recordPath,
        "--state",
        "completed",
        "--input",
        "-",
        "--next-action",
        "Continue the focused test.",
      ],
      "Result:\n- Done.\nEvidence and limits:\n- Local check passed.\nTask effect:\n- Continue.\n",
    );
    assert.equal(closed.exitCode, 0, closed.stderr);
    const validated = await runScript(workspace, ["validate", "--record", recordPath]);
    assert.equal(validated.exitCode, 0, validated.stderr);
  } finally {
    await cleanup(workspace);
  }
});

test("paused work can become historical blocked and abandoned work remains terminal", async () => {
  const workspace = await makeWorkspace();
  try {
    const initialized = await initRecord(workspace, "blocked-slices");
    assert.equal(initialized.exitCode, 0, initialized.stderr);
    const recordPath = initialized.stdout.trim();
    assert.equal(
      (
        await runScript(
          workspace,
          ["slice", "propose", "--record", recordPath, "--title", "Investigate failure", "--input", "-"],
          "Intended result:\n- Explain the failure.\n",
        )
      ).exitCode,
      0,
    );
    assert.equal(
      (
        await runScript(
          workspace,
          [
            "slice",
            "start",
            "--record",
            recordPath,
            "--title",
            "Investigate failure",
            "--input",
            "-",
            "--next-action",
            "Continue the focused test.",
          ],
          "Authority source:\n- User request.\nScope:\n- Investigate the failure.\nExpected evidence:\n- Reproduction.\nStop condition:\n- Stop if the cause is unclear.\nStarting state:\n- Initial.\n",
        )
      ).exitCode,
      0,
    );
    assert.equal(
      (
        await runScript(workspace, [
          "slice",
          "pause",
          "--record",
          recordPath,
          "--reason",
          "the environment is unavailable",
          "--resume-when",
          "the environment returns",
          "--next-action",
          "Continue the focused test.",
        ])
      ).exitCode,
      0,
    );
    const blocked = await runScript(
      workspace,
      [
        "slice",
        "close",
        "--record",
        recordPath,
        "--state",
        "blocked",
        "--input",
        "-",
        "--next-action",
        "Continue the focused test.",
      ],
      "Result:\n- Investigation stopped before a cause was established.\nEvidence and limits:\n- The reproduction environment was unavailable.\nTask effect:\n- The cause remains unresolved.\nResume when:\n- The environment returns.\n",
    );
    assert.equal(blocked.exitCode, 0, blocked.stderr);
    let record = await readFile(recordPath, "utf8");
    assert.match(record, /#### S-001 — Investigate failure/);
    assert.match(record, /State: blocked/);
    assert.match(record, /Resume when:/);
    assert.match(record, /### Current Slice\n\nNone/);

    const reopened = await runScript(
      workspace,
      [
        "slice",
        "reopen",
        "--record",
        recordPath,
        "--id",
        "S-001",
        "--input",
        "-",
        "--next-action",
        "Continue the focused test.",
      ],
      "Authority source:\n- User request.\nScope:\n- Re-run the investigation.\nExpected evidence:\n- A reproduced failure.\nStop condition:\n- Stop if no reliable reproduction is possible.\nStarting state:\n- Environment restored.\n",
    );
    assert.equal(reopened.exitCode, 0, reopened.stderr);
    const abandoned = await runScript(
      workspace,
      [
        "slice",
        "close",
        "--record",
        recordPath,
        "--state",
        "abandoned",
        "--input",
        "-",
        "--next-action",
        "Continue the focused test.",
      ],
      "Result:\n- The investigation is no longer pursued.\nEvidence and limits:\n- No reliable reproduction was obtained.\nTask effect:\n- The failure remains unexplained.\nReason:\n- The investigation was explicitly discontinued.\n",
    );
    assert.equal(abandoned.exitCode, 0, abandoned.stderr);
    record = await readFile(recordPath, "utf8");
    assert.match(record, /#### S-002 — Investigate failure/);
    assert.match(record, /State: abandoned/);
    assert.match(record, /Reason:/);
    assert.equal((await runScript(workspace, ["validate", "--record", recordPath])).exitCode, 0);
  } finally {
    await cleanup(workspace);
  }
});

test("Checkpoint cancellation and replacement preserve terminal history", async () => {
  const workspace = await makeWorkspace();
  try {
    const initialized = await initRecord(workspace, "checkpoint-terminal");
    assert.equal(initialized.exitCode, 0, initialized.stderr);
    const recordPath = initialized.stdout.trim();
    const sliceProposal = await runScript(
      workspace,
      ["slice", "propose", "--record", recordPath, "--title", "Deliver result", "--input", "-"],
      "Intended result:\n- Deliver result.\n",
    );
    assert.equal(sliceProposal.exitCode, 0, sliceProposal.stderr);
    let record = await readFile(recordPath, "utf8");

    const checkpoint = await runScript(
      workspace,
      ["checkpoint", "propose", "--record", recordPath, "--title", "Review result", "--input", "-"],
      "Type: independent_review\nCondition:\n- Review before closure.\nApplies to: Deliver result\n",
    );
    assert.equal(checkpoint.exitCode, 0, checkpoint.stderr);
    const replacement = await runScript(
      workspace,
      ["checkpoint", "propose", "--record", recordPath, "--title", "Replacement review", "--input", "-"],
      "Type: independent_review\nCondition:\n- Use the replacement boundary.\nApplies to: Deliver result\n",
    );
    assert.equal(replacement.exitCode, 0, replacement.stderr);
    assert.equal(
      (await runScript(workspace, ["checkpoint", "activate", "--record", recordPath, "--title", "Review result"]))
        .exitCode,
      0,
    );
    assert.equal(
      (await runScript(workspace, ["checkpoint", "activate", "--record", recordPath, "--title", "Replacement review"]))
        .exitCode,
      0,
    );
    const started = await runScript(
      workspace,
      [
        "slice",
        "start",
        "--record",
        recordPath,
        "--title",
        "Deliver result",
        "--input",
        "-",
        "--next-action",
        "Continue the focused test.",
      ],
      "Authority source:\n- User request.\nScope:\n- Deliver the result.\nExpected evidence:\n- Focused check.\nStop condition:\n- Stop if scope changes.\nStarting state:\n- Initial.\n",
    );
    assert.equal(started.exitCode, 0, started.stderr);
    const replaced = await runScript(
      workspace,
      ["checkpoint", "close", "--record", recordPath, "--id", "C-001", "--state", "replaced", "--input", "-"],
      "Result:\n- The original review boundary was replaced.\nTask effect:\n- Use the replacement review.\nReason:\n- The original boundary was too broad.\nReplaced by: C-002\n",
    );
    assert.equal(replaced.exitCode, 0, replaced.stderr);
    const cancelled = await runScript(
      workspace,
      ["checkpoint", "close", "--record", recordPath, "--id", "C-002", "--state", "cancelled", "--input", "-"],
      "Result:\n- The review is no longer required.\nTask effect:\n- The Slice can continue.\nReason:\n- The boundary was removed from scope.\n",
    );
    assert.equal(cancelled.exitCode, 0, cancelled.stderr);
    record = await readFile(recordPath, "utf8");
    assert.match(record, /#### C-001 — Review result/);
    assert.match(record, /State: replaced/);
    assert.match(record, /Replaced by: C-002/);
    assert.match(record, /#### C-002 — Replacement review/);
    assert.match(record, /State: cancelled/);
    assert.equal((await runScript(workspace, ["validate", "--record", recordPath])).exitCode, 0);
  } finally {
    await cleanup(workspace);
  }
});

test("Decision commands preserve active history and atomic supersession", async () => {
  const workspace = await makeWorkspace();
  try {
    const initialized = await initRecord(workspace, "decision-lifecycle");
    assert.equal(initialized.exitCode, 0, initialized.stderr);
    const recordPath = initialized.stdout.trim();
    const added = await runScript(
      workspace,
      ["decision", "add", "--record", recordPath, "--title", "Keep Markdown", "--input", "-"],
      "Decision:\n- Keep Markdown canonical.\nEstablished by:\n- User instruction.\nRationale:\n- It is readable.\nConsequences:\n- Views can project it.\nRevisit when:\n- Storage requirements change.\n",
    );
    assert.equal(added.exitCode, 0, added.stderr);

    const superseded = await runScript(
      workspace,
      [
        "decision",
        "supersede",
        "--record",
        recordPath,
        "--id",
        "D-001",
        "--title",
        "Use source-preserving edits",
        "--input",
        "-",
      ],
      "Decision:\n- Preserve source Markdown while changing lifecycle blocks.\nEstablished by:\n- Follow-up design decision.\nRationale:\n- Normal edits should remain easy.\nConsequences:\n- The parser must retain source ranges.\nRevisit when:\n- Direct editing is no longer reliable.\n",
    );
    assert.equal(superseded.exitCode, 0, superseded.stderr);
    let record = await readFile(recordPath, "utf8");
    assert.match(record, /#### D-001 — Keep Markdown[\s\S]*State: superseded[\s\S]*Superseded by: D-002/);
    assert.match(record, /#### D-002 — Use source-preserving edits[\s\S]*State: active/);

    const resume = await runScript(workspace, ["view", "resume", "--record", recordPath]);
    assert.equal(resume.exitCode, 0, resume.stderr);
    assert.doesNotMatch(resume.stdout, /Keep Markdown/);
    assert.match(resume.stdout, /Use source-preserving edits/);

    const retired = await runScript(workspace, [
      "decision",
      "retire",
      "--record",
      recordPath,
      "--id",
      "D-002",
      "--reason",
      "The storage boundary is settled",
    ]);
    assert.equal(retired.exitCode, 0, retired.stderr);
    record = await readFile(recordPath, "utf8");
    assert.match(
      record,
      /#### D-002 — Use source-preserving edits[\s\S]*State: retired[\s\S]*Retired because: The storage boundary is settled/,
    );
    const afterRetirement = await runScript(workspace, ["view", "resume", "--record", recordPath]);
    assert.equal(afterRetirement.exitCode, 0, afterRetirement.stderr);
    assert.doesNotMatch(afterRetirement.stdout, /## Active Decisions/);

    const validated = await runScript(workspace, ["validate", "--record", recordPath]);
    assert.equal(validated.exitCode, 0, validated.stderr);
  } finally {
    await cleanup(workspace);
  }
});

test("task state transitions pause a current Slice and enforce terminal invariants", async () => {
  const workspace = await makeWorkspace();
  try {
    const initialized = await initRecord(workspace, "task-state");
    assert.equal(initialized.exitCode, 0, initialized.stderr);
    const recordPath = initialized.stdout.trim();
    assert.equal(
      (
        await runScript(
          workspace,
          ["slice", "propose", "--record", recordPath, "--title", "Do work", "--input", "-"],
          "Intended result:\n- Work is complete.\n",
        )
      ).exitCode,
      0,
    );
    assert.equal(
      (
        await runScript(
          workspace,
          [
            "slice",
            "start",
            "--record",
            recordPath,
            "--title",
            "Do work",
            "--input",
            "-",
            "--next-action",
            "Continue the focused test.",
          ],
          "Authority source:\n- User request.\nScope:\n- Do the work.\nExpected evidence:\n- Focused check.\nStop condition:\n- Stop if scope changes.\nStarting state:\n- Initial.\n",
        )
      ).exitCode,
      0,
    );
    const paused = await runScript(workspace, [
      "task",
      "set-state",
      "--record",
      recordPath,
      "--state",
      "paused",
      "--next-action",
      "Continue the focused test.",
    ]);
    assert.equal(paused.exitCode, 0, paused.stderr);
    let record = await readFile(recordPath, "utf8");
    assert.match(record, /State: paused/);
    assert.match(record, /### Current Slice[\s\S]*State: paused/);

    const active = await runScript(workspace, [
      "task",
      "set-state",
      "--record",
      recordPath,
      "--state",
      "active",
      "--next-action",
      "Continue the focused test.",
    ]);
    assert.equal(active.exitCode, 0, active.stderr);
    record = await readFile(recordPath, "utf8");
    assert.match(record, /State: active/);
    assert.match(record, /### Current Slice[\s\S]*State: paused/);

    const invalidTerminal = await runScript(workspace, [
      "task",
      "set-state",
      "--record",
      recordPath,
      "--state",
      "completed",
      "--next-action",
      "Continue the focused test.",
    ]);
    assert.notEqual(invalidTerminal.exitCode, 0);
    assert.equal(await readFile(recordPath, "utf8"), record);

    const resumed = await runScript(workspace, [
      "slice",
      "resume",
      "--record",
      recordPath,
      "--resolution",
      "the task is active",
      "--next-action",
      "Continue the focused test.",
    ]);
    assert.equal(resumed.exitCode, 0, resumed.stderr);
    const closed = await runScript(
      workspace,
      [
        "slice",
        "close",
        "--record",
        recordPath,
        "--state",
        "completed",
        "--input",
        "-",
        "--next-action",
        "Continue the focused test.",
      ],
      "Result:\n- Work is complete.\nEvidence and limits:\n- Focused check passed.\nTask effect:\n- Nothing remains.\n",
    );
    assert.equal(closed.exitCode, 0, closed.stderr);
    const completed = await runScript(workspace, [
      "task",
      "set-state",
      "--record",
      recordPath,
      "--state",
      "completed",
      "--next-action",
      "Continue the focused test.",
    ]);
    assert.equal(completed.exitCode, 0, completed.stderr);
    record = await readFile(recordPath, "utf8");
    assert.match(record, /^State: completed/m);
    assert.match(record, /### Current Slice[\s\S]*None/);
    const reactivated = await runScript(workspace, [
      "task",
      "set-state",
      "--record",
      recordPath,
      "--state",
      "active",
      "--next-action",
      "Continue the focused test.",
    ]);
    assert.equal(reactivated.exitCode, 0, reactivated.stderr);
    record = await readFile(recordPath, "utf8");
    assert.match(record, /^State: active/m);
    assert.equal((await runScript(workspace, ["validate", "--record", recordPath])).exitCode, 0);
  } finally {
    await cleanup(workspace);
  }
});

test("task abandonment is terminal until explicitly reactivated", async () => {
  const workspace = await makeWorkspace();
  try {
    const initialized = await initRecord(workspace, "task-abandonment");
    assert.equal(initialized.exitCode, 0, initialized.stderr);
    const recordPath = initialized.stdout.trim();
    const paused = await runScript(workspace, [
      "task",
      "set-state",
      "--record",
      recordPath,
      "--state",
      "paused",
      "--next-action",
      "Continue the focused test.",
    ]);
    assert.equal(paused.exitCode, 0, paused.stderr);
    const abandoned = await runScript(workspace, [
      "task",
      "set-state",
      "--record",
      recordPath,
      "--state",
      "abandoned",
      "--next-action",
      "Continue the focused test.",
    ]);
    assert.equal(abandoned.exitCode, 0, abandoned.stderr);
    let record = await readFile(recordPath, "utf8");
    assert.match(record, /^State: abandoned/m);
    const reactivated = await runScript(workspace, [
      "task",
      "set-state",
      "--record",
      recordPath,
      "--state",
      "active",
      "--next-action",
      "Continue the focused test.",
    ]);
    assert.equal(reactivated.exitCode, 0, reactivated.stderr);
    record = await readFile(recordPath, "utf8");
    assert.match(record, /^State: active/m);
    assert.equal((await runScript(workspace, ["validate", "--record", recordPath])).exitCode, 0);
  } finally {
    await cleanup(workspace);
  }
});

test("atomic publication rejects a stale source without overwriting newer content", async () => {
  const workspace = await makeWorkspace();
  try {
    const initialized = await initRecord(workspace, "stale-source");
    assert.equal(initialized.exitCode, 0, initialized.stderr);
    const recordPath = initialized.stdout.trim();
    const source = await readFile(recordPath, "utf8");
    const newer = `${source}\nA newer direct edit.\n`;
    await writeFile(recordPath, newer, "utf8");
    await assert.rejects(
      writeAtomically(workspace, recordPath, source, `${source}Published stale content.\n`),
      (error) => error.code === "stale-source",
    );
    assert.equal(await readFile(recordPath, "utf8"), newer);
  } finally {
    await cleanup(workspace);
  }
});

test("invalid proposals and malformed lifecycle input leave the record unchanged", async () => {
  const workspace = await makeWorkspace();
  try {
    const initialized = await initRecord(workspace, "failure-safety");
    assert.equal(initialized.exitCode, 0, initialized.stderr);
    const recordPath = initialized.stdout.trim();
    const first = await runScript(
      workspace,
      ["slice", "propose", "--record", recordPath, "--title", "Unique result", "--input", "-"],
      "Intended result:\n- One result.\n",
    );
    assert.equal(first.exitCode, 0, first.stderr);
    const beforeDuplicate = await readFile(recordPath, "utf8");
    const duplicate = await runScript(
      workspace,
      ["slice", "propose", "--record", recordPath, "--title", "Unique result", "--input", "-"],
      "Intended result:\n- Another result.\n",
    );
    assert.notEqual(duplicate.exitCode, 0);
    assert.equal(await readFile(recordPath, "utf8"), beforeDuplicate);

    const malformed = await runScript(
      workspace,
      ["slice", "propose", "--record", recordPath, "--title", "Malformed", "--input", "-"],
      "Unknown field:\n- Not allowed.\nIntended result:\n- Should fail.\n",
    );
    assert.notEqual(malformed.exitCode, 0);
    assert.equal(await readFile(recordPath, "utf8"), beforeDuplicate);
  } finally {
    await cleanup(workspace);
  }
});

test("init accepts compact context headings and resume omits long terminal History", async () => {
  const workspace = await makeWorkspace();
  try {
    const initialized = await runScript(
      workspace,
      ["init", "--root", workspace, "--name", "context-input", "--input", "-"],
      "### Goal\n- Preserve the task across a reset.\n\n### Settled\n- The record is canonical.\n\n### Current direction\n- Inspect before editing.\n\n### Next useful action\n- Read the current source.\n",
    );
    assert.equal(initialized.exitCode, 0, initialized.stderr);
    const recordPath = initialized.stdout.trim();
    let record = await readFile(recordPath, "utf8");
    assert.match(record, /### Goal\n\n- Preserve the task across a reset\./);
    assert.match(record, /### Next useful action\n\n- Read the current source\./);

    const history = [];
    for (let index = 1; index <= 120; index += 1) {
      const id = String(index).padStart(3, "0");
      history.push(
        [
          `#### S-${id} — Historical ${id}`,
          "State: completed",
          "Intended result:",
          `- Result ${id}.`,
          "Result:",
          `- Completed ${id}.`,
          "Evidence and limits:",
          `- Evidence ${id}.`,
          "Task effect:",
          `- Effect ${id}.`,
          "",
        ].join("\n"),
      );
    }
    record = record.replace("### Slices\n\n## Notes", `### Slices\n\n${history.join("\n")}## Notes`);
    await writeFile(recordPath, record, "utf8");

    const resume = await runScript(workspace, ["view", "resume", "--record", recordPath]);
    assert.equal(resume.exitCode, 0, resume.stderr);
    assert.match(resume.stdout, /Preserve the task across a reset/);
    assert.doesNotMatch(resume.stdout, /Historical 120/);

    const full = await runScript(workspace, ["view", "full", "--record", recordPath]);
    assert.equal(full.exitCode, 0, full.stderr);
    assert.match(full.stdout, /Historical 120/);
  } finally {
    await cleanup(workspace);
  }
});

test("init creates the complete Schema 4 skeleton and two bounded views", async () => {
  const workspace = await makeWorkspace();
  try {
    const initialized = await initRecord(workspace, "continuity");
    assert.equal(initialized.exitCode, 0, initialized.stderr);
    const recordPath = initialized.stdout.trim();
    assert.match(recordPath, /\.freeflow\/tasks\/task-001-continuity\/record\.md$/);

    const record = await readFile(recordPath, "utf8");
    for (const heading of [
      "# Working Record: continuity",
      "Schema: 4",
      "State: active",
      "## Current Context",
      "### Goal",
      "### What defines this task",
      "### Settled",
      "### Tentative",
      "### Open",
      "### Current direction",
      "### Boundaries",
      "## Current Work",
      "### Current Slice",
      "None",
      "### Next useful action",
      "## Future Work",
      "## History",
      "### Decisions",
      "### Checkpoints",
      "### Slices",
      "## Notes",
    ]) {
      assert.ok(record.includes(heading), `missing ${heading}`);
    }
    assert.match(record, /^Last updated: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/m);

    const full = await runScript(workspace, ["view", "full", "--record", recordPath]);
    assert.equal(full.exitCode, 0, full.stderr);
    assert.equal(full.stdout, record);

    const resume = await runScript(workspace, ["view", "resume", "--record", recordPath]);
    assert.equal(resume.exitCode, 0, resume.stderr);
    assert.match(resume.stdout, /## Current Context/);
    assert.match(resume.stdout, /## Current Work/);
    assert.match(resume.stdout, /## Future Work/);
    assert.match(resume.stdout, /## Notes/);
    assert.doesNotMatch(resume.stdout, /## History/);
  } finally {
    await cleanup(workspace);
  }
});
