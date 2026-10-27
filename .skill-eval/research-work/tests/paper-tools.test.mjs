// The paper tools: figures drawn from data with a receipt, the draft checks, the venue copy, revision by patch, the
// bibliography from the source ledger, the build and the PDF check, and the project layout. Each check has a case
// that must fail.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { drawFigure } from "../../../skills/research-work/scripts/lib/figure.mjs";
import {
  anchor,
  applyPatch,
  bibFromLedger,
  draftCheck,
  parseBib,
  stripIds,
} from "../../../skills/research-work/scripts/lib/paper.mjs";
import { ledgerRows, validate } from "../../../skills/research-work/scripts/lib/formats.mjs";

const SCRIPTS = fileURLToPath(new URL("../../../skills/research-work/scripts/", import.meta.url));
const node = (script, ...args) => spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { encoding: "utf8" });
const folder = () => mkdtempSync(join(tmpdir(), "research-paper-tools-"));

const ROWS = JSON.stringify({
  rows: [
    { arm: "wald", n: 10, cov: 0.7699 },
    { arm: "wald", n: 100, cov: 0.9231 },
    { arm: "wilson", n: 10, cov: 0.9542 },
    { arm: "wilson", n: 100, cov: 0.951 },
  ],
});
const SPEC = {
  type: "line",
  data: "data.json",
  rows: "rows",
  x: { label: "n" },
  y: { label: "average coverage" },
  series: [
    { label: "Wald", x: "n", y: "cov", where: { arm: "wald" } },
    { label: "Wilson", x: "n", y: "cov", where: { arm: "wilson" } },
  ],
};

function figureFolder() {
  const dir = folder();
  writeFileSync(join(dir, "data.json"), ROWS);
  writeFileSync(join(dir, "spec.json"), JSON.stringify(SPEC));
  return dir;
}

test("a figure is drawn only from a data file, the same bytes each time", () => {
  const dir = figureFolder();
  const first = drawFigure(SPEC, join(dir, "spec.json"));
  assert.equal(first.svg, drawFigure(SPEC, join(dir, "spec.json")).svg);
  assert.deepEqual(first.series, [
    { label: "Wald", points: 2 },
    { label: "Wilson", points: 2 },
  ]);
  assert.throws(
    () => drawFigure({ ...SPEC, data: [{ n: 1, cov: 1 }] }, join(dir, "spec.json")),
    /must name a data file/,
  );
  assert.throws(
    () => drawFigure({ ...SPEC, series: [{ label: "W", x: "n", y: "coverage" }] }, join(dir, "spec.json")),
    /no column "coverage"/,
  );
  assert.throws(
    () =>
      drawFigure(
        { ...SPEC, series: [{ label: "W", x: "n", y: "cov", where: { arm: "agresti" } }] },
        join(dir, "spec.json"),
      ),
    /matches no rows/,
  );
});

const OUTLINE = (receipt) => `# Paper Outline: Coverage

> **Type:** Paper Outline
> **Status:** Draft
> **Owner:** O
> **Register:** claims.md
> **Runs:** runs.jsonl

## Proposition

Wald undercovers below n = 40.

## Contributions

| ID | Contribution | Claims |
| --- | --- | --- |
| K1 | Wald undercovers | C1 |

## Paragraphs

| Section | Paragraph | Role | Claims |
| --- | --- | --- | --- |
| Results | Wald at n = 10 | evidence | C1 |

## Figures

| ID | Figure | Claims | Data | File | Receipt |
| --- | --- | --- | --- | --- | --- |
| F1 | Coverage against n | C1 | data.json | figure.svg | ${receipt} |

## Objections

none found within these searches

## Limits

One section, Limits.
`;

