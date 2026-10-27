#!/usr/bin/env node
// Trace a report to its claims register: every claim ID the report cites exists, and every number it states appears
// in the Numbers of a claim cited in the same paragraph, list item or table row. With --results, also trace each
// register number to the result file or log its Source names. draft-check runs a paper draft's checks before review;
// strip-ids writes the venue copy without the claim-ID parentheses.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

import { ledgerRows, parseMarkdown, parseTable, validate } from "./lib/formats.mjs";
import { draftCheck, figureReceipts, stripIds } from "./lib/paper.mjs";
import { claimIds, numberInResults, numbersIn, resultCitations, resultNumbers, units } from "./lib/report.mjs";

const USAGE = [
  "Usage: claims.mjs trace <report.md> --register <claims.md> [--results] [--json]",
  "       claims.mjs draft-check <paper.md> [--outline <outline.md>] [--ledger <sources.md>] [--limit <section>=<words>]...",
  "                              [--allow <acronym or process word>]... [--json]",
  "       claims.mjs strip-ids <paper.md> --out <venue.md>",
  "",
  "draft-check fails on an abstract number missing from the body, a [@S<n>] citation not in the ledger, a figure or",
  "table reference the outline lacks (or an outline figure never named), figures numbered out of the order the text",
  "first names them, a Section reference with no heading, a",
  "section over its limit (--limit total=<words> for the whole body), and, with --outline, an outline that does not",
  "validate or a figure without a valid receipt. It lists, without failing, acronyms not defined before use and",
  "process words.",
].join("\n");

function fail(message) {
  console.error(message);
  process.exit(2);
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      register: { type: "string" },
      outline: { type: "string" },
      ledger: { type: "string" },
      limit: { type: "string", multiple: true, default: [] },
      allow: { type: "string", multiple: true, default: [] },
      out: { type: "string" },
      results: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      help: { type: "boolean" },
    },
  });
} catch (error) {
  fail(`${error.message}\n${USAGE}`);
}
if (parsed.values.help) {
  console.log(USAGE);
  process.exit(0);
}
const [command, report] = parsed.positionals;

if (command === "draft-check" || command === "strip-ids") {
  if (!report) fail(USAGE);
  let text;
  try {
    text = readFileSync(report, "utf8");
  } catch (error) {
    fail(`cannot read ${report}: ${error.message}`);
  }
  if (command === "strip-ids") {
    if (!parsed.values.out) fail(USAGE);
    const venue = stripIds(text);
    writeFileSync(parsed.values.out, venue.text);
    console.log(
      `${parsed.values.out}: ${venue.removed} claim-ID group(s) removed; ${venue.remaining.length} claim ID(s) left in the text`,
    );
    for (const left of venue.remaining) console.log(`  line ${left.line}: ${left.id} left in running text`);
    process.exit(venue.remaining.length === 0 ? 0 : 1);
  }
  const options = { allow: new Set(parsed.values.allow), limits: new Map() };
  for (const limit of parsed.values.limit) {
    const match = /^(.+)=(\d+)$/.exec(limit);
    if (!match) fail(`--limit needs <section>=<words>, got "${limit}"`);
    options.limits.set(match[1], Number(match[2]));
  }
  if (parsed.values.ledger) options.ledger = new Set(ledgerRows(readFileSync(parsed.values.ledger, "utf8")).keys());
  const outlineProblems = [];
  if (parsed.values.outline) {
    const outlineText = readFileSync(parsed.values.outline, "utf8");
    const outline = parseMarkdown(outlineText);
    const figures = parseTable(outline.sections.get("Figures") ?? [])?.rows ?? [];
    options.figures = new Set(figures.map((row) => row.cells.ID).filter((id) => /^[FT]\d+$/.test(id)));
    const checked = validate("paper-outline", outlineText, {
      dataExists: (file) => existsSync(resolve(dirname(parsed.values.outline), file)),
      requireReceipts: true,
      ...figureReceipts(parsed.values.outline, outline.header.Runs),
    });
    for (const problem of checked.problems) outlineProblems.push({ line: 0, kind: "outline", value: problem });
  }
  const result = draftCheck(text, options);
  result.problems.push(...outlineProblems);
  if (parsed.values.json) console.log(JSON.stringify({ draft: report, ...result }, null, 2));
  else {
    console.log(
      `${report}: ${result.problems.length} problem(s), ${result.notes.length} note(s); ${result.words.total} words in the body`,
    );
    for (const [name, count] of Object.entries(result.words.sections)) console.log(`  words: ${name}: ${count}`);
    for (const problem of result.problems)
      console.log(`  problem: ${problem.line ? `line ${problem.line}: ` : ""}${problem.kind}: ${problem.value}`);
    for (const note of result.notes) console.log(`  note: line ${note.line}: ${note.kind}: ${note.value}`);
  }
  process.exit(result.problems.length === 0 ? 0 : 1);
}

