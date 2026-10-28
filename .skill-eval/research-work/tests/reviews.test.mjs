// Literature and systematic reviews: screening criteria tagged by stage, a model screener that counts only with a
// passing judge record for its rubric, agreement between two screeners, the flow from identification to inclusion drawn from the
// ledger, risk of bias in the evidence table, and pooling effect sizes. Each check has a case that must fail.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { drawFigure } from "../../../skills/research-work/scripts/lib/figure.mjs";
import { judgeCounts, searchCounts, validate } from "../../../skills/research-work/scripts/lib/formats.mjs";
import { metaFixed, metaLeaveOneOut, metaRandom } from "../../../skills/research-work/scripts/lib/stats.mjs";

const SCRIPTS = fileURLToPath(new URL("../../../skills/research-work/scripts/", import.meta.url));
const node = (script, ...args) => spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { encoding: "utf8" });
const folder = () => mkdtempSync(join(tmpdir(), "research-reviews-"));
const lines = (...records) => records.map((record) => JSON.stringify(record)).join("\n");
const problemsOf = (text, options) => validate("search-ledger", text, options).problems.join("\n");

const QUERY = { kind: "query", id: "Q1", query: "judge bias", database: "arXiv", date: "2026-10-27" };
const QUERY2 = { kind: "query", id: "Q2", query: "judge bias", database: "Scopus", date: "2026-10-27" };
const E1 = { kind: "criterion", id: "E1", text: "not about model judges", stage: "title-abstract" };
const E2 = { kind: "criterion", id: "E2", text: "no agreement measured against people", stage: "full-text" };
const PERSON = { kind: "screener", id: "P1", person: "Hassan Mohiddin" };
const MODEL = { kind: "screener", id: "M1", model: "claude-haiku-5-5", judge: "judge.md", rubric: "criteria.md" };
const hit = (title, fields) => ({ kind: "hit", query: "Q1", title, ...fields });

const judgeRecord = (overrides = {}) =>
  [
    "# Judge Validation: Screening judge",
    "",
    "> **Type:** Judge Validation",
    "> **Status:** Draft",
    "> **Owner:** Hassan Mohiddin",
    ...Object.entries({
      Judge: "claude-haiku-5-5, thinking low",
      Rubric: "criteria.md",
      "Rubric sha256": RUBRIC_SHA,
      "Gold items": "100",
      Agreement: "0.90",
      Interval: "[0.83, 0.94] wilson",
      "Required lower bound": "0.80",
      "Both orders": "not applicable",
      "Length control": "passed",
      Decoys: "passed",
      Repeatability: "passed",
      "Judge and graded": "different model",
      Result: "pass",
      ...overrides,
    }).map(([name, value]) => `> **${name}:** ${value}`),
    "",
    "## Notes",
    "",
    "A person screened 100 hits drawn at random; the decoys were on-topic titles about human raters.",
    "",
  ].join("\n");

// The rubric the model screener was given, and the hash its judge record was validated on.
const RUBRIC_TEXT = "Exclude a hit not about model judges (E1).\n";
const sha = (text) => createHash("sha256").update(text).digest("hex");
const RUBRIC_SHA = sha(RUBRIC_TEXT);
const RUBRICS = new Map([["criteria.md", RUBRIC_SHA]]);

test("a criterion tagged full-text cannot exclude a hit at the title-and-abstract stage", () => {
  const ok = lines(
    QUERY,
    E1,
    E2,
    hit("A", { state: "excluded", criterion: "E1", stage: "title-abstract" }),
    // A title-abstract criterion may also exclude at full text.
    hit("B", { state: "excluded", criterion: "E1", stage: "full-text" }),
    hit("C", { state: "excluded", criterion: "E2", stage: "full-text" }),
    hit("D", { state: "included", stage: "full-text", source: "S1" }),
  );
  assert.equal(problemsOf(ok), "");
  const early = lines(QUERY, E1, E2, hit("A", { state: "excluded", criterion: "E2", stage: "title-abstract" }));
  assert.match(problemsOf(early), /line 4: the hit is excluded at title-abstract by E2, a full-text criterion/);
});

