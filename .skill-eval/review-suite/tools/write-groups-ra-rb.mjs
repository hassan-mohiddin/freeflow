// Writes the R-a groups and the over-blocking fix's groups (trial 2), their reviewer briefs, the fixed skill copy and
// suite-ra-rb.json from the suite's groups (run write-groups.mjs first). R-a asks whether a short pointer brief finds
// as many defects as today's full reviewer prompt; the fix asks whether Review Work's rule to trace a Blocking Issue
// from a real caller or input rejects fewer clean changes. Three arms share one reference, `pointer`. Each arm's only
// declared context is its brief, in a file named neutrally (context-ra-rb/<group>/a.md, b.md, c.md), so no path the
// subject sees names its arm:
// - `full` (a.md): the Work Reviewer Prompt from skills/review-work/references/reviewer-contract.md, filled in for
//   the group: requirements and the author's report pasted, the changed files listed, Review 1, every lens, and the
//   `tests` command as active evidence authority (none for a real variant, which has no tests command), plus one
//   sentence before its Output section putting the Judgment line first, as the task prompt requires;
// - `pointer` (b.md): the pointer brief (DESIGN-task-path.md section 4) adapted to the fixture workspace;
// - `pointer-fix` (c.md): the pointer brief word for word, with skills-ra-rb/review-work as its subject skill instead
//   of skills/review-work: the live skill plus the fix's three edits (FIX), where the fix would ship. The subject sees
//   either skill only as its run's copy, so the path names no arm.
// Trial 1 ran a `pointer-judge-first` arm in c.md's place (aea3b537); its results are in results/.
// Each group's fixture is the suite's workspace plus the variant's requirements.md (fixtures-ra-rb/<group>/), so the
// pointer arms point to a file the reviewer reads rather than to text already in its prompt.
// Kept as the F3 groups have them: every defective variant and every clean variant the clean audit keeps; group IDs,
// task prompt, tools, commands and review questions are the suite's; the expectations are the suite's without
// `ran-tests`, as F3 dropped it; defective groups judge `identified` with Haiku at high thinking.
// Subjects run on configuration-grok.json (xai/grok-4.7, no auth extension). A judge inherits the reference arm's host
// setup, which no longer has the auth extension, so the judge declares configuration.json's setup as its own.
// Usage (repository root): node .skill-eval/review-suite/tools/write-groups-ra-rb.mjs
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const suite = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(suite, "../..");
const relativeSuite = ".skill-eval/review-suite";
const JUDGE = {
  model: "anthropic/claude-haiku-5-5",
  thinking: "high",
  configuration: { extends: "../configuration.json" },
};
const ARMS = ["full", "pointer", "pointer-fix"];
// Brief file names the subject may see in its declared context path; the mapping is in README.md and the rules.
const BRIEF_FILES = { full: "a.md", pointer: "b.md", "pointer-fix": "c.md" };
const REFERENCE = "pointer";
const BOUNDARY = "ready for PR review";
const LENSES =
  "source alignment, correctness and integration, failure and risk, evidence and acceptance, scope and minimality, maintainability";
const FIX_SKILL = `${relativeSuite}/skills-ra-rb/review-work`;
// The over-blocking fix: each edit is [file in the skill, text it follows or replaces, replacement].
const FIX = [
  [
    "references/reviewer-contract.md",
    "correction constraints or owning activity to re-enter.",
    "correction constraints or owning activity to re-enter. Trace the failure from a real caller or input, citing each step at file:line. If you cannot cite a step, report **Needs evidence** instead; if your own reading shows a step cannot happen, such as a value the producer never sends or an API that does exist, drop the item.",
  ],
  [
    "references/reviewer-contract.md",
    "- [location, issue, violated source, evidence, consequence, correction constraints or owning activity]",
    "- [location, issue, path from a real caller or input with file:line per step, violated source, evidence, consequence, correction constraints or owning activity]",
  ],
  [
    "SKILL.md",
    "A Blocking Issue must explain why the protected boundary cannot be crossed or the intended use cannot proceed.",
    "A Blocking Issue must explain why the protected boundary cannot be crossed or the intended use cannot proceed. For work, it also traces the failure from a real caller or input, citing each step at file:line: if you cannot cite a step, report Needs evidence; if your own reading shows a step cannot happen, it is not an Issue.",
  ],
];

