import { parseAmount } from "./amount.js";
import { inMonth } from "./ledger.js";

/** Monthly budgets in cents from budgets.json ({ "food": "400.00" }); a limit that is not an amount is left out. */
export function parseBudgets(raw) {
  const budgets = {};
  for (const [category, limit] of Object.entries(raw)) {
    const cents = parseAmount(limit);
    if (Number.isNaN(cents)) continue;
    budgets[category] = cents;
  }
  return budgets;
}

/** What each category spent in a month (YYYY-MM), in cents. */
export function spentByCategory(entries, month) {
  const spent = {};
  for (const entry of inMonth(entries, month)) spent[entry.category] = (spent[entry.category] ?? 0) + entry.cents;
  return spent;
}

/** What is left of each budget in a month, in cents; negative when a category spent more than its budget. */
export function remaining(budgets, entries, month) {
  const spent = spentByCategory(entries, month);
  return Object.fromEntries(
    Object.entries(budgets).map(([category, cents]) => [category, cents - (spent[category] ?? 0)]),
  );
}
