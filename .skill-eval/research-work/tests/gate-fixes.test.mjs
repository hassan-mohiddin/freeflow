// The gate's, the plan's and lookup's checks that a final review found open: a register number traced to its result
// file with no plan, the review's evidence table, the report from stdin, a fresh plan's required sections, and the
// sibling check both ways.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

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
