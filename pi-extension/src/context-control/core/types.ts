import type { ContextSourceIdentity, ContextSourceKind, ResolvedContextEntry } from "../sources/types.js";
import type { ContextControlMode as ContextControlPolicyMode, ContextControlRecoveryScope } from "./config.js";
export type { ContextControlMode as ContextControlPolicyMode, ContextControlRecoveryScope } from "./config.js";
export type { ContextSourceIdentity } from "../sources/types.js";
export type SourceIdentity = ContextSourceIdentity;

export const CONTEXT_CONTROL_RUNTIME_VERSION = "0.1" as const;
export const CONTEXT_CONTROL_RUNTIME_MODES = ["disabled", "shadow", "active"] as const;
export const RESIDENCY_STATES = ["full", "retained", "reference"] as const;
export const LIFECYCLE_LANES = ["automatic", "keep_full", "model"] as const;
export const COVERAGE_KINDS = ["full", "range", "truncated", "unknown"] as const;
export const SOURCE_COMPLETENESS = ["complete", "partial", "unknown"] as const;
export const SOURCE_CATEGORIES = [
  "ordinary",
  "thinking",
  "tool-details",
  "usage",
  "image-base64",
  "administrative",
  "context-control",
] as const;
export const SOURCE_PRIVACY = ["allowed", "denied", "unknown"] as const;
export const SOURCE_INTEGRITY = ["valid", "invalid", "unknown"] as const;
export const SOURCE_FRESHNESS = ["current", "stale", "unknown"] as const;
export const EVIDENCE_ROLES = ["source-content", "verification-output", "observation", "mutation-receipt"] as const;
export const EVIDENCE_TEMPORAL_SCOPES = ["current", "historical", "before-change", "after-change"] as const;
export const EVIDENCE_CARDINALITY_KINDS = ["single", "set", "comparison"] as const;
const EVIDENCE_SCOPE_TIERS = ["active-branch", "current-session", "lineage", "cross-session"] as const;

export type ContextControlMode = (typeof CONTEXT_CONTROL_RUNTIME_MODES)[number];
export type ResidencyState = (typeof RESIDENCY_STATES)[number];
export type LifecycleLane = (typeof LIFECYCLE_LANES)[number];
export type CoverageKind = (typeof COVERAGE_KINDS)[number];
export type SourceCompleteness = (typeof SOURCE_COMPLETENESS)[number];
export type Completeness = SourceCompleteness;
export type SourceCategory = (typeof SOURCE_CATEGORIES)[number];
export type SourcePrivacy = (typeof SOURCE_PRIVACY)[number];
export type SourceIntegrity = (typeof SOURCE_INTEGRITY)[number];
export type SourceFreshness = (typeof SOURCE_FRESHNESS)[number];
export type EvidenceRole = (typeof EVIDENCE_ROLES)[number];
export type EvidenceIntentRole = EvidenceRole;
export type EvidenceTemporal = (typeof EVIDENCE_TEMPORAL_SCOPES)[number];
export type EvidenceIntentTemporalScope = EvidenceTemporal;
export type EvidenceCardinality = { kind: "single" } | { kind: "set" | "comparison"; maxSources: number };
type EvidenceScopeTier = (typeof EVIDENCE_SCOPE_TIERS)[number];
export type HarnessPolicy = "disabled" | "shadow" | "automatic" | "approval";
export type CommandKind = "broad-search" | "observation" | "verification" | "other";
export type ConsumptionEvidence = "confirmed" | "inferred" | "unconfirmed";
export type ContextControlOperation =
  "cleanup" | "recover" | "search" | "retrieve" | "pin" | "unpin" | "reset" | "status" | "list" | "explain";
export type SourceRelation =
  | "active-branch"
  | "sibling-branch"
  | "verified-fork"
  | "verified-clone"
  | "verified-lineage"
  | "cross-session"
  | "current-project";

export interface ContextCoverage {
  kind: CoverageKind;
  start?: number;
  end?: number;
}

export interface ContextSourceProvenance {
  rule: string;
  commandKind: CommandKind;
  sourceTurn: number;
  replacement?: ContextSourceIdentity;
}

