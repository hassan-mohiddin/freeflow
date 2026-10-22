/** A URL without its scheme, "www." or trailing slash. */
function normalizeUrl(url) {
  let value = String(url).trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "");
  value = value.replace(/^www\./, "");
  if (value.endsWith("/")) value = value.slice(0, -1);
  return value;
}

function prepare(text) {
  return String(text).toLowerCase();
}

/** Bookmarks whose title or URL contains every word of the query. */
export function search(bookmarks, query) {
  const words = prepare(query).split(/\s+/).filter(Boolean);
  return bookmarks.filter((bookmark) => {
    const haystack = `${prepare(bookmark.title)} ${normalizeUrl(bookmark.url)}`;
    return words.every((word) => haystack.includes(word));
  });
}
