import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

const brief = (rigor) => `# Research Brief: Retries

> **Type:** Research Brief
> **Status:** Accepted
> **Owner:** Hassan Mohiddin
> **Source:** the user's reply in the task's Working Record
> **Rigor:** ${rigor}

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

const ledger = (checked = "opened") => `# Source Ledger: Retries

> **Type:** Source Ledger
> **Status:** Draft
> **Owner:** Hassan Mohiddin

| ID | Source | Pin | Lookup | Checked | Read | Supports |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | A design note on retries | https://example.org/note (accessed 2026-10-27) | verified | ${checked} | full | C1, C2 |
`;

const register = (numbers = "2") => `# Claims Register: Retries

> **Type:** Claims Register
> **Status:** Draft
> **Owner:** Hassan Mohiddin

| ID | Claim | Numbers | Source | Level | Kind | Scope | Limit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C1 | The harness retries a failed call twice when the policy allows it | ${numbers} | S1 | L2 | exploratory | the design note | not run |
`;

const REPORT = `# Research: Retries

## Answer

The harness retries a failed call 2 times when the policy allows it (C1): "retries a failed call twice when the policy allows it" (S1).
`;

/** A research folder in init project's layout, at the given rigor, whose checks pass. */
function project(rigor, { report = REPORT } = {}) {
  const folder = mkdtempSync(join(tmpdir(), "research-gate-"));
  mkdirSync(join(folder, "sources"), { recursive: true });
  mkdirSync(join(folder, "reviews"), { recursive: true });
  writeFileSync(join(folder, "brief.md"), brief(rigor));
  writeFileSync(join(folder, "sources", "sources.md"), ledger());
  writeFileSync(
    join(folder, "sources", "note.txt"),
    "Before. The harness retries a failed call twice when the policy allows it. After.",
  );
  writeFileSync(join(folder, "sources", "searches.jsonl"), "");
  writeFileSync(join(folder, "claims.md"), register());
  writeFileSync(join(folder, "report.md"), report);
  const copy = `S1=${join(folder, "sources", "note.txt")}`;
  return { folder, copy };
}

/** Build the support packets and answer each one as supported, quoting its evidence. */
function answer(folder, copy) {
  const packets = join(folder, "reviews", "support-packets.jsonl");
  const built = node(
    "claims.mjs",
    "support",
    join(folder, "report.md"),
    "--register",
    join(folder, "claims.md"),
    "--ledger",
    join(folder, "sources", "sources.md"),
    "--copy",
    copy,
    "--out",
    packets,
  );
  assert.equal(built.status, 0, built.stdout);
  writeFileSync(
    join(folder, "reviews", "support-verdicts.jsonl"),
    `${JSON.stringify({ packet: "P1", verdict: "supported", quote: "retries a failed call twice" })}\n`,
  );
}

test("at check rigor the gate passes a brief, a ledger and a report whose quote is in its source", () => {
  const { folder, copy } = project("check");
  const result = gate(folder, "--copy", copy);
  assert.equal(result.status, 0, JSON.stringify(result.checks, null, 2));
  assert.equal(result.rigor, "check");
  assert.equal(result.ready, true);
  for (const id of ["brief", "sources", "register", "report-cite", "report-trace"])
    assert.equal(check(result, id).status, "passed", id);
  // Citation support is not required below publication, and no answers exist, so it is not listed.
  assert.equal(check(result, "support"), undefined);
});

test("at check rigor a register is optional, but a misquote, a missing brief or an uncopied source fails", () => {
  const { folder, copy } = project("check", {
    report: REPORT.replace('twice when the policy allows it" (S1)', 'three times on every call" (S1)'),
  });
  const misquoted = gate(folder, "--copy", copy);
  assert.equal(misquoted.status, 1);
  assert.equal(check(misquoted, "report-cite").status, "failed");
  assert.match(check(misquoted, "report-cite").command, /sources\.mjs cite-check/);

  // Without --copy the quote cannot be checked: cite-check exits 0, and the gate still refuses it.
  const unchecked = gate(project("check").folder);
  assert.equal(unchecked.status, 1);
  assert.equal(check(unchecked, "report-cite").status, "failed");
  assert.match(check(unchecked, "report-cite").reason, /1 not checked/);

  const bare = project("check");
  writeFileSync(join(bare.folder, "claims.md"), "");
  // An empty register file is present, so it must be checked, and one that cannot be read holds the gate; one that
  // init wrote and nobody filled counts as absent.
  const empty = gate(bare.folder, "--copy", bare.copy);
  assert.equal(check(empty, "register").status, "not run");
  assert.equal(check(empty, "register").required, true);
  assert.equal(empty.status, 1);
  const made = node(
    "artifact.mjs",
    "init",
    "claims-register",
    join(bare.folder, "fresh.md"),
    "--title",
    "R",
    "--owner",
    "O",
  );
  assert.equal(made.status, 0);
  const skeleton = gate(bare.folder, "--copy", bare.copy, "--claims", join(bare.folder, "fresh.md"));
  assert.equal(check(skeleton, "register").status, "not run");
  assert.equal(check(skeleton, "register").required, false);
  assert.equal(skeleton.status, 0, JSON.stringify(skeleton.checks, null, 2));

  const noBrief = gate(folder, "--copy", copy, "--brief", join(folder, "missing.md"), "--rigor", "check");
  assert.equal(check(noBrief, "brief").status, "not run");
  assert.equal(noBrief.rigor_from, "--rigor");
  assert.equal(noBrief.status, 1);
});

test("at study rigor the register is required and every number must trace to it", () => {
  const { folder, copy } = project("study");
  assert.equal(gate(folder, "--copy", copy).status, 0);

  writeFileSync(join(folder, "claims.md"), register("3"));
  const untraced = gate(folder, "--copy", copy);
  assert.equal(untraced.status, 1);
  assert.equal(check(untraced, "report-trace").status, "failed");
  assert.ok(untraced.todo.some((item) => item.startsWith("report: numbers and claim IDs:")));

  const missing = gate(folder, "--copy", copy, "--claims", join(folder, "none.md"));
  assert.equal(check(missing, "register").status, "not run");
  assert.equal(check(missing, "register").required, true);
  assert.equal(check(missing, "report-trace").status, "not run");
  assert.equal(missing.status, 1);
});

test("a study plan present is validated and checked; one never locked holds the gate", () => {
  const { folder, copy } = project("study");
  mkdirSync(join(folder, "study"));
  const made = node(
    "artifact.mjs",
    "init",
    "study-plan",
    join(folder, "study", "plan.md"),
    "--title",
    "R",
    "--owner",
    "O",
  );
  assert.equal(made.status, 0);
  const result = gate(folder, "--copy", copy);
  assert.equal(result.status, 1);
  assert.equal(check(result, "plan").status, "failed");
  assert.notEqual(check(result, "study").status, "passed");
  assert.match(check(result, "register").command, /--plan/);
  assert.match(check(result, "report-trace").command, /--results/);
});

const PLAN = `# Study Plan: Retries

