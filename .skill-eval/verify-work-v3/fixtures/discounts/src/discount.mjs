// Discount codes and what each takes off; README.md has the rules.
const PERCENT_OFF = { SAVE10: 10, SAVE15: 15, BULK20: 20 };
const FLAT_OFF = { FLAT5: 5 };
// A code listed here applies only to an order of at least this total.
const MINIMUM_TOTAL = { BULK20: 100 };

// Rounds an amount to whole cents.
const roundToCent = (amount) => Math.floor(amount * 100) / 100;

/** The total after applying `code`, in currency units. */
export function applyDiscount(total, code) {
  if (!code) return total;
  if (total < (MINIMUM_TOTAL[code] ?? 0)) return total;
  if (code in PERCENT_OFF) return roundToCent((total * (100 - PERCENT_OFF[code])) / 100);
  if (code in FLAT_OFF) return roundToCent(Math.max(0, total - FLAT_OFF[code]));
  throw new RangeError(`unknown discount code: ${code}`);
}
