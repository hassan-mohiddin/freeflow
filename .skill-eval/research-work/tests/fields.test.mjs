// The fields that turn guidance into checks: a claim of novelty cites the search behind it, every analysis variant a
// plan lists is reported, the models in a method are declared, and an evidence table may name each study's weakness.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { planVariants, skeleton, validate } from "../../../skills/research-work/scripts/lib/formats.mjs";

const SCRIPTS = fileURLToPath(new URL("../../../skills/research-work/scripts/", import.meta.url));
const node = (script, ...args) => spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { encoding: "utf8" });

/** A claims register with the given rows (ID, Claim, Numbers, Source, Level, Kind, Scope, Limit). */
const register = (rows) =>
  [
    "# Claims Register: R",
    "",
    "> **Type:** Claims Register",
    "> **Status:** Draft",
    "> **Owner:** O",
    "",
    "| ID | Claim | Numbers | Source | Level | Kind | Scope | Limit |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row.join(" | ")} |`),
    "",
  ].join("\n");

const row = (id, claim, source = "S1") => [id, claim, "-", source, "L2", "exploratory", "these tools", "one search"];

test("a claim worded as an absence must cite the search behind it, and the search must exist", () => {
  for (const claim of [
    "We are the first to measure judge drift",
    "No prior work compares these judges",
    "This is shown for the first time",
    "The method is novel",
    "Nobody has measured this",
  ])
    assert.ok(
      validate("claims-register", register([row("C1", claim)])).problems.some((problem) =>
        problem.includes("cite the search behind it"),
      ),
      claim,
    );
  for (const claim of ["The first run failed", "No judge passed the decoys", "The tool is new to the team"])
    assert.deepEqual(validate("claims-register", register([row("C1", claim)])).problems, [], claim);
  const cited = register([row("C1", "No prior work compares these judges", "S1; search:Q2")]);
  assert.deepEqual(validate("claims-register", cited).problems, []);
  const searches = new Set(["Q1"]);
  assert.ok(
    validate("claims-register", cited, { searches }).problems.some((problem) =>
      problem.includes("the search ledger has no Q2"),
    ),
  );
  assert.deepEqual(validate("claims-register", cited, { searches: new Set(["Q2"]) }).problems, []);
});

test("the register is validated against a search ledger from the command line", () => {
  const dir = mkdtempSync(join(tmpdir(), "research-fields-"));
  writeFileSync(join(dir, "claims.md"), register([row("C1", "No prior work compares these judges", "S1; search:Q2")]));
  writeFileSync(
    join(dir, "search.jsonl"),
    '{"kind":"query","id":"Q1","query":"judges","database":"arXiv","date":"2026-10-27"}\n',
  );
  const run = node("artifact.mjs", "validate", join(dir, "claims.md"), "--search", join(dir, "search.jsonl"));
  assert.equal(run.status, 1, run.stderr);
  assert.match(run.stdout, /the search ledger has no Q2/);
});

/** A filled study plan at study rigor, with the skeleton's variant and model sections still holding placeholders. */
function plan() {
  return skeleton("study-plan", { title: "P", owner: "O", rigor: "study" })
    .replaceAll("<the answer, before any data>", "Answered before any data.")
    .replace(/<the prediction: [^>]*>/, "One task per arm; power mcnemar-cases sized it.")
    .replace(
      "| C1 | <what the study tests> | confirmatory | <the primary metric> | <the rule that decides it> |",
      "| C1 | Prompt b passes more tasks | confirmatory | pass rate | exact McNemar, two-sided p < 0.05 |",
    )
    .replace("| <unit> | <arm> | <trials> |", "| t1 | a | 1 |\n| t1 | b | 1 |");
}

