import type { Completeness, EvidenceIntentRole, EvidenceIntentTemporalScope } from "../core/types.js";
import { normalizeEvidenceNeed, type NormalizedEvidenceNeed } from "../recovery/evidence-need.js";
import { EVIDENCE_SCOPE_TIERS, type EvidenceScopeTier } from "../recovery/scope-catalog.js";
import { EVIDENCE_ROLES, EVIDENCE_TEMPORAL_SCOPES } from "../core/types.js";
import { TIERED_SEARCH_MATCH_CLASSES, type TieredSearchMatchClass } from "../recovery/tiered-search.js";

export const RECOVERY_PROPOSAL_VERSION = 1 as const;
export const RECOVERY_PROPOSAL_ACTIONS = ["reject", "preview", "approve", "modify"] as const;
export const RECOVERY_PRESENTATIONS = ["passage", "full"] as const;

export type RecoveryProposalAction = (typeof RECOVERY_PROPOSAL_ACTIONS)[number];
export type RecoveryPresentation = (typeof RECOVERY_PRESENTATIONS)[number];
export type RecoveryProposalConfidence = "high" | "medium" | "low";

export interface RecoveryEvidenceNeed extends Omit<NormalizedEvidenceNeed, "scope"> {
  readonly scope?: Readonly<{
    readonly session?: "current";
    readonly branch?: "active";
    readonly kinds?: readonly string[];
    readonly toolNames?: readonly string[];
    readonly maxTier?: EvidenceScopeTier;
  }>;
}

export interface RecoveryCandidateCard {
  readonly handle: string;
  readonly tier: EvidenceScopeTier;
  readonly relation: string;
  readonly locator?: string;
  readonly role: EvidenceIntentRole;
  readonly temporal: readonly EvidenceIntentTemporalScope[];
  readonly characters: number;
  readonly completeness: Completeness;
  readonly confidence: RecoveryProposalConfidence;
  readonly matchClass: TieredSearchMatchClass;
  readonly signals: readonly string[];
  readonly equivalentRefs?: readonly string[];
}

export interface RecoveryProposalEnvelope {
  readonly version: typeof RECOVERY_PROPOSAL_VERSION;
  readonly id: string;
  readonly checkpointId: string;
  readonly generation: number;
  readonly expiresAtGeneration: number;
  readonly sourceIndexVersion: string;
  readonly maxTier: EvidenceScopeTier;
  readonly searchedTiers: readonly EvidenceScopeTier[];
  readonly need: RecoveryEvidenceNeed;
  readonly selectedHandles: readonly string[];
  readonly alternativeHandles: readonly string[];
  readonly candidates: readonly RecoveryCandidateCard[];
}

export interface RecoveryProposalValidationContext {
  readonly checkpointId?: string;
  readonly currentGeneration?: number;
  readonly sourceIndexVersion?: string;
  readonly maxTier?: EvidenceScopeTier;
  readonly interrupted?: boolean;
}

export interface ValidatedRecoveryDecision {
  readonly proposalId: string;
  readonly action: RecoveryProposalAction;
  readonly handles?: readonly string[];
  readonly presentation?: RecoveryPresentation;
  readonly maxCharactersPerCandidate?: number;
  readonly need?: RecoveryEvidenceNeed;
}

export type RecoveryProtocolValidationResult =
  | {
      readonly status: "accepted";
      readonly kind: "recovery-decision";
      readonly proposalId: string;
      readonly decision: ValidatedRecoveryDecision;
    }
  | { readonly status: "rejected"; readonly reason: string };

export class RecoveryProposalError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RecoveryProposalError";
  }
}

interface UnknownRecord {
  readonly [key: string]: unknown;
}

const COMPLETENESS_VALUES: readonly Completeness[] = ["complete", "partial", "unknown"];
const CONFIDENCE_VALUES: readonly RecoveryProposalConfidence[] = ["high", "medium", "low"];
const TIER_RANK: Readonly<Record<EvidenceScopeTier, number>> = Object.freeze({
  "active-branch": 0,
  "current-session": 1,
  lineage: 2,
  "cross-session": 3,
});
const TEMPORAL_ORDER: readonly EvidenceIntentTemporalScope[] = [
  "current",
  "historical",
  "before-change",
  "after-change",
];
const PROPOSAL_FIELDS = new Set([
  "id",
  "checkpointId",
  "generation",
  "expiresAtGeneration",
  "sourceIndexVersion",
  "maxTier",
  "searchedTiers",
  "need",
  "selectedHandles",
  "alternativeHandles",
  "candidates",
]);
const CANDIDATE_FIELDS = new Set([
  "handle",
  "tier",
  "relation",
  "locator",
  "role",
  "temporal",
  "characters",
  "completeness",
  "confidence",
  "matchClass",
  "signals",
  "equivalentRefs",
]);
const DECISION_FIELDS = new Set([
  "proposalId",
  "action",
  "handles",
  "presentation",
  "maxCharactersPerCandidate",
  "need",
]);

