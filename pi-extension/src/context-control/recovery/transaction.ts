import type { SourceIdentity } from "../core/types.js";
import { stableJson } from "../core/stable-json.js";
import {
  parseRecoveryProposal,
  validateRecoveryProposalDecision,
  type RecoveryCandidateCard,
  type RecoveryEvidenceNeed,
  type RecoveryProposalEnvelope,
  type RecoveryProposalValidationContext,
  type ValidatedRecoveryDecision,
} from "../interfaces/recovery-proposal.js";
import {
  EVIDENCE_SCOPE_TIERS,
  type EvidenceScopeTier,
  type ScopeCatalog,
  type ScopeCatalogSource,
} from "./scope-catalog.js";
import { normalizeEvidenceNeed } from "./evidence-need.js";
import {
  searchTieredEvidence,
  type TieredSearchCandidateCard,
  type TieredSearchCoverage,
  type TieredSearchResolution,
  type TieredSearchResult,
} from "./tiered-search.js";

export const RECOVERY_TRANSACTION_VERSION = "0.1" as const;
const HANDLE_PATTERN = /^cc-h-[a-z0-9_-]+$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const TIER_RANK: Readonly<Record<EvidenceScopeTier, number>> = Object.freeze({
  "active-branch": 0,
  "current-session": 1,
  lineage: 2,
  "cross-session": 3,
});

export interface RecoverySourceIndexEntry {
  readonly handle: string;
  readonly source: Readonly<ScopeCatalogSource>;
}

export interface RecoverySourceIndex {
  readonly version: string;
  readonly maxTier: EvidenceScopeTier;
  readonly entries: readonly RecoverySourceIndexEntry[];
}

export interface RecoveryProposalSnapshot {
  readonly proposal: RecoveryProposalEnvelope;
  readonly sourceIndexVersion: string;
  readonly entries: readonly RecoverySourceIndexEntry[];
}

export interface RecoveryExecutionContext {
  readonly checkpointId: string;
  readonly currentGeneration: number;
  readonly sourceIndex: RecoverySourceIndex;
  readonly catalog: ScopeCatalog;
  readonly interrupted?: boolean;
}

export interface RecoveryExecutionInput {
  readonly snapshot: RecoveryProposalSnapshot;
  readonly decision: unknown;
  readonly context: RecoveryExecutionContext;
}

export type RecoveryExecutionResolution =
  | {
      readonly status: "selected";
      readonly handle: string;
      readonly source: Readonly<ScopeCatalogSource>;
      readonly card: Readonly<RecoveryCandidateCard>;
    }
  | {
      readonly status: "selected-set";
      readonly handles: readonly string[];
      readonly sources: readonly Readonly<ScopeCatalogSource>[];
      readonly cards: readonly Readonly<RecoveryCandidateCard>[];
      readonly coverage: readonly TieredSearchCoverage[];
    }
  | { readonly status: "ambiguous"; readonly candidates: readonly RecoveryCandidateCard[] }
  | { readonly status: "unavailable"; readonly reason: string };

export type RecoveryExecutionResult =
  | {
      readonly status: "accepted";
      readonly proposalId: string;
      readonly action: ValidatedRecoveryDecision["action"];
      readonly presentation?: "preview" | "passage" | "full";
      readonly maxCharactersPerCandidate?: number;
      readonly need: RecoveryEvidenceNeed;
      readonly resolution: RecoveryExecutionResolution;
      readonly searchCount: number;
    }
  | {
      readonly status: "rejected";
      readonly reason: string;
      readonly proposalId: string;
      readonly searchCount: number;
    };

export interface RecoveryTransactionOptions {
  readonly maxSemanticSearches?: number;
  readonly search?: (need: RecoveryEvidenceNeed, catalog: ScopeCatalog) => TieredSearchResult;
}

export class RecoveryTransactionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RecoveryTransactionError";
  }
}

function validText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim() !== "" && value.length <= max;
}

function cloneIdentity(identity: SourceIdentity): Readonly<SourceIdentity> {
  return Object.freeze({ ...identity });
}

