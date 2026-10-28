#!/usr/bin/env node
// Trace a report to its claims register: every claim ID the report cites exists, and every number it states appears
// in the Numbers of a claim cited in the same paragraph, list item or table row. With --results, also trace each
// register number to the result file or log its Source names (with --cited-only, only the rows that name one). It also fails a percentage that does not follow from
// the counts beside it, and lists, without failing, comparative or causal wording on a claim below L4, wording of
// improvement beside a negative number, and a "latest" or "current" claim with no date or version. draft-check runs a paper draft's checks before review;
// strip-ids writes the venue copy without the claim-ID parentheses.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

import { HIT_STATES, ledgerRows, parseMarkdown, parseTable, searchCounts, validate } from "./lib/formats.mjs";
import { draftCheck, figureReceipts, stripIds } from "./lib/paper.mjs";
import { buildPackets, checkVerdicts, readVerdicts } from "./lib/support.mjs";
import {
  blankQuoteCitations,
  claimIds,
  currentNotes,
  numberInResults,
  numbersIn,
  percentMismatches,
  resultCitations,
  resultNumbers,
  units,
  wordingNotes,
} from "./lib/report.mjs";

const USAGE = [
  "Usage: claims.mjs trace <report.md> --register <claims.md> [--results [--cited-only]] [--search <search ledger>]",
  "                        [--json]",
  "       claims.mjs support <report.md> [<paper.md>] --register <claims.md> --ledger <sources.md> --out <packets.jsonl>",
  "                          [--only C<n>,...] [--repo <name>=<clone>]... [--copy S<n>=<file>]...",
  "       claims.mjs support-check <verdicts.jsonl> --packets <packets.jsonl> [--json]",
  "       claims.mjs draft-check <paper.md> [--outline <outline.md>] [--ledger <sources.md>] [--limit <section>=<words>]...",
  "                              [--allow <acronym or process word>]... [--copy S<n>=<saved copy>]... [--json]",
  "       claims.mjs strip-ids <paper.md> --out <venue.md>",
  "",
  "trace --results also finds each register number in the result files its row's Source names (a code citation",
  "S<n>:path is a source's, not a result file); a row with numbers and no result file is not checked and fails the",
  "trace, or with --cited-only is listed beneath it without failing.",
  "",
  "draft-check fails on an abstract number missing from the body, a [@S<n>] citation not in the ledger, a figure or",
  "table reference the outline lacks (or an outline figure never named), figures numbered out of the order the text",
  "first names them, a Section reference with no heading, a",
  "section over its limit (--limit total=<words> for the whole body), and, with --outline, an outline that does not",
  "validate or a figure without a valid receipt, and a run of twelve or more words copied from a --copy source",
  "outside quotation marks. It lists, without failing, acronyms not defined before use, process words, ledger",
  "sources the draft never cites, and statements about prior work that cite no source.",
  "",
  "support writes one packet per claim the report cites with a code citation or quote: the claim, its numbers and",
  "scope, and only the cited evidence (code lines with the lines around them, or the passage around a quote); given a",
  "report and a paper, a claim's packet holds what either cites for it. A separate reader answers each packet in a",
  "verdicts file, one JSON line per packet:",
  '  {"packet": "P1", "verdict": "supported|partial|unsupported", "quote": "<four or more words of the evidence>",',
  '   "missing": "<what the evidence does not show; for partial or unsupported>"}',
  "support-check counts the answers with a Wilson interval and fails on a missing or malformed answer, a quote not",
  'in its packet, and a partial or unsupported answer not yet settled; add "adjudication": "rejected: <reason>" to an',
  "answer the author shows to be wrong, or fix the claim or its citation and build the packets again.",
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
      packets: { type: "string" },
      only: { type: "string" },
      repo: { type: "string", multiple: true, default: [] },
      copy: { type: "string", multiple: true, default: [] },
      results: { type: "boolean", default: false },
      "cited-only": { type: "boolean", default: false },
      search: { type: "string" },
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

/** --repo and --copy pairs as a map. */
function pairs(values, label) {
  const map = new Map();
  for (const value of values) {
    const at = value.indexOf("=");
    if (at < 1) fail(`${label} needs <key>=<value>, got "${value}"`);
    map.set(value.slice(0, at), value.slice(at + 1));
  }
  return map;
}

if (command === "support") {
  const { register, ledger, out } = parsed.values;
  if (!report || !register || !ledger || !out || parsed.positionals.length > 3) fail(USAGE);
  let built;
  try {
    const rows = parseTable(parseMarkdown(readFileSync(register, "utf8")).lines)?.rows ?? [];
    // A report and a paper drawn from one register: each claim's packet holds the evidence either one cites for it.
    const documents = parsed.positionals.slice(1).map((path) => readFileSync(path, "utf8"));
    built = buildPackets(documents.join("\n\n"), rows, ledgerRows(readFileSync(ledger, "utf8")), {
      repos: pairs(parsed.values.repo, "--repo"),
      copies: pairs(parsed.values.copy, "--copy"),
      only: parsed.values.only ? new Set(parsed.values.only.split(",").map((id) => id.trim())) : null,
    });
  } catch (error) {
    fail(`cannot build the packets: ${error.message}`);
  }
  writeFileSync(
    out,
    built.packets.map((packet) => JSON.stringify(packet)).join("\n") + (built.packets.length ? "\n" : ""),
  );
  console.log(`${out}: ${built.packets.length} packet(s); ${built.notChecked.length} cited claim(s) not checked`);
  for (const entry of built.notChecked) console.log(`  not checked: ${entry.claim}: ${entry.reason}`);
  process.exit(built.notChecked.length === 0 ? 0 : 1);
}

if (command === "support-check") {
  if (!report || !parsed.values.packets) fail(USAGE);
  let result;
  try {
    const packets = readFileSync(parsed.values.packets, "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line));
    result = checkVerdicts(packets, readVerdicts(readFileSync(report, "utf8")));
  } catch (error) {
    fail(`cannot check the verdicts: ${error.message}`);
  }
  if (parsed.values.json) console.log(JSON.stringify({ verdicts: report, ...result }, null, 2));
  else {
    const rate = result.interval
      ? ` (${(result.supported / result.answered).toFixed(2)}, 95% Wilson interval ${result.interval.low.toFixed(2)} to ${result.interval.high.toFixed(2)})`
      : "";
    console.log(
      `${report}: ${result.supported} of ${result.answered} answered packet(s) supported${rate}; ${result.open.length} open, ${result.settled.length} settled, ${result.problems.length} problem(s)`,
    );
    for (const entry of result.open)
      console.log(`  open: ${entry.packet} ${entry.claim}: ${entry.verdict}: ${entry.missing}`);
    for (const entry of result.settled)
      console.log(`  settled: ${entry.packet} ${entry.claim}: ${entry.verdict}: ${entry.adjudication}`);
    for (const problem of result.problems)
      console.log(`  problem: ${problem.line ? `line ${problem.line}: ` : ""}${problem.problem}`);
  }
  process.exit(result.problems.length === 0 && result.open.length === 0 ? 0 : 1);
}

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
  const options = { allow: new Set(parsed.values.allow), limits: new Map(), copies: new Map() };
  for (const [id, path] of pairs(parsed.values.copy, "--copy")) options.copies.set(id, readFileSync(path, "utf8"));
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
const levels = new Map(
  table.rows.filter((row) => /^L[0-5]$/.test(row.cells.Level ?? "")).map((row) => [row.cells.ID, row.cells.Level]),
);

// --search: a count the report states about its searches (hits, included, excluded) traces to the search ledger.
const searchNumbers = new Set();
const queryNumbers = new Map();
const queryCounts = new Map();
if (parsed.values.search) {
  const counts = searchCounts(read(parsed.values.search));
  const perQuery = Object.values(counts.queries);
  for (const value of [
    perQuery.length,
    ...Object.values(counts.total),
    ...perQuery.flatMap((row) => HIT_STATES.map((state) => row[state])),
  ])
    if (Number.isFinite(value)) searchNumbers.add(String(value));
  for (const [id, row] of Object.entries(counts.queries))
    queryCounts.set(id, { ...row, total: HIT_STATES.reduce((sum, state) => sum + row[state], 0) });
  for (const [id, row] of Object.entries(counts.queries))
    queryNumbers.set(
      id,
      new Set(
        HIT_STATES.map((state) => String(row[state])).concat(
          String(HIT_STATES.reduce((sum, state) => sum + row[state], 0)),
        ),
      ),
    );
}
/**
 * The numbers in a line that its searches account for, with how many times each may pass. A number after a query ID
 * (Q2) counts for that query, or for the sum over the queries the line names ("Q1 and Q2 returned 4 hits in total");
 * a number before any query ID counts as any count the ledger computes; a query the ledger lacks accounts for none.
 */
function searchCountsIn(line) {
  const mentions = [...line.matchAll(/\bQ\d+\b/g)];
  const named = [...new Set(mentions.map((match) => match[0]))];
  const known = named.filter((id) => queryNumbers.has(id));
  const sums = new Set(
    [...HIT_STATES, "total"].map((state) =>
      String(known.reduce((sum, id) => sum + Number(queryCounts.get(id)[state]), 0)),
    ),
  );
  const allowed = new Map();
  const count = (number) => allowed.set(number, (allowed.get(number) ?? 0) + 1);
  const before = mentions.length > 0 ? line.slice(0, mentions[0].index) : line;
  for (const number of numbersIn(before)) if (searchNumbers.has(number)) count(number);
  // The sum counts only when the queries are named together, with no count between them ("Q1 and Q2 returned 4").
  let listed = true;
  mentions.forEach((match, at) => {
    const segment = line.slice(match.index, mentions[at + 1]?.index ?? line.length);
    const own = queryNumbers.get(match[0]);
    const numbers = numbersIn(segment);
    for (const number of numbers)
      if (own && (own.has(number) || (listed && known.length > 1 && sums.has(number)))) count(number);
    if (numbers.length > 0) listed = false;
  });
  return allowed;
}

const SEARCH_WORDS = /\b(?:quer(?:y|ies)|hits?|screened|included|excluded|duplicates?|unscreened|searches?)\b/i;

const problems = [];
const notes = [];
let checkedNumbers = 0;
for (const unit of units(read(report))) {
  for (const note of [...wordingNotes(unit.text, levels), ...currentNotes(unit.text)])
    notes.push({ line: unit.line, ...note });
  unit.text.split("\n").forEach((line, offset) => {
    for (const mismatch of percentMismatches(line))
      problems.push({
        line: unit.line + offset,
        kind: "percentage not from its counts",
        value: mismatch.text,
        detail: `the counts give ${mismatch.exact}%`,
      });
  });
  const ids = claimIds(unit.text);
  for (const id of ids) {
    if (!register.has(id))
      problems.push({ line: unit.line, kind: "unknown claim", value: id, detail: `${id} is not in the register` });
  }
  const supported = new Set(ids.flatMap((id) => [...(register.get(id) ?? [])]));
  // Digits inside a quote the report cites are the source's words, not numbers the report states.
  blankQuoteCitations(unit.text)
    .split("\n")
    .forEach((line, offset) => {
      const searchCounted = parsed.values.search && SEARCH_WORDS.test(line) ? searchCountsIn(line) : new Map();
      for (const number of numbersIn(line)) {
        checkedNumbers += 1;
        if (supported.has(number)) continue;
        if ((searchCounted.get(number) ?? 0) > 0) {
          searchCounted.set(number, searchCounted.get(number) - 1);
          continue;
        }
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
const results = { checked: 0, notChecked: [], listed: [] };
if (parsed.values.results) {
  const folder = dirname(resolve(parsed.values.register));
  for (const row of table.rows) {
    const numbers = numbersIn(row.cells.Numbers);
    if (numbers.length === 0) continue;
    // A code citation (S3:path:12) names a file in a source's repository, not a result file of the project.
    const files = resultCitations(row.cells.Source ?? "").filter((file) => !/^S\d+:/.test(file.path));
    if (files.length === 0) {
      // With --cited-only, a row that names no result file is listed, not failed: its numbers come from a source.
      (parsed.values["cited-only"] ? results.listed : results.notChecked).push({
        id: row.cells.ID,
        detail: "its Source names no result file",
      });
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

if (parsed.values.json) console.log(JSON.stringify({ report, checkedNumbers, results, problems, notes }, null, 2));
else {
  console.log(`${report}: ${checkedNumbers} number(s) checked; ${problems.length} problem(s), ${notes.length} note(s)`);
  if (parsed.values.results) {
    console.log(
      `  results: ${results.checked} register number(s) traced to their files; ${results.notChecked.length} row(s) not checked${results.listed.length > 0 ? `, ${results.listed.length} citing no result file` : ""}`,
    );
    for (const row of results.notChecked) console.log(`  not checked: ${row.id} (${row.detail})`);
    for (const row of results.listed) console.log(`  note: not traced to a result file: ${row.id} (${row.detail})`);
  }
  for (const problem of problems)
    console.log(`  line ${problem.line}: ${problem.kind} ${problem.value} (${problem.detail})`);
  // Notes are for the author to read: wording a number or a level may not support. They never fail the trace.
  for (const note of notes) console.log(`  note: line ${note.line}: ${note.kind}: ${note.value}`);
}
process.exit(problems.length === 0 && results.notChecked.length === 0 ? 0 : 1);
