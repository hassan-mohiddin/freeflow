#!/usr/bin/env node
// Writes the suite's groups (groups/<task>.json), simulated-user cards (cards/<task>.md) and suite.json from the task
// table below and the image digest in image/digests.json. Every group shares configuration.json (host, model, Freeflow
// build with Tool Execution on, network) and differs only in its task: prompt, card, fixture, hidden tests, the tool
// checks and the reference solution.
// Run from the repository root after changing a task or re-pinning the image:
//   node .skill-eval/freeflow-tool-use/scripts/groups.mjs && npx prettier --write .skill-eval/freeflow-tool-use
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SUITE = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT_PATH = ".skill-eval/freeflow-tool-use";
const CONFIGURATION = JSON.parse(readFileSync(join(SUITE, "configuration.json"), "utf8")).configuration;
const IMAGE = JSON.parse(readFileSync(join(SUITE, "image", "digests.json"), "utf8")).tools;
const ARM = "freeflow";
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
// The request, an agreement round and the work fit in four agent turns.
const USER = { thinking: "low", max_turns: 4, stop: "THANKS, DONE" };
// Every hidden test name starts with this, so no natural reply or file contains one.
const NAME_PREFIX = "ftu: ";

// The rules every card shares, as in .skill-eval/freeflow-vs-plain.
const CARD_RULES = [
  "Answer only what the agent asks, in one or two short sentences. Never volunteer a preference it did not ask about, never hint at how to do the work, never name a tool or a command for it to use, and never describe your preferences below unless a question or a proposed choice touches them.",
  "When the agent lists choices or a plan, read each one. If one touches a preference below and differs from it, say what you want instead, in plain words. Accept the rest.",
  'If it asks about something your preferences below do not cover, say "your recommendation is fine".',
  'When it asks whether to go ahead, or to confirm its plan or its choices, reply "go", with any correction from the rule above in the same message.',
  'If it pauses without asking anything and without saying the work is done, reply "go".',
  "If it asks whether to commit, push or open a pull request, say it isn't needed.",
  "Never tell the agent to stop, wait, hold or pause, never ask it to start over, and never ask to see more detail or more choices than it showed you.",
  `Once the agent says the work is done, or reports what it did, reply with exactly: ${USER.stop}. Do this even when it also offers more.`,
];

/** A check that a tool was called, succeeded, or was never called, optionally with arguments containing a text. */
function tool(id, name, expect, argumentContains = []) {
  return {
    id,
    kind: "tool-call",
    variant: ARM,
    tool: name,
    ...(argumentContains.length > 0 ? { argumentContains } : {}),
    expect,
  };
}

/**
 * The tasks. `right` lists the checks of the tool Freeflow's Tool Execution means for the task; `also` lists reported
 * checks of the other tools; `hidden` the required hidden tests; `originals`, files the hidden test compares the
 * workspace with, copied from graders/originals/<task>.
 */
export const TASKS = [
  {
    id: "dev-server-health",
    kind: "server, readiness, stop",
    prompt:
      "Start the dev server and tell me what its /health endpoint reports. Save the JSON it returns to health.json, then shut the server down.",
    wants: ["health.json holds exactly the JSON the endpoint returned, nothing added.", "Use the default port."],
    right: [tool("tool-background", "bash_background", "called"), tool("tool-stop", "stop_background", "succeeded")],
    also: [tool("no-monitor", "monitor", "not-called")],
    hidden: ["health.json holds what /health returned"],
  },
  {
    id: "template-watch",
    kind: "watcher, act on its lines, stop",
    prompt:
      "Start the template watcher (npm run watch) and keep it running while you fix the templates it reports errors for, until it reports every template ok. Then stop the watcher.",
    wants: [
      "Fix the templates themselves; leave the watcher, the compiler and data/site.json as they are.",
      "On the about page the sentence reads: '<the bistro's name> is at <its address>.'",
    ],
    right: [tool("tool-monitor", "monitor", "called"), tool("tool-stop", "stop_background", "succeeded")],
    also: [tool("tool-background", "bash_background", "called")],
    hidden: [
      "the about page names the bistro and its address",
      "the menu lists every dish once inside its list",
      "the home page still builds",
      "the watcher, compiler and data are unchanged",
    ],
    originals: true,
  },
  {
    id: "slow-suite",
    kind: "long test run",
    prompt: "Run the full test suite (it takes a few minutes) and fix whatever fails.",
    wants: ["Fix the code, not the tests: the tests describe what the warehouse should do."],
    right: [tool("tool-background", "bash_background", "called", ["test"])],
    also: [tool("no-foreground-suite", "bash", "not-called", ["npm test"])],
    hidden: [
      "reserved units are no longer available",
      "reserving more than is available is refused",
      "shipping, restocking and validation still work",
      "the suite's tests are unchanged",
    ],
    originals: true,
  },
  {
    id: "move-helper",
    kind: "multi-file change with a new file",
    prompt:
      "Move formatPrice out of src/utils.js into a new file, src/money.js, rename it formatMoney, and update everything that uses it.",
    wants: ["formatMoney behaves exactly like formatPrice did.", "slugify stays in src/utils.js."],
    right: [tool("tool-patch", "apply_patch", "succeeded")],
    also: [tool("tool-edit", "edit", "succeeded")],
    hidden: [
      "src/money.js exports formatMoney with the same output",
      "utils.js keeps slugify and no longer has the price helper",
      "nothing names formatPrice any more",
      "the cart, invoice and receipt import formatMoney from money.js",
      "every page prints what it printed before",
    ],
  },
  {
    id: "one-line-fix",
    kind: "one-file edit",
    prompt: "The door screen says 'Helo' instead of 'Hello'. Fix the typo in src/greet.js.",
    wants: [],
    right: [tool("tool-edit", "edit", "succeeded"), tool("no-patch", "apply_patch", "not-called")],
    also: [],
    hidden: ["the greeting says Hello", "the rest of the screen is unchanged"],
  },
];

