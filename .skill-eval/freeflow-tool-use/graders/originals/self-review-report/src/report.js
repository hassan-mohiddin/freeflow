import { formatAmount } from "./amount.js";

/** The month an entry's date (YYYY-MM-DD) falls in. */
export function monthKey(date) {
  return date.slice(0, 6);
}

/** One row per month, oldest first: the month and the total spent in it. */
export function monthlyTotals(entries) {
  const totals = new Map();
  for (const entry of entries) {
    const month = monthKey(entry.date);
    totals.set(month, (totals.get(month) ?? 0) + entry.cents);
  }
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, cents]) => ({ month, total: formatAmount(cents) }));
}

export function reportLines(entries) {
  return monthlyTotals(entries).map((row) => `${row.month}  ${row.total.padStart(10)}`);
}
