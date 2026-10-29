import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadDefinition, selectDefinition } from "../../../skills/evaluate-behavior/scripts/lib/definitions.mjs";
import { registerAggregator } from "../../../skills/evaluate-behavior/scripts/lib/hooks.mjs";
import { aggregateGroups } from "../../../skills/evaluate-behavior/scripts/lib/trials.mjs";

const scripts = fileURLToPath(new URL("../../../skills/evaluate-behavior/scripts/", import.meta.url));
const entrypoint = path.join(scripts, "skill-eval.mjs");
const hooksModule = pathToFileURL(path.join(scripts, "lib", "hooks.mjs")).href;
const ARMS = ["baseline", "same", "changed"];

async function withTempDirectory(run) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "skill-eval-arms-test-")));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

/** A subject that reads its first skill's SKILL.md when it is given one, and logs each start. */
async function installFakePi(root) {
  const bin = path.join(root, "bin");
  await mkdir(bin, { recursive: true });
  const executable = path.join(bin, "pi");
  await writeFile(
    executable,
    `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
const skills = args.flatMap((arg, index) => arg === "--skill" ? [args[index + 1]] : []);
appendFileSync(path.join(${JSON.stringify(root)}, "fake.jsonl"), JSON.stringify({ cwd: process.cwd() }) + "\\n");
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
  usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } },
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

/** A/A/B: `same` is identical to the reference, `changed` adds the target skill. */
function threeArmGroup(changes = {}) {
  return {
    schema_version: 2,
    kind: "group",
    id: "three-arms",
    type: "description",
    input: { prompt: "How should I ship this change?" },
    fixture: null,
    tools: ["read"],
    configuration: {
      host: { name: "pi" },
      subject: { kind: "skill", source: { kind: "working-tree" }, skills: [], target: null, context: [] },
    },
    arms: { baseline: {}, same: {}, changed: { subject: { skills: ["skills/release-route"], target: 0 } } },
    component: ["subject.skills", "subject.target"],
    expectations: ARMS.map((arm) => ({
      id: `${arm}-read`,
      kind: "skill-read",
      variant: arm,
      expect: "by-turn",
      turn: 1,
      comparison: "target-read",
    })),
    review_questions: [],
    ...changes,
  };
}

function runCli(root, bin, args, { preload = null } = {}) {
  if (args[0] === "run") args = [...args, "--uncommitted"];
  return spawnSync(
    process.execPath,
    [
      ...(preload === null ? [] : ["--import", preload]),
      entrypoint,
      ...args,
      ...(args[0] === "run" && !args.includes("--jobs") ? ["--jobs", "1"] : []),
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        SKILL_EVAL_CREDENTIALS_DIR: path.join(root, "no-credentials"),
      },
    },
  );
}

async function spawnCount(root) {
  return (await readFile(path.join(root, "fake.jsonl"), "utf8")).split("\n").filter(Boolean).length;
}

test("a three-arm A/A/B group loads with the reference first and refuses what it does not declare", async () => {
  await withTempDirectory(async (root) => {
    const loaded = await loadDefinition(await writeJson(path.join(root, "aab.json"), threeArmGroup()), { root });
    assert.deepEqual(Object.keys(loaded.variants), ARMS);
    assert.deepEqual(Object.keys(loaded.configurations), ARMS);
    assert.deepEqual(loaded.variants.baseline, loaded.variants.same);

    // The reference may be any arm; it is listed first.
    const bySame = await loadDefinition(
      await writeJson(path.join(root, "by-same.json"), threeArmGroup({ reference: "same" })),
      { root },
    );
    assert.deepEqual(Object.keys(bySame.variants), ["same", "baseline", "changed"]);

    const refusals = [
      [
        "an undeclared difference in a third arm",
        { arms: { ...threeArmGroup().arms, same: { model: { model: "fake/model", thinking: "high" } } } },
        {
          code: "undeclared-difference",
          message: "arm same differs from baseline in model, which group.component does not declare",
        },
      ],
      [
        "a component path that differs in no arm",
        { component: ["subject.skills", "subject.target", "subject.context"] },
        {
          code: "undeclared-difference",
          message: "group.component declares subject.context, but no arm differs from baseline there",
        },
      ],
      [
        "a shared-only difference in a third arm",
        { arms: { ...threeArmGroup().arms, same: { host: { name: "pi", version: "9.9.9" } } } },
        { code: "unsupported-difference", message: /arm same differs from baseline in host.version/ },
      ],
      ["a reference that is not an arm", { reference: "other" }, { message: /group.reference must name one of/ }],
      // One arm is a measure group (allowed), but it cannot keep a comparison.
      [
        "a single arm with a comparison",
        { arms: { baseline: {} }, component: [] },
        { message: /comparison needs two arms/ },
      ],
      [
        "an arm name outside the pattern",
        { arms: { ...threeArmGroup().arms, Same: {} } },
        { message: /group.arms.Same must be named/ },
      ],
      [
        "a non-reference arm with skills and no target",
        {
          arms: { ...threeArmGroup().arms, changed: { subject: { skills: ["skills/release-route"] } } },
          component: ["subject.skills"],
        },
        {
          message:
            "group.arms.changed.subject.target must identify the changed target skill when changed skills are declared",
        },
      ],
      [
        "a description-only revision over three arms",
        {
          revision: "description-only",
          configuration: {
            host: { name: "pi" },
            subject: { kind: "skill", source: { kind: "working-tree" }, skills: ["skills/a"], target: 0, context: [] },
          },
          arms: { baseline: {}, same: {}, changed: { subject: { skills: ["skills/b"] } } },
          component: ["subject.skills"],
        },
        { message: "a description-only revision compares exactly two arms" },
      ],
    ];
    for (const [name, changes, expected] of refusals) {
      const file = await writeJson(path.join(root, `${name.replaceAll(" ", "-")}.json`), threeArmGroup(changes));
      await assert.rejects(loadDefinition(file, { root }), { name: "DefinitionError", ...expected }, name);
    }

    // An A/A/A group declares no component.
    const aaa = threeArmGroup({ arms: { baseline: {}, same: {}, again: {} }, component: [] });
    aaa.expectations = aaa.expectations.map((entry) =>
      entry.variant === "changed" ? { ...entry, id: "again-read", variant: "again" } : entry,
    );
    const loadedAaa = await loadDefinition(await writeJson(path.join(root, "aaa.json"), aaa), { root });
    assert.deepEqual(Object.keys(loadedAaa.variants), ["baseline", "same", "again"]);

    // --variant accepts any arm of the selected groups, and only those.
    assert.deepEqual(selectDefinition(loaded, { variant: "same" }).groups[0].variants, {
      baseline: "not-selected",
      same: "selected",
      changed: "not-selected",
    });
    assert.throws(() => selectDefinition(loaded, { variant: "candidate" }), {
      code: "invalid-selector",
      message: "variant candidate is not an arm of group three-arms",
    });
  });
});

test("a three-arm A/A/B group runs every arm and keys runs, grades, comparisons and the aggregate by arm", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installFakePi(root);
    await writeSkill(root);
    const definition = await writeJson(path.join(root, "groups/three-arms.json"), threeArmGroup());

    const result = runCli(root, bin, ["run", definition, "--trials", "2"]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout,
      /^Plan: 6 subjects \(1 group, 3 arms, 2 trials\); models: host default; uncommitted inputs$/m,
    );
    assert.equal(await spawnCount(root), 6);
    const trialDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    const summary = await readJson(path.join(trialDirectory, "summary.json"));
    assert.deepEqual(summary.groups[0].variants, { baseline: "complete", same: "complete", changed: "complete" });
    const groupDirectory = path.join(trialDirectory, "groups/three-arms");
    for (const arm of ARMS) {
      const run = await readJson(path.join(groupDirectory, arm, "run.json"));
      assert.equal(run.variant, arm);
      assert.equal(run.state, "complete");
      // The transcript scan is the only post-run hook that records for every run; the CLI always registers tracked
      // metrics.
      assert.deepEqual(run.postRun, { scan: { flags: [] } });
      assert.deepEqual(Object.keys(run.metrics), [
        "durationMs",
        "turns",
        "toolCalls",
        "toolErrors",
        "tokens",
        "cost",
        "cacheHitRate",
        "peakContext",
        "skillReads",
        "skillReadTokens",
      ]);
    }
    const grade = await readJson(path.join(groupDirectory, "deterministic-grade.json"));
    assert.deepEqual(Object.keys(grade.evidence), ARMS);
    assert.deepEqual(
      grade.checks.map(({ id, variant, state }) => ({ id, variant, state })),
      [
        { id: "baseline-read", variant: "baseline", state: "fail" },
        { id: "same-read", variant: "same", state: "fail" },
        { id: "changed-read", variant: "changed", state: "pass" },
      ],
    );
    assert.deepEqual(grade.comparisons, [
      {
        id: "target-read",
        kind: "skill-read",
        reference: "baseline",
        arms: {
          baseline: { check: "baseline-read", state: "fail" },
          same: { check: "same-read", state: "fail" },
          changed: { check: "changed-read", state: "pass" },
        },
        transitions: { same: "fail-to-fail", changed: "fail-to-pass" },
      },
    ]);

    const aggregateId = result.stdout.match(/^Aggregate: (.+)$/m)?.[1];
    const aggregate = await readJson(path.join(root, ".skill-eval/runs", aggregateId, "aggregate.json"));
    const [group] = aggregate.groups;
    assert.deepEqual(group.runStates, { baseline: { complete: 2 }, same: { complete: 2 }, changed: { complete: 2 } });
    assert.deepEqual(group.comparisons, [
      {
        id: "target-read",
        kind: "skill-read",
        reference: "baseline",
        arms: {
          baseline: { pass: 0, fail: 2, unavailable: 0 },
          same: { pass: 0, fail: 2, unavailable: 0 },
          changed: { pass: 2, fail: 0, unavailable: 0 },
        },
        outcomes: {
          same: {
            transitions: { "fail-to-fail": 2 },
            pairs: { "both-pass": 0, "both-fail": 2, "baseline-only": 0, "same-only": 0, incomplete: 0 },
          },
          changed: {
            transitions: { "fail-to-pass": 2 },
            pairs: { "both-pass": 0, "both-fail": 0, "baseline-only": 0, "changed-only": 2, incomplete: 0 },
          },
        },
      },
    ]);
    assert.equal(group.checks.find((check) => check.id === "changed-read").passAll, true);

    const viewed = runCli(root, bin, ["view", trialDirectory]);
    assert.equal(viewed.status, 0, viewed.stderr);
    for (const heading of ["Baseline [complete]", "Same [complete]", "Changed [complete]"]) {
      assert.ok(viewed.stdout.includes(heading), heading);
    }
    assert.ok(
      viewed.stdout.includes(
        "comparison\ttarget-read\tskill-read\tsame:fail-to-fail\tchanged:fail-to-pass\tbaseline=baseline-read:fail\tsame=same-read:fail\tchanged=changed-read:pass",
      ),
      viewed.stdout,
    );
    const one = runCli(root, bin, ["view", trialDirectory, "--variant", "same"]);
    assert.equal(one.status, 0, one.stderr);
    assert.match(one.stdout, /Same \[complete\]/);
    assert.doesNotMatch(one.stdout, /Baseline \[|Changed \[/);
    const aggregateView = runCli(root, bin, ["view", aggregateId]);
    assert.equal(aggregateView.status, 0, aggregateView.stderr);
    assert.ok(
      aggregateView.stdout.includes("comparison\ttarget-read\tskill-read\tbaseline=0/2\tsame=0/2\tchanged=2/2"),
      aggregateView.stdout,
    );
    assert.ok(
      aggregateView.stdout.includes(
        "comparison\ttarget-read\tchanged against baseline\tfail-to-pass=2\tpairs: changed-only=2",
      ),
      aggregateView.stdout,
    );

    // --variant runs one arm; the others are not selected.
    const selected = runCli(root, bin, ["run", definition, "--variant", "same"]);
    assert.equal(selected.status, 0, selected.stderr);
    assert.equal(await spawnCount(root), 7);
    const selectedSummary = await readJson(path.join(selected.stdout.match(/^Path: (.+)$/m)?.[1], "summary.json"));
    assert.deepEqual(selectedSummary.groups[0].variants, {
      baseline: "not-selected",
      same: "complete",
      changed: "not-selected",
    });
  });
});

test("post-run and run-metrics hooks land in run.json under postRun and metrics", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installFakePi(root);
    await writeSkill(root);
    const definition = await writeJson(path.join(root, "groups/three-arms.json"), threeArmGroup());
    const preload = path.join(root, "register-hooks.mjs");
    await writeFile(
      preload,
      `import { registerPostRunHook, registerRunMetricsHook } from ${JSON.stringify(hooksModule)};
registerPostRunHook("dummy", ({ arm, run, directory }) => ({ arm, state: run.state, directory }));
registerPostRunHook("broken", () => { throw new Error("hook failed"); });
registerRunMetricsHook("dummy", ({ arm, observation, run }) => ({ dummyArm: arm, dummySettled: observation.settled, dummyVariant: run.variant }));
`,
    );

    const result = runCli(root, bin, ["run", definition], { preload: pathToFileURL(preload).href });

    assert.equal(result.status, 0, result.stderr);
    const groupDirectory = path.join(result.stdout.match(/^Path: (.+)$/m)?.[1], "groups/three-arms");
    for (const arm of ARMS) {
      const run = await readJson(path.join(groupDirectory, arm, "run.json"));
      assert.equal(run.state, "complete");
      assert.deepEqual(run.postRun, {
        scan: { flags: [] },
        dummy: { arm, state: "complete", directory: path.join(groupDirectory, arm) },
        broken: { error: "hook failed" },
      });
      // The CLI's tracked metrics come first; a registered hook's fields are merged after them.
      const { dummyArm, dummySettled, dummyVariant } = run.metrics;
      assert.deepEqual(
        { dummyArm, dummySettled, dummyVariant },
        { dummyArm: arm, dummySettled: true, dummyVariant: arm },
      );
      assert.equal(typeof run.metrics.durationMs, "number");
    }
  });
});

test("an aggregator's section lands on the aggregate group entry, built from each trial's grade and runs", async () => {
  await withTempDirectory(async (root) => {
    const trials = [];
    for (const [index, sameState] of ["complete", "infrastructure-failed"].entries()) {
      const trial = path.join(root, `trial-${index + 1}`);
      const groupDirectory = path.join(trial, "groups/three-arms");
      await writeJson(path.join(groupDirectory, "definition.json"), {
        id: "three-arms",
        reference: "same",
        expectations: [],
      });
      await writeJson(path.join(groupDirectory, "deterministic-grade.json"), {
        state: "complete",
        checks: [],
        comparisons: [],
      });
      for (const arm of ARMS) {
        await writeJson(path.join(groupDirectory, arm, "run.json"), {
          variant: arm,
          state: arm === "same" ? sameState : "complete",
        });
      }
      trials.push({
        id: `t${index + 1}`,
        path: trial,
        summary: {
          groups: [
            {
              id: "three-arms",
              state: "complete",
              variants: { baseline: "complete", same: sameState, changed: "complete" },
              artifacts: { grade: "deterministic-grade.json" },
            },
          ],
        },
      });
    }
    assert.throws(() => registerAggregator("checks", () => ({})), /not reserved/);
    const unregister = registerAggregator("dummy", ({ id, arms, reference, trials: perTrial }) => ({
      id,
      arms,
      reference,
      trials: perTrial.map((trial) => ({ id: trial.id, grade: trial.grade.state, same: trial.runs.same.state })),
    }));
    try {
      const [group] = await aggregateGroups(trials);
      assert.deepEqual(group.dummy, {
        id: "three-arms",
        arms: ARMS,
        reference: "same",
        trials: [
          { id: "t1", grade: "complete", same: "complete" },
          { id: "t2", grade: "complete", same: "infrastructure-failed" },
        ],
      });
    } finally {
      unregister();
    }
    const [plain] = await aggregateGroups(trials);
    assert.equal(Object.hasOwn(plain, "dummy"), false);
  });
});

test("an unreadable grade or a per-check grade error counts as unavailable, so pass^k covers every trial", async () => {
  await withTempDirectory(async (root) => {
    const check = (id, state) => ({ id, variant: "candidate", kind: "file-text", state });
    const comparison = {
      id: "found",
      kind: "file-text",
      baseline: { check: "baseline-found", state: "pass" },
      candidate: { check: "candidate-found", state: "pass" },
      transition: "pass-to-pass",
    };
    const grades = [
      {
        checks: [check("candidate-found", "pass"), check("candidate-other", "pass")],
        comparisons: [comparison],
        errors: [],
      },
      // This trial's grade cannot be read at all.
      null,
      // This trial could not grade one check; the other still passed.
      {
        checks: [check("candidate-other", "pass")],
        comparisons: [],
        errors: [{ id: "candidate-found", reason: "workspace evidence changed after capture" }],
      },
    ];
    const trials = [];
    for (const [index, grade] of grades.entries()) {
      const groupDirectory = path.join(root, `trial-${index + 1}`, "groups/review");
      await mkdir(groupDirectory, { recursive: true });
      if (index === 0) {
        // The definition declares a third check that never graded in any trial.
        await writeJson(path.join(groupDirectory, "definition.json"), {
          id: "review",
          expectations: [
            { id: "candidate-found", kind: "file-text", variant: "candidate" },
            { id: "candidate-other", kind: "file-text", variant: "candidate" },
            { id: "candidate-never", kind: "file-text", variant: "candidate" },
          ],
        });
      }
      const gradeFile = path.join(groupDirectory, "deterministic-grade.json");
      if (grade === null) await writeFile(gradeFile, "{not json");
      else await writeJson(gradeFile, grade);
      trials.push({
        path: path.join(root, `trial-${index + 1}`),
        summary: { groups: [{ id: "review", artifacts: { grade: "deterministic-grade.json" } }] },
      });
    }

    const [group] = await aggregateGroups(trials);

    assert.equal(group.unreadableGrades, 1);
    assert.equal(group.gradeErrors, 1);
    const byId = Object.fromEntries(group.checks.map((entry) => [entry.id, entry]));
    assert.deepEqual(Object.keys(byId), ["candidate-found", "candidate-other", "candidate-never"]);
    const counts = ({ pass, fail, unavailable, trials: k, passAll }) => ({ pass, fail, unavailable, k, passAll });
    // Passed in every trial that graded it, but it ran three times: pass^3 is not met.
    assert.deepEqual(counts(byId["candidate-found"]), { pass: 1, fail: 0, unavailable: 2, k: 3, passAll: false });
    assert.deepEqual(counts(byId["candidate-other"]), { pass: 2, fail: 0, unavailable: 1, k: 3, passAll: false });
    assert.deepEqual(counts(byId["candidate-never"]), { pass: 0, fail: 0, unavailable: 3, k: 3, passAll: false });
    // A two-arm comparison keeps its original shape, with the missing trials counted as incomplete.
    assert.deepEqual(group.comparisons, [
      {
        id: "found",
        kind: "file-text",
        baseline: { pass: 1, fail: 0, unavailable: 2 },
        candidate: { pass: 1, fail: 0, unavailable: 2 },
        transitions: { "pass-to-pass": 1, unavailable: 2 },
        pairs: { "both-pass": 1, "both-fail": 0, "baseline-only": 0, "candidate-only": 0, incomplete: 2 },
      },
    ]);
  });
});

const RESULT_ID = "20261012000000-a4a4a4a4";
const QUESTION = "Did the run name a rollback step?";
// Each arm's response carries the answer the fake reviewer gives it, so a correct mapping back is checkable.
const MARKS = { baseline: "yes", same: "no", changed: "unclear" };

async function writeThreeArmResult(root) {
  const resultDirectory = path.join(root, ".skill-eval/runs", RESULT_ID);
  const groupDirectory = path.join(resultDirectory, "groups/release-plan");
  await writeJson(path.join(resultDirectory, "summary.json"), {
    schema_version: 1,
    id: RESULT_ID,
    state: "complete",
    definitionKind: "group",
    groups: [
      {
        id: "release-plan",
        position: 1,
        state: "complete",
        variants: { baseline: "complete", same: "complete", changed: "complete" },
        grade: "complete",
        artifacts: { grade: "deterministic-grade.json", group: "group.json" },
        errors: [],
      },
    ],
  });
  await writeJson(path.join(groupDirectory, "definition.json"), {
    id: "release-plan",
    type: "body",
    input: { prompt: "Prepare this change for release." },
    expectations: [],
    review_questions: [QUESTION],
  });
  await writeJson(path.join(groupDirectory, "deterministic-grade.json"), {
    state: "complete",
    checks: [],
    comparisons: [],
    errors: [],
  });
  for (const arm of ARMS) {
    await writeJson(path.join(groupDirectory, arm, "run.json"), {
      variant: arm,
      state: "complete",
      evaluationType: "body",
      response: `Plan written. MARK-${MARKS[arm]}`,
      toolActivity: [],
      effects: { changes: { created: [], modified: [], deleted: [] } },
    });
  }
  return groupDirectory;
}

/** A reviewer that answers each Run section with the mark it finds there, optionally leaving labels out. */
async function installMarkReviewer(root) {
  const bin = path.join(root, "bin");
  await mkdir(bin, { recursive: true });
  const executable = path.join(bin, "pi");
  await writeFile(
    executable,
    `#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";
const config = JSON.parse(readFileSync(new URL("./fake-review.json", import.meta.url), "utf8"));
const prompt = process.argv.at(-1);
appendFileSync(config.log, JSON.stringify({ prompt }) + "\\n");
const answer = { question: 1, rationale: "the run's mark" };
const sections = prompt.split(/^## Run ([A-Z]+)$/m);
for (let index = 1; index < sections.length; index += 2) {
  const mark = /MARK-(yes|no|unclear)/.exec(sections[index + 1]);
  if (!config.omit.includes(sections[index])) answer[sections[index]] = mark ? mark[1] : "unclear";
}
const message = {
  role: "assistant",
  content: [{ type: "text", text: JSON.stringify({ answers: [answer] }) }],
  provider: "fake",
  model: "reviewer",
  usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } },
  stopReason: "stop",
};
process.stdout.write(JSON.stringify({ type: "message_end", message }) + "\\n");
process.stdout.write(JSON.stringify({ type: "agent_settled" }) + "\\n");
`,
  );
  await chmod(executable, 0o755);
  return bin;
}

function review(root, bin, args, { omit = [] } = {}) {
  writeFileSync(path.join(bin, "fake-review.json"), JSON.stringify({ log: path.join(root, "review.jsonl"), omit }));
  return runCli(root, bin, ["review", RESULT_ID, "--model", "reviewer/model", ...args]);
}

test("review labels three runs A, B and C in a random order and maps every answer back to its arm", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installMarkReviewer(root);
    const groupDirectory = await writeThreeArmResult(root);
    const orders = new Set();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const result = review(root, bin, ["--swap"]);
      assert.equal(result.status, 0, result.stderr);
      const semantic = await readJson(path.join(groupDirectory, "semantic-grade.json"));
      assert.equal(semantic.state, "complete");
      assert.deepEqual(Object.keys(semantic.labels), ["A", "B", "C"]);
      assert.deepEqual(new Set(Object.values(semantic.labels)), new Set(ARMS));
      orders.add(Object.values(semantic.labels).join(","));
      // The swap uses the reversed order.
      assert.deepEqual(Object.values(semantic.swap.labels), Object.values(semantic.labels).reverse());
      assert.deepEqual(semantic.answers, [{ question: QUESTION, ...MARKS, rationale: "the run's mark" }]);
      assert.deepEqual(semantic.swap.answers, semantic.answers);
      assert.deepEqual(semantic.swap.agreement, {
        agreed: 1,
        questions: 1,
        arms: Object.fromEntries(ARMS.map((arm) => [arm, { agreed: 1, questions: 1 }])),
      });
    }
    assert.ok(orders.size > 1, `ten reviews used one order: ${[...orders]}`);

    const prompt = JSON.parse((await readFile(path.join(root, "review.jsonl"), "utf8")).split("\n")[0]).prompt;
    assert.match(prompt, /^You are reviewing three anonymous runs, Run A, Run B and Run C, of the same agent task\./);
    assert.match(prompt, /Answer every question for every run with yes, no, or unclear\./);
    assert.ok(prompt.includes('{"question":1,"A":"yes|no|unclear","B":"yes|no|unclear","C":"yes|no|unclear"'));
    // Arm names never reach the judge ("same" is avoided here only because the prompt itself says "the same task").
    assert.doesNotMatch(prompt, /baseline|changed/i);

    const viewed = runCli(root, bin, ["view", RESULT_ID]);
    assert.equal(viewed.status, 0, viewed.stderr);
    assert.ok(
      viewed.stdout.includes("review\tQ1\tbaseline=yes\tsame=no\tchanged=unclear\tthe run's mark"),
      viewed.stdout,
    );
    assert.ok(viewed.stdout.includes("judge\torder swap agreed per arm: baseline=1/1 same=1/1 changed=1/1"));

    // Every question needs an answer for every label.
    const missing = review(root, bin, [], { omit: ["C"] });
    assert.equal(missing.status, 1);
    const semantic = await readJson(path.join(groupDirectory, "semantic-grade.json"));
    assert.equal(semantic.state, "review-error");
    assert.deepEqual(semantic.errors, ["reviewer answer for question 1 is missing or invalid"]);
  });
});