function cloneSource(source: ScopeCatalogSource): Readonly<ScopeCatalogSource> {
  return Object.freeze({
    ...source,
    identity: cloneIdentity(source.identity),
    temporal: Object.freeze([...source.temporal]),
    ...(source.provenance === undefined
      ? {}
      : {
          provenance: Object.freeze(
            source.provenance.map((item) =>
              Object.freeze({
                ...item,
                ...(item.replacement === undefined ? {} : { replacement: cloneIdentity(item.replacement) }),
              }),
            ),
          ),
        }),
    ...(source.equivalentRefs === undefined ? {} : { equivalentRefs: Object.freeze([...source.equivalentRefs]) }),
  });
}

function cloneCard(card: RecoveryCandidateCard): Readonly<RecoveryCandidateCard> {
  return Object.freeze({
    ...card,
    temporal: Object.freeze([...card.temporal]),
    signals: Object.freeze([...card.signals]),
    ...(card.equivalentRefs === undefined ? {} : { equivalentRefs: Object.freeze([...card.equivalentRefs]) }),
  });
}

function cloneEntry(entry: RecoverySourceIndexEntry): RecoverySourceIndexEntry {
  return Object.freeze({ handle: entry.handle, source: cloneSource(entry.source) });
}

function invalid(message: string): never {
  throw new RecoveryTransactionError("invalid-index", message);
}

function sourceSafetyReason(source: ScopeCatalogSource): string | undefined {
  if (source.freshness !== "current") return "source-stale";
  if (source.privacy !== "allowed") return "privacy-denied";
  if (source.integrity !== "valid") return "integrity-invalid";
  if (!validText(source.contentHash, 64) || !HASH_PATTERN.test(source.contentHash)) return "integrity-invalid";
  if (source.completeness !== "complete" && source.completeness !== "partial") return "source-incomplete";
  if (!Number.isSafeInteger(source.characters) || source.characters < 1) return "source-incomplete";
  return undefined;
}

function sourceCardMatches(source: ScopeCatalogSource, card: RecoveryCandidateCard): boolean {
  return (
    source.tier === card.tier &&
    source.relation === card.relation &&
    source.locator === card.locator &&
    source.role === card.role &&
    stableJson(source.temporal) === stableJson(card.temporal) &&
    source.characters === card.characters &&
    source.completeness === card.completeness &&
    ((source.equivalentRefs === undefined && card.equivalentRefs === undefined) ||
      stableJson(source.equivalentRefs ?? []) === stableJson(card.equivalentRefs ?? []))
  );
}

function sourceEquivalent(left: ScopeCatalogSource, right: ScopeCatalogSource): boolean {
  return stableJson(left) === stableJson(right);
}

function entryForHandle(index: RecoverySourceIndex, handle: string): RecoverySourceIndexEntry | undefined {
  return index.entries.find((entry) => entry.handle === handle);
}

function entryForSource(index: RecoverySourceIndex, source: ScopeCatalogSource): RecoverySourceIndexEntry | undefined {
  return index.entries.find((entry) => sourceEquivalent(entry.source, source));
}

function proposalCard(proposal: RecoveryProposalEnvelope, handle: string): Readonly<RecoveryCandidateCard> | undefined {
  const card = proposal.candidates.find((candidate) => candidate.handle === handle);
  return card === undefined ? undefined : cloneCard(card);
}

function sourceIdentityMatches(left: SourceIdentity, right: SourceIdentity): boolean {
  return stableJson(left) === stableJson(right);
}

function effectiveMaxTier(proposal: RecoveryProposalEnvelope): EvidenceScopeTier {
  return proposal.need.scope?.maxTier ?? proposal.maxTier;
}

function listContainsOnly(base: readonly string[] | undefined, requested: readonly string[] | undefined): boolean {
  if (base === undefined) return true;
  return requested !== undefined && requested.every((value) => base.includes(value));
}