function record(value: unknown, message: string): UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new RecoveryProposalError("invalid-shape", message);
  return value as UnknownRecord;
}

function only(value: UnknownRecord, fields: ReadonlySet<string>, message: string): void {
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) throw new RecoveryProposalError("unknown-field", `${message}: ${key}`);
  }
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > max)
    throw new RecoveryProposalError("invalid-value", `${field} must be a non-empty string`);
  return value.normalize("NFKC").trim();
}

function integer(value: unknown, field: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum)
    throw new RecoveryProposalError("invalid-value", `${field} must be an integer >= ${minimum}`);
  return value as number;
}

function enumValue<T extends string>(value: unknown, values: readonly T[], field: string): T {
  if (typeof value !== "string" || !values.includes(value as T))
    throw new RecoveryProposalError("invalid-value", `${field} is invalid`);
  return value as T;
}

function stringList(
  value: unknown,
  field: string,
  maxItems: number,
  maxLength: number,
  minimum = 0,
): readonly string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maxItems)
    throw new RecoveryProposalError("invalid-value", `${field} has an invalid length`);
  const values = value.map((item) => text(item, field, maxLength));
  if (new Set(values).size !== values.length)
    throw new RecoveryProposalError("duplicate-value", `${field} must not contain duplicates`);
  return Object.freeze(values);
}

function normalizeRecoveryNeed(value: unknown): RecoveryEvidenceNeed {
  const input = { ...record(value, "evidence need must be an object") } as Record<string, unknown>;
  let maxTier: EvidenceScopeTier | undefined;
  if (input.scope !== undefined) {
    const scope = { ...record(input.scope, "evidence need scope must be an object") } as Record<string, unknown>;
    if (scope.maxTier !== undefined)
      maxTier = enumValue(scope.maxTier, EVIDENCE_SCOPE_TIERS, "evidence need scope.maxTier");
    delete scope.maxTier;
    input.scope = Object.keys(scope).length === 0 ? undefined : scope;
  }
  const normalized = normalizeEvidenceNeed(input);
  if (maxTier === undefined) return Object.freeze(normalized) as RecoveryEvidenceNeed;
  const scope = Object.freeze({ ...(normalized.scope ?? {}), maxTier });
  return Object.freeze({ ...normalized, scope }) as RecoveryEvidenceNeed;
}

function normalizeTemporal(value: unknown): readonly EvidenceIntentTemporalScope[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > TEMPORAL_ORDER.length)
    throw new RecoveryProposalError("invalid-value", "candidate temporal scope is invalid");
  const values = value.map((item) => enumValue(item, EVIDENCE_TEMPORAL_SCOPES, "candidate.temporal"));
  if (new Set(values).size !== values.length)
    throw new RecoveryProposalError("duplicate-value", "candidate temporal scope must not contain duplicates");
  return Object.freeze(TEMPORAL_ORDER.filter((item) => values.includes(item)));
}

