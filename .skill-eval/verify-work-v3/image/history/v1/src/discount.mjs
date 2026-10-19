// Discount codes and what each takes off; README.md has the rules.
const PERCENT_OFF = { SAVE10: 10, SAVE15: 15 };
const FLAT_OFF_CENTS = { FLAT5: 500 };

/** The total after applying `code`, in currency units. */
export function applyDiscount(total, code) {
  const cents = Math.round(total * 100);
  if (!code) return cents / 100;
  if (code in PERCENT_OFF) return Math.round((cents * (100 - PERCENT_OFF[code])) / 100) / 100;
  if (code in FLAT_OFF_CENTS) return Math.max(0, cents - FLAT_OFF_CENTS[code]) / 100;
  throw new RangeError(`unknown discount code: ${code}`);
}
