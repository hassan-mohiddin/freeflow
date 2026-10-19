import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { aggregateGroups } from "../../../skills/evaluate-behavior/scripts/lib/trials.mjs";
import { toV2 } from "./helpers/to-v2.mjs";

const entrypoint = fileURLToPath(new URL("../../../skills/evaluate-behavior/scripts/skill-eval.mjs", import.meta.url));
const FAKE_KEYS = ["FAKE_PI_LOG", "FAKE_PI_COST", "FAKE_PI_HOLLOW", "FAKE_PI_PEEK"];

async function withTempDirectory(run) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "skill-eval-trials-test-")));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function writeJson(root, relativePath, value) {
  const file = path.join(root, relativePath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(toV2(value), null, 2)}\n`);
  return file;
}

async function installFakePi(root) {
  const bin = path.join(root, "bin");
  await mkdir(bin, { recursive: true });
  const executable = path.join(bin, "pi");
  await writeFile(
    executable,
    `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
const skills = args.flatMap((arg, index) => arg === "--skill" ? [args[index + 1]] : []);
if (process.env.FAKE_PI_LOG) appendFileSync(process.env.FAKE_PI_LOG, JSON.stringify({ kind: "spawn", cwd: process.cwd() }) + "\\n");
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
emit({ type: "agent_start" });
// A host that exits cleanly without a model behind it, as after a failed login: no message, or an empty one.
if (process.env.FAKE_PI_HOLLOW === "no-message") {
  emit({ type: "agent_settled" });
  process.exit(0);
}
if (process.env.FAKE_PI_HOLLOW === "empty") {
  emit({ type: "message_end", message: { role: "assistant", content: [], provider: "fake", model: "fake-model", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } }, stopReason: "stop" } });
  emit({ type: "agent_settled" });
  process.exit(0);
}
// A subject that tries to read a host instruction file outside its workspace (the guard would block it).
if (process.env.FAKE_PI_PEEK) {
  emit({ type: "tool_execution_start", toolCallId: "p", toolName: "read", args: { path: process.env.FAKE_PI_PEEK } });
  emit({ type: "tool_execution_end", toolCallId: "p", toolName: "read", isError: true });
}
if (skills[0]) {
  emit({ type: "tool_execution_start", toolCallId: "r", toolName: "read", args: { path: skills[0] + "/SKILL.md" } });
  emit({ type: "tool_execution_end", toolCallId: "r", toolName: "read", isError: false });
}
const message = {
  role: "assistant",
  content: [{ type: "text", text: "done" }],
  provider: "fake",
  model: "fake-model",
  usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: { total: Number(process.env.FAKE_PI_COST || 0) } },
  stopReason: "stop",
};
emit({ type: "message_end", message });
emit({ type: "agent_settled" });
`,
  );
  await chmod(executable, 0o755);
  return bin;
}

async function writeSkill(root) {
  const directory = path.join(root, "skills/release-route");
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "SKILL.md"),
    "---\nname: release-route\ndescription: Use when delivering a change.\n---\n\n# Release Route\n",
  );
}

function group(id) {
  return {
    schema_version: 1,
    kind: "group",
    id,
    type: "description",
    input: { prompt: "How should I ship this change?" },
    fixture: null,
    tools: ["read"],
    variants: {
      baseline: { source: { kind: "working-tree" }, skills: [], target: null, context: [] },
      candidate: { source: { kind: "working-tree" }, skills: ["skills/release-route"], target: 0, context: [] },
    },
    expectations: [
      {
        id: "baseline-read",
        kind: "skill-read",
        variant: "baseline",
        expect: "by-turn",
        turn: 1,
        comparison: "target-read",
      },
      {
        id: "candidate-read",
        kind: "skill-read",
        variant: "candidate",
        expect: "by-turn",
        turn: 1,
        comparison: "target-read",
      },
    ],
    review_questions: [],
    runtime: { host: "pi", session: false, extensions: [], environment: { literal: {}, inherit: FAKE_KEYS } },
  };
}

function runCli(root, bin, args, env = {}) {
  // Test inputs live in temporary directories outside Git, so every test run is a dry run.
  if (args[0] === "run" && !args.includes("--dry-run")) args = [...args, "--dry-run"];
  const fakeEnv = Object.fromEntries(FAKE_KEYS.map((key) => [key, ""]));
  // Never copy the developer's real Pi logins into test runs.
  fakeEnv.SKILL_EVAL_CREDENTIALS_DIR = path.join(root, "no-credentials");
  return spawnSync(process.execPath, [entrypoint, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...fakeEnv, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`, ...env },
  });
}

