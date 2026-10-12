import { contextRefForEntry, entryIdFromContextRef, type ContextSourceIdentity } from "../freeflow-context/types.js";
import {
  contextMessageRole,
  normalizeContextMessages,
  type ContextMessageQuarantine,
} from "./context-message-normalizer.js";

export type ProjectionSourceProfile = "standard" | "reasoning" | "unknown" | "user" | "shared";

export type ProjectionSource = {
  source: ContextSourceIdentity;
  message: any;
  profile: ProjectionSourceProfile;
  kind: "user" | "assistant" | "toolResult" | "summary" | "custom";
  blockId?: string;
  legacyBaseline?: boolean;
  legacyRepairableCallIds?: readonly string[];
  legacyOutcomeUnavailableCallIds?: readonly string[];
  replayability?: "eligible" | "quarantined";
  quarantineReason?: string;
};

export type ProjectionInput = {
  sessionId: string;
  messages: readonly any[];
  sources: readonly ProjectionSource[];
  /** Exact objects constructed by Freeflow for this assembly; never inferred from a message's label. */
  ownedTransientMessages?: readonly any[];
  include?: readonly string[];
  shared?: readonly string[];
  previous?: readonly string[];
  required?: readonly string[];
  /** Refs required by Freeflow's persisted unknown-history baseline. */
  legacyBaselineRefs?: readonly string[];
};

type ProjectedContext = {
  status: "projected";
  messages: any[];
  visibleRefs: string[];
  selectedRefs: string[];
  dependencyRefs: string[];
  quarantines: ContextMessageQuarantine[];
};

export type ProjectionRejected = {
  status: "rejected";
  reason: string;
  position?: number;
  role?: string;
  customType?: string;
  ref?: string;
};

export type ContextProjectionResult = ProjectedContext | ProjectionRejected;

type MatchedItem = {
  message: any;
  source?: ProjectionSource;
  ref?: string;
};

type MessageEntry = MatchedItem & { index: number; order?: number; legacyPlaceholder?: boolean };

type MessageGroup = {
  assistant: MessageEntry;
  calls: Map<string, string>;
  results: MessageEntry[];
  danglingResults: MessageEntry[];
  legacyPlaceholders: MessageEntry[];
  legacyOutcomeUnavailableCallIds: readonly string[];
  incompleteReason?: string;
};

type RequestedRefs = {
  include: string[];
  previous: string[];
  shared: string[];
  required: string[];
  explicit: string[];
  all: string[];
};

function refFor(source: ProjectionSource): string | undefined {
  return typeof source.source.entryId === "string" ? contextRefForEntry(source.source.entryId) : undefined;
}

function normalizeRefs(
  values: readonly string[] | undefined,
): { status: "ok"; refs: string[] } | { status: "rejected"; reason: string } {
  const refs: string[] = [];
  const seen = new Set<string>();
  for (const value of values ?? []) {
    const entryId = entryIdFromContextRef(value);
    if (!entryId) return { status: "rejected", reason: "requested_ref_invalid" };
    const ref = contextRefForEntry(entryId);
    if (seen.has(ref)) return { status: "rejected", reason: `requested_ref_duplicate:${ref}` };
    seen.add(ref);
    refs.push(ref);
  }
  return { status: "ok", refs };
}

function requestedRefs(input: ProjectionInput): RequestedRefs | ProjectionRejected {
  const groups = {
    include: normalizeRefs(input.include),
    previous: normalizeRefs(input.previous),
    shared: normalizeRefs(input.shared),
    required: normalizeRefs(input.required),
  };
  for (const group of Object.values(groups)) {
    if (group.status === "rejected") return group;
  }

  const all: string[] = [];
  const seen = new Set<string>();
  for (const refs of [groups.include, groups.previous, groups.shared, groups.required]) {
    if (refs.status !== "ok") continue;
    for (const ref of refs.refs) {
      if (seen.has(ref)) continue;
      seen.add(ref);
      all.push(ref);
    }
  }
  const explicit: string[] = [];
  const explicitSeen = new Set<string>();
  for (const refs of [groups.include, groups.previous, groups.shared]) {
    if (refs.status !== "ok") continue;
    for (const ref of refs.refs) {
      if (explicitSeen.has(ref)) continue;
      explicitSeen.add(ref);
      explicit.push(ref);
    }
  }
  return {
    include: groups.include.status === "ok" ? groups.include.refs : [],
    previous: groups.previous.status === "ok" ? groups.previous.refs : [],
    shared: groups.shared.status === "ok" ? groups.shared.refs : [],
    required: groups.required.status === "ok" ? groups.required.refs : [],
    explicit,
    all,
  };
}

