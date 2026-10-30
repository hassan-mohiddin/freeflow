#!/usr/bin/env node
// Checks and renders Discuss Work's decision list (SKILL.md, "Build The Decision List"), so its format is a tool's job
// and the agent's attention stays on the choices:
//   validate   IDs, states, T -> P links, a default on every plain item, the user's words on agreed items, a reason on
//              changed ones;
//   agreement  the reply sent before building: What I'll do / Where I stop / Your decisions / Technical: N; with
//              --plan, the work's size (Track Work's `estimate --plan --json`) and, in Technical, its plan (P87);
//   handover   the items the hand-over shows: new, changed and default;
//   catch-up   after an unattended run: defaults taken, choices waiting, changes, and what ran, from the Working
//              Record's current Slice: a Schema 5 record's update lines, read from record.md, or a Schema 4 record's
//              Material updates (read through Track Work's `working-record.mjs view resume`).
// Usage: choices.mjs <validate|agreement|handover|catch-up> (--list <file|-> | --record <record.md>)
//                    [--do <outcome> --stop <where you stop>] [--plan <file>] [--show-technical] [--json]
// --list reads a file or stdin (no Working Record: the list lives in the conversation); --record reads the task's
// decisions.md beside a Schema 5 record, or sources/decisions.md beside a Schema 4 one. Each item is one line, "- P1 [state] choice -> default ..." (a technical
// item "-> serves P1"); other lines are ignored. Every view validates first. Exit code 0 when the list is valid
// (warnings do not fail it), 1 when it has errors, 2 on a usage error.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parseChoices, renderChoices } from "./lib/choices.mjs";

const USAGE = [
  "Usage: choices.mjs <validate|agreement|handover|catch-up> (--list <file|-> | --record <record.md>)",
  "                   [--do <outcome> --stop <where you stop>] [--plan <file>] [--show-technical] [--json]",
].join("\n");
const VIEWS = new Set(["validate", "agreement", "handover", "catch-up"]);
const WORKING_RECORD = resolve(dirname(fileURLToPath(import.meta.url)), "../../track-work/scripts/working-record.mjs");

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
  const schema5 = /^Schema: 5\b/m.test(recordText);
  const listPath = schema5 ? join(dirname(record), "decisions.md") : join(dirname(record), "sources", "decisions.md");
  if (!existsSync(listPath)) fail(`no decision list at ${listPath}; Track Work keeps it there`);
  listText = readFileSync(listPath, "utf8");
  if (view === "catch-up" && schema5) recordView = { schema: 5, text: recordText };
  else if (view === "catch-up") {
    const run = spawnSync(process.execPath, [WORKING_RECORD, "view", "resume", "--record", record], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    if (run.status !== 0) fail(`working-record.mjs view resume failed: ${(run.stderr || run.stdout).trim()}`);
    recordView = { schema: 4, text: run.stdout };
  }
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
