#!/usr/bin/env node
import { formatAmount, parseAmount } from "./amount.js";
import { addEntry, balance } from "./ledger.js";
import { loadEntries, saveEntries } from "./store.js";

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
} else {
  console.error("usage: ledger <add|balance> ...");
  process.exitCode = 2;
}