function toolCalls(message: any): Map<string, string> | ProjectionRejected {
  const calls = new Map<string, string>();
  if (contextMessageRole(message) !== "assistant" || !Array.isArray(message.content)) return calls;
  for (const part of message.content) {
    if (part?.type !== "toolCall") continue;
    if (typeof part.id !== "string" || typeof part.name !== "string") {
      return { status: "rejected", reason: "assistant_tool_call_invalid" };
    }
    if (calls.has(part.id)) return { status: "rejected", reason: "assistant_tool_call_ids_ambiguous" };
    calls.set(part.id, part.name);
  }
  return calls;
}

function omittedToolResult(message: any): any {
  return { ...message, content: [{ type: "text", text: "[context omitted]" }] };
}

function legacyUnknownToolResult(toolCallId: string, toolName: string): any {
  const message = {
    role: "toolResult",
    toolCallId,
    toolName,
    content: [
      {
        type: "text",
        text: "No recorded result is available for this historical tool call; execution outcome is unknown.",
      },
    ],
    isError: true,
  };
  return message;
}

function rejected(
  reason: string,
  details: Pick<ProjectionRejected, "position" | "role" | "customType" | "ref"> = {},
): ProjectionRejected {
  return { status: "rejected", reason, ...details };
}

function groupItems(items: MessageEntry[]): MessageGroup[] | ProjectionRejected {
  const groups: MessageGroup[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const assistant = items[index];
    if (contextMessageRole(assistant.message) !== "assistant") continue;
    const calls = toolCalls(assistant.message);
    if (!(calls instanceof Map)) return calls;
    const group: MessageGroup = {
      assistant,
      calls,
      results: [],
      danglingResults: [],
      legacyPlaceholders: [],
      legacyOutcomeUnavailableCallIds: assistant.source?.legacyOutcomeUnavailableCallIds ?? [],
    };
    groups.push(group);
    if (calls.size === 0) continue;

    for (let resultIndex = index + 1; resultIndex < items.length; resultIndex += 1) {
      const candidate = items[resultIndex];
      if (contextMessageRole(candidate.message) !== "toolResult") break;
      if (calls.has(candidate.message.toolCallId)) {
        group.results.push(candidate);
      } else {
        group.danglingResults.push(candidate);
      }
    }

    const callEntries = [...calls.keys()];
    for (const result of group.results) {
      const callIndex = callEntries.indexOf(result.message.toolCallId);
      if (callIndex >= 0) result.order = assistant.index + (callIndex + 1) / (calls.size + 1);
    }
    const matchedCallIds = new Set(group.results.map((result) => result.message.toolCallId));
    if (group.legacyOutcomeUnavailableCallIds.length > 0) {
      group.incompleteReason = "legacy_tool_result_unavailable";
    }
    const missingCalls = [...calls.entries()]
      .map(([callId, toolName], callIndex) => ({ callId, toolName, callIndex }))
      .filter(({ callId }) => !matchedCallIds.has(callId));
    if (group.danglingResults.length > 0 || missingCalls.length > 0) {
      group.incompleteReason = group.danglingResults.length > 0 ? "dangling_tool_results" : "missing_tool_results";
    }
    const repairableCallIds = new Set(assistant.source?.legacyRepairableCallIds ?? []);
    if (
      repairableCallIds.size > 0 &&
      group.danglingResults.length === 0 &&
      missingCalls.length > 0 &&
      missingCalls.every(({ callId }) => repairableCallIds.has(callId))
    ) {
      missingCalls.forEach(({ callId, toolName, callIndex }) => {
        const order = assistant.index + (callIndex + 1) / (calls.size + 1);
        group.legacyPlaceholders.push({
          index: order,
          order,
          message: legacyUnknownToolResult(callId, toolName),
          legacyPlaceholder: true,
        });
      });
      group.incompleteReason = undefined;
    }
  }

  return groups;
}

