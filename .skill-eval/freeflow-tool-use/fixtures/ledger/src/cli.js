#!/usr/bin/env node
import { readFileSync } from "node:fs";

import { formatAmount, parseAmount } from "./amount.js";
import { parseBudgets, remaining } from "./budget.js";
import { exportCsv } from "./export.js";
import { importCsv } from "./import.js";
import { addEntry, balance } from "./ledger.js";
import { reportLines } from "./report.js";
import { loadBudgets, loadEntries, saveEntries } from "./store.js";

const [command, ...args] = process.argv.slice(2);

if (command === "add") {
  const [date, category, amount, ...description] = args;
  if (Number.isNaN(parseAmount(amount))) {
    console.error(`not an amount: ${amount}`);
    process.exitCode = 1;
  } else {
    saveEntries(addEntry(loadEntries(), { date, category, amount, description: description.join(" ") }));
    console.log(`added ${formatAmount(parseAmount(amount))} to ${category}`);
  }
} else if (command === "balance") {
  console.log(formatAmount(balance(loadEntries())));
} else if (command === "report") {
  for (const line of reportLines(loadEntries())) console.log(line);
} else if (command === "budget") {
  const [month] = args;
  const left = remaining(parseBudgets(loadBudgets()), loadEntries(), month);
  for (const [category, cents] of Object.entries(left)) console.log(`${category}  ${formatAmount(cents)} left`);
} else if (command === "import") {
  const { entries, skipped } = importCsv(readFileSync(args[0], "utf8"));
  saveEntries([...loadEntries(), ...entries]);
  console.log(`imported ${entries.length} entries`);
  if (skipped.length > 0) console.log(`skipped lines: ${skipped.join(", ")}`);
} else if (command === "export") {
  process.stdout.write(exportCsv(loadEntries()));
} else {
  console.error("usage: ledger <add|balance|report|budget|import|export> ...");
  process.exitCode = 2;
}
