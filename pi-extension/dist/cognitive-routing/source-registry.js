import { isDeepStrictEqual } from "node:util";
export const COGNITIVE_ROUTING_BASELINE_ENTRY = "freeflow-cognitive-routing-baseline";
function messageEntry(entry) {
  return entry.type === "message" && typeof entry.id === "string" && entry.message !== undefined;
}
function toolCallIds(message) {
  if (message?.role !== "assistant" || !Array.isArray(message.content)) return [];
  return message.content
    .filter((part) => part?.type === "toolCall" && typeof part.id === "string")
    .map((part) => part.id);
}
function branchIndex(branchEntries, entryId) {
  if (entryId === null) return -1;
  return branchEntries.findIndex((entry) => entry.id === entryId);
}
function sourceFor(entry, sessionId) {
  return {
    sessionId,
    entryId: entry.id,
    ...(typeof entry.message.toolCallId === "string" ? { toolCallId: entry.message.toolCallId } : {}),
    ...(typeof entry.message.toolName === "string" ? { toolName: entry.message.toolName } : {}),
  };
}
function immutableSnapshot(value) {
  const snapshot = structuredClone(value);
  const seen = new WeakSet();
  const freeze = (candidate) => {
    if (!candidate || typeof candidate !== "object" || seen.has(candidate)) return candidate;
    seen.add(candidate);
    for (const child of Object.values(candidate)) freeze(child);
    return Object.freeze(candidate);
  };
  return freeze(snapshot);
}
function cloneAttribution(attribution) {
  return {
    source: { ...attribution.source },
    profile: attribution.profile,
    ...(attribution.blockId === undefined ? {} : { blockId: attribution.blockId }),
    kind: attribution.kind,
    message: structuredClone(attribution.message),
  };
}
function sameAttribution(a, b) {
  return (
    a.profile === b.profile &&
    a.blockId === b.blockId &&
    a.kind === b.kind &&
    isDeepStrictEqual(a.source, b.source) &&
    isDeepStrictEqual(a.message, b.message)
  );
}
function unknownAttributionForEntry(entry, sessionId) {
  const kind =
    entry.message?.role === "assistant" ? "assistant" : entry.message?.role === "toolResult" ? "toolResult" : undefined;
  if (!kind) return undefined;
  return {
    source: sourceFor(entry, sessionId),
    profile: "unknown",
    kind,
    message: immutableSnapshot(entry.message),
  };
}
export class CognitiveRoutingSourceRegistry {
  activeTurn;
  sources = new Map();
  attributions = new Map();
  conflicts = new Set();
  baselineEntries = new Set();
  beginTurn(input) {
    if (this.activeTurn && !this.activeTurn.attributed) throw new Error("active_turn_unresolved");
    const baselineLeafId = input.branchEntries.at(-1)?.id;
    this.activeTurn = {
      sessionId: input.sessionId,
      profile: input.profile,
      blockId: input.blockId,
      baselineLeafId: typeof baselineLeafId === "string" ? baselineLeafId : null,
    };
  }
  reconcileTurn(input) {
    const turn = this.activeTurn;
    if (!turn) return { status: "unavailable", reason: "no_active_turn" };
    if (turn.sessionId !== input.sessionId) return { status: "unavailable", reason: "turn_session_changed" };
    const baselineIndex = branchIndex(input.branchEntries, turn.baselineLeafId);
    if (turn.baselineLeafId !== null && baselineIndex === -1) {
      return { status: "unavailable", reason: "turn_branch_changed" };
    }
    const appended = input.branchEntries.slice(baselineIndex + 1).filter(messageEntry);
    const expected = [input.assistantMessage, ...input.toolResults];
    if (appended.length !== expected.length) {
      return { status: "unavailable", reason: "finalized_entry_count_mismatch" };
    }
    const matched = this.matchExpectedEntries(expected, appended);
    if (matched.status !== "matched") return matched;
    if (turn.attributed) {
      if (
        !turn.completedObservation ||
        !isDeepStrictEqual(input.assistantMessage, turn.completedObservation.assistantMessage) ||
        !isDeepStrictEqual(input.toolResults, turn.completedObservation.toolResults) ||
        matched.entries[0].id !== turn.attributed.assistant.entryId ||
        matched.entries
          .slice(1)
          .map((entry) => entry.id)
          .join(",") !== turn.attributed.toolResults.map((source) => source.entryId).join(",")
      ) {
        return { status: "unavailable", reason: "completed_observation_changed" };
      }
      return { status: "already_attributed", blockId: turn.blockId, profile: turn.profile };
    }
    const assistantEntry = matched.entries[0];
    if (assistantEntry.message.role !== "assistant") {
      return { status: "unavailable", reason: "assistant_entry_missing" };
    }
    const calls = toolCallIds(assistantEntry.message);
    if (new Set(calls).size !== calls.length) {
      return { status: "unavailable", reason: "assistant_tool_call_ids_ambiguous" };
    }
    const toolEntries = matched.entries.slice(1);
    if (toolEntries.length !== calls.length) {
      return { status: "unavailable", reason: "tool_result_count_mismatch" };
    }
    const callNames = new Map(
      (assistantEntry.message.content ?? [])
        .filter((part) => part?.type === "toolCall" && typeof part.id === "string")
        .map((part) => [part.id, part.name]),
    );
    const seenResults = new Set();
    for (const toolEntry of toolEntries) {
      if (toolEntry.message.role !== "toolResult" || typeof toolEntry.message.toolCallId !== "string") {
        return { status: "unavailable", reason: "tool_result_entry_missing" };
      }
      const toolCallId = toolEntry.message.toolCallId;
      if (!calls.includes(toolCallId)) return { status: "unavailable", reason: `tool_result_not_linked:${toolCallId}` };
      if (seenResults.has(toolCallId)) return { status: "unavailable", reason: `tool_result_duplicate:${toolCallId}` };
      if (toolEntry.message.toolName !== callNames.get(toolCallId)) {
        return { status: "unavailable", reason: `tool_result_tool_mismatch:${toolCallId}` };
      }
      seenResults.add(toolCallId);
    }
    const attribution = {
      status: "attributed",
      blockId: turn.blockId,
      profile: turn.profile,
      assistant: sourceFor(assistantEntry, turn.sessionId),
      toolResults: toolEntries.map((entry) => sourceFor(entry, turn.sessionId)),
    };
    let completedObservation;
    let storedAttributions;
    try {
      completedObservation = {
        assistantMessage: structuredClone(input.assistantMessage),
        toolResults: structuredClone(input.toolResults),
      };
      storedAttributions = [
        {
          source: { ...attribution.assistant },
          profile: attribution.profile,
          blockId: attribution.blockId,
          kind: "assistant",
          message: immutableSnapshot(assistantEntry.message),
        },
        ...toolEntries.map((entry) => ({
          source: { ...sourceFor(entry, turn.sessionId) },
          profile: attribution.profile,
          blockId: attribution.blockId,
          kind: "toolResult",
          message: immutableSnapshot(entry.message),
        })),
      ];
    } catch {
      return { status: "unavailable", reason: "attributed_snapshot_failed" };
    }
    for (const stored of storedAttributions) {
      const key = `${stored.source.sessionId}:${stored.source.entryId}`;
      const existing = this.attributions.get(key);
      if (existing && !sameAttribution(existing, stored)) {
        return { status: "unavailable", reason: `attributed_entry_conflict:${stored.source.entryId}` };
      }
    }
    for (const stored of storedAttributions) {
      const key = `${stored.source.sessionId}:${stored.source.entryId}`;
      this.sources.set(key, { ...stored.source });
      this.attributions.set(key, stored);
    }
    this.activeTurn = {
      ...turn,
      attributed: attribution,
      completedObservation,
    };
    return {
      status: attribution.status,
      blockId: attribution.blockId,
      profile: attribution.profile,
      assistant: { ...attribution.assistant },
      toolResults: attribution.toolResults.map((source) => ({ ...source })),
    };
  }
  resolveSwitchHandoff(input) {
    const turn = this.activeTurn;
    if (!turn) return { status: "unavailable", reason: "no_active_turn" };
    if (turn.sessionId !== input.sessionId) return { status: "unavailable", reason: "turn_session_changed" };
    if (turn.attributed) return { status: "unavailable", reason: "turn_already_attributed" };
    const baselineIndex = branchIndex(input.branchEntries, turn.baselineLeafId);
    if (turn.baselineLeafId !== null && baselineIndex === -1) {
      return { status: "unavailable", reason: "turn_branch_changed" };
    }
    const candidates = input.branchEntries
      .slice(baselineIndex + 1)
      .filter(messageEntry)
      .filter((entry) => {
        if (entry.message.role !== "assistant" || !Array.isArray(entry.message.content)) return false;
        return entry.message.content.some(
          (part) =>
            part?.type === "toolCall" && part.id === input.toolCallId && part.name === "freeflow_switch_profile",
        );
      });
    if (candidates.length === 0) return { status: "unavailable", reason: "switch_assistant_not_found" };
    if (candidates.length !== 1) return { status: "unavailable", reason: "switch_assistant_ambiguous" };
    const matchingCalls = candidates[0].message.content.filter(
      (part) => part?.type === "toolCall" && part.id === input.toolCallId && part.name === "freeflow_switch_profile",
    );
    if (matchingCalls.length !== 1) return { status: "unavailable", reason: "switch_call_ambiguous" };
    return {
      status: "available",
      source: { sessionId: input.sessionId, entryId: candidates[0].id, toolCallId: input.toolCallId },
    };
  }
  hydrate(sessionId, branchEntries, inheritedSessionIds = new Set(), lineageAvailable = true) {
    this.baselineEntries.clear();
    const acceptedSessionIds = new Set([sessionId, ...inheritedSessionIds]);
    const entriesById = new Map();
    for (const entry of branchEntries) {
      if (!messageEntry(entry)) continue;
      if (entriesById.has(entry.id)) return { status: "unavailable", reason: `attributed_entry_ambiguous:${entry.id}` };
      entriesById.set(entry.id, entry);
    }
    const prepared = [];
    for (const entry of branchEntries) {
      if (entry.type !== "custom" || entry.customType !== "freeflow-cognitive-routing-source") continue;
      const data = entry.data;
      if (data?.version !== 1) return { status: "unavailable", reason: "source_entry_unrecognized" };
      if (typeof data.sessionId !== "string" || !acceptedSessionIds.has(data.sessionId)) {
        return {
          status: "unavailable",
          reason: lineageAvailable ? "source_entry_session_invalid" : "source_entry_lineage_unavailable",
        };
      }
      if (
        (data.profile !== "standard" && data.profile !== "reasoning") ||
        typeof data.blockId !== "string" ||
        !data.assistant ||
        !Array.isArray(data.toolResults)
      ) {
        return { status: "unavailable", reason: "source_entry_invalid" };
      }
      const originSessionId = data.sessionId;
      const journalIndex = branchEntries.findIndex((candidate) => candidate.id === entry.id);
      const assistantSource = data.assistant;
      if (
        assistantSource.sessionId !== originSessionId ||
        typeof assistantSource.entryId !== "string" ||
        assistantSource.entryId.length === 0
      ) {
        return { status: "unavailable", reason: "source_entry_assistant_invalid" };
      }
      const assistantEntry = entriesById.get(assistantSource.entryId);
      if (!assistantEntry || assistantEntry.message.role !== "assistant") {
        return { status: "unavailable", reason: "source_entry_assistant_missing" };
      }
      const callIds = toolCallIds(assistantEntry.message);
      if (new Set(callIds).size !== callIds.length) {
        return { status: "unavailable", reason: "source_entry_assistant_calls_ambiguous" };
      }
      const callNames = new Map(
        (assistantEntry.message.content ?? [])
          .filter((part) => part?.type === "toolCall" && typeof part.id === "string")
          .map((part) => [part.id, part.name]),
      );
      const assistantIndex = branchEntries.findIndex((candidate) => candidate.id === assistantEntry.id);
      if (journalIndex < 0 || assistantIndex < 0 || assistantIndex >= journalIndex) {
        return { status: "unavailable", reason: "source_entry_assistant_order_invalid" };
      }
      const storedForJournal = [
        {
          source: { ...assistantSource, sessionId },
          profile: data.profile,
          blockId: data.blockId,
          kind: "assistant",
          message: immutableSnapshot(assistantEntry.message),
        },
      ];
      let previousResultIndex = assistantIndex;
      const seenCalls = new Set();
      for (let index = 0; index < data.toolResults.length; index += 1) {
        const source = data.toolResults[index];
        if (
          !source ||
          source.sessionId !== originSessionId ||
          typeof source.entryId !== "string" ||
          source.entryId.length === 0 ||
          typeof source.toolCallId !== "string" ||
          source.toolCallId !== callIds[index] ||
          seenCalls.has(source.toolCallId)
        ) {
          return { status: "unavailable", reason: "source_entry_tool_result_invalid" };
        }
        const resultEntry = entriesById.get(source.entryId);
        const resultIndex = branchEntries.findIndex((candidate) => candidate.id === source.entryId);
        if (
          !resultEntry ||
          resultEntry.message.role !== "toolResult" ||
          resultIndex <= previousResultIndex ||
          resultIndex >= journalIndex ||
          resultEntry.message.toolCallId !== source.toolCallId ||
          resultEntry.message.toolName !== callNames.get(source.toolCallId) ||
          (typeof source.toolName === "string" && source.toolName !== resultEntry.message.toolName)
        ) {
          return { status: "unavailable", reason: "source_entry_tool_result_mismatch" };
        }
        seenCalls.add(source.toolCallId);
        previousResultIndex = resultIndex;
        storedForJournal.push({
          source: { ...source, sessionId },
          profile: data.profile,
          blockId: data.blockId,
          kind: "toolResult",
          message: immutableSnapshot(resultEntry.message),
        });
      }
      if (data.toolResults.length !== callIds.length) {
        return { status: "unavailable", reason: "source_entry_tool_result_count_mismatch" };
      }
      prepared.push(...storedForJournal);
    }
    const preparedKeys = new Set(prepared.map((stored) => `${sessionId}:${stored.source.entryId}`));
    const baselineEntries = new Set();
    for (const entry of branchEntries) {
      if (entry.type !== "custom" || entry.customType !== COGNITIVE_ROUTING_BASELINE_ENTRY) continue;
      const data = entry.data;
      if (data?.version !== 1 || data.kind !== "baseline" || !Array.isArray(data.entryIds)) {
        return { status: "unavailable", reason: "baseline_entry_invalid" };
      }
      if (typeof data.sessionId !== "string" || !acceptedSessionIds.has(data.sessionId)) {
        return {
          status: "unavailable",
          reason: lineageAvailable ? "baseline_entry_session_invalid" : "baseline_entry_lineage_unavailable",
        };
      }
      const seen = new Set();
      const baselineIndex = branchEntries.findIndex((candidate) => candidate.id === entry.id);
      for (const entryId of data.entryIds) {
        if (typeof entryId !== "string" || entryId.length === 0 || seen.has(entryId)) {
          return { status: "unavailable", reason: "baseline_entry_ids_invalid" };
        }
        seen.add(entryId);
        const canonical = entriesById.get(entryId);
        const canonicalIndex = branchEntries.findIndex((candidate) => candidate.id === entryId);
        if (!canonical || canonicalIndex < 0 || canonicalIndex >= baselineIndex) {
          return { status: "unavailable", reason: `baseline_entry_ref_unavailable:${entryId}` };
        }
        const stored = unknownAttributionForEntry(canonical, sessionId);
        if (!stored) return { status: "unavailable", reason: `baseline_entry_kind_invalid:${entryId}` };
        const key = `${sessionId}:${entryId}`;
        if (preparedKeys.has(key)) continue;
        prepared.push(stored);
        preparedKeys.add(key);
        baselineEntries.add(key);
      }
    }
    const preparedByKey = new Map();
    for (const stored of prepared) {
      const key = `${sessionId}:${stored.source.entryId}`;
      const staged = preparedByKey.get(key);
      if (staged && !sameAttribution(staged, stored)) {
        return { status: "unavailable", reason: `attributed_entry_conflict:${stored.source.entryId}` };
      }
      preparedByKey.set(key, stored);
      const existing = this.attributions.get(key);
      if (this.conflicts.has(key) || (existing && !sameAttribution(existing, stored))) {
        return { status: "unavailable", reason: `attributed_entry_conflict:${stored.source.entryId}` };
      }
    }
    const nextSources = new Map();
    const nextAttributions = new Map();
    for (const stored of prepared) {
      const key = `${sessionId}:${stored.source.entryId}`;
      nextSources.set(key, { ...stored.source });
      nextAttributions.set(key, stored);
    }
    this.sources.clear();
    this.attributions.clear();
    this.conflicts.clear();
    for (const [key, source] of nextSources) this.sources.set(key, source);
    for (const [key, attribution] of nextAttributions) this.attributions.set(key, attribution);
    for (const key of baselineEntries) this.baselineEntries.add(key);
    return { status: "available", attributions: prepared };
  }
  hasAttributedProfileAfter(sessionId, branchEntries, afterEntryId, profile) {
    const afterIndex = branchIndex(branchEntries, afterEntryId);
    if (afterIndex < 0) return false;
    for (const entry of branchEntries.slice(afterIndex + 1)) {
      if (!messageEntry(entry)) continue;
      const attribution = this.attributions.get(`${sessionId}:${entry.id}`);
      if (attribution?.profile === profile && attribution.kind === "assistant") return true;
    }
    return false;
  }
  sourceForEntry(sessionId, entryId) {
    const source = this.sources.get(`${sessionId}:${entryId}`);
    return source ? { ...source } : undefined;
  }
  attributionForEntry(sessionId, entryId) {
    const attribution = this.attributions.get(`${sessionId}:${entryId}`);
    return attribution ? cloneAttribution(attribution) : undefined;
  }
  isUnknownBaselineEntry(sessionId, entryId) {
    return this.baselineEntries.has(`${sessionId}:${entryId}`);
  }
  attributionsForBranch(sessionId, branchEntries, requestedEntryIds = []) {
    const branchById = new Map();
    for (const entry of branchEntries) {
      if (typeof entry.id !== "string") continue;
      if (branchById.has(entry.id)) {
        return { status: "unavailable", reason: `attributed_entry_ambiguous:${entry.id}` };
      }
      branchById.set(entry.id, entry);
    }
    const requested = new Set();
    for (const entryId of requestedEntryIds) {
      if (requested.has(entryId)) {
        return { status: "unavailable", reason: `attributed_entry_ambiguous:${entryId}` };
      }
      requested.add(entryId);
      const key = `${sessionId}:${entryId}`;
      if (this.conflicts.has(key)) {
        return { status: "unavailable", reason: `attributed_entry_ambiguous:${entryId}` };
      }
      const attribution = this.attributions.get(key);
      if (!attribution) return { status: "unavailable", reason: `attributed_entry_not_found:${entryId}` };
      const entry = branchById.get(entryId);
      if (!entry) return { status: "unavailable", reason: `attributed_entry_missing:${entryId}` };
      if (!messageEntry(entry) || !isDeepStrictEqual(entry.message, attribution.message)) {
        return { status: "unavailable", reason: `attributed_entry_changed:${entryId}` };
      }
    }
    const attributions = [];
    for (const entry of branchById.values()) {
      const key = `${sessionId}:${entry.id}`;
      if (this.conflicts.has(key)) {
        return { status: "unavailable", reason: `attributed_entry_ambiguous:${entry.id}` };
      }
      const attribution = this.attributions.get(key);
      if (!attribution) continue;
      if (!messageEntry(entry) || !isDeepStrictEqual(entry.message, attribution.message)) {
        return { status: "unavailable", reason: `attributed_entry_changed:${entry.id}` };
      }
      attributions.push(cloneAttribution(attribution));
    }
    return { status: "available", attributions };
  }
  clear() {
    this.activeTurn = undefined;
    this.sources.clear();
    this.attributions.clear();
    this.conflicts.clear();
    this.baselineEntries.clear();
  }
  matchExpectedEntries(expected, candidates) {
    const used = new Set();
    const matched = [];
    for (const message of expected) {
      const identityMatches = candidates.filter(
        (candidate) => !used.has(candidate.id) && candidate.message === message,
      );
      const structuralMatches = candidates.filter(
        (candidate) => !used.has(candidate.id) && isDeepStrictEqual(candidate.message, message),
      );
      const matches = identityMatches.length > 0 ? identityMatches : structuralMatches;
      if (matches.length === 0) return { status: "unavailable", reason: "finalized_entry_not_found" };
      if (matches.length > 1)
        return {
          status: "unavailable",
          reason: `${message.role === "assistant" ? "ambiguous_assistant_entry" : "ambiguous_tool_result_entry"}`,
        };
      used.add(matches[0].id);
      matched.push(matches[0]);
    }
    return { status: "matched", entries: matched };
  }
}