function candidate(value: unknown): RecoveryCandidateCard {
  const input = record(value, "recovery candidate must be an object");
  only(input, CANDIDATE_FIELDS, "recovery candidate contains an unknown field");
  const handle = text(input.handle, "candidate.handle", 96);
  if (!/^cc-h-[a-z0-9_-]+$/u.test(handle))
    throw new RecoveryProposalError("invalid-value", "candidate.handle is not ephemeral");
  const tier = enumValue(input.tier, EVIDENCE_SCOPE_TIERS, "candidate.tier");
  const relation = text(input.relation, "candidate.relation", 128);
  const locator = input.locator === undefined ? undefined : text(input.locator, "candidate.locator", 512);
  const role = enumValue(input.role, EVIDENCE_ROLES, "candidate.role") as EvidenceIntentRole;
  const temporal = normalizeTemporal(input.temporal);
  const characters = integer(input.characters, "candidate.characters");
  const completeness = enumValue(input.completeness, COMPLETENESS_VALUES, "candidate.completeness");
  const confidence = enumValue(input.confidence, CONFIDENCE_VALUES, "candidate.confidence");
  const matchClass = enumValue(input.matchClass, TIERED_SEARCH_MATCH_CLASSES, "candidate.matchClass");
  const signals = stringList(input.signals, "candidate.signals", 32, 256);
  const equivalentRefs =
    input.equivalentRefs === undefined
      ? undefined
      : stringList(input.equivalentRefs, "candidate.equivalentRefs", 32, 96);
  return Object.freeze({
    handle,
    tier,
    relation,
    ...(locator === undefined ? {} : { locator }),
    role,
    temporal,
    characters,
    completeness,
    confidence,
    matchClass,
    signals,
    ...(equivalentRefs === undefined ? {} : { equivalentRefs }),
  });
}

function tierList(value: unknown, maxTier: EvidenceScopeTier): readonly EvidenceScopeTier[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > EVIDENCE_SCOPE_TIERS.length)
    throw new RecoveryProposalError("invalid-value", "searchedTiers must contain enabled tiers");
  const values = value.map((item) => enumValue(item, EVIDENCE_SCOPE_TIERS, "searchedTiers"));
  if (new Set(values).size !== values.length)
    throw new RecoveryProposalError("duplicate-value", "searchedTiers must not contain duplicates");
  const expected = EVIDENCE_SCOPE_TIERS.filter((tier) => TIER_RANK[tier] <= TIER_RANK[maxTier]);
  if (values.length !== expected.length || values.some((tier, index) => tier !== expected[index]))
    throw new RecoveryProposalError("invalid-value", "searchedTiers must cover tiers through maxTier in order");
  return Object.freeze(values);
}

function handleList(value: unknown, field: string, minimum: number): readonly string[] {
  return Object.freeze(
    stringList(value, field, 8, 96, minimum).map((handle) => {
      if (!/^cc-h-[a-z0-9_-]+$/u.test(handle))
        throw new RecoveryProposalError("invalid-value", `${field} contains a non-ephemeral handle`);
      return handle;
    }),
  );
}

export function buildRecoveryProposal(input: Omit<RecoveryProposalEnvelope, "version">): RecoveryProposalEnvelope {
  const value = record(input, "recovery proposal must be an object");
  only(value, PROPOSAL_FIELDS, "recovery proposal contains an unknown field");
  const id = text(value.id, "proposal.id", 128);
  const checkpointId = text(value.checkpointId, "proposal.checkpointId", 256);
  const generation = integer(value.generation, "proposal.generation", 1);
  const expiresAtGeneration = integer(value.expiresAtGeneration, "proposal.expiresAtGeneration", generation);
  if (expiresAtGeneration - generation > 32)
    throw new RecoveryProposalError("invalid-value", "proposal expiration window is too large");
  const sourceIndexVersion = text(value.sourceIndexVersion, "proposal.sourceIndexVersion", 128);
  const maxTier = enumValue(value.maxTier, EVIDENCE_SCOPE_TIERS, "proposal.maxTier");
  const searchedTiers = tierList(value.searchedTiers, maxTier);
  const need = normalizeRecoveryNeed(value.need);
  const selectedHandles = handleList(value.selectedHandles, "proposal.selectedHandles", 1);
  const alternativeHandles = handleList(value.alternativeHandles, "proposal.alternativeHandles", 0);
  const candidatesValue = value.candidates;
  if (!Array.isArray(candidatesValue) || candidatesValue.length < 1 || candidatesValue.length > 8)
    throw new RecoveryProposalError("invalid-value", "proposal.candidates must contain 1 to 8 values");
  const candidates = Object.freeze(candidatesValue.map(candidate));
  const candidateHandles = candidates.map(({ handle }) => handle);
  if (new Set(candidateHandles).size !== candidateHandles.length)
    throw new RecoveryProposalError("duplicate-value", "proposal candidate handles must be unique");
  const selectedSet = new Set(selectedHandles);
  const alternativeSet = new Set(alternativeHandles);
  if (selectedHandles.some((handle) => !candidateHandles.includes(handle)))
    throw new RecoveryProposalError("invalid-value", "selected handle is not a proposal candidate");
  if (alternativeHandles.some((handle) => !candidateHandles.includes(handle) || selectedSet.has(handle)))
    throw new RecoveryProposalError("invalid-value", "alternative handle is not a distinct proposal candidate");
  if (candidateHandles.some((handle) => !selectedSet.has(handle) && !alternativeSet.has(handle)))
    throw new RecoveryProposalError("invalid-value", "every candidate must be selected or an alternative");
  return Object.freeze({
    version: RECOVERY_PROPOSAL_VERSION,
    id,
    checkpointId,
    generation,
    expiresAtGeneration,
    sourceIndexVersion,
    maxTier,
    searchedTiers,
    need,
    selectedHandles,
    alternativeHandles,
    candidates,
  });
}

