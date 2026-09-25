import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const entrypoint = fileURLToPath(new URL("../../../skills/evaluate-skill/scripts/skill-eval.mjs", import.meta.url));
const FAKE_KEYS = ["FAKE_PI_LOG", "FAKE_PI_COST"];

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
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
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
  const fakeEnv = Object.fromEntries(FAKE_KEYS.map((key) => [key, ""]));
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
    assert.deepEqual(summary.budget, { maxCost: 0.5, spent: 0.8, exhausted: true });
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
    assert.deepEqual(aggregate.budget, { maxCost: 1, spent: 1.2, exhausted: true });
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
