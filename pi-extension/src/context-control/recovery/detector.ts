import type { ContextControlSource, EvidenceNeed } from "../core/types.js";

const HISTORICAL_CUE =
  /\b(?:earlier|previous|prior|last\s+(?:run|session|branch|time)|before|historical|from\s+(?:the\s+)?(?:other|previous)\s+branch|what\s+did\s+we\s+(?:find|read|run))\b/i;
const EXACT_CUE = /\b(?:exact|verbatim|quote|quoted|precise|line|command|output|checksum|hash)\b/i;
const CURRENT_ONLY_CUE = /\b(?:now|currently|current|latest|implement|write|change|edit|add|remove|fix)\b/i;
const TERM_SPLIT = /[^a-z0-9_./:-]+/gi;
const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "from",
  "with",
  "what",
  "did",
  "find",
  "read",
  "run",
  "earlier",
  "previous",
  "prior",
  "last",
  "time",
  "branch",
  "session",
  "other",
  "exact",
  "quote",
  "output",
]);

export type EvidenceNeedDetection = {
  status: "candidate" | "none";
  need?: EvidenceNeed;
  reason: string;
};

export function isHistoricalEvidencePrompt(prompt: unknown): prompt is string {
  return typeof prompt === "string" && prompt.trim() !== "" && HISTORICAL_CUE.test(prompt.trim());
}

function terms(value: string): string[] {
  return [
    ...new Set(
      value
        .toLowerCase()
        .split(TERM_SPLIT)
        .map((term) => term.trim())
        .filter((term) => term.length > 1),
    ),
  ];
}

function sourceSearchText(source: ContextControlSource): string {
  return `${source.path ?? ""} ${source.command ?? ""} ${source.toolName} ${source.content}`.toLowerCase();
}

export function detectExplicitEvidenceNeed(
  prompt: unknown,
  sources: readonly ContextControlSource[],
): EvidenceNeedDetection {
  if (typeof prompt !== "string" || prompt.trim() === "") return { status: "none", reason: "prompt-unavailable" };
  const text = prompt.trim();
  if (!HISTORICAL_CUE.test(text) || (CURRENT_ONLY_CUE.test(text) && !EXACT_CUE.test(text))) {
    return { status: "none", reason: "no-explicit-historical-gap" };
  }
  const queryTerms = terms(text).filter((term) => !STOP_WORDS.has(term) && term.length >= 3);
  if (queryTerms.length === 0) return { status: "none", reason: "no-source-specific-terms" };
  const matching = sources.filter((source) => {
    if (!source.consumed || !source.metadataComplete) return false;
    const haystack = sourceSearchText(source);
    return queryTerms.some((term) => haystack.includes(term));
  });
  if (matching.length === 0) return { status: "none", reason: "no-hidden-source-match" };
  const exactRequired = EXACT_CUE.test(text);
  return {
    status: "candidate",
    need: {
      text,
      ...(exactRequired ? { exactRequired: true } : {}),
      role: /\b(?:test|tests|suite|verification|verify|pass(?:ed|ing)?)\b/i.test(text)
        ? "verification-output"
        : "source-content",
      temporal: "historical",
    },
    reason: "explicit-historical-gap-with-source-match",
  };
}
