import { HttpError } from "./http.js";

/**
 * Parses a query string such as `?tag=reading&limit=10` into an object, decoding it as a form does (`+` is a space).
 * A key given twice keeps its last value.
 * @param {string} search
 * @returns {Record<string, string>}
 */
export function parseQuery(search) {
  const query = {};
  for (const pair of search.replace(/^\?/, "").split("&")) {
    if (pair === "") continue;
    const separator = pair.indexOf("=");
    const rawKey = separator === -1 ? pair : pair.slice(0, separator);
    const rawValue = separator === -1 ? "" : pair.slice(separator + 1);
    query[decode(rawKey.replaceAll("+", " "))] = decode(rawValue.replaceAll("+", " "));
  }
  return query;
}

function decode(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    throw new HttpError(400, `malformed query string: ${text}`);
  }
}

/**
 * A small method-and-path router. Patterns are slash-separated; a segment starting with `:` captures a parameter.
 */
export function createRouter() {
  const routes = [];
  return {
    add(method, pattern, handler) {
      routes.push({ method, segments: pattern.split("/").filter(Boolean), handler });
    },
    /**
     * @returns {{ handler: Function, params: Record<string, string> } | { allowed: string[] } | null}
     *   the matching route, the methods the path supports when none matches the method, or null for an unknown path
     */
    match(method, pathname) {
      const parts = pathname.split("/").filter(Boolean);
      const allowed = [];
      for (const route of routes) {
        const params = matchSegments(route.segments, parts);
        if (params === null) continue;
        if (route.method === method) return { handler: route.handler, params };
        allowed.push(route.method);
      }
      return allowed.length > 0 ? { allowed } : null;
    },
  };
}

function matchSegments(segments, parts) {
  if (segments.length !== parts.length) return null;
  const params = {};
  for (const [index, segment] of segments.entries()) {
    if (segment.startsWith(":")) {
      try {
        params[segment.slice(1)] = decodeURIComponent(parts[index]);
      } catch {
        return null;
      }
    } else if (segment !== parts[index]) {
      return null;
    }
  }
  return params;
}