async function spawnCount(log) {
  return (await readFile(log, "utf8")).split("\n").filter(Boolean).length;
}

test("--trials runs independent complete invocations and aggregates pass rates", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installFakePi(root);
    await writeSkill(root);
    const log = path.join(root, "fake.jsonl");
    const definition = await writeJson(root, "groups/activation.json", group("activation"));

    const result = runCli(root, bin, ["run", definition, "--trials", "3"], { FAKE_PI_LOG: log });

    assert.equal(result.status, 0, result.stderr);
    // The plan comes first, and matches what then runs: 1 group x 2 arms x 3 trials.
    assert.match(result.stdout, /^Plan: 6 subjects \(1 group, 2 arms, 3 trials\); models: host default; dry run$/m);
    assert.ok(result.stdout.indexOf("Plan: ") < result.stdout.indexOf("Result: "));
    assert.equal(result.stdout.match(/^Result: /gm)?.length, 3);
    assert.equal(await spawnCount(log), 6);
    const aggregateId = result.stdout.match(/^Aggregate: (.+)$/m)?.[1];
    assert.ok(aggregateId);
    const aggregate = JSON.parse(
      await readFile(path.join(root, ".skill-eval/runs", aggregateId, "aggregate.json"), "utf8"),
    );
    assert.equal(aggregate.kind, "aggregate");
    assert.equal(aggregate.state, "complete");
    assert.equal(aggregate.trials.length, 3);
    for (const trial of aggregate.trials) {
      const summary = JSON.parse(await readFile(path.join(root, ".skill-eval/runs", trial.id, "summary.json"), "utf8"));
      assert.equal(summary.state, "complete");
    }
    const [comparison] = aggregate.groups[0].comparisons;
    assert.equal(comparison.id, "target-read");
    assert.deepEqual(comparison.baseline, { pass: 0, fail: 3, unavailable: 0 });
    assert.deepEqual(comparison.candidate, { pass: 3, fail: 0, unavailable: 0 });
    assert.deepEqual(comparison.transitions, { "fail-to-pass": 3 });

    const viewed = runCli(root, bin, ["view", aggregateId]);
    assert.equal(viewed.status, 0, viewed.stderr);
    assert.match(viewed.stdout, /Aggregate .+ \[complete\] trials=3/);
    assert.match(viewed.stdout, /comparison\ttarget-read\tskill-read\tbaseline=0\/3\tcandidate=3\/3\tfail-to-pass=3/);
  });
});

test("--max-cost stops starting subjects once host-reported cost reaches the ceiling", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installFakePi(root);
    await writeSkill(root);
    const log = path.join(root, "fake.jsonl");
    await writeJson(root, "groups/one.json", group("first-group"));
    await writeJson(root, "groups/two.json", group("second-group"));
    const suite = await writeJson(root, "suite.json", {
      schema_version: 1,
      kind: "suite",
      id: "budgeted",
      groups: ["groups/one.json", "groups/two.json"],
    });

    const result = runCli(root, bin, ["run", suite, "--max-cost", "0.5"], { FAKE_PI_LOG: log, FAKE_PI_COST: "0.4" });

    assert.equal(result.status, 1);
    assert.equal(await spawnCount(log), 2);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    const summary = JSON.parse(await readFile(path.join(resultDirectory, "summary.json"), "utf8"));
    assert.equal(summary.state, "cancelled");
    assert.deepEqual(summary.budget, { maxCost: 0.5, runTotal: 0.8, exhausted: true, overshoot: 0.3 });
    assert.deepEqual(summary.cost, { spent: 0.8, subjects: 2, unmeasured: 0 });
    assert.deepEqual(summary.groups[1].variants, { baseline: "cancelled", candidate: "cancelled" });
  });
});

