// Checks on a study's plan and runs: the method a confirmatory rule names is the one that computed its result, a
// model that labels the data counts as a judge, the arms compared get the same budget, a validity check that fails
// holds the analysis, the contamination routes are recorded, and weighted kappa reports raw agreement beside it.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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

/** A locked plan with a result file written by stats.mjs, and a register claiming C1 from it. */
function lockedStudy({
  method = "paired mcnemar",
  computedBy = "stats.mjs paired mcnemar",
  models = "none",
  source,
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), "research-study-checks-"));
  const plan = join(dir, "plan.md");
  writeFileSync(plan, planText({ method, models }));
  const lock = node("study.mjs", "lock", plan, "--by", "Hassan Mohiddin, 'yes' (2026-10-28)");
  assert.equal(lock.status, 0, lock.stderr);
  mkdirSync(join(dir, "results"));
  writeFileSync(
    join(dir, "results", "c1.json"),
    JSON.stringify({ method: "mcnemar-exact", p: 0.021, ...(computedBy ? { computed_by: computedBy } : {}) }),
  );
  writeFileSync(
    join(dir, "claims.md"),
    `# Claims Register: Two prompts\n\n> **Type:** Claims Register\n> **Status:** Draft\n> **Owner:** Hassan Mohiddin\n\n| ID | Claim | Numbers | Source | Level | Kind | Scope | Limit |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n| C1 | Prompt b passes more tasks | 0.021 | ${source ?? "results/c1.json"} | L4 | confirmatory | t1 | one task |\n`,
  );
  return { dir, plan, register: join(dir, "claims.md") };
}

const registerProblems = ({ register, plan }) => {
  const run = node("artifact.mjs", "validate", register, "--plan", plan);
  return { status: run.status, text: run.stdout + run.stderr };
};

test("a confirmatory verdict must come from the method the locked rule names", () => {
  assert.equal(registerProblems(lockedStudy()).status, 0);
  const other = registerProblems(lockedStudy({ computedBy: "stats.mjs paired difference" }));
  assert.equal(other.status, 1);
  assert.match(
    other.text,
    /decides C1 with stats\.mjs paired mcnemar, but its result was computed by stats\.mjs paired difference/,
  );
  const unknown = registerProblems(lockedStudy({ computedBy: null }));
  assert.match(unknown.text, /no result file in Source records what computed it/);
  // A rule computed another way is not checked against stats.mjs.
  assert.equal(registerProblems(lockedStudy({ method: "computed: the exact coverage", computedBy: null })).status, 0);
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
  const unjudged = registerProblems(lockedStudy({ models }));
  assert.equal(unjudged.status, 1);
  assert.match(unjudged.text, /lists a model that judges or annotates/);
  assert.equal(registerProblems(lockedStudy({ models, source: "results/c1.json; judge:none" })).status, 0);
  // A judge record that cannot be read caps the claim, as before.
  assert.match(
    registerProblems(lockedStudy({ models, source: "results/c1.json; judge:judge.md" })).text,
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