/** The Work section's Reviewer Prompt, exactly as the contract has it. */
export function workReviewerPrompt(contract) {
  const work = contract.indexOf("\n## Work\n");
  const prompt = contract.indexOf("\n### Reviewer Prompt\n", work);
  const open = contract.indexOf("```md\n", prompt);
  const close = contract.indexOf("\n```\n", open);
  if (work < 0 || prompt < 0 || open < 0 || close < 0 || contract.indexOf("\n## Artifact\n") < close) {
    throw new Error("reviewer-contract.md: no Work Reviewer Prompt found");
  }
  return contract.slice(open + "```md\n".length, close + 1);
}

/** Each changed file in a unified diff, in diff order, marked when the diff adds or deletes it. */
export function changedFiles(diff) {
  const files = [];
  for (const section of diff.split(/^(?=diff --git )/m)) {
    const header = section.match(/^diff --git a\/(\S+) b\/(\S+)/);
    if (!header) continue;
    const mark = /^deleted file mode/m.test(section) ? " (deleted)" : /^new file mode/m.test(section) ? " (added)" : "";
    files.push(`${header[2]}${mark}`);
  }
  if (files.length === 0) throw new Error("change.diff names no changed file");
  return files;
}

// Pasted text is fenced so its own headings stay inside the brief's section.
const fence = (text) => `~~~~markdown\n${text.endsWith("\n") ? text : `${text}\n`}~~~~`;

function replaceOnce(text, from, to, where = "reviewer prompt") {
  const at = text.indexOf(from);
  if (at < 0 || text.indexOf(from, at + from.length) >= 0) {
    throw new Error(`${where}: expected exactly one ${JSON.stringify(from)}`);
  }
  return text.slice(0, at) + to + text.slice(at + from.length);
}

/** skills-ra-rb/review-work: the live Review Work with the fix's edits, each matched exactly once. */
function writeFixSkill() {
  const target = path.join(root, FIX_SKILL);
  rmSync(target, { recursive: true, force: true });
  cpSync(path.join(root, "skills/review-work"), target, { recursive: true });
  for (const [file, from, to] of FIX) {
    const at = path.join(target, file);
    writeFileSync(at, replaceOnce(readFileSync(at, "utf8"), from, to, `review-work/${file}`));
  }
}

