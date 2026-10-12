import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  budgetEvidence,
  charge,
  createBudget,
  reserve,
} from "../../../skills/evaluate-behavior/scripts/lib/budget.mjs";
import { loadDefinition } from "../../../skills/evaluate-behavior/scripts/lib/definitions.mjs";
import { createLimiter, withCpuSlot } from "../../../skills/evaluate-behavior/scripts/lib/queue.mjs";
import { readIndex, reuseKey } from "../../../skills/evaluate-behavior/scripts/lib/reuse.mjs";
import { runEvaluation } from "../../../skills/evaluate-behavior/scripts/lib/runner.mjs";
import { toV2 } from "./helpers/to-v2.mjs";

const entrypoint = fileURLToPath(new URL("../../../skills/evaluate-behavior/scripts/skill-eval.mjs", import.meta.url));

async function withTempDirectory(run) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "skill-eval-concurrency-test-")));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(toV2(value), null, 2)}\n`);
  return file;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

/**
 * A subject that logs its start and end, sleeps FAKE_PI_SLEEP_MS, charges FAKE_PI_COST, fails without output
 * when its prompt says BROKEN, reads its first skill, and answers --version.
 */
async function installFakePi(root) {
  const bin = path.join(root, "bin");
  await mkdir(bin, { recursive: true });
  const executable = path.join(bin, "pi");
  await writeFile(
    executable,
    `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
if (args[0] === "--version") { process.stdout.write("pi 9.9.9\\n"); process.exit(0); }
const log = (kind) => appendFileSync(${JSON.stringify(path.join(root, "fake.jsonl"))}, JSON.stringify({ kind, pid: process.pid }) + "\\n");
log("start");
if (String(args.at(-1)).includes("BROKEN")) { log("end"); process.exit(3); }
const skills = args.flatMap((arg, index) => arg === "--skill" ? [args[index + 1]] : []);
await new Promise((resolve) => setTimeout(resolve, Number(process.env.FAKE_PI_SLEEP_MS || 0)));
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
emit({ type: "agent_start" });
if (skills[0]) {
  emit({ type: "tool_execution_start", toolCallId: "r", toolName: "read", args: { path: skills[0] + "/SKILL.md" } });
  emit({ type: "tool_execution_end", toolCallId: "r", toolName: "read", isError: false });
}
emit({ type: "message_end", message: {
  role: "assistant",
  content: [{ type: "text", text: "done" }],
  provider: "fake",
  model: "fake-model",
  usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: { total: Number(process.env.FAKE_PI_COST || 0) } },
  stopReason: "stop",
} });
emit({ type: "agent_settled" });
log("end");
`,
  );
  await chmod(executable, 0o755);
  return bin;
}

async function events(root) {
  const text = await readFile(path.join(root, "fake.jsonl"), "utf8").catch(() => "");
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/** The most subjects that were running at once, replayed from the fake's start and end lines. */
function peakConcurrency(log) {
  let running = 0;
  let peak = 0;
  for (const entry of log) {
    running += entry.kind === "start" ? 1 : -1;
    peak = Math.max(peak, running);
  }
  return peak;
}

async function writeSkill(root, body = "# Release Route\n") {
  const directory = path.join(root, "skills/release-route");
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "SKILL.md"),
    `---\nname: release-route\ndescription: Use when delivering a change.\n---\n\n${body}`,
  );
}

function group(id, prompt = "How should I ship this change?") {
  return {
    schema_version: 1,
    kind: "group",
    id,
    type: "description",
    input: { prompt },
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
    runtime: {
      host: "pi",
      session: false,
      extensions: [],
      environment: { literal: {}, inherit: ["FAKE_PI_SLEEP_MS", "FAKE_PI_COST"] },
    },
  };
}

async function writeSuite(root, groups) {
  await writeSkill(root);
  for (const entry of groups) await writeJson(path.join(root, "groups", `${entry.id}.json`), entry);
  return writeJson(path.join(root, "suite.json"), {
    schema_version: 2,
    kind: "suite",
    id: "parallel",
    groups: groups.map((entry) => `groups/${entry.id}.json`),
  });
}

function environment(root, bin, extra = {}) {
  return {
    ...process.env,
    FAKE_PI_SLEEP_MS: "",
    FAKE_PI_COST: "",
    SKILL_EVAL_CREDENTIALS_DIR: path.join(root, "no-credentials"),
    PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
    ...extra,
  };
}

function runCli(root, bin, args, extra = {}, { dryRun = true } = {}) {
  const flags = args[0] === "run" ? [...(dryRun ? ["--dry-run"] : []), "--yes"] : [];
  return spawnSync(process.execPath, [entrypoint, ...args, ...flags], {
    cwd: root,
    encoding: "utf8",
    env: environment(root, bin, extra),
  });
}

test("a limiter never runs more than its limit and starts waiters in order", async () => {
  const limiter = createLimiter(2);
  const order = [];
  const work = (id) =>
    limiter.run(async () => {
      order.push(`start ${id}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push(`end ${id}`);
    });
  await Promise.all([1, 2, 3, 4].map(work));
  assert.equal(limiter.peak, 2);
  assert.equal(limiter.active, 0);
  assert.deepEqual(order.slice(0, 2), ["start 1", "start 2"]);
  assert.ok(order.indexOf("start 3") > order.indexOf("end 1"));
  assert.equal(await withCpuSlot(async () => "cpu"), "cpu");
});