export function parseRecoveryProposal(value: unknown): RecoveryProposalEnvelope {
  const input = record(value, "recovery proposal must be an object");
  only(input, new Set(["version", ...PROPOSAL_FIELDS]), "recovery proposal contains an unknown field");
  if (input.version !== RECOVERY_PROPOSAL_VERSION)
    throw new RecoveryProposalError("invalid-value", "recovery proposal version is unsupported");
  const { version: _version, ...withoutVersion } = input;
  void _version;
  return buildRecoveryProposal(withoutVersion as Omit<RecoveryProposalEnvelope, "version">);
}

export function renderRecoveryProposal(proposal: RecoveryProposalEnvelope): string {
  const lines = [
    `[Context Control recovery proposal ${proposal.id}]`,
    `Checkpoint: ${proposal.checkpointId}; generation: ${proposal.generation}; expires at generation: ${proposal.expiresAtGeneration}.`,
    `Need: ${proposal.need.text}${proposal.need.exactRequired === true ? " (exact evidence required)" : ""}`,
    `Searched tiers: ${proposal.searchedTiers.join(", ")}; maximum policy tier: ${proposal.maxTier}; source index: ${proposal.sourceIndexVersion}.`,
    `Selected handles: ${proposal.selectedHandles.join(", ")}.`,
    `Alternative handles: ${proposal.alternativeHandles.length === 0 ? "none" : proposal.alternativeHandles.join(", ")}.`,
    "",
    "Candidate metadata:",
  ];
  for (const candidateValue of proposal.candidates) {
    lines.push(
      `- ${candidateValue.handle}: tier=${candidateValue.tier}; relation=${candidateValue.relation}; role=${candidateValue.role}; temporal=${candidateValue.temporal.join("/")}; characters=${candidateValue.characters}; completeness=${candidateValue.completeness}; confidence=${candidateValue.confidence}; match=${candidateValue.matchClass};${candidateValue.locator === undefined ? "" : ` locator=${candidateValue.locator};`} signals=${candidateValue.signals.join(",") || "none"}`,
    );
  }
  lines.push(
    "",
    "Choose one action through context_control_decide: reject, preview bounded candidates, approve candidates, or modify the semantic search. Do not infer or invent source content.",
  );
  return lines.join("\n");
}

function needSchema(): Record<string, unknown> {
  const scope = {
    type: "object",
    additionalProperties: false,
    properties: {
      session: { type: "string", enum: ["current"] },
      branch: { type: "string", enum: ["active"] },
      kinds: { type: "array", maxItems: 16, items: { type: "string", minLength: 1, maxLength: 256 } },
      toolNames: { type: "array", maxItems: 16, items: { type: "string", minLength: 1, maxLength: 256 } },
      maxTier: { type: "string", enum: [...EVIDENCE_SCOPE_TIERS] },
    },
  };
  const cardinality = {
    type: "object",
    additionalProperties: false,
    properties: {
      kind: { type: "string", enum: ["single", "set", "comparison"] },
      maxSources: { type: "integer", minimum: 1, maximum: 8 },
    },
    oneOf: [
      { additionalProperties: false, required: ["kind"], properties: { kind: { type: "string", enum: ["single"] } } },
      {
        additionalProperties: false,
        required: ["kind", "maxSources"],
        properties: {
          kind: { type: "string", enum: ["set", "comparison"] },
          maxSources: { type: "integer", minimum: 1, maximum: 8 },
        },
      },
    ],
  };
  return {
    type: "object",
    additionalProperties: false,
    required: ["text"],
    properties: {
      text: { type: "string", minLength: 1, maxLength: 2048 },
      exactRequired: { type: "boolean" },
      expectedEvidence: { type: "string", minLength: 1, maxLength: 2048 },
      identifiers: { type: "array", maxItems: 32, items: { type: "string", minLength: 1, maxLength: 256 } },
      scope,
      intent: {
        type: "object",
        additionalProperties: false,
        properties: {
          role: { type: "string", enum: [...EVIDENCE_ROLES] },
          temporal: { type: "string", enum: [...EVIDENCE_TEMPORAL_SCOPES] },
        },
      },
      cardinality,
    },
  };
}

