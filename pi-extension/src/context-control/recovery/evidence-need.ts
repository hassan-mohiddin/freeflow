import {
  EVIDENCE_CARDINALITY_KINDS,
  EVIDENCE_ROLES,
  EVIDENCE_TEMPORAL_SCOPES,
  type EvidenceCardinality,
  type EvidenceNeed,
  type EvidenceNeedScope,
  type EvidenceRole,
  type EvidenceTemporal,
} from "../core/types.js";
import { EVIDENCE_SCOPE_TIERS } from "./scope-catalog.js";

export const EVIDENCE_NEED_VERSION = "0.1" as const;
export const MAX_EVIDENCE_NEED_TEXT = 2048;
export const MAX_EVIDENCE_NEED_IDENTIFIERS = 32;
export const MAX_EVIDENCE_NEED_SCOPE_VALUES = 16;

export type NormalizedEvidenceNeed = Readonly<EvidenceNeed>;

export class EvidenceNeedError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "EvidenceNeedError";
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function normalizeText(value: string, field: string, max: number): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > max) {
    throw new EvidenceNeedError("invalid-value", `${field} must be a non-empty string of at most ${max} characters`);
  }
  const normalized = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (normalized === "") throw new EvidenceNeedError("empty-value", `${field} must not be empty`);
  return normalized;
}

function normalizeList(
  value: unknown,
  field: string,
  maxItems: number,
  maxLength: number,
  caseInsensitive: boolean,
): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new EvidenceNeedError("invalid-list", `${field} must contain at most ${maxItems} items`);
  }
  const values: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const normalized = normalizeText(item as string, field, maxLength);
    const key = caseInsensitive ? normalized.toLocaleLowerCase() : normalized;
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(normalized);
  }
  return Object.freeze(values);
}

function enumValue<T extends string>(value: unknown, values: readonly T[], field: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new EvidenceNeedError("invalid-value", `${field} is invalid`);
  }
  return value as T;
}

