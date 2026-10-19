// Discount codes and what each takes off; README.md has the rules.
const PERCENT_OFF = { SAVE10: 10, SAVE15: 15, BULK20: 20 };
const FLAT_OFF_CENTS = { FLAT5: 500 };
// A code listed here applies only to an order of at least this many cents.
const MINIMUM_CENTS = { BULK20: 10000 };

// Whole cents, so the arithmetic below is exact; totals have at most two decimals.
const toCents = (amount) => Math.round(amount * 100);
// The amount left after a percentage discount, rounded to the nearest whole cent, half a cent up.
const percentOff = (cents, percent) => Math.round((cents * (100 - percent)) / 100);

/** The total after applying `code`, in currency units. */
export function applyDiscount(total, code) {
  const cents = toCents(total);
  if (!code) return cents / 100;
  if (cents < (MINIMUM_CENTS[code] ?? 0)) return cents / 100;
  if (code in PERCENT_OFF) return percentOff(cents, PERCENT_OFF[code]) / 100;
  if (code in FLAT_OFF_CENTS) return Math.max(0, cents - FLAT_OFF_CENTS[code]) / 100;
  throw new RangeError(`unknown discount code: ${code}`);
}