/** The `full` arm's brief: the Work Reviewer Prompt filled in from the group's fixture. */
export function fullBrief(template, { requirements, verification, files, tests }) {
  const fills = [
    ["- Protected future action: [boundary]", `- Protected future action: ${BOUNDARY}`],
    [
      "- Reviewed state: [commit, tree, diff, or other exact identity]",
      "- Reviewed state: the change in this workspace: `change.diff`, with the changed files after the change in `files/`",
    ],
    [
      "- Work: [diff range, changed files, implementation, or integrated result]",
      `- Work: \`change.diff\`, which changes these files (each after the change in \`files/\`):\n${files.map((file) => `  - \`${file}\``).join("\n")}`,
    ],
    ["- Outcome: [required result]", "- Outcome: the change does what the requirements below state."],
    [
      "- Requirements: [accepted requirements]",
      `- Requirements: as accepted, pasted from the change's requirements:\n\n${fence(requirements)}\n`,
    ],
    ["- Non-goals: [intentional exclusions]", "- Non-goals: none stated."],
    [
      "- [Specs, Plans, tests, policies, ADRs, and established behavior]",
      `- The accepted requirements above. No Specs, Plans, policies or ADRs are supplied.${tests ? "\n- The change's declared tests, which the `tests` command runs." : ""}`,
    ],
    [
      "- Checks and results: [commands, observations, and results]",
      `- Checks and results: the author's report, pasted from \`verification.md\`:\n\n${fence(verification)}\n`,
    ],
    ["- Known gaps: [gaps or none]", "- Known gaps: as the author's report above states them."],
    [
      "- When relevant: [state owner, affecting paths, observer, forbidden mutations, prior-state requirements, adversarial disproof, mutation footprint, fidelity limits]\n",
      "",
    ],
    ["- Review number: [1 | 2 | 3]", "- Review number: 1"],
    [
      "\n## Output\n",
      "\nWrite review.md in the task's format: its first line is the Judgment line, as the task says; the fields below follow it.\n\n## Output\n",
    ],
    [
      "- Material lenses: [source alignment | correctness and integration | failure and risk | evidence and acceptance | scope and minimality | maintainability]",
      `- Material lenses: ${LENSES}`,
    ],
    [
      "- Active evidence authority: [the project's declared read-only checks: tests, build, typecheck, feature map drive steps | other exact covered check, expected evidence, and stop condition | none]",
      tests
        ? "- Active evidence authority: the `tests` command (through `run_command`), which runs the change's declared tests on the full tree, in your own copy, with no edits"
        : "- Active evidence authority: none; no check is declared for this change",
    ],
    // This is Review 1: the Review 2 or 3 inputs do not apply.
    [
      "For Review 2 or 3:\n\n- Previous report and its adjudication: [report path, or items with Accepted | Rejected | Open]\n- Clarifications: [settled decisions or none]\n- Diff since the previous review's reviewed state: [range], with corrections and new evidence\n- Remaining risk: [narrow unresolved scope]\n\n",
      "",
    ],
  ];
  return fills.reduce((text, [from, to]) => replaceOnce(text, from, to), template);
}

/** The pointer brief, adapted to the fixture workspace. */
export function pointerBrief({ tests }) {
  return [
    `Review round 1 of the change in this workspace, for the boundary "${BOUNDARY}".`,
    "Method: read the review-work skill's SKILL.md and its work reference.",
    "Context:",
    "- Requirements: `requirements.md`",
    "- Builder's evidence (check it, don't trust it): `verification.md`",
    "- Diff: `change.diff`, with the changed files after the change in `files/`",
    tests
      ? "You may run: the `tests` command, which runs the change's declared tests. No edits."
      : "You may run: nothing; no check is declared for this change. No edits.",
    "Write your report to `review.md`, then stop.",
    "",
  ].join("\n");
}

