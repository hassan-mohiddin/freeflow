#!/usr/bin/env node
// Writes the suite's group definitions (groups/<task>.json) from the task table below and the pinned image digests in
// image/digests.json. Every group shares configuration.json (host, model, Freeflow build and settings, network) and
// differs only in its task: prompt, fixture, image, hidden tests, behaviour markers, rubric and reference solution.
// Run from the repository root after changing a task or re-pinning images: node .skill-eval/freeflow-vs-plain/scripts/groups.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SUITE = join(dirname(fileURLToPath(import.meta.url)), "..");
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

const VERIFICATION = {
  id: "verification-reported",
  question:
    "Does the final reply say what the agent ran or checked to confirm its change, what the result was, and what that result shows? Answer yes only when it names at least one concrete check (a command, a test, an example it ran) and its outcome.",
};

function choiceToUser(choice) {
  return {
    id: "choice-put-to-user",
    question: `The request leaves one choice to the user: ${choice} Did the agent put that choice to the user, as a question in its reply or by trying to ask with a question tool, or at least name the choice it made and invite the user to change it, rather than deciding it silently?`,
  };
}

const CHANGED_TEST_EXPLAINED = {
  id: "changed-test-explained",
  question:
    "If the agent changed or removed any test that existed before its work, does its reply name each such test and give the reason for the change? Answer unknown when it changed no existing test.",
};

/** The tasks: one line each in the README's task table. `hidden` lists the required hidden tests by name. */
const TASKS = [
  {
    id: "contacts-csv",
    prompt:
      'Exporting contacts to CSV breaks when a company name has a comma in it, like "Acme, Inc." - everything after it shifts one column over when I open the file in a spreadsheet. Can you fix it?',
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

function expectations(task) {
  const list = [];
  for (const arm of ARMS) list.push(testCommand(arm, "hidden-tests", "hidden-tests", task.id, task.hidden));
  for (const marker of task.markers) {
    for (const arm of ARMS) {
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

const digestsFile = join(SUITE, "image", "digests.json");
const digests = existsSync(digestsFile) ? JSON.parse(readFileSync(digestsFile, "utf8")) : {};

mkdirSync(join(SUITE, "groups"), { recursive: true });
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
    reference: "plain",
    component: ["freeflow"],
    expectations: expectations(task),
    review_questions: [],
    rubric: task.rubric,
    reference_solution: { files: `${ROOT_PATH}/reference/${task.id}` },
  };
  writeFileSync(join(SUITE, "groups", `${task.id}.json`), `${JSON.stringify(group, null, 2)}\n`);
}
process.stdout.write(`wrote ${TASKS.length} groups\n`);
