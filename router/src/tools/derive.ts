// Compatibility facade for the original derive module.
// The implementation lives in transform.ts so freeflow_derive, future
// freeflow_search transform, and freeflow_run.scriptFilter share one engine.
export { freeflowDerive, validateDeriveInput } from "../transform/engine.js";
export type {
  CountMatchesDeriveOperation,
  DedupeDeriveOperation,
  DeriveInput,
  DeriveOperation,
  DeriveSourceInput,
  DeriveValidationIssue,
  DeriveValidationResult,
  DeriveVaultSourceInput,
  DeterministicDeriveInput,
  DeterministicDeriveOperation,
  ExtractCitationsDeriveOperation,
  ExtractUrlsDeriveOperation,
  FreeflowDeriveOptions,
  GroupByRegexDeriveOperation,
  JsonExtractDeriveOperation,
  LineStatsDeriveOperation,
  RegexFilterDeriveOperation,
  ScriptDeriveInput,
  ScriptDeriveLimitsInput,
  ScriptDeriveOperation,
  ScriptDeriveSourceInput,
  SizeStatsDeriveOperation,
  TopNDeriveOperation,
} from "../transform/engine.js";
