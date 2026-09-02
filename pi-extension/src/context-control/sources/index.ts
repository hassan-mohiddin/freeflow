export { ContextSourceRuntime } from "./runtime.js";
export { ContextSourceResolver, isToolResultEntry } from "./resolver.js";
export { buildContextVisibility } from "./visibility.js";
export { projectContextSource } from "./source-projector.js";
export type { SourceProjectionOptions } from "./source-projector.js";
export {
  CONTEXT_REF_PREFIX,
  contextRefForEntry,
  entryIdFromContextRef,
  isContextControlToolName,
  isFreeflowContextToolName,
} from "./types.js";
export type {
  ContextRequestSnapshot,
  ContextSourceIdentity,
  ContextSourceKind,
  ContextVisibilityOptions,
  ContextVisibilitySnapshot,
  FreeflowContextSnapshot,
  ProjectedContextSource,
  ResolvedContextEntry,
  ResolvedContextSource,
  SourceProjectionOutcome,
} from "./types.js";
