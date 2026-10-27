import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { judgeCounts, skeleton, validate } from "../../../skills/research-work/scripts/lib/formats.mjs";
import { numberInResults, resultCitations } from "../../../skills/research-work/scripts/lib/report.mjs";
import { planHash } from "../../../skills/research-work/scripts/lib/study.mjs";

const script = (name) => fileURLToPath(new URL(`../../../skills/research-work/scripts/${name}`, import.meta.url));
const run = (name, ...args) => spawnSync(process.execPath, [script(name), ...args], { encoding: "utf8" });
const study = (...args) => run("study.mjs", ...args);

/** A study folder with a check-rigor plan whose placeholders are filled: one unit, arms a and b, one trial each. */
function studyFolder({ rigor = "check" } = {}) {
  const folder = mkdtempSync(join(tmpdir(), "research-study-"));
  const plan = join(folder, "plan.md");
  const text = skeleton("study-plan", { title: "Two prompts", owner: "Hassan Mohiddin", rigor })
    .replaceAll("<the answer, before any data>", "Answered before any data.")
    .replace(
      "| C1 | <what the study tests> | confirmatory | <the primary metric> | <the rule that decides it> |",
      "| C1 | Prompt b passes more tasks than prompt a | confirmatory | pass rate | exact McNemar, two-sided p < 0.05 |\n| C2 | Prompt b is faster | exploratory | - | - |",
    )
    .replace("| <unit> | <arm> | <trials> |", "| t1 | a | 1 |\n| t1 | b | 1 |");
  writeFileSync(plan, text);
  return { folder, plan };
}

const register = (rows) => `# Claims Register: Two prompts

> **Type:** Claims Register
> **Status:** Draft
> **Owner:** Hassan Mohiddin

| ID | Claim | Numbers | Source | Level | Kind | Scope | Limit |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows.join("\n")}
`;

const judgeRecord = (overrides = {}) => {
  const fields = {
    Judge: "claude-haiku-5-5, thinking low",
    Rubric: "rubric.md",
    "Rubric sha256": "a".repeat(64),
    "Gold items": "100",
    Agreement: "0.90",
    Interval: "[0.83, 0.94] wilson",
    "Required lower bound": "0.80",
    "Both orders": "passed",
    "Length control": "passed",
    Decoys: "passed",
    Result: "pass",
    ...overrides,
  };
  return [
    "# Judge Validation: Pass rate judge",
    "",
    "> **Type:** Judge Validation",
    "> **Status:** Draft",
    "> **Owner:** Hassan Mohiddin",
    ...Object.entries(fields).map(([name, value]) => `> **${name}:** ${value}`),
    "",
    "## Notes",
    "",
    "Gold answers from two people.",
    "",
  ].join("\n");
};

