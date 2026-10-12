// Writes the suite's group definitions and suite.json from cases.json (run index-cases.mjs first).
// Each variant of each case becomes one group with a neutral ID (rvNN-a / rvNN-b), so no ID, path or file name the
// subject could see tells it the variant. Case numbers and letters come from a hash of the case name, not its order.
// Each group compares requirements withheld (baseline) with requirements given as declared context (candidate).
// Usage (repository root): node .skill-eval/review-suite/tools/write-groups.mjs
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const suite = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const relativeSuite = ".skill-eval/review-suite";
const { cases } = JSON.parse(readFileSync(path.join(suite, "cases.json"), "utf8"));
const hash = (value) => createHash("sha256").update(value).digest("hex");

const PROMPT =
  "Review the completed change in this workspace against what it must do: `change.diff` is the change, `files/` holds the changed files after the change, and `verification.md` is the author's report. Write only `review.md`. Its first line must be exactly one of `Judgment: Pass`, `Judgment: Non-blocking`, `Judgment: Inconclusive` or `Judgment: Blocking`. After it, list each finding with the file and line it concerns, or write `No findings.`";

const ordered = [...cases].sort((left, right) => hash(left.case).localeCompare(hash(right.case)));
const groupsDirectory = path.join(suite, "groups");
const contextDirectory = path.join(suite, "context");
for (const directory of [groupsDirectory, contextDirectory]) {
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
}

const index = [];
ordered.forEach((entry, position) => {
  const number = String(position + 1).padStart(2, "0");
  const variants = Object.keys(entry.variants).sort();
  if (hash(`${entry.case}:letters`)[0] >= "8") variants.reverse();
  variants.forEach((variant, letterIndex) => {
    const id = `rv${number}-${"ab"[letterIndex]}`;
    const facts = entry.variants[variant];
    const provenance = JSON.parse(readFileSync(path.join(suite, "provenance", `${entry.case}.json`), "utf8"));
    const record = provenance.variants?.[variant] ?? {};
    const fixture = `${relativeSuite}/fixtures/${entry.case}/${variant}`;
    // The subject sees a declared context path, so the requirements are declared from a path named only by the group ID.
    mkdirSync(path.join(contextDirectory, id), { recursive: true });
    copyFileSync(
      path.join(suite, "fixtures", entry.case, variant, "requirements.md"),
      path.join(contextDirectory, id, "requirements.md"),
    );
    const both = (comparison, expectation) =>
      ["baseline", "candidate"].map((arm) => ({
        id: `${arm}-${comparison}`,
        variant: arm,
        comparison,
        ...expectation,
      }));
    const expectations = [
      ...both("only-review", { kind: "changed-paths", expect: "equals", paths: ["review.md"] }),
      ...both("judgment-line", {
        kind: "file-text",
        path: "review.md",
        line: 1,
        expect: "contains",
        value: "Judgment: ",
      }),
      ...(entry.tests
        ? both("ran-tests", { kind: "tool-call", tool: "run_command", expect: "called", argumentContains: ["tests"] })
        : []),
    ];
    const reviewQuestions = [];
    if (facts.defective) {
      expectations.push(
        ...both("not-passed", {
          kind: "file-text",
          path: "review.md",
          line: 1,
          expect: "not-contains",
          value: "Judgment: Pass",
        }),
      );
      facts.location.forEach((location, number) => {
        const file = path.basename(location.replace(/:\d+$/, ""));
        expectations.push(
          ...both(`names-file-${number + 1}`, {
            kind: "file-text",
            path: "review.md",
            expect: "contains",
            value: file,
          }),
        );
      });
      const description = record.defect ?? record.description ?? record.seed ?? "";
      reviewQuestions.push(
        `Did the review identify the defect at ${facts.location.join(" and ")} (the expression \`${facts.locator}\`): ${description} Did it support the finding with the file and line?`,
        "Did the review avoid findings that the change, its files and the author's report do not support?",
      );
    } else if (!facts.excluded) {
      // A clean change is rejected when the review stops it: Inconclusive or Blocking (clean-audit.json).
      expectations.push(
        ...both("not-blocked", {
          kind: "file-text",
          path: "review.md",
          line: 1,
          expect: "not-contains",
          value: "Judgment: Blocking",
        }),
        ...both("not-inconclusive", {
          kind: "file-text",
          path: "review.md",
          line: 1,
          expect: "not-contains",
          value: "Judgment: Inconclusive",
        }),
        ...both("judged-pass", {
          kind: "file-text",
          path: "review.md",
          line: 1,
          expect: "equals",
          value: "Judgment: Pass",
        }),
      );
      reviewQuestions.push(
        "Did the review avoid reporting problems that the change, its files and the author's report do not support?",
        "Did the review keep style or naming preferences out of its findings?",
      );
    } else {
      reviewQuestions.push(
        `Did the review identify this known issue in the change: ${facts.excluded}`,
        "Did the review avoid findings that the change, its files and the author's report do not support?",
      );
    }
    const group = {
      schema_version: 2,
      kind: "group",
      id,
      type: "body",
      input: { prompt: PROMPT },
      fixture: `${fixture}/workspace`,
      tools: entry.tests ? ["read", "write", "ls", "find", "run_command"] : ["read", "write", "ls", "find"],
      // The reviewer may run the change's declared tests; the runner rebuilds the full tree (tools/run-tests.mjs).
      // A command runs in the run's workspace, seven levels below the repository root.
      ...(entry.tests
        ? {
            commands: [
              {
                id: "tests",
                argv: ["node", "../../../../../../../.skill-eval/review-suite/tools/run-tests.mjs", id],
                timeout_ms: 300000,
              },
            ],
          }
        : {}),
      configuration: { extends: "../configuration.json" },
      arms: {
        baseline: { subject: { context: [] } },
        candidate: { subject: { context: [`${relativeSuite}/context/${id}/requirements.md`] } },
      },
      component: ["subject.context"],
      expectations,
      review_questions: reviewQuestions,
    };
    writeFileSync(path.join(groupsDirectory, `${id}.json`), `${JSON.stringify(group, null, 2)}\n`);
    index.push({
      id,
      case: entry.case,
      variant,
      kind: entry.kind,
      held_out: entry.held_out,
      class: facts.class,
      ...(facts.excluded ? { clean_excluded: true } : {}),
    });
  });
});

index.sort((left, right) => left.id.localeCompare(right.id));
writeFileSync(
  path.join(suite, "suite.json"),
  `${JSON.stringify({ schema_version: 2, kind: "suite", id: "review-suite", groups: index.map((row) => `groups/${row.id}.json`) }, null, 2)}\n`,
);
writeFileSync(path.join(suite, "groups.json"), `${JSON.stringify({ groups: index }, null, 2)}\n`);
console.log(`${index.length} groups written`);
