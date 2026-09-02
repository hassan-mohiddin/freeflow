import type { ContextControlGenericSearchSource, ContextControlGenericSearchTier } from "../core/source-registry.js";
import type { EvidenceNeed } from "../core/types.js";
import { isContextControlToolName } from "../sources/types.js";
import { rankMatchingPassages, type RankedContextPassage } from "../search/ranking.js";
import { normalizeText, tokenize, unique } from "../search/passages.js";
import { normalizeEvidenceNeed, type NormalizedEvidenceNeed } from "./evidence-need.js";
import { TIERED_SEARCH_AMBIGUITY_MARGIN, TIERED_SEARCH_SCOPE_PRIORS } from "./tiered-search.js";

const GENERIC_KINDS = ["user", "assistant", "toolResult", "summary"] as const;
const DEFAULT_GENERIC_KINDS = ["user", "assistant", "summary"] as const;
const TIER_RANK: Readonly<Record<ContextControlGenericSearchTier, number>> = Object.freeze({
  "active-branch": 0,
  "current-session": 1,
  lineage: 2,
  "cross-session": 3,
});
const MATCH_CLASS_RANK: Readonly<Record<GenericRecoveryMatchClass, number>> = Object.freeze({
  exact: 4,
  "strong-structured": 3,
  "strong-lexical": 2,
  weak: 1,
});
const EXACT_MATCH_CLASSES = new Set<GenericRecoveryMatchClass>(["exact", "strong-structured"]);

type GenericRecoveryMatchClass = "exact" | "strong-structured" | "strong-lexical" | "weak";

type GenericRecoveryCandidate = {
  descriptor: ContextControlGenericSearchSource;
  passage: RankedContextPassage;
  intrinsicScore: number;
  scopePrior: number;
  combinedScore: number;
  matchClass: GenericRecoveryMatchClass;
  matchedIdentifiers: readonly string[];
};

export type GenericRecoveryResolution =
  | { status: "selected"; candidate: GenericRecoveryCandidate }
  | {
      status: "selected-set";
      candidates: readonly GenericRecoveryCandidate[];
      coverage: readonly ({ key: string; sourceRef: string } | { side: "before" | "after"; sourceRef: string })[];
    }
  | { status: "ambiguous"; candidates: readonly GenericRecoveryCandidate[] }
  | { status: "unavailable"; reason: string };

export type GenericRecoverySearchResult = {
  need: NormalizedEvidenceNeed;
  resolution: GenericRecoveryResolution;
};

function sourceToolName(source: ContextControlGenericSearchSource): string {
  return source.source.source.message?.toolName ?? source.source.source.source.toolName ?? "unknown";
}

function sourceSearchText(source: ContextControlGenericSearchSource): string {
  const identity = source.source.source.source;
  return [source.source.text, identity.entryId, identity.toolCallId, identity.toolName, source.role, ...source.temporal]
    .filter((value): value is string => typeof value === "string" && value.trim() !== "")
    .join("\n");
}

function sourceKinds(need: NormalizedEvidenceNeed): readonly string[] {
  if (need.scope?.kinds !== undefined) return need.scope.kinds;
  return need.scope?.toolNames === undefined ? DEFAULT_GENERIC_KINDS : GENERIC_KINDS;
}

function sourceMatchesScope(
  source: ContextControlGenericSearchSource,
  need: NormalizedEvidenceNeed,
  currentSessionId: string,
  activeBranchId: string,
  configuredMaxTier: ContextControlGenericSearchTier,
): boolean {
  const requestedMaxTier = need.scope?.maxTier ?? configuredMaxTier;
  if (TIER_RANK[source.tier] > TIER_RANK[requestedMaxTier]) return false;
  if (need.scope?.session === "current" && source.sessionId !== currentSessionId) return false;
  if (need.scope?.branch === "active" && source.branchId !== activeBranchId) return false;
  if (!sourceKinds(need).includes(source.source.kind)) return false;
  if (need.scope?.toolNames !== undefined) {
    const toolName = sourceToolName(source).toLocaleLowerCase();
    if (!need.scope.toolNames.some((name) => name.toLocaleLowerCase() === toolName)) return false;
  }
  if (need.intent?.role !== undefined && source.role !== need.intent.role) return false;
  if (need.intent?.temporal !== undefined && !source.temporal.includes(need.intent.temporal)) return false;
  if (source.privacy !== "allowed" || source.integrity !== "valid" || source.freshness !== "current") return false;
  if (source.source.kind === "toolResult" && isContextControlToolName(sourceToolName(source))) return false;
  return true;
}

