// Turns a post title into the slug used in its URL: lowercase letters and digits, words joined by one hyphen.
export function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