test("a figure's receipt must show it was drawn from its data file as both are now", () => {
  const dir = figureFolder();
  writeFileSync(join(dir, "claims.md"), "| ID | Claim |\n| --- | --- |\n| C1 | x |\n");
  const drawn = node(
    "paper.mjs",
    "run",
    "--ledger",
    join(dir, "runs.jsonl"),
    "--input",
    join(dir, "spec.json"),
    "--input",
    join(dir, "data.json"),
    "--output",
    join(dir, "figure.svg"),
    "--",
    process.execPath,
    join(SCRIPTS, "figure.mjs"),
    "draw",
    join(dir, "spec.json"),
    "--out",
    join(dir, "figure.svg"),
  );
  assert.equal(drawn.status, 0, drawn.stderr);
  const receipt = JSON.parse(readFileSync(join(dir, "runs.jsonl"), "utf8").trim());
  assert.equal(receipt.id, "R1");
  assert.equal(receipt.plan_sha256, undefined, "a paper's own receipt carries no plan fields");

  writeFileSync(join(dir, "outline.md"), OUTLINE("R1"));
  const ok = node("artifact.mjs", "validate", join(dir, "outline.md"));
  assert.equal(ok.status, 0, ok.stdout);

  writeFileSync(join(dir, "figure.svg"), "<svg/>\n");
  const edited = node("artifact.mjs", "validate", join(dir, "outline.md"));
  assert.equal(edited.status, 1);
  assert.match(edited.stdout, /R1 did not write figure\.svg as it is now/);

  writeFileSync(join(dir, "outline.md"), OUTLINE("R7"));
  assert.match(node("artifact.mjs", "validate", join(dir, "outline.md")).stdout, /R7 is not in the run ledger/);

  writeFileSync(join(dir, "outline.md"), OUTLINE("-"));
  assert.equal(node("artifact.mjs", "validate", join(dir, "outline.md")).status, 0, "a figure not drawn yet may wait");
  const draft = "# P\n\n## Abstract\n\nx\n\n## Results\n\nFigure 1 shows it.\n";
  writeFileSync(join(dir, "paper.md"), draft);
  const checked = node("claims.mjs", "draft-check", join(dir, "paper.md"), "--outline", join(dir, "outline.md"));
  assert.equal(checked.status, 1);
  assert.match(checked.stdout, /F1 has no receipt/);
});

const DRAFT = `# A Paper

## Abstract

Coverage is 0.77 at n = 10 and 0.95 for Wilson (C1). The LLM judge agreed.

## Introduction

A large language model (LLM) judged it [@S1; @S9]. See Section Method and Section Appendix.

## Results

Coverage is 0.77 at n = 10 (C1), as Figure 1 and Figure 2 show. TODO: the rerun.
`;

test("draft-check fails on what a reader would catch, and lists what the author should look at", () => {
  const result = draftCheck(DRAFT, {
    ledger: new Set(["S1"]),
    figures: new Set(["F1", "F3"]),
    limits: new Map([["Results", 5]]),
  });
  const problems = result.problems.map((problem) => `${problem.kind}: ${problem.value}`);
  assert.ok(problems.includes("abstract number not in the body: 0.95"), problems.join("\n"));
  assert.ok(!problems.some((problem) => problem.includes("0.77")));
  assert.ok(problems.includes("citation not in the source ledger: S9"));
  assert.ok(problems.includes("reference to a figure the outline lacks: Figure 2"));
  assert.ok(problems.includes("outline figure the draft never names: Figure 3"));
  assert.ok(problems.includes("reference to a section the draft lacks: Section Method"));
  assert.ok(problems.includes("reference to a section the draft lacks: Section Appendix"));
  assert.ok(problems.some((problem) => problem.startsWith("over its word limit: Results")));
  const notes = result.notes.map((note) => `${note.kind}: ${note.value}`);
  assert.ok(
    notes.some((note) => note.startsWith("acronym used before its definition: LLM")),
    notes.join("\n"),
  );
  assert.ok(notes.includes("process word: TODO"));
  assert.ok(notes.includes("process word: rerun"));
  const clean = draftCheck(DRAFT.replace(" and 0.95 for Wilson", "").replace("The LLM judge agreed.", ""), {
    ledger: new Set(["S1", "S9"]),
  });
  assert.ok(!clean.problems.some((problem) => problem.kind === "abstract number not in the body"));
});