function matchedIdentifiers(source: ContextControlGenericSearchSource, need: NormalizedEvidenceNeed): string[] {
  const identifiers = need.identifiers ?? [];
  if (identifiers.length === 0) return [];
  const identity = source.source.source.source;
  const values = [source.source.ref, identity.entryId, identity.toolCallId, identity.toolName, source.source.text]
    .filter((value): value is string => typeof value === "string")
    .map((value) => normalizeText(value));
  return identifiers.filter((identifier) => {
    const normalized = normalizeText(identifier);
    return values.some((value) => value === normalized || value.includes(normalized));
  });
}

function candidateFor(
  source: ContextControlGenericSearchSource,
  need: NormalizedEvidenceNeed,
): GenericRecoveryCandidate | undefined {
  const query = [need.text, need.expectedEvidence, ...(need.identifiers ?? [])]
    .filter((value): value is string => value !== undefined)
    .join(" ");
  const searchable = { ...source.source, text: sourceSearchText(source) };
  const passage = rankMatchingPassages([searchable], query)[0];
  if (passage === undefined) return undefined;
  const queryTerms = unique(tokenize(query));
  const identifiers = matchedIdentifiers(source, need);
  const exactMetadata =
    need.expectedEvidence !== undefined && normalizeText(source.source.text) === normalizeText(need.expectedEvidence);
  const roleMatch = need.intent?.role === undefined || source.role === need.intent.role;
  const temporalMatch = need.intent?.temporal === undefined || source.temporal.includes(need.intent.temporal);
  const intrinsicScore =
    passage.score +
    identifiers.length * 20 +
    (exactMetadata ? 10 : 0) +
    (roleMatch && need.intent?.role !== undefined ? 6 : 0) +
    (temporalMatch && need.intent?.temporal !== undefined ? 6 : 0);
  if (intrinsicScore <= 0) return undefined;
  const matchClass: GenericRecoveryMatchClass =
    passage.exactPhrase || exactMetadata
      ? "exact"
      : identifiers.length > 0 || (roleMatch && temporalMatch && passage.matchedTerms.length >= 2)
        ? "strong-structured"
        : passage.matchedTerms.length >= Math.max(2, Math.ceil(queryTerms.length / 2))
          ? "strong-lexical"
          : "weak";
  const scopePrior = TIERED_SEARCH_SCOPE_PRIORS[source.tier];
  return {
    descriptor: source,
    passage,
    intrinsicScore,
    scopePrior,
    combinedScore: intrinsicScore + scopePrior,
    matchClass,
    matchedIdentifiers: Object.freeze(identifiers),
  };
}

function compareCandidates(left: GenericRecoveryCandidate, right: GenericRecoveryCandidate): number {
  return (
    right.intrinsicScore - left.intrinsicScore ||
    MATCH_CLASS_RANK[right.matchClass] - MATCH_CLASS_RANK[left.matchClass] ||
    right.scopePrior - left.scopePrior ||
    left.descriptor.source.position - right.descriptor.source.position ||
    left.descriptor.source.ref.localeCompare(right.descriptor.source.ref)
  );
}

function ambiguous(ranked: readonly GenericRecoveryCandidate[]): GenericRecoveryResolution {
  return { status: "ambiguous", candidates: Object.freeze(ranked.slice(0, 8)) };
}

function selectSingle(
  need: NormalizedEvidenceNeed,
  ranked: readonly GenericRecoveryCandidate[],
): GenericRecoveryResolution {
  if (ranked.length === 0) return { status: "unavailable", reason: "no-eligible-match" };
  const top = ranked[0];
  const runner = ranked[1];
  if (top.matchClass === "weak") return { status: "unavailable", reason: "weak-match-unavailable" };
  if (need.exactRequired === true && !EXACT_MATCH_CLASSES.has(top.matchClass)) {
    return { status: "unavailable", reason: "exact-match-unavailable" };
  }
  if (need.exactRequired === true && top.descriptor.completeness !== "complete") {
    return { status: "unavailable", reason: "partial-exact-evidence" };
  }
  if (runner !== undefined) {
    const margin = top.combinedScore - runner.combinedScore;
    if (
      runner.matchClass !== "weak" &&
      (margin <= TIERED_SEARCH_AMBIGUITY_MARGIN || top.combinedScore === runner.combinedScore)
    ) {
      return ambiguous(ranked);
    }
  }
  return { status: "selected", candidate: top };
}