/**
 * Runtime source data may contain canonical content transiently for a validated
 * materialization. It must never be copied into journals, catalogs, proposals,
 * or audit records.
 */
export interface ContextControlSource {
  ref: string;
  identity: ContextSourceIdentity;
  content: string;
  contentHash: string;
  characters: number;
  toolName: string;
  path?: string;
  command?: string;
  commandFingerprint?: string;
  commandKind: CommandKind;
  cwd: string | null;
  branchId: string;
  sequence: number;
  turn: number;
  producedAt?: string;
  coverage: ContextCoverage;
  completeness?: SourceCompleteness;
  isError?: boolean;
  exitCode?: number;
  consumed: boolean;
  consumptionGeneration?: number;
  consumptionEvidence?: ConsumptionEvidence;
  metadataComplete: boolean;
  metadataIssues: readonly string[];
  activeContext: boolean;
  scope?: ContextControlRecoveryScope;
  tier?: EvidenceScopeTier;
  relation?: SourceRelation;
  role?: EvidenceRole;
  temporal?: readonly EvidenceTemporal[];
  category?: SourceCategory;
  privacy?: SourcePrivacy;
  integrity?: SourceIntegrity;
  freshness?: SourceFreshness;
  provenance?: readonly ContextSourceProvenance[];
  equivalentRefs?: readonly string[];
  sessionFile?: string;
  repositoryId?: string;
}

export interface ContextControlDirectSource {
  ref: string;
  identity: ContextSourceIdentity;
  kind: Exclude<ContextSourceKind, "custom">;
  content: string;
  contentHash: string;
  characters: number;
  activeContext: boolean;
  visible: boolean;
  source: ResolvedContextEntry;
}

export interface LifecycleCandidate {
  sourceRef: string;
  lane: LifecycleLane;
  rule: string;
  replacementRef?: string;
  confidence: "hard" | "high" | "ambiguous";
  sourceCharacters: number;
  reason: string;
  branchCompatible: boolean;
  coverageCompatible?: boolean;
  contentEqual?: boolean;
  scopeCompatible?: boolean;
  verificationState?: "failed" | "passed" | "unknown";
  limitation?: string;
}

export interface LifecycleAnalysis {
  version: string;
  sources: readonly ContextControlSource[];
  candidates: readonly LifecycleCandidate[];
  automatic: readonly LifecycleCandidate[];
  protected: readonly LifecycleCandidate[];
  model: readonly LifecycleCandidate[];
}

export interface ResidencyProjection {
  sourceRef: string;
  state: ResidencyState;
  sourceHash: string;
  generation: number;
  retainedMeaning?: string;
  pinned?: boolean;
  pinReasons?: readonly string[];
}

export type ContextControlCarryForwardScope = "source" | "activity" | "artifact";
export type ContextControlCarryForwardOwner = "model" | "artifact" | "user";

export interface ContextControlCarryForwardDescriptor {
  id: string;
  scope: ContextControlCarryForwardScope;
  owner: ContextControlCarryForwardOwner;
}

export interface ContextControlJournalChange {
  sourceRef: string;
  identity: ContextSourceIdentity;
  from: ResidencyState;
  to: ResidencyState;
  sourceHash: string;
  generation: number;
  checkpointId: string;
  rule: string;
  retainedMeaning?: string;
  carryForward?: ContextControlCarryForwardDescriptor;
  pinned?: boolean;
}

export interface ContextControlPinSnapshot {
  ref: string;
  priorState?: ResidencyState;
  priorSourceHash?: string;
  priorRetainedMeaning?: string;
}

export interface ContextControlProposalDisposition {
  fingerprint: string;
  disposition: "rejected";
}

export interface ContextControlJournalDraft {
  version: 1;
  kind: "batch" | "reset" | "pin" | "disposition";
  sessionId: string;
  branchId: string;
  checkpointId: string;
  policy: HarnessPolicy;
  changes: readonly ContextControlJournalChange[];
  pinRefs?: readonly string[];
  unpinRefs?: readonly string[];
  pinSnapshots?: readonly ContextControlPinSnapshot[];
  proposalDisposition?: ContextControlProposalDisposition;
  transactionId?: string;
  previousHash?: string;
  recordHash?: string;
}

