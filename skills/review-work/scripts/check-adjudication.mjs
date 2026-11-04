#!/usr/bin/env node
// Checks an adjudicated review report (references/adjudication.md, "Record The Review"): every item the reviewer
// reported as an Issue (Blocking or Non-blocking), a Question, Needs evidence or an Improvement has a disposition line
// (Accepted, Rejected or Open, with a reason) under an "Adjudication" heading appended to the report, and the
// adjudicated judgment is stated there and agrees with the dispositions: an Accepted Blocking item refuses Pass and
// Non-blocking. It prints the counts by class and the counts Track Work's Review line takes. It checks that each item
// is disposed of, not whether the disposition is right.
// A Deep review's reports (R<n>a-report.md, R<n>b-report.md, R<n>c-report.md) are adjudicated once, over their union:
// give every report, and the dispositions go in their own file (--adjudication, by default R<n>-adjudication.md beside
// the first report), each item named by its report's letter, "a.B1: Accepted. <reason>".
// With --record, a complete adjudication appends one line to records.jsonl in the reports' folder (lib/records.mjs):
// the round, base and head from the brief beside the first report, the depth, tier, reviewers and model from its Plan
// line (or --model), the judgment and the counts, so review-status.mjs can tell which commit the review covers.
// Usage: check-adjudication.mjs <report>... [--adjudication <file>] [--record] [--model <name>] [--json]
// An item is named by the ID the report gives it (B1, N-2, Q1, NE1); a numbered or bulleted item without one is named by
// its class letter and position in its section: B, N, Q, NE or I, then 1, 2, ... (so N3 is the third Non-blocking
// Issue). In a section whose items carry IDs or numbers, a bullet after an item is part of it (its location, evidence);
// a bullet before the first is an item. A repeated ID is refused. A disposition line reads "B1: Accepted. <reason>", optionally as a list item, in bold, or naming several items
// ("B2, B3: Rejected, <reason>"). Pre-existing items are reported to the user and need no disposition.
// Exit code 0 when every item is disposed of and the judgment agrees, 1 when not, 2 on a usage error.
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { parseArgs } from "node:util";
import { appendRecord } from "./lib/records.mjs";

const USAGE = "Usage: check-adjudication.mjs <report>... [--adjudication <file>] [--record] [--model <name>] [--json]";
const CLASSES = [
  { name: "Blocking", prefix: "B", heading: /issues\s*[—–-]+\s*blocking/i },
  { name: "Non-blocking", prefix: "N", heading: /issues\s*[—–-]+\s*non-blocking/i },
  { name: "Question", prefix: "Q", heading: /questions/i },
  { name: "Needs evidence", prefix: "NE", heading: /needs evidence/i },
  { name: "Improvement", prefix: "I", heading: /improvements/i },
];
const DISPOSITIONS = ["Accepted", "Rejected", "Open"];
const JUDGMENTS = ["Pass", "Non-blocking", "Inconclusive", "Blocking"];
// An item's ID, with its report's letter in a Deep review's union ("a.B1").
const ID = "(?:[a-z]\\.)?[A-Z]{1,3}-?\\d+";

function fail(message) {
  console.error(message);
  process.exit(2);
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      json: { type: "boolean", default: false },
      adjudication: { type: "string" },
      record: { type: "boolean", default: false },
      model: { type: "string" },
    },
  });
} catch (error) {
  fail(`${error.message}\n${USAGE}`);
}
const { values, positionals } = parsed;
if (positionals.length < 1) fail(USAGE);
for (const path of positionals) if (!existsSync(path)) fail(`no such report: ${path}`);
const several = positionals.length > 1;
// A Deep review's reports are R<n>a, R<n>b, R<n>c; any other names take a, b, c in the order given.
const letters = positionals.map((path, index) =>
  several ? (/^R\d+([a-z])-report\.md$/.exec(basename(path))?.[1] ?? String.fromCharCode(97 + index)) : "",
);
if (new Set(letters).size !== letters.length) fail("two reports have the same reviewer letter");
const slot = /^R(\d+)[a-z]?-report\.md$/.exec(basename(positionals[0]))?.[1];
const adjudicationPath = several
  ? (values.adjudication ??
    (slot ? join(dirname(positionals[0]), `R${slot}-adjudication.md`) : fail(`give --adjudication\n${USAGE}`)))
  : (values.adjudication ?? positionals[0]);
if (several && !existsSync(adjudicationPath)) fail(`no such adjudication: ${adjudicationPath}`);

const key = (id) => {
  const [, letter = "", rest] = /^(?:([a-z])\.)?(.*)$/.exec(id);
  return `${letter}${letter ? "." : ""}${rest.replace("-", "").toUpperCase()}`;
};
// A section title: a Markdown heading, or a plain label line such as "Issues — Non-blocking:".
const heading = (line) =>
  /^#{1,6}\s+(.*)$/.exec(line)?.[1] ??
  /^((?:Issues|Unresolved|Pre-existing|Improvements|Adjudication|Dispositions)\b[^:]*):\s*$/i.exec(line)?.[1];