test("the cost ceiling is shared across trials", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installFakePi(root);
    await writeSkill(root);
    const log = path.join(root, "fake.jsonl");
    const definition = await writeJson(root, "groups/activation.json", group("activation"));

    const result = runCli(root, bin, ["run", definition, "--trials", "3", "--max-cost", "1"], {
      FAKE_PI_LOG: log,
      FAKE_PI_COST: "0.4",
    });

    assert.equal(result.status, 1);
    assert.equal(await spawnCount(log), 3);
    const aggregateId = result.stdout.match(/^Aggregate: (.+)$/m)?.[1];
    const aggregate = JSON.parse(
      await readFile(path.join(root, ".skill-eval/runs", aggregateId, "aggregate.json"), "utf8"),
    );
    assert.equal(aggregate.state, "cancelled");
    assert.equal(aggregate.trials.length, 2);
    assert.deepEqual(aggregate.budget, { maxCost: 1, spent: 1.2, exhausted: true, overshoot: 0.2 });
  });
});

test("each trial records its own cost, apart from the run's running total", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installFakePi(root);
    await writeSkill(root);
    const definition = await writeJson(root, "groups/activation.json", group("activation"));

    const result = runCli(root, bin, ["run", definition, "--trials", "3", "--max-cost", "10"], { FAKE_PI_COST: "0.4" });

    assert.equal(result.status, 0, result.stderr);
    const aggregateId = result.stdout.match(/^Aggregate: (.+)$/m)?.[1];
    const runs = path.join(root, ".skill-eval/runs");
    const aggregate = JSON.parse(await readFile(path.join(runs, aggregateId, "aggregate.json"), "utf8"));
    const summaries = await Promise.all(
      aggregate.trials.map(async (trial) =>
        JSON.parse(await readFile(path.join(runs, trial.id, "summary.json"), "utf8")),
      ),
    );
    // Two subjects at 0.4 each: every trial's own cost is 0.8, while the run's total grows trial by trial.
    assert.deepEqual(
      summaries.map((summary) => summary.cost),
      Array(3).fill({ spent: 0.8, subjects: 2, unmeasured: 0 }),
    );
    assert.deepEqual(
      summaries.map((summary) => summary.budget.runTotal),
      [0.8, 1.6, 2.4],
    );
    assert.deepEqual(
      aggregate.trials.map((trial) => trial.cost),
      [0.8, 0.8, 0.8],
    );
    assert.equal(aggregate.budget.spent, 2.4);
    const viewed = runCli(root, bin, ["view", aggregateId]);
    assert.match(viewed.stdout, /^trial\t\S+\tcomplete\tcost=0\.8$/m);
    const trialView = runCli(root, bin, ["view", aggregate.trials[2].id]);
    assert.match(trialView.stdout, /^cost\tspent=0\.8\tsubjects=2$/m);
    assert.match(trialView.stdout, /^budget\tmax-cost=10\trun-total=2\.4\texhausted=false$/m);
  });
});

