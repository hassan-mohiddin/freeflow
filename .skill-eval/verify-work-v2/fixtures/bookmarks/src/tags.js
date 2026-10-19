import { HttpError } from "./http.js";

export const MAX_TAG_LENGTH = 32;
export const MAX_TAGS = 10;

/**
 * Trims, lower-cases and turns each run of inner whitespace into one `-`.
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeTag(raw) {
  if (typeof raw !== "string") throw new HttpError(400, "a tag must be a string");
  const tag = raw.trim().toLowerCase().replace(/\s+/g, "-");
  if (tag === "") throw new HttpError(400, "a tag may not be empty");
  if (tag.includes(",")) throw new HttpError(400, `a tag may not contain a comma: ${raw}`);
  if (tag.length > MAX_TAG_LENGTH)
    throw new HttpError(400, `a tag may be at most ${MAX_TAG_LENGTH} characters: ${raw}`);
  return tag;
}

/** Normalizes a list of tags, keeping each once in first-seen order. */
export function normalizeTags(raw) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new HttpError(400, "tags must be a list");
  const tags = [...new Set(raw.map(normalizeTag))];
  if (tags.length > MAX_TAGS) throw new HttpError(400, `a bookmark may have at most ${MAX_TAGS} tags`);
  return tags;
}

/**
 * Every tag in use with how many bookmarks carry it, most used first, then by name.
 * @param {{ tags: string[] }[]} bookmarks
 */
export function countTags(bookmarks) {
  const counts = new Map();
  for (const bookmark of bookmarks) {
    for (const tag of bookmark.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}
