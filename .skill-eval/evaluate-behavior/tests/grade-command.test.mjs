import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadDefinition } from "../../../skills/evaluate-behavior/scripts/lib/definitions.mjs";
import {
  gradeCommand,
  parseJunit,
  parseTap,
  runCommandExpectation,
} from "../../../skills/evaluate-behavior/scripts/lib/grade-command.mjs";

const entrypoint = fileURLToPath(new URL("../../../skills/evaluate-behavior/scripts/skill-eval.mjs", import.meta.url));
const NODE = process.execPath;

async function withTempDirectory(run) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "skill-eval-command-test-")));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function write(file, contents) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, typeof contents === "string" ? contents : `${JSON.stringify(contents, null, 2)}\n`);
  return file;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function git(root, ...args) {
  const result = spawnSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
}

/**
 * A body subject over Pi's RPC protocol that fixes `src/add.mjs` in its workspace: correctly in the candidate arm,
 * wrongly (absolute values) in the baseline arm. The arm is read from the workspace path.
 */
async function installFakePi(root) {
  const bin = path.join(root, "bin");
  const executable = path.join(bin, "pi");
  await write(
    executable,
    `#!/usr/bin/env node
import { appendFileSync, writeFileSync } from "node:fs";
import path from "node:path";
appendFileSync(${JSON.stringify(path.join(root, "pi.log"))}, "started\\n");
const arm = path.basename(path.dirname(process.cwd()));
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\\n")) !== -1) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (line === "") continue;
    const command = JSON.parse(line);
    const response = { type: "response", id: command.id, command: command.type, success: true };
    if (command.type === "get_commands") response.data = { commands: [] };
    emit(response);
    if (command.type !== "prompt") continue;
    emit({ type: "agent_start" });
    emit({ type: "turn_start" });
    const body = arm === "candidate" ? "return a + b;" : "return Math.abs(a) + Math.abs(b);";
    emit({ type: "tool_execution_start", toolCallId: "w", toolName: "write", args: { path: "src/add.mjs" } });
    writeFileSync("src/add.mjs", "export function add(a, b) {\\n  " + body + "\\n}\\n");
    emit({ type: "tool_execution_end", toolCallId: "w", toolName: "write", isError: false });
    const message = {
      role: "assistant",
      content: [{ type: "text", text: "Fixed add." }],
      provider: "fake",
      model: "fake-model",
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } },
      stopReason: "stop",
    };
    emit({ type: "message_end", message });
    emit({ type: "turn_end", message, toolResults: [] });
    emit({ type: "agent_end", messages: [message], willRetry: false });
    emit({ type: "agent_settled" });
  }
});
`,
  );
  await chmod(executable, 0o755);
  return bin;
}

const HIDDEN_TEST = `import test from "node:test";
import assert from "node:assert/strict";
import { add } from "../src/add.mjs";
test("adds two numbers", () => assert.equal(add(2, 3), 5));
test("adds negatives", () => assert.equal(add(-2, -3), -5));
`;

function hiddenTestExpectation(arm, changes = {}) {
  return {
    id: `${arm}-hidden`,
    kind: "command",
    variant: arm,
    comparison: "hidden-tests",
    argv: [NODE, "--test", "--test-reporter=tap", "test/add.test.mjs"],
    files: { "test/add.test.mjs": "graders/calc/add.test.mjs" },
    timeout_seconds: 60,
    pass: { tests: { format: "node-test", required: ["adds two numbers", "adds negatives"] } },
    ...changes,
  };
}

function calcGroup(changes = {}) {
  return {
    schema_version: 2,
    kind: "group",
    id: "calc",
    type: "body",
    input: { prompt: "Fix add in src/add.mjs." },
    fixture: "fixtures/calc",
    tools: ["read", "write"],
    configuration: {
      host: { name: "pi" },
      model: { model: "fake/model" },
      subject: { kind: "skill", source: { kind: "working-tree" }, skills: [], target: null, context: [] },
    },
    arms: { baseline: {}, candidate: {} },
    component: [],
    expectations: [
      hiddenTestExpectation("baseline"),
      hiddenTestExpectation("candidate"),
      ...["baseline", "candidate"].map((arm) => ({
        id: `${arm}-exit`,
        kind: "command",
        variant: arm,
        comparison: "exit",
        argv: [NODE, "--test", "test/add.test.mjs"],
        files: { "test/add.test.mjs": "graders/calc/add.test.mjs" },
        pass: { exit_code: 0 },
      })),
      {
        id: "candidate-source",
        kind: "file-text",
        variant: "candidate",
        path: "src/add.mjs",
        expect: "contains",
        value: "a + b",
      },
    ],
    review_questions: [],
    ...changes,
  };
}

