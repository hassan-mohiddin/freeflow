// What the systematic-review trial tripped on: the reviewing agent as its own screener, citation chasing as its own
// method, records a service returned but nobody screened, a recheck mismatch capping the claims that cite its source,
// effect sizes for pooling from two proportions, a review's own project layout, and validate's flags on kinds that
// do not read them. Each check has a case that must fail.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { drawFigure } from "../../../skills/research-work/scripts/lib/figure.mjs";
import { recheckFlags, searchCounts, skeleton, validate } from "../../../skills/research-work/scripts/lib/formats.mjs";
import { effectSize, effectSizes } from "../../../skills/research-work/scripts/lib/stats.mjs";

const SCRIPTS = fileURLToPath(new URL("../../../skills/research-work/scripts/", import.meta.url));
const node = (script, args, input) =>
  spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { encoding: "utf8", input });
const folder = () => mkdtempSync(join(tmpdir(), "research-review-fixes-"));
const lines = (...records) => records.map((record) => JSON.stringify(record)).join("\n");
const problemsOf = (text) => validate("search-ledger", text).problems.join("\n");
const close = (actual, expected, tolerance = 1e-12) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} is not ${expected}`);

const QUERY = { kind: "query", id: "Q1", query: "chain of thought GSM8K", database: "arXiv", date: "2026-10-28" };
const E1 = { kind: "criterion", id: "E1", text: "not about prompting", stage: "title-abstract" };
const AGENT = { kind: "screener", id: "A1", agent: "claude-opus-5-5" };
const hit = (title, fields) => ({ kind: "hit", query: "Q1", title, ...fields });

test("the reviewing agent screens as itself, with no judge record, and counts and the flow say it screened alone", () => {
  const ledger = lines(
    QUERY,
    E1,
    AGENT,
    hit("A", { state: "included", stage: "title-abstract", source: "S1", screener: "A1" }),
    hit("B", { state: "excluded", criterion: "E1", stage: "title-abstract", screener: "A1" }),
  );
  assert.equal(problemsOf(ledger), "");
  const { flow } = searchCounts(ledger);
  assert.deepEqual(flow.agent_alone, { records: 2, agents: ["claude-opus-5-5"] });
  // A screener names exactly one of the three; a model stays a delegated judge that needs its record.
  assert.match(
    problemsOf(lines(QUERY, { kind: "screener", id: "X", agent: "claude", person: "Hassan" })),
    /line 2: a screener names just one of: either a person or a model \(a delegated judge\), or agent/,
  );
  assert.match(
    problemsOf(lines(QUERY, { kind: "screener", id: "M1", model: "claude-haiku-5-5" })),
    /a model screener needs judge/,
  );
  // A person's screening gives no agent_alone, so a ledger without the agent keeps its flow.
  const person = lines(
    QUERY,
    { kind: "screener", id: "P1", person: "Hassan" },
    hit("A", { state: "included", screener: "P1" }),
  );
  assert.equal(searchCounts(person).flow.agent_alone, undefined);

  const dir = folder();
  writeFileSync(join(dir, "searches.jsonl"), ledger);
  const counted = node("artifact.mjs", ["counts", join(dir, "searches.jsonl"), "--flow", join(dir, "flow.json")]);
  assert.equal(counted.status, 0, counted.stdout);
  assert.match(
    counted.stdout,
    /screened by the reviewing agent alone, no second screener: 2 \(claude-opus-5-5\); name it in the report's Limits/,
  );
  const spec = { type: "flow", data: "flow.json" };
  writeFileSync(join(dir, "spec.json"), JSON.stringify(spec));
  const { svg } = drawFigure(spec, join(dir, "spec.json"));
  assert.ok(svg.includes(">2 by the reviewing agent alone</text>"), svg);
  assert.ok(svg.includes(">(claude-opus-5-5), no second screener</text>"), svg);
});

const CITATION = {
  kind: "query",
  id: "Q2",
  method: "citation",
  from: ["S1"],
  direction: "backward",
  date: "2026-10-28",
};

test("citation chasing is its own method, counted under other methods apart from the databases", () => {
  const ledger = lines(
    QUERY,
    CITATION,
    hit("A", { state: "included", source: "S1" }),
    { kind: "hit", query: "Q2", title: "C", state: "included", source: "S2" },
    { kind: "hit", query: "Q2", title: "D", state: "excluded", reason: "no GSM8K" },
  );
  assert.equal(problemsOf(ledger), "");
  const { flow, queries } = searchCounts(ledger);
  assert.deepEqual(flow.identified, {
    records: 3,
    databases: [{ database: "arXiv", records: 1 }],
    other_methods: [{ method: "citation, backward", records: 2 }],
  });
  assert.equal(queries.Q2.direction, "backward");
  // A citation query names where it started and which way it went, and no database.
  const bad = problemsOf(
    lines({
      kind: "query",
      id: "Q1",
      method: "citation",
      from: [],
      direction: "sideways",
      database: "x",
      date: "2026-10-28",
    }),
  );
  assert.match(bad, /a citation query names from and direction instead of a database/);
  assert.match(bad, /a citation query needs from: the source-ledger IDs/);
  assert.match(bad, /a citation query's direction is one of: backward, forward/);
  assert.match(problemsOf(lines({ ...QUERY, method: "snowball" })), /a query's method, when given, is "citation"/);
  // A database query still needs its database.
  assert.match(problemsOf(lines({ ...QUERY, database: undefined })), /a query needs database/);

  const dir = folder();
  writeFileSync(join(dir, "searches.jsonl"), ledger);
  const counted = node("artifact.mjs", ["counts", join(dir, "searches.jsonl"), "--flow", join(dir, "flow.json")]);
  assert.equal(counted.status, 0, counted.stdout);
  assert.match(counted.stdout, /Q2 citation backward from S1 2026-10-28: included 1, excluded 1/);
  const spec = { type: "flow", data: "flow.json" };
  writeFileSync(join(dir, "spec.json"), JSON.stringify(spec));
  const { svg } = drawFigure(spec, join(dir, "spec.json"));
  assert.ok(svg.includes("arXiv: 1"));
  assert.ok(svg.includes("Other methods, citation, backward: 2"));
});

test("a query's returned count shows records identified but not screened, and is never below its hits", () => {
  const ledger = lines(
    { ...QUERY, returned: 19 },
    ...Array.from({ length: 3 }, (_, i) => hit(`T${i}`, { state: "excluded", reason: "off topic" })),
  );
  assert.equal(problemsOf(ledger), "");
  const { flow } = searchCounts(ledger);
  assert.equal(flow.not_screened, 16);
  assert.deepEqual(flow.identified, { records: 19, databases: [{ database: "arXiv", records: 19 }] });
  // Without returned, the flow has no not_screened, as before.
  assert.equal(searchCounts(lines(QUERY, hit("T", { state: "excluded", reason: "x" }))).flow.not_screened, undefined);
  assert.match(
    problemsOf(
      lines(
        { ...QUERY, returned: 1 },
        hit("A", { state: "excluded", reason: "x" }),
        hit("B", { state: "excluded", reason: "x" }),
      ),
    ),
    /line 1: Q1 says the service returned 1 records, and 2 hits are logged under it/,
  );
  assert.match(problemsOf(lines({ ...QUERY, returned: "19" })), /returned is a whole number/);

  const dir = folder();
  writeFileSync(join(dir, "searches.jsonl"), ledger);
  const counted = node("artifact.mjs", ["counts", join(dir, "searches.jsonl"), "--flow", join(dir, "flow.json")]);
  assert.equal(counted.status, 0, counted.stdout);
  assert.match(
    counted.stdout,
    /Q1 arXiv 2026-10-28: included 0, excluded 3, duplicate 0, unscreened 0; returned 19, 16 not screened/,
  );
  assert.match(counted.stdout, /identified but not screened: 16/);
  const spec = { type: "flow", data: "flow.json" };
  writeFileSync(join(dir, "spec.json"), JSON.stringify(spec));
  const { svg } = drawFigure(spec, join(dir, "spec.json"));
  assert.ok(svg.includes("Records identified (n = 19)"));
  assert.ok(svg.includes("Returned but not screened (n = 16)"));
});

const LEDGER = [
  "# Source Ledger: R",
  "",
  "> **Type:** Source Ledger",
  "> **Status:** Draft",
  "> **Owner:** O",
  "",
  "| ID | Source | Pin | Lookup | Checked | Read | Supports |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  "| S1 | Smith 2024. A study | arXiv:2401.00001 | not-looked-up | opened | full | C1 |",
  "| S2 | Jones 2024. Another | arXiv:2401.00002 | not-looked-up | opened | full | C2 |",
  "",
].join("\n");
const REGISTER = (rows) =>
  [
    "# Claims Register: R",
    "",
    "> **Type:** Claims Register",
    "> **Status:** Draft",
    "> **Owner:** O",
    "",
    "| ID | Claim | Numbers | Source | Level | Kind | Scope | Limit |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
const RECHECK = skeleton("recheck", { title: "R", owner: "O" }).replace(
  /\| N1 \|.*\|\n/,
  [
    // 0.6087 at n = 1319: no whole total gives it (the trial's S3).
    "| N1 | S1 | Table 2 (N assumed: the full test set) | grim | M = 60.87%, N = 1319 | mismatch |",
    "| N2 | S2 | Table 1 | grim | M = 17.06%, N = 1319 | consistent |",
  ].join("\n") + "\n",
);

test("validate --recheck caps at L1 a claim citing a source with a recheck mismatch, naming the row", () => {
  const flags = recheckFlags(RECHECK);
  assert.deepEqual([...flags.keys()], ["S1"]);
  const rows = [
    "| C1 | The arm raised accuracy | 0.38 | S1, S2 | L2 | exploratory | GSM8K | five studies |",
    "| C2 | The arm raised accuracy without S1 | 0.20 | S2; pooled-no-S1.json | L2 | exploratory | GSM8K | four studies |",
    "| C3 | S1 reports a gain | 0.76 | S1 | L1 | exploratory | GSM8K | N1 is a mismatch |",
    // The finding about the mismatch cites the recheck table itself, so it is not capped by it.
    "| C4 | S1's 60.87% cannot be a whole number of 1319 items | 60.87%; 1319 | S1; recheck.md | L2 | exploratory | Table 2 | N assumed |",
    // A claim citing S1 for something other than the mismatched number says so by naming the row in its Limit.
    "| C5 | All five studies ran both prompts on the same items | 5 | S1, S2 | L2 | exploratory | GSM8K | does not rest on N1 |",
  ];
  const problems = validate("claims-register", REGISTER(rows), { rechecks: { flags, file: "recheck.md" } }).problems;
  assert.deepEqual(problems, [
    "line 9: S1 has recheck row N1 (mismatch: Table 2 (N assumed: the full test set)), so a claim resting on it is at most L1; it is L2",
  ]);
  assert.deepEqual(validate("claims-register", REGISTER(rows)).problems, []);
  // From the command line, with --sources beside it.
  const dir = folder();
  writeFileSync(join(dir, "claims.md"), REGISTER(rows));
  writeFileSync(join(dir, "sources.md"), LEDGER);
  writeFileSync(join(dir, "recheck.md"), RECHECK);
  const refused = node("artifact.mjs", [
    "validate",
    join(dir, "claims.md"),
    "--sources",
    join(dir, "sources.md"),
    "--recheck",
    join(dir, "recheck.md"),
  ]);
  assert.equal(refused.status, 1, refused.stdout);
  assert.match(refused.stdout, /problem: line 9: S1 has recheck row N1 \(mismatch/);
  writeFileSync(join(dir, "fixed.md"), REGISTER(rows.slice(1)));
  const passed = node("artifact.mjs", [
    "validate",
    join(dir, "fixed.md"),
    "--sources",
    join(dir, "sources.md"),
    "--recheck",
    join(dir, "recheck.md"),
  ]);
  assert.equal(passed.status, 0, passed.stdout);
});

test("validate notes and ignores --sources and --recheck on a kind that does not read them", () => {
  const dir = folder();
  writeFileSync(join(dir, "sources.md"), LEDGER);
  writeFileSync(join(dir, "searches.jsonl"), lines(QUERY));
  const result = node("artifact.mjs", [
    "validate",
    join(dir, "searches.jsonl"),
    "--sources",
    join(dir, "sources.md"),
    "--recheck",
    join(dir, "sources.md"),
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /note: --sources does not apply to a search-ledger, so it was ignored/);
  assert.match(result.stdout, /note: --recheck does not apply to a search-ledger, so it was ignored/);
  // --plan still applies only to a register.
  assert.equal(
    node("artifact.mjs", ["validate", join(dir, "searches.jsonl"), "--plan", join(dir, "sources.md")]).status,
    2,
  );
});

test("stats.mjs effect makes risk differences, log odds and log risk ratios with their variances, unpaired and paired", () => {
  // Hand-computed: 60 of 100 against 40 of 100.
  const unpaired = { p1: 0.6, p2: 0.4, n1: 100, n2: 100 };
  close(effectSize("risk-difference", unpaired).yi, 0.2);
  close(effectSize("risk-difference", unpaired).vi, 0.0048);
  close(effectSize("log-odds", unpaired).yi, Math.log(2.25));
  close(effectSize("log-odds", unpaired).vi, 1 / 60 + 1 / 40 + 1 / 40 + 1 / 60);
  close(effectSize("log-risk-ratio", unpaired).yi, Math.log(1.5));
  close(effectSize("log-risk-ratio", unpaired).vi, 0.4 / 60 + 0.6 / 40);
  // Paired: 100 items, both pass 50, only the arm 20, only the reference 10.
  const paired = { armOnly: 20, referenceOnly: 10, both: 50, n: 100 };
  close(effectSize("risk-difference", paired).yi, 0.1);
  close(effectSize("risk-difference", paired).vi, 0.0029);
  close(effectSize("log-odds", paired).yi, Math.log(2));
  close(effectSize("log-odds", paired).vi, 0.15);
  close(effectSize("log-risk-ratio", paired).yi, Math.log(70 / 60));
  close(effectSize("log-risk-ratio", paired).vi, 30 / (70 * 60));
  assert.equal(effectSize("log-odds", paired).design, "paired");
  // A zero cell gets 0.5 added to each cell, with a warning.
  const zero = effectSize("log-odds", { p1: 1, p2: 0.5, n1: 10, n2: 10 });
  close(zero.yi, Math.log((10.5 * 5.5) / (0.5 * 5.5)));
  assert.match(zero.warnings[0], /0\.5 was added to each cell/);
  assert.throws(() => effectSize("risk-difference", { armOnly: 0, referenceOnly: 0, n: 10 }), /paired variance is 0/);
  assert.throws(() => effectSize("risk-difference", { p1: 1.2, p2: 0.5, n1: 10, n2: 10 }), /p1 must be a probability/);
  assert.throws(() => effectSize("odds", unpaired), /must be one of risk-difference, log-odds, log-risk-ratio/);
  assert.throws(() => effectSizes("log-odds", [unpaired, { p1: 0.5, n1: 3 }]), /study 2: p2 must be a probability/);
});

// The BCG vaccine trials (Colditz et al. 1994): the counts of R metafor's dat.bcg (vaccinated with and without TB,
// unvaccinated with and without TB), and the log risk ratios and variances statsmodels 0.15.0 gave for them
// (reviews.test.mjs pools the same values).
const BCG = {
  counts: [
    [4, 119, 11, 128],
    [6, 300, 29, 274],
    [3, 228, 11, 209],
    [62, 13536, 248, 12619],
    [33, 5036, 47, 5761],
    [180, 1361, 372, 1079],
    [8, 2537, 10, 619],
    [505, 87886, 499, 87892],
    [29, 7470, 45, 7232],
    [17, 1699, 65, 1600],
    [186, 50448, 141, 27197],
    [5, 2493, 3, 2338],
    [27, 16886, 29, 17825],
  ],
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

test("stats.mjs effect gives the BCG trials' log risk ratios, and meta reads its list form directly", () => {
  const bcg = BCG;
  const studies = bcg.counts.map(([tpos, tneg, cpos, cneg]) => ({
    p1: tpos / (tpos + tneg),
    p2: cpos / (cpos + cneg),
    n1: tpos + tneg,
    n2: cpos + cneg,
  }));
  const effects = effectSizes("log-risk-ratio", studies);
  effects.yi.forEach((value, i) => close(value, bcg.yi[i], 1e-9));
  effects.vi.forEach((value, i) => close(value, bcg.vi[i], 1e-9));
  const dir = folder();
  writeFileSync(join(dir, "studies.json"), JSON.stringify({ method: "log-risk-ratio", studies }));
  const made = node("stats.mjs", ["effect", "--input", join(dir, "studies.json"), "--out", join(dir, "effects.json")]);
  assert.equal(made.status, 0, made.stderr);
  const written = JSON.parse(readFileSync(join(dir, "effects.json"), "utf8"));
  assert.equal(written.computed_by, "stats.mjs effect log-risk-ratio");
  assert.equal(written.studies.length, 13);
  const pooled = node("stats.mjs", ["meta", "--method", "random", "--input", join(dir, "effects.json")]);
  assert.equal(pooled.status, 0, pooled.stderr);
  // The statsmodels reference for the BCG trials (reviews.test.mjs).
  close(JSON.parse(pooled.stdout).estimate, -0.7141172220732269, 1e-9);
  assert.equal(JSON.parse(pooled.stdout).computed_by, "stats.mjs meta random");
  // Without --method the effects file names its own method, which meta does not know.
  const wrong = node("stats.mjs", ["meta", "--input", join(dir, "effects.json")]);
  assert.equal(wrong.status, 2);
  assert.match(wrong.stderr, /unknown method "effect-log-risk-ratio" for meta/);
});

test("init project --kind review lays out synthesis/ and no study/ or paper/; the default is unchanged", () => {
  const dir = join(folder(), "review");
  const made = node("artifact.mjs", ["init", "project", dir, "--title", "T", "--owner", "O", "--kind", "review"]);
  assert.equal(made.status, 0, made.stderr);
  for (const path of [
    "brief.md",
    "sources/sources.md",
    "sources/searches.jsonl",
    "claims.md",
    "synthesis/evidence-table.md",
    "synthesis/recheck.md",
    "synthesis/figures",
    "reviews",
  ])
    assert.ok(existsSync(join(dir, path)), path);
  for (const path of ["study", "paper"]) assert.equal(existsSync(join(dir, path)), false, path);
  assert.match(readFileSync(join(dir, "synthesis/recheck.md"), "utf8"), /\*\*Type:\*\* Recheck Table/);
  assert.match(made.stdout, /synthesis\/ +evidence-table\.md, recheck\.md, effects\.json/);
  const bad = node("artifact.mjs", [
    "init",
    "project",
    join(folder(), "x"),
    "--title",
    "T",
    "--owner",
    "O",
    "--kind",
    "paper",
  ]);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /--kind takes review/);
  const plain = join(folder(), "plain");
  assert.equal(node("artifact.mjs", ["init", "project", plain, "--title", "T", "--owner", "O"]).status, 0);
  assert.ok(existsSync(join(plain, "paper/outline.md")));
  assert.equal(existsSync(join(plain, "synthesis")), false);
});

test("sources.mjs says its title search uses Crossref then arXiv, as the code does", () => {
  const help = node("sources.mjs", ["--help"]);
  assert.doesNotMatch(help.stdout + help.stderr, /OpenAlex/);
  assert.match(help.stdout + help.stderr, /--search-titles searches Crossref, then arXiv's titles/);
  assert.doesNotMatch(readFileSync(join(SCRIPTS, "lib/lookup.mjs"), "utf8"), /OpenAlex/);
});
