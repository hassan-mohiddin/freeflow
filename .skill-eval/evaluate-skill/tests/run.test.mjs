import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const entrypoint = fileURLToPath(new URL("../../../skills/evaluate-skill/scripts/skill-eval.mjs", import.meta.url));

async function withTempDirectory(run) {
  const directory = await mkdtemp(path.join(tmpdir(), "skill-eval-run-test-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function writeJson(root, relativePath, value) {
  const file = path.join(root, relativePath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    assert.fail(`${label} is not valid JSON: ${error.message}`);
  }
}

async function writeSkill(root, relativePath, { name, description }) {
  const directory = path.join(root, relativePath);
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nFollow the declared workflow.\n`,
  );
  return realpath(directory);
}

async function installFakePi(root) {
  const bin = path.join(root, "bin");
  const executable = path.join(bin, "pi");
  await mkdir(bin, { recursive: true });
  await writeFile(
    executable,
    `#!/usr/bin/env node
import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
const skills = args.flatMap((arg, index) => arg === "--skill" ? [args[index + 1]] : []);
const skill = skills[0] ?? null;
const readSkill = skills[Number(process.env.FAKE_PI_READ_SKILL_INDEX ?? 0)] ?? null;
const fail = skill !== null && process.env.FAKE_PI_FAIL_SKILL === "1";
appendFileSync(process.env.FAKE_PI_LOG, JSON.stringify({ args, cwd: process.cwd(), allowedRoots: JSON.parse(process.env.SKILL_EVAL_ALLOWED_ROOTS) }) + "\\n");
if (process.env.FAKE_PI_DESCENDANT_PID) {
  const descendant = spawn(
    process.execPath,
    ["-e", "process.on('SIGTERM', () => {}); process.send('ready'); setInterval(() => {}, 1000)"],
    { stdio: ["ignore", "ignore", "ignore", "ipc"] },
  );
  await new Promise((resolve) => descendant.once("message", resolve));
  appendFileSync(process.env.FAKE_PI_DESCENDANT_PID, String(descendant.pid));
}
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
emit({ type: "session", version: 3, id: "fake-session", cwd: process.cwd() });
emit({ type: "agent_start" });
emit({ type: "turn_start" });
if (readSkill) {
  const target = readSkill + "/SKILL.md";
  emit({ type: "tool_execution_start", toolCallId: "read-target", toolName: "read", args: { path: target } });
  emit({ type: "tool_execution_end", toolCallId: "read-target", toolName: "read", result: { content: [{ type: "text", text: "skill" }] }, isError: false });
}
const message = {
  role: "assistant",
  content: [{ type: "text", text: skill ? "Candidate response" : "Baseline response" }],
  provider: "fake",
  model: "fake-model",
  usage: { input: 10, output: 4, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } },
  stopReason: skill !== null && process.env.FAKE_PI_ERROR_SKILL === "1" ? "error" : "stop",
  errorMessage: skill !== null && process.env.FAKE_PI_ERROR_SKILL === "1" ? "fake provider failure" : undefined
};
emit({ type: "message_end", message });
emit({ type: "turn_end", message, toolResults: [] });
emit({ type: "agent_end", messages: [message], willRetry: false });
if (fail) process.exitCode = 7;
else emit({ type: "agent_settled" });
if (process.env.FAKE_PI_CANCEL_PARENT === "1") process.kill(process.ppid, "SIGINT");
`,
  );
  await chmod(executable, 0o755);
  return bin;
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

function descriptionGroup() {
  return {
    schema_version: 1,
    kind: "group",
    id: "natural-activation",
    type: "description",
    input: { prompt: "Help me decide how to ship this change." },
    fixture: null,
    tools: ["read"],
    variants: {
      baseline: {
        source: { kind: "working-tree" },
        skills: [],
        target: null,
        context: [],
      },
      candidate: {
        source: { kind: "working-tree" },
        skills: ["skills/release-route"],
        target: 0,
        context: [],
      },
    },
    expectations: [
      { id: "baseline-no-read", kind: "skill-read", variant: "baseline", expect: "never" },
      { id: "candidate-read", kind: "skill-read", variant: "candidate", expect: "by-turn", turn: 1 },
    ],
    review_questions: [],
    model: { model: "fake/model", thinking: "low" },
  };
}

test(
  "forced cleanup kills subject descendants that outlive the Pi parent",
  { skip: process.platform === "win32" },
  async () => {
    await withTempDirectory(async (root) => {
      const fakeLog = path.join(root, "fake-pi.jsonl");
      const descendantPidFile = path.join(root, "descendant.pid");
      const bin = await installFakePi(root);
      await writeSkill(root, "skills/release-route", {
        name: "release-route",
        description: "Use when choosing how to deliver a completed software change.",
      });
      const definition = await writeJson(root, "groups/natural-activation.json", descriptionGroup());

      const result = spawnSync(process.execPath, [entrypoint, "run", definition], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
          FAKE_PI_LOG: fakeLog,
          FAKE_PI_CANCEL_PARENT: "1",
          FAKE_PI_DESCENDANT_PID: descendantPidFile,
        },
      });

      const descendantPid = Number(await readFile(descendantPidFile, "utf8"));
      try {
        assert.equal(result.status, 1, result.stderr);
        assert.equal(processExists(descendantPid), false, `descendant ${descendantPid} survived cleanup`);
      } finally {
        if (processExists(descendantPid)) process.kill(descendantPid, "SIGKILL");
      }
    });
  },
);

test("cancellation records queued variants and groups without starting more Pi subjects", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const first = descriptionGroup();
    first.id = "first-activation";
    const second = descriptionGroup();
    second.id = "second-activation";
    await writeJson(root, "groups/first.json", first);
    await writeJson(root, "groups/second.json", second);
    const suite = await writeJson(root, "suite.json", {
      schema_version: 1,
      kind: "suite",
      id: "cancel-suite",
      groups: ["groups/first.json", "groups/second.json"],
    });

    const result = spawnSync(process.execPath, [entrypoint, "run", suite], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
        FAKE_PI_CANCEL_PARENT: "1",
      },
    });

    assert.equal(result.status, 1, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const invocationLog = await readFile(fakeLog, "utf8");
    const invocations = invocationLog.trim().split("\n");
    assert.equal(invocations.length, 1);
    const summary = parseJson(await readFile(path.join(resultDirectory, "summary.json"), "utf8"), "summary");
    assert.equal(summary.state, "cancelled");
    const queuedRuns = [
      "groups/first-activation/candidate/run.json",
      "groups/second-activation/baseline/run.json",
      "groups/second-activation/candidate/run.json",
    ];
    for (const runPath of queuedRuns) {
      const queued = parseJson(await readFile(path.join(resultDirectory, runPath), "utf8"), runPath);
      assert.equal(queued.state, "cancelled");
      assert.equal(queued.process, undefined);
      assert.equal(queued.artifacts.events, null);
    }
  });
});

test("run rejects unsupported evaluation types before starting subjects or creating a result", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const definitionValue = descriptionGroup();
    definitionValue.type = "body";
    const definition = await writeJson(root, "groups/body-behavior.json", definitionValue);

    const result = spawnSync(process.execPath, [entrypoint, "run", definition], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
      },
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /supports one-shot description prompts only/);
    await assert.rejects(readFile(fakeLog, "utf8"), { code: "ENOENT" });
    await assert.rejects(readFile(path.join(root, ".skill-eval/runs"), "utf8"), { code: "ENOENT" });
  });
});

test("settled Pi provider errors are infrastructure failures even when JSON mode exits zero", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const definition = await writeJson(root, "groups/natural-activation.json", descriptionGroup());

    const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
        FAKE_PI_ERROR_SKILL: "1",
      },
    });

    assert.equal(result.status, 1, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const candidate = parseJson(
      await readFile(path.join(resultDirectory, "groups/natural-activation/candidate/run.json"), "utf8"),
      "candidate run",
    );
    assert.equal(candidate.process.exitCode, 0);
    assert.equal(candidate.process.settled, true);
    assert.equal(candidate.state, "infrastructure-failed");
    assert.equal(candidate.process.assistantError, "fake provider failure");
  });
});

test("description activation counts only the exact canonical target SKILL.md", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/support", {
      name: "support",
      description: "Use when support context is needed.",
    });
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const definitionValue = descriptionGroup();
    definitionValue.variants.candidate.skills = ["skills/support", "skills/release-route"];
    definitionValue.variants.candidate.target = 1;
    definitionValue.expectations = [
      { id: "target-not-read", kind: "skill-read", variant: "candidate", expect: "never" },
    ];
    const definition = await writeJson(root, "groups/natural-activation.json", definitionValue);

    const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
        FAKE_PI_READ_SKILL_INDEX: "0",
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const groupDirectory = path.join(resultDirectory, "groups/natural-activation");
    const candidate = parseJson(
      await readFile(path.join(groupDirectory, "candidate/run.json"), "utf8"),
      "candidate run",
    );
    const grade = parseJson(
      await readFile(path.join(groupDirectory, "deterministic-grade.json"), "utf8"),
      "deterministic grade",
    );
    assert.equal(candidate.activation.targetRead, false);
    assert.match(candidate.activation.successfulReadPaths[0], /resources\/skills\/0\/SKILL\.md$/);
    assert.match(candidate.resources.targetPath, /resources\/skills\/1\/SKILL\.md$/);
    assert.notEqual(candidate.activation.successfulReadPaths[0], candidate.resources.targetPath);
    assert.deepEqual(
      grade.checks.map(({ id, state }) => ({ id, state })),
      [{ id: "target-not-read", state: "pass" }],
    );
  });
});

test("one variant infrastructure failure preserves its evidence and the completed counterpart", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const definition = await writeJson(root, "groups/natural-activation.json", descriptionGroup());

    const result = spawnSync(process.execPath, [entrypoint, "run", definition], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
        FAKE_PI_FAIL_SKILL: "1",
      },
    });

    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /State: partially-complete/);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const groupDirectory = path.join(resultDirectory, "groups/natural-activation");
    const baseline = parseJson(await readFile(path.join(groupDirectory, "baseline/run.json"), "utf8"), "baseline run");
    const candidate = parseJson(
      await readFile(path.join(groupDirectory, "candidate/run.json"), "utf8"),
      "candidate run",
    );
    const grade = parseJson(
      await readFile(path.join(groupDirectory, "deterministic-grade.json"), "utf8"),
      "deterministic grade",
    );
    assert.equal(baseline.state, "complete");
    assert.equal(candidate.state, "infrastructure-failed");
    assert.equal(candidate.process.exitCode, 7);
    assert.equal(grade.state, "complete");
    assert.deepEqual(
      grade.checks.map(({ id, state }) => ({ id, state })),
      [
        { id: "baseline-no-read", state: "pass" },
        { id: "candidate-read", state: "unavailable" },
      ],
    );
    assert.equal(grade.evidence.candidate.sha256.length, 64);
  });
});

test("grade errors remain separate from completed subject evidence", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const definitionValue = descriptionGroup();
    definitionValue.expectations = [{ id: "future-check", kind: "path-exists", path: "result.json" }];
    const definition = await writeJson(root, "groups/natural-activation.json", definitionValue);

    const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
      },
    });

    assert.equal(result.status, 1, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const groupDirectory = path.join(resultDirectory, "groups/natural-activation");
    const candidateRunText = await readFile(path.join(groupDirectory, "candidate/run.json"), "utf8");
    const candidate = parseJson(candidateRunText, "candidate run");
    const grade = parseJson(
      await readFile(path.join(groupDirectory, "deterministic-grade.json"), "utf8"),
      "deterministic grade",
    );
    assert.equal(candidate.state, "complete");
    assert.equal(grade.state, "grade-error");
    assert.deepEqual(grade.errors, [{ id: "future-check", reason: "unsupported expectation kind: path-exists" }]);
    assert.equal(grade.evidence.candidate.sha256, createHash("sha256").update(candidateRunText).digest("hex"));
  });
});

test("suite group and variant selectors preserve original position through run and view", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/first-route", {
      name: "first-route",
      description: "Use when choosing the first route.",
    });
    await writeSkill(root, "skills/second-route", {
      name: "second-route",
      description: "Use when choosing the second route.",
    });
    const first = descriptionGroup();
    first.id = "first-activation";
    first.variants.candidate.skills = ["skills/first-route"];
    first.expectations = [{ id: "first-read", kind: "skill-read", variant: "candidate", expect: "by-turn", turn: 1 }];
    const second = descriptionGroup();
    second.id = "second-activation";
    second.variants.candidate.skills = ["skills/second-route"];
    second.expectations = [{ id: "second-read", kind: "skill-read", variant: "candidate", expect: "by-turn", turn: 1 }];
    await writeJson(root, "groups/first.json", first);
    await writeJson(root, "groups/second.json", second);
    const suite = await writeJson(root, "suite.json", {
      schema_version: 1,
      kind: "suite",
      id: "activation-suite",
      groups: ["groups/first.json", "groups/second.json"],
    });
    const environment = {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
      FAKE_PI_LOG: fakeLog,
    };

    const run = spawnSync(process.execPath, [entrypoint, "run", suite, "--group", "2", "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
      env: environment,
    });
    assert.equal(run.status, 0, run.stderr);
    const resultDirectory = run.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const summary = parseJson(await readFile(path.join(resultDirectory, "summary.json"), "utf8"), "suite summary");
    assert.deepEqual(
      summary.groups.map(({ id, position }) => ({ id, position })),
      [{ id: "second-activation", position: 2 }],
    );
    const baseline = parseJson(
      await readFile(path.join(resultDirectory, "groups/second-activation/baseline/run.json"), "utf8"),
      "unselected baseline",
    );
    assert.equal(baseline.state, "not-selected");
    const fakeInvocations = await readFile(fakeLog, "utf8");
    assert.equal(fakeInvocations.trim().split("\n").length, 1);

    const view = spawnSync(
      process.execPath,
      [entrypoint, "view", resultDirectory, "--group", "2", "--variant", "candidate"],
      { cwd: root, encoding: "utf8", env: environment },
    );
    assert.equal(view.status, 0, view.stderr);
    assert.match(view.stdout, /Group second-activation \[complete\]/);
    assert.doesNotMatch(view.stdout, /first-activation/);
  });
});

test("view renders a direct result grade-first and filters one variant", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const definition = await writeJson(root, "groups/natural-activation.json", descriptionGroup());
    const environment = {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
      FAKE_PI_LOG: fakeLog,
    };
    const run = spawnSync(process.execPath, [entrypoint, "run", definition, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
      env: environment,
    });
    assert.equal(run.status, 0, run.stderr);
    const resultDirectory = run.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);

    const view = spawnSync(process.execPath, [entrypoint, "view", resultDirectory, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
      env: environment,
    });

    assert.equal(view.status, 0, view.stderr);
    assert.match(view.stdout, /Group natural-activation \[complete\]/);
    assert.match(view.stdout, /candidate-read\s+candidate\s+pass/);
    assert.match(view.stdout, /Candidate \[complete\]/);
    assert.match(view.stdout, /Candidate response/);
    assert.doesNotMatch(view.stdout, /Baseline \[/);
    assert.ok(view.stdout.indexOf("candidate-read") < view.stdout.indexOf("Candidate response"));
    assert.match(view.stdout, /definition\.json/);
    assert.match(view.stdout, /deterministic-grade\.json/);
    assert.match(view.stdout, /candidate\/run\.json/);
    assert.match(view.stdout, /candidate\/events\.jsonl/);
    assert.match(view.stdout, /candidate\/transcript\.json/);
    assert.match(view.stdout, /candidate\/final\.md/);
    assert.match(view.stdout, /candidate\/stderr\.log/);
  });
});

test("run persists isolated one-shot description evidence before deterministic activation grades", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    const skill = await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const definition = await writeJson(root, "groups/natural-activation.json", descriptionGroup());

    const result = spawnSync(process.execPath, [entrypoint, "run", definition], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
      },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^Result: .+\nPath: .+\nState: complete\n$/);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);

    const fakeInvocations = await readFile(fakeLog, "utf8");
    const invocations = fakeInvocations
      .trim()
      .split("\n")
      .map((line, index) => parseJson(line, `fake Pi invocation ${index + 1}`));
    assert.equal(invocations.length, 2);
    assert.notEqual(invocations[0].cwd, invocations[1].cwd);
    for (const invocation of invocations) {
      assert.ok(invocation.args.includes("--no-extensions"));
      assert.ok(invocation.args.includes("--no-skills"));
      assert.ok(invocation.args.includes("--no-prompt-templates"));
      assert.ok(invocation.args.includes("--no-themes"));
      assert.ok(invocation.args.includes("--no-context-files"));
      assert.ok(invocation.args.includes("--no-session"));
      assert.equal(invocation.args.at(-1), descriptionGroup().input.prompt);
      assert.doesNotMatch(invocation.args.at(-1), /release-route|\/skill:/);
      assert.ok(invocation.allowedRoots.includes(invocation.cwd));
    }
    assert.equal(invocations[0].args.includes("--skill"), false);
    const candidateSkill = invocations[1].args[invocations[1].args.indexOf("--skill") + 1];
    assert.notEqual(candidateSkill, skill);
    assert.match(candidateSkill, /candidate\/resources\/skills\/0$/);
    assert.ok(invocations[1].allowedRoots.includes(candidateSkill));

    const groupDirectory = path.join(resultDirectory, "groups", "natural-activation");
    const baselineRunText = await readFile(path.join(groupDirectory, "baseline", "run.json"), "utf8");
    const candidateRunText = await readFile(path.join(groupDirectory, "candidate", "run.json"), "utf8");
    const baselineRun = parseJson(baselineRunText, "baseline run");
    const candidateRun = parseJson(candidateRunText, "candidate run");
    const grade = parseJson(
      await readFile(path.join(groupDirectory, "deterministic-grade.json"), "utf8"),
      "deterministic grade",
    );

    assert.equal(baselineRun.state, "complete");
    assert.equal(baselineRun.activation.targetRead, false);
    assert.equal(candidateRun.state, "complete");
    assert.equal(candidateRun.activation.targetRead, true);
    assert.deepEqual(candidateRun.activation.readTurns, [1]);
    assert.equal(candidateRun.response, "Candidate response");
    assert.equal(grade.state, "complete");
    assert.deepEqual(
      grade.checks.map(({ id, state }) => ({ id, state })),
      [
        { id: "baseline-no-read", state: "pass" },
        { id: "candidate-read", state: "pass" },
      ],
    );
    assert.equal(grade.evidence.baseline.sha256, createHash("sha256").update(baselineRunText).digest("hex"));
    assert.equal(grade.evidence.candidate.sha256, createHash("sha256").update(candidateRunText).digest("hex"));
    assert.deepEqual(
      candidateRun.resources.skills[0].files.map((file) => file.path),
      ["SKILL.md"],
    );
    assert.ok(await readFile(path.join(groupDirectory, "baseline", "events.jsonl"), "utf8"));
    assert.equal(await readFile(path.join(groupDirectory, "candidate", "final.md"), "utf8"), "Candidate response\n");
  });
});
