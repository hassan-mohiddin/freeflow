#!/usr/bin/env node
// Checks and renders Discuss Work's decision list (SKILL.md, "Build The Decision List"), so its format is a tool's job
// and the agent's attention stays on the choices:
//   validate   IDs, states, T -> P links, a default on every plain item, the user's words on agreed items, a reason on
//              changed ones;
//   agreement  the reply sent before building: What I'll do / Where I stop / Your decisions / Technical: N; with
//              --plan, the work's size (Track Work's `estimate --plan --json`) and, in Technical, its plan (P87);
//   handover   the items the hand-over shows: new, changed and default;
//   catch-up   after an unattended run: defaults taken, choices waiting, changes, and what ran, from the Working
//              Record's current Slice: its update lines, read from record.md.
// Usage: choices.mjs <validate|agreement|handover|catch-up> (--list <file|-> | --record <record.md>)
//                    [--do <outcome> --stop <where you stop>] [--plan <file>] [--show-technical] [--json]
// --list reads a file or stdin (no Working Record: the list lives in the conversation); --record reads the task's
// decisions.md beside the record. Each item is one line, "- P1 [state] choice -> default ..." (a technical
// item "-> serves P1"); other lines are ignored. Every view validates first. Exit code 0 when the list is valid
// (warnings do not fail it), 1 when it has errors, 2 on a usage error.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { parseChoices, renderChoices } from "./lib/choices.mjs";

const USAGE = [
  "Usage: choices.mjs <validate|agreement|handover|catch-up> (--list <file|-> | --record <record.md>)",
  "                   [--do <outcome> --stop <where you stop>] [--plan <file>] [--show-technical] [--json]",
].join("\n");
const VIEWS = new Set(["validate", "agreement", "handover", "catch-up"]);

function fail(message) {
  console.error(message);
  process.exit(2);
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      list: { type: "string" },
      record: { type: "string" },
      do: { type: "string" },
      stop: { type: "string" },
      plan: { type: "string" },
      "show-technical": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    },
  });
} catch (error) {
  fail(`${error.message}\n${USAGE}`);
}
const { values, positionals } = parsed;
const [view] = positionals;
if (!VIEWS.has(view) || positionals.length !== 1) fail(USAGE);
if (Boolean(values.list) === Boolean(values.record)) fail(`give --list <file|-> or --record <record.md>\n${USAGE}`);
if (view === "agreement" && (!values.do || !values.stop)) fail(`agreement needs --do and --stop\n${USAGE}`);
let plan = null;
if (values.plan) {
  if (view !== "agreement") fail(`--plan is for the agreement\n${USAGE}`);
  try {
    plan = JSON.parse(readFileSync(resolve(values.plan), "utf8"));
  } catch (error) {
    fail(`--plan reads the JSON that working-record.mjs estimate --plan --json prints: ${error.message}`);
  }
}

let listText;
let recordView = null;
if (values.record) {
  const record = resolve(values.record);
  if (!existsSync(record)) fail(`no such record: ${values.record}`);
  const recordText = readFileSync(record, "utf8");
  if (/^Schema: 4\b/m.test(recordText))
    fail(`${values.record} is a Schema 4 record: convert it with Track Work's migrate first`);
  const listPath = join(dirname(record), "decisions.md");
  if (!existsSync(listPath)) fail(`no decision list at ${listPath}; Track Work keeps it there`);
  listText = readFileSync(listPath, "utf8");
  if (view === "catch-up") recordView = recordText;
} else if (values.list === "-") listText = readFileSync(0, "utf8");
else if (!existsSync(resolve(values.list))) fail(`no such list: ${values.list}`);
else listText = readFileSync(resolve(values.list), "utf8");

const list = parseChoices(listText);
const notes = [...list.errors.map((each) => `error: ${each}`), ...list.warnings.map((each) => `warning: ${each}`)];
if (!list.ok) {
  if (values.json)
    console.log(
      JSON.stringify({ command: `choices ${view}`, ok: false, errors: list.errors, warnings: list.warnings }, null, 2),
    );
  else console.log(`Decision list has ${list.errors.length} error(s):\n${notes.map((each) => `- ${each}`).join("\n")}`);
  process.exit(1);
}
const rendered = renderChoices(view, list, {
  outcome: values.do,
  stop: values.stop,
  showTechnical: values["show-technical"],
  recordText: recordView,
  plan,
});
if (values.json)
  console.log(
    JSON.stringify(
      { command: `choices ${view}`, ok: true, warnings: list.warnings, ...rendered.data, text: rendered.text },
      null,
      2,
    ),
  );
else console.log(`${notes.length ? `${notes.map((each) => `- ${each}`).join("\n")}\n\n` : ""}${rendered.text}`);
