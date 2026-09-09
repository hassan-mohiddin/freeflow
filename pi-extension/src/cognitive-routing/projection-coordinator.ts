import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { sessionEntryToContextMessages } from "@earendil-works/pi-coding-agent";

import { projectContextSource } from "../freeflow-context/source-projector.js";
import { contextRefForEntry, entryIdFromContextRef, type ContextSourceIdentity } from "../freeflow-context/types.js";
import { projectReasoningContext, type ProjectionRejected, type ProjectionSource } from "./context-projection.js";
import {
  boundedDiagnosticMessage,
  type CognitiveRoutingDiagnostic,
  type CognitiveRoutingDiagnosticObserver,
  type CognitiveRoutingDiagnosticReport,
} from "./diagnostics.js";
import type { CognitiveRoutingController, CognitiveRoutingSwitchResult } from "./controller.js";
import {
  COGNITIVE_ROUTING_BASELINE_ENTRY,
  CognitiveRoutingSourceRegistry,
  type SourceRegistryAttribution,
  type SourceRegistryExecutionProfile,
  type SourceRegistryProfile,
  type TurnReconciliationResult,
} from "./source-registry.js";
import { sessionLineageFor, type SessionLineage } from "./session-lineage.js";

export const COGNITIVE_ROUTING_SOURCE_ENTRY = "freeflow-cognitive-routing-source";
export const COGNITIVE_ROUTING_PROJECTION_ENTRY = "freeflow-cognitive-routing-projection";
export const COGNITIVE_ROUTING_PROJECTION_MARKER_PREFIX = "[projection-ref: ";
export const COGNITIVE_ROUTING_ORIGIN_MARKER_PREFIX = "[routing-origin: ";

type SessionEntry = {
  type?: unknown;
  id?: unknown;
  parentId?: unknown;
  customType?: unknown;
  data?: any;
  timestamp?: unknown;
  message?: any;
};

type RoutingState = {
  effective?: boolean;
  controlMode?: string;
  activeProfile?: SourceRegistryExecutionProfile;
};

type DiagnosticDraft = Omit<CognitiveRoutingDiagnostic, "version" | "kind">;

type ProjectionCoordinatorOptions = {
  isEnabled: () => boolean;
  isAttributionEnabled?: () => boolean;
  getRoutingState: () => RoutingState | undefined;
  getCapabilityState?: () => any;
  getTools?: () => readonly any[];
  appendEntry?: (customType: string, data: unknown) => unknown;
  onDiagnostic?: CognitiveRoutingDiagnosticObserver;
  idFactory?: () => string;
  operationIdFactory?: () => string;
};

export type SourceCaptureJournal = {
  version: 1;
  sessionId: string;
  profile: SourceRegistryExecutionProfile;
  blockId: string;
  assistant: ContextSourceIdentity;
  toolResults: ContextSourceIdentity[];
};

export type ProjectionExposureSource = {
  ref: string;
  source: ContextSourceIdentity;
  profile: SourceRegistryProfile | "user" | "shared";
  kind: "user" | "assistant" | "toolResult" | "summary" | "custom";
  blockId?: string;
};

export type ProjectionExposureSnapshot = {
  sessionId: string;
  branchLeafId: string | null;
  profile: "standard";
  blockId: string;
  refs: string[];
  sources: ProjectionExposureSource[];
  generation: number;
};

export type SourceCaptureResult =
  | { status: "ignored" }
  | { status: "captured"; profile: SourceRegistryExecutionProfile; blockId: string }
  | { status: "unavailable"; reason: string; diagnostic?: CognitiveRoutingDiagnosticReport };

export type ProjectionContextResult = {
  messages: any[];
  changed: boolean;
  diagnostic?: CognitiveRoutingDiagnosticReport;
};

export type ProjectionOperationPhase = "pending" | "committed" | "failed";

export type ProjectionOperationState = {
  version: 1;
  operationId: string;
  revision: number;
  phase: ProjectionOperationPhase;
  sessionId: string;
  branchLeafId: string | null;
  blockId: string;
  handoff: {
    assistantEntryId: string;
    toolCallId: string;
    resultEntryId?: string;
  };
  include: string[];
  shared: string[];
  previous: string[];
  required: string[];
  fromProfile: "standard";
  targetProfile: "reasoning";
};

export type ProjectionSwitchInput = {
  toolCallId: string;
  target: string;
  reason: string;
  projection?: { include: readonly string[]; shared: readonly string[] };
  signal: unknown;
  ctx: any;
  controller: CognitiveRoutingController;
};

type CapturedTurn = {
  sessionId: string;
  profile: SourceRegistryExecutionProfile;
  controlMode: string;
  blockId: string;
  baselineEstablished: boolean;
};

type ActiveBlock = {
  profile: SourceRegistryExecutionProfile;
  blockId: string;
};

type ProjectionCandidate = {
  entry: SessionEntry & { id: string; message: any };
  message: any;
  source: ContextSourceIdentity;
  profile: SourceRegistryProfile | "user" | "shared";
  kind: "user" | "assistant" | "toolResult" | "summary" | "custom";
  blockId?: string;
  legacyBaseline?: boolean;
  legacyRepairableCallIds?: readonly string[];
  legacyOutcomeUnavailableCallIds?: readonly string[];
};

type SelectionState = {
  include: string[];
  shared: string[];
  required: string[];
};

type PersistedSelectionRecord = {
  version: 1;
  kind: "selection";
  status: "committed";
  sessionId: string;
  branchLeafId: string | null;
  blockId: string;
  handoff: {
    assistantEntryId: string;
    toolCallId: string;
    resultEntryId: string;
  };
  include: string[];
  shared: string[];
  required: string[];
};

type SupportedProjectionSource = Pick<
  ProjectionSource,
  "source" | "message" | "blockId" | "legacyBaseline" | "legacyRepairableCallIds" | "legacyOutcomeUnavailableCallIds"
> & {
  profile: SourceRegistryProfile | "user" | "shared";
  kind: "user" | "assistant" | "toolResult" | "summary" | "custom";
};

function sessionIdFor(ctx: any): string | undefined {
  try {
    const sessionId = ctx?.sessionManager?.getSessionId?.();
    return typeof sessionId === "string" && sessionId.trim().length > 0 ? sessionId : undefined;
  } catch {
    return undefined;
  }
}

function branchEntriesFor(ctx: any): readonly SessionEntry[] | undefined {
  try {
    const manager = ctx?.sessionManager;
    if (typeof manager?.getBranch !== "function") return undefined;
    const entries = manager.getBranch();
    return Array.isArray(entries) ? entries : undefined;
  } catch {
    return undefined;
  }
}

function activeEntriesFor(ctx: any): readonly SessionEntry[] | undefined {
  try {
    const manager = ctx?.sessionManager;
    if (typeof manager?.buildContextEntries !== "function") return undefined;
    const entries = manager.buildContextEntries();
    return Array.isArray(entries) ? entries : undefined;
  } catch {
    return undefined;
  }
}

function markerText(ref: string): string {
  return `${COGNITIVE_ROUTING_PROJECTION_MARKER_PREFIX}${ref}]`;
}

function originMarkerText(ref: string, profile: string, blockId: string | undefined, kind: string): string {
  return `${COGNITIVE_ROUTING_ORIGIN_MARKER_PREFIX}${profile}; block: ${blockId ?? "unknown"}; kind: ${kind}; ref: ${ref}]`;
}

function appendContextAnnotations(
  message: any,
  candidate: Pick<ProjectionCandidate, "source" | "profile" | "kind" | "blockId">,
  ownedAnnotations: WeakMap<object, string>,
): any {
  if (message?.role !== "user" && message?.role !== "assistant" && message?.role !== "toolResult") {
    return message;
  }
  const ref = sourceRef(candidate.source.entryId);
  const signature = `${ref}|${candidate.profile}|${candidate.blockId ?? ""}|${candidate.kind}`;
  if (message && typeof message === "object" && ownedAnnotations.get(message) === signature) return message;
  const markers = [
    { type: "text", text: markerText(ref) },
    { type: "text", text: originMarkerText(ref, candidate.profile, candidate.blockId, candidate.kind) },
  ];
  const baseContent = message.content;
  const content = Array.isArray(baseContent)
    ? [...baseContent, ...markers]
    : typeof baseContent === "string"
      ? [{ type: "text", text: baseContent }, ...markers]
      : markers;
  const annotated = { ...message, content };
  if (annotated && typeof annotated === "object") ownedAnnotations.set(annotated, signature);
  return annotated;
}

