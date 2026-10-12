// Writes the F3 groups and suite-f3.json from the suite's groups (run write-groups.mjs first): one review against
// Review 1, an independent Review 2 and an adjudicator. Both arms get the requirements as declared context, the
// suite's tools and tests command; the arms differ only in their participants.
// Kept: every defective variant and every clean variant the clean audit keeps; group IDs, and so groups.json's
// held-out flags and run-tests.mjs, are the suite's.
// Usage (repository root): node .skill-eval/review-suite/tools/write-groups-f3.mjs
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const suite = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const relativeSuite = ".skill-eval/review-suite";
const JUDGE = { model: "anthropic/claude-haiku-5-5", thinking: "high" };

const ADJUDICATE =
  "Two independent reviews of the completed change in this workspace are in your declared context: `review1.response` and `review1.files` (Review 1's report and the `review.md` it wrote), and `review2.response` and `review2.files` (Review 2's). Adjudicate them as Review Work's adjudication says: test every material item against the change (`change.diff`, the changed files in `files/`, the author's report in `verification.md`) and the requirements, and dispose of each as Accepted, Rejected or Open, with its reason. Then derive the adjudicated judgment yourself; do not adopt either reviewer's judgment. Write only `review.md`. Its first line must be exactly one of `Judgment: Pass`, `Judgment: Non-blocking`, `Judgment: Inconclusive` or `Judgment: Blocking`. After it, list each accepted finding with the file and line it concerns, then each rejected or open item with its reason, or write `No findings.`";

// Review 1 is today's single review; Review 2 is fresh: it sees the change, never Review 1.
const PIPELINE = {
  protocol: "pipeline",
  stages: [
    { id: "review1", sees: ["fixture"] },
    { id: "review2", sees: ["fixture"], fresh: true },
    {
      id: "adjudicator",
      input: ADJUDICATE,
      sees: ["fixture", "review1.response", "review1.files", "review2.response", "review2.files"],
    },
  ],
  graded: "adjudicator",
};

const { groups: index } = JSON.parse(readFileSync(path.join(suite, "groups.json"), "utf8"));
const kept = index.filter((row) => row.variant !== "clean" || !row.clean_excluded);
const groupsDirectory = path.join(suite, "groups-f3");
rmSync(groupsDirectory, { recursive: true, force: true });
mkdirSync(groupsDirectory, { recursive: true });

for (const row of kept) {
  const source = JSON.parse(readFileSync(path.join(suite, "groups", `${row.id}.json`), "utf8"));
  const defective = row.variant !== "clean";
  // Checks on review.md only: the graded adjudicator need not run the tests itself.
  const expectations = source.expectations.filter((expectation) => expectation.comparison !== "ran-tests");
  const identified = source.review_questions.find((question) => question.startsWith("Did the review identify"));
  if (defective && identified === undefined) throw new Error(`${row.id}: no defect question to judge`);
  const group = {
    schema_version: 2,
    kind: "group",
    id: row.id,
    type: "body",
    input: source.input,
    fixture: source.fixture,
    tools: source.tools,
    // Every stage's workspace is as deep as a single review's, so the tests command's relative path holds.
    ...(source.commands ? { commands: source.commands } : {}),
    configuration: {
      extends: "../configuration.json",
      subject: { context: [`${relativeSuite}/context/${row.id}/requirements.md`] },
    },
    arms: { baseline: {}, candidate: { participants: PIPELINE } },
    component: ["participants"],
    expectations,
    review_questions: source.review_questions,
    // Whether the review identified the defect is judged, so a decision rule can use it.
    ...(defective ? { rubric: [{ id: "identified", question: identified }], judges: [JUDGE] } : {}),
  };
  writeFileSync(path.join(groupsDirectory, `${row.id}.json`), `${JSON.stringify(group, null, 2)}\n`);
}

writeFileSync(
  path.join(suite, "suite-f3.json"),
  `${JSON.stringify(
    {
      schema_version: 2,
      kind: "suite",
      id: "review-suite-f3",
      groups: kept.map((row) => `groups-f3/${row.id}.json`),
      // Detection on the defective cases; a clean case has no judged measure and is left out of the decision.
      decision: {
        measure: { judged: "identified" },
        arms: ["baseline", "candidate"],
        direction: "higher",
      },
    },
    null,
    2,
  )}\n`,
);
console.log(
  `${kept.length} F3 groups written (${kept.filter((row) => row.variant !== "clean").length} defective, ${kept.filter((row) => row.variant === "clean").length} clean)`,
);