test("an exclusion must cite a criterion defined on an earlier line, with its stage, and only an exclusion cites one", () => {
  const problems = problemsOf(
    lines(
      QUERY,
      E1,
      hit("A", { state: "excluded", criterion: "E9", stage: "full-text" }),
      hit("B", { state: "excluded", criterion: "E1" }),
      hit("C", { state: "included", criterion: "E1", stage: "full-text" }),
      { kind: "criterion", id: "E3", text: "x", stage: "abstract" },
      { kind: "criterion", id: "E1", text: "again", stage: "full-text" },
    ),
  );
  assert.match(problems, /line 3: the hit cites criterion E9, which no earlier line defines/);
  assert.match(problems, /line 4: the hit cites criterion E1, so the hit needs the stage it was screened at/);
  assert.match(problems, /line 5: the hit cites a criterion, but only an exclusion has one/);
  assert.match(problems, /line 6: a criterion's stage must be one of: title-abstract, full-text/);
  assert.match(problems, /line 7: duplicate criterion id E1/);
});

test("once a ledger defines criteria every exclusion cites one, and a ledger without criteria stays valid", () => {
  const withCriteria = lines(QUERY, E1, hit("A", { state: "excluded", reason: "off topic" }));
  assert.match(
    problemsOf(withCriteria),
    /line 3: the ledger defines criteria, so an excluded hit cites the criterion it was excluded by/,
  );
  const plain = lines(QUERY, hit("A", { state: "excluded", reason: "off topic" }), hit("B", { state: "unscreened" }));
  assert.equal(problemsOf(plain), "");
  assert.match(problemsOf(lines(QUERY, hit("A", { state: "excluded" }))), /needs a reason or the criterion/);
  assert.match(
    problemsOf(lines(QUERY, hit("A", { state: "excluded", reason: "x", stage: "abstract" }))),
    /stage must be/,
  );
});

const PASSING = new Map([["judge.md", judgeCounts(judgeRecord())]]);
const SCREENING = { judges: PASSING, rubrics: RUBRICS };

test("a model's screening counts only with a judge validation record that passes", () => {
  const ledger = lines(
    QUERY,
    E1,
    PERSON,
    MODEL,
    hit("A", { state: "excluded", criterion: "E1", stage: "title-abstract", screener: "M1" }),
    hit("B", { state: "included", stage: "title-abstract", screener: "M1" }),
    hit("C", { state: "included", stage: "title-abstract", screener: "P1" }),
  );
  const passing = new Map([["judge.md", judgeCounts(judgeRecord())]]);
  assert.equal(problemsOf(ledger, { judges: passing, rubrics: RUBRICS }), "");
  const failing = new Map([["judge.md", judgeCounts(judgeRecord({ Result: "fail" }))]]);
  assert.match(
    problemsOf(ledger, { judges: failing, rubrics: RUBRICS }),
    /screener M1 is a model, and its judge record judge\.md does not pass \(its Result is not pass\), so the 2 hits it screened \(lines 5, 6\) do not count/,
  );
  assert.match(problemsOf(ledger), /judge record judge\.md cannot be read, so the 2 hits/);
  // A person's screening needs no record, and a model screener needs one named.
  assert.equal(problemsOf(lines(QUERY, PERSON, hit("C", { state: "included", screener: "P1" }))), "");
  const unnamed = problemsOf(lines(QUERY, { kind: "screener", id: "M2", model: "gpt" }));
  assert.match(unnamed, /a model screener needs judge/);
  assert.match(unnamed, /a model screener needs rubric: the path of the screening instructions it was given/);
  assert.match(problemsOf(lines(QUERY, { kind: "screener", id: "X", person: "A", model: "B" })), /either a person or/);
  assert.match(problemsOf(lines(QUERY, hit("A", { state: "included", screener: "Z9" }))), /names screener Z9/);
});

test("a passing judge record counts only for the rubric it was validated on", () => {
  const ledger = lines(QUERY, E1, MODEL, hit("A", { state: "included", stage: "title-abstract", screener: "M1" }));
  const other = new Map([
    ["judge.md", judgeCounts(judgeRecord({ Rubric: "other-study.md", "Rubric sha256": sha("another review") }))],
  ]);
  assert.match(
    problemsOf(ledger, { judges: other, rubrics: RUBRICS }),
    new RegExp(
      `screener M1 is a model, and its judge record judge\\.md was validated on a rubric with sha256 ${sha("another review")}, not on its rubric criteria\\.md \\(sha256 ${RUBRIC_SHA}\\), so the 1 hit it screened \\(line 4\\) do not count`,
    ),
  );
  assert.equal(problemsOf(ledger, SCREENING), "");
  assert.match(
    problemsOf(ledger, { judges: PASSING, rubrics: new Map() }),
    /its rubric criteria\.md cannot be read, so the 1 hit/,
  );
});

test("validate and counts read a model screener's judge record and rubric beside the ledger", () => {
  const dir = folder();
  const ledger = join(dir, "searches.jsonl");
  writeFileSync(join(dir, "criteria.md"), RUBRIC_TEXT);
  writeFileSync(ledger, lines(QUERY, MODEL, hit("A", { state: "included", screener: "M1" })));
  const missing = node("artifact.mjs", "validate", ledger);
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /judge record judge\.md cannot be read/);
  writeFileSync(join(dir, "judge.md"), judgeRecord({ Interval: "[0.71, 0.88] wilson" }));
  assert.match(node("artifact.mjs", "counts", ledger).stdout, /lower bound 0\.71 is below the required 0\.8/);
  writeFileSync(join(dir, "judge.md"), judgeRecord());
  assert.equal(node("artifact.mjs", "validate", ledger).status, 0);
  assert.equal(node("artifact.mjs", "counts", ledger).status, 0);
  // The rubric edited after validation is not the rubric the record holds for.
  writeFileSync(join(dir, "criteria.md"), `${RUBRIC_TEXT}Also exclude surveys.\n`);
  assert.match(node("artifact.mjs", "validate", ledger).stdout, /was validated on a rubric with sha256 /);
});