function scopeWidens(proposal: RecoveryProposalEnvelope, need: RecoveryEvidenceNeed): boolean {
  const baseScope = proposal.need.scope;
  const requestedScope = need.scope;
  const baseMaxTier = effectiveMaxTier(proposal);
  const requestedMaxTier = requestedScope?.maxTier;
  if (requestedMaxTier === undefined || TIER_RANK[requestedMaxTier] > TIER_RANK[baseMaxTier]) return true;
  if (baseScope?.session === "current" && requestedScope?.session !== "current") return true;
  if (baseScope?.branch === "active" && requestedScope?.branch !== "active") return true;
  if (!listContainsOnly(baseScope?.kinds, requestedScope?.kinds)) return true;
  if (!listContainsOnly(baseScope?.toolNames, requestedScope?.toolNames)) return true;

  if (proposal.need.intent?.role !== undefined && need.intent?.role !== proposal.need.intent.role) return true;
  if (proposal.need.intent?.temporal !== undefined && need.intent?.temporal !== proposal.need.intent.temporal)
    return true;
  if (proposal.need.exactRequired === true && need.exactRequired !== true) return true;

  const baseCardinalityValue = proposal.need.cardinality;
  const requestedCardinalityValue = need.cardinality;
  const baseCardinality = baseCardinalityValue?.kind ?? "single";
  const requestedCardinality = requestedCardinalityValue?.kind ?? "single";
  if (baseCardinality !== requestedCardinality) return true;
  const baseMaxSources =
    baseCardinalityValue !== undefined && baseCardinalityValue.kind !== "single"
      ? baseCardinalityValue.maxSources
      : undefined;
  const requestedMaxSources =
    requestedCardinalityValue !== undefined && requestedCardinalityValue.kind !== "single"
      ? requestedCardinalityValue.maxSources
      : undefined;
  if (baseMaxSources !== undefined && (requestedMaxSources === undefined || requestedMaxSources > baseMaxSources))
    return true;
  return false;
}

function cardinalityFailure(need: RecoveryEvidenceNeed, handles: readonly string[]): string | undefined {
  const cardinality = need.cardinality;
  if (cardinality === undefined || cardinality.kind === "single")
    return handles.length === 1 ? undefined : "cardinality-mismatch";
  if (handles.length < 1 || handles.length > cardinality.maxSources) return "cardinality-mismatch";
  if (cardinality.kind === "comparison" && handles.length < 2) return "comparison-coverage-incomplete";
  return undefined;
}

function comparisonCoverage(
  sources: readonly Readonly<ScopeCatalogSource>[],
): readonly TieredSearchCoverage[] | undefined {
  const before = sources.find(
    (source) => source.temporal.includes("historical") || source.temporal.includes("before-change"),
  );
  const after = sources.find(
    (source) => source.temporal.includes("current") || source.temporal.includes("after-change"),
  );
  if (before === undefined || after === undefined || sourceIdentityMatches(before.identity, after.identity))
    return undefined;
  return Object.freeze([
    { side: "before" as const, sourceRef: before.ref },
    { side: "after" as const, sourceRef: after.ref },
  ]);
}

function setCoverage(sources: readonly Readonly<ScopeCatalogSource>[]): readonly TieredSearchCoverage[] {
  return Object.freeze(sources.map((source) => ({ key: source.locator ?? source.ref, sourceRef: source.ref })));
}

function snapshotMismatch(
  snapshot: RecoveryProposalSnapshot,
  index: RecoverySourceIndex,
  handles: readonly string[],
): string | undefined {
  for (const handle of handles) {
    const original = snapshot.entries.find((entry) => entry.handle === handle);
    const current = entryForHandle(index, handle);
    if (current === undefined) return "candidate-unavailable";
    if (original === undefined || !sourceEquivalent(original.source, current.source)) return "candidate-stale";
  }
  return undefined;
}