test("a run that never reached a model is invalid with its reasons, never a fail, and stops a pilot", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installFakePi(root);
    await writeSkill(root);
    const definition = await writeJson(root, "groups/activation.json", group("activation"));

    // The failed-login pattern: the host exits cleanly and no model ever answers.
    const piloted = runCli(root, bin, ["run", definition, "--trials", "3", "--pilot", "1"], {
      FAKE_PI_HOLLOW: "no-message",
    });

    assert.equal(piloted.status, 1);
    assert.match(piloted.stdout, /^Pilot: (\S+) stopped the run$/m);
    assert.match(
      piloted.stdout,
      /^ {2}- activation: arm baseline is invalid \(not valid evidence: no model turn: .+; no tokens: .+\)$/m,
    );
    const pilotId = piloted.stdout.match(/^Pilot: (\S+) stopped the run$/m)[1];
    const groupDirectory = path.join(root, ".skill-eval/runs", pilotId, "groups/activation");
    const run = JSON.parse(await readFile(path.join(groupDirectory, "candidate/run.json"), "utf8"));
    assert.equal(run.state, "invalid");
    assert.equal(run.error.kind, "validity");
    assert.deepEqual(
      run.error.reasons.map((reason) => reason.split(":")[0]),
      ["no model turn", "no tokens", "no answer and nothing written in the workspace"],
    );
    // Never a fail: every check and the comparison are unavailable.
    const grade = JSON.parse(await readFile(path.join(groupDirectory, "deterministic-grade.json"), "utf8"));
    assert.deepEqual(
      grade.checks.map((check) => check.state),
      ["unavailable", "unavailable"],
    );

    // An empty answer with no tokens is invalid too; it has a message, so only the other two reasons hold.
    const empty = runCli(root, bin, ["run", definition], { FAKE_PI_HOLLOW: "empty" });
    assert.equal(empty.status, 1);
    const summary = JSON.parse(
      await readFile(path.join(empty.stdout.match(/^Path: (.+)$/m)[1], "summary.json"), "utf8"),
    );
    assert.deepEqual(summary.groups[0].variants, { baseline: "invalid", candidate: "invalid" });
    assert.match(
      summary.groups[0].invalid.candidate,
      /^not valid evidence: no tokens: .+; no answer and nothing written/,
    );
    const viewed = runCli(root, bin, ["view", empty.stdout.match(/^Result: (.+)$/m)[1]]);
    assert.match(viewed.stdout, /Candidate \[invalid\]/);
    assert.match(viewed.stdout, /no tokens/);
  });
});

test("a flagged run is held out of the counts until a person clears it, and a pilot stops on it", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installFakePi(root);
    await writeSkill(root);
    const definition = await writeJson(root, "groups/activation.json", group("activation"));
    const peek = { FAKE_PI_PEEK: path.join(root, "host-home/.claude/CLAUDE.md") };

    const piloted = runCli(root, bin, ["run", definition, "--trials", "2", "--pilot", "1"], peek);
    assert.equal(piloted.status, 1);
    assert.match(
      piloted.stdout,
      /^ {2}- activation: arm candidate has transcript flags no one has cleared \(instruction-file-1\)/m,
    );

    const result = runCli(root, bin, ["run", definition, "--trials", "2"], peek);
    assert.equal(result.status, 0, result.stderr);
    const runs = path.join(root, ".skill-eval/runs");
    const aggregateId = result.stdout.match(/^Aggregate: (.+)$/m)?.[1];
    const read = async () => JSON.parse(await readFile(path.join(runs, aggregateId, "aggregate.json"), "utf8"));
    let aggregate = await read();
    const [first, second] = aggregate.trials.map((trial) => trial.id);
    const run = JSON.parse(await readFile(path.join(runs, first, "groups/activation/candidate/run.json"), "utf8"));
    assert.deepEqual(
      run.postRun.scan.flags.map(({ id, kind, evidence }) => [id, kind, evidence.path, evidence.blocked]),
      [["instruction-file-1", "instruction-file", peek.FAKE_PI_PEEK, true]],
    );
    // The run is graded as usual, but the counts hold it: unavailable, named as held, and no pass^k.
    const check = (id) => aggregate.groups[0].checks.find((entry) => entry.id === id);
    assert.deepEqual(
      { ...check("candidate-read"), trials: undefined },
      {
        id: "candidate-read",
        variant: "candidate",
        kind: "skill-read",
        pass: 0,
        fail: 0,
        unavailable: 2,
        held: 2,
        trials: undefined,
        passAll: false,
      },
    );
    assert.equal(aggregate.held.length, 4);
    assert.equal(aggregate.claim.held, 4);

    // A person clears the first trial's flags with a reason; the aggregate is rebuilt and counts those runs again.
    for (const arm of ["baseline", "candidate"]) {
      const cleared = runCli(root, bin, [
        "clear",
        first,
        "--variant",
        arm,
        "--all",
        "--reason",
        "the fixture names that file",
      ]);
      assert.equal(cleared.status, 0, cleared.stderr);
      assert.match(cleared.stdout, new RegExp(`^Aggregates rebuilt: ${aggregateId}$`, "m"));
    }
    aggregate = await read();
    assert.deepEqual([check("candidate-read").pass, check("candidate-read").held], [1, 1]);
    assert.deepEqual(
      aggregate.held.map(({ trial, arm }) => [trial, arm]),
      [
        [second, "baseline"],
        [second, "candidate"],
      ],
    );
    const clearances = JSON.parse(
      await readFile(path.join(runs, first, "groups/activation/candidate/clearances.json"), "utf8"),
    );
    assert.deepEqual(
      clearances.cleared.map(({ flag, reason }) => [flag, reason]),
      [["instruction-file-1", "the fixture names that file"]],
    );
    const trialView = runCli(root, bin, ["view", first, "--variant", "candidate"]);
    assert.match(trialView.stdout, /^ {2}flag\tinstruction-file-1\t.+\tcleared: the fixture names that file$/m);
    const aggregateView = runCli(root, bin, ["view", aggregateId]);
    assert.match(
      aggregateView.stdout,
      new RegExp(`^held\\t${second}\\tactivation\\tcandidate\\tflags=instruction-file-1$`, "m"),
    );
    // An unknown flag is refused.
    const unknown = runCli(root, bin, [
      "clear",
      second,
      "--variant",
      "candidate",
      "--flag",
      "network-9",
      "--reason",
      "x",
    ]);
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /the run has no flag network-9; its flags: instruction-file-1/);
  });
});

