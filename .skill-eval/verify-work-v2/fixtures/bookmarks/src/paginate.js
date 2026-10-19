import { HttpError } from "./http.js";

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

/**
 * One page of a list, read from the request's `limit` and `offset`.
 * @template T
 * @param {T[]} items
 * @param {{ limit?: string, offset?: string }} query
 */
export function paginate(items, query) {
  const limit = parseLimit(query.limit);
  const offset = parseOffset(query.offset);
  return { items: items.slice(offset, offset + limit), total: items.length, limit, offset };
}

function parseLimit(value) {
  if (value === undefined || value === "") return DEFAULT_LIMIT;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) throw new HttpError(400, "limit must be a positive integer");
  return Math.min(limit, MAX_LIMIT);
}

function parseOffset(value) {
  if (value === undefined || value === "") return 0;
  const offset = Number(value);
  if (!Number.isInteger(offset) || offset < 0) throw new HttpError(400, "offset must be a whole number");
  return offset;
}
