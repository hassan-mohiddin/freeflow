#!/usr/bin/env node
// Writes the suite's groups (groups/<task>.json), simulated-user cards (cards/<task>.md) and suite.json from the task
// table below and the image digest in image/digests.json. Every group shares configuration.json (host, model, Freeflow
// build with Tool Execution on, network) and differs only in its task: prompt, card, fixture, hidden tests, the tool
// checks and the reference solution. The script tasks (SCRIPT_TASKS) go to suite-scripts.json instead: they need
// v0.9.0's skill scripts and guidance notices, so they extend configuration-scripts.json (Freeflow at v0.9.0, notices
// on), share one project (fixtures/ledger, its history in the `ledger` image) and never run on the base build.
// Run from the repository root after changing a task or re-pinning the image:
//   node .skill-eval/freeflow-tool-use/scripts/groups.mjs && npx prettier --write .skill-eval/freeflow-tool-use
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SUITE = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT_PATH = ".skill-eval/freeflow-tool-use";
const CONFIGURATION = JSON.parse(readFileSync(join(SUITE, "configuration.json"), "utf8")).configuration;
const IMAGES = JSON.parse(readFileSync(join(SUITE, "image", "digests.json"), "utf8"));
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

/** A check that Freeflow's guidance notice reached the model: its text in the provider context of the last request. */
function notice(id, value) {
  return { id, kind: "context-text", variant: ARM, surface: "provider-context", value, expect: "contains" };
}

// What the report's order facts match: a tool call by name, with arguments containing every text.
const EDITS = [{ tool: "edit" }, { tool: "write" }, { tool: "apply_patch" }];
const bashWith = (...texts) => [{ tool: "bash", contains: texts }];

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

/**
 * The script tasks (v0.9.0 only): a v0.9.0 skill script or guidance notice is the right move. They share one project,
 * fixtures/ledger, whose history (main at 0.2.0, the CSV export left uncommitted, an untracked secrets.json) is built
 * into the `ledger` image. `right` lists the checks of the script; `also` reported checks, among them whether a
 * guidance notice reached the model (`notice-*`); `order` the report's facts about when the script ran, from the
 * transcript's tool calls: `before` (a call matching `first` came before the first call matching `then`) or
 * `afterLast` (a call matching `first` came after the last call matching `then`).
 */
export const SCRIPT_TASKS = [
  {
    id: "self-review-report",
    kind: "fix and test, self-review before the report",
    fixture: "ledger",
    image: "ledger",
    prompt:
      "The monthly report lumps January to September together into a single row. Fix it, and add a test that would have caught it.",
    wants: ["Each month gets its own row, labelled YYYY-MM.", "The new test goes with the other tests in test/."],
    right: [tool("tool-self-review", "bash", "succeeded", ["self-review.mjs"])],
    also: [notice("notice-self-review", "Before your final report (Execute Work)")],
    order: [{ id: "self-review-after-last-edit", first: bashWith("self-review.mjs"), then: EDITS, mode: "afterLast" }],
    hidden: [
      "each month is its own row, labelled YYYY-MM",
      "the project's tests pass",
      "the project's tests fail on the original report code",
    ],
    originals: true,
  },
  {
    id: "touch-map-amount",
    kind: "change to a shared helper, its users mapped first",
    fixture: "ledger",
    image: "ledger",
    prompt:
      "parseAmount returns NaN when the text isn't an amount, and NaN has ended up in saved ledgers. Make it throw a clear error instead.",
    wants: [
      "Everywhere the program used to skip or refuse a bad amount (the import, the add command, the budgets), it keeps doing exactly that, with the same messages and exit codes.",
      "Text such as 12, 12.5 and -3.40 still reads as before.",
    ],
    right: [tool("tool-touch-map", "bash", "succeeded", ["touch-map.mjs"])],
    also: [],
    order: [{ id: "touch-map-before-first-edit", first: bashWith("touch-map.mjs"), then: EDITS, mode: "before" }],
    hidden: [
      "parseAmount throws on text that is not an amount",
      "good amounts read as before",
      "an import still skips rows with a bad amount and lists their lines",
      "add still refuses a bad amount with its message and exit code 1",
      "a budget with a bad limit is still left out",
      "the project's tests pass",
    ],
  },
  {
    id: "commit-export",
    kind: "commit, delivery state first, commit notice",
    fixture: "ledger",
    image: "ledger",
    commitAsked: true,
    prompt:
      "The CSV export is done. Commit it, and make sure secrets.json, which holds my bank token, can never end up in a commit.",
    wants: [
      "Commit only the export work: src/export.js, its test, and the changes to src/cli.js, README.md and CHANGELOG.md, plus the ignore rule.",
      "Ignore secrets.json in the repository's .gitignore, so it holds on every machine.",
      "Don't push.",
    ],
    right: [
      tool("tool-delivery-state", "bash", "succeeded", ["delivery-state.mjs"]),
      tool("tool-commit", "bash", "succeeded", ["git commit"]),
    ],
    also: [
      tool("tool-commit-state", "bash", "succeeded", ["commit-state.mjs"]),
      tool("no-stage-all", "bash", "not-called", ["add -A"]),
      tool("no-stage-all-long", "bash", "not-called", ["add --all"]),
      tool("no-commit-all", "bash", "not-called", ["commit -a"]),
      tool("no-stage-secrets", "bash", "not-called", ["git add", "secrets.json"]),
      notice("notice-commit", "Committing (Deliver Work)"),
    ],
    order: [
      {
        id: "delivery-state-before-commit",
        first: bashWith("delivery-state.mjs"),
        then: bashWith("git commit"),
        mode: "before",
      },
      { id: "commit-inspected-after", first: bashWith("git show"), then: bashWith("git commit"), mode: "afterLast" },
    ],
    hidden: [
      "Git ignores secrets.json",
      "the export work is still in the work tree, unchanged",
      "secrets.json is untouched",
      "the project's tests pass",
    ],
    originals: true,
  },
  {
    id: "agree-budget-alerts",
    kind: "open choices, agreement before building",
    fixture: "ledger",
    image: "ledger",
    prompt: "I'd like budget alerts: something that tells me when a category is in trouble against its monthly budget.",
    wants: [
      "Alert a category only when its spending in a month reaches its budget: at 100% or more, nothing before that.",
      "Show the alerts in `ledger report`, after the monthly totals, one line per category and month.",
      "No new command, and `ledger budget` stays as it is.",
    ],
    right: [tool("tool-choices-agreement", "bash", "succeeded", ["choices.mjs", "agreement"])],
    // No source file changed on the first turn, before the user could answer: transcript checks, so the work's own
    // state never decides them.
    also: [
      { ...tool("no-edit-first-turn", "edit", "not-called", ["src/"]), turn: 1 },
      { ...tool("no-write-first-turn", "write", "not-called", ["src/"]), turn: 1 },
      { ...tool("no-patch-first-turn", "apply_patch", "not-called", ["src/"]), turn: 1 },
    ],
    order: [
      { id: "agreement-before-first-edit", first: bashWith("choices.mjs", "agreement"), then: EDITS, mode: "before" },
    ],
    hidden: [
      "the report alerts a category that spent more than its budget",
      "the report alerts a category that spent exactly its budget",
      "the report does not alert a category under its budget",
      "the report still prints the monthly totals first",
      "the project's tests pass",
    ],
  },
];