// Ten hits screened by a person and a model: 8 agreed, 2 disagreed (one settled by a person, one awaiting).
const DUAL = () => {
  const agreeIn = {
    screens: [
      { screener: "P1", state: "included" },
      { screener: "M1", state: "included" },
    ],
  };
  const agreeOut = {
    screens: [
      { screener: "P1", state: "excluded", criterion: "E1" },
      { screener: "M1", state: "excluded", criterion: "E1" },
    ],
  };
  const split = (first, second) => ({
    screens: [
      { screener: "P1", state: first, ...(first === "excluded" ? { criterion: "E1" } : {}) },
      { screener: "M1", state: second, ...(second === "excluded" ? { criterion: "E1" } : {}) },
    ],
  });
  const at = { stage: "title-abstract" };
  return [
    QUERY,
    E1,
    PERSON,
    MODEL,
    ...[1, 2, 3, 4].map((n) => hit(`in ${n}`, { state: "included", ...at, ...agreeIn })),
    ...[1, 2, 3, 4].map((n) => hit(`out ${n}`, { state: "excluded", criterion: "E1", ...at, ...agreeOut })),
    hit("split 1", {
      state: "excluded",
      criterion: "E1",
      ...at,
      ...split("excluded", "included"),
      settled_by: "Hassan",
    }),
    hit("split 2", { state: "unscreened", ...at, ...split("included", "excluded") }),
  ];
};

test("counts reports two screeners' raw agreement, kappa and disagreements", () => {
  const counts = searchCounts(lines(...DUAL()), SCREENING);
  assert.deepEqual(counts.problems, []);
  // Observed 8/10; each screener said included 5 times of 10, so chance agreement is 0.5 and kappa 0.6.
  assert.deepEqual(counts.agreement, [
    {
      screeners: ["M1", "P1"],
      stage: "title-abstract",
      items: 10,
      observed: 0.8,
      kappa: 0.6000000000000001,
      disagreements: 2,
      unsettled: 1,
    },
  ]);
  const dir = folder();
  writeFileSync(join(dir, "judge.md"), judgeRecord());
  writeFileSync(join(dir, "criteria.md"), RUBRIC_TEXT);
  writeFileSync(join(dir, "searches.jsonl"), lines(...DUAL()));
  const printed = node("artifact.mjs", "counts", join(dir, "searches.jsonl"));
  assert.equal(printed.status, 0, printed.stdout);
  assert.match(
    printed.stdout,
    /agreement M1 and P1 \(title-abstract\): 10 hits, raw 0\.800, kappa 0\.600, 2 disagreements, 1 not yet settled by a person/,
  );
});

test("a disagreement, or a state the two screeners did not give, is settled by a named person", () => {
  const records = DUAL();
  const unsettled = { ...records[12], settled_by: undefined };
  const problems = problemsOf(lines(...records.slice(0, 12), unsettled), SCREENING);
  assert.match(problems, /line 13: the screeners disagree, so settled_by names the person who settled it/);
  const overruled = { ...records[4], state: "excluded", criterion: "E1" };
  assert.match(
    problemsOf(lines(...records.slice(0, 4), overruled), SCREENING),
    /line 5: the screeners agreed the hit is included, and its state is excluded, so settled_by names the person/,
  );
  // Both included it, and it is left unscreened: it would drop out of the included count unremarked.
  const dropped = { ...records[4], state: "unscreened" };
  assert.match(
    problemsOf(lines(...records.slice(0, 4), dropped), SCREENING),
    /line 5: the screeners agreed the hit is included, and its state is unscreened, so settled_by names the person/,
  );
  assert.equal(problemsOf(lines(...records.slice(0, 4), { ...dropped, settled_by: "Hassan" }), SCREENING), "");
  const byModel = { ...records[12], settled_by: "M1" };
  assert.match(
    problemsOf(lines(...records.slice(0, 12), byModel), SCREENING),
    /settled_by names M1, a model; a person settles a disagreement/,
  );
  const same = hit("x", {
    state: "included",
    screens: [
      { screener: "P1", state: "included" },
      { screener: "P1", state: "included" },
    ],
  });
  assert.match(problemsOf(lines(QUERY, PERSON, same)), /two different screeners/);
  assert.match(problemsOf(lines(QUERY, PERSON, hit("y", { state: "included", screens: [] }))), /an array of two/);
});