test("--jobs 3 runs subjects across groups, arms and trials, never more than 3 at once", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installFakePi(root);
    const suite = await writeSuite(root, [group("one"), group("two"), group("three")]);
    const result = runCli(root, bin, ["run", suite, "--trials", "2", "--jobs", "3"], { FAKE_PI_SLEEP_MS: "300" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^Plan: 12 subjects .*; 3 subjects at once; dry run$/m);
    const log = await events(root);
    assert.equal(log.filter((entry) => entry.kind === "start").length, 12);
    assert.equal(peakConcurrency(log), 3);
    const aggregate = await readJson(
      path.join(root, ".skill-eval/runs", result.stdout.match(/^Aggregate: (.+)$/m)[1], "aggregate.json"),
    );
    assert.equal(aggregate.state, "complete");
    // Results are recorded in plan order, whatever order they finished in.
    assert.deepEqual(
      aggregate.groups.map((entry) => [entry.id, entry.trials]),
      [
        ["one", 2],
        ["two", 2],
        ["three", 2],
      ],
    );
    const invocation = await readJson(path.join(root, ".skill-eval/runs", aggregate.trials[0].id, "invocation.json"));
    assert.equal(invocation.jobs, 3);
  });
});

test("one job keeps the serial order: each subject ends before the next starts", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installFakePi(root);
    const suite = await writeSuite(root, [group("one"), group("two")]);
    const result = runCli(root, bin, ["run", suite, "--trials", "2"], { FAKE_PI_SLEEP_MS: "50" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(peakConcurrency(await events(root)), 1);
  });
});

test("cancellation stops queued subjects and reaches every running one", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installFakePi(root);
    const suite = await writeSuite(root, [group("one"), group("two"), group("three")]);
    const saved = {
      PATH: process.env.PATH,
      SLEEP: process.env.FAKE_PI_SLEEP_MS,
      CREDS: process.env.SKILL_EVAL_CREDENTIALS_DIR,
    };
    Object.assign(process.env, environment(root, bin, { FAKE_PI_SLEEP_MS: "20000" }));
    const controller = new AbortController();
    try {
      const running = runEvaluation(suite, {}, { root, signal: controller.signal, dryRun: true, jobs: 2 });
      // Abort once both slots hold a running subject.
      for (let waited = 0; (await events(root)).length < 2 && waited < 10000; waited += 50) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      controller.abort();
      const started = Date.now();
      const result = await running;
      assert.ok(Date.now() - started < 15000, "running subjects were terminated, not waited for");
      assert.equal((await events(root)).filter((entry) => entry.kind === "start").length, 2);
      const states = result.summary.groups.flatMap((entry) => Object.values(entry.variants));
      assert.deepEqual(states, Array(6).fill("cancelled"));
      assert.equal(result.state, "cancelled");
    } finally {
      process.env.PATH = saved.PATH;
      if (saved.SLEEP === undefined) delete process.env.FAKE_PI_SLEEP_MS;
      else process.env.FAKE_PI_SLEEP_MS = saved.SLEEP;
      if (saved.CREDS === undefined) delete process.env.SKILL_EVAL_CREDENTIALS_DIR;
      else process.env.SKILL_EVAL_CREDENTIALS_DIR = saved.CREDS;
    }
  });
});

