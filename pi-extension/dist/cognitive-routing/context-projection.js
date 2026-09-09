import { isDeepStrictEqual } from "node:util";
import { contextRefForEntry, entryIdFromContextRef } from "../freeflow-context/types.js";
function messageRole(message) {
  return typeof message?.role === "string" ? message.role : undefined;
}
function refFor(source) {
  return typeof source.source.entryId === "string" ? contextRefForEntry(source.source.entryId) : undefined;
}
function normalizeRefs(values) {
  const refs = [];
  const seen = new Set();
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
function requestedRefs(input) {
  const groups = {
    include: normalizeRefs(input.include),
    previous: normalizeRefs(input.previous),
    shared: normalizeRefs(input.shared),
    required: normalizeRefs(input.required),
  };
  for (const group of Object.values(groups)) {
    if (group.status === "rejected") return group;
  }
  const all = [];
  const seen = new Set();
  for (const refs of [groups.include, groups.previous, groups.shared, groups.required]) {
    if (refs.status !== "ok") continue;
    for (const ref of refs.refs) {
      if (seen.has(ref)) continue;
      seen.add(ref);
      all.push(ref);
    }
  }
  const explicit = [];
  const explicitSeen = new Set();
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
function toolCalls(message) {
  const calls = new Map();
  if (messageRole(message) !== "assistant" || !Array.isArray(message.content)) return calls;
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
function omittedToolResult(message) {
  return { ...message, content: [{ type: "text", text: "[context omitted]" }] };
}
function legacyUnknownToolResult(toolCallId, toolName) {
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
function customMessageShape(message) {
  if (!message || typeof message !== "object") return message;
  const comparable = { ...message };
  delete comparable.timestamp;
  return comparable;
}
function customMessageTimestamp(value) {
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}
function sourceMatches(message, source) {
  if (source.message === undefined) return false;
  if (source.kind === "custom" || message?.role === "custom" || source.message?.role === "custom") {
    return (
      source.message?.role === "custom" &&
      message?.role === "custom" &&
      customMessageTimestamp(source.message.timestamp) &&
      customMessageTimestamp(message.timestamp) &&
      isDeepStrictEqual(customMessageShape(source.message), customMessageShape(message))
    );
  }
  return source.message === message || isDeepStrictEqual(source.message, message);
}
function rejected(reason, details = {}) {
  return { status: "rejected", reason, ...details };
}
function groupItems(items) {
  const groups = [];
  for (let index = 0; index < items.length; index += 1) {
    const assistant = items[index];
    if (messageRole(assistant.message) !== "assistant") continue;
    const calls = toolCalls(assistant.message);
    if (!(calls instanceof Map)) return calls;
    const group = {
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
      if (messageRole(candidate.message) !== "toolResult") break;
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
      return rejected(`legacy_tool_result_unavailable:${assistant.ref ?? "unknown"}`, {
        ...(assistant.ref ? { ref: assistant.ref } : {}),
        position: assistant.index,
        role: "assistant",
      });
    }
    const missingCalls = [...calls.entries()]
      .map(([callId, toolName], callIndex) => ({ callId, toolName, callIndex }))
      .filter(({ callId }) => !matchedCallIds.has(callId));
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
    }
  }
  return groups;
}
function sortOrder(item) {
  return item.order ?? item.index;
}
function itemForRef(items, ref) {
  return items.find((item) => item.ref === ref);
}
function isStandardSource(item) {
  return item.source?.profile === "standard";
}
export function projectReasoningContext(input) {
  const requested = requestedRefs(input);
  if (!("all" in requested)) return requested;
  const sourcesByRef = new Map();
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
  }
  for (const ref of requested.include) {
    const source = sourcesByRef.get(ref);
    if (source?.profile !== "standard") return rejected(`include_ref_not_standard:${ref}`);
    if (typeof source.blockId !== "string" || source.blockId.length === 0) {
      return rejected(`include_ref_block_unavailable:${ref}`);
    }
  }
  const usedSources = new Set();
  const ownedTransientMessages = new Set(input.ownedTransientMessages);
  const usedTransients = new Set();
  let items = [];
  for (const [index, message] of input.messages.entries()) {
    if (ownedTransientMessages.has(message)) {
      if (usedTransients.has(message)) return rejected("transient_reused");
      usedTransients.add(message);
      items.push({ index, message });
      continue;
    }
    const matches = input.sources.filter((source) => sourceMatches(message, source));
    const role = messageRole(message);
    const details = {
      position: index,
      ...(role ? { role } : {}),
      ...(typeof message?.customType === "string" ? { customType: message.customType } : {}),
    };
    if (matches.length === 0) return rejected(`source_not_found:${role ?? "message"}`, details);
    if (matches.length > 1) return rejected(`ambiguous_source:${matches[0].kind}`, details);
    const source = matches[0];
    if (usedSources.has(source)) return rejected(`source_reused:${refFor(source) ?? source.kind}`, details);
    usedSources.add(source);
    const ref = refFor(source);
    items.push({ index, message, source, ...(ref ? { ref } : {}) });
  }
  for (const ref of requested.all) {
    if (!itemForRef(items, ref)) return rejected(`requested_ref_not_visible:${ref}`, { ref });
  }
  const groups = groupItems(items);
  if (!(groups instanceof Array)) return groups;
  const repairedItems = groups.flatMap((group) => group.legacyPlaceholders);
  if (repairedItems.length > 0) {
    items = [...items, ...repairedItems].sort((left, right) => sortOrder(left) - sortOrder(right));
  }
  const resultToGroup = new Map();
  for (const group of groups) {
    for (const result of [...group.results, ...group.legacyPlaceholders]) resultToGroup.set(result.index, group);
  }
  const selectedSet = new Set(requested.all);
  const explicitSelectedSet = new Set(requested.explicit);
  const legacyBaselineRefs = new Set(input.legacyBaselineRefs ?? []);
  const requestedGroupRef = (ref) =>
    ref !== undefined && selectedSet.has(ref) && (!legacyBaselineRefs.has(ref) || explicitSelectedSet.has(ref));
  const selectedGroups = new Set();
  for (const group of groups) {
    if (requestedGroupRef(group.assistant.ref)) selectedGroups.add(group);
    if (group.results.some((result) => requestedGroupRef(result.ref))) selectedGroups.add(group);
  }
  for (const ref of requested.all) {
    const item = itemForRef(items, ref);
    if (!item) return rejected(`requested_ref_not_visible:${ref}`, { ref });
    if (messageRole(item.message) === "toolResult" && !resultToGroup.has(item.index)) {
      return rejected(`selected_tool_result_without_assistant:${ref}`, { ref, position: item.index });
    }
  }
  const kept = new Set();
  const placeholders = new Map();
  const dependencyRefs = [];
  const dependencySet = new Set();
  const addDependency = (ref) => {
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
      group.danglingResults.length > 0 ||
      allResults.length !== group.calls.size ||
      (group.legacyPlaceholders.length > 0 && selectedGroups.has(group))
    ) {
      return rejected(`selected_tool_group_incomplete:${group.assistant.ref ?? "unknown"}`, {
        ...(group.assistant.ref ? { ref: group.assistant.ref } : {}),
        position: group.assistant.index,
        role: "assistant",
      });
    }
    const seenResults = new Set();
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
    if (messageRole(item.message) === "toolResult") {
      if (!isStandardSource(item)) {
        return rejected(`dangling_tool_result:${item.ref ?? "unknown"}`, {
          ...(item.ref ? { ref: item.ref } : {}),
          position: item.index,
          role: "toolResult",
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
  };
}
