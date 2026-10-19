import { HttpError } from "./http.js";

/**
 * The form a URL is stored and compared in: an http(s) URL with a lower-case host, no default port, no fragment, and
 * no trailing slash on a path other than `/`.
 * @param {unknown} input
 * @returns {string}
 */
export function normalizeUrl(input) {
  if (typeof input !== "string" || input.trim() === "") throw new HttpError(400, "url is required");
  let url;
  try {
    url = new URL(input.trim());
  } catch {
    throw new HttpError(400, `url is not a valid URL: ${input}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpError(400, "url must start with http:// or https://");
  }
  url.hash = "";
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.href;
}
