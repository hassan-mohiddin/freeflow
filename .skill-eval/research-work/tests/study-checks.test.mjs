// Checks on a study's plan and runs: the method a confirmatory rule names is the one that computed its result, a
// model that labels the data counts as a judge, the arms compared get the same budget, a validity check that fails
// holds the analysis, the contamination routes are recorded, and weighted kappa reports raw agreement beside it.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { skeleton, validate } from "../../../skills/research-work/scripts/lib/formats.mjs";
import { weightedKappa } from "../../../skills/research-work/scripts/lib/stats.mjs";

const SCRIPTS = fileURLToPath(new URL("../../../skills/research-work/scripts/", import.meta.url));
const node = (script, ...args) => spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { encoding: "utf8" });

const QUESTIONS = [
  "The claim",
  "Who uses it",
  "The prediction",
  "Compared to what",
  "The unit and the count",
  "Validity",
  "Reliability",
  "Raw outputs first",
  "Rival explanations",
  "The interval",
  "Fixed before the data",
  "Where it holds",
];

/** A study-rigor plan with every section filled; each option replaces one section. */
function planText({
  method = "paired mcnemar",
  runs = "| t1 | a | 1 | 20 prompt edits, 1M tokens |\n| t1 | b | 1 | 20 prompt edits, 1M tokens |",
  models = "none",
  contamination = null,
} = {}) {
  const questions = QUESTIONS.map(
    (name, index) =>
      `## ${index + 1}. ${name}\n\n${index === 2 ? "Pass rate; power mcnemar-cases sized it at 80 tasks." : "Answered before any data."}\n`,
  ).join("\n");
  const routes = ["training data", "prompts and examples", "tuning", "tools and web", "grader and harness"];
  return `# Study Plan: Two prompts

> **Type:** Study Plan
> **Status:** Draft
> **Owner:** Hassan Mohiddin
> **Rigor:** study

${questions}
## Hypotheses

| ID | Hypothesis | Kind | Metric | Decision rule | Method |
| --- | --- | --- | --- | --- | --- |
| C1 | Prompt b passes more tasks | confirmatory | pass rate | exact McNemar, p < 0.05 | ${method} |

## Planned runs

| Unit | Arm | Trials | Budget |
| --- | --- | --- | --- |
${runs}

## Analysis variants

none

## Models in the method

${models}

## Contamination

${contamination ?? `| Route | Control |\n| --- | --- |\n${routes.map((route) => `| ${route} | unknown |`).join("\n")}`}

## Amendments

none
`;
}

const problems = (text) => validate("study-plan", text).problems;

test("a confirmatory hypothesis names the method that computes its rule, or how it is computed", () => {
  assert.deepEqual(problems(planText()), []);
  assert.deepEqual(problems(planText({ method: "computed: the coverage summed over every outcome" })), []);
  for (const method of ["-", "McNemar", "<method>"])
    assert.ok(
      problems(planText({ method })).some((problem) => problem.includes("Method names the stats.mjs family")),
      method,
    );
});

test("the arms compared get the same budget, a control arm excepted", () => {
  const runs = (b, c = "control") =>
    `| t1 | a | 1 | 20 prompt edits |\n| t1 | b | 1 | ${b} |\n| t1 | nothing | 1 | ${c} |`;
  assert.deepEqual(problems(planText({ runs: runs("20 prompt edits") })), []);
  assert.ok(
    problems(planText({ runs: runs("100 prompt edits") })).some((problem) => problem.includes("different budgets")),
  );
  assert.ok(problems(planText({ runs: runs("-") })).some((problem) => problem.includes("Budget must say the tuning")));
});

test("the contamination table records every route, each with its control or unknown", () => {
  const table = (rows) => `| Route | Control |\n| --- | --- |\n${rows.join("\n")}`;
  const missing = problems(
    planText({ contamination: table(["| training data | unknown |", "| tuning | tuned on t1-t20 only |"]) }),
  );
  assert.ok(missing.some((problem) => problem.includes('no row for "prompts and examples"')));
  const extra = problems(
    planText({
      contamination: table([
        "| training data | unknown |",
        "| prompts and examples | none of the test items appear in a prompt |",
        "| tuning | unknown |",
        "| tools and web | no network during runs |",
        "| grader and harness | the grader sees no expected answer |",
        "| vibes | unknown |",
      ]),
    }),
  );
  assert.ok(extra.some((problem) => problem.includes('"vibes" is not one of')));
  assert.ok(
    problems(planText({ contamination: table(["| training data | - |"]) })).some((problem) =>
      problem.includes("Control must say"),
    ),
  );
});

