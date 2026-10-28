// The gate's, the plan's and lookup's checks that a final review found open: a register number traced to its result
// file with no plan, the review's evidence table, the report from stdin, a fresh plan's required sections, and the
// sibling check both ways.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { lockAsBefore } from "./old-lock.mjs";

const SCRIPTS = fileURLToPath(new URL("../../../skills/research-work/scripts/", import.meta.url));
const node = (script, ...args) => spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { encoding: "utf8" });
const gate = (...args) => {
  const result = node("research.mjs", "gate", ...args, "--json");
  return { status: result.status, stderr: result.stderr, ...(result.stdout ? JSON.parse(result.stdout) : {}) };
};
const check = (result, id) => result.checks.find((each) => each.id === id);

const BRIEF = `# Research Brief: Retries

> **Type:** Research Brief
> **Status:** Accepted
> **Owner:** Hassan Mohiddin
> **Source:** the user's reply in the task's Working Record
> **Rigor:** check

## Question

How many times does the harness retry a failed tool call?

## Reader and decision

Hassan, deciding whether Freeflow needs its own retry.

## Claim sought

none: a descriptive report

## Prediction

none: a descriptive report

## Scope

- In: the retry path
- Out: the model clients

## Constraints

none
`;

const LEDGER = `# Source Ledger: Retries

> **Type:** Source Ledger
> **Status:** Draft
> **Owner:** Hassan Mohiddin

| ID | Source | Pin | Lookup | Checked | Read | Supports |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | A design note on retries | https://example.org/note (accessed 2026-10-27) | verified | opened | full | C1, C2 |
`;

const register = (rows) => `# Claims Register: Retries

> **Type:** Claims Register
> **Status:** Draft
> **Owner:** Hassan Mohiddin

| ID | Claim | Numbers | Source | Level | Kind | Scope | Limit |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows.join("\n")}
`;

const C1 = (source) =>
  `| C1 | The harness retries a failed call twice when the policy allows it | 2 | ${source} | L2 | exploratory | the design note | not run |`;
const C2 = "| C2 | The note names 3 retry policies | 3 | S1 | L2 | exploratory | the design note | not run |";

const REPORT = `# Research: Retries

## Answer

The harness retries a failed call 2 times when the policy allows it (C1): "retries a failed call twice when the policy allows it" (S1).
`;

/** A check-rigor folder in init project's layout, with no study plan, whose checks pass. */
function project({ rows = [C1("S1")] } = {}) {
  const folder = mkdtempSync(join(tmpdir(), "research-gate-fixes-"));
  mkdirSync(join(folder, "sources"), { recursive: true });
  writeFileSync(join(folder, "brief.md"), BRIEF);
  writeFileSync(join(folder, "sources", "sources.md"), LEDGER);
  writeFileSync(
    join(folder, "sources", "S1.txt"),
    "Before. The harness retries a failed call twice when the policy allows it. After.",
  );
  writeFileSync(join(folder, "claims.md"), register(rows));
  writeFileSync(join(folder, "report.md"), REPORT);
  return folder;
}

test("with no study plan, a register row citing a result file has its numbers traced to it", () => {
  const folder = project({ rows: [C1("S1; results/r.json"), C2] });
  mkdirSync(join(folder, "results"));
  writeFileSync(join(folder, "results", "r.json"), JSON.stringify({ retries: 3 }));
  const wrong = gate(folder);
  const trace = check(wrong, "report-trace");
  assert.equal(trace.status, "failed", JSON.stringify(trace, null, 2));
  assert.match(trace.command, /--results --cited-only/);
  assert.ok(
    trace.output.some((line) => /2 \(C1: not in results\/r\.json\)/.test(line)),
    trace.output.join("\n"),
  );
  assert.equal(wrong.ready, false);

  // The number in its result file passes; C2's number, from a source and no result file, is listed, not failed.
  writeFileSync(join(folder, "results", "r.json"), JSON.stringify({ retries: 2 }));
  const right = gate(folder);
  assert.equal(right.status, 0, JSON.stringify(right.checks, null, 2));
  assert.ok(
    check(right, "report-trace").notes.some((line) => /C2/.test(line)),
    JSON.stringify(check(right, "report-trace"), null, 2),
  );
});

