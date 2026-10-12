// Writes the contributor gate's suites (.skill-eval/gate/<skill>/), which measure a change: arms `base` and `head`
// load the same skill path from Git, and the gate (`npm run eval:gate`) replaces both refs with the base commit and
// HEAD through `--source`. The refs written here are placeholders that make the definitions load.
//
// - review-work: 6 tuning groups from the review suite's F3 groups (never held-out ones): 3 defective variants of
//   different classes, judged on `identified`, and 3 clean variants the clean audit keeps. The requirements are in
//   the prompt rather than declared context, because a Git-sourced arm reads its context from its own commit, and
//   the base commit need not hold the suite's context files.
// - write-skill and evaluate-behavior: the skill family's tuning groups for that skill (never held-out ones).
//
// Usage (repository root): node .skill-eval/gate/tools/write-gate-suites.mjs
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const gate = path.join(root, ".skill-eval/gate");
// Placeholders: origin/main and the feature branch when these suites were written. The gate overrides both.
const BASE_REF = "3415a8a2f4158e17fe605c5378f18eb4e8c08ed5";
const HEAD_REF = "51998038825153582abda2ee1b3249f18342871f";
const ARMS = { baseline: "base", candidate: "head" };

const REVIEW_GROUPS = {
  // Defective, one per class.
  "rv02-b": "logic",
  "rv03-b": "security",
  "rv11-a": "convention",
  // Clean, kept by the clean audit.
  "rv03-a": null,
  "rv04-a": null,
  "rv08-a": null,
};
const SKILL_FAMILY = {
  // w3-b is held out (position 12 of the skill-family suite) and is never listed here.
  "write-skill": ["w1-a", "w1-b", "w1-d", "w2-a", "w2-c", "w3-a", "w3-c", "w3-d"],
  "evaluate-behavior": ["v1-a", "v1-b"],
};

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** Expectations and their comparisons, with the arms renamed to base and head. */
function renameArms(expectations) {
  return expectations.map((expectation) => {
    const arm = ARMS[expectation.variant];
    if (arm === undefined) throw new Error(`unexpected arm ${expectation.variant}`);
    return { ...expectation, id: expectation.id.replace(/^(baseline|candidate)-/, `${arm}-`), variant: arm };
  });
}

const armsFor = () => ({
  base: { subject: { source: { kind: "git", ref: BASE_REF } } },
  head: {},
});

function writeSuite(name, groups, description) {
  const directory = path.join(gate, name);
  rmSync(path.join(directory, "groups"), { recursive: true, force: true });
  for (const group of groups) writeJson(path.join(directory, "groups", `${group.id}.json`), group);
  writeJson(path.join(directory, "suite.json"), {
    schema_version: 2,
    kind: "suite",
    id: `gate-${name}`,
    groups: groups.map((group) => `groups/${group.id}.json`),
  });
  return { name, groups: groups.length, description };
}

function reviewWork() {
  const index = readJson(path.join(root, ".skill-eval/review-suite/groups.json")).groups;
  const configuration = readJson(path.join(root, ".skill-eval/review-suite/configuration.json"));
  writeJson(path.join(gate, "review-work/configuration.json"), {
    ...configuration,
    id: "gate-review-work-haiku",
    configuration: {
      ...configuration.configuration,
      subject: { ...configuration.configuration.subject, source: { kind: "git", ref: HEAD_REF } },
    },
  });
  const groups = [];
  for (const [id, expected] of Object.entries(REVIEW_GROUPS)) {
    const entry = index.find((candidate) => candidate.id === id);
    if (entry === undefined || entry.held_out || entry.clean_excluded) throw new Error(`${id} is not a tuning group`);
    if ((entry.class ?? null) !== expected) throw new Error(`${id} is ${entry.class}, not ${expected}`);
    const source = readJson(path.join(root, ".skill-eval/review-suite/groups-f3", `${id}.json`));
    const requirements = readFileSync(
      path.join(root, ".skill-eval/review-suite/context", id, "requirements.md"),
      "utf8",
    ).trim();
    groups.push({
      schema_version: 2,
      kind: "group",
      id,
      type: source.type,
      input: {
        prompt: `${source.input.prompt}\n\nThe requirements the change must meet:\n\n${requirements}`,
      },
      fixture: source.fixture,
      tools: source.tools,
      ...(source.commands ? { commands: source.commands } : {}),
      configuration: { extends: "../configuration.json" },
      arms: armsFor(),
      reference: "base",
      component: ["subject.source"],
      expectations: renameArms(source.expectations),
      review_questions: source.review_questions,
      ...(source.rubric ? { rubric: source.rubric, judges: source.judges } : {}),
    });
  }
  return writeSuite("review-work", groups, "3 defective (logic, security, convention) and 3 clean review cases");
}

function skillFamily(name) {
  const skill = `skills/${name}`;
  const groups = [];
  for (const id of SKILL_FAMILY[name]) {
    const source = readJson(path.join(root, ".skill-eval/skill-family/groups", `${id}.json`));
    // A group may declare its own skill list (W3 declares the competing writing skills); the others use the one skill.
    const subject = { ...source.configuration.subject, skills: source.configuration.subject.skills ?? [skill] };
    groups.push({
      ...source,
      configuration: {
        ...source.configuration,
        extends: "../../../skill-family/configuration.json",
        subject: { ...subject, source: { kind: "git", ref: HEAD_REF } },
      },
      arms: armsFor(),
      reference: "base",
      component: ["subject.source"],
      expectations: renameArms(source.expectations),
    });
  }
  return writeSuite(name, groups, `the skill family's ${name} tuning groups`);
}

const written = [reviewWork(), skillFamily("write-skill"), skillFamily("evaluate-behavior")];
for (const suite of written) {
  console.log(`.skill-eval/gate/${suite.name}: ${suite.groups} groups (${suite.description}); 2 arms, base and head`);
}