test("the plan skeleton asks for the method, the budget, the contamination routes and the sources of variance", () => {
  const text = skeleton("study-plan", { title: "T", owner: "O", rigor: "study" });
  assert.match(text, /\| ID \| Hypothesis \| Kind \| Metric \| Decision rule \| Method \|/);
  assert.match(text, /\| Unit \| Arm \| Trials \| Budget \|/);
  assert.match(text, /## Contamination/);
  assert.match(text, /prompt format and wording, seeds and sampling/);
  assert.match(text, /the baseline's number reproduced here beside its published one/);
});

/**
 * A locked plan, its results and a register claiming C1. Each result is computed through a study receipt running
 * stats.mjs (`family` and `input`), or written by a receipt running another command (`json`), or written by hand
 * with no receipt (`hand`).
 */
function study({ method = "paired mcnemar", models = "none", results, numbers = "0.0215", source } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "research-study-checks-"));
  const plan = join(dir, "plan.md");
  writeFileSync(plan, planText({ method, models }));
  const lock = node("study.mjs", "lock", plan, "--by", "Hassan Mohiddin, 'yes' (2026-10-28)");
  assert.equal(lock.status, 0, lock.stderr);
  mkdirSync(join(dir, "results"));
  const all = results ?? [{ name: "c1", family: "paired", input: { method: "mcnemar", armOnly: 9, referenceOnly: 1 } }];
  for (const result of all) {
    const out = join(dir, "results", `${result.name}.json`);
    if (result.hand) {
      writeFileSync(out, JSON.stringify(result.hand));
      continue;
    }
    if (result.json) {
      const script = `require("fs").writeFileSync(${JSON.stringify(out)}, ${JSON.stringify(JSON.stringify(result.json))})`;
      assert.equal(node("study.mjs", "run", plan, "--output", out, "--", process.execPath, "-e", script).status, 0);
      continue;
    }
    const input = join(dir, `in-${result.name}.json`);
    writeFileSync(input, JSON.stringify(result.input));
    const run = node(
      "study.mjs",
      "run",
      plan,
      "--input",
      input,
      "--output",
      out,
      "--",
      process.execPath,
      join(SCRIPTS, "stats.mjs"),
      result.family,
      "--input",
      input,
      "--out",
      out,
    );
    assert.equal(run.status, 0, run.stderr);
  }
  writeFileSync(
    join(dir, "claims.md"),
    `# Claims Register: Two prompts\n\n> **Type:** Claims Register\n> **Status:** Draft\n> **Owner:** Hassan Mohiddin\n\n| ID | Claim | Numbers | Source | Level | Kind | Scope | Limit |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n| C1 | Prompt b passes more tasks | ${numbers} | ${source ?? all.map((result) => `results/${result.name}.json`).join("; ")} | L4 | confirmatory | t1 | one task |\n`,
  );
  return { dir, plan, register: join(dir, "claims.md") };
}

const registerProblems = ({ register, plan }) => {
  const run = node("artifact.mjs", "validate", register, "--plan", plan);
  return { status: run.status, text: run.stdout + run.stderr };
};

test("a confirmatory verdict must come from the method the locked rule names, through a receipt", () => {
  const passing = registerProblems(study());
  assert.equal(passing.status, 0, passing.text);
  const other = registerProblems(
    study({ results: [{ name: "c1", family: "paired", input: { method: "sign", better: 9, worse: 1 } }] }),
  );
  assert.equal(other.status, 1);
  assert.match(
    other.text,
    /decides C1 with stats\.mjs paired mcnemar, but results\/c1\.json was computed by stats\.mjs paired sign/,
  );
  // A file another command wrote records nothing; one written by hand has no receipt, whatever it records.
  assert.match(
    registerProblems(study({ results: [{ name: "c1", json: { p: 0.0215 } }] })).text,
    /records no computed_by/,
  );
  assert.match(
    registerProblems(study({ results: [{ name: "c1", hand: { p: 0.0215, computed_by: "stats.mjs paired mcnemar" } }] }))
      .text,
    /no receipt in the plan's run ledger wrote results\/c1\.json/,
  );
  // A rule computed another way is not checked against stats.mjs.
  assert.equal(
    registerProblems(study({ method: "computed: the exact coverage", results: [{ name: "c1", json: { p: 0.0215 } }] }))
      .status,
    0,
  );
});

