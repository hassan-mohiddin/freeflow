// The paper route's formats: the paper outline, the rebuttal ledger and the evidence table. Each check has a case
// that must fail.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { ledgerRows, newRequests, skeleton, validate } from "../../../skills/research-work/scripts/lib/formats.mjs";

const CLI = fileURLToPath(new URL("../../../skills/research-work/scripts/artifact.mjs", import.meta.url));
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });

const OUTLINE = `# Paper Outline: Wald against Wilson

> **Type:** Paper Outline
> **Status:** Draft
> **Owner:** Hassan Mohiddin
> **Register:** claims.md

## Proposition

The Wald interval undercovers below n = 40, while Wilson's stays near 95%.

## Contributions

| ID | Contribution | Claims |
| --- | --- | --- |
| K1 | Wald coverage falls below 93% for every n under 40 | C1 |

## Paragraphs

| Section | Paragraph | Role | Claims |
| --- | --- | --- | --- |
| Introduction | Agents report Wald intervals on small samples | the gap | - |
| Results | Wald's coverage at n = 10 is 89% | evidence | C1 |

## Figures

| ID | Figure | Claims | Data |
| --- | --- | --- | --- |
| F1 | Coverage against n for both intervals | C1; C2 | results/coverage.json |

## Objections

| Objection | Answered in |
| --- | --- |
| The grid is too coarse | Methods |

## Limits

One section, Limits, after Results.
`;

const REBUTTAL = (rows, stage = "drafted") => `# Rebuttal: Wald against Wilson

> **Type:** Rebuttal
> **Status:** Draft
> **Owner:** Hassan Mohiddin
> **Stage:** ${stage}
> **Paper:** paper.md at v1

| ID | Reviewer | Round | Comment | Choice | Reason | Commitment | Fulfilled | New |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows.join("\n")}
`;

const EVIDENCE = (level = "L2") => `# Evidence Table: Interval coverage

> **Type:** Evidence Table
> **Status:** Draft
> **Owner:** Hassan Mohiddin

| Source | Design | n | Result | Failure condition | Level |
| --- | --- | --- | --- | --- | --- |
| S1 | exact coverage computation | - | Wald undercovers at small n | Wald coverage at or above 95% for small n | ${level} |
`;

test("each new kind has a skeleton that validation refuses until it is filled", () => {
  for (const kind of ["paper-outline", "rebuttal", "evidence-table"]) {
    const text = skeleton(kind, { title: "T", owner: "O" });
    assert.ok(validate(kind, text).problems.length > 0, kind);
  }
});

