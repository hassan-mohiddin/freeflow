export { createContextControlExtension, default as contextControlExtension } from "./adapters/extension.js";
export {
  CONTEXT_CONTROL_DECIDE_TOOL_NAME,
  CONTEXT_CONTROL_TOOL_NAME,
  CONTEXT_CONTROL_USE_EVIDENCE_TOOL_NAME,
  registerContextControlTools,
} from "./interfaces/tool.js";
export { detectExplicitEvidenceNeed, isHistoricalEvidencePrompt } from "./recovery/detector.js";
export { ContextControlRuntime } from "./core/runtime.js";
export * from "./recovery/evidence-need.js";
export * from "./recovery/sufficiency.js";
export * from "./recovery/checkpoint-detector.js";
export * from "./adapters/catalog-adapter.js";
export * from "./recovery/scope-catalog.js";
export * from "./recovery/tiered-search.js";
export * from "./recovery/transaction.js";
export {
  CANONICAL_EVIDENCE_VERSION,
  MAX_CANONICAL_EVIDENCE_CHARACTERS,
  CanonicalEvidenceSourceError,
  canonicalEvidenceEnvelope,
  validateCanonicalEvidenceSource,
} from "./recovery/materialization.js";
export * from "./interfaces/recovery-proposal.js";
export { FileContextControlAuditSink } from "./persistence/audit.js";
export {
  ContextControlJournalError,
  FileContextControlJournal,
  MemoryContextControlJournal,
} from "./persistence/journal.js";
export {
  CONTEXT_CONTROL_MODES,
  CONTEXT_CONTROL_RECOVERY_SCOPES,
  DEFAULT_CONTEXT_CONTROL_CONFIG,
  resolveContextControlConfig,
  validateContextControlConfig,
} from "./core/config.js";
export * from "./core/types.js";
export * from "./residency/carry-forward.js";
