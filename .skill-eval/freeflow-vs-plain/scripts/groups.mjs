#!/usr/bin/env node
// Writes the suite's group definitions (groups/<task>.json) and simulated-user cards (cards/<task>.md) from the task
// table below and the pinned image digests in image/digests.json. Every group shares configuration.json (host, model,
// Freeflow build and settings, network) and differs only in its task: prompt, the user's card, fixture, image, hidden
// tests, behaviour markers, rubric and reference solution.
// It also writes groups-v090/<task>.json: the same tasks with three arms on configuration-v090.json (plain Pi, Freeflow
// v0.9.0 with Tool Execution off as before, and Freeflow v0.9.0 with Tool Execution and its guidance notices on), for
// suite-v090*.json. The 21 Oct groups and suites are unchanged.
// Run from the repository root after changing a task or re-pinning images: node .skill-eval/freeflow-vs-plain/scripts/groups.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SUITE = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIGURATION = JSON.parse(readFileSync(join(SUITE, "configuration.json"), "utf8")).configuration;
const ROOT_PATH = ".skill-eval/freeflow-vs-plain";
const ARMS = ["plain", "freeflow"];
const TOOLS = ["read", "write", "edit", "ls", "find", "grep", "bash"];

// Every grader test name starts with this, so no natural reply or file contains one: the transcript scan flags an
// answer that names a hidden test.
const NAME_PREFIX = "fvp: ";

const MARKER_TESTS = {
  "new-test": "a new or changed test fails before the change and passes after",
  "tests-kept": "the existing tests are kept unchanged",
};

// Every task is a conversation with the same simulated user in both arms, so an agent that asks before it builds (as
// Freeflow's Agree Work does) gets an answer instead of an empty run. The user runs on the subjects' model; the
// subject gets at most five turns: the request and up to four replies. Every conversation is graded on its final
// workspace, however it ended.
const USER = { thinking: "low", max_turns: 5, stop: "THANKS, DONE" };

// The rules every card shares (SPEC-evals phase D): answer only what is asked, never steer, never tell the agent to
// stop or hold, say go when asked to proceed, and end the conversation once the agent reports the change made.
const CARD_RULES = [
  "Answer only what the agent asks, in one or two short sentences. Never volunteer a preference it did not ask about, never hint at how to do the work, and never describe your preferences below unless a question or a proposed choice touches them.",
  "When the agent lists choices or a plan, read each one. If one touches a preference below and differs from it, say what you want instead, in plain words. Accept the rest.",
  'If it asks about something your preferences below do not cover, say "your recommendation is fine".',
  'When it asks whether to go ahead, or to confirm its plan or its choices, reply "go", with any correction from the rule above in the same message.',
  'If it pauses without asking anything and without saying the change is made, reply "go".',
  "If it asks whether to commit, push or open a pull request, say it isn't needed.",
  "Never tell the agent to stop, wait, hold or pause, never ask it to start over, and never ask to see more detail or more choices than it showed you.",
  `Once the agent says the change is made, or reports what it did, reply with exactly: ${USER.stop}. Do this even when it also offers more, such as a commit, another change or a choice you could still change.`,
];

/** A task's card: the request, the shared rules and what this user wants, in the user's voice. */
function card(task) {
  return [
    "You are the developer who owns this small project. You asked a coding agent for a change and are now chatting with it.",
    "",
    "What you asked:",
    "",
    `> ${task.prompt}`,
    "",
    "How you behave:",
    ...CARD_RULES.map((rule) => `- ${rule}`),
    "",
    "Your preferences (hidden; reveal one only when a question or a proposed choice touches it):",
    ...task.wants.map((want) => `- ${want}`),
    "",
  ].join("\n");
}

const VERIFICATION = {
  id: "verification-reported",
  question:
    "Does the final reply say what the agent ran or checked to confirm its change, what the result was, and what that result shows? Answer yes only when it names at least one concrete check (a command, a test, an example it ran) and its outcome.",
};

function choiceToUser(choice) {
  return {
    id: "choice-put-to-user",
    question: `The request leaves one choice to the user: ${choice} Did the agent put that choice to the user, as a question in one of its replies or by trying to ask with a question tool, or at least name the choice it made and invite the user to change it, rather than deciding it silently?`,
  };
}

const CHANGED_TEST_EXPLAINED = {
  id: "changed-test-explained",
  question:
    "If the agent changed or removed any test that existed before its work, does its reply name each such test and give the reason for the change? Answer unknown when it changed no existing test.",
};

/**
 * The tasks: one line each in the README's task table. `hidden` lists the required hidden tests by name. `wants` is
 * what the simulated user wants, revealed only when asked: what the hidden tests check where the agent might ask about
 * it, and for each choice the request leaves open an answer no hidden test depends on.
 */
