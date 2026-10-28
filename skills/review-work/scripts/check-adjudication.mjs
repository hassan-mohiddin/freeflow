#!/usr/bin/env node
// Checks an adjudicated review report (references/adjudication.md, "Record The Review"): every item the reviewer
// reported as an Issue (Blocking or Non-blocking), a Question, Needs evidence or an Improvement has a disposition line
// (Accepted, Rejected or Open, with a reason) under an "Adjudication" heading appended to the report, and the
// adjudicated judgment is stated there. It prints the counts by class and the counts Track Work's Review line takes.
// It checks that each item is disposed of, not whether the disposition is right.
// Usage: check-adjudication.mjs <report> [--json]
// An item is named by the ID the report gives it (B1, N-2, Q1, NE1); a numbered or bulleted item without one is named by
// its class letter and position in its section: B, N, Q, NE or I, then 1, 2, ... (so N3 is the third Non-blocking
// Issue). In a section whose items carry IDs or numbers, a bullet after an item is part of it (its location, evidence);
// a bullet before the first is an item. A repeated ID is refused. A disposition line reads "B1: Accepted. <reason>", optionally as a list item, in bold, or naming several items
// ("B2, B3: Rejected, <reason>"). Pre-existing items are reported to the user and need no disposition.
// Exit code 0 when every item is disposed of, 1 when one is not, 2 on a usage error.
import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const USAGE = "Usage: check-adjudication.mjs <report> [--json]";
const CLASSES = [
  { name: "Blocking", prefix: "B", heading: /issues\s*[—–-]+\s*blocking/i },
  { name: "Non-blocking", prefix: "N", heading: /issues\s*[—–-]+\s*non-blocking/i },
  { name: "Question", prefix: "Q", heading: /questions/i },
  { name: "Needs evidence", prefix: "NE", heading: /needs evidence/i },
  { name: "Improvement", prefix: "I", heading: /improvements/i },
];
const DISPOSITIONS = ["Accepted", "Rejected", "Open"];
const JUDGMENTS = ["Pass", "Non-blocking", "Inconclusive", "Blocking"];
const ID = "[A-Z]{1,3}-?\\d+";

function fail(message) {
  console.error(message);
  process.exit(2);
}

let parsed;
try {
  parsed = parseArgs({ allowPositionals: true, options: { json: { type: "boolean", default: false } } });
} catch (error) {
  fail(`${error.message}\n${USAGE}`);
}
const { values, positionals } = parsed;
if (positionals.length !== 1) fail(USAGE);
if (!existsSync(positionals[0])) fail(`no such report: ${positionals[0]}`);
const text = readFileSync(positionals[0], "utf8").split("\n");

const key = (id) => id.replace("-", "").toUpperCase();
// A section title: a Markdown heading, or a plain label line such as "Issues — Non-blocking:".
const heading = (line) =>
  /^#{1,6}\s+(.*)$/.exec(line)?.[1] ??
  /^((?:Issues|Unresolved|Pre-existing|Improvements|Adjudication|Dispositions)\b[^:]*):\s*$/i.exec(line)?.[1];

// The report's items, by section, up to the Adjudication heading.
const adjudicationAt = text.findIndex((line) => /adjudicat|disposition/i.test(heading(line) ?? ""));
const body = adjudicationAt === -1 ? text : text.slice(0, adjudicationAt);
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
const itemStart = new RegExp(`^(?:[-*]\\s+)?(?:\\*\\*)?(${ID}|\\d+)(?:\\*\\*)?(?:[.:)]|\\s+\\()`);
for (const { spec, lines } of sections) {
  // In a section whose items carry IDs (or numbers), a line with one starts an item, and a bullet after it is part of
  // that item (its location, evidence, sub-points); a bullet before the first is an item of its own. In a section of
  // plain bullets, every top-level bullet is an item, and an unindented line between them continues the one above.
  // An item without an ID is named by its class letter and position.
  const labelled = lines.some((line) => itemStart.test(line));
  const found = [];
  for (const line of lines) {
    const match = itemStart.exec(line);
    if (match) found.push({ label: match[1], line });
    else if (/^[-*]\s+\S/.test(line) && !(labelled && found.some((item) => item.label !== null)))
      found.push({ label: null, line });
  }
  found.forEach((item, index) => {
    if (/^(?:[-*]\s+)?(?:\*\*)?None\b/i.test(item.line)) return;
    const id =
      item.label === null || /^\d+$/.test(item.label) ? `${spec.prefix}${item.label ?? index + 1}` : item.label;
    items.push({ id, class: spec.name, text: item.line.replace(/^\s*[-*]\s+/, "").slice(0, 100) });
  });
}

// Dispositions and the adjudicated judgment, after the Adjudication heading.
const problems = [];
const dispositions = new Map();
let judgment = null;
const dispositionLine = new RegExp(
  `^\\s*(?:[-*]\\s+)?(?:\\*\\*)?(${ID}(?:\\s*(?:,|and|&)\\s*${ID})*)(?:\\*\\*)?\\s*[:.)—–-]?\\s*(?:\\*\\*)?(${DISPOSITIONS.join("|")})(?:\\*\\*)?\\b[\\s:.,;—–-]*(.*)$`,
);
if (adjudicationAt === -1)
  problems.push({ item: "report", problem: 'has no "Adjudication" heading with the dispositions appended' });
else
  for (const line of text.slice(adjudicationAt + 1)) {
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
        problems.push({ item: id, problem: "has a disposition but the report has no item with this ID" });
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

if (values.json)
  console.log(
    JSON.stringify(
      { command: "check-adjudication", report: positionals[0], ok, judgment, counts, reviewLine, items, problems },
      null,
      2,
    ),
  );
else {
  console.log(`${ok ? "Adjudication complete" : "Adjudication incomplete"}: ${positionals[0]}`);
  for (const [name, count] of Object.entries(counts))
    if (count.items)
      console.log(
        `- ${name}: ${count.items} (Accepted ${count.Accepted}, Rejected ${count.Rejected}, Open ${count.Open})`,
      );
  if (!items.length) console.log("- no items");
  console.log(`Track Work's Review line: ${reviewLine}`);
  for (const each of problems) console.log(`- ${each.item}: ${each.problem}`);
}
process.exit(ok ? 0 : 1);