const FLOW_LEDGER = () =>
  lines(
    QUERY,
    QUERY2,
    E1,
    E2,
    hit("A", { state: "included", stage: "full-text", source: "S1" }),
    hit("B", { state: "excluded", criterion: "E1", stage: "title-abstract" }),
    hit("C", { state: "excluded", criterion: "E1", stage: "title-abstract" }),
    hit("D", { state: "excluded", criterion: "E2", stage: "full-text" }),
    { kind: "hit", query: "Q2", title: "A", state: "duplicate", reason: "same as Q1's A" },
    { kind: "hit", query: "Q2", title: "E", state: "unscreened" },
  );

test("counts --flow writes the stage counts from the ledger, and refuses to write them from a ledger with problems", () => {
  const dir = folder();
  writeFileSync(join(dir, "searches.jsonl"), FLOW_LEDGER());
  const written = node("artifact.mjs", "counts", join(dir, "searches.jsonl"), "--flow", join(dir, "flow.json"));
  assert.equal(written.status, 0, written.stdout);
  assert.match(written.stdout, /excluded at title-abstract: 2 \(E1 not about model judges: 2\)/);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "flow.json"), "utf8")), {
    kind: "search-flow",
    computed_by: "artifact.mjs counts --flow",
    identified: {
      records: 6,
      databases: [
        { database: "arXiv", records: 4 },
        { database: "Scopus", records: 2 },
      ],
    },
    duplicates: 1,
    awaiting: 1,
    screened: 4,
    excluded_title_abstract: {
      records: 2,
      reasons: [{ criterion: "E1", reason: "not about model judges", records: 2 }],
    },
    excluded_stage_not_recorded: { records: 0, reasons: [] },
    full_text: {
      assessed: 2,
      excluded: {
        records: 1,
        reasons: [{ criterion: "E2", reason: "no agreement measured against people", records: 1 }],
      },
    },
    included: 1,
    ledger: "searches.jsonl",
    ledger_sha256: sha(FLOW_LEDGER()),
  });
  writeFileSync(
    join(dir, "bad.jsonl"),
    lines(QUERY, E2, hit("B", { state: "excluded", criterion: "E2", stage: "title-abstract" })),
  );
  const refused = node("artifact.mjs", "counts", join(dir, "bad.jsonl"), "--flow", join(dir, "bad-flow.json"));
  assert.equal(refused.status, 1);
  assert.match(refused.stdout, /flow: not written, since the ledger has problems/);
  assert.equal(existsSync(join(dir, "bad-flow.json")), false);
  // A ledger from before stages has one exclusion box and no full-text step.
  const old = searchCounts(lines(QUERY, hit("A", { state: "included" }), hit("B", { state: "excluded", reason: "x" })));
  assert.equal(old.flow.full_text, null);
  assert.deepEqual(old.flow.excluded_stage_not_recorded, { records: 1, reasons: [{ reason: "x", records: 1 }] });
});

test("figure.mjs draws the flow as boxes and arrows, the same bytes each time, and refuses counts typed or edited", () => {
  const dir = folder();
  writeFileSync(join(dir, "searches.jsonl"), FLOW_LEDGER());
  node("artifact.mjs", "counts", join(dir, "searches.jsonl"), "--flow", join(dir, "flow.json"));
  const spec = { type: "flow", data: "flow.json", title: "Search flow", description: "Six records to one study" };
  writeFileSync(join(dir, "spec.json"), JSON.stringify(spec));
  const first = drawFigure(spec, join(dir, "spec.json"));
  assert.equal(first.svg, drawFigure(spec, join(dir, "spec.json")).svg);
  assert.equal(first.boxes, 8);
  for (const text of [
    "Records identified (n = 6)",
    "arXiv: 4",
    "Duplicates removed (n = 1)",
    "Awaiting screening (n = 1)",
    "Records screened (n = 4)",
    "Excluded at title and abstract (n = 2)",
    "E1, not about model judges: 2",
    "Full texts assessed (n = 2)",
    "Excluded at full text (n = 1)",
    "Studies included (n = 1)",
  ])
    assert.ok(first.svg.includes(text), text);
  assert.match(first.svg, /marker-end="url\(#arrow\)"/);
  const drawn = node("figure.mjs", "draw", join(dir, "spec.json"), "--out", join(dir, "flow.svg"));
  assert.equal(drawn.status, 0, drawn.stderr);
  assert.match(drawn.stdout, /flow\.svg: flow, 8 boxes/);

  assert.throws(() => drawFigure({ ...spec, included: 3 }, join(dir, "spec.json")), /"included" is not one/);
  const flow = JSON.parse(readFileSync(join(dir, "flow.json"), "utf8"));
  writeFileSync(join(dir, "edited.json"), JSON.stringify({ ...flow, included: 2 }));
  assert.throws(
    () => drawFigure({ ...spec, data: "edited.json" }, join(dir, "spec.json")),
    /the flow's counts do not add up \(full_text: those assessed are not those excluded at full text plus those included\)/,
  );
  writeFileSync(join(dir, "typed.json"), JSON.stringify({ identified: 6 }));
  assert.throws(() => drawFigure({ ...spec, data: "typed.json" }, join(dir, "spec.json")), /not a flow written by/);
});