> **Type:** Study Plan
> **Status:** Draft
> **Owner:** Hassan Mohiddin
> **Rigor:** check

## 1. The claim

The harness retries a failed call twice.

## 3. The prediction

Two retries; no power computation applies, since one run counts them.

## 4. Compared to what

No baseline: one run counts the retries.

## 5. The unit and the count

One run of one call.

## 10. The interval

None: a count from one run.

## Hypotheses

| ID | Hypothesis | Kind | Metric | Decision rule | Method |
| --- | --- | --- | --- | --- | --- |
| C1 | The harness retries twice | exploratory | - | - | - |

## Planned runs

| Unit | Arm | Trials | Budget |
| --- | --- | --- | --- |
| t1 | a | 1 | control |

## Amendments

none
`;

test("a locked quick check with its run recorded passes, with its numbers traced to the result file", () => {
  const { folder, copy } = project("check");
  mkdirSync(join(folder, "study", "results"), { recursive: true });
  const plan = join(folder, "study", "plan.md");
  writeFileSync(plan, PLAN);
  assert.equal(node("study.mjs", "lock", plan, "--by", "Hassan: yes (2026-10-28)").status, 0);
  const ran = spawnSync(
    process.execPath,
    [
      join(SCRIPTS, "study.mjs"),
      "run",
      "plan.md",
      "--unit",
      "t1",
      "--arm",
      "a",
      "--trial",
      "1",
      "--output",
      "results/r.json",
      "--",
      process.execPath,
      "-e",
      "require('fs').writeFileSync('results/r.json', JSON.stringify({ retries: 2 }))",
    ],
    { cwd: join(folder, "study"), encoding: "utf8" },
  );
  assert.equal(ran.status, 0, ran.stderr);
  // With a plan, trace runs with --results, so the register's number must come from a result file.
  const traced = gate(folder, "--copy", copy);
  assert.equal(check(traced, "report-trace").status, "failed");
  writeFileSync(join(folder, "claims.md"), register().replace("| S1 |", "| S1; study/results/r.json |"));
  const result = gate(folder, "--copy", copy);
  assert.equal(result.status, 0, JSON.stringify(result.checks, null, 2));
  for (const id of ["plan", "study", "register", "report-trace"]) assert.equal(check(result, id).status, "passed", id);

  // A planned trial with no receipt holds the analysis, and the gate with it.
  writeFileSync(plan, PLAN.replace("| t1 | a | 1 | control |", "| t1 | a | 2 | control |"));
  assert.equal(node("study.mjs", "amend", plan, "--by", "Hassan", "--reason", "a second trial").status, 0);
  const held = check(gate(folder, "--copy", copy), "study");
  assert.equal(held.status, "failed");
  assert.ok(
    held.output.some((line) => /trial/.test(line)),
    held.output.join("\n"),
  );
});

test("the brief's rigor wins, and a different --rigor fails the gate", () => {
  const { folder, copy } = project("publication");
  const result = gate(folder, "--copy", copy, "--rigor", "check");
  assert.equal(result.rigor, "publication");
  assert.equal(check(result, "rigor").status, "failed");
  assert.equal(result.status, 1);
});

test("at publication rigor citation support is required, on packets that still match the report", () => {
  const { folder, copy } = project("publication");
  const before = gate(folder, "--copy", copy);
  assert.equal(before.status, 1);
  assert.equal(check(before, "support").status, "not run");
  assert.ok(before.todo.some((item) => /claims\.mjs support/.test(item)));
  assert.ok(before.todo.some((item) => /Review Work's artifact review/.test(item)));

  answer(folder, copy);
  const after = gate(folder, "--copy", copy);
  assert.equal(after.status, 0, JSON.stringify(after.checks, null, 2));
  assert.equal(check(after, "support").status, "passed");
  assert.equal(check(after, "opened").status, "passed");

  // The report's claim changes after the packets were answered: the answers are for another text.
  writeFileSync(join(folder, "claims.md"), register("2").replace("twice when", "twice, and logs it, when"));
  const stale = gate(folder, "--copy", copy);
  assert.equal(check(stale, "support").status, "failed");
  assert.match(check(stale, "support").reason, /not what the report/);

  // An open answer holds it too.
  writeFileSync(join(folder, "claims.md"), register());
  writeFileSync(
    join(folder, "reviews", "support-verdicts.jsonl"),
    `${JSON.stringify({ packet: "P1", verdict: "partial", quote: "retries a failed call twice", missing: "the count" })}\n`,
  );
  assert.equal(check(gate(folder, "--copy", copy), "support").status, "failed");
});

test("at publication rigor a source known only from its abstract fails the gate", () => {
  const { folder, copy } = project("publication");
  answer(folder, copy);
  writeFileSync(join(folder, "sources", "sources.md"), ledger("abstract"));
  const result = gate(folder, "--copy", copy);
  assert.equal(check(result, "opened").status, "failed");
  assert.match(check(result, "opened").reason, /S1 \(abstract\)/);
  assert.equal(result.status, 1);
});

test("a paper gets its outline and draft checks, and at publication rigor its PDF", () => {
  const { folder, copy } = project("publication");
  answer(folder, copy);
  mkdirSync(join(folder, "paper"));
  writeFileSync(
    join(folder, "paper", "paper.md"),
    "# Retries\n\n## Abstract\n\nThe harness retries twice (C1).\n\n## Results\n\nThe harness retries a failed call 2 times (C1) [@S1].\n",
  );
  const result = gate(folder, "--copy", copy);
  assert.equal(check(result, "outline").status, "not run");
  assert.equal(check(result, "outline").required, true);
  assert.equal(check(result, "draft").status, "passed");
  assert.equal(check(result, "paper-trace").status, "passed");
  // The paper cites only with [@S1], which draft-check checks, so cite-check finding no quote is not a gap.
  assert.equal(check(result, "paper-cite").status, "passed");
  assert.equal(check(result, "pdf").status, "not run");
  assert.match(check(result, "pdf").reason, /paper\.pdf/);
  // The build it names is one paper.mjs build accepts.
  assert.match(
    check(result, "pdf").todo ?? result.todo.join("\n"),
    /paper\.mjs build .*--to pdf --out .*paper\.pdf --ledger .*runs\.jsonl --venue/,
  );
  assert.equal(result.status, 1);
  // The packets come from the report and the paper; the paper gives C1 no other evidence, so they still match.
  assert.equal(check(result, "support").status, "passed");
  assert.equal(check(result, "coverage").status, "passed");

  // A source the ledger lacks fails the draft check.
  writeFileSync(
    join(folder, "paper", "paper.md"),
    "# Retries\n\n## Abstract\n\nThe harness retries twice (C1).\n\n## Results\n\nThe harness retries a failed call 2 times (C1) [@S9].\n",
  );
  const unlisted = check(gate(folder, "--copy", copy), "draft");
  assert.equal(unlisted.status, "failed");
  assert.match(unlisted.reason, /1 problem/);
  writeFileSync(
    join(folder, "paper", "paper.md"),
    "# Retries\n\n## Abstract\n\nThe harness retries twice (C1).\n\n## Results\n\nThe harness retries a failed call 2 times (C1) [@S1].\n",
  );

  // A built PDF is checked against the limits given.
  mkdirSync(join(folder, "paper", "build"));
  writeFileSync(join(folder, "paper", "build", "paper.pdf"), "%PDF-1.4\n1 0 obj << /Type /Page >> endobj\n%%EOF\n");
  assert.equal(check(gate(folder, "--copy", copy, "--max-pages", "1"), "pdf").status, "passed");
  const over = check(gate(folder, "--copy", copy, "--max-pages", "0"), "pdf");
  assert.equal(over.status, "failed");
  assert.match(over.command, /check-pdf .*--max-pages 0/);

  // At publication, a PDF checked against no venue limit or required section is not checked.
  const unchecked = gate(folder, "--copy", copy);
  assert.equal(check(unchecked, "pdf").status, "failed");
  assert.match(check(unchecked, "pdf").reason, /not checked against the venue/);
  assert.ok(unchecked.todo.some((item) => /--max-pages <n>, --max-words <n>, --require <section>/.test(item)));
});

test("a PDF whose pages or words cannot be read, with no limit given, is not checked", () => {
  const { folder, copy } = project("check");
  mkdirSync(join(folder, "paper", "build"), { recursive: true });
  writeFileSync(join(folder, "paper", "build", "paper.pdf"), "not a PDF at all\n");
  const result = gate(folder, "--copy", copy);
  const pdf = check(result, "pdf");
  assert.equal(pdf.status, "failed");
  assert.ok(
    pdf.output.some((line) => /not checked: pages/.test(line)),
    pdf.output.join("\n"),
  );
  // Below publication a PDF is not required, so what it could not read is shown and holds nothing.
  assert.equal(pdf.required, false);
  assert.equal(result.status, 0, result.stdout);
  const direct = node("paper.mjs", "check-pdf", join(folder, "paper", "build", "paper.pdf"));
  assert.equal(direct.status, 1);
  assert.match(direct.stdout, /not checked: words/);
});

test("at publication every claim cited with a code citation or quote needs a packet, unless the author marks it out", () => {
  const { folder, copy } = project("publication");
  answer(folder, copy);
  // A second cited claim, quoted, added after the packets were answered: support still passes on C1 alone.
  writeFileSync(
    join(folder, "claims.md"),
    `${register()}| C2 | The harness logs every retry to a file | - | S1 | L2 | exploratory | the design note | not run |\n`,
  );
  writeFileSync(
    join(folder, "report.md"),
    `${REPORT}\nThe harness logs every retry to a file (C2): "retries a failed call twice" (S1).\n`,
  );
  const uncovered = gate(folder, "--copy", copy);
  assert.equal(check(uncovered, "support").status, "passed");
  assert.equal(check(uncovered, "coverage").status, "failed");
  assert.match(check(uncovered, "coverage").reason, /have no packet: C2$/);
  assert.ok(uncovered.todo.some((item) => /--only C1,C2/.test(item) && /--unsupported-ok C2/.test(item)));
  assert.equal(uncovered.status, 1);

  // Marked out by the author: the gate passes and says what it did not check.
  const marked = gate(folder, "--copy", copy, "--unsupported-ok", "C2");
  assert.equal(check(marked, "coverage").status, "passed");
  assert.ok(marked.todo.includes("citation support: C2 not support-checked by the author's choice (--unsupported-ok)"));
  assert.equal(marked.status, 0, JSON.stringify(marked.checks, null, 2));
  assert.equal(node("research.mjs", "gate", folder, "--unsupported-ok", "two").status, 2);

  // A claim only the paper quotes is covered too: the packets are built from the report and the paper.
  writeFileSync(join(folder, "report.md"), REPORT);
  mkdirSync(join(folder, "paper"));
  writeFileSync(
    join(folder, "paper", "paper.md"),
    '# Retries\n\n## Results\n\nThe harness retries a failed call 2 times (C1) [@S1].\n\nIt logs every retry to a file (C2): "retries a failed call twice" (S1).\n',
  );
  const paper = gate(folder, "--copy", copy);
  assert.match(check(paper, "coverage").reason, /have no packet: C2$/);
  assert.match(check(paper, "support").command ?? "", /support-check/);
  assert.ok(paper.todo.some((item) => /claims\.mjs support \S*report\.md \S*paper\.md /.test(item)));
});

test("a register with a confirmatory claim and no study plan fails, naming the claims", () => {
  const { folder, copy } = project("study");
  writeFileSync(join(folder, "claims.md"), register().replace("| exploratory |", "| confirmatory |"));
  const result = gate(folder, "--copy", copy);
  assert.equal(check(result, "plan").status, "failed");
  assert.match(check(result, "plan").reason, /confirmatory claim\(s\) C1$/);
  assert.equal(result.status, 1);
  // Exploratory claims need no plan.
  writeFileSync(join(folder, "claims.md"), register());
  const fine = gate(folder, "--copy", copy);
  assert.equal(check(fine, "plan"), undefined);
  assert.equal(fine.status, 0);
});

test("a passed check's notes show beneath it, and a report that cites nothing is not checked", () => {
  const { folder, copy } = project("check");
  mkdirSync(join(folder, "study", "results"), { recursive: true });
  const plan = join(folder, "study", "plan.md");
  writeFileSync(plan, PLAN);
  assert.equal(node("study.mjs", "lock", plan, "--by", "Hassan: yes (2026-10-28)").status, 0);
  const ran = spawnSync(
    process.execPath,
    [
      join(SCRIPTS, "study.mjs"),
      "run",
      "plan.md",
      "--unit",
      "t1",
      "--arm",
      "a",
      "--trial",
      "1",
      "--output",
      "results/r.json",
      "--",
      process.execPath,
      "-e",
      "require('fs').writeFileSync('results/r.json', JSON.stringify({ retries: 2 }))",
    ],
    { cwd: join(folder, "study"), encoding: "utf8" },
  );
  assert.equal(ran.status, 0, ran.stderr);
  writeFileSync(join(folder, "claims.md"), register().replace("| S1 |", "| S1; study/results/r.json |"));
  const json = check(gate(folder, "--copy", copy), "study");
  assert.equal(json.status, "passed");
  assert.ok(
    json.notes.some((note) => /not anchored in git/.test(note)),
    json.notes.join("\n"),
  );
  const summary = node("research.mjs", "gate", folder, "--copy", copy).stdout;
  assert.match(summary, /passed +study records: [^\n]*\n +note: lock is not anchored in git/);

  writeFileSync(join(folder, "report.md"), "# Research: Retries\n\n## Answer\n\nThe harness retries a failed call.\n");
  const bare = gate(folder, "--copy", copy);
  assert.equal(check(bare, "report-cite").status, "not run");
  assert.equal(check(bare, "report-cite").reason, "no citations found: nothing was checked");
  assert.equal(bare.status, 1);
});

test("a check that exits 1 keeps what it wrote to stderr", () => {
  // A copy of the scripts whose validator writes its reason to stderr and exits 1.
  const scripts = mkdtempSync(join(tmpdir(), "research-gate-scripts-"));
  cpSync(SCRIPTS, scripts, { recursive: true });
  writeFileSync(join(scripts, "artifact.mjs"), 'console.error("the reason it failed"); process.exit(1);\n');
  const { folder, copy } = project("check");
  const result = spawnSync(
    process.execPath,
    [join(scripts, "research.mjs"), "gate", folder, "--copy", copy, "--json"],
    {
      encoding: "utf8",
    },
  );
  const brief = JSON.parse(result.stdout).checks.find((each) => each.id === "brief");
  assert.equal(brief.status, "failed");
  assert.equal(brief.reason, "the reason it failed");
});

test("the summary names each check and what is left, and a usage error exits 2", () => {
  const { folder, copy } = project("study");
  writeFileSync(join(folder, "claims.md"), register("3"));
  const text = node("research.mjs", "gate", folder, "--copy", copy);
  assert.equal(text.status, 1);
  assert.match(text.stdout, /study rigor \(from .*brief\.md\)/);
  assert.match(text.stdout, /passed +research brief/);
  assert.match(text.stdout, /failed +report: numbers and claim IDs/);
  assert.match(text.stdout, /ran: node .*claims\.mjs trace/);
  assert.match(text.stdout, /Not ready: 1 required check\(s\) failed, 0 could not run/);
  assert.match(text.stdout, /Left to do:/);
  assert.equal(node("research.mjs", "gate").status, 2);
  assert.equal(node("research.mjs", "gate", folder, "--rigor", "loose").status, 2);
  assert.equal(readFileSync(join(folder, "claims.md"), "utf8"), register("3"));
});

test("the gate finds a source's saved copy in sources/ by its ID or its pin, so quotes are checked without --copy", () => {
  const { folder } = project("check");
  // Without --copy, and no copy named for S1, the quote is not checked.
  assert.equal(check(gate(folder), "report-cite").status, "failed");
  // A copy named for the ID is found.
  mkdirSync(join(folder, "sources", "copies"), { recursive: true });
  cpSync(join(folder, "sources", "note.txt"), join(folder, "sources", "copies", "S1.txt"));
  const byId = gate(folder);
  assert.equal(check(byId, "report-cite").status, "passed", JSON.stringify(check(byId, "report-cite"), null, 2));
  assert.match(byId.copies.join("\n"), /S1=.*copies\/S1\.txt/);
  // A copy named for an arXiv pin is found too.
  const arxiv = mkdtempSync(join(tmpdir(), "research-gate-"));
  cpSync(folder, arxiv, { recursive: true });
  writeFileSync(
    join(arxiv, "sources", "sources.md"),
    ledger().replace("https://example.org/note (accessed 2026-10-27)", "arXiv:2306.05685v4"),
  );
  const pinned = join(arxiv, "sources", "copies", "2306.05685v4.txt");
  cpSync(join(arxiv, "sources", "copies", "S1.txt"), pinned);
  rmSync(join(arxiv, "sources", "copies", "S1.txt"));
  assert.equal(check(gate(arxiv), "report-cite").status, "passed");
  // The ID's own copy wins over the pin's, as the more specific name, and a --copy given wins over both.
  writeFileSync(join(arxiv, "sources", "copies", "S1.txt"), "nothing quoted here");
  assert.equal(check(gate(arxiv), "report-cite").status, "failed");
  assert.equal(check(gate(arxiv, "--copy", `S1=${pinned}`), "report-cite").status, "passed");
});