export interface ContextControlJournalEntry extends ContextControlJournalDraft {
  sequence: number;
}

export interface ContextControlJournal {
  read(sessionId: string): readonly ContextControlJournalEntry[];
  append(draft: ContextControlJournalDraft): Promise<ContextControlJournalEntry>;
  acquire?(): Promise<void>;
  release?(): Promise<void>;
  purge?(): Promise<void>;
}

export interface ContextControlAutomationRef {
  ref: string;
  reason: string;
}

export interface ContextControlAutomationView {
  sessionId: string;
  branchId: string;
  generation: number;
  sources: readonly ContextControlSource[];
  protected: readonly ContextControlAutomationRef[];
  excluded: readonly ContextControlAutomationRef[];
}

export interface ContextControlAutomationCatalog {
  scope: ContextControlRecoveryScope;
  repositoryId?: string;
  sources: readonly ContextControlSource[];
  sessions: readonly {
    sessionId: string;
    sourceCount: number;
    repositoryId?: string;
    current: boolean;
  }[];
  skippedSessions: number;
  protected: readonly ContextControlAutomationRef[];
  excluded: readonly ContextControlAutomationRef[];
}

export interface ContextControlSourceSnapshot {
  sessionId: string;
  branchId: string;
  generation: number;
  sources: readonly ContextControlSource[];
  branchIds?: readonly string[];
  byRef: ReadonlyMap<string, ContextControlSource>;
  byToolCallId: ReadonlyMap<string, ContextControlSource>;
}

export interface ContextControlAuditEvent {
  type: string;
  version: typeof CONTEXT_CONTROL_RUNTIME_VERSION;
  sessionId?: string;
  branchId?: string;
  generation?: number;
  checkpointId?: string;
  transactionId?: string;
  sourceRefs?: readonly string[];
  reason?: string;
  mode?: ContextControlMode;
  operation?: string;
  status?: string;
  details?: Record<string, unknown>;
}

export interface ContextControlAuditSink {
  record(event: ContextControlAuditEvent): Promise<void>;
  purge?(): Promise<void>;
}

export interface ContextControlStatus {
  version: typeof CONTEXT_CONTROL_RUNTIME_VERSION;
  mode: ContextControlMode;
  state: "ready" | "disabled" | "uncertain";
  sessionId?: string;
  branchId?: string;
  generation: number;
  checkpointId?: string;
  automaticRefs: readonly string[];
  protectedRefs: readonly string[];
  modelRefs: readonly string[];
  residency: Readonly<Record<string, ResidencyState>>;
  pinnedRefs: readonly string[];
  activeLeaseCount: number;
  activeCarryForwardCount: number;
  cleanupMode: ContextControlPolicyMode;
  recoveryMode: ContextControlPolicyMode;
  recoveryScope: ContextControlRecoveryScope;
  repositoryId?: string;
  catalogSessionCount: number;
  catalogSourceCount: number;
  catalogExcludedCount: number;
  catalogProtectedCount: number;
  reducedCount: number;
  activeExactLeaseCount: number;
  activeEvidenceHandleCount: number;
  suppressedProposalCount: number;
  pendingProposal: boolean;
  pendingProposalId?: string;
  auditFailureCount: number;
  canonicalPayloadsInJournal: 0;
  lastError?: string;
}

export interface ContextControlProjectionResult {
  messages: readonly any[];
  changed: boolean;
  available: boolean;
  generation: number;
  automaticRefs: readonly string[];
  protectedRefs: readonly string[];
  modelRefs: readonly string[];
  proposal?: ContextControlProposal;
}

export interface EvidenceNeedScope {
  session?: "current";
  branch?: "active";
  maxTier?: EvidenceScopeTier;
  kinds?: readonly string[];
  tiers?: readonly EvidenceScopeTier[];
  toolNames?: readonly string[];
}

