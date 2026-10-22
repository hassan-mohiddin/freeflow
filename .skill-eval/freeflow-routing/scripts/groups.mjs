#!/usr/bin/env node
// Writes the suite's groups (groups/<case>.json), simulated-user cards (cards/<case>.md) and suite.json from the case
// table in cases.mjs and the image digest in image/digests.json. Every group shares configuration.json (host, model,
// Freeflow build and settings, network) and differs only in its request, its card and its checks. The checks name the
// base's skills and, for a merged skill, its owner too (cases.mjs, gradedSkills).
// Run from the repository root after changing a case or re-pinning the image:
//   node .skill-eval/freeflow-routing/scripts/groups.mjs && npx prettier --write .skill-eval/freeflow-routing
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CASES, gradedSkills } from "./cases.mjs";

const SUITE = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT_PATH = ".skill-eval/freeflow-routing";
const CONFIGURATION = JSON.parse(readFileSync(join(SUITE, "configuration.json"), "utf8")).configuration;
const IMAGE = JSON.parse(readFileSync(join(SUITE, "image", "digests.json"), "utf8")).shelf;
const ARM = "freeflow";
// The agent's whole tool set with Tool Execution on, as a user of Freeflow on Pi has it. ask_user is left out: no one
// could answer its dialog in a run, so the guard refuses it and the agent asks in its reply instead.
export const TOOLS = [
  "read",
  "write",
  "edit",
  "ls",
  "find",
  "grep",
  "bash",
  "bash_background",
  "monitor",
  "stop_background",
  "apply_patch",
];
// The request and one reply at most: routing shows in the first turns, and the task need not be finished.
const USER = { thinking: "low", max_turns: 2, stop: "THANKS, DONE" };

// The rules every card shares (as in .skill-eval/freeflow-vs-plain): answer only what is asked, never steer, say go
// when asked to proceed, and end once the agent reports what it did or answers the question.
const CARD_RULES = [
  "Answer only what the agent asks, in one or two short sentences. Never volunteer a preference it did not ask about, never hint at how to do the work, and never name a skill, a tool or a process for it to use.",
  'If it asks you to choose between options or asks about anything else, say "your recommendation is fine".',
  'When it asks whether to go ahead, or to confirm its plan or its choices, reply "go".',
  'If it pauses without asking anything and without saying it is done, reply "go".',
  "If it asks whether to commit, push or open a pull request when you did not ask for one, say it isn't needed.",
  "Never tell the agent to stop, wait, hold or pause, never ask it to start over, and never ask for more detail than it gave you.",
  `Once the agent says the work is done, reports what it did, or answers your question, reply with exactly: ${USER.stop}.`,
];

function card(entry) {
  return [
    "You are the developer who owns shelf, a small reading-list command line tool with a web view. You asked a coding agent for something and are now chatting with it.",
    "",
    "What you asked:",
    "",
    `> ${entry.prompt}`,
    "",
    "How you behave:",
    ...CARD_RULES.map((rule) => `- ${rule}`),
    "",
  ].join("\n");
}

/** A check that the skill's SKILL.md was read (`succeeded`) or never read (`not-called`) with the read tool. */
function skillRead(skill, expect) {
  return {
    id: `${expect === "succeeded" ? "read" : "no"}-${skill}`,
    kind: "tool-call",
    variant: ARM,
    tool: "read",
    argumentContains: [`/skills/${skill}/SKILL.md`],
    expect,
  };
}

function group(entry) {
  const { read, no } = gradedSkills(entry);
  return {
    schema_version: 2,
    kind: "group",
    id: entry.id,
    type: "body",
    input: { prompt: entry.prompt },
    fixture: `${ROOT_PATH}/fixtures/shelf`,
    tools: TOOLS,
    configuration: {
      extends: "../configuration.json",
      environment: { kind: "container", image: IMAGE, workdir: "/testbed", network: "none" },
    },
    arms: { [ARM]: {} },
    reference: ARM,
    participants: {
      protocol: "conversation",
      user: { model: CONFIGURATION.model.model, ...USER, card: `${ROOT_PATH}/cards/${entry.id}.md` },
    },
    // The base's checks and the merged build's (gradedSkills): either build's route shows in the grade.
    expectations: [
      ...read.map((skill) => skillRead(skill, "succeeded")),
      ...no.map((skill) => skillRead(skill, "not-called")),
    ],
    review_questions: [],
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const folder of ["groups", "cards"]) {
    rmSync(join(SUITE, folder), { recursive: true, force: true });
    mkdirSync(join(SUITE, folder), { recursive: true });
  }
  for (const entry of CASES) {
    writeFileSync(join(SUITE, "groups", `${entry.id}.json`), `${JSON.stringify(group(entry), null, 2)}\n`);
    writeFileSync(join(SUITE, "cards", `${entry.id}.md`), card(entry));
  }
  const suite = {
    schema_version: 2,
    kind: "suite",
    id: "freeflow-routing",
    groups: CASES.map((entry) => `groups/${entry.id}.json`),
  };
  writeFileSync(join(SUITE, "suite.json"), `${JSON.stringify(suite, null, 2)}\n`);
  process.stdout.write(`${CASES.length} groups written\n`);
}
