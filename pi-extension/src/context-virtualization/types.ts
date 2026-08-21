export const CONTEXT_PROJECTION_ENTRY = "freeflow-context-projection";
export const CONTEXT_REF_PREFIX = "ctx:";
export const CONTEXT_PROJECTION_VERSION = 1 as const;

export type ContextProjectionMode = "full" | "archived";
export type ContextProjectionActor = "model" | "user";
export type ContextSourceKind = "user" | "assistant" | "toolResult" | "custom" | "summary";

export type ContextSourceIdentity = {
  sessionId: string;
  entryId: string;
  toolCallId?: string;
  toolName?: string;
};

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

export type ResolvedContextEntry = {
  source: ContextSourceIdentity;
  kind: ContextSourceKind;
  entry: any;
  message?: any;
};

export type ResolvedContextSource = ResolvedContextEntry & {
  kind: "toolResult";
  message: any;
};

export type ContextRequestSnapshot = {
  generation: number;
  sessionId: string;
  branchLeafId?: string | null;
  refs: Map<string, ResolvedContextSource>;
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

export function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function contextRefForEntry(entryId: string): string {
  return `${CONTEXT_REF_PREFIX}${entryId}`;
}

export function entryIdFromContextRef(ref: unknown): string | undefined {
  if (typeof ref !== "string" || !ref.startsWith(CONTEXT_REF_PREFIX)) return undefined;
  const entryId = ref.slice(CONTEXT_REF_PREFIX.length).trim();
  return entryId.length > 0 && !/[\r\n]/.test(entryId) ? entryId : undefined;
}

export function projectionCharacters(projection: ContextProjection): number {
  if (projection.mode === "full") return 0;
  return projection.retained?.length ?? 0;
}