function main() {
  const template = workReviewerPrompt(
    readFileSync(path.join(root, "skills/review-work/references/reviewer-contract.md"), "utf8"),
  );
  const { groups: index } = JSON.parse(readFileSync(path.join(suite, "groups.json"), "utf8"));
  const kept = index.filter((row) => row.variant !== "clean" || !row.clean_excluded);
  const groupsDirectory = path.join(suite, "groups-ra-rb");
  const contextDirectory = path.join(suite, "context-ra-rb");
  const fixturesDirectory = path.join(suite, "fixtures-ra-rb");
  for (const directory of [groupsDirectory, contextDirectory, fixturesDirectory]) {
    rmSync(directory, { recursive: true, force: true });
    mkdirSync(directory, { recursive: true });
  }
  writeFixSkill();

  for (const row of kept) {
    const source = JSON.parse(readFileSync(path.join(suite, "groups", `${row.id}.json`), "utf8"));
    const defective = row.variant !== "clean";
    const tests = source.commands?.some((command) => command.id === "tests") ?? false;
    const workspace = path.join(root, source.fixture);
    const requirements = readFileSync(path.join(path.dirname(workspace), "requirements.md"), "utf8");
    if (requirements !== readFileSync(path.join(suite, "context", row.id, "requirements.md"), "utf8")) {
      throw new Error(`${row.id}: the fixture's requirements.md differs from the suite's context copy`);
    }
    // The suite's workspace, unchanged, plus the requirements the pointer briefs point to.
    const fixture = path.join(fixturesDirectory, row.id);
    cpSync(workspace, fixture, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true });
    writeFileSync(path.join(fixture, "requirements.md"), requirements);
    const briefs = {
      full: fullBrief(template, {
        requirements,
        verification: readFileSync(path.join(workspace, "verification.md"), "utf8"),
        files: changedFiles(readFileSync(path.join(workspace, "change.diff"), "utf8")),
        tests,
      }),
      pointer: pointerBrief({ tests }),
      "pointer-fix": pointerBrief({ tests }),
    };
    mkdirSync(path.join(contextDirectory, row.id), { recursive: true });
    for (const arm of ARMS) writeFileSync(path.join(contextDirectory, row.id, BRIEF_FILES[arm]), briefs[arm]);
    const brief = (arm) => `${relativeSuite}/context-ra-rb/${row.id}/${BRIEF_FILES[arm]}`;

    // The suite's checks on review.md, once per arm; `ran-tests` is left out, as F3 left it out.
    const checks = source.expectations.filter(
      (expectation) => expectation.variant === "baseline" && expectation.comparison !== "ran-tests",
    );
    const expectations = checks.flatMap(({ id, variant, ...check }) =>
      ARMS.map((arm) => ({ id: `${arm}-${check.comparison}`, variant: arm, ...check })),
    );
    const identified = source.review_questions.find((question) => question.startsWith("Did the review identify"));
    if (defective && identified === undefined) throw new Error(`${row.id}: no defect question to judge`);
    const group = {
      schema_version: 2,
      kind: "group",
      id: row.id,
      type: "body",
      input: source.input,
      fixture: `${relativeSuite}/fixtures-ra-rb/${row.id}`,
      tools: source.tools,
      ...(source.commands ? { commands: source.commands } : {}),
      configuration: { extends: "../configuration-grok.json" },
      arms: Object.fromEntries(
        ARMS.map((arm) => [
          arm,
          { subject: { context: [brief(arm)], ...(arm === "pointer-fix" ? { skills: [FIX_SKILL] } : {}) } },
        ]),
      ),
      reference: REFERENCE,
      component: ["subject.context", "subject.skills"],
      expectations,
      review_questions: source.review_questions,
      // Whether the review identified the defect is judged, so a decision rule can use it.
      ...(defective ? { rubric: [{ id: "identified", question: identified }], judges: [JUDGE] } : {}),
    };
    writeFileSync(path.join(groupsDirectory, `${row.id}.json`), `${JSON.stringify(group, null, 2)}\n`);
  }

  writeFileSync(
    path.join(suite, "suite-ra-rb.json"),
    `${JSON.stringify(
      {
        schema_version: 2,
        kind: "suite",
        id: "review-suite-ra-rb",
        groups: kept.map((row) => `groups-ra-rb/${row.id}.json`),
        // The fix against the pointer brief on detection over the defective cases; a clean case has no judged
        // measure and is left out. The rules that decide R-a and the fix (clean rejections, detection and cost
        // margins) cannot be expressed here and are fixed in results/ra-rb-decision-rules.md.
        decision: {
          measure: { judged: "identified" },
          arms: [REFERENCE, "pointer-fix"],
          direction: "higher",
          method: "sign-test",
          alpha: 0.05,
          min_cases: 10,
        },
      },
      null,
      2,
    )}\n`,
  );
  const defectiveCount = kept.filter((row) => row.variant !== "clean").length;
  console.log(
    `${kept.length} R-a/R-b groups written (${defectiveCount} defective, ${kept.length - defectiveCount} clean), ${kept.length * ARMS.length} briefs`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