test("the venue copy drops claim-ID parentheses and lists IDs left in running text", () => {
  const venue = stripIds("Coverage is 0.77 (C1, L2). It holds (C2 and C3).\nC4 to C6 are exploratory (see Limits).\n");
  assert.equal(venue.text, "Coverage is 0.77. It holds.\nC4 to C6 are exploratory (see Limits).\n");
  assert.equal(venue.removed, 2);
  assert.deepEqual(
    venue.remaining.map((left) => left.id),
    ["C4", "C6"],
  );
});

test("a patch changes only the blocks it names, each for a finding, and only on the draft that was anchored", () => {
  const draft = "# Title\n\nFirst paragraph.\n\nSecond paragraph,\nover two lines.\n\nThird.\n";
  const manifest = anchor(draft, "paper.md");
  assert.deepEqual(
    manifest.blocks.map((block) => [block.id, block.start, block.end]),
    [
      ["B1", 1, 1],
      ["B2", 3, 3],
      ["B3", 5, 6],
      ["B4", 8, 8],
    ],
  );
  const { text, report } = applyPatch(draft, manifest, {
    base_sha256: manifest.sha256,
    changes: [
      { block: "B3", finding: "R6:1", op: "replace", text: "Second paragraph, revised." },
      { block: "B2", finding: "R6:2", op: "insert-after", text: "A new paragraph." },
      { block: "B4", finding: "R6:3", op: "delete" },
    ],
  });
  assert.equal(text, "# Title\n\nFirst paragraph.\n\nA new paragraph.\n\nSecond paragraph, revised.\n");
  assert.equal(report.untouched_blocks, 2);
  assert.deepEqual(
    report.changes.map((change) => change.finding),
    ["R6:1", "R6:2", "R6:3"],
  );
  assert.throws(() => applyPatch(`${draft}x\n`, manifest, { changes: [] }), /changed since it was anchored/);
  assert.throws(
    () =>
      applyPatch(draft, manifest, {
        base_sha256: manifest.sha256,
        changes: [{ block: "B2", op: "replace", text: "x" }],
      }),
    /name the finding/,
  );
  assert.throws(
    () =>
      applyPatch(draft, manifest, {
        base_sha256: manifest.sha256,
        changes: [{ block: "B9", finding: "x", op: "delete" }],
      }),
    /not a block/,
  );
});