const TASKS = [
  {
    id: "contacts-csv",
    prompt:
      'Exporting contacts to CSV breaks when a company name has a comma in it, like "Acme, Inc." - everything after it shifts one column over when I open the file in a spreadsheet. Can you fix it?',
    wants: [
      "Any cell that holds a comma, a double quote or a line break should open correctly in a spreadsheet: wrapped in double quotes, with a quote inside it doubled.",
      "Cells that need no quoting stay exactly as they are, without quotes.",
      "The columns, their order and the header row stay as they are, and a missing value is still an empty cell.",
    ],
    hidden: [
      "a cell with a comma is quoted",
      "a quote inside a cell is doubled and the cell quoted",
      "a cell with a line break is quoted",
      "plain cells stay unquoted",
      "the export reads back as the same contacts",
      "the command line export of the example has four cells on every line",
      "the existing tests still pass",
    ],
    markers: ["new-test", "tests-kept"],
    rubric: [VERIFICATION],
  },
  {
    id: "invoice-cents",
    prompt:
      "The printed invoice for examples/order.json shows the A5 notebook at £4.34, but it's £4.35 on the price list. Looks like the printout is rounding wrong - can you fix it?",
    wants: [
      "Every price should come out at exactly the pence written on the price list, wherever it is printed: on the invoice and on the till receipt.",
      "The invoice's layout (columns, spacing and wording) stays exactly as it is.",
    ],
    hidden: [
      "prices convert to the pence written on the price list",
      "the invoice shows each item at its listed price",
      "the printed example invoice shows the notebook at £4.35 and the right total",
      "the till receipt charges the listed prices",
      "a printed invoice keeps its layout",
      "the existing tests still pass",
    ],
    markers: ["new-test", "tests-kept", "fix-at-root"],
    fixAtRoot: ["src/printer.js", "src/invoice.js", "bin/invoice.js"],
    rubric: [
      {
        id: "root-cause-named",
        question:
          "Does the reply name the cause as the shared pounds-to-pence conversion (flooring a binary floating-point product in src/money.js, which the till receipt also uses), rather than the printer or the invoice layout?",
      },
      VERIFICATION,
    ],
  },
  {
    id: "slug-max-length",
    prompt:
      "The README documents a maxLength option and a --max-length flag, but neither was ever implemented. Can you add them?",
    wants: [
      "maxLength is the longest slug in characters, separators included, as the README says.",
      "The --max-length flag works exactly like the maxLength option.",
      "When the first word alone is longer than maxLength, return an empty string.",
    ],
    hidden: [
      "the README example cuts at the last whole word",
      "a word is never cut in half",
      "a cut slug never ends with a separator",
      "a slug that fits is unchanged",
      "maxLength counts a custom separator",
      "without maxLength nothing is cut",
      "the command line takes --max-length",
      "the existing tests still pass",
    ],
    markers: ["new-test", "tests-kept", "ask-user"],
    rubric: [
      choiceToUser(
        "what to return when the first word alone is longer than maxLength (the README says a word is never cut, and also that maxLength is the longest slug).",
      ),
      VERIFICATION,
    ],
  },
  {
    id: "report-dates",
    prompt:
      "src/report.js builds the same YYYY-MM-DD string in three places. Pull it into one helper so there's a single place to change the format, without changing what any report prints.",
    wants: [
      "Every report must print exactly what it prints today, character for character, including NaN-NaN-NaN for a missing or unreadable date. That is a separate job; leave it as it is for now.",
      'A task with no due date still says "no due date".',
    ],
    hidden: [
      "valid dates print exactly as before",
      "missing or unreadable dates print exactly as before",
      "the date is formatted in one place",
      "the existing tests still pass",
    ],
    markers: ["tests-kept", "ask-user"],
    rubric: [
      choiceToUser(
        "whether the daily log and weekly header should keep printing NaN-NaN-NaN for a missing or unreadable date, which the request says to keep but which looks like a bug.",
      ),
      VERIFICATION,
    ],
  },
  {
    id: "duration-test",
    prompt:
      "A user reported last week that parseDuration('1h30m') came back as 30 minutes. I fixed it in the last commit but never added a test for it. Please add one that would have caught the bug.",
    wants: [
      "Only add a test. src/duration.js is already fixed; leave it as it is.",
      "The test should be one that would have failed before the fix in the last commit, so it catches this bug if it ever comes back.",
    ],
    hidden: [
      "a test was added or extended",
      "the new tests pass on the current code",
      "the new tests fail on the code before the fix",
      "the fixed source is left as it is",
      "the existing tests still pass",
    ],
    markers: ["tests-kept"],
    rubric: [VERIFICATION],
  },
  {
    id: "page-size-config",
    prompt:
      "Bump the default page size for the issue list from 20 to 50, and let people override it with a PAGE_SIZE environment variable. If PAGE_SIZE isn't a positive whole number, ignore it and use the default.",
    wants: [
      "Only a positive whole number written as plain digits counts: 0, negative numbers, 2.5, 10abc or an empty value are ignored and the default of 50 is used.",
      "There is no upper limit on PAGE_SIZE.",
      "An ignored PAGE_SIZE is ignored quietly, with no warning.",
      "The existing test that checks the old default of 20 can be changed to 50.",
    ],
    hidden: [
      "the default page size is 50",
      "PAGE_SIZE sets the page size",
      "a PAGE_SIZE that is not a positive whole number is ignored",
      "the command line pages by the configured size",
      "a page still shows its issues and a footer",
    ],
    markers: ["new-test", "ask-user"],
    rubric: [
      choiceToUser("whether a very large PAGE_SIZE is capped, and whether an ignored PAGE_SIZE is reported."),
      CHANGED_TEST_EXPLAINED,
      VERIFICATION,
    ],
  },
  {
    id: "dedupe-contacts-py",
    prompt:
      "dedupe_contacts keeps the wrong record when two contacts share an email: it should keep the first one it saw, and keep the contacts in their original order. It also treats Bob@Example.com and bob@example.com as two different people.",
    wants: [
      "Keep the first contact seen for each email, and keep the contacts in their original order. Emails match regardless of case.",
      "Contacts without an email are all kept; never merge them with each other.",
      "The kept contact stays exactly as it was, its email included: don't rewrite it in lower case.",
    ],
    hidden: [
      "the first contact with an email is kept",
      "contacts keep their original order",
      "emails match regardless of case",
      "contacts with different emails are all kept",
      "the existing tests still pass",
    ],
    markers: ["new-test", "tests-kept", "ask-user"],
    rubric: [
      choiceToUser(
        "what happens to contacts without an email (the current code collapses them all into one), and whether the kept contact's email is rewritten in lower case.",
      ),
      VERIFICATION,
    ],
  },
  {
    id: "paginate-last-page",
    prompt:
      "When a search returns exactly 20 results at 10 per page, the pager shows a page 3 that's empty. Can you fix it?",
    wants: [
      "20 results at 10 per page is 2 pages, and 25 results is 3.",
      "An empty search still shows one page, page 1, as the README says. Keep the existing tests as they are.",
    ],
    hidden: [
      "an exact multiple has no empty trailing page",
      "a partial last page is counted",
      "an empty result list still has one page",
      "the pager shows no link to an empty page",
      "pages show their slice of the results",
      "the existing tests still pass",
    ],
    markers: ["new-test", "tests-kept"],
    rubric: [CHANGED_TEST_EXPLAINED, VERIFICATION],
  },
  {
    id: "config-deep-merge",
    prompt:
      "If my config.json only sets server.port, the status board says it's listening on undefined:9000. Settings I leave out should keep their defaults, like the README says.",
    wants: [
      "Every setting the file leaves out keeps its default, at any depth, and every setting in the file wins over its default.",
      "Loading a config must never change the defaults themselves.",
      "A list such as checks in config.json replaces the default list; it is not merged with it.",
      "What a null value means: your recommendation is fine.",
    ],
    hidden: [
      "a nested setting the file leaves out keeps its default",
      "a nested setting in the file overrides its default",
      "sections the file leaves out keep their defaults",
      "loading a config never changes the defaults",
      "the start command prints the merged address",
      "the existing tests still pass",
    ],
    markers: ["new-test", "tests-kept", "ask-user"],
    rubric: [
      choiceToUser(
        "whether a list such as checks in config.json replaces the default list or is merged with it, and what a null value means.",
      ),
      VERIFICATION,
    ],
  },
  {
    id: "check-json-exit",
    prompt:
      "Our CI deployed a broken fr.json last night because `node bin/check-json.js data` exited 0 even though it printed a FAIL line for it. I've fixed fr.json by hand, but the check should fail the build whenever any file is broken.",
    wants: [
      "The command exits 1 whenever any file fails to parse, and 0 when every file parses.",
      "It still checks and reports every file, and prints the summary line, even after a failure.",
      "fr.json is already fixed by hand; nothing in data/ needs changing.",
    ],
    hidden: [
      "exits 1 when a file is broken",
      "exits 0 when every file parses",
      "every broken file is reported, not only the first",
      "the existing tests still pass",
    ],
    markers: ["new-test", "tests-kept"],
    rubric: [VERIFICATION],
  },
];

