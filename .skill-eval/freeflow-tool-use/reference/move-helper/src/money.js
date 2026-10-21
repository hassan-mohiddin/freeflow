/** Cents as a price for people: 1234 -> "€12.34". */
export function formatMoney(cents) {
  const sign = cents < 0 ? "-" : "";
  const value = Math.abs(cents);
  return `${sign}€${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}