if (command !== "trace" || !report || !parsed.values.register) fail(USAGE);

const read = (path) => {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    fail(`cannot read ${path}: ${error.message}`);
  }
};

const table = parseTable(parseMarkdown(read(parsed.values.register)).lines);
if (!table || !table.columns.includes("ID") || !table.columns.includes("Numbers")) {
  fail(`${parsed.values.register} has no claims table with ID and Numbers columns`);
}
const register = new Map(table.rows.map((row) => [row.cells.ID, new Set(numbersIn(row.cells.Numbers))]));

const problems = [];
let checkedNumbers = 0;
for (const unit of units(read(report))) {
  const ids = claimIds(unit.text);
  for (const id of ids) {
    if (!register.has(id))
      problems.push({ line: unit.line, kind: "unknown claim", value: id, detail: `${id} is not in the register` });
  }
  const supported = new Set(ids.flatMap((id) => [...(register.get(id) ?? [])]));
  unit.text.split("\n").forEach((line, offset) => {
    for (const number of numbersIn(line)) {
      checkedNumbers += 1;
      if (supported.has(number)) continue;
      problems.push({
        line: unit.line + offset,
        kind: "untraced number",
        value: number,
        detail: ids.length === 0 ? "the passage cites no claim ID" : `not in the Numbers of ${ids.join(", ")}`,
      });
    }
  });
}

// Register numbers against the result files their Source names.
const results = { checked: 0, notChecked: [] };
if (parsed.values.results) {
  const folder = dirname(resolve(parsed.values.register));
  for (const row of table.rows) {
    const numbers = numbersIn(row.cells.Numbers);
    if (numbers.length === 0) continue;
    const files = resultCitations(row.cells.Source ?? "");
    if (files.length === 0) {
      results.notChecked.push({ id: row.cells.ID, detail: "its Source names no result file" });
      continue;
    }
    const found = [];
    for (const file of files) {
      const path = resolve(folder, file.path);
      if (!existsSync(path)) {
        problems.push({ line: row.line, kind: "missing result file", value: file.path, detail: `${row.cells.ID}` });
        continue;
      }
      let text = readFileSync(path, "utf8");
      if (file.start !== null)
        text = text
          .split("\n")
          .slice(file.start - 1, file.end)
          .join("\n");
      found.push(...resultNumbers(text, file.path, { ranged: file.start !== null }));
    }
    for (const number of numbers) {
      results.checked += 1;
      if (!numberInResults(number, found))
        problems.push({
          line: row.line,
          kind: "number not in its results",
          value: number,
          detail: `${row.cells.ID}: not in ${files.map((file) => file.path).join(", ")}`,
        });
    }
  }
}

if (parsed.values.json) console.log(JSON.stringify({ report, checkedNumbers, results, problems }, null, 2));
else {
  console.log(`${report}: ${checkedNumbers} number(s) checked; ${problems.length} problem(s)`);
  if (parsed.values.results) {
    console.log(
      `  results: ${results.checked} register number(s) traced to their files; ${results.notChecked.length} row(s) not checked`,
    );
    for (const row of results.notChecked) console.log(`  not checked: ${row.id} (${row.detail})`);
  }
  for (const problem of problems)
    console.log(`  line ${problem.line}: ${problem.kind} ${problem.value} (${problem.detail})`);
}
process.exit(problems.length === 0 && results.notChecked.length === 0 ? 0 : 1);