test("a register citing only sources or code, with no study plan, is traced without --results", () => {
  const folder = project({ rows: [C1("S1:src/retry.ts:12")] });
  const result = gate(folder);
  assert.doesNotMatch(check(result, "report-trace").command, /--results/);
});

const evidenceTable = (rows) => `# Evidence Table: Retries

> **Type:** Evidence Table
> **Status:** Draft
> **Owner:** Hassan Mohiddin

| Source | Design | n | Result | Failure condition | Level |
| --- | --- | --- | --- | --- | --- |
${rows.join("\n")}
`;

test("a review's evidence table is validated against the source ledger, and one as init wrote it counts as absent", () => {
  const folder = mkdtempSync(join(tmpdir(), "research-gate-fixes-"));
  assert.equal(
    node("artifact.mjs", "init", "project", folder, "--title", "Retries", "--owner", "O", "--kind", "review").status,
    0,
  );
  // The skeleton init wrote is not checked.
  assert.equal(check(gate(folder), "evidence"), undefined);

  const filled = project();
  const table = join(filled, "synthesis", "evidence-table.md");
  mkdirSync(join(filled, "synthesis"));
  writeFileSync(table, evidenceTable(["| S9 | within-item comparison | 500 | +0.5 | no gain | L2 |"]));
  const unknown = gate(filled);
  assert.equal(unknown.status, 1);
  assert.equal(check(unknown, "evidence").status, "failed");
  assert.match(check(unknown, "evidence").command, /validate .*evidence-table\.md --sources/);
  assert.ok(check(unknown, "evidence").output.some((line) => /no S9/.test(line)));

  writeFileSync(table, evidenceTable(["| S1 | within-item comparison | 500 | +0.5 | no gain | L2 |"]));
  const known = gate(filled);
  assert.equal(check(known, "evidence").status, "passed", JSON.stringify(check(known, "evidence"), null, 2));
  assert.equal(known.status, 0, JSON.stringify(known.checks, null, 2));

  // --evidence names one elsewhere.
  const elsewhere = join(filled, "table.md");
  writeFileSync(elsewhere, evidenceTable(["| S9 | within-item comparison | 500 | +0.5 | no gain | L2 |"]));
  assert.equal(check(gate(filled, "--evidence", elsewhere), "evidence").status, "failed");
});

const piped = (input, ...args) => {
  const result = spawnSync(process.execPath, [join(SCRIPTS, "research.mjs"), "gate", ...args, "--json"], {
    encoding: "utf8",
    input,
  });
  return { status: result.status, stderr: result.stderr, ...(result.stdout ? JSON.parse(result.stdout) : {}) };
};