function normalizeScope(value: unknown): Readonly<EvidenceNeedScope> | undefined {
  if (value === undefined) return undefined;
  const input = record(value);
  if (input === undefined) throw new EvidenceNeedError("invalid-scope", "EvidenceNeed scope must be an object");
  const allowed = new Set(["session", "branch", "maxTier", "kinds", "toolNames"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw new EvidenceNeedError("unknown-scope-field", "EvidenceNeed scope contains an unknown field");
  }
  const session =
    input.session === undefined ? undefined : enumValue(input.session, ["current"] as const, "scope.session");
  const branch = input.branch === undefined ? undefined : enumValue(input.branch, ["active"] as const, "scope.branch");
  const maxTier =
    input.maxTier === undefined ? undefined : enumValue(input.maxTier, EVIDENCE_SCOPE_TIERS, "scope.maxTier");
  const kinds = normalizeList(input.kinds, "scope.kinds", MAX_EVIDENCE_NEED_SCOPE_VALUES, 256, false);
  const toolNames = normalizeList(input.toolNames, "scope.toolNames", MAX_EVIDENCE_NEED_SCOPE_VALUES, 256, true);
  if (
    session === undefined &&
    branch === undefined &&
    maxTier === undefined &&
    kinds === undefined &&
    toolNames === undefined
  ) {
    return undefined;
  }
  return Object.freeze({
    ...(session === undefined ? {} : { session }),
    ...(branch === undefined ? {} : { branch }),
    ...(maxTier === undefined ? {} : { maxTier }),
    ...(kinds === undefined ? {} : { kinds }),
    ...(toolNames === undefined ? {} : { toolNames }),
  });
}

function normalizeIntent(value: unknown, role: EvidenceRole | undefined, temporal: EvidenceTemporal | undefined) {
  const input = value === undefined ? undefined : record(value);
  if (value !== undefined && input === undefined) {
    throw new EvidenceNeedError("invalid-intent", "EvidenceNeed intent must be an object");
  }
  const nestedRole = input?.role === undefined ? undefined : enumValue(input.role, EVIDENCE_ROLES, "intent.role");
  const nestedTemporal =
    input?.temporal === undefined ? undefined : enumValue(input.temporal, EVIDENCE_TEMPORAL_SCOPES, "intent.temporal");
  const resolvedRole = nestedRole ?? role;
  const resolvedTemporal = nestedTemporal ?? temporal;
  if (resolvedRole === undefined && resolvedTemporal === undefined) return undefined;
  return Object.freeze({
    ...(resolvedRole === undefined ? {} : { role: resolvedRole }),
    ...(resolvedTemporal === undefined ? {} : { temporal: resolvedTemporal }),
  });
}

function normalizeCardinality(value: unknown): Readonly<EvidenceCardinality> | undefined {
  if (value === undefined) return undefined;
  const input = record(value);
  if (input === undefined)
    throw new EvidenceNeedError("invalid-cardinality", "EvidenceNeed cardinality must be an object");
  const kind = enumValue(input.kind, EVIDENCE_CARDINALITY_KINDS, "cardinality.kind");
  if (kind === "single") {
    if (input.maxSources !== undefined) {
      throw new EvidenceNeedError("invalid-cardinality", "single cardinality cannot include maxSources");
    }
    return Object.freeze({ kind });
  }
  if (!Number.isSafeInteger(input.maxSources) || (input.maxSources as number) < 1 || (input.maxSources as number) > 8) {
    throw new EvidenceNeedError("invalid-cardinality", "set/comparison maxSources must be an integer from 1 through 8");
  }
  return Object.freeze({ kind, maxSources: input.maxSources as number });
}

export function normalizeEvidenceNeed(value: unknown): NormalizedEvidenceNeed {
  const input = record(value);
  if (input === undefined) throw new EvidenceNeedError("invalid-shape", "EvidenceNeed must be an object");
  const allowed = new Set([
    "text",
    "exactRequired",
    "expectedEvidence",
    "identifiers",
    "scope",
    "intent",
    "role",
    "temporal",
    "cardinality",
  ]);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw new EvidenceNeedError("unknown-field", "EvidenceNeed contains an unknown field");
  }
  const text = normalizeText(input.text as string, "EvidenceNeed.text", MAX_EVIDENCE_NEED_TEXT);
  if (input.exactRequired !== undefined && typeof input.exactRequired !== "boolean") {
    throw new EvidenceNeedError("invalid-value", "EvidenceNeed.exactRequired must be boolean");
  }
  const exactRequired = input.exactRequired === undefined ? undefined : (input.exactRequired as boolean);
  const expectedEvidence =
    input.expectedEvidence === undefined
      ? undefined
      : normalizeText(input.expectedEvidence as string, "EvidenceNeed.expectedEvidence", MAX_EVIDENCE_NEED_TEXT);
  const identifiers = normalizeList(
    input.identifiers,
    "EvidenceNeed.identifiers",
    MAX_EVIDENCE_NEED_IDENTIFIERS,
    256,
    false,
  );
  const role = input.role === undefined ? undefined : enumValue(input.role, EVIDENCE_ROLES, "EvidenceNeed.role");
  const temporal =
    input.temporal === undefined
      ? undefined
      : enumValue(input.temporal, EVIDENCE_TEMPORAL_SCOPES, "EvidenceNeed.temporal");
  const intent = normalizeIntent(input.intent, role, temporal);
  const scope = normalizeScope(input.scope);
  const cardinality = normalizeCardinality(input.cardinality);
  return Object.freeze({
    text,
    ...(exactRequired === undefined ? {} : { exactRequired }),
    ...(expectedEvidence === undefined ? {} : { expectedEvidence }),
    ...(identifiers === undefined ? {} : { identifiers }),
    ...(scope === undefined ? {} : { scope }),
    ...(intent === undefined ? {} : { intent }),
    ...(role === undefined ? {} : { role }),
    ...(temporal === undefined ? {} : { temporal }),
    ...(cardinality === undefined ? {} : { cardinality }),
  });
}

export function validateEvidenceNeed(value: unknown): NormalizedEvidenceNeed {
  return normalizeEvidenceNeed(value);
}
