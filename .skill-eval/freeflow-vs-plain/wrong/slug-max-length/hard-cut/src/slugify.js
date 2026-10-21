// Wrong on purpose: cuts at maxLength characters, mid-word and leaving a trailing separator.
export function slugify(text, { separator = "-", maxLength } = {}) {
  const slug = String(text)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join(separator);
  return maxLength === undefined ? slug : slug.slice(0, maxLength);
}