test("the bibliography comes from the ledger, and a source not verified says so", () => {
  const rows = ledgerRows(`# Source Ledger: S

| ID | Source | Pin | Lookup | Checked | Read | Supports |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Brown, Cai and DasGupta 2001 | doi:10.1214/ss/1009213286 | verified | opened | full | coverage |
| S2 | Zheng et al. 2023 | arXiv:2306.05685 | not-looked-up | memory | - | judges |
| S3 | codex harness | codex@1a2b3c4d | verified | repository-read | full | turns |
`);
  const from = parseBib(
    "@article{brown2001,\n  author = {Brown, Lawrence D. and Cai, T. Tony},\n  title = {Interval Estimation for a Binomial Proportion},\n  doi = {10.1214/ss/1009213286},\n  year = 2001\n}\n",
  );
  const bib = bibFromLedger(rows, { from });
  assert.deepEqual(bib.unverified, ["S2"]);
  assert.deepEqual(bib.matched, ["S1"]);
  assert.match(bib.text, /@article\{S1,\n {2}author = \{Brown, Lawrence D\. and Cai, T\. Tony\}/);
  assert.match(
    bib.text,
    /@misc\{S2,[\s\S]*eprint = \{2306\.05685\}[\s\S]*note = \{unverified: lookup not-looked-up, checked memory\}/,
  );
  assert.match(bib.text, /howpublished = \{codex at commit 1a2b3c4d\}/);
  assert.doesNotMatch(bib.text.split("@misc{S3")[1], /note/);
});

test("check-pdf counts pages and refuses a missing required section", () => {
  const dir = folder();
  // A one-page PDF with an uncompressed page object, enough for the page count without pdfinfo.
  const pdf = [
    "%PDF-1.4",
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >> endobj",
    "trailer << /Root 1 0 R >>",
    "%%EOF",
  ].join("\n");
  writeFileSync(join(dir, "paper.pdf"), pdf);
  writeFileSync(join(dir, "paper.md"), "# P\n\n## Abstract\n\nx\n");
  const over = node("paper.mjs", "check-pdf", join(dir, "paper.pdf"), "--max-pages", "0");
  assert.equal(over.status, 1);
  assert.match(over.stdout, /1 page\(s\)/);
  const missing = node(
    "paper.mjs",
    "check-pdf",
    join(dir, "paper.pdf"),
    "--source",
    join(dir, "paper.md"),
    "--require",
    "Data availability",
  );
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /no "Data availability" section/);
  const fine = node(
    "paper.mjs",
    "check-pdf",
    join(dir, "paper.pdf"),
    "--source",
    join(dir, "paper.md"),
    "--require",
    "Abstract",
  );
  assert.equal(fine.status, 0, fine.stdout);
});

test("build records each command it runs, and the venue build has no claim IDs", (t) => {
  if (spawnSync("pandoc", ["--version"]).status !== 0) {
    t.skip("pandoc is not installed here");
    return;
  }
  const dir = folder();
  writeFileSync(join(dir, "paper.md"), "# P\n\n## Results\n\nCoverage is 0.77 (C1).\n");
  const built = node(
    "paper.mjs",
    "build",
    join(dir, "paper.md"),
    "--to",
    "html",
    "--venue",
    "--out",
    join(dir, "build", "paper.html"),
    "--ledger",
    join(dir, "runs.jsonl"),
  );
  assert.equal(built.status, 0, built.stderr);
  assert.doesNotMatch(readFileSync(join(dir, "build", "paper.html"), "utf8"), /\(C1\)/);
  const receipt = JSON.parse(readFileSync(join(dir, "runs.jsonl"), "utf8").trim());
  assert.equal(receipt.argv[0], "pandoc");
  assert.equal(receipt.exit_code, 0);
  assert.ok(receipt.outputs[0].sha256, "the output's hash is recorded");
});

test("init project lays out a research project and never overwrites one", () => {
  const dir = join(folder(), "project");
  const made = node("artifact.mjs", "init", "project", dir, "--title", "T", "--owner", "O");
  assert.equal(made.status, 0, made.stderr);
  for (const path of ["brief.md", "sources/sources.md", "sources/searches.jsonl", "claims.md", "paper/outline.md"])
    assert.ok(existsSync(join(dir, path)), path);
  for (const path of ["study/results", "paper/figures", "paper/build", "reviews"])
    assert.ok(existsSync(join(dir, path)), path);
  assert.match(readFileSync(join(dir, "paper/outline.md"), "utf8"), /\*\*Register:\*\* \.\.\/claims\.md/);
  const again = node("artifact.mjs", "init", "project", dir, "--title", "T", "--owner", "O");
  assert.equal(again.status, 2);
  assert.match(again.stderr, /not empty/);
  mkdirSync(join(dir, "extra"));
  assert.ok(readdirSync(dir).includes("extra"));
});

test("an outline's figure needs its file, and its receipt is R<n> or -", () => {
  const text = OUTLINE("drawn").replace("| figure.svg |", "| - |");
  const problems = validate("paper-outline", text).problems;
  assert.ok(
    problems.some((problem) => problem.includes("File names the figure's file")),
    problems.join("\n"),
  );
  assert.ok(problems.some((problem) => problem.includes("Receipt is the run that drew the figure")));
});

test("draft-check counts the body without the abstract, keeps figures in order, and allows the paper's own words", () => {
  const draft = `---
title: P
---

# P

## Abstract

One two three four five.

## Results

Figure 2 comes first here, then Figure 1. The patch was applied in round two.

## References
`;
  const result = draftCheck(draft, { limits: new Map([["total", 12]]), allow: new Set(["patch"]) });
  assert.equal(result.words.total, 15);
  assert.ok(result.problems.some((problem) => problem.kind === "over its word limit"));
  assert.ok(result.problems.some((problem) => problem.value === "Figure 1 is first named after Figure 2"));
  const notes = result.notes.map((note) => note.value);
  assert.ok(notes.includes("round"));
  assert.ok(!notes.includes("patch"), "an allowed process word is not listed");
});

test("a receipt records paths relative to its ledger, and a figure carries its title and description", () => {
  const dir = figureFolder();
  const outside = folder();
  writeFileSync(join(outside, "input.txt"), "x\n");
  const ran = node(
    "paper.mjs",
    "run",
    "--ledger",
    join(dir, "runs.jsonl"),
    "--input",
    join(outside, "input.txt"),
    "--",
    "true",
  );
  assert.equal(ran.status, 0, ran.stderr);
  const receipt = JSON.parse(readFileSync(join(dir, "runs.jsonl"), "utf8").trim());
  assert.equal(receipt.inputs[0].path, relative(dir, join(outside, "input.txt")));
  const svg = drawFigure({ ...SPEC, title: "Coverage", description: "Wald below Wilson" }, join(dir, "spec.json")).svg;
  assert.match(svg, /<title>Coverage<\/title>\n<desc>Wald below Wilson<\/desc>/);
});

test("each list item is its own block, and a CSV row with the wrong field count is refused", () => {
  const draft = "## Limits\n\n- One trial.\n- One model,\n  one benchmark.\n- Labels not re-run.\n";
  const manifest = anchor(draft, "paper.md");
  assert.deepEqual(
    manifest.blocks.map((block) => [block.id, block.start, block.end]),
    [
      ["B1", 1, 1],
      ["B2", 3, 3],
      ["B3", 4, 5],
      ["B4", 6, 6],
    ],
  );
  const { text } = applyPatch(draft, manifest, {
    base_sha256: manifest.sha256,
    changes: [
      { block: "B2", finding: "R8:4", op: "replace", text: "- One trial; a second changed 2 of 10 verdicts." },
      { block: "B3", finding: "R8:6", op: "insert-after", text: "- Cost is an estimate." },
    ],
  });
  assert.equal(
    text,
    "## Limits\n\n- One trial; a second changed 2 of 10 verdicts.\n- One model,\n  one benchmark.\n- Cost is an estimate.\n- Labels not re-run.\n",
  );
  const dir = folder();
  writeFileSync(join(dir, "data.csv"), "label,n,y\nall, decided,10,0.5\n");
  writeFileSync(join(dir, "spec.json"), "{}");
  assert.throws(
    () =>
      drawFigure(
        { type: "bar", data: "data.csv", series: [{ label: "a", x: "label", y: "y" }] },
        join(dir, "spec.json"),
      ),
    /row 2 has 4 fields, the header 3/,
  );
});

test("a figure's receipt fails when its file was never written, it exited non-zero, its data changed, or its spec reads other data", () => {
  const dir = figureFolder();
  writeFileSync(join(dir, "claims.md"), "| ID | Claim |\n| --- | --- |\n| C1 | x |\n");
  const run = (...command) =>
    node(
      "paper.mjs",
      "run",
      "--ledger",
      join(dir, "runs.jsonl"),
      "--input",
      join(dir, "spec.json"),
      "--input",
      join(dir, "data.json"),
      "--output",
      join(dir, "figure.svg"),
      "--",
      ...command,
    );
  run("true"); // R1: declares the figure, never writes it
  writeFileSync(join(dir, "outline.md"), OUTLINE("R1"));
  assert.match(
    node("artifact.mjs", "validate", join(dir, "outline.md")).stdout,
    /the figure file figure\.svg does not exist/,
  );
  run("false"); // R2: exits 1
  writeFileSync(join(dir, "outline.md"), OUTLINE("R2"));
  assert.match(node("artifact.mjs", "validate", join(dir, "outline.md")).stdout, /R2 exited with 1/);
  run(process.execPath, join(SCRIPTS, "figure.mjs"), "draw", join(dir, "spec.json"), "--out", join(dir, "figure.svg")); // R3
  writeFileSync(join(dir, "outline.md"), OUTLINE("R3"));
  assert.equal(node("artifact.mjs", "validate", join(dir, "outline.md")).status, 0);
  writeFileSync(join(dir, "data.json"), ROWS.replace("0.7699", "0.7700"));
  assert.match(
    node("artifact.mjs", "validate", join(dir, "outline.md")).stdout,
    /R3 did not read data\.json as it is now/,
  );
  // A spec that draws from another file than the outline's Data.
  writeFileSync(join(dir, "other.json"), ROWS);
  writeFileSync(join(dir, "spec.json"), JSON.stringify({ ...SPEC, data: "other.json" }));
  run(process.execPath, join(SCRIPTS, "figure.mjs"), "draw", join(dir, "spec.json"), "--out", join(dir, "figure.svg")); // R4
  writeFileSync(join(dir, "outline.md"), OUTLINE("R4"));
  assert.match(
    node("artifact.mjs", "validate", join(dir, "outline.md")).stdout,
    /R4's figure spec draws from other\.json, not data\.json/,
  );
});

test("a paper's receipt in a study's ledger is not counted as a pilot", () => {
  const dir = folder();
  const plan = join(dir, "plan.md");
  assert.equal(node("artifact.mjs", "init", "study-plan", plan, "--title", "T", "--owner", "O").status, 0);
  node("paper.mjs", "run", "--ledger", join(dir, "runs.jsonl"), "--", "true");
  const manifest = node("study.mjs", "manifest", plan, "--json");
  assert.equal(JSON.parse(manifest.stdout).beforeLock, 0, manifest.stdout);
});

test("apply refuses a patch written for another draft and never overwrites the reviewed draft", () => {
  const dir = folder();
  const draft = "# T\n\nClaim A is 0.5.\n";
  writeFileSync(join(dir, "paper.md"), draft);
  assert.equal(node("paper.mjs", "anchor", join(dir, "paper.md")).status, 0);
  const manifest = JSON.parse(readFileSync(join(dir, "paper.blocks.json"), "utf8"));
  assert.throws(
    () =>
      applyPatch(draft, manifest, {
        base_sha256: "0".repeat(64),
        changes: [{ block: "B2", finding: "R1", op: "delete" }],
      }),
    /base_sha256 must be the anchored draft's sha256/,
  );
  writeFileSync(
    join(dir, "patch.json"),
    JSON.stringify({ base_sha256: manifest.sha256, changes: [{ block: "B2", finding: "R1", op: "delete" }] }),
  );
  const over = node(
    "paper.mjs",
    "apply",
    join(dir, "paper.md"),
    "--patch",
    join(dir, "patch.json"),
    "--out",
    join(dir, "paper.md"),
  );
  assert.equal(over.status, 1);
  assert.match(over.stderr, /--out is the reviewed draft/);
  assert.equal(readFileSync(join(dir, "paper.md"), "utf8"), draft);
});

test("a check that cannot run says so: no ledger, no outline, no body sections, a limit that is not a number", () => {
  const result = draftCheck("# P\n\nSee [@S9].\n", { limits: new Map([["total", 5]]) });
  const notes = result.notes.map((note) => `${note.kind}: ${note.value}`);
  assert.ok(notes.includes("not checked: [@S<n>] citations (no source ledger given)"), notes.join("\n"));
  assert.ok(notes.includes("not checked: figures against an outline (no outline given)"));
  assert.ok(result.problems.some((problem) => problem.kind === "word limit not checked"));
  const dir = folder();
  writeFileSync(join(dir, "paper.pdf"), "%PDF-1.4\n3 0 obj << /Type /Page >> endobj\n%%EOF\n");
  const bad = node("paper.mjs", "check-pdf", join(dir, "paper.pdf"), "--max-pages", "abc");
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /--max-pages must be a whole number/);
});