test("figure.mjs recomputes the flow from the ledger it names, so an edit that keeps every sum is refused", () => {
  const dir = folder();
  writeFileSync(join(dir, "searches.jsonl"), FLOW_LEDGER());
  node("artifact.mjs", "counts", join(dir, "searches.jsonl"), "--flow", join(dir, "flow.json"));
  const flow = JSON.parse(readFileSync(join(dir, "flow.json"), "utf8"));
  const spec = { type: "flow", data: "flow.json" };
  assert.match(drawFigure(spec, join(dir, "spec.json")).svg, /Studies included \(n = 1\)/);
  // R19's consistent edit: one more study included, carried through every total so each sum still holds.
  const edited = {
    ...flow,
    identified: {
      records: 7,
      databases: [
        { database: "arXiv", records: 4 },
        { database: "Scopus", records: 3 },
      ],
    },
    screened: 5,
    full_text: { ...flow.full_text, assessed: 3 },
    included: 2,
  };
  writeFileSync(join(dir, "edited.json"), JSON.stringify(edited));
  assert.throws(
    () => drawFigure({ ...spec, data: "edited.json" }, join(dir, "spec.json")),
    /edited\.json's counts are not those searches\.jsonl gives \(identified, screened, full_text, included differ\)/,
  );
  const { ledger, ledger_sha256, ...unnamed } = flow;
  assert.equal(ledger, "searches.jsonl");
  writeFileSync(join(dir, "unnamed.json"), JSON.stringify(unnamed));
  assert.throws(() => drawFigure({ ...spec, data: "unnamed.json" }, join(dir, "spec.json")), /names no search ledger/);
  // A ledger changed after the flow was written: the hash no longer matches.
  writeFileSync(join(dir, "searches.jsonl"), `${FLOW_LEDGER()}\n${JSON.stringify(hit("F", { state: "unscreened" }))}`);
  assert.throws(
    () => drawFigure(spec, join(dir, "spec.json")),
    new RegExp(`searches\\.jsonl is not the ledger flow\\.json was written from \\(its sha256 differs\\)`),
  );
  assert.ok(ledger_sha256);
});

test("an outline's flow figure is checked against its receipt like any other figure", () => {
  const dir = folder();
  writeFileSync(join(dir, "searches.jsonl"), FLOW_LEDGER());
  node("artifact.mjs", "counts", join(dir, "searches.jsonl"), "--flow", join(dir, "flow.json"));
  writeFileSync(join(dir, "other.json"), readFileSync(join(dir, "flow.json")));
  writeFileSync(join(dir, "spec.json"), JSON.stringify({ type: "flow", data: "other.json" }));
  writeFileSync(join(dir, "claims.md"), "| ID | Claim |\n| --- | --- |\n| C1 | x |\n");
  const drawn = node(
    "paper.mjs",
    "run",
    "--ledger",
    join(dir, "runs.jsonl"),
    "--input",
    join(dir, "spec.json"),
    "--input",
    join(dir, "other.json"),
    "--output",
    join(dir, "flow.svg"),
    "--",
    process.execPath,
    join(SCRIPTS, "figure.mjs"),
    "draw",
    join(dir, "spec.json"),
    "--out",
    join(dir, "flow.svg"),
  );
  assert.equal(drawn.status, 0, drawn.stderr);
  const outline = (data) =>
    [
      "# Paper Outline: Review",
      "",
      "> **Type:** Paper Outline",
      "> **Status:** Draft",
      "> **Owner:** O",
      "> **Register:** claims.md",
      "> **Runs:** runs.jsonl",
      "",
      "## Proposition",
      "",
      "Judges agree with people on most screening decisions.",
      "",
      "## Contributions",
      "",
      "| ID | Contribution | Claims |",
      "| --- | --- | --- |",
      "| K1 | A review | C1 |",
      "",
      "## Paragraphs",
      "",
      "| Section | Paragraph | Role | Claims |",
      "| --- | --- | --- | --- |",
      "| Method | The search | method | C1 |",
      "",
      "## Figures",
      "",
      "| ID | Figure | Claims | Data | File | Receipt |",
      "| --- | --- | --- | --- | --- | --- |",
      `| F1 | Search flow | C1 | ${data} | flow.svg | R1 |`,
      "",
      "## Objections",
      "",
      "none found within these searches",
      "",
      "## Limits",
      "",
      "In Limits.",
      "",
    ].join("\n");
  writeFileSync(join(dir, "outline.md"), outline("other.json"));
  const ok = node("artifact.mjs", "validate", join(dir, "outline.md"));
  assert.equal(ok.status, 0, ok.stdout);
  writeFileSync(join(dir, "outline.md"), outline("flow.json"));
  assert.match(
    node("artifact.mjs", "validate", join(dir, "outline.md")).stdout,
    /R1's figure spec draws from other\.json, not flow\.json/,
  );
});

