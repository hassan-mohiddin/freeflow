// Title to URL slug: strip accents, lowercase, keep ASCII letters and digits, join words with the separator.

/**
 * The slug of a title. Options: `separator` (default "-") and `maxLength`: a longer slug is cut back to the last
 * whole word that fits. A first word longer than maxLength is kept whole (the README never cuts a word).
 */
export function slugify(text, { separator = "-", maxLength } = {}) {
  const words = String(text)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (maxLength === undefined) return words.join(separator);
  let slug = words[0] ?? "";
  for (const word of words.slice(1)) {
    const next = `${slug}${separator}${word}`;
    if (next.length > maxLength) break;
    slug = next;
  }
  return slug;
}
