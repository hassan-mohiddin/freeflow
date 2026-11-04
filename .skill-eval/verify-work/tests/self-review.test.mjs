import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { git, repository, run, write } from "../../execute-work/tests/helpers.mjs";

const script = resolve("skills/verify-work/scripts/self-review.mjs");

const base = {
  "src/math.js": "export const add = (a, b) => a + b;\n",
  "test/math.test.mjs":
    'import assert from "node:assert";\nimport { add } from "../src/math.js";\nassert.equal(add(1, 2), 3);\n',
  "test/fixtures/users.json": '[{ "name": "Ada" }]\n',
};

test("self-review lists the change, changed fixtures with hunks, new tests on the base and leftovers", async () => {
  const root = await repository("self-review-", base);
  const scratch = join(root, ".scratch-out");
  try {
    await write(root, {
      ".gitignore": ".scratch-out/\n",
      "src/math.js": 'export const add = (a, b) => a + b;\nexport const sub = (a, b) => a - b;\nconsole.log("here");\n',
      "test/fixtures/users.json": "[]\n",
      // Fails on the base: sub does not exist there.
      "test/sub.test.mjs":
        'import assert from "node:assert";\nimport { sub } from "../src/math.js";\nassert.equal(sub(3, 1), 2);\n',
      // Passes on the base: it tests nothing the change added.
      "test/add-again.test.mjs":
        'import assert from "node:assert";\nimport { add } from "../src/math.js";\nassert.equal(add(2, 2), 4);\n',
    });
    const result = run(script, root, [
      "--base",
      "HEAD",
      "--scratch",
      scratch,
      "--test-command",
      "node {file}",
      "--json",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.ok(report.diffStat.at(-1).includes("2 files changed"));
    assert.deepEqual(report.untracked.sort(), [".gitignore", "test/add-again.test.mjs", "test/sub.test.mjs"]);
    assert.deepEqual(
      report.changedTests.map((each) => [each.status, each.kind, each.path]),
      [["modified", "fixture", "test/fixtures/users.json"]],
    );
    assert.match(report.changedTests[0].hunks, /-\[\{ "name": "Ada" \}\]\n\+\[\]/);
    const onBase = Object.fromEntries(report.newTests.map((each) => [each.path, each.onBase?.result]));
    assert.equal(onBase["test/sub.test.mjs"], "fails on the base");
    assert.equal(onBase["test/add-again.test.mjs"], "passes on the base: it may not test the change");
    assert.deepEqual(
      report.leftovers.map((each) => each.at),
      ["src/math.js:3"],
    );
    // The temporary base worktree is gone.
    assert.equal(git(root, "worktree", "list").split("\n").length, 1);
    const markdown = await readFile(report.reportPath, "utf8");
    assert.match(markdown, /## Changed existing tests, fixtures and setup \(1\)/);
    assert.match(markdown, /test\/sub\.test\.mjs: fails on the base/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a recorded check counts as after the last edit only while the state it ran on is unchanged", async () => {
  const root = await repository("self-review-checks-", base);
  const scratch = join(root, ".scratch-out");
  try {
    await write(root, {
      ".gitignore": ".scratch-out/\n",
      "requirements.md": "- R1 add still adds — check: node test/math.test.mjs\n- R2 sub subtracts\n",
    });
    const check = run(script, root, ["check", "--id", "R1", "--scratch", scratch, "--", "node", "test/math.test.mjs"]);
    assert.equal(check.status, 0, check.stderr);
    const report = () =>
      JSON.parse(
        run(script, root, ["--base", "HEAD", "--scratch", scratch, "--requirements", "requirements.md", "--json"])
          .stdout,
      ).requirements;
    let [r1, r2] = report();
    assert.equal(r1.state, "passed on the current state");
    assert.equal(r1.afterLastEdit, true);
    assert.equal(r1.check, "node test/math.test.mjs");
    assert.equal(r2.state, "no check recorded");

    await write(root, { "src/math.js": "export const add = (a, b) => a + b + 0;\n" });
    [r1] = report();
    assert.equal(r1.afterLastEdit, false);
    assert.match(r1.state, /^stale/);

    const failing = run(script, root, ["check", "--id", "R1", "--scratch", scratch, "--command", "exit 3"]);
    assert.equal(failing.status, 3);
    [r1] = report();
    assert.equal(r1.state, "failed on the current state (exit 3)");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("freshness comes from the session's event log first, as check records would give it, and from check --id without one", async () => {
  const root = await repository("self-review-events-", base);
  const scratch = join(root, ".scratch-out");
  const home = join(root, ".scratch-out", "home");
  const session = "sess-fresh";
  const env = (id) => ({ ...process.env, FREEFLOW_HOME: home, FREEFLOW_SESSION: id, CLAUDE_CODE_SESSION_ID: "" });
  const logLines = [];
  const call = (fields) => {
    logLines.push({
      v: 1,
      ts: `2026-11-03T12:00:${String(logLines.length).padStart(2, "0")}.000Z`,
      seq: logLines.length + 1,
      session,
      harness: "claude-code",
      agent: "main",
      kind: "tool.call",
      ...fields,
    });
  };
  const saveLog = () =>
    write(home, { [`events/${session}.jsonl`]: `${logLines.map((line) => JSON.stringify(line)).join("\n")}\n` });
  const report = (id = session) => {
    const result = spawnSync(
      process.execPath,
      [script, "--base", "HEAD", "--scratch", scratch, "--requirements", "requirements.md", "--json"],
      { cwd: root, env: env(id), encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  const checkRecord = (id) =>
    assert.equal(
      run(script, root, ["check", "--id", id, "--scratch", scratch, "--", "node", "test/math.test.mjs"]).status,
      0,
    );
  try {
    await write(root, {
      ".gitignore": ".scratch-out/\n",
      "requirements.md": [
        "- R1 `src/math.js` adds :: node test/math.test.mjs",
        "- R2 the whole change still passes — check: node test/math.test.mjs",
        "- R3 users load from test/fixtures/users.json :: node test/math.test.mjs",
        "- R4 nothing ran for it :: npm run nothing",
        "",
      ].join("\n"),
    });
    // The agent runs the check, and the same check is recorded by hand.
    call({ tool: "Bash", ok: true, command: "node test/math.test.mjs", source: "agent" });
    await saveLog();
    checkRecord("R1");
    checkRecord("R2");
    let fromLog = report();
    assert.deepEqual(fromLog.freshness, { eventLog: true, reason: null });
    let [r1, r2, r3, r4] = fromLog.requirements;
    assert.deepEqual(r1.paths, ["src/math.js"]);
    assert.deepEqual(r3.paths, ["test/fixtures/users.json"]);
    for (const each of [r1, r2, r3]) {
      assert.equal(each.source, "event log", each.id);
      assert.equal(each.afterLastEdit, true, each.id);
      assert.equal(each.state, "passed on the current state", each.id);
    }
    assert.equal(r4.source, null);
    assert.equal(r4.state, "no check recorded");
    // Without a log, the records give the same answer.
    let fromRecords = report("sess-no-log");
    assert.equal(fromRecords.freshness.eventLog, false);
    assert.match(fromRecords.freshness.reason, /No event log for session sess-no-log/);
    assert.deepEqual(
      fromRecords.requirements.slice(0, 2).map((each) => [each.source, each.afterLastEdit]),
      [
        ["check --id", true],
        ["check --id", true],
      ],
    );
    assert.match(await readFile(fromRecords.reportPath, "utf8"), /Freshness from `check --id` records: no event log/);

    // Freeflow's own write to a file is not the agent's edit; the agent's edit of src/math.js is.
    call({ tool: "Write", ok: true, paths: ["src/math.js"], source: "freeflow" });
    await saveLog();
    assert.equal(report().requirements[0].afterLastEdit, true);
    await write(root, { "src/math.js": "export const add = (a, b) => b + a;\n" });
    call({ tool: "Edit", ok: true, paths: [join(root, "src/math.js")], source: "agent" });
    await saveLog();
    fromLog = report();
    [r1, r2, r3] = fromLog.requirements;
    fromRecords = report("sess-no-log");
    // R1 names the edited file and R2 names none: stale from either source.
    for (const [index, each] of [r1, r2].entries()) {
      assert.equal(each.afterLastEdit, false, each.id);
      assert.equal(fromRecords.requirements[index].afterLastEdit, false, each.id);
    }
    assert.match(r1.state, /^stale: Edit edited .*src\/math\.js after it; rerun it$/);
    // R3 names another file, which no edit touched.
    assert.equal(r3.afterLastEdit, true);

    // A failing run of the check after the edit: fresh, and failed.
    call({ tool: "Bash", ok: false, exit: 1, command: "node test/math.test.mjs", source: "agent" });
    await saveLog();
    [r1] = report().requirements;
    assert.equal(r1.state, "failed on the current state (exit 1)");
    assert.match(await readFile(report().reportPath, "utf8"), /R1 .* \(from event log\)/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("self-review names the feature files covering the change and whether each was driven since", async () => {
  const root = await repository("self-review-features-", base);
  try {
    const commit = git(root, "rev-parse", "--short", "HEAD");
    const feature = (title, covers) =>
      `# ${title}\n\n> **Covers:** \`${covers}\`\n> **Verified at:** \`${commit}\` (2026-10-23)\n\n## Driving it\n\n- Run it.\n`;
    await write(root, {
      "dev-docs/README.md": "# Docs\n",
      "dev-docs/features/math.md": feature("Math", "src/math.js"),
      "dev-docs/features/users.md": feature("Users", "test/fixtures/users.json"),
      // A subsystem doc covering the same file is not a feature file.
      "dev-docs/subsystems/math.md": `# Math internals\n\n> **Covers:** \`src/math.js\`\n> **Verified at:** \`${commit}\` (2026-10-23)\n\nHow it works.\n`,
    });
    git(root, "add", "--all");
    git(root, "commit", "--quiet", "-m", "docs");
    // The code and the feature file's text change together; the file was still not driven.
    await write(root, {
      "src/math.js": "export const add = (a, b) => b + a;\n",
      "dev-docs/features/math.md": `${feature("Math", "src/math.js")}Edited with the code.\n`,
    });
    const result = run(script, root, ["--base", "HEAD", "--scratch", join(root, ".git", "sr"), "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.featureFiles, [
      { path: "dev-docs/features/math.md", verifiedAt: commit, state: "stale", covers: ["src/math.js"] },
    ]);
    assert.match(await readFile(report.reportPath, "utf8"), /## Feature files covering the change \(1\)/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("self-review refuses a missing base", async () => {
  const root = await repository("self-review-usage-", base);
  try {
    assert.equal(run(script, root, []).status, 2);
    assert.match(run(script, root, ["--base", "nope"]).stderr, /no such commit: nope/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
