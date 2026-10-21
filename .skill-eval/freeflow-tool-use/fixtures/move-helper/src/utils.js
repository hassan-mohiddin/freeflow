/** Cents as a price for people: 1234 -> "€12.34". */
export function formatPrice(cents) {
  const sign = cents < 0 ? "-" : "";
  const value = Math.abs(cents);
  return `${sign}€${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}

/** Text as a URL slug: "Blue Mug!" -> "blue-mug". */
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