function routingState(options: ProjectionCoordinatorOptions): RoutingState | undefined {
  try {
    return options.getRoutingState();
  } catch {
    return undefined;
  }
}

function enabled(options: ProjectionCoordinatorOptions): boolean {
  try {
    return options.isEnabled() === true;
  } catch {
    return false;
  }
}

function attributionEnabled(options: ProjectionCoordinatorOptions): boolean {
  try {
    return (options.isAttributionEnabled ?? options.isEnabled)() === true;
  } catch {
    return false;
  }
}

function branchLeafId(branchEntries: readonly SessionEntry[]): string | null {
  const id = branchEntries.at(-1)?.id;
  return typeof id === "string" ? id : null;
}

type NormalizedProjectionRefs = { status: "valid"; refs: string[] } | { status: "invalid"; reason: string };

function normalizeProjectionRefs(values: unknown): NormalizedProjectionRefs {
  if (!Array.isArray(values)) return { status: "invalid", reason: "projection_refs_invalid" };
  const refs: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") return { status: "invalid", reason: "projection_ref_invalid" };
    const entryId = entryIdFromContextRef(value);
    if (!entryId) return { status: "invalid", reason: "projection_ref_invalid" };
    const ref = contextRefForEntry(entryId);
    if (seen.has(ref)) return { status: "invalid", reason: `projection_ref_duplicate:${ref}` };
    seen.add(ref);
    refs.push(ref);
  }
  return { status: "valid", refs };
}

function uniqueRefs(...groups: readonly string[][]): string[] {
  return [...new Set(groups.flat())];
}

function sourceRef(entryId: string): string {
  return contextRefForEntry(entryId);
}

function hasAssistantText(message: any): boolean {
  return Array.isArray(message?.content)
    ? message.content.some((part: any) => part?.type === "text" && typeof part.text === "string" && part.text.trim())
    : typeof message?.content === "string" && message.content.trim().length > 0;
}

function cloneExposureSource(source: ProjectionExposureSource): ProjectionExposureSource {
  return { ...source, source: { ...source.source } };
}

function cloneOperation(operation: ProjectionOperationState): ProjectionOperationState {
  return {
    ...operation,
    handoff: { ...operation.handoff },
    include: [...operation.include],
    shared: [...operation.shared],
    previous: [...operation.previous],
    required: [...operation.required],
  };
}

function customMessageShape(message: any): any {
  if (!message || typeof message !== "object") return message;
  const comparable = { ...message };
  delete comparable.timestamp;
  return comparable;
}