function handleSchema(): Record<string, unknown> {
  return { type: "string", minLength: 1, maxLength: 96, pattern: "^cc-h-[a-z0-9_-]+$" };
}

export function buildRecoveryDecisionSchema(): Record<string, unknown> {
  const proposalId = { type: "string", minLength: 1, maxLength: 128 };
  const action = (value: RecoveryProposalAction) => ({ type: "string", enum: [value] });
  const branch = (properties: Record<string, unknown>, required: readonly string[]) => ({
    type: "object",
    additionalProperties: false,
    required,
    properties,
  });
  return {
    type: "object",
    additionalProperties: false,
    required: ["proposalId", "action"],
    properties: {
      proposalId,
      action: { type: "string", enum: [...RECOVERY_PROPOSAL_ACTIONS] },
      handles: { type: "array", minItems: 1, maxItems: 8, items: handleSchema() },
      presentation: { type: "string", enum: [...RECOVERY_PRESENTATIONS] },
      maxCharactersPerCandidate: { type: "integer", minimum: 1, maximum: 8192 },
      need: needSchema(),
    },
    oneOf: [
      branch({ proposalId, action: action("reject") }, ["proposalId", "action"]),
      branch(
        {
          proposalId,
          action: action("preview"),
          handles: { type: "array", minItems: 1, maxItems: 8, items: handleSchema() },
          maxCharactersPerCandidate: { type: "integer", minimum: 1, maximum: 8192 },
        },
        ["proposalId", "action", "handles", "maxCharactersPerCandidate"],
      ),
      branch(
        {
          proposalId,
          action: action("approve"),
          handles: { type: "array", minItems: 1, maxItems: 8, items: handleSchema() },
          presentation: { type: "string", enum: [...RECOVERY_PRESENTATIONS] },
        },
        ["proposalId", "action", "handles", "presentation"],
      ),
      branch(
        {
          proposalId,
          action: action("modify"),
          presentation: { type: "string", enum: [...RECOVERY_PRESENTATIONS] },
          need: needSchema(),
        },
        ["proposalId", "action", "presentation", "need"],
      ),
    ],
  };
}

function safeDecisionRecord(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : undefined;
}

function validHandles(value: unknown, proposal: RecoveryProposalEnvelope): readonly string[] | undefined {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) return undefined;
  const handles = value.map((item) => (typeof item === "string" ? item.trim() : ""));
  if (handles.some((handle) => !/^cc-h-[a-z0-9_-]+$/u.test(handle))) return undefined;
  if (new Set(handles).size !== handles.length)
    throw new RecoveryProposalError("handles-duplicate", "decision handles must not be duplicated");
  if (handles.some((handle) => !proposal.candidates.some((item) => item.handle === handle)))
    throw new RecoveryProposalError("handle-unknown", "decision handle is not in the proposal");
  return Object.freeze(handles);
}

function freshnessFailure(
  proposal: RecoveryProposalEnvelope,
  context: RecoveryProposalValidationContext,
): string | undefined {
  if (context.interrupted === true) return "proposal-interrupted";
  if (context.checkpointId !== undefined && context.checkpointId !== proposal.checkpointId) return "proposal-stale";
  if (context.sourceIndexVersion !== undefined && context.sourceIndexVersion !== proposal.sourceIndexVersion)
    return "proposal-stale";
  if (context.maxTier !== undefined && TIER_RANK[proposal.maxTier] > TIER_RANK[context.maxTier])
    return "scope-widening";
  if (context.currentGeneration !== undefined) {
    if (!Number.isSafeInteger(context.currentGeneration) || context.currentGeneration < 1) return "proposal-stale";
    if (context.currentGeneration < proposal.generation) return "proposal-stale";
    if (context.currentGeneration > proposal.expiresAtGeneration) return "proposal-expired";
  }
  return undefined;
}

