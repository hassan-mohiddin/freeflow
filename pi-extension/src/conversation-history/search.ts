import { normalizeText, snippet, tokenize, unique } from "./passages.js";
import { rankMatchingPassages } from "./ranking.js";
import type {
  ConversationSearchEntry,
  ConversationSearchHit,
  ConversationSearchOptions,
  ConversationSearchResult,
} from "./types.js";

export type {
  ConversationSearchEntry,
  ConversationSearchHit,
  ConversationSearchOptions,
  ConversationSearchResult,
} from "./types.js";

const MAX_DISPLAYED_TOOL_NAMES = 8;

function matchesFilters(entry: ConversationSearchEntry, options: ConversationSearchOptions): boolean {
  if (options.kinds && !options.kinds.includes(entry.kind)) return false;
  if (options.toolNames) {
    const names = new Set((entry.toolNames ?? []).map((name) => name.toLocaleLowerCase()));
    if (!options.toolNames.some((name) => names.has(name.toLocaleLowerCase()))) return false;
  }
  return true;
}

export function searchConversationEntries(
  entries: readonly ConversationSearchEntry[],
  options: ConversationSearchOptions,
): ConversationSearchResult {
  const normalizedQuery = normalizeText(options.query);
  const terms = unique(tokenize(options.query));
  const limit = Math.min(20, Math.max(1, Math.trunc(options.limit ?? 8)));
  if (!normalizedQuery || terms.length === 0) return { returned: 0, truncated: false, hits: [] };

  const candidates = entries.filter((entry) => matchesFilters(entry, options));
  const rankedPassages = rankMatchingPassages(candidates, options.query);
  const byEntry = new Map<string, (typeof rankedPassages)[number]>();
  for (const passage of rankedPassages) {
    if (!byEntry.has(passage.entry.ref)) byEntry.set(passage.entry.ref, passage);
  }

  const ranked = [...byEntry.values()];
  const hits = ranked.slice(0, limit).map((passage) => {
    const matchType = passage.exactPhrase
      ? "exact-phrase"
      : passage.matchedTerms.length === terms.length
        ? "all-terms"
        : "partial-terms";
    return {
      ref: passage.entry.ref,
      kind: passage.entry.kind,
      ...(passage.entry.toolNames
        ? {
            toolNames: passage.entry.toolNames.slice(0, MAX_DISPLAYED_TOOL_NAMES),
            ...(passage.entry.toolNames.length > MAX_DISPLAYED_TOOL_NAMES ? { toolNamesTruncated: true } : {}),
          }
        : {}),
      ...(passage.entry.isError === undefined ? {} : { isError: passage.entry.isError }),
      timestamp: passage.entry.timestamp.slice(0, 64),
      snippet: snippet(passage.passage.text, normalizedQuery, terms),
      match: {
        type: matchType,
        matchedTerms: passage.matchedTerms,
        queryTermCount: terms.length,
      },
    } satisfies ConversationSearchHit;
  });

  return {
    returned: hits.length,
    truncated: ranked.length > limit,
    hits,
  };
}