const graderFiles = (main) => ({
  [main === "markers" ? ".fvp-markers.test.mjs" : ".fvp-hidden.test.mjs"]: `${ROOT_PATH}/graders/${main}.test.mjs`,
  ".fvp-lib.mjs": `${ROOT_PATH}/graders/lib.mjs`,
});

function testCommand(arm, id, comparison, grader, required) {
  const file = grader === "markers" ? ".fvp-markers.test.mjs" : ".fvp-hidden.test.mjs";
  return {
    id: `${arm}-${id}`,
    kind: "command",
    variant: arm,
    comparison,
    argv: ["node", "--test", "--test-reporter=tap", file],
    files: graderFiles(grader),
    timeout_seconds: 300,
    pass: { tests: { format: "node-test", required: required.map((name) => `${NAME_PREFIX}${name}`) } },
  };
}

function expectations(task, arms = ARMS) {
  const list = [];
  for (const arm of arms) list.push(testCommand(arm, "hidden-tests", "hidden-tests", task.id, task.hidden));
  for (const marker of task.markers) {
    for (const arm of arms) {
      if (MARKER_TESTS[marker]) {
        list.push(testCommand(arm, `marker-${marker}`, `marker-${marker}`, "markers", [MARKER_TESTS[marker]]));
      } else if (marker === "fix-at-root") {
        list.push({
          id: `${arm}-marker-fix-at-root`,
          kind: "changed-paths",
          variant: arm,
          comparison: "marker-fix-at-root",
          expect: "excludes",
          paths: task.fixAtRoot,
        });
      } else if (marker === "ask-user") {
        // Freeflow's ask_user is not a declared tool here (no one could answer its dialog), so the guard refuses
        // it; the attempt still shows the agent put a choice to the user by that channel. Plain Pi has no such tool.
        list.push({
          id: `${arm}-marker-ask-user`,
          kind: "tool-call",
          variant: arm,
          comparison: "marker-ask-user",
          tool: "ask_user",
          expect: "called",
        });
      } else {
        throw new Error(`unknown marker ${marker}`);
      }
    }
  }
  return list;
}

