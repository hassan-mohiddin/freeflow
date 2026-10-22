// Amounts are kept as whole cents, so sums never drift. Text such as "12", "12.5" or "-3.40" becomes cents.

const AMOUNT = /^\s*(-)?(\d+)(?:\.(\d{1,2}))?\s*$/;

export function parseAmount(text) {
  const match = AMOUNT.exec(String(text ?? ""));
  if (!match) return NaN;
  const [, minus, whole, fraction = ""] = match;
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return minus ? -cents : cents;
}

export function formatAmount(cents) {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}
