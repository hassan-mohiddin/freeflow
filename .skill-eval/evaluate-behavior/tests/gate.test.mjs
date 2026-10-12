import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { exitCode, globPattern, loadGate, matchEntries, suiteVerdict } from "../../scripts/gate.mjs";
import { loadDefinition } from "../../../skills/evaluate-behavior/scripts/lib/definitions.mjs";
import { applySourceOverrides } from "../../../skills/evaluate-behavior/scripts/lib/source-override.mjs";
import { toV2 } from "./helpers/to-v2.mjs";

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const gateScript = fileURLToPath(new URL("../../scripts/gate.mjs", import.meta.url));
const MODEL = { model: "anthropic/claude-haiku-5-5", thinking: "medium" };

async function withTempDirectory(run) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "skill-eval-gate-test-")));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function write(file, contents) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, typeof contents === "string" ? contents : `${JSON.stringify(toV2(contents), null, 2)}\n`);
  return file;
}

test("globs match repository paths: ** crosses directories, * stays within one", () => {
  assert.ok(globPattern("skills/review-work/**").test("skills/review-work/SKILL.md"));
  assert.ok(globPattern("skills/review-work/**").test("skills/review-work/references/judge-contract.md"));
  assert.ok(!globPattern("skills/review-work/**").test("skills/review-workflow/SKILL.md"));
  assert.ok(globPattern("skills/*/SKILL.md").test("skills/write-skill/SKILL.md"));
  assert.ok(!globPattern("skills/*/SKILL.md").test("skills/write-skill/references/x.md"));
  assert.ok(globPattern("**/*.json").test("a/b/c.json"));
  assert.ok(globPattern("**/*.json").test("c.json"));
  assert.ok(globPattern(".skill-eval/gate.json").test(".skill-eval/gate.json"));
  assert.ok(!globPattern(".skill-eval/gate.json").test(".skill-eval/gateXjson"));
});

test("changed paths map to the entries that cover them; uncovered paths are listed", () => {
  const entries = [
    { paths: ["skills/review-work/**"], suite: "review.json", trials: 3 },
    { paths: ["skills/write-skill/**", "skills/evaluate-behavior/**"], suite: "family.json", trials: 3 },
  ];
  const { matched, uncovered } = matchEntries(entries, [
    "skills/evaluate-behavior/scripts/lib/runner.mjs",
    "README.md",
    "skills/evaluate-behavior/SKILL.md",
  ]);
  assert.deepEqual(
    matched.map((entry) => [entry.suite, entry.matched]),
    [["family.json", ["skills/evaluate-behavior/scripts/lib/runner.mjs", "skills/evaluate-behavior/SKILL.md"]]],
  );
  assert.deepEqual(uncovered, ["README.md"]);
});

test("the repository's gate suites measure base against head on Git-sourced arms, with no held-out case", async () => {
  const gate = await loadGate(repository);
  assert.deepEqual(gate.model, MODEL);
  assert.deepEqual(
    gate.entries.map((entry) => [entry.suite, entry.trials, entry.arms]),
    ["review-work", "write-skill", "evaluate-behavior"].map((name) => [
      `.skill-eval/gate/${name}/suite.json`,
      1,
      { base: "base", head: "head" },
    ]),
  );
  const heldOut = new Set(
    JSON.parse(await readFile(path.join(repository, ".skill-eval/review-suite/groups.json"), "utf8"))
      .groups.filter((group) => group.held_out || group.clean_excluded)
      .map((group) => group.id),
  );
  for (const entry of gate.entries) {
    const suite = await loadDefinition(path.join(repository, entry.suite), { root: repository });
    for (const group of suite.groups) {
      assert.deepEqual(Object.keys(group.variants), ["base", "head"], group.id);
      assert.ok(!heldOut.has(group.id), `${group.id} is held out or excluded`);
      // The skill family's held-out groups are positions 3, 6 and 9: v1-c, w1-c and w2-b.
      assert.ok(!/^(v1-c|w1-c|w2-b)-/.test(group.id), `${group.id} is held out`);
      assert.deepEqual(group.variants.base.skills, group.variants.head.skills);
    }
    // Both arms take a commit: the overrides apply without refusal.
    assert.doesNotThrow(() =>
      applySourceOverrides({ groups: suite.groups.map((group) => ({ group })) }, { base: "abc1234", head: "def5678" }),
    );
  }
});

