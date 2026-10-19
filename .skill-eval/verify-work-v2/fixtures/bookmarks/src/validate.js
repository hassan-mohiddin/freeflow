import { HttpError } from "./http.js";
import { normalizeTags } from "./tags.js";
import { normalizeUrl } from "./urls.js";

export const MAX_TITLE_LENGTH = 200;

function requireObject(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "request body must be a JSON object");
  }
  return body;
}

function title(value) {
  if (typeof value !== "string") throw new HttpError(400, "title must be a string");
  const trimmed = value.trim();
  if (trimmed.length > MAX_TITLE_LENGTH)
    throw new HttpError(400, `title may be at most ${MAX_TITLE_LENGTH} characters`);
  return trimmed;
}

/** The fields of a new bookmark, normalized. */
export function validateNewBookmark(body) {
  const input = requireObject(body);
  const url = normalizeUrl(input.url);
  const given = input.title === undefined ? "" : title(input.title);
  return { url, title: given === "" ? url : given, tags: normalizeTags(input.tags) };
}

/** The fields a PATCH changes, normalized; fields it leaves out are absent. */
export function validateBookmarkChanges(body) {
  const input = requireObject(body);
  const changes = {};
  if (input.url !== undefined) changes.url = normalizeUrl(input.url);
  if (input.title !== undefined) changes.title = title(input.title);
  if (input.tags !== undefined) changes.tags = normalizeTags(input.tags);
  if (Object.keys(changes).length === 0) throw new HttpError(400, "nothing to change: give url, title or tags");
  return changes;
}