async function writeRepository(root, group = calcGroup()) {
  await write(path.join(root, "fixtures/calc/src/add.mjs"), "export function add(a, b) {\n  return a - b;\n}\n");
  await write(path.join(root, "graders/calc/add.test.mjs"), HIDDEN_TEST);
  return write(path.join(root, "groups/calc.json"), group);
}

function runCli(root, bin, args) {
  return spawnSync(process.execPath, [entrypoint, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
      SKILL_EVAL_CREDENTIALS_DIR: path.join(root, "no-credentials"),
    },
  });
}

test("hidden node tests pass on the right fix and fail on the wrong one, without touching the workspace", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installFakePi(root);
    const definition = await writeRepository(root);

    const result = runCli(root, bin, ["run", definition, "--dry-run"]);

    assert.equal(result.status, 0, result.stderr + result.stdout);
    const groupDirectory = path.join(result.stdout.match(/^Path: (.+)$/m)?.[1], "groups/calc");
    const grade = await readJson(path.join(groupDirectory, "deterministic-grade.json"));
    assert.deepEqual(grade.errors, []);
    const check = (id) => grade.checks.find((entry) => entry.id === id);

    assert.equal(check("candidate-hidden").state, "pass");
    assert.equal(check("candidate-hidden").observed.score, 1);
    assert.equal(check("baseline-hidden").state, "fail");
    assert.equal(check("baseline-hidden").observed.score, 0.5);
    assert.deepEqual(check("baseline-hidden").observed.tests.required, [
      { name: "adds two numbers", state: "pass" },
      { name: "adds negatives", state: "fail" },
    ]);
    assert.equal(check("candidate-exit").state, "pass");
    assert.equal(check("baseline-exit").state, "fail");
    assert.deepEqual(
      grade.comparisons.map(({ id, transition }) => [id, transition]),
      [
        ["hidden-tests", "fail-to-pass"],
        ["exit", "fail-to-pass"],
      ],
    );
    // The file grader rechecked the workspace's hashes after the commands ran.
    assert.equal(check("candidate-source").state, "pass");

    const run = await readJson(path.join(groupDirectory, "candidate/run.json"));
    const record = run.postRun.commands["candidate-hidden"];
    assert.equal(record.started, true);
    assert.equal(record.exitCode, 0);
    assert.equal(record.timedOut, false);
    assert.equal(record.directory, "commands/candidate-hidden/workspace");
    assert.deepEqual(record.files, ["test/add.test.mjs"]);
    assert.match(record.stdout.tail, /^ok 1 - adds two numbers$/m);
    assert.deepEqual(
      record.tests.results.map(({ fullName, status }) => [fullName, status]),
      [
        ["adds two numbers", "pass"],
        ["adds negatives", "pass"],
      ],
    );
    // The grader file reached the copy, never the subject's workspace, whose files still match their recorded hashes.
    await assert.rejects(stat(path.join(run.workspace, "test")), { code: "ENOENT" });
    assert.ok(await stat(path.join(groupDirectory, "candidate", record.directory, "test/add.test.mjs")));
    for (const file of run.effects.after.filter((entry) => (entry.type ?? "file") === "file")) {
      const contents = await readFile(path.join(run.workspace, file.path));
      assert.equal(createHash("sha256").update(contents).digest("hex"), file.sha256, file.path);
    }
    // An arm records only its own commands.
    const baseline = await readJson(path.join(groupDirectory, "baseline/run.json"));
    assert.deepEqual(Object.keys(baseline.postRun.commands), ["baseline-hidden", "baseline-exit"]);
  });
});

