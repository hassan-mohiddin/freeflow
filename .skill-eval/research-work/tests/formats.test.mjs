import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { ledgerRows, searchCounts, skeleton, validate } from "../../../skills/research-work/scripts/lib/formats.mjs";

const CLI = fileURLToPath(new URL("../../../skills/research-work/scripts/artifact.mjs", import.meta.url));
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });

const BRIEF = `# Research Brief: Codex harness report

> **Type:** Research Brief
> **Status:** Draft
> **Owner:** Hassan Mohiddin
> **Rigor:** study

## Question

How does the Codex harness decide which tool call runs next, at commit abc1234?

## Reader and decision

Hassan, deciding which of its mechanisms Freeflow should borrow.

## Claim sought

none: a descriptive report

## Prediction

none: a descriptive report

## Scope

- In: the agent loop and tool dispatch
- Out: the model provider clients

## Constraints

- "Pin every claim to a file and line" (2026-10-27)
`;

const LEDGER = `# Source Ledger: Codex harness report

> **Type:** Source Ledger
> **Status:** Draft
> **Owner:** Hassan Mohiddin

| ID | Source | Pin | Lookup | Checked | Read | Supports |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | openai/codex, codex-rs/core/src/codex.rs | openai/codex@abc1234 | verified | repository-read | full | C1 |
| S2 | Zheng et al. 2023, Judging LLM-as-a-Judge | arXiv:2306.05685 | verified | summary-only | none | C2 |
| S3 | A blog post on agent loops | https://example.org/loops (accessed 2026-10-27) | verified | opened | partial | - |
`;

const register = (rows) => `# Claims Register: Codex harness report

> **Type:** Claims Register
> **Status:** Draft
> **Owner:** Hassan Mohiddin

| ID | Claim | Numbers | Source | Level | Kind | Scope | Limit |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows.join("\n")}
`;

test("valid brief, ledger and register pass", () => {
  assert.deepEqual(validate("research-brief", BRIEF).problems, []);
  assert.deepEqual(validate("source-ledger", LEDGER).problems, []);
  const text = register([
    "| C1 | The loop runs one tool call per turn | - | S1 | L2 | exploratory | codex@abc1234 | Not checked at runtime |",
  ]);
  assert.deepEqual(validate("claims-register", text, { ledger: ledgerRows(LEDGER) }).problems, []);
});

test("a brief with a placeholder, an empty section or a missing scope line is refused", () => {
  const broken = BRIEF.replace("Hassan, deciding which", "<who>")
    .replace("- Out: the model provider clients", "")
    .replace("> **Rigor:** study", "> **Rigor:** thorough");
  const problems = validate("research-brief", broken).problems.join("\n");
  assert.match(problems, /Rigor must be one of: check, study, publication/);
  assert.match(problems, /"Reader and decision" still has a <placeholder>/);
  assert.match(problems, /"Scope" needs a "- In:" line and a "- Out:" line/);
});

test("the ledger refuses a bad pin, an unknown state and a read source marked unread", () => {
  const broken = LEDGER.replace("arXiv:2306.05685", "the arXiv paper").replace(
    "| verified | opened | partial |",
    "| found | opened | none |",
  );
  const problems = validate("source-ledger", broken).problems.join("\n");
  assert.match(problems, /line 10: Pin must be/);
  assert.match(problems, /line 11: Lookup must be one of/);
  assert.match(problems, /line 11: a source marked opened was read, so Read cannot be "none"/);
});

test("the register caps an exploratory claim at L3 and a summary-only source at L1", () => {
  const text = register([
    "| C1 | The loop runs one tool call per turn | - | S1 | L4 | exploratory | codex@abc1234 | Not checked at runtime |",
    "| C2 | Judges prefer the first answer | 65% | S2 | L2 | exploratory | MT-Bench | One benchmark |",
    "| C3 | Something else | - | S9 | L1 | exploratory | x | y |",
  ]);
  const problems = validate("claims-register", text, { ledger: ledgerRows(LEDGER) }).problems.join("\n");
  assert.match(problems, /line 9: an exploratory claim is at most L3/);
  assert.match(problems, /line 10: S2 was checked as "summary-only", which caps a claim at L1; this claim is L2/);
  assert.match(problems, /line 11: Source names S9, which the source ledger does not have/);
});