test("budget reservation: running subjects reserve the mean cost, so overshoot is bounded by the running set", () => {
  const budget = createBudget(1);
  // Before any subject finished, the estimate is zero, so three start.
  const first = [reserve(budget), reserve(budget), reserve(budget)];
  assert.deepEqual(
    first.map((entry) => entry.amount),
    [0, 0, 0],
  );
  charge(budget, first[0], 0.4);
  const fourth = reserve(budget);
  assert.equal(fourth.amount, 0.4);
  charge(budget, first[1], 0.4);
  // Spent 0.8 plus 0.4 reserved for the running fourth reaches the ceiling: the next may not start.
  assert.equal(reserve(budget), null);
  assert.equal(budget.exhausted, true);
  charge(budget, first[2], 0.4);
  charge(budget, fourth, 0.4);
  assert.deepEqual(budgetEvidence(budget), { maxCost: 1, spent: 1.6, exhausted: true, overshoot: 0.6 });
  assert.equal(budget.reserved, 0);
  // Without a ceiling every subject may start.
  assert.deepEqual(reserve(null), { amount: 0 });
});

test("--max-cost with --jobs stops starting subjects and states the overshoot", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installFakePi(root);
    const suite = await writeSuite(root, [group("one"), group("two"), group("three"), group("four")]);
    const result = runCli(root, bin, ["run", suite, "--jobs", "2", "--max-cost", "1"], {
      FAKE_PI_COST: "0.4",
      FAKE_PI_SLEEP_MS: "100",
    });
    assert.equal(result.status, 1);
    const started = (await events(root)).filter((entry) => entry.kind === "start").length;
    // 8 subjects declared; the ceiling stops new ones once spent plus reserved reaches it.
    assert.ok(started >= 3 && started <= 4, `started ${started}`);
    const summary = await readJson(path.join(result.stdout.match(/^Path: (.+)$/m)[1], "summary.json"));
    assert.equal(summary.budget.exhausted, true);
    assert.ok(summary.budget.overshoot <= 2 * 0.4 + 1e-9);
    assert.equal(summary.budget.spent, Number((started * 0.4).toFixed(10)));
  });
});

test("--results stores results outside the root, and view finds them by ID", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installFakePi(root);
    const suite = await writeSuite(root, [group("one")]);
    const elsewhere = await realpath(await mkdtemp(path.join(tmpdir(), "skill-eval-results-")));
    try {
      const result = runCli(root, bin, ["run", suite, "--trials", "2", "--results", elsewhere]);
      assert.equal(result.status, 0, result.stderr);
      const aggregateId = result.stdout.match(/^Aggregate: (.+)$/m)[1];
      assert.equal(await stat(path.join(root, ".skill-eval")).catch(() => null), null);
      const aggregate = await readJson(path.join(elsewhere, aggregateId, "aggregate.json"));
      const invocation = await readJson(path.join(elsewhere, aggregate.trials[0].id, "invocation.json"));
      assert.equal(invocation.results, elsewhere);

      const viewed = runCli(root, bin, ["view", aggregateId, "--results", elsewhere]);
      assert.equal(viewed.status, 0, viewed.stderr);
      assert.match(viewed.stdout, new RegExp(`^Aggregate ${aggregateId} \\[complete\\] trials=2/2`, "m"));
      const trial = runCli(root, bin, ["view", aggregate.trials[1].id, "--results", elsewhere]);
      assert.equal(trial.status, 0, trial.stderr);
      assert.match(trial.stdout, /^Group one \[complete\]/m);
      // Without --results a stored ID is looked up under the root, where it is not.
      assert.equal(runCli(root, bin, ["view", aggregateId]).status, 1);
      const html = runCli(root, bin, ["view", aggregateId, "--results", elsewhere, "--html", "page.html"]);
      assert.equal(html.status, 0, html.stderr);
      assert.doesNotMatch(await readFile(path.join(root, "page.html"), "utf8"), /Trial result unavailable/);
    } finally {
      await rm(elsewhere, { recursive: true, force: true });
    }
  });
});

