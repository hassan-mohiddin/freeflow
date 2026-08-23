import type { ProjectedContextSource } from "../freeflow-context/types.js";

export type ConversationSearchEntry = ProjectedContextSource;

export type ConversationSearchOptions = {
  query: string;
  kinds?: readonly ConversationSearchEntry["kind"][];
  toolNames?: readonly string[];
  limit?: number;
};

export type ConversationSearchHit = {
  ref: string;
  kind: ConversationSearchEntry["kind"];
  toolNames?: string[];
  toolNamesTruncated?: boolean;
  isError?: boolean;
  timestamp: string;
  snippet: string;
  match: {
    type: "exact-phrase" | "all-terms" | "partial-terms";
    matchedTerms: string[];
    queryTermCount: number;
  };
};

export type ConversationSearchResult = {
  returned: number;
  truncated: boolean;
  hits: ConversationSearchHit[];
};