export interface EvidenceNeed {
  text: string;
  exactRequired?: boolean;
  expectedEvidence?: string;
  identifiers?: readonly string[];
  scope?: EvidenceNeedScope;
  intent?: Readonly<{ role?: EvidenceRole; temporal?: EvidenceTemporal }>;
  role?: EvidenceRole;
  temporal?: EvidenceTemporal;
  cardinality?: EvidenceCardinality;
}

export interface ContextControlCandidateCard {
  handle?: string;
  ref: string;
  locator?: string;
  tier?: EvidenceScopeTier;
  relation?: SourceRelation;
  role?: EvidenceRole;
  temporal?: readonly EvidenceTemporal[];
  characters?: number;
  completeness?: SourceCompleteness;
  confidence?: "high" | "medium" | "low";
  matchClass?: "exact" | "strong-structured" | "strong-lexical" | "weak";
  signals?: readonly string[];
  equivalentRefs?: readonly string[];
}

export interface ContextControlProposal {
  id: string;
  kind: "cleanup" | "recovery";
  checkpointId: string;
  generation: number;
  expiresAt: number;
  refs: readonly string[];
  need?: EvidenceNeed;
  reasons: Readonly<Record<string, string>>;
  sourceIndexVersion?: string;
  searchedTiers?: readonly EvidenceScopeTier[];
  selectedHandles?: readonly string[];
  alternativeHandles?: readonly string[];
  candidates?: readonly ContextControlCandidateCard[];
}

export interface ContextControlEvidenceLease {
  handle: string;
  sourceRef: string;
  contentHash: string;
  exactRequired: boolean;
  excerpt: string;
  active: boolean;
  acknowledged?: boolean;
  enforced?: boolean;
  purpose?: "working_state" | "quotation" | "comparison";
  abstentionOnly?: boolean;
  checkpointId?: string;
  generation?: number;
}

export interface CanonicalEvidenceEnvelope {
  version: 1;
  source: ContextSourceIdentity;
  kind: "toolResult";
  locator?: string;
  status: "current";
  completeness: "complete" | "partial";
  integrity: "verified";
  content: string;
  limitation?: string;
}

export type RecoveryResult =
  | {
      status: "recovered";
      resolution: { status: "selected"; source: ContextSourceIdentity; score: number };
      materialization: { mode: "none" | "restore" | "retrieve"; completeness: "complete" | "partial" };
      envelope: CanonicalEvidenceEnvelope;
      lease?: ContextControlEvidenceLease;
    }
  | {
      status: "recovered-set";
      resolution: { status: "selected-set"; sources: readonly ContextSourceIdentity[]; score: number };
      materialization: { mode: "none" | "restore" | "retrieve"; completeness: "complete" | "partial" };
      envelopes: readonly CanonicalEvidenceEnvelope[];
      coverage: readonly { key: string; sourceRef: string }[];
      leases?: readonly ContextControlEvidenceLease[];
    }
  | { status: "ambiguous"; candidates: readonly ContextControlCandidateCard[]; abstentionHandle?: string }
  | { status: "unavailable"; reason: string; abstentionHandle?: string };

export interface ContextControlRuntimeOptions {
  ctx: any;
  mode: ContextControlMode;
  cleanupMode?: ContextControlPolicyMode;
  recoveryMode?: ContextControlPolicyMode;
  recoveryScope?: ContextControlRecoveryScope;
  pi?: any;
  journal?: ContextControlJournal;
  audit?: ContextControlAuditSink;
  maxSources?: number;
}

export interface ContextControlExtensionOptions {
  mode?: ContextControlMode;
  cleanupMode?: ContextControlPolicyMode;
  recoveryMode?: ContextControlPolicyMode;
  recoveryScope?: ContextControlRecoveryScope;
  journal?: ContextControlJournal;
  audit?: ContextControlAuditSink;
  outputDir?: string;
  resolveConfig?: (ctx: any) => Promise<{
    enabled: boolean;
    cleanupMode: ContextControlPolicyMode;
    recoveryMode: ContextControlPolicyMode;
    recoveryScope: ContextControlRecoveryScope;
  }>;
}