test("a gate declaration with an unknown field, bad trials or a scheduling override is refused", async () => {
  await withTempDirectory(async (root) => {
    const entry = { paths: ["a/**"], suite: "s.json", trials: 3 };
    const cases = [
      [{ ...entry, extra: 1 }, /unsupported field extra/],
      [{ ...entry, trials: 0 }, /trials must be a positive integer/],
      [
        {
          ...entry,
          decision: {
            measure: { comparison: "x" },
            arms: ["baseline", "candidate"],
            direction: "higher",
            trials: { initial: 1, max: 2, step: 1 },
          },
        },
        /cannot declare trials/,
      ],
    ];
    for (const [value, expected] of cases) {
      await write(path.join(root, ".skill-eval/gate.json"), { schema_version: 1, model: MODEL, entries: [value] });
      await assert.rejects(loadGate(root), expected);
    }
  });
});

const counts = (pass, fail, unavailable = 0) => ({ pass, fail, unavailable });
const aggregateWith = (comparisons, extra = {}) => ({
  groups: [{ id: "g", comparisons }],
  claim: { class: "rate-on-suite" },
  ...extra,
});

test("verdicts: decisions and comparisons give pass, regressed or undecided", () => {
  const classic = (baseline, candidate) => ({ id: "c", baseline, candidate });
  assert.equal(suiteVerdict(aggregateWith([classic(counts(1, 2), counts(3, 0))])).verdict, "pass");
  assert.equal(suiteVerdict(aggregateWith([classic(counts(3, 0), counts(3, 0))])).verdict, "pass");
  assert.equal(suiteVerdict(aggregateWith([classic(counts(3, 0), counts(2, 1))])).verdict, "regressed");
  assert.equal(suiteVerdict(aggregateWith([classic(counts(2, 0, 1), counts(2, 0, 1))])).verdict, "undecided");
  assert.equal(suiteVerdict(aggregateWith([])).verdict, "undecided");
  const named = { id: "c", reference: "same", arms: { same: counts(2, 0), changed: counts(1, 1) }, outcomes: {} };
  assert.equal(suiteVerdict(aggregateWith([named])).verdict, "regressed");

  const decision = (verdict) => ({ verdict, better: 1, worse: 9, ties: 0, p: 0.02 });
  assert.equal(
    suiteVerdict(aggregateWith([], { decision: decision("worse"), claim: { class: "worse" } })).verdict,
    "regressed",
  );
  assert.equal(
    suiteVerdict(aggregateWith([], { decision: decision("no-difference-shown"), claim: { class: "x" } })).verdict,
    "pass",
  );
  assert.equal(
    suiteVerdict(aggregateWith([], { decision: decision("beats"), claim: { class: "none", reason: "dry run" } }))
      .verdict,
    "undecided",
  );
  // "none" reads comparisons even when the suite declared a decision.
  const regressedComparison = aggregateWith([classic(counts(3, 0), counts(0, 3))], {
    decision: decision("no-difference-shown"),
  });
  assert.equal(suiteVerdict(regressedComparison, "none").verdict, "regressed");
  // An override decides from the aggregate's groups.
  const override = {
    measure: { comparison: "c" },
    arms: ["baseline", "candidate"],
    direction: "higher",
    method: "sign-test",
    alpha: 0.05,
    min_cases: 1,
  };
  assert.match(suiteVerdict(regressedComparison, override).detail, /^no-difference-shown: better 0, worse 1/);

  // A judged yes/no dimension reads like a comparison, against the comparisons' reference arm.
  const judgedGroup = (base, head) => ({
    groups: [
      {
        id: "rv02-b",
        comparisons: [{ id: "c", reference: "base", arms: { base: counts(1, 0), head: counts(1, 0) }, outcomes: {} }],
        judged: { arms: { base: { identified: base }, head: { identified: head } } },
      },
    ],
    claim: { class: "rate-on-suite" },
  });
  const judged = (yes, notJudged = 0) => ({ yes, no: 1 - yes - notJudged, unknown: 0, notJudged, trials: 1 });
  assert.deepEqual(suiteVerdict(judgedGroup(judged(1), judged(0))), {
    verdict: "regressed",
    detail: "rv02-b/judged identified: head 0 < base 1",
  });
  assert.equal(suiteVerdict(judgedGroup(judged(1), judged(1))).verdict, "pass");
  assert.equal(suiteVerdict(judgedGroup(judged(0, 1), judged(0, 1))).verdict, "undecided");

  assert.equal(exitCode([{ verdict: "pass" }, { verdict: "undecided" }]), 0);
  assert.equal(exitCode([{ verdict: "pass" }, { verdict: "infrastructure" }]), 2);
  assert.equal(exitCode([{ verdict: "infrastructure" }, { verdict: "regressed" }]), 1);
});