test("an uncommitted grader file makes the run non-canonical like any other input", async () => {
  await withTempDirectory(async (root) => {
    const definition = await writeRepository(root);
    git(root, "init", "-q");
    git(root, "add", "fixtures", "groups");
    git(root, "commit", "-q", "-m", "inputs without the grader file");
    const bin = await installFakePi(root);

    const refused = runCli(root, bin, ["run", definition]);

    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /uncommitted inputs: graders\/calc\/add\.test\.mjs/);
    await assert.rejects(readFile(path.join(root, "pi.log")), { code: "ENOENT" });
    const loaded = await loadDefinition(definition, { root });
    assert.ok(loaded.files.includes(path.join(root, "graders/calc/add.test.mjs")));
  });
});

test("command expectations are validated when the definition loads", async () => {
  await withTempDirectory(async (root) => {
    await writeRepository(root);
    const refusals = [
      [
        "a source outside the definition root",
        { files: { "test/add.test.mjs": "../outside.test.mjs" } },
        { code: "unsafe-path", message: /files\.test\/add\.test\.mjs must be a path inside the definition root/ },
      ],
      [
        "a source inside the fixture",
        { files: { "test/add.test.mjs": "fixtures/calc/src/add.mjs" } },
        { message: /inside the fixture, which the subject sees/ },
      ],
      [
        "a destination that escapes",
        { files: { "../x.mjs": "graders/calc/add.test.mjs" } },
        { message: /destination/ },
      ],
      ["no pass rule", { pass: {} }, { message: /exactly one of exit_code or tests/ }],
      [
        "an unknown test format",
        { pass: { tests: { format: "xunit", required: ["a"] } } },
        { message: /format must be node-test, tap or junit/ },
      ],
      ["a turn", { turn: 1 }, { message: /turn is not supported/ }],
      ["an empty argv", { argv: [] }, { message: /argv must be a non-empty array/ }],
      ["a timeout of zero", { timeout_seconds: 0 }, { message: /timeout_seconds must be an integer/ }],
      ["an unknown field", { shell: true }, { message: /unsupported field shell for kind command/ }],
    ];
    for (const [name, changes, expected] of refusals) {
      const group = calcGroup({ expectations: [hiddenTestExpectation("candidate", changes)] });
      const file = await write(path.join(root, `groups/${name.replaceAll(" ", "-")}.json`), group);
      await assert.rejects(loadDefinition(file, { root }), { name: "DefinitionError", ...expected }, name);
    }
    const description = calcGroup({ type: "description", expectations: [hiddenTestExpectation("candidate")] });
    await assert.rejects(
      loadDefinition(await write(path.join(root, "groups/description.json"), description), { root }),
      { message: /command expectations need a body group/ },
    );
  });
});