const EVIDENCE = (columns, ...rows) =>
  [
    "# Evidence Table: Judges",
    "",
    "> **Type:** Evidence Table",
    "> **Status:** Draft",
    "> **Owner:** Hassan Mohiddin",
    "",
    `| ${columns.join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    ...rows,
    "",
  ].join("\n");
const BASE = ["Source", "Design", "n", "Result", "Failure condition", "Level"];

test("the evidence table's risk of bias names the tool for the design and one of four judgments", () => {
  const columns = [...BASE, "Bias tool", "Risk of bias"];
  const valid = EVIDENCE(
    columns,
    "| S1 | randomized trial | 200 | 0.4 | no effect | L4 | RoB 2 | some concerns |",
    "| S2 | cohort | 900 | 0.3 | no association | L3 | ROBINS-I | high |",
    "| S3 | non-randomized comparison | 80 | 0.2 | no effect | L3 | ROBINS-I | low |",
    "| S4 | case series | 12 | 0.9 | - | L3 | - | not assessed |",
  );
  assert.deepEqual(validate("evidence-table", valid).problems, []);
  const withWeakness = EVIDENCE(
    [...BASE, "Weakness", "Bias tool", "Risk of bias"],
    "| S1 | randomized trial | 200 | 0.4 | no effect | L4 | small | RoB 2 | low |",
  );
  assert.deepEqual(validate("evidence-table", withWeakness).problems, []);
  const problems = validate(
    "evidence-table",
    EVIDENCE(
      columns,
      "| S1 | randomized trial | 200 | 0.4 | no effect | L4 | RoB 2 | moderate |",
      "| S2 | cohort | 900 | 0.3 | no association | L3 | - | high |",
      "| S3 | cohort | 900 | 0.3 | no association | L3 | ROBINS-I | not assessed |",
      "| S4 | prospective cohort | 900 | 0.3 | no association | L3 | RoB 2 | low |",
      "| S5 | RCT | 60 | 0.3 | no effect | L4 | ROBINS-I | low |",
    ),
  ).problems.join("\n");
  assert.match(problems, /line 9: Risk of bias must be one of: low, some concerns, high, not assessed/);
  assert.match(problems, /line 10: a risk of bias judged high names the tool that judged it/);
  assert.match(problems, /line 11: Risk of bias is not assessed, so Bias tool is "-"/);
  assert.match(problems, /line 12: RoB 2 is for randomized trials, and the design reads "prospective cohort"/);
  assert.match(problems, /line 13: ROBINS-I is for studies that did not randomize, and the design reads "RCT"/);
  // The design kind is read from the cell's leading words, so a trial with a secondary cohort analysis is a trial.
  const trials = EVIDENCE(
    columns,
    "| S1 | randomized trial with an observational follow-up | 200 | 0.4 | no effect | L4 | RoB 2 | low |",
    "| S2 | randomised controlled trial, cohort analysis of dropouts | 200 | 0.4 | no effect | L4 | RoB 2 | low |",
    "| S3 | randomized trial; secondary cohort analysis | 200 | 0.4 | no effect | L4 | RoB 2 | low |",
  );
  assert.deepEqual(validate("evidence-table", trials).problems, []);
  const wrong = validate(
    "evidence-table",
    EVIDENCE(
      columns,
      "| S1 | cohort study | 900 | 0.3 | no association | L3 | RoB 2 | low |",
      "| S2 | randomized trial | 200 | 0.4 | no effect | L4 | ROBINS-I | low |",
    ),
  ).problems.join("\n");
  assert.match(wrong, /line 9: RoB 2 is for randomized trials, and the design reads "cohort study"/);
  assert.match(
    wrong,
    /line 10: ROBINS-I is for studies that did not randomize, and the design reads "randomized trial"/,
  );
  const half = validate("evidence-table", EVIDENCE([...BASE, "Risk of bias"], "| S1 | trial | 2 | x | y | L3 | low |"));
  assert.match(half.problems.join("\n"), /risk of bias takes both columns/);
  // A table without the columns is unchanged.
  assert.deepEqual(validate("evidence-table", EVIDENCE(BASE, "| S1 | trial | 2 | x | y | L3 |")).problems, []);
});

// The BCG vaccine trials (Colditz et al. 1994; the counts of R metafor's dat.bcg): log risk ratios and their
// variances. Reference values computed with statsmodels 0.15.0 combine_effects(method_re="dl") on 2026-10-28.
const BCG = {
  yi: [
    -0.8893113339202054, -1.5853886572014306, -1.348073148299693, -1.4415511900213054, -0.2175473222112957,
    -0.786115585818864, -1.6208982235983924, 0.011952333523841173, -0.4694176487381487, -1.3713448034727846,
    -0.33935882833839015, 0.4459134005713783, -0.017313948216879493,
  ],
  vi: [
    0.32558476500396133, 0.19458112139814385, 0.4153679653679654, 0.020010031902247573, 0.05121017216963086,
    0.0069056184559087574, 0.22301724757231517, 0.0039615792978177295, 0.056434210463248966, 0.07302479361302891,
    0.01241221397155972, 0.5325058452001528, 0.0714046596839863,
  ],
};
const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} is not ${expected}`);