function customMessageTimestamp(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function customMessagesMatch(left: any, right: any): boolean {
  return (
    left?.role === "custom" &&
    right?.role === "custom" &&
    customMessageTimestamp(left.timestamp) &&
    customMessageTimestamp(right.timestamp) &&
    isDeepStrictEqual(customMessageShape(left), customMessageShape(right))
  );
}

function sourceMatches(message: any, source: { message: any; kind?: string }): boolean {
  if (source.kind === "custom" || message?.role === "custom" || source.message?.role === "custom") {
    return customMessagesMatch(source.message, message);
  }
  return source.message === message || isDeepStrictEqual(source.message, message);
}

type LegacyOutcomeStatus = {
  repairableCallIds: string[];
  unavailableCallIds: string[];
};

function legacyOutcomeForAssistant(
  assistant: SessionEntry & { id: string; message: any },
  branchEntries: readonly SessionEntry[],
  activeEntryIds: ReadonlySet<string>,
): LegacyOutcomeStatus {
  const callNames = new Map<string, string>();
  for (const part of assistant.message?.content ?? []) {
    if (part?.type === "toolCall" && typeof part.id === "string" && typeof part.name === "string") {
      callNames.set(part.id, part.name);
    }
  }
  if (callNames.size === 0) return { repairableCallIds: [], unavailableCallIds: [] };

  const matchesByCall = new Map<string, SessionEntry[]>();
  for (const entry of branchEntries) {
    if (
      entry.type !== "message" ||
      entry.message?.role !== "toolResult" ||
      typeof entry.message.toolCallId !== "string" ||
      !callNames.has(entry.message.toolCallId)
    ) {
      continue;
    }
    const matches = matchesByCall.get(entry.message.toolCallId) ?? [];
    matches.push(entry);
    matchesByCall.set(entry.message.toolCallId, matches);
  }

  const repairableCallIds: string[] = [];
  const unavailableCallIds: string[] = [];
  for (const [callId, callName] of callNames) {
    const matches = matchesByCall.get(callId) ?? [];
    if (matches.length === 0) {
      repairableCallIds.push(callId);
      continue;
    }
    if (matches.length !== 1) {
      unavailableCallIds.push(callId);
      continue;
    }
    const result = matches[0];
    if (result.message.toolName !== callName || typeof result.id !== "string" || !activeEntryIds.has(result.id)) {
      unavailableCallIds.push(callId);
    }
  }
  return { repairableCallIds, unavailableCallIds };
}

function projectionSourceForCandidate(candidate: ProjectionCandidate): SupportedProjectionSource {
  return {
    source: { ...candidate.source },
    message: candidate.message,
    profile: candidate.profile,
    kind: candidate.kind,
    ...(candidate.blockId ? { blockId: candidate.blockId } : {}),
    ...(candidate.legacyBaseline === true ? { legacyBaseline: true } : {}),
    ...(candidate.legacyRepairableCallIds ? { legacyRepairableCallIds: [...candidate.legacyRepairableCallIds] } : {}),
    ...(candidate.legacyOutcomeUnavailableCallIds
      ? { legacyOutcomeUnavailableCallIds: [...candidate.legacyOutcomeUnavailableCallIds] }
      : {}),
  };
}

function exposureSourceForCandidate(candidate: ProjectionCandidate): ProjectionExposureSource {
  return {
    ref: sourceRef(candidate.source.entryId),
    source: { ...candidate.source },
    profile: candidate.profile,
    kind: candidate.kind,
    ...(candidate.blockId ? { blockId: candidate.blockId } : {}),
  };
}

function emptySelection(): SelectionState {
  return { include: [], shared: [], required: [] };
}

function mergeSelection(
  base: SelectionState,
  record: Pick<PersistedSelectionRecord, "include" | "shared" | "required">,
): SelectionState {
  return {
    include: uniqueRefs(base.include, record.include),
    shared: uniqueRefs(base.shared, record.shared),
    required: uniqueRefs(base.required, record.required),
  };
}

function validatePersistedSelectionRecord(
  record: PersistedSelectionRecord,
  sessionId: string,
  branchEntries: readonly SessionEntry[],
  selectionEntry: SessionEntry,
  registry: CognitiveRoutingSourceRegistry,
): string | undefined {
  const entriesById = new Map<string, SessionEntry & { id: string; message: any }>();
  for (const entry of branchEntries) {
    if (typeof entry.id !== "string") continue;
    if (entriesById.has(entry.id)) return `projection_record_entry_ambiguous:${entry.id}`;
    if (entry.type === "message" && entry.message !== undefined) entriesById.set(entry.id, entry as any);
  }
  const selectionIndex = branchEntries.findIndex((entry) => entry.id === selectionEntry.id);
  const assistant = entriesById.get(record.handoff.assistantEntryId);
  const result = entriesById.get(record.handoff.resultEntryId);
  if (!assistant || assistant.message.role !== "assistant") return "projection_record_handoff_assistant_missing";
  if (!result || result.message.role !== "toolResult") return "projection_record_handoff_result_missing";
  const assistantIndex = branchEntries.findIndex((entry) => entry.id === assistant.id);
  const resultIndex = branchEntries.findIndex((entry) => entry.id === result.id);
  if (selectionIndex < 0 || assistantIndex < 0 || resultIndex <= assistantIndex || resultIndex >= selectionIndex) {
    return "projection_record_handoff_order_invalid";
  }
  const switchCalls = (assistant.message.content ?? []).filter(
    (part: any) =>
      part?.type === "toolCall" && part.id === record.handoff.toolCallId && part.name === "freeflow_switch_profile",
  );
  if (switchCalls.length !== 1) return "projection_record_handoff_call_invalid";
  if (
    result.message.toolCallId !== record.handoff.toolCallId ||
    result.message.toolName !== "freeflow_switch_profile"
  ) {
    return "projection_record_handoff_result_invalid";
  }
  const handoffAssistantAttribution = registry.attributionForEntry(sessionId, assistant.id);
  const handoffResultAttribution = registry.attributionForEntry(sessionId, result.id);
  if (
    !handoffAssistantAttribution ||
    !handoffResultAttribution ||
    handoffAssistantAttribution.profile !== "standard" ||
    handoffResultAttribution.profile !== "standard" ||
    handoffAssistantAttribution.blockId !== record.blockId ||
    handoffResultAttribution.blockId !== record.blockId
  ) {
    return "projection_record_handoff_attribution_invalid";
  }
  for (const ref of uniqueRefs(record.include, record.shared, record.required)) {
    const entryId = entryIdFromContextRef(ref);
    if (!entryId) return `projection_record_ref_invalid:${ref}`;
    const entry = entriesById.get(entryId);
    const entryIndex = branchEntries.findIndex((candidate) => candidate.id === entryId);
    const attribution = registry.attributionForEntry(sessionId, entryId);
    if (
      !entry ||
      entryIndex < 0 ||
      entryIndex >= selectionIndex ||
      !attribution ||
      !isDeepStrictEqual(entry.message, attribution.message)
    ) {
      return `projection_record_ref_unavailable:${ref}`;
    }
  }
  return undefined;
}

function parsePersistedSelection(
  data: any,
  sessionId: string,
  lineage: SessionLineage,
): { status: "valid"; record: PersistedSelectionRecord } | { status: "invalid"; reason: string } {
  if (data?.version !== 1 || data?.kind !== "selection" || data?.status !== "committed") {
    return { status: "invalid", reason: "projection_record_unrecognized" };
  }
  if (typeof data.sessionId !== "string" || typeof data.blockId !== "string") {
    return { status: "invalid", reason: "projection_record_session_invalid" };
  }
  if (data.sessionId !== sessionId && !lineage.inheritedSessionIds.has(data.sessionId)) {
    return {
      status: "invalid",
      reason: lineage.available ? "projection_record_session_invalid" : "projection_record_lineage_unavailable",
    };
  }
  if (
    !data.handoff ||
    typeof data.handoff.assistantEntryId !== "string" ||
    typeof data.handoff.toolCallId !== "string" ||
    typeof data.handoff.resultEntryId !== "string"
  ) {
    return { status: "invalid", reason: "projection_record_handoff_invalid" };
  }
  const include = normalizeProjectionRefs(data.include);
  const shared = normalizeProjectionRefs(data.shared);
  const required = normalizeProjectionRefs(data.required);
  if (include.status === "invalid") return include;
  if (shared.status === "invalid") return shared;
  if (required.status === "invalid") return required;
  return {
    status: "valid",
    record: {
      version: 1,
      kind: "selection",
      status: "committed",
      sessionId,
      branchLeafId: typeof data.branchLeafId === "string" ? data.branchLeafId : null,
      blockId: data.blockId,
      handoff: { ...data.handoff },
      include: include.refs,
      shared: shared.refs,
      required: required.refs,
    },
  };
}

export class CognitiveRoutingProjectionCoordinator {
  private readonly options: ProjectionCoordinatorOptions;
  private readonly registry = new CognitiveRoutingSourceRegistry();
  private readonly idFactory: () => string;
  private readonly operationIdFactory: () => string;
  private activeBlock: ActiveBlock | undefined;
  private capturedTurn: CapturedTurn | undefined;
  private exposureSnapshot: ProjectionExposureSnapshot | undefined;
  private standardContext: readonly any[] | undefined;
  private readonly ownedAnnotations = new WeakMap<object, string>();
  private sessionLineage: SessionLineage | undefined;
  private pendingSelection: ProjectionOperationState | undefined;
  private operation: ProjectionOperationState | undefined;
  private committedSelection: SelectionState = emptySelection();
  private operationRevision = 0;
  private exposureGeneration = 0;
  private failure: string | undefined;
  private failureDiagnostic: CognitiveRoutingDiagnostic | undefined;
  private diagnosticOperationId: string | undefined;
  private readonly diagnosticReports = new Map<string, CognitiveRoutingDiagnosticReport>();

  constructor(options: ProjectionCoordinatorOptions) {
    this.options = options;
    this.idFactory = options.idFactory ?? (() => randomUUID());
    this.operationIdFactory = options.operationIdFactory ?? (() => randomUUID());
  }

  private diagnostic(draft: DiagnosticDraft): CognitiveRoutingDiagnostic {
    return {
      version: 1,
      kind: "projection-failure",
      ...draft,
      message: boundedDiagnosticMessage(draft.message),
    };
  }

  private setFailure(reason: string, diagnostic?: CognitiveRoutingDiagnostic): void {
    this.failure = this.failure ?? reason;
    this.failureDiagnostic = this.failureDiagnostic ?? diagnostic;
  }

  private reportDiagnostic(
    ctx: any,
    diagnostic: CognitiveRoutingDiagnostic,
  ): CognitiveRoutingDiagnosticReport | undefined {
    if (!this.options.onDiagnostic) return undefined;
    const key = [
      diagnostic.stage,
      diagnostic.code,
      diagnostic.operationId ?? "",
      diagnostic.ref ?? "",
      diagnostic.role ?? "",
      diagnostic.position ?? "",
    ].join("|");
    const existing = this.diagnosticReports.get(key);
    if (existing) return existing;
    let delivery: CognitiveRoutingDiagnosticReport["delivery"] = {
      persisted: false,
      notificationAvailable: false,
      notificationAttempted: false,
    };
    try {
      const observed = this.options.onDiagnostic(diagnostic, ctx);
      if (observed) delivery = observed;
    } catch (error) {
      delivery = {
        ...delivery,
        notificationError: error instanceof Error ? error.message : String(error),
      };
    }
    const report = { diagnostic, delivery };
    this.diagnosticReports.set(key, report);
    return report;
  }

  private reportFailure(ctx: any): CognitiveRoutingDiagnosticReport | undefined {
    if (!this.failure) return undefined;
    const diagnostic =
      this.failureDiagnostic ??
      this.diagnostic({
        code: this.failure,
        stage: "context_assembly",
        message: this.failure,
        modelState: "unknown",
      });
    return this.reportDiagnostic(ctx, diagnostic);
  }

  private blocked(
    ctx: any,
    reason: string,
    stage: DiagnosticDraft["stage"],
    modelState: DiagnosticDraft["modelState"] = "unchanged",
    fields: Pick<DiagnosticDraft, "operationId" | "ref" | "role" | "customType" | "position"> = {},
  ): CognitiveRoutingSwitchResult {
    const report = this.reportDiagnostic(
      ctx,
      this.diagnostic({
        code: reason,
        stage,
        message: reason,
        modelState,
        ...((fields.operationId ?? this.diagnosticOperationId)
          ? { operationId: fields.operationId ?? this.diagnosticOperationId }
          : {}),
        ...fields,
      }),
    );
    return { status: "blocked", reason, ...(report ? { diagnostic: report } : {}) };
  }

  reset(): void {
    this.registry.clear();
    this.sessionLineage = undefined;
    this.activeBlock = undefined;
    this.capturedTurn = undefined;
    this.exposureSnapshot = undefined;
    this.standardContext = undefined;
    this.pendingSelection = undefined;
    this.operation = undefined;
    this.committedSelection = emptySelection();
    this.operationRevision = 0;
    this.exposureGeneration = 0;
    this.failure = undefined;
    this.failureDiagnostic = undefined;
    this.diagnosticOperationId = undefined;
    this.diagnosticReports.clear();
  }

  private lineageFor(ctx: any): SessionLineage | undefined {
    const sessionId = sessionIdFor(ctx);
    if (!sessionId) return undefined;
    if (this.sessionLineage?.currentSessionId === sessionId) return this.sessionLineage;
    const lineage = sessionLineageFor(ctx);
    if (lineage?.currentSessionId === sessionId) this.sessionLineage = lineage;
    return lineage;
  }

  private latestBaselineIndex(
    sessionId: string,
    branchEntries: readonly SessionEntry[],
    lineage: SessionLineage,
  ): number | undefined {
    const accepted = new Set([sessionId, ...lineage.inheritedSessionIds]);
    let latest: number | undefined;
    for (let index = 0; index < branchEntries.length; index += 1) {
      const entry = branchEntries[index];
      if (entry.type !== "custom" || entry.customType !== COGNITIVE_ROUTING_BASELINE_ENTRY) continue;
      const data = entry.data;
      if (data?.version === 1 && data.kind === "baseline" && accepted.has(data.sessionId)) latest = index;
    }
    return latest;
  }

  async turnStart(ctx: any): Promise<void> {
    this.exposureSnapshot = undefined;
    this.diagnosticOperationId = undefined;
    const state = routingState(this.options);
    const eligible = attributionEnabled(this.options) && state?.effective === true && state.activeProfile;
    if (!eligible) {
      this.capturedTurn = undefined;
      return;
    }
    const automatic = state.controlMode === "automatic";
    if (!automatic) this.reset();
    if (this.capturedTurn) {
      this.setFailure(
        "turn_previous_unresolved",
        this.diagnostic({
          code: "turn_previous_unresolved",
          stage: "context_assembly",
          message: "The previous Cognitive Routing turn did not reach a safe boundary.",
          modelState: "unknown",
        }),
      );
      return;
    }
    const lineage = this.lineageFor(ctx);
    const sessionId = lineage?.currentSessionId;
    let branchEntries = branchEntriesFor(ctx);
    let activeEntries = activeEntriesFor(ctx);
    if (!sessionId || !lineage || !branchEntries || !activeEntries) {
      if (!automatic) {
        this.capturedTurn = undefined;
        return;
      }
      const reason = !sessionId
        ? "session_identity_unavailable"
        : !branchEntries
          ? "branch_entries_unavailable"
          : !activeEntries
            ? "active_context_entries_unavailable"
            : "session_lineage_unavailable";
      this.setFailure(
        reason,
        this.diagnostic({
          code: reason,
          stage: "context_assembly",
          message: reason,
          modelState: "unchanged",
        }),
      );
      return;
    }
    const hydrated = this.registry.hydrate(sessionId, branchEntries, lineage.inheritedSessionIds, lineage.available);
    if (hydrated.status === "unavailable") {
      this.setFailure(
        hydrated.reason,
        this.diagnostic({
          code: hydrated.reason,
          stage: "selection_validation",
          message: hydrated.reason,
          modelState: "unchanged",
        }),
      );
      return;
    }
    this.restorePersistedSelection(sessionId, branchEntries, activeEntries, lineage);
    if (this.failure) return;
    const baselineIndex = this.latestBaselineIndex(sessionId, branchEntries, lineage);
    if (baselineIndex === undefined) {
      const entryIds = branchEntries
        .filter(
          (entry) =>
            entry.type === "message" &&
            typeof entry.id === "string" &&
            (entry.message?.role === "assistant" || entry.message?.role === "toolResult") &&
            this.registry.attributionForEntry(sessionId, entry.id) === undefined,
        )
        .map((entry) => entry.id as string);
      try {
        await this.persist(COGNITIVE_ROUTING_BASELINE_ENTRY, {
          version: 1,
          kind: "baseline",
          sessionId,
          entryIds,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.setFailure(
          reason,
          this.diagnostic({
            code: reason,
            stage: "baseline_persistence",
            message: reason,
            modelState: "unchanged",
          }),
        );
        return;
      }
      branchEntries = branchEntriesFor(ctx);
      activeEntries = activeEntriesFor(ctx);
      if (!branchEntries || !activeEntries) {
        const reason = !branchEntries ? "branch_entries_unavailable" : "active_context_entries_unavailable";
        this.setFailure(
          reason,
          this.diagnostic({
            code: reason,
            stage: "baseline_persistence",
            message: reason,
            modelState: "unchanged",
          }),
        );
        return;
      }
      if (this.latestBaselineIndex(sessionId, branchEntries, lineage) === undefined) {
        this.setFailure(
          "baseline_persistence_unconfirmed",
          this.diagnostic({
            code: "baseline_persistence_unconfirmed",
            stage: "baseline_persistence",
            message: "The baseline write did not become observable on the active branch.",
            modelState: "unchanged",
          }),
        );
        return;
      }
      const rehydrated = this.registry.hydrate(
        sessionId,
        branchEntries,
        lineage.inheritedSessionIds,
        lineage.available,
      );
      if (rehydrated.status === "unavailable") {
        this.setFailure(
          rehydrated.reason,
          this.diagnostic({
            code: rehydrated.reason,
            stage: "selection_validation",
            message: rehydrated.reason,
            modelState: "unchanged",
          }),
        );
        return;
      }
      this.restorePersistedSelection(sessionId, branchEntries, activeEntries, lineage);
      if (this.failure) return;
    }
    let blockId: string;
    try {
      if (!this.activeBlock || this.activeBlock.profile !== state.activeProfile) {
        this.activeBlock = { profile: state.activeProfile, blockId: this.idFactory() };
      }
      blockId = this.activeBlock.blockId;
    } catch {
      this.setFailure(
        "block_identity_unavailable",
        this.diagnostic({
          code: "block_identity_unavailable",
          stage: "attribution",
          message: "A stable Cognitive Routing block identity could not be created.",
          modelState: "unchanged",
        }),
      );
      return;
    }
    this.capturedTurn = {
      sessionId,
      profile: state.activeProfile,
      controlMode: state.controlMode ?? "automatic",
      blockId,
      baselineEstablished: false,
    };
  }

  context(ctx: any, messages: readonly any[]): ProjectionContextResult {
    if (!attributionEnabled(this.options)) {
      this.exposureSnapshot = undefined;
      return { messages: messages as any[], changed: false };
    }
    const laneEnabled = enabled(this.options);
    const turn = this.capturedTurn;
    const state = routingState(this.options);
    const eligible = state?.effective === true && state.activeProfile;
    if (!eligible) {
      this.exposureSnapshot = undefined;
      return { messages: messages as any[], changed: false };
    }
    if (state.controlMode !== "automatic") {
      if (!turn) return { messages: messages as any[], changed: false };
      const lineage = this.lineageFor(ctx);
      const sessionId = lineage?.currentSessionId;
      const branchEntries = branchEntriesFor(ctx);
      if (!sessionId || !lineage || !branchEntries || sessionId !== turn.sessionId) {
        this.capturedTurn = undefined;
        return { messages: messages as any[], changed: false };
      }
      if (!turn.baselineEstablished) {
        try {
          this.registry.beginTurn({
            sessionId: turn.sessionId,
            profile: turn.profile,
            blockId: turn.blockId,
            branchEntries,
          });
          turn.baselineEstablished = true;
        } catch {
          this.capturedTurn = undefined;
        }
      }
      return turn
        ? this.annotateFullContext(turn.sessionId, messages, branchEntries, activeEntriesFor(ctx) ?? branchEntries)
        : { messages: messages as any[], changed: false };
    }
    const cancellationRequired =
      laneEnabled &&
      (state.activeProfile === "reasoning" ||
        this.pendingSelection !== undefined ||
        this.operation?.phase === "failed");
    if (!turn) {
      if (!laneEnabled) return { messages: messages as any[], changed: false };
      return this.rejectProjectedContext(
        ctx,
        this.failure ?? "turn_capture_unavailable",
        messages,
        cancellationRequired,
        this.failure !== undefined,
      );
    }
    const lineage = this.lineageFor(ctx);
    const sessionId = lineage?.currentSessionId;
    const branchEntries = branchEntriesFor(ctx);
    const activeEntries = activeEntriesFor(ctx);
    if (!sessionId || !lineage || !branchEntries || !activeEntries || sessionId !== turn.sessionId) {
      if (!laneEnabled) return { messages: messages as any[], changed: false };
      return this.rejectProjectedContext(
        ctx,
        !sessionId
          ? "session_identity_unavailable"
          : !branchEntries
            ? "branch_entries_unavailable"
            : !activeEntries
              ? "active_context_entries_unavailable"
              : !lineage
                ? "session_lineage_unavailable"
                : "turn_session_changed",
        messages,
        cancellationRequired,
      );
    }
    if (this.failure) {
      if (!laneEnabled) return this.annotateFullContext(sessionId, messages, branchEntries, activeEntries);
      return this.rejectProjectedContext(ctx, this.failure, messages, cancellationRequired);
    }
    const hydrated = this.registry.hydrate(sessionId, branchEntries, lineage.inheritedSessionIds, lineage.available);
    if (hydrated.status === "unavailable") {
      if (!laneEnabled) return { messages: messages as any[], changed: false };
      return this.rejectProjectedContext(ctx, hydrated.reason, messages, cancellationRequired);
    }
    this.restorePersistedSelection(sessionId, branchEntries, activeEntries, lineage);
    if (!turn.baselineEstablished) {
      try {
        this.registry.beginTurn({
          sessionId: turn.sessionId,
          profile: turn.profile,
          blockId: turn.blockId,
          branchEntries,
        });
        turn.baselineEstablished = true;
      } catch (error) {
        if (!laneEnabled) return { messages: messages as any[], changed: false };
        return this.rejectProjectedContext(
          ctx,
          error instanceof Error ? error.message : String(error),
          messages,
          cancellationRequired,
        );
      }
    }
    if (turn.profile === "reasoning") {
      if (!laneEnabled) return this.annotateFullContext(sessionId, messages, branchEntries, activeEntries);
      return this.projectReasoningTurn(ctx, messages, branchEntries, activeEntries);
    }
    return this.exposeStandardSources(ctx, messages, turn, branchEntries, activeEntries);
  }

  async turnEnd(ctx: any, event: { message?: any; toolResults?: readonly any[] }): Promise<SourceCaptureResult> {
    const turn = this.capturedTurn;
    if (!turn) return { status: "ignored" };
    if (this.failure) {
      const reason = this.failure;
      const diagnostic = this.reportFailure(ctx);
      this.capturedTurn = undefined;
      if (
        enabled(this.options) &&
        turn.controlMode === "automatic" &&
        (turn.profile === "reasoning" || this.pendingSelection !== undefined || this.operation?.phase === "failed")
      ) {
        this.abort(ctx);
      }
      return { status: "unavailable", reason, ...(diagnostic ? { diagnostic } : {}) };
    }
    const lineage = this.lineageFor(ctx);
    const sessionId = lineage?.currentSessionId;
    const branchEntries = branchEntriesFor(ctx);
    if (!sessionId || !lineage || !branchEntries || sessionId !== turn.sessionId || !turn.baselineEstablished) {
      const reason = sessionId
        ? branchEntries
          ? !lineage
            ? "session_lineage_unavailable"
            : sessionId === turn.sessionId
              ? "turn_baseline_missing"
              : "turn_session_changed"
          : "branch_entries_unavailable"
        : "session_identity_unavailable";
      this.setFailure(
        reason,
        this.diagnostic({
          code: reason,
          stage: "context_assembly",
          message: reason,
          modelState: "unknown",
        }),
      );
      const diagnostic = this.reportFailure(ctx);
      this.capturedTurn = undefined;
      if (
        enabled(this.options) &&
        turn.controlMode === "automatic" &&
        (turn.profile === "reasoning" || this.pendingSelection !== undefined || this.operation?.phase === "failed")
      ) {
        this.abort(ctx);
      }
      return { status: "unavailable", reason, ...(diagnostic ? { diagnostic } : {}) };
    }
    const hydrated = this.registry.hydrate(sessionId, branchEntries, lineage.inheritedSessionIds, lineage.available);
    if (hydrated.status === "unavailable") {
      this.setFailure(
        hydrated.reason,
        this.diagnostic({
          code: hydrated.reason,
          stage: "selection_validation",
          message: hydrated.reason,
          modelState: "unknown",
        }),
      );
      const diagnostic = this.reportFailure(ctx);
      this.capturedTurn = undefined;
      if (
        enabled(this.options) &&
        turn.controlMode === "automatic" &&
        (turn.profile === "reasoning" || this.pendingSelection !== undefined || this.operation?.phase === "failed")
      ) {
        this.abort(ctx);
      }
      return { status: "unavailable", reason: hydrated.reason, ...(diagnostic ? { diagnostic } : {}) };
    }
    const reconciliation = this.registry.reconcileTurn({
      sessionId,
      branchEntries,
      assistantMessage: event?.message,
      toolResults: event?.toolResults ?? [],
    });
    if (reconciliation.status === "unavailable") {
      this.setFailure(
        reconciliation.reason,
        this.diagnostic({
          code: reconciliation.reason,
          stage: "attribution",
          message: reconciliation.reason,
          modelState: this.pendingSelection ? "changed" : "unknown",
        }),
      );
      const diagnostic = this.reportFailure(ctx);
      this.capturedTurn = undefined;
      if (
        enabled(this.options) &&
        turn.controlMode === "automatic" &&
        (turn.profile === "reasoning" || this.pendingSelection !== undefined || this.operation?.phase === "failed")
      ) {
        this.abort(ctx);
      }
      return { status: "unavailable", reason: reconciliation.reason, ...(diagnostic ? { diagnostic } : {}) };
    }
    if (reconciliation.status === "already_attributed") {
      this.capturedTurn = undefined;
      return { status: "captured", profile: turn.profile, blockId: turn.blockId };
    }

    try {
      await this.persistSourceJournal(turn, reconciliation);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.setFailure(
        reason,
        this.diagnostic({
          code: reason,
          stage: "attribution",
          message: reason,
          modelState: this.pendingSelection ? "changed" : "unknown",
        }),
      );
      const diagnostic = this.reportFailure(ctx);
      this.exposureSnapshot = undefined;
      this.capturedTurn = undefined;
      if (
        enabled(this.options) &&
        turn.controlMode === "automatic" &&
        (turn.profile === "reasoning" || this.pendingSelection !== undefined || this.operation?.phase === "failed")
      ) {
        this.abort(ctx);
      }
      return { status: "unavailable", reason, ...(diagnostic ? { diagnostic } : {}) };
    }

    if (turn.profile === "standard" && this.pendingSelection) {
      const completionError = await this.commitPendingSelection(reconciliation, branchEntries, ctx);
      if (completionError) {
        this.setFailure(
          completionError,
          this.diagnostic({
            code: completionError,
            stage: "transition",
            message: completionError,
            modelState: "changed",
            ...(this.operation?.operationId ? { operationId: this.operation.operationId } : {}),
          }),
        );
        const diagnostic = this.reportFailure(ctx);
        this.capturedTurn = undefined;
        this.abort(ctx);
        return { status: "unavailable", reason: completionError, ...(diagnostic ? { diagnostic } : {}) };
      }
    }
    this.capturedTurn = undefined;
    return { status: "captured", profile: turn.profile, blockId: turn.blockId };
  }

  exposure(): ProjectionExposureSnapshot | undefined {
    return this.exposureSnapshot
      ? {
          ...this.exposureSnapshot,
          refs: [...this.exposureSnapshot.refs],
          sources: this.exposureSnapshot.sources.map(cloneExposureSource),
        }
      : undefined;
  }

  failureReason(): string | undefined {
    return this.failure;
  }

  operationState(): ProjectionOperationState | undefined {
    return this.operation ? cloneOperation(this.operation) : undefined;
  }

  async switchProfile(input: ProjectionSwitchInput): Promise<CognitiveRoutingSwitchResult> {
    this.diagnosticOperationId = input.toolCallId;
    const projectionSupplied = input.projection !== undefined;
    if (input.target !== "standard" && input.target !== "reasoning") {
      return this.blocked(input.ctx, "target_invalid", "selection_validation");
    }
    if (input.target !== "reasoning") {
      if (projectionSupplied) {
        return this.blocked(input.ctx, "projection_target_must_be_reasoning", "selection_validation");
      }
      return input.controller.switchAutomaticProfile(input.target, input.reason);
    }
    if (!enabled(this.options)) {
      if (projectionSupplied) return this.blocked(input.ctx, "projection_unavailable", "selection_validation");
      return input.controller.switchAutomaticProfile("reasoning", input.reason);
    }
    const current = input.controller.state();
    if (!current.effective || current.controlMode !== "automatic") {
      return this.blocked(input.ctx, "not_active", "selection_validation");
    }
    if (!projectionSupplied && current.activeProfile === "reasoning") {
      return input.controller.switchAutomaticProfile("reasoning", input.reason);
    }
    if (current.activeProfile !== "standard")
      return this.blocked(input.ctx, "profile_not_standard", "selection_validation");
    const exposure = this.exposureSnapshot;
    if (!exposure || exposure.profile !== "standard") {
      return this.blocked(input.ctx, "exposure_unavailable", "selection_validation");
    }
    if (!this.activeBlock || this.activeBlock.blockId !== exposure.blockId) {
      return this.blocked(input.ctx, "exposure_block_changed", "selection_validation");
    }
    const sessionId = sessionIdFor(input.ctx);
    const branchEntries = branchEntriesFor(input.ctx);
    const activeEntries = activeEntriesFor(input.ctx);
    if (!sessionId || !branchEntries || !activeEntries) {
      const reason = !sessionId
        ? "session_identity_unavailable"
        : !branchEntries
          ? "branch_entries_unavailable"
          : "active_context_entries_unavailable";
      return this.blocked(input.ctx, reason, "selection_validation");
    }
    if (sessionId !== exposure.sessionId) {
      return this.blocked(input.ctx, "exposure_session_changed", "selection_validation");
    }
    const handoff = this.registry.resolveSwitchHandoff({ sessionId, branchEntries, toolCallId: input.toolCallId });
    if (handoff.status === "unavailable") {
      return this.blocked(input.ctx, `handoff_${handoff.reason}`, "selection_validation");
    }
    const handoffEntry = branchEntries.find((entry) => entry.type === "message" && entry.id === handoff.source.entryId);
    if (!handoffEntry || !hasAssistantText(handoffEntry.message)) {
      return this.blocked(input.ctx, "switch_return_text_missing", "selection_validation");
    }

    const include = normalizeProjectionRefs(input.projection?.include ?? []);
    const shared = normalizeProjectionRefs(input.projection?.shared ?? []);
    if (include.status === "invalid") return this.blocked(input.ctx, include.reason, "selection_validation");
    if (shared.status === "invalid") return this.blocked(input.ctx, shared.reason, "selection_validation");
    if (new Set([...include.refs, ...shared.refs]).size !== include.refs.length + shared.refs.length) {
      return this.blocked(input.ctx, "projection_ref_duplicate", "selection_validation");
    }
    const exposureError = this.validateExposedRefs(
      exposure,
      branchEntries,
      activeEntries,
      sessionId,
      include.refs,
      shared.refs,
    );
    if (exposureError) {
      const reason = typeof exposureError === "string" ? exposureError : exposureError.reason;
      const fields =
        typeof exposureError === "string"
          ? {}
          : {
              ...(exposureError.ref ? { ref: exposureError.ref } : {}),
              ...(exposureError.role ? { role: exposureError.role } : {}),
              ...(exposureError.customType ? { customType: exposureError.customType } : {}),
              ...(exposureError.position === undefined ? {} : { position: exposureError.position }),
            };
      return this.blocked(input.ctx, reason, "selection_validation", "unchanged", fields);
    }

    let operationId: string;
    try {
      operationId = this.operationIdFactory();
    } catch {
      return this.blocked(input.ctx, "operation_identity_unavailable", "selection_validation");
    }
    const pending: ProjectionOperationState = {
      version: 1,
      operationId,
      revision: ++this.operationRevision,
      phase: "pending",
      sessionId,
      branchLeafId: exposure.branchLeafId,
      blockId: exposure.blockId,
      handoff: { assistantEntryId: handoff.source.entryId, toolCallId: input.toolCallId },
      include: [...include.refs],
      shared: [...shared.refs],
      previous: [...this.committedSelection.include],
      required: [sourceRef(handoff.source.entryId)],
      fromProfile: "standard",
      targetProfile: "reasoning",
    };
    let transition: CognitiveRoutingSwitchResult;
    try {
      transition = await input.controller.switchAutomaticProfile("reasoning", input.reason, "agent", "agent-tool");
    } catch {
      transition = { status: "inactive", reason: "transition_failed" };
    }
    const transitionedState = input.controller.state();
    if (
      transition.status !== "active" ||
      transitionedState.effective !== true ||
      transitionedState.controlMode !== "automatic" ||
      transitionedState.activeProfile !== "reasoning"
    ) {
      const modelState =
        transitionedState.activeProfile === "reasoning"
          ? "changed"
          : transition.status === "inactive"
            ? "unknown"
            : "unchanged";
      return this.blocked(input.ctx, "projection_transition_failed", "transition", modelState, { operationId });
    }
    this.pendingSelection = pending;
    this.operation = pending;
    return transition;
  }

  attributionForEntry(sessionId: string, entryId: string): SourceRegistryAttribution | undefined {
    return this.registry.attributionForEntry(sessionId, entryId);
  }

  private restorePersistedSelection(
    sessionId: string,
    branchEntries: readonly SessionEntry[],
    activeEntries: readonly SessionEntry[],
    lineage: SessionLineage,
  ): void {
    const activeEntryIds = new Set(activeEntries.flatMap((entry) => (typeof entry.id === "string" ? [entry.id] : [])));
    const branchEntryIds = new Set(
      branchEntries
        .filter((entry) => entry.type === "message")
        .flatMap((entry) => (typeof entry.id === "string" ? [entry.id] : [])),
    );
    const retainHistoricalRef = (ref: string): boolean => {
      const entryId = entryIdFromContextRef(ref);
      return entryId === undefined || !branchEntryIds.has(entryId) || activeEntryIds.has(entryId);
    };
    let state = emptySelection();
    for (const entry of branchEntries) {
      if (entry.type !== "custom" || entry.customType !== COGNITIVE_ROUTING_PROJECTION_ENTRY) continue;
      const parsed = parsePersistedSelection(entry.data, sessionId, lineage);
      if (parsed.status === "invalid") {
        this.setFailure(
          parsed.reason,
          this.diagnostic({
            code: parsed.reason,
            stage: "selection_validation",
            message: parsed.reason,
            modelState: "unchanged",
          }),
        );
        return;
      }
      const recordError = validatePersistedSelectionRecord(
        parsed.record,
        sessionId,
        branchEntries,
        entry,
        this.registry,
      );
      if (recordError) {
        this.setFailure(
          recordError,
          this.diagnostic({
            code: recordError,
            stage: "selection_validation",
            message: recordError,
            modelState: "unchanged",
          }),
        );
        return;
      }
      const historical = this.registry.hasAttributedProfileAfter(
        sessionId,
        branchEntries,
        parsed.record.handoff.resultEntryId,
        "reasoning",
      );
      const record = historical
        ? {
            ...parsed.record,
            include: parsed.record.include.filter(retainHistoricalRef),
            shared: parsed.record.shared.filter(retainHistoricalRef),
            required: parsed.record.required.filter(retainHistoricalRef),
          }
        : parsed.record;
      state = mergeSelection(state, record);
    }
    this.committedSelection = state;
  }

  private async persistSourceJournal(
    turn: CapturedTurn,
    reconciliation: Extract<TurnReconciliationResult, { status: "attributed" }>,
  ): Promise<void> {
    const journal: SourceCaptureJournal = {
      version: 1,
      sessionId: turn.sessionId,
      profile: turn.profile,
      blockId: turn.blockId,
      assistant: { ...reconciliation.assistant },
      toolResults: reconciliation.toolResults.map((source) => ({ ...source })),
    };
    await this.persist(COGNITIVE_ROUTING_SOURCE_ENTRY, journal);
  }

  private async commitPendingSelection(
    reconciliation: Extract<TurnReconciliationResult, { status: "attributed" }>,
    branchEntries: readonly SessionEntry[],
    ctx: any,
  ): Promise<string | undefined> {
    const pending = this.pendingSelection;
    if (!pending) return undefined;
    if (reconciliation.assistant.entryId !== pending.handoff.assistantEntryId) {
      return "handoff_assistant_mismatch";
    }
    const resultMatches = reconciliation.toolResults.filter(
      (source) => source.toolCallId === pending.handoff.toolCallId,
    );
    if (resultMatches.length !== 1) return "handoff_result_missing_or_ambiguous";
    const resultEntryId = resultMatches[0].entryId;
    const record: PersistedSelectionRecord = {
      version: 1,
      kind: "selection",
      status: "committed",
      sessionId: pending.sessionId,
      branchLeafId: branchLeafId(branchEntries),
      blockId: pending.blockId,
      handoff: {
        assistantEntryId: pending.handoff.assistantEntryId,
        toolCallId: pending.handoff.toolCallId,
        resultEntryId,
      },
      include: [...pending.include],
      shared: [...pending.shared],
      required: uniqueRefs(pending.required, [sourceRef(resultEntryId)]),
    };
    try {
      await this.persist(COGNITIVE_ROUTING_PROJECTION_ENTRY, record);
    } catch {
      this.operation = { ...pending, phase: "failed" };
      this.pendingSelection = undefined;
      try {
        ctx?.abort?.();
      } catch {
        // Keep the failed selection unavailable when the host abort hook fails.
      }
      return "projection_selection_persistence_failed";
    }
    this.committedSelection = mergeSelection(this.committedSelection, record);
    this.operation = {
      ...pending,
      phase: "committed",
      handoff: { ...pending.handoff, resultEntryId },
      required: [...record.required],
    };
    this.pendingSelection = undefined;
    return undefined;
  }

  private validateExposedRefs(
    exposure: ProjectionExposureSnapshot,
    branchEntries: readonly SessionEntry[],
    activeEntries: readonly SessionEntry[],
    sessionId: string,
    include: readonly string[],
    shared: readonly string[],
  ): string | ProjectionRejected | undefined {
    const exposed = new Map(exposure.sources.map((source) => [source.ref, source]));
    const includeSet = new Set(include);
    for (const ref of [...include, ...shared]) {
      const source = exposed.get(ref);
      if (!source) return { status: "rejected", reason: `projection_ref_not_exposed:${ref}`, ref };
      if (includeSet.has(ref)) {
        if (source.profile !== "standard") {
          return { status: "rejected", reason: `include_ref_not_standard:${ref}`, ref };
        }
        if (typeof source.blockId !== "string" || source.blockId.length === 0) {
          return { status: "rejected", reason: `include_ref_block_unavailable:${ref}`, ref };
        }
      }
      const entry = branchEntries.find(
        (candidate) => candidate.type === "message" && candidate.id === source.source.entryId,
      );
      const attribution = this.registry.attributionForEntry(sessionId, source.source.entryId);
      if (!entry || !attribution) return { status: "rejected", reason: `projection_ref_missing:${ref}`, ref };
      if (!isDeepStrictEqual(entry.message, attribution.message)) {
        return { status: "rejected", reason: `projection_ref_changed:${ref}`, ref };
      }
    }
    if (!this.standardContext) return "projection_context_unavailable";
    const preflightSources = this.sourcesForBranch(sessionId, branchEntries, activeEntries);
    if (preflightSources.status === "unavailable") return preflightSources.reason;
    const preflight = projectReasoningContext({
      sessionId,
      messages: this.standardContext,
      sources: preflightSources.sources,
      include,
      shared: uniqueRefs(this.committedSelection.shared, [...shared]),
      previous: this.committedSelection.include,
      required: [],
      legacyBaselineRefs: preflightSources.sources
        .filter((source) => source.legacyBaseline === true)
        .map((source) => sourceRef(source.source.entryId)),
    });
    if (preflight.status === "rejected") {
      return {
        ...preflight,
        reason: `projection_dependency_invalid:${preflight.reason}`,
      };
    }
    return undefined;
  }

  private projectReasoningTurn(
    ctx: any,
    messages: readonly any[],
    branchEntries: readonly SessionEntry[],
    activeEntries: readonly SessionEntry[],
  ): ProjectionContextResult {
    const sessionId = sessionIdFor(ctx);
    if (!sessionId) return this.rejectProjectedContext(ctx, "session_identity_unavailable", messages, true);
    const sourceResult = this.sourcesForBranch(sessionId, branchEntries, activeEntries);
    if (sourceResult.status === "unavailable")
      return this.rejectProjectedContext(ctx, sourceResult.reason, messages, true);
    const sources = sourceResult.sources;
    const baselineRefs = sources
      .filter((source) => source.legacyBaseline === true)
      .map((source) => sourceRef(source.source.entryId));
    const projected = projectReasoningContext({
      sessionId,
      messages,
      sources,
      include: [],
      shared: this.committedSelection.shared,
      previous: this.committedSelection.include,
      required: uniqueRefs(this.committedSelection.required, baselineRefs),
      legacyBaselineRefs: baselineRefs,
    });
    if (projected.status === "rejected") return this.rejectProjectedContext(ctx, projected, messages, true);
    const annotated = this.annotateMessages(projected.messages, sources, new Set(projected.visibleRefs));
    return { messages: annotated, changed: true };
  }

  private sourcesForBranch(
    sessionId: string,
    branchEntries: readonly SessionEntry[],
    activeEntries: readonly SessionEntry[],
  ): { status: "available"; sources: SupportedProjectionSource[] } | { status: "unavailable"; reason: string } {
    const branchAttributions = this.registry.attributionsForBranch(sessionId, branchEntries);
    if (branchAttributions.status === "unavailable") return branchAttributions;
    const attributionsByEntryId = new Map(
      branchAttributions.attributions.map((attribution) => [attribution.source.entryId, attribution]),
    );
    return {
      status: "available",
      sources: this.projectionCandidates(sessionId, activeEntries, attributionsByEntryId, true, branchEntries).map(
        projectionSourceForCandidate,
      ),
    };
  }

  private annotateFullContext(
    sessionId: string,
    messages: readonly any[],
    branchEntries: readonly SessionEntry[],
    activeEntries: readonly SessionEntry[],
  ): ProjectionContextResult {
    const sourceResult = this.sourcesForBranch(sessionId, branchEntries, activeEntries);
    if (sourceResult.status === "unavailable") return { messages: messages as any[], changed: false };
    const annotated = this.annotateMessages(messages, sourceResult.sources);
    return { messages: annotated, changed: annotated.some((message, index) => message !== messages[index]) };
  }

  private annotateMessages(
    messages: readonly any[],
    sources: readonly SupportedProjectionSource[],
    visibleRefs?: ReadonlySet<string>,
  ): any[] {
    return messages.map((message) => {
      const matches = sources.filter((source) => sourceMatches(message, source));
      if (matches.length !== 1) return message;
      const candidate = matches[0];
      const ref = sourceRef(candidate.source.entryId);
      if (visibleRefs && !visibleRefs.has(ref)) return message;
      return appendContextAnnotations(message, candidate, this.ownedAnnotations);
    });
  }

  private exposeStandardSources(
    ctx: any,
    messages: readonly any[],
    turn: CapturedTurn,
    branchEntries: readonly SessionEntry[],
    activeEntries: readonly SessionEntry[],
  ): ProjectionContextResult {
    this.standardContext = [...messages];
    const branchAttributions = this.registry.attributionsForBranch(turn.sessionId, branchEntries);
    if (branchAttributions.status === "unavailable") {
      this.setFailure(
        branchAttributions.reason,
        this.diagnostic({
          code: branchAttributions.reason,
          stage: "attribution",
          message: branchAttributions.reason,
          modelState: "unchanged",
        }),
      );
      this.exposureSnapshot = undefined;
      const diagnostic = this.reportFailure(ctx);
      return { messages: [...messages], changed: false, ...(diagnostic ? { diagnostic } : {}) };
    }
    const attributionsByEntryId = new Map(
      branchAttributions.attributions.map((attribution) => [attribution.source.entryId, attribution]),
    );
    const candidates = this.projectionCandidates(
      turn.sessionId,
      activeEntries,
      attributionsByEntryId,
      false,
      branchEntries,
    );
    const projectedMessages = [...messages];
    const visibleRefs: string[] = [];
    const exposedSources: ProjectionExposureSource[] = [];
    const usedSourceIds = new Set<string>();
    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index];
      const matches = candidates.filter((candidate) => sourceMatches(message, candidate));
      if (matches.length > 1) {
        this.setFailure(
          "visible_source_ambiguous",
          this.diagnostic({
            code: "visible_source_ambiguous",
            stage: "attribution",
            message: "More than one persisted source matched a visible context message.",
            modelState: "unchanged",
            position: index,
            ...(typeof message?.role === "string" ? { role: message.role } : {}),
            ...(typeof message?.customType === "string" ? { customType: message.customType } : {}),
          }),
        );
        this.exposureSnapshot = undefined;
        const diagnostic = this.reportFailure(ctx);
        return { messages: [...messages], changed: false, ...(diagnostic ? { diagnostic } : {}) };
      }
      if (matches.length === 0) continue;
      const candidate = matches[0];
      const sourceKey = `${candidate.source.sessionId}:${candidate.source.entryId}`;
      if (usedSourceIds.has(sourceKey)) {
        this.setFailure(
          "visible_source_reused",
          this.diagnostic({
            code: "visible_source_reused",
            stage: "attribution",
            message: "One persisted source matched more than one visible context message.",
            modelState: "unchanged",
            ref: sourceRef(candidate.source.entryId),
            position: index,
          }),
        );
        this.exposureSnapshot = undefined;
        const diagnostic = this.reportFailure(ctx);
        return { messages: [...messages], changed: false, ...(diagnostic ? { diagnostic } : {}) };
      }
      usedSourceIds.add(sourceKey);
      const outcome = projectContextSource({
        source: candidate.source,
        kind: candidate.kind,
        entry: { ...candidate.entry, position: index },
        message: candidate.message,
      });
      if (outcome.status !== "eligible") continue;
      const ref = outcome.source.ref;
      projectedMessages[index] = appendContextAnnotations(message, candidate, this.ownedAnnotations);
      visibleRefs.push(ref);
      exposedSources.push(exposureSourceForCandidate(candidate));
    }
    this.exposureGeneration += 1;
    this.exposureSnapshot = {
      sessionId: turn.sessionId,
      branchLeafId: branchLeafId(branchEntries),
      profile: "standard",
      blockId: turn.blockId,
      refs: [...visibleRefs],
      sources: exposedSources,
      generation: this.exposureGeneration,
    };
    return {
      messages: projectedMessages,
      changed: projectedMessages.some((message, index) => message !== messages[index]),
    };
  }

  private projectionCandidates(
    sessionId: string,
    activeEntries: readonly SessionEntry[],
    attributionsByEntryId: Map<string, SourceRegistryAttribution>,
    includeSummaries: boolean,
    branchEntries: readonly SessionEntry[] = activeEntries,
  ): ProjectionCandidate[] {
    const candidates: ProjectionCandidate[] = [];
    const activeEntryIds = new Set(activeEntries.flatMap((entry) => (typeof entry.id === "string" ? [entry.id] : [])));
    for (const entry of activeEntries) {
      if (entry.type === "custom_message" && typeof entry.id === "string" && typeof entry.customType === "string") {
        const message = sessionEntryToContextMessages(entry as any)[0];
        if (message?.role === "custom" && message.customType === entry.customType) {
          candidates.push({
            entry: { ...entry, message } as SessionEntry & { id: string; message: any },
            message,
            source: { sessionId, entryId: entry.id },
            profile: "shared",
            kind: "custom",
          });
        }
        continue;
      }
      if (entry.type === "message" && typeof entry.id === "string" && entry.message !== undefined) {
        const attribution = attributionsByEntryId.get(entry.id);
        if (attribution) {
          candidates.push({
            entry: entry as SessionEntry & { id: string; message: any },
            message: entry.message,
            source: { ...attribution.source },
            profile: attribution.profile,
            kind: attribution.kind,
            blockId: attribution.blockId,
            legacyBaseline: this.registry.isUnknownBaselineEntry(sessionId, entry.id),
            ...(this.registry.isUnknownBaselineEntry(sessionId, entry.id)
              ? (() => {
                  const legacyOutcome = legacyOutcomeForAssistant(
                    entry as SessionEntry & { id: string; message: any },
                    branchEntries,
                    activeEntryIds,
                  );
                  return {
                    ...(legacyOutcome.repairableCallIds.length > 0
                      ? { legacyRepairableCallIds: legacyOutcome.repairableCallIds }
                      : {}),
                    ...(legacyOutcome.unavailableCallIds.length > 0
                      ? { legacyOutcomeUnavailableCallIds: legacyOutcome.unavailableCallIds }
                      : {}),
                  };
                })()
              : {}),
          });
        } else if (entry.message?.role === "user") {
          candidates.push({
            entry: entry as SessionEntry & { id: string; message: any },
            message: entry.message,
            source: { sessionId, entryId: entry.id },
            profile: "user",
            kind: "user",
          });
        }
        continue;
      }
      if (!includeSummaries || typeof entry.id !== "string") continue;
      if (entry.type !== "compaction" && entry.type !== "branch_summary") continue;
      for (const message of sessionEntryToContextMessages(entry as any)) {
        candidates.push({
          entry: { ...entry, message } as SessionEntry & { id: string; message: any },
          message,
          source: { sessionId, entryId: entry.id },
          profile: "shared",
          kind: "summary",
        });
      }
    }
    return candidates;
  }

  private contextDiagnostic(rejection: ProjectionRejected, messages: readonly any[]): CognitiveRoutingDiagnostic {
    const role = rejection.role;
    const position = rejection.position;
    const candidate = position !== undefined && position >= 0 ? messages[position] : undefined;
    const message = role ? `No verifiable source was associated with the ${role} context message.` : rejection.reason;
    return this.diagnostic({
      code: rejection.reason,
      stage: "context_assembly",
      message,
      modelState: "unknown",
      ...(rejection.ref ? { ref: rejection.ref } : {}),
      ...(role ? { role } : {}),
      ...((rejection.customType ?? candidate?.customType)
        ? { customType: rejection.customType ?? candidate?.customType }
        : {}),
      ...(position === undefined ? {} : { position }),
    });
  }

  private rejectProjectedContext(
    ctx: any,
    rejectionOrReason: ProjectionRejected | string,
    messages: readonly any[],
    abort: boolean,
    latchFailure = true,
  ): ProjectionContextResult {
    const rejection: ProjectionRejected =
      typeof rejectionOrReason === "string" ? { status: "rejected", reason: rejectionOrReason } : rejectionOrReason;
    const reason = rejection.reason;
    const contextDiagnostic = this.contextDiagnostic(rejection, messages);
    if (!this.failure && latchFailure) {
      this.setFailure(
        reason,
        this.pendingSelection || this.operation?.phase === "committed"
          ? { ...contextDiagnostic, modelState: "changed" }
          : contextDiagnostic,
      );
    }
    const diagnostic = this.failure ? this.reportFailure(ctx) : this.reportDiagnostic(ctx, contextDiagnostic);
    if (abort) this.abort(ctx);
    return {
      messages: messages as any[],
      changed: false,
      ...(diagnostic ? { diagnostic } : {}),
    };
  }

  private abort(ctx: any): void {
    try {
      ctx?.abort?.();
    } catch {
      // Preserve the failed state when the host abort hook is unavailable.
    }
  }

  private persist(customType: string, data: unknown): void | Promise<void> {
    if (typeof this.options.appendEntry !== "function") throw new Error("projection_persistence_unavailable");
    const result = this.options.appendEntry(customType, data);
    if (result && typeof (result as any).then === "function") {
      return Promise.resolve(result).then(() => undefined);
    }
  }
}