function selectedResolution(
  proposal: RecoveryProposalEnvelope,
  index: RecoverySourceIndex,
  handles: readonly string[],
  enforceCardinality: boolean,
): RecoveryExecutionResolution {
  if (enforceCardinality) {
    const cardinalityError = cardinalityFailure(proposal.need, handles);
    if (cardinalityError !== undefined) return { status: "unavailable", reason: cardinalityError };
  }

  const entries: RecoverySourceIndexEntry[] = [];
  for (const handle of handles) {
    const entry = entryForHandle(index, handle);
    if (entry === undefined) return { status: "unavailable", reason: "candidate-unavailable" };
    const safety = sourceSafetyReason(entry.source);
    if (safety !== undefined) return { status: "unavailable", reason: safety };
    const card = proposalCard(proposal, handle);
    if (card === undefined) return { status: "unavailable", reason: "candidate-unavailable" };
    if (!sourceCardMatches(entry.source, card)) return { status: "unavailable", reason: "candidate-stale" };
    if (proposal.need.exactRequired === true && entry.source.completeness !== "complete")
      return { status: "unavailable", reason: "partial-exact-evidence" };
    entries.push(entry);
  }

  if (entries.length === 1) {
    return Object.freeze({
      status: "selected",
      handle: entries[0].handle,
      source: entries[0].source,
      card: proposalCard(proposal, entries[0].handle) as Readonly<RecoveryCandidateCard>,
    });
  }
  const sources = Object.freeze(entries.map((entry) => entry.source));
  const cards = Object.freeze(
    entries.map((entry) => proposalCard(proposal, entry.handle) as Readonly<RecoveryCandidateCard>),
  );
  const coverage =
    proposal.need.cardinality?.kind === "comparison" ? comparisonCoverage(sources) : setCoverage(sources);
  if (coverage === undefined) return { status: "unavailable", reason: "comparison-coverage-incomplete" };
  return Object.freeze({ status: "selected-set", handles: Object.freeze([...handles]), sources, cards, coverage });
}

function recoveryCard(
  handle: string,
  source: ScopeCatalogSource,
  card: TieredSearchCandidateCard,
): Readonly<RecoveryCandidateCard> {
  return Object.freeze({
    handle,
    tier: source.tier,
    relation: source.relation,
    ...(source.locator === undefined ? {} : { locator: source.locator }),
    role: source.role,
    temporal: Object.freeze([...source.temporal]),
    characters: source.characters,
    completeness: source.completeness,
    confidence: card.confidence,
    matchClass: card.matchClass,
    signals: Object.freeze([...card.signals]),
    ...(source.equivalentRefs === undefined ? {} : { equivalentRefs: Object.freeze([...source.equivalentRefs]) }),
  });
}

function mapSearchResolution(
  resolution: TieredSearchResolution,
  index: RecoverySourceIndex,
): RecoveryExecutionResolution {
  if (resolution.status === "unavailable") return Object.freeze({ status: "unavailable", reason: resolution.reason });
  if (resolution.status === "ambiguous") {
    const candidates: RecoveryCandidateCard[] = [];
    for (const card of resolution.candidates) {
      const entry = index.entries.find(
        (item) => item.source.ref === card.ref && sourceIdentityMatches(item.source.identity, card.identity),
      );
      if (entry === undefined) return Object.freeze({ status: "unavailable", reason: "candidate-handle-unavailable" });
      const safety = sourceSafetyReason(entry.source);
      if (safety !== undefined) return Object.freeze({ status: "unavailable", reason: safety });
      candidates.push(recoveryCard(entry.handle, entry.source, card));
    }
    return Object.freeze({ status: "ambiguous", candidates: Object.freeze(candidates) });
  }
  if (resolution.status === "selected") {
    const entry = index.entries.find(
      (item) =>
        item.source.ref === resolution.source.ref &&
        sourceIdentityMatches(item.source.identity, resolution.source.identity),
    );
    if (entry === undefined) return Object.freeze({ status: "unavailable", reason: "candidate-handle-unavailable" });
    const safety = sourceSafetyReason(entry.source);
    if (safety !== undefined) return Object.freeze({ status: "unavailable", reason: safety });
    return Object.freeze({
      status: "selected",
      handle: entry.handle,
      source: entry.source,
      card: recoveryCard(entry.handle, entry.source, resolution.card),
    });
  }

  const entries: RecoverySourceIndexEntry[] = [];
  for (const source of resolution.sources) {
    const entry = entryForSource(index, source);
    if (entry === undefined) return Object.freeze({ status: "unavailable", reason: "candidate-handle-unavailable" });
    const safety = sourceSafetyReason(entry.source);
    if (safety !== undefined) return Object.freeze({ status: "unavailable", reason: safety });
    entries.push(entry);
  }
  const handles = Object.freeze(entries.map((entry) => entry.handle));
  const cards = Object.freeze(
    resolution.cards.map((card, indexValue) =>
      recoveryCard(entries[indexValue].handle, entries[indexValue].source, card),
    ),
  );
  return Object.freeze({
    status: "selected-set",
    handles,
    sources: Object.freeze(entries.map((entry) => entry.source)),
    cards,
    coverage: Object.freeze([...resolution.coverage]),
  });
}

