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
import { lockAsBefore } from "./old-lock.mjs";

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
  return (
    skeleton("study-plan", { title: "P", owner: "O", rigor: "study" })
      .replaceAll("<the answer, before any data>", "Answered before any data.")
      .replace(/<how it is done today[^>]*>/, "Answered before any data.")
      .replace(/<the noise floor[^>]*>/, "Answered before any data.")
      // Plans written before the Method column existed: the helper keeps testing them.
      .replace("| Decision rule | Method |", "| Decision rule |")
      .replace("| --- | --- | --- | --- | --- | --- |", "| --- | --- | --- | --- | --- |")
      .replace(/ <the stats\.mjs family[^>]*> \|/, "")
      // ... and before the Budget column: dedicated tests cover both.
      .replace(
        "| Unit | Arm | Trials | Budget |\n| --- | --- | --- | --- |",
        "| Unit | Arm | Trials |\n| --- | --- | --- |",
      )
      .replace(/\| <unit> \| <arm> \| <trials> \| <[^>]*> \|/, "| <unit> | <arm> | <trials> |")
      .replaceAll("<how this route is controlled, or unknown>", "unknown")
      .replace(/<the prediction: [^>]*>/, "One task per arm; power mcnemar-cases sized it.")
      .replace(
        "| C1 | <what the study tests> | confirmatory | <the primary metric> | <the rule that decides it> |",
        "| C1 | Prompt b passes more tasks | confirmatory | pass rate | exact McNemar, two-sided p < 0.05 |",
      )
      .replace("| <unit> | <arm> | <trials> |", "| t1 | a | 1 |\n| t1 | b | 1 |")
  );
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
  const one = register([row("C1", "Under variant V1 the rate is lower", "S1")]);
  assert.ok(
    validate("claims-register", one, { plan: withPlan }).problems.some((problem) =>
      problem.includes("V2, an analysis variant of the plan, is reported by no claim"),
    ),
  );
  const both = register([
    row("C1", "Under variant V1 the rate is lower", "S1"),
    [...row("C2", "The rate holds", "S1").slice(0, 6), "variant V2: per family", "one search"],
  ]);
  assert.deepEqual(validate("claims-register", both, { plan: withPlan }).problems, []);
});

