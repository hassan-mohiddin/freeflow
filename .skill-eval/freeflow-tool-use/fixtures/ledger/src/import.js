import { parseAmount } from "./amount.js";

/**
 * Entries from a bank's CSV export (date,category,description,amount, with a header line). A row whose amount is not
 * an amount is skipped, and its line number listed, so one bad row never stops an import.
 */
export function importCsv(text) {
  const [, ...lines] = text.trim().split(/\r?\n/);
  const entries = [];
  const skipped = [];
  for (const [index, line] of lines.entries()) {
    const [date, category, description, amount] = line.split(",");
    const cents = parseAmount(amount);
    if (Number.isNaN(cents)) {
      skipped.push(index + 2);
      continue;
    }
    entries.push({ date, category, description, cents });
  }
  return { entries, skipped };
}