test("a study plan answers five questions at check rigor and all twelve otherwise, with hypotheses and planned runs", () => {
  const { plan } = studyFolder();
  assert.deepEqual(validate("study-plan", readFileSync(plan, "utf8")).problems, []);
  const full = skeleton("study-plan", { title: "x", owner: "o", rigor: "study" });
  const problems = validate("study-plan", full).problems;
  assert.ok(problems.some((problem) => problem.includes('"12. Where it holds" still has a <placeholder>')));
  const text = readFileSync(plan, "utf8");
  const broken = text
    .replace("| pass rate | exact McNemar, two-sided p < 0.05 |", "| pass rate | - |")
    .replace("| t1 | b | 1 |", "| t1 | b | zero |")
    .replace(/## 10\. The interval\n\nAnswered before any data\.\n/, "");
  const found = validate("study-plan", broken).problems;
  assert.ok(found.some((problem) => problem.includes("names its metric and its decision rule")));
  assert.ok(found.some((problem) => problem.includes("Trials must be a whole number")));
  assert.ok(found.some((problem) => problem.includes('missing section "## 10. The interval"')));
});

test("the plan hash leaves out the Amendments section and nothing else", () => {
  const { plan } = studyFolder();
  const text = readFileSync(plan, "utf8");
  assert.equal(planHash(text), planHash(text.replace("## Amendments\n\nnone", "## Amendments\n\n- a change")));
  assert.notEqual(planHash(text), planHash(text.replace("p < 0.05", "p < 0.01")));
});

test("lock refuses an invalid plan and a second lock; check refuses an unlocked or changed plan until amended", () => {
  const { folder, plan } = studyFolder();
  writeFileSync(join(folder, "bad.md"), skeleton("study-plan", { title: "x", owner: "o", rigor: "check" }));
  assert.equal(study("lock", join(folder, "bad.md"), "--by", "Hassan").status, 2);
  assert.match(study("check", plan).stdout, /no lock file/);
  assert.equal(study("lock", plan, "--by", "Hassan").status, 0);
  assert.match(study("lock", plan, "--by", "Hassan").stderr, /locked once/);
  writeFileSync(plan, readFileSync(plan, "utf8").replace("p < 0.05", "p < 0.01"));
  const changed = study("check", plan);
  assert.equal(changed.status, 1);
  assert.match(changed.stdout, /changed since it was locked/);
  assert.equal(study("amend", plan, "--by", "Hassan", "--reason", "stricter alpha").status, 0);
  assert.doesNotMatch(study("check", plan).stdout, /changed since/);
  assert.match(
    readFileSync(plan, "utf8"),
    /## Amendments\n\n- \d{4}-\d{2}-\d{2}, by Hassan: stricter alpha \(plan [0-9a-f]{12}\)/,
  );
});

test("run records a receipt for every attempt, passes the command's exit code through, and counts only started runs", () => {
  const { folder, plan } = studyFolder();
  assert.equal(study("run", plan, "--unit", "t1", "--arm", "a", "--", process.execPath, "-e", "0").status, 0);
  assert.equal(study("lock", plan, "--by", "Hassan").status, 0);
  writeFileSync(join(folder, "in.txt"), "input\n");
  const failed = study(
    "run",
    plan,
    "--unit",
    "t1",
    "--arm",
    "a",
    "--trial",
    "1",
    "--input",
    join(folder, "in.txt"),
    "--output",
    join(folder, "out.txt"),
    "--",
    process.execPath,
    "-e",
    "require('fs').writeFileSync(process.argv[1], 'x'); console.log('done'); process.exit(3)",
    join(folder, "out.txt"),
  );
  assert.equal(failed.status, 3);
  assert.match(failed.stderr, /receipt R2, exit 3/);
  const missing = study("run", plan, "--unit", "t1", "--arm", "b", "--", "no-such-program-here");
  assert.match(missing.stderr, /could not start/);
  const receipts = readFileSync(join(folder, "runs.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
  assert.deepEqual(
    receipts.map((receipt) => [receipt.id, receipt.plan_locked, receipt.exit_code]),
    [
      ["R1", false, 0],
      ["R2", true, 3],
      ["R3", true, null],
    ],
  );
  const [, second] = receipts;
  assert.equal(second.trial, 1);
  assert.equal(second.inputs[0].path, "in.txt");
  assert.match(second.inputs[0].sha256, /^[0-9a-f]{64}$/);
  assert.equal(second.outputs[0].path, "out.txt");
  assert.match(second.outputs[0].sha256, /^[0-9a-f]{64}$/);
  assert.match(second.program.sha256, /^[0-9a-f]{64}$/);
  assert.equal(second.stdout_tail, "done\n");
  // A non-zero exit is data; the run that never started does not count as t1 / b's trial.
  const checked = study("check", plan);
  assert.equal(checked.status, 1);
  assert.match(checked.stdout, /t1 \/ b: 1 trial\(s\) planned, 0 run under the locked plan/);
  assert.doesNotMatch(checked.stdout, /t1 \/ a:/);
  assert.match(checked.stdout, /1 receipt\(s\) ran before the lock/);
});

test("a deviation holds the analysis until someone is named as clearing it, and covers its unit's shortfall", () => {
  const { plan } = studyFolder();
  study("lock", plan, "--by", "Hassan");
  study("run", plan, "--unit", "t1", "--arm", "a", "--", process.execPath, "-e", "0");
  assert.match(study("deviation", plan, "--what", "t1 / b skipped").stderr, /needs --by/);
  assert.equal(
    study("deviation", plan, "--what", "t1 / b skipped: no budget", "--by", "agent", "--unit", "t1", "--arm", "b")
      .status,
    0,
  );
  const held = study("check", plan);
  assert.equal(held.status, 1);
  assert.match(held.stdout, /deviation D1 is not cleared/);
  assert.match(study("clear", plan, "D1").stderr, /needs --by/);
  assert.equal(study("clear", plan, "D1", "--by", "Hassan").status, 0);
  assert.equal(study("check", plan).status, 0, study("check", plan).stdout);
  assert.match(study("manifest", plan).stdout, /t1 \/ b: planned 1, ran 0, .*covered by D1/);
});

test("a run of a unit and arm the plan does not list is refused at check", () => {
  const { plan } = studyFolder();
  study("lock", plan, "--by", "Hassan");
  for (const arm of ["a", "b", "c"])
    study("run", plan, "--unit", "t1", "--arm", arm, "--", process.execPath, "-e", "0");
  assert.match(study("check", plan).stdout, /R3 ran a unit and arm the plan does not list/);
});

test("a confirmatory claim needs a confirmatory hypothesis of a locked plan that no amendment changed after runs", () => {
  const { folder, plan } = studyFolder();
  const claims = join(folder, "claims.md");
  const rows = [
    "| C1 | Prompt b passes more tasks | 0.30 | results.json | L4 | confirmatory | 20 tasks | one model |",
    "| C2 | Prompt b is faster | - | results.json | L3 | exploratory | 20 tasks | one model |",
    "| C3 | Prompt b is shorter | - | results.json | L4 | confirmatory | 20 tasks | one model |",
  ];
  writeFileSync(claims, register(rows));
  const unlocked = run("artifact.mjs", "validate", claims, "--plan", plan);
  assert.equal(unlocked.status, 1);
  assert.match(unlocked.stdout, /needs a locked study plan, and the plan is not locked/);
  study("lock", plan, "--by", "Hassan");
  const locked = run("artifact.mjs", "validate", claims, "--plan", plan).stdout;
  assert.doesNotMatch(locked, /line \d+: C1/);
  assert.match(locked, /C3 is not a confirmatory hypothesis of the locked study plan/);
  writeFileSync(claims, register(rows.slice(0, 2)));
  assert.equal(run("artifact.mjs", "validate", claims, "--plan", plan).status, 0);
  assert.match(
    run("artifact.mjs", "validate", claims).stdout,
    /not checked: confirmatory claims against a locked study plan/,
  );
  // The decision rule changes after a study run: C1 is exploratory from then on.
  study("run", plan, "--unit", "t1", "--arm", "a", "--", process.execPath, "-e", "0");
  writeFileSync(plan, readFileSync(plan, "utf8").replace("p < 0.05", "p < 0.10"));
  study("amend", plan, "--by", "Hassan", "--reason", "looser alpha");
  const demoted = run("artifact.mjs", "validate", claims, "--plan", plan);
  assert.equal(demoted.status, 1);
  assert.match(demoted.stdout, /an amendment changed C1 after study runs existed/);
  const lock = JSON.parse(readFileSync(join(folder, "plan.lock.json"), "utf8"));
  assert.deepEqual(lock.entries.at(-1).changed_after_runs, ["C1"]);
});

test("a judge record lets its verdicts count only when it passes, and a claim resting on one that does not is L1", () => {
  assert.equal(judgeCounts(judgeRecord()).counts, true);
  assert.equal(judgeCounts(judgeRecord({ Result: "fail" })).counts, false);
  const inconsistent = judgeCounts(judgeRecord({ Interval: "[0.71, 0.88] wilson" }));
  assert.equal(inconsistent.counts, false);
  assert.ok(inconsistent.problems.some((problem) => problem.includes("lower bound 0.71 is below the required 0.8")));
  assert.ok(
    judgeCounts(judgeRecord({ Decoys: "not run" })).problems.some((problem) => problem.includes('Decoys is "not run"')),
  );
  const folder = mkdtempSync(join(tmpdir(), "research-judge-"));
  writeFileSync(join(folder, "judge-ok.md"), judgeRecord());
  writeFileSync(join(folder, "judge-low.md"), judgeRecord({ Result: "fail" }));
  const claims = join(folder, "claims.md");
  writeFileSync(
    claims,
    register([
      "| C1 | Answers are correct | 0.81 | judge:judge-ok.md; scores.json | L3 | exploratory | 50 items | one judge |",
      "| C2 | Answers are polite | 0.92 | judge:judge-low.md; scores.json | L3 | exploratory | 50 items | one judge |",
      "| C3 | Answers are short | 0.40 | judge:judge-gone.md | L2 | exploratory | 50 items | one judge |",
    ]),
  );
  const result = run("artifact.mjs", "validate", claims).stdout;
  assert.doesNotMatch(result, /judge-ok\.md/);
  assert.match(result, /judge record judge-low\.md, which does not pass, so the claim is at most L1/);
  assert.match(result, /judge record judge-gone\.md, which cannot be read/);
});

test("trace --results finds each register number in the result file its Source names", () => {
  assert.deepEqual(resultCitations("S2; runs/aggregate.json; judge:judge.md, log.txt:4-6"), [
    { path: "runs/aggregate.json", start: null, end: null },
    { path: "log.txt", start: 4, end: 6 },
  ]);
  assert.equal(numberInResults("0.83", [0.8333333]), true);
  assert.equal(numberInResults("0.84", [0.8333333]), false);
  assert.equal(numberInResults("65%", [0.65]), true);
  assert.equal(numberInResults("31", [31]), true);
  const folder = mkdtempSync(join(tmpdir(), "research-results-"));
  writeFileSync(join(folder, "results.json"), JSON.stringify({ rate: 0.7751937, low: 0.71, high: 0.83, n: 129 }));
  writeFileSync(join(folder, "log.txt"), "start\npassed 31 of 40\nend\n");
  writeFileSync(
    join(folder, "claims.md"),
    register([
      "| C1 | Coverage is below nominal | 0.78 [0.71, 0.83] on 129 | S1; results.json | L3 | exploratory | n = 10 | one seed |",
      "| C2 | Most tasks pass | 31 of 40 | log.txt:2 | L3 | exploratory | 40 tasks | one model |",
      "| C3 | The tail is heavy | 0.99 | results.json | L3 | exploratory | n = 10 | one seed |",
      "| C4 | A paper reports it | 0.95 | S1 | L1 | exploratory | the paper | not rerun |",
      "| C5 | A file went missing | 12 | gone.json | L3 | exploratory | - | - |",
    ]),
  );
  writeFileSync(join(folder, "report.md"), "Coverage was 0.78 [0.71, 0.83] on 129 runs (C1).\n");
  const traced = run(
    "claims.mjs",
    "trace",
    join(folder, "report.md"),
    "--register",
    join(folder, "claims.md"),
    "--results",
  );
  assert.equal(traced.status, 1);
  assert.match(traced.stdout, /results: 8 register number\(s\) traced to their files; 1 row\(s\) not checked/);
  assert.match(traced.stdout, /not checked: C4 \(its Source names no result file\)/);
  assert.match(traced.stdout, /number not in its results 0\.99 \(C3: not in results\.json\)/);
  assert.match(traced.stdout, /missing result file gone\.json/);
  assert.doesNotMatch(traced.stdout, /C1:|C2:/);
  // Without --results the report-to-register trace is unchanged.
  assert.equal(
    run("claims.mjs", "trace", join(folder, "report.md"), "--register", join(folder, "claims.md")).status,
    0,
  );
});

test("both ledgers are hash-chained, and check reports an edited line", () => {
  const { folder, plan } = studyFolder();
  study("lock", plan, "--by", "Hassan");
  study("run", plan, "--unit", "t1", "--arm", "a", "--", process.execPath, "-e", "0");
  study("run", plan, "--unit", "t1", "--arm", "b", "--", process.execPath, "-e", "0");
  assert.equal(study("check", plan).status, 0);
  const ledger = join(folder, "runs.jsonl");
  const [first, second] = readFileSync(ledger, "utf8").trim().split("\n");
  assert.equal(JSON.parse(first).prev_sha256, null);
  assert.match(JSON.parse(second).prev_sha256, /^[0-9a-f]{64}$/);
  writeFileSync(ledger, `${first.replace('"exit_code":0', '"exit_code":1')}\n${second}\n`);
  const edited = study("check", plan);
  assert.equal(edited.status, 1);
  assert.match(edited.stdout, /run ledger: the hash chain breaks at line 2/);
});

test("an inequality is not a placeholder, and a placeholder still is", () => {
  const { plan } = studyFolder();
  const text = readFileSync(plan, "utf8");
  const withMath = text.replace(
    "## 1. The claim\n\nAnswered before any data.",
    "## 1. The claim\n\nCoverage is x < 0.95 when n < 40 and p<0.05, and y > 2.",
  );
  assert.deepEqual(validate("study-plan", withMath).problems, []);
  const withPlaceholder = text.replace(
    "## 1. The claim\n\nAnswered before any data.",
    "## 1. The claim\n\n<the claim>",
  );
  assert.ok(validate("study-plan", withPlaceholder).problems.some((problem) => problem.includes("placeholder")));
});

test("check refuses a result file edited after the receipt that wrote it", () => {
  const { folder, plan } = studyFolder();
  study("lock", plan, "--by", "Hassan");
  const result = join(folder, "result.json");
  const write = (value) => [process.execPath, "-e", `require('fs').writeFileSync(process.argv[1], '${value}')`, result];
  study("run", plan, "--unit", "t1", "--arm", "a", "--output", result, "--", ...write("1"));
  study("run", plan, "--unit", "t1", "--arm", "b", "--output", result, "--", ...write("2"));
  assert.equal(study("check", plan).status, 0, study("check", plan).stdout);
  writeFileSync(result, "3");
  assert.match(study("check", plan).stdout, /result\.json changed after R2 wrote it/);
});
