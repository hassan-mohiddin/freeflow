export const CONTEXT_CONTROL_RUNTIME_VERSION = "0.1";
export const CONTEXT_CONTROL_RUNTIME_MODES = ["disabled", "shadow", "active"];
export const RESIDENCY_STATES = ["full", "retained", "reference"];
export const LIFECYCLE_LANES = ["automatic", "keep_full", "model"];
export const COVERAGE_KINDS = ["full", "range", "truncated", "unknown"];
export const SOURCE_COMPLETENESS = ["complete", "partial", "unknown"];
export const SOURCE_CATEGORIES = [
  "ordinary",
  "thinking",
  "tool-details",
  "usage",
  "image-base64",
  "administrative",
  "context-control",
];
export const SOURCE_PRIVACY = ["allowed", "denied", "unknown"];
export const SOURCE_INTEGRITY = ["valid", "invalid", "unknown"];
export const SOURCE_FRESHNESS = ["current", "stale", "unknown"];
export const EVIDENCE_ROLES = ["source-content", "verification-output", "observation", "mutation-receipt"];
export const EVIDENCE_TEMPORAL_SCOPES = ["current", "historical", "before-change", "after-change"];
export const EVIDENCE_CARDINALITY_KINDS = ["single", "set", "comparison"];
const EVIDENCE_SCOPE_TIERS = ["active-branch", "current-session", "lineage", "cross-session"];
