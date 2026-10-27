#!/usr/bin/env node
// Trace a report to its claims register: every claim ID the report cites exists, and every number it states appears
// in the Numbers of a claim cited in the same paragraph, list item or table row. With --results, also trace each
// register number to the result file or log its Source names.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

import { parseMarkdown, parseTable } from "./lib/formats.mjs";
import { claimIds, fileNumbers, numberInResults, numbersIn, resultCitations, units } from "./lib/report.mjs";

const USAGE = "Usage: claims.mjs trace <report.md> --register <claims.md> [--results] [--json]";

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
      found.push(...fileNumbers(text));
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
process.exit(problems.length === 0 ? 0 : 1);