// ----- End to end, against the fake provider in a scratch repository -----

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
appendFileSync(${JSON.stringify(path.join(root, "fake.jsonl"))}, "start\\n");
if (String(args.at(-1)).includes("BROKEN")) process.exit(3);
const skills = args.flatMap((arg, index) => arg === "--skill" ? [args[index + 1]] : []);
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
  usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: { total: 0.01 } },
  stopReason: "stop",
} });
emit({ type: "agent_settled" });
`,
  );
  await chmod(executable, 0o755);
  return bin;
}

/** A group whose `reads` arm is given the skill (and so passes target-read) and whose other arm is not. */
function group(id, skill, { reads = "candidate", prompt = "How should I ship this change?", model = MODEL } = {}) {
  const withSkill = { source: { kind: "working-tree" }, skills: [skill], target: 0, context: [] };
  const without = { source: { kind: "working-tree" }, skills: [], target: null, context: [] };
  return {
    schema_version: 1,
    kind: "group",
    id,
    type: "description",
    input: { prompt },
    fixture: null,
    tools: ["read"],
    ...(model === null ? {} : { model }),
    variants: {
      baseline: reads === "baseline" ? withSkill : without,
      candidate: reads === "candidate" ? withSkill : without,
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
    runtime: { host: "pi", session: false, extensions: [], environment: { literal: {}, inherit: [] } },
  };
}

async function writeSkill(root, name, body = "# Skill\n") {
  await write(
    path.join(root, "skills", name, "SKILL.md"),
    `---\nname: ${name}\ndescription: Use when ${name}.\n---\n\n${body}`,
  );
}

async function writeSuite(root, name, groups) {
  for (const entry of groups) await write(path.join(root, ".skill-eval", name, "groups", `${entry.id}.json`), entry);
  return write(path.join(root, ".skill-eval", name, "suite.json"), {
    schema_version: 2,
    kind: "suite",
    id: name,
    groups: groups.map((entry) => `groups/${entry.id}.json`),
  });
}

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function commit(root, message) {
  git(root, "add", "-A");
  git(root, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", message);
  return git(root, "rev-parse", "HEAD");
}

async function scratchRepository(root, { passGroups, regressGroups }) {
  git(root, "init", "-q");
  await write(path.join(root, ".gitignore"), ".skill-eval/runs/\nbin/\nfake.jsonl\nno-credentials/\n");
  await writeSkill(root, "ship-route");
  await writeSkill(root, "other-route");
  await writeSuite(root, "pass-suite", passGroups);
  await writeSuite(root, "regress-suite", regressGroups);
  const pass = { paths: ["skills/ship-route/**"], suite: ".skill-eval/pass-suite/suite.json", trials: 2 };
  const regress = { paths: ["skills/other-route/**"], suite: ".skill-eval/regress-suite/suite.json", trials: 2 };
  await write(path.join(root, ".skill-eval/gate.json"), { schema_version: 1, model: MODEL, entries: [pass, regress] });
  await write(path.join(root, ".skill-eval/gate-pass.json"), { schema_version: 1, model: MODEL, entries: [pass] });
  const base = commit(root, "base");
  await writeSkill(root, "ship-route", "# Skill, revised\n");
  await writeSkill(root, "other-route", "# Other, revised\n");
  await write(path.join(root, "notes.txt"), "uncovered\n");
  commit(root, "change");
  return base;
}

function runGate(root, bin, args) {
  return spawnSync(process.execPath, [gateScript, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      SKILL_EVAL_CREDENTIALS_DIR: path.join(root, "no-credentials"),
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
    },
  });
}

async function starts(root) {
  return (await readFile(path.join(root, "fake.jsonl"), "utf8").catch(() => "")).split("\n").filter(Boolean).length;
}

test("--dry-run-plan prints the matched suites and starts nothing", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installFakePi(root);
    const base = await scratchRepository(root, {
      passGroups: [group("p1", "skills/ship-route"), group("p2", "skills/ship-route")],
      regressGroups: [group("r1", "skills/other-route", { reads: "baseline" })],
    });
    const result = runGate(root, bin, ["--base", base, "--dry-run-plan"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /^Gate since [0-9a-f]+: 3 changed paths, 2 suites$/m);
    assert.match(
      result.stdout,
      /^Suite \.skill-eval\/pass-suite\/suite\.json: 2 groups, 2 trials, 8 subjects; reuse up to 0; models anthropic\/claude-haiku-5-5 \(medium\); verdict from comparisons$/m,
    );
    assert.match(result.stdout, /^Suite \.skill-eval\/regress-suite\/suite\.json: 1 groups, 2 trials, 4 subjects;/m);
    assert.match(result.stdout, /^Not covered by any suite \(1\): notes\.txt$/m);
    assert.equal(await starts(root), 0);
  });
});

test("the gate runs matched suites end to end: pass exits 0, a regression exits 1, and reuse carries over", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installFakePi(root);
    const base = await scratchRepository(root, {
      passGroups: [group("p1", "skills/ship-route")],
      regressGroups: [group("r1", "skills/other-route", { reads: "baseline" })],
    });

    const passing = runGate(root, bin, ["--base", base, "--gate", ".skill-eval/gate-pass.json"]);
    assert.equal(passing.status, 0, passing.stdout + passing.stderr);
    assert.match(
      passing.stdout,
      /^PASS \.skill-eval\/pass-suite\/suite\.json \(aggregate \S+, cost 0\.04\): 1 comparisons, none passed less often$/m,
    );
    assert.equal(await starts(root), 4);

    const both = runGate(root, bin, ["--base", base, "--jobs", "2"]);
    assert.equal(both.status, 1, both.stdout + both.stderr);
    // The pass suite's two trials come from the first gate run's index: nothing new runs and it costs nothing.
    assert.match(both.stdout, /reuse up to 4/);
    assert.match(both.stdout, /^PASS \.skill-eval\/pass-suite\/suite\.json \(aggregate \S+, cost 0, 4 reused\)/m);
    assert.match(
      both.stdout,
      /^REGRESSED \.skill-eval\/regress-suite\/suite\.json \(aggregate \S+, cost 0\.04\): r1\/target-read: candidate 0 < baseline 2$/m,
    );
    assert.equal(await starts(root), 8);
  });
});

test("the gate refuses an arm without a model and reports a pilot stop as infrastructure", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installFakePi(root);
    const base = await scratchRepository(root, {
      passGroups: [group("p1", "skills/ship-route", { model: null })],
      regressGroups: [group("r1", "skills/other-route", { prompt: "BROKEN" })],
    });
    const refused = runGate(root, bin, ["--base", base]);
    assert.equal(refused.status, 2);
    assert.match(
      refused.stdout,
      /^Gate refused: \.skill-eval\/pass-suite\/suite\.json: arms without a model \(p1\/baseline, p1\/candidate\); declare the gate's default anthropic\/claude-haiku-5-5 \(medium\)/m,
    );
    assert.equal(await starts(root), 0);

    // Only the broken suite: --base at a commit after the pass suite's change.
    await writeSkill(root, "other-route", "# Other, revised again\n");
    const before = commit(root, "touch other");
    await writeSkill(root, "other-route", "# Other, third\n");
    commit(root, "touch other again");
    const broken = runGate(root, bin, ["--base", before]);
    assert.equal(broken.status, 2, broken.stdout + broken.stderr);
    assert.match(
      broken.stdout,
      /^INFRASTRUCTURE \.skill-eval\/regress-suite\/suite\.json \(aggregate -, cost -\): stopped by the pilot: r1: arm baseline is infrastructure-failed; .*no arm passed target-read/m,
    );
  });
});
