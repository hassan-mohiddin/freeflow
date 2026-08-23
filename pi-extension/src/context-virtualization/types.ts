import type { ContextSourceIdentity } from "../freeflow-context/types.js";

export { CONTEXT_REF_PREFIX, contextRefForEntry, entryIdFromContextRef } from "../freeflow-context/types.js";
export type {
  ContextRequestSnapshot,
  ContextSourceKind,
  ContextSourceIdentity,
  ProjectedContextSource,
  ResolvedContextEntry,
  ResolvedContextSource,
  SourceProjectionOutcome,
} from "../freeflow-context/types.js";

export const CONTEXT_PROJECTION_ENTRY = "freeflow-context-projection";
export const CONTEXT_PROJECTION_VERSION = 1 as const;

export type ContextProjectionMode = "full" | "archived";
export type ContextProjectionActor = "model" | "user";

export type ContextProjection = { mode: "full" } | { mode: "archived"; retained?: string };

export type ContextProjectionState = ContextProjection & {
  source: ContextSourceIdentity;
};

export type ContextProjectionChange = {
  source: ContextSourceIdentity;
  projection: ContextProjection;
};

export type ContextProjectionJournal = {
  version: typeof CONTEXT_PROJECTION_VERSION;
  actor: ContextProjectionActor;
  changes?: ContextProjectionChange[];
  reset?: "all";
};

export type ContextProjectionResult = {
  messages: any[];
  changed: boolean;
  available: boolean;
  generation?: number;
};

export type ContextAvailability = "active" | "history-only" | "unresolved";

export type ContextListItem = {
  ref: string;
  entryId: string;
  toolCallId?: string;
  toolName?: string;
  mode: ContextProjectionMode;
  retained?: string;
  originalCharacters: number;
  projectedCharacters: number;
  availability: ContextAvailability;
};

export type ContextStatus = {
  available: boolean;
  unavailableReason?: string;
  sessionId: string;
  branchLeafId?: string | null;
  counts: {
    full: number;
    archived: number;
    retained: number;
  };
  originalCharacters: number;
  projectedCharacters: number;
  historyOnly: number;
  unresolved: number;
  items: ContextListItem[];
};

export type ContextOperationResult = {
  status: "ok" | "rejected" | "unavailable";
  operation: "archive" | "restore" | "reset";
  changed: string[];
  message?: string;
  retained?: Record<string, string>;
  availability?: Record<string, ContextAvailability>;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function projectionCharacters(projection: ContextProjection): number {
  if (projection.mode === "full") return 0;
  return projection.retained?.length ?? 0;
}