test("study.mjs check notes a study-rigor plan that lists no variants or models", () => {
  const dir = mkdtempSync(join(tmpdir(), "research-fields-plan-"));
  const base = withoutNewSections(plan());
  writeFileSync(join(dir, "plan.md"), base);
  // A plan locked before these sections existed: a new one without them is refused (gate-fixes.test.mjs).
  lockAsBefore(join(dir, "plan.md"), "O");
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

test("a study read only at its abstract says so in Weakness", () => {
  const table = (weakness) =>
    `# Evidence Table: E\n\n> **Type:** Evidence Table\n> **Status:** Draft\n> **Owner:** O\n\n| Source | Design | n | Result | Failure condition | Level | Weakness |\n| --- | --- | --- | --- | --- | --- | --- |\n| S1 | RCT | 40 | helped | no gain | L1 | ${weakness} |\n`;
  const ledger = (read) => new Map([["S1", { Checked: "abstract", Read: read }]]);
  const problems = (weakness, read) => validate("evidence-table", table(weakness), { ledger: ledger(read) }).problems;
  assert.deepEqual(problems("one site", "abstract"), [
    'line 9: S1 was read only at its abstract, so Weakness says so: "not assessed (read: abstract)", or the weakness the abstract shows, marked "(read: abstract)"',
  ]);
  assert.deepEqual(problems("not assessed (read: abstract)", "abstract"), []);
  assert.deepEqual(problems("one site (read: abstract)", "abstract"), []);
  assert.deepEqual(problems("one site", "full"), []);
});

test("the absence check reads the wording classes, not a phrase list", () => {
  const refused = (claim) =>
    validate("claims-register", register([row("C1", claim)])).problems.some((problem) =>
      problem.includes("cite the search behind it"),
    );
  for (const claim of [
    "This is the first",
    "No tool does Y",
    "Nobody has done X",
    "We are the first team to measure judge drift",
    "We were first to show judge drift",
    "This is the first time judge drift is measured",
    "No one else has measured judge drift",
    "Nobody measured judge drift before",
    "Judge drift has never been measured",
    "These judges have not been studied",
    "There is no prior research on judge drift",
    "We know of no work that measures drift",
    "The approach is unprecedented",
    "Judge drift is unexplored",
  ])
    assert.ok(refused(claim), `should need a search: ${claim}`);
  for (const claim of [
    "The first study arm failed at n = 10",
    "The first tool we ran crashed",
    "We ran the first system check on Monday",
    "The first to fail was prompt B",
    "No other work was excluded from the sample",
    "Nobody has dropped out of the study",
    "The first run failed",
    "No judge passed the decoys",
  ])
    assert.ok(!refused(claim), `should not need a search: ${claim}`);
});

test("a variant counts as reported only when a row names it as a variant, and an amendment cannot drop one", () => {
  const withPlan = { hypotheses: new Map(), locked: true, variants: ["V1", "V2"] };
  const reported = (rows) =>
    !validate("claims-register", register(rows), { plan: withPlan }).problems.some((problem) => problem.includes("V2"));
  assert.ok(reported([row("C1", "Under variant V1 the rate is lower"), row("C2", "Under variant V2 it holds")]));
  // A bare ID, or a "V2" that names something else, is not a report of the variant.
  assert.ok(!reported([row("C1", "Under variant V1 the rate is lower"), [...row("C2", "x").slice(0, 7), "V2"]]));
  assert.ok(
    !reported([row("C1", "Under variant V1 the rate is lower"), row("C2", "Accuracy on the MMLU V2 set is 0.7")]),
  );
  // Variants in the plan's earlier versions still count, from the lock.
  const dir = mkdtempSync(join(tmpdir(), "research-fields-amend-"));
  const text = withoutNewSections(plan()).replace(
    "## Amendments",
    `${VARIANTS}## Models in the method\n\nnone\n\n## Amendments`,
  );
  writeFileSync(join(dir, "plan.md"), text);
  lockAsBefore(join(dir, "plan.md"), "O");
  writeFileSync(join(dir, "plan.md"), text.replace("| V2 | Per-family means | the unit |\n", ""));
  assert.equal(node("study.mjs", "amend", join(dir, "plan.md"), "--by", "O", "--reason", "tidy").status, 0);
  writeFileSync(join(dir, "claims.md"), register([row("C1", "Under variant V1 the rate is lower")]));
  const run = node("artifact.mjs", "validate", join(dir, "claims.md"), "--plan", join(dir, "plan.md"));
  assert.match(run.stdout, /V2, an analysis variant of the plan/);
});

test("the optional sections are found whatever their case, and their rows are checked closely", () => {
  const base = withoutNewSections(plan());
  const lower = base.replace(
    "## Amendments",
    `${VARIANTS.replace("## Analysis variants", "## Analysis Variants")}## Amendments`,
  );
  assert.deepEqual(planVariants(lower), ["V1", "V2"]);
  const duplicate = base.replace("## Amendments", `${VARIANTS.replace("| V2 |", "| V1 |")}## Amendments`);
  assert.ok(validate("study-plan", duplicate).problems.some((problem) => problem.includes("duplicate")));
  const wide = base.replace(
    "## Amendments",
    `${VARIANTS.replace("| the unit |", "| the unit | extra |")}## Amendments`,
  );
  assert.ok(validate("study-plan", wide).problems.some((problem) => problem.includes("cells")));
  const models = (cells) =>
    base.replace(
      "## Amendments",
      `## Models in the method\n\n| Role | Model | Snapshot | Accessed |\n| --- | --- | --- | --- |\n| ${cells.join(" | ")} |\n\n## Amendments`,
    );
  assert.deepEqual(validate("study-plan", models(["judge", "Haiku", "claude-haiku-5-5", "2026-10-27"])).problems, []);
  for (const [cells, word] of [
    [["reviewer", "Haiku", "claude-haiku-5-5", "2026-10-27"], "Role"],
    [["judge", "Haiku", "latest", "2026-10-27"], "Snapshot"],
    [["judge", "Haiku", "Haiku", "2026-10-27"], "Snapshot"],
    [["judge", "Haiku", "claude-haiku-5-5", "2026-02-30"], "Accessed"],
    [["judge", "Haiku", "claude-haiku-5-5", "2999-01-01"], "Accessed"],
  ])
    assert.ok(
      validate("study-plan", models(cells)).problems.some((problem) => problem.includes(word)),
      `${cells.join(", ")} should be refused for ${word}`,
    );
});