function decisionFieldsValid(input: UnknownRecord, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(input).every((key) => allowedSet.has(key));
}

export function validateRecoveryProposalDecision(
  value: unknown,
  proposal: RecoveryProposalEnvelope | undefined,
  context: RecoveryProposalValidationContext = {},
): RecoveryProtocolValidationResult {
  if (proposal === undefined) return { status: "rejected", reason: "proposal-missing" };
  const freshness = freshnessFailure(proposal, context);
  if (freshness !== undefined) return { status: "rejected", reason: freshness };
  const input = safeDecisionRecord(value);
  if (input === undefined || !decisionFieldsValid(input, [...DECISION_FIELDS]))
    return { status: "rejected", reason: "decision-invalid" };
  const proposalId = typeof input.proposalId === "string" ? input.proposalId.trim() : "";
  if (proposalId === "") return { status: "rejected", reason: "decision-invalid" };
  if (proposalId !== proposal.id) return { status: "rejected", reason: "proposal-mismatch" };
  const action = input.action;
  if (typeof action !== "string" || !RECOVERY_PROPOSAL_ACTIONS.includes(action as RecoveryProposalAction))
    return { status: "rejected", reason: "decision-action-invalid" };

  try {
    if (action === "reject") {
      if (!decisionFieldsValid(input, ["proposalId", "action"]))
        return { status: "rejected", reason: "decision-fields-invalid" };
      return {
        status: "accepted",
        kind: "recovery-decision",
        proposalId,
        decision: Object.freeze({ proposalId, action }),
      };
    }
    if (action === "preview") {
      if (!decisionFieldsValid(input, ["proposalId", "action", "handles", "maxCharactersPerCandidate"]))
        return { status: "rejected", reason: "decision-fields-invalid" };
      const handles = validHandles(input.handles, proposal);
      if (handles === undefined) return { status: "rejected", reason: "handles-invalid" };
      const maxCharactersPerCandidate = integer(input.maxCharactersPerCandidate, "maxCharactersPerCandidate", 1);
      if (maxCharactersPerCandidate > 8192) return { status: "rejected", reason: "preview-limit-invalid" };
      return {
        status: "accepted",
        kind: "recovery-decision",
        proposalId,
        decision: Object.freeze({ proposalId, action, handles, maxCharactersPerCandidate }),
      };
    }
    if (action === "approve") {
      if (!decisionFieldsValid(input, ["proposalId", "action", "handles", "presentation"]))
        return { status: "rejected", reason: "decision-fields-invalid" };
      const handles = validHandles(input.handles, proposal);
      if (handles === undefined) return { status: "rejected", reason: "handles-invalid" };
      const presentation = enumValue(input.presentation, RECOVERY_PRESENTATIONS, "presentation");
      return {
        status: "accepted",
        kind: "recovery-decision",
        proposalId,
        decision: Object.freeze({ proposalId, action, handles, presentation }),
      };
    }
    if (!decisionFieldsValid(input, ["proposalId", "action", "presentation", "need"]))
      return { status: "rejected", reason: "decision-fields-invalid" };
    const presentation = enumValue(input.presentation, RECOVERY_PRESENTATIONS, "presentation");
    let need: RecoveryEvidenceNeed;
    try {
      need = normalizeRecoveryNeed(input.need);
    } catch {
      return { status: "rejected", reason: "need-invalid" };
    }
    const requestedMaxTier = need.scope?.maxTier;
    if (requestedMaxTier !== undefined) {
      const policyMaxTier = context.maxTier ?? proposal.maxTier;
      if (TIER_RANK[requestedMaxTier] > TIER_RANK[policyMaxTier])
        return { status: "rejected", reason: "scope-widening" };
    }
    return {
      status: "accepted",
      kind: "recovery-decision",
      proposalId,
      decision: Object.freeze({ proposalId, action: "modify" as const, presentation, need }),
    };
  } catch (error) {
    if (error instanceof RecoveryProposalError) {
      if (error.code === "handles-duplicate") return { status: "rejected", reason: "handles-duplicate" };
      if (error.code === "handle-unknown") return { status: "rejected", reason: "handle-unknown" };
      if (error.code === "invalid-value" && input.maxCharactersPerCandidate !== undefined)
        return { status: "rejected", reason: "preview-limit-invalid" };
    }
    return { status: "rejected", reason: "decision-invalid" };
  }
}
