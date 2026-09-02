import type { ContextSourceKind, ProjectedContextSource } from "../sources/types.js";
import { normalizeText, snippet, throwIfAborted, tokenize, unique } from "./passages.js";
import { rankMatchingPassages, type RankedContextPassage } from "./ranking.js";

export const CONTEXT_SEARCH_KINDS = ["user", "assistant", "toolResult", "summary"] as const;
export const DEFAULT_CONTEXT_SEARCH_KINDS = ["user", "assistant", "summary"] as const;
export const CONTEXT_SEARCH_MAX_QUERY_CHARACTERS = 500;
export const CONTEXT_SEARCH_MAX_QUERY_TERMS = 32;
export const CONTEXT_SEARCH_MAX_TOOL_NAMES = 8;
export const CONTEXT_SEARCH_MAX_TOOL_NAME_CHARACTERS = 128;
export const CONTEXT_SEARCH_MAX_HITS = 20;
export const CONTEXT_SEARCH_TIERS = ["active-branch", "current-session", "lineage", "cross-session"] as const;
export const CONTEXT_SEARCH_TEMPORAL = ["current", "historical", "before-change", "after-change"] as const;

export type ContextSearchKind = Exclude<ContextSourceKind, "custom">;
export type ContextSearchTier = (typeof CONTEXT_SEARCH_TIERS)[number];
export type ContextSearchTemporal = (typeof CONTEXT_SEARCH_TEMPORAL)[number];

export type ContextSearchOptions = {
  readonly query: string;
  readonly kinds: readonly ContextSearchKind[];
  readonly toolNames?: readonly string[];
  readonly limit: number;
  readonly maxTier?: ContextSearchTier;
  readonly session?: "current";
  readonly branch?: "active";
  readonly temporal?: ContextSearchTemporal;
  readonly priorForSource?: (source: ProjectedContextSource) => number;
};

export type ContextSearchRequest = {
  readonly options: ContextSearchOptions;
  readonly includeVisible: boolean;
};

const SEARCH_KIND_SET = new Set<string>(CONTEXT_SEARCH_KINDS);

export function validateContextSearchRequest(value: unknown): ContextSearchRequest | { error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "params_invalid" };
  const params = value as Record<string, unknown>;
  if (typeof params.query !== "string" || params.query.trim().length === 0) return { error: "query_required" };
  if (params.query.length > CONTEXT_SEARCH_MAX_QUERY_CHARACTERS) return { error: "query_too_long" };
  if (unique(tokenize(params.query)).length > CONTEXT_SEARCH_MAX_QUERY_TERMS) {
    return { error: "query_terms_too_many" };
  }
  if (params.includeVisible !== undefined && typeof params.includeVisible !== "boolean") {
    return { error: "include_visible_invalid" };
  }

  let maxTier: ContextSearchTier | undefined;
  let session: "current" | undefined;
  let branch: "active" | undefined;
  let temporal: ContextSearchTemporal | undefined;
  if (params.scope !== undefined) {
    if (!params.scope || typeof params.scope !== "object" || Array.isArray(params.scope)) {
      return { error: "scope_invalid" };
    }
    const scope = params.scope as Record<string, unknown>;
    if (
      scope.maxTier !== undefined &&
      (typeof scope.maxTier !== "string" || !CONTEXT_SEARCH_TIERS.includes(scope.maxTier as ContextSearchTier))
    ) {
      return { error: "scope_invalid" };
    }
    if (scope.session !== undefined && scope.session !== "current") return { error: "scope_invalid" };
    if (scope.branch !== undefined && scope.branch !== "active") return { error: "scope_invalid" };
    if (
      scope.temporal !== undefined &&
      (typeof scope.temporal !== "string" || !CONTEXT_SEARCH_TEMPORAL.includes(scope.temporal as ContextSearchTemporal))
    ) {
      return { error: "scope_invalid" };
    }
    maxTier = scope.maxTier as ContextSearchTier | undefined;
    session = scope.session as "current" | undefined;
    branch = scope.branch as "active" | undefined;
    temporal = scope.temporal as ContextSearchTemporal | undefined;
  }

  let kinds: ContextSearchKind[];
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
    kinds = params.kinds as ContextSearchKind[];
  }

  let toolNames: string[] | undefined;
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

export type ContextSearchMatch = {
  readonly type: "exact-phrase" | "all-terms" | "partial-terms";
  readonly matchedTerms: readonly string[];
  readonly queryTermCount: number;
};

export type ContextSearchHit = {
  readonly source: ProjectedContextSource;
  readonly snippet: string;
  readonly match: ContextSearchMatch;
};

export type ContextSearchResult = {
  readonly returned: number;
  readonly truncated: boolean;
  readonly hits: readonly ContextSearchHit[];
};

function matchesFilters(source: ProjectedContextSource, options: ContextSearchOptions): boolean {
  if (!options.kinds.includes(source.kind)) return false;
  if (options.toolNames === undefined) return true;
  const names = new Set((source.toolNames ?? []).map((name) => name.toLocaleLowerCase()));
  return options.toolNames.some((name) => names.has(name.toLocaleLowerCase()));
}

function hitFromPassage(passage: RankedContextPassage, query: string, terms: readonly string[]): ContextSearchHit {
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

export function searchContextSources(
  sources: readonly ProjectedContextSource[],
  options: ContextSearchOptions,
  signal?: AbortSignal,
): ContextSearchResult {
  throwIfAborted(signal);
  const normalizedQuery = normalizeText(options.query);
  const terms = unique(tokenize(options.query));
  if (!normalizedQuery || terms.length === 0) return Object.freeze({ returned: 0, truncated: false, hits: [] });

  const candidates = sources.filter((source) => matchesFilters(source, options));
  const rankedPassages = rankMatchingPassages(candidates, options.query, signal);
  const bySource = new Map<string, RankedContextPassage>();
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