test("a paper outline needs a proposition, contributions with claims that exist, and figures with their data", () => {
  const register = new Set(["C1", "C2"]);
  assert.deepEqual(validate("paper-outline", OUTLINE, { register, dataExists: () => true }).problems, []);
  const noProposition = OUTLINE.replace(/## Proposition\n\n.*\n/, "## Proposition\n\n");
  assert.ok(validate("paper-outline", noProposition).problems.some((p) => p.includes("Proposition")));
  const unknown = validate("paper-outline", OUTLINE, { register: new Set(["C1"]) }).problems;
  assert.ok(unknown.some((p) => p.includes("C2 is not in the claims register")));
  const noClaims = OUTLINE.replace(
    "| K1 | Wald coverage falls below 93% for every n under 40 | C1 |",
    "| K1 | Wald coverage falls | none |",
  );
  assert.ok(validate("paper-outline", noClaims).problems.some((p) => p.includes("names at least one claim ID")));
  const missingData = validate("paper-outline", OUTLINE, { dataExists: () => false }).problems;
  assert.ok(missingData.some((p) => p.includes("results/coverage.json does not exist")));
  const unanswered = OUTLINE.replace("| The grid is too coarse | Methods |", "| The grid is too coarse | |");
  assert.ok(validate("paper-outline", unanswered).problems.some((p) => p.includes("where it is answered")));
  const noneFound = OUTLINE.replace(
    /## Objections\n[\s\S]*?## Limits/,
    "## Objections\n\nnone found within these searches\n\n## Limits",
  );
  assert.deepEqual(validate("paper-outline", noneFound).problems, []);
});

test("a rebuttal records a choice and reason for each comment, and a submitted one says where each commitment is done", () => {
  const addressed = "| R1 | Reviewer 1 | 1 | Add n = 5 | will address | in scope | add n = 5 to the grid | - | - |";
  assert.deepEqual(validate("rebuttal", REBUTTAL([addressed])).problems, []);
  const submitted = validate("rebuttal", REBUTTAL([addressed], "submitted")).problems;
  assert.ok(submitted.some((p) => p.includes("does not say where it was fulfilled")));
  const done = addressed.replace("| - | - |", "| Results, commit abc1234 | - |");
  assert.deepEqual(validate("rebuttal", REBUTTAL([done], "submitted")).problems, []);
  const noChoice = addressed.replace("will address", "maybe");
  assert.ok(validate("rebuttal", REBUTTAL([noChoice])).problems.some((p) => p.includes("Choice must be one of")));
  const noCommitment = "| R1 | Reviewer 1 | 1 | Add n = 5 | will address | in scope | - | - | - |";
  assert.ok(validate("rebuttal", REBUTTAL([noCommitment])).problems.some((p) => p.includes("needs a commitment")));
});

test("the goalpost guard: a later-round comment is marked new, or names the earlier comment it continues", () => {
  const first = "| R1 | Reviewer 1 | 1 | Add n = 5 | will address | in scope | add n = 5 | - | - |";
  const continued =
    "| R2 | Reviewer 1 | 2 | n = 5 is still missing | will address | in scope | add n = 5 | - | continues R1 |";
  const added = "| R3 | Reviewer 1 | 2 | Also compare Agresti-Coull | won't | outside the claim | - | - | yes |";
  const text = REBUTTAL([first, continued, added]);
  assert.deepEqual(validate("rebuttal", text).problems, []);
  assert.deepEqual(newRequests(text), ["R3"]);
  const unmarked = added.replace("| yes |", "| - |");
  assert.ok(
    validate("rebuttal", REBUTTAL([first, unmarked])).problems.some((p) =>
      p.includes('New "yes", or "continues R<n>"'),
    ),
  );
  const wrongReviewer = continued.replace("Reviewer 1 | 2", "Reviewer 2 | 2");
  assert.ok(
    validate("rebuttal", REBUTTAL([first, wrongReviewer])).problems.some((p) =>
      p.includes("not an earlier-round comment"),
    ),
  );
});

test("an evidence table caps each study's level by how its source was checked", () => {
  const ledger = ledgerRows(`# Source Ledger: S

> **Type:** Source Ledger
> **Status:** Draft
> **Owner:** O

| ID | Source | Pin | Lookup | Checked | Read | Supports |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Brown, Cai and DasGupta 2001 | doi:10.1214/ss/1009213286 | verified | abstract | abstract | coverage |
`);
  assert.deepEqual(validate("evidence-table", EVIDENCE("L1"), { ledger }).problems, []);
  assert.ok(validate("evidence-table", EVIDENCE("L2"), { ledger }).problems.some((p) => p.includes("caps it at L1")));
  assert.ok(validate("evidence-table", EVIDENCE("L9")).problems.some((p) => p.includes("Level must be one of")));
});

test("artifact.mjs checks an outline's claims against its register and its figures' data on disk", () => {
  const folder = mkdtempSync(join(tmpdir(), "research-paper-"));
  writeFileSync(
    join(folder, "claims.md"),
    `# Claims Register: R

> **Type:** Claims Register
> **Status:** Draft
> **Owner:** O

| ID | Claim | Numbers | Source | Level | Kind | Scope | Limit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C1 | Wald undercovers | 0.89 | results/coverage.json | L2 | exploratory | n 10 to 100 | grid |
`,
  );
  writeFileSync(join(folder, "outline.md"), OUTLINE);
  const missing = run("validate", join(folder, "outline.md"));
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /C2 is not in the claims register/);
  assert.match(missing.stdout, /results\/coverage\.json does not exist/);
  mkdirSync(join(folder, "results"));
  writeFileSync(join(folder, "results/coverage.json"), "{}\n");
  writeFileSync(join(folder, "outline.md"), OUTLINE.replace("C1; C2", "C1"));
  const ok = run("validate", join(folder, "outline.md"));
  assert.equal(ok.status, 0, ok.stdout);
  writeFileSync(
    join(folder, "rebuttal.md"),
    REBUTTAL(["| R1 | A | 1 | x | won't | y | - | - | - |", "| R2 | A | 2 | z | won't | y | - | - | yes |"]),
  );
  const ledger = run("validate", join(folder, "rebuttal.md"));
  assert.equal(ledger.status, 0, ledger.stdout);
  assert.match(ledger.stdout, /new requests in a later round: R2/);
});
