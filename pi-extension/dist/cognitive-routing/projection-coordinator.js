import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { sessionEntryToContextMessages } from "@earendil-works/pi-coding-agent";
import { projectContextSource } from "../freeflow-context/source-projector.js";
import { contextRefForEntry, entryIdFromContextRef } from "../freeflow-context/types.js";
import { projectReasoningContext } from "./context-projection.js";
import { CognitiveRoutingSourceRegistry } from "./source-registry.js";
export const COGNITIVE_ROUTING_SOURCE_ENTRY = "freeflow-cognitive-routing-source";
export const COGNITIVE_ROUTING_PROJECTION_ENTRY = "freeflow-cognitive-routing-projection";
export const COGNITIVE_ROUTING_PROJECTION_MARKER_PREFIX = "[projection-ref: ";
function sessionIdFor(ctx) {
  try {
    const sessionId = ctx?.sessionManager?.getSessionId?.();
    return typeof sessionId === "string" && sessionId.trim().length > 0 ? sessionId : undefined;
  } catch {
    return undefined;
  }
}
function branchEntriesFor(ctx) {
  try {
    const manager = ctx?.sessionManager;
    if (typeof manager?.getBranch !== "function") return undefined;
    const entries = manager.getBranch();
    return Array.isArray(entries) ? entries : undefined;
  } catch {
    return undefined;
  }
}
function activeEntriesFor(ctx) {
  try {
    const manager = ctx?.sessionManager;
    if (typeof manager?.buildContextEntries !== "function") return undefined;
    const entries = manager.buildContextEntries();
    return Array.isArray(entries) ? entries : undefined;
  } catch {
    return undefined;
  }
}
function markerText(ref) {
  return `${COGNITIVE_ROUTING_PROJECTION_MARKER_PREFIX}${ref}]`;
}
function appendProjectionMarker(message, ref, ownedAnnotations) {
  if (message && typeof message === "object" && ownedAnnotations.get(message) === ref) return message;
  if (message?.role !== "user" && message?.role !== "assistant" && message?.role !== "toolResult") {
    return message;
  }
  const marker = { type: "text", text: markerText(ref) };
  const baseContent = message.content;
  const content = Array.isArray(baseContent)
    ? [...baseContent, marker]
    : typeof baseContent === "string"
      ? [{ type: "text", text: baseContent }, marker]
      : [marker];
  const annotated = { ...message, content };
  if (annotated && typeof annotated === "object") ownedAnnotations.set(annotated, ref);
  return annotated;
}
function routingState(options) {
  try {
    return options.getRoutingState();
  } catch {
    return undefined;
  }
}
function enabled(options) {
  try {
    return options.isEnabled() === true;
  } catch {
    return false;
  }
}
function branchLeafId(branchEntries) {
  const id = branchEntries.at(-1)?.id;
  return typeof id === "string" ? id : null;
}
function normalizeProjectionRefs(values) {
  if (!Array.isArray(values)) return { status: "invalid", reason: "projection_refs_invalid" };
  const refs = [];
  const seen = new Set();
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
function uniqueRefs(...groups) {
  return [...new Set(groups.flat())];
}
function sourceRef(entryId) {
  return contextRefForEntry(entryId);
}
function hasAssistantText(message) {
  return Array.isArray(message?.content)
    ? message.content.some((part) => part?.type === "text" && typeof part.text === "string" && part.text.trim())
    : typeof message?.content === "string" && message.content.trim().length > 0;
}
function cloneExposureSource(source) {
  return { ...source, source: { ...source.source } };
}
function cloneOperation(operation) {
  return {
    ...operation,
    handoff: { ...operation.handoff },
    include: [...operation.include],
    shared: [...operation.shared],
    previous: [...operation.previous],
    required: [...operation.required],
  };
}
function sourceMatches(message, source) {
  return source.message === message || isDeepStrictEqual(source.message, message);
}
function projectionSourceForCandidate(candidate) {
  return {
    source: { ...candidate.source },
    message: candidate.message,
    profile: candidate.profile,
    kind: candidate.kind,
    ...(candidate.blockId ? { blockId: candidate.blockId } : {}),
  };
}
function exposureSourceForCandidate(candidate) {
  return {
    ref: sourceRef(candidate.source.entryId),
    source: { ...candidate.source },
    profile: candidate.profile,
    kind: candidate.kind,
    ...(candidate.blockId ? { blockId: candidate.blockId } : {}),
  };
}
function emptySelection() {
  return { include: [], shared: [], required: [] };
}
function mergeSelection(base, record) {
  return {
    include: uniqueRefs(base.include, record.include),
    shared: uniqueRefs(base.shared, record.shared),
    required: uniqueRefs(base.required, record.required),
  };
}
function parsePersistedSelection(data, sessionId) {
  if (data?.version !== 1 || data?.kind !== "selection" || data?.status !== "committed") {
    return { status: "invalid", reason: "projection_record_unrecognized" };
  }
  if (data.sessionId !== sessionId || typeof data.blockId !== "string") {
    return { status: "invalid", reason: "projection_record_session_invalid" };
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
  options;
  registry = new CognitiveRoutingSourceRegistry();
  idFactory;
  operationIdFactory;
  activeBlock;
  capturedTurn;
  exposureSnapshot;
  standardContext;
  ownedAnnotations = new WeakMap();
  pendingSelection;
  operation;
  committedSelection = emptySelection();
  operationRevision = 0;
  exposureGeneration = 0;
  failure;
  constructor(options) {
    this.options = options;
    this.idFactory = options.idFactory ?? (() => randomUUID());
    this.operationIdFactory = options.operationIdFactory ?? (() => randomUUID());
  }
  reset() {
    this.registry.clear();
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
  }
  turnStart(ctx) {
    this.exposureSnapshot = undefined;
    const state = routingState(this.options);
    const eligible =
      enabled(this.options) && state?.effective === true && state.controlMode === "automatic" && state.activeProfile;
    if (!eligible) {
      this.capturedTurn = undefined;
      return;
    }
    if (this.capturedTurn) {
      this.failure = "turn_previous_unresolved";
      return;
    }
    const sessionId = sessionIdFor(ctx);
    const branchEntries = branchEntriesFor(ctx);
    const activeEntries = activeEntriesFor(ctx);
    if (!sessionId || !branchEntries || !activeEntries) {
      this.failure = !sessionId
        ? "session_identity_unavailable"
        : !branchEntries
          ? "branch_entries_unavailable"
          : "active_context_entries_unavailable";
      return;
    }
    this.registry.hydrate(sessionId, branchEntries);
    this.restorePersistedSelection(sessionId, branchEntries, activeEntries);
    let blockId;
    try {
      if (!this.activeBlock || this.activeBlock.profile !== state.activeProfile) {
        this.activeBlock = { profile: state.activeProfile, blockId: this.idFactory() };
      }
      blockId = this.activeBlock.blockId;
    } catch {
      this.failure = "block_identity_unavailable";
      return;
    }
    this.capturedTurn = {
      sessionId,
      profile: state.activeProfile,
      blockId,
      baselineEstablished: false,
    };
  }
  context(ctx, messages) {
    if (!enabled(this.options)) {
      this.exposureSnapshot = undefined;
      return { messages: messages, changed: false };
    }
    const turn = this.capturedTurn;
    const state = routingState(this.options);
    const eligible = state?.effective === true && state.controlMode === "automatic" && state.activeProfile;
    if (!eligible) {
      this.exposureSnapshot = undefined;
      return { messages: messages, changed: false };
    }
    const cancellationRequired =
      state.activeProfile === "reasoning" || this.pendingSelection !== undefined || this.operation?.phase === "failed";
    if (!turn) {
      return this.rejectProjectedContext(
        ctx,
        this.failure ?? "turn_capture_unavailable",
        messages,
        cancellationRequired,
      );
    }
    const sessionId = sessionIdFor(ctx);
    const branchEntries = branchEntriesFor(ctx);
    const activeEntries = activeEntriesFor(ctx);
    if (!sessionId || !branchEntries || !activeEntries || sessionId !== turn.sessionId) {
      return this.rejectProjectedContext(
        ctx,
        !sessionId
          ? "session_identity_unavailable"
          : !branchEntries
            ? "branch_entries_unavailable"
            : !activeEntries
              ? "active_context_entries_unavailable"
              : "turn_session_changed",
        messages,
        cancellationRequired,
      );
    }
    if (this.failure) {
      return this.rejectProjectedContext(ctx, this.failure, messages, cancellationRequired);
    }
    this.registry.hydrate(sessionId, branchEntries);
    this.restorePersistedSelection(sessionId, branchEntries, activeEntries);
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
        return this.rejectProjectedContext(
          ctx,
          error instanceof Error ? error.message : String(error),
          messages,
          cancellationRequired,
        );
      }
    }
    if (turn.profile === "reasoning") {
      return this.projectReasoningTurn(ctx, messages, branchEntries, activeEntries);
    }
    return this.exposeStandardSources(messages, turn, branchEntries, activeEntries);
  }
  async turnEnd(ctx, event) {
    const turn = this.capturedTurn;
    if (!turn) return { status: "ignored" };
    if (this.failure) {
      const reason = this.failure;
      this.capturedTurn = undefined;
      if (turn.profile === "reasoning" || this.pendingSelection !== undefined || this.operation?.phase === "failed") {
        this.abort(ctx);
      }
      return { status: "unavailable", reason };
    }
    const sessionId = sessionIdFor(ctx);
    const branchEntries = branchEntriesFor(ctx);
    if (!sessionId || !branchEntries || sessionId !== turn.sessionId || !turn.baselineEstablished) {
      const reason = sessionId
        ? branchEntries
          ? sessionId === turn.sessionId
            ? "turn_baseline_missing"
            : "turn_session_changed"
          : "branch_entries_unavailable"
        : "session_identity_unavailable";
      this.failure = reason;
      this.capturedTurn = undefined;
      if (turn.profile === "reasoning" || this.pendingSelection !== undefined || this.operation?.phase === "failed") {
        this.abort(ctx);
      }
      return { status: "unavailable", reason };
    }
    this.registry.hydrate(sessionId, branchEntries);
    const reconciliation = this.registry.reconcileTurn({
      sessionId,
      branchEntries,
      assistantMessage: event?.message,
      toolResults: event?.toolResults ?? [],
    });
    if (reconciliation.status === "unavailable") {
      this.failure = reconciliation.reason;
      this.capturedTurn = undefined;
      if (turn.profile === "reasoning" || this.pendingSelection !== undefined || this.operation?.phase === "failed") {
        this.abort(ctx);
      }
      return { status: "unavailable", reason: reconciliation.reason };
    }
    if (reconciliation.status === "already_attributed") {
      this.capturedTurn = undefined;
      return { status: "captured", profile: turn.profile, blockId: turn.blockId };
    }
    try {
      await this.persistSourceJournal(turn, reconciliation);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.failure = reason;
      this.exposureSnapshot = undefined;
      this.capturedTurn = undefined;
      if (turn.profile === "reasoning" || this.pendingSelection !== undefined || this.operation?.phase === "failed") {
        this.abort(ctx);
      }
      return { status: "unavailable", reason };
    }
    if (turn.profile === "standard" && this.pendingSelection) {
      const completionError = await this.commitPendingSelection(reconciliation, branchEntries, ctx);
      if (completionError) {
        this.failure = completionError;
        this.capturedTurn = undefined;
        this.abort(ctx);
        return { status: "unavailable", reason: completionError };
      }
    }
    this.capturedTurn = undefined;
    return { status: "captured", profile: turn.profile, blockId: turn.blockId };
  }
  exposure() {
    return this.exposureSnapshot
      ? {
          ...this.exposureSnapshot,
          refs: [...this.exposureSnapshot.refs],
          sources: this.exposureSnapshot.sources.map(cloneExposureSource),
        }
      : undefined;
  }
  failureReason() {
    return this.failure;
  }
  operationState() {
    return this.operation ? cloneOperation(this.operation) : undefined;
  }
  async switchProfile(input) {
    const projectionSupplied = input.projection !== undefined;
    if (input.target !== "standard" && input.target !== "reasoning") {
      return { status: "blocked", reason: "target_invalid" };
    }
    if (input.target !== "reasoning") {
      if (projectionSupplied) return { status: "blocked", reason: "projection_target_must_be_reasoning" };
      return input.controller.switchAutomaticProfile(input.target, input.reason);
    }
    if (!enabled(this.options)) {
      if (projectionSupplied) return { status: "blocked", reason: "projection_unavailable" };
      return input.controller.switchAutomaticProfile("reasoning", input.reason);
    }
    const current = input.controller.state();
    if (!current.effective || current.controlMode !== "automatic") return { status: "blocked", reason: "not_active" };
    if (current.activeProfile !== "standard") return { status: "blocked", reason: "profile_not_standard" };
    const exposure = this.exposureSnapshot;
    if (!exposure || exposure.profile !== "standard") return { status: "blocked", reason: "exposure_unavailable" };
    if (!this.activeBlock || this.activeBlock.blockId !== exposure.blockId) {
      return { status: "blocked", reason: "exposure_block_changed" };
    }
    const sessionId = sessionIdFor(input.ctx);
    const branchEntries = branchEntriesFor(input.ctx);
    const activeEntries = activeEntriesFor(input.ctx);
    if (!sessionId || !branchEntries || !activeEntries) {
      return {
        status: "blocked",
        reason: !sessionId
          ? "session_identity_unavailable"
          : !branchEntries
            ? "branch_entries_unavailable"
            : "active_context_entries_unavailable",
      };
    }
    if (sessionId !== exposure.sessionId) return { status: "blocked", reason: "exposure_session_changed" };
    const handoff = this.registry.resolveSwitchHandoff({ sessionId, branchEntries, toolCallId: input.toolCallId });
    if (handoff.status === "unavailable") return { status: "blocked", reason: `handoff_${handoff.reason}` };
    const handoffEntry = branchEntries.find((entry) => entry.type === "message" && entry.id === handoff.source.entryId);
    if (!handoffEntry || !hasAssistantText(handoffEntry.message)) {
      return { status: "blocked", reason: "switch_return_text_missing" };
    }
    const include = normalizeProjectionRefs(input.projection?.include ?? []);
    const shared = normalizeProjectionRefs(input.projection?.shared ?? []);
    if (include.status === "invalid") return { status: "blocked", reason: include.reason };
    if (shared.status === "invalid") return { status: "blocked", reason: shared.reason };
    if (new Set([...include.refs, ...shared.refs]).size !== include.refs.length + shared.refs.length) {
      return { status: "blocked", reason: "projection_ref_duplicate" };
    }
    const exposureError = this.validateExposedRefs(
      exposure,
      branchEntries,
      activeEntries,
      sessionId,
      include.refs,
      shared.refs,
    );
    if (exposureError) return { status: "blocked", reason: exposureError };
    let operationId;
    try {
      operationId = this.operationIdFactory();
    } catch {
      return { status: "blocked", reason: "operation_identity_unavailable" };
    }
    const pending = {
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
    let transition;
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
      return { status: "blocked", reason: "projection_transition_failed" };
    }
    this.pendingSelection = pending;
    this.operation = pending;
    return transition;
  }
  attributionForEntry(sessionId, entryId) {
    return this.registry.attributionForEntry(sessionId, entryId);
  }
  restorePersistedSelection(sessionId, branchEntries, activeEntries) {
    const activeEntryIds = new Set(activeEntries.flatMap((entry) => (typeof entry.id === "string" ? [entry.id] : [])));
    const branchEntryIds = new Set(
      branchEntries
        .filter((entry) => entry.type === "message")
        .flatMap((entry) => (typeof entry.id === "string" ? [entry.id] : [])),
    );
    const retainHistoricalRef = (ref) => {
      const entryId = entryIdFromContextRef(ref);
      return entryId === undefined || !branchEntryIds.has(entryId) || activeEntryIds.has(entryId);
    };
    let state = emptySelection();
    for (const entry of branchEntries) {
      if (entry.type !== "custom" || entry.customType !== COGNITIVE_ROUTING_PROJECTION_ENTRY) continue;
      const parsed = parsePersistedSelection(entry.data, sessionId);
      if (parsed.status === "invalid") {
        this.failure = parsed.reason;
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
  async persistSourceJournal(turn, reconciliation) {
    const journal = {
      version: 1,
      sessionId: turn.sessionId,
      profile: turn.profile,
      blockId: turn.blockId,
      assistant: { ...reconciliation.assistant },
      toolResults: reconciliation.toolResults.map((source) => ({ ...source })),
    };
    await this.persist(COGNITIVE_ROUTING_SOURCE_ENTRY, journal);
  }
  async commitPendingSelection(reconciliation, branchEntries, ctx) {
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
    const record = {
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
  validateExposedRefs(exposure, branchEntries, activeEntries, sessionId, include, shared) {
    const exposed = new Map(exposure.sources.map((source) => [source.ref, source]));
    const includeSet = new Set(include);
    for (const ref of [...include, ...shared]) {
      const source = exposed.get(ref);
      if (!source) return `projection_ref_not_exposed:${ref}`;
      if (includeSet.has(ref) && (source.profile !== "standard" || source.blockId !== exposure.blockId)) {
        return `include_ref_not_current_block:${ref}`;
      }
      const entry = branchEntries.find(
        (candidate) => candidate.type === "message" && candidate.id === source.source.entryId,
      );
      const attribution = this.registry.attributionForEntry(sessionId, source.source.entryId);
      if (!entry || !attribution) return `projection_ref_missing:${ref}`;
      if (!isDeepStrictEqual(entry.message, attribution.message)) return `projection_ref_changed:${ref}`;
    }
    if (!this.standardContext) return "projection_context_unavailable";
    const preflightSources = this.sourcesForBranch(sessionId, branchEntries, activeEntries);
    if (preflightSources.status === "unavailable") return preflightSources.reason;
    const preflight = projectReasoningContext({
      sessionId,
      messages: this.standardContext,
      sources: preflightSources.sources,
      currentBlockId: exposure.blockId,
      include,
      shared: uniqueRefs(this.committedSelection.shared, [...shared]),
      previous: this.committedSelection.include,
      required: [],
    });
    if (preflight.status === "rejected") return `projection_dependency_invalid:${preflight.reason}`;
    return undefined;
  }
  projectReasoningTurn(ctx, messages, branchEntries, activeEntries) {
    const sessionId = sessionIdFor(ctx);
    if (!sessionId) return this.rejectProjectedContext(ctx, "session_identity_unavailable", messages, true);
    const sourceResult = this.sourcesForBranch(sessionId, branchEntries, activeEntries);
    if (sourceResult.status === "unavailable")
      return this.rejectProjectedContext(ctx, sourceResult.reason, messages, true);
    const sources = sourceResult.sources;
    const projected = projectReasoningContext({
      sessionId,
      messages,
      sources,
      include: [],
      shared: this.committedSelection.shared,
      previous: this.committedSelection.include,
      required: this.committedSelection.required,
    });
    if (projected.status === "rejected") return this.rejectProjectedContext(ctx, projected.reason, messages, true);
    return { messages: projected.messages, changed: true };
  }
  sourcesForBranch(sessionId, branchEntries, activeEntries) {
    const branchAttributions = this.registry.attributionsForBranch(sessionId, branchEntries);
    if (branchAttributions.status === "unavailable") return branchAttributions;
    const attributionsByEntryId = new Map(
      branchAttributions.attributions.map((attribution) => [attribution.source.entryId, attribution]),
    );
    return {
      status: "available",
      sources: this.projectionCandidates(sessionId, activeEntries, attributionsByEntryId, true).map(
        projectionSourceForCandidate,
      ),
    };
  }
  exposeStandardSources(messages, turn, branchEntries, activeEntries) {
    this.standardContext = [...messages];
    const branchAttributions = this.registry.attributionsForBranch(turn.sessionId, branchEntries);
    if (branchAttributions.status === "unavailable") {
      this.failure = branchAttributions.reason;
      this.exposureSnapshot = undefined;
      return { messages: [...messages], changed: false };
    }
    const attributionsByEntryId = new Map(
      branchAttributions.attributions.map((attribution) => [attribution.source.entryId, attribution]),
    );
    const candidates = this.projectionCandidates(turn.sessionId, activeEntries, attributionsByEntryId, false);
    const projectedMessages = [...messages];
    const visibleRefs = [];
    const exposedSources = [];
    const usedSourceIds = new Set();
    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index];
      const matches = candidates.filter((candidate) => sourceMatches(message, candidate));
      if (matches.length > 1) {
        this.failure = "visible_source_ambiguous";
        this.exposureSnapshot = undefined;
        return { messages: [...messages], changed: false };
      }
      if (matches.length === 0) continue;
      const candidate = matches[0];
      const sourceKey = `${candidate.source.sessionId}:${candidate.source.entryId}`;
      if (usedSourceIds.has(sourceKey)) {
        this.failure = "visible_source_reused";
        this.exposureSnapshot = undefined;
        return { messages: [...messages], changed: false };
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
      projectedMessages[index] = appendProjectionMarker(message, ref, this.ownedAnnotations);
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
  projectionCandidates(sessionId, activeEntries, attributionsByEntryId, includeSummaries) {
    const candidates = [];
    for (const entry of activeEntries) {
      if (entry.type === "message" && typeof entry.id === "string" && entry.message !== undefined) {
        const attribution = attributionsByEntryId.get(entry.id);
        if (attribution) {
          candidates.push({
            entry: entry,
            message: entry.message,
            source: { ...attribution.source },
            profile: attribution.profile,
            kind: attribution.kind,
            blockId: attribution.blockId,
          });
        } else if (entry.message?.role === "user") {
          candidates.push({
            entry: entry,
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
      for (const message of sessionEntryToContextMessages(entry)) {
        candidates.push({
          entry: { ...entry, message },
          message,
          source: { sessionId, entryId: entry.id },
          profile: "shared",
          kind: "summary",
        });
      }
    }
    return candidates;
  }
  rejectProjectedContext(ctx, reason, messages, abort) {
    this.failure = this.failure ?? reason;
    if (abort) this.abort(ctx);
    return { messages: messages, changed: false };
  }
  abort(ctx) {
    try {
      ctx?.abort?.();
    } catch {
      // Preserve the failed state when the host abort hook is unavailable.
    }
  }
  persist(customType, data) {
    if (typeof this.options.appendEntry !== "function") throw new Error("projection_persistence_unavailable");
    const result = this.options.appendEntry(customType, data);
    if (result && typeof result.then === "function") {
      return Promise.resolve(result).then(() => undefined);
    }
  }
}