/** The plan without its variant and model sections, as plans written before they existed are. */
const withoutNewSections = (text) =>
  text
    .replace(/## Analysis variants[\s\S]*?(?=## Models in the method)/, "")
    .replace(/## Models in the method[\s\S]*?(?=## Amendments)/, "");

const VARIANTS =
  "## Analysis variants\n\n| ID | Variant | What it changes |\n| --- | --- | --- |\n| V1 | Exclude refusals | the denominator |\n| V2 | Per-family means | the unit |\n\n";
const MODELS =
  "## Models in the method\n\n| Role | Model | Snapshot | Accessed |\n| --- | --- | --- | --- |\n| judge | Haiku | claude-haiku-5-5 | 2026-10-27 |\n\n";

test("a plan's analysis variants and models are checked when present, and the skeleton asks for them", () => {
  const skeletonPlan = plan();
  assert.match(skeletonPlan, /## Analysis variants/);
  assert.match(skeletonPlan, /## Models in the method/);
  assert.ok(validate("study-plan", skeletonPlan).problems.some((problem) => problem.includes("Analysis variants")));
  const base = withoutNewSections(skeletonPlan);
  assert.deepEqual(validate("study-plan", base).problems, []);
  const filled = base.replace("## Amendments", `${VARIANTS}${MODELS}## Amendments`);
  assert.deepEqual(validate("study-plan", filled).problems, []);
  assert.deepEqual(planVariants(filled), ["V1", "V2"]);
  assert.ok(
    validate("study-plan", filled.replace("| V2 |", "| X2 |")).problems.some((problem) =>
      problem.includes("V followed by a number"),
    ),
  );
  assert.ok(
    validate("study-plan", filled.replace("| 2026-10-27 |", "| last week |")).problems.some((problem) =>
      problem.includes("Accessed"),
    ),
  );
  const none = base.replace(
    "## Amendments",
    "## Analysis variants\n\nnone\n\n## Models in the method\n\nnone\n\n## Amendments",
  );
  assert.deepEqual(validate("study-plan", none).problems, []);
  assert.deepEqual(planVariants(none), []);
});

test("every analysis variant the plan lists is reported by some claim", () => {
  const withPlan = { hypotheses: new Map(), locked: true, variants: ["V1", "V2"] };
  const one = register([row("C1", "Under V1 the rate is lower", "S1")]);
  assert.ok(
    validate("claims-register", one, { plan: withPlan }).problems.some((problem) =>
      problem.includes("V2, an analysis variant of the plan, is reported by no claim"),
    ),
  );
  const both = register([
    row("C1", "Under V1 the rate is lower", "S1"),
    [...row("C2", "The rate holds", "S1").slice(0, 6), "V2: per family", "one search"],
  ]);
  assert.deepEqual(validate("claims-register", both, { plan: withPlan }).problems, []);
});

test("study.mjs check notes a study-rigor plan that lists no variants or models", () => {
  const dir = mkdtempSync(join(tmpdir(), "research-fields-plan-"));
  const base = withoutNewSections(plan());
  writeFileSync(join(dir, "plan.md"), base);
  assert.equal(node("study.mjs", "lock", join(dir, "plan.md"), "--by", "O").status, 0);
  const check = node("study.mjs", "check", join(dir, "plan.md"));
  assert.match(check.stdout, /note: the plan lists no analysis variants/);
  assert.match(check.stdout, /note: the plan declares no models in the method/);
  assert.equal(readFileSync(join(dir, "plan.md"), "utf8"), base);
});

test("an evidence table may add a Weakness column", () => {
  const table = (columns, cells) =>
    `# Evidence Table: E\n\n> **Type:** Evidence Table\n> **Status:** Draft\n> **Owner:** O\n\n| ${columns.join(" | ")} |\n| ${columns.map(() => "---").join(" | ")} |\n| ${cells.join(" | ")} |\n`;
  const six = ["Source", "Design", "n", "Result", "Failure condition", "Level"];
  const cells = ["S1", "RCT", "40", "helped", "no gain", "L2"];
  assert.deepEqual(validate("evidence-table", table(six, cells)).problems, []);
  assert.deepEqual(validate("evidence-table", table([...six, "Weakness"], [...cells, "one site"])).problems, []);
  assert.ok(
    validate("evidence-table", table([...six, "Weakness"], [...cells, ""])).problems.some((problem) =>
      problem.includes("Weakness must be filled"),
    ),
  );
});