export const ALL_TASKS = [...TASKS, ...SCRIPT_TASKS];

function card(task) {
  // A task that asks for a commit keeps the rule for pushing and pull requests only.
  const rules = task.commitAsked
    ? CARD_RULES.map((rule) =>
        rule.startsWith("If it asks whether to commit")
          ? "If it asks whether to push or open a pull request, say it isn't needed."
          : rule,
      )
    : CARD_RULES;
  return [
    "You are the developer who owns this small project. You asked a coding agent for something and are now chatting with it.",
    "",
    "What you asked:",
    "",
    `> ${task.prompt}`,
    "",
    "How you behave:",
    ...rules.map((rule) => `- ${rule}`),
    "",
    "Your preferences (hidden; reveal one only when a question or a proposed choice touches it):",
    ...(task.wants.length > 0 ? task.wants.map((want) => `- ${want}`) : ["- None beyond the request."]),
    "",
  ].join("\n");
}

function hiddenTests(task) {
  const files = { ".ftu-hidden.test.mjs": `${ROOT_PATH}/graders/${task.id}.test.mjs` };
  if (task.fixture === "ledger") files[".ftu-ledger-lib.mjs"] = `${ROOT_PATH}/graders/ledger-lib.mjs`;
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
  const scripts = SCRIPT_TASKS.includes(task);
  return {
    schema_version: 2,
    kind: "group",
    id: task.id,
    type: "body",
    input: { prompt: task.prompt },
    fixture: `${ROOT_PATH}/fixtures/${task.fixture ?? task.id}`,
    tools: TOOLS,
    configuration: {
      extends: scripts ? "../configuration-scripts.json" : "../configuration.json",
      environment: { kind: "container", image: IMAGES[task.image ?? "tools"], workdir: "/testbed", network: "none" },
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
  for (const task of ALL_TASKS) {
    writeFileSync(join(SUITE, "groups", `${task.id}.json`), `${JSON.stringify(group(task), null, 2)}\n`);
    writeFileSync(join(SUITE, "cards", `${task.id}.md`), card(task));
  }
  for (const [file, id, tasks] of [
    ["suite.json", "freeflow-tool-use", TASKS],
    ["suite-scripts.json", "freeflow-tool-use-scripts", SCRIPT_TASKS],
  ]) {
    const suite = { schema_version: 2, kind: "suite", id, groups: tasks.map((task) => `groups/${task.id}.json`) };
    writeFileSync(join(SUITE, file), `${JSON.stringify(suite, null, 2)}\n`);
  }
  process.stdout.write(`${ALL_TASKS.length} groups written\n`);
}