function card(task) {
  return [
    "You are the developer who owns this small project. You asked a coding agent for something and are now chatting with it.",
    "",
    "What you asked:",
    "",
    `> ${task.prompt}`,
    "",
    "How you behave:",
    ...CARD_RULES.map((rule) => `- ${rule}`),
    "",
    "Your preferences (hidden; reveal one only when a question or a proposed choice touches it):",
    ...(task.wants.length > 0 ? task.wants.map((want) => `- ${want}`) : ["- None beyond the request."]),
    "",
  ].join("\n");
}

function hiddenTests(task) {
  const files = { ".ftu-hidden.test.mjs": `${ROOT_PATH}/graders/${task.id}.test.mjs` };
  if (task.originals) {
    const originals = join(SUITE, "graders", "originals", task.id);
    if (!existsSync(originals)) throw new Error(`${task.id} has no graders/originals folder`);
    for (const file of listFiles(originals)) {
      files[`.ftu-original/${file}`] = `${ROOT_PATH}/graders/originals/${task.id}/${file}`;
    }
  }
  return {
    id: "task",
    kind: "command",
    variant: ARM,
    argv: ["node", "--test", "--test-reporter=tap", ".ftu-hidden.test.mjs"],
    files,
    timeout_seconds: 300,
    pass: { tests: { format: "node-test", required: task.hidden.map((name) => `${NAME_PREFIX}${name}`) } },
  };
}

function listFiles(folder, prefix = "") {
  return readdirSync(join(folder, prefix))
    .sort()
    .flatMap((entry) => {
      const relative = prefix === "" ? entry : `${prefix}/${entry}`;
      return statSync(join(folder, relative)).isDirectory() ? listFiles(folder, relative) : [relative];
    });
}

function group(task) {
  return {
    schema_version: 2,
    kind: "group",
    id: task.id,
    type: "body",
    input: { prompt: task.prompt },
    fixture: `${ROOT_PATH}/fixtures/${task.id}`,
    tools: TOOLS,
    configuration: {
      extends: "../configuration.json",
      environment: { kind: "container", image: IMAGE, workdir: "/testbed", network: "none" },
    },
    arms: { [ARM]: {} },
    reference: ARM,
    participants: {
      protocol: "conversation",
      user: { model: CONFIGURATION.model.model, ...USER, card: `${ROOT_PATH}/cards/${task.id}.md` },
    },
    expectations: [hiddenTests(task), ...task.right, ...task.also],
    review_questions: [],
    reference_solution: { files: `${ROOT_PATH}/reference/${task.id}` },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const folder of ["groups", "cards"]) {
    rmSync(join(SUITE, folder), { recursive: true, force: true });
    mkdirSync(join(SUITE, folder), { recursive: true });
  }
  for (const task of TASKS) {
    writeFileSync(join(SUITE, "groups", `${task.id}.json`), `${JSON.stringify(group(task), null, 2)}\n`);
    writeFileSync(join(SUITE, "cards", `${task.id}.md`), card(task));
  }
  const suite = {
    schema_version: 2,
    kind: "suite",
    id: "freeflow-tool-use",
    groups: TASKS.map((task) => `groups/${task.id}.json`),
  };
  writeFileSync(join(SUITE, "suite.json"), `${JSON.stringify(suite, null, 2)}\n`);
  process.stdout.write(`${TASKS.length} groups written\n`);
}