function selectSet(
  need: NormalizedEvidenceNeed,
  ranked: readonly GenericRecoveryCandidate[],
): GenericRecoveryResolution {
  const cardinality = need.cardinality;
  if (cardinality === undefined || cardinality.kind === "single") return selectSingle(need, ranked);
  if (ranked.length === 0) return { status: "unavailable", reason: "set-coverage-incomplete" };
  const selected: GenericRecoveryCandidate[] = [];
  const coverage: ({ key: string; sourceRef: string } | { side: "before" | "after"; sourceRef: string })[] = [];
  if (cardinality.kind === "comparison") {
    const before = ranked.filter((candidate) =>
      candidate.descriptor.temporal.some((value) => value === "historical" || value === "before-change"),
    );
    const after = ranked.filter((candidate) =>
      candidate.descriptor.temporal.some((value) => value === "current" || value === "after-change"),
    );
    if (before.length === 0 || after.length === 0)
      return { status: "unavailable", reason: "comparison-coverage-incomplete" };
    const beforeCandidate = before[0];
    const afterCandidate = after.find(
      (candidate) => candidate.descriptor.source.ref !== beforeCandidate.descriptor.source.ref,
    );
    if (afterCandidate === undefined) return { status: "unavailable", reason: "comparison-coverage-incomplete" };
    if (beforeCandidate.matchClass === "weak" || afterCandidate.matchClass === "weak") {
      return { status: "unavailable", reason: "weak-match-unavailable" };
    }
    if (
      (before[1] !== undefined && beforeCandidate.combinedScore === before[1].combinedScore) ||
      (after[1] !== undefined && afterCandidate.combinedScore === after[1].combinedScore)
    ) {
      return ambiguous([...before, ...after]);
    }
    selected.push(beforeCandidate, afterCandidate);
    coverage.push(
      { side: "before", sourceRef: beforeCandidate.descriptor.source.ref },
      { side: "after", sourceRef: afterCandidate.descriptor.source.ref },
    );
  } else if ((need.identifiers?.length ?? 0) > 0) {
    for (const identifier of need.identifiers ?? []) {
      const matches = ranked.filter(
        (candidate) =>
          candidate.matchedIdentifiers.some((value) => normalizeText(value) === normalizeText(identifier)) &&
          !selected.some((item) => item.descriptor.source.ref === candidate.descriptor.source.ref),
      );
      if (matches.length === 0) return { status: "unavailable", reason: "set-coverage-incomplete" };
      if (matches[0].matchClass === "weak") return { status: "unavailable", reason: "weak-match-unavailable" };
      if (matches[1] !== undefined && matches[0].combinedScore === matches[1].combinedScore) return ambiguous(matches);
      selected.push(matches[0]);
      coverage.push({ key: identifier, sourceRef: matches[0].descriptor.source.ref });
    }
  } else {
    if (ranked.length < 2) return { status: "unavailable", reason: "set-coverage-incomplete" };
    selected.push(...ranked.slice(0, cardinality.maxSources));
    if (selected.some((candidate) => candidate.matchClass === "weak")) {
      return { status: "unavailable", reason: "weak-match-unavailable" };
    }
    coverage.push(
      ...selected.map((candidate) => ({
        key: candidate.descriptor.source.ref,
        sourceRef: candidate.descriptor.source.ref,
      })),
    );
  }
  if (selected.length === 0 || selected.length > cardinality.maxSources) {
    return { status: "unavailable", reason: "set-coverage-incomplete" };
  }
  if (need.exactRequired === true && selected.some((candidate) => !EXACT_MATCH_CLASSES.has(candidate.matchClass))) {
    return { status: "unavailable", reason: "exact-match-unavailable" };
  }
  if (need.exactRequired === true && selected.some((candidate) => candidate.descriptor.completeness !== "complete")) {
    return { status: "unavailable", reason: "partial-exact-evidence" };
  }
  return { status: "selected-set", candidates: Object.freeze(selected), coverage: Object.freeze(coverage) };
}

export function resolveGenericRecovery(
  needValue: EvidenceNeed,
  sources: readonly ContextControlGenericSearchSource[],
  currentSessionId: string,
  activeBranchId: string,
  configuredMaxTier: ContextControlGenericSearchTier,
): GenericRecoverySearchResult {
  const normalized = normalizeEvidenceNeed(needValue) as NormalizedEvidenceNeed;
  const ranked = sources
    .filter((source) => sourceMatchesScope(source, normalized, currentSessionId, activeBranchId, configuredMaxTier))
    .map((source) => candidateFor(source, normalized))
    .filter((candidate): candidate is GenericRecoveryCandidate => candidate !== undefined)
    .sort(compareCandidates);
  return { need: normalized, resolution: selectSet(normalized, ranked) };
}
