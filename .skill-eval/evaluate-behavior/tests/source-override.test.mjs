import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadDefinition } from "../../../skills/evaluate-behavior/scripts/lib/definitions.mjs";
import { reuseKey } from "../../../skills/evaluate-behavior/scripts/lib/reuse.mjs";
import {
  applySourceOverrides,
  parseSourceOverrides,
} from "../../../skills/evaluate-behavior/scripts/lib/source-override.mjs";

const entrypoint = fileURLToPath(new URL("../../../skills/evaluate-behavior/scripts/skill-eval.mjs", import.meta.url));
const gateScript = fileURLToPath(new URL("../../scripts/gate.mjs", import.meta.url));
const MODEL = { model: "anthropic/claude-haiku-5-5", thinking: "medium" };

async function withTempDirectory(run) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "skill-eval-source-test-")));
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
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function commit(root, message) {
  git(root, "add", "-A");
  git(root, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", message);
  return git(root, "rev-parse", "HEAD");
}

/** A subject that reads its first skill only when that skill's text says READ-ME, and logs each start. */
async function installFakePi(root) {
  const bin = path.join(root, "bin");
  await mkdir(bin, { recursive: true });
  const executable = path.join(bin, "pi");
  await writeFile(
    executable,
    `#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";
const args = process.argv.slice(2);
if (args[0] === "--version") { process.stdout.write("pi 9.9.9\\n"); process.exit(0); }
appendFileSync(${JSON.stringify(path.join(root, "fake.jsonl"))}, "start\\n");
const skills = args.flatMap((arg, index) => arg === "--skill" ? [args[index + 1]] : []);
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
emit({ type: "agent_start" });
if (skills[0] && readFileSync(skills[0] + "/SKILL.md", "utf8").includes("READ-ME")) {
  emit({ type: "tool_execution_start", toolCallId: "r", toolName: "read", args: { path: skills[0] + "/SKILL.md" } });
  emit({ type: "tool_execution_end", toolCallId: "r", toolName: "read", isError: false });
}
emit({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "done" }], provider: "fake",
  model: "fake", usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: { total: 0.01 } }, stopReason: "stop" } });
emit({ type: "agent_settled" });
`,
  );
  await chmod(executable, 0o755);
  return bin;
}

/** Both arms load the same skill from Git; the declared ref is a placeholder that --source replaces. */
function gitGroup(id, { source = { kind: "git", ref: "HEAD" } } = {}) {
  return {
    schema_version: 2,
    kind: "group",
    id,
    type: "description",
    input: { prompt: "How should I ship this change?" },
    fixture: null,
    tools: ["read"],
    configuration: {
      host: { name: "pi" },
      model: MODEL,
      subject: { kind: "skill", source, skills: ["skills/release-route"], target: 0, context: [] },
    },
    arms: { baseline: {}, candidate: {} },
    component: [],
    expectations: [
      { id: "baseline-read", kind: "skill-read", variant: "baseline", expect: "by-turn", turn: 1, comparison: "read" },
      {
        id: "candidate-read",
        kind: "skill-read",
        variant: "candidate",
        expect: "by-turn",
        turn: 1,
        comparison: "read",
      },
    ],
    review_questions: [],
  };
}

async function writeSkill(root, body) {
  await write(
    path.join(root, "skills/release-route/SKILL.md"),
    `---\nname: release-route\ndescription: Use when delivering a change.\n---\n\n${body}\n`,
  );
}

/** A repository whose base commit's skill says READ-ME and whose HEAD's does not: HEAD regressed. */
async function regressingRepository(root) {
  git(root, "init", "-q");
  await write(path.join(root, ".gitignore"), ".skill-eval/runs/\nbin/\nfake.jsonl\nno-credentials/\n");
  await writeSkill(root, "# Release Route\n\nREAD-ME first.");
  await write(path.join(root, ".skill-eval/route/groups/g1.json"), gitGroup("g1"));
  await write(path.join(root, ".skill-eval/route/suite.json"), {
    schema_version: 2,
    kind: "suite",
    id: "route",
    groups: ["groups/g1.json"],
  });
  await write(path.join(root, ".skill-eval/gate.json"), {
    schema_version: 1,
    model: MODEL,
    entries: [
      {
        paths: ["skills/release-route/**"],
        suite: ".skill-eval/route/suite.json",
        trials: 1,
        arms: { baseline: "base", candidate: "head" },
      },
    ],
  });
  const base = commit(root, "base");
  await writeSkill(root, "# Release Route\n\nNothing to see.");
  const head = commit(root, "head");
  return { base, head };
}

function environment(root, bin) {
  return {
    ...process.env,
    SKILL_EVAL_CREDENTIALS_DIR: path.join(root, "no-credentials"),
    PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
  };
}

test("--source values parse as arm=commit, once per arm", () => {
  assert.deepEqual(parseSourceOverrides(["baseline=abc1234", "candidate=0123456789abcdef"]), {
    baseline: "abc1234",
    candidate: "0123456789abcdef",
  });
  assert.throws(() => parseSourceOverrides(["baseline=main"]), /<arm>=<commit SHA>/);
  assert.throws(() => parseSourceOverrides(["Baseline=abc1234"]), /<arm>=<commit SHA>/);
  assert.throws(() => parseSourceOverrides(["baseline=abc1234", "baseline=abc1235"]), /only once/);
});

test("an override replaces every Git ref an arm declares, refuses an arm without one, and changes its reuse key", async () => {
  await withTempDirectory(async (root) => {
    git(root, "init", "-q");
    await writeSkill(root, "one");
    const first = commit(root, "one");
    await writeSkill(root, "two");
    const second = commit(root, "two");
    const file = await write(path.join(root, "g.json"), gitGroup("g1", { source: { kind: "git", ref: first } }));
    const load = async () => await loadDefinition(file, { root });

    const declared = await load();
    const overridden = await load();
    applySourceOverrides({ groups: [{ group: overridden }] }, { candidate: second });
    assert.equal(overridden.variants.candidate.source.ref, second);
    assert.equal(overridden.configurations.candidate.subject.source.ref, second);
    assert.equal(overridden.variants.baseline.source.ref, first);
    // The definition on disk is untouched.
    assert.equal((await readJson(file)).configuration.subject.source.ref, first);

    const key = (group) => reuseKey({ group, arm: "candidate", root, hostVersion: "9.9.9" });
    assert.notEqual(await key(overridden), await key(declared));
    const same = await load();
    applySourceOverrides({ groups: [{ group: same }] }, { candidate: first });
    assert.equal(await key(same), await key(declared));

    const workingTree = await write(path.join(root, "w.json"), gitGroup("w1", { source: { kind: "working-tree" } }));
    const plain = await loadDefinition(workingTree, { root });
    assert.throws(
      () => applySourceOverrides({ groups: [{ group: plain }] }, { candidate: second }),
      /arm candidate of group w1 declares no Git source to override/,
    );
    const another = await load();
    assert.throws(
      () => applySourceOverrides({ groups: [{ group: another }] }, { other: second }),
      /other is not an arm of group g1/,
    );
  });
});

test("run --source uses the commit for the arm and records it, without touching the definition", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installFakePi(root);
    const { base, head } = await regressingRepository(root);
    const before = await readFile(path.join(root, ".skill-eval/route/groups/g1.json"), "utf8");
    const result = spawnSync(
      process.execPath,
      [
        entrypoint,
        "run",
        ".skill-eval/route/suite.json",
        "--yes",
        "--jobs",
        "1",
        "--source",
        `baseline=${base}`,
        "--source",
        `candidate=${head}`,
      ],
      { cwd: root, encoding: "utf8", env: environment(root, bin) },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`; sources: baseline=${base}, candidate=${head}`));
    const directory = result.stdout.match(/^Path: (.+)$/m)[1];
    assert.deepEqual((await readJson(path.join(directory, "invocation.json"))).sources, {
      baseline: base,
      candidate: head,
    });
    for (const [arm, commitId] of [
      ["baseline", base],
      ["candidate", head],
    ]) {
      const run = await readJson(path.join(directory, "groups/g1", arm, "run.json"));
      assert.equal(run.sourceOverride, commitId);
      assert.equal(run.resources.source.commit, commitId);
    }
    // The base skill says READ-ME, HEAD's does not: the override reached each arm's snapshot.
    const grade = await readJson(path.join(directory, "groups/g1/deterministic-grade.json"));
    assert.deepEqual([grade.comparisons[0].baseline.state, grade.comparisons[0].candidate.state], ["pass", "fail"]);
    assert.equal(await readFile(path.join(root, ".skill-eval/route/groups/g1.json"), "utf8"), before);

    const refused = spawnSync(
      process.execPath,
      [entrypoint, "run", ".skill-eval/route/suite.json", "--yes", "--jobs", "1", "--source", "other=abc1234"],
      {
        cwd: root,
        encoding: "utf8",
        env: environment(root, bin),
      },
    );
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /--source other: other is not an arm of group g1/);
  });
});

test("the gate measures base against HEAD and reports the regression between them", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installFakePi(root);
    const { base, head } = await regressingRepository(root);
    const result = spawnSync(process.execPath, [gateScript, "--base", base], {
      cwd: root,
      encoding: "utf8",
      env: environment(root, bin),
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(
      result.stdout,
      new RegExp(`^ {2}sources: baseline=${base.slice(0, 12)}, candidate=${head.slice(0, 12)}$`, "m"),
    );
    assert.match(
      result.stdout,
      /^REGRESSED \.skill-eval\/route\/suite\.json \(aggregate \S+, cost 0\.02\): g1\/read: candidate 0 < baseline 1$/m,
    );
  });
});