// The v0.9.0 arms. `freeflow` keeps the 21 Oct arm's settings (Tool Execution off) on the v0.9.0 build;
// `freeflow-te` turns Tool Execution on with its guidance notices, as a Pi user has it, so its tools, the skills'
// scripts' notices and the changed-files lines are live. Their tools are declared for every arm (one task, one tool
// list); plain Pi and Freeflow with Tool Execution off register none of them, so those arms do not have them.
const V090_ARMS = ["plain", "freeflow", "freeflow-te"];
const V090_TOOLS = [...TOOLS, "bash_background", "monitor", "stop_background", "apply_patch"];
const TOOL_EXECUTION_ON = { toolExecution: { enabled: true, guidanceNotices: true } };

const digestsFile = join(SUITE, "image", "digests.json");
const digests = existsSync(digestsFile) ? JSON.parse(readFileSync(digestsFile, "utf8")) : {};

mkdirSync(join(SUITE, "groups"), { recursive: true });
mkdirSync(join(SUITE, "groups-v090"), { recursive: true });
mkdirSync(join(SUITE, "cards"), { recursive: true });
for (const task of TASKS) {
  const image = digests[task.id];
  if (typeof image !== "string" || !/@sha256:[0-9a-f]{64}$/.test(image)) {
    throw new Error(`no pinned image for ${task.id} in image/digests.json; run image/build.mjs first`);
  }
  const group = {
    schema_version: 2,
    kind: "group",
    id: task.id,
    type: "body",
    input: { prompt: task.prompt },
    fixture: `${ROOT_PATH}/fixtures/${task.id}`,
    tools: TOOLS,
    configuration: {
      extends: "../configuration.json",
      environment: { kind: "container", image, workdir: "/testbed", network: "none" },
    },
    arms: { plain: { freeflow: null }, freeflow: {} },
    // Shared by both arms: the same user, card and turn cap.
    participants: {
      protocol: "conversation",
      user: { model: CONFIGURATION.model.model, ...USER, card: `${ROOT_PATH}/cards/${task.id}.md` },
    },
    reference: "plain",
    component: ["freeflow"],
    expectations: expectations(task),
    review_questions: [],
    rubric: task.rubric,
    reference_solution: { files: `${ROOT_PATH}/reference/${task.id}` },
  };
  writeFileSync(join(SUITE, "cards", `${task.id}.md`), card(task));
  writeFileSync(join(SUITE, "groups", `${task.id}.json`), `${JSON.stringify(group, null, 2)}\n`);
  const v090 = {
    ...group,
    tools: V090_TOOLS,
    configuration: { ...group.configuration, extends: "../configuration-v090.json" },
    arms: { plain: { freeflow: null }, freeflow: {}, "freeflow-te": { freeflow: { repository: TOOL_EXECUTION_ON } } },
    expectations: expectations(task, V090_ARMS),
  };
  writeFileSync(join(SUITE, "groups-v090", `${task.id}.json`), `${JSON.stringify(v090, null, 2)}\n`);
}
process.stdout.write(`wrote ${TASKS.length} groups and their cards\n`);
