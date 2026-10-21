// Money helpers. Prices arrive in pounds as written on the price list; everything else works in whole pence.

/** A price in pounds as whole pence. */
export function toPence(pounds) {
  return Math.floor(pounds * 100);
}

/** Whole pence as a pound amount for printing, such as £4.35. */
export function formatPence(pence) {
  const sign = pence < 0 ? "-" : "";
  const absolute = Math.abs(pence);
  return `${sign}£${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

/** The sum of a list of pence amounts. */
export function sumPence(amounts) {
  return amounts.reduce((total, amount) => total + amount, 0);
}