test("the file that carries the claim's number decides, not another file cited beside it (R16 B2)", () => {
  // A weak McNemar result cited beside the sign test whose p the claim states.
  const mixed = registerProblems(
    study({
      results: [
        { name: "weak", family: "paired", input: { method: "mcnemar", armOnly: 6, referenceOnly: 4 } },
        { name: "sign", family: "paired", input: { method: "sign", better: 9, worse: 1 } },
      ],
    }),
  );
  assert.equal(mixed.status, 1);
  assert.match(mixed.text, /results\/sign\.json was computed by stats\.mjs paired sign/);
  // A correction listed after its test: the Holm-adjusted p alone is enough.
  const holm = registerProblems(
    study({
      method: "paired mcnemar; correct holm",
      results: [{ name: "holm", family: "correct", input: { method: "holm", pValues: [0.0215, 0.01] } }],
    }),
  );
  assert.equal(holm.status, 0, holm.text);
});
test("stats.mjs records what computed each result", () => {
  const run = spawnSync(process.execPath, [join(SCRIPTS, "stats.mjs"), "paired"], {
    input: JSON.stringify({ method: "mcnemar", armOnly: 9, referenceOnly: 1 }),
    encoding: "utf8",
  });
  assert.equal(JSON.parse(run.stdout).computed_by, "stats.mjs paired mcnemar");
});

test("a plan with a model that labels the data makes its claims cite a judge record or judge:none", () => {
  const models =
    "| Role | Model | Snapshot | Accessed |\n| --- | --- | --- | --- |\n| annotator | Claude Haiku | claude-haiku-5-5 | 2026-10-27 |";
  const unjudged = registerProblems(study({ models }));
  assert.equal(unjudged.status, 1);
  assert.match(unjudged.text, /lists a model that judges or annotates/);
  assert.equal(registerProblems(study({ models, source: "results/c1.json; judge:none" })).status, 0);
  // A judge record that cannot be read caps the claim, as before.
  assert.match(
    registerProblems(study({ models, source: "results/c1.json; judge:judge.md" })).text,
    /judge record judge\.md/,
  );
});

test("a validity check that fails holds the analysis until it is cleared", () => {
  const dir = mkdtempSync(join(tmpdir(), "research-validity-"));
  const plan = join(dir, "plan.md");
  writeFileSync(plan, planText());
  assert.equal(node("study.mjs", "lock", plan, "--by", "Hassan Mohiddin").status, 0);
  for (const arm of ["a", "b"])
    assert.equal(
      node("study.mjs", "run", plan, "--unit", "t1", "--arm", arm, "--trial", "1", "--", process.execPath, "-e", "0")
        .status,
      0,
    );
  // Before any validity check, check notes it.
  assert.match(node("study.mjs", "check", plan).stdout, /no validity check has run/);
  const failing = node("study.mjs", "run", plan, "--validity", "--", process.execPath, "-e", "process.exit(3)");
  assert.equal(failing.status, 3);
  assert.match(failing.stderr, /the validity check failed; logged D1/);
  const held = node("study.mjs", "check", plan);
  assert.equal(held.status, 1);
  assert.match(held.stdout, /deviation D1 is not cleared: validity check R3 failed \(exit 3\)/);
  assert.equal(
    node("study.mjs", "clear", plan, "D1", "--by", "Hassan Mohiddin: the oracle's grader was fixed").status,
    0,
  );
  assert.equal(node("study.mjs", "run", plan, "--validity", "--", process.execPath, "-e", "0").status, 0);
  const ready = node("study.mjs", "check", plan);
  assert.equal(ready.status, 0, ready.stdout);
  assert.doesNotMatch(ready.stdout, /no validity check has run/);
  // A validity check reads the study's outputs, so it names no unit.
  assert.match(
    node("study.mjs", "run", plan, "--validity", "--unit", "t1", "--arm", "a", "--", process.execPath, "-e", "0")
      .stderr,
    /derived step/,
  );
});