function sortOrder(item: MessageEntry): number {
  return item.order ?? item.index;
}

function itemForRef(items: readonly MessageEntry[], ref: string): MessageEntry | undefined {
  return items.find((item) => item.ref === ref);
}

function isStandardSource(item: MessageEntry): boolean {
  return item.source?.profile === "standard";
}

export function projectReasoningContext(input: ProjectionInput): ContextProjectionResult {
  const requested = requestedRefs(input);
  if (!("all" in requested)) return requested;

  const sourcesByRef = new Map<string, ProjectionSource>();
  for (const source of input.sources) {
    if (source.source.sessionId !== input.sessionId) {
      return rejected(`source_session_mismatch:${refFor(source) ?? source.kind}`);
    }
    const ref = refFor(source);
    if (!ref) continue;
    if (sourcesByRef.has(ref)) return rejected(`duplicate_source_ref:${ref}`);
    sourcesByRef.set(ref, source);
  }

  for (const ref of requested.all) {
    const source = sourcesByRef.get(ref);
    if (!source) return rejected(`requested_ref_not_found:${ref}`);
    if (source.replayability === "quarantined") {
      return rejected(`requested_ref_quarantined:${ref}`, { ref });
    }
  }
  for (const ref of requested.include) {
    const source = sourcesByRef.get(ref);
    if (source?.profile !== "standard") return rejected(`include_ref_not_standard:${ref}`);
    if (typeof source.blockId !== "string" || source.blockId.length === 0) {
      return rejected(`include_ref_block_unavailable:${ref}`);
    }
  }

  const normalized = normalizeContextMessages({
    messages: input.messages,
    sources: input.sources,
    ownedTransientMessages: input.ownedTransientMessages,
  });
  const quarantines = [...normalized.quarantines];
  let items: MessageEntry[] = normalized.items.flatMap((item) =>
    item.disposition === "eligible"
      ? [
          {
            index: item.position,
            message: item.message,
            ...(item.source ? { source: item.source } : {}),
            ...(item.ref ? { ref: item.ref } : {}),
          },
        ]
      : [],
  );

  for (const ref of requested.all) {
    if (!itemForRef(items, ref)) return rejected(`requested_ref_not_visible:${ref}`, { ref });
  }

  const groups = groupItems(items);
  if (!(groups instanceof Array)) return groups;
  const repairedItems = groups.flatMap((group) => group.legacyPlaceholders);
  if (repairedItems.length > 0) {
    items = [...items, ...repairedItems].sort((left, right) => sortOrder(left) - sortOrder(right));
  }
  const resultToGroup = new Map<number, MessageGroup>();
  for (const group of groups) {
    for (const result of [...group.results, ...group.legacyPlaceholders]) resultToGroup.set(result.index, group);
  }

  const selectedSet = new Set(requested.all);
  const explicitSelectedSet = new Set(requested.explicit);
  const legacyBaselineRefs = new Set(input.legacyBaselineRefs ?? []);
  const requestedGroupRef = (ref: string | undefined): boolean =>
    ref !== undefined && selectedSet.has(ref) && (!legacyBaselineRefs.has(ref) || explicitSelectedSet.has(ref));
  const selectedGroups = new Set<MessageGroup>();
  for (const group of groups) {
    if (requestedGroupRef(group.assistant.ref)) selectedGroups.add(group);
    if (group.results.some((result) => requestedGroupRef(result.ref))) selectedGroups.add(group);
  }

  for (const ref of requested.all) {
    const item = itemForRef(items, ref);
    if (!item) return rejected(`requested_ref_not_visible:${ref}`, { ref });
    if (contextMessageRole(item.message) === "toolResult" && !resultToGroup.has(item.index)) {
      return rejected(`selected_tool_result_without_assistant:${ref}`, { ref, position: item.index });
    }
  }

  const kept = new Set<number>();
  const placeholders = new Map<number, any>();
  const dependencyRefs: string[] = [];
  const dependencySet = new Set<string>();
  const addDependency = (ref: string | undefined) => {
    if (ref && !dependencySet.has(ref)) {
      dependencySet.add(ref);
      dependencyRefs.push(ref);
    }
  };

  for (const group of groups) {
    const standardOnly = isStandardSource(group.assistant);
    const keepGroup =
      !standardOnly || selectedGroups.has(group) || group.results.some((item) => !isStandardSource(item));
    if (!keepGroup) continue;

    if (group.calls.size === 0) {
      kept.add(group.assistant.index);
      addDependency(group.assistant.ref);
      continue;
    }

    const allResults = [...group.results, ...group.legacyPlaceholders].sort(
      (left, right) => sortOrder(left) - sortOrder(right),
    );
    if (
      group.incompleteReason ||
      allResults.length !== group.calls.size ||
      (group.legacyPlaceholders.length > 0 && selectedGroups.has(group))
    ) {
      if (selectedGroups.has(group)) {
        return rejected(`selected_tool_group_incomplete:${group.assistant.ref ?? "unknown"}`, {
          ...(group.assistant.ref ? { ref: group.assistant.ref } : {}),
          position: group.assistant.index,
          role: "assistant",
        });
      }
      quarantines.push({
        position: group.assistant.index,
        role: "assistant",
        reason: group.incompleteReason ?? "tool_group_incomplete",
        ...(group.assistant.ref ? { ref: group.assistant.ref } : {}),
      });
      continue;
    }
    const seenResults = new Set<string>();
    for (const result of allResults) {
      const callId = result.message.toolCallId;
      if (seenResults.has(callId))
        return rejected(`tool_result_duplicate:${callId}`, { position: result.index, role: "toolResult" });
      seenResults.add(callId);
      if (result.legacyPlaceholder === true) {
        kept.add(result.index);
        continue;
      }
      if (result.message.toolName !== group.calls.get(callId)) {
        return rejected(`tool_result_tool_mismatch:${callId}`, { position: result.index, role: "toolResult" });
      }
      addDependency(result.ref);
    }
    if (seenResults.size !== group.calls.size) {
      return rejected(`selected_tool_group_incomplete:${group.assistant.ref ?? "unknown"}`, {
        ...(group.assistant.ref ? { ref: group.assistant.ref } : {}),
        position: group.assistant.index,
        role: "assistant",
      });
    }

    kept.add(group.assistant.index);
    addDependency(group.assistant.ref);
    for (const result of allResults) {
      if (result.legacyPlaceholder === true) continue;
      if (!isStandardSource(result) || (result.ref && selectedSet.has(result.ref))) {
        kept.add(result.index);
      } else {
        placeholders.set(result.index, omittedToolResult(result.message));
      }
    }
  }

  for (const item of items) {
    const group = resultToGroup.get(item.index);
    if (group) continue;
    if (contextMessageRole(item.message) === "toolResult") {
      if (!isStandardSource(item)) {
        quarantines.push({
          position: item.index,
          role: "toolResult",
          reason: "dangling_tool_result",
          ...(item.ref ? { ref: item.ref } : {}),
        });
      }
      continue;
    }
    if (!isStandardSource(item) || (item.ref !== undefined && selectedSet.has(item.ref))) kept.add(item.index);
  }

  const outputItems = items.filter((item) => kept.has(item.index) || placeholders.has(item.index));
  return {
    status: "projected",
    messages: outputItems.map((item) => placeholders.get(item.index) ?? item.message),
    visibleRefs: outputItems.flatMap((item) => (kept.has(item.index) && item.ref ? [item.ref] : [])),
    selectedRefs: requested.all,
    dependencyRefs,
    quarantines,
  };
}
