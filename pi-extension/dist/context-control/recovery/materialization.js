import { sha256Text } from "../core/stable-json.js";
export const CANONICAL_EVIDENCE_VERSION = "0.1";
export const MAX_CANONICAL_EVIDENCE_CHARACTERS = 24_000;
export class CanonicalEvidenceSourceError extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "CanonicalEvidenceSourceError";
  }
}
const HASH_PATTERN = /^[a-f0-9]{64}$/;
function record(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new CanonicalEvidenceSourceError("invalid-source", "Canonical evidence source must be an object");
  return value;
}
function only(value, allowed) {
  for (const key of Object.keys(value))
    if (!allowed.has(key))
      throw new CanonicalEvidenceSourceError(
        "unknown-field",
        `Canonical evidence source contains unknown field: ${key}`,
      );
}
function requiredString(value, key, max) {
  const item = value[key];
  if (typeof item !== "string" || item.trim() === "")
    throw new CanonicalEvidenceSourceError(
      "invalid-source",
      `Canonical evidence source ${key} must be a non-empty string`,
    );
  if (item.length > max)
    throw new CanonicalEvidenceSourceError("source-too-large", `Canonical evidence source ${key} exceeds its limit`);
  return item;
}
function optionalString(value, key, max) {
  if (value[key] === undefined) return undefined;
  return requiredString(value, key, max);
}
function validateIdentity(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new CanonicalEvidenceSourceError("invalid-source", `${path} must be an object`);
  }
  const input = value;
  const allowed = new Set(["sessionId", "entryId", "toolCallId"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw new CanonicalEvidenceSourceError("unknown-field", `${path} contains an unknown field`);
  }
  const sessionId = input.sessionId;
  const entryId = input.entryId;
  const toolCallId = input.toolCallId;
  if (typeof sessionId !== "string" || sessionId.trim() === "") {
    throw new CanonicalEvidenceSourceError("invalid-source", `${path}.sessionId must be non-empty`);
  }
  if (typeof entryId !== "string" || entryId.trim() === "") {
    throw new CanonicalEvidenceSourceError("invalid-source", `${path}.entryId must be non-empty`);
  }
  if (toolCallId !== undefined && (typeof toolCallId !== "string" || toolCallId.trim() === "")) {
    throw new CanonicalEvidenceSourceError("invalid-source", `${path}.toolCallId must be non-empty when present`);
  }
  const normalizedToolCallId = typeof toolCallId === "string" ? toolCallId.trim() : undefined;
  return {
    sessionId: sessionId.trim(),
    entryId: entryId.trim(),
    ...(normalizedToolCallId === undefined ? {} : { toolCallId: normalizedToolCallId }),
  };
}
function cloneIdentity(identity) {
  return Object.freeze({ ...identity });
}
export function validateCanonicalEvidenceSource(value) {
  const input = record(value);
  only(input, new Set(["identity", "kind", "locator", "content", "hash", "characters", "completeness", "status"]));
  const identity = validateIdentity(input.identity, "canonicalEvidenceSource.identity");
  if (input.kind !== "toolResult")
    throw new CanonicalEvidenceSourceError("unsupported-kind", "Canonical evidence source kind must be toolResult");
  const locator = optionalString(input, "locator", 4096);
  const content = requiredString(input, "content", MAX_CANONICAL_EVIDENCE_CHARACTERS);
  const hash = requiredString(input, "hash", 64);
  if (!HASH_PATTERN.test(hash))
    throw new CanonicalEvidenceSourceError(
      "integrity-mismatch",
      "Canonical evidence source hash must be a lowercase SHA-256 digest",
    );
  const characters = input.characters;
  if (!Number.isSafeInteger(characters) || characters < 1 || characters !== content.length)
    throw new CanonicalEvidenceSourceError(
      "integrity-mismatch",
      "Canonical evidence source character count does not match content",
    );
  if (sha256Text(content) !== hash)
    throw new CanonicalEvidenceSourceError(
      "integrity-mismatch",
      "Canonical evidence source content hash does not match content",
    );
  if (input.completeness !== "complete" && input.completeness !== "partial")
    throw new CanonicalEvidenceSourceError(
      "invalid-source",
      "Canonical evidence source completeness must be complete or partial",
    );
  if (input.status !== "current" && input.status !== "stale")
    throw new CanonicalEvidenceSourceError(
      "invalid-source",
      "Canonical evidence source status must be current or stale",
    );
  return {
    identity,
    kind: "toolResult",
    ...(locator === undefined ? {} : { locator }),
    content,
    hash,
    characters,
    completeness: input.completeness,
    status: input.status,
  };
}
export function canonicalEvidenceEnvelope(source) {
  const validated = validateCanonicalEvidenceSource(source);
  if (validated.status !== "current")
    throw new CanonicalEvidenceSourceError(
      "stale-source",
      "Stale canonical evidence cannot be materialized as current evidence",
    );
  const identity = cloneIdentity(validated.identity);
  return Object.freeze({
    version: CANONICAL_EVIDENCE_VERSION,
    source: identity,
    kind: validated.kind,
    ...(validated.locator === undefined ? {} : { locator: validated.locator }),
    status: "current",
    completeness: validated.completeness,
    integrity: "verified",
    content: validated.content,
    ...(validated.completeness === "partial"
      ? { limitation: "Partial canonical evidence cannot establish an exact answer." }
      : {}),
  });
}