test("search ledger counts are computed from hits, and typed counts are refused", () => {
  const text = [
    '{"kind":"query","id":"Q1","query":"judge bias","database":"arXiv","date":"2026-10-27"}',
    '{"kind":"hit","query":"Q1","title":"A","state":"included","source":"S2"}',
    '{"kind":"hit","query":"Q1","title":"B","state":"excluded","reason":"off topic"}',
    '{"kind":"hit","query":"Q1","title":"C","state":"excluded","reason":"off topic"}',
  ].join("\n");
  const counts = searchCounts(text);
  assert.deepEqual(counts.total, { hits: 3, included: 1, excluded: 2, duplicate: 0, unscreened: 0 });
  assert.deepEqual(counts.problems, []);
  const broken = [
    '{"kind":"query","id":"Q1","query":"judge bias","database":"arXiv","date":"27/10/2026","hits":40}',
    '{"kind":"hit","query":"Q2","title":"A","state":"excluded"}',
    "not json",
  ].join("\n");
  const problems = validate("search-ledger", broken).problems.join("\n");
  assert.match(problems, /date must be YYYY-MM-DD/);
  assert.match(problems, /do not type a hit count/);
  assert.match(problems, /hit names query Q2, which no earlier line defines/);
  assert.match(problems, /an excluded hit needs a reason/);
  assert.match(problems, /line 3: not valid JSON/);
});

test("init writes a skeleton that validation refuses until it is filled, and never overwrites", () => {
  const folder = mkdtempSync(join(tmpdir(), "research-artifacts-"));
  const path = join(folder, "brief.md");
  const created = run("init", "research-brief", path, "--title", "T", "--owner", "Hassan Mohiddin", "--rigor", "check");
  assert.equal(created.status, 0, created.stderr);
  assert.equal(
    readFileSync(path, "utf8"),
    skeleton("research-brief", { title: "T", owner: "Hassan Mohiddin", rigor: "check" }),
  );
  const checked = run("validate", path);
  assert.equal(checked.status, 1);
  assert.match(checked.stdout, /still has a <placeholder>/);
  assert.equal(run("init", "research-brief", path, "--title", "T", "--owner", "H").status, 2);
  writeFileSync(join(folder, "brief-ok.md"), BRIEF);
  const ok = run("validate", join(folder, "brief-ok.md"));
  assert.equal(ok.status, 0, ok.stdout);
  assert.match(ok.stdout, /research-brief, valid/);
});

test("validate cross-checks a register against its ledger, and counts reads a search ledger", () => {
  const folder = mkdtempSync(join(tmpdir(), "research-artifacts-"));
  writeFileSync(join(folder, "sources.md"), LEDGER);
  writeFileSync(
    join(folder, "claims.md"),
    register(["| C1 | Judges prefer the first answer | 65% | S2 | L3 | exploratory | MT-Bench | One benchmark |"]),
  );
  const unchecked = run("validate", join(folder, "claims.md"));
  assert.equal(unchecked.status, 0);
  assert.match(unchecked.stdout, /not checked: levels against the source ledger/);
  const checked = run("validate", join(folder, "claims.md"), "--sources", join(folder, "sources.md"));
  assert.equal(checked.status, 1);
  assert.match(checked.stdout, /caps a claim at L1/);
  writeFileSync(
    join(folder, "search.jsonl"),
    '{"kind":"query","id":"Q1","query":"q","database":"arXiv","date":"2026-10-27"}\n{"kind":"hit","query":"Q1","title":"A","state":"unscreened"}\n',
  );
  const counts = run("counts", join(folder, "search.jsonl"));
  assert.equal(counts.status, 0, counts.stdout);
  assert.match(counts.stdout, /1 hits; included 0, excluded 0, duplicate 0, unscreened 1/);
});
