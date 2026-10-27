#!/usr/bin/env node
// Trace a report to its claims register: every claim ID the report cites exists, and every number it states appears
// in the Numbers of a claim cited in the same paragraph, list item or table row.

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { parseMarkdown, parseTable } from "./lib/formats.mjs";
import { claimIds, numbersIn, units } from "./lib/report.mjs";

const USAGE = "Usage: claims.mjs trace <report.md> --register <claims.md> [--json]";

function fail(message) {
  console.error(message);
  process.exit(2);
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: { register: { type: "string" }, json: { type: "boolean", default: false }, help: { type: "boolean" } },
  });
} catch (error) {
  fail(`${error.message}\n${USAGE}`);
}
if (parsed.values.help) {
  console.log(USAGE);
  process.exit(0);
}
const [command, report] = parsed.positionals;
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

if (parsed.values.json) console.log(JSON.stringify({ report, checkedNumbers, problems }, null, 2));
else {
  console.log(`${report}: ${checkedNumbers} number(s) checked; ${problems.length} problem(s)`);
  for (const problem of problems)
    console.log(`  line ${problem.line}: ${problem.kind} ${problem.value} (${problem.detail})`);
}
process.exit(problems.length === 0 ? 0 : 1);