async function completedRun(root) {
  const workspace = path.join(root, "variant/workspace");
  await mkdir(workspace, { recursive: true });
  return { state: "complete", workspace, isolation: { root: path.join(root, "variant/isolation") } };
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

test("a command past its timeout is stopped with its whole process tree", async () => {
  await withTempDirectory(async (root) => {
    const run = await completedRun(root);
    const script = `
const { spawn } = require("node:child_process");
const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
require("node:fs").writeFileSync("child.pid", String(child.pid));
setInterval(() => {}, 1000);`;
    const expectation = { id: "sleepy", argv: [NODE, "-e", script], timeout_seconds: 1, pass: { exit_code: 0 } };

    const record = await runCommandExpectation({ expectation, run, root, directory: path.join(root, "variant") });

    assert.equal(record.started, true);
    assert.equal(record.timedOut, true);
    assert.equal(record.exitCode, null);
    assert.ok(record.durationMs >= 1000 && record.durationMs < 8000, String(record.durationMs));
    const pid = Number(await readFile(path.join(root, "variant", record.directory, "child.pid"), "utf8"));
    for (let attempt = 0; attempt < 20 && processExists(pid); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(processExists(pid), false);

    const group = { type: "body", variants: { baseline: {}, candidate: {} } };
    const graded = await gradeCommand(
      group,
      { candidate: { ...run, postRun: { commands: { sleepy: record } } } },
      { ...expectation, kind: "command", variant: "candidate" },
    );
    assert.equal(graded.state, "fail");
    assert.equal(graded.observed.timedOut, true);
  });
});

test("a command that cannot start, or left no record, grades unavailable", async () => {
  await withTempDirectory(async (root) => {
    const run = await completedRun(root);
    const expectation = {
      id: "missing",
      kind: "command",
      variant: "candidate",
      argv: [path.join(root, "no-such-program")],
      pass: { exit_code: 0 },
    };
    const record = await runCommandExpectation({ expectation, run, root, directory: path.join(root, "variant") });
    assert.equal(record.started, false);
    assert.match(record.error, /could not start/);

    const group = { type: "body", variants: { baseline: {}, candidate: {} } };
    const notStarted = await gradeCommand(
      group,
      { candidate: { ...run, postRun: { commands: { missing: record } } } },
      expectation,
    );
    assert.equal(notStarted.state, "unavailable");
    assert.match(notStarted.observed.reason, /could not start/);
    const noRecord = await gradeCommand(group, { candidate: run }, expectation);
    assert.equal(noRecord.state, "unavailable");
  });
});

test("a JUnit report written by the command gives per-test results and partial credit", async () => {
  await withTempDirectory(async (root) => {
    const run = await completedRun(root);
    const xml = `<?xml version="1.0"?>
<testsuites><testsuite name="calc">
  <testcase classname="calc.Add" name="adds &amp; carries" time="0.1"/>
  <testcase classname="calc.Add" name="adds negatives"><failure message="wrong">expected -5</failure></testcase>
  <testcase classname="calc.Add" name="adds floats"><skipped/></testcase>
</testsuite></testsuites>`;
    const script = `require("node:fs").mkdirSync("reports"); require("node:fs").writeFileSync("reports/junit.xml", ${JSON.stringify(xml)}); process.exit(1);`;
    const expectation = {
      id: "junit",
      kind: "command",
      variant: "candidate",
      argv: [NODE, "-e", script],
      pass: {
        tests: {
          format: "junit",
          report: "reports/junit.xml",
          required: ["calc.Add > adds & carries", "adds negatives"],
        },
      },
    };

    const record = await runCommandExpectation({ expectation, run, root, directory: path.join(root, "variant") });

    assert.equal(record.exitCode, 1);
    assert.deepEqual(record.tests.results, [
      { name: "adds & carries", fullName: "calc.Add > adds & carries", status: "pass" },
      { name: "adds negatives", fullName: "calc.Add > adds negatives", status: "fail" },
      { name: "adds floats", fullName: "calc.Add > adds floats", status: "skip" },
    ]);
    const group = { type: "body", variants: { baseline: {}, candidate: {} } };
    const graded = await gradeCommand(
      group,
      { candidate: { ...run, postRun: { commands: { junit: record } } } },
      expectation,
    );
    assert.equal(graded.state, "fail");
    assert.equal(graded.observed.score, 0.5);

    // A missing report is recorded and fails every required test.
    const missing = await runCommandExpectation({
      expectation: { ...expectation, argv: [NODE, "-e", "process.exit(0)"] },
      run,
      root,
      directory: path.join(root, "variant"),
    });
    assert.match(missing.tests.error, /cannot read the JUnit report/);
  });
});

test("TAP parsing reads plain TAP and Node's nested subtests, directives and escapes", () => {
  const tap = `TAP version 13
ok 1 - first
not ok 2 - second # TODO later
ok 3 - third # SKIP no network
not ok 4 - has \\# hash
  ---
  error: 'ok 9 - inside yaml'
  ...
1..4`;
  assert.deepEqual(
    parseTap(tap).map(({ fullName, status }) => [fullName, status]),
    [
      ["first", "pass"],
      ["second", "todo"],
      ["third", "skip"],
      ["has # hash", "fail"],
    ],
  );

  const node = `TAP version 13
# Subtest: suite
    # Subtest: inner ok
    ok 1 - inner ok
      ---
      duration_ms: 0.06
      ...
    # Subtest: inner bad
    not ok 2 - inner bad
      ---
      error: 'no'
      ...
    1..2
not ok 1 - suite
  ---
  duration_ms: 0.1
  ...
# Subtest: top
ok 2 - top
1..2`;
  assert.deepEqual(
    parseTap(node).map(({ name, fullName, status }) => [name, fullName, status]),
    [
      ["inner ok", "suite > inner ok", "pass"],
      ["inner bad", "suite > inner bad", "fail"],
      ["suite", "suite", "fail"],
      ["top", "top", "pass"],
    ],
  );
  assert.deepEqual(parseJunit("<testsuite><testcase name='a'/><testcase name=\"b\"><error/></testcase></testsuite>"), [
    { name: "a", fullName: "a", status: "pass" },
    { name: "b", fullName: "b", status: "fail" },
  ]);
});