const adjudicationIndex = (lines) => lines.findIndex((line) => /adjudicat|disposition/i.test(heading(line) ?? ""));

/** A report's items, by section, up to its Adjudication heading; IDs carry the report's letter in a union. */
function reportItems(lines, letter) {
  const at = adjudicationIndex(lines);
  const body = at === -1 ? lines : lines.slice(0, at);
  const sections = [];
  let current = null;
  for (const line of body) {
    const title = heading(line);
    if (title !== undefined) {
      const spec = CLASSES.find((each) => each.heading.test(title));
      current = spec ? { spec, lines: [] } : null;
      if (current) sections.push(current);
    } else if (/^Evidence gaps:/i.test(line)) current = null;
    else if (current) current.lines.push(line);
  }
  const items = [];
  const itemStart = /^(?:[-*]\s+)?(?:\*\*)?([A-Z]{1,3}-?\d+|\d+)(?:\*\*)?(?:[.:)]|\s+\()/;
  for (const { spec, lines: sectionLines } of sections) {
    // In a section whose items carry IDs (or numbers), a line with one starts an item, and a bullet after it is part
    // of that item (its location, evidence, sub-points); a bullet before the first is an item of its own. In a section
    // of plain bullets, every top-level bullet is an item, and an unindented line between them continues the one
    // above. An item without an ID is named by its class letter and position.
    const labelled = sectionLines.some((line) => itemStart.test(line));
    const found = [];
    for (const line of sectionLines) {
      const match = itemStart.exec(line);
      if (match) found.push({ label: match[1], line });
      else if (/^[-*]\s+\S/.test(line) && !(labelled && found.some((item) => item.label !== null)))
        found.push({ label: null, line });
    }
    found.forEach((item, index) => {
      if (/^(?:[-*]\s+)?(?:\*\*)?None\b/i.test(item.line)) return;
      const id =
        item.label === null || /^\d+$/.test(item.label) ? `${spec.prefix}${item.label ?? index + 1}` : item.label;
      items.push({
        id: letter ? `${letter}.${id}` : id,
        class: spec.name,
        text: item.line.replace(/^\s*[-*]\s+/, "").slice(0, 100),
      });
    });
  }
  return items;
}

const reports = positionals.map((path) => readFileSync(path, "utf8").split("\n"));
const items = reports.flatMap((lines, index) => reportItems(lines, letters[index]));
const adjudicationText = several ? readFileSync(adjudicationPath, "utf8").split("\n") : reports[0];
const adjudicationAt = adjudicationIndex(adjudicationText);

// Dispositions and the adjudicated judgment, after the Adjudication heading.
const problems = [];
const dispositions = new Map();
let judgment = null;
const dispositionLine = new RegExp(
  `^\\s*(?:[-*]\\s+)?(?:\\*\\*)?(${ID}(?:\\s*(?:,|and|&)\\s*${ID})*)(?:\\*\\*)?\\s*[:.)—–-]?\\s*(?:\\*\\*)?(${DISPOSITIONS.join("|")})(?:\\*\\*)?\\b[\\s:.,;—–-]*(.*)$`,
);
if (adjudicationAt === -1)
  problems.push({
    item: several ? "adjudication" : "report",
    problem: several
      ? `${adjudicationPath} has no "Adjudication" heading with the dispositions`
      : 'has no "Adjudication" heading with the dispositions appended',
  });
else
  for (const line of adjudicationText.slice(adjudicationAt + 1)) {
    const verdict = /^\s*(?:[-*]\s+)?(?:\*\*)?Adjudicated judgment:(?:\*\*)?\s*(?:\*\*)?([A-Za-z-]+)/i.exec(line);
    if (verdict) {
      judgment = JUDGMENTS.find((each) => each.toLowerCase() === verdict[1].toLowerCase()) ?? null;
      if (!judgment)
        problems.push({ item: "judgment", problem: `"${verdict[1]}" is not one of ${JUDGMENTS.join(", ")}` });
      continue;
    }
    const match = dispositionLine.exec(line);
    if (!match) continue;
    const reason = match[3].trim();
    for (const id of match[1].split(/\s*(?:,|and|&)\s*/)) {
      if (!/[A-Za-z]{2}/.test(reason)) problems.push({ item: id, problem: `is ${match[2]} without a reason` });
      if (!items.some((each) => key(each.id) === key(id)))
        problems.push({
          item: id,
          problem: several
            ? "has a disposition but no report has an item with this ID (name it by its report's letter, a.B1)"
            : "has a disposition but the report has no item with this ID",
        });
      if (dispositions.has(key(id))) problems.push({ item: id, problem: "has more than one disposition" });
      dispositions.set(key(id), match[2]);
    }
  }
if (adjudicationAt !== -1 && !judgment && !problems.some((each) => each.item === "judgment"))
  problems.push({
    item: "judgment",
    problem: 'is missing: add "Adjudicated judgment: <Pass | Non-blocking | Inconclusive | Blocking>"',
  });

