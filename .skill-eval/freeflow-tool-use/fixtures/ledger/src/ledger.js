import { parseAmount } from "./amount.js";

/** A new list of entries with one more: the amount may be cents or text. */
export function addEntry(entries, { date, category, amount, description = "" }) {
  const cents = typeof amount === "number" ? amount : parseAmount(amount);
  return [...entries, { date, category, description, cents }];
}

export function balance(entries) {
  return entries.reduce((total, entry) => total + entry.cents, 0);
}

export function inMonth(entries, month) {
  return entries.filter((entry) => entry.date.startsWith(`${month}-`));
}
