import {
  EVIDENCE_SCOPE_TIERS,
  type EvidenceScopeTier,
  type ScopeCatalog,
  type ScopeCatalogSource,
} from "./scope-catalog.js";
import { normalizeEvidenceNeed, type NormalizedEvidenceNeed } from "./evidence-need.js";

export const TIERED_SEARCH_VERSION = "0.1" as const;
export const TIERED_SEARCH_DEFAULT_TOP_K = 3;
export const TIERED_SEARCH_DEFAULT_MAX_CANDIDATES = 8;
export const TIERED_SEARCH_AMBIGUITY_MARGIN = 2;
export const TIERED_SEARCH_SCOPE_PRIORS: Readonly<Record<EvidenceScopeTier, number>> = Object.freeze({
  "active-branch": 2,
  "current-session": 1,
  lineage: 0,
  "cross-session": -1,
});

export const TIERED_SEARCH_MATCH_CLASSES = ["exact", "strong-structured", "strong-lexical", "weak"] as const;
export type TieredSearchMatchClass = (typeof TIERED_SEARCH_MATCH_CLASSES)[number];
export type TieredSearchConfidence = "high" | "medium" | "low";

export interface TieredSearchOptions {
  readonly topKPerTier?: number;
  readonly maxCandidates?: number;
}

export interface TieredSearchCandidateAssessment {
  readonly source: Readonly<ScopeCatalogSource>;
  readonly intrinsicScore: number;
  readonly scopePrior: number;
  readonly combinedScore: number;
  readonly matchClass: TieredSearchMatchClass;
  readonly confidence: TieredSearchConfidence;
  readonly signals: readonly string[];
  readonly matchedIdentifiers: readonly string[];
}

export interface TieredSearchCandidateCard {
  readonly ref: string;
  readonly identity: Readonly<ScopeCatalogSource["identity"]>;
  readonly tier: EvidenceScopeTier;
  readonly relation: ScopeCatalogSource["relation"];
  readonly toolName: string;
  readonly locator?: string;
  readonly role: ScopeCatalogSource["role"];
  readonly temporal: readonly ScopeCatalogSource["temporal"][number][];
  readonly characters: number;
  readonly completeness: ScopeCatalogSource["completeness"];
  readonly freshness: "current";
  readonly confidence: TieredSearchConfidence;
  readonly matchClass: TieredSearchMatchClass;
  readonly signals: readonly string[];
  readonly equivalentRefs?: readonly string[];
}

export type TieredSearchCoverage =
  | { readonly key: string; readonly sourceRef: string }
  | { readonly side: "before" | "after"; readonly sourceRef: string };

export type TieredSearchResolution =
  | {
      readonly status: "selected";
      readonly source: Readonly<ScopeCatalogSource>;
      readonly card: TieredSearchCandidateCard;
    }
  | {
      readonly status: "selected-set";
      readonly sources: readonly Readonly<ScopeCatalogSource>[];
      readonly cards: readonly TieredSearchCandidateCard[];
      readonly coverage: readonly TieredSearchCoverage[];
    }
  | {
      readonly status: "ambiguous";
      readonly candidates: readonly TieredSearchCandidateCard[];
    }
  | {
      readonly status: "unavailable";
      readonly reason: string;
    };

export interface TieredSearchAuditEntry {
  readonly ref: string;
  readonly tier: EvidenceScopeTier;
  readonly intrinsicScore: number;
  readonly scopePrior: number;
  readonly combinedScore: number;
  readonly matchClass: TieredSearchMatchClass;
  readonly confidence: TieredSearchConfidence;
  readonly signals: readonly string[];
}

export interface TieredSearchResult {
  readonly version: typeof TIERED_SEARCH_VERSION;
  readonly need: NormalizedEvidenceNeed;
  readonly searchedTiers: readonly EvidenceScopeTier[];
  readonly perTierTopRefs: Partial<Record<EvidenceScopeTier, readonly string[]>>;
  readonly perTierCandidateCounts: Partial<Record<EvidenceScopeTier, number>>;
  readonly candidates: readonly TieredSearchCandidateCard[];
  readonly resolution: TieredSearchResolution;
  readonly audit: {
    readonly ranked: readonly TieredSearchAuditEntry[];
  };
}

export class TieredSearchError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TieredSearchError";
  }
}

