import { existsSync, readFileSync, writeFileSync } from "node:fs";

// The ledger and the budgets live in two JSON files, by default in the current directory.
export const ledgerFile = () => process.env.LEDGER_FILE ?? "ledger.json";
export const budgetsFile = () => process.env.LEDGER_BUDGETS ?? "budgets.json";

export function loadEntries() {
  return existsSync(ledgerFile()) ? JSON.parse(readFileSync(ledgerFile(), "utf8")) : [];
}

export function saveEntries(entries) {
  writeFileSync(ledgerFile(), `${JSON.stringify(entries, null, 2)}\n`);
}

export function loadBudgets() {
  return existsSync(budgetsFile()) ? JSON.parse(readFileSync(budgetsFile(), "utf8")) : {};
}
