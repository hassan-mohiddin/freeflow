import { normalizeText, snippet, throwIfAborted, tokenize, unique } from "./passages.js";
import { rankMatchingPassages } from "./ranking.js";
export const CONTEXT_SEARCH_KINDS = ["user", "assistant", "toolResult", "summary"];
export const DEFAULT_CONTEXT_SEARCH_KINDS = ["user", "assistant", "summary"];
export const CONTEXT_SEARCH_MAX_QUERY_CHARACTERS = 500;
export const CONTEXT_SEARCH_MAX_QUERY_TERMS = 32;
export const CONTEXT_SEARCH_MAX_TOOL_NAMES = 8;
export const CONTEXT_SEARCH_MAX_TOOL_NAME_CHARACTERS = 128;
export const CONTEXT_SEARCH_MAX_HITS = 20;
export const CONTEXT_SEARCH_TIERS = ["active-branch", "current-session", "lineage", "cross-session"];
export const CONTEXT_SEARCH_TEMPORAL = ["current", "historical", "before-change", "after-change"];
const SEARCH_KIND_SET = new Set(CONTEXT_SEARCH_KINDS);
export function validateContextSearchRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "params_invalid" };
  const params = value;
  if (typeof params.query !== "string" || params.query.trim().length === 0) return { error: "query_required" };
  if (params.query.length > CONTEXT_SEARCH_MAX_QUERY_CHARACTERS) return { error: "query_too_long" };
  if (unique(tokenize(params.query)).length > CONTEXT_SEARCH_MAX_QUERY_TERMS) {
    return { error: "query_terms_too_many" };
  }
  if (params.includeVisible !== undefined && typeof params.includeVisible !== "boolean") {
    return { error: "include_visible_invalid" };
  }
  let maxTier;
  let session;
  let branch;
  let temporal;
  if (params.scope !== undefined) {
    if (!params.scope || typeof params.scope !== "object" || Array.isArray(params.scope)) {
      return { error: "scope_invalid" };
    }
    const scope = params.scope;
    if (
      scope.maxTier !== undefined &&
      (typeof scope.maxTier !== "string" || !CONTEXT_SEARCH_TIERS.includes(scope.maxTier))
    ) {
      return { error: "scope_invalid" };
    }
    if (scope.session !== undefined && scope.session !== "current") return { error: "scope_invalid" };
    if (scope.branch !== undefined && scope.branch !== "active") return { error: "scope_invalid" };
    if (
      scope.temporal !== undefined &&
      (typeof scope.temporal !== "string" || !CONTEXT_SEARCH_TEMPORAL.includes(scope.temporal))
    ) {
      return { error: "scope_invalid" };
    }
    maxTier = scope.maxTier;
    session = scope.session;
    branch = scope.branch;
    temporal = scope.temporal;
  }
  let kinds;
  if (params.kinds === undefined) {
    kinds = params.toolNames === undefined ? [...DEFAULT_CONTEXT_SEARCH_KINDS] : [...CONTEXT_SEARCH_KINDS];
  } else {
    if (!Array.isArray(params.kinds) || params.kinds.length < 1 || params.kinds.length > CONTEXT_SEARCH_KINDS.length) {
      return { error: "kinds_invalid" };
    }
    if (
      new Set(params.kinds).size !== params.kinds.length ||
      params.kinds.some((kind) => typeof kind !== "string" || !SEARCH_KIND_SET.has(kind))
    ) {
      return { error: "kinds_invalid" };
    }
    kinds = params.kinds;
  }
  let toolNames;
  if (params.toolNames !== undefined) {
    if (
      !Array.isArray(params.toolNames) ||
      params.toolNames.length < 1 ||
      params.toolNames.length > CONTEXT_SEARCH_MAX_TOOL_NAMES
    ) {
      return { error: "tool_names_invalid" };
    }
    const normalized = params.toolNames.map((name) => (typeof name === "string" ? name.trim() : ""));
    if (
      params.toolNames.some((name) => typeof name !== "string") ||
      normalized.some((name) => name.length === 0 || name.length > CONTEXT_SEARCH_MAX_TOOL_NAME_CHARACTERS) ||
      new Set(normalized.map((name) => name.toLocaleLowerCase())).size !== normalized.length
    ) {
      return { error: "tool_names_invalid" };
    }
    toolNames = normalized;
  }
  const limit = params.limit === undefined ? 8 : params.limit;
  if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1 || limit > CONTEXT_SEARCH_MAX_HITS) {
    return { error: "limit_invalid" };
  }
  return {
    options: Object.freeze({
      query: params.query.trim(),
      kinds: Object.freeze([...kinds]),
      ...(toolNames === undefined ? {} : { toolNames: Object.freeze(toolNames) }),
      limit,
      ...(maxTier === undefined ? {} : { maxTier }),
      ...(session === undefined ? {} : { session }),
      ...(branch === undefined ? {} : { branch }),
      ...(temporal === undefined ? {} : { temporal }),
    }),
    includeVisible: params.includeVisible === true,
  };
}
function matchesFilters(source, options) {
  if (!options.kinds.includes(source.kind)) return false;
  if (options.toolNames === undefined) return true;
  const names = new Set((source.toolNames ?? []).map((name) => name.toLocaleLowerCase()));
  return options.toolNames.some((name) => names.has(name.toLocaleLowerCase()));
}
function hitFromPassage(passage, query, terms) {
  const matchType = passage.exactPhrase
    ? "exact-phrase"
    : passage.matchedTerms.length === terms.length
      ? "all-terms"
      : "partial-terms";
  return {
    source: passage.source,
    snippet: snippet(passage.passage.text, normalizeText(query), terms),
    match: {
      type: matchType,
      matchedTerms: Object.freeze([...passage.matchedTerms]),
      queryTermCount: terms.length,
    },
  };
}
export function searchContextSources(sources, options, signal) {
  throwIfAborted(signal);
  const normalizedQuery = normalizeText(options.query);
  const terms = unique(tokenize(options.query));
  if (!normalizedQuery || terms.length === 0) return Object.freeze({ returned: 0, truncated: false, hits: [] });
  const candidates = sources.filter((source) => matchesFilters(source, options));
  const rankedPassages = rankMatchingPassages(candidates, options.query, signal);
  const bySource = new Map();
  for (const passage of rankedPassages) {
    throwIfAborted(signal);
    if (!bySource.has(passage.source.ref)) bySource.set(passage.source.ref, passage);
  }
  const ranked = [...bySource.values()].sort((left, right) => {
    if (left.exactPhrase !== right.exactPhrase) return left.exactPhrase ? -1 : 1;
    if (left.score !== right.score) return right.score - left.score;
    if (left.matchedTerms.length !== right.matchedTerms.length) {
      return right.matchedTerms.length - left.matchedTerms.length;
    }
    const leftPrior = options.priorForSource?.(left.source) ?? 0;
    const rightPrior = options.priorForSource?.(right.source) ?? 0;
    if (leftPrior !== rightPrior) return rightPrior - leftPrior;
    if (left.source.position !== right.source.position) return right.source.position - left.source.position;
    return left.source.ref.localeCompare(right.source.ref);
  });
  const hits = ranked.slice(0, options.limit).map((passage) => hitFromPassage(passage, options.query, terms));
  return Object.freeze({
    returned: hits.length,
    truncated: ranked.length > options.limit,
    hits: Object.freeze(hits),
  });
}