test("meta pooling matches statsmodels on the BCG vaccine trials", () => {
  const fixed = metaFixed(BCG.yi, BCG.vi);
  close(fixed.estimate, -0.43028516365409053);
  close(fixed.se, 0.04049875171086381);
  close(fixed.q, 152.23300808237337);
  const random = metaRandom(BCG.yi, BCG.vi);
  close(random.estimate, -0.7141172220732269);
  close(random.se, 0.17874208953540316);
  close(random.normal.low, -1.064445, 1e-6);
  close(random.normal.high, -0.363789, 1e-6);
  close(random.tau2, 0.30876026286237634);
  close(random.i2, 0.9211734685456205);
  close(random.q, 152.23300808237337);
  close(random.hartungKnapp.se, 0.18069662833554745);
  assert.equal(random.hartungKnapp.df, 12);
  close(random.low, -1.1078213541683288);
  close(random.high, -0.3204130899781251);
  close(random.fixed.estimate, fixed.estimate);
  // Thirteen studies: no few-studies warning, and I² of 0.92 is high.
  assert.equal(random.warnings.length, 1);
  assert.match(random.warnings[0], /I² is 0\.921, high/);
  assert.match(fixed.warnings[0], /a fixed effect \(one true effect shared by all\) does not fit/);
});

test("meta warns with fewer than five studies, and refuses input it cannot pool", () => {
  // Three homogeneous studies: tau² is 0, I² is 0, and the few-studies warning comes first. Q is below its degrees
  // of freedom, so the Hartung-Knapp se is below the DerSimonian-Laird se and that warning follows.
  const few = metaRandom([0.1, 0.3, 0.2], [0.01, 0.02, 0.015]);
  assert.equal(few.tau2, 0);
  assert.equal(few.i2, 0);
  assert.deepEqual(few.warnings.length, 2);
  assert.match(few.warnings[0], /fewer than five studies \(3\): tau² is estimated from too few values/);
  assert.match(few.warnings[1], /the Hartung-Knapp se \(.+\) is below the DerSimonian-Laird se/);
  // Five homogeneous studies give no few-studies warning, only the Hartung-Knapp one.
  const five = metaRandom([0.1, 0.3, 0.2, 0.25, 0.15], [0.01, 0.02, 0.015, 0.02, 0.01]);
  assert.equal(five.warnings.length, 1);
  assert.match(five.warnings[0], /the Hartung-Knapp se/);
  // Five studies spread a little more than their variances predict give no warning at all.
  assert.equal(metaRandom([0.1, 0.4, 0.2, 0.35, 0], [0.01, 0.02, 0.015, 0.02, 0.01]).warnings, undefined);
  assert.throws(() => metaRandom([0.1], [0.01]), /at least two studies/);
  assert.throws(() => metaRandom([0.1, 0.2], [0.01]), /the same length/);
  assert.throws(() => metaFixed([0.1, 0.2], [0.01, 0]), /greater than 0/);
});

