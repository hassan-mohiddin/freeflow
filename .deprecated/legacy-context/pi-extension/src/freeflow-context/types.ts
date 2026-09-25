export type ContextSourceKind = "user" | "assistant" | "toolResult" | "custom" | "summary";

export type ContextSourceIdentity = {
  sessionId: string;
  entryId: string;
  toolCallId?: string;
  toolName?: string;
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

export type ProjectedContextSource = {
  ref: string;
  kind: Exclude<ContextSourceKind, "custom">;
  text: string;
  timestamp: string;
  position: number;
  toolNames?: string[];
  isError?: boolean;
  source: ResolvedContextEntry;
};

export type SourceProjectionOutcome =
  | { status: "eligible"; source: ProjectedContextSource }
  | { status: "excluded"; reason: string }
  | { status: "invalid"; reason: string };

export type FreeflowContextSnapshot = {
  generation: number;
  sessionId: string;
  branchLeafId: string | null | undefined;
  visibleEntryIds: Set<string>;
  visibleSourceIds: Set<string>;
  materializedSourceIds: Set<string>;
  skippedEntries: number;
  entries: Map<string, ProjectedContextSource>;
};

export const CONTEXT_REF_PREFIX = "ctx:";

export function isFreeflowContextToolName(value: unknown): boolean {
  return typeof value === "string" && value.trim() === "freeflow_context";
}

export function contextRefForEntry(entryId: string): string {
  return `${CONTEXT_REF_PREFIX}${entryId}`;
}

export function entryIdFromContextRef(ref: unknown): string | undefined {
  if (typeof ref !== "string" || !ref.startsWith(CONTEXT_REF_PREFIX)) return undefined;
  const entryId = ref.slice(CONTEXT_REF_PREFIX.length).trim();
  return entryId.length > 0 && !/[\r\n]/.test(entryId) ? entryId : undefined;
}