test("check notes a study-rigor plan with no budget or contamination record", () => {
  const dir = mkdtempSync(join(tmpdir(), "research-notes-"));
  const plan = join(dir, "plan.md");
  const old = planText()
    .replace(
      "| Unit | Arm | Trials | Budget |\n| --- | --- | --- | --- |",
      "| Unit | Arm | Trials |\n| --- | --- | --- |",
    )
    .replace(/\| t1 \| a \| 1 \| [^|]+\|/, "| t1 | a | 1 |")
    .replace(/\| t1 \| b \| 1 \| [^|]+\|/, "| t1 | b | 1 |")
    .replace(/## Contamination[\s\S]*?## Amendments/, "## Amendments");
  writeFileSync(plan, old);
  assert.deepEqual(problems(old), []);
  node("study.mjs", "lock", plan, "--by", "Hassan Mohiddin");
  const check = node("study.mjs", "check", plan);
  assert.match(check.stdout, /no budget per arm/);
  assert.match(check.stdout, /no contamination routes/);
});

test("weighted kappa takes linear or quadratic weights and reports raw agreement beside it", () => {
  const pairs = [
    [0, 0],
    [1, 1],
    [2, 1],
    [2, 2],
    [0, 1],
    [1, 2],
    [2, 2],
    [0, 0],
  ];
  // Cohen's weighted kappa from the confusion matrix with weights |i-j|/(k-1) and ((i-j)/(k-1))^2.
  const linear = weightedKappa(pairs);
  assert.ok(Math.abs(linear.kappa - 0.5862068965517242) < 1e-12);
  const quadratic = weightedKappa(pairs, { weights: "quadratic" });
  assert.ok(Math.abs(quadratic.kappa - 0.7272727272727273) < 1e-12);
  assert.equal(quadratic.observed, 0.625);
  assert.throws(() => weightedKappa(pairs, { weights: "cubic" }), /linear" or "quadratic/);
});

test("an amendment to a plan locked before the Method column demotes nothing it did not change (R16 B1)", () => {
  const dir = mkdtempSync(join(tmpdir(), "research-old-lock-"));
  const plan = join(dir, "plan.md");
  const old = planText()
    .replace("| Decision rule | Method |", "| Decision rule |")
    .replace("| --- | --- | --- | --- | --- | --- |", "| --- | --- | --- | --- | --- |")
    .replace(" paired mcnemar |", "");
  writeFileSync(plan, old);
  assert.equal(node("study.mjs", "lock", plan, "--by", "Hassan Mohiddin").status, 0);
  // The lock as the scripts wrote it before the Method column: hypotheses with no method key.
  const lockFile = join(dir, "plan.lock.json");
  const lock = JSON.parse(readFileSync(lockFile, "utf8"));
  for (const entry of lock.entries) for (const hypothesis of Object.values(entry.hypotheses)) delete hypothesis.method;
  writeFileSync(lockFile, JSON.stringify(lock, null, 2));
  assert.equal(
    node("study.mjs", "run", plan, "--unit", "t1", "--arm", "a", "--trial", "1", "--", process.execPath, "-e", "0")
      .status,
    0,
  );
  writeFileSync(
    plan,
    readFileSync(plan, "utf8").replace("| tools and web | unknown |", "| tools and web | no network |"),
  );
  assert.equal(node("study.mjs", "amend", plan, "--by", "Hassan Mohiddin", "--reason", "record a control").status, 0);
  assert.deepEqual(JSON.parse(readFileSync(lockFile, "utf8")).entries.at(-1).changed_after_runs, []);
  // Choosing the method after runs does change the hypothesis.
  writeFileSync(
    plan,
    readFileSync(plan, "utf8")
      .replace("| Decision rule |", "| Decision rule | Method |")
      .replace("| --- | --- | --- | --- | --- |", "| --- | --- | --- | --- | --- | --- |")
      .replace("p < 0.05 |", "p < 0.05 | paired mcnemar |"),
  );
  assert.equal(node("study.mjs", "amend", plan, "--by", "Hassan Mohiddin", "--reason", "name the method").status, 0);
  assert.deepEqual(JSON.parse(readFileSync(lockFile, "utf8")).entries.at(-1).changed_after_runs, ["C1"]);
});

test("an arm outside the comparison is marked so, and a plan with no Method column is noted (R16 N2, N5)", () => {
  const runs =
    "| t1 | a | 1 | 20 prompt edits |\n| t1 | b | 1 | 20 prompt edits |\n| t1 | published | 1 | not compared: the baseline at its published 200 edits |";
  assert.deepEqual(problems(planText({ runs })), []);
  const dir = mkdtempSync(join(tmpdir(), "research-no-method-"));
  const plan = join(dir, "plan.md");
  writeFileSync(
    plan,
    planText()
      .replace("| Decision rule | Method |", "| Decision rule |")
      .replace("| --- | --- | --- | --- | --- | --- |", "| --- | --- | --- | --- | --- |")
      .replace(" paired mcnemar |", ""),
  );
  node("study.mjs", "lock", plan, "--by", "Hassan Mohiddin");
  assert.match(node("study.mjs", "check", plan).stdout, /Hypotheses name no Method/);
});