test("run options reject invalid trial counts and cost ceilings", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installFakePi(root);
    for (const args of [
      ["run", "group.json", "--trials", "0"],
      ["run", "group.json", "--trials", "1.5"],
      ["run", "group.json", "--max-cost", "-1"],
      ["run", "group.json", "--max-cost", "free"],
      ["view", "result", "--trials", "2"],
    ]) {
      const result = runCli(root, bin, args);
      assert.equal(result.status, 1, args.join(" "));
      assert.match(result.stderr, /trials|max-cost|Unknown option/, args.join(" "));
    }
  });
});

test("aggregation counts an unreadable trial grade instead of discarding every trial", async () => {
  await withTempDirectory(async (root) => {
    const good = path.join(root, "trial-1");
    const broken = path.join(root, "trial-2");
    await writeJson(good, "groups/activation/deterministic-grade.json", {
      checks: [{ id: "candidate-read", variant: "candidate", kind: "skill-read", state: "pass" }],
      comparisons: [],
    });
    await mkdir(path.join(broken, "groups/activation"), { recursive: true });
    await writeFile(path.join(broken, "groups/activation/deterministic-grade.json"), "{not json");
    const summary = { groups: [{ id: "activation", artifacts: { grade: "deterministic-grade.json" } }] };

    const groups = await aggregateGroups([
      { path: good, summary },
      { path: broken, summary },
    ]);

    assert.equal(groups.length, 1);
    assert.equal(groups[0].trials, 2);
    assert.equal(groups[0].unreadableGrades, 1);
    assert.deepEqual(
      groups[0].checks.map(({ id, pass, fail, unavailable }) => ({ id, pass, fail, unavailable })),
      [{ id: "candidate-read", pass: 1, fail: 0, unavailable: 1 }],
    );
  });
});