function rejection(proposalId: string, reason: string, searchCount: number): RecoveryExecutionResult {
  return Object.freeze({ status: "rejected", reason, proposalId, searchCount });
}

function accepted(
  proposalId: string,
  decision: ValidatedRecoveryDecision,
  need: RecoveryEvidenceNeed,
  resolution: RecoveryExecutionResolution,
  searchCount: number,
): RecoveryExecutionResult {
  return Object.freeze({
    status: "accepted",
    proposalId,
    action: decision.action,
    ...(decision.action === "preview"
      ? { presentation: "preview" as const, maxCharactersPerCandidate: decision.maxCharactersPerCandidate }
      : decision.presentation === undefined
        ? {}
        : { presentation: decision.presentation }),
    need,
    resolution,
    searchCount,
  });
}

export function buildRecoverySourceIndex(
  version: string,
  maxTier: EvidenceScopeTier,
  entries: readonly RecoverySourceIndexEntry[],
): RecoverySourceIndex {
  if (!validText(version, 128)) invalid("Recovery source index version must be a non-empty string");
  if (!EVIDENCE_SCOPE_TIERS.includes(maxTier)) invalid("Recovery source index maxTier is invalid");
  if (!Array.isArray(entries) || entries.length > 128) invalid("Recovery source index entries are invalid");
  const handles = new Set<string>();
  const cloned = entries.map((entry) => {
    if (entry === null || typeof entry !== "object") invalid("Recovery source index entry must be an object");
    if (!validText(entry.handle, 96) || !HANDLE_PATTERN.test(entry.handle))
      invalid("Recovery source index handle is invalid");
    if (handles.has(entry.handle)) invalid("Recovery source index handles must be unique");
    handles.add(entry.handle);
    if (entry.source === null || typeof entry.source !== "object") invalid("Recovery source index source is invalid");
    return cloneEntry(entry);
  });
  return Object.freeze({ version: version.normalize("NFKC").trim(), maxTier, entries: Object.freeze(cloned) });
}

export function bindRecoveryProposal(
  proposalValue: RecoveryProposalEnvelope,
  index: RecoverySourceIndex,
): RecoveryProposalSnapshot {
  let proposal: RecoveryProposalEnvelope;
  try {
    proposal = parseRecoveryProposal(proposalValue);
  } catch (error) {
    throw new RecoveryTransactionError("invalid-proposal", error instanceof Error ? error.message : String(error));
  }
  if (proposal.sourceIndexVersion !== index.version)
    throw new RecoveryTransactionError(
      "proposal-stale",
      "Recovery proposal source index does not match the bound source index",
    );
  if (TIER_RANK[proposal.maxTier] > TIER_RANK[index.maxTier])
    throw new RecoveryTransactionError("scope-widening", "Recovery proposal exceeds the source index scope");

  const entries: RecoverySourceIndexEntry[] = [];
  for (const card of proposal.candidates) {
    const entry = entryForHandle(index, card.handle);
    if (entry === undefined)
      throw new RecoveryTransactionError(
        "candidate-unavailable",
        `Recovery candidate is not available: ${card.handle}`,
      );
    if (!sourceCardMatches(entry.source, card))
      throw new RecoveryTransactionError(
        "candidate-stale",
        `Recovery candidate metadata does not match: ${card.handle}`,
      );
    entries.push(cloneEntry(entry));
  }
  return Object.freeze({ proposal, sourceIndexVersion: index.version, entries: Object.freeze(entries) });
}

export class RecoveryTransaction {
  private readonly maxSemanticSearches: number;
  private searchCount = 0;
  private search: (need: RecoveryEvidenceNeed, catalog: ScopeCatalog) => TieredSearchResult;