const TOKEN_PATTERN = /[\p{L}\p{N}_]+(?:[./:@#$%+-][\p{L}\p{N}_]+)*/gu;
const MATCH_CLASS_RANK: Readonly<Record<TieredSearchMatchClass, number>> = Object.freeze({
  exact: 4,
  "strong-structured": 3,
  "strong-lexical": 2,
  weak: 1,
});
const STRONG_MATCH_CLASSES = new Set<TieredSearchMatchClass>(["exact", "strong-structured", "strong-lexical"]);

type ScoredCandidate = TieredSearchCandidateAssessment & {
  readonly metadataTerms: readonly string[];
  readonly locatorTerms: readonly string[];
  readonly provenanceTerms: readonly string[];
};

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim();
}

function terms(value: string): readonly string[] {
  const values = new Set<string>();
  for (const term of normalize(value).match(TOKEN_PATTERN) ?? []) {
    values.add(term);
    for (const part of term.split(/[_./:@#$%+-]+/u)) if (part !== "") values.add(part);
  }
  return Object.freeze([...values]);
}

function cloneSource(source: ScopeCatalogSource): Readonly<ScopeCatalogSource> {
  return Object.freeze({
    ...source,
    identity: Object.freeze({ ...source.identity }),
    temporal: Object.freeze([...source.temporal]),
    ...(source.provenance === undefined
      ? {}
      : {
          provenance: Object.freeze(
            source.provenance.map((item) =>
              Object.freeze({
                ...item,
                ...(item.replacement === undefined ? {} : { replacement: Object.freeze({ ...item.replacement }) }),
              }),
            ),
          ),
        }),
    ...(source.equivalentRefs === undefined ? {} : { equivalentRefs: Object.freeze([...source.equivalentRefs]) }),
  });
}

function candidateCard(candidate: ScoredCandidate): TieredSearchCandidateCard {
  const source = candidate.source;
  return Object.freeze({
    ref: source.ref,
    identity: Object.freeze({ ...source.identity }),
    tier: source.tier,
    relation: source.relation,
    toolName: source.toolName,
    ...(source.locator === undefined ? {} : { locator: source.locator }),
    role: source.role,
    temporal: Object.freeze([...source.temporal]),
    characters: source.characters,
    completeness: source.completeness,
    freshness: source.freshness,
    confidence: candidate.confidence,
    matchClass: candidate.matchClass,
    signals: Object.freeze([...candidate.signals]),
    ...(source.equivalentRefs === undefined ? {} : { equivalentRefs: Object.freeze([...source.equivalentRefs]) }),
  });
}

function auditEntry(candidate: ScoredCandidate): TieredSearchAuditEntry {
  return Object.freeze({
    ref: candidate.source.ref,
    tier: candidate.source.tier,
    intrinsicScore: candidate.intrinsicScore,
    scopePrior: candidate.scopePrior,
    combinedScore: candidate.combinedScore,
    matchClass: candidate.matchClass,
    confidence: candidate.confidence,
    signals: Object.freeze([...candidate.signals]),
  });
}

function metadataValues(source: ScopeCatalogSource): readonly string[] {
  return Object.freeze([
    source.ref,
    source.identity.sessionId,
    source.identity.entryId,
    ...(source.identity.toolCallId === undefined ? [] : [source.identity.toolCallId]),
    source.sessionId,
    source.branchId,
    source.toolName,
    ...(source.locator === undefined ? [] : [source.locator]),
    source.role,
    ...source.temporal,
    source.contentHash,
    ...(source.provenance === undefined
      ? []
      : source.provenance.flatMap((item) => [
          item.rule,
          item.commandKind,
          String(item.sourceTurn),
          ...(item.replacement === undefined ? [] : [item.replacement.sessionId, item.replacement.entryId]),
        ])),
    ...(source.equivalentRefs ?? []),
  ]);
}

function sourceMatchesNeed(source: ScopeCatalogSource, need: NormalizedEvidenceNeed, catalog: ScopeCatalog): boolean {
  if (need.scope?.session === "current" && source.sessionId !== catalog.policy.currentSessionId) return false;
  if (need.scope?.branch === "active" && source.branchId !== catalog.policy.activeBranchId) return false;
  if (need.scope?.kinds !== undefined && !need.scope.kinds.includes("toolResult")) return false;
  if (
    need.scope?.toolNames !== undefined &&
    !need.scope.toolNames.some((name) => normalize(name) === normalize(source.toolName))
  )
    return false;
  if (need.intent?.role !== undefined && need.intent.role !== source.role) return false;
  if (need.intent?.temporal !== undefined && !source.temporal.includes(need.intent.temporal)) return false;
  return true;
}

function scoreSource(
  source: ScopeCatalogSource,
  need: NormalizedEvidenceNeed,
  catalog: ScopeCatalog,
): ScoredCandidate | undefined {
  if (!sourceMatchesNeed(source, need, catalog)) return undefined;
  const allMetadata = metadataValues(source);
  const metadataTerms = terms(allMetadata.join("\n"));
  const sourceTermSet = new Set(metadataTerms);
  const needTerms = terms(
    [need.text, need.expectedEvidence, ...(need.identifiers ?? [])]
      .filter((value): value is string => value !== undefined)
      .join("\n"),
  );
  const matchedTerms = needTerms.filter((term) => sourceTermSet.has(term));
  const locatorTerms = needTerms.filter((term) => terms(source.locator ?? "").includes(term));
  const provenanceTerms = needTerms.filter((term) =>
    (source.provenance ?? []).some((item) => terms(item.rule).includes(term) || terms(item.commandKind).includes(term)),
  );
  const metadataIdentifiers = new Set(
    [source.ref, source.identity.entryId, source.identity.toolCallId, source.locator]
      .filter((value): value is string => value !== undefined)
      .map(normalize),
  );
  const matchedIdentifiers = (need.identifiers ?? []).filter(
    (identifier) =>
      metadataIdentifiers.has(normalize(identifier)) ||
      allMetadata.some((value) => normalize(value) === normalize(identifier)),
  );
  const roleMatch = need.intent?.role === undefined || need.intent.role === source.role;
  const temporalMatch = need.intent?.temporal === undefined || source.temporal.includes(need.intent.temporal);
  const exactMetadata =
    matchedIdentifiers.length > 0 ||
    (need.expectedEvidence !== undefined &&
      allMetadata.some((value) => normalize(value) === normalize(need.expectedEvidence as string)));
  const intrinsicScore =
    matchedIdentifiers.length * 20 +
    (exactMetadata ? 10 : 0) +
    (roleMatch && need.intent?.role !== undefined ? 6 : 0) +
    (temporalMatch && need.intent?.temporal !== undefined ? 6 : 0) +
    locatorTerms.length * 4 +
    provenanceTerms.length * 4 +
    matchedTerms.length;
  if (intrinsicScore <= 0) return undefined;
  const matchClass: TieredSearchMatchClass = exactMetadata
    ? "exact"
    : roleMatch && temporalMatch && (locatorTerms.length > 0 || provenanceTerms.length > 0)
      ? "strong-structured"
      : locatorTerms.length > 0 || matchedTerms.length >= 2
        ? "strong-lexical"
        : "weak";
  const confidence: TieredSearchConfidence =
    matchClass === "exact" || matchClass === "strong-structured"
      ? "high"
      : matchClass === "strong-lexical"
        ? "medium"
        : "low";
  const signals = [
    ...(matchedIdentifiers.length === 0 ? [] : [`identifier-match:${matchedIdentifiers.length}`]),
    ...(need.intent?.role === undefined ? [] : [`role:${need.intent.role}`]),
    ...(need.intent?.temporal === undefined ? [] : [`temporal:${need.intent.temporal}`]),
    ...(locatorTerms.length === 0 ? [] : [`locator-match:${locatorTerms.length}`]),
    ...(provenanceTerms.length === 0 ? [] : [`provenance-match:${provenanceTerms.length}`]),
    ...(matchedTerms.length === 0 ? [] : [`metadata-terms:${matchedTerms.length}`]),
  ];
  const scopePrior = TIERED_SEARCH_SCOPE_PRIORS[source.tier];
  return {
    source: cloneSource(source),
    intrinsicScore,
    scopePrior,
    combinedScore: intrinsicScore + scopePrior,
    matchClass,
    confidence,
    signals: Object.freeze(signals),
    matchedIdentifiers: Object.freeze(matchedIdentifiers),
    metadataTerms,
    locatorTerms: Object.freeze(locatorTerms),
    provenanceTerms: Object.freeze(provenanceTerms),
  };
}

function compareIntrinsic(left: ScoredCandidate, right: ScoredCandidate): number {
  return (
    right.intrinsicScore - left.intrinsicScore ||
    MATCH_CLASS_RANK[right.matchClass] - MATCH_CLASS_RANK[left.matchClass] ||
    left.source.sequence - right.source.sequence ||
    left.source.ref.localeCompare(right.source.ref)
  );
}

function compareGlobal(left: ScoredCandidate, right: ScoredCandidate): number {
  return (
    right.combinedScore - left.combinedScore ||
    right.intrinsicScore - left.intrinsicScore ||
    MATCH_CLASS_RANK[right.matchClass] - MATCH_CLASS_RANK[left.matchClass] ||
    right.scopePrior - left.scopePrior ||
    left.source.sequence - right.source.sequence ||
    left.source.ref.localeCompare(right.source.ref)
  );
}

function ambiguousResolution(ranked: readonly ScoredCandidate[]): TieredSearchResolution {
  return Object.freeze({
    status: "ambiguous",
    candidates: Object.freeze(ranked.slice(0, TIERED_SEARCH_DEFAULT_MAX_CANDIDATES).map(candidateCard)),
  });
}

function selectSingle(ranked: readonly ScoredCandidate[]): TieredSearchResolution {
  if (ranked.length === 0) return Object.freeze({ status: "unavailable", reason: "no-eligible-match" });
  const top = ranked[0];
  const runnerUp = ranked[1];
  if (runnerUp !== undefined) {
    const margin = top.combinedScore - runnerUp.combinedScore;
    if (
      top.combinedScore === runnerUp.combinedScore ||
      (STRONG_MATCH_CLASSES.has(top.matchClass) &&
        STRONG_MATCH_CLASSES.has(runnerUp.matchClass) &&
        margin <= TIERED_SEARCH_AMBIGUITY_MARGIN)
    )
      return ambiguousResolution(ranked);
  }
  return Object.freeze({ status: "selected", source: cloneSource(top.source), card: candidateCard(top) });
}

function selectSet(need: NormalizedEvidenceNeed, ranked: readonly ScoredCandidate[]): TieredSearchResolution {
  const cardinality = need.cardinality;
  if (cardinality === undefined || cardinality.kind === "single") return selectSingle(ranked);
  if (ranked.length === 0) return Object.freeze({ status: "unavailable", reason: "set-coverage-incomplete" });
  const maxSources = cardinality.maxSources;
  if (cardinality.kind === "comparison") return selectComparison(maxSources, ranked);

  const identifiers = need.identifiers ?? [];
  if (identifiers.length > maxSources)
    return Object.freeze({ status: "unavailable", reason: "set-coverage-exceeds-limit" });
  const selected: ScoredCandidate[] = [];
  const coverage: TieredSearchCoverage[] = [];
  if (identifiers.length > 0) {
    for (const identifier of identifiers) {
      const matches = ranked.filter(
        (candidate) =>
          candidate.matchedIdentifiers.some((value) => normalize(value) === normalize(identifier)) &&
          !selected.some((item) => item.source.ref === candidate.source.ref),
      );
      if (matches.length === 0) return Object.freeze({ status: "unavailable", reason: "set-coverage-incomplete" });
      const [best, second] = matches;
      if (second !== undefined && best.combinedScore === second.combinedScore) return ambiguousResolution(matches);
      selected.push(best);
      coverage.push({ key: identifier, sourceRef: best.source.ref });
    }
  } else {
    if (ranked.length < 2) return Object.freeze({ status: "unavailable", reason: "set-coverage-incomplete" });
    selected.push(...ranked.slice(0, maxSources));
    coverage.push(
      ...selected.map((candidate) => ({
        key: candidate.source.locator ?? candidate.source.ref,
        sourceRef: candidate.source.ref,
      })),
    );
  }
  if (selected.length === 0 || selected.length > maxSources)
    return Object.freeze({ status: "unavailable", reason: "set-coverage-incomplete" });
  return Object.freeze({
    status: "selected-set",
    sources: Object.freeze(selected.map((candidate) => cloneSource(candidate.source))),
    cards: Object.freeze(selected.map(candidateCard)),
    coverage: Object.freeze(coverage),
  });
}

function selectComparison(maxSources: number, ranked: readonly ScoredCandidate[]): TieredSearchResolution {
  if (maxSources < 2) return Object.freeze({ status: "unavailable", reason: "comparison-limit-too-small" });
  const before = ranked.filter(
    (candidate) =>
      candidate.source.temporal.includes("historical") || candidate.source.temporal.includes("before-change"),
  );
  const after = ranked.filter(
    (candidate) => candidate.source.temporal.includes("current") || candidate.source.temporal.includes("after-change"),
  );
  if (before.length === 0 || after.length === 0)
    return Object.freeze({ status: "unavailable", reason: "comparison-coverage-incomplete" });
  const beforeCandidate = before[0];
  const afterCandidate = after.find((candidate) => candidate.source.ref !== beforeCandidate.source.ref);
  if (afterCandidate === undefined)
    return Object.freeze({ status: "unavailable", reason: "comparison-coverage-incomplete" });
  if (before[1] !== undefined && beforeCandidate.combinedScore === before[1].combinedScore)
    return ambiguousResolution(before);
  if (after[1] !== undefined && after[0].combinedScore === after[1].combinedScore) return ambiguousResolution(after);
  return Object.freeze({
    status: "selected-set",
    sources: Object.freeze([cloneSource(beforeCandidate.source), cloneSource(afterCandidate.source)]),
    cards: Object.freeze([candidateCard(beforeCandidate), candidateCard(afterCandidate)]),
    coverage: Object.freeze([
      { side: "before" as const, sourceRef: beforeCandidate.source.ref },
      { side: "after" as const, sourceRef: afterCandidate.source.ref },
    ]),
  });
}

function validateSearchOptions(options: TieredSearchOptions): { topKPerTier: number; maxCandidates: number } {
  const topKPerTier = options.topKPerTier ?? TIERED_SEARCH_DEFAULT_TOP_K;
  const maxCandidates = options.maxCandidates ?? TIERED_SEARCH_DEFAULT_MAX_CANDIDATES;
  if (!Number.isSafeInteger(topKPerTier) || topKPerTier < 1 || topKPerTier > 32)
    throw new TieredSearchError("invalid-top-k", "topKPerTier must be an integer from 1 through 32");
  if (!Number.isSafeInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 128)
    throw new TieredSearchError("invalid-max-candidates", "maxCandidates must be an integer from 1 through 128");
  return { topKPerTier, maxCandidates };
}

export function searchTieredEvidence(
  needValue: unknown,
  catalog: ScopeCatalog,
  options: TieredSearchOptions = {},
): TieredSearchResult {
  const need = normalizeEvidenceNeed(needValue);
  const { topKPerTier, maxCandidates } = validateSearchOptions(options);
  const searchedTiers = EVIDENCE_SCOPE_TIERS.filter((tier) => {
    const order = EVIDENCE_SCOPE_TIERS.indexOf(tier);
    return order <= EVIDENCE_SCOPE_TIERS.indexOf(catalog.policy.maxTier);
  });
  const perTierTopRefs: Partial<Record<EvidenceScopeTier, readonly string[]>> = {};
  const perTierCandidateCounts: Partial<Record<EvidenceScopeTier, number>> = {};
  const rankedByTier: ScoredCandidate[] = [];
  for (const tier of searchedTiers) {
    const tierCandidates = catalog.sources
      .filter((source) => source.tier === tier)
      .map((source) => scoreSource(source, need, catalog))
      .filter((candidate): candidate is ScoredCandidate => candidate !== undefined)
      .sort(compareIntrinsic);
    const top = tierCandidates.slice(0, topKPerTier);
    perTierCandidateCounts[tier] = tierCandidates.length;
    perTierTopRefs[tier] = Object.freeze(top.map((candidate) => candidate.source.ref));
    rankedByTier.push(...top);
  }
  const ranked = rankedByTier.sort(compareGlobal);
  const resolution = selectSet(need, ranked);
  const candidates = Object.freeze(ranked.slice(0, maxCandidates).map(candidateCard));
  return Object.freeze({
    version: TIERED_SEARCH_VERSION,
    need,
    searchedTiers: Object.freeze([...searchedTiers]),
    perTierTopRefs: Object.freeze(perTierTopRefs),
    perTierCandidateCounts: Object.freeze(perTierCandidateCounts),
    candidates,
    resolution,
    audit: Object.freeze({ ranked: Object.freeze(ranked.slice(0, maxCandidates).map(auditEntry)) }),
  });
}