function git(root, args) {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
}

async function commitAll(root, message) {
  // Results, the fake and its log are ignored by the repository's .gitignore.
  git(root, ["add", "-A"]);
  git(root, ["-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", message]);
}

async function gitRepository(root) {
  git(root, ["init", "-q"]);
  await writeFile(path.join(root, ".gitignore"), ".skill-eval/\nbin/\nfake.jsonl\nno-credentials/\n");
}

test("reuse keys match only identical inputs and change when any key part changes", async () => {
  await withTempDirectory(async (root) => {
    await gitRepository(root);
    const suite = await writeSuite(root, [group("one")]);
    await commitAll(root, "inputs");
    const loaded = (await loadDefinition(suite, { root })).groups[0];
    const key = (overrides = {}) =>
      reuseKey({
        group: overrides.group ?? loaded,
        arm: overrides.arm ?? "candidate",
        root,
        hostVersion: overrides.host ?? "9.9.9",
      });
    const base = await key();
    assert.match(base, /^[0-9a-f]{64}$/);
    assert.equal(await key(), base);
    // Each part of the key changes it.
    assert.notEqual(await key({ host: "9.9.10" }), base);
    assert.notEqual(await key({ arm: "baseline" }), base);
    assert.notEqual(await key({ group: { ...loaded, input: { prompt: "Something else?" } } }), base);
    const withModel = structuredClone(loaded);
    withModel.variants.candidate.model = { model: "anthropic/claude-haiku-5-5", thinking: "medium" };
    assert.notEqual(await key({ group: withModel }), base);
    // A change to the arm's skill content changes its key, and not the other arm's.
    const baseline = await key({ arm: "baseline" });
    await writeSkill(root, "# Release Route, revised\n");
    assert.notEqual(await key(), base);
    assert.equal(await key({ arm: "baseline" }), baseline);
  });
});

test("--reuse counts matching canonical runs instead of running them, each once per aggregate", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installFakePi(root);
    await gitRepository(root);
    const suite = await writeSuite(root, [group("one")]);
    await commitAll(root, "inputs");

    // Without --reuse nothing is indexed.
    const plain = runCli(root, bin, ["run", suite], {}, { dryRun: false });
    assert.equal(plain.status, 0, plain.stderr);
    assert.equal((await readIndex(path.join(root, ".skill-eval/runs"))).size, 0);
    await rm(path.join(root, "fake.jsonl"));

    // A canonical run with --reuse finds nothing yet, and indexes its complete runs.
    const first = runCli(root, bin, ["run", suite, "--reuse"], {}, { dryRun: false });
    assert.equal(first.status, 0, first.stderr);
    const firstId = first.stdout.match(/^Result: (.+)$/m)[1];
    const index = await readIndex(path.join(root, ".skill-eval/runs"));
    assert.equal(index.size, 2);
    assert.equal((await events(root)).filter((entry) => entry.kind === "start").length, 2);

    // Two trials with --reuse: the first takes the indexed runs, the second must run, since none is reused twice.
    const second = runCli(root, bin, ["run", suite, "--trials", "2", "--reuse"], {}, { dryRun: false });
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /reusing matching runs/);
    assert.equal((await events(root)).filter((entry) => entry.kind === "start").length, 4);
    const aggregate = await readJson(
      path.join(root, ".skill-eval/runs", second.stdout.match(/^Aggregate: (.+)$/m)[1], "aggregate.json"),
    );
    assert.deepEqual(
      aggregate.reused.map(({ trial, group: id, arm, from, reused }) => [trial, id, arm, from.result, reused]),
      [
        [aggregate.trials[0].id, "one", "baseline", firstId, true],
        [aggregate.trials[0].id, "one", "candidate", firstId, true],
      ],
    );
    const reusedRun = await readJson(
      path.join(root, ".skill-eval/runs", aggregate.trials[0].id, "groups/one/candidate/run.json"),
    );
    assert.equal(reusedRun.state, "complete");
    assert.equal(reusedRun.reused.result, firstId);
    // The reused run is graded in its new trial like any other.
    const [counted] = aggregate.groups;
    assert.deepEqual(counted.comparisons[0].candidate, { pass: 2, fail: 0, unavailable: 0 });

    // A changed skill changes the candidate's key, so it runs; the baseline, which does not load the skill, keeps
    // its key and reuses the oldest indexed run (the once-per-aggregate rule does not span separate runs).
    await writeSkill(root, "# Release Route, revised\n");
    await commitAll(root, "revise");
    const third = runCli(root, bin, ["run", suite, "--reuse"], {}, { dryRun: false });
    assert.equal(third.status, 0, third.stderr);
    assert.equal((await events(root)).filter((entry) => entry.kind === "start").length, 5);
    const summary = await readJson(path.join(third.stdout.match(/^Path: (.+)$/m)[1], "summary.json"));
    assert.deepEqual(Object.keys(summary.groups[0].reused), ["baseline"]);
    assert.equal(summary.groups[0].reused.baseline.result, firstId);

    // A dry run never reuses and is never indexed.
    const before = (await readIndex(path.join(root, ".skill-eval/runs"))).size;
    const dry = runCli(root, bin, ["run", suite, "--reuse"]);
    assert.equal(dry.status, 0, dry.stderr);
    assert.equal((await readIndex(path.join(root, ".skill-eval/runs"))).size, before);
    assert.equal((await events(root)).filter((entry) => entry.kind === "start").length, 7);
  });
});