const named = new Map();
for (const item of items) named.set(key(item.id), (named.get(key(item.id)) ?? 0) + 1);
for (const [id, count] of named)
  if (count > 1) problems.push({ item: id, problem: `names ${count} items: two items need two IDs, each disposed of` });
for (const item of items) {
  item.disposition = dispositions.get(key(item.id)) ?? null;
  if (!item.disposition && adjudicationAt !== -1)
    problems.push({
      item: item.id,
      problem: `(${item.class}) has no disposition: Accepted, Rejected or Open, with a reason`,
    });
}
// The judgment follows from the dispositions (adjudication.md, Derive The Judgment): an Accepted Blocking Issue
// leaves the boundary uncrossable.
const acceptedBlocking = items.filter((item) => item.class === "Blocking" && item.disposition === "Accepted");
if (acceptedBlocking.length && ["Pass", "Non-blocking"].includes(judgment))
  problems.push({
    item: "judgment",
    problem: `is ${judgment}, but ${acceptedBlocking.map((item) => item.id).join(", ")} ${acceptedBlocking.length === 1 ? "is an" : "are"} Accepted Blocking Issue${acceptedBlocking.length === 1 ? "" : "s"}: the judgment is Blocking`,
  });

const counts = Object.fromEntries(
  CLASSES.map(({ name }) => {
    const ofClass = items.filter((each) => each.class === name);
    return [
      name,
      {
        items: ofClass.length,
        ...Object.fromEntries(
          DISPOSITIONS.map((each) => [each, ofClass.filter((item) => item.disposition === each).length]),
        ),
      },
    ];
  }),
);
const total = (disposition) => items.filter((each) => each.disposition === disposition).length;
const reviewLine = `judgment: ${judgment ?? "?"}; Accepted: ${total("Accepted")}; Rejected: ${total("Rejected")}; Open: ${total("Open")}`;
const ok = problems.length === 0;

// The review record, bound to the commit the brief names, written only for a complete adjudication.
let record = null;
if (values.record && ok) {
  const briefPath = positionals[0].replace(/-report\.md$/, "-brief.md");
  if (briefPath === positionals[0] || !existsSync(briefPath))
    fail(`--record reads the brief beside the report (R<n>-brief.md), and there is none: ${briefPath}`);
  const brief = readFileSync(briefPath, "utf8");
  const field = (label) =>
    new RegExp(`^\\s*(?:[-*]\\s+)?(?:\\*\\*)?${label}:(?:\\*\\*)?\\s*(.*)$`, "m").exec(brief)?.[1].trim();
  const diff = /`?([0-9a-fA-F]{7,40})\.\.\.?([0-9a-fA-F]{7,40})`?/.exec(field("Diff") ?? "");
  const round = Number(/\d/.exec(field("Review") ?? "")?.[0]);
  if (!diff || !round) fail(`--record: the brief ${briefPath} names no Review number or Diff <base>..<head>`);
  const plan = field("Plan") ?? "";
  const planned = /^(quick|standard|deep), tier (standard|security)/.exec(plan);
  const reviewers = Number(/\bof (\d+)\b/.exec(plan)?.[1] ?? /(\d+) reviewers?/.exec(plan)?.[1] ?? positionals.length);
  const model = values.model ?? /\bmodel ([^\s;,]+)/.exec(plan)?.[1] ?? null;
  const folder = dirname(positionals[0]);
  record = {
    ts: new Date().toISOString(),
    round,
    base: diff[1],
    head: diff[2],
    depth: planned?.[1] ?? null,
    tier: planned?.[2] ?? null,
    reviewers,
    model,
    judgment,
    items: { accepted: total("Accepted"), rejected: total("Rejected"), open: total("Open") },
    report: relative(folder, several ? adjudicationPath : positionals[0]),
    ...(several ? { reports: positionals.map((path) => relative(folder, path)) } : {}),
  };
  appendRecord(folder, record);
}

if (values.json)
  console.log(
    JSON.stringify(
      {
        command: "check-adjudication",
        report: several ? positionals : positionals[0],
        ...(several ? { adjudication: adjudicationPath } : {}),
        ok,
        judgment,
        counts,
        reviewLine,
        items,
        problems,
        ...(values.record ? { record } : {}),
      },
      null,
      2,
    ),
  );
else {
  console.log(
    `${ok ? "Adjudication complete" : "Adjudication incomplete"}: ${several ? adjudicationPath : positionals[0]}`,
  );
  for (const [name, count] of Object.entries(counts))
    if (count.items)
      console.log(
        `- ${name}: ${count.items} (Accepted ${count.Accepted}, Rejected ${count.Rejected}, Open ${count.Open})`,
      );
  if (!items.length) console.log("- no items");
  console.log(`Track Work's Review line: ${reviewLine}`);
  for (const each of problems) console.log(`- ${each.item}: ${each.problem}`);
  if (record)
    console.log(
      `Recorded in ${join(dirname(positionals[0]), "records.jsonl")}: ${record.depth ?? "?"} review of ${record.head.slice(0, 12)}, ${record.judgment}`,
    );
  else if (values.record) console.log("Not recorded: the adjudication is incomplete.");
}
process.exit(ok ? 0 : 1);
