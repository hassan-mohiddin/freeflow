// Title to URL slug: strip accents, lowercase, keep ASCII letters and digits, join words with the separator.

/** The slug of a title. Options: `separator` (default "-"). */
export function slugify(text, { separator = "-" } = {}) {
  const words = String(text)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return words.join(separator);
}