test("aggregation reports pass^k, per-trial pairs, grade errors and run states", async () => {
  await withTempDirectory(async (root) => {
    const trials = [];
    // Three trials: the candidate check passes every time; the baseline passes once.
    for (const [index, baselineState] of ["pass", "fail", "fail"].entries()) {
      const trial = path.join(root, `trial-${index + 1}`);
      await writeJson(trial, "groups/review/deterministic-grade.json", {
        checks: [
          { id: "baseline-found", variant: "baseline", kind: "file-text", state: baselineState },
          { id: "candidate-found", variant: "candidate", kind: "file-text", state: "pass" },
        ],
        comparisons: [
          {
            id: "found",
            kind: "file-text",
            baseline: { check: "baseline-found", state: baselineState },
            candidate: { check: "candidate-found", state: "pass" },
            transition: baselineState === "pass" ? "unchanged" : "fail-to-pass",
          },
        ],
        errors: index === 2 ? [{ expectation: "broken", error: "invalid file-text expectation" }] : [],
      });
      trials.push({
        path: trial,
        summary: {
          groups: [
            {
              id: "review",
              variants: { baseline: "complete", candidate: index === 1 ? "infrastructure-failed" : "complete" },
              artifacts: { grade: "deterministic-grade.json" },
            },
          ],
        },
      });
    }

    const [group] = await aggregateGroups(trials);

    assert.equal(group.gradeErrors, 1);
    assert.deepEqual(group.runStates, {
      baseline: { complete: 3 },
      candidate: { complete: 2, "infrastructure-failed": 1 },
    });
    const byId = Object.fromEntries(group.checks.map((check) => [check.id, check]));
    assert.deepEqual(
      { trials: byId["candidate-found"].trials, passAll: byId["candidate-found"].passAll },
      { trials: 3, passAll: true },
    );
    assert.deepEqual(
      { trials: byId["baseline-found"].trials, passAll: byId["baseline-found"].passAll },
      { trials: 3, passAll: false },
    );
    assert.deepEqual(group.comparisons[0].pairs, {
      "both-pass": 1,
      "both-fail": 0,
      "baseline-only": 0,
      "candidate-only": 2,
      incomplete: 0,
    });
  });
});

test("an aggregate view shows counts, pass^k, pairs and the claim it supports", async () => {
  await withTempDirectory(async (root) => {
    const id = "20260925000000-agg00001";
    await writeJson(root, `.skill-eval/runs/${id}/aggregate.json`, {
      schema_version: 1,
      kind: "aggregate",
      id,
      state: "complete",
      requestedTrials: 3,
      trials: [
        { id: "t1", state: "complete" },
        { id: "t2", state: "complete" },
        { id: "t3", state: "complete" },
      ],
      claim: { class: "rate-on-suite", k: 3, beats: "not supported: the suite declares no decision rule" },
      groups: [
        {
          id: "review",
          trials: 3,
          unreadableGrades: 0,
          gradeErrors: 1,
          runStates: { baseline: { complete: 3 }, candidate: { complete: 3 } },
          comparisons: [
            {
              id: "found",
              kind: "file-text",
              baseline: { pass: 1, fail: 2, unavailable: 0 },
              candidate: { pass: 3, fail: 0, unavailable: 0 },
              transitions: { "fail-to-pass": 2, unchanged: 1 },
              pairs: { "both-pass": 1, "both-fail": 0, "baseline-only": 0, "candidate-only": 2, incomplete: 0 },
            },
          ],
          checks: [
            {
              id: "candidate-found",
              variant: "candidate",
              kind: "file-text",
              pass: 3,
              fail: 0,
              unavailable: 0,
              trials: 3,
              passAll: true,
            },
          ],
        },
      ],
    });

    const viewed = spawnSync(process.execPath, [entrypoint, "view", id], { cwd: root, encoding: "utf8" });

    assert.equal(viewed.status, 0, viewed.stderr);
    assert.match(
      viewed.stdout,
      /Claim: rate on this suite, k=3; no "beats" claim: the suite declares no decision rule/,
    );
    assert.match(viewed.stdout, /Group review trials=3 grade-errors=1/);
    assert.ok(viewed.stdout.includes("pairs: both-pass=1 candidate-only=2"), viewed.stdout);
    assert.ok(viewed.stdout.includes("pass=3/3\tfail=0\tunavailable=0\tpass^3=yes"), viewed.stdout);
  });
});