test("--pilot stops before the batch on a broken group", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installFakePi(root);
    const suite = await writeSuite(root, [group("broken", "BROKEN prompt"), group("healthy")]);
    const result = runCli(root, bin, ["run", suite, "--trials", "2", "--pilot", "1"]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /^Pilot: .+ stopped the run$/m);
    assert.match(result.stdout, /^ {2}- broken: arm baseline is infrastructure-failed$/m);
    assert.match(result.stdout, /^ {2}- broken: no arm passed target-read$/m);
    assert.doesNotMatch(result.stdout, /^Aggregate: /m);
    // Only the pilot's two subjects ran.
    assert.equal((await events(root)).filter((entry) => entry.kind === "start").length, 2);
    const stored = await readdir(path.join(root, ".skill-eval/runs"));
    assert.equal(stored.length, 1);
  });
});

test("--pilot continues on a healthy group, and the pilot counts as the first trial", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installFakePi(root);
    const suite = await writeSuite(root, [group("first"), group("second"), group("third")]);
    const result = runCli(root, bin, ["run", suite, "--trials", "2", "--pilot", "1"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^Pilot: .+ passed$/m);
    assert.match(result.stdout, /pilot of the first 1 groups/);
    // Pilot (1 group) + the rest of trial 1 (2 groups) + trial 2 (3 groups), two arms each.
    assert.equal((await events(root)).filter((entry) => entry.kind === "start").length, 12);
    const aggregate = await readJson(
      path.join(root, ".skill-eval/runs", result.stdout.match(/^Aggregate: (.+)$/m)[1], "aggregate.json"),
    );
    assert.deepEqual(
      aggregate.trials.map((trial) => trial.part ?? "full"),
      ["pilot", "rest", "full"],
    );
    assert.deepEqual(aggregate.pilot.problems, []);
    assert.deepEqual(
      aggregate.groups.map((entry) => [entry.id, entry.trials]),
      [
        ["first", 2],
        ["second", 2],
        ["third", 2],
      ],
    );
    assert.equal(aggregate.state, "complete");
  });
});

test("--pilot before a single run does not count the pilot", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installFakePi(root);
    const suite = await writeSuite(root, [group("first"), group("second")]);
    const result = runCli(root, bin, ["run", suite, "--pilot", "1"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^Pilot: .+ passed$/m);
    assert.equal((await events(root)).filter((entry) => entry.kind === "start").length, 6);
    const summary = await readJson(path.join(result.stdout.match(/^Path: (.+)$/m)[1], "summary.json"));
    assert.deepEqual(
      summary.groups.map((entry) => entry.id),
      ["first", "second"],
    );
  });
});