  constructor(options: RecoveryTransactionOptions = {}) {
    const maxSemanticSearches = options.maxSemanticSearches ?? 1;
    if (!Number.isSafeInteger(maxSemanticSearches) || maxSemanticSearches < 1 || maxSemanticSearches > 4)
      throw new RecoveryTransactionError(
        "invalid-search-limit",
        "maxSemanticSearches must be an integer from 1 through 4",
      );
    this.maxSemanticSearches = maxSemanticSearches;
    this.search = options.search ?? ((need, catalog) => searchTieredEvidence(need, catalog));
  }

  setSearch(search: (need: RecoveryEvidenceNeed, catalog: ScopeCatalog) => TieredSearchResult): void {
    this.search = search;
  }

  async executeDirect(input: {
    readonly need: unknown;
    readonly context: RecoveryExecutionContext;
  }): Promise<RecoveryExecutionResult> {
    const proposalId = `direct-${input.context.checkpointId}`;
    let need: RecoveryEvidenceNeed;
    try {
      need = normalizeEvidenceNeed(input.need) as RecoveryEvidenceNeed;
    } catch {
      return rejection(proposalId, "need-invalid", this.searchCount);
    }
    if (this.searchCount >= this.maxSemanticSearches)
      return rejection(proposalId, "search-limit-exceeded", this.searchCount);
    this.searchCount += 1;
    let searchResult: TieredSearchResult;
    try {
      searchResult = this.search(need, input.context.catalog);
    } catch {
      return accepted(
        proposalId,
        { proposalId, action: "modify", presentation: "full", need },
        need,
        { status: "unavailable", reason: "search-failed" },
        this.searchCount,
      );
    }
    const resolution = mapSearchResolution(searchResult.resolution, input.context.sourceIndex);
    return accepted(
      proposalId,
      { proposalId, action: "modify", presentation: "full", need },
      need,
      resolution,
      this.searchCount,
    );
  }

  async execute(input: RecoveryExecutionInput): Promise<RecoveryExecutionResult> {
    const proposalId = input.snapshot.proposal.id;
    const validationContext: RecoveryProposalValidationContext = {
      checkpointId: input.context.checkpointId,
      currentGeneration: input.context.currentGeneration,
      sourceIndexVersion: input.context.sourceIndex.version,
      maxTier: input.context.sourceIndex.maxTier,
      interrupted: input.context.interrupted,
    };
    const validation = validateRecoveryProposalDecision(input.decision, input.snapshot.proposal, validationContext);
    if (validation.status === "rejected") return rejection(proposalId, validation.reason, this.searchCount);
    const decision = validation.decision;
    if (decision.action === "reject") {
      return accepted(
        proposalId,
        decision,
        input.snapshot.proposal.need,
        { status: "unavailable", reason: "rejected-by-decision" },
        this.searchCount,
      );
    }
    if (decision.action === "modify") {
      if (decision.need === undefined) return rejection(proposalId, "need-invalid", this.searchCount);
      if (scopeWidens(input.snapshot.proposal, decision.need))
        return rejection(proposalId, "scope-widening", this.searchCount);
      if (this.searchCount >= this.maxSemanticSearches)
        return rejection(proposalId, "search-limit-exceeded", this.searchCount);
      this.searchCount += 1;
      let searchResult: TieredSearchResult;
      try {
        searchResult = this.search(decision.need, input.context.catalog);
      } catch {
        return accepted(
          proposalId,
          decision,
          decision.need,
          { status: "unavailable", reason: "search-failed" },
          this.searchCount,
        );
      }
      const resolution = mapSearchResolution(searchResult.resolution, input.context.sourceIndex);
      return accepted(proposalId, decision, decision.need, resolution, this.searchCount);
    }

    const handles = decision.handles ?? [];
    const mismatch = snapshotMismatch(input.snapshot, input.context.sourceIndex, handles);
    if (mismatch !== undefined) return rejection(proposalId, mismatch, this.searchCount);
    const resolution = selectedResolution(
      input.snapshot.proposal,
      input.context.sourceIndex,
      handles,
      decision.action === "approve",
    );
    if (decision.action === "approve" && resolution.status === "unavailable")
      return rejection(proposalId, resolution.reason, this.searchCount);
    return accepted(proposalId, decision, input.snapshot.proposal.need, resolution, this.searchCount);
  }
}