test("meta's Hartung-Knapp interval, when narrower than the studies' own evidence, warns and names the truncated one", () => {
  // R19's probe: five studies with estimates 0.10 to 0.12, each variance 0.04 (I² = 0).
  const probe = metaRandom([0.1, 0.105, 0.11, 0.115, 0.12], [0.04, 0.04, 0.04, 0.04, 0.04]);
  close(probe.hartungKnapp.se, 0.003535533905932737);
  close(probe.se, Math.sqrt(0.04 / 5));
  close(probe.high - probe.low, 0.019632431614775, 1e-9);
  // Truncated: the residual variance floored at 1 (IntHout et al. 2014), so the se is the DerSimonian-Laird se.
  close(probe.hartungKnapp.truncated.se, probe.se);
  close(probe.hartungKnapp.truncated.high - probe.hartungKnapp.truncated.low, 0.4966655992815033, 1e-9);
  assert.equal(probe.warnings.length, 1);
  assert.match(
    probe.warnings[0],
    /the Hartung-Knapp se \(0\.00354\) is below the DerSimonian-Laird se \(0\.0894\).*report hartungKnapp\.truncated's interval, -0\.1383 to 0\.3583, instead/,
  );
  // On BCG the residual variance is above 1, so the truncated interval is the untruncated one.
  const bcg = metaRandom(BCG.yi, BCG.vi);
  close(bcg.hartungKnapp.truncated.low, bcg.low);
  close(bcg.hartungKnapp.truncated.high, bcg.high);
});

test("stats.mjs meta runs from the command line and records what computed it", () => {
  const result = spawnSync(process.execPath, [join(SCRIPTS, "stats.mjs"), "meta"], {
    input: JSON.stringify({ method: "random", ...BCG }),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.computed_by, "stats.mjs meta random");
  close(parsed.low, -1.1078213541683288);
  const text = spawnSync(process.execPath, [join(SCRIPTS, "stats.mjs"), "meta", "--text"], {
    input: JSON.stringify({ method: "fixed", yi: [0.1, 0.3], vi: [0.01, 0.02] }),
    encoding: "utf8",
  });
  assert.match(text.stdout, /^meta-fixed; estimate 0\.166667; .*warning: fewer than five studies \(2\)/);
});

test("meta leave-one-out pools without each study in turn, matching statsmodels, and names an omission that moves the verdict", () => {
  const labels = BCG.yi.map((_, i) => `S${i + 1}`);
  const result = metaLeaveOneOut(BCG.yi, BCG.vi, { labels });
  assert.equal(result.method, "meta-leave-one-out");
  assert.equal(result.omitted.length, 13);
  close(result.estimate, -0.7141172220732269);
  // statsmodels 0.15.0 combine_effects(method_re="dl", use_t=True), "random effect wls", without studies 1, 8 and 13.
  for (const [at, estimate, low, high] of [
    [0, -0.7051251984174507, -1.1307178396627717, -0.27953255717212966],
    [7, -0.7900865998537004, -1.186410271967213, -0.3937629277401879],
    [12, -0.7789237400570723, -1.1879596477130738, -0.36988783240107076],
  ]) {
    assert.equal(result.omitted[at].omitted, labels[at]);
    close(result.omitted[at].estimate, estimate);
    close(result.omitted[at].low, low);
    close(result.omitted[at].high, high);
  }
  assert.ok(result.range.low <= result.range.high);
  assert.equal(result.warnings, undefined);
  // Two strong studies and two null ones: without any one of them the interval still excludes zero.
  const fragile = metaLeaveOneOut([0.9, 0.8, 0.05, 0.0], [0.02, 0.02, 0.02, 0.02], { model: "fixed" });
  assert.ok(fragile.low > 0);
  assert.deepEqual(
    fragile.omitted.filter((fit) => fit.changes).map((fit) => fit.omitted),
    [],
  );
  const flipped = metaLeaveOneOut([0.5, 0.02, 0.0, -0.01], [0.01, 0.05, 0.05, 0.05], { model: "fixed" });
  assert.ok(flipped.low > 0);
  assert.deepEqual(
    flipped.omitted.filter((fit) => fit.changes).map((fit) => fit.omitted),
    [0],
  );
  assert.match(flipped.warnings[0], /without study 0 the interval includes 0/);
  assert.throws(() => metaLeaveOneOut([0.1, 0.2], [0.01, 0.01]), /at least three studies/);
  // From the command line.
  const cli = spawnSync(process.execPath, [join(SCRIPTS, "stats.mjs"), "meta"], {
    input: JSON.stringify({ method: "leave-one-out", ...BCG }),
    encoding: "utf8",
  });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).computed_by, "stats.mjs meta leave-one-out");
});