test("--report - reads the report once from stdin, and every check runs on that copy", () => {
  const folder = project();
  rmSync(join(folder, "report.md"));
  const passed = piped(REPORT, folder, "--report", "-");
  assert.equal(passed.status, 0, JSON.stringify(passed.checks, null, 2));
  for (const id of ["report-cite", "report-trace"]) assert.equal(check(passed, id).status, "passed", id);
  // Both checks read the one copy, which the gate removes when it exits.
  const copy = /\S*research-gate-stdin-[^/\s]+\/report\.md/.exec(check(passed, "report-trace").command)?.[0];
  assert.ok(copy, check(passed, "report-trace").command);
  assert.match(check(passed, "report-cite").command, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(existsSync(copy), false);

  const misquoted = piped(
    REPORT.replace('twice when the policy allows it" (S1)', 'three times on every call" (S1)'),
    folder,
    "--report",
    "-",
  );
  assert.equal(misquoted.status, 1);
  assert.equal(check(misquoted, "report-cite").status, "failed");

  // A paper from stdin gets its draft checks on the copy too; only one of the two can come from stdin.
  const paper = piped(REPORT, folder, "--paper", "-");
  assert.notEqual(check(paper, "draft").status, "not run", JSON.stringify(check(paper, "draft"), null, 2));
  assert.equal(piped(REPORT, folder, "--report", "-", "--paper", "-").status, 2);
});

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
const ROUTES = ["training data", "prompts and examples", "tuning", "tools and web", "grader and harness"];

/** A complete study-rigor plan, as init's skeleton lays it out, filled in. */
const studyPlan = (rigor = "study") => `# Study Plan: Prompts

> **Type:** Study Plan
> **Status:** Draft
> **Owner:** Hassan Mohiddin
> **Rigor:** ${rigor}

${QUESTIONS.map((name, index) => `## ${index + 1}. ${name}\n\n${index === 2 ? "We need 80 tasks: power mcnemar-cases at 80% power for a 20-point gap." : "Written before any data; see the table."}\n`).join("\n")}
## Hypotheses

| ID | Hypothesis | Kind | Metric | Decision rule | Method |
| --- | --- | --- | --- | --- | --- |
| C1 | The new prompt passes more tasks | confirmatory | pass rate | exact McNemar, two-sided, alpha 0.05 | paired mcnemar |

## Planned runs

| Unit | Arm | Trials | Budget |
| --- | --- | --- | --- |
| tasks | old | 1 | 10 prompt revisions |
| tasks | new | 1 | 10 prompt revisions |

## Analysis variants

none

## Models in the method

none

## Contamination

| Route | Control |
| --- | --- |
${ROUTES.map((route) => `| ${route} | items written after the cutoff |`).join("\n")}

## Amendments

none
`;

const withoutMethod = (text) =>
  text
    .replace("| Decision rule | Method |", "| Decision rule |")
    .replace("| --- | --- | --- | --- | --- | --- |", "| --- | --- | --- | --- | --- |")
    .replace(" paired mcnemar |", "");
const withoutBudget = (text) =>
  text
    .replace("| Trials | Budget |\n| --- | --- | --- | --- |", "| Trials |\n| --- | --- | --- |")
    .replaceAll(" 10 prompt revisions |", "");
const withoutSection = (name) => (text) => text.replace(new RegExp(`## ${name}\\n\\n[\\s\\S]*?(?=## )`), "");

test("a study or publication plan not yet locked must have its Method, Budget, Contamination and Models", () => {
  const write = (text) => {
    const dir = mkdtempSync(join(tmpdir(), "research-gate-fixes-plan-"));
    writeFileSync(join(dir, "plan.md"), text);
    return join(dir, "plan.md");
  };
  const full = write(studyPlan());
  assert.equal(node("artifact.mjs", "validate", full).status, 0, node("artifact.mjs", "validate", full).stdout);

  for (const [strip, refusal, note] of [
    [withoutMethod, /Hypotheses table has no Method column/, /Hypotheses name no Method/],
    [withoutBudget, /Planned runs table has no Budget column/, /no budget per arm/],
    [withoutSection("Contamination"), /missing section "## Contamination"/, /no contamination routes/],
    [withoutSection("Models in the method"), /missing section "## Models in the method"/, /no models in the method/],
  ]) {
    for (const rigor of ["study", "publication"]) {
      const text = strip(studyPlan(rigor));
      assert.notEqual(text, studyPlan(rigor), `${refusal} strips nothing`);
      const plan = write(text);
      const validated = node("artifact.mjs", "validate", plan);
      assert.equal(validated.status, 1, `${rigor}: ${validated.stdout}`);
      assert.match(validated.stdout, refusal);
      // Neither lock nor check lets it through.
      const lock = node("study.mjs", "lock", plan, "--by", "Hassan Mohiddin");
      assert.notEqual(lock.status, 0);
      assert.match(lock.stderr, refusal);
      assert.match(node("study.mjs", "check", plan).stdout, refusal);
    }
    // A plan locked before the part existed stays valid, with today's note.
    const old = write(strip(studyPlan()));
    lockAsBefore(old, "Hassan Mohiddin");
    assert.equal(node("artifact.mjs", "validate", old).status, 0, node("artifact.mjs", "validate", old).stdout);
    const checked = node("study.mjs", "check", old);
    assert.doesNotMatch(checked.stdout, refusal);
    assert.match(checked.stdout, note);
    // A quick check's plan is not held to them.
    const quick = write(strip(studyPlan("check")));
    assert.doesNotMatch(node("artifact.mjs", "validate", quick).stdout, refusal);
  }
});
